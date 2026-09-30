import type { Config } from "./config.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { BitrixAuthError, BitrixClient } from "./bitrix.ts";
import type { Job, Store } from "./store.ts";

export const SYNC_KINDS = ["pipeline", "stage", "deal", "contact", "activity"] as const;

export function queueFullSync(store: Store, connectionId: string): boolean {
  return store.transaction(() => {
    if (store.hasActiveSync(connectionId)) return false;
    store.resetCheckpoints(connectionId);
    store.resetEventsBound(connectionId);
    store.setConnectionStatus(connectionId, "backfilling");
    store.enqueue(connectionId, "bind", "events");
    for (const kind of SYNC_KINDS) store.enqueue(connectionId, "sync", kind);
    for (const typeId of store.listSmartTypeIds(connectionId)) store.enqueue(connectionId, "sync", `smart:${typeId}`);
    return true;
  });
}

export class Worker {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private config: Config;
  private store: Store;
  private bitrix: BitrixClient;
  constructor(config: Config, store: Store, bitrix: BitrixClient) {
    this.config = config; this.store = store; this.bitrix = bitrix;
  }

  start(): void {
    this.store.recoverJobs();
    this.timer = setInterval(() => { void this.tick(); }, 250);
    this.reconcileTimer = setInterval(() => {
      for (const id of this.store.staleConnectionIds(Date.now() - 24 * 60 * 60_000)) {
        queueFullSync(this.store, id);
      }
    }, 60 * 60_000);
    void this.tick();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

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
        if (error instanceof BitrixAuthError) {
          this.store.failJob(job.id);
          this.store.setConnectionStatus(job.connection_id, "reauthorization_required", message);
        } else if (job.attempts >= 5) {
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
    if (job.type === "bind") {
      await this.bitrix.bindEvents(connection, decrypt(this.config.dataKey, connection.webhook_secret_enc));
      this.store.transaction(() => {
        this.store.markEventsBound(connection.id);
        this.store.completeJob(job.id);
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
      const item = await this.bitrix.get(connection, job.kind, job.external_id);
      this.store.transaction(() => {
        if (item) this.store.upsertRecord(connection, item, encrypt(this.config.dataKey, JSON.stringify(item.payload)));
        this.store.completeJob(job.id);
      });
      return;
    }
    const page = await this.bitrix.list(connection, job.kind, job.cursor);
    if (page.next !== null && page.next === job.cursor) throw new Error("Bitrix cursor did not advance");
    this.store.transaction(() => {
      for (const item of page.items) {
        this.store.upsertRecord(connection, item, encrypt(this.config.dataKey, JSON.stringify(item.payload)));
      }
      this.store.saveCheckpoint(connection.id, job.kind, page.next, page.next === null);
      if (page.next !== null) this.store.enqueue(connection.id, "sync", job.kind, page.next);
      this.store.completeJob(job.id);
    });
  }
}
