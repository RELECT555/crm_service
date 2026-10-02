import { ConnectorUpstreamError } from "../types.ts";

export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectorUpstreamError("Unexpected Pipedrive response shape");
  return value as JsonObject;
}
export function valueString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
export function requiredString(value: unknown, field: string): string {
  const result = valueString(value);
  if (!result) throw new ConnectorUpstreamError(`Missing Pipedrive ${field}`);
  return result;
}
/** Pipedrive wraps results as `{ success, data, additional_data }`; `data` is a list for list endpoints. */
export function dataList(body: JsonObject | null): JsonObject[] {
  const items = body?.data;
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new ConnectorUpstreamError("Unexpected Pipedrive list");
  return items.map(object);
}
