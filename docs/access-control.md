# Access control

Status: implemented in `apps/api` (2026-10-02). Code: `domain/permissions.ts` (catalog and built-in roles), `storage/access.ts` (SQL), `http/auth.ts` (principal, checks, CSRF, throttle), `http/routes/auth.ts`, `http/routes/access.ts`, permission checks in `http/routes/admin.ts`.

## Model

```text
user ──< role_assignment >── role ── permissions[]
              │
              └─ tenant_id: "*" (every workspace) or one workspace id
```

- **Permission** — an atomic right. Each has a scope: `workspace` (can be granted for one workspace) or `global` (only meaningful in a `*` assignment).
- **Role** — a named set of permissions. Five **built-in** roles are progressive (each contains the previous) and cannot be edited or deleted; they are re-synced from code on every start. Owners can create **custom** roles from any subset of permissions.
- **Assignment** — gives a user a role either for every workspace (`*`) or for one workspace. A user can have several assignments; permissions add up.
- **Principal** — who is calling: a user (session cookie) or `system` (the `ADMIN_API_KEY`, for automation, tests and creating the first owner). `system` can do everything.

### Permissions

| Permission | Scope | Allows |
| --- | --- | --- |
| `workspaces.view` | workspace | See the workspace, its connections, sync status, mappings, activity log |
| `analytics.view` | workspace | See team metrics and manager comparison |
| `connections.manage` | workspace | Connect a CRM, re-authorize, resync, disconnect, resume |
| `mappings.manage` | workspace | Mark purchase pipelines, map activity types |
| `workspaces.manage` | workspace | Rename, set time zone and currency |
| `workspaces.create` | global | Create workspaces |
| `users.manage` | global | Create, edit, disable, delete users; assign roles; list roles |
| `roles.manage` | global | Create, edit, delete custom roles |
| `audit.view` | global | Read the audit log |

### Built-in roles

| Role | Adds to the previous role |
| --- | --- |
| Наблюдатель (`viewer`) | `workspaces.view` |
| Аналитик (`analyst`) | `analytics.view` |
| Интегратор (`integrator`) | `connections.manage`, `mappings.manage` |
| Администратор (`admin`) | `workspaces.manage`, `workspaces.create`, `users.manage`, `audit.view` |
| Владелец (`owner`) | `roles.manage` (all permissions) |

## Evaluation rules (`can(principal, permission, tenantId?)`)

1. `system` → allowed.
2. Permission present in the user's `*` grants → allowed (for workspace permissions this means every workspace).
3. Global permissions are never taken from a workspace assignment.
4. Otherwise the permission must be in the grants of that workspace.

Lists are filtered, not refused: `GET /v1/tenants` returns only workspaces the caller can view.

## Guards against mistakes and escalation

- **No escalation:** a caller can only grant (through user assignments or custom role permissions) permissions they hold somewhere. Changing or deleting a user also requires being able to grant the roles that user currently has. Consequence: only owners can create owners, and admins cannot touch owners.
- **Last owner:** the service always keeps at least one active user with the owner role for `*`.
- **Self-protection:** users cannot disable, delete or re-role themselves.
- **Custom roles in use** cannot be deleted (unassign first). Built-in roles cannot be changed.

## Authentication

