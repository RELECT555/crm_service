# Development guide

## Prerequisites

- Node.js 24.17+ (22.18+ also runs the type-stripped API and tests). npm 10+.
- No database server: the prototype uses `node:sqlite` (prints an "experimental" warning on Node 22–24; harmless).
- For a real Bitrix24 connection: a Bitrix24 application with the `crm` scope and a public HTTPS origin (event delivery cannot reach `localhost`; use a tunnel in development).

## First run

Run commands from the repository root. Copy the example only when `apps/api/.env` does not exist; keep an existing configuration. The example values for keys and OAuth credentials are placeholders, not working credentials.

```sh
npm install
cp apps/api/.env.example apps/api/.env      # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"   # -> DATA_KEY_BASE64
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))" # -> ADMIN_API_KEY (≥ 32 chars)
```

For UI development without a CRM, set `APP_ORIGIN=http://localhost:3000` and `ADMIN_ORIGIN=http://localhost:5173`, paste the generated keys into `.env`, and leave **both values of every OAuth pair empty**, including the Bitrix24 placeholders in `.env.example`. Provider credentials are only needed for a real connection. Use `localhost` consistently in browser and origin settings; the config allows plain HTTP only for that hostname, not `127.0.0.1`.

With a fresh database, start `npm run dev:api` and `npm run dev:web` in separate terminals, then create the first owner. To use demo data instead, seed **before the first API start** as described below.

| Variable (`apps/api/.env`) | Required | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | yes | Public origin of the API. OAuth redirect URI is `${APP_ORIGIN}/oauth/<provider>/callback`. HTTPS except `localhost`. |
| `ADMIN_API_KEY` | yes | Service key, ≥ 32 characters: creates the first owner in the UI and authenticates scripts (`x-admin-key`, acts as the `system` principal). People sign in with email and password. |
| `DATA_KEY_BASE64` | yes | 32-byte AES-256-GCM key for tokens and payloads. Losing it makes stored tokens unreadable. |
| `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET` | no | Bitrix24 application credentials. Leave both empty when working without a CRM. |
| `KOMMO_CLIENT_ID`, `KOMMO_CLIENT_SECRET` | no | Kommo integration credentials. |
| `AMOCRM_CLIENT_ID`, `AMOCRM_CLIENT_SECRET` | no | amoCRM integration credentials. |
| `PORT` | no | Default 3000. |
| `DB_PATH` | no | Default `./data/crm.sqlite` (relative to `apps/api`). |
| `ADMIN_ORIGIN` | no | Where the OAuth callback sends the browser. Set `http://localhost:5173` when using the Vite dev server. |
| `WEB_DIST` | no | Built admin UI directory served by the API. Default `apps/web/dist`. |

Set each OAuth pair completely or not at all. A missing pair shows «Нужна настройка»; a non-empty placeholder pair is treated as configured and can misleadingly show «Доступно». The registry does not test credentials until a connection is attempted. API npm scripts load `apps/api/.env`; process environment variables override the file. `DB_PATH` is resolved relative to the process working directory (the npm API scripts run in `apps/api`).

`API_TARGET` belongs to the **Vite process**, not the API config. It defaults to `http://localhost:3000`; export it in the web terminal when using another API port.

## Everyday commands (repository root)

| Command | What it does |
| --- | --- |
| `npm run dev:api` | API + worker on `:3000`, restarts on change. |
| `npm run dev:web` | Admin UI on `:5173` with hot reload; proxies `/v1`, `/oauth`, `/healthz` to `:3000`. |
| `npm run seed:demo` | Adds synthetic workspaces, users and Bitrix24 connections to `DB_PATH`; refuses an existing file by default. `--force` bypasses that guard and adds data; it does not reset the database. |
| `npm run check` | API typecheck + web typecheck and lint. Must pass before commit. |
| `npm test` | API integration tests (in-memory SQLite, mocked CRM). Must pass before commit. |
| `npm run build` | Builds the admin UI into `apps/web/dist`; the API then serves it at `APP_ORIGIN`. |

`npm run dev` starts only the web app. `npm run start -w @crm/api` runs the API without file watching. `npm run preview -w @crm/web` previews the built frontend; it does not start an API or use the Vite dev-server proxy.

## Working on the admin UI without a CRM

1. Configure the local origins and keys as above. Choose an unused demo database, e.g. `DB_PATH=./data/demo.sqlite`, in `apps/api/.env`.
2. `npm run seed:demo` once, then start `npm run dev:api` and `npm run dev:web` in separate terminals. Both API and seed must use the same database path and encryption key.
3. Open `http://localhost:5173` and sign in as `owner@example.com` / `demo-password-1` (owner of everything) or `analyst@example.com` / `demo-password-1` (analyst on one workspace — use it to see the permission-gated UI). You get three workspaces, one connection mid-backfill with mappings and five named managers with different work profiles (analytics and weak-spot signals have data), and one connection that needs re-authorization.

