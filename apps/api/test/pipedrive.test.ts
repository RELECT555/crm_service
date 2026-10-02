import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { decrypt } from "../src/security/crypto.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("Pipedrive: consent-picked company, cursor backfill, api_domain move, webhooks v2, mappings, events", async () => {
  const config: Config = {
    port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    pipedriveClientId: "pd-client", pipedriveClientSecret: "pd-secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
  };
  const store = new Store(":memory:");
  const deals = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, title: `Deal ${index + 1}`, value: 100, currency: "EUR",
    status: "open", pipeline_id: index === 500 ? 2 : 1, stage_id: 11, owner_id: 7, update_time: "2026-10-01T10:00:00Z" }));
  let validAccess = "access-1";
  let tokenCompanyHost = "https://acme.pipedrive.com";
  let refreshes = 0;
  let deals429 = 0;
  let reconciled = false; // second full pass: deal 7 and the only user vanish from the listings
  const tokenRequests: Array<{ auth: string | null; body: URLSearchParams }> = [];
  const webhooks: Array<Record<string, unknown>> = [];
  const pdFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === "https://oauth.pipedrive.com" && url.pathname === "/oauth/token") {
      const body = new URLSearchParams(String(init?.body));
      tokenRequests.push({ auth: new Headers(init?.headers).get("authorization"), body });
      if (body.get("grant_type") === "refresh_token") {
        refreshes++;
        assert.equal(body.get("refresh_token"), "refresh-1");
        validAccess = "access-2";
        // The company's API host moved; the client must follow it.
        return Response.json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3599, api_domain: "https://acme-eu.pipedrive.com" });
      }
      return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3599, token_type: "Bearer", api_domain: tokenCompanyHost });
    }
    if (!["acme.pipedrive.com", "acme-eu.pipedrive.com", "other.pipedrive.com"].includes(url.hostname)) throw new Error(`Unexpected host ${url.host}`);
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${validAccess}`) return new Response(null, { status: 401 });
    const cursor = url.searchParams.get("cursor");
    switch (url.pathname) {
      case "/api/v1/users/me":
        return Response.json({ success: true, data: { id: 7, company_id: url.hostname === "other.pipedrive.com" ? 9999 : 4242, company_name: "Acme", company_domain: "acme" } });
      case "/api/v2/pipelines": return Response.json({ success: true, data: [{ id: 1, name: "Продажи" }, { id: 2, name: "Закупки" }], additional_data: { next_cursor: null } });
      case "/api/v2/stages": return Response.json({ success: true, data: [{ id: 11, name: "Новая", pipeline_id: 1 }, { id: 12, name: "Счёт", pipeline_id: 1 },
        { id: 21, name: "Заявка", pipeline_id: 2 }], additional_data: { next_cursor: null } });
      case "/api/v1/users": return Response.json({ success: true, data: reconciled ? [] : [{ id: 7, name: "Ирина Ким", active_flag: true }] });
      case "/api/v2/deals": {
        assert.equal(url.searchParams.get("sort_by"), "id");
        assert.equal(url.searchParams.get("limit"), "500");
        if (cursor === "page-2" && deals429++ === 0) return new Response(null, { status: 429, headers: { "retry-after": "1" } });
        const rows = (cursor === "page-2" ? deals.slice(500) : deals.slice(0, 500)).filter(deal => !reconciled || (deal.id !== 7 && deal.id !== 6)); // 6 was deleted by an event
        return Response.json({ success: true, data: rows, additional_data: { next_cursor: cursor ? null : "page-2" } });
      }
      case "/api/v2/activities": return Response.json({ success: true, additional_data: { next_cursor: null }, data: [
        { id: 301, type: "call", done: true, owner_id: 7, deal_id: 1, update_time: "2026-10-01T10:00:00Z" },
        { id: 302, type: "visit_client", done: false, owner_id: 7, deal_id: 2 },
        { id: 303, type: "meeting", done: true, owner_id: 7 },
      ] });
      case "/api/v1/webhooks":
        if (init?.method === "POST") { webhooks.push(JSON.parse(String(init.body)) as Record<string, unknown>); return Response.json({ success: true, data: { id: webhooks.length } }, { status: 201 }); }
        return Response.json({ success: true, data: [] });
      case "/api/v2/deals/7": return Response.json({ success: false, error: "Deal not found" }, { status: 404 });
      case "/api/v2/deals/5": return Response.json({ success: true, data: { ...deals[4], value: 999 } });
      case "/api/v2/activities/900": return Response.json({ success: true, data: { id: 900, type: "email", done: true, owner_id: 7 } });
      case "/api/v2/activities/901": return Response.json({ success: true, data: { id: 901, type: "call", done: true, owner_id: 7, is_deleted: true } });
      default: throw new Error(`Unexpected Pipedrive request ${url.pathname}`);
    }
  }) as typeof fetch;

  const { server, worker } = makeApp(config, store, pdFetch);
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
    const catalog = (await api("/v1/providers")).data.providers as Array<{ id: string; status: string; accountChosenOnConsent?: boolean }>;
    const info = catalog.find(provider => provider.id === "pipedrive");
    assert.equal(info?.status, "available");
    assert.equal(info?.accountChosenOnConsent, true, "the operator types nothing for Pipedrive");

    const tenantId = (await api("/v1/tenants", "POST", { name: "Acme" })).data.tenantId as string;
    assert.equal((await api(`/v1/tenants/${tenantId}/connect/pipedrive`, "POST", { account: "not a host!" })).status, 400);
    const start = async (account?: string) => {
      const started = await api(`/v1/tenants/${tenantId}/connect/pipedrive`, "POST", account === undefined ? {} : { account });
      assert.equal(started.status, 200);
      const consent = new URL(started.data.authorizeUrl);
      assert.equal(consent.origin + consent.pathname, "https://oauth.pipedrive.com/oauth/authorize");
      assert.equal(consent.searchParams.get("client_id"), "pd-client");
      assert.equal(consent.searchParams.get("redirect_uri"), "http://localhost:3000/oauth/pipedrive/callback");
      return consent.searchParams.get("state")!;
    };

    tokenCompanyHost = "https://acme.evil.example";
    assert.equal((await fetch(`${base}/oauth/pipedrive/callback?code=c&state=${await start()}`)).status, 502,
      "tokens are never sent to an api_domain outside pipedrive.com");
    tokenCompanyHost = "https://acme.pipedrive.com";

    const callback = await fetch(`${base}/oauth/pipedrive/callback?code=c&state=${await start()}`);
    assert.equal(callback.status, 201);
    const connectionId = (await callback.json() as { connectionId: string }).connectionId;
    const token = tokenRequests.at(-1)!;
    assert.equal(token.auth, `Basic ${Buffer.from("pd-client:pd-secret").toString("base64")}`, "client credentials go in Basic auth");
    assert.equal(token.body.get("grant_type"), "authorization_code");
    assert.equal(token.body.get("redirect_uri"), "http://localhost:3000/oauth/pipedrive/callback");
    assert.equal(token.body.get("client_secret"), null, "the secret is not repeated in the form body");
    let connection = store.getConnection(connectionId)!;
    assert.equal(connection.account, "acme.pipedrive.com");
    assert.equal(connection.account_id, "4242");

    validAccess = "rotated-on-server"; // the stored access token fails once, forcing a refresh
    await drain();
    assert.equal(refreshes, 1);
    connection = store.getConnection(connectionId)!;
    assert.equal(decrypt(config.dataKey, connection.refresh_token_enc), "refresh-2");
    assert.equal(connection.account, "acme-eu.pipedrive.com", "the client follows a moved api_domain");
    assert.equal(deals429, 2, "the throttled page was retried");
    assert.deepEqual(webhooks.map(hook => [hook.event_object, hook.event_action, hook.version]), [["deal", "*", "2.0"], ["activity", "*", "2.0"]]);
    const handler = String(webhooks[0].subscription_url);
    assert.ok(handler.startsWith("http://localhost:3000/webhooks/pipedrive/"));

    const path = `/v1/tenants/${tenantId}/connections/${connectionId}`;
    const detail = await api(path);
    assert.equal(detail.data.connection.status, "live");
    assert.equal(detail.data.connection.eventsMode, "webhook");
    const counts = Object.fromEntries((detail.data.sync.records as Array<{ kind: string; count: number }>).map(row => [row.kind, row.count]));
    assert.deepEqual(counts, { deal: 501, activity: 3, pipeline: 2, stage: 3, user: 1 });
    assert.equal(detail.data.mappingOptions.activityKind, "activity");

    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "deal", categoryId: 2, direction: "purchase" })).status, 202);
    assert.equal((await api(`${path}/action-types`, "POST", { providerTypeId: "visit_client", actionType: "visit" })).status, 202);
    await drain();
    const analytics = (await api(`/v1/tenants/${tenantId}/analytics`)).data;
    assert.equal(analytics.managers[0].name, "Ирина Ким", "Pipedrive users label managers");
    assert.equal(analytics.team.deals, 500);
    assert.equal(analytics.team.purchases, 1);
    assert.deepEqual(analytics.workByType.map((row: { type: string }) => row.type).sort(), ["call", "meeting", "visit"]);

    const hook = (body: unknown) => fetch(handler.replace("http://localhost:3000", base), { method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json" } });
    const event = (action: string, entity: string, id: number, company = 4242) =>
      ({ meta: { action, entity, entity_id: String(id), company_id: String(company), version: "2.0" }, data: { id } });
    assert.equal((await hook(event("change", "deal", 5, 1))).status, 400, "an event for another company is rejected");
    assert.equal((await hook({ hello: "world" })).status, 400);
    assert.equal((await hook(event("change", "deal", 5))).status, 202);
    assert.equal((await hook(event("delete", "deal", 6))).status, 202);
    assert.equal((await hook(event("create", "activity", 900))).status, 202);
    assert.equal((await hook(event("change", "activity", 901))).status, 202);
    await drain();
    const after = (await api(`/v1/tenants/${tenantId}/analytics`)).data;
    assert.equal(after.team.deals, 499, "deleted deal is tombstoned");
    assert.equal(after.team.dealAmount, 500 * 100 - 100 + 999 - 100, "changed deal refetched; sales exclude the purchase pipeline");
    assert.ok(after.workByType.some((row: { type: string }) => row.type === "email"), "created activity fetched");
    assert.equal(after.team.work, 4, "a record read back as deleted is not stored");

    // A full pass that no longer lists a deal confirms it is gone before removing it; a missing user keeps its name.
    reconciled = true;
    assert.equal((await api(`${path}/resync`, "POST")).status, 202);
    await drain();
    const reconciledAnalytics = (await api(`/v1/tenants/${tenantId}/analytics`)).data;
    assert.equal(reconciledAnalytics.team.deals, 498, "the unlisted deal answered 404 and was tombstoned");
    assert.equal(reconciledAnalytics.managers[0].name, "Ирина Ким", "users are never removed by absence");

    // Re-authorization must come back for the same company.
    validAccess = "access-1";
    tokenCompanyHost = "https://other.pipedrive.com";
    const mismatch = await fetch(`${base}/oauth/pipedrive/callback?code=c&state=${await start("acme-eu.pipedrive.com")}`);
    assert.equal(mismatch.status, 400, "re-authorizing into another company is refused");
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
