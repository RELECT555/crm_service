import type { Config } from "./config.ts";
import type { Connection, Normalized } from "./store.ts";
import { decrypt, encrypt } from "./crypto.ts";
import type { Store } from "./store.ts";

type JsonObject = Record<string, unknown>;
export type BitrixTokens = {
  access_token: string; refresh_token: string; expires_in: number;
  client_endpoint: string; member_id: string; scope?: string;
};
export class BitrixAuthError extends Error {}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected Bitrix response shape");
  return value as JsonObject;
}
function valueString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
function requiredString(value: unknown, field: string): string {
  const result = valueString(value);
  if (!result) throw new Error(`Missing Bitrix ${field}`);
  return result;
}

export function normalizePortal(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
      !/^[a-z0-9-]+\.bitrix24\.(com|ru)$/.test(host)) {
    throw new Error("Portal must be a public *.bitrix24.com or *.bitrix24.ru HTTPS host");
  }
  return host;
}

export function authorizeUrl(portal: string, clientId: string, state: string): string {
  const url = new URL(`https://${normalizePortal(portal)}/oauth/authorize/`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeToken(config: Config, grant: "authorization_code" | "refresh_token", token: string,
  fetcher: typeof fetch = fetch): Promise<BitrixTokens> {
  const url = new URL("https://oauth.bitrix.info/oauth/token/");
  url.searchParams.set("grant_type", grant);
  url.searchParams.set("client_id", config.bitrixClientId);
  url.searchParams.set("client_secret", config.bitrixClientSecret);
  url.searchParams.set(grant === "authorization_code" ? "code" : "refresh_token", token);
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
  const body = object(await response.json());
  if (!response.ok || body.error) {
    const code = valueString(body.error) ?? String(response.status);
    if (/invalid_grant|invalid_token|expired_token|no_auth_found/i.test(code)) {
      throw new BitrixAuthError(`Bitrix OAuth failed: ${code}`);
    }
    throw new Error(`Bitrix OAuth failed: ${code}`);
  }
  const result: BitrixTokens = {
    access_token: requiredString(body.access_token, "access_token"),
    refresh_token: requiredString(body.refresh_token, "refresh_token"),
    expires_in: Number(body.expires_in),
    client_endpoint: requiredString(body.client_endpoint, "client_endpoint"),
    member_id: requiredString(body.member_id, "member_id"),
    scope: valueString(body.scope),
  };
  if (!Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error("Invalid Bitrix token expiry");
  const endpoint = new URL(result.client_endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
      !endpoint.pathname.startsWith("/rest/") || endpoint.search || endpoint.hash) {
    throw new Error("Invalid Bitrix client endpoint");
  }
  normalizePortal(endpoint.hostname);
  return result;
}

export class BitrixClient {
  private config: Config;
  private store: Store;
  private fetcher: typeof fetch;
  constructor(config: Config, store: Store, fetcher: typeof fetch = fetch) {
    this.config = config; this.store = store; this.fetcher = fetcher;
  }

  async call(connection: Connection, method: string, params: JsonObject = {}): Promise<JsonObject> {
    if (!/^[a-z][a-z0-9.]+$/.test(method)) throw new Error("Invalid Bitrix method");
    let access = decrypt(this.config.dataKey, connection.access_token_enc);
    const refresh = async () => {
      const refreshed = await exchangeToken(this.config, "refresh_token",
        decrypt(this.config.dataKey, connection.refresh_token_enc), this.fetcher);
      if (refreshed.member_id !== connection.member_id) throw new Error("Bitrix account changed during refresh");
      access = refreshed.access_token;
      connection.access_token_enc = encrypt(this.config.dataKey, access);
      connection.refresh_token_enc = encrypt(this.config.dataKey, refreshed.refresh_token);
      connection.expires_at = Date.now() + refreshed.expires_in * 1000;
      const refreshedPortal = normalizePortal(new URL(refreshed.client_endpoint).hostname);
      if (refreshedPortal !== connection.portal) {
        connection.portal = refreshedPortal;
        this.store.updatePortal(connection.id, refreshedPortal);
      }
      this.store.updateTokens(connection.id, connection.access_token_enc, connection.refresh_token_enc, connection.expires_at);
    };
    let refreshedOnce = false;
    if (connection.expires_at < Date.now() + 60_000) { await refresh(); refreshedOnce = true; }
    const endpoint = new URL(`https://${connection.portal}/rest/${method}`);
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.fetcher(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...params, auth: access }), signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 3) {
          const seconds = Number(response.headers.get("retry-after"));
          await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds * 1000, 10_000) : 500 * 2 ** attempt));
          continue;
        }
      }
      const body = object(await response.json());
      if (body.error === "expired_token" && !refreshedOnce) {
        await refresh(); refreshedOnce = true; continue;
      }
      if (!response.ok || body.error) {
        const code = valueString(body.error) ?? String(response.status);
        if (/expired_token|invalid_token|no_auth_found/i.test(code)) {
          throw new BitrixAuthError(`Bitrix ${method} failed: ${code}`);
        }
        throw new Error(`Bitrix ${method} failed: ${code}`);
      }
      return body;
    }
    throw new Error(`Bitrix ${method} unavailable`);
  }

  async list(connection: Connection, kind: string, cursor: string | null): Promise<{ items: Normalized[]; next: string | null }> {
    const after = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error("Invalid sync cursor");
    let raw: JsonObject[];
    let next: string | null = null;
    const smartType = /^smart:(\d+)$/.exec(kind);
    if (kind === "deal" || kind === "contact" || smartType) {
      const typeId = smartType ? Number(smartType[1]) : kind === "deal" ? 2 : 3;
      const select = kind === "contact" ? ["id", "assignedById", "updatedTime"] :
        [...new Set(["id", "stageId", "categoryId", "assignedById", "updatedTime",
          ...(kind === "deal" ? ["opportunity", "currencyId"] : []),
          ...this.store.commercialFields(connection.id, typeId)])];
      const body = await this.call(connection, "crm.item.list", {
        entityTypeId: typeId, filter: { ">id": after }, order: { id: "ASC" }, select, start: 0,
      });
      raw = object(body.result).items as JsonObject[];
      next = raw.length === 50 && raw.length > 0 ? requiredString(raw.at(-1)?.id, "last item ID") : null;
    } else if (kind === "activity") {
      const body = await this.call(connection, "crm.activity.list", {
        filter: { ">ID": after }, order: { ID: "ASC" },
        select: ["ID", "TYPE_ID", "PROVIDER_TYPE_ID", "COMPLETED", "RESPONSIBLE_ID",
          "OWNER_TYPE_ID", "OWNER_ID", "LAST_UPDATED"], start: 0,
      });
      raw = body.result as JsonObject[];
      next = raw.length === 50 && raw.length > 0 ? requiredString(raw.at(-1)?.ID, "last activity ID") : null;
    } else if (kind === "pipeline") {
      const body = await this.call(connection, "crm.category.list", { entityTypeId: 2, start: after });
      raw = object(body.result).categories as JsonObject[];
      next = valueString(body.next) ?? null;
    } else if (kind === "stage") {
      const body = await this.call(connection, "crm.status.list", { start: after });
      raw = (body.result as JsonObject[]).filter(row => valueString(row.ENTITY_ID)?.startsWith("DEAL_STAGE"));
      next = valueString(body.next) ?? null;
    } else throw new Error(`Unsupported kind ${kind}`);
    if (!Array.isArray(raw)) throw new Error(`Unexpected Bitrix ${kind} list`);
    const items = raw.map(row => this.normalize(connection, kind, object(row)));
    return { items, next };
  }

  async get(connection: Connection, kind: string, id: string): Promise<Normalized | null> {
    try {
      const body = kind === "activity"
        ? await this.call(connection, "crm.activity.get", { id })
        : await this.call(connection, "crm.item.get", {
          entityTypeId: kind.startsWith("smart:") ? Number(kind.slice(6)) : kind === "deal" ? 2 : 3, id });
      const raw = kind === "activity" ? body.result : object(body.result).item;
      return this.normalize(connection, kind, object(raw));
    } catch (error) {
      // Only a verified delete event is allowed to tombstone a record; API errors must be retried.
      throw error;
    }
  }

  private normalize(connection: Connection, kind: string, row: JsonObject): Normalized {
    if (kind === "activity") {
      const mappedType = valueString(row.PROVIDER_TYPE_ID)
        ? this.store.getActionType(connection.id, String(row.PROVIDER_TYPE_ID)) : null;
      return normalizeBitrixRecord(kind, row, { actionType: mappedType ?? undefined });
    }
    if (kind === "deal" || kind.startsWith("smart:")) {
      const typeId = kind === "deal" ? 2 : Number(kind.slice(6));
      const categoryId = valueString(row.categoryId) ?? "*";
      const mapped = this.store.getCommercialSource(connection.id, typeId, categoryId);
      return normalizeBitrixRecord(kind, row, {
        direction: mapped?.direction ?? (kind === "deal" ? "sale" : "unclassified"),
        amountField: mapped?.amount_field ?? "opportunity",
        currencyField: mapped?.currency_field ?? "currencyId",
      });
    }
    return normalizeBitrixRecord(kind, row);
  }

  async bindEvents(connection: Connection, webhookSecret: string): Promise<void> {
    const handler = `${this.config.appOrigin}/webhooks/bitrix24/${webhookSecret}`;
    const existingResponse = await this.call(connection, "event.get");
    const existing = new Set((Array.isArray(existingResponse.result) ? existingResponse.result : [])
      .map(row => {
        const item = object(row);
        return `${valueString(item.event)?.toUpperCase()}|${valueString(item.handler)}`;
      }));
    for (const event of ["ONCRMDEALADD", "ONCRMDEALUPDATE", "ONCRMDEALDELETE", "ONCRMDEALMOVETOCATEGORY",
      "ONCRMCONTACTADD", "ONCRMCONTACTUPDATE", "ONCRMCONTACTDELETE",
      "ONCRMACTIVITYADD", "ONCRMACTIVITYUPDATE", "ONCRMACTIVITYDELETE",
      "ONCRMDYNAMICITEMADD", "ONCRMDYNAMICITEMUPDATE", "ONCRMDYNAMICITEMDELETE"]) {
      if (!existing.has(`${event}|${handler}`)) await this.call(connection, "event.bind", { event, handler });
    }
  }
}

