# Kommo / amoCRM connector playbook

Status: **implemented, not yet verified in a sandbox** (adapter in `apps/api/src/connectors/kommo/`, serves both Kommo and [amoCRM](amocrm.md)). Research date: 2026-10-02. Direct fetches of developers.kommo.com were blocked from the research environment; facts below come from the official documentation pages listed in Sources, as indexed by search. Re-read them before the first real connection.

## What the adapter does today

| Area | Implementation | Sandbox verification |
| --- | --- | --- |
| Consent | `https://www.kommo.com/oauth?client_id&state&mode=post_message` (amoCRM: `https://www.amocrm.ru/oauth`) | documented, not run |
| Callback | Requires `code` and `referer`; `referer` must equal the account the operator entered, else 400 | documented, not run |
| Tokens | `POST https://{account}/oauth2/access_token` (JSON, includes `redirect_uri`); refresh rotates the refresh token, both tokens are written in one statement | documented, not run |
| Identity | `GET /api/v4/account` → `id` (account ID), `currency` (stored in connection settings, used as deal currency) | documented, not run |
| Backfill | `pipeline`, `stage` from `/api/v4/leads/pipelines`; `user`, `deal` (`/api/v4/leads`), `contact`, `task`: `page` + `limit=250` + `order[id]=asc`; 204 = empty | partly documented (user response shape, `order[id]`, 204 behaviour **unverified**) |
| Change events | `POST /api/v4/webhooks` with lead/contact/task events to the per-connection secret URL; 402/403 → `polling` mode (hourly reconciliation) | plan restriction documented; status code and task/contact event names **unverified** |
| Webhook parsing | form keys `leads\|tasks\|contacts[add\|update\|delete\|status\|restore\|responsible][n][id]`, account from `account[id]` (must match) | `account[id]` field name **unverified** |
| Rate limit | ≥160 ms between requests per connection (< 7 rps); 429/5xx retried with backoff | documented |
| Mapping | Deals are sales; a pipeline can be marked purchase. Amount = `price`, currency = account currency (no field mapping). Task type 2 → meeting; other types → `task` until mapped by `task_type_id` | — |

Known gaps: companies, call notes (`call_in`/`call_out`) and stage history from `/api/v4/events` are not read yet. Page-number pagination can shift when records are deleted during backfill; a later full scan may recover missed upserts, but does not prove deletion of previously stored records.

## Operator setup
1. Once per service: register a public integration in the Kommo developer account (or amoCRM for Russian accounts, which is a separate platform and app registration), set the redirect URI `${APP_ORIGIN}/oauth/kommo/callback` (`/oauth/amocrm/callback` for amoCRM), and set `KOMMO_CLIENT_ID`/`KOMMO_CLIENT_SECRET` (or `AMOCRM_*`) on the server. Until then the admin catalog shows the CRM as «Нужна настройка».
2. Per customer: enter the account subdomain (`company.kommo.com` / `company.amocrm.ru`) and authorize as an account administrator.
3. Map which pipelines are purchases (if any) and which task types count as which work type. Call notes are not currently imported or mappable.

## Authorization
- OAuth 2.0 authorization code; code exchange and refresh at `https://{subdomain}/oauth2/access_token` ([OAuth](https://developers.kommo.com/docs/oauth-20), [get token](https://developers.kommo.com/reference/get-token)).
- Access token lives 24 hours; refresh token 3 months and is **rotated on every refresh** — persist the new refresh token in the same transaction as the access token or the connection is lost.
- Account identity: the account ID from `/api/v4/account`; store the subdomain as `account`. Handle the integration-uninstall/revocation signal described in the OAuth guide.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | `/api/v4/leads/pipelines` (statuses embedded) | — | Status IDs 142/143 are won/lost system statuses — **unverified**, confirm in sandbox. |
| CommercialItem | commercial | `/api/v4/leads` | `page` + `limit` ≤ 250 ([leads list](https://developers.kommo.com/reference/leads-list)) | `price` is a pipeline value; direction `sale` by default, purchases by explicit pipeline mapping. |
| Contact | context | `/api/v4/contacts` | same | IDs/owners only. |
| User | context | `/api/v4/users` | same page reader | Names label managers; response shape **unverified in a sandbox**. |
| Activity (task) | work | `/api/v4/tasks` | same | `task_type_id` 1 = follow-up/call, 2 = meeting in default accounts; custom types need mapping. |

Companies (`/api/v4/companies`), call notes (`call_in`/`call_out`) and stage history (`/api/v4/events`, `lead_status_changed`; [event types](https://developers.kommo.com/reference/events-types)) are researched candidates, not current sync kinds. Historical retention remains **unverified**; recordings and note bodies are not stored.

For a future incremental reader, consider `filter[updated_at][from]` where supported and a tested overlap window. The implemented worker rereads full pages during reconciliation; it does not run timestamp-based incremental scans.

## Incremental sync and change capture
- Webhooks cover lead/contact/company/task add/update/delete and `status_lead` ([webhooks](https://developers.kommo.com/docs/webhooks-general), [events](https://developers.kommo.com/reference/webhook-events)). Body is `x-www-form-urlencoded`; any 1xx–2xx response counts as accepted.
- Failed deliveries are retried (≈5 min, 15 min, 15 min, 1 h for 499/5xx) — handle duplicates by digest and refetch the record.
- Registering webhooks via API (`POST /api/v4/webhooks`, [add webhook](https://developers.kommo.com/reference/add-webhooks)) depends on the customer's plan. The adapter falls back on 402/403 to scheduled full reconciliation; the worker checks every 15 minutes for polling connections whose last full sync is over one hour old. A future `updated_at` reader is not implemented.
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

## Verification evidence

[`kommo.test.ts`](../../apps/api/test/kommo.test.ts) checks account mismatch, paging, manager names, plan-restriction fallback, token rotation, mappings, event updates and connection isolation with mocked responses. The matrix above describes **sandbox** status; mock coverage does not validate those live API shapes/status codes. No dated sandbox run is recorded here.

Before a pilot, record the platform (Kommo or amoCRM), plan, date, tested objects and outcome. Confirm the marked response/event fields and 402/403 fallback, refresh/revocation, pagination/restart, webhook delivery/duplicates/deletes and two-account isolation. Keep credentials and customer payloads out of the evidence. Run each platform's OAuth registration separately; a shared adapter does not prove both platforms' live behavior.
