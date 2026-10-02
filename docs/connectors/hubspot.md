# HubSpot connector playbook

Status: **planned**. Research date: 2026-10-02 (via search; direct fetch was blocked).

## Operator setup
1. Once per service: create an app on the current HubSpot developer platform, add redirect URI `${APP_ORIGIN}/oauth/hubspot/callback`, request read scopes only (deals, contacts, companies, engagement objects).
2. Per customer: click *Авторизоваться*; HubSpot shows an account picker, so no account address is typed.
3. Map pipelines that represent purchases, if any.

## Authorization
- OAuth 2.0 authorization code ([OAuth quickstart](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide), [manage tokens](https://developers.hubspot.com/docs/api-reference/latest/authentication/manage-oauth-tokens)).
- Access tokens are short-lived (~30 minutes; read `expires_in`); refresh tokens stay valid until the app is uninstalled or revoked ([refresh](https://developers.hubspot.com/docs/api-reference/latest/authentication/oauth-tokens/refresh-oauth-token)).
- Account identity: the HubSpot portal (hub) ID from token metadata.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | CRM pipelines API for `deals` | — | Stage `metadata.isClosed`/probability give won/lost semantics. |
| CommercialItem | commercial | `GET /crm/v3/objects/deals` (or current versioned path) | cursor `after`, limit ≤ 100 (v3 objects) | `amount` + `deal_currency_code`; owner `hubspot_owner_id`. |
| Activity | work | calls, meetings, tasks, emails, notes objects | cursor `after` | Each engagement type is its own object; associations link to deals. |
| Users | context | owners API | cursor | Map `hubspot_owner_id` → person. |

Incremental scans: the CRM search API can filter `hs_lastmodifieddate`, but returns at most 10,000 results per query and is limited to about 5 requests/second per account ([search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)). Slice by time window to stay under the cap.

## Incremental sync and change capture
App webhook subscriptions deliver create/property-change/delete for subscribed objects ([configure webhooks](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/features/configure-webhooks)). Verify HubSpot's request signature as documented for the platform version you build on, then refetch.

## Limits and failure handling
Per-app/account burst limits (for example 190 requests/10 s for privately distributed apps on Professional/Enterprise) ([usage guidelines](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)); honor 429 and `Retry-After`; track remaining quota headers.

## Embedded surface
App Cards and App Home (React UI extensions) on the current platform; legacy CRM cards are being retired ([platform basics](https://developers.hubspot.com/developer-platform-basics)).

## Pitfalls
- API paths and webhook formats differ between platform generations — pin one generation per app.
- Multi-currency portals: `amount` is in the deal currency; `amount_in_home_currency` exists — record which one a metric uses.

## Sources
Linked inline.
