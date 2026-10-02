# Bitrix24 connector playbook

Status: **implemented** (adapter in `apps/api/src/connectors/bitrix24/`); the runtime catalog shows **available** only when app credentials are configured. Research date: 2026-10-02. Local verification and sandbox evidence are distinguished below.

## Operator setup
1. Once per service: create a Bitrix24 application (Marketplace or local) with the `crm` and `user_brief` scopes and register the redirect URI `${APP_ORIGIN}/oauth/bitrix24/callback`. Put the client ID/secret into `BITRIX_CLIENT_ID` / `BITRIX_CLIENT_SECRET`.
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
| User | context | `user.get` (`sort: "ID"`, `order: "ASC"`, `select: ID, NAME, LAST_NAME, ACTIVE`) | `start`/`next`, always 50/page | Only when a user scope was granted; see [Manager names](#manager-names). |

New CRM work should use universal `crm.item.*`; legacy per-entity branches are frozen and use different field names ([list guide](https://apidocs.bitrix24.com/tutorials/crm/how-to-get-lists/index.html), [universal methods](https://apidocs.bitrix24.com/api-reference/crm/universal/index.html)). Activities: [timeline activities](https://apidocs.bitrix24.com/api-reference/crm/timeline/activities/).

Not yet covered: external tasks (`tasks.task.list`), multi-entity activity bindings, departments, stage history.

### Manager names

Deals and activities carry only the responsible user's ID (`assignedById`, `RESPONSIBLE_ID`). Names come from [`user.get`](https://github.com/bitrix24/b24restdocs/blob/main/api-reference/user/user-get.md) (official REST docs repository, read 2026-10-02):
- `user.get` accepts any of the `user`, `user_brief` or `user_basic` scopes. Fields outside the granted scope are silently omitted ([user scope versions](https://github.com/bitrix24/b24restdocs/blob/main/api-reference/user/user-scope.md)). `user_brief` is the minimum that includes `NAME` and `LAST_NAME`.
- The page size is fixed at 50 and the offset is `start`. The adapter follows `next` from the response.
- Sorting is ascending by `ID` by default; the adapter sends it explicitly.
- Without a `FILTER`, dismissed employees are returned too. That is intended, because they still own historical deals.

The adapter stores the scopes granted at authorization in the connection settings. It adds the `user` sync kind only when one of these scopes is present, so a portal authorized with `crm` alone keeps working and shows managers by ID. To get names on an existing connection:
1. Add `user_brief` to the application.
2. Press «Переподключить» (re-authorize).

Re-authorization updates the stored scopes and queues a full sync. Users are never removed by absence (`deletionCheck` is `none` for `user`): `start` offsets can shift, and a dismissed manager must keep a name.

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

## Verification evidence

Local integration coverage: [flow.test.ts](../../apps/api/test/flow.test.ts) (OAuth/account verification, backfill and events; `crm` scope only, so `user.get` must not be called), [bitrix-users.test.ts](../../apps/api/test/bitrix-users.test.ts) (`user_brief`: paging by `start`/`next`, manager names, dismissed users kept), [resume.test.ts](../../apps/api/test/resume.test.ts) (page interruption/retry), [admin.test.ts](../../apps/api/test/admin.test.ts) (catalog, mappings and response secrecy), and [lifecycle.test.ts](../../apps/api/test/lifecycle.test.ts) (disconnect/resume). These use mocked provider responses; they do not prove live plan permissions, quotas or event delivery.

This playbook records no dated sandbox run. Treat live behavior as **unverified here** until an operator records the date, portal edition/plan, tested objects and result. The minimum run covers OAuth refresh/revocation, pagination/restart, event registration and delivery, duplicate/delete events, purchase/custom-activity mappings, and two accounts with no cross-account data exposure. Record observed limits and differences from the linked official documentation without credentials or real customer payloads. Embedded launch, offline events and missed-delete reconciliation remain separate unverified work.
