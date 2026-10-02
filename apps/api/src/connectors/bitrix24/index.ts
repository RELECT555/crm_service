import type { Config } from "../../config.ts";
import type { CanonicalRecord, ChangeEvent, SyncPage } from "../../domain/model.ts";
import type { Connection, EventsMode, Store } from "../../storage/store.ts";
import { type AuthorizationGrant, type Connector, ConnectorInputError, ConnectorUpstreamError, type DeletionCheck,
  type MappingOptions } from "../types.ts";
import { BitrixClient } from "./client.ts";
import { BITRIX24_INFO } from "./info.ts";
import { normalizeBitrixRecord, parseBitrixEvent, SUBSCRIBED_EVENTS } from "./mapping.ts";
import { authorizeUrl, exchangeToken, normalizePortal } from "./oauth.ts";
import { type JsonObject, object, requiredString, valueString } from "./values.ts";

/** Reference data first so stages/pipelines exist before the records that point at them. */
const BASE_KINDS = ["pipeline", "stage", "deal", "contact", "activity"];
const PAGE_SIZE = 50;

export class Bitrix24Connector implements Connector {
  readonly info = BITRIX24_INFO;
  readonly client: BitrixClient;
  private config: Config;
  private store: Store;
  private fetcher: typeof fetch;

  constructor(config: Config, store: Store, fetcher: typeof fetch = fetch) {
    this.config = config; this.store = store; this.fetcher = fetcher;
    this.client = new BitrixClient(this.app(), config.dataKey, store, fetcher);
  }
  private app() {
    // The registry only constructs this connector when both credentials are configured.
    return { clientId: this.config.bitrixClientId!, clientSecret: this.config.bitrixClientSecret! };
  }

  normalizeAccount(input: string): string { return normalizePortal(input); }

  authorizeUrl(account: string, state: string): string {
    return authorizeUrl(account, this.config.bitrixClientId!, state);
  }

  async completeAuthorization(callback: URLSearchParams, expectedAccount: string): Promise<AuthorizationGrant> {
    const code = callback.get("code");
    if (!code) throw new ConnectorInputError("Missing OAuth code");
    const domain = callback.get("domain");
    if (domain && normalizePortal(domain) !== expectedAccount) throw new ConnectorInputError("OAuth portal mismatch");
    const tokens = await exchangeToken(this.app(), "authorization_code", code, this.fetcher);
    const portal = normalizePortal(new URL(tokens.client_endpoint).hostname);
    if (portal !== expectedAccount) throw new ConnectorInputError("OAuth account mismatch");
    const member = callback.get("member_id");
    if (member && member !== tokens.member_id) throw new ConnectorInputError("OAuth member mismatch");
    if (!tokens.scope?.split(",").includes("crm")) throw new ConnectorInputError("Bitrix CRM scope is required");
    return { accountId: tokens.member_id, account: portal, accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in };
  }

  syncKinds(connection: Connection): string[] {
    // Smart processes are read only once the operator mapped them as commercial.
    return [...BASE_KINDS, ...this.store.mappedSourceKinds(connection.id).filter(kind => kind.startsWith("smart:"))];
  }

  async listPage(connection: Connection, kind: string, cursor: string | null): Promise<SyncPage> {
    const after = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error("Invalid sync cursor");
    let raw: JsonObject[];
    let next: string | null = null;
    const smartType = /^smart:(\d+)$/.exec(kind);
    if (kind === "deal" || kind === "contact" || smartType) {
      // Keyset pagination by ID (start: 0 disables the expensive total count).
      const typeId = smartType ? Number(smartType[1]) : kind === "deal" ? 2 : 3;
      const select = kind === "contact" ? ["id", "assignedById", "updatedTime"] :
        [...new Set(["id", "stageId", "categoryId", "assignedById", "updatedTime",
          ...(kind === "deal" ? ["opportunity", "currencyId"] : []),
          ...this.store.mappedFields(connection.id, kind)])];
      const body = await this.client.call(connection, "crm.item.list", {
        entityTypeId: typeId, filter: { ">id": after }, order: { id: "ASC" }, select, start: 0,
      });
      raw = object(body.result).items as JsonObject[];
      next = Array.isArray(raw) && raw.length === PAGE_SIZE ? requiredString(raw.at(-1)?.id, "last item ID") : null;
    } else if (kind === "activity") {
      const body = await this.client.call(connection, "crm.activity.list", {
        filter: { ">ID": after }, order: { ID: "ASC" },
        select: ["ID", "TYPE_ID", "PROVIDER_TYPE_ID", "COMPLETED", "RESPONSIBLE_ID",
          "OWNER_TYPE_ID", "OWNER_ID", "LAST_UPDATED"], start: 0,
      });
      raw = body.result as JsonObject[];
      next = Array.isArray(raw) && raw.length === PAGE_SIZE ? requiredString(raw.at(-1)?.ID, "last activity ID") : null;
    } else if (kind === "pipeline") {
      const body = await this.client.call(connection, "crm.category.list", { entityTypeId: 2, start: after });
      raw = object(body.result).categories as JsonObject[];
      next = valueString(body.next) ?? null;
    } else if (kind === "stage") {
      const body = await this.client.call(connection, "crm.status.list", { start: after });
      raw = (body.result as JsonObject[]).filter(row => valueString(row.ENTITY_ID)?.startsWith("DEAL_STAGE"));
      next = valueString(body.next) ?? null;
    } else throw new Error(`Unsupported kind ${kind}`);
    if (!Array.isArray(raw)) throw new ConnectorUpstreamError(`Unexpected Bitrix ${kind} list`);
    return { items: raw.map(row => this.normalize(connection, kind, object(row))), next };
  }

