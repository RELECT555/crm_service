import type { Config } from "../../config.ts";
import type { CanonicalRecord, ChangeEvent, SyncPage } from "../../domain/model.ts";
import type { Connection, EventsMode, Store } from "../../storage/store.ts";
import { assertPickedAccount, type AuthorizationGrant, type Connector, ConnectorInputError, ConnectorUpstreamError,
  type DeletionCheck, type MappingOptions, normalizePickedAccount } from "../types.ts";
import { PipedriveClient, PipedriveHttpError } from "./client.ts";
import { PIPEDRIVE_INFO } from "./info.ts";
import { normalizeActivity, normalizeDeal, normalizePipeline, normalizeStage, normalizeUser, parsePipedriveEvents } from "./mapping.ts";
import { consentUrl, type PipedriveApp, requestTokens } from "./oauth.ts";
import { dataList, type JsonObject, object, requiredString, valueString } from "./values.ts";

/** Reference data first; users label managers. */
const KINDS = ["pipeline", "stage", "user", "deal", "activity"];
/** Cursor-paginated v2 lists: `limit` up to 500, next page marker in `additional_data.next_cursor` (null at the end). */
const LISTS: Record<string, { path: string; sorted: boolean }> = {
  pipeline: { path: "/api/v2/pipelines", sorted: false },
  stage: { path: "/api/v2/stages", sorted: false },
  deal: { path: "/api/v2/deals", sorted: true },
  activity: { path: "/api/v2/activities", sorted: true },
};
const PAGE_SIZE = 500;
/** One webhook per object we read, all actions, webhooks v2 (the default version since 2025-03-17 per the SDK). */
const WEBHOOK_OBJECTS = ["deal", "activity"];

/** Pipedrive adapter (API v2 for CRM objects, v1 for users, the current user and webhooks). */
export class PipedriveConnector implements Connector {
  readonly info = PIPEDRIVE_INFO;
  readonly client: PipedriveClient;
  private app: PipedriveApp;
  private store: Store;
  private fetcher: typeof fetch;

  constructor(credentials: { clientId: string; clientSecret: string }, config: Config, store: Store, fetcher: typeof fetch = fetch) {
    this.app = { ...credentials, redirectUri: `${config.appOrigin}/oauth/pipedrive/callback` };
    this.store = store; this.fetcher = fetcher;
    this.client = new PipedriveClient(this.app, config.dataKey, store, fetcher);
  }

  normalizeAccount(input: string): string { return normalizePickedAccount(input); }

  authorizeUrl(_account: string, state: string): string { return consentUrl(this.app, state); }

