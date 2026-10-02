# Code architecture

Status: describes the code as it is in `apps/`. Update this file in the same change that moves a boundary.

## Repository layout

```text
apps/
  api/                         Node.js 24 + TypeScript (type stripping, no build step), SQLite prototype
    src/
      server.ts                process entry: load config, open store, listen, start worker
      app.ts                   composition root: registry + routers + worker; request pipeline; error mapping
      config.ts                environment -> typed Config (fails fast on missing secrets)
      domain/model.ts          canonical, provider-neutral types (CanonicalRecord, ChangeEvent, statuses)
      domain/permissions.ts    permission catalog + built-in roles (docs/access-control.md); pure data
      domain/analytics.ts      computeAnalytics: aggregate rows -> team/manager metrics + signals (docs/metrics.md); pure
      storage/store.ts         the only SQL for tenants, connections, records, jobs; forward-only migrations
      storage/access.ts        the only SQL for users, roles, assignments, sessions, audit log, onboarding state (store.access)
      security/crypto.ts       AES-256-GCM sealing, SHA-256 digests, constant-time compare
      security/password.ts     scrypt password hashing and verification
      connectors/
        types.ts               Connector contract, ProviderInfo, connector error classes
        registry.ts            which adapters exist; catalog = available adapters + planned providers
        catalog.ts             researched-but-not-implemented providers (admin UI catalog)
        kommo/                 Kommo + amoCRM adapter (platforms.ts holds the two registrations)
        bitrix24/              one folder per provider; nothing outside it may know Bitrix field names
          index.ts             Bitrix24Connector implements Connector
          client.ts            authenticated REST transport, token refresh, retry/backoff
          oauth.ts             portal validation, consent URL, token exchange
          mapping.ts           Bitrix JSON -> CanonicalRecord, webhook body -> ChangeEvent
          info.ts              ProviderInfo shown in the admin UI
          values.ts            defensive JSON readers
      sync/worker.ts           provider-neutral job runner: bind / sync page / fetch event
      http/
        router.ts              tiny method+path router
        respond.ts             HttpError, JSON helpers, body limits
        static.ts              serves apps/web/dist with CSP
        context.ts             AppContext passed to route modules
        auth.ts                Principal, resolvePrincipal (cookie session or x-admin-key), can/requirePermission, CSRF, login throttle
        routes/public.ts       /healthz, /oauth/:provider/callback, /webhooks/:provider/:secret
        routes/auth.ts         /v1/auth/* (status, bootstrap, login, logout) — reachable without a principal
        routes/access.ts       /v1/me (+ password, onboarding), users, roles, permissions, audit (docs/access-control.md)
        routes/admin.ts        /v1/tenants/*, connections, mappings, analytics — each route checks one permission
    test/                      node:test integration tests against an in-memory store and mocked fetch
    scripts/seed-demo.ts       demo workspaces/connections for UI work without a CRM (npm run seed:demo)
  web/                         React 19 + Vite + Tailwind CSS + shadcn (Base UI) + Motion admin UI
    src/
      main.tsx                 MotionConfig (reduced motion) -> SessionProvider -> OnboardingProvider -> App
      App.tsx                  hash routes -> page + required permission; lazy page chunks; page transitions
      components/ui/           shadcn primitives (button, card, dialog, sheet, dropdown-menu, table, ...); overlays animated with Motion
      components/              app building blocks composed from ui/: Sidebar, SessionProvider, charts, common
      components/LoginBackdrop.tsx  decorative sign-in canvas; Motion loop, explicit playback, visibility and context lifecycle
      components/onboarding/   welcome presentation, guided tour, OnboardingProvider (docs/onboarding.md); lazy chunks
      pages/                   one file per screen; owns data loading for that screen
                               Workspaces, Workspace, Connection, Catalog, Analytics, Users, Roles, Audit, Login
      lib/api.ts               typed client for /v1; the only module that calls fetch; cookie session + CSRF header
      lib/session.ts           session context, Permission ids (mirror of domain/permissions.ts), useCan()
      lib/motion.ts            Motion presets (springs, stagger variants) — docs/ui-guidelines.md#motion
      lib/login-shader.ts      sign-in WebGL renderer; theme-token uniforms, bounded resolution, static CSS fallback
      lib/onboarding.ts        WELCOME_ID, TOUR_STEPS registry, eligibleSteps, useOnboarding
      lib/storage.ts           localStorage helpers and keys (never for state that must persist)
      lib/chart-colors.ts      validated categorical chart slots (CSS tokens --series-*)
      lib/use-media.ts         useMediaQuery for behavior that changes by breakpoint
      lib/                     router, use-resource hook, formatting/labels, toasts, theme, cn()
docs/
  connectors.md                capability matrix and quick reference
  connectors/<provider>.md     per-provider playbooks (setup, auth, data, change capture, limits, sources)
```

