import { ConnectorUpstreamError } from "../types.ts";

// Defensive readers for Bitrix24 JSON. Bitrix returns IDs as numbers or strings depending on the method.
export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectorUpstreamError("Unexpected Bitrix response shape");
  return value as JsonObject;
}
export function valueString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
export function requiredString(value: unknown, field: string): string {
  const result = valueString(value);
  if (!result) throw new ConnectorUpstreamError(`Missing Bitrix ${field}`);
  return result;
}
