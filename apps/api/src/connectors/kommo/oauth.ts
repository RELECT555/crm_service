import { ConnectorAuthError, ConnectorInputError, ConnectorUpstreamError } from "../types.ts";
import type { KommoPlatform } from "./platforms.ts";
import { object, requiredString } from "./values.ts";

export type KommoApp = { clientId: string; clientSecret: string; redirectUri: string };
export type KommoTokens = { accessToken: string; refreshToken: string; expiresIn: number };

/** Accepts `company`, `company.kommo.com` or `https://company.kommo.com/` and returns the account host. */
export function normalizeAccountHost(platform: KommoPlatform, value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withHost = /^[a-z0-9-]+$/.test(trimmed) ? `${trimmed}.${platform.domains[0]}` : trimmed;
  let url: URL;
  try { url = new URL(withHost.includes("://") ? withHost : `https://${withHost}`); }
  catch { throw new ConnectorInputError(`Account must be a ${platform.name} subdomain`); }
  const host = url.hostname;
  const valid = url.protocol === "https:" && !url.username && !url.password && !url.port && url.pathname === "/" &&
    !url.search && !url.hash && platform.domains.some(domain => new RegExp(`^[a-z0-9-]+\\.${domain.replace(".", "\\.")}$`).test(host));
  if (!valid) throw new ConnectorInputError(`Account must be a ${platform.name} subdomain (${platform.domains.map(d => `*.${d}`).join(", ")})`);
  return host;
}

export function consentUrl(platform: KommoPlatform, clientId: string, state: string): string {
  const url = new URL(platform.consentUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("mode", "post_message");
  return url.toString();
}

/**
 * Authorization-code and refresh grants at `https://{account}/oauth2/access_token`
 * (https://developers.kommo.com/reference/get-token). Refresh tokens rotate on every refresh: callers must
 * persist the returned refresh token before using the access token.
 */
export async function requestTokens(host: string, app: KommoApp, grant: "authorization_code" | "refresh_token", token: string,
  fetcher: typeof fetch): Promise<KommoTokens> {
  const response = await fetcher(`https://${host}/oauth2/access_token`, {
    method: "POST", headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: grant,
      [grant === "authorization_code" ? "code" : "refresh_token"]: token, redirect_uri: app.redirectUri }),
  });
  const body = object(await response.json().catch(() => ({})));
  if (response.status === 400 || response.status === 401) {
    throw new ConnectorAuthError(`Kommo OAuth failed: ${response.status} ${String(body.hint ?? body.title ?? "")}`.trim());
  }
  if (!response.ok) throw new ConnectorUpstreamError(`Kommo OAuth failed: ${response.status}`);
  const expiresIn = Number(body.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new ConnectorUpstreamError("Invalid Kommo token expiry");
  return { accessToken: requiredString(body.access_token, "access_token"),
    refreshToken: requiredString(body.refresh_token, "refresh_token"), expiresIn };
}
