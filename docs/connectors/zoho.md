# Zoho CRM connector playbook

Status: **planned**. Research date: 2026-10-02.

## Operator setup
1. Once per service: register a server-based client in the Zoho API Console with redirect `${APP_ORIGIN}/oauth/zoho/callback` and read scopes (for example `ZohoCRM.modules.READ`, `ZohoCRM.settings.READ`, `ZohoCRM.users.READ`, `ZohoCRM.notifications.ALL` for watch channels).
2. Per customer: authorize; Zoho returns the account's data center, so the operator only selects it if the consent URL must be DC-specific.
3. Map purchase pipelines/layouts and custom activity modules if used.

## Authorization
- Access token lives 1 hour; refresh token does not expire until revoked; at most 20 refresh tokens per user and 15 active access tokens per refresh token ([token validity](https://www.zoho.com/crm/developer/docs/api/v8/token-validity.html), [refresh](https://www.zoho.com/crm/developer/docs/api/v8/refresh.html)).
- Multi-DC: the callback carries `accounts-server`; tokens must be exchanged on that accounts server, and API calls go to the returned `api_domain` ([multi DC](https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html)). Store both per connection.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | layouts / pipeline settings APIs | — | |
| CommercialItem | commercial | `Deals` module, Get Records ([get records](https://www.zoho.com/crm/developer/docs/api/v8/get-records.html)) | `per_page` ≤ 200; `page` up to 2,000 records, then `page_token` | `Amount`, `Currency` (multi-currency), `Owner`, `Stage`. |
| Activity | work | `Tasks`, `Calls`, `Events` modules | same | `What_Id` links to deals. |
| Users | context | users API | | |

Large backfills: Bulk Read API or COQL; incremental scans: `If-Modified-Since` header on Get Records.

## Incremental sync and change capture
Notification API watch channels (`/actions/watch`) send module, IDs and operation; channel expiry is configurable up to one week, so renew before expiry and reconcile any gap ([notifications](https://www.zoho.com/crm/developer/docs/api/v8/notifications/enable.html)). Validate the channel token you set.

## Limits and failure handling
Credit-based API limits per edition; check the API limits page during implementation.

## Embedded surface
Widgets/extensions require separate validation before promising an embedded view.

## Pitfalls
- Using the wrong data center returns `invalid_code`/`invalid_client`, which looks like an auth failure.
- The 20-refresh-token cap: repeated re-authorization by the same user silently invalidates the oldest token.

## Sources
Linked inline.
