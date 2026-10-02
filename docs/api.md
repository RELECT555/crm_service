# HTTP API reference

Status: current prototype, checked against [`http/routes/`](../apps/api/src/http/routes/) on 2026-10-02. These are our service routes, not provider API endpoints. The TypeScript client in [`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts) carries the response types.

Except for `/healthz`, OAuth callbacks, CRM webhooks and `/v1/auth/*`, routes need a principal: the `crm_session` cookie from login/bootstrap or the `x-admin-key` service key. The key acts as `system`, with all permissions; it takes precedence when a cookie is also present. Permission rules are in [access-control.md](access-control.md).

Cookie-authenticated writes to protected routes require `x-requested-with: crm-admin`. Anonymous auth routes run before that guard; the UI sends the header consistently. Send JSON objects with `Content-Type: application/json` for JSON request bodies. Arrays and invalid JSON get 400; body size is limited to 64 KiB (also for webhook bodies). JSON responses use `Cache-Control: no-store`. Timestamp numbers are Unix milliseconds unless a field explicitly contains an ISO string.

`202` means local work was queued or a webhook was acknowledged, not that synchronization has finished. Paths use generated workspace/connection/user/custom-role UUIDs. In connection tables below, `…` means `/v1/tenants/:id/connections/:cid`.

## Public

| Method and path | Purpose |
| --- | --- |
| `GET /healthz` | `200 { ok: true }`; liveness, not a CRM availability check |
| `GET /oauth/:provider/callback` | Requires `code` and a single-use `state`; state is bound to the initiating workspace, provider and account and expires after 10 minutes. `Accept: text/html` gets a 303 redirect to the connection page; otherwise `201 { connectionId, tenantId, status: "backfilling", reauthorized }` |
| `POST /webhooks/:provider/:secret` | Provider-specific body, verified against the stored connection secret and account. `202 { accepted: true }` after deduplication/queue transaction; disconnected connections return `202 { accepted: false }` |

Webhook `accepted: true` also covers duplicate bodies or valid events outside the configured mapping scope; it is not a count of new jobs. Missing/unsupported events or an account mismatch get 400. Callback and webhook verification never trusts a tenant id supplied in the body.

## Authentication and current user

| Method and path | Body / authorization | Success |
| --- | --- | --- |
| `GET /v1/auth/status` | anonymous | `200 { hasUsers }` |
| `POST /v1/auth/bootstrap` | `x-admin-key`; `{ email, name, password }`; only while no users exist | `201 { user: { id, email, name } }` + session cookie |
| `POST /v1/auth/login` | anonymous; `{ email, password }` | `200 { user: { id, email, name } }` + session cookie |
| `POST /v1/auth/logout` | no body needed; clears the cookie even without a session | `200 { ok: true }` |
| `GET /v1/me` | signed in or service key | `200 { user, system, permissions: { global, workspaces }, onboarding, preferences }`; assignments include `roleName` |
| `PATCH /v1/me` | user session; non-empty subset of `{ name, theme, defaultTenantId, landingPage }` | `200` same shape as `GET /v1/me`; own account only |
| `POST /v1/me/password` | user session; `{ currentPassword, newPassword }` | `200 { ok: true }`; other sessions revoked |
| `POST /v1/me/onboarding` | user session; `{ seen: string[] }` | `200 { seen }`; idempotent union with existing ids |

Login normalizes email by trimming and lowercasing. Bootstrap and password creation/change require 10–200 characters; names are trimmed, 1–120 characters. No password/token is returned in JSON. A failed login returns 401; after eight failed attempts for the same normalized email in 15 minutes, further attempts get 429. A successful login resets that email's throttle. Bootstrap on an initialized database gets 409.

Personal-settings validation and defaults: [access-control.md](access-control.md#personal-settings). Unknown fields get 400; default workspaces must be viewable, and an analytics start page also requires `analytics.view`. Service-key callers receive `preferences: null` and cannot change personal settings (400).

`/v1/me` returns `user: null`, `system: true`, `onboarding: null` for the service key; it cannot use personal password/onboarding routes (400). `permissions.global` contains every permission from all-workspace grants, including workspace-scoped permissions that apply everywhere. `permissions.workspaces` carries grants specific to individual workspaces. Session/cookie limits: [access-control.md](access-control.md#authentication). Onboarding validation: [onboarding.md](onboarding.md#server-state).

## Workspaces

| Method and path | Permission | Notes |
| --- | --- | --- |
| `GET /v1/providers` | signed in | `200 { providers }`; catalog statuses `available`, `not_configured`, `planned`. `callbackUrl` is null for planned providers |
| `GET /v1/tenants` | signed in | `200 { tenants }`; filtered to `workspaces.view`, possibly empty |
| `POST /v1/tenants` `{ name? }` | `workspaces.create` | `201 { tenantId }`; an empty body is allowed; a supplied name must be non-empty, ≤ 120 characters |
| `GET /v1/tenants/:id` | `workspaces.view` | `200 { tenant, connections }`; connection counts and backfill progress |
| `PATCH /v1/tenants/:id` `{ name?, timezone?, currency? }` | `workspaces.manage` | `200 { tenant, connections }`; at least one recognized field required |
| `GET /v1/tenants/:id/analytics` | `analytics.view` | `200` response from [metrics.md](metrics.md), including connection status and last sync |
| `GET /v1/tenants/:id/analytics/demo` | `analytics.view` | `200` same shape over a fictional team, `demo: true`, `connections: []`; reads and writes nothing in the workspace ([metrics.md](metrics.md#demo-data)) |

Workspace `timezone` accepts the runtime's supported IANA zones plus `UTC`; `currency` accepts three uppercase letters (the code does not validate against a currency registry). `null` clears those two fields, but not `name`. Timezone is stored for future date-window metrics; it does not filter current all-time totals. Catalog `available` means the adapter and app credentials exist, not that a live authorization has succeeded.

## Connections

| Method and path | Permission | Notes |
| --- | --- | --- |
| `POST /v1/tenants/:id/connect/:provider` `{ account? }` | `connections.manage` | `200 { authorizeUrl, redirectUri }`; provider validates/normalizes the account. `account` may be omitted only when the catalog entry has `accountChosenOnConsent: true` (the user picks it on the CRM consent screen); when given, re-authorization must return to that account or the callback gets 400 |
| `GET /v1/tenants/:id/connections` | `workspaces.view` | `200 { connections }` |
| `GET /v1/tenants/:id/connections/:cid` | `workspaces.view` | `200 { connection, sync, mappingOptions, pipelines, commercialSources, actionTypes }` |
| `GET …/activity` | `workspaces.view` | `200 { jobs }`; latest 30, including attempts/errors |
| `POST …/resync` | `connections.manage` | `202 { queued: true }`; 409 if sync runs or the connection is disconnected |
| `POST …/disconnect` | `connections.manage` | `200 { status: "disconnected", cancelledJobs }`; keeps data and mappings |
| `POST …/resume` | `connections.manage` | `202 { status: "backfilling" }`; only from disconnected, otherwise 409 |
| `POST …/commercial-sources`, `POST …/action-types` | `mappings.manage` | `202 { mapped: true, syncQueued: true }` |
| `DELETE …/commercial-sources/:kind/:category`, `DELETE …/action-types/:code` | `mappings.manage` | `202 { deleted: true, syncQueued: true }`; 404 if no mapping exists |
| `GET …/dashboard` | `analytics.view` | `200 { connection, analytics, commercialSources, limitations }`; metric version 1, legacy |

`connection` detail uses `accountId`, `eventsBound`, `eventsMode`, `lastSync`, `lastError`, `createdAt`; list responses use storage-style names such as `account_id` and `last_sync`. CRM credentials and webhook secrets are omitted from both.

### Mapping requests

Commercial mapping: `{ sourceKind, direction, categoryId?, amountField?, currencyField? }`.

- Take `sourceKind` from `mappingOptions.sources` or the declared `customSource` family. `direction` is `sale` or `purchase`.
- Omitted/empty `categoryId` means `*` (all pipelines); otherwise a pipeline id from the connection's `pipelines` (1–64 Latin letters, digits, `_` or `-`; HubSpot ids such as `default` are strings), or literal `*`.
- Supply field names only when `mappingOptions.fieldMapping` is non-null; omitted names use its defaults. When null, sending either field gets 400. Names begin with a Latin letter, then letters/digits/underscores, maximum 101 characters.

Work-type mapping: `{ providerTypeId, actionType }`. Provider code is 1–100 Latin letters/digits/underscores/hyphens; canonical type is 1–40 lowercase letters/underscores, starting with a letter. These routes queue rereading the affected source kind; changes are visible after sync, not immediately after the 202 response. A disconnected connection's worker drops queued work until resume.

## Users, roles, audit

Permissions: [access-control.md](access-control.md#users-roles-audit-api).

| Method and path | Body / result |
| --- | --- |
| `GET /v1/permissions` | `200 { permissions }`; any principal |
| `GET /v1/users`, `GET /v1/roles` | `200 { users }` / `200 { roles }` |
| `POST /v1/users` | `{ email, name, password, assignments? }` → `201 { user }`; omitted assignments means no grants |
| `PATCH /v1/users/:id` | `{ name?, email?, status?, password?, assignments? }` → `200 { user }`; status `active` or `disabled` |
| `DELETE /v1/users/:id` | `200 { deleted: true }` |
| `POST /v1/roles` | `{ name, description?, permissions }` → `201 { role }` |
| `PATCH /v1/roles/:id` | `{ name?, description?, permissions? }` → `200 { role }` |
| `DELETE /v1/roles/:id` | `200 { deleted: true }` |
| `GET /v1/audit?before=<id>&type=<groups>` | `200 { entries, next }`; 50 entries maximum, descending id; `before` is exclusive, `next` is the cursor or null. Optional `type` is a comma-separated subset of `auth`, `user`, `role`, `workspace`, `connection`, `mapping` (the action prefix); anything else → 400 |

Assignments are `[{ roleId, tenantId: string | null }]`, maximum 50. `null` means all workspaces (stored as `*`); supplied assignments **replace** existing grants. Custom role names are trimmed, 1–60 characters, descriptions ≤ 300 characters, permissions a non-empty list of known ids. Escalation/self/last-owner guards still apply even with the right route permission. Duplicate user email or a forbidden state change gets 409 or 403 as defined in the access reference.

## Errors and verification

Errors are `{ "error": "<English message>" }`; the UI translates them in `lib/toast.ts`.

| Status | Typical cause |
| --- | --- |
| 400 | invalid body/fields, callback state or event |
| 401 | no valid principal or invalid login/service key |
| 403 | missing permission, CSRF header or ungrantable role permissions |
| 404 | resource/mapping not found |
| 405 | wrong method on a matched protected route, after authentication |
| 409 | already initialized, sync already running, invalid state transition or protected user/role change |
| 413 | body exceeds 64 KiB |
| 429 | login throttled |
| 502 | connector authentication/upstream error during an HTTP request |
| 500 | unexpected server error; generic message only |

Queued connector failures are reported by connection status and job activity rather than by the original 202 response. Behavioral evidence is in `apps/api/test/access.test.ts`, `admin.test.ts`, `lifecycle.test.ts`, `analytics.test.ts`, `flow.test.ts`, `kommo.test.ts` and `resume.test.ts`; they use local SQLite and mocked provider responses.
