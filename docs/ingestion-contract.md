# Ingestion and TypeScript contracts

Status: target interfaces. These are design sketches, not the exact signatures of the Bitrix24 prototype in `apps/api/src/`. The implemented subset and its limits are described in [README.md](../README.md).

## Connector boundary

The core orchestrator owns tenant identity, schedules, retries, storage, and metric rebuilds. An adapter owns provider OAuth, API calls, pagination, event parsing/verification, field mapping, and capability reporting. Avoid a lowest-common-denominator API that hides provider-specific constraints. Optional features are explicit capabilities.

```ts
type Provider =
  | "bitrix24" | "kommo" | "hubspot" | "pipedrive"
  | "salesforce" | "zoho" | "dataverse";

type ObjectKind =
  | "user" | "lead" | "contact" | "company" | "commercialItem"
  | "pipeline" | "stage" | "activity" | "task";

type ConnectionRef = {
  tenantId: string;
  connectionId: string;
  provider: Provider;
  providerAccountId: string;
};

type SourceRecord = {
  kind: ObjectKind;
  externalId: string;               // always a string, even if source ID is numeric
  sourceUpdatedAt?: string;         // ISO-8601 when the source exposes it
  payload: unknown;                 // validated by the provider adapter before mapping
};

type Page<T> = {
  items: T[];
  nextCursor?: string;              // opaque to the orchestrator
  highWatermark?: string;           // optional source timestamp/sequence
};

type ChangeHint = {
  kind: ObjectKind;
  externalId: string;
  operation: "upsert" | "delete" | "unknown";
  providerEventId?: string;
  occurredAt?: string;
};

interface CrmConnector {
  readonly provider: Provider;
  authorizeCallback(input: unknown): Promise<ConnectionRef>;
  discover(connection: ConnectionRef): Promise<{
    kinds: ObjectKind[];
    supportsEvents: boolean;
    supportsIncremental: boolean;
    supportsDeleteEvents: boolean;
  }>;
  list(connection: ConnectionRef, kind: ObjectKind, cursor?: string): Promise<Page<SourceRecord>>;
  get(connection: ConnectionRef, kind: ObjectKind, externalId: string): Promise<SourceRecord | null>;
  parseAndVerifyEvent?(rawBody: Uint8Array, headers: Headers, route: URL): Promise<{
    connection: ConnectionRef;
    hints: ChangeHint[];
  }>;
  map(connection: ConnectionRef, record: SourceRecord): Promise<CanonicalRecord>;
  // Optional: subscribe/renew/unsubscribe, CDC stream, and incremental or bulk readers.
}

type CanonicalRecord = {
  kind: ObjectKind;
  externalId: string;
  sourceUpdatedAt?: string;
  fields: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  links?: Array<{ kind: ObjectKind; externalId: string; relation: string }>;
};
```

The next canonical schema revision must make the commercial/work axes first-class: commercial direction, amount and currency, process state, actor, activity type, completion, time, and explicit links between work and outcome. A source record such as a Bitrix24 smart-process item may be commercial only after a customer mapping assigns its meaning.

The interface intentionally omits token values. A connector reads secrets through a scoped credential service, never by returning them in `ConnectionRef`. `list` can delegate to a bulk/export implementation. A stream-based connector such as Salesforce CDC implements a separate subscriber instead of an HTTP webhook parser. Where a provider has no timestamp-safe incremental API, use a provider-specific scan and reconciliation strategy.

## Durable records and keys

At minimum persist:

| Store | Key / essential fields | Purpose |
| --- | --- | --- |
| `tenants` | `tenant_id`, settings, retention policy | Customer boundary. |
| `crm_connections` | `connection_id`, `tenant_id`, provider, account ID, encrypted credential reference, scopes, status | One installed CRM account. |
| `sync_checkpoints` | connection + object + mode, opaque cursor, high watermark, run ID, committed time | Resume without skipping pages. |
| `source_records` | tenant + connection + object + external ID, source update time, deletion flag, payload reference/hash | Idempotent source state. |
| `canonical_records` | same source key, mapped fields, mapping version, sync time | Provider-independent analytics. |
| `record_links` | source key + linked key + relation | Associations. |
| `ingest_events` | connection + provider event ID or derived digest, received time, processing status | Deduplication, retries, audit. |
| `observed_changes` | source key, prior/new values, observation time, source event time if reliable | Explicitly observed history. |
| `metric_snapshots` | tenant, metric version, window, dimensions, coverage timestamp | Reproducible analytics. |

Use an actual transaction or equivalent atomic workflow for record writes and checkpoint advancement. An event acknowledgement requires a durable queue entry, not completion of the full refetch. If an incoming notification has no stable event ID, derive a bounded deduplication key from the verified connection, event type, entity ID, and delivery fields, and still make record upserts idempotent. Never let a duplicate delete resurrect data from an older event; compare source versions where reliable or refetch current state.

## Sync state machine

```text
connecting -> discovering -> backfilling -> catching_up -> live
                      |             |             |
                      +----------> degraded <------+ 
                                      |
                         reauthorization_required
                                      |
                                disconnected
```

Each object kind has its own cursor and freshness. Backfill can resume after a worker restart. A webhook can arrive during backfill; queue and replay it, then perform a short overlap scan before marking the connection live. Reconciliation frequency should be chosen after measuring data volume and provider quotas. Deletion detection may require explicit delete events, change tracking, periodic ID comparison, or a documented retention-limited API; publish gaps instead of silently claiming completeness.

## API and security boundary

Proposed public API: `POST /connections/:provider/start`, `GET /connections/:provider/callback`, `POST /webhooks/:provider/:installationKey`, `GET /connections`, `GET /sync-status`, `GET /analytics/*`, and `DELETE /connections/:id`. Exact paths and OAuth response methods are provider dependent. The installation key is only a routing hint; derive authority from verified callback data and the stored connection. OAuth uses state and PKCE where supported, HTTPS redirect URIs, encrypted refresh-token storage, rotation, and least-privilege read scopes. Embed launches require provider-specific signed context or server-side token exchange and a short-lived app session; never trust a browser-supplied CRM account ID.

For every provider adapter, test: pagination boundaries, cursor resume, token expiry/refresh race, duplicate and out-of-order events, delete/restore, custom fields, 429/backoff, revoked permission, callback spoofing, account isolation, and a large backfill. Contract tests should use sanitized provider fixtures plus sandbox smoke tests. Logs must redact tokens and sensitive payload fields.
