# CRM analytics integration foundation

This repository contains a TypeScript backend prototype, an operator admin UI, and the design for a service that reads customer-authorized CRM data and builds analytics across two axes: commercial outcomes and non-commercial work, compared per manager. Implemented adapters: Bitrix24, Kommo/amoCRM, Pipedrive and HubSpot (all but Bitrix24 not yet verified in a sandbox). Salesforce, Zoho, Dynamics 365 and RetailCRM are researched and shown in the admin catalog as planned. The admin UI has email/password sign-in with progressive roles, custom roles and an audit log, a team analytics screen that puts each manager's results next to their work, and a first-sign-in presentation with a guided tour ([onboarding](docs/onboarding.md)). CRM embedding, customer-facing login and additional adapters are still planned.

| Path | What it is |
| --- | --- |
| `apps/api` | HTTP API, connector adapters, sync worker, SQLite store ([architecture](docs/code-architecture.md)) |
| `apps/web` | React admin UI (Vite, Tailwind CSS, shadcn on Base UI, Motion): workspaces, CRM connection wizard, sync status, mappings, team analytics, users/roles/audit |
| `docs/` | Product design, connector research and per-CRM playbooks |

## Run locally

Requirements: Node.js 24.17+ and npm 10+. No CRM account or database server is needed for local UI work. Full setup, environment variables, alternate ports and troubleshooting: [development guide](docs/development.md).

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env # only if .env does not already exist
```

In `apps/api/.env`, set `APP_ORIGIN=http://localhost:3000`, `ADMIN_ORIGIN=http://localhost:5173`, `ADMIN_API_KEY` (at least 32 random characters), and `DATA_KEY_BASE64` (32 random bytes encoded as Base64). Generate the keys with the commands in the development guide; keep `.env` private. Leave both values of every OAuth credential pair empty, including the Bitrix24 placeholders, until connecting a real CRM.

Check and build from the repository root:

```powershell
npm run check     # API typecheck + web typecheck/lint
npm test          # API integration tests
npm run build     # admin UI -> apps/web/dist, served by the API at APP_ORIGIN
```