## Dependency rules

Arrows point to what a module may import. Anything not listed is forbidden.

```text
server.ts -> app.ts -> http/*, connectors/registry.ts, sync/*, storage/*, security/*, config.ts
http/routes/* -> storage, sync (queue helpers), connectors/types + registry, security, config
sync/*        -> connectors/types + registry, storage, security, domain
connectors/<p>/* -> connectors/types, domain, storage (mapping config + token persistence only), security, config
storage/*     -> domain
domain/*      -> nothing
domain/analytics.ts, domain/permissions.ts -> nothing (pure; tested without HTTP)
web/pages      -> web/lib/*, web/components
web/components -> web/components/ui, web/lib/*  (components/ui imports only web/lib/utils)
```

- **Provider knowledge lives only in `connectors/<provider>/`.** Routes, worker, store and UI never branch on a provider ID or read provider field names. The current exception is listed under Known debt.
- **SQL lives only in `storage/store.ts`.** Every query that reads customer data filters by `tenant_id` and/or `connection_id`.
- **The worker never inspects provider errors.** Adapters translate failures into `ConnectorAuthError` (stop, require re-authorization), `ConnectorInputError` (operator mistake, HTTP 400) or `ConnectorUpstreamError`/any other error (retry with backoff, then `degraded`).
- **The browser never sees CRM credentials.** API responses expose `account`, `accountId`, status and counts; never `*_enc` columns, tokens or webhook secrets. `test/admin.test.ts` asserts this.

## Request pipeline (`app.ts`)

1. Public router: health, OAuth callback (proved by single-use `state`), webhooks (proved by per-connection secret URL + provider account ID in the body).
2. Static admin UI for non-`/v1` GETs when `apps/web/dist` exists.
3. Auth router (`/v1/auth/status`, `bootstrap`, `login`, `logout`) — the only `/v1` routes without a principal.
4. Principal: the `crm_session` cookie (a user) or `x-admin-key` (the system principal, for scripts and first-owner bootstrap). No principal → 401. Cookie requests other than GET/HEAD must carry `x-requested-with: crm-admin` (CSRF guard) or get 403.
5. Admin + access routers. Every route calls `requirePermission(principal, permission, tenantId?)` before touching data and writes an audit entry for each change; unknown path → 404, wrong method → 405.

Errors: `HttpError` → its status; `ConnectorInputError` → 400; connector auth/upstream → 502; anything else → 500 with a generic message (details only in server logs, never tokens).

## Connection lifecycle

```text
POST /v1/tenants/:t/connect/:provider {account}
  -> connector.normalizeAccount, store single-use state (tenant, provider, account), return authorizeUrl
GET /oauth/:provider/callback
  -> consume state -> connector.completeAuthorization (verifies account identity)
  -> new account: save connection + queue bind + sync for connector.syncKinds()
  -> known account: rotate tokens, queue full resync (repairs reauthorization_required)
worker
  bind  -> connector.subscribe(handler URL with secret) -> events_bound = 1
  bind  returns the events mode: `webhook`, or `polling` when the CRM plan forbids webhooks (hourly reconciliation)
  sync  -> connector.listPage -> upsert records + checkpoint + next page job in ONE transaction
  fetch -> connector.fetchRecord (upsert) or tombstone on a verified delete event
  refreshSyncState -> live when no sync job is pending, all checkpoints complete, events bound
hourly -> connections stale > 24 h get a full reconciliation (polling-mode connections: > 1 h)
disconnect -> status `disconnected`, queued jobs cancelled, worker drops jobs that were already running, webhooks answered 202 and ignored
resume     -> full sync, as for a new connection
jobs keep `error` (last failure, cleared on success) and `finished_at`; GET …/activity shows the last 30
```

Statuses: `connecting`, `backfilling`, `live`, `degraded`, `reauthorization_required`, `disconnected` (`domain/model.ts`). The admin UI labels them in `web/src/lib.ts`.

## Adding a connector (checklist)

1. Research: copy `docs/connectors/_template.md` to `docs/connectors/<id>.md`; cite official docs for every API claim; mark sandbox-unverified behavior.
2. Create `apps/api/src/connectors/<id>/` with `info.ts`, `oauth.ts`, `client.ts`, `mapping.ts`, `index.ts`. Implement every `Connector` method. Map provider errors to the connector error classes.
3. Register it in `connectors/registry.ts`; remove its entry from `catalog.ts`. Add its credentials to `config.ts` and `.env.example` (placeholders only).
4. Tests in `apps/api/test/<id>.test.ts` with a mocked `fetch`: OAuth success + account mismatch, page boundary and cursor resume, token refresh, 429/5xx retry, auth failure → `reauthorization_required`, event spoofing (wrong account), duplicate event, delete event, tenant isolation.
5. Update `docs/connectors.md` quick reference and README if operator setup changed.
6. Run `npm run check` and `npm test` at the repository root. Both must pass.

