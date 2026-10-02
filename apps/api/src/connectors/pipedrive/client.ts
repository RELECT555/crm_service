import { decrypt, encrypt } from "../../security/crypto.ts";
import type { Connection, Store } from "../../storage/store.ts";
import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { type PipedriveApp, requestTokens } from "./oauth.ts";
import { type JsonObject, object } from "./values.ts";

/**
 * Our own spacing between requests per connection. Pipedrive limits are a daily company-wide budget plus per-token
 * bursts (https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting); spacing keeps a backfill from eating the
 * customer's budget in a burst. The value is a project choice, not a provider number.
 */
const MIN_INTERVAL_MS = 120;

export class PipedriveHttpError extends ConnectorUpstreamError {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/**
 * Authenticated Pipedrive transport for one connection: calls `https://{api host}/api/v1|v2/...` with a Bearer token,
 * refreshes before expiry and once on 401 (persisting the new tokens and a moved api_domain), spaces requests, and
 * retries 429/5xx with bounded backoff. 404 returns null (missing record).
 */
export class PipedriveClient {
  private app: PipedriveApp;
  private dataKey: Buffer;
  private store: Store;
  private fetcher: typeof fetch;
  private nextSlot = new Map<string, number>();

  constructor(app: PipedriveApp, dataKey: Buffer, store: Store, fetcher: typeof fetch = fetch) {
    this.app = app; this.dataKey = dataKey; this.store = store; this.fetcher = fetcher;
  }

  get(connection: Connection, path: string, query: Record<string, string> = {}): Promise<JsonObject | null> {
    return this.request(connection, "GET", path, query);
  }
  post(connection: Connection, path: string, body: unknown): Promise<JsonObject | null> {
    return this.request(connection, "POST", path, {}, body);
  }

  private async request(connection: Connection, method: string, path: string, query: Record<string, string>,
    body?: unknown): Promise<JsonObject | null> {
    if (!/^\/api\/v[12]\/[a-zA-Z0-9_/]+$/.test(path)) throw new Error("Invalid Pipedrive path");
    let refreshed = false;
    if (connection.expires_at < Date.now() + 60_000) { await this.refresh(connection); refreshed = true; }
    for (let attempt = 0; attempt < 4; attempt++) {
      const url = new URL(`https://${connection.account}${path}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      await this.throttle(connection.id);
      const response = await this.fetcher(url, {
        method, redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${decrypt(this.dataKey, connection.access_token_enc)}`, accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 && !refreshed) { await this.refresh(connection); refreshed = true; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const seconds = Number(response.headers.get("retry-after"));
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 500 * 2 ** attempt));
        continue;
      }
      if (response.status === 404) return null;
      if (response.status === 401) throw new ConnectorAuthError(`Pipedrive ${path} failed: 401`);
      if (!response.ok) throw new PipedriveHttpError(`Pipedrive ${path} failed: ${response.status}`, response.status);
      return object(await response.json());
    }
    throw new ConnectorUpstreamError(`Pipedrive ${path} unavailable`);
  }

  private async refresh(connection: Connection): Promise<void> {
    const tokens = await requestTokens(this.app, "refresh_token", decrypt(this.dataKey, connection.refresh_token_enc), this.fetcher);
    connection.access_token_enc = encrypt(this.dataKey, tokens.accessToken);
    connection.refresh_token_enc = encrypt(this.dataKey, tokens.refreshToken);
    connection.expires_at = Date.now() + tokens.expiresIn * 1000;
    this.store.updateTokens(connection.id, connection.access_token_enc, connection.refresh_token_enc, connection.expires_at);
    // "Always use the latest api_domain from token responses": the company's API host can move.
    if (tokens.apiHost !== connection.account) {
      connection.account = tokens.apiHost;
      this.store.updateAccount(connection.id, tokens.apiHost);
    }
  }

  private async throttle(connectionId: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(connectionId) ?? 0);
    this.nextSlot.set(connectionId, slot + MIN_INTERVAL_MS);
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  }
}
