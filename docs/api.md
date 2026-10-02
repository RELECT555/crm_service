# HTTP API reference

All routes are served by `apps/api` (`src/http/routes/*`). JSON in and out. `/v1/*` routes need a principal: a session cookie from `/v1/auth/login` (plus the `x-requested-with: crm-admin` header on non-GET requests) or the `x-admin-key` service key. Permission names are defined in [access-control.md](access-control.md). Errors: `{ "error": "<English message>" }` with 400/401/403/404/405/409/413/429/502/500; the UI translates them in `apps/web/src/lib/toast.ts`.

## Public

| Method and path | Purpose |
| --- | --- |
| `GET /healthz` | Liveness |
| `GET /oauth/:provider/callback` | OAuth return; proved by single-use state; redirects a browser to the connection page |
| `POST /webhooks/:provider/:secret` | CRM change events; secret URL + account check; 202 after durable enqueue |

## Authentication and current user

See [access-control.md](access-control.md#authentication): `GET /v1/auth/status`, `POST /v1/auth/bootstrap|login|logout`, `GET /v1/me`, `POST /v1/me/password`, `POST /v1/me/onboarding` ([onboarding.md](onboarding.md#server-state)).

## Workspaces

| Method and path | Permission | Notes |
| --- | --- | --- |
| `GET /v1/providers` | signed in | Connector catalog with status, setup steps, redirect URI |
| `GET /v1/tenants` | — | Only workspaces with `workspaces.view` |
| `POST /v1/tenants` `{ name? }` | `workspaces.create` | |
| `GET /v1/tenants/:id` | `workspaces.view` | Workspace + connections with record counts and backfill progress |
| `PATCH /v1/tenants/:id` `{ name?, timezone?, currency? }` | `workspaces.manage` | IANA zone, ISO 4217 code, `null` clears |
| `GET /v1/tenants/:id/analytics` | `analytics.view` | [metrics.md](metrics.md) |

## Connections

| Method and path | Permission | Notes |
| --- | --- | --- |
| `POST /v1/tenants/:id/connect/:provider` `{ account }` | `connections.manage` | Returns `authorizeUrl` |
| `GET /v1/tenants/:id/connections` | `workspaces.view` | |
| `GET /v1/tenants/:id/connections/:cid` | `workspaces.view` | Status, coverage, queue, mapping options, pipelines, mappings |
| `GET …/activity` | `workspaces.view` | Last 30 jobs with errors |
| `POST …/resync` | `connections.manage` | 409 when a sync runs or the connection is disconnected |
| `POST …/disconnect`, `POST …/resume` | `connections.manage` | Local and reversible |
| `POST …/commercial-sources`, `DELETE …/commercial-sources/:kind/:category` | `mappings.manage` | Kinds from `mappingOptions` |
| `POST …/action-types`, `DELETE …/action-types/:code` | `mappings.manage` | |
| `GET …/dashboard` | `analytics.view` | Metric version 1 per connection (legacy) |

## Users, roles, audit

See [access-control.md](access-control.md#users-roles-audit-api).
