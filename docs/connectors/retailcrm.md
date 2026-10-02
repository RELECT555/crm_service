# RetailCRM connector playbook

Status: **candidate** — relevant only if first customers are ecommerce/retail. Research date: 2026-10-02.

## Operator setup
1. Per customer: the customer creates an API key in RetailCRM (Settings → Integration → API keys) restricted to read scopes such as `order_read`, `customer_read`, `user_read`, `task_read`, and the operator enters system URL + key. API keys are stored encrypted exactly like OAuth tokens. A marketplace module flow is the alternative for distribution.
2. Verify granted scopes via `/api/credentials` and show missing ones in the admin UI.

## Authorization
API key in `X-API-KEY` header; API v5 for new integrations ([API rules](https://docs.retailcrm.ru/Developers/API/APIFeatures/APIRules)). `/api/credentials` returns available scopes.

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Order (CommercialItem, kind `order`) | commercial | `/api/v5/orders` | `page`, `limit` 20/50/100 | Orders are completed or in-progress sales, not deal pipelines — keep a separate `order` kind and metrics. |
| Customer | context | `/api/v5/customers` | same | |
| Task | work | `/api/v5/tasks` | same | |
| Users | context | `/api/v5/users` | | |

## Incremental sync and change capture
History endpoints (`/api/v5/orders/history`, `/customers/history`) with `filter[sinceId]`: advance `sinceId` instead of `page` (combining them returns 400) and persist the last processed history ID ([history API](https://docs.retailcrm.ru/Developers/API/APIFeatures/WorkingHistoryAPI)).

## Limits and failure handling
About 10 requests/second per IP (stricter for some methods) — check the rules page before implementation.

## Embedded surface
JS module embed points ([targets](https://docs.retailcrm.ru/Developers/modules/PublishingModuleMarketplace/JsModulesTargets)).

## Pitfalls
Mapping orders to deals would corrupt funnel metrics; orders need their own canonical kind.

## Sources
Linked inline.
