import type { Config } from "../../config.ts";
import type { CanonicalRecord, ChangeEvent, SyncPage } from "../../domain/model.ts";
import type { Connection, EventsMode, Store } from "../../storage/store.ts";
import { assertPickedAccount, type AuthorizationGrant, type Connector, ConnectorInputError, type DeletionCheck,
  type MappingOptions, normalizePickedAccount } from "../types.ts";
import { HubSpotClient } from "./client.ts";
import { HUBSPOT_INFO } from "./info.ts";
import { DEAL_PROPERTIES, ENGAGEMENTS, normalizeDeal, normalizeEngagement, normalizeOwner, normalizePipeline, normalizeStage } from "./mapping.ts";
import { consentUrl, type HubSpotApp, requestTokens, tokenInfo } from "./oauth.ts";
import { type JsonObject, nextAfter, object, properties, results, valueString } from "./values.ts";

/** Reference data first; owners label managers. */
const KINDS = ["pipeline", "stage", "user", "deal", "call", "meeting", "task", "email"];
/** CRM object lists page with `limit` and the `after` cursor from `paging.next.after`. */
const PAGE_SIZE = 100;

/**
 * HubSpot adapter (CRM API v3). Change capture is scheduled reconciliation: HubSpot webhooks are configured once per
 * app and signed with the app secret, which needs an app-level webhook route — a separate, documented next step.
 */
export class HubSpotConnector implements Connector {
  readonly info = HUBSPOT_INFO;
  readonly client: HubSpotClient;
  private app: HubSpotApp;
  private store: Store;
  private fetcher: typeof fetch;

  constructor(credentials: { clientId: string; clientSecret: string; scopes: string }, config: Config, store: Store, fetcher: typeof fetch = fetch) {
    this.app = { ...credentials, redirectUri: `${config.appOrigin}/oauth/hubspot/callback` };
    this.store = store; this.fetcher = fetcher;
    this.client = new HubSpotClient(this.app, config.dataKey, store, fetcher);
  }

  normalizeAccount(input: string): string { return normalizePickedAccount(input); }

  authorizeUrl(_account: string, state: string): string { return consentUrl(this.app, state); }

  async completeAuthorization(callback: URLSearchParams, expectedAccount: string): Promise<AuthorizationGrant> {
    const code = callback.get("code");
    if (!code) throw new ConnectorInputError("Missing OAuth code");
    const tokens = await requestTokens(this.app, "authorization_code", code, this.fetcher);
    const info = await tokenInfo(tokens.accessToken, this.fetcher);
    const account = info.hubDomain && /^[a-z0-9][a-z0-9.-]{0,252}$/.test(info.hubDomain) ? info.hubDomain : `hub-${info.hubId}`;
    assertPickedAccount(expectedAccount, account);
    return { accountId: info.hubId, account, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn };
  }

  syncKinds(): string[] { return KINDS; }

  async listPage(connection: Connection, kind: string, cursor: string | null): Promise<SyncPage> {
    if (cursor !== null && !/^[A-Za-z0-9_=-]{1,512}$/.test(cursor)) throw new Error("Invalid sync cursor");
    if (kind === "pipeline" || kind === "stage") {
      // All deal pipelines with their stages come in one response.
      const pipelines = results(await this.client.get(connection, "/crm/v3/pipelines/deals"));
      const items = kind === "pipeline" ? pipelines.map(normalizePipeline)
        : pipelines.flatMap(pipeline => (Array.isArray(pipeline.stages) ? pipeline.stages : []).map(stage => normalizeStage(object(stage), pipeline)));
      return { items, next: null };
    }
    const page: Array<[string, string]> = [["limit", String(PAGE_SIZE)], ...(cursor ? [["after", cursor] as [string, string]] : [])];
    if (kind === "user") {
      const body = await this.client.get(connection, "/crm/v3/owners", page);
      return { items: results(body).map(normalizeOwner), next: nextAfter(body) };
    }
    const source = this.source(kind);
    const body = await this.client.get(connection, `/crm/v3/objects/${source.path}`, [...page, ...source.query]);
    return { items: results(body).map(row => this.normalize(connection, kind, row)), next: nextAfter(body) };
  }

  async fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null> {
    if (!/^\d+$/.test(externalId)) throw new Error("Invalid HubSpot record ID");
    const source = this.source(kind);
    const body = await this.client.get(connection, `/crm/v3/objects/${source.path}/${externalId}`, source.query);
    return body ? this.normalize(connection, kind, body) : null;
  }

  deletionCheck(kind: string): DeletionCheck {
    // Pipelines with their stages come in one response. Deals and engagements page by `after`; each unseen record is
    // confirmed by fetchRecord (archived records answer 404 -- **unverified**). Owners only label managers and a
    // deactivated owner still owns history, so they are never removed by absence.
    if (kind === "pipeline" || kind === "stage") return "complete";
    return kind === "user" ? "none" : "verify";
  }

  async subscribe(): Promise<EventsMode> { return "polling"; }

  parseEvents(): ChangeEvent[] { return []; }

  acceptsEvent(): boolean { return true; }

  mappingOptions(): MappingOptions {
    return {
      sources: [{ kind: "deal", label: "Сделки" }],
      customSource: null,
      categoryKind: "pipeline",
      fieldMapping: null,
      activityKind: "task",
      activityCodeLabel: "Тип задачи (hs_task_type)",
      activityCodeHint: "Значение hs_task_type, например TODO. Звонки, встречи и письма HubSpot распознаются сами.",
    };
  }

  private source(kind: string): { path: string; query: Array<[string, string]> } {
    if (kind === "deal") return { path: "deals", query: DEAL_PROPERTIES.map(name => ["properties", name]) };
    const engagement = ENGAGEMENTS[kind];
    if (!engagement) throw new Error(`Unsupported HubSpot kind ${kind}`);
    return { path: engagement.path, query: [...engagement.properties.map(name => ["properties", name] as [string, string]), ["associations", "deals"]] };
  }

  private normalize(connection: Connection, kind: string, row: JsonObject): CanonicalRecord {
    if (kind === "deal") {
      const mapped = this.store.getCommercialMapping(connection.id, "deal", valueString(properties(row).pipeline) ?? "*");
      return normalizeDeal(row, mapped?.direction);
    }
    const taskType = kind === "task" ? valueString(properties(row).hs_task_type) : undefined;
    return normalizeEngagement(kind, row, taskType ? this.store.getActionType(connection.id, taskType) : null);
  }
}
