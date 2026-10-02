# CRM analytics integration foundation

This repository contains a TypeScript backend prototype, an operator admin UI, and the design for a service that reads customer-authorized CRM data and builds analytics across two axes: commercial outcomes and non-commercial work, compared per manager. Implemented adapters: Bitrix24 and Kommo/amoCRM (the latter not yet verified in a sandbox). HubSpot, Pipedrive, Salesforce, Zoho, Dynamics 365 and RetailCRM are researched and shown in the admin catalog as planned. Customer login, analytics screens, CRM embedding, and additional adapters are still planned.

| Path | What it is |
| --- | --- |
| `apps/api` | HTTP API, connector adapters, sync worker, SQLite store ([architecture](docs/code-architecture.md)) |
| `apps/web` | React admin UI (Vite, Tailwind CSS, shadcn on Base UI): workspaces, CRM connection wizard, sync status, mappings |
| `docs/` | Product design, connector research and per-CRM playbooks |

## Run the Bitrix24 prototype

Requirements: Node.js 24.17+ and a Bitrix24 application with the `crm` scope. Configure its redirect URI as `https://your-public-app.example/oauth/bitrix24/callback`. The app origin must be a public HTTPS address for Bitrix24 event delivery. The current portal allowlist accepts `*.bitrix24.com` and `*.bitrix24.ru`.

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
```

Set `APP_ORIGIN`, `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`, `ADMIN_API_KEY` (at least 32 random characters), and `DATA_KEY_BASE64` (32 random bytes encoded as Base64) in `apps/api/.env`. Keep `.env` private. Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Then run:

```powershell
npm run check     # API typecheck + web typecheck/lint
npm test          # API integration tests
npm run build     # admin UI -> apps/web/dist, served by the API at APP_ORIGIN
npm run dev:api   # API on :3000
npm run dev:web   # optional: admin UI with hot reload on :5173 (set ADMIN_ORIGIN=http://localhost:5173)
npm run seed:demo # optional: demo workspaces and connections for UI work without a CRM
```

Open the API origin (or the Vite dev server) and sign in with `ADMIN_API_KEY`. In the admin UI: create a workspace → *Подключить CRM* → pick Bitrix24 → enter the portal → authorize in Bitrix24. You return to the connection page, which shows sync progress per object, the event subscription, errors, and the purchase/activity mappings.

The prototype stores encrypted OAuth tokens and raw CRM payloads in a local SQLite file. Do not reuse this single-process SQLite deployment as a production architecture without a storage, authentication, and operations review.

## API flow

All `/v1` routes require the `x-admin-key` header. This is a development-only operator credential, not customer authentication. The admin UI uses exactly these routes.

1. `GET /v1/providers` returns the connector catalog (available and planned CRMs, setup steps, data per axis, limits, callback URL).
2. `POST /v1/tenants` with optional `{"name":"Acme"}` creates a workspace; `GET /v1/tenants`, `GET`/`PATCH /v1/tenants/{tenantId}` list, read and rename.
3. `POST /v1/tenants/{tenantId}/connect/{provider}` (`bitrix24`, `kommo`, `amocrm`) with `{"account":"your-portal.bitrix24.com"}` returns `authorizeUrl`. Open it as the authorized CRM user.
4. The CRM returns to `/oauth/{provider}/callback`; the service exchanges the code, verifies the account, queues the event subscription and backfill, and redirects a browser to the connection page (API clients get JSON). Authorizing the same portal again repairs the existing connection.
5. `GET /v1/tenants/{tenantId}/connections/{connectionId}` reports status, sync coverage per object, queue, record counts and mappings. No credentials are returned.
6. `POST …/commercial-sources` marks a source kind (optionally one pipeline) as `sale` or `purchase`, e.g. `{"sourceKind":"smart:128","direction":"purchase","amountField":"purchaseValue","currencyField":"purchaseCurrency"}` or `{"sourceKind":"deal","categoryId":2,"direction":"purchase"}`. Allowed kinds and whether amount/currency fields apply come from the connector (`mappingOptions` in the connection detail). `DELETE …/commercial-sources/{sourceKind}/{categoryId|*}` removes it.
7. `POST …/action-types` maps a provider activity code, e.g. `{"providerTypeId":"TRAVEL","actionType":"visit"}`; `DELETE …/action-types/{providerTypeId}` removes it.
8. `POST …/resync` starts a full reconciliation. The worker also schedules one after a live connection becomes 24 hours stale.
9. `GET …/dashboard` returns the prototype two-axis read model (commercial/work groups, `byOwner`, linked work, coverage, limitations). It has no UI yet.

Bitrix24 deals are classified as sales processes by default; deal opportunity amounts are pipeline values, not booked revenue. Purchases require explicit mappings. Activity counts currently include Bitrix CRM activities; external tasks and multi-entity activity bindings are not yet fully covered. The API reports links as relationships, not proof that an activity caused a commercial outcome. A missed delete event can leave a stale record because an absent record may also mean changed read permissions; confirmed delete events are handled, while reliable delete reconciliation remains open.

## Read in this order

1. [Documentation map](docs/README.md) — what each document is for, plus a glossary.
2. [Development guide](docs/development.md) — setup, environment variables, demo data, troubleshooting.
3. [Code architecture](docs/code-architecture.md) — layers, dependency rules, connection lifecycle, how to add a connector.
4. [UI guidelines](docs/ui-guidelines.md) — tokens, themes, components, badges, motion and copy for the admin UI.
5. [Product and architecture](docs/architecture.md), [CRM connector research](docs/connectors.md) with [per-CRM playbooks](docs/connectors/), [ingestion contract](docs/ingestion-contract.md), [delivery plan](docs/delivery-plan.md), [decision log](docs/decisions.md).

`AGENTS.md` gives coding agents the project constraints and the expected workflow. Product choices marked **proposed** are design recommendations, not facts established by a running system.
