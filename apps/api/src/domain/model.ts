// Canonical, provider-neutral model. Nothing in this file may mention a specific CRM.

/** Analytical axis: money-bearing outcomes, non-commercial work, or reference data. */
export type Axis = "commercial" | "work" | "context";

/** Direction of a commercial item. Purchases always come from an explicit mapping, never from guessing. */
export type CommercialDirection = "sale" | "purchase" | "unclassified";

export const CONNECTION_STATUSES = ["connecting", "backfilling", "live", "degraded",
  "reauthorization_required", "disconnected"] as const;
export type ConnectionStatus = typeof CONNECTION_STATUSES[number];

/**
 * One source record after provider mapping. `kind` is the connector's object kind (for example `deal`,
 * `activity`, `smart:128`); `externalId` is the provider ID as a string. Identity is
 * (tenant, connection, kind, externalId). `payload` is the minimized source copy stored encrypted.
 */
export type CanonicalRecord = {
  kind: string;
  externalId: string;
  axis: Axis;
  direction?: CommercialDirection | string;
  actionType?: string;
  status?: string;
  ownerId?: string;
  targetKind?: string;
  targetId?: string;
  amount?: number;
  currency?: string;
  label?: string;
  sourceUpdatedAt?: string;
  payload: unknown;
};

/** One page of a backfill or reconciliation read. `next` is an opaque cursor; null means the kind is complete. */
export type SyncPage = { items: CanonicalRecord[]; next: string | null };

/** A provider change notification reduced to what the sync engine needs. It is a hint to refetch, not data. */
export type ChangeEvent = { accountId: string; kind: string; externalId: string; operation: "upsert" | "delete" };
