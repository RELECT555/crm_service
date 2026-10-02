import { decrypt, encrypt } from "../../security/crypto.ts";
import type { Connection, Store } from "../../storage/store.ts";
import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { type KommoApp, requestTokens } from "./oauth.ts";
import { type JsonObject, object } from "./values.ts";

/** Kommo allows at most 7 requests/second per integration (https://developers.kommo.com/docs/limitations). */
const MIN_INTERVAL_MS = 160;

/**
 * Authenticated Kommo/amoCRM API v4 transport for one connection: Bearer auth, proactive and on-401 refresh
 * (rotated refresh token persisted immediately), request spacing under the rate limit, bounded 429/5xx retries.
 * Returns null for 204 No Content and 404, which Kommo uses for empty lists and missing records.
 */
export class KommoClient {
  private app: KommoApp;
  private dataKey: Buffer;
  private store: Store;
  private fetcher: typeof fetch;
  private nextSlot = new Map<string, number>();

  constructor(app: KommoApp, dataKey: Buffer, store: Store, fetcher: typeof fetch = fetch) {
    this.app = app; this.dataKey = dataKey; this.store = store; this.fetcher = fetcher;
  }

  async get(connection: Connection, path: string, query: Record<string, string> = {}): Promise<JsonObject | null> {
    return this.request(connection, "GET", path, query);
  }

  async post(connection: Connection, path: string, body: unknown): Promise<JsonObject | null> {
    return this.request(connection, "POST", path, {}, body);
  }

  private async request(connection: Connection, method: string, path: string, query: Record<string, string>,
    body?: unknown): Promise<JsonObject | null> {
    if (!/^\/api\/v4\/[a-z0-9_/]+$/.test(path)) throw new Error("Invalid Kommo path");
    const url = new URL(`https://${connection.account}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let refreshed = false;
    if (connection.expires_at < Date.now() + 60_000) { await this.refresh(connection); refreshed = true; }
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.throttle(connection.id);
      const response = await this.fetcher(url, {
        method, redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${decrypt(this.dataKey, connection.access_token_enc)}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 && !refreshed) { await this.refresh(connection); refreshed = true; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const seconds = Number(response.headers.get("retry-after"));
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 500 * 2 ** attempt));
        continue;
      }
      if (response.status === 204 || response.status === 404) return null;
      if (response.status === 401) throw new ConnectorAuthError(`Kommo ${path} failed: 401`);
      if (!response.ok) {
        const error = new ConnectorUpstreamError(`Kommo ${path} failed: ${response.status}`);
        Object.assign(error, { status: response.status });
        throw error;
      }
      return object(await response.json());
    }
    throw new ConnectorUpstreamError(`Kommo ${path} unavailable`);
  }

  private async refresh(connection: Connection): Promise<void> {
    const tokens = await requestTokens(connection.account, this.app, "refresh_token",
      decrypt(this.dataKey, connection.refresh_token_enc), this.fetcher);
    connection.access_token_enc = encrypt(this.dataKey, tokens.accessToken);
    connection.refresh_token_enc = encrypt(this.dataKey, tokens.refreshToken);
    connection.expires_at = Date.now() + tokens.expiresIn * 1000;
    // One statement writes both tokens: the old refresh token is already invalid after rotation.
    this.store.updateTokens(connection.id, connection.access_token_enc, connection.refresh_token_enc, connection.expires_at);
  }

  private async throttle(connectionId: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(connectionId) ?? 0);
    this.nextSlot.set(connectionId, slot + MIN_INTERVAL_MS);
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  }
}
