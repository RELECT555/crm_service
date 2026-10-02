# Admin UI

React + Vite admin panel for the CRM analytics backend: workspaces (tenants), CRM connection catalog, connection health, sync coverage, and commercial/activity mappings. Analytics screens are not part of this UI yet.

```powershell
npm run dev:api   # backend on :3000
npm run dev:web   # admin UI on :5173, proxies /v1 and /oauth to :3000
```

Sign in with the backend's `ADMIN_API_KEY`. The key is kept in `sessionStorage` for the current tab only; it is an operator credential, not customer authentication. Set `ADMIN_ORIGIN=http://localhost:5173` in `apps/api/.env` so the OAuth callback returns the browser to the dev server. `npm run build` writes `dist/`, which the backend serves at `APP_ORIGIN` in production-like runs.
