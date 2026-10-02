// Demo team (docs/metrics.md#demo-data): a fictional sales team with deliberately different profiles, so every metric,
// signal and chart has something to show. Used by the analytics demo preview (no storage writes) and by
// scripts/seed-demo.ts. Pure data and pure functions; nothing here touches customer data.

import type { AggregateRow, OwnerLabel } from "./analytics.ts";

export type DemoManager = {
  id: string; name: string; deals: number; averageDeal: number; purchases?: number;
  /** Work items per action type. */
  work: Record<string, number>;
  /** Share of work items that are completed. */
  done: number;
  /** Share of work items linked to a deal. */
  linked: number;
};

export const DEMO_TEAM: DemoManager[] = [
  { id: "11", name: "Анна Соколова", deals: 64, averageDeal: 410_000, work: { call: 220, meeting: 48, task: 90, email: 60 }, done: 0.86, linked: 0.72 },
  { id: "12", name: "Борис Ким", deals: 9, averageDeal: 150_000, work: { call: 410, task: 70, email: 25 }, done: 0.38, linked: 0.4 },
  { id: "13", name: "Вера Лебедева", deals: 52, averageDeal: 520_000, work: { call: 30, meeting: 6, task: 12 }, done: 0.9, linked: 0.8 },
  { id: "14", name: "Глеб Орлов", deals: 41, averageDeal: 260_000, purchases: 6, work: { call: 180, meeting: 30, visit: 22, task: 60 }, done: 0.74, linked: 0.66 },
  { id: "15", name: "Дарья Миронова", deals: 33, averageDeal: 300_000, work: { call: 140, meeting: 25, task: 70, email: 40 }, done: 0.81, linked: 0.7 },
  { id: "16", name: "Егор Пак", deals: 14, averageDeal: 180_000, work: { call: 60, meeting: 5, task: 20, email: 10 }, done: 0.7, linked: 0.55 },
];

/** Work without a responsible person, as real CRMs have it. */
const DEMO_UNASSIGNED_CALLS = 35;
export const DEMO_CONNECTION_ID = "demo";

/** The demo team as storage-shaped aggregate rows, ready for computeAnalytics. */
export function demoAnalyticsInput(currency: string): { rows: AggregateRow[]; labels: OwnerLabel[] } {
  const rows: AggregateRow[] = [];
  const base = { connection_id: DEMO_CONNECTION_ID, direction: null, currency: null, action_type: null, status: null, amount: null, linked: 0 };
  for (const manager of DEMO_TEAM) {
    rows.push({ ...base, owner_id: manager.id, axis: "commercial", direction: "sale", currency, count: manager.deals,
      amount: manager.deals * manager.averageDeal });
    if (manager.purchases) {
      rows.push({ ...base, owner_id: manager.id, axis: "commercial", direction: "purchase", currency, count: manager.purchases,
        amount: manager.purchases * manager.averageDeal * 0.6 });
    }
    for (const [type, total] of Object.entries(manager.work)) {
      const completed = Math.round(total * manager.done);
      for (const [status, count] of [["completed", completed], ["open", total - completed]] as const) {
        if (count > 0) rows.push({ ...base, owner_id: manager.id, axis: "work", action_type: type, status, count,
          linked: Math.round(count * manager.linked) });
      }
    }
  }
  rows.push({ ...base, owner_id: null, axis: "work", action_type: "call", status: "completed", count: DEMO_UNASSIGNED_CALLS });
  const labels = DEMO_TEAM.map(manager => ({ connection_id: DEMO_CONNECTION_ID, external_id: manager.id, label: manager.name }));
  return { rows, labels };
}
