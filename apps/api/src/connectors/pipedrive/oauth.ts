import { ConnectorAuthError, ConnectorUpstreamError } from "../types.ts";
import { object, requiredString } from "./values.ts";

// OAuth 2.0 authorization code flow. Endpoints and request format follow the official Pipedrive SDK
// (npm `pipedrive` 33.7.0, dist/versions/v2/configuration.js) and https://pipedrive.readme.io/docs/marketplace-oauth-authorization.

export type PipedriveApp = { clientId: string; clientSecret: string; redirectUri: string };
export type PipedriveTokens = { accessToken: string; refreshToken: string; expiresIn: number; apiHost: string };

const OAUTH_ORIGIN = "https://oauth.pipedrive.com";

/** The consent screen lets the user pick the company; scopes are configured in the Marketplace app, not here. */
export function consentUrl(app: PipedriveApp, state: string): string {
  const url = new URL(`${OAUTH_ORIGIN}/oauth/authorize`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * The token response names the company's API origin (`api_domain`), e.g. `https://acme.pipedrive.com`. Tokens are
 * sent there, so only https origins under pipedrive.com are accepted.
 */
export function apiHost(apiDomain: unknown): string {
  let url: URL;
  try { url = new URL(requiredString(apiDomain, "api_domain")); }
  catch (error) {
    if (error instanceof ConnectorUpstreamError) throw error;
    throw new ConnectorUpstreamError("Invalid Pipedrive api_domain");
  }
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.pipedrive\.com$/.test(url.hostname) || url.port || (url.pathname !== "/" && url.pathname !== "")) {
    throw new ConnectorUpstreamError("Unexpected Pipedrive api_domain");
  }
  return url.hostname;
}

/** `POST /oauth/token`, form-encoded, client credentials in HTTP Basic auth. Access tokens last about an hour. */
export async function requestTokens(app: PipedriveApp, grant: "authorization_code" | "refresh_token", token: string,
  fetcher: typeof fetch): Promise<PipedriveTokens> {
  const body = new URLSearchParams(grant === "authorization_code"
    ? { grant_type: grant, code: token, redirect_uri: app.redirectUri } : { grant_type: grant, refresh_token: token });
  const response = await fetcher(`${OAUTH_ORIGIN}/oauth/token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), body,
    headers: { "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}` },
  });
  const json = object(await response.json().catch(() => ({})));
  if (response.status === 400 || response.status === 401) {
    throw new ConnectorAuthError(`Pipedrive OAuth failed: ${response.status} ${String(json.error ?? "")}`.trim());
  }
  if (!response.ok) throw new ConnectorUpstreamError(`Pipedrive OAuth failed: ${response.status}`);
  const expiresIn = Number(json.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new ConnectorUpstreamError("Invalid Pipedrive token expiry");
  return { accessToken: requiredString(json.access_token, "access_token"), refreshToken: requiredString(json.refresh_token, "refresh_token"),
    expiresIn, apiHost: apiHost(json.api_domain) };
}
