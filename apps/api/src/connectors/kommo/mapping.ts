import type { CanonicalRecord, ChangeEvent } from "../../domain/model.ts";
import { type JsonObject, requiredString, valueString } from "./values.ts";

// Kommo/amoCRM API v4 -> canonical mapping. Field names stay in this folder.
// Leads: https://developers.kommo.com/reference/leads-list, tasks: https://developers.kommo.com/reference/tasks-list

/** Built-in task type 2 is "Meeting". Type 1 ("Follow-up") and custom types stay `task` until the operator maps them. */
const TASK_TYPES: Record<number, string> = { 2: "meeting" };

export type LeadMapping = { direction?: string; currency?: string };

export function normalizeLead(raw: JsonObject, mapping: LeadMapping): CanonicalRecord {
  const id = requiredString(raw.id, "lead ID");
  const price = Number(raw.price);
  return { kind: "deal", externalId: id, axis: "commercial", direction: mapping.direction ?? "sale",
    amount: Number.isFinite(price) ? price : undefined, currency: mapping.currency,
    status: valueString(raw.status_id), ownerId: valueString(raw.responsible_user_id),
    sourceUpdatedAt: valueString(raw.updated_at), label: valueString(raw.name),
    payload: { id, price: raw.price, status_id: raw.status_id, pipeline_id: raw.pipeline_id,
      responsible_user_id: raw.responsible_user_id, updated_at: raw.updated_at, closed_at: raw.closed_at } };
}

export function normalizeTask(raw: JsonObject, mappedType: string | null): CanonicalRecord {
  const id = requiredString(raw.id, "task ID");
  const entityType = valueString(raw.entity_type);
  const targetKind = entityType === "leads" ? "deal" : entityType === "contacts" ? "contact" : undefined;
  return { kind: "task", externalId: id, axis: "work",
    actionType: mappedType ?? TASK_TYPES[Number(raw.task_type_id)] ?? "task",
    status: raw.is_completed === true ? "completed" : "open",
    ownerId: valueString(raw.responsible_user_id), targetKind,
    targetId: targetKind ? valueString(raw.entity_id) : undefined,
    sourceUpdatedAt: valueString(raw.updated_at),
    payload: { id, task_type_id: raw.task_type_id, is_completed: raw.is_completed, responsible_user_id: raw.responsible_user_id,
      entity_type: raw.entity_type, entity_id: raw.entity_id, complete_till: raw.complete_till, updated_at: raw.updated_at } };
}

export function normalizeContact(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "contact ID");
  return { kind: "contact", externalId: id, axis: "context", ownerId: valueString(raw.responsible_user_id),
    sourceUpdatedAt: valueString(raw.updated_at), payload: { id, responsible_user_id: raw.responsible_user_id, updated_at: raw.updated_at } };
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

export function normalizeStage(raw: JsonObject, pipelineName: string | undefined): CanonicalRecord {
  const id = requiredString(raw.id, "stage ID");
  const name = valueString(raw.name);
  return { kind: "stage", externalId: id, axis: "context", label: pipelineName && name ? `${pipelineName} · ${name}` : name,
    payload: { id, name: raw.name, pipeline_id: raw.pipeline_id, sort: raw.sort } };
}

const ENTITY_KINDS: Record<string, string> = { leads: "deal", tasks: "task", contacts: "contact" };

/**
 * Kommo posts form-encoded webhooks such as `leads[update][0][id]=…` plus `account[id]`
 * (https://developers.kommo.com/docs/webhooks-general). One body may list several entities and actions.
 * The exact account field name is **unverified** in a sandbox; `account[id]` is required here and checked against
 * the stored connection, so a body without it is rejected.
 */
export function parseKommoEvents(body: string): ChangeEvent[] {
  const fields = new URLSearchParams(body);
  const accountId = fields.get("account[id]");
  if (!accountId || !/^\d+$/.test(accountId)) return [];
  const events: ChangeEvent[] = [];
  const seen = new Set<string>();
  for (const [key, value] of fields) {
    const match = /^(leads|tasks|contacts)\[(add|update|delete|status|restore|responsible)\]\[\d+\]\[id\]$/.exec(key);
    if (!match || !/^\d+$/.test(value)) continue;
    const kind = ENTITY_KINDS[match[1]];
    const operation = match[2] === "delete" ? "delete" : "upsert";
    const dedupe = `${kind}|${value}|${operation}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    events.push({ accountId, kind, externalId: value, operation });
  }
  return events;
}