  async completeAuthorization(callback: URLSearchParams, expectedAccount: string): Promise<AuthorizationGrant> {
    const code = callback.get("code");
    if (!code) throw new ConnectorInputError("Missing OAuth code");
    const tokens = await requestTokens(this.app, "authorization_code", code, this.fetcher);
    // The token belongs to one company; `GET /api/v1/users/me` names it (company_id is the stable account identity).
    const response = await this.fetcher(`https://${tokens.apiHost}/api/v1/users/me`, {
      headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" }, redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ConnectorUpstreamError(`Pipedrive users/me failed: ${response.status}`);
    const me = object(object(await response.json()).data);
    assertPickedAccount(expectedAccount, tokens.apiHost);
    return { accountId: requiredString(me.company_id, "company_id"), account: tokens.apiHost,
      accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn,
      settings: { companyName: valueString(me.company_name) ?? null } };
  }

  syncKinds(): string[] { return KINDS; }

  async listPage(connection: Connection, kind: string, cursor: string | null): Promise<SyncPage> {
    if (kind === "user") {
      // v1 returns all users of the company in one response.
      return { items: dataList(await this.client.get(connection, "/api/v1/users")).map(normalizeUser), next: null };
    }
    const list = LISTS[kind];
    if (!list) throw new Error(`Unsupported kind ${kind}`);
    if (cursor !== null && !/^[A-Za-z0-9+/=_-]{1,512}$/.test(cursor)) throw new Error("Invalid sync cursor");
    const query: Record<string, string> = { limit: String(PAGE_SIZE), ...(cursor ? { cursor } : {}) };
    if (list.sorted) Object.assign(query, { sort_by: "id", sort_direction: "asc" });
    const body = await this.client.get(connection, list.path, query);
    const additional = body?.additional_data && typeof body.additional_data === "object" ? body.additional_data as JsonObject : {};
    const next = valueString(additional.next_cursor) ?? null;
    return { items: dataList(body).map(row => this.normalize(connection, kind, row)), next };
  }

  async fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null> {
    if ((kind !== "deal" && kind !== "activity") || !/^\d+$/.test(externalId)) throw new Error(`Unsupported Pipedrive record ${kind}`);
    const body = await this.client.get(connection, `/api/v2/${kind === "deal" ? "deals" : "activities"}/${externalId}`);
    if (!body || body.data === null || body.data === undefined) return null;
    const row = object(body.data);
    // Deleted records stay readable for a while with is_deleted; they are not current data.
    return row.is_deleted === true ? null : this.normalize(connection, kind, row);
  }

  deletionCheck(kind: string): DeletionCheck {
    // Deals and activities: whether v2 cursors can skip rows under concurrent deletes is **unverified**, so each unseen
    // record is confirmed by fetchRecord (404 or is_deleted -> gone). Pipelines and stages are read to the last cursor
    // and fit in one page in practice. Users (one v1 response, possibly paginated -- **unverified**) only label
    // managers; keeping a stale name is safer than dropping a real one.
    if (kind === "deal" || kind === "activity") return "verify";
    return kind === "user" ? "none" : "complete";
  }

  async subscribe(connection: Connection, handlerUrl: string): Promise<EventsMode> {
    try {
      const existing = dataList(await this.client.get(connection, "/api/v1/webhooks"));
      for (const eventObject of WEBHOOK_OBJECTS) {
        const registered = existing.some(hook => hook.subscription_url === handlerUrl && hook.event_object === eventObject &&
          (hook.event_action === "*") && valueString(hook.is_active) !== "0" && hook.is_active !== false);
        if (!registered) {
          await this.client.post(connection, "/api/v1/webhooks", { subscription_url: handlerUrl, event_action: "*",
            event_object: eventObject, name: `CRM Analytics: ${eventObject}`, version: "2.0" });
        }
      }
      return "webhook";
    } catch (error) {
      // A user without permission to manage webhooks gets 403 (**unverified**); fall back to scheduled reconciliation.
      if (error instanceof PipedriveHttpError && error.status === 403) return "polling";
      throw error;
    }
  }

  parseEvents(body: string): ChangeEvent[] { return parsePipedriveEvents(body); }

  acceptsEvent(): boolean { return true; }

  mappingOptions(): MappingOptions {
    return {
      sources: [{ kind: "deal", label: "Сделки" }],
      customSource: null,
      categoryKind: "pipeline",
      fieldMapping: null,
      activityKind: "activity",
      activityCodeLabel: "Ключ типа активности",
      activityCodeHint: "key_string типа из настроек активностей Pipedrive, например lunch или visit_client.",
    };
  }

  private normalize(connection: Connection, kind: string, row: JsonObject): CanonicalRecord {
    if (kind === "deal") {
      const mapped = this.store.getCommercialMapping(connection.id, "deal", valueString(row.pipeline_id) ?? "*");
      return normalizeDeal(row, mapped?.direction);
    }
    if (kind === "activity") {
      const type = valueString(row.type);
      return normalizeActivity(row, type ? this.store.getActionType(connection.id, type) : null);
    }
    if (kind === "pipeline") return normalizePipeline(row);
    if (kind === "stage") return normalizeStage(row);
    throw new Error(`Unsupported Pipedrive kind ${kind}`);
  }
}
