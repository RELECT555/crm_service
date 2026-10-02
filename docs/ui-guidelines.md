# Admin UI guidelines

The admin UI is a work tool for operators: calm, dense enough to scan, explicit about consequences. These rules keep new screens consistent; follow them unless a decision in [decisions.md](decisions.md) says otherwise.

## Stack

React 19, Vite, Tailwind CSS v4, shadcn components on Base UI (`@base-ui/react`), `lucide-react` icons. No Radix, no CSS files other than `src/index.css`, no inline colors except provider marks.

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

Themes: light, dark and "as system" («Авто»). `lib/theme.ts` is a single shared store (all switches stay in sync, also across tabs and with OS changes); it stores the choice in `localStorage` (`crm-theme`), sets the `.dark` class on `<html>`, and cross-fades colors for 300 ms. `public/theme-init.js` applies the same rule before first paint. The compact switch (collapsed sidebar, login) always flips the visible theme light ↔ dark. Every screen must be checked in both themes. Dark theme uses neutral graphite surfaces with low-contrast borders; do not tint large surfaces with the primary color.

## Components

- Primitives live in `components/ui` (shadcn style). Add a new primitive there rather than styling a raw element in a page.
- App building blocks live in `components/common.tsx`: `PageHeader`, `Field`, `EmptyState`, `Notice`, `ErrorNotice`, `CopyField`, `ProviderMark`, `Stat`, `StatusBadge`, `ToneBadge`, `SyncBar`, `LoadingRows`.
- Overlays: `Dialog` for confirmations and short forms, `Sheet` (right) for multi-step flows and reference panels, `Sheet side="left"` for the mobile menu.

## Badges and status (low visual noise)

- `StatusBadge` is only for connection states: a dot plus text on a soft tint, no border. In-progress states get a soft halo, not blinking.
- `ToneBadge` is for categories (Закупка/Продажа, Доступно/Скоро): soft tint, no dot, no border.
- Counts and totals are plain text (number + muted label), not badges.
- In tables, prefer a colored dot + neutral text (see `StateSummary` on the workspaces page) over several pills in one cell.
- Never show more than two badges side by side.

## Motion

Short, ease-out, and never blocking input. Utilities are defined in `src/index.css`:

| Utility | Where |
| --- | --- |
| `animate-enter` | page content on route change (keyed by route), notices, toasts |
| `stagger` | lists of cards that appear together (first five children are delayed by 40 ms steps) |
| `animate-fade` | elements that appear inside an existing surface (sidebar labels when expanding) |
| `animate-indeterminate` | running progress bars |
| `shimmer` | skeleton placeholders |

Durations: 150–300 ms for UI feedback, up to 700 ms for progress bar fills. Hover lifts are at most 2px. All animation is disabled under `prefers-reduced-motion`.

## Layout

- Sidebar: 264px, collapsible to 72px (stored in `localStorage`), a top bar with a left sheet below the `lg` breakpoint.
- Content: max width 1160px, 32px side padding on desktop, 16px on phones. Must work at 360px with no horizontal page scroll; wide tables scroll inside their card.
- Page structure: breadcrumbs → `PageHeader` (eyebrow, title, one-sentence subtitle, actions on the right) → cards.

## Copy

Russian, short, operator-oriented. Buttons are verbs («Подключить CRM», «Сохранить»). Destructive or expensive actions say what will happen («Все объекты будут перечитаны… расходует лимит запросов»). Errors come from `errorText` in `lib/toast.ts` — add a translation there when the API gains a new error message. Never show tokens or secrets.

## New screen checklist

1. Data loading through `useResource`; loading (`LoadingRows`), empty (`EmptyState` with the next step) and error (`ErrorNotice` with retry) states.
2. Every mutation shows progress (disabled button), success (toast) and error (toast or inline field error).
3. Keyboard: all actions reachable with Tab; table rows that navigate respond to Enter; dialogs close on Escape.
4. Checked in light and dark themes, at 1360px and 375px widths.
5. `npm run check` passes with no lint warnings.
