import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("admin API: tenants, provider catalog, connection detail, mapping removal, re-authorization, static UI", async () => {
  const webDist = mkdtempSync(join(tmpdir(), "crm-web-"));
  mkdirSync(join(webDist, "assets"));
  writeFileSync(join(webDist, "index.html"), "<!doctype html><title>admin</title>");
  writeFileSync(join(webDist, "assets", "app.js"), "console.log(1)");
  const config: Config = {
    port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000", adminOrigin: "http://localhost:5173", webDist,
    bitrixClientId: "test-client", bitrixClientSecret: "test-secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
  };
  const store = new Store(":memory:");
  let accessToken = "access-1";
  const crmFetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.bitrix.info") return Response.json({
      access_token: accessToken, refresh_token: "refresh", expires_in: 3600,
      client_endpoint: "https://demo.bitrix24.com/rest/", member_id: "member-1", scope: "crm",
    });
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  const { server } = makeApp(config, store, crmFetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method, redirect: "manual",
      headers: { "x-admin-key": config.adminApiKey, ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: (text.startsWith("{") ? JSON.parse(text) : text) as any };
  };
  const authorize = async (tenantId: string, headers: Record<string, string> = {}) => {
    const started = await api(`/v1/tenants/${tenantId}/connect/bitrix24`, "POST", { account: "demo.bitrix24.com" });
    const state = new URL(started.data.authorizeUrl).searchParams.get("state");
    return fetch(`${base}/oauth/bitrix24/callback?code=c&state=${state}&domain=demo.bitrix24.com`,
      { redirect: "manual", headers });
  };
  try {
    const providers = await api("/v1/providers");
    assert.equal(providers.status, 200);
    const bitrix = providers.data.providers.find((row: any) => row.id === "bitrix24");
    assert.equal(bitrix.status, "available");
    assert.equal(bitrix.callbackUrl, "http://localhost:3000/oauth/bitrix24/callback");
    assert.ok(providers.data.providers.some((row: any) => row.status === "planned" && row.callbackUrl === null));
    assert.equal((await api("/v1/providers", "GET", undefined, { "x-admin-key": "wrong" })).status, 401);

    assert.equal((await api("/v1/tenants", "POST", { name: "  " })).status, 400);
    const tenantId = (await api("/v1/tenants", "POST", { name: "Acme" })).data.tenantId as string;
    const unnamed = (await api("/v1/tenants", "POST")).data.tenantId as string;
    const renamed = await api(`/v1/tenants/${tenantId}`, "PATCH", { name: "Acme Group" });
    assert.equal(renamed.data.tenant.name, "Acme Group");
    const listed = await api("/v1/tenants");
    assert.deepEqual(listed.data.tenants.map((row: any) => row.name).sort(), ["Acme Group", null].sort());
    assert.ok(listed.data.tenants.some((row: any) => row.id === unnamed));

    const redirect = await authorize(tenantId, { accept: "text/html" });
    assert.equal(redirect.status, 303);
    const location = redirect.headers.get("location")!;
    assert.match(location, new RegExp(`^http://localhost:5173/#/tenants/${tenantId}/connections/[0-9a-f-]{36}$`));
    const connectionId = location.split("/").at(-1)!;

    const tenantDetail = await api(`/v1/tenants/${tenantId}`);
    assert.equal(tenantDetail.data.connections.length, 1);
    assert.equal(tenantDetail.data.connections[0].provider, "bitrix24");
    assert.ok(tenantDetail.data.connections[0].created_at > 0);

    store.setConnectionStatus(connectionId, "reauthorization_required", "Bitrix OAuth failed: invalid_grant");
    accessToken = "access-2";
    const repaired = await authorize(tenantId);
    assert.equal(repaired.status, 201);
    const repairedBody = await repaired.json() as Record<string, unknown>;
    assert.equal(repairedBody.connectionId, connectionId);
    assert.equal(repairedBody.reauthorized, true);
    assert.equal((await api(`/v1/tenants/${tenantId}`)).data.connections.length, 1);

    const path = `/v1/tenants/${tenantId}/connections/${connectionId}`;
    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "deal", categoryId: 3, direction: "purchase" })).status, 202);
    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "smart:12", direction: "sale" })).status, 400,
      "smart-process IDs below 128 are not custom processes");
    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "lead", direction: "sale" })).status, 400,
      "only kinds the connector declares are mappable");
    assert.equal((await api(`${path}/action-types`, "POST", { providerTypeId: "TRAVEL", actionType: "visit" })).status, 202);
    let detail = await api(path);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.connection.status, "backfilling");
    assert.equal(detail.data.connection.lastError, null);
    assert.equal(detail.data.connection.account, "demo.bitrix24.com");
    assert.equal(JSON.stringify(detail.data).includes("access-2"), false);
    assert.equal(JSON.stringify(detail.data).includes("_enc"), false);
    assert.deepEqual(detail.data.commercialSources, [{ source_kind: "deal", category_id: "3", direction: "purchase",
      amount_field: "opportunity", currency_field: "currencyId" }]);
    assert.equal(detail.data.mappingOptions.customSource.prefix, "smart:");
    assert.equal(detail.data.mappingOptions.categoryKind, "pipeline");
    assert.deepEqual(detail.data.pipelines, []);
    assert.deepEqual(detail.data.actionTypes, [{ provider_type_id: "TRAVEL", action_type: "visit" }]);
    assert.ok(detail.data.sync.queue.queued > 0);
    assert.ok(detail.data.sync.syncingKinds.includes("deal"));

    assert.equal((await api(`${path}/commercial-sources/deal/3`, "DELETE")).status, 202);
    assert.equal((await api(`${path}/commercial-sources/deal/3`, "DELETE")).status, 404);
    assert.equal((await api(`${path}/action-types/TRAVEL`, "DELETE")).status, 202);
    detail = await api(path);
    assert.deepEqual(detail.data.commercialSources, []);
    assert.deepEqual(detail.data.actionTypes, []);
    assert.equal((await api(`/v1/tenants/${unnamed}/connections/${connectionId}`)).status, 404);

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-security-policy")!, /default-src 'self'/);
    assert.equal(await index.text(), "<!doctype html><title>admin</title>");
    assert.equal((await fetch(`${base}/assets/app.js`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal((await fetch(`${base}/assets/%2e%2e%2f%2e%2e%2fpackage.json`)).status, 401);
    assert.equal((await fetch(`${base}/missing.js`)).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test("every catalog provider is fully described and has a connector playbook", async () => {
  const { existsSync } = await import("node:fs");
  const { ConnectorRegistry } = await import("../src/connectors/registry.ts");
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", adminApiKey: "a".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  try {
    const catalog = ConnectorRegistry.create(config, store).catalog();
    assert.deepEqual(catalog.filter(info => info.status === "not_configured").map(info => info.id).sort(), ["amocrm", "kommo"]);
    assert.ok(catalog.filter(info => info.status === "not_configured").every(info => info.requiredEnv?.length === 2));
    assert.equal(new Set(catalog.map(info => info.id)).size, catalog.length);
    for (const info of catalog) {
      assert.ok(info.setupSteps.length > 0 && info.commercialData.length > 0 && info.workData.length > 0, info.id);
      assert.ok(info.limits && info.changeCapture && info.docsUrl.startsWith("https://"), info.id);
      assert.ok(existsSync(new URL(`../../../docs/connectors/${info.id}.md`, import.meta.url)), `missing playbook for ${info.id}`);
    }
  } finally { store.close(); }
});
