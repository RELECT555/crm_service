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
      storage/store.ts         the only SQL; tenant-scoped reads/writes, forward-only migrations
      security/crypto.ts       AES-256-GCM sealing, SHA-256 digests, constant-time compare
      connectors/
        types.ts               Connector contract, ProviderInfo, connector error classes
        registry.ts            which adapters exist; catalog = available adapters + planned providers
        catalog.ts             researched-but-not-implemented providers (admin UI catalog)
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
        routes/public.ts       /healthz, /oauth/:provider/callback, /webhooks/:provider/:secret
        routes/admin.ts        /v1/* operator API (x-admin-key)
    test/                      node:test integration tests against an in-memory store and mocked fetch
  web/                         React 19 + Vite admin UI (no analytics screens yet)
    src/
      api.ts                   typed client for /v1; the only module that calls fetch
      lib.ts                   hash router, data hook, formatting, Russian labels
      components/              presentational building blocks (no API calls)
      pages/                   one file per screen; owns data loading for that screen
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
web/pages     -> web/api.ts, web/lib.ts, web/components
web/components -> web/lib.ts (formatting only)
```

- **Provider knowledge lives only in `connectors/<provider>/`.** Routes, worker, store and UI never branch on a provider ID or read provider field names. The current exception is listed under Known debt.
- **SQL lives only in `storage/store.ts`.** Every query that reads customer data filters by `tenant_id` and/or `connection_id`.
- **The worker never inspects provider errors.** Adapters translate failures into `ConnectorAuthError` (stop, require re-authorization), `ConnectorInputError` (operator mistake, HTTP 400) or `ConnectorUpstreamError`/any other error (retry with backoff, then `degraded`).
- **The browser never sees CRM credentials.** API responses expose `account`, `accountId`, status and counts; never `*_enc` columns, tokens or webhook secrets. `test/admin.test.ts` asserts this.

## Request pipeline (`app.ts`)

1. Public router: health, OAuth callback (proved by single-use `state`), webhooks (proved by per-connection secret URL + provider account ID in the body).
2. Static admin UI for non-`/v1` GETs when `apps/web/dist` exists.
3. Operator key check (`x-admin-key`, constant-time compare). This is a development credential, not customer authentication.
4. Admin router; unknown path → 404, wrong method → 405.

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
  sync  -> connector.listPage -> upsert records + checkpoint + next page job in ONE transaction
  fetch -> connector.fetchRecord (upsert) or tombstone on a verified delete event
  refreshSyncState -> live when no sync job is pending, all checkpoints complete, events bound
hourly -> connections stale > 24 h get a full reconciliation
```

Statuses: `connecting`, `backfilling`, `live`, `degraded`, `reauthorization_required`, `disconnected` (`domain/model.ts`). The admin UI labels them in `web/src/lib.ts`.

## Adding a connector (checklist)

1. Research: copy `docs/connectors/_template.md` to `docs/connectors/<id>.md`; cite official docs for every API claim; mark sandbox-unverified behavior.
2. Create `apps/api/src/connectors/<id>/` with `info.ts`, `oauth.ts`, `client.ts`, `mapping.ts`, `index.ts`. Implement every `Connector` method. Map provider errors to the connector error classes.
3. Register it in `connectors/registry.ts`; remove its entry from `catalog.ts`. Add its credentials to `config.ts` and `.env.example` (placeholders only).
4. Tests in `apps/api/test/<id>.test.ts` with a mocked `fetch`: OAuth success + account mismatch, page boundary and cursor resume, token refresh, 429/5xx retry, auth failure → `reauthorization_required`, event spoofing (wrong account), duplicate event, delete event, tenant isolation.
5. Update `docs/connectors.md` quick reference and README if operator setup changed.
6. Run `npm run check` and `npm test` at the repository root. Both must pass.

## Admin UI conventions (`apps/web`)

- Hash routing (`#/tenants/:id/connections/:id`) so the backend can serve the build as static files.
- Pages own data loading through `useResource`; components are presentational and receive data via props.
- All copy is Russian, concise, and states consequences ("запустит полную пересинхронизацию"). Status colors come from the `STATUS` table, never ad hoc.
- Design tokens live in `src/styles.css` (`--color-*`, `--space-*`, `--radius-*`); do not hardcode colors in components. Light and dark themes are both required.
- The operator key is kept in `sessionStorage`; there is no customer login yet.

## Testing

`npm test` runs `node --test` over `apps/api/test`. Tests start the real HTTP server on an ephemeral port with `:memory:` SQLite and a fake `fetch`; they never call a real CRM. Drain the queue with `while (await worker.tick()) {}`. `npm run check` type-checks the API (`tsc`) and the web app (`tsc -b` + `oxlint`).

## Known debt

- **Commercial-source mappings use Bitrix24 `entityTypeId`** (`commercial_sources.entity_type_id`, `/commercial-sources` validation in `routes/admin.ts`). Generalize to connector object kinds (`deal`, `smart:128`, Kommo pipeline IDs, ...) when the second connector lands, via a connector method that validates and describes mappable sources.
- Column names `account_id`/`account` were renamed from Bitrix-specific names by forward migration; the unique key on existing databases still predates the `provider` column.
- Single-process SQLite and in-process worker; no per-connection rate limiter yet; refresh-token rotation must be made atomic before adding Kommo (rotating refresh tokens).
- The analytics read model (`store.dashboard`) is a prototype and has no UI.
