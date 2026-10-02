# Kommo / amoCRM connector playbook

Status: **implemented, not yet verified in a sandbox** (adapter in `apps/api/src/connectors/kommo/`, serves both Kommo and [amoCRM](amocrm.md)). Research date: 2026-10-02. Direct fetches of developers.kommo.com were blocked from the research environment; facts below come from the official documentation pages listed in Sources, as indexed by search. Re-read them before the first real connection.

## What the adapter does today

| Area | Implementation | Verified? |
| --- | --- | --- |
| Consent | `https://www.kommo.com/oauth?client_id&state&mode=post_message` (amoCRM: `https://www.amocrm.ru/oauth`) | documented, not run |
| Callback | Requires `code` and `referer`; `referer` must equal the account the operator entered, else 400 | documented, not run |
| Tokens | `POST https://{account}/oauth2/access_token` (JSON, includes `redirect_uri`); refresh rotates the refresh token, both tokens are written in one statement | documented, not run |
| Identity | `GET /api/v4/account` → `id` (account ID), `currency` (stored in connection settings, used as deal currency) | documented, not run |
| Backfill | `pipeline`, `stage` from `/api/v4/leads/pipelines`; `deal` (`/api/v4/leads`), `contact`, `task`: `page` + `limit=250` + `order[id]=asc`; 204 = empty | partly documented (`order[id]`, 204 behaviour **unverified**) |
| Change events | `POST /api/v4/webhooks` with lead/contact/task events to the per-connection secret URL; 402/403 → `polling` mode (hourly reconciliation) | plan restriction documented; status code and task/contact event names **unverified** |
| Webhook parsing | form keys `leads|tasks|contacts[add|update|delete|status|restore|responsible][n][id]`, account from `account[id]` (must match) | `account[id]` field name **unverified** |
| Rate limit | ≥160 ms between requests per connection (< 7 rps); 429/5xx retried with backoff | documented |
| Mapping | Deals are sales; a pipeline can be marked purchase. Amount = `price`, currency = account currency (no field mapping). Task type 2 → meeting; other types → `task` until mapped by `task_type_id` | — |

Known gaps: call notes (`call_in`/`call_out`) are not read yet; stage history from `/api/v4/events` is not used; page-number pagination can skip rows deleted during a backfill (reconciliation repairs it).

## Operator setup
1. Once per service: register a public integration in the Kommo developer account (or amoCRM for Russian accounts, which is a separate platform and app registration), set the redirect URI `${APP_ORIGIN}/oauth/kommo/callback` (`/oauth/amocrm/callback` for amoCRM), and set `KOMMO_CLIENT_ID`/`KOMMO_CLIENT_SECRET` (or `AMOCRM_*`) on the server. Until then the admin catalog shows the CRM as «Нужна настройка».
2. Per customer: enter the account subdomain (`company.kommo.com` / `company.amocrm.ru`) and authorize as an account administrator.
3. Map which pipelines are purchases (if any) and which task types / call notes count as which work type.

## Authorization
- OAuth 2.0 authorization code; code exchange and refresh at `https://{subdomain}/oauth2/access_token` ([OAuth](https://developers.kommo.com/docs/oauth-20), [get token](https://developers.kommo.com/reference/get-token)).
- Access token lives 24 hours; refresh token 3 months and is **rotated on every refresh** — persist the new refresh token in the same transaction as the access token or the connection is lost.
- Account identity: the account ID from `/api/v4/account`; store the subdomain as `account`. Handle the integration-uninstall/revocation signal described in the OAuth guide.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | `/api/v4/leads/pipelines` (statuses embedded) | — | Status IDs 142/143 are won/lost system statuses — **unverified**, confirm in sandbox. |
| CommercialItem | commercial | `/api/v4/leads` | `page` + `limit` ≤ 250 ([leads list](https://developers.kommo.com/reference/leads-list)) | `price` is a pipeline value; direction `sale` by default, purchases by explicit pipeline mapping. |
| Contact, Company | context | `/api/v4/contacts`, `/api/v4/companies` | same | IDs/owners only. |
| Activity (task) | work | `/api/v4/tasks` | same | `task_type_id` 1 = follow-up/call, 2 = meeting in default accounts; custom types need mapping. |
| Activity (call) | work | notes of type `call_in` / `call_out` on entities | same | Call recordings and bodies are not stored. |
| Stage history | — | `/api/v4/events` (`lead_status_changed`) ([event types](https://developers.kommo.com/reference/events-types)) | same | Real transition history — a candidate for funnel metrics; **unverified** retention window. |

Use `filter[updated_at][from]` for incremental scans where supported; keep an overlap window because timestamps have second precision.

## Incremental sync and change capture
- Webhooks cover lead/contact/company/task add/update/delete and `status_lead` ([webhooks](https://developers.kommo.com/docs/webhooks-general), [events](https://developers.kommo.com/reference/webhook-events)). Body is `x-www-form-urlencoded`; any 1xx–2xx response counts as accepted.
- Failed deliveries are retried (≈5 min, 15 min, 15 min, 1 h for 499/5xx) — handle duplicates by digest and refetch the record.
- Registering webhooks via API (`POST /api/v4/webhooks`, [add webhook](https://developers.kommo.com/reference/add-webhooks)) depends on the customer's plan. Without it, fall back to `updated_at` polling.
- There is no documented signature on generic webhooks; use the per-connection secret URL and validate `account[id]`/`account[subdomain]` against the stored connection.

## Limits and failure handling
- No more than 7 requests/second per integration; exceeding it returns 429 and repeated violations can block the integration ([limits](https://developers.kommo.com/docs/limitations)). Use a per-connection token bucket below 7 rps.
- 401 after a refresh attempt → `ConnectorAuthError`.

## Embedded surface
Public integrations can ship a widget (Web SDK) in lead/contact cards and settings ([public integrations](https://developers.kommo.com/docs/authorization-public)). Prove widget → backend session exchange in a sandbox.

## Pitfalls
- amoCRM (`*.amocrm.ru`) and Kommo (`*.kommo.com`) are separate platforms with separate app registrations and OAuth hosts.
- Refresh-token rotation: a crash between refresh and persist loses access. Write both tokens atomically.
- Lead `price` may be 0 while products carry the value; decide metric semantics explicitly.

## Sources
[OAuth 2.0](https://developers.kommo.com/docs/oauth-20) · [Token endpoint](https://developers.kommo.com/reference/get-token) · [Limits](https://developers.kommo.com/docs/limitations) · [Leads list](https://developers.kommo.com/reference/leads-list) · [Webhooks](https://developers.kommo.com/docs/webhooks-general) · [Webhook events](https://developers.kommo.com/reference/webhook-events) · [Add webhook](https://developers.kommo.com/reference/add-webhooks) · [Event types](https://developers.kommo.com/reference/events-types)
