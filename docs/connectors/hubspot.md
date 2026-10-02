# HubSpot connector playbook

Status: **implemented, not yet verified in a sandbox** (adapter in `apps/api/src/connectors/hubspot/`). Research date: 2026-10-02. The research environment could not open developers.hubspot.com. Endpoints and response shapes below come from the **official HubSpot SDK**, npm [`@hubspot/api-client` 14.0.1](https://www.npmjs.com/package/@hubspot/api-client). The parts used were `lib/src/discovery/oauth/OauthDiscovery.js` and the generated `codegen/oauth`, `codegen/crm/{deals,objects,owners,pipelines}` clients. Property names and scope names do not appear in the SDK, so they are **unverified**.

## What the adapter does today

| Area | Implementation | Source / verification |
| --- | --- | --- |
| Consent | `https://app.hubspot.com/oauth/authorize?client_id&redirect_uri&scope&state`. `scope` is `HUBSPOT_SCOPES` verbatim: it must equal the app's required scopes, and the adapter never guesses it. The account is picked on HubSpot's screen (`accountChosenOnConsent`). | SDK `getAuthorizationUrl`; not run |
| Tokens | `POST https://api.hubapi.com/oauth/v1/token`, form-encoded, with `client_id`/`client_secret` in the body; grant `authorization_code` or `refresh_token`. | SDK `TokensApi`; not run |
| Identity | `GET /oauth/v1/access-tokens/{token}` → `hub_id` is the connection `account_id`; `hub_domain` (lower-cased) is `account`, falling back to `hub-{id}`. Re-authorizing into another portal is refused with 400. | SDK `AccessTokensApi`; not run |
| Backfill | `pipeline`/`stage` (`/crm/v3/pipelines/deals`, one response), `user` (`/crm/v3/owners`), `deal` (`/crm/v3/objects/deals`), and `call`, `meeting`, `task`, `email` (`/crm/v3/objects/{calls,meetings,tasks,emails}`). Paging: `limit=100`, `after` from `paging.next.after`. Properties are requested one per `properties` parameter; engagements add `associations=deals`. | SDK (`BasicApi.getPage`, owners, pipelines); not run |
| Change events | None yet; the connection runs in `polling` mode with hourly full reconciliation. HubSpot webhooks are configured **once per app** and signed with the app secret ([webhooks](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/features/configure-webhooks)). They need an app-level route that resolves the portal from a verified signature, which does not fit the per-connection secret URL. It is the next step and needs its own design. | — |
| Rate limit | 110 ms between requests per connection (our choice); 429/5xx retried up to 3 times honoring `Retry-After`; one refresh on 401; 403 reports a probable missing scope. | [Usage guidelines](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines) via search |
| Mapping | Deal: amount `amount`, currency `deal_currency_code`, status `dealstage`, owner `hubspot_owner_id`. Deals are sales; a pipeline (string ID such as `default`) can be marked purchase. Each engagement object is its own action type. Tasks use `hs_task_type`: `CALL`/`EMAIL`/`TODO` map to call/email/task, and anything else is mapped by the operator (for example a custom `VISIT`). Completion: call `hs_call_status=COMPLETED`, meeting `hs_meeting_outcome=COMPLETED`, task `hs_task_status=COMPLETED`; emails count as done. The first associated deal is the work target. | Property names and values **unverified** |

Known gaps:
- Notes, contacts, companies and line items are not read.
- Stage history (`hs_date_entered_*` or property history) is not read.
- Archived records are not requested. Deletes are found by the hourly full pass (`deletionCheck`):
  - Deals and engagements the pass did not see are re-read one by one and tombstoned only on 404. That archived objects answer 404 is **unverified**.
  - Pipelines and stages come in one response, so a missing one is removed.
  - Owners are never removed by absence, so deactivated managers keep their names.

## Operator setup
1. Once per service:
   - Create an app on the current HubSpot developer platform.
   - Add the redirect URI `${APP_ORIGIN}/oauth/hubspot/callback`.
   - Add **read-only** CRM scopes for deals, owners and the engagement objects. The exact names are **unverified**; copy them from the app settings.
   - Set `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` and `HUBSPOT_SCOPES` (space-separated, exactly the app's required scopes). Without `HUBSPOT_SCOPES` the catalog shows «Нужна настройка».
2. Per customer: press «Авторизоваться», sign in and pick the account.
3. Mark purchase pipelines and map custom task types if any.

## Authorization
- OAuth 2.0 authorization code ([OAuth quickstart](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide)).
- Access tokens last about 30 minutes; the adapter reads `expires_in`. Refresh tokens stay valid until the app is uninstalled ([refresh](https://developers.hubspot.com/docs/api-reference/latest/authentication/oauth-tokens/refresh-oauth-token)).

## Incremental sync (future)
The CRM search API can filter on `hs_lastmodifieddate`, but returns at most 10,000 results per query at about 5 requests/second ([search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)). An incremental reader would slice by time window. Not implemented: reconciliation re-reads full lists.

## Embedded surface
App Cards and App Home (React UI extensions) on the current platform ([platform basics](https://developers.hubspot.com/developer-platform-basics)). Not built.

## Pitfalls
- API paths and webhook formats differ between platform generations; pin one generation per app.
- In multi-currency portals `amount` is in the deal currency, and `amount_in_home_currency` also exists. The adapter uses the deal currency, and analytics does not convert.
- A scope list that differs from the app's required scopes fails on HubSpot's consent screen, not in our API.

## Sources
- [`@hubspot/api-client` 14.0.1 on npm](https://www.npmjs.com/package/@hubspot/api-client) (read 2026-10-02)
- [OAuth quickstart](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide)
- [Manage tokens](https://developers.hubspot.com/docs/api-reference/latest/authentication/manage-oauth-tokens)
- [Webhooks](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/features/configure-webhooks)
- [Search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- [Usage guidelines](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)

## Verification evidence

[`hubspot.test.ts`](../../apps/api/test/hubspot.test.ts) uses mocked responses to check:
- the not-configured state without scopes, and the scope passed verbatim;
- the portal taken from token info;
- refresh on 401;
- repeated `properties` and `associations`, and paging;
- polling mode;
- purchase pipeline with a string ID, task-type mapping, owner names and linked work;
- re-authorization into another portal;
- a full pass that tombstones an unlisted deal after a 404 and keeps owners.

No sandbox run is recorded. Before a pilot, confirm the following:
- the scope names;
- the property names and values;
- `hub_domain` presence;
- the 403 for a missing scope;
- multi-currency deals.
