import type { Config } from "../../config.ts";
import type { CanonicalRecord, ChangeEvent, SyncPage } from "../../domain/model.ts";
import type { Connection, EventsMode, Store } from "../../storage/store.ts";
import { type AuthorizationGrant, type Connector, ConnectorInputError, ConnectorUpstreamError, type DeletionCheck,
  type MappingOptions, type ProviderInfo } from "../types.ts";
import { KommoClient } from "./client.ts";
import { kommoInfo } from "./info.ts";
import { normalizeContact, normalizeLead, normalizeUser, normalizePipeline, normalizeStage, normalizeTask, parseKommoEvents } from "./mapping.ts";
import { consentUrl, type KommoApp, normalizeAccountHost, requestTokens } from "./oauth.ts";
import type { KommoPlatform } from "./platforms.ts";
import { embedded, object, requiredString, valueString } from "./values.ts";

const KINDS = ["pipeline", "stage", "user", "deal", "contact", "task"];
const LIST_PATHS: Record<string, { path: string; name: string }> = {
  deal: { path: "/api/v4/leads", name: "leads" },
  contact: { path: "/api/v4/contacts", name: "contacts" },
  task: { path: "/api/v4/tasks", name: "tasks" },
  // Account users give managers their names (https://developers.kommo.com/reference/users-list; shape **unverified**).
  user: { path: "/api/v4/users", name: "users" },
};
const PAGE_SIZE = 250;
/** Webhook events requested. Lead events are documented; task/contact event names are **unverified** in a sandbox. */
const WEBHOOK_EVENTS = ["add_lead", "update_lead", "delete_lead", "status_lead", "restore_lead",
  "add_contact", "update_contact", "delete_contact", "add_task", "update_task", "delete_task"];

/** Kommo / amoCRM adapter (API v4). One class, two registrations: see platforms.ts. */
export class KommoConnector implements Connector {
  readonly info: ProviderInfo;
  readonly client: KommoClient;
  private platform: KommoPlatform;
  private app: KommoApp;
  private store: Store;
  private fetcher: typeof fetch;

  constructor(platform: KommoPlatform, credentials: { clientId: string; clientSecret: string }, config: Config,
    store: Store, fetcher: typeof fetch = fetch) {
    this.platform = platform;
    this.info = kommoInfo(platform);
    this.app = { ...credentials, redirectUri: `${config.appOrigin}/oauth/${platform.id}/callback` };
    this.store = store; this.fetcher = fetcher;
    this.client = new KommoClient(this.app, config.dataKey, store, fetcher);
  }

  normalizeAccount(input: string): string { return normalizeAccountHost(this.platform, input); }

  authorizeUrl(_account: string, state: string): string {
    // The consent screen lets the user pick the account; the callback's `referer` is checked against `_account`.
    return consentUrl(this.platform, this.app.clientId, state);
  }

