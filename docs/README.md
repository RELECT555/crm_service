# Documentation map

Start here. For current behavior, use the repository's precedence: [root README](../README.md), code in `apps/`, then `docs/`. When a description conflicts with the implementation, reconcile the README and the affected document together. Product proposals do not establish implemented behavior.

| Document | Read it when you need to… | Audience |
| --- | --- | --- |
| [../README.md](../README.md) | run the project, see the API routes at a glance | everyone |
| [development.md](development.md) | set up a machine, use demo data, debug common failures | developers, agents |
| [api.md](api.md) | find a route, its permission and payload | developers, agents |
| [access-control.md](access-control.md) | users, roles, permissions, sessions, audit — rules and guards | developers, agents, security review |
| [onboarding.md](onboarding.md) | welcome presentation and guided tour: lifecycle, server state, how to add a slide or a tour step | developers, agents, design |
| [metrics.md](metrics.md) | exact definition of every analytics number and signal | product, developers, agents |
| [code-architecture.md](code-architecture.md) | know where code goes, what may import what, how a connection flows, how to add a connector | developers, agents |
| [ui-guidelines.md](ui-guidelines.md) | build or change an admin screen: tokens, components, badges, motion (Motion + Base UI), responsive layouts, charts, permission-aware UI, copy | developers, agents, design |
| [decisions.md](decisions.md) | understand why something is the way it is before changing it | everyone |
| [architecture.md](architecture.md) | product scope, tenancy, analytics semantics | product, developers |
| [connectors.md](connectors.md) | compare CRMs at a glance | product, developers |
| [connectors/&lt;crm&gt;.md](connectors/) | connect or implement a specific CRM (setup, auth, data, change capture, limits, sources) | developers, support |
| [ingestion-contract.md](ingestion-contract.md) | compare the implemented connector/model with proposed ingestion extensions | developers |
| [delivery-plan.md](delivery-plan.md) | implemented milestones, remaining engineering work, release criteria and open decisions | product, developers |
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
| Service / operator key | `ADMIN_API_KEY`: creates the first owner and authenticates scripts as `system`. Normal UI sign-in uses email/password; the key is not stored in browser storage. |
| Available provider | An adapter exists and both app credentials are present. This catalog status does not prove the credentials work, the CRM plan allows access, or sandbox verification is complete. |
| Generated at | Time an analytics response was calculated; not the last CRM sync time. |

## Keep documentation current

For an implementation change, update the reference that owns the behavior:

| Change | Update |
| --- | --- |
| Command, environment variable or operator setup | root README, [development.md](development.md), relevant connector playbook |
| HTTP route or response | [api.md](api.md); [access-control.md](access-control.md) for authentication or permissions |
| Metric definition or coverage rule | [metrics.md](metrics.md), metric version and behavior tests |
| Layer, storage, worker or connector boundary | [code-architecture.md](code-architecture.md); [ingestion-contract.md](ingestion-contract.md) when a proposal becomes implemented |
| UI convention, slide or section | [ui-guidelines.md](ui-guidelines.md), [onboarding.md](onboarding.md) when applicable |
| Replaced design decision | mark the old entry superseded in [decisions.md](decisions.md); keep its history |

Link to the owning reference instead of copying its detailed rules. Distinguish **implemented**, **proposed** and **unverified in a sandbox**. Local integration tests with mocked CRM responses prove our behavior against those fixtures, not live provider behavior. Date provider research separately from local verification.
