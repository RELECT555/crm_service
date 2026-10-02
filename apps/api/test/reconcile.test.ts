import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Config } from "../src/config.ts";
import { digest, encrypt } from "../src/security/crypto.ts";
import { Store } from "../src/storage/store.ts";
import { Bitrix24Connector } from "../src/connectors/bitrix24/index.ts";
import { KommoConnector } from "../src/connectors/kommo/index.ts";
import { KOMMO } from "../src/connectors/kommo/platforms.ts";
import { ConnectorRegistry } from "../src/connectors/registry.ts";
import { queueFullSync, queueInitialSync, Worker } from "../src/sync/worker.ts";

const HOUR = 60 * 60_000;

function setup(provider: "bitrix24" | "kommo") {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", kommoClientId: "id", kommoClientSecret: "secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  const tenantId = store.createTenant();
  store.saveConnection({ id: "connection", tenant_id: tenantId, provider, account_id: "member",
    account: provider === "kommo" ? "acme.kommo.com" : "demo.bitrix24.com",
    access_token_enc: encrypt(config.dataKey, "access"), refresh_token_enc: encrypt(config.dataKey, "refresh"),
    expires_at: Date.now() + HOUR, webhook_secret_hash: digest("hook"), webhook_secret_enc: encrypt(config.dataKey, "hook") });
  return { config, store };
}

/** Bitrix24 REST stub: `deals` is the current CRM content; other kinds are empty. */
function bitrixFetch(deals: { ids: number[] }): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = new URL(String(input)).pathname.replace("/rest/", "");
    const params = JSON.parse(String(init?.body)) as { entityTypeId?: number; filter?: Record<string, number> };
    switch (method) {
      case "event.get": return Response.json({ result: [] });
      case "event.bind": return Response.json({ result: true });
      case "crm.category.list": return Response.json({ result: { categories: [] } });
      case "crm.status.list": return Response.json({ result: [] });
      case "crm.activity.list": return Response.json({ result: [] });
      case "crm.item.list": {
        const after = Number(params.filter?.[">id"] ?? 0);
        const ids = params.entityTypeId === 2 ? deals.ids.filter(id => id > after).slice(0, 50) : [];
        return Response.json({ result: { items: ids.map(id => ({ id, opportunity: 10, currencyId: "USD", categoryId: 0, stageId: "NEW" })) } });
      }
      default: throw new Error(`Unexpected Bitrix method ${method}`);
    }
  }) as typeof fetch;
}

function deletedDeals(store: Store): string[] {
  return (store.db.prepare("SELECT external_id FROM records WHERE connection_id='connection' AND kind='deal' AND deleted=1 ORDER BY CAST(external_id AS INTEGER)")
    .all() as Array<{ external_id: string }>).map(row => row.external_id);
}
function liveDeals(store: Store): number {
  return (store.db.prepare("SELECT COUNT(*) AS count FROM records WHERE connection_id='connection' AND kind='deal' AND deleted=0")
    .get() as { count: number }).count;
}
async function drain(worker: Worker): Promise<void> {
  while (await worker.tick()) { /* run every ready job */ }
}
/**
 * Lets the clock move past the last observation. A pass ignores records observed in the very millisecond it started
 * (see Worker.run), which in these fast tests would otherwise make the next pass skip its deletion check.
 */
function nextMillisecond(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 2));
}

