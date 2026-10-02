# Instructions for coding agents

This repository contains a runnable CRM analytics backend prototype (`apps/api`), an admin UI (`apps/web`), and product/connector design documents (`docs/`). Treat [README.md](README.md), the code in `apps/`, and `docs/` as the source of truth, in that order of precedence when they disagree about *current behavior*. Node.js 24.17+ runs the API's TypeScript directly; SQLite is used for this single-process prototype. Operator sign-in with roles (docs/access-control.md) and a first team-analytics screen (docs/metrics.md) exist; customer-facing authentication, CRM embedding and production hosting do not — do not assume them.

## Read before changing code

0. [docs/README.md](docs/README.md) — documentation map and glossary; [docs/development.md](docs/development.md) — setup and troubleshooting.
1. [docs/code-architecture.md](docs/code-architecture.md) — layers, dependency rules, request pipeline, connection lifecycle, the add-a-connector checklist, known debt.
2. [docs/architecture.md](docs/architecture.md) — product scope, tenancy, analytics semantics.
3. [docs/connectors.md](docs/connectors.md) and `docs/connectors/<provider>.md` — what each CRM actually supports, with sources.
4. [docs/delivery-plan.md](docs/delivery-plan.md) — milestones and open decisions.
5. [docs/access-control.md](docs/access-control.md) before adding a route or a permission; [docs/metrics.md](docs/metrics.md) before changing an analytics number.
6. [docs/ui-guidelines.md](docs/ui-guidelines.md) before touching `apps/web`; [docs/decisions.md](docs/decisions.md) before reversing an existing choice (add an entry when you make a new one).

## Objective

Build a multi-tenant, read-first CRM analytics service in TypeScript. It ingests CRM data through customer-approved APIs, keeps a coherent canonical model, and serves both a standalone UI and provider-specific embedded UI from one backend. The analytical goal (confirmed by the user) has two axes: commercial outcomes (sales, purchases) and non-commercial work (meetings, calls, visits, tasks), compared per manager to show what each person lacks for good sales.

The web app lives in `apps/web` and uses React, Vite, Tailwind CSS, and shadcn components built on Base UI. Do not add Radix UI packages or primitives.

## Engineering rules

- Separate provider adapters from the canonical model and analytics logic. Provider-specific field names, IDs and tokens stay inside `apps/api/src/connectors/<provider>/`.
- Scope every credential, event, job, record, query and cache key by tenant and connection. Derive tenant identity from a verified connection or OAuth state, never from an untrusted webhook body or URL alone.
- Use OAuth for distributable integrations where the provider supports it; store refresh tokens encrypted server-side. Never place CRM credentials in browser code, API responses, logs, or committed examples.
- Initial backfill, ongoing changes, and reconciliation are distinct jobs. Webhooks/CDC wake synchronization; they are not assumed to contain complete or perfectly delivered records.
- Persist a cursor only after a page and its resulting writes commit (same transaction). Make retries and duplicate events safe.
- Record metric definitions, timezone, currency handling, and data coverage. Do not infer historical stage transitions from a current CRM snapshot.
- Preserve the distinction between commercial outcomes and non-commercial work. Require explicit mapping for purchases and custom activity types; never guess from titles or names.
- Cite official provider documentation for API-specific claims and recheck volatile details before implementing a connector. Mark anything not observed in a sandbox as **unverified**.
- Keep the first release read-only toward CRMs. Any writeback requires a separate design and permission review.

## Quality bar (no slop)

These are hard rules. A change that breaks one is not done.

- **No invented facts.** Do not write endpoints, limits, scopes or token lifetimes from memory. Find the official page, link it, and date the research. If you cannot verify, say so in the doc and in your summary.
- **No fake completeness.** Do not add stubs, placeholder branches or "TODO: implement" code that makes a feature look finished. Planned providers live in `connectors/catalog.ts` as data, not as empty adapters.
- **Respect the layers.** No SQL outside `storage/`, no `fetch` to a CRM outside `connectors/<provider>/`, no provider IDs in `sync/`, `http/`, `storage/` or `web/` (see Known debt for the one sanctioned exception). No `if (provider === "...")` outside the registry.
- **No silent failure.** Do not swallow errors with empty `catch` blocks unless the comment explains why it is safe. Map provider failures to `ConnectorAuthError` / `ConnectorInputError` / `ConnectorUpstreamError`.
- **Tests prove behavior, not lines.** Every new route, connector method or state transition gets an integration test in `apps/api/test` with a mocked `fetch`. Never weaken or delete an assertion to make a test pass; fix the code or explain the behavior change.
- **Small, coherent diffs.** Match the surrounding style (2-space indent; API uses semicolons and double quotes, web uses no semicolons and single quotes). Do not reformat untouched code. Do not add dependencies without a stated reason; the API currently has zero runtime dependencies.
- **Docs move with code.** If you change a boundary, route, status, env var or operator step, update `docs/code-architecture.md`, README and the relevant connector playbook in the same change.
- **UI is strict and consistent.** Follow [docs/ui-guidelines.md](docs/ui-guidelines.md). Build screens from the shadcn primitives in `apps/web/src/components/ui` (Base UI underneath) and Tailwind classes bound to the tokens in `src/index.css`; no ad-hoc colors or one-off CSS files; Russian copy; every async action shows progress, success and error; empty states explain the next step; works at 360 px width (no horizontal page scroll), on the tablet rail and in dark mode; animation only through Motion, using the presets in `lib/motion.ts` (the onboarding stage has its own documented choreography), and honoring reduced motion; controls the user lacks permission for are hidden with `useCan` (the server still enforces every permission); a new section ships with a `data-tour` anchor and a tour step ([docs/onboarding.md](docs/onboarding.md)).

## Definition of done

1. `npm run check` (API typecheck, web typecheck + lint) passes at the repository root.
2. `npm test` passes; new behavior has tests.
3. No secrets, tokens or real customer data in code, fixtures, logs or docs; `.env` stays untracked.
4. Docs updated as above; the summary to the user states what was verified and what was not.

## Environment notes

- Node 24.17+ is the target. Node 22.18+ also runs the type-stripped API and tests.
- `typescript@7` (API) is a native binary. If `tsc` fails with "Unable to resolve @typescript/typescript-linux-x64", install the platform package without saving: `npm install --no-save @typescript/typescript-linux-x64@<version>`. Do not commit lockfile churn produced by a different npm version.

## Before production work

Resolve the remaining product decisions in [delivery-plan.md](docs/delivery-plan.md#decisions-to-confirm) before selecting production hosting and customer authentication. The current prototype implements Bitrix24 as the first adapter. Update the connector playbook and contract when API behavior observed in a sandbox differs from the documentation.
