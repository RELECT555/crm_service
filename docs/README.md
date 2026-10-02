# Documentation map

Start here. Each document has one job; when they disagree about current behavior, the code in `apps/` wins and the document must be fixed in the same change.

| Document | Read it when you need to… | Audience |
| --- | --- | --- |
| [../README.md](../README.md) | run the project, see the API routes at a glance | everyone |
| [development.md](development.md) | set up a machine, use demo data, debug common failures | developers, agents |
| [code-architecture.md](code-architecture.md) | know where code goes, what may import what, how a connection flows, how to add a connector | developers, agents |
| [ui-guidelines.md](ui-guidelines.md) | build or change an admin screen: tokens, components, badges, motion, copy | developers, agents, design |
| [decisions.md](decisions.md) | understand why something is the way it is before changing it | everyone |
| [architecture.md](architecture.md) | product scope, tenancy, analytics semantics | product, developers |
| [connectors.md](connectors.md) | compare CRMs at a glance | product, developers |
| [connectors/&lt;crm&gt;.md](connectors/) | connect or implement a specific CRM (setup, auth, data, change capture, limits, sources) | developers, support |
| [ingestion-contract.md](ingestion-contract.md) | target (not yet implemented) connector contract and storage model | developers |
| [delivery-plan.md](delivery-plan.md) | milestones, acceptance criteria, open product decisions | product |
| [../AGENTS.md](../AGENTS.md) | rules and definition of done for coding agents | agents, reviewers |

## Glossary

| Term | Meaning |
| --- | --- |
| Workspace / tenant | One customer of the service. All data is isolated per tenant. UI: «Пространство». |
| Connection | One authorized CRM account inside a tenant (for example one Bitrix24 portal). |
| Account / account ID | Operator-facing address of the CRM account (portal host) and its stable provider ID (Bitrix24 `member_id`). |
| Connector / adapter | Provider-specific code in `apps/api/src/connectors/<provider>/` implementing the `Connector` contract. |
| Kind | A provider object type the sync reads: `deal`, `activity`, `contact`, `pipeline`, `stage`, `smart:<id>`. |
| Axis | `commercial` (sales, purchases), `work` (meetings, calls, visits, tasks), `context` (reference data). |
| Commercial source mapping | Operator rule that marks a pipeline or custom process as sale or purchase. Purchases are never guessed. |
| Action type mapping | Operator rule that maps a custom CRM activity code to a canonical work type (e.g. `TRAVEL` → visit). |
| Backfill / reconciliation | First full read of a connection / periodic full re-read that repairs missed events. |
| Checkpoint | Per-kind cursor stored after each committed page; a kind is complete when its cursor is null. |
| Operator key | `ADMIN_API_KEY`: development credential for the admin UI and `/v1` API. Not customer login. |
