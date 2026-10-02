import type { Config } from "../config.ts";
import { type Connector, ConnectorAuthError } from "../connectors/types.ts";
import type { ConnectorRegistry } from "../connectors/registry.ts";
import { decrypt, encrypt } from "../security/crypto.ts";
import type { Connection, Job, Store } from "../storage/store.ts";

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 24 * 60 * 60_000;
/** Connections without change events (plan restrictions) are reconciled more often. */
const POLLING_STALE_AFTER_MS = 60 * 60_000;
/** A degraded connection gets a fresh full sync at most this often, without waiting for an operator. */
const DEGRADED_RETRY_AFTER_MS = 60 * 60_000;
/**
 * A pass that would delete more than this share of a kind (and more than MASS_DELETION_MIN records) is treated as
 * a provider or access problem, not as real deletions: nothing is removed and the connection is degraded.
 */
const MASS_DELETION_SHARE = 0.5;
const MASS_DELETION_MIN = 20;

export function webhookUrl(config: Config, provider: string, secret: string): string {
  return `${config.appOrigin}/webhooks/${provider}/${secret}`;
}

/** Initial jobs for a new connection: subscribe to changes, then backfill every kind. */
export function queueInitialSync(store: Store, registry: ConnectorRegistry, connectionId: string): void {
  const connection = store.getConnection(connectionId);
  if (!connection) throw new Error("Connection missing");
  store.enqueue(connectionId, "bind", "events");
  for (const kind of registry.require(connection.provider).syncKinds(connection)) store.enqueue(connectionId, "sync", kind);
}

/**
 * Full sync: re-read every kind from the start; each finished pass also detects records deleted in the CRM.
 * Returns false if a sync is already in flight. A scheduled reconciliation of a live connection is routine and keeps
 * it `live`; operator resyncs, re-authorization and degraded recovery go through `backfilling` and re-register events.
 */
export function queueFullSync(store: Store, registry: ConnectorRegistry, connectionId: string,
  { scheduled = false }: { scheduled?: boolean } = {}): boolean {
  return store.transaction(() => {
    if (store.hasActiveSync(connectionId)) return false;
    const routine = scheduled && store.getConnection(connectionId)?.status === "live";
    store.resetCheckpoints(connectionId);
    if (!routine) {
      store.resetEventsBound(connectionId);
      store.setConnectionStatus(connectionId, "backfilling");
    }
    store.markReconcileQueued(connectionId);
    queueInitialSync(store, registry, connectionId);
    return true;
  });
}

/**
 * Single-process job runner. Job types:
 * - `bind`  register provider change notifications;
 * - `sync`  read one page of a kind, upsert it and persist the cursor in the same transaction; the last page of a
 *           pass checks for records deleted in the CRM (see checkDeletions);
 * - `fetch` refetch (or tombstone) one record: after a change event a record that no longer exists is skipped,
 *           after a deletion check (`verify`) it is tombstoned.
 */
export class Worker {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private config: Config;
  private store: Store;
  private registry: ConnectorRegistry;
  constructor(config: Config, store: Store, registry: ConnectorRegistry) {
    this.config = config; this.store = store; this.registry = registry;
  }

  start(): void {
    this.store.recoverJobs();
    this.timer = setInterval(() => { void this.tick(); }, 250);
    this.reconcileTimer = setInterval(() => this.reconcile(), 15 * 60_000);
    void this.tick();
  }

