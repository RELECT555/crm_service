import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Config } from "../src/config.ts";
import { encrypt, digest } from "../src/crypto.ts";
import { Store } from "../src/store.ts";
import { BitrixClient } from "../src/bitrix.ts";
import { Worker } from "../src/worker.ts";

test("a claimed backfill page is recovered and keyset pagination reaches the final page", async () => {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", adminApiKey: "a".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  const tenantId = store.createTenant();
  store.saveConnection({ id: "connection", tenant_id: tenantId, member_id: "member",
    portal: "demo.bitrix24.com", access_token_enc: encrypt(config.dataKey, "access"),
    refresh_token_enc: encrypt(config.dataKey, "refresh"), expires_at: Date.now() + 3600_000,
    webhook_secret_hash: digest("hook"), webhook_secret_enc: encrypt(config.dataKey, "hook") });
  const requestedAfter: number[] = [];
  const crmFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const params = JSON.parse(String(init?.body)) as { filter: { ">id": number } };
    const after = Number(params.filter[">id"]);
    requestedAfter.push(after);
    const all = Array.from({ length: 51 }, (_, index) => ({ id: index + 1,
      opportunity: 1, currencyId: "USD", categoryId: 0, stageId: "NEW" }));
    return Response.json({ result: { items: all.filter(item => item.id > after).slice(0, 50) } });
  }) as typeof fetch;
  const client = new BitrixClient(config, store, crmFetch);
  const worker = new Worker(config, store, client);
  try {
    store.enqueue("connection", "sync", "deal");
    assert.ok(store.claimJob()); // simulate a process stopping after claiming but before committing
    store.recoverJobs();
    while (await worker.tick()) { /* drain both pages */ }
    assert.deepEqual(requestedAfter, [0, 50]);
    const checkpoint = store.db.prepare("SELECT cursor,completed_at FROM checkpoints WHERE connection_id=? AND kind='deal'")
      .get("connection") as { cursor: string | null; completed_at: number | null };
    assert.equal(checkpoint.cursor, null);
    assert.ok(checkpoint.completed_at);
    const count = store.db.prepare("SELECT COUNT(*) AS count FROM records WHERE connection_id=? AND kind='deal'")
      .get("connection") as { count: number };
    assert.equal(count.count, 51);
  } finally { worker.stop(); store.close(); }
});

test("an expired Bitrix token rotates once and is reused across calls", async () => {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", adminApiKey: "a".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  const tenantId = store.createTenant();
  store.saveConnection({ id: "connection", tenant_id: tenantId, member_id: "member",
    portal: "demo.bitrix24.com", access_token_enc: encrypt(config.dataKey, "expired"),
    refresh_token_enc: encrypt(config.dataKey, "old-refresh"), expires_at: Date.now() - 1,
    webhook_secret_hash: digest("hook"), webhook_secret_enc: encrypt(config.dataKey, "hook") });
  let renewals = 0;
  const sentTokens: string[] = [];
  const crmFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.bitrix.info") {
      renewals++;
      assert.equal(url.searchParams.get("refresh_token"), "old-refresh");
      return Response.json({ access_token: "new-access", refresh_token: "new-refresh",
        expires_in: 3600, client_endpoint: "https://demo.bitrix24.com/rest/", member_id: "member" });
    }
    sentTokens.push((JSON.parse(String(init?.body)) as { auth: string }).auth);
    return Response.json({ result: true });
  }) as typeof fetch;
  try {
    const connection = store.getConnection("connection")!;
    const client = new BitrixClient(config, store, crmFetch);
    await client.call(connection, "event.bind", { event: "ONCRMDEALADD", handler: "https://example.com" });
    await client.call(connection, "event.bind", { event: "ONCRMDEALUPDATE", handler: "https://example.com" });
    assert.equal(renewals, 1);
    assert.deepEqual(sentTokens, ["new-access", "new-access"]);
  } finally { store.close(); }
});
