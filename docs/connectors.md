# CRM connector research

Research date: 2026-09-30, refreshed 2026-10-02. Links point to official vendor documentation. API versions, quotas, subscriptions, editions, and marketplace rules can change; recheck them in a provider sandbox when implementation starts. The entries below describe supported mechanisms, not guaranteed access on every customer plan.

## Capability matrix

| CRM | Authorization and initial read | Change capture | In-CRM presentation | Main implementation caveat |
| --- | --- | --- | --- | --- |
| Bitrix24 | OAuth app; `crm.item.list` / `crm.item.fields` for universal CRM objects | REST event subscriptions via `event.bind`; some outgoing webhooks | App page or `placement.bind` iframe in CRM tab/menu | Deal events generally provide an ID, so refetch the record; legacy `crm.*` and universal `crm.item.*` fields differ. |
| Kommo / amoCRM | OAuth 2.0; API v4 entities and custom fields | Webhooks for lead/contact/company/task and other changes | Marketplace widget / Web SDK | Form-encoded hooks and a documented 7 requests/second API limit; API-managed hooks depend on plan. |
| HubSpot | OAuth app; CRM object APIs, search/export as applicable | App webhook subscriptions | React UI extensions: App Cards / App Home | Webhook type and UI surface depend on developer-platform generation; avoid legacy CRM Cards. |
| Pipedrive | OAuth 2.0 for Marketplace apps; REST API | General webhooks v2 or app-specific hooks | App extensions, including JSON/custom UI panels and actions | Shared daily token budget and per-token burst limit; use v2 endpoints when suitable. |
| Salesforce | External Client App/OAuth; REST queries or Bulk API 2.0 query | Change Data Capture via Pub/Sub API | Canvas app or Salesforce-native extension | CDC requires object support, enablement, permissions, and replay handling; bulk jobs are asynchronous. |
| Zoho CRM | OAuth 2.0; v8 REST/COQL/Bulk APIs | Notification API (`/actions/watch`) | Provider-specific extension/widgets need separate validation | Notification channels expire; renew them and reconcile missed changes. |
| Dynamics 365 Sales / Dataverse | Microsoft Entra OAuth; Dataverse Web API | OData change tracking with delta links; optionally Dataverse webhooks | Model-driven custom page / component | Change tracking must be enabled per table; persist opaque delta links and handle invalidation. |
| RetailCRM (candidate) | API v5 with scoped API keys | History APIs for some changes; evaluate object coverage | JavaScript integration module embed points | Order-centric model needs an `Order` entity and metrics separate from deal pipelines. |
| Creatio (candidate) | REST/OData with deployment-specific authentication | Research a supported change feed for each deployment | Marketplace package or UI extension | Configuration and authentication vary by deployment; validate with a target customer. |

## Connection quick reference

What the operator enters and how each provider behaves. Details, endpoints and sources are in the per-provider playbooks under [`connectors/`](connectors/); new playbooks start from [`connectors/_template.md`](connectors/_template.md).

| CRM | Operator enters | Credential | Token lifetime | List page | Rate limit (summary) | Change capture | Playbook |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bitrix24 | Portal host | OAuth app | Access short-lived, refresh via oauth.bitrix.info | 50 | Leaky bucket ~2 rps (5 rps Enterprise), 503 `QUERY_LIMIT_EXCEEDED` | `event.bind`, no retries → reconcile | [bitrix24.md](connectors/bitrix24.md) |
| Kommo / amoCRM | Account subdomain | OAuth integration | Access 24 h, refresh 3 months, rotated | 250 | 7 rps | Webhooks with retries; API registration plan-dependent | [kommo.md](connectors/kommo.md) |
| HubSpot | Nothing (account picker) | OAuth app | Access ~30 min, refresh until revoked | 100 (search: 10k cap) | Per-app burst; search ~5 rps | App webhook subscriptions | [hubspot.md](connectors/hubspot.md) |
| Pipedrive | Nothing (company picker) | OAuth app | Access 60 min, refresh expires after 60 days unused | 500 (cursor) | Daily company budget + burst | Webhooks v2 | [pipedrive.md](connectors/pipedrive.md) |
| Salesforce | Login domain (prod/sandbox/My Domain) | External Client App | Org policy | 2,000 (REST) / Bulk 2.0 | Daily org allocation | CDC via Pub/Sub, 72 h replay | [salesforce.md](connectors/salesforce.md) |
| Zoho CRM | Data center (if needed) | OAuth client | Access 1 h, refresh until revoked (20/user cap) | 200, `page_token` after 2,000 | Credits per edition | Watch channels ≤ 1 week, renew | [zoho.md](connectors/zoho.md) |
| Dynamics 365 | Environment URL | Entra app | Access ~1 h, refresh rotated | Server-driven | Service protection 429 | Change tracking delta links | [dynamics.md](connectors/dynamics.md) |
| RetailCRM | System URL + API key | Scoped API key | Until revoked | 100 | ~10 rps per IP | History API `sinceId` | [retailcrm.md](connectors/retailcrm.md) |

Research for this table was refreshed on 2026-10-02. Vendor documentation sites could not be fetched directly from the research environment, so several facts come from the official pages as indexed by search; the playbooks mark sandbox-unverified behavior explicitly.

## Connector selection rule

Implement only after confirming with a real test account: available plan/API access, permitted read scopes, object coverage, custom fields, deletion behavior, webhook provenance, pagination or bulk limits, and a usable embed point. A connector can launch as standalone-only if its ingestion is sound but its embedded surface is not yet validated.
