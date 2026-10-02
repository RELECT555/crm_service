# Ingestion and TypeScript contracts

Status: target interfaces. These are design sketches. The **implemented** contract is `Connector` in [`apps/api/src/connectors/types.ts`](../apps/api/src/connectors/types.ts), explained in [code-architecture.md](code-architecture.md). When the two disagree, the code is current; move a target feature into the code contract only together with an adapter that needs it and tests.

## Implemented versus target

| Boundary | Current prototype | Target sketch below |
| --- | --- | --- |
| Adapter | `Connector`: `normalizeAccount`, `authorizeUrl`, `completeAuthorization`, `syncKinds`, `listPage`, `fetchRecord`, `subscribe`, `parseEvents`, `acceptsEvent`, `mappingOptions` | `CrmConnector` with discovery, separate source/mapping and optional bulk/stream readers |
| Records/pages/events | [`CanonicalRecord`, `SyncPage`, `ChangeEvent`](../apps/api/src/domain/model.ts); string kinds/ids, `next: string \| null`, verified account plus upsert/delete hint | Generic source records, high watermarks, richer links and event metadata |
| Storage | SQLite `records` contains canonical fields and encrypted minimized payload; checkpoints, jobs and event deduplication persist | Separate source/canonical/link/history stores, mapping versions, retention and metric snapshots |
| Lifecycle | `connecting`, `backfilling`, `live`, `degraded`, `reauthorization_required`, `disconnected` | Discovery/catch-up stages and a tested overlap strategy |
| HTTP | Routes and bodies in [api.md](api.md); operator cookie/service-key authentication | Proposed route sketch and provider-specific embedded-session exchange |

Do not copy the types, tables or paths below into code as though they already exist. Production storage, historical projections and customer/embedded authentication remain design work.

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

The implemented model already has `axis`, `direction`, `amount`, `currency`, `status`, `ownerId`, `actionType`, `targetKind`/`targetId`, and an optional source timestamp. Future revisions should add normalized metric dates, richer verified relationships and mapping/history provenance as needed; the generic `fields` sketch above does not replace those existing axes. A source record such as a Bitrix24 smart-process item may be commercial only after a customer mapping assigns its meaning.

The interface intentionally omits token values. A connector reads secrets through a scoped credential service, never by returning them in `ConnectionRef`. `list` can delegate to a bulk/export implementation. A stream-based connector such as Salesforce CDC implements a separate subscriber instead of an HTTP webhook parser. Where a provider has no timestamp-safe incremental API, use a provider-specific scan and reconciliation strategy.

## Durable records and keys

The following is a **target logical storage design**, not the prototype's table inventory. Current tables and transaction boundaries live in [`storage/store.ts`](../apps/api/src/storage/store.ts) and [`storage/access.ts`](../apps/api/src/storage/access.ts). Separate history, retention and snapshot stores below are not implemented.

For the target design, persist:

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

## Target sync state machine

`discovering` and `catching_up` below are proposed. The actual worker and its 15-minute reconciliation check are described in [code-architecture.md](code-architecture.md#connection-lifecycle); the prototype does not promise an overlap scan or historical event ordering.

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

For runnable endpoints use [api.md](api.md): connection creation is `POST /v1/tenants/:id/connect/:provider`, callbacks are `/oauth/:provider/callback`, webhooks use a per-connection secret, and disconnect/resume are explicit actions. The earlier proposed paths (`POST /connections/:provider/start`, `GET /sync-status`, `DELETE /connections/:id`, etc.) are not implemented aliases.

In the target security model, the installation key is only a routing hint; derive authority from verified callback data and the stored connection. OAuth uses state and PKCE where supported, HTTPS redirect URIs, encrypted refresh-token storage, rotation, and least-privilege read scopes. PKCE is a target requirement where supported, not a claim about the current adapters. Embed launches require provider-specific signed context or server-side token exchange and a short-lived app session; never trust a browser-supplied CRM account ID.

For every provider adapter, test: pagination boundaries, cursor resume, token expiry/refresh race, duplicate and out-of-order events, delete/restore, custom fields, 429/backoff, revoked permission, callback spoofing, account isolation, and a large backfill. Contract tests should use sanitized provider fixtures plus sandbox smoke tests. Logs must redact tokens and sensitive payload fields.
