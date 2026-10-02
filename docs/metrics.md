# Metric definitions

Status: metric version **2**, implemented in `apps/api/src/domain/analytics.ts` (pure functions, unit-tested in `test/analytics.test.ts`) and served by `GET /v1/tenants/:id/analytics` (`analytics.view`). Change a definition only together with `METRIC_VERSION`, this file and the tests.

## Inputs

All non-deleted records of every connection in the workspace (disconnected connections keep their data and are included). Two axes:

| Axis | Records | Fields used |
| --- | --- | --- |
| Commercial | Bitrix24 deals and mapped smart processes; Kommo/amoCRM leads | `direction` (sale / purchase / unclassified), `amount`, `currency`, `owner_id` |
| Work | Bitrix24 CRM activities; Kommo/amoCRM tasks | `action_type`, `status` (completed / open), `owner_id`, link to a commercial record |

**Manager** = one responsible user of one connection (`connection_id:owner_id`). The same person in two CRMs counts twice — cross-CRM identity matching is deliberately out of scope. Names come from synced CRM users (Kommo/amoCRM `user` records); otherwise «Сотрудник <id>».

## Currency

Money is summed in one currency only: the workspace base currency if set, otherwise the currency with the most sale records. Records in other currencies are counted (deal counts include them) but never added to sums; coverage reports how many and which currencies. No conversion is performed.

## Team metrics

| Metric | Definition |
| --- | --- |
| Сделки / Сумма сделок | Count of commercial records with direction `sale`; sum of their amounts in the chosen currency |
| Закупки | Count and sum of `purchase` records (purchases exist only through explicit mapping) |
| Неразмеченные | Commercial records that are neither sale nor purchase (e.g. unmapped smart processes); excluded from everything else |
| Действия | Count of work records (all types, any status) with a responsible user |
| Доля выполненных | completed work ÷ all work |
| Связь с сделками | work linked to a commercial record ÷ all work (`linkedRate`) |
| Действий на сделку | work ÷ sale count, one decimal |
| Медианы | median work and median deals across managers — the baseline for signals |

Amounts are pipeline values (Bitrix24 `opportunity`, Kommo `price`), **not** booked revenue: stage outcome (won/lost) is not interpreted yet.

## Manager metrics

Same definitions per manager, plus `workByType`, `meetings` (types meeting, visit, negotiation, presentation), `dealShare` and `workShare` (share of team totals).

## Signals (weak spots)

Signals are heuristics that point at something worth a conversation; they do not claim causality. Median-based signals need a team of at least **3** managers.

| Code | Shown as | Fires when |
| --- | --- | --- |
| `low_completion` | Много незакрытых задач | ≥ 5 actions and < 50 % completed (any team size) |
| `low_activity` | Мало активности | actions < 50 % of the team median |
| `no_meetings` | Нет встреч и визитов | zero meetings/visits while the team median of meetings is > 0 |
| `activity_without_deals` | Активность не переходит в сделки | actions ≥ median and deals < 50 % of the median deals |
| `deals_without_activity` | Сделки без зафиксированной работы | deals ≥ median and actions < 50 % of the median actions (often: work happens outside the CRM) |

## Coverage and limits (reported with every response)

- Deals in other currencies, unclassified records, work without a responsible user, managers without names.
- No time window: metrics use all loaded data. Stage history is not reconstructed (AGENTS.md: never infer transitions from a snapshot), so conversion and cycle time are not offered yet.
- Bitrix24 user names are not synced yet (needs the `user` scope); Bitrix managers appear by ID.
