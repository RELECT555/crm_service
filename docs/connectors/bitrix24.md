# Bitrix24 connector playbook

Status: **available** (adapter in `apps/api/src/connectors/bitrix24/`). Research date: 2026-10-02.

## Operator setup
1. Once per service: create a Bitrix24 application (Marketplace or local) with the `crm` scope and register the redirect URI `${APP_ORIGIN}/oauth/bitrix24/callback`. Put the client ID/secret into `BITRIX_CLIENT_ID` / `BITRIX_CLIENT_SECRET`.
2. Per customer: in the admin UI, choose the workspace → *Подключить CRM* → Bitrix24, enter the portal host (`company.bitrix24.ru`), and authorize as a user who can see all relevant deals and activities (normally a portal administrator).
3. Wait for *Первичная загрузка* → *Работает*. Then map purchase pipelines/smart processes and custom activity provider types.

The prototype accepts only `*.bitrix24.com` and `*.bitrix24.ru` hosts. Other cloud zones and on-premise (box) portals need an explicit allowlist decision before they are accepted.

## Authorization
- Consent: `https://{portal}/oauth/authorize/?client_id=…&state=…`; token exchange and refresh: `https://oauth.bitrix.info/oauth/token/` ([REST overview](https://apidocs.bitrix24.com/api-reference/)).
- The token response carries `member_id` (stable account identity → `connections.account_id`) and `client_endpoint` (portal REST base). The adapter verifies that the portal in `client_endpoint` equals the portal bound to the OAuth `state`, that `member_id` matches the callback, and that `scope` includes `crm`.
- `invalid_grant`, `invalid_token`, `expired_token`, `no_auth_found` → `ConnectorAuthError` → status `reauthorization_required`. Re-authorizing the same portal repairs the existing connection.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline | context | `crm.category.list` (entityTypeId 2) | `start`/`next` | |
| Stage | context | `crm.status.list`, `ENTITY_ID` starting `DEAL_STAGE` | `start`/`next` | |
| CommercialItem (deal) | commercial | `crm.item.list` entityTypeId 2 | keyset `>id`, `start: 0`, 50/page | Default direction `sale`; `opportunity` is a pipeline value, not booked revenue. |
| CommercialItem (smart process) | commercial | `crm.item.list` entityTypeId ≥ 128 | same | Read only after the operator maps it as sale/purchase with explicit amount/currency fields. |
| Contact | context | `crm.item.list` entityTypeId 3 | same | Only IDs, owner and timestamps are kept. |
| Activity | work | `crm.activity.list` | keyset `>ID`, 50/page | `TYPE_ID` 1 meeting, 2 call, 3 task, 4 email, 6 provider; `PROVIDER_TYPE_ID` mapped by the operator (e.g. visits). |

New CRM work should use universal `crm.item.*`; legacy per-entity branches are frozen and use different field names ([list guide](https://apidocs.bitrix24.com/tutorials/crm/how-to-get-lists/index.html), [universal methods](https://apidocs.bitrix24.com/api-reference/crm/universal/index.html)). Activities: [timeline activities](https://apidocs.bitrix24.com/api-reference/crm/timeline/activities/).

Not yet covered: external tasks (`tasks.task.list`), multi-entity activity bindings, users directory, stage history.

## Incremental sync and change capture
- `event.bind` subscribes `ONCRMDEAL*`, `ONCRMCONTACT*`, `ONCRMACTIVITY*`, `ONCRMDYNAMICITEM*` to `/webhooks/bitrix24/{per-connection secret}`. Events are form-encoded and normally contain only the record ID, so the worker refetches ([events](https://apidocs.bitrix24.com/api-reference/events/index.html), [deal events](https://apidocs.bitrix24.com/api-reference/crm/deals/events/index.html)).
- Ordinary events are not retried by Bitrix24 when the handler fails. The service therefore stores accepted events durably and runs a full reconciliation for connections stale for 24 hours.
- [Offline events](https://apidocs.bitrix24.com/api-reference/events/offline-events.html) are the candidate for reliable delete detection; **unverified**, not implemented.

## Limits and failure handling
- Leaky bucket: about 2 requests/second with a burst of 50 on most plans and 5/second with a burst of 250 on Enterprise; excess requests get `503 QUERY_LIMIT_EXCEEDED`. Method resource limits return `429 OPERATION_TIME_LIMIT` with `operating_reset_at` ([limits](https://apidocs.bitrix24.com/limits.html)). The client retries 429/5xx with backoff and `Retry-After`.
- `batch` runs up to 50 sub-requests ([batch](https://apidocs.bitrix24.com/settings/how-to-call-rest-api/batch.html)); not used yet. It is the first optimization for large portals.

## Embedded surface
`placement.bind` supports CRM detail tabs and menu entries rendered in an iframe ([widgets](https://apidocs.bitrix24.com/api-reference/widgets/index.html)). Launch context → stored connection → short-lived session must be proven in a test portal.

## Pitfalls
- Never infer purchases from deal titles or pipeline names: purchases come only from `commercial_sources` mappings.
- A missing record during reconciliation can mean a deletion *or* a permission change; do not tombstone without a verified delete event.
- Smart-process events arrive for every process; the adapter drops events for unmapped types (`acceptsEvent`).

## Sources
Linked inline. Re-verify limits and event behavior before production.