test("a scheduled reconciliation tombstones deals missing from a complete listing and keeps the connection live", async () => {
  const { config, store } = setup("bitrix24");
  const crm = { ids: [1, 2, 3, 4, 5] };
  const registry = new ConnectorRegistry([new Bitrix24Connector(config, store, bitrixFetch(crm))]);
  const worker = new Worker(config, store, registry);
  try {
    queueInitialSync(store, registry, "connection");
    await drain(worker);
    assert.equal(store.getConnection("connection")!.status, "live");
    assert.equal(liveDeals(store), 5);

    crm.ids = [1, 2, 4, 5]; // deal 3 deleted in the CRM; its delete event never arrived
    await nextMillisecond();
    worker.reconcile(Date.now() + 25 * HOUR);
    assert.equal(store.getConnection("connection")!.status, "live", "routine reconciliation must not look like a new backfill");
    await drain(worker);
    assert.deepEqual(deletedDeals(store), ["3"]);
    assert.equal(liveDeals(store), 4);
    assert.equal(store.getConnection("connection")!.status, "live");

    crm.ids = [1, 2, 3, 4, 5]; // restored in the CRM: the next pass revives it
    queueFullSync(store, registry, "connection");
    await drain(worker);
    assert.deepEqual(deletedDeals(store), []);
  } finally { worker.stop(); store.close(); }
});

test("a pass that would remove most records deletes nothing, degrades the connection and retries after the cooldown", async () => {
  const { config, store } = setup("bitrix24");
  const crm = { ids: Array.from({ length: 30 }, (_, index) => index + 1) };
  const registry = new ConnectorRegistry([new Bitrix24Connector(config, store, bitrixFetch(crm))]);
  const worker = new Worker(config, store, registry);
  try {
    queueInitialSync(store, registry, "connection");
    await drain(worker);
    assert.equal(liveDeals(store), 30);

    crm.ids = []; // e.g. the app lost access to deals: the listing is empty, not the CRM
    await nextMillisecond();
    assert.ok(queueFullSync(store, registry, "connection"));
    await drain(worker);
    assert.equal(liveDeals(store), 30, "nothing is tombstoned on a suspicious result");
    const degraded = store.getConnection("connection")!;
    assert.equal(degraded.status, "degraded");
    assert.match(degraded.last_error ?? "", /30 of 30 records missing/);

    // Degraded connections recover on their own, but not in a tight loop.
    const queued = () => (store.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='queued'").get() as { count: number }).count;
    worker.reconcile(Date.now() + 10 * 60_000);
    assert.equal(queued(), 0, "a recent attempt is not repeated before the cooldown");
    crm.ids = Array.from({ length: 30 }, (_, index) => index + 1); // access restored
    worker.reconcile(Date.now() + 2 * HOUR);
    assert.ok(queued() > 0);
    assert.equal(store.getConnection("connection")!.status, "backfilling");
    await drain(worker);
    assert.equal(store.getConnection("connection")!.status, "live");
    assert.equal(liveDeals(store), 30);
  } finally { worker.stop(); store.close(); }
});

test("Kommo verifies unseen records one by one: gone ones are tombstoned, rows skipped by page shifts are kept", async () => {
  const { config, store } = setup("kommo");
  const crm = { listed: [1, 2, 3], existing: new Set([1, 2, 3]) };
  const lead = (id: number) => ({ id, price: 100, status_id: 11, pipeline_id: 1, responsible_user_id: 9, updated_at: 1_700_000_000 });
  const fetched: string[] = [];
  const kommoFetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v4/leads") {
      const rows = crm.listed.map(lead);
      return rows.length ? Response.json({ _links: {}, _embedded: { leads: rows } }) : new Response(null, { status: 204 });
    }
    const single = /^\/api\/v4\/leads\/(\d+)$/.exec(url.pathname);
    if (single) {
      fetched.push(single[1]);
      return crm.existing.has(Number(single[1])) ? Response.json(lead(Number(single[1]))) : new Response(null, { status: 404 });
    }
    throw new Error(`Unexpected Kommo path ${url.pathname}`);
  }) as typeof fetch;
  const registry = new ConnectorRegistry([new KommoConnector(KOMMO, { clientId: "id", clientSecret: "secret" }, config, store, kommoFetch)]);
  const worker = new Worker(config, store, registry);
  try {
    store.enqueue("connection", "sync", "deal");
    await drain(worker);
    assert.equal(liveDeals(store), 3);

    crm.existing.delete(2);  // deleted in the CRM
    crm.listed = [1];        // lead 3 still exists but the paged listing skipped it
    await nextMillisecond();
    store.enqueue("connection", "sync", "deal");
    await drain(worker);
    assert.deepEqual(fetched.sort(), ["2", "3"], "only unseen records are refetched");
    assert.deepEqual(deletedDeals(store), ["2"]);
    assert.equal(liveDeals(store), 2);
  } finally { worker.stop(); store.close(); }
});

