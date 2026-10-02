import { decrypt, encrypt } from "../../security/crypto.ts";
import type { Connection, Store } from "../../storage/store.ts";
import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { API_ORIGIN, type HubSpotApp, requestTokens } from "./oauth.ts";
import { type JsonObject, object } from "./values.ts";

/**
 * Our spacing between requests per connection (a project choice, not a provider number): HubSpot applies per-app
 * burst limits and answers 429 when they are exceeded (docs/connectors/hubspot.md).
 */
const MIN_INTERVAL_MS = 110;

/**
 * Authenticated HubSpot transport for one connection: Bearer token on api.hubapi.com, refresh before expiry and once
 * on 401, request spacing, bounded 429/5xx retries honoring Retry-After. 404 returns null (missing record).
 */
export class HubSpotClient {
  private app: HubSpotApp;
  private dataKey: Buffer;
  private store: Store;
  private fetcher: typeof fetch;
  private nextSlot = new Map<string, number>();

  constructor(app: HubSpotApp, dataKey: Buffer, store: Store, fetcher: typeof fetch = fetch) {
    this.app = app; this.dataKey = dataKey; this.store = store; this.fetcher = fetcher;
  }

  async get(connection: Connection, path: string, query: Array<[string, string]> = []): Promise<JsonObject | null> {
    if (!/^\/crm\/v3\/[a-z0-9_/]+$/.test(path)) throw new Error("Invalid HubSpot path");
    const url = new URL(API_ORIGIN + path);
    for (const [key, value] of query) url.searchParams.append(key, value);
    let refreshed = false;
    if (connection.expires_at < Date.now() + 60_000) { await this.refresh(connection); refreshed = true; }
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.throttle(connection.id);
      const response = await this.fetcher(url, {
        redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${decrypt(this.dataKey, connection.access_token_enc)}`, accept: "application/json" },
      });
      if (response.status === 401 && !refreshed) { await this.refresh(connection); refreshed = true; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const seconds = Number(response.headers.get("retry-after"));
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 500 * 2 ** attempt));
        continue;
      }
      if (response.status === 404) return null;
      if (response.status === 401) throw new ConnectorAuthError(`HubSpot ${path} failed: 401`);
      // 403 usually means a scope missing from HUBSPOT_SCOPES; retrying cannot fix it, the message says where to look.
      if (response.status === 403) throw new ConnectorUpstreamError(`HubSpot ${path} failed: 403 (check the app scopes)`);
      if (!response.ok) throw new ConnectorUpstreamError(`HubSpot ${path} failed: ${response.status}`);
      return object(await response.json());
    }
    throw new ConnectorUpstreamError(`HubSpot ${path} unavailable`);
  }

  private async refresh(connection: Connection): Promise<void> {
    const tokens = await requestTokens(this.app, "refresh_token", decrypt(this.dataKey, connection.refresh_token_enc), this.fetcher);
    connection.access_token_enc = encrypt(this.dataKey, tokens.accessToken);
    connection.refresh_token_enc = encrypt(this.dataKey, tokens.refreshToken);
    connection.expires_at = Date.now() + tokens.expiresIn * 1000;
    this.store.updateTokens(connection.id, connection.access_token_enc, connection.refresh_token_enc, connection.expires_at);
  }

  private async throttle(connectionId: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(connectionId) ?? 0);
    this.nextSlot.set(connectionId, slot + MIN_INTERVAL_MS);
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  }
}
