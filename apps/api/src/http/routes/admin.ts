import { generateSecret } from "../../config.ts";
import { ConnectorInputError } from "../../connectors/types.ts";
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
      callbackUrl: info.status === "available" ? `${config.appOrigin}/oauth/${info.id}/callback` : null })),
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
    json(res, 200, {
      connection: { id: connection.id, provider: connection.provider, accountId: connection.account_id,
        account: connection.account, status: connection.status, eventsBound: connection.events_bound === 1,
        lastSync: connection.last_sync, lastError: connection.last_error, createdAt: connection.created_at },
      sync: store.connectionOverview(tenantId, connection.id),
      commercialSources: store.listCommercialSources(connection.id),
      actionTypes: store.listActionTypes(connection.id),
    });
  });

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/resync", ({ res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    if (!queueFullSync(store, registry, connection.id)) throw new HttpError(409, "A full sync is already running");
    json(res, 202, { queued: true });
  });

  // --- Mappings ---
  // Commercial sources are keyed by Bitrix24 entityTypeId (2 = deals, >=128 = smart processes) today.
  // Generalize to connector object kinds together with the second connector (docs/code-architecture.md, "Known debt").

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/commercial-sources", async ({ req, res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    const body = await readJson(req);
    const typeId = Number(body.entityTypeId);
    const direction = body.direction;
    const category = body.categoryId === undefined || body.categoryId === "" ? "*" : String(body.categoryId);
    const amountField = body.amountField === undefined ? "opportunity" : body.amountField;
    const currencyField = body.currencyField === undefined ? "currencyId" : body.currencyField;
    if ((!Number.isSafeInteger(typeId) || (typeId !== 2 && typeId < 128)) ||
        (direction !== "sale" && direction !== "purchase") || !/^\d+$|^\*$/.test(category) ||
        typeof amountField !== "string" || !FIELD.test(amountField) ||
        typeof currencyField !== "string" || !FIELD.test(currencyField)) {
      throw new HttpError(400, "Invalid commercial source mapping");
    }
    store.transaction(() => {
      store.setCommercialSource(connection.id, typeId, category, direction, amountField, currencyField);
      store.enqueue(connection.id, "sync", typeId === 2 ? "deal" : `smart:${typeId}`);
    });
    json(res, 202, { mapped: true, syncQueued: true });
  });

  router.on("DELETE", "/v1/tenants/:uuid/connections/:uuid/commercial-sources/(\\d+)/(\\d+|\\*)",
    ({ res, params: [tenantId, connectionId, type, category] }) => {
      const connection = connectionOr404(tenantId, connectionId);
      const typeId = Number(type);
      const removed = store.transaction(() => {
        if (!store.deleteCommercialSource(connection.id, typeId, category)) return false;
        store.enqueue(connection.id, "sync", typeId === 2 ? "deal" : `smart:${typeId}`);
        return true;
      });
      if (!removed) throw new HttpError(404, "Mapping not found");
      json(res, 202, { deleted: true, syncQueued: true });
    });

  router.on("POST", "/v1/tenants/:uuid/connections/:uuid/action-types", async ({ req, res, params: [tenantId, connectionId] }) => {
    const connection = connectionOr404(tenantId, connectionId);
    const body = await readJson(req);
    if (typeof body.providerTypeId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.providerTypeId) ||
        typeof body.actionType !== "string" || !/^[a-z][a-z_]{0,39}$/.test(body.actionType)) {
      throw new HttpError(400, "Invalid action type mapping");
    }
    store.transaction(() => {
      store.setActionType(connection.id, body.providerTypeId as string, body.actionType as string);
      store.enqueue(connection.id, "sync", "activity");
    });
    json(res, 202, { mapped: true, syncQueued: true });
  });

  router.on("DELETE", "/v1/tenants/:uuid/connections/:uuid/action-types/([A-Za-z0-9_-]{1,100})",
    ({ res, params: [tenantId, connectionId, providerTypeId] }) => {
      const connection = connectionOr404(tenantId, connectionId);
      const removed = store.transaction(() => {
        if (!store.deleteActionType(connection.id, providerTypeId)) return false;
        store.enqueue(connection.id, "sync", "activity");
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
      commercialSources: store.listCommercialSources(connection.id),
      limitations: ["Deals are classified as sales unless a pipeline mapping overrides them; purchases need an explicit process mapping.",
        "Only Bitrix CRM activities are loaded; unlinked work and external tasks may be incomplete.",
        "Values are grouped by source currency and are not converted.",
        "Relationships show recorded links, not proven causal impact."] });
  });
  return router;
}
