import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("workspace settings, connection stats, activity log, disconnect and resume", async () => {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", adminApiKey: "a".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  let activityFailures = 1;
  let crmCalls = 0;
  let handler = "";
  const crmFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.bitrix.info") return Response.json({ access_token: "a", refresh_token: "r", expires_in: 3600,
      client_endpoint: "https://demo.bitrix24.com/rest/", member_id: "m1", scope: "crm" });
    crmCalls++;
    const method = url.pathname.replace("/rest/", "");
    const params = JSON.parse(String(init?.body)) as Record<string, any>;
    if (method === "event.get") return Response.json({ result: [] });
    if (method === "event.bind") { handler = String(params.handler); return Response.json({ result: true }); }
    if (method === "crm.category.list") return Response.json({ result: { categories: [{ id: 0, name: "Продажи" }] } });
    if (method === "crm.status.list") return Response.json({ result: [] });
    if (method === "crm.item.list") return Response.json({ result: { items: params.entityTypeId === 2 && params.filter[">id"] === 0
      ? [{ id: 1, opportunity: 10, currencyId: "RUB", categoryId: 0, stageId: "NEW" }] : [] } });
    if (method === "crm.activity.list") {
      if (activityFailures-- > 0) return Response.json({ error: "INTERNAL_ERROR" }, { status: 400 });
      return Response.json({ result: params.filter[">ID"] === 0 ? [{ ID: 7, TYPE_ID: 2, COMPLETED: "Y", OWNER_TYPE_ID: 2, OWNER_ID: 1 }] : [] });
    }
    throw new Error(`Unexpected ${method}`);
  }) as typeof fetch;
  const { server, worker } = makeApp(config, store, crmFetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, headers: { "x-admin-key": config.adminApiKey,
      ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as Record<string, any> };
  };
  // Failed pages are retried after a backoff; run every queued job regardless of its delay.
  const drain = async () => {
    for (let round = 0; round < 10; round++) {
      store.db.prepare("UPDATE jobs SET run_after=0 WHERE status='queued'").run();
      if (!(await worker.tick())) return;
    }
  };
  try {
    const tenantId = (await api("/v1/tenants", "POST", { name: "Acme" })).data.tenantId as string;
    assert.equal((await api(`/v1/tenants/${tenantId}`, "PATCH", { timezone: "Mars/Olympus" })).status, 400);
    assert.equal((await api(`/v1/tenants/${tenantId}`, "PATCH", { currency: "rub" })).status, 400);
    assert.equal((await api(`/v1/tenants/${tenantId}`, "PATCH", {})).status, 400);
    const updated = await api(`/v1/tenants/${tenantId}`, "PATCH", { timezone: "Europe/Moscow", currency: "RUB" });
    assert.deepEqual([updated.data.tenant.name, updated.data.tenant.timezone, updated.data.tenant.currency], ["Acme", "Europe/Moscow", "RUB"]);
    assert.equal((await api(`/v1/tenants/${tenantId}`, "PATCH", { currency: null })).data.tenant.currency, null);

    const started = await api(`/v1/tenants/${tenantId}/connect/bitrix24`, "POST", { account: "demo.bitrix24.com" });
    const state = new URL(started.data.authorizeUrl).searchParams.get("state");
    const callback = await fetch(`${base}/oauth/bitrix24/callback?code=c&state=${state}`);
    const connectionId = (await callback.json() as { connectionId: string }).connectionId;
    const path = `/v1/tenants/${tenantId}/connections/${connectionId}`;
    for (let round = 0; round < 20; round++) await drain();

    const summary = (await api(`/v1/tenants/${tenantId}`)).data.connections[0];
    assert.deepEqual([summary.status, summary.records, summary.commercial, summary.work, summary.kinds_done, summary.kinds_total],
      ["live", 3, 1, 1, 5, 5]);
    const jobs = (await api(`${path}/activity`)).data.jobs as Array<{ kind: string; status: string; attempts: number; error: string | null }>;
    const activity = jobs.find(job => job.kind === "activity")!;
    assert.equal(activity.status, "done");
    assert.equal(activity.attempts, 2, "the failed first attempt was retried");
    assert.equal(activity.error, null, "a later success clears the retry error");
    assert.ok(jobs.length >= 6);

    store.enqueue(connectionId, "sync", "deal");
    const disconnected = await api(`${path}/disconnect`, "POST");
    assert.deepEqual(disconnected.data, { status: "disconnected", cancelledJobs: 1 });
    assert.equal((await api(`${path}/resync`, "POST")).status, 409);
    const callsBefore = crmCalls;
    const ignored = await fetch(handler.replace("http://localhost:3000", base), { method: "POST",
      body: new URLSearchParams({ event: "ONCRMDEALUPDATE", "auth[member_id]": "m1", "data[FIELDS][ID]": "1" }) });
    assert.equal(ignored.status, 202);
    assert.deepEqual(await ignored.json(), { accepted: false });
    await drain();
    assert.equal(crmCalls, callsBefore, "a disconnected connection makes no CRM calls");
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='queued'").get()!.n, 0);
    assert.equal((await api(`/v1/tenants/${tenantId}`)).data.connections[0].records, 3, "data is kept");

    assert.equal((await api(`${path}/resume`, "POST")).status, 202);
    assert.equal((await api(`${path}/resume`, "POST")).status, 409);
    for (let round = 0; round < 20; round++) await drain();
    assert.equal((await api(path)).data.connection.status, "live");
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
