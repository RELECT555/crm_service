import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

test("access control: bootstrap, sessions, workspace-scoped roles, escalation guards, audit", async () => {
  const config: Config = { port: 3000, dbPath: ":memory:", appOrigin: "http://localhost:3000",
    bitrixClientId: "id", bitrixClientSecret: "secret", adminApiKey: "k".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(":memory:");
  const { server } = makeApp(config, store, (async () => { throw new Error("no CRM calls expected"); }) as typeof fetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /** A browser-like client: keeps the session cookie and sends the CSRF header unless told not to. */
  const client = () => {
    let cookie = "";
    const call = async (path: string, method = "GET", body?: unknown, options: { csrf?: boolean; adminKey?: boolean } = {}) => {
      const response = await fetch(base + path, { method, headers: {
        ...(cookie ? { cookie } : {}), ...(options.csrf === false ? {} : { "x-requested-with": "crm-admin" }),
        ...(options.adminKey ? { "x-admin-key": config.adminApiKey } : {}),
        ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0].endsWith("=") ? "" : setCookie.split(";")[0];
      return { status: response.status, data: await response.json() as Record<string, any>, setCookie };
    };
    return { call, login: (email: string, password: string) => call("/v1/auth/login", "POST", { email, password }) };
  };

  try {
    const owner = client();
    assert.deepEqual((await owner.call("/v1/auth/status")).data, { hasUsers: false });
    assert.equal((await owner.call("/v1/me")).status, 401);
    const ownerBody = { email: "Owner@Example.com", name: "Ольга", password: "correct horse 1" };
    assert.equal((await owner.call("/v1/auth/bootstrap", "POST", ownerBody)).status, 401, "bootstrap needs the service key");
    const boot = await owner.call("/v1/auth/bootstrap", "POST", ownerBody, { adminKey: true });
    assert.equal(boot.status, 201);
    assert.match(boot.setCookie!, /crm_session=.+; HttpOnly; SameSite=Strict; Path=\//);
    assert.equal((await owner.call("/v1/auth/bootstrap", "POST", ownerBody, { adminKey: true })).status, 409);

    const me = await owner.call("/v1/me");
    assert.equal(me.data.user.email, "owner@example.com");
    assert.ok(me.data.permissions.global.includes("roles.manage"));

    // Onboarding: a per-user set of offered presentation/tour ids (docs/onboarding.md).
    assert.deepEqual(me.data.onboarding, { seen: [] });
    assert.deepEqual((await owner.call("/v1/me/onboarding", "POST", { seen: ["welcome:1", "tour:nav-analytics"] })).data,
      { seen: ["welcome:1", "tour:nav-analytics"] });
    assert.deepEqual((await owner.call("/v1/me/onboarding", "POST", { seen: ["tour:nav-analytics", "tour:user-menu"] })).data,
      { seen: ["welcome:1", "tour:nav-analytics", "tour:user-menu"] }, "marking is idempotent and keeps first-seen order");
    assert.deepEqual((await owner.call("/v1/me")).data.onboarding.seen, ["welcome:1", "tour:nav-analytics", "tour:user-menu"]);
    for (const seen of [[], ["Bad Id"], "welcome:1", Array.from({ length: 51 }, (_, i) => `tour:${i}`)]) {
      assert.equal((await owner.call("/v1/me/onboarding", "POST", { seen })).status, 400, `rejects ${JSON.stringify(seen).slice(0, 30)}`);
    }
    assert.equal((await owner.call("/v1/me/onboarding", "POST", { seen: ["welcome:2"] }, { csrf: false })).status, 403);
    const service = await fetch(`${base}/v1/me/onboarding`, { method: "POST", headers: { "x-admin-key": config.adminApiKey,
      "content-type": "application/json" }, body: JSON.stringify({ seen: ["welcome:1"] }) });
    assert.equal(service.status, 400, "the service key has no onboarding state");
    assert.equal((await owner.call("/v1/tenants", "POST", { name: "A" }, { csrf: false })).status, 403, "cookie mutations need the CSRF header");
    const tenantA = (await owner.call("/v1/tenants", "POST", { name: "A" })).data.tenantId as string;
    const tenantB = (await owner.call("/v1/tenants", "POST", { name: "B" })).data.tenantId as string;

    const roles = (await owner.call("/v1/roles")).data.roles as Array<{ id: string; key: string | null }>;
    assert.deepEqual(roles.filter(role => role.key).map(role => role.key), ["viewer", "analyst", "integrator", "admin", "owner"]);
    const custom = await owner.call("/v1/roles", "POST", { name: "Только аналитика", permissions: ["workspaces.view", "analytics.view"] });
    assert.equal(custom.status, 201);
    assert.equal((await owner.call("/v1/roles", "POST", { name: "Bad", permissions: ["everything"] })).status, 400);

    // Integrator scoped to workspace A only.
    const integratorBody = { email: "int@example.com", name: "Игорь", password: "integrator-pass",
      assignments: [{ roleId: "builtin:integrator", tenantId: tenantA }] };
    assert.equal((await owner.call("/v1/users", "POST", { ...integratorBody, password: "short" })).status, 400);
    assert.equal((await owner.call("/v1/users", "POST", integratorBody)).status, 201);
    assert.equal((await owner.call("/v1/users", "POST", integratorBody)).status, 409, "email is unique");
    const integrator = client();
    assert.equal((await integrator.login("int@example.com", "wrong-password")).status, 401);
    assert.equal((await integrator.login("INT@example.com", "integrator-pass")).status, 200);
    const visible = (await integrator.call("/v1/tenants")).data.tenants as Array<{ id: string }>;
    assert.deepEqual(visible.map(tenant => tenant.id), [tenantA]);
    assert.equal((await integrator.call(`/v1/tenants/${tenantB}`)).status, 403);
    assert.equal((await integrator.call(`/v1/tenants/${tenantA}`, "PATCH", { name: "X" })).status, 403);
    assert.equal((await integrator.call(`/v1/tenants/${tenantA}/connect/bitrix24`, "POST", { account: "demo.bitrix24.com" })).status, 200);
    assert.equal((await integrator.call("/v1/users")).status, 403);
    assert.equal((await integrator.call("/v1/tenants", "POST", { name: "C" })).status, 403);

    // Admin (global) cannot manage roles or grant the owner role.
    const adminBody = { email: "admin@example.com", name: "Анна", password: "admin-password", assignments: [{ roleId: "builtin:admin", tenantId: null }] };
    const adminUser = (await owner.call("/v1/users", "POST", adminBody)).data.user as { id: string };
    const admin = client();
    await admin.login("admin@example.com", "admin-password");
    assert.equal((await admin.call("/v1/roles", "POST", { name: "Mine", permissions: ["workspaces.view"] })).status, 403);
    assert.equal((await admin.call("/v1/users", "POST", { email: "x@example.com", name: "X", password: "xxxxxxxxxxxx",
      assignments: [{ roleId: "builtin:owner", tenantId: null }] })).status, 403, "cannot grant more than you hold");
    const viewer = await admin.call("/v1/users", "POST", { email: "v@example.com", name: "Вера", password: "viewer-password",
      assignments: [{ roleId: "builtin:viewer", tenantId: tenantB }] });
    assert.equal(viewer.status, 201);
    const ownerId = me.data.user.id as string;
    assert.equal((await admin.call(`/v1/users/${ownerId}`, "DELETE")).status, 403, "an admin cannot remove an owner");

    // Last-owner and self-protection.
    assert.equal((await owner.call(`/v1/users/${ownerId}`, "PATCH", { status: "disabled" })).status, 409);
    assert.equal((await owner.call(`/v1/users/${ownerId}`, "PATCH", { assignments: [] })).status, 409);
    assert.equal((await owner.call(`/v1/roles/${custom.data.role.id}`, "DELETE")).status, 200);

    // Disabling ends the session; password change keeps only the current session.
    assert.equal((await owner.call(`/v1/users/${adminUser.id}`, "PATCH", { status: "disabled" })).status, 200);
    assert.equal((await admin.call("/v1/me")).status, 401);
    assert.equal((await integrator.call("/v1/me/password", "POST", { currentPassword: "nope", newPassword: "new-password-1" })).status, 400);
    assert.equal((await integrator.call("/v1/me/password", "POST", { currentPassword: "integrator-pass", newPassword: "new-password-1" })).status, 200);
    assert.equal((await integrator.call("/v1/me")).status, 200);
    assert.equal((await client().login("int@example.com", "new-password-1")).status, 200);

    const auditLog = (await owner.call("/v1/audit")).data.entries as Array<{ action: string; actor_label: string }>;
    for (const action of ["user.bootstrap_owner", "workspace.create", "role.create", "user.create", "auth.login_failed", "user.update", "role.delete"]) {
      assert.ok(auditLog.some(entry => entry.action === action), `audit has ${action}`);
    }
    assert.ok(!auditLog.some(entry => entry.action.includes("onboarding")), "onboarding is a preference, not audited");
    assert.equal((await integrator.call("/v1/audit")).status, 403);

    for (let attempt = 0; attempt < 8; attempt++) await client().login("v@example.com", "bad-password");
    assert.equal((await client().login("v@example.com", "viewer-password")).status, 429, "throttled after repeated failures");

    assert.equal((await owner.call("/v1/auth/logout", "POST")).status, 200);
    assert.equal((await owner.call("/v1/me")).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