To see the analytics with data in any workspace, switch the analytics page to «Демо» (a read-only fictional team, [metrics.md](metrics.md#demo-data)).

On the first sign-in each user sees the welcome presentation and can take the tour ([onboarding.md](onboarding.md)); replay them from the help block in «Мои настройки» (profile menu → `/#/settings`). The same page edits your name, theme, default workspace/start page and password. Name and preferences persist in the account; email and roles are managed by an administrator. To get a fresh demo, stop the API and choose a new unused `DB_PATH` before seeding. Do not use `--force` as a reset command.

The demo passwords are public and exist only in the seed script; never seed a database that is reachable by anyone else.

Demo tokens are fake. With OAuth credentials empty, connection actions cannot use an adapter; with placeholders configured, sync or authorization can attempt a real provider request and fail. Use the demo to inspect analytics, roles and UI states, not to prove CRM integration. For deterministic failure testing use mocked responses in `apps/api/test`.

## First sign-in on a fresh database

With no users the UI shows «Первый запуск»: enter `ADMIN_API_KEY` once, plus the owner's name, email and a password (10–200 characters). The owner then adds people in «Пользователи» and gives them roles (built-in: Наблюдатель → Аналитик → Интегратор → Администратор → Владелец, or custom roles in «Роли и права»). Model and guards: [access-control.md](access-control.md). The browser cookie expires 12 hours after sign-in even though the server extends its session record on use; see the documented session limit there. Changing your own password ends your other sessions; an admin resetting a password, deactivating or deleting a user ends all of that user’s sessions.

## When default ports are busy

Set `PORT=3001`, `APP_ORIGIN=http://localhost:3001` and `ADMIN_ORIGIN=http://localhost:5174` in `apps/api/.env`. Start the API as usual. In the separate PowerShell web terminal:

```powershell
$env:API_TARGET = 'http://localhost:3001'
npm run dev -w @crm/web -- --host localhost --port 5174 --strictPort
```

Pass Vite flags to the workspace script directly; the root `dev:web` script wraps another npm invocation. `--strictPort` prevents Vite silently choosing a port different from `ADMIN_ORIGIN`. Use the URL printed by Vite and keep registered OAuth redirect URIs aligned with `APP_ORIGIN` when testing a real CRM.

## Checking the UI before a commit

Look at every changed screen in light and dark themes at 1440, 1280, 820 and 360 px, and once with the OS «reduce motion» setting on (Chromium DevTools → Rendering → `prefers-reduced-motion`). At 360 px `document.documentElement.scrollWidth` must equal the window width. Rules: [ui-guidelines.md](ui-guidelines.md).

## Connecting a real Bitrix24 portal

Follow [connectors/bitrix24.md](connectors/bitrix24.md). In short: expose the API over HTTPS (tunnel), set `APP_ORIGIN` to that URL, register `${APP_ORIGIN}/oauth/bitrix24/callback` in the Bitrix24 app, then use *Подключить CRM* in the admin UI.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Unable to resolve @typescript/typescript-linux-x64` | The lockfile was produced on another OS. Run `npm install --no-save @typescript/typescript-linux-x64@<typescript version>`; do not commit lockfile churn. A plain `npm install` removes it again. |
| `package-lock.json` changes after `npm install` with no dependency change | Different npm version rewrote metadata (`libc` fields). Revert the file. |
| Admin UI on the API origin looks outdated after `git pull` (missing features, old styles) | The API serves `apps/web/dist`, which is not in git. Run `npm run build`, or use `npm run dev:web`. |
| «Первый запуск» rejects the service key | The key differs from `ADMIN_API_KEY`, or the API restarted with a new `.env`. |
| «Слишком много попыток входа» | Login throttling: 8 wrong passwords for one email within 15 minutes; wait, or restart the API (throttle state is in memory). |
| Signed out unexpectedly | Browser cookie reached 12 h from sign-in, the server session expired after inactivity, password changed elsewhere, or the user was removed/deactivated. |
| «Нет доступа» on a page | The user's roles lack the page's permission in this workspace; global pages (users, roles, audit) need a role granted on «Все пространства». |
| Page scrolls sideways on a phone | A grid without explicit columns or a child without `min-w-0`; see ui-guidelines.md, «Responsive layout». |
| «Сервер недоступен» in the UI | API not running on the port the Vite proxy expects (`API_TARGET`, default `http://localhost:3000`). |
| Vite opens a different app or switches to another port | Another project occupies the default port. Use explicit ports and `--strictPort` above; do not stop the other project's server. |
| Seed says the database already exists | The API may have created it already. Stop the API and pick an unused demo `DB_PATH`; `--force` adds data rather than clearing it. |
| OAuth callback ends on the API origin instead of the dev server | `ADMIN_ORIGIN` not set. |
| Connection stuck in «Первичная загрузка» | Check the queue counts on the connection page and API logs (`Sync job failed …`). Bitrix24 events also need a public `APP_ORIGIN`. |
| Stored tokens fail to decrypt after a restart | `DATA_KEY_BASE64` changed. Restore the old key or reconnect the accounts. |
