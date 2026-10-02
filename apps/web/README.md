# CRM admin interface

Operator admin UI for the CRM analytics backend, built with React, TypeScript, Vite, Tailwind CSS, and shadcn components on Base UI. Screens: workspaces (tenants), CRM connection wizard and catalog, connection health and sync coverage, commercial/activity mappings. Analytics screens are not part of this UI yet.

From the repository root:

```sh
npm run dev:api   # backend on :3000
npm run dev:web   # admin UI on :5173, proxies /v1 and /oauth to :3000
npm run check     # tsc + oxlint
npm run build     # dist/, served by the backend at APP_ORIGIN
```

Sign in with the backend's `ADMIN_API_KEY`. The operator types the key at runtime; it is kept in `sessionStorage` for the current tab only and is never part of the bundle or source. It is an operator credential, not customer authentication. Set `ADMIN_ORIGIN=http://localhost:5173` in `apps/api/.env` so the OAuth callback returns the browser to the dev server.

## Structure

```text
src/
  App.tsx                 shell (sidebar) + hash routes
  index.css               Tailwind theme and design tokens (light + dark)
  components/ui/          shadcn primitives on Base UI (button, badge, card, dialog, sheet, input, table, ...)
  components/             app building blocks (common.tsx), provider catalog, connect sheet, toasts
  pages/                  one file per screen; owns its data loading
  lib/api.ts              typed client for /v1 — the only module that calls fetch
  lib/use-resource.ts     data loading + polling hook
  lib/router.ts           hash router
  lib/format.ts           Russian labels, statuses, dates and numbers
  lib/toast.ts            toast context and error messages
  lib/utils.ts            cn()
```