  async fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null> {
    // Errors propagate so the job retries: only a verified delete event may tombstone a record.
    const body = kind === "activity"
      ? await this.client.call(connection, "crm.activity.get", { id: externalId })
      : await this.client.call(connection, "crm.item.get", {
        entityTypeId: kind.startsWith("smart:") ? Number(kind.slice(6)) : kind === "deal" ? 2 : 3, id: externalId });
    const raw = kind === "activity" ? body.result : object(body.result).item;
    return this.normalize(connection, kind, object(raw));
  }

  deletionCheck(): DeletionCheck {
    // Records use keyset pagination by ID, so a pass sees every row that existed throughout it. Pipelines and stages
    // use offset paging but fit in one page in practice; a rare shift only hides a label until the next pass.
    // fetchRecord cannot verify those reference kinds, so a full listing is the only signal for them.
    return "complete";
  }

  async subscribe(connection: Connection, handlerUrl: string): Promise<EventsMode> {
    const existingResponse = await this.client.call(connection, "event.get");
    const existing = new Set((Array.isArray(existingResponse.result) ? existingResponse.result : [])
      .map(row => {
        const item = object(row);
        return `${valueString(item.event)?.toUpperCase()}|${valueString(item.handler)}`;
      }));
    for (const event of SUBSCRIBED_EVENTS) {
      if (!existing.has(`${event}|${handlerUrl}`)) await this.client.call(connection, "event.bind", { event, handler: handlerUrl });
    }
    return "webhook";
  }

  parseEvents(body: string): ChangeEvent[] {
    const event = parseBitrixEvent(body);
    return event ? [event] : [];
  }

  acceptsEvent(connection: Connection, event: ChangeEvent): boolean {
    // Smart-process events are only relevant once the operator mapped that process as commercial.
    return !event.kind.startsWith("smart:") || this.store.hasCommercialMapping(connection.id, event.kind);
  }

  mappingOptions(): MappingOptions {
    return {
      sources: [{ kind: "deal", label: "Сделки" }],
      customSource: { prefix: "smart:", label: "Смарт-процесс", idLabel: "ID смарт-процесса (entityTypeId)", minId: 128 },
      categoryKind: "pipeline",
      fieldMapping: { amountDefault: "opportunity", currencyDefault: "currencyId" },
      activityKind: "activity",
      activityCodeLabel: "PROVIDER_TYPE_ID дела",
      activityCodeHint: "Код пользовательского типа дела в Bitrix24, например TRAVEL.",
    };
  }

  private normalize(connection: Connection, kind: string, row: JsonObject): CanonicalRecord {
    if (kind === "activity") {
      const mappedType = valueString(row.PROVIDER_TYPE_ID)
        ? this.store.getActionType(connection.id, String(row.PROVIDER_TYPE_ID)) : null;
      return normalizeBitrixRecord(kind, row, { actionType: mappedType ?? undefined });
    }
    if (kind === "deal" || kind.startsWith("smart:")) {
      const mapped = this.store.getCommercialMapping(connection.id, kind, valueString(row.categoryId) ?? "*");
      return normalizeBitrixRecord(kind, row, {
        direction: mapped?.direction ?? (kind === "deal" ? "sale" : "unclassified"),
        amountField: mapped?.amount_field ?? "opportunity",
        currencyField: mapped?.currency_field ?? "currencyId",
      });
    }
    return normalizeBitrixRecord(kind, row);
  }
}
