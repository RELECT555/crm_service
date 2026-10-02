import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

// Without a user scope the main flow test (flow.test.ts) proves user.get is never called; this covers the granted case.
test("Bitrix24 with user_brief: user.get pages by start/next, names label managers, dismissed users are kept", async () => {
  const config: Config = {
    port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "test-client", bitrixClientSecret: "test-secret",
    adminApiKey: "a".repeat(40), dataKey: randomBytes(32),
  };
  const store = new Store(":memory:");
  const users = Array.from({ length: 51 }, (_, index) => ({ ID: String(index + 1), NAME: `Имя${index + 1}`, LAST_NAME: "Фамилия",
    ACTIVE: index === 50 ? false : true }));
  users[6] = { ID: "7", NAME: "Ольга", LAST_NAME: "Смирнова", ACTIVE: true };
  users[50] = { ID: "51", NAME: "Илья", LAST_NAME: "", ACTIVE: false };
  const userCalls: Array<Record<string, unknown>> = [];
  const crmFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.bitrix.info") return Response.json({
      access_token: "access-plain", refresh_token: "refresh-plain", expires_in: 3600,
      client_endpoint: "https://demo.bitrix24.com/rest/", member_id: "member-1", scope: "crm,user_brief",
    });
    const method = url.pathname.replace("/rest/", "");
    const params = JSON.parse(String(init?.body)) as Record<string, unknown>;
    switch (method) {
      case "event.get": return Response.json({ result: [] });
      case "event.bind": return Response.json({ result: true });
      case "crm.category.list": return Response.json({ result: { categories: [{ id: 0, name: "Sales" }] } });
      case "crm.status.list": return Response.json({ result: [] });
      case "user.get": {
        userCalls.push(params);
        const start = Number(params.start);
        return Response.json({ result: users.slice(start, start + 50), ...(start === 0 ? { next: 50 } : {}), total: users.length });
      }
      case "crm.item.list": {
        const after = Number((params.filter as Record<string, unknown>)[">id"]);
        const items = Number(params.entityTypeId) === 2 ? [
          { id: 10, opportunity: 100, currencyId: "RUB", stageId: "NEW", categoryId: 0, assignedById: 7 },
          { id: 11, opportunity: 50, currencyId: "RUB", stageId: "NEW", categoryId: 0, assignedById: 51 },
          { id: 12, opportunity: 10, currencyId: "RUB", stageId: "NEW", categoryId: 0, assignedById: 99 },
        ] : [];
        return Response.json({ result: { items: items.filter(item => item.id > after) } });
      }
      case "crm.activity.list": return Response.json({ result: [] });
      default: throw new Error(`Unexpected Bitrix method ${method}`);
    }
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
  try {
    const tenant = (await api("/v1/tenants", "POST")).data.tenantId as string;
    const started = await api(`/v1/tenants/${tenant}/connect/bitrix24`, "POST", { account: "demo.bitrix24.com" });
    const state = new URL(started.data.authorizeUrl).searchParams.get("state");
    const callback = await fetch(`${base}/oauth/bitrix24/callback?code=c&state=${state}&domain=demo.bitrix24.com&member_id=member-1`);
    assert.equal(callback.status, 201);
    const connection = (await callback.json() as { connectionId: string }).connectionId;
    assert.deepEqual(JSON.parse(store.getConnection(connection)!.settings!), { scopes: ["crm", "user_brief"] },
      "granted scopes are kept as non-secret settings");
    while (await worker.tick()) { /* drain */ }

    assert.deepEqual(userCalls.map(call => call.start), [0, 50], "the second page starts at the offset from `next`");
    assert.ok(userCalls.every(call => call.sort === "ID" && call.order === "ASC"));
    assert.equal(userCalls[0].FILTER, undefined, "no ACTIVE filter: dismissed employees still own deals");
    const detail = await api(`/v1/tenants/${tenant}/connections/${connection}`);
    const counts = Object.fromEntries((detail.data.sync.records as Array<{ kind: string; count: number }>).map(row => [row.kind, row.count]));
    assert.equal(counts.user, 51);

    const analytics = (await api(`/v1/tenants/${tenant}/analytics`)).data;
    const names = Object.fromEntries((analytics.managers as Array<{ ownerId: string; name: string }>).map(m => [m.ownerId, m.name]));
    assert.equal(names["7"], "Ольга Смирнова");
    assert.equal(names["51"], "Илья", "an empty last name leaves no trailing space");
    assert.notEqual(names["99"], undefined, "an owner without a user record still appears");
  } finally {
    worker.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
