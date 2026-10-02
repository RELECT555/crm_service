import type { Connection, Store } from "../../storage/store.ts";
import { decrypt, encrypt } from "../../security/crypto.ts";
import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { type BitrixAppCredentials, exchangeToken, normalizePortal } from "./oauth.ts";
import { type JsonObject, object, valueString } from "./values.ts";

/**
 * Authenticated Bitrix24 REST transport for one connection: refreshes the access token before expiry or once
 * on `expired_token`, persists rotated tokens encrypted, and retries 429/5xx with bounded backoff.
 */
export class BitrixClient {
  private app: BitrixAppCredentials;
  private dataKey: Buffer;
  private store: Store;
  private fetcher: typeof fetch;
  constructor(app: BitrixAppCredentials, dataKey: Buffer, store: Store, fetcher: typeof fetch = fetch) {
    this.app = app; this.dataKey = dataKey; this.store = store; this.fetcher = fetcher;
  }

  async call(connection: Connection, method: string, params: JsonObject = {}): Promise<JsonObject> {
    if (!/^[a-z][a-z0-9.]+$/.test(method)) throw new Error("Invalid Bitrix method");
    let access = decrypt(this.dataKey, connection.access_token_enc);
    const refresh = async () => {
      const refreshed = await exchangeToken(this.app, "refresh_token",
        decrypt(this.dataKey, connection.refresh_token_enc), this.fetcher);
      if (refreshed.member_id !== connection.account_id) throw new ConnectorAuthError("Bitrix account changed during refresh");
      access = refreshed.access_token;
      connection.access_token_enc = encrypt(this.dataKey, access);
      connection.refresh_token_enc = encrypt(this.dataKey, refreshed.refresh_token);
      connection.expires_at = Date.now() + refreshed.expires_in * 1000;
      const refreshedPortal = normalizePortal(new URL(refreshed.client_endpoint).hostname);
      if (refreshedPortal !== connection.account) {
        connection.account = refreshedPortal;
        this.store.updateAccount(connection.id, refreshedPortal);
      }
      this.store.updateTokens(connection.id, connection.access_token_enc, connection.refresh_token_enc, connection.expires_at);
    };
    let refreshedOnce = false;
    if (connection.expires_at < Date.now() + 60_000) { await refresh(); refreshedOnce = true; }
    const endpoint = new URL(`https://${connection.account}/rest/${method}`);
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.fetcher(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...params, auth: access }), signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 3) {
          const seconds = Number(response.headers.get("retry-after"));
          await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds * 1000, 10_000) : 500 * 2 ** attempt));
          continue;
        }
      }
      const body = object(await response.json());
      if (body.error === "expired_token" && !refreshedOnce) {
        await refresh(); refreshedOnce = true; continue;
      }
      if (!response.ok || body.error) {
        const code = valueString(body.error) ?? String(response.status);
        if (/expired_token|invalid_token|no_auth_found/i.test(code)) {
          throw new ConnectorAuthError(`Bitrix ${method} failed: ${code}`);
        }
        throw new ConnectorUpstreamError(`Bitrix ${method} failed: ${code}`);
      }
      return body;
    }
    throw new ConnectorUpstreamError(`Bitrix ${method} unavailable`);
  }
}
