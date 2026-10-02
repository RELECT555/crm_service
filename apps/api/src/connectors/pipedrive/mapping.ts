import type { CanonicalRecord, ChangeEvent } from "../../domain/model.ts";
import { type JsonObject, object, requiredString, valueString } from "./values.ts";

// Pipedrive API v2 -> canonical mapping. Field names follow the official SDK models (npm `pipedrive` 33.7.0:
// v2/models/deal.d.ts, activity-item.d.ts, stage-item.d.ts, get-pipelines-response-all-of-data-inner.d.ts,
// v1/models/base-user.d.ts). Field names stay in this folder.

/**
 * Activity `type` holds the activity type's `key_string`. The default keys below are **unverified** in a sandbox
 * (the SDK only confirms matching icon keys); everything else is `other` until the operator maps its key.
 */
const DEFAULT_TYPES: Record<string, string> = { call: "call", meeting: "meeting", task: "task", email: "email" };

export function normalizeDeal(raw: JsonObject, direction: string | undefined): CanonicalRecord {
  const id = requiredString(raw.id, "deal ID");
  const value = Number(raw.value);
  return { kind: "deal", externalId: id, axis: "commercial", direction: direction ?? "sale",
    amount: Number.isFinite(value) ? value : undefined, currency: valueString(raw.currency),
    status: valueString(raw.status), ownerId: valueString(raw.owner_id), label: valueString(raw.title),
    sourceUpdatedAt: valueString(raw.update_time),
    payload: { id, value: raw.value, currency: raw.currency, status: raw.status, pipeline_id: raw.pipeline_id,
      stage_id: raw.stage_id, owner_id: raw.owner_id, won_time: raw.won_time, update_time: raw.update_time } };
}

export function normalizeActivity(raw: JsonObject, mappedType: string | null): CanonicalRecord {
  const id = requiredString(raw.id, "activity ID");
  const type = valueString(raw.type);
  const dealId = valueString(raw.deal_id);
  return { kind: "activity", externalId: id, axis: "work",
    actionType: mappedType ?? (type ? DEFAULT_TYPES[type] : undefined) ?? "other",
    status: raw.done === true ? "completed" : "open", ownerId: valueString(raw.owner_id),
    targetKind: dealId ? "deal" : undefined, targetId: dealId, sourceUpdatedAt: valueString(raw.update_time),
    payload: { id, type: raw.type, done: raw.done, owner_id: raw.owner_id, deal_id: raw.deal_id, due_date: raw.due_date,
      update_time: raw.update_time } };
}

/** Only the display name is kept: it labels managers in analytics. */
export function normalizeUser(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "user ID");
  return { kind: "user", externalId: id, axis: "context", label: valueString(raw.name), payload: { id, name: raw.name } };
}

export function normalizePipeline(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "pipeline ID");
  return { kind: "pipeline", externalId: id, axis: "context", label: valueString(raw.name), payload: { id, name: raw.name } };
}

export function normalizeStage(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "stage ID");
  return { kind: "stage", externalId: id, axis: "context", label: valueString(raw.name),
    payload: { id, name: raw.name, pipeline_id: raw.pipeline_id, order_nr: raw.order_nr } };
}

const ENTITIES: Record<string, string> = { deal: "deal", activity: "activity" };

/**
 * Webhooks v2 body: `{ meta: { action, entity, entity_id, company_id, ... }, data, previous }`. This shape comes from
 * https://pipedrive.readme.io/docs/guide-for-webhooks-v2 via search and is **unverified** in a sandbox: the SDK only
 * documents registration (`version: "2.0"`, actions create/change/delete). Anything else yields no events.
 */
export function parsePipedriveEvents(body: string): ChangeEvent[] {
  let meta: JsonObject;
  try { meta = object(object(JSON.parse(body)).meta); } catch { return []; }
  const kind = ENTITIES[valueString(meta.entity) ?? ""];
  const action = valueString(meta.action);
  const accountId = valueString(meta.company_id);
  const externalId = valueString(meta.entity_id);
  if (!kind || !accountId || !externalId || !/^\d+$/.test(externalId) || !/^\d+$/.test(accountId)) return [];
  if (action !== "create" && action !== "change" && action !== "delete") return [];
  return [{ accountId, kind, externalId, operation: action === "delete" ? "delete" : "upsert" }];
}
