import type { CanonicalRecord, ChangeEvent } from "../../domain/model.ts";
import { type JsonObject, requiredString, valueString } from "./values.ts";

// Bitrix24 -> canonical mapping. Field names below are Bitrix-specific and must not leave this folder.

/** crm.activity TYPE_ID values: https://apidocs.bitrix24.com/api-reference/crm/timeline/activities/ */
const ACTIVITY_TYPES: Record<number, string> = { 1: "meeting", 2: "call", 3: "task", 4: "email", 5: "calendar", 6: "provider" };

export type RecordMapping = { direction?: string; amountField?: string; currencyField?: string; actionType?: string };

export function normalizeBitrixRecord(kind: string, raw: JsonObject, mapping: RecordMapping = {}): CanonicalRecord {
  const id = requiredString(raw.id ?? raw.ID, "record ID");
  if (kind === "deal" || kind.startsWith("smart:")) {
    const amountField = mapping.amountField ?? "opportunity";
    const currencyField = mapping.currencyField ?? "currencyId";
    const amount = Number(raw[amountField]);
    return { kind, externalId: id, axis: "commercial", direction: mapping.direction ?? "unclassified",
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: valueString(raw[currencyField]), status: valueString(raw.stageId),
      ownerId: valueString(raw.assignedById), sourceUpdatedAt: valueString(raw.updatedTime),
      payload: { id, [amountField]: raw[amountField], [currencyField]: raw[currencyField],
        stageId: raw.stageId, categoryId: raw.categoryId, assignedById: raw.assignedById,
        updatedTime: raw.updatedTime } };
  }
  if (kind === "activity") {
    const actionType = ACTIVITY_TYPES[Number(raw.TYPE_ID)] ?? "other";
    const ownerType = Number(raw.OWNER_TYPE_ID);
    const targetKind = ownerType === 2 ? "deal" : ownerType >= 128 ? `smart:${ownerType}` : undefined;
    return { kind, externalId: id, axis: "work", actionType: mapping.actionType ?? actionType,
      status: raw.COMPLETED === "Y" ? "completed" : "open",
      ownerId: valueString(raw.RESPONSIBLE_ID),
      targetKind,
      targetId: targetKind ? valueString(raw.OWNER_ID) : undefined,
      sourceUpdatedAt: valueString(raw.LAST_UPDATED),
      payload: { ID: id, TYPE_ID: raw.TYPE_ID, PROVIDER_TYPE_ID: raw.PROVIDER_TYPE_ID,
        COMPLETED: raw.COMPLETED, RESPONSIBLE_ID: raw.RESPONSIBLE_ID,
        OWNER_TYPE_ID: raw.OWNER_TYPE_ID, OWNER_ID: raw.OWNER_ID, LAST_UPDATED: raw.LAST_UPDATED } };
  }
  if (kind === "contact") return { kind, externalId: id, axis: "context",
    sourceUpdatedAt: valueString(raw.updatedTime), payload: { id, assignedById: raw.assignedById,
      updatedTime: raw.updatedTime } };
  if (kind === "user") {
    const name = [valueString(raw.NAME), valueString(raw.LAST_NAME)].filter(Boolean).join(" ").trim();
    return { kind, externalId: id, axis: "context", label: name || undefined,
      payload: { ID: id, NAME: raw.NAME, LAST_NAME: raw.LAST_NAME, ACTIVE: raw.ACTIVE } };
  }
  if (kind === "pipeline" || kind === "stage") return { kind, externalId: id, axis: "context",
    label: valueString(raw.name ?? raw.NAME), payload: raw };
  throw new Error(`Unsupported Bitrix kind ${kind}`);
}

/** Bitrix24 posts form-encoded events with only the record ID: https://apidocs.bitrix24.com/api-reference/events/index.html */
export function parseBitrixEvent(body: string): ChangeEvent | null {
  const fields = new URLSearchParams(body);
  const accountId = fields.get("auth[member_id]");
  const externalId = fields.get("data[FIELDS][ID]");
  const event = fields.get("event")?.toUpperCase();
  if (!accountId || !externalId || !event || !/^\d+$/.test(externalId)) return null;
  let kind: string;
  if (event.startsWith("ONCRMDEAL")) kind = "deal";
  else if (event.startsWith("ONCRMCONTACT")) kind = "contact";
  else if (event.startsWith("ONCRMACTIVITY")) kind = "activity";
  else if (event.startsWith("ONCRMDYNAMICITEM")) {
    const typeId = fields.get("data[FIELDS][ENTITY_TYPE_ID]");
    if (!typeId || !/^\d+$/.test(typeId)) return null;
    kind = `smart:${typeId}`;
  }
  else return null;
  if (!/(ADD|UPDATE|DELETE|MOVETOCATEGORY)$/.test(event)) return null;
  return { accountId, kind, externalId, operation: event.endsWith("DELETE") ? "delete" : "upsert" };
}

export const SUBSCRIBED_EVENTS = ["ONCRMDEALADD", "ONCRMDEALUPDATE", "ONCRMDEALDELETE", "ONCRMDEALMOVETOCATEGORY",
  "ONCRMCONTACTADD", "ONCRMCONTACTUPDATE", "ONCRMCONTACTDELETE",
  "ONCRMACTIVITYADD", "ONCRMACTIVITYUPDATE", "ONCRMACTIVITYDELETE",
  "ONCRMDYNAMICITEMADD", "ONCRMDYNAMICITEMUPDATE", "ONCRMDYNAMICITEMDELETE"];
