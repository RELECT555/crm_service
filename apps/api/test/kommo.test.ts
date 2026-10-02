import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { decrypt } from "../src/security/crypto.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("Kommo: OAuth with account check, paged backfill, polling fallback, token rotation, mappings, webhooks", async () => {
  const config: Config = {
    port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    kommoClientId: "kommo-client", kommoClientSecret: "kommo-secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
  };
  const store = new Store(":memory:");
  const leads = Array.from({ length: 251 }, (_, index) => ({ id: index + 1, name: `Lead ${index + 1}`, price: 100,
    status_id: 11, pipeline_id: index === 250 ? 2 : 1, responsible_user_id: 9, updated_at: 1_700_000_000 }));
  let validAccess = "access-1";
  let refreshes = 0;
  let webhookDestination = "";
  const tokenBodies: Array<Record<string, unknown>> = [];
  const kommoFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "acme.kommo.com") throw new Error(`Unexpected host ${url.hostname}`);
    if (url.pathname === "/oauth2/access_token") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      tokenBodies.push(body);
      if (body.grant_type === "refresh_token") {
        refreshes++;
        assert.equal(body.refresh_token, "refresh-1");
        validAccess = "access-2";
        return Response.json({ token_type: "Bearer", expires_in: 86400, access_token: "access-2", refresh_token: "refresh-2" });
      }
      return Response.json({ token_type: "Bearer", expires_in: 86400, access_token: "access-1", refresh_token: "refresh-1" });
    }
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${validAccess}`) return new Response(null, { status: 401 });
    const page = Number(url.searchParams.get("page") ?? 1);
    switch (url.pathname) {
      case "/api/v4/account": return Response.json({ id: 777, subdomain: "acme", currency: "USD" });
      case "/api/v4/leads/pipelines": return Response.json({ _embedded: { pipelines: [
        { id: 1, name: "Продажи", _embedded: { statuses: [{ id: 11, name: "Новая", pipeline_id: 1 }, { id: 142, name: "Успешно", pipeline_id: 1 }] } },
        { id: 2, name: "Закупки", _embedded: { statuses: [{ id: 21, name: "Заявка", pipeline_id: 2 }] } },
      ] } });
      case "/api/v4/leads": {
        assert.equal(url.searchParams.get("order[id]"), "asc");
        const rows = leads.slice((page - 1) * 250, page * 250);
        return rows.length ? Response.json({ _links: page === 1 ? { next: { href: "next" } } : {}, _embedded: { leads: rows } })
          : new Response(null, { status: 204 });
      }
      case "/api/v4/contacts": return new Response(null, { status: 204 });
      case "/api/v4/tasks": return Response.json({ _embedded: { tasks: [
        { id: 501, task_type_id: 2, is_completed: true, responsible_user_id: 9, entity_type: "leads", entity_id: 1 },
        { id: 502, task_type_id: 7, is_completed: false, responsible_user_id: 9, entity_type: "leads", entity_id: 2 },
      ] } });
      case "/api/v4/webhooks":
        if (init?.method === "POST") {
          webhookDestination = String((JSON.parse(String(init.body)) as { destination: string }).destination);
          return Response.json({ title: "Forbidden" }, { status: 403 });
        }
        return new Response(null, { status: 204 });
      case "/api/v4/leads/5": return Response.json({ ...leads[4], price: 999 });
      default: throw new Error(`Unexpected Kommo request ${url.pathname}`);
    }
  }) as typeof fetch;

  const { server, worker } = makeApp(config, store, kommoFetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, headers: { "x-admin-key": config.adminApiKey,
      ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text) : {}) as Record<string, any> };
  };
  const drain = async () => { while (await worker.tick()) { /* run queued jobs */ } };
  try {
    const catalog = (await api("/v1/providers")).data.providers as Array<{ id: string; status: string; callbackUrl: string | null }>;
    assert.equal(catalog.find(info => info.id === "kommo")?.status, "available");
    assert.equal(catalog.find(info => info.id === "amocrm")?.status, "not_configured");
    assert.equal(catalog.find(info => info.id === "amocrm")?.callbackUrl, "http://localhost:3000/oauth/amocrm/callback",
      "the redirect URI is shown before the app is configured, so the operator can register it");
    assert.equal(catalog.find(info => info.id === "hubspot")?.callbackUrl, null);
    assert.equal(catalog.find(info => info.id === "bitrix24")?.status, "not_configured");

    const tenantId = (await api("/v1/tenants", "POST", { name: "Acme" })).data.tenantId as string;
    assert.equal((await api(`/v1/tenants/${tenantId}/connect/amocrm`, "POST", { account: "acme" })).status, 404);
    assert.equal((await api(`/v1/tenants/${tenantId}/connect/kommo`, "POST", { account: "acme.bitrix24.ru" })).status, 400);

    const start = async () => {
      const started = await api(`/v1/tenants/${tenantId}/connect/kommo`, "POST", { account: "acme" });
      assert.equal(started.status, 200);
      assert.equal(started.data.account, "acme.kommo.com");
      const consent = new URL(started.data.authorizeUrl);
      assert.equal(consent.origin, "https://www.kommo.com");
      assert.equal(consent.searchParams.get("client_id"), "kommo-client");
      return consent.searchParams.get("state")!;
    };
    const spoofed = await fetch(`${base}/oauth/kommo/callback?code=c&state=${await start()}&referer=other.kommo.com`);
    assert.equal(spoofed.status, 400, "a code for another account is rejected");

    const callback = await fetch(`${base}/oauth/kommo/callback?code=c&state=${await start()}&referer=acme.kommo.com`);
    assert.equal(callback.status, 201);
    const connectionId = (await callback.json() as { connectionId: string }).connectionId;
    assert.equal(tokenBodies[0].redirect_uri, "http://localhost:3000/oauth/kommo/callback");
    assert.equal(store.getConnection(connectionId)?.account_id, "777");

    validAccess = "rotated-on-server"; // the stored access token now fails, forcing one refresh
    await drain();
    assert.equal(refreshes, 1);
    assert.equal(decrypt(config.dataKey, store.getConnection(connectionId)!.refresh_token_enc), "refresh-2");
    assert.equal(webhookDestination.startsWith("http://localhost:3000/webhooks/kommo/"), true);

    const path = `/v1/tenants/${tenantId}/connections/${connectionId}`;
    let detail = await api(path);
    assert.equal(detail.data.connection.status, "live");
    assert.equal(detail.data.connection.eventsMode, "polling", "plan without webhook API falls back to reconciliation");
    assert.deepEqual(detail.data.pipelines, [{ id: "2", label: "Закупки" }, { id: "1", label: "Продажи" }]);
    assert.equal(detail.data.mappingOptions.fieldMapping, null);
    const counts = Object.fromEntries((detail.data.sync.records as Array<{ kind: string; count: number }>).map(row => [row.kind, row.count]));
    assert.deepEqual(counts, { deal: 251, task: 2, pipeline: 2, stage: 3 });

    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "deal", categoryId: 2, direction: "purchase",
      amountField: "price" })).status, 400, "Kommo amount fields are fixed");
    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "deal", categoryId: 2, direction: "purchase" })).status, 202);
    assert.equal((await api(`${path}/action-types`, "POST", { providerTypeId: "7", actionType: "visit" })).status, 202);
    await drain();
    let dashboard = await api(`${path}/dashboard`);
    const commercial = dashboard.data.analytics.commercial as Array<{ direction: string; currency: string; count: number; amount: number }>;
    assert.ok(commercial.some(row => row.direction === "purchase" && row.currency === "USD" && row.count === 1));
    assert.ok(commercial.some(row => row.direction === "sale" && row.count === 250 && row.amount === 25_000));
    const work = dashboard.data.analytics.work as Array<{ action_type: string }>;
    assert.deepEqual(work.map(row => row.action_type).sort(), ["meeting", "visit"]);

    const hook = (body: Record<string, string>) => fetch(webhookDestination.replace("http://localhost:3000", base),
      { method: "POST", body: new URLSearchParams(body) });
    assert.equal((await hook({ "leads[update][0][id]": "5", "account[id]": "999" })).status, 400, "foreign account rejected");
    assert.equal((await hook({ "leads[update][0][id]": "5", "leads[status][0][id]": "5", "account[id]": "777" })).status, 202);
    assert.equal((await hook({ "leads[delete][0][id]": "6", "account[id]": "777" })).status, 202);
    await drain();
    dashboard = await api(`${path}/dashboard`);
    const sales = (dashboard.data.analytics.commercial as Array<{ direction: string; count: number; amount: number }>)
      .find(row => row.direction === "sale")!;
    assert.equal(sales.count, 249, "deleted lead is tombstoned");
    assert.equal(sales.amount, 25_000 - 100 - 100 + 999, "updated lead is refetched once");
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test("legacy Bitrix24 commercial_sources rows migrate to provider-neutral mappings", () => {
  const path = join(mkdtempSync(join(tmpdir(), "crm-migrate-")), "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE commercial_sources (connection_id TEXT NOT NULL, entity_type_id INTEGER NOT NULL,
    category_id TEXT NOT NULL, direction TEXT NOT NULL, amount_field TEXT NOT NULL, currency_field TEXT NOT NULL,
    PRIMARY KEY(connection_id, entity_type_id, category_id));
    INSERT INTO commercial_sources VALUES ('c1', 2, '3', 'purchase', 'opportunity', 'currencyId'),
      ('c1', 180, '*', 'sale', 'ufAmount', 'ufCurrency');`);
  legacy.close();
  const store = new Store(path);
  try {
    assert.deepEqual(store.listCommercialMappings("c1"), [
      { source_kind: "deal", category_id: "3", direction: "purchase", amount_field: "opportunity", currency_field: "currencyId" },
      { source_kind: "smart:180", category_id: "*", direction: "sale", amount_field: "ufAmount", currency_field: "ufCurrency" },
    ]);
    assert.equal(store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='commercial_sources'").get(), undefined);
  } finally { store.close(); }
});
