# Development guide

## Prerequisites

- Node.js 24.17+ (22.18+ also runs the type-stripped API and tests). npm 10+.
- No database server: the prototype uses `node:sqlite` (prints an "experimental" warning on Node 22–24; harmless).
- For a real Bitrix24 connection: a Bitrix24 application with the `crm` scope and a public HTTPS origin (event delivery cannot reach `localhost`; use a tunnel in development).

## First run

```sh
npm install
cp apps/api/.env.example apps/api/.env      # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"   # -> DATA_KEY_BASE64
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))" # -> ADMIN_API_KEY (≥ 32 chars)
```

| Variable (`apps/api/.env`) | Required | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | yes | Public origin of the API. OAuth redirect URI is `${APP_ORIGIN}/oauth/<provider>/callback`. HTTPS except `localhost`. |
| `ADMIN_API_KEY` | yes | Operator key for the admin UI and `/v1` routes, ≥ 32 characters. |
| `DATA_KEY_BASE64` | yes | 32-byte AES-256-GCM key for tokens and payloads. Losing it makes stored tokens unreadable. |
| `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET` | yes | Bitrix24 application credentials (placeholders are fine with demo data). |
| `PORT` | no | Default 3000. |
| `DB_PATH` | no | Default `./data/crm.sqlite` (relative to `apps/api`). |
| `ADMIN_ORIGIN` | no | Where the OAuth callback sends the browser. Set `http://localhost:5173` when using the Vite dev server. |
| `WEB_DIST` | no | Built admin UI directory served by the API. Default `apps/web/dist`. |

## Everyday commands (repository root)

| Command | What it does |
| --- | --- |
| `npm run dev:api` | API + worker on `:3000`, restarts on change. |
| `npm run dev:web` | Admin UI on `:5173` with hot reload; proxies `/v1`, `/oauth`, `/healthz` to `:3000`. |
| `npm run seed:demo` | Writes demo workspaces and Bitrix24 connections into `DB_PATH` (refuses to touch an existing file unless `-- --force`). |
| `npm run check` | API typecheck + web typecheck and lint. Must pass before commit. |
| `npm test` | API integration tests (in-memory SQLite, mocked CRM). Must pass before commit. |
| `npm run build` | Builds the admin UI into `apps/web/dist`; the API then serves it at `APP_ORIGIN`. |

## Working on the admin UI without a CRM

1. Set `ADMIN_ORIGIN=http://localhost:5173` in `apps/api/.env`.
2. `npm run seed:demo` once, then `npm run dev:api` and `npm run dev:web`.
3. Open `http://localhost:5173`, sign in with `ADMIN_API_KEY`. You get three workspaces, one connection mid-backfill with mappings, and one that needs re-authorization.

Demo tokens are fake. Clicking «Полная синхронизация» or «Переавторизовать» on demo data will fail against Bitrix24 — that is expected and shows the error states.

## Connecting a real Bitrix24 portal

Follow [connectors/bitrix24.md](connectors/bitrix24.md). In short: expose the API over HTTPS (tunnel), set `APP_ORIGIN` to that URL, register `${APP_ORIGIN}/oauth/bitrix24/callback` in the Bitrix24 app, then use *Подключить CRM* in the admin UI.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Unable to resolve @typescript/typescript-linux-x64` | The lockfile was produced on another OS. Run `npm install --no-save @typescript/typescript-linux-x64@<typescript version>`; do not commit lockfile churn. A plain `npm install` removes it again. |
| `package-lock.json` changes after `npm install` with no dependency change | Different npm version rewrote metadata (`libc` fields). Revert the file. |
| Admin UI shows «Ключ администратора не подошёл» | The key differs from `ADMIN_API_KEY`, or the API restarted with a new `.env`. |
| «Сервер недоступен» in the UI | API not running on the port the Vite proxy expects (`API_TARGET`, default `http://localhost:3000`). |
| OAuth callback ends on the API origin instead of the dev server | `ADMIN_ORIGIN` not set. |
| Connection stuck in «Первичная загрузка» | Check the queue counts on the connection page and API logs (`Sync job failed …`). Bitrix24 events also need a public `APP_ORIGIN`. |
| Stored tokens fail to decrypt after a restart | `DATA_KEY_BASE64` changed. Restore the old key or reconnect the accounts. |