  /** Scheduled maintenance: queue due reconciliations (including degraded recovery) and prune old bookkeeping. */
  reconcile(now = Date.now()): void {
    const due = this.store.staleConnectionIds({ webhookBefore: now - STALE_AFTER_MS,
      pollingBefore: now - POLLING_STALE_AFTER_MS, degradedBefore: now - DEGRADED_RETRY_AFTER_MS });
    for (const id of due) queueFullSync(this.store, this.registry, id, { scheduled: true });
    this.store.prune(now);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  /** Runs at most one job. Returns false when the queue had nothing ready. */
  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const job = this.store.claimJob();
      if (!job) return false;
      try { await this.run(job); }
      catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown sync error";
        console.error("Sync job failed", { type: job.type, kind: job.kind, attempts: job.attempts, message });
        if (error instanceof ConnectorAuthError) {
          this.store.failJob(job.id, message);
          this.store.setConnectionStatus(job.connection_id, "reauthorization_required", message);
        } else if (job.attempts >= MAX_ATTEMPTS) {
          this.store.failJob(job.id, message);
          this.store.setConnectionStatus(job.connection_id, "degraded", message);
        } else {
          this.store.retryJob(job, Math.min(60_000, 500 * 2 ** job.attempts), message);
        }
      }
      return true;
    } finally { this.running = false; }
  }

  private async run(job: Job): Promise<void> {
    const connection = this.store.getConnection(job.connection_id);
    if (!connection) throw new Error("Connection missing");
    // A disconnected connection keeps its data but does no CRM calls; jobs created before disconnecting are dropped.
    if (connection.status === "disconnected") { this.store.cancelJob(job.id); return; }
    const connector = this.registry.require(connection.provider);
    const seal = (payload: unknown) => encrypt(this.config.dataKey, JSON.stringify(payload));
    if (job.type === "bind") {
      const secret = decrypt(this.config.dataKey, connection.webhook_secret_enc);
      const mode = await connector.subscribe(connection, webhookUrl(this.config, connection.provider, secret));
      this.store.transaction(() => {
        this.store.markEventsBound(connection.id, mode);
        this.store.completeJob(job.id);
        this.store.refreshSyncState(connection.id);
      });
      return;
    }
    if (job.type === "fetch") {
      if (!job.external_id) throw new Error("Event ID missing");
      if (job.operation === "delete") {
        this.store.transaction(() => {
          this.store.markDeleted(connection, job.kind, job.external_id!);
          this.store.completeJob(job.id);
        });
        return;
      }
      const item = await connector.fetchRecord(connection, job.kind, job.external_id);
      this.store.transaction(() => {
        if (item) this.store.upsertRecord(connection, item, seal(item.payload));
        // Only a deletion check may tombstone on "not found"; a change event's refetch just skips it.
        else if (job.operation === "verify") this.store.markDeleted(connection, job.kind, job.external_id!);
        this.store.completeJob(job.id);
      });
      return;
    }
    // The first page of a pass stamps its start before reading, so every record the pass returns is observed at or
    // after it and is never judged unseen. A record last observed in that same millisecond is not judged either (the
    // check is strict), which can only postpone a deletion to the next pass. Pages queued by an older version carry
    // no start and skip the deletion check.
    const passStartedAt = job.cursor === null ? Date.now() : job.pass_started_at;
    const page = await connector.listPage(connection, job.kind, job.cursor);
    if (page.next !== null && page.next === job.cursor) throw new Error("Sync cursor did not advance");
    // Records, cursor and the follow-up job commit together so a crash never skips or double-advances a page.
    this.store.transaction(() => {
      for (const item of page.items) this.store.upsertRecord(connection, item, seal(item.payload));
      this.store.saveCheckpoint(connection.id, job.kind, page.next, page.next === null);
      if (page.next !== null) this.store.enqueueNextPage({ ...job, pass_started_at: passStartedAt }, page.next);
      else if (passStartedAt !== null) this.checkDeletions(connection, connector, job.kind, passStartedAt);
      this.store.completeJob(job.id);
      this.store.refreshSyncState(connection.id);
    });
  }

  /**
   * Runs inside the last page's transaction. Records of `kind` not observed since the pass started were not returned
   * by the CRM: deleted there (a missed delete event) or no longer visible to the connection. Each pass carries its own
   * start, so overlapping passes of one kind cannot misjudge each other. A result that would remove most of a sizeable
   * kind is far more likely an access or provider problem than a real mass deletion: nothing is removed and the
   * connection is degraded for an operator to look at (it is retried automatically later).
   */
  private checkDeletions(connection: Connection, connector: Connector, kind: string, passStartedAt: number): void {
    const mode = connector.deletionCheck(kind);
    if (mode === "none") return;
    const { ids, live } = this.store.unseenRecords(connection.id, kind, passStartedAt);
    if (ids.length === 0) return;
    if (ids.length > MASS_DELETION_MIN && ids.length > live * MASS_DELETION_SHARE) {
      this.store.setConnectionStatus(connection.id, "degraded",
        `Deletion check for ${kind}: ${ids.length} of ${live} records missing from the CRM listing; nothing removed, check the app's CRM access`);
      return;
    }
    if (mode === "complete") this.store.markUnseenDeleted(connection.id, kind, passStartedAt);
    else for (const id of ids) this.store.enqueue(connection.id, "fetch", kind, null, id, "verify");
  }
}