  async completeAuthorization(callback: URLSearchParams, expectedAccount: string): Promise<AuthorizationGrant> {
    const code = callback.get("code");
    const referer = callback.get("referer");
    if (!code || !referer) throw new ConnectorInputError("Missing OAuth code or account");
    const host = normalizeAccountHost(this.platform, referer);
    if (host !== expectedAccount) throw new ConnectorInputError("OAuth account mismatch");
    const tokens = await requestTokens(host, this.app, "authorization_code", code, this.fetcher);
    const response = await this.fetcher(`https://${host}/api/v4/account`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` }, redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ConnectorUpstreamError(`Kommo account lookup failed: ${response.status}`);
    const account = object(await response.json());
    return { accountId: requiredString(account.id, "account ID"), account: host, accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn,
      settings: { currency: valueString(account.currency) ?? null } };
  }

  syncKinds(): string[] { return KINDS; }

  async listPage(connection: Connection, kind: string, cursor: string | null): Promise<SyncPage> {
    if (kind === "pipeline" || kind === "stage") {
      // All pipelines with their stages come in one response; there is no second page.
      const pipelines = embedded(await this.client.get(connection, "/api/v4/leads/pipelines"), "pipelines");
      const items = kind === "pipeline" ? pipelines.map(normalizePipeline)
        : pipelines.flatMap(pipeline => embedded(pipeline, "statuses").map(stage => normalizeStage(stage, valueString(pipeline.name))));
      return { items, next: null };
    }
    const source = LIST_PATHS[kind];
    if (!source) throw new Error(`Unsupported kind ${kind}`);
    const page = cursor ? Number(cursor) : 1;
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid sync cursor");
    // Page numbers over a stable id order; deletes during a backfill can shift pages, which reconciliation repairs.
    const body = await this.client.get(connection, source.path,
      { page: String(page), limit: String(PAGE_SIZE), "order[id]": "asc" });
    const rows = embedded(body, source.name);
    const hasNext = rows.length === PAGE_SIZE && !!(body?._links && (body._links as Record<string, unknown>).next);
    return { items: rows.map(row => this.normalize(connection, kind, row)), next: hasNext ? String(page + 1) : null };
  }

  async fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null> {
    const source = LIST_PATHS[kind];
    if (!source || kind === "user" || !/^\d+$/.test(externalId)) throw new Error(`Unsupported Kommo record ${kind}`);
    const body = await this.client.get(connection, `${source.path}/${externalId}`);
    return body ? this.normalize(connection, kind, body) : null;
  }

  deletionCheck(kind: string): DeletionCheck {
    // Pipelines and stages arrive in one response, so the listing is complete.
    if (kind === "pipeline" || kind === "stage") return "complete";
    // Deals, contacts and tasks use page numbers, which shift when rows are deleted mid-pass: verify one by one
    // (the client maps 404/204 to null). Users are only manager labels and have no single-record read here.
    return kind === "user" ? "none" : "verify";
  }

  async subscribe(connection: Connection, handlerUrl: string): Promise<EventsMode> {
    try {
      const existing = embedded(await this.client.get(connection, "/api/v4/webhooks", { "filter[destination]": handlerUrl }), "webhooks");
      if (existing.some(hook => hook.destination === handlerUrl && hook.disabled !== true)) return "webhook";
      await this.client.post(connection, "/api/v4/webhooks", { destination: handlerUrl, settings: WEBHOOK_EVENTS });
      return "webhook";
    } catch (error) {
      // Webhook management via API requires Advanced/Pro/Enterprise (https://developers.kommo.com/reference/add-webhooks).
      // The exact status code for a plan restriction is **unverified**; 402/403 fall back to scheduled reconciliation.
      const status = (error as { status?: number }).status;
      if (error instanceof ConnectorUpstreamError && (status === 402 || status === 403)) return "polling";
      throw error;
    }
  }

  parseEvents(body: string): ChangeEvent[] { return parseKommoEvents(body); }

  acceptsEvent(): boolean { return true; }

  mappingOptions(): MappingOptions {
    return {
      sources: [{ kind: "deal", label: "Сделки" }],
      customSource: null,
      categoryKind: "pipeline",
      fieldMapping: null,
      activityKind: "task",
      activityCodeLabel: "ID типа задачи",
      activityCodeHint: "Числовой task_type_id пользовательского типа задачи (тип 2 «Встреча» распознаётся сам).",
    };
  }

  private normalize(connection: Connection, kind: string, row: Record<string, unknown>): CanonicalRecord {
    if (kind === "deal") {
      const pipeline = valueString(row.pipeline_id) ?? "*";
      const mapped = this.store.getCommercialMapping(connection.id, "deal", pipeline);
      const currency = connection.settings ? (JSON.parse(connection.settings) as { currency?: string | null }).currency ?? undefined : undefined;
      return normalizeLead(row, { direction: mapped?.direction, currency });
    }
    if (kind === "task") {
      const typeId = valueString(row.task_type_id);
      return normalizeTask(row, typeId ? this.store.getActionType(connection.id, typeId) : null);
    }
    if (kind === "contact") return normalizeContact(row);
    if (kind === "user") return normalizeUser(row);
    throw new Error(`Unsupported Kommo kind ${kind}`);
  }
}
