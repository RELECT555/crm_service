import { ConnectorUpstreamError } from "../types.ts";

export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectorUpstreamError("Unexpected Kommo response shape");
  return value as JsonObject;
}
export function valueString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
export function requiredString(value: unknown, field: string): string {
  const result = valueString(value);
  if (!result) throw new ConnectorUpstreamError(`Missing Kommo ${field}`);
  return result;
}
/** Kommo nests list items under `_embedded.<name>`; a missing key means an empty list. */
export function embedded(body: JsonObject | null, name: string): JsonObject[] {
  const items = body && typeof body._embedded === "object" && body._embedded ? (body._embedded as JsonObject)[name] : undefined;
  if (items === undefined) return [];
  if (!Array.isArray(items)) throw new ConnectorUpstreamError(`Unexpected Kommo ${name} list`);
  return items.map(object);
}
