# Pipedrive connector playbook

Status: **planned**. Research date: 2026-10-02 (via search; direct fetch was blocked).

## Operator setup
1. Once per service: create a Marketplace app (can stay unlisted for pilots), redirect URI `${APP_ORIGIN}/oauth/pipedrive/callback`, read-only scopes for deals, activities, contacts, users.
2. Per customer: authorize; the company is chosen on Pipedrive's consent screen.
3. Map activity types (Pipedrive has customizable activity types such as call, meeting, task, plus custom ones).

## Authorization
- Authorization code flow; token and refresh at `POST https://oauth.pipedrive.com/oauth/token` ([OAuth](https://developers.pipedrive.com/docs/api/v1/Oauth), [authorization](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)).
- Access token expires after 60 minutes; refresh token expires if unused for 60 days (each use resets it).
- The token response includes `api_domain` (company-specific base URL); always call the API on the latest `api_domain` from token responses.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | `/api/v2/pipelines`, `/api/v2/stages` | cursor | |
| CommercialItem | commercial | `/api/v2/deals` | cursor (`cursor`, `limit` ≤ 500, `additional_data.next_cursor`) ([pagination](https://pipedrive.readme.io/docs/core-api-concepts-pagination)) | `value` + `currency`; status open/won/lost. |
| Activity | work | `/api/v2/activities` | cursor | `type` key maps to canonical action type; `done` flag = completed. |
| Person, Organization | context | `/api/v2/persons`, `/api/v2/organizations` | cursor | |
| Users | context | `/v1/users` | — | |

Cursor endpoints support `updated_since` filters on v2 for incremental scans — **unverified** per endpoint; confirm.

## Incremental sync and change capture
Webhooks v2 deliver create/change/delete for deals, activities, persons, organizations ([webhooks v2](https://pipedrive.readme.io/docs/guide-for-webhooks-v2)). Register per connection with a secret URL; refetch on each event.

## Limits and failure handling
Shared daily token budget per company plus per-token burst limits, with rate-limit headers ([rate limiting](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting)). Backfills must throttle so they do not exhaust the customer's budget for their other integrations.

## Embedded surface
App extensions: custom panels, modals, actions ([app extensions](https://pipedrive.readme.io/docs/app-extensions)).

## Pitfalls
- `api_domain` can change; never hardcode `api.pipedrive.com` for customer data.
- Deleted deals may remain retrievable with a deleted status; map that to a tombstone explicitly.

## Sources
Linked inline.
