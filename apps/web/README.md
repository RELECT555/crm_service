# CRM admin interface

Operator admin UI for the CRM analytics backend, built with React, TypeScript, Vite, Tailwind CSS, shadcn components on Base UI, and Motion. Screens: sign-in and first-owner setup, workspaces (tenants), CRM connection wizard and catalog, connection health and sync coverage, commercial/activity mappings, team analytics, users, roles and permissions, audit log, plus a welcome presentation and guided tour on first sign-in ([docs/onboarding.md](../../docs/onboarding.md)).

Configure the API first using the [development guide](../../docs/development.md). For UI work without a CRM, leave OAuth credentials empty and seed an unused database **before** the first API start. `--force` adds data; it does not reset a database.

From the repository root, start the API and web server in separate terminals:

```sh
npm run dev:api   # backend on :3000
npm run dev:web   # admin UI on :5173, proxies /v1 and /oauth to :3000
```

`npm run check` runs typechecks and lint. `npm run build` writes `apps/web/dist`, served by the backend at `APP_ORIGIN`; rebuild it after UI changes when using the API origin. Vite preview does not start an API or provide the dev-server proxy. Design rules: [docs/ui-guidelines.md](../../docs/ui-guidelines.md).

Sign in with email and password (demo data: `owner@example.com` / `demo-password-1`). Browser JavaScript cannot read the HttpOnly session cookie. Passwords and the first-owner service key are form inputs and are not persisted in browser storage; CRM tokens stay on the server. `ADMIN_API_KEY` is used on the «Первый запуск» screen of an empty database. Set `ADMIN_ORIGIN=http://localhost:5173` in `apps/api/.env` so OAuth returns to the dev server. Cookie expiry, CSRF and service-key precedence: [access control](../../docs/access-control.md#authentication).

Sign-in has a theme-token WebGL background that moves until paused, including under OS reduced motion. The saved play/pause control, hidden-tab pause and static fallback are scoped to sign-in (decisions 25, 27, 28); other UI animations follow reduced motion.

What the UI shows depends on the user's permissions (`useCan` in `lib/session.ts`); the server enforces the same rules on every request.

## Structure

```text
src/
  main.tsx                MotionConfig -> ToastProvider -> SessionProvider -> OnboardingProvider -> App
  App.tsx                 shell (sidebar) + hash routes with their required permission; pages load lazily
  index.css               Tailwind theme and design tokens (light + dark)
  components/ui/          shadcn primitives on Base UI (button, badge, card, dialog, sheet, dropdown-menu, input, table, ...)
  components/             app building blocks (common.tsx), Sidebar, SessionProvider, charts, ThemeSwitch, provider catalog, connect sheet, toasts
  components/onboarding/  Welcome (presentation), Tour (spotlight), OnboardingProvider (when to show what)
  components/LoginBackdrop.tsx  sign-in canvas playback and context lifecycle
  pages/                  one file per screen; owns its data loading (Analytics, Users, Roles, Audit, Login, ...)
  lib/api.ts              typed client for /v1 — the only module that calls fetch
  lib/use-resource.ts     data loading + polling hook
  lib/router.ts           hash router
  lib/format.ts           Russian labels, statuses, dates and numbers
  lib/theme.ts            light/dark/system preference (public/theme-init.js applies it before first paint)
  lib/toast.ts            toast context and error messages
  lib/session.ts          session context, permission ids, useCan()
  lib/motion.ts           Motion presets (springs, stagger variants)
  lib/login-shader.ts     WebGL renderer with theme-token colors and bounded resolution
  lib/onboarding.ts       presentation id and tour steps registry (add a step when a section ships)
  lib/storage.ts          localStorage helpers
  lib/chart-colors.ts     validated chart series slots
  lib/use-media.ts        useMediaQuery
  lib/utils.ts            cn()
```
