import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export type Config = {
  port: number;
  dbPath: string;
  appOrigin: string;
  adminOrigin?: string;
  webDist?: string;
  bitrixClientId: string;
  bitrixClientSecret: string;
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
  const adminOrigin = env.ADMIN_ORIGIN ? new URL(env.ADMIN_ORIGIN).origin : undefined;
  return {
    port,
    adminOrigin,
    webDist: env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    dbPath: env.DB_PATH ?? "./data/crm.sqlite",
    appOrigin: appOrigin.origin,
    bitrixClientId: required("BITRIX_CLIENT_ID"),
    bitrixClientSecret: required("BITRIX_CLIENT_SECRET"),
    adminApiKey,
    dataKey,
  };
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}
