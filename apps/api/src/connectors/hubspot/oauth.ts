import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { object, requiredString, valueString } from "./values.ts";

// OAuth 2.0 per the official SDK (npm `@hubspot/api-client` 14.0.1): consent URL from
// lib/src/discovery/oauth/OauthDiscovery.js, token and token-info endpoints from lib/codegen/oauth/apis/*.

export type HubSpotApp = { clientId: string; clientSecret: string; redirectUri: string; scopes: string };
export type HubSpotTokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type HubSpotTokenInfo = { hubId: string; hubDomain: string | undefined };

export const API_ORIGIN = "https://api.hubapi.com";

/**
 * The consent screen lets the user pick the HubSpot account. `scope` must list exactly the scopes the app requires
 * in its settings, so it comes from HUBSPOT_SCOPES instead of being guessed here.
 */
export function consentUrl(app: HubSpotApp, state: string): string {
  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("scope", app.scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

/** `POST /oauth/v1/token`, form-encoded with client_id and client_secret in the body. */
export async function requestTokens(app: HubSpotApp, grant: "authorization_code" | "refresh_token", token: string,
  fetcher: typeof fetch): Promise<HubSpotTokens> {
  const body = new URLSearchParams({ grant_type: grant, client_id: app.clientId, client_secret: app.clientSecret,
    ...(grant === "authorization_code" ? { code: token, redirect_uri: app.redirectUri } : { refresh_token: token }) });
  const response = await fetcher(`${API_ORIGIN}/oauth/v1/token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), body,
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
  });
  const json = object(await response.json().catch(() => ({})));
  if (response.status === 400 || response.status === 401) {
    throw new ConnectorAuthError(`HubSpot OAuth failed: ${response.status} ${String(json.status ?? json.error ?? "")}`.trim());
  }
  if (!response.ok) throw new ConnectorUpstreamError(`HubSpot OAuth failed: ${response.status}`);
  const expiresIn = Number(json.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new ConnectorUpstreamError("Invalid HubSpot token expiry");
  return { accessToken: requiredString(json.access_token, "access_token"), refreshToken: requiredString(json.refresh_token, "refresh_token"), expiresIn };
}

/** `GET /oauth/v1/access-tokens/{token}` names the account (hub) the token belongs to. */
export async function tokenInfo(accessToken: string, fetcher: typeof fetch): Promise<HubSpotTokenInfo> {
  const response = await fetcher(`${API_ORIGIN}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`, {
    redirect: "error", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" },
  });
  if (!response.ok) throw new ConnectorUpstreamError(`HubSpot token info failed: ${response.status}`);
  const json = object(await response.json());
  return { hubId: requiredString(json.hub_id, "hub_id"), hubDomain: valueString(json.hub_domain)?.toLowerCase() };
}
