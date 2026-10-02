# CRM admin interface

Operator admin UI for the CRM analytics backend, built with React, TypeScript, Vite, Tailwind CSS, shadcn components on Base UI, and Motion. Screens: sign-in and first-owner setup, workspaces (tenants), CRM connection wizard and catalog, connection health and sync coverage, commercial/activity mappings, team analytics, users, roles and permissions, audit log.

From the repository root:

```sh
npm run dev:api   # backend on :3000
npm run dev:web   # admin UI on :5173, proxies /v1 and /oauth to :3000
npm run check     # tsc + oxlint
npm run build     # dist/, served by the backend at APP_ORIGIN
```

Design rules: [docs/ui-guidelines.md](../../docs/ui-guidelines.md). For UI work without a CRM run `npm run seed:demo` once.

Sign in with email and password (demo data: `owner@example.com` / `demo-password-1`). The session is an HttpOnly cookie, so no credential is ever readable by browser code; the backend's `ADMIN_API_KEY` is typed only once, on the «Первый запуск» screen of an empty database. Set `ADMIN_ORIGIN=http://localhost:5173` in `apps/api/.env` so the OAuth callback returns the browser to the dev server.

What the UI shows depends on the user's permissions (`useCan` in `lib/session.ts`); the server enforces the same rules on every request.

## Structure

```text
src/
  main.tsx                MotionConfig (honors reduced motion) -> SessionProvider (login gate) -> App
  App.tsx                 shell (sidebar) + hash routes with their required permission; pages load lazily
  index.css               Tailwind theme and design tokens (light + dark)
  components/ui/          shadcn primitives on Base UI (button, badge, card, dialog, sheet, dropdown-menu, input, table, ...)
  components/             app building blocks (common.tsx), Sidebar, SessionProvider, charts, ThemeSwitch, provider catalog, connect sheet, toasts
  pages/                  one file per screen; owns its data loading (Analytics, Users, Roles, Audit, Login, ...)
  lib/api.ts              typed client for /v1 — the only module that calls fetch
  lib/use-resource.ts     data loading + polling hook
  lib/router.ts           hash router
  lib/format.ts           Russian labels, statuses, dates and numbers
  lib/theme.ts            light/dark/system preference (public/theme-init.js applies it before first paint)
  lib/toast.ts            toast context and error messages
  lib/session.ts          session context, permission ids, useCan()
  lib/motion.ts           Motion presets (springs, stagger variants)
  lib/chart-colors.ts     validated chart series slots
  lib/use-media.ts        useMediaQuery
  lib/utils.ts            cn()
```