export function normalizeBitrixRecord(kind: string, raw: JsonObject,
  mapping: { direction?: string; amountField?: string; currencyField?: string; actionType?: string } = {}): Normalized {
  const id = requiredString(raw.id ?? raw.ID, "record ID");
  if (kind === "deal" || kind.startsWith("smart:")) {
    const amountField = mapping.amountField ?? "opportunity";
    const currencyField = mapping.currencyField ?? "currencyId";
    const amount = Number(raw[amountField]);
    return { kind, externalId: id, axis: "commercial", direction: mapping.direction ?? "unclassified",
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: valueString(raw[currencyField]), status: valueString(raw.stageId),
      ownerId: valueString(raw.assignedById), sourceUpdatedAt: valueString(raw.updatedTime),
      payload: { id, [amountField]: raw[amountField], [currencyField]: raw[currencyField],
        stageId: raw.stageId, categoryId: raw.categoryId, assignedById: raw.assignedById,
        updatedTime: raw.updatedTime } };
  }
  if (kind === "activity") {
    const typeId = Number(raw.TYPE_ID);
    const actionType = ({ 1: "meeting", 2: "call", 3: "task", 4: "email", 5: "calendar", 6: "provider" } as Record<number, string>)[typeId] ?? "other";
    const ownerType = Number(raw.OWNER_TYPE_ID);
    const targetKind = ownerType === 2 ? "deal" : ownerType >= 128 ? `smart:${ownerType}` : undefined;
    return { kind, externalId: id, axis: "work", actionType: mapping.actionType ?? actionType,
      status: raw.COMPLETED === "Y" ? "completed" : "open",
      ownerId: valueString(raw.RESPONSIBLE_ID),
      targetKind,
      targetId: targetKind ? valueString(raw.OWNER_ID) : undefined,
      sourceUpdatedAt: valueString(raw.LAST_UPDATED),
      payload: { ID: id, TYPE_ID: raw.TYPE_ID, PROVIDER_TYPE_ID: raw.PROVIDER_TYPE_ID,
        COMPLETED: raw.COMPLETED, RESPONSIBLE_ID: raw.RESPONSIBLE_ID,
        OWNER_TYPE_ID: raw.OWNER_TYPE_ID, OWNER_ID: raw.OWNER_ID, LAST_UPDATED: raw.LAST_UPDATED } };
  }
  if (kind === "contact") return { kind, externalId: id, axis: "context",
    sourceUpdatedAt: valueString(raw.updatedTime), payload: { id, assignedById: raw.assignedById,
      updatedTime: raw.updatedTime } };
  if (kind === "pipeline" || kind === "stage") return { kind, externalId: id, axis: "context",
    label: valueString(raw.name ?? raw.NAME), payload: raw };
  throw new Error(`Unsupported Bitrix kind ${kind}`);
}

export function parseBitrixEvent(body: string): { memberId: string; kind: string; id: string; operation: string } | null {
  const fields = new URLSearchParams(body);
  const memberId = fields.get("auth[member_id]");
  const id = fields.get("data[FIELDS][ID]");
  const event = fields.get("event")?.toUpperCase();
  if (!memberId || !id || !event || !/^\d+$/.test(id)) return null;
  let kind: string;
  if (event.startsWith("ONCRMDEAL")) kind = "deal";
  else if (event.startsWith("ONCRMCONTACT")) kind = "contact";
  else if (event.startsWith("ONCRMACTIVITY")) kind = "activity";
  else if (event.startsWith("ONCRMDYNAMICITEM")) {
    const typeId = fields.get("data[FIELDS][ENTITY_TYPE_ID]");
    if (!typeId || !/^\d+$/.test(typeId)) return null;
    kind = `smart:${typeId}`;
  }
  else return null;
  if (!/(ADD|UPDATE|DELETE|MOVETOCATEGORY)$/.test(event)) return null;
  return { memberId, kind, id, operation: event.endsWith("DELETE") ? "delete" : "upsert" };
}