| Route | Who | Notes |
| --- | --- | --- |
| `GET /v1/auth/status` | anyone | `{ hasUsers }` — the UI shows the first-owner form when false |
| `POST /v1/auth/bootstrap` | `x-admin-key`, only while there are no users | Creates the first owner and signs them in |
| `POST /v1/auth/login` | anyone | Email is case-insensitive. 8 failed attempts per email in 15 minutes → 429 (in-memory) |
| `POST /v1/auth/logout` | anyone | Deletes the session, clears the cookie |
| `GET /v1/me` | signed in | User, assignments, and permissions: `{ global: [...], workspaces: { id: [...] } }` |
| `PATCH /v1/me` | user | Own name and personal preferences only; no administrative permission needed ([personal settings](#personal-settings)) |
| `POST /v1/me/password` | user | Requires the current password; ends the user's other sessions |
| `POST /v1/me/onboarding` | user | Marks presentation/tour ids as offered to this user; a preference, not audited ([onboarding.md](onboarding.md)) |

Sessions: a random 256-bit token in the `crm_session` cookie (`HttpOnly; SameSite=Strict; Path=/`, plus `Secure` when `APP_ORIGIN` is HTTPS). Only its SHA-256 hash is stored in SQLite. `touchSession()` extends the **server record** by 12 hours from each use. The cookie's `Max-Age=43200` is set at login/bootstrap and is not renewed by protected responses, so a normal browser can require sign-in 12 hours after login even while active. Persisted sessions survive an API restart; the in-memory login throttle does not. Disabling/deleting a user or resetting their password ends their sessions; changing your own password retains the current session and ends the others.

CSRF: cookie-authenticated **protected** routes other than GET/HEAD must send `x-requested-with: crm-admin` (the admin UI client always does; cross-site forms cannot). The anonymous `/v1/auth/*` router runs before principal resolution and this header check; bootstrap separately verifies `x-admin-key`. `SameSite=Strict` is the first line of defense. When the service-key header is present it is checked first, even if a valid session cookie is also present.

Passwords: scrypt (N=2^15, r=8, p=1, 16-byte salt), stored as `scrypt$N$r$p$salt$hash`; new passwords are 10–200 characters. Authentication request bodies and response shapes are in [api.md](api.md#authentication-and-current-user).

## Personal settings

`/#/settings` («Мои настройки») is available to every signed-in operator, including users without workspace roles. `PATCH /v1/me` accepts a non-empty subset of `{ name, theme, defaultTenantId, landingPage }` and returns the same shape as `GET /v1/me`. Unknown fields are rejected, so email, ids, roles, status and password cannot be changed through this route. Cookie writes require the normal CSRF header. The principal determines which account is updated.

- `name`: trimmed, 1–120 characters; changes use the existing `user.update` audit action.
- `theme`: `light`, `dark`, `system`, or `null` (use the browser's existing choice until one is saved).
- `defaultTenantId`: a workspace the caller can view, or `null` («Все пространства»).
- `landingPage`: `overview` or `analytics`. Analytics requires a default workspace and `analytics.view` there.

Preferences live in `user_preferences` in `storage/access.ts`, keyed by user id, with cascading user deletion and a nullable workspace foreign key. Defaults are `{ theme: null, defaultTenantId: null, landingPage: "overview" }`. Preferences are not audited. `/v1/me` includes `preferences` and the names of the user's assigned roles (`roleName`). It filters a saved workspace if access is revoked, and falls back to overview if analytics permission is lost. Other preference/profile edits remain possible after a role change. Service-key callers receive `preferences: null` and cannot use the personal-settings write route (400).

The UI applies the account theme on sign-in/reload and keeps `crm-theme` as a first-paint/browser fallback. It applies the default start page on initial entry/sign-in only when the hash is empty or the home route, preserving explicit links. Navigating to «Все пространства» during a session still opens the list. Choosing analytics is hidden unless `useCan` grants it in that workspace. Email/roles are shown read-only; password changes retain the existing session-revocation behavior. The presentation and tour are replayed from the help block.

Integration coverage: `apps/api/test/settings.test.ts` (self-only writes, validation/atomicity, CSRF, account isolation, permission downgrade/revocation, sessions, restart persistence; mocked CRM transport).

Browser verification on 2026-10-02: Chromium with synthetic local accounts; light/dark at 1440, 1280, 820 and 360 px, reduced motion, profile/theme/start-page persistence after reload, home redirect and explicit-link preservation, mobile profile-menu navigation, password confirmation/change, theme-save failure with rollback, viewer-only workspace/overview choices and a no-workspace empty state. The built UI was also checked with viewer/no-role accounts. Not verified: Safari, Firefox, real screen readers or separate physical devices; cross-session/restart persistence is covered by API integration tests.

## Users, roles, audit API

| Route | Permission |
| --- | --- |
| `GET /v1/permissions` | signed in |
| `GET /v1/users`, `GET /v1/roles` | `users.manage` |
| `POST /v1/users` `{ email, name, password, assignments: [{ roleId, tenantId \| null }] }` | `users.manage` |
| `PATCH /v1/users/:id` `{ name?, email?, status?, password?, assignments? }` | `users.manage` |
| `DELETE /v1/users/:id` | `users.manage` |
| `POST /v1/roles`, `PATCH /v1/roles/:id`, `DELETE /v1/roles/:id` | `roles.manage` |
| `GET /v1/audit?before=<id>&type=<groups>` | `audit.view` |

Workspace and connection routes and their permissions are listed in [api.md](api.md).

## Audit log

Business mutations and login attempts write `{ at, actor_id, actor_label, action, target_type, target_id, tenant_id, details }`. Actions: `auth.login`, `auth.login_failed`, `user.bootstrap_owner`, `user.create|update|delete|password_changed`, `role.create|update|delete`, `workspace.create|update`, `connection.connected|reauthorized|resync|disconnect|resume`, `mapping.commercial_set|commercial_delete|action_set|action_delete`. Logout, onboarding preferences and worker record/token updates do not create those admin audit entries. The OAuth callback is public, so the actor who started the connection is stored with the single-use OAuth state and written when the callback completes. Details never contain passwords or tokens. `/v1/audit` returns at most 50 entries per page, newest ids first; use its `next` value as `before` for the next page.

## Known limits

- Single-process: login throttling is in memory; session records and access grants are in SQLite. There is no multi-instance session/throttle coordination.
- Server-side sliding expiry and browser cookie lifetime are not aligned yet; continuous browser-session renewal needs implementation and an integration test.
- No invitations or password-reset email: an administrator sets the initial password and the user changes it.
- Customer (end-client) login for the analytics UI is a separate decision (see delivery-plan.md).