test("a change event's refetch that finds nothing does not tombstone (only verified deletions do)", async () => {
  const { config, store } = setup("kommo");
  const kommoFetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v4/leads") return Response.json({ _links: {}, _embedded: { leads: [{ id: 7, price: 1, status_id: 11, pipeline_id: 1 }] } });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const registry = new ConnectorRegistry([new KommoConnector(KOMMO, { clientId: "id", clientSecret: "secret" }, config, store, kommoFetch)]);
  const worker = new Worker(config, store, registry);
  try {
    store.enqueue("connection", "sync", "deal");
    await drain(worker);
    store.enqueue("connection", "fetch", "deal", null, "7", "upsert");
    await drain(worker);
    assert.equal(liveDeals(store), 1);
  } finally { worker.stop(); store.close(); }
});

test("a continuation page queued without a pass start (older version) skips the deletion check", async () => {
  const { config, store } = setup("bitrix24");
  const crm = { ids: Array.from({ length: 60 }, (_, index) => index + 1) };
  const registry = new ConnectorRegistry([new Bitrix24Connector(config, store, bitrixFetch(crm))]);
  const worker = new Worker(config, store, registry);
  try {
    store.enqueue("connection", "sync", "deal");
    await drain(worker);
    assert.equal(liveDeals(store), 60);
    crm.ids = crm.ids.filter(id => id !== 55);
    await nextMillisecond();
    store.enqueue("connection", "sync", "deal", "50"); // no pass_started_at: cannot tell what this pass has seen
    await drain(worker);
    assert.deepEqual(deletedDeals(store), []);
  } finally { worker.stop(); store.close(); }
});

test("pruning removes old finished jobs, webhook digests, OAuth states and expired sessions but keeps recent ones", () => {
  const { store } = setup("bitrix24");
  try {
    const now = Date.now();
    const day = 24 * HOUR;
    const oldJob = store.enqueue("connection", "sync", "deal");
    const recentJob = store.enqueue("connection", "sync", "contact");
    const pendingJob = store.enqueue("connection", "sync", "activity");
    store.completeJob(oldJob); store.completeJob(recentJob);
    store.db.prepare("UPDATE jobs SET finished_at=? WHERE id=?").run(now - 31 * day, oldJob);
    store.db.prepare("INSERT INTO ingest_events VALUES ('connection','old',?),('connection','new',?)").run(now - 8 * day, now);
    const tenantId = store.getConnection("connection")!.tenant_id;
    store.saveState("old-state", tenantId, "bitrix24", "demo.bitrix24.com", { actor_id: null, actor_label: "test" });
    store.db.prepare("UPDATE oauth_states SET created_at=? WHERE state_hash='old-state'").run(now - HOUR);
    store.saveState("new-state", tenantId, "bitrix24", "demo.bitrix24.com", { actor_id: null, actor_label: "test" });
    const userId = store.access.createUser("ops@example.com", "Ops", "hash");
    store.access.createSession("expired", userId, 1000);
    store.db.prepare("UPDATE sessions SET expires_at=? WHERE token_hash='expired'").run(now - 1);
    store.access.createSession("active", userId, HOUR);

    store.prune(now);
    const ids = (sql: string) => (store.db.prepare(sql).all() as Array<{ id: string }>).map(row => row.id).sort();
    assert.deepEqual(ids("SELECT id FROM jobs"), [recentJob, pendingJob].sort());
    assert.deepEqual(ids("SELECT digest AS id FROM ingest_events"), ["new"]);
    assert.deepEqual(ids("SELECT state_hash AS id FROM oauth_states"), ["new-state"]);
    assert.deepEqual(ids("SELECT token_hash AS id FROM sessions"), ["active"]);
  } finally { store.close(); }
});
