import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AggregateRow, OwnerLabel } from "../domain/analytics.ts";
import type { CanonicalRecord } from "../domain/model.ts";
import { AccessStore } from "./access.ts";

export type Connection = {
  id: string; tenant_id: string; provider: string;
  /** Stable provider account identity (Bitrix24 member_id, HubSpot portal ID, ...). */
  account_id: string;
  /** Normalized account address shown to operators (portal host, subdomain, org URL). */
  account: string;
  access_token_enc: string; refresh_token_enc: string; expires_at: number;
  webhook_secret_hash: string; webhook_secret_enc: string; events_bound: number;
  /** `webhook`: provider pushes change events; `polling`: events unavailable, freshness comes from reconciliation. */
  events_mode: EventsMode | null;
  /** Non-secret provider settings captured at authorization (JSON), e.g. account currency. */
  settings: string | null;
  status: string; last_sync: number | null;
  last_error: string | null; created_at: number | null;
  /** When the last full sync was queued (any reason); spaces out automatic retries of degraded connections. */
  reconcile_at: number | null;
};
export type EventsMode = "webhook" | "polling";
export type ConnectionSummary = Pick<Connection, "id" | "provider" | "account_id" | "account" | "status" |
  "last_sync" | "last_error" | "created_at" | "events_mode"> & {
  /** Live (not deleted) records per axis and backfill progress, for overview cards. */
  records: number; commercial: number; work: number; kinds_done: number; kinds_total: number;
};
export type Tenant = { id: string; name: string | null; created_at: number; timezone: string | null; currency: string | null };
export type JobSummary = { id: string; type: string; kind: string; status: string; attempts: number;
  error: string | null; created_at: number; finished_at: number | null };
/** Operator rule: records of `source_kind` (optionally one pipeline) are sales or purchases. */
export type CommercialMapping = { source_kind: string; category_id: string; direction: "sale" | "purchase";
  amount_field: string | null; currency_field: string | null };
export type TenantSummary = { id: string; name: string | null; created_at: number;
  connections: number; live: number; attention: number };
export type Job = {
  id: string; connection_id: string; type: "sync" | "fetch" | "bind";
  kind: string; cursor: string | null; external_id: string | null;
  /** fetch: `upsert`/`delete` from a change event, or `verify` from a deletion check. */
  operation: string | null; attempts: number;
  /** sync: when this full pass of the kind started (set on its first page, copied to later pages). */
  pass_started_at: number | null;
};

const DAY_MS = 24 * 60 * 60_000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;

