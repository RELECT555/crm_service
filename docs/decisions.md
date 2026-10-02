# Decision log

Short records of decisions that shape the code. Add an entry when you make a choice someone could reasonably undo by accident. Status: **accepted** (in force), **superseded** (replaced by a later entry), **proposed** (needs product confirmation).

| # | Date | Decision | Why | Status |
| --- | --- | --- | --- | --- |
| 1 | 2026-09-30 | Read-only access to CRMs in the first release. | Lower permission risk and simpler review; writeback needs its own design. | accepted |
| 2 | 2026-09-30 | Bitrix24 is the first connector; Kommo/amoCRM second. | Customer market; Bitrix24 has documented iframe placements. | proposed |
| 3 | 2026-09-30 | Single-process SQLite store and in-process worker for the prototype. | Fast iteration; production storage/queue chosen after open product decisions. | accepted (prototype only) |
| 4 | 2026-09-30 | Purchases and custom activity types require explicit operator mapping. | Guessing from titles corrupts metrics. | accepted |
| 5 | 2026-10-02 | Provider-neutral `Connector` contract and registry; provider code only in `connectors/<id>/`. | Adding a CRM must not touch routes, worker or storage. | accepted |
| 6 | 2026-10-02 | Connection columns renamed to `account_id` / `account` with forward migrations. | Remove Bitrix-specific names from the core model. | accepted |
| 7 | 2026-10-02 | Admin UI uses hash routing and is served by the API from `apps/web/dist` with a strict CSP. | One origin, no server-side routing, no inline scripts. | accepted |
| 8 | 2026-10-02 | Operator key typed at runtime and kept in `sessionStorage`; never in code or bundle. | Development-only credential until customer authentication exists. | accepted (temporary) |
| 9 | 2026-10-02 | Web stack: Tailwind CSS + shadcn on Base UI; no Radix. | Team choice in `main`; one component system. | accepted |
| 10 | 2026-10-02 | Theme is a `.dark` class with a light/dark/system preference; theme bootstrap script is an external file. | User-selectable theme; CSP forbids inline scripts. | accepted |
| 11 | 2026-10-02 | Re-authorizing the same CRM account repairs the existing connection. | Keeps mappings and history; avoids duplicate accounts. | accepted |
| 12 | 2026-10-02 | Commercial-source mappings keyed by Bitrix24 `entityTypeId`. | Only one connector exists; generalize with the second connector. | superseded by 13 |
| 13 | 2026-10-02 | Commercial mappings keyed by connector object kind (`deal`, `smart:128`) + pipeline; connectors describe mappable kinds via `mappingOptions()`. Legacy rows migrate automatically. | Second connector (Kommo) needs the same rules without Bitrix IDs. | accepted |
| 14 | 2026-10-02 | Kommo and amoCRM share one adapter with two registrations and separate credentials. | Same API v4, separate platforms and app registrations. | accepted |
| 15 | 2026-10-02 | Provider app credentials are optional; adapters without them show as «Нужна настройка» with the env vars and redirect URI. | Operators can see what to configure without code changes. | accepted |
| 17 | 2026-10-02 | «Отключить» is local and reversible: sync stops, events are ignored, data stays; the CRM-side webhook registration is not removed. | The first release never writes to a CRM. | accepted |
| 18 | 2026-10-02 | Each workspace stores a time zone and a base currency, both optional and explicit. | Metric day boundaries and currency handling must be recorded, never guessed. | accepted |
| 19 | 2026-10-02 | Operator access by users, progressive built-in roles, custom roles and workspace-scoped assignments; the admin key remains a `system` principal. | Admin work must be attributable and least-privilege. | accepted |
| 20 | 2026-10-02 | Sessions are opaque tokens in an HttpOnly SameSite=Strict cookie with a CSRF header; passwords use scrypt from Node's standard library. | No auth dependency; no tokens in browser JavaScript. | accepted |
| 21 | 2026-10-02 | Workspace analytics v2: two axes per manager plus median-based, explainable signals; money in one currency; no time window until dates are normalized. | Highlight weak spots without inventing causality or history. | accepted |
| 16 | 2026-10-02 | A connection whose CRM plan forbids webhook registration runs in `polling` mode (hourly reconciliation) instead of failing. | Kommo restricts webhook API to higher plans. | accepted |
