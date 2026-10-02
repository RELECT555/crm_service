import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export type Config = {
  port: number;
  dbPath: string;
  appOrigin: string;
  adminOrigin?: string;
  webDist?: string;
  /** OAuth application credentials per provider. A provider without credentials shows as "not configured". */
  bitrixClientId?: string;
  bitrixClientSecret?: string;
  kommoClientId?: string;
  kommoClientSecret?: string;
  amocrmClientId?: string;
  amocrmClientSecret?: string;
  pipedriveClientId?: string;
  pipedriveClientSecret?: string;
  hubspotClientId?: string;
  hubspotClientSecret?: string;
  /** Space-separated scopes exactly as required in the HubSpot app settings (the consent URL must match them). */
  hubspotScopes?: string;
  adminApiKey: string;
  dataKey: Buffer;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing ${name}; see .env.example`);
    return value;
  };
  const appOrigin = new URL(required("APP_ORIGIN"));
  if (appOrigin.protocol !== "https:" && appOrigin.hostname !== "localhost") {
    throw new Error("APP_ORIGIN must use HTTPS except on localhost");
  }
  const dataKey = Buffer.from(required("DATA_KEY_BASE64"), "base64");
  if (dataKey.length !== 32) throw new Error("DATA_KEY_BASE64 must encode 32 bytes");
  const adminApiKey = required("ADMIN_API_KEY");
  if (adminApiKey.length < 32) throw new Error("ADMIN_API_KEY must be at least 32 characters");
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  // Provider app credentials are optional, but an ID without its secret (or vice versa) is a configuration error.
  const pair = (idName: string, secretName: string): [string | undefined, string | undefined] => {
    const id = env[idName] || undefined;
    const secret = env[secretName] || undefined;
    if (!!id !== !!secret) throw new Error(`Set both ${idName} and ${secretName}, or neither`);
    return [id, secret];
  };
  const [bitrixClientId, bitrixClientSecret] = pair("BITRIX_CLIENT_ID", "BITRIX_CLIENT_SECRET");
  const [kommoClientId, kommoClientSecret] = pair("KOMMO_CLIENT_ID", "KOMMO_CLIENT_SECRET");
  const [amocrmClientId, amocrmClientSecret] = pair("AMOCRM_CLIENT_ID", "AMOCRM_CLIENT_SECRET");
  const [pipedriveClientId, pipedriveClientSecret] = pair("PIPEDRIVE_CLIENT_ID", "PIPEDRIVE_CLIENT_SECRET");
  const [hubspotClientId, hubspotClientSecret] = pair("HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET");
  const hubspotScopes = env.HUBSPOT_SCOPES?.trim().split(/\s+/).filter(Boolean).join(" ") || undefined;
  if (hubspotScopes && !/^[a-z0-9._ -]+$/i.test(hubspotScopes)) throw new Error("HUBSPOT_SCOPES must be space-separated scope names");
  const adminOrigin = env.ADMIN_ORIGIN ? new URL(env.ADMIN_ORIGIN).origin : undefined;
  return {
    port,
    adminOrigin,
    webDist: env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    dbPath: env.DB_PATH ?? "./data/crm.sqlite",
    appOrigin: appOrigin.origin,
    bitrixClientId, bitrixClientSecret,
    kommoClientId, kommoClientSecret,
    amocrmClientId, amocrmClientSecret,
    pipedriveClientId, pipedriveClientSecret,
    hubspotClientId, hubspotClientSecret, hubspotScopes,
    adminApiKey,
    dataKey,
  };
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}
