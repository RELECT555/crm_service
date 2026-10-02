# CRM analytics integration foundation

This TypeScript monorepo contains a Bitrix24 backend prototype and a minimal admin interface for CRM connections. The interface currently presents the Bitrix24 connection entry point and is not connected to the API. Customer login, production data delivery, CRM embedding, and additional adapters remain planned.

## Run the Bitrix24 prototype

Requirements: Node.js 24.17+ and a Bitrix24 application with the `crm` scope. Configure its redirect URI as `https://your-public-app.example/oauth/bitrix24/callback`. The app origin must be a public HTTPS address for Bitrix24 event delivery. The current portal allowlist accepts `*.bitrix24.com` and `*.bitrix24.ru`.

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
```

Set `APP_ORIGIN`, `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`, `ADMIN_API_KEY` (at least 32 random characters), and `DATA_KEY_BASE64` (32 random bytes encoded as Base64) in `apps/api/.env`. Keep `.env` private. Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Then run:

```powershell
npm run check
npm test
npm run dev:api
```

Start the admin interface in a second terminal with `npm run dev:web`. The root scripts address workspaces; API implementation and local environment files live in `apps/api`, and the Vite admin interface lives in `apps/web`.

The API prototype stores encrypted OAuth tokens and raw CRM payloads in a local SQLite file. Do not reuse this single-process SQLite deployment as a production architecture without a storage, authentication, and operations review. The admin interface is currently a UI shell; CRM connection authorization is not wired to the API.

## API flow

All management routes require the `x-admin-key` header. This is a development-only operator credential, not customer authentication.

1. `POST /v1/tenants` creates a tenant and returns `tenantId`.
2. `POST /v1/tenants/{tenantId}/bitrix24/start` with JSON `{"portal":"your-portal.bitrix24.com"}` returns `authorizeUrl`. Open that URL as the authorized Bitrix24 user.
3. Bitrix24 returns to `/oauth/bitrix24/callback`; the service exchanges the code, queues event subscriptions, and starts the backfill.
4. `GET /v1/tenants/{tenantId}/connections` reports connection status.
5. `GET /v1/tenants/{tenantId}/connections/{connectionId}/dashboard` returns commercial/work groups, a shared `byOwner` comparison, linked work count, freshness, and coverage limitations.
6. `POST /v1/tenants/{tenantId}/connections/{connectionId}/commercial-sources` maps a deal pipeline or smart-process type to `sale` or `purchase`. Example: `{"entityTypeId":128,"direction":"purchase","amountField":"purchaseValue","currencyField":"purchaseCurrency"}`. Add `categoryId` to limit a mapping to one pipeline.
7. `POST /v1/tenants/{tenantId}/connections/{connectionId}/action-types` maps a provider activity code, for example `{"providerTypeId":"TRAVEL","actionType":"visit"}`.
8. `POST /v1/tenants/{tenantId}/connections/{connectionId}/resync` starts a full reconciliation. The worker also schedules one after a live connection becomes 24 hours stale.

Bitrix24 deals are classified as sales processes by default; deal opportunity amounts are pipeline values, not booked revenue. Purchases require explicit mappings. Activity counts currently include Bitrix CRM activities; external tasks and multi-entity activity bindings are not yet fully covered. The API reports links as relationships, not proof that an activity caused a commercial outcome. A missed delete event can leave a stale record because an absent record may also mean changed read permissions; confirmed delete events are handled, while reliable delete reconciliation remains open.

## Read in this order

1. [Product and architecture](docs/architecture.md) — scope, data flow, tenancy, analytics rules.
2. [CRM connector research](docs/connectors.md) — official API capabilities and platform differences, researched 2026-09-30.
3. [Ingestion contract](docs/ingestion-contract.md) — TypeScript interfaces, sync lifecycle, persistence, security, and failure handling.
4. [Delivery and implementation plan](docs/delivery-plan.md) — standalone and embedded delivery, milestones, acceptance criteria, and open decisions.

`AGENTS.md` gives coding agents the project constraints and the expected workflow. Product choices marked **proposed** are design recommendations, not facts established by a running system.
