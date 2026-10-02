# Instructions for coding agents

This repository contains a TypeScript monorepo with a Bitrix24 backend prototype, a React admin interface for CRM connections, and product design documents. Treat [README.md](README.md), `apps/`, and `docs/` as the current source of truth. Node.js 24.17+ runs the API TypeScript directly; SQLite is used for this single-process prototype. The connection screen is UI-only; customer authentication and production deployment are not implemented.

## Objective

Build a multi-tenant, read-first CRM analytics service in TypeScript. It must ingest CRM data through customer-approved APIs, retain a coherent internal model, and support both a standalone UI and provider-specific embedded UI. One backend and analytics model must serve both surfaces. The web app lives in `apps/web` and uses React, Vite, Tailwind CSS, and shadcn components built on Base UI. Do not add Radix UI packages or primitives.

## Engineering rules

- Separate provider adapters from the canonical model and analytics logic. Provider-specific field names and tokens must not leak into analytics code.
- Scope every credential, event, job, record, query, and cache key by tenant and connection. Derive tenant identity from a verified connection, never from an untrusted webhook body or URL alone.
- Use OAuth for distributable integrations where the provider supports it; store refresh tokens encrypted server-side. Never place CRM credentials in browser code, logs, or examples committed to the repo.
- Initial backfill, ongoing changes, and reconciliation are distinct jobs. Webhooks/CDC wake synchronization; they are not assumed to contain complete or perfectly delivered records.
- Persist a cursor only after a page and its resulting writes commit. Make retries and duplicate events safe.
- Record metric definitions, timezone, currency handling, and data coverage. Do not infer historical stage transitions from a current CRM snapshot.
- Preserve the distinction between commercial outcomes (sales, purchases) and non-commercial work (meetings, calls, visits, tasks). Require explicit mapping for purchases and custom activity types; do not guess from titles.
- Cite official provider documentation for API-specific claims and recheck volatile details before implementing a connector.
- Keep the first release read-only toward CRMs. Any future writeback requires a separate design and permission review.

## Before production work

Resolve the remaining product decisions in [delivery-plan.md](docs/delivery-plan.md#decisions-to-confirm) before selecting production hosting and customer authentication. The current prototype assumes Bitrix24 as the first adapter and compares commercial outcomes with non-commercial work; the user confirmed that two-axis analytical goal. Update the connector research and contract when API behavior observed in sandbox differs from the documentation.
