import { generateSecret } from "../../config.ts";
import { ConnectorInputError, isMappableKind } from "../../connectors/types.ts";
import { digest } from "../../security/crypto.ts";
import type { Connection } from "../../storage/store.ts";
import { queueFullSync } from "../../sync/worker.ts";
import type { AppContext } from "../context.ts";
import { HttpError, json, readJson } from "../respond.ts";
import type { Router } from "../router.ts";

const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,100}$/;

function tenantName(value: unknown, required: boolean): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new HttpError(400, "name must be 1-120 characters");
  }
  return value.trim();
}

/** Operator routes under /v1. The caller has already passed `requireAdmin`. Every lookup is tenant-scoped. */
export function adminRoutes(router: Router, { config, store, registry }: AppContext): Router {
  const tenantOr404 = (tenantId: string) => {
    if (!store.tenantExists(tenantId)) throw new HttpError(404, "Tenant not found");
  };
  const connectionOr404 = (tenantId: string, connectionId: string): Connection => {
    const connection = store.getConnectionForTenant(tenantId, connectionId);
    if (!connection) throw new HttpError(404, "Connection not found");
    return connection;
  };

  // --- Catalog and workspaces ---

  router.on("GET", "/v1/providers", ({ res }) => json(res, 200, {
    providers: registry.catalog().map(info => ({ ...info,
      // Shown before the app is configured too: the operator needs it to register the OAuth application.
      callbackUrl: info.status === "planned" ? null : `${config.appOrigin}/oauth/${info.id}/callback` })),
  }));

  router.on("GET", "/v1/tenants", ({ res }) => json(res, 200, { tenants: store.listTenants() }));

  router.on("POST", "/v1/tenants", async ({ req, res }) => {
    const body = await readJson(req, true);
    json(res, 201, { tenantId: store.createTenant(tenantName(body.name, false)) });
  });

  router.on("GET", "/v1/tenants/:uuid", ({ res, params: [tenantId] }) => {
    tenantOr404(tenantId);
    json(res, 200, { tenant: store.getTenant(tenantId), connections: store.listConnections(tenantId) });
  });

  router.on("PATCH", "/v1/tenants/:uuid", async ({ req, res, params: [tenantId] }) => {
    tenantOr404(tenantId);
    store.renameTenant(tenantId, tenantName((await readJson(req)).name, true)!);
    json(res, 200, { tenant: store.getTenant(tenantId), connections: store.listConnections(tenantId) });
  });

  // --- Connecting a CRM account ---

  router.on("POST", "/v1/tenants/:uuid/connect/:provider", async ({ req, res, params: [tenantId, provider] }) => {
    tenantOr404(tenantId);
    const connector = registry.get(provider);
    if (!connector) throw new HttpError(404, "Provider is not available yet");
    const body = await readJson(req);
    if (typeof body.account !== "string") throw new HttpError(400, "account is required");
    let account: string;
    try { account = connector.normalizeAccount(body.account); }
    catch (error) {
      if (error instanceof ConnectorInputError) throw new HttpError(400, error.message);
      throw error;
    }
    const state = generateSecret();
    store.saveState(digest(state), tenantId, provider, account);
    json(res, 200, { authorizeUrl: connector.authorizeUrl(account, state), account,
      redirectUri: `${config.appOrigin}/oauth/${provider}/callback` });
  });

  router.on("GET", "/v1/tenants/:uuid/connections", ({ res, params: [tenantId] }) => {
    tenantOr404(tenantId);
    json(res, 200, { connections: store.listConnections(tenantId) });
  });

  router.on("GET", "/v1/tenants/:uuid/connections/:uuid", ({ res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    const options = registry.get(connection.provider)?.mappingOptions() ?? null;
    json(res, 200, {
      connection: { id: connection.id, provider: connection.provider, accountId: connection.account_id,
        account: connection.account, status: connection.status, eventsBound: connection.events_bound === 1,
        eventsMode: connection.events_mode, lastSync: connection.last_sync, lastError: connection.last_error,
        createdAt: connection.created_at },
      sync: store.connectionOverview(tenantId, connection.id),
      mappingOptions: options,
      pipelines: options?.categoryKind ? store.listLabels(tenantId, connection.id, options.categoryKind) : [],
      commercialSources: store.listCommercialMappings(connection.id),
      actionTypes: store.listActionTypes(connection.id),
    });
  });

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/resync", ({ res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    if (!queueFullSync(store, registry, connection.id)) throw new HttpError(409, "A full sync is already running");
    json(res, 202, { queued: true });
  });

  // --- Mappings ---
  // Which kinds are mappable and whether amount/currency fields are configurable comes from the connector.

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/commercial-sources", async ({ req, res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    const options = registry.require(connection.provider).mappingOptions();
    const body = await readJson(req);
    const sourceKind = body.sourceKind;
    const direction = body.direction;
    const category = body.categoryId === undefined || body.categoryId === "" ? "*" : String(body.categoryId);
    const fields = options.fieldMapping;
    const amountField = fields ? body.amountField ?? fields.amountDefault : null;
    const currencyField = fields ? body.currencyField ?? fields.currencyDefault : null;
    if (typeof sourceKind !== "string" || !isMappableKind(options, sourceKind) ||
        (direction !== "sale" && direction !== "purchase") || !/^\d{1,18}$|^\*$/.test(category) ||
        (fields && (typeof amountField !== "string" || !FIELD.test(amountField) ||
          typeof currencyField !== "string" || !FIELD.test(currencyField))) ||
        (!fields && (body.amountField !== undefined || body.currencyField !== undefined))) {
      throw new HttpError(400, "Invalid commercial source mapping");
    }
    store.transaction(() => {
      store.setCommercialMapping(connection.id, { source_kind: sourceKind, category_id: category, direction,
        amount_field: amountField as string | null, currency_field: currencyField as string | null });
      store.enqueue(connection.id, "sync", sourceKind);
    });
    json(res, 202, { mapped: true, syncQueued: true });
  });

  router.on("DELETE", "/v1/tenants/:uuid/connections/:uuid/commercial-sources/([a-z]{1,32}(?::\\d{1,9})?)/(\\d{1,18}|\\*)",
    ({ res, params: [tenantId, connectionId, sourceKind, category] }) => {
      const connection = connectionOr404(tenantId, connectionId);
      const removed = store.transaction(() => {
        if (!store.deleteCommercialMapping(connection.id, sourceKind, category)) return false;
        store.enqueue(connection.id, "sync", sourceKind);
        return true;
      });
      if (!removed) throw new HttpError(404, "Mapping not found");
      json(res, 202, { deleted: true, syncQueued: true });
    });

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/action-types", async ({ req, res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    const body = await readJson(req);
    const activityKind = registry.require(connection.provider).mappingOptions().activityKind;
    if (typeof body.providerTypeId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.providerTypeId) ||
        typeof body.actionType !== "string" || !/^[a-z][a-z_]{0,39}$/.test(body.actionType)) {
      throw new HttpError(400, "Invalid action type mapping");
    }
    store.transaction(() => {
      store.setActionType(connection.id, body.providerTypeId as string, body.actionType as string);
      store.enqueue(connection.id, "sync", activityKind);
    });
    json(res, 202, { mapped: true, syncQueued: true });
  });

  router.on("DELETE", "/v1/tenants/:uuid/connections/:uuid/action-types/([A-Za-z0-9_-]{1,100})",
    ({ res, params: [tenantId, connectionId, providerTypeId] }) => {
      const connection = connectionOr404(tenantId, connectionId);
      const activityKind = registry.require(connection.provider).mappingOptions().activityKind;
      const removed = store.transaction(() => {
        if (!store.deleteActionType(connection.id, providerTypeId)) return false;
        store.enqueue(connection.id, "sync", activityKind);
        return true;
      });
      if (!removed) throw new HttpError(404, "Mapping not found");
      json(res, 202, { deleted: true, syncQueued: true });
    });

  // --- Analytics (prototype read model; the admin UI does not use it yet) ---

  router.on("GET", "/v1/tenants/:uuid/connections/:uuid/dashboard", ({ res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    json(res, 200, { connection: { id: connection.id, account: connection.account,
      status: connection.status, lastSync: connection.last_sync, lastError: connection.last_error },
      analytics: store.dashboard(tenantId, connectionId),
      commercialSources: store.listCommercialMappings(connection.id),
      limitations: ["Deals are classified as sales unless a pipeline mapping overrides them; purchases need an explicit process mapping.",
        "Only work items the connector reads (CRM activities or tasks) are counted; unlinked work may be incomplete.",
        "Values are grouped by source currency and are not converted.",
        "Relationships show recorded links, not proven causal impact."] });
  });
  return router;
}
