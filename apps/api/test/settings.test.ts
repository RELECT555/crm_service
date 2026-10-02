import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";
import { DEFAULT_USER_PREFERENCES } from "../src/domain/preferences.ts";
import { Store } from "../src/storage/store.ts";
import { makeApp } from "../src/app.ts";

async function setup(path = ":memory:") {
  const config: Config = { port: 3000, dbPath: path, appOrigin: "http://localhost:3000",
    adminApiKey: "k".repeat(40), dataKey: randomBytes(32) };
  const store = new Store(path);
  const { server } = makeApp(config, store, (async () => { throw new Error("Personal settings must not call a CRM"); }) as typeof fetch);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const client = () => {
    let cookie = "";
    const call = async (path: string, method = "GET", body?: unknown, options: { csrf?: boolean; service?: boolean } = {}) => {
      const response = await fetch(base + path, { method, headers: {
        ...(cookie ? { cookie } : {}), ...(options.csrf === false ? {} : { "x-requested-with": "crm-admin" }),
        ...(options.service ? { "x-admin-key": config.adminApiKey } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const session = response.headers.get("set-cookie");
      if (session) cookie = session.split(";")[0];
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    return { call, login: (email: string, password: string) => call("/v1/auth/login", "POST", { email, password }) };
  };
  const close = async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  };
  return { store, client, close };
}

test("personal settings: self-only profile, scoped preferences, validation, CSRF and revoked access", async () => {
  const app = await setup();
  const { client, store } = app;
  try {
    const owner = client();
    await owner.call("/v1/auth/bootstrap", "POST", { email: "owner@example.com", name: "Владелец", password: "owner-password-1" }, { service: true });
    const tenantA = (await owner.call("/v1/tenants", "POST", { name: "A" })).data.tenantId;
    const tenantB = (await owner.call("/v1/tenants", "POST", { name: "B" })).data.tenantId;
    const created = await owner.call("/v1/users", "POST", { email: "analyst@example.com", name: "Аналитик", password: "analyst-password-1",
      assignments: [{ roleId: "builtin:analyst", tenantId: tenantA }] });
    const analystId = created.data.user.id as string;
    const analyst = client();
    const otherSession = client();
    await analyst.login("analyst@example.com", "analyst-password-1");
    await otherSession.login("analyst@example.com", "analyst-password-1");
    assert.deepEqual((await analyst.call("/v1/me")).data.preferences, DEFAULT_USER_PREFERENCES);
    assert.equal((await client().call("/v1/me", "PATCH", { name: "Новое имя" })).status, 401);
    assert.equal((await analyst.call("/v1/me", "PATCH", { name: "Новое имя" }, { csrf: false })).status, 403);
    const auditBefore = store.access.listAudit(100).length;
    const saved = await analyst.call("/v1/me", "PATCH", { theme: "dark", defaultTenantId: tenantA, landingPage: "analytics" });
    assert.equal(saved.status, 200);
    const expected = { theme: "dark", defaultTenantId: tenantA, landingPage: "analytics" };
    assert.deepEqual(saved.data.preferences, expected);
    assert.equal(store.access.listAudit(100).length, auditBefore, "Preferences are not business audit actions");
    assert.deepEqual((await otherSession.call("/v1/me")).data.preferences, expected, "Saved choices follow the account to another session");
    assert.deepEqual((await owner.call("/v1/me")).data.preferences, DEFAULT_USER_PREFERENCES, "Other accounts stay unchanged");

    const renamed = await analyst.call("/v1/me", "PATCH", { name: "  Новое имя  " });
    assert.equal(renamed.status, 200, "No users.manage permission is required for one's own name");
    assert.equal(renamed.data.user.name, "Новое имя");
    assert.equal(renamed.data.user.email, "analyst@example.com");
    assert.equal(renamed.data.user.assignments[0].roleName, "Аналитик");
    assert.deepEqual(renamed.data.preferences, expected, "Profile edits preserve preferences");
    assert.equal((await owner.call("/v1/me")).data.user.name, "Владелец");
    assert.ok(store.access.listAudit(100).some(entry => entry.action === "user.update" && entry.target_id === analystId &&
      (entry.details as { name?: string }).name === "Новое имя"), "Name changes are attributable");
    assert.equal((await analyst.call("/v1/users")).status, 403, "Self-edit does not grant administrative access");

    const invalid = [
      {}, { name: "" }, { name: " ".repeat(4) }, { name: "x".repeat(121) }, { name: null },
      { theme: "sepia" }, { theme: {} }, { landingPage: "users" }, { landingPage: null },
      { defaultTenantId: tenantB }, { defaultTenantId: "missing" }, { defaultTenantId: 1 },
      { defaultTenantId: null, landingPage: "analytics" },
      { email: "other@example.com" }, { assignments: [{ roleId: "builtin:owner", tenantId: null }] },
      { id: (await owner.call("/v1/me")).data.user.id, name: "Intruder" },
      { name: "Should roll back", theme: "sepia" },
    ];
    for (const body of invalid) assert.equal((await analyst.call("/v1/me", "PATCH", body)).status, 400, `Rejects ${JSON.stringify(body)}`);
    assert.equal((await analyst.call("/v1/me")).data.user.name, "Новое имя", "Invalid patches are atomic");
    assert.deepEqual((await analyst.call("/v1/me")).data.preferences, expected);
    assert.equal((await owner.call("/v1/me", "PATCH", { theme: "light" }, { service: true })).status, 400);
    const serviceMe = await owner.call("/v1/me", "GET", undefined, { service: true });
    assert.equal(serviceMe.data.preferences, null);
    assert.equal(serviceMe.data.user, null);

    // A role downgrade retains the allowed workspace, but safely falls back from analytics.
    await owner.call(`/v1/users/${analystId}`, "PATCH", { assignments: [{ roleId: "builtin:viewer", tenantId: tenantA }] });
    const viewerMe = await analyst.call("/v1/me");
    assert.deepEqual(viewerMe.data.preferences, { ...expected, landingPage: "overview" });
    assert.equal((await analyst.call("/v1/me", "PATCH", { landingPage: "analytics" })).status, 400);
    assert.equal((await analyst.call("/v1/me", "PATCH", { theme: "light" })).status, 200, "A stale start page does not block other preferences");
    await owner.call(`/v1/users/${analystId}`, "PATCH", { assignments: [] });
    const revoked = await analyst.call("/v1/me");
    assert.deepEqual(revoked.data.preferences, { theme: "light", defaultTenantId: null, landingPage: "overview" });
    assert.ok(!JSON.stringify(revoked.data.preferences).includes(tenantA), "Revoked workspace is not exposed in preferences");
    assert.equal((await analyst.call("/v1/me", "PATCH", { name: "Без роли" })).status, 200, "Users without workspace access can edit their profile");
    const cleared = await analyst.call("/v1/me", "PATCH", { theme: null, defaultTenantId: null, landingPage: "overview" });
    assert.deepEqual(cleared.data.preferences, DEFAULT_USER_PREFERENCES);

    assert.equal((await analyst.call("/v1/me/password", "POST", { currentPassword: "wrong", newPassword: "new-password-1" })).status, 400);
    assert.equal((await otherSession.call("/v1/me")).status, 200, "Failed password change does not revoke sessions");
    assert.equal((await analyst.call("/v1/me/password", "POST", { currentPassword: "analyst-password-1", newPassword: "new-password-1" })).status, 200);
    assert.equal((await analyst.call("/v1/me")).status, 200);
    assert.equal((await otherSession.call("/v1/me")).status, 401, "Other sessions end after a password change");
    assert.equal((await client().login("analyst@example.com", "analyst-password-1")).status, 401);
    assert.equal((await client().login("analyst@example.com", "new-password-1")).status, 200);
    assert.ok(!JSON.stringify((await analyst.call("/v1/me")).data).includes("password"), "Account response contains no password material");
  } finally { await app.close(); }
});

test("personal settings survive an API restart on an existing SQLite database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "crm-settings-"));
  const path = join(directory, "settings.sqlite");
  let app = await setup(path);
  try {
    const owner = app.client();
    await owner.call("/v1/auth/bootstrap", "POST", { email: "owner@example.com", name: "Владелец", password: "owner-password-1" }, { service: true });
    const tenantId = (await owner.call("/v1/tenants", "POST", { name: "Старт" })).data.tenantId;
    const preferences = { theme: "system", defaultTenantId: tenantId, landingPage: "analytics" };
    assert.equal((await owner.call("/v1/me", "PATCH", { ...preferences, name: "Сохранённое имя" })).status, 200);
    await app.close();
    app = await setup(path);
    const signedIn = app.client();
    await signedIn.login("owner@example.com", "owner-password-1");
    const me = await signedIn.call("/v1/me");
    assert.equal(me.status, 200);
    assert.deepEqual(me.data.preferences, preferences);
    assert.equal(me.data.user.name, "Сохранённое имя");
  } finally {
    await app.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()), "Cleanup stays inside the temporary directory");
    rmSync(directory, { recursive: true, force: true });
  }
});
