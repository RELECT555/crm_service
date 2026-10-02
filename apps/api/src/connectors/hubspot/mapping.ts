import type { CanonicalRecord } from "../../domain/model.ts";
import { type JsonObject, properties, requiredString, valueString } from "./values.ts";

// HubSpot CRM v3 -> canonical mapping. Object paths and response shapes follow the official SDK (npm
// `@hubspot/api-client` 14.0.1: crm/deals, crm/objects/{calls,meetings,tasks,emails}, crm/owners, crm/pipelines).
// Property names below are HubSpot internal names; the SDK does not list them, so they are **unverified** in a
// sandbox. Field names stay in this folder.

export const DEAL_PROPERTIES = ["dealname", "amount", "deal_currency_code", "pipeline", "dealstage", "hubspot_owner_id",
  "closedate", "hs_lastmodifieddate"];
/** Engagement objects read as work. The object type is the action type, except tasks (see hs_task_type). */
export const ENGAGEMENTS: Record<string, { path: string; properties: string[] }> = {
  call: { path: "calls", properties: ["hubspot_owner_id", "hs_timestamp", "hs_call_status", "hs_lastmodifieddate"] },
  meeting: { path: "meetings", properties: ["hubspot_owner_id", "hs_timestamp", "hs_meeting_outcome", "hs_lastmodifieddate"] },
  task: { path: "tasks", properties: ["hubspot_owner_id", "hs_timestamp", "hs_task_status", "hs_task_type", "hs_lastmodifieddate"] },
  email: { path: "emails", properties: ["hubspot_owner_id", "hs_timestamp", "hs_lastmodifieddate"] },
};
/** Task types with an obvious canonical equivalent (**unverified** values); others stay `task` unless mapped. */
const TASK_TYPES: Record<string, string> = { CALL: "call", EMAIL: "email", TODO: "task" };

export function normalizeDeal(raw: JsonObject, direction: string | undefined): CanonicalRecord {
  const id = requiredString(raw.id, "deal ID");
  const props = properties(raw);
  const amount = Number(props.amount);
  return { kind: "deal", externalId: id, axis: "commercial", direction: direction ?? "sale",
    amount: props.amount !== null && props.amount !== undefined && props.amount !== "" && Number.isFinite(amount) ? amount : undefined,
    currency: valueString(props.deal_currency_code), status: valueString(props.dealstage), ownerId: valueString(props.hubspot_owner_id),
    label: valueString(props.dealname), sourceUpdatedAt: valueString(raw.updatedAt) ?? valueString(props.hs_lastmodifieddate),
    payload: { id, amount: props.amount, deal_currency_code: props.deal_currency_code, pipeline: props.pipeline,
      dealstage: props.dealstage, hubspot_owner_id: props.hubspot_owner_id, closedate: props.closedate } };
}

/** First associated deal, if the response carried `associations.deals`. */
function associatedDeal(raw: JsonObject): string | undefined {
  const associations = raw.associations && typeof raw.associations === "object" ? raw.associations as JsonObject : null;
  const deals = associations?.deals && typeof associations.deals === "object" ? associations.deals as JsonObject : null;
  const first = Array.isArray(deals?.results) ? deals.results[0] as JsonObject | undefined : undefined;
  return valueString(first?.id);
}

/** Completion per object (**unverified** property values); emails are records of sent mail, so they count as done. */
function completed(kind: string, props: JsonObject): boolean {
  if (kind === "task") return props.hs_task_status === "COMPLETED";
  if (kind === "call") return props.hs_call_status === "COMPLETED";
  if (kind === "meeting") return props.hs_meeting_outcome === "COMPLETED";
  return kind === "email";
}

export function normalizeEngagement(kind: string, raw: JsonObject, mappedTaskType: string | null): CanonicalRecord {
  const id = requiredString(raw.id, `${kind} ID`);
  const props = properties(raw);
  const taskType = valueString(props.hs_task_type);
  const dealId = associatedDeal(raw);
  return { kind, externalId: id, axis: "work",
    actionType: kind === "task" ? mappedTaskType ?? (taskType ? TASK_TYPES[taskType] : undefined) ?? "task" : kind,
    status: completed(kind, props) ? "completed" : "open", ownerId: valueString(props.hubspot_owner_id),
    targetKind: dealId ? "deal" : undefined, targetId: dealId,
    sourceUpdatedAt: valueString(raw.updatedAt) ?? valueString(props.hs_lastmodifieddate),
    payload: { id, hubspot_owner_id: props.hubspot_owner_id, hs_timestamp: props.hs_timestamp, hs_task_status: props.hs_task_status,
      hs_task_type: props.hs_task_type, hs_call_status: props.hs_call_status, hs_meeting_outcome: props.hs_meeting_outcome, deal: dealId } };
}

/** Owners label managers; only the name is kept (no e-mail). */
export function normalizeOwner(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "owner ID");
  const name = [valueString(raw.firstName), valueString(raw.lastName)].filter(Boolean).join(" ").trim();
  return { kind: "user", externalId: id, axis: "context", label: name || undefined, payload: { id, firstName: raw.firstName, lastName: raw.lastName } };
}

export function normalizePipeline(raw: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "pipeline ID");
  return { kind: "pipeline", externalId: id, axis: "context", label: valueString(raw.label), payload: { id, label: raw.label } };
}

export function normalizeStage(raw: JsonObject, pipeline: JsonObject): CanonicalRecord {
  const id = requiredString(raw.id, "stage ID");
  const label = valueString(raw.label);
  const pipelineLabel = valueString(pipeline.label);
  return { kind: "stage", externalId: id, axis: "context", label: pipelineLabel && label ? `${pipelineLabel} · ${label}` : label,
    payload: { id, label: raw.label, pipeline: pipeline.id, displayOrder: raw.displayOrder } };
}
