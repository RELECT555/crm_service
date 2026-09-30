import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { Config } from "./config.ts";
import { generateSecret, loadConfig } from "./config.ts";
import { digest, encrypt, safeEqual } from "./crypto.ts";
import { authorizeUrl, BitrixClient, exchangeToken, normalizePortal, parseBitrixEvent } from "./bitrix.ts";
import { Store } from "./store.ts";
import { queueFullSync, SYNC_KINDS, Worker } from "./worker.ts";

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const body = JSON.parse(await readBody(req));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Expected JSON object");
  }
}
function requireAdmin(req: IncomingMessage, config: Config): void {
  const provided = req.headers["x-admin-key"];
  if (typeof provided !== "string" || !safeEqual(provided, config.adminApiKey)) {
    throw new HttpError(401, "Unauthorized");
  }
}

export function makeApp(config: Config, store: Store, fetcher: typeof fetch = fetch) {
  const bitrix = new BitrixClient(config, store, fetcher);
  const worker = new Worker(config, store, bitrix);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", config.appOrigin);
      const path = url.pathname;
      if (req.method === "GET" && path === "/healthz") return json(res, 200, { ok: true });

      if (req.method === "GET" && path === "/oauth/bitrix24/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) throw new HttpError(400, "Missing OAuth code or state");
        const pending = store.consumeState(digest(state));
        if (!pending) throw new HttpError(400, "OAuth state expired or already used");
        const callbackDomain = url.searchParams.get("domain");
        if (callbackDomain && normalizePortal(callbackDomain) !== pending.portal) {
          throw new HttpError(400, "OAuth portal mismatch");
        }
        const tokens = await exchangeToken(config, "authorization_code", code, fetcher);
        const tokenPortal = normalizePortal(new URL(tokens.client_endpoint).hostname);
        if (tokenPortal !== pending.portal) throw new HttpError(400, "OAuth account mismatch");
        const callbackMember = url.searchParams.get("member_id");
        if (callbackMember && callbackMember !== tokens.member_id) throw new HttpError(400, "OAuth member mismatch");
        if (!tokens.scope?.split(",").includes("crm")) throw new HttpError(400, "Bitrix CRM scope is required");
        const id = randomUUID();
        const webhookSecret = generateSecret();
        store.transaction(() => {
          store.saveConnection({ id, tenant_id: pending.tenant_id, member_id: tokens.member_id,
            portal: tokenPortal, access_token_enc: encrypt(config.dataKey, tokens.access_token),
            refresh_token_enc: encrypt(config.dataKey, tokens.refresh_token),
            expires_at: Date.now() + tokens.expires_in * 1000,
            webhook_secret_hash: digest(webhookSecret),
            webhook_secret_enc: encrypt(config.dataKey, webhookSecret) });
          store.enqueue(id, "bind", "events");
          for (const kind of SYNC_KINDS) store.enqueue(id, "sync", kind);
        });
        return json(res, 201, { connectionId: id, tenantId: pending.tenant_id, status: "backfilling" });
      }

      const hook = /^\/webhooks\/bitrix24\/([A-Za-z0-9_-]{30,})$/.exec(path);
      if (req.method === "POST" && hook) {
        const connection = store.getConnectionByWebhookHash(digest(hook[1]));
        if (!connection) throw new HttpError(404, "Unknown webhook");
        const body = await readBody(req);
        const event = parseBitrixEvent(body);
        if (!event || event.memberId !== connection.member_id) throw new HttpError(400, "Invalid Bitrix event");
        if (event.kind.startsWith("smart:") && !store.hasCommercialType(connection.id, Number(event.kind.slice(6)))) {
          return json(res, 202, { accepted: true });
        }
        store.transaction(() => {
          if (store.recordEvent(connection.id, digest(body))) {
            store.enqueue(connection.id, "fetch", event.kind, null, event.id, event.operation);
          }
        });
        return json(res, 202, { accepted: true });
      }

      requireAdmin(req, config);
      if (req.method === "POST" && path === "/v1/tenants") {
        return json(res, 201, { tenantId: store.createTenant() });
      }
      const start = /^\/v1\/tenants\/([0-9a-f-]{36})\/bitrix24\/start$/.exec(path);
      if (req.method === "POST" && start) {
        if (!store.tenantExists(start[1])) throw new HttpError(404, "Tenant not found");
        const body = await readJson(req);
        if (typeof body.portal !== "string") throw new HttpError(400, "portal is required");
        let portal: string;
        try { portal = normalizePortal(body.portal); }
        catch { throw new HttpError(400, "Invalid Bitrix portal"); }
        const state = generateSecret();
        store.saveState(digest(state), start[1], portal);
        return json(res, 200, { authorizeUrl: authorizeUrl(portal, config.bitrixClientId, state),
          redirectUri: `${config.appOrigin}/oauth/bitrix24/callback` });
      }
      const connections = /^\/v1\/tenants\/([0-9a-f-]{36})\/connections$/.exec(path);
      if (req.method === "GET" && connections) {
        if (!store.tenantExists(connections[1])) throw new HttpError(404, "Tenant not found");
        return json(res, 200, { connections: store.listConnections(connections[1]) });
      }
      const dashboard = /^\/v1\/tenants\/([0-9a-f-]{36})\/connections\/([0-9a-f-]{36})\/dashboard$/.exec(path);
      if (req.method === "GET" && dashboard) {
        const connection = store.getConnectionForTenant(dashboard[1], dashboard[2]);
        if (!connection) throw new HttpError(404, "Connection not found");
        return json(res, 200, { connection: { id: connection.id, portal: connection.portal,
          status: connection.status, lastSync: connection.last_sync, lastError: connection.last_error },
          analytics: store.dashboard(dashboard[1], dashboard[2]),
          commercialSources: store.listCommercialSources(connection.id),
          limitations: ["Deals are classified as sales unless a pipeline mapping overrides them; purchases need an explicit process mapping.",
            "Only Bitrix CRM activities are loaded; unlinked work and external tasks may be incomplete.",
            "Values are grouped by source currency and are not converted.",
            "Relationships show recorded links, not proven causal impact."] });
      }
      const commercialSource = /^\/v1\/tenants\/([0-9a-f-]{36})\/connections\/([0-9a-f-]{36})\/commercial-sources$/.exec(path);
      if (req.method === "POST" && commercialSource) {
        const connection = store.getConnectionForTenant(commercialSource[1], commercialSource[2]);
        if (!connection) throw new HttpError(404, "Connection not found");
        const body = await readJson(req);
        const typeId = Number(body.entityTypeId);
        const direction = body.direction;
        const category = body.categoryId === undefined ? "*" : String(body.categoryId);
        const amountField = body.amountField === undefined ? "opportunity" : body.amountField;
        const currencyField = body.currencyField === undefined ? "currencyId" : body.currencyField;
        if ((!Number.isSafeInteger(typeId) || (typeId !== 2 && typeId < 128)) ||
            (direction !== "sale" && direction !== "purchase") || !/^\d+$|^\*$/.test(category) ||
            typeof amountField !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(amountField) ||
            typeof currencyField !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(currencyField)) {
          throw new HttpError(400, "Invalid commercial source mapping");
        }
        store.transaction(() => {
          store.setCommercialSource(connection.id, typeId, category, direction, amountField, currencyField);
          store.enqueue(connection.id, "sync", typeId === 2 ? "deal" : `smart:${typeId}`);
        });
        return json(res, 202, { mapped: true, syncQueued: true });
      }
      const actionType = /^\/v1\/tenants\/([0-9a-f-]{36})\/connections\/([0-9a-f-]{36})\/action-types$/.exec(path);
      if (req.method === "POST" && actionType) {
        const connection = store.getConnectionForTenant(actionType[1], actionType[2]);
        if (!connection) throw new HttpError(404, "Connection not found");
        const body = await readJson(req);
        if (typeof body.providerTypeId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.providerTypeId) ||
            typeof body.actionType !== "string" || !/^[a-z][a-z_]{0,39}$/.test(body.actionType)) {
          throw new HttpError(400, "Invalid action type mapping");
        }
        store.transaction(() => {
          store.setActionType(connection.id, body.providerTypeId as string, body.actionType as string);
          store.enqueue(connection.id, "sync", "activity");
        });
        return json(res, 202, { mapped: true, syncQueued: true });
      }
      const resync = /^\/v1\/tenants\/([0-9a-f-]{36})\/connections\/([0-9a-f-]{36})\/resync$/.exec(path);
      if (req.method === "POST" && resync) {
        const connection = store.getConnectionForTenant(resync[1], resync[2]);
        if (!connection) throw new HttpError(404, "Connection not found");
        const queued = queueFullSync(store, connection.id);
        if (!queued) throw new HttpError(409, "A full sync is already running");
        return json(res, 202, { queued });
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      if (error instanceof Error && error.message.startsWith("Bitrix")) return json(res, 502, { error: error.message });
      return json(res, 500, { error: "Internal server error" });
    }
  });
  return { server, worker };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = loadConfig();
  const store = new Store(config.dbPath);
  const { server, worker } = makeApp(config, store);
  server.listen(config.port, () => {
    worker.start();
    console.log(`CRM service listening on port ${config.port}`);
  });
  const shutdown = () => { worker.stop(); server.close(() => { store.close(); process.exit(0); }); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
