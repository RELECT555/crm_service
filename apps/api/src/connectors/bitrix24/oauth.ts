import { ConnectorAuthError, ConnectorInputError, ConnectorUpstreamError } from "../types.ts";
import { object, requiredString, valueString } from "./values.ts";

// OAuth for a Bitrix24 marketplace/local application: https://apidocs.bitrix24.com/api-reference/
export type BitrixTokens = {
  access_token: string; refresh_token: string; expires_in: number;
  client_endpoint: string; member_id: string; scope?: string;
};
export type BitrixAppCredentials = { clientId: string; clientSecret: string };

/** Accepts `company.bitrix24.ru` or `https://company.bitrix24.ru/` and returns the bare host. */
export function normalizePortal(value: string): string {
  let url: URL;
  try { url = new URL(value.trim().includes("://") ? value.trim() : `https://${value.trim()}`); }
  catch { throw new ConnectorInputError("Portal must be a public *.bitrix24.com or *.bitrix24.ru HTTPS host"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
      !/^[a-z0-9-]+\.bitrix24\.(com|ru)$/.test(host)) {
    throw new ConnectorInputError("Portal must be a public *.bitrix24.com or *.bitrix24.ru HTTPS host");
  }
  return host;
}

export function authorizeUrl(portal: string, clientId: string, state: string): string {
  const url = new URL(`https://${normalizePortal(portal)}/oauth/authorize/`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeToken(app: BitrixAppCredentials, grant: "authorization_code" | "refresh_token", token: string,
  fetcher: typeof fetch): Promise<BitrixTokens> {
  const url = new URL("https://oauth.bitrix.info/oauth/token/");
  url.searchParams.set("grant_type", grant);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("client_secret", app.clientSecret);
  url.searchParams.set(grant === "authorization_code" ? "code" : "refresh_token", token);
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
  const body = object(await response.json());
  if (!response.ok || body.error) {
    const code = valueString(body.error) ?? String(response.status);
    if (/invalid_grant|invalid_token|expired_token|no_auth_found/i.test(code)) {
      throw new ConnectorAuthError(`Bitrix OAuth failed: ${code}`);
    }
    throw new ConnectorUpstreamError(`Bitrix OAuth failed: ${code}`);
  }
  const result: BitrixTokens = {
    access_token: requiredString(body.access_token, "access_token"),
    refresh_token: requiredString(body.refresh_token, "refresh_token"),
    expires_in: Number(body.expires_in),
    client_endpoint: requiredString(body.client_endpoint, "client_endpoint"),
    member_id: requiredString(body.member_id, "member_id"),
    scope: valueString(body.scope),
  };
  if (!Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new ConnectorUpstreamError("Invalid Bitrix token expiry");
  const endpoint = new URL(result.client_endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
      !endpoint.pathname.startsWith("/rest/") || endpoint.search || endpoint.hash) {
    throw new ConnectorUpstreamError("Invalid Bitrix client endpoint");
  }
  normalizePortal(endpoint.hostname);
  return result;
}
