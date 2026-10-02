// Workspace analytics (metric version 2): the two axes — commercial outcomes and work — per team and per manager,
// plus heuristic signals that point at weak spots. Pure functions: no SQL, no HTTP. Definitions: docs/metrics.md.

export const METRIC_VERSION = 2;

/** One aggregate row from storage: records grouped by connection, owner, axis and attributes. */
export type AggregateRow = {
  connection_id: string; owner_id: string | null; axis: "commercial" | "work";
  direction: string | null; currency: string | null; action_type: string | null; status: string | null;
  count: number; amount: number | null; linked: number;
};
export type OwnerLabel = { connection_id: string; external_id: string; label: string | null };

export type Signal = { code: "low_activity" | "no_meetings" | "activity_without_deals" | "deals_without_activity" | "low_completion";
  severity: "warning" | "info"; title: string; detail: string };

export type ManagerMetrics = {
  key: string; connectionId: string; ownerId: string; name: string; named: boolean;
  deals: number; dealAmount: number; purchases: number; purchaseAmount: number;
  work: number; completed: number; completionRate: number | null; linkedWork: number;
  workByType: Record<string, number>; meetings: number; workPerDeal: number | null;
  dealShare: number; workShare: number; signals: Signal[];
};

export type WorkspaceAnalytics = {
  metricVersion: number; generatedAt: number; currency: string | null;
  team: { managers: number; deals: number; dealAmount: number; purchases: number; purchaseAmount: number;
    unclassified: number; work: number; completed: number; completionRate: number | null; linkedWork: number;
    linkedRate: number | null; workPerDeal: number | null; medianWork: number; medianDeals: number };
  workByType: Array<{ type: string; count: number; completed: number }>;
  managers: ManagerMetrics[];
  coverage: { otherCurrencyDeals: number; otherCurrencies: string[]; unassigned: { deals: number; work: number };
    unnamedManagers: number; notes: string[] };
};

/** Work types that count as face-to-face contact for the "no meetings" signal. */
const MEETING_TYPES = new Set(["meeting", "visit", "negotiation", "presentation"]);
/** Signals compare to the team median only when there are enough managers for a median to mean something. */
const MIN_TEAM_FOR_SIGNALS = 3;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const round1 = (value: number) => Math.round(value * 10) / 10;
/** Numbers inside Russian signal text use a decimal comma. */
const ru = (value: number) => String(value).replace(".", ",");

/**
 * Chooses the currency used for money totals: the workspace base currency if set, otherwise the currency with the
 * most sale records. Amounts in other currencies are never summed; they are reported in coverage.
 */
