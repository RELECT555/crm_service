import { ConnectorUpstreamError } from "../types.ts";

export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectorUpstreamError("Unexpected HubSpot response shape");
  return value as JsonObject;
}
export function valueString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
export function requiredString(value: unknown, field: string): string {
  const result = valueString(value);
  if (!result) throw new ConnectorUpstreamError(`Missing HubSpot ${field}`);
  return result;
}
/** HubSpot list responses: `{ results: [...], paging?: { next?: { after } } }`. */
export function results(body: JsonObject | null): JsonObject[] {
  const items = body?.results;
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new ConnectorUpstreamError("Unexpected HubSpot list");
  return items.map(object);
}
/** Cursor of the next page, or null on the last page. */
export function nextAfter(body: JsonObject | null): string | null {
  const paging = body?.paging && typeof body.paging === "object" ? body.paging as JsonObject : null;
  const next = paging?.next && typeof paging.next === "object" ? paging.next as JsonObject : null;
  return valueString(next?.after) ?? null;
}
/** CRM objects keep their fields under `properties`. */
export function properties(row: JsonObject): JsonObject {
  return row.properties && typeof row.properties === "object" ? row.properties as JsonObject : {};
}

