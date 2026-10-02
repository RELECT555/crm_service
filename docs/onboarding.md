# Onboarding: welcome presentation and guided tour

Status: implemented in `apps/web/src/components/onboarding/` and `apps/web/src/lib/onboarding.ts`, with per-user state on the server (`POST /v1/me/onboarding`). Update this file in the same change that adds a section, a tour step or a slide.

Two pieces, one lifecycle:

- **Presentation** («Знакомство») — a full-screen, keynote-style sequence shown once after the first sign-in: what the product does, in five slides plus a closing slide with «Пройти тур» / «Сразу к работе».
- **Tour** («Тур по разделам») — a spotlight that walks through the real interface, step by step, opening pages when needed. It only shows sections the user's roles allow.

## Lifecycle

```text
sign-in ─► /v1/me returns onboarding.seen (ids already offered to this user)
  │
  ├─ 'welcome:1' not in seen ─► presentation
  │     ├─ «Пройти тур»      ─► mark welcome:1 ─► tour (all eligible steps) ─► mark those steps on finish or exit
  │     └─ «Сразу к работе» / «Пропустить» / Esc ─► mark welcome:1 + every eligible step («offered, declined»)
  │
  ├─ welcome seen, some eligible step not seen ─► «Новое в админке» card (bottom right)
  │     ├─ «Показать» ─► tour with only those steps ─► mark them
  │     └─ «Скрыть»   ─► mark them
  │
  └─ any time: user menu ─► «Тур по разделам» (all eligible steps) or «Презентация» (replay)
```

- **«Seen» means «offered», not «completed».** A user who declined is not asked again about the same steps; a user who closed the tab mid-tour gets the remaining steps as «Новое» next time.
- **Eligibility is computed at runtime** from permissions and the tour workspace (`eligibleSteps` in `lib/onboarding.ts`). Steps a user cannot see are never marked, so when a role is granted later, the newly visible sections arrive as «Новое».
- **The service key** (`x-admin-key`, `system` principal) has no stored state: `onboarding` is `null` in `/v1/me`, nothing is shown automatically, replays from the menu still work.
- The tour **returns to the page it started on** and shows a toast that it can be replayed from the user menu.

## Server state

| | |
| --- | --- |
| Storage | `user_onboarding (user_id PK → users ON DELETE CASCADE, seen TEXT JSON array, updated_at)` in `storage/access.ts` |
| Read | `GET /v1/me` → `onboarding: { seen: string[] }` (`null` for the service key) |
| Write | `POST /v1/me/onboarding` `{ "seen": ["welcome:1", "tour:nav-users"] }` → `{ seen }` — adds ids (set union, first-seen order kept), idempotent |
| Validation | 1–50 ids per call, each `^[a-z0-9][a-z0-9:._-]{0,63}$`; at most 500 ids per user; 400 otherwise; the service key gets 400 |
| Access | any signed-in user, for themselves only; CSRF header required like every cookie write |
| Audit | none — this is a personal UI preference, not an admin action |

Tests: `apps/api/test/access.test.ts` («Onboarding» block).

## Ids are contracts

| Id | Meaning | Change it when |
| --- | --- | --- |
| `welcome:<n>` (`WELCOME_ID`) | the presentation | it changes enough that existing users should see it again — bump `n` |
| `tour:<name>` | one tour step | never rename casually: a new id is shown to everyone as «Новое» |

## Presentation

Files: `components/onboarding/Welcome.tsx` (stage, navigation, slides list), `components/onboarding/visuals.tsx` (illustrations).

- Base UI `Dialog` (modal) owns focus trap, scroll lock and Escape; Motion owns visuals. The stage is rendered with the `.dark` class so every token resolves to its dark value, on the `bg-stage` surface.
- Navigation: «Далее» / «Назад» buttons, ← → and PageUp/PageDown keys, dots (each is a button), swipe (pan) on touch screens, «Пропустить» in the header, Escape.
- Motion: headlines reveal word by word (rise + blur), the accent phrase reveals as one unit so its gradient stays continuous; slides move with direction-aware variants; one soft light per slide cross-fades behind the content. Under reduced motion all of it becomes plain fades and illustrations show their end state.
- Illustrations reuse the product's own marks (meters with a median tick, composition bars in `--series-*`, provider marks). They must not promise features that do not exist. Copy in `visuals.tsx` is illustrative example data, not customer data.
- Besides the sign-in background (decision 25), the stage is the only place where a gradient text phrase and a soft radial light are allowed (decision 26). Working screens keep the no-gradient rule.

