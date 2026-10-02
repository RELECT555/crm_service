# Admin UI guidelines

The admin UI is a work tool for operators: calm, dense enough to scan, explicit about consequences. These rules keep new screens consistent; follow them unless a decision in [decisions.md](decisions.md) says otherwise.

## Stack

React 19, Vite, Tailwind CSS v4, shadcn components on Base UI (`@base-ui/react`), `lucide-react` icons, Motion (`motion/react`) for enter/exit and layout animation. Charts are small hand-written SVG/HTML components in `components/charts.tsx`, not a chart library (decision 23). No Radix, no CSS files other than `src/index.css`, no inline colors except provider marks and chart series tokens.

## Tokens and themes

All colors are CSS variables in `src/index.css`, exposed to Tailwind through `@theme inline`. Use the Tailwind names, never hex values.

| Token (Tailwind) | Use |
| --- | --- |
| `bg-canvas` | page background behind cards |
| `bg-card`, `ring-border`, `shadow-card` | surfaces; cards use a 1px ring and a soft shadow, never both a border and a ring |
| `text-foreground`, `text-muted-foreground` | primary and secondary text; secondary text is for hints, metadata and table headers |
| `bg-primary`, `text-primary` | one primary action per area, active navigation, links |
| `bg-accent`, `text-accent-foreground` | subtle highlight (step numbers, avatars) |
| `success`, `info`, `warning`, `destructive` | state colors only: done / in progress / needs attention / failed |
| `bg-sidebar`, `sidebar-*` | sidebar surface and text |
| `--series-1…5`, `--series-other` | chart series only (see [Charts](#charts)); never for UI states or text |

Themes: light, dark and "as system" («Авто»). `lib/theme.ts` is a single shared store (all switches stay in sync, also across tabs and with OS changes); it stores the choice in `localStorage` (`crm-theme`), sets the `.dark` class on `<html>`, and cross-fades colors for 300 ms. `public/theme-init.js` applies the same rule before first paint. The theme is chosen in the user menu (radio items); the compact switch on the login screen always flips the visible theme light ↔ dark. Every screen must be checked in both themes. Dark theme uses neutral graphite surfaces with low-contrast borders; do not tint large surfaces with the primary color.

## Components

- Primitives live in `components/ui` (shadcn style). Add a new primitive there rather than styling a raw element in a page.
- App building blocks live in `components/common.tsx`: `PageHeader`, `Field`, `EmptyState`, `Notice`, `ErrorNotice`, `CopyField`, `ProviderMark`, `Stat`, `StatusBadge`, `ToneBadge`, `SyncBar`, `LoadingRows`.
- Overlays: `Dialog` for confirmations and short forms, `Sheet` (right) for multi-step flows and reference panels, `Sheet side="left"` for the mobile menu.
- Menus: `DropdownMenu` (Base UI Menu) for secondary actions behind a `…` button, the workspace switcher and the user menu (theme, password change, sign out). Destructive items use `variant="destructive"`, sit after a separator and open a confirmation `Dialog` when they stop work.
- Brand: `BrandMark` (two bars = two analytical axes) on a graphite tile. Do not reintroduce colored gradient squares or generic chart icons.
- Workspaces are shown with `Avatar` initials in neutral color; provider marks are the only colored tiles.

## Badges and status (low visual noise)

- `StatusBadge` is only for connection states: a dot plus text on a soft tint, no border. In-progress states get a soft halo, not blinking.
- `ToneBadge` is for categories (Закупка/Продажа, Доступно/Скоро): soft tint, no dot, no border.
- Counts and totals are plain text (number + muted label), not badges.
- In tables, prefer a colored dot + neutral text (see `StateSummary` on the workspaces page) over several pills in one cell.
- Never show more than two badges side by side.

## Cards and sheets (keep them quiet)

- One job per card. Connection cards: provider mark, account, status, then two numbers or a progress line, and a footer with freshness. Actions live in the `…` menu, not as buttons on the card.
- Provider sheet: setup steps (≤ 3 short lines), the redirect URI, and the rest folded under «Подробнее». No chips, no repeated badges, no paragraphs that restate the title.
- Numbers use `tabular-nums`; labels above values in `text-xs text-muted-foreground`.
- No gradients, glows, emojis or decorative illustrations.

The sign-in screen is the explicit exception (decision 25): one centered form, no right-hand product panel, with a decorative WebGL silk background in `--background`, `--primary` and `--accent`. Its slow loop uses `loginShaderDrift` from `lib/motion.ts`, pauses in hidden tabs and renders a still frame with reduced motion. A static token-based CSS background covers unavailable or lost WebGL contexts. Keep this treatment on sign-in; working screens retain the quiet surface rules above.

## Motion

Two layers, each with one job:

1. **Motion (`motion/react`)** — everything that enters, leaves or changes size: menus, dialogs, sheets, page transitions, staggered lists, the sidebar width, the KPI count-up. Presets live in `lib/motion.ts`; use them instead of inline numbers. The one exception is the onboarding presentation, whose slower keynote choreography lives in `components/onboarding/` and is described in [onboarding.md](onboarding.md#presentation).
2. **CSS utilities in `src/index.css`** — ambient, looping or purely decorative effects: `animate-indeterminate` (running progress), `shimmer` (skeletons), `animate-enter` / `stagger` / `animate-fade` in older screens and toasts.

| Preset (`lib/motion.ts`) | Where |
| --- | --- |
| `menuSpring` + `menuItem` | dropdown popups scale in from the trigger (`transform-origin` = Base UI's `--transform-origin`), items settle with a 25 ms stagger |
| `dialogSpring` | dialog popup and the login card; backdrop fades |
| `sheetSpring` | side sheets slide from their edge |
| `exitFast` | every exit — closing must never feel slower than opening |
| `pageTransition` | route change (`App.tsx`, keyed by route, `AnimatePresence mode="wait"`) |
| `staggerList` / `staggerItem` | cards and rows that appear together (parent gets `initial="hidden" animate="show"`) |

**Base UI + Motion pattern** (the one used in `components/ui/dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx`, after [motion.dev's Base UI menu example](https://motion.dev/examples/react-base-context-menu)):

```tsx
const [open, setOpen] = useState(false)            // hoist open state out of Base UI
<Menu.Root open={open} onOpenChange={setOpen}>
  <AnimatePresence>
    {open && (
      <Menu.Portal keepMounted>                      // keep the DOM so the exit can play
        <Menu.Positioner>
          <Menu.Popup render={<motion.div initial={…} animate={…} exit={…} />} />
```

Base UI owns focus, keyboard, dismissal and ARIA; Motion only owns the visuals. Never re-implement focus traps or outside-click handling for an animation.

Rules: springs without bounce for anything work-related (menus may have a tiny overshoot); durations 120–360 ms; hover lifts ≤ 2px; never animate layout-affecting properties of large lists (animate `opacity`/`transform`). **Reduced motion:** `<MotionConfig reducedMotion="user">` in `main.tsx` turns transforms off globally; components that animate values by hand (`AnimatedNumber`) also read `useReducedMotion()` and show the final value immediately; CSS utilities are disabled under `prefers-reduced-motion`.

## Responsive layout

Three layouts, switched by Tailwind breakpoints (`md` = 768px, `lg` = 1024px, `xl` = 1280px):

| Width | Navigation | Content |
| --- | --- | --- |
| phone, < `md` | sticky top bar (brand + menu button) and a left `Sheet` with the full sidebar | single column, 16px gutter; tables become stacked cards |
| tablet, `md`–`lg` | 68px icon rail (labels as native `title` hints), not collapsible | two-column KPI grids, single-column charts |
| desktop, ≥ `lg` | 256px sidebar, user-collapsible to the rail (stored in `localStorage`) | multi-column grids; wide data tables from `xl` |

- Sidebar, top to bottom: brand, workspace switcher (remembers the last workspace; a user with exactly one workspace gets it preselected), navigation grouped by permission («Пространство», «Администрирование», «Сервис»), collapse button, user menu (theme, password, sign out). Sections the user has no permission for are not rendered.
- Content: max width 1200px; 16 / 24 / 40px side padding on phone / tablet / desktop.
- **No horizontal page scroll at 360px.** Grid items have `min-width: auto` by default, so long text inside them widens the page: give grids explicit tracks (`grid-cols-1`, `grid-cols-2` — Tailwind emits `minmax(0, 1fr)`) and children `min-w-0`; use `truncate` with a `title` for one-line labels. A `grid` without `grid-cols-*` creates an `auto` track that grows to its content — the most common cause of overflow here.
- Tables wider than their card either scroll inside `data-slot=table-container` (admin lists) or switch to a card list below the breakpoint where they fit (the analytics manager table: cards below `xl`, `table-fixed` above).
- Use `useMediaQuery` (`lib/use-media.ts`) only when behavior changes (the sidebar mode); prefer CSS breakpoints for appearance.

## Charts

Built by hand in `components/charts.tsx` from the dataviz rules: thin marks, 4px rounded data ends, 2px gaps between stacked segments, recessive grid, numbers in text tokens (never the series color), hover/focus tooltip on every mark (`Tip`).

| Component | Shows |
| --- | --- |
| `AnimatedNumber` | KPI value counting up once on first view |
| `BarList` | ranked magnitudes with labels inside the bar (work by type) |
| `MeterBar` | one value against the team leader, with a tick at the team median |
| `MixBar` | composition of one manager's work by type (shares) |
| `Legend` | series identity; always shown for ≥ 2 series |

- Categorical colors come from `SERIES` / `SERIES_OTHER` in `lib/chart-colors.ts` (tokens `--series-*`, separate light and dark steps validated for color-vision deficiency against the card surface). Slots are assigned to entities in a **fixed order** (`TYPE_SLOTS` in `pages/Analytics.tsx`: call, meeting, task, email, visit); anything else folds into «Другое». Never cycle colors, never pick by rank.
- Status colors (`warning`, `destructive`…) mark signals, always with an icon and text; they are never a chart series.
- Every chart has a text equivalent: the manager table carries the exact numbers, tooltips repeat the value in words.
- One measure per axis; two measures of different scale get two charts.

## Permission-aware UI

`useCan()` (`lib/session.ts`) mirrors the server rule from [access-control.md](access-control.md): global grants apply everywhere, workspace grants only to that workspace. Use it to hide navigation, buttons and forms the user cannot use, and render forms read-only with a sentence naming the missing permission. It is a convenience only — the API checks every request. A route the user cannot open shows «Нет доступа» with a way back, never a blank page. A `401` from any request fires the session-expired event and returns to the login screen.

## Onboarding (presentation and tour)

The welcome presentation and the guided tour are specified in [onboarding.md](onboarding.md). UI rules that apply only there:

- The presentation stage is always dark: render it with the `.dark` class on `bg-stage`, and use tokens (`text-foreground/60`, `bg-foreground/5`), not raw white.
- Exception to «no gradients, no glows», for the stage only: one accent phrase per slide may use the `from-series-1 via-primary to-series-5` text gradient, and one soft radial light per slide may sit behind the content (decision 26).
- The tour dims the page with `--scrim` and outlines the target with `ring-primary`; its card is a normal `bg-card` surface in the current theme.
- A new section is not done until it has a `data-tour` anchor and a tour step (checklist in onboarding.md).

## Copy

Russian, short, operator-oriented. Buttons are verbs («Подключить CRM», «Сохранить»). Destructive or expensive actions say what will happen («Все объекты будут перечитаны… расходует лимит запросов»). Errors come from `errorText` in `lib/toast.ts` — add a translation there when the API gains a new error message. Never show tokens or secrets.

## New screen checklist

1. Data loading through `useResource`; loading (`LoadingRows`), empty (`EmptyState` with the next step) and error (`ErrorNotice` with retry) states.
2. Every mutation shows progress (disabled button), success (toast) and error (toast or inline field error).
3. Keyboard: all actions reachable with Tab; table rows that navigate respond to Enter; dialogs close on Escape.
4. Checked in light and dark themes at 1440, 1280, 820 (tablet rail) and 360px widths with no horizontal page scroll; checked with reduced motion.
5. Controls gated by the right permission (`useCan`), and the page added to `resolve()` in `App.tsx` with its permission.
6. A new section has a `data-tour` anchor and a step in `TOUR_STEPS` ([onboarding.md](onboarding.md#tour)).
7. `npm run check` passes with no lint warnings.
