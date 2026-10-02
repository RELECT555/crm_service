# Microsoft Dynamics 365 Sales / Dataverse connector playbook

Status: **planned**. Research date: 2026-10-02.

## Operator setup
1. Once per service: register a multi-tenant app in Microsoft Entra ID with redirect `${APP_ORIGIN}/oauth/dynamics/callback` and the delegated Dataverse permission (`user_impersonation`).
2. Per customer: enter the environment URL (`https://org.crm4.dynamics.com`) and authorize as a user with read access; a tenant admin may need to grant consent.
3. Customer admin enables **change tracking** on Opportunity, Account, Contact, and activity tables ([enable change tracking](https://learn.microsoft.com/en-us/power-platform/admin/enable-change-tracking-control-data-synchronization)).

## Authorization
Microsoft identity platform authorization code flow with resource `https://{org}.crm*.dynamics.com/.default`; refresh tokens rotate and must be persisted ([Dataverse auth](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authentication)). Account identity: Entra tenant ID + environment (organization) ID.

## Data we read
| Canonical entity | Axis | Source | Notes |
| --- | --- | --- | --- |
| CommercialItem | commercial | `opportunities` | `estimatedvalue`/`actualvalue`, `transactioncurrencyid`, `statecode` (open/won/lost), `ownerid`. |
| Activity | work | `phonecalls`, `appointments`, `tasks`, `emails` (or `activitypointers`) | `regardingobjectid` links to opportunity. |
| Stage | context | business process flow stage / `salesstage` | |
| Users | context | `systemusers` | |

Web API: [operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-operations-web-api). Server-driven paging via `@odata.nextLink` + `Prefer: odata.maxpagesize`.

## Incremental sync and change capture
Request with `Prefer: odata.track-changes` to obtain an opaque `@odata.deltaLink`; persist it after the page commits. `$filter`, `$orderby`, `$expand` and `$top` are not supported together with change tracking, so select columns only ([change tracking](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-change-tracking-synchronize-data-external-systems)). An expired/invalid delta link requires a full resync. Dataverse webhooks are an optional wake-up signal ([webhooks](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-webhooks)).

## Limits and failure handling
Service protection limits return 429 with `Retry-After`; honor it per connection.

## Embedded surface
Model-driven custom page ([custom pages](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/navigate-to-custom-page-examples)).

## Pitfalls
- Change tracking is per table and off by default; the admin UI must show which tables are not enabled.
- Money fields have base-currency twins (`*_base`); pick one explicitly per metric.

## Sources
Linked inline.