**Add or change a slide:** edit `slides()` in `Welcome.tsx` (`eyebrow`, `title` as words plus at most one `{ accent }` phrase, `text`, optional `visual`, `light` = a token for the background light). Keep it to one idea, a title under ~6 words, one sentence of text. Put a new illustration in `visuals.tsx`, check it at 360 px and with reduced motion. Bump `WELCOME_ID` only if existing users should see the presentation again.

## Tour

Files: `lib/onboarding.ts` (`TOUR_STEPS`, `eligibleSteps`, context and hook), `components/onboarding/Tour.tsx` (spotlight and card), `components/onboarding/OnboardingProvider.tsx` (lifecycle, «Новое» card), anchors as `data-tour="<target>"` in the UI.

A step:

```ts
{
  id: 'tour:nav-audit',          // stable contract (see above)
  target: 'nav-audit',           // data-tour value of the element to highlight
  title: 'Журнал действий',      // 1–3 words
  body: 'Кто, когда и что изменил…', // one or two sentences: what it is and why you would open it
  permission: 'audit.view',      // optional: offered only with this permission
  needsWorkspace: true,          // optional: skip when the user has no workspace
  route: ctx => `/tenants/${ctx.tenantId}/analytics`, // optional: open this page first; return null to skip
  nav: true,                     // target is in the sidebar: on phones highlight the menu button instead
}
```

Runtime behavior:

- The tour workspace is the last opened one, else the one with the most connections (`tourContext()` in the provider).
- For each step the tour opens `route` if needed, waits until the target exists and stops moving (page transitions), scrolls it into view, then glides the spotlight and the card to it. The card shows the new text at once.
- A page step whose target does not appear within 2.5 s (e.g. analytics with no data) is skipped in the direction the user is moving. A sidebar step without a visible target shows the card centered.
- Placement: beside the target if it fits (right, below, above, left), else docked at the bottom; on phones the card spans the width on the half of the screen the target does not use.
- The page is blocked while the tour runs (it shows, it does not click). Keys: ← →, Enter on the focused button, Escape ends the tour. Focus is trapped in the card (Base UI `Dialog`, `modal="trap-focus"`).

**When a new section ships:**

1. Put `data-tour="<name>"` on its navigation item (`NavItem tour="…"` in `Sidebar.tsx`) or on the page element to highlight.
2. Add a step to `TOUR_STEPS` in display order with a new `tour:<name>` id, the permission that gates the section, and `route` if the target is on a page.
3. Existing users get it automatically as «Новое в админке»; new users get it in the full tour.
4. Run the tour at 1440 px, 820 px (rail) and 390 px; check the card does not cover the target and the text fits.
5. Update the table below.

## Current steps

| Id | Target | Shown to | Page |
| --- | --- | --- | --- |
| `tour:workspace-switcher` | workspace switcher | everyone | — |
| `tour:nav-overview` | «Обзор» | `workspaces.view` in the tour workspace | — |
| `tour:analytics-kpis` | KPI tiles | `analytics.view` | analytics |
| `tour:analytics-signals` | «Слабые места» | `analytics.view` | analytics |
| `tour:analytics-managers` | «Менеджеры» | `analytics.view` | analytics |
| `tour:nav-integrations` | «Интеграции» | everyone | — |
| `tour:nav-users` | «Пользователи» | `users.manage` | — |
| `tour:nav-roles` | «Роли и права» | `users.manage` | — |
| `tour:nav-audit` | «Журнал действий» | `audit.view` | — |
| `tour:user-menu` | user menu | everyone | — |

## Verified

Checked in Chromium (Playwright) against the demo data on 2026-10-02: owner tour (10 steps) at 1440 px, phone tour at 390 px in dark theme, analyst tour (7 steps, no admin sections) at 1024 px with reduced motion, the «Новое» flow for one added step, Escape, replay from the user menu, and no horizontal scroll at 360 px. Not checked: real screen readers (VoiceOver, NVDA), Safari and Firefox.
