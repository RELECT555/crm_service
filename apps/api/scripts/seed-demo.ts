// Fills a local SQLite database with demo workspaces and a Bitrix24 connection so the admin UI can be
// developed and shown without a real CRM. Tokens are fake: never point this at a production database.
//   npm run seed:demo -w @crm/api            (uses DB_PATH and DATA_KEY_BASE64 from apps/api/.env)
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { digest, encrypt } from "../src/security/crypto.ts";
import { hashPassword } from "../src/security/password.ts";
import { DEMO_TEAM } from "../src/domain/demo.ts";
import { Store } from "../src/storage/store.ts";

const dbPath = process.env.DB_PATH ?? "./data/crm.sqlite";
const dataKey = Buffer.from(process.env.DATA_KEY_BASE64 ?? "", "base64");
if (dataKey.length !== 32) throw new Error("DATA_KEY_BASE64 must encode 32 bytes; see .env.example");
if (existsSync(dbPath) && !process.argv.includes("--force")) {
  throw new Error(`${dbPath} already exists. Re-run with --force to add demo data to it.`);
}

const store = new Store(dbPath);
const tenantId = store.createTenant("ООО «Северный ветер»");
store.createTenant("Альфа Дистрибуция");
store.createTenant("Ромашка Ритейл");

const addConnection = (account: string, accountId: string) => {
  const id = randomUUID();
  store.saveConnection({ id, tenant_id: tenantId, provider: "bitrix24", account_id: accountId, account,
    access_token_enc: encrypt(dataKey, "demo-access"), refresh_token_enc: encrypt(dataKey, "demo-refresh"),
    expires_at: Date.now() + 3600_000, webhook_secret_hash: digest(id), webhook_secret_enc: encrypt(dataKey, id) });
  return store.getConnection(id)!;
};

// A connection in the middle of its backfill: four kinds done, activities still loading.
const loading = addConnection("severveter.bitrix24.ru", "demo-member-1");
for (const kind of ["pipeline", "stage", "deal", "contact"]) store.saveCheckpoint(loading.id, kind, null, true);
store.saveCheckpoint(loading.id, "activity", "4150", false);
// Scheduled far ahead so the worker never calls Bitrix24 with the fake token.
store.enqueue(loading.id, "sync", "activity", "4150", null, null, Date.now() + 365 * 86_400_000);
store.markEventsBound(loading.id, "webhook");
// The shared demo team (src/domain/demo.ts): different profiles so analytics and weak-spot signals have something to show.
const managers = DEMO_TEAM.map(manager => ({ ...manager, amount: manager.averageDeal }));
const counts: Array<[string, "commercial" | "work" | "context", number]> = [["stage", "context", 27], ["contact", "context", 3120]];
const pipelineNames = ["Продажи", "Закупки", "Тендеры", "Сервис"];
store.transaction(() => {
  pipelineNames.forEach((label, index) => store.upsertRecord(loading,
    { kind: "pipeline", externalId: String(index + 1), axis: "context", label, payload: {} }, encrypt(dataKey, "{}")));
  let deal = 0;
  let activity = 0;
  for (const manager of managers) {
    store.upsertRecord(loading, { kind: "user", externalId: manager.id, axis: "context", label: manager.name, payload: {} }, encrypt(dataKey, "{}"));
    for (let index = 0; index < manager.deals; index++) {
      store.upsertRecord(loading, { kind: "deal", externalId: String(++deal), axis: "commercial", direction: "sale", currency: "RUB",
        amount: Math.round(manager.amount * (0.5 + ((index * 37) % 100) / 100)), ownerId: manager.id, payload: {} }, encrypt(dataKey, "{}"));
    }
    for (const [type, total] of Object.entries(manager.work)) {
      for (let index = 0; index < total; index++) {
        store.upsertRecord(loading, { kind: "activity", externalId: String(++activity), axis: "work", actionType: type,
          status: index < total * manager.done ? "completed" : "open", ownerId: manager.id,
          targetKind: index % 3 ? "deal" : undefined, targetId: index % 3 ? String((index % deal) + 1) : undefined, payload: {} }, encrypt(dataKey, "{}"));
      }
    }
  }
  for (const [kind, axis, total] of counts) {
    for (let index = 1; index <= total; index++) {
      store.upsertRecord(loading, { kind, externalId: String(index), axis, payload: {} }, encrypt(dataKey, "{}"));
    }
  }
});
store.setCommercialMapping(loading.id, { source_kind: "deal", category_id: "2", direction: "purchase",
  amount_field: "opportunity", currency_field: "currencyId" });
store.setCommercialMapping(loading.id, { source_kind: "smart:180", category_id: "*", direction: "sale",
  amount_field: "ufCrmAmount", currency_field: "ufCrmCurrency" });
store.setActionType(loading.id, "TRAVEL", "visit");

// A connection whose token was revoked.
const revoked = addConnection("sv-moscow.bitrix24.ru", "demo-member-2");
store.setConnectionStatus(revoked.id, "reauthorization_required", "Bitrix OAuth failed: invalid_grant");

// Sign-in for the demo: owner and an analyst limited to this workspace.
const ownerId = store.access.createUser("owner@example.com", "Ольга Владелец", await hashPassword("demo-password-1"));
store.access.setAssignments(ownerId, [{ role_id: "builtin:owner", tenant_id: "*" }]);
const analystId = store.access.createUser("analyst@example.com", "Алексей Аналитик", await hashPassword("demo-password-1"));
store.access.setAssignments(analystId, [{ role_id: "builtin:analyst", tenant_id: tenantId }]);
store.access.audit({ actor_id: null, actor_label: "seed-demo", action: "user.create", target_type: "user", target_id: ownerId, tenant_id: null,
  details: { email: "owner@example.com" } });

store.close();
console.log(`Demo data written to ${dbPath}. Workspace: ${tenantId}`);
console.log("Sign in: owner@example.com / demo-password-1 (owner), analyst@example.com / demo-password-1 (analyst, one workspace)");
