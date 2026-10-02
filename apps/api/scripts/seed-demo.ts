// Fills a local SQLite database with demo workspaces and a Bitrix24 connection so the admin UI can be
// developed and shown without a real CRM. Tokens are fake: never point this at a production database.
//   npm run seed:demo -w @crm/api            (uses DB_PATH and DATA_KEY_BASE64 from apps/api/.env)
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { digest, encrypt } from "../src/security/crypto.ts";
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
store.markEventsBound(loading.id);
const counts: Array<[string, "commercial" | "work" | "context", number]> =
  [["pipeline", "context", 4], ["stage", "context", 27], ["deal", "commercial", 1284], ["contact", "context", 3120], ["activity", "work", 4150]];
store.transaction(() => {
  for (const [kind, axis, total] of counts) {
    for (let index = 1; index <= total; index++) {
      store.upsertRecord(loading, { kind, externalId: String(index), axis, payload: {} }, encrypt(dataKey, "{}"));
    }
  }
});
store.setCommercialSource(loading.id, 2, "3", "purchase", "opportunity", "currencyId");
store.setCommercialSource(loading.id, 180, "*", "sale", "ufCrmAmount", "ufCrmCurrency");
store.setActionType(loading.id, "TRAVEL", "visit");

// A connection whose token was revoked.
const revoked = addConnection("sv-moscow.bitrix24.ru", "demo-member-2");
store.setConnectionStatus(revoked.id, "reauthorization_required", "Bitrix OAuth failed: invalid_grant");

store.close();
console.log(`Demo data written to ${dbPath}. Workspace: ${tenantId}`);
