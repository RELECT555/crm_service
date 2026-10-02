# Pipedrive connector playbook

Status: **implemented, not yet verified in a sandbox** (adapter in `apps/api/src/connectors/pipedrive/`). Research date: 2026-10-02. The research environment could not open developers.pipedrive.com or pipedrive.readme.io. Endpoints, parameters and model fields below come from the **official Pipedrive SDK**, npm [`pipedrive` 33.7.0](https://www.npmjs.com/package/pipedrive), which is generated from the public OpenAPI spec. The files used were `dist/versions/v2/configuration.js`, the `v2/api/*` and `v2/models/*` typings, and `v1/api/webhooks-api`. Facts that appear in neither the SDK nor a fetched page are marked **unverified**. Re-read the linked guides before the first real connection.

## What the adapter does today

| Area | Implementation | Source / verification |
| --- | --- | --- |
| Consent | `https://oauth.pipedrive.com/oauth/authorize?client_id&redirect_uri&state`. Scopes come from the app settings in Developer Hub, not from the URL. The company is chosen on Pipedrive's screen, so the operator types nothing (`accountChosenOnConsent`). | SDK `OAuth2Configuration`; not run |
| Tokens | `POST https://oauth.pipedrive.com/oauth/token`, form-encoded, client credentials in HTTP Basic auth. Grant `authorization_code` (`code`, `redirect_uri`) or `refresh_token`. | SDK; not run |
| API host | The token response carries `api_domain` (for example `https://acme.pipedrive.com`). The adapter stores its host as the connection `account`. Every refresh re-reads it, so a moved company follows automatically. Tokens are sent only to `https://*.pipedrive.com`; any other `api_domain` gives 502. | SDK (`api_domain` in the token model); host check is our guard |
| Identity | `GET /api/v1/users/me` → `company_id` is the connection `account_id`; `company_name` is kept in settings. Re-authorizing into another company is refused with 400. | SDK `v1/models`; not run |
| Backfill | `pipeline` (`/api/v2/pipelines`), `stage` (`/api/v2/stages`), `user` (`/api/v1/users`, one response), `deal` (`/api/v2/deals`), `activity` (`/api/v2/activities`). Parameters: `limit=500` and `cursor` from `additional_data.next_cursor`; deals and activities add `sort_by=id&sort_direction=asc`. | SDK (`limit` ≤ 500, cursor, sort fields); not run |
| Change events | One webhook per object (`deal`, `activity`). Registration: `POST /api/v1/webhooks` with `event_action: "*"`, `version: "2.0"`, a `name`, and the per-connection secret URL. Existing hooks are reused. A 403 falls back to `polling` (hourly reconciliation). | SDK documents registration and that v2 is the default since 2025-03-17. The 403 meaning is **unverified** |
| Webhook parsing | `meta.entity` (`deal`/`activity`), `meta.action` (`create`/`change`/`delete`), `meta.entity_id`, `meta.company_id`; the company must match the connection. Any other body yields no events. | Body shape from the [webhooks v2 guide](https://pipedrive.readme.io/docs/guide-for-webhooks-v2) as indexed by search; **unverified** |
| Deletes | A webhook `delete` tombstones the record. A record read back with `is_deleted: true` is not stored. Missed deletes are caught by the full pass (`deletionCheck`): an unseen deal or activity is re-read and tombstoned on 404 or `is_deleted`. Pipelines and stages missing from the listing are removed. Users are never removed by absence. | SDK (`is_deleted` on deal/activity models); whether v2 cursors can skip rows is **unverified**, hence `verify` |
| Rate limit | 120 ms between requests per connection (our choice). 429 and 5xx are retried up to 3 times, honoring `Retry-After`. A 401 triggers one refresh. | [Rate limiting](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting); header semantics **unverified** |
| Mapping | Deals are sales; a pipeline can be marked purchase. Amount comes from `value` and currency from `currency`; `status` is open/won/lost. Activity `type` (the type's `key_string`) maps `call`/`meeting`/`task`/`email` by default. Any other key is `other` until the operator maps it, for example `visit_client` → visit. `done` means completed, and `deal_id` links the work to a deal. | SDK field names; the default keys are **unverified** (the SDK only lists matching icon keys) |

Known gaps:
- Persons, organizations, products and notes are not read.
- Stage history (deal flow) is not read, so conversion over time needs a later design.
- The v2 `updated_since` filter exists in the SDK but is not used yet: reconciliation re-reads full lists.

## Operator setup
1. Once per service:
   - Create an app in Pipedrive Developer Hub (it can stay unlisted for pilots).
   - Set the callback URL `${APP_ORIGIN}/oauth/pipedrive/callback`.
   - Enable read access to deals, activities and users, plus webhooks. The exact scope names in Developer Hub are **unverified**; pick the read-only ones.
   - Set `PIPEDRIVE_CLIENT_ID` and `PIPEDRIVE_CLIENT_SECRET`. Until then the catalog shows «Нужна настройка».
2. Per customer: press «Авторизоваться», sign in and choose the company on Pipedrive's consent screen.
3. Mark the pipelines that are purchases and map custom activity type keys.

## Authorization
- Authorization code flow ([OAuth](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)).
- Access tokens expire after about 60 minutes. Refresh tokens expire if unused for 60 days, and each use resets the period. Both lifetimes are from the guide via search; the adapter trusts `expires_in`.

## Limits and failure handling
- The limit is a daily token budget per company plus per-token burst limits ([rate limiting](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting)).
- Backfills share the customer's budget with their other integrations; the request spacing exists for that reason.
- 401 after a refresh → `ConnectorAuthError`. 400/401 from the token endpoint → `ConnectorAuthError`; the operator re-authorizes.

## Embedded surface
App extensions (custom panels, modals) ([app extensions](https://pipedrive.readme.io/docs/app-extensions)). Not built; prove the session exchange in a sandbox first.

## Pitfalls
- `api_domain` can change; never hardcode `api.pipedrive.com` for customer data.
- Deleted deals and activities remain readable with `is_deleted: true` for a while; they must not count.
- Activity types are per company, so the same `key_string` can mean different things in different companies. Mapping is per connection.

## Sources
- [`pipedrive` SDK 33.7.0 on npm](https://www.npmjs.com/package/pipedrive) (read 2026-10-02)
- [OAuth authorization](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)
- [Pagination](https://pipedrive.readme.io/docs/core-api-concepts-pagination)
- [Rate limiting](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting)
- [Webhooks v2](https://pipedrive.readme.io/docs/guide-for-webhooks-v2)
- [App extensions](https://pipedrive.readme.io/docs/app-extensions)

## Verification evidence

[`pipedrive.test.ts`](../../apps/api/test/pipedrive.test.ts) uses mocked responses to check:
- the consent URL, and Basic auth on the token request;
- refusal of a foreign `api_domain`, and following a moved one on refresh;
- cursor paging with a 429 retry;
- webhook v2 registration;
- purchase-pipeline and activity-type mapping, and manager names;
- foreign-company events, create/change/delete events, `is_deleted` reads;
- re-authorization into another company;
- a full pass that re-reads an unlisted deal (404 → tombstone) while keeping an unlisted user's name.

No dated sandbox run is recorded. Before a pilot, confirm the following and record the date and outcome without credentials or customer payloads:
- the webhook body;
- the default activity keys;
- the 403 behavior for a non-admin user;
- refresh-token rotation;
- two-company isolation.
