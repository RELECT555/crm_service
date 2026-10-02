# Onboarding: welcome presentation and guided tour

Status: implemented in `apps/web/src/components/onboarding/` and `apps/web/src/lib/onboarding.ts`, with per-user state on the server (`POST /v1/me/onboarding`). Update this file in the same change that adds a section, a tour step or a slide.

Two pieces, one lifecycle:

- **Presentation** («Знакомство») — a large dialog in the product's own theme, shown once after the first sign-in: five slides, each a short story on the left and a live preview of the real interface on the right; the last slide offers «Пройти тур» / «Позже».
- **Tour** («Тур по разделам») — a spotlight that opens each section and highlights its key blocks in place (summary, connections, analytics, catalog, users, roles, audit). It only shows sections the user's roles allow.

## Lifecycle

```text
sign-in ─► /v1/me returns onboarding.seen (ids already offered to this user)
  │
  ├─ 'welcome:1' not in seen ─► presentation
  │     ├─ «Пройти тур»      ─► mark welcome:1 ─► tour (all eligible steps) ─► mark those steps on finish or exit
  │     └─ «Позже» / «Пропустить» / × / Esc ─► mark welcome:1 + every eligible step («offered, declined»)
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

Files: `components/onboarding/Welcome.tsx` (dialog, navigation, slides list), `components/onboarding/previews.tsx` (live previews).

- Base UI `Dialog` (modal) owns focus trap, scroll lock and Escape; Motion owns visuals. It uses the normal theme tokens — light or dark like the rest of the app — on `bg-card`, with the preview area on `bg-canvas`. No gradients, glows or special surfaces: the presentation is part of the product, not a poster.
- Layout: story on the left (step number and eyebrow in `text-primary`, title, one paragraph, three check points, progress segments, buttons); preview on the right as an app window that bleeds off the edge like a product shot. Below `lg` the preview sits on top at 60–75 % scale and the check points are hidden.
- Previews are built from the real components — `Metric`-like tiles, `BarList`, `MeterBar`, `MixBar`, `ProviderMark`, `StatusBadge`, the role matrix — so they always match the interface. Their numbers are illustrative (`previews.tsx` says so) and never come from customer data. They must not show features that do not exist.
- Navigation: «Далее» / back arrow buttons, ← → keys, progress segments (each is a button), swipe on the preview, «Пропустить» on the first slide, × and Escape at any time.
- Motion: the dialog opens with `dialogSpring`; the story cross-fades with a small rise and blur; the preview slides in the direction of travel; check points and preview rows stagger in. Under reduced motion all of it becomes plain fades.

**Add or change a slide:** edit `slides()` in `Welcome.tsx` (`eyebrow`, `title` — a few words, `text` — one or two sentences, three `points`, `preview`). Build a new preview in `previews.tsx` inside `<Window title icon>` from existing components. Check it at 1440 px, 768 px and 390 px, in both themes and with reduced motion. Bump `WELCOME_ID` only if existing users should see the presentation again.

## Tour

Files: `lib/onboarding.ts` (`TOUR_STEPS`, `eligibleSteps`, context and hook), `components/onboarding/Tour.tsx` (spotlight and card), `components/onboarding/OnboardingProvider.tsx` (lifecycle, «Новое» card), anchors as `data-tour="<target>"` in the UI.

A step:

```ts
{
  id: 'tour:audit',              // stable contract (see above)
  target: ['audit-list', 'audit-empty'], // data-tour value(s); the first visible wins — list a fallback (empty state) last
  title: 'Журнал действий',      // 1–3 words
  body: 'Кто, когда и что изменил…', // one or two sentences: what it is and why you would open it
  fallbackBody: '…',             // optional: text for when a fallback target (not the first) was highlighted
  permission: 'audit.view',      // optional: offered only with this permission
  needsWorkspace: true,          // optional: skip when the user has no workspace
  route: () => '/audit',         // optional: open this page first; return null to skip
  nav: true,                     // target is in the sidebar: on phones highlight the menu button instead
}
```

Runtime behavior:

- The tour workspace is the last opened one if it has connections, else the one with the most connections, else the last opened or first one — then the tour points at empty states (`tourContext()` in the provider).
- For each step the tour opens `route` if needed, waits until a target exists and stops moving (page transitions), scrolls it into view, then moves the spotlight and the card to it **together**: the card keeps the previous step's text until the new target is found, so text and highlight never disagree. «Далее» is disabled during that short search.
- Targets are tried in order; when a fallback (not the first) matches, `fallbackBody` replaces `body` (analytics without data highlights the empty state and says what will appear there).
- A page step with no target is skipped in the direction the user is moving: after 2.5 s on a page that was just opened, after 0.6 s on the page that is already open (e.g. «Слабые места» on empty analytics). A sidebar step without a visible target shows the card centered.
- Placement: beside the target if it fits (right, below, above, left), else docked at the bottom; on phones the card spans the width on the half of the screen the target does not use.
- The page is blocked while the tour runs (it shows, it does not click). Keys: ← →, Enter on the focused button, Escape ends the tour. Focus is trapped in the card (Base UI `Dialog`, `modal="trap-focus"`).

**When a new section ships:**

1. Put `data-tour="<name>"` on the page's key block (a card, a list) and on its empty state; use `NavItem tour="…"` in `Sidebar.tsx` only for things that live in the sidebar.
2. Add a step to `TOUR_STEPS` in display order with a new `tour:<name>` id, the permission that gates the section, `route` to the page, the targets (main first, empty state last) and `fallbackBody` if the empty state needs different words.
3. Existing users get it automatically as «Новое в админке»; new users get it in the full tour.
4. Run the tour at 1440 px, 820 px (rail) and 390 px; check the card does not cover the target and the text fits.
5. Update the table below.

## Current steps

| Id | Target(s) | Shown to | Page |
| --- | --- | --- | --- |
| `tour:workspace-switcher` | workspace switcher (sidebar) | everyone | — |
| `tour:workspace-overview` | `workspace-overview` metric tiles | `workspaces.view` in the tour workspace | workspace |
| `tour:workspace-connections` | `workspace-connections` section | `workspaces.view` | workspace |
| `tour:analytics-kpis` | `analytics-kpis`, fallback `analytics-empty` | `analytics.view` | analytics |
| `tour:analytics-signals` | `analytics-signals` (skipped without data) | `analytics.view` | analytics |
| `tour:analytics-managers` | `analytics-managers` (skipped without data) | `analytics.view` | analytics |
| `tour:catalog` | `catalog-ready` | everyone | integrations |
| `tour:users` | `users-list` | `users.manage` | users |
| `tour:roles` | `roles-matrix`, fallback `roles-list` | `users.manage` | roles |
| `tour:audit` | `audit-list`, fallback `audit-empty` | `audit.view` | audit |
| `tour:user-menu` | user menu (sidebar) | everyone | — |

The step ids changed on 2026-10-02 when the tour moved from sidebar items to in-page blocks; users who had seen the old tour are offered the new steps once as «Новое в админке».

## Verified

Checked in Chromium (Playwright) on 2026-10-02: owner tour (11 steps) on the demo data at 1440 px; the same on a fresh database with one empty workspace (analytics highlights the empty state, its two data-only steps are skipped); presentation and tour at 390 px in the dark theme; earlier: analyst tour with reduced motion, the «Новое» flow, Escape and replay from the user menu. Not checked: real screen readers (VoiceOver, NVDA), Safari and Firefox.