export class Store {
  readonly db: DatabaseSync;
  /** Users, roles, sessions and the audit log (storage/access.ts). */
  readonly access: AccessStore;
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
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'bitrix24', account_id TEXT NOT NULL,
        account TEXT NOT NULL, access_token_enc TEXT NOT NULL, refresh_token_enc TEXT NOT NULL,
        expires_at INTEGER NOT NULL, webhook_secret_hash TEXT NOT NULL, webhook_secret_enc TEXT NOT NULL,
        status TEXT NOT NULL, events_bound INTEGER NOT NULL DEFAULT 0, last_sync INTEGER, last_error TEXT,
        created_at INTEGER, events_mode TEXT, settings TEXT,
        UNIQUE(tenant_id, provider, account_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id));
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
      CREATE TABLE IF NOT EXISTS commercial_mappings (
        connection_id TEXT NOT NULL, source_kind TEXT NOT NULL, category_id TEXT NOT NULL,
        direction TEXT NOT NULL, amount_field TEXT, currency_field TEXT,
        PRIMARY KEY(connection_id, source_kind, category_id));
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
    this.addColumn("connections", "events_mode", "TEXT");
    this.addColumn("connections", "settings", "TEXT");
    this.addColumn("oauth_states", "actor_id", "TEXT");
    this.addColumn("oauth_states", "actor_label", "TEXT");
    this.addColumn("tenants", "timezone", "TEXT");
    this.addColumn("tenants", "currency", "TEXT");
    this.addColumn("jobs", "error", "TEXT");
    this.addColumn("jobs", "finished_at", "INTEGER");
    this.addColumn("jobs", "pass_started_at", "INTEGER");
    this.addColumn("connections", "reconcile_at", "INTEGER");
    this.migrateCommercialSources();
    this.access = new AccessStore(this.db);
  }

  /** v1 stored Bitrix24 entityTypeId (2 = deals, >= 128 = smart processes); v2 stores the connector's object kind. */
  private migrateCommercialSources(): void {
    const legacy = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='commercial_sources'").get();
    if (!legacy) return;
    this.transaction(() => {
      this.db.exec(`INSERT OR IGNORE INTO commercial_mappings
        SELECT connection_id, CASE WHEN entity_type_id=2 THEN 'deal' ELSE 'smart:' || entity_type_id END,
          category_id, direction, amount_field, currency_field FROM commercial_sources`);
      this.db.exec("DROP TABLE commercial_sources");
    });
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
  /** Updates only the provided fields; `null` clears timezone or currency. */
  updateTenant(id: string, fields: Partial<Pick<Tenant, "name" | "timezone" | "currency">>): void {
    for (const [column, value] of Object.entries(fields)) {
      if (!["name", "timezone", "currency"].includes(column) || value === undefined) continue;
      this.db.prepare(`UPDATE tenants SET ${column}=? WHERE id=?`).run(value, id);
    }
  }
  listTenants(): TenantSummary[] {
    return this.db.prepare(`SELECT t.id,t.name,t.created_at,COUNT(c.id) AS connections,
      COALESCE(SUM(c.status='live'),0) AS live,
      COALESCE(SUM(c.status IN ('degraded','reauthorization_required','disconnected')),0) AS attention
      FROM tenants t LEFT JOIN connections c ON c.tenant_id=t.id
      GROUP BY t.id ORDER BY t.created_at DESC`).all() as TenantSummary[];
  }
  getTenant(id: string): Tenant | null {
    const row = this.db.prepare("SELECT id,name,created_at,timezone,currency FROM tenants WHERE id=?").get(id);
    return row ? { ...row } as Tenant : null;
  }
  tenantExists(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM tenants WHERE id=?").get(id);
  }
  saveState(hash: string, tenantId: string, provider: string, account: string,
    actor: { actor_id: string | null; actor_label: string }): void {
    this.db.prepare(`INSERT INTO oauth_states (state_hash,tenant_id,account,created_at,provider,actor_id,actor_label)
      VALUES (?,?,?,?,?,?,?)`).run(hash, tenantId, account, Date.now(), provider, actor.actor_id, actor.actor_label);
  }
  /** Single-use: the state row is deleted on read and expires after 10 minutes. */
  consumeState(hash: string): { tenant_id: string; provider: string; account: string;
    actor_id: string | null; actor_label: string | null } | null {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT tenant_id,provider,account,created_at,actor_id,actor_label FROM oauth_states WHERE state_hash=?").get(hash) as
        { tenant_id: string; provider: string; account: string; created_at: number; actor_id: string | null; actor_label: string | null } | undefined;
      this.db.prepare("DELETE FROM oauth_states WHERE state_hash=?").run(hash);
      if (!row || Date.now() - row.created_at > OAUTH_STATE_TTL_MS) return null;
      return { tenant_id: row.tenant_id, provider: row.provider, account: row.account, actor_id: row.actor_id, actor_label: row.actor_label };
    });
  }
  saveConnection(input: Omit<Connection, "status" | "events_bound" | "events_mode" | "last_sync" | "last_error" | "created_at" | "settings"
    | "reconcile_at">
    & { settings?: string | null }): void {
    this.db.prepare(`INSERT INTO connections
      (id,tenant_id,provider,account_id,account,access_token_enc,refresh_token_enc,expires_at,webhook_secret_hash,webhook_secret_enc,status,created_at,settings)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.id, input.tenant_id, input.provider, input.account_id, input.account,
      input.access_token_enc, input.refresh_token_enc, input.expires_at, input.webhook_secret_hash,
      input.webhook_secret_enc, "backfilling", Date.now(), input.settings ?? null);
  }
  updateSettings(id: string, settings: string | null): void {
    this.db.prepare("UPDATE connections SET settings=? WHERE id=?").run(settings, id);
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
    return this.db.prepare(`SELECT c.id,c.provider,c.account_id,c.account,c.status,c.last_sync,c.last_error,c.created_at,c.events_mode,
        COALESCE(r.records,0) AS records, COALESCE(r.commercial,0) AS commercial, COALESCE(r.work,0) AS work,
        COALESCE(k.done,0) AS kinds_done, COALESCE(k.total,0) AS kinds_total
      FROM connections c
      LEFT JOIN (SELECT connection_id, COUNT(*) AS records, SUM(axis='commercial') AS commercial, SUM(axis='work') AS work
        FROM records WHERE tenant_id=? AND deleted=0 GROUP BY connection_id) r ON r.connection_id=c.id
      LEFT JOIN (SELECT connection_id, SUM(completed_at IS NOT NULL) AS done, COUNT(*) AS total
        FROM checkpoints GROUP BY connection_id) k ON k.connection_id=c.id
      WHERE c.tenant_id=? ORDER BY c.created_at`).all(tenantId, tenantId).map(row => ({ ...row })) as ConnectionSummary[];
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
  markEventsBound(connectionId: string, mode: EventsMode): void {
    this.db.prepare("UPDATE connections SET events_bound=1,events_mode=? WHERE id=?").run(mode, connectionId);
  }
  resetEventsBound(connectionId: string): void {
    this.db.prepare("UPDATE connections SET events_bound=0 WHERE id=?").run(connectionId);
  }
  /**
   * Connections due for a scheduled full sync: live ones whose last completed sync is older than their cadence
   * (polling connections, without change events, are due sooner), and degraded ones whose last attempt is older than
   * `degradedBefore` so they recover without an operator but do not retry in a tight loop.
   */
  staleConnectionIds(cutoffs: { webhookBefore: number; pollingBefore: number; degradedBefore: number }): string[] {
    return (this.db.prepare(`SELECT id FROM connections WHERE
      (status='live' AND COALESCE(last_sync,0) < CASE WHEN events_mode='polling' THEN ? ELSE ? END)
      OR (status='degraded' AND COALESCE(reconcile_at,0) < ?)`)
      .all(cutoffs.pollingBefore, cutoffs.webhookBefore, cutoffs.degradedBefore) as Array<{ id: string }>).map(row => row.id);
  }
  markReconcileQueued(connectionId: string): void {
    this.db.prepare("UPDATE connections SET reconcile_at=? WHERE id=?").run(Date.now(), connectionId);
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
  /** Next page of a sync pass; keeps the pass start so the last page can check for deletions. */
  enqueueNextPage(job: Job, cursor: string): void {
    this.db.prepare(`INSERT INTO jobs (id,connection_id,type,kind,cursor,status,run_after,created_at,pass_started_at)
      VALUES (?,?,'sync',?,?,'queued',?,?,?)`)
      .run(randomUUID(), job.connection_id, job.kind, cursor, Date.now(), Date.now(), job.pass_started_at);
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
    this.db.prepare("UPDATE jobs SET status='done',error=NULL,finished_at=? WHERE id=?").run(Date.now(), id);
  }
  retryJob(job: Job, delayMs: number, error: string): void {
    this.db.prepare("UPDATE jobs SET status='queued',run_after=?,error=? WHERE id=?").run(Date.now() + delayMs, error, job.id);
  }
  failJob(id: string, error: string): void {
    this.db.prepare("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=?").run(error, Date.now(), id);
  }
  /** Stops pending work for a disconnected connection; a job already running finishes and is ignored by the worker. */
  cancelPendingJobs(connectionId: string): number {
    return Number(this.db.prepare("UPDATE jobs SET status='cancelled',finished_at=? WHERE connection_id=? AND status='queued'")
      .run(Date.now(), connectionId).changes);
  }
  cancelJob(id: string): void {
    this.db.prepare("UPDATE jobs SET status='cancelled',finished_at=? WHERE id=?").run(Date.now(), id);
  }
  /** Most recent jobs first, for the connection activity log. */
  listJobs(connectionId: string, limit = 30): JobSummary[] {
    return this.db.prepare(`SELECT id,type,kind,status,attempts,error,created_at,finished_at FROM jobs
      WHERE connection_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(connectionId, limit).map(row => ({ ...row })) as JobSummary[];
  }
  recordEvent(connectionId: string, eventDigest: string): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO ingest_events VALUES (?,?,?)")
      .run(connectionId, eventDigest, Date.now());
    return result.changes === 1;
  }
  setCommercialMapping(connectionId: string, mapping: CommercialMapping): void {
    this.db.prepare(`INSERT INTO commercial_mappings VALUES (?,?,?,?,?,?)
      ON CONFLICT(connection_id,source_kind,category_id) DO UPDATE SET
      direction=excluded.direction,amount_field=excluded.amount_field,currency_field=excluded.currency_field`)
      .run(connectionId, mapping.source_kind, mapping.category_id, mapping.direction, mapping.amount_field, mapping.currency_field);
  }
  /** The mapping for one pipeline wins over the kind-wide (`*`) mapping. */
  getCommercialMapping(connectionId: string, sourceKind: string, categoryId: string): CommercialMapping | null {
    return (this.db.prepare(`SELECT source_kind,category_id,direction,amount_field,currency_field FROM commercial_mappings
      WHERE connection_id=? AND source_kind=? AND category_id IN (?,'*')
      ORDER BY CASE WHEN category_id=? THEN 0 ELSE 1 END LIMIT 1`)
      .get(connectionId, sourceKind, categoryId, categoryId) as CommercialMapping | undefined) ?? null;
  }
  deleteCommercialMapping(connectionId: string, sourceKind: string, categoryId: string): boolean {
    return this.db.prepare("DELETE FROM commercial_mappings WHERE connection_id=? AND source_kind=? AND category_id=?")
      .run(connectionId, sourceKind, categoryId).changes === 1;
  }
  hasCommercialMapping(connectionId: string, sourceKind: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM commercial_mappings WHERE connection_id=? AND source_kind=?").get(connectionId, sourceKind);
  }
  listCommercialMappings(connectionId: string): CommercialMapping[] {
    return this.db.prepare(`SELECT source_kind,category_id,direction,amount_field,currency_field FROM commercial_mappings
      WHERE connection_id=? ORDER BY source_kind,category_id`).all(connectionId).map(row => ({ ...row })) as CommercialMapping[];
  }
  mappedSourceKinds(connectionId: string): string[] {
    return (this.db.prepare("SELECT DISTINCT source_kind FROM commercial_mappings WHERE connection_id=? ORDER BY source_kind")
      .all(connectionId) as Array<{ source_kind: string }>).map(row => row.source_kind);
  }
  /** Extra source fields a connector must select so mapped amount/currency fields are present. */
  mappedFields(connectionId: string, sourceKind: string): string[] {
    const rows = this.db.prepare("SELECT amount_field,currency_field FROM commercial_mappings WHERE connection_id=? AND source_kind=?")
      .all(connectionId, sourceKind) as Array<{ amount_field: string | null; currency_field: string | null }>;
    return [...new Set(rows.flatMap(row => [row.amount_field, row.currency_field]).filter((field): field is string => !!field))];
  }
  /** Labeled reference records of one kind (e.g. pipelines) for operator pickers. */
  listLabels(tenantId: string, connectionId: string, kind: string): Array<{ id: string; label: string }> {
    return this.db.prepare(`SELECT external_id AS id, COALESCE(label, external_id) AS label FROM records
      WHERE tenant_id=? AND connection_id=? AND kind=? AND deleted=0 ORDER BY label`).all(tenantId, connectionId, kind) as
      Array<{ id: string; label: string }>;
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
  /**
   * Live records of `kind` not observed since `passStartedAt`. Every upsert (page or fetch) refreshes observed_at,
   * so after a full pass these are exactly the records the pass did not see.
   */
  unseenRecords(connectionId: string, kind: string, passStartedAt: number): { ids: string[]; live: number } {
    const ids = (this.db.prepare(`SELECT external_id FROM records WHERE connection_id=? AND kind=? AND deleted=0
      AND observed_at<? ORDER BY external_id`).all(connectionId, kind, passStartedAt) as Array<{ external_id: string }>)
      .map(row => row.external_id);
    const live = this.db.prepare("SELECT COUNT(*) AS count FROM records WHERE connection_id=? AND kind=? AND deleted=0")
      .get(connectionId, kind) as { count: number };
    return { ids, live: live.count };
  }
  /** Tombstones the records a complete listing did not return. */
  markUnseenDeleted(connectionId: string, kind: string, passStartedAt: number): number {
    return Number(this.db.prepare(`UPDATE records SET deleted=1,observed_at=? WHERE connection_id=? AND kind=?
      AND deleted=0 AND observed_at<?`).run(Date.now(), connectionId, kind, passStartedAt).changes);
  }
  /**
   * Removes bookkeeping that is no longer useful: finished jobs after 30 days (the activity log shows the latest 30),
   * webhook dedup digests after 7 days (providers stop redelivering long before), expired OAuth states and sessions.
   */
  prune(now = Date.now()): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM jobs WHERE status IN ('done','failed','cancelled') AND finished_at<?").run(now - 30 * DAY_MS);
      this.db.prepare("DELETE FROM ingest_events WHERE received_at<?").run(now - 7 * DAY_MS);
      this.db.prepare("DELETE FROM oauth_states WHERE created_at<?").run(now - OAUTH_STATE_TTL_MS);
      this.access.deleteExpiredSessions(now);
    });
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
      AND target_id IS NOT NULL AND target_kind IN (SELECT DISTINCT kind FROM records
        WHERE tenant_id=? AND connection_id=? AND axis='commercial')`)
      .get(tenantId, connectionId, tenantId, connectionId) as { count: number };
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
  /** Grouped commercial and work records for workspace analytics (all connections of the tenant). */
  analyticsRows(tenantId: string): AggregateRow[] {
    return this.db.prepare(`SELECT connection_id, owner_id, axis, direction, currency, action_type, status,
        COUNT(*) AS count, SUM(amount) AS amount,
        SUM(CASE WHEN axis='work' AND target_id IS NOT NULL AND target_kind IN
          (SELECT DISTINCT kind FROM records WHERE tenant_id=? AND axis='commercial') THEN 1 ELSE 0 END) AS linked
      FROM records WHERE tenant_id=? AND deleted=0 AND axis IN ('commercial','work')
      GROUP BY connection_id, owner_id, axis, direction, currency, action_type, status`)
      .all(tenantId, tenantId).map(row => ({ ...row })) as AggregateRow[];
  }
  /** Names of CRM users synced as `user` reference records, for manager labels. */
  ownerLabels(tenantId: string): OwnerLabel[] {
    return this.db.prepare(`SELECT connection_id, external_id, label FROM records WHERE tenant_id=? AND kind='user' AND deleted=0`)
      .all(tenantId).map(row => ({ ...row })) as OwnerLabel[];
  }
  close(): void { this.db.close(); }
}
