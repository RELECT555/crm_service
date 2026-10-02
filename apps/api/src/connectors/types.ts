import type { ChangeEvent, CanonicalRecord, SyncPage } from "../domain/model.ts";
import type { Connection, EventsMode } from "../storage/store.ts";

/** Errors a connector raises. The sync engine reacts to the class, never to provider error strings. */
export class ConnectorAuthError extends Error {}    // credentials revoked/expired: stop and ask for re-authorization
export class ConnectorInputError extends Error {}   // operator input (account address, mapping) is invalid
export class ConnectorUpstreamError extends Error {} // provider failed or answered unexpectedly: retry with backoff

/** Static description shown in the admin catalog. Claims must match docs/connectors/<id>.md. */
export type ProviderInfo = {
  id: string;
  name: string;
  /** available: adapter registered and configured; not_configured: adapter exists, app credentials missing; planned: researched only. */
  status: "available" | "not_configured" | "planned";
  /** Server environment variables the operator must set once for this provider (adapter exists). */
  requiredEnv?: string[];
  auth: "oauth2" | "api_key";
  /** What the operator types to start a connection, e.g. a portal address. */
  accountLabel: string;
  accountHint: string;
  /** Step-by-step setup for the admin UI, in the order the operator performs them. */
  setupSteps: string[];
  /** Read permissions we request; the first release never asks for write scopes. */
  scopes: string[];
  /** Source objects per analytical axis. */
  commercialData: string[];
  workData: string[];
  changeCapture: string;
  embed: string;
  limits: string;
  docsUrl: string;
};

/** Result of a successful OAuth code exchange, already validated against the expected account. */
export type AuthorizationGrant = {
  accountId: string;   // stable provider account identity (e.g. Bitrix24 member_id)
  account: string;     // normalized address shown to operators (e.g. portal host)
  accessToken: string;
  refreshToken: string;
  expiresIn: number;   // seconds
  /** Non-secret account settings worth keeping (e.g. account currency); stored as connection settings. */
  settings?: Record<string, unknown>;
};

/** What the operator may map on this connector's commercial objects; drives the admin UI form. */
export type MappingOptions = {
  /** Fixed object kinds that can be marked sale/purchase (e.g. deals). */
  sources: Array<{ kind: string; label: string }>;
  /** Optional family of custom processes addressed by numeric ID, kind = `${prefix}${id}` (e.g. Bitrix24 smart processes). */
  customSource: { prefix: string; label: string; idLabel: string; minId: number } | null;
  /** Record kind whose synced rows are offered as pipelines in the picker, or null when pipelines do not apply. */
  categoryKind: string | null;
  /** Whether amount/currency source fields can be chosen, with defaults. Null: the connector reads fixed fields. */
  fieldMapping: { amountDefault: string; currencyDefault: string } | null;
  /** Record kind holding work items whose type codes the operator maps (resynced after a mapping change). */
  activityKind: string;
  /** How the activity-type code is called in this CRM, shown next to the action-type mapping form. */
  activityCodeLabel: string;
  activityCodeHint: string;
};

/**
 * Contract every CRM adapter implements. Adapters own provider HTTP, auth, field names and pagination;
 * they return canonical records and never touch HTTP routing, job scheduling or analytics.
 */
export interface Connector {
  readonly info: ProviderInfo;

  /** Validate and normalize what the operator typed. Throw ConnectorInputError on bad input. */
  normalizeAccount(input: string): string;
  /** URL that starts the provider's consent screen for `account`. `state` is single-use and opaque. */
  authorizeUrl(account: string, state: string): string;
  /** Exchange the callback parameters for tokens and verify they belong to `expectedAccount`. */
  completeAuthorization(callback: URLSearchParams, expectedAccount: string): Promise<AuthorizationGrant>;

  /** Object kinds a full sync reads for this connection, in dependency order (reference data first). */
  syncKinds(connection: Connection): string[];
  /** Read one page. Must be deterministic for a given cursor so a retried page is idempotent. */
  listPage(connection: Connection, kind: string, cursor: string | null): Promise<SyncPage>;
  /** Refetch one record after a change event. Null when the record no longer exists (only delete events tombstone). */
  fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null>;

  /**
   * Register change notifications to `handlerUrl` (idempotent: skip already registered handlers).
   * Returns `polling` when the account cannot receive events (e.g. plan restriction); the connection then
   * relies on scheduled reconciliation.
   */
  subscribe(connection: Connection, handlerUrl: string): Promise<EventsMode>;
  /** Parse a raw webhook body into change events. An empty list means the body is not a supported event. */
  parseEvents(body: string): ChangeEvent[];
  /** Whether a verified event is in this connection's configured scope (e.g. a mapped custom process). */
  acceptsEvent(connection: Connection, event: ChangeEvent): boolean;

  /** Describes which commercial objects the operator can map and how. */
  mappingOptions(): MappingOptions;
}

/** True when `kind` is one of the connector's fixed mappable kinds or a valid custom process kind. */
export function isMappableKind(options: MappingOptions, kind: string): boolean {
  if (options.sources.some(source => source.kind === kind)) return true;
  const custom = options.customSource;
  if (!custom || !kind.startsWith(custom.prefix)) return false;
  const id = kind.slice(custom.prefix.length);
  return /^\d{1,9}$/.test(id) && Number(id) >= custom.minId;
}
