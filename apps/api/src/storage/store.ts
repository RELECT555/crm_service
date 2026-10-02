import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { CanonicalRecord } from "../domain/model.ts";

export type Connection = {
  id: string; tenant_id: string; provider: string;
  /** Stable provider account identity (Bitrix24 member_id, HubSpot portal ID, ...). */
  account_id: string;
  /** Normalized account address shown to operators (portal host, subdomain, org URL). */
  account: string;
  access_token_enc: string; refresh_token_enc: string; expires_at: number;
  webhook_secret_hash: string; webhook_secret_enc: string; events_bound: number;
  status: string; last_sync: number | null;
  last_error: string | null; created_at: number | null;
};
export type ConnectionSummary = Pick<Connection, "id" | "provider" | "account_id" | "account" | "status" |
  "last_sync" | "last_error" | "created_at">;
export type TenantSummary = { id: string; name: string | null; created_at: number;
  connections: number; live: number; attention: number };
export type Job = {
  id: string; connection_id: string; type: "sync" | "fetch" | "bind";
  kind: string; cursor: string | null; external_id: string | null;
  operation: string | null; attempts: number;
};

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account TEXT NOT NULL,
        created_at INTEGER NOT NULL, FOREIGN KEY(tenant_id) REFERENCES tenants(id));
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL,
        account TEXT NOT NULL, access_token_enc TEXT NOT NULL, refresh_token_enc TEXT NOT NULL,
        expires_at INTEGER NOT NULL, webhook_secret_hash TEXT NOT NULL, webhook_secret_enc TEXT NOT NULL,
        status TEXT NOT NULL, events_bound INTEGER NOT NULL DEFAULT 0, last_sync INTEGER, last_error TEXT,
        UNIQUE(tenant_id, account_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id));
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, type TEXT NOT NULL,
        kind TEXT NOT NULL, cursor TEXT, external_id TEXT, operation TEXT,
        status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        run_after INTEGER NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY(connection_id) REFERENCES connections(id));
      CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, run_after);
      CREATE TABLE IF NOT EXISTS records (
        tenant_id TEXT NOT NULL, connection_id TEXT NOT NULL, kind TEXT NOT NULL,
        external_id TEXT NOT NULL, axis TEXT NOT NULL, direction TEXT, action_type TEXT,
        status TEXT, owner_id TEXT, target_kind TEXT, target_id TEXT, amount REAL,
        currency TEXT, label TEXT, source_updated_at TEXT, payload_enc TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0, observed_at INTEGER NOT NULL,
        PRIMARY KEY(connection_id, kind, external_id),
        FOREIGN KEY(connection_id) REFERENCES connections(id));
      CREATE INDEX IF NOT EXISTS records_tenant ON records(tenant_id, connection_id, axis, deleted);
      CREATE TABLE IF NOT EXISTS checkpoints (
        connection_id TEXT NOT NULL, kind TEXT NOT NULL, cursor TEXT,
        completed_at INTEGER, PRIMARY KEY(connection_id, kind));
      CREATE TABLE IF NOT EXISTS ingest_events (
        connection_id TEXT NOT NULL, digest TEXT NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY(connection_id, digest));
      CREATE TABLE IF NOT EXISTS commercial_sources (
        connection_id TEXT NOT NULL, entity_type_id INTEGER NOT NULL, category_id TEXT NOT NULL,
        direction TEXT NOT NULL, amount_field TEXT NOT NULL, currency_field TEXT NOT NULL,
        PRIMARY KEY(connection_id, entity_type_id, category_id));
      CREATE TABLE IF NOT EXISTS action_types (
        connection_id TEXT NOT NULL, provider_type_id TEXT NOT NULL, action_type TEXT NOT NULL,
        PRIMARY KEY(connection_id, provider_type_id));
    `);
    // Forward-only migrations for databases created by earlier prototype versions.
    this.renameColumn("connections", "member_id", "account_id");
    this.renameColumn("connections", "portal", "account");
    this.renameColumn("oauth_states", "portal", "account");
    this.addColumn("oauth_states", "provider", "TEXT NOT NULL DEFAULT 'bitrix24'");
    this.addColumn("tenants", "name", "TEXT");
    this.addColumn("connections", "provider", "TEXT NOT NULL DEFAULT 'bitrix24'");
    this.addColumn("connections", "created_at", "INTEGER");
  }

  private columns(table: string): string[] {
    return (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name);
  }
  private renameColumn(table: string, from: string, to: string): void {
    if (this.columns(table).includes(from)) this.db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
  private addColumn(table: string, column: string, definition: string): void {
    if (!this.columns(table).includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  createTenant(name: string | null = null): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO tenants (id,created_at,name) VALUES (?,?,?)").run(id, Date.now(), name);
    return id;
  }
  renameTenant(id: string, name: string): void {
    this.db.prepare("UPDATE tenants SET name=? WHERE id=?").run(name, id);
  }
  listTenants(): TenantSummary[] {
    return this.db.prepare(`SELECT t.id,t.name,t.created_at,COUNT(c.id) AS connections,
      COALESCE(SUM(c.status='live'),0) AS live,
      COALESCE(SUM(c.status IN ('degraded','reauthorization_required','disconnected')),0) AS attention
      FROM tenants t LEFT JOIN connections c ON c.tenant_id=t.id
      GROUP BY t.id ORDER BY t.created_at DESC`).all() as TenantSummary[];
  }
  getTenant(id: string): { id: string; name: string | null; created_at: number } | null {
    return (this.db.prepare("SELECT id,name,created_at FROM tenants WHERE id=?").get(id) as
      { id: string; name: string | null; created_at: number } | undefined) ?? null;
  }
  tenantExists(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM tenants WHERE id=?").get(id);
  }
  saveState(hash: string, tenantId: string, provider: string, account: string): void {
    this.db.prepare("INSERT INTO oauth_states (state_hash,tenant_id,account,created_at,provider) VALUES (?,?,?,?,?)")
      .run(hash, tenantId, account, Date.now(), provider);
  }
  /** Single-use: the state row is deleted on read and expires after 10 minutes. */
  consumeState(hash: string): { tenant_id: string; provider: string; account: string } | null {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT tenant_id,provider,account,created_at FROM oauth_states WHERE state_hash=?").get(hash) as
        { tenant_id: string; provider: string; account: string; created_at: number } | undefined;
      this.db.prepare("DELETE FROM oauth_states WHERE state_hash=?").run(hash);
      if (!row || Date.now() - row.created_at > 10 * 60_000) return null;
      return { tenant_id: row.tenant_id, provider: row.provider, account: row.account };
    });
  }
  saveConnection(input: Omit<Connection, "status" | "events_bound" | "last_sync" | "last_error" | "created_at">): void {
    this.db.prepare(`INSERT INTO connections
      (id,tenant_id,provider,account_id,account,access_token_enc,refresh_token_enc,expires_at,webhook_secret_hash,webhook_secret_enc,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.id, input.tenant_id, input.provider, input.account_id, input.account,
      input.access_token_enc, input.refresh_token_enc, input.expires_at, input.webhook_secret_hash,
      input.webhook_secret_enc, "backfilling", Date.now());
  }
  getConnectionByAccount(tenantId: string, provider: string, accountId: string): Connection | null {
    return (this.db.prepare("SELECT * FROM connections WHERE tenant_id=? AND provider=? AND account_id=?")
      .get(tenantId, provider, accountId) as
      Connection | undefined) ?? null;
  }
  getConnection(id: string): Connection | null {
    return (this.db.prepare("SELECT * FROM connections WHERE id=?").get(id) as Connection | undefined) ?? null;
  }
  getConnectionForTenant(tenantId: string, id: string): Connection | null {
    return (this.db.prepare("SELECT * FROM connections WHERE tenant_id=? AND id=?").get(tenantId, id) as Connection | undefined) ?? null;
  }
  getConnectionByWebhookHash(hash: string): Connection | null {
    return (this.db.prepare("SELECT * FROM connections WHERE webhook_secret_hash=?").get(hash) as Connection | undefined) ?? null;
  }
  listConnections(tenantId: string): ConnectionSummary[] {
    return this.db.prepare(`SELECT id,provider,account_id,account,status,last_sync,last_error,created_at
      FROM connections WHERE tenant_id=? ORDER BY created_at`).all(tenantId) as ConnectionSummary[];
  }
  connectionOverview(tenantId: string, connectionId: string): unknown {
    const records = this.db.prepare(`SELECT kind,axis,COUNT(*) AS count,MAX(observed_at) AS observed_at FROM records
      WHERE tenant_id=? AND connection_id=? AND deleted=0 GROUP BY kind,axis ORDER BY axis,kind`).all(tenantId, connectionId);
    const jobs = this.db.prepare(`SELECT status,COUNT(*) AS count FROM jobs WHERE connection_id=? AND status<>'done'
      GROUP BY status`).all(connectionId) as Array<{ status: string; count: number }>;
    const coverage = this.db.prepare("SELECT kind,cursor,completed_at FROM checkpoints WHERE connection_id=? ORDER BY kind")
      .all(connectionId);
    const pending = this.db.prepare(`SELECT DISTINCT kind FROM jobs WHERE connection_id=? AND type='sync'
      AND status IN ('queued','running') ORDER BY kind`).all(connectionId) as Array<{ kind: string }>;
    return { records, coverage, syncingKinds: pending.map(row => row.kind),
      queue: Object.fromEntries(jobs.map(row => [row.status, row.count])) };
  }
  updateTokens(id: string, access: string, refresh: string, expiresAt: number): void {
    this.db.prepare("UPDATE connections SET access_token_enc=?,refresh_token_enc=?,expires_at=? WHERE id=?")
      .run(access, refresh, expiresAt, id);
  }
  updateAccount(id: string, account: string): void {
    this.db.prepare("UPDATE connections SET account=? WHERE id=?").run(account, id);
  }
  setConnectionStatus(id: string, status: string, error: string | null = null): void {
    this.db.prepare("UPDATE connections SET status=?,last_error=? WHERE id=?").run(status, error, id);
  }
  markEventsBound(connectionId: string): void {
    this.db.prepare("UPDATE connections SET events_bound=1 WHERE id=?").run(connectionId);
  }
  resetEventsBound(connectionId: string): void {
    this.db.prepare("UPDATE connections SET events_bound=0 WHERE id=?").run(connectionId);
  }
  staleConnectionIds(before: number): string[] {
    return (this.db.prepare("SELECT id FROM connections WHERE status='live' AND last_sync<?")
      .all(before) as Array<{ id: string }>).map(row => row.id);
  }
  hasActiveSync(connectionId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM jobs WHERE connection_id=? AND type='sync' AND status IN ('queued','running') LIMIT 1")
      .get(connectionId);
  }
  resetCheckpoints(connectionId: string): void {
    this.db.prepare("DELETE FROM checkpoints WHERE connection_id=?").run(connectionId);
  }
  enqueue(connectionId: string, type: Job["type"], kind: string, cursor: string | null = null,
    externalId: string | null = null, operation: string | null = null, runAfter = Date.now()): string {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO jobs
      (id,connection_id,type,kind,cursor,external_id,operation,status,run_after,created_at)
      VALUES (?,?,?,?,?,?,?,'queued',?,?)`)
      .run(id, connectionId, type, kind, cursor, externalId, operation, runAfter, Date.now());
    return id;
  }
  claimJob(): Job | null {
    return this.transaction(() => {
      const job = this.db.prepare("SELECT * FROM jobs WHERE status='queued' AND run_after<=? ORDER BY created_at LIMIT 1")
        .get(Date.now()) as Job | undefined;
      if (!job) return null;
      this.db.prepare("UPDATE jobs SET status='running',attempts=attempts+1 WHERE id=?").run(job.id);
      return { ...job, attempts: job.attempts + 1 };
    });
  }
  recoverJobs(): void {
    this.db.prepare("UPDATE jobs SET status='queued' WHERE status='running'").run();
  }
  completeJob(id: string): void {
    this.db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(id);
  }
  retryJob(job: Job, delayMs: number): void {
    this.db.prepare("UPDATE jobs SET status='queued',run_after=? WHERE id=?").run(Date.now() + delayMs, job.id);
  }
  failJob(id: string): void {
    this.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(id);
  }
  recordEvent(connectionId: string, eventDigest: string): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO ingest_events VALUES (?,?,?)")
      .run(connectionId, eventDigest, Date.now());
    return result.changes === 1;
  }
  setCommercialSource(connectionId: string, entityTypeId: number, categoryId: string,
    direction: string, amountField: string, currencyField: string): void {
    this.db.prepare(`INSERT INTO commercial_sources VALUES (?,?,?,?,?,?)
      ON CONFLICT(connection_id,entity_type_id,category_id) DO UPDATE SET
      direction=excluded.direction,amount_field=excluded.amount_field,currency_field=excluded.currency_field`)
      .run(connectionId, entityTypeId, categoryId, direction, amountField, currencyField);
  }
  getCommercialSource(connectionId: string, entityTypeId: number, categoryId: string):
    { direction: string; amount_field: string; currency_field: string } | null {
    return (this.db.prepare(`SELECT direction,amount_field,currency_field FROM commercial_sources
      WHERE connection_id=? AND entity_type_id=? AND category_id IN (?,'*')
      ORDER BY CASE WHEN category_id=? THEN 0 ELSE 1 END LIMIT 1`)
      .get(connectionId, entityTypeId, categoryId, categoryId) as
      { direction: string; amount_field: string; currency_field: string } | undefined) ?? null;
  }
  deleteCommercialSource(connectionId: string, entityTypeId: number, categoryId: string): boolean {
    return this.db.prepare("DELETE FROM commercial_sources WHERE connection_id=? AND entity_type_id=? AND category_id=?")
      .run(connectionId, entityTypeId, categoryId).changes === 1;
  }
  hasCommercialType(connectionId: string, entityTypeId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM commercial_sources WHERE connection_id=? AND entity_type_id=?")
      .get(connectionId, entityTypeId);
  }
  listCommercialSources(connectionId: string): unknown[] {
    return this.db.prepare(`SELECT entity_type_id,category_id,direction,amount_field,currency_field FROM commercial_sources
      WHERE connection_id=? ORDER BY entity_type_id,category_id`).all(connectionId);
  }
  listSmartTypeIds(connectionId: string): number[] {
    return (this.db.prepare("SELECT DISTINCT entity_type_id FROM commercial_sources WHERE connection_id=? AND entity_type_id>=128")
      .all(connectionId) as Array<{ entity_type_id: number }>).map(row => row.entity_type_id);
  }
  commercialFields(connectionId: string, entityTypeId: number): string[] {
    const rows = this.db.prepare("SELECT amount_field,currency_field FROM commercial_sources WHERE connection_id=? AND entity_type_id=?")
      .all(connectionId, entityTypeId) as Array<{ amount_field: string; currency_field: string }>;
    return [...new Set(rows.flatMap(row => [row.amount_field, row.currency_field]))];
  }
  setActionType(connectionId: string, providerTypeId: string, actionType: string): void {
    this.db.prepare(`INSERT INTO action_types VALUES (?,?,?)
      ON CONFLICT(connection_id,provider_type_id) DO UPDATE SET action_type=excluded.action_type`)
      .run(connectionId, providerTypeId, actionType);
  }
  listActionTypes(connectionId: string): unknown[] {
    return this.db.prepare("SELECT provider_type_id,action_type FROM action_types WHERE connection_id=? ORDER BY provider_type_id")
      .all(connectionId);
  }
  deleteActionType(connectionId: string, providerTypeId: string): boolean {
    return this.db.prepare("DELETE FROM action_types WHERE connection_id=? AND provider_type_id=?")
      .run(connectionId, providerTypeId).changes === 1;
  }
  getActionType(connectionId: string, providerTypeId: string): string | null {
    const row = this.db.prepare("SELECT action_type FROM action_types WHERE connection_id=? AND provider_type_id=?")
      .get(connectionId, providerTypeId) as { action_type: string } | undefined;
    return row?.action_type ?? null;
  }
  upsertRecord(connection: Connection, item: CanonicalRecord, encryptedPayload: string): void {
    this.db.prepare(`INSERT INTO records
      (tenant_id,connection_id,kind,external_id,axis,direction,action_type,status,owner_id,
       target_kind,target_id,amount,currency,label,source_updated_at,payload_enc,deleted,observed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
      ON CONFLICT(connection_id,kind,external_id) DO UPDATE SET
       axis=excluded.axis,direction=excluded.direction,action_type=excluded.action_type,
       status=excluded.status,owner_id=excluded.owner_id,target_kind=excluded.target_kind,
       target_id=excluded.target_id,amount=excluded.amount,currency=excluded.currency,
       label=excluded.label,source_updated_at=excluded.source_updated_at,
       payload_enc=excluded.payload_enc,deleted=0,observed_at=excluded.observed_at`)
      .run(connection.tenant_id, connection.id, item.kind, item.externalId, item.axis,
        item.direction ?? null, item.actionType ?? null, item.status ?? null, item.ownerId ?? null,
        item.targetKind ?? null, item.targetId ?? null, item.amount ?? null, item.currency ?? null,
        item.label ?? null, item.sourceUpdatedAt ?? null, encryptedPayload, Date.now());
  }
  markDeleted(connection: Connection, kind: string, externalId: string): void {
    this.db.prepare("UPDATE records SET deleted=1,observed_at=? WHERE connection_id=? AND kind=? AND external_id=?")
      .run(Date.now(), connection.id, kind, externalId);
  }
  saveCheckpoint(connectionId: string, kind: string, cursor: string | null, complete: boolean): void {
    this.db.prepare(`INSERT INTO checkpoints VALUES (?,?,?,?)
      ON CONFLICT(connection_id,kind) DO UPDATE SET cursor=excluded.cursor,completed_at=excluded.completed_at`)
      .run(connectionId, kind, cursor, complete ? Date.now() : null);
  }
  /**
   * Called after a sync or subscribe job commits. A connection becomes live once no sync job is pending,
   * every started kind has a completed checkpoint, and change notifications are registered.
   */
  refreshSyncState(connectionId: string): void {
    const pending = this.db.prepare(`SELECT 1 FROM jobs WHERE connection_id=? AND type='sync'
      AND status IN ('queued','running') LIMIT 1`).get(connectionId);
    const incomplete = this.db.prepare("SELECT 1 FROM checkpoints WHERE connection_id=? AND completed_at IS NULL LIMIT 1")
      .get(connectionId);
    if (pending || incomplete) return;
    this.db.prepare(`UPDATE connections
      SET last_sync=?,status=CASE WHEN status='backfilling' AND events_bound=1 THEN 'live' ELSE status END
      WHERE id=?`).run(Date.now(), connectionId);
  }
  dashboard(tenantId: string, connectionId: string): unknown {
    const commercial = this.db.prepare(`SELECT direction,currency,status,COUNT(*) AS count,SUM(amount) AS amount
      FROM records WHERE tenant_id=? AND connection_id=? AND axis='commercial' AND deleted=0
      GROUP BY direction,currency,status ORDER BY direction,currency,status`).all(tenantId, connectionId);
    const work = this.db.prepare(`SELECT action_type,status,COUNT(*) AS count
      FROM records WHERE tenant_id=? AND connection_id=? AND axis='work' AND deleted=0
      GROUP BY action_type,status ORDER BY action_type,status`).all(tenantId, connectionId);
    const linked = this.db.prepare(`SELECT COUNT(*) AS count FROM records
      WHERE tenant_id=? AND connection_id=? AND axis='work' AND deleted=0
      AND (target_kind='deal' OR target_kind LIKE 'smart:%') AND target_id IS NOT NULL`)
      .get(tenantId, connectionId) as { count: number };
    const coverage = this.db.prepare("SELECT kind,cursor,completed_at FROM checkpoints WHERE connection_id=? ORDER BY kind")
      .all(connectionId);
    const commercialByOwner = this.db.prepare(`SELECT owner_id,direction,currency,COUNT(*) AS count,SUM(amount) AS amount
      FROM records WHERE tenant_id=? AND connection_id=? AND axis='commercial' AND deleted=0
      GROUP BY owner_id,direction,currency ORDER BY owner_id,direction,currency`)
      .all(tenantId, connectionId) as Array<{ owner_id: string | null; direction: string | null;
        currency: string | null; count: number; amount: number | null }>;
    const workByOwner = this.db.prepare(`SELECT owner_id,action_type,COUNT(*) AS count
      FROM records WHERE tenant_id=? AND connection_id=? AND axis='work' AND deleted=0
      GROUP BY owner_id,action_type ORDER BY owner_id,action_type`)
      .all(tenantId, connectionId) as Array<{ owner_id: string | null; action_type: string | null; count: number }>;
    const ownerIds = new Set([...commercialByOwner.map(row => row.owner_id), ...workByOwner.map(row => row.owner_id)]);
    const byOwner = [...ownerIds].map(ownerId => ({ ownerId,
      commercial: commercialByOwner.filter(row => row.owner_id === ownerId).map(({ owner_id: _owner, ...row }) => row),
      work: workByOwner.filter(row => row.owner_id === ownerId).map(({ owner_id: _owner, ...row }) => row),
    }));
    return { metricVersion: 1, commercial, work, linkedWorkItems: linked.count, byOwner, coverage };
  }
  close(): void { this.db.close(); }
}