For demo data, choose an unused `DB_PATH` and run `npm run seed:demo` **before starting the API**. The seed adds data; `--force` does not reset an existing database. See the [demo workflow](docs/development.md#working-on-the-admin-ui-without-a-crm).

Start `npm run dev:api` (API on `:3000`) and `npm run dev:web` (hot reload on `:5173`) in separate terminals. Open `http://localhost:5173`, or the API origin after a build. A fresh database asks for `ADMIN_API_KEY` once to create the first owner; after that everyone signs in with email/password. Demo login: `owner@example.com` / `demo-password-1`.

Sign-in and first-owner setup share a centered branded card with a centered heading, grouped fields, themed autofill and a password visibility control over a theme-aware WebGL background. The sign-in access hint sits below the button. The play/pause control beside the theme switch saves the background playback choice. Browsers without WebGL show a static fallback ([UI rules](docs/ui-guidelines.md), decisions 25–29).

Open **«Мои настройки»** from the profile menu (`/#/settings`) to edit your name, view email and assigned roles, choose a light/dark/system theme and a default workspace with an overview or analytics start page, change your password, or replay the presentation/tour. Name and preferences are saved in the account across devices. Email and roles are changed by an administrator. Saved start pages are applied when entering through the home URL; explicit links are preserved. Inaccessible workspaces/analytics safely fall back after a role change. Workspace currency, time zone and CRM mappings remain in workspace settings ([access control](docs/access-control.md#personal-settings)).

The prototype stores encrypted OAuth tokens and raw CRM payloads in a local SQLite file. Do not reuse this single-process SQLite deployment as a production architecture without a storage, authentication, and operations review.

## Connect a real CRM

Follow the [Bitrix24](docs/connectors/bitrix24.md), [Kommo/amoCRM](docs/connectors/kommo.md), [Pipedrive](docs/connectors/pipedrive.md) or [HubSpot](docs/connectors/hubspot.md) playbook for app credentials, registered callback and public HTTPS event delivery. In the UI: create a workspace → *Подключить CRM* → choose the provider → enter the account (Bitrix24, Kommo, amoCRM; Pipedrive and HubSpot let the user pick it on their consent screen) → authorize. The connection page shows sync progress, subscriptions, errors and purchase/activity mappings. A catalog status of `available` means an adapter and app credentials are present; it does not validate the credentials or prove sandbox coverage. Tests use mocked CRM responses.

## API flow

Except for `/v1/auth/*`, `/v1` routes need a principal: the admin UI's session cookie (plus `x-requested-with: crm-admin` on protected writes) or, for scripts, `x-admin-key`. Business routes check their permission; catalogs and current-user routes need a principal, and the workspace list filters by access. Full authentication, permissions and request/response bodies: [access control](docs/access-control.md) and [API reference](docs/api.md).

1. `GET /v1/providers` returns the connector catalog (available and planned CRMs, setup steps, data per axis, limits, callback URL).
2. `POST /v1/tenants` with optional `{"name":"Acme"}` creates a workspace; `GET /v1/tenants` lists them. `GET /v1/tenants/{tenantId}` returns the workspace and its connections with record counts and backfill progress; `PATCH` updates `name`, `timezone` (runtime-supported IANA name) and `currency` (three uppercase letters; no currency-registry lookup). `null` clears timezone/currency.
3. `POST /v1/tenants/{tenantId}/connect/{provider}` (`bitrix24`, `kommo`, `amocrm`, `pipedrive`, `hubspot`) with `{"account":"your-portal.bitrix24.com"}` returns `authorizeUrl`. Providers whose catalog entry has `accountChosenOnConsent: true` (Pipedrive, HubSpot) accept an empty body. Open it as the authorized CRM user.
4. The CRM returns to `/oauth/{provider}/callback`; the service exchanges the code, verifies the account, queues the event subscription and backfill, and redirects a browser to the connection page (API clients get JSON). Authorizing the same portal again repairs the existing connection.
5. `GET /v1/tenants/{tenantId}/connections/{connectionId}` reports status, sync coverage per object, queue, record counts and mappings. No credentials are returned.
6. `POST …/commercial-sources` marks a source kind (optionally one pipeline) as `sale` or `purchase`, e.g. `{"sourceKind":"smart:128","direction":"purchase","amountField":"purchaseValue","currencyField":"purchaseCurrency"}` or `{"sourceKind":"deal","categoryId":2,"direction":"purchase"}`. Allowed kinds and whether amount/currency fields apply come from the connector (`mappingOptions` in the connection detail). `DELETE …/commercial-sources/{sourceKind}/{categoryId|*}` removes it.
7. `POST …/action-types` maps a provider activity code, e.g. `{"providerTypeId":"TRAVEL","actionType":"visit"}`; `DELETE …/action-types/{providerTypeId}` removes it.
8. `POST …/disconnect` stops syncing locally (pending jobs cancelled, CRM events ignored, data and mappings kept; nothing changes in the CRM); `POST …/resume` restarts with a full sync. `GET …/activity` returns the last 30 jobs with their errors.
9. `POST …/resync` queues a full reconciliation. Every 15 minutes the worker checks connections: a live one whose full sync is older than 24 hours (one hour in polling mode) is re-read in the background and stays live; a degraded one is retried at most hourly. Each full pass also removes records deleted in the CRM whose delete events were missed, unless more than half of a kind would disappear — then nothing is removed and the connection is degraded. These are scheduling thresholds, not a freshness SLA.
10. `GET /v1/tenants/{tenantId}/analytics` returns team and per-manager metrics on both axes with weak-spot signals and coverage notes ([metrics.md](docs/metrics.md)). The older per-connection `GET …/dashboard` read model remains for compatibility and has no UI.

Bitrix24 deals are classified as sales processes by default; deal opportunity amounts are pipeline values, not booked revenue. Purchases require explicit mappings. Activity counts currently include Bitrix CRM activities; external tasks and multi-entity activity bindings are not yet fully covered. The API reports links as relationships, not proof that an activity caused a commercial outcome. A missed delete event can leave a stale record because an absent record may also mean changed read permissions; confirmed delete events are handled, while reliable delete reconciliation remains open.

## Read in this order

1. [Documentation map](docs/README.md) — what each document is for, plus a glossary.
2. [Development guide](docs/development.md) — setup, environment variables, demo data, troubleshooting.
3. [Code architecture](docs/code-architecture.md) — layers, dependency rules, connection lifecycle, how to add a connector.
4. [UI guidelines](docs/ui-guidelines.md) — tokens, themes, components, motion, responsive layouts, charts and copy for the admin UI.
5. [Access control](docs/access-control.md), [metrics](docs/metrics.md) and [API reference](docs/api.md).
6. [Product and architecture](docs/architecture.md), [CRM connector research](docs/connectors.md) with [per-CRM playbooks](docs/connectors/), [ingestion contract](docs/ingestion-contract.md), [delivery plan](docs/delivery-plan.md), [decision log](docs/decisions.md).

`AGENTS.md` gives coding agents the project constraints and the expected workflow. Product choices marked **proposed** are design recommendations, not facts established by a running system.