## Access control and analytics (summary)

- Permissions and built-in roles are data in `domain/permissions.ts`; custom roles are rows in `roles`. A grant is (user, role, workspace or `*`). Global-scope permissions (users, roles, audit, workspace creation) only count from `*` grants. Full model, guards and endpoints: [access-control.md](access-control.md).
- Adding a permission: add it to `PERMISSIONS` (and to the right built-in role), mirror the id in `web/src/lib/session.ts`, gate the route with `requirePermission`, gate the UI with `useCan`, add a test in `test/access.test.ts`, document it in access-control.md.
- Analytics: `store.analyticsRows()` aggregates records with SQL `GROUP BY` per connection/owner/axis/type; `domain/analytics.ts` turns rows into metrics and signals. Definitions and thresholds: [metrics.md](metrics.md). Bump `METRIC_VERSION` when a definition changes.

## Admin UI conventions (`apps/web`)

- Stack: React, Vite, Tailwind CSS v4, shadcn components on Base UI (`@base-ui/react`), icons from `lucide-react`. Do not add Radix UI.
- Hash routing (`#/tenants/:id/connections/:id`) so the backend can serve the build as static files.
- Pages own data loading through `useResource`; `components/ui` stays generic (shadcn), `components/common.tsx` holds app building blocks.
- Full rules: [ui-guidelines.md](ui-guidelines.md). Theme preference (light/dark/system) lives in `lib/theme.ts`.
- Colors come only from tokens in `src/index.css` via Tailwind classes (`bg-primary`, `text-muted-foreground`, `text-success`, ...). Status colors come from `STATUS` in `lib/format.ts`. Light and dark themes are both required.
- All copy is Russian, concise, and states consequences ("запустит полную пересинхронизацию").
- Sign-in is by email and password; the session is an HttpOnly cookie the browser script cannot read. `lib/api.ts` sends the CSRF header on every request and fires a session-expired event on 401, which returns the app to the login screen. The operator key is typed only once, on the first-owner bootstrap screen.
- The sign-in background follows reduced motion by default; its explicit play/pause choice is saved in `localStorage` (`crm-login-motion`) and controls `LoginBackdrop`.
- Permission-gated UI uses `useCan()`; pages register their required permission in `resolve()` in `App.tsx`.
- Onboarding: the presentation and tour are data-driven (`lib/onboarding.ts`); a new section adds a `data-tour` anchor and a tour step ([onboarding.md](onboarding.md)).
- Animations use Motion presets from `lib/motion.ts`; responsive layouts follow the three-layout rule (phone top bar, tablet rail, desktop sidebar). Both are specified in [ui-guidelines.md](ui-guidelines.md).

## Testing

`npm test` runs `node --test` over `apps/api/test`. Tests start the real HTTP server on an ephemeral port with `:memory:` SQLite and a fake `fetch`; they never call a real CRM. Drain the queue with `while (await worker.tick()) {}`. `npm run check` type-checks the API (`tsc`) and the web app (`tsc -b` + `oxlint`; shadcn files in `components/ui` are exempt from the fast-refresh export rule).

## Connector contract highlights

- `info` — catalog entry; the registry marks it `not_configured` when the provider's app credentials are missing (`requiredEnv`).
- `completeAuthorization` may return non-secret `settings` (e.g. account currency) stored on the connection.
- `subscribe` returns the events mode; `parseEvents` returns every change in a webhook body (one body can carry several).
- `fetchRecord` returns null for a record that no longer exists; only delete events tombstone.
- `mappingOptions()` declares mappable commercial kinds, an optional custom-process family (`smart:<id>`), the pipeline record kind for the picker, whether amount/currency fields are configurable, and the work-item kind (`activityKind`) that is resynced after an action-type mapping change. Routes and the UI never hardcode these.

## Known debt

- Single-process SQLite and in-process worker; rate limiting is per process (Kommo client spaces requests per connection).
- Kommo backfill uses page numbers; Bitrix24 uses id keysets. Incremental `updated_at` scans would make polling-mode reconciliation cheaper.
- Existing databases keep the old `UNIQUE(tenant_id, account_id)` connection key; new databases use `(tenant_id, provider, account_id)`.
- `GET …/connections/:id/dashboard` (`store.dashboard`) predates the workspace analytics endpoint and has no UI; remove it once nothing calls it.
- Analytics has no date filter yet: metrics cover all loaded data (see metrics.md, «Coverage and limits»).
- Sessions and login throttling live in one process; a multi-instance deployment needs a shared store.
