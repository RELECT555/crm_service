import type { ChangeEvent, CanonicalRecord, SyncPage } from "../domain/model.ts";
import type { Connection } from "../storage/store.ts";

/** Errors a connector raises. The sync engine reacts to the class, never to provider error strings. */
export class ConnectorAuthError extends Error {}    // credentials revoked/expired: stop and ask for re-authorization
export class ConnectorInputError extends Error {}   // operator input (account address, mapping) is invalid
export class ConnectorUpstreamError extends Error {} // provider failed or answered unexpectedly: retry with backoff

/** Static description shown in the admin catalog. Claims must match docs/connectors/<id>.md. */
export type ProviderInfo = {
  id: string;
  name: string;
  status: "available" | "planned";
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
  /** Refetch one record after a change event. */
  fetchRecord(connection: Connection, kind: string, externalId: string): Promise<CanonicalRecord | null>;

  /** Register change notifications to `handlerUrl` (idempotent: skip already registered handlers). */
  subscribe(connection: Connection, handlerUrl: string): Promise<void>;
  /** Parse a raw webhook body. Return null when it is not a supported event. */
  parseEvent(body: string): ChangeEvent | null;
  /** Whether a verified event is in this connection's configured scope (e.g. a mapped custom process). */
  acceptsEvent(connection: Connection, event: ChangeEvent): boolean;
}
