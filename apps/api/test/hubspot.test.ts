import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { ConnectorRegistry } from "../src/connectors/registry.ts";
import { decrypt } from "../src/security/crypto.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

const baseConfig = (): Config => ({
  port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
  hubspotClientId: "hs-client", hubspotClientSecret: "hs-secret",
  adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
});

test("HubSpot without HUBSPOT_SCOPES stays not configured: the consent URL scopes are never guessed", () => {
  const store = new Store(":memory:");
  try {
    const info = ConnectorRegistry.create(baseConfig(), store).catalog().find(provider => provider.id === "hubspot");
    assert.equal(info?.status, "not_configured");
    assert.ok(info?.requiredEnv?.includes("HUBSPOT_SCOPES"));
  } finally { store.close(); }
});

test("HubSpot: consent-picked portal, owners and engagements, cursor backfill, polling, mappings", async () => {
  const config: Config = { ...baseConfig(), hubspotScopes: "oauth crm.objects.deals.read" };
  const store = new Store(":memory:");
  const deals = Array.from({ length: 101 }, (_, index) => ({ id: String(index + 1), updatedAt: "2026-10-01T10:00:00Z",
    properties: { dealname: `Deal ${index + 1}`, amount: "200", deal_currency_code: "USD", pipeline: index === 100 ? "purchases" : "default",
      dealstage: "appointmentscheduled", hubspot_owner_id: index % 2 ? "11" : "12" } }));
  const withDeal = (id: string) => ({ deals: { results: [{ id, type: "call_to_deal" }] } });
  let validAccess = "access-1";
  let tokenHub = { hub_id: 555, hub_domain: "Acme.com" };
  let refreshes = 0;
  let reconciled = false; // second full pass: deal 2 and every owner vanish from the listings
  const tokenBodies: URLSearchParams[] = [];
  const objectQueries = new Map<string, URLSearchParams>();
  const hsFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.hubapi.com") throw new Error(`Unexpected host ${url.host}`);
    if (url.pathname === "/oauth/v1/token") {
      const body = new URLSearchParams(String(init?.body));
      tokenBodies.push(body);
      if (body.get("grant_type") === "refresh_token") {
        refreshes++;
        validAccess = "access-2";
        return Response.json({ access_token: "access-2", refresh_token: "refresh-1", expires_in: 1800, token_type: "bearer" });
      }
      return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 1800, token_type: "bearer" });
    }
    if (url.pathname.startsWith("/oauth/v1/access-tokens/")) {
      return Response.json({ token: "access-1", ...tokenHub, app_id: 1, user_id: 2, scopes: ["oauth"], token_type: "access", expires_in: 1700 });
    }
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${validAccess}`) return new Response(null, { status: 401 });
    const after = url.searchParams.get("after");
    if (url.pathname.startsWith("/crm/v3/objects/")) objectQueries.set(url.pathname, url.searchParams);
    switch (url.pathname) {
      case "/crm/v3/pipelines/deals": return Response.json({ results: [
        { id: "default", label: "Продажи", displayOrder: 0, stages: [{ id: "appointmentscheduled", label: "Встреча назначена" }, { id: "closedwon", label: "Выиграна" }] },
        { id: "purchases", label: "Закупки", displayOrder: 1, stages: [{ id: "requested", label: "Заявка" }] },
      ] });
      case "/crm/v3/owners": if (reconciled) return Response.json({ results: [] });
        return after === "o2"
        ? Response.json({ results: [{ id: "12", firstName: "Пётр", lastName: "Орлов", email: "p@example.com" }] })
        : Response.json({ results: [{ id: "11", firstName: "Анна", lastName: "Ли", email: "a@example.com" }], paging: { next: { after: "o2" } } });
      case "/crm/v3/objects/deals": return after === "d2"
        ? Response.json({ results: deals.slice(100) })
        : Response.json({ results: deals.slice(0, 100).filter(deal => !reconciled || deal.id !== "2"), paging: { next: { after: "d2", link: "next" } } });
      case "/crm/v3/objects/deals/2": return Response.json({ status: "error", message: "Object not found" }, { status: 404 });
      case "/crm/v3/objects/calls": return Response.json({ results: [
        { id: "201", properties: { hubspot_owner_id: "11", hs_call_status: "COMPLETED" }, associations: withDeal("1") },
        { id: "202", properties: { hubspot_owner_id: "12", hs_call_status: "NO_ANSWER" } },
      ] });
      case "/crm/v3/objects/meetings": return Response.json({ results: [{ id: "301", properties: { hubspot_owner_id: "11", hs_meeting_outcome: "COMPLETED" } }] });
      case "/crm/v3/objects/tasks": return Response.json({ results: [
        { id: "401", properties: { hubspot_owner_id: "12", hs_task_status: "COMPLETED", hs_task_type: "TODO" } },
        { id: "402", properties: { hubspot_owner_id: "12", hs_task_status: "NOT_STARTED", hs_task_type: "VISIT" } },
      ] });
      case "/crm/v3/objects/emails": return Response.json({ results: [{ id: "501", properties: { hubspot_owner_id: "11" } }] });
      default: throw new Error(`Unexpected HubSpot request ${url.pathname}`);
    }
  }) as typeof fetch;

  const { server, worker } = makeApp(config, store, hsFetch);
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
    const tenantId = (await api("/v1/tenants", "POST", { name: "Acme" })).data.tenantId as string;
    const start = async (account?: string) => {
      const started = await api(`/v1/tenants/${tenantId}/connect/hubspot`, "POST", account === undefined ? {} : { account });
      assert.equal(started.status, 200);
      const consent = new URL(started.data.authorizeUrl);
      assert.equal(consent.origin + consent.pathname, "https://app.hubspot.com/oauth/authorize");
      assert.equal(consent.searchParams.get("scope"), "oauth crm.objects.deals.read", "scopes come from HUBSPOT_SCOPES verbatim");
      assert.equal(consent.searchParams.get("redirect_uri"), "http://localhost:3000/oauth/hubspot/callback");
      return consent.searchParams.get("state")!;
    };
    const callback = await fetch(`${base}/oauth/hubspot/callback?code=c&state=${await start()}`);
    assert.equal(callback.status, 201);
    const connectionId = (await callback.json() as { connectionId: string }).connectionId;
    assert.equal(tokenBodies[0].get("client_secret"), "hs-secret");
    assert.equal(tokenBodies[0].get("code"), "c");
    const connection = store.getConnection(connectionId)!;
    assert.equal(connection.account, "acme.com", "the portal domain from token info, lower-cased");
    assert.equal(connection.account_id, "555");

    validAccess = "rotated-on-server";
    await drain();
    assert.equal(refreshes, 1);
    assert.equal(decrypt(config.dataKey, store.getConnection(connectionId)!.access_token_enc), "access-2");
    const dealQuery = objectQueries.get("/crm/v3/objects/deals")!;
    assert.equal(dealQuery.get("limit"), "100");
    assert.ok(dealQuery.getAll("properties").includes("deal_currency_code"), "properties are requested one per parameter");
    assert.equal(objectQueries.get("/crm/v3/objects/calls")!.get("associations"), "deals");

    const path = `/v1/tenants/${tenantId}/connections/${connectionId}`;
    const detail = await api(path);
    assert.equal(detail.data.connection.status, "live");
    assert.equal(detail.data.connection.eventsMode, "polling", "HubSpot relies on scheduled reconciliation for now");
    const counts = Object.fromEntries((detail.data.sync.records as Array<{ kind: string; count: number }>).map(row => [row.kind, row.count]));
    assert.deepEqual(counts, { deal: 101, call: 2, meeting: 1, task: 2, email: 1, pipeline: 2, stage: 3, user: 2 });

    assert.equal((await api(`${path}/commercial-sources`, "POST", { sourceKind: "deal", categoryId: "purchases", direction: "purchase" })).status, 202);
    assert.equal((await api(`${path}/action-types`, "POST", { providerTypeId: "VISIT", actionType: "visit" })).status, 202);
    await drain();
    const analytics = (await api(`/v1/tenants/${tenantId}/analytics`)).data;
    assert.deepEqual(analytics.managers.map((m: { name: string }) => m.name).sort(), ["Анна Ли", "Пётр Орлов"], "owners label managers");
    assert.equal(analytics.team.deals, 100);
    assert.equal(analytics.team.purchases, 1);
    assert.equal(analytics.currency, "USD");
    const types = Object.fromEntries((analytics.workByType as Array<{ type: string; count: number; completed: number }>).map(row => [row.type, row]));
    assert.deepEqual(Object.keys(types).sort(), ["call", "email", "meeting", "task", "visit"]);
    assert.equal(types.call.completed, 1, "only the completed call counts as done");
    assert.equal(analytics.team.linkedWork, 1, "the call associated with a deal is linked work");

    const webhook = await fetch(`${base}/webhooks/hubspot/${"x".repeat(43)}`, { method: "POST", body: "{}" });
    assert.equal(webhook.status, 404, "no per-connection webhook exists for HubSpot");

    reconciled = true;
    assert.equal((await api(`${path}/resync`, "POST")).status, 202);
    await drain();
    const reconciledAnalytics = (await api(`/v1/tenants/${tenantId}/analytics`)).data;
    assert.equal(reconciledAnalytics.team.deals, 99, "the unlisted deal answered 404 and was tombstoned");
    assert.deepEqual(reconciledAnalytics.managers.map((m: { name: string }) => m.name).sort(), ["Анна Ли", "Пётр Орлов"],
      "owners are never removed by absence");

    tokenHub = { hub_id: 777, hub_domain: "other.com" };
    validAccess = "access-1";
    assert.equal((await fetch(`${base}/oauth/hubspot/callback?code=c&state=${await start("acme.com")}`)).status, 400,
      "re-authorizing into another portal is refused");
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