export function pickCurrency(rows: AggregateRow[], preferred: string | null): string | null {
  if (preferred) return preferred;
  const counts = new Map<string, number>();
  for (const row of rows) if (row.axis === "commercial" && row.direction === "sale" && row.currency) {
    counts.set(row.currency, (counts.get(row.currency) ?? 0) + row.count);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function computeAnalytics(rows: AggregateRow[], labels: OwnerLabel[], preferredCurrency: string | null,
  now = Date.now()): WorkspaceAnalytics {
  const currency = pickCurrency(rows, preferredCurrency);
  const names = new Map(labels.filter(label => label.label).map(label => [`${label.connection_id}:${label.external_id}`, label.label!]));
  const managers = new Map<string, ManagerMetrics>();
  const unassigned = { deals: 0, work: 0 };
  const otherCurrencies = new Set<string>();
  let otherCurrencyDeals = 0;
  let unclassified = 0;
  const typeTotals = new Map<string, { count: number; completed: number }>();

  const managerFor = (row: AggregateRow): ManagerMetrics => {
    const key = `${row.connection_id}:${row.owner_id}`;
    let manager = managers.get(key);
    if (!manager) {
      const name = names.get(key);
      manager = { key, connectionId: row.connection_id, ownerId: row.owner_id!, name: name ?? `Сотрудник ${row.owner_id}`,
        named: !!name, deals: 0, dealAmount: 0, purchases: 0, purchaseAmount: 0, work: 0, completed: 0, completionRate: null,
        linkedWork: 0, workByType: {}, meetings: 0, workPerDeal: null, dealShare: 0, workShare: 0, signals: [] };
      managers.set(key, manager);
    }
    return manager;
  };

  for (const row of rows) {
    if (row.axis === "commercial") {
      if (row.direction !== "sale" && row.direction !== "purchase") { unclassified += row.count; continue; }
      if (!row.owner_id) { if (row.direction === "sale") unassigned.deals += row.count; continue; }
      const manager = managerFor(row);
      const inCurrency = !currency || !row.currency || row.currency === currency;
      if (row.direction === "sale") {
        manager.deals += row.count;
        if (inCurrency) manager.dealAmount += row.amount ?? 0;
        else { otherCurrencyDeals += row.count; if (row.currency) otherCurrencies.add(row.currency); }
      } else {
        manager.purchases += row.count;
        if (inCurrency) manager.purchaseAmount += row.amount ?? 0;
      }
    } else {
      const type = row.action_type ?? "other";
      const done = row.status === "completed" ? row.count : 0;
      const total = typeTotals.get(type) ?? { count: 0, completed: 0 };
      total.count += row.count; total.completed += done;
      typeTotals.set(type, total);
      if (!row.owner_id) { unassigned.work += row.count; continue; }
      const manager = managerFor(row);
      manager.work += row.count;
      manager.completed += done;
      manager.linkedWork += row.linked;
      manager.workByType[type] = (manager.workByType[type] ?? 0) + row.count;
      if (MEETING_TYPES.has(type)) manager.meetings += row.count;
    }
  }

  const list = [...managers.values()];
  const team = list.reduce((sum, m) => ({ deals: sum.deals + m.deals, dealAmount: sum.dealAmount + m.dealAmount,
    purchases: sum.purchases + m.purchases, purchaseAmount: sum.purchaseAmount + m.purchaseAmount, work: sum.work + m.work,
    completed: sum.completed + m.completed, linkedWork: sum.linkedWork + m.linkedWork }),
  { deals: 0, dealAmount: 0, purchases: 0, purchaseAmount: 0, work: 0, completed: 0, linkedWork: 0 });
  const medianWork = median(list.map(m => m.work));
  const medianDeals = median(list.map(m => m.deals));
  const medianMeetings = median(list.map(m => m.meetings));

  for (const manager of list) {
    manager.completionRate = ratio(manager.completed, manager.work);
    manager.workPerDeal = manager.deals > 0 ? round1(manager.work / manager.deals) : null;
    manager.dealShare = ratio(manager.deals, team.deals) ?? 0;
    manager.workShare = ratio(manager.work, team.work) ?? 0;
    manager.signals = signalsFor(manager, { medianWork, medianDeals, medianMeetings, teamSize: list.length });
  }
  list.sort((a, b) => b.deals - a.deals || b.work - a.work || a.name.localeCompare(b.name, "ru"));

  const notes: string[] = [];
  if (otherCurrencyDeals > 0) notes.push(`${otherCurrencyDeals} сделок в других валютах (${[...otherCurrencies].join(", ")}) не входят в суммы.`);
  if (unclassified > 0) notes.push(`${unclassified} коммерческих записей не размечены как продажа или закупка и не учитываются.`);
  if (list.some(m => !m.named)) notes.push("Часть менеджеров показана по ID: CRM не передала имена сотрудников.");
  if (list.length < MIN_TEAM_FOR_SIGNALS) notes.push(`Сигналы появляются, когда в команде от ${MIN_TEAM_FOR_SIGNALS} менеджеров.`);
  notes.push("Метрики считаются по всем загруженным данным без учёта дат; история смены этапов не используется.");

  return {
    metricVersion: METRIC_VERSION, generatedAt: now, currency,
    team: { managers: list.length, ...team, unclassified, completionRate: ratio(team.completed, team.work),
      linkedRate: ratio(team.linkedWork, team.work), workPerDeal: team.deals ? round1(team.work / team.deals) : null,
      medianWork, medianDeals },
    workByType: [...typeTotals.entries()].map(([type, value]) => ({ type, ...value })).sort((a, b) => b.count - a.count),
    managers: list,
    coverage: { otherCurrencyDeals, otherCurrencies: [...otherCurrencies], unassigned,
      unnamedManagers: list.filter(m => !m.named).length, notes },
  };
}

/** Heuristic, explainable signals. Each compares the manager with the team median; none claims causality. */
export function signalsFor(manager: ManagerMetrics,
  team: { medianWork: number; medianDeals: number; medianMeetings: number; teamSize: number }): Signal[] {
  const signals: Signal[] = [];
  if (manager.work >= 5 && manager.completionRate !== null && manager.completionRate < 0.5) {
    signals.push({ code: "low_completion", severity: "warning", title: "Много незакрытых задач",
      detail: `Выполнено ${Math.round(manager.completionRate * 100)}% из ${manager.work} действий.` });
  }
  if (team.teamSize < MIN_TEAM_FOR_SIGNALS) return signals;
  const half = (value: number) => value * 0.5;
  if (team.medianWork > 0 && manager.work < half(team.medianWork)) {
    signals.push({ code: "low_activity", severity: "warning", title: "Мало активности",
      detail: `${manager.work} действий при медиане команды ${ru(round1(team.medianWork))}.` });
  }
  if (team.medianMeetings > 0 && manager.meetings === 0) {
    signals.push({ code: "no_meetings", severity: "warning", title: "Нет встреч и визитов",
      detail: `У команды в среднем ${ru(round1(team.medianMeetings))} встреч на менеджера.` });
  }
  if (team.medianWork > 0 && team.medianDeals > 0 && manager.work >= team.medianWork && manager.deals < half(team.medianDeals)) {
    signals.push({ code: "activity_without_deals", severity: "info", title: "Активность не переходит в сделки",
      detail: `${manager.work} действий, но ${manager.deals} сделок при медиане ${ru(round1(team.medianDeals))}.` });
  }
  if (team.medianDeals > 0 && team.medianWork > 0 && manager.deals >= team.medianDeals && manager.work < half(team.medianWork)) {
    signals.push({ code: "deals_without_activity", severity: "info", title: "Сделки без зафиксированной работы",
      detail: `${manager.deals} сделок при ${manager.work} действиях — возможно, работа ведётся вне CRM.` });
  }
  return signals;
}
