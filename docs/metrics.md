# Metric definitions

Status: metric version **2**, implemented in `apps/api/src/domain/analytics.ts` (pure functions, unit-tested in `test/analytics.test.ts`) and served by `GET /v1/tenants/:id/analytics` (`analytics.view`). Change a definition only together with `METRIC_VERSION`, this file and the tests.

## Inputs

All non-deleted records of every connection in the workspace (disconnected connections keep their data and are included). Two axes:

| Axis | Records | Fields used |
| --- | --- | --- |
| Commercial | Bitrix24 deals and mapped smart processes; Kommo/amoCRM leads | `direction` (sale / purchase / unclassified), `amount`, `currency`, `owner_id` |
| Work | Bitrix24 CRM activities; Kommo/amoCRM tasks | `action_type`, `status` (completed / open), `owner_id`, link to a commercial record |

**Manager** = one responsible user of one connection (`connection_id:owner_id`). The same person in two CRMs counts twice — cross-CRM identity matching is deliberately out of scope. Names come from synced CRM users (Kommo/amoCRM `user` records); otherwise «Сотрудник <id>».

Team and manager totals include only records with a responsible user. Managers are created from classified commercial records or work records, including managers with purchases only; CRM users with no such records do not appear. Sales without an owner are reported as `coverage.unassigned.deals`, work without an owner as `coverage.unassigned.work`. Unassigned purchases are excluded but currently have no separate coverage counter. Unclassified commercial records are counted independently of owner in `team.unclassified`.

## Currency

The selected currency is the workspace base currency if set, otherwise the non-empty currency with the most sale records (selection includes unassigned sales). If neither exists, `currency` is null. Explicit currencies differing from the selected currency are excluded from money sums while their classified, assigned records remain in counts. No conversion is performed.

Two current coverage gaps must be preserved in interpretation: a record **without** currency is still included in the sum, and `otherCurrencyDeals`/`otherCurrencies` report only assigned **sales**, not purchases in other currencies. If no currency can be selected, the existing calculation does not filter amounts by currency. These are prototype behaviors, not a policy for assuming a missing currency; resolving them requires a metric-version change and tests ([delivery-plan.md](delivery-plan.md#engineering-follow-ups)).

## Team metrics

| Metric | Definition |
| --- | --- |
| Сделки / Сумма сделок | Count of assigned commercial records with direction `sale`; sum under the currency rules above |
| Закупки | Count and sum of assigned `purchase` records under the same currency rules (purchases exist only through explicit mapping) |
| Неразмеченные | Commercial records that are neither sale nor purchase (e.g. unmapped smart processes); excluded from everything else |
| Действия | Count of work records (all types, any status) with a responsible user |
| Доля выполненных | completed work ÷ all work |
| Связь с сделками | assigned work with a recorded commercial-kind link ÷ all assigned work (`linkedRate`); link existence caveat below |
| Действий на сделку | work ÷ sale count, one decimal |
| Медианы | median work and median deals across managers — the baseline for signals |

Amounts are pipeline values (Bitrix24 `opportunity`, Kommo `price`), **not** booked revenue: stage outcome (won/lost) is not interpreted yet.

`workByType` is a separate source-wide breakdown: it includes work **without** an owner, so its counts may exceed `team.work`. Missing work types become `other`; only status exactly `completed` counts as completed. Percent rates are fractions from 0 to 1. Rates with a zero denominator and `workPerDeal` without sales are null, not zero; shares without a team denominator are zero. `workPerDeal` is rounded to one decimal; other rates are not rounded by the backend. An empty team has zero medians.

`linkedWork` is based on `target_id` being present and `target_kind` matching any commercial kind found in the workspace. The current SQL does **not** verify that the referenced record exists, is live, belongs to the same connection, or is a sale rather than a purchase. Read it as a recorded association, not a verified work-to-sale link or causal contribution.

## Manager metrics

Same definitions per manager, plus `workByType`, `meetings` (types meeting, visit, negotiation, presentation), `dealShare` and `workShare` (share of team totals).

## Signals (weak spots)

Signals are heuristics that point at something worth a conversation; they do not claim causality. Median-based signals need a team of at least **3** managers.

| Code | Shown as | Fires when |
| --- | --- | --- |
| `low_completion` | Много незакрытых задач | ≥ 5 actions and < 50 % completed (any team size) |
| `low_activity` | Мало активности | positive work median and actions < 50 % of it |
| `no_meetings` | Нет встреч и визитов | zero meetings/visits while the team median of meetings is > 0 |
| `activity_without_deals` | Активность не переходит в сделки | both work/deal medians positive, actions ≥ work median and deals < 50 % of deal median |
| `deals_without_activity` | Сделки без зафиксированной работы | both work/deal medians positive, deals ≥ deal median and actions < 50 % of work median (often: work happens outside the CRM) |

## Derived views (computed in the browser, no new server metric)

Both charts read only fields already in the response, so `metricVersion` does not change. Code: `apps/web/src/components/team-charts.tsx`.

| View | Definition |
| --- | --- |
| **Результат × Работа** (`EffortMap`) | One point per manager: x = `work` (all work items), y = `deals`. Dashed lines at `team.medianWork` and `team.medianDeals` split the plane into four zones, labelled by what is true there — «Много работы и сделок», «Сделки при малой работе», «Работа без сделок», «Мало работы и сделок». Axes start at 0 and end at a rounded maximum (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) above the largest value. Zones describe position, not quality: a manager in «Сделки при малой работе» may simply log work outside the CRM (see `deals_without_activity`). |
| **Профиль работы** (`WorkRadar`) | For one manager: each work type (call, meeting, task, email, visit) as the manager's count ÷ the largest count of that type in the team (0–1), plus `completionRate` (0–1). The dashed polygon is the per-axis median of the same values over all managers. «Сильнее команды» lists axes where the manager is > 120 % of the median and at least 0.05 above it; «Слабее» — < 80 % and at least 0.05 below. Shapes compare people within this team only; they are not targets. |

Depth (perspective, tilt, layered marks) is presentation only: positions, lengths and polygon shapes are computed in flat 2-D coordinates and never distorted.

## Demo data

`GET /v1/tenants/:id/analytics/demo` (`analytics.view`) runs the same `computeAnalytics` over a fictional team (`DEMO_TEAM` in `apps/api/src/domain/demo.ts`: six managers with deliberately different profiles, 35 unassigned calls) in the workspace base currency (RUB when none is set). It reads nothing from the workspace and writes nothing; the response has `demo: true`, `connections: []` and a first coverage note saying it is demo data. The admin UI shows it under the «Демо» switch on the analytics page (`?demo=1`) with a banner. `scripts/seed-demo.ts` seeds the same team as real records for local development.

## Coverage and limits (reported with every response)

- Deals in other currencies, unclassified records, work without a responsible user, managers without names.
- No time window: metrics use all loaded data. Stage history is not reconstructed (AGENTS.md: never infer transitions from a snapshot), so conversion and cycle time are not offered yet.
- Bitrix24 user names are not synced yet (needs the `user` scope); Bitrix managers appear by ID.

## Response time and freshness

`generatedAt` is the calculation time in Unix milliseconds. The HTTP route adds `connections: [{ id, provider, account, status, lastSync }]`; `lastSync` is the stored full-sync freshness marker, not a guarantee that every CRM event has arrived. A recent `generatedAt` can therefore describe old CRM data. Disconnected and partially loaded connections remain in the workspace response and totals; inspect their status/coverage before comparing managers. Workspace timezone is stored, but the current all-time calculation uses no day boundaries.
