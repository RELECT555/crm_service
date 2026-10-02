import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { type AggregateRow, computeAnalytics, median } from "../src/domain/analytics.ts";
import type { Config } from "../src/config.ts";
import { encrypt, digest } from "../src/security/crypto.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

const row = (owner: string | null, axis: "commercial" | "work", extra: Partial<AggregateRow>): AggregateRow =>
  ({ connection_id: "c", owner_id: owner, axis, direction: null, currency: null, action_type: null, status: null,
    count: 1, amount: null, linked: 0, ...extra });

test("team metrics, currency handling and weak-spot signals", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const rows: AggregateRow[] = [
    // Anna: strong on both axes.
    row("1", "commercial", { direction: "sale", currency: "RUB", count: 10, amount: 1_000_000 }),
    row("1", "work", { action_type: "meeting", status: "completed", count: 12, linked: 10 }),
    row("1", "work", { action_type: "call", status: "completed", count: 20 }),
    // Boris: busy, few deals, no meetings.
    row("2", "commercial", { direction: "sale", currency: "RUB", count: 1, amount: 50_000 }),
    row("2", "commercial", { direction: "sale", currency: "USD", count: 1, amount: 3_000 }),
    row("2", "work", { action_type: "call", status: "open", count: 40 }),
    // Vera: deals with almost no recorded work.
    row("3", "commercial", { direction: "sale", currency: "RUB", count: 8, amount: 400_000 }),
    row("3", "work", { action_type: "meeting", status: "completed", count: 2 }),
    // Gleb: quiet.
    row("4", "commercial", { direction: "purchase", currency: "RUB", count: 3, amount: 90_000 }),
    row("4", "work", { action_type: "task", status: "completed", count: 1 }),
    row(null, "work", { action_type: "call", count: 5 }),
    row("1", "commercial", { direction: "unclassified", count: 4 }),
  ];
  const result = computeAnalytics(rows, [{ connection_id: "c", external_id: "1", label: "Анна" }], null, 1000);
  assert.equal(result.currency, "RUB", "most frequent sale currency when the workspace has none");
  assert.equal(result.team.deals, 20, "deal counts include every currency");
  assert.equal(result.team.dealAmount, 1_450_000, "USD deals are not summed into RUB");
  assert.deepEqual(result.coverage.otherCurrencies, ["USD"]);
  assert.equal(result.coverage.otherCurrencyDeals, 1);
  assert.equal(result.team.unclassified, 4);
  assert.deepEqual(result.coverage.unassigned, { deals: 0, work: 5 });
  assert.equal(result.team.purchases, 3);
  assert.equal(result.team.work, 75);
  assert.equal(result.workByType[0].type, "call");
  assert.equal(result.workByType[0].count, 65, "type totals include unassigned work");

  const byName = Object.fromEntries(result.managers.map(m => [m.name, m]));
  assert.equal(result.managers[0].name, "Анна", "sorted by deals");
  assert.equal(byName["Анна"].workPerDeal, 3.2);
  assert.equal(byName["Анна"].meetings, 12);
  assert.deepEqual(byName["Анна"].signals, []);
  const codes = (name: string) => byName[name].signals.map(signal => signal.code).sort();
  assert.deepEqual(codes("Сотрудник 2"), ["activity_without_deals", "low_completion", "no_meetings"]);
  assert.deepEqual(codes("Сотрудник 3"), ["deals_without_activity", "low_activity"]);
  assert.deepEqual(codes("Сотрудник 4"), ["low_activity", "no_meetings"], "purchases only, one task, no meetings");
  assert.equal(result.coverage.unnamedManagers, 3);

  const withBase = computeAnalytics(rows, [], "USD");
  assert.equal(withBase.currency, "USD");
  assert.equal(withBase.team.dealAmount, 3_000);

  const small = computeAnalytics(rows.filter(r => r.owner_id === "1" || r.owner_id === "2"), [], null);
  assert.deepEqual(small.managers.flatMap(m => m.signals.map(s => s.code)), ["low_completion"],
    "median-based signals need at least three managers");
});

test("GET /v1/tenants/:id/analytics aggregates every connection of the workspace", async () => {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    adminApiKey: "k".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  const tenantId = store.createTenant("Acme");
  store.updateTenant(tenantId, { currency: "RUB" });
  for (const [id, account] of [["c1", "a.bitrix24.ru"], ["c2", "b.bitrix24.ru"]]) {
    store.saveConnection({ id, tenant_id: tenantId, provider: "bitrix24", account_id: id, account,
      access_token_enc: encrypt(config.dataKey, "x"), refresh_token_enc: encrypt(config.dataKey, "y"), expires_at: 0,
      webhook_secret_hash: digest(id), webhook_secret_enc: encrypt(config.dataKey, id) });
    const connection = store.getConnection(id)!;
    store.upsertRecord(connection, { kind: "deal", externalId: "1", axis: "commercial", direction: "sale", amount: 100,
      currency: "RUB", ownerId: "7", payload: {} }, "p");
    store.upsertRecord(connection, { kind: "activity", externalId: "1", axis: "work", actionType: "call", status: "completed",
      ownerId: "7", targetKind: "deal", targetId: "1", payload: {} }, "p");
  }
  const { server } = makeApp(config, store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/v1/tenants/${tenantId}/analytics`, { headers: { "x-admin-key": config.adminApiKey } });
    const data = await response.json() as Record<string, any>;
    assert.equal(response.status, 200);
    assert.equal(data.metricVersion, 2);
    assert.equal(data.team.managers, 2, "the same owner ID in two connections is two people");
    assert.equal(data.team.dealAmount, 200);
    assert.equal(data.team.linkedRate, 1);
    assert.equal(data.connections.length, 2);

    // Demo preview: same metric code, fictional team, nothing written to the workspace.
    const before = store.analyticsRows(tenantId).length;
    const demoResponse = await fetch(`${base}/v1/tenants/${tenantId}/analytics/demo`, { headers: { "x-admin-key": config.adminApiKey } });
    const demo = await demoResponse.json() as Record<string, any>;
    assert.equal(demoResponse.status, 200);
    assert.equal(demo.demo, true);
    assert.equal(demo.metricVersion, 2);
    assert.equal(demo.currency, "RUB", "the workspace base currency");
    assert.equal(demo.team.managers, 6);
    assert.equal(demo.team.deals, 213);
    assert.deepEqual(demo.connections, []);
    assert.match(demo.coverage.notes[0], /^Демо-данные/);
    const codes = new Set((demo.managers as Array<{ signals: Array<{ code: string }> }>).flatMap(m => m.signals.map(signal => signal.code)));
    for (const code of ["no_meetings", "activity_without_deals", "deals_without_activity", "low_completion"]) {
      assert.ok(codes.has(code), `demo team shows the ${code} signal`);
    }
    assert.equal(store.analyticsRows(tenantId).length, before, "the demo preview writes nothing");
    assert.equal((await fetch(`${base}/v1/tenants/${tenantId}/analytics/demo`)).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
