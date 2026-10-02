import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("Bitrix OAuth, two-axis sync, mapping, event updates, and tenant isolation", async () => {
  const config: Config = {
    port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "test-client", bitrixClientSecret: "test-secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
  };
  const store = new Store(":memory:");
  let dealAmount = 150;
  let handler = "";
  const crmFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.bitrix.info") return Response.json({
      access_token: "access-plain", refresh_token: "refresh-plain", expires_in: 3600,
      client_endpoint: "https://demo.bitrix24.com/rest/", member_id: "member-1", scope: "crm,placement",
    });
    const method = url.pathname.replace("/rest/", "");
    const params = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === "event.get") return Response.json({ result: [] });
    if (method === "event.bind") { handler = String(params.handler); return Response.json({ result: true }); }
    if (method === "crm.category.list") return Response.json({ result: { categories: [
      { id: 0, name: "Sales", entityTypeId: 2 },
    ] } });
    if (method === "crm.status.list") return Response.json({ result: [
      { ID: 1, ENTITY_ID: "DEAL_STAGE", STATUS_ID: "NEW", NAME: "New" },
    ] });
    if (method === "crm.item.list") {
      const typeId = Number(params.entityTypeId);
      const after = Number((params.filter as Record<string, unknown>)[">id"]);
      const items = typeId === 2 ? [{ id: 10, title: "Deal", opportunity: dealAmount,
        currencyId: "USD", stageId: "NEW", categoryId: 0, assignedById: 7 }] :
        typeId === 3 ? [{ id: 20, name: "Private person" }] :
        typeId === 128 ? [{ id: 30, title: "Purchase", purchaseValue: 80,
          purchaseCurrency: "USD", stageId: "PENDING", categoryId: 0 }] : [];
      return Response.json({ result: { items: items.filter(item => item.id > after) } });
    }
    if (method === "crm.activity.list") return Response.json({ result: [
      { ID: 40, TYPE_ID: 1, COMPLETED: "Y", RESPONSIBLE_ID: 7,
        OWNER_TYPE_ID: 2, OWNER_ID: 10 },
      { ID: 41, TYPE_ID: 6, PROVIDER_TYPE_ID: "TRAVEL", COMPLETED: "Y",
        RESPONSIBLE_ID: 7, OWNER_TYPE_ID: 2, OWNER_ID: 10 },
    ].filter(item => item.ID > Number((params.filter as Record<string, unknown>)[">ID"])) });
    if (method === "crm.item.get") return Response.json({ result: { item: {
      id: 10, opportunity: dealAmount, currencyId: "USD", stageId: "NEW",
      categoryId: 0, assignedById: 7,
    } } });
    throw new Error(`Unexpected Bitrix method ${method}`);
  }) as typeof fetch;
  const { server, worker } = makeApp(config, store, crmFetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const api = async (path: string, method = "GET", body?: unknown, admin = true) => {
    const response = await fetch(base + path, { method,
      headers: { ...(admin ? { "x-admin-key": config.adminApiKey } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as Record<string, any> };
  };
  try {
    const tenant = (await api("/v1/tenants", "POST")).data.tenantId as string;
    const other = (await api("/v1/tenants", "POST")).data.tenantId as string;
    const started = await api(`/v1/tenants/${tenant}/connect/bitrix24`, "POST", { account: "demo.bitrix24.com" });
    assert.equal(started.status, 200);
    const state = new URL(started.data.authorizeUrl).searchParams.get("state");
    const callback = await api(`/oauth/bitrix24/callback?code=one-use-code&state=${state}&domain=demo.bitrix24.com&member_id=member-1`, "GET", undefined, false);
    assert.equal(callback.status, 201);
    const connection = callback.data.connectionId as string;
    assert.notEqual(store.getConnection(connection)?.access_token_enc, "access-plain");
    while (await worker.tick()) { /* drain durable jobs */ }
    assert.ok(handler.includes("/webhooks/bitrix24/"));
    let dashboard = await api(`/v1/tenants/${tenant}/connections/${connection}/dashboard`);
    assert.equal(dashboard.data.connection.status, "live", JSON.stringify({
      jobs: store.db.prepare("SELECT type,kind,status,attempts FROM jobs").all(),
      checkpoints: store.db.prepare("SELECT * FROM checkpoints").all(),
    }));
    assert.equal(dashboard.data.analytics.commercial[0].amount, 150);
    assert.equal(dashboard.data.analytics.work.length, 2);
    assert.equal(dashboard.data.analytics.linkedWorkItems, 2);
    assert.equal(dashboard.data.analytics.byOwner.find((row: any) => row.ownerId === "7").work.length, 2);
    assert.equal((await api(`/v1/tenants/${other}/connections/${connection}/dashboard`)).status, 404);

    const mappedPurchase = await api(`/v1/tenants/${tenant}/connections/${connection}/commercial-sources`, "POST", {
      sourceKind: "smart:128", direction: "purchase", amountField: "purchaseValue", currencyField: "purchaseCurrency",
    });
    assert.equal(mappedPurchase.status, 202);
    const mappedVisit = await api(`/v1/tenants/${tenant}/connections/${connection}/action-types`, "POST", {
      providerTypeId: "TRAVEL", actionType: "visit",
    });
    assert.equal(mappedVisit.status, 202);
    while (await worker.tick()) { /* drain new syncs */ }
    dashboard = await api(`/v1/tenants/${tenant}/connections/${connection}/dashboard`);
    assert.ok(dashboard.data.analytics.commercial.some((row: any) => row.direction === "purchase" && row.amount === 80));
    assert.ok(dashboard.data.analytics.work.some((row: any) => row.action_type === "visit"));

    dealAmount = 200;
    const hookBody = new URLSearchParams({ event: "ONCRMDEALUPDATE",
      "auth[member_id]": "member-1", "data[FIELDS][ID]": "10", ts: "123" });
    const hook = await fetch(handler.replace("http://localhost:3000", base), {
      method: "POST", body: hookBody });
    assert.equal(hook.status, 202);
    while (await worker.tick()) { /* fetch changed record */ }
    dashboard = await api(`/v1/tenants/${tenant}/connections/${connection}/dashboard`);
    assert.ok(dashboard.data.analytics.commercial.some((row: any) => row.direction === "sale" && row.amount === 200));
    const spoofed = await fetch(handler.replace("http://localhost:3000", base), {
      method: "POST", body: new URLSearchParams({ event: "ONCRMDEALUPDATE",
        "auth[member_id]": "wrong", "data[FIELDS][ID]": "10" }) });
    assert.equal(spoofed.status, 400);
    const deleted = await fetch(handler.replace("http://localhost:3000", base), {
      method: "POST", body: new URLSearchParams({ event: "ONCRMDEALDELETE",
        "auth[member_id]": "member-1", "data[FIELDS][ID]": "10", ts: "124" }) });
    assert.equal(deleted.status, 202);
    while (await worker.tick()) { /* tombstone confirmed deletion */ }
    dashboard = await api(`/v1/tenants/${tenant}/connections/${connection}/dashboard`);
    assert.ok(!dashboard.data.analytics.commercial.some((row: any) => row.direction === "sale"));
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
