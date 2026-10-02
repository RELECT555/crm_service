import type { Config } from "../config.ts";
import { ConnectorAuthError } from "../connectors/types.ts";
import type { ConnectorRegistry } from "../connectors/registry.ts";
import { decrypt, encrypt } from "../security/crypto.ts";
import type { Job, Store } from "../storage/store.ts";

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 24 * 60 * 60_000;
/** Connections without change events (plan restrictions) are reconciled more often. */
const POLLING_STALE_AFTER_MS = 60 * 60_000;

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

/** Reconciliation: re-read everything from the start. Returns false if a sync is already in flight. */
export function queueFullSync(store: Store, registry: ConnectorRegistry, connectionId: string): boolean {
  return store.transaction(() => {
    if (store.hasActiveSync(connectionId)) return false;
    store.resetCheckpoints(connectionId);
    store.resetEventsBound(connectionId);
    store.setConnectionStatus(connectionId, "backfilling");
    queueInitialSync(store, registry, connectionId);
    return true;
  });
}

/**
 * Single-process job runner. Job types:
 * - `bind`  register provider change notifications;
 * - `sync`  read one page of a kind, upsert it and persist the cursor in the same transaction;
 * - `fetch` refetch (or tombstone) one record named by a change event; a record that no longer exists is skipped.
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
    this.reconcileTimer = setInterval(() => {
      const now = Date.now();
      for (const id of this.store.staleConnectionIds(now - STALE_AFTER_MS, now - POLLING_STALE_AFTER_MS)) {
        queueFullSync(this.store, this.registry, id);
      }
    }, 15 * 60_000);
    void this.tick();
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
          this.store.failJob(job.id);
          this.store.setConnectionStatus(job.connection_id, "reauthorization_required", message);
        } else if (job.attempts >= MAX_ATTEMPTS) {
          this.store.failJob(job.id);
          this.store.setConnectionStatus(job.connection_id, "degraded", message);
        } else {
          this.store.retryJob(job, Math.min(60_000, 500 * 2 ** job.attempts));
        }
      }
      return true;
    } finally { this.running = false; }
  }

  private async run(job: Job): Promise<void> {
    const connection = this.store.getConnection(job.connection_id);
    if (!connection) throw new Error("Connection missing");
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
        this.store.completeJob(job.id);
      });
      return;
    }
    const page = await connector.listPage(connection, job.kind, job.cursor);
    if (page.next !== null && page.next === job.cursor) throw new Error("Sync cursor did not advance");
    // Records, cursor and the follow-up job commit together so a crash never skips or double-advances a page.
    this.store.transaction(() => {
      for (const item of page.items) this.store.upsertRecord(connection, item, seal(item.payload));
      this.store.saveCheckpoint(connection.id, job.kind, page.next, page.next === null);
      if (page.next !== null) this.store.enqueue(connection.id, "sync", job.kind, page.next);
      this.store.completeJob(job.id);
      this.store.refreshSyncState(connection.id);
    });
  }
}
