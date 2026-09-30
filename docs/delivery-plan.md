# Delivery models and implementation plan

Status: proposed, 2026-09-30.

## Two delivery models, one backend

| Model | Customer experience | Technical shape | First-release guidance |
| --- | --- | --- | --- |
| Standalone | Customer connects a CRM and opens our own analytics site. | OAuth install, hosted ingestion/analytics API, independent web UI and user login. | Build this first to validate sync, tenant isolation, and metric definitions. |
| Embedded | Customer opens analytics from a tab, card, sidebar, or menu inside their CRM. | The same backend serves a provider-specific extension shell; launch context maps to the stored connection and a short-lived app session. | Add one provider at a time after its official extension surface and auth handshake are proven in a sandbox. |

Do not assume arbitrary iframes are accepted by every CRM. Bitrix24 has explicit iframe placements ([official widgets guide](https://apidocs.bitrix24.com/api-reference/widgets/index.html)); HubSpot uses current React UI extensions ([developer platform](https://developers.hubspot.com/developer-platform-basics)); Pipedrive has app panels and actions ([extensions guide](https://pipedrive.readme.io/docs/app-extensions)); Salesforce offers Canvas ([current setup guide](https://developer.salesforce.com/docs/platform/canvas-framework/guide/quick-start-intro-create.html)); Dataverse supports model-driven custom pages ([Microsoft guide](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/navigate-to-custom-page-examples)). The embedded shell may call the hosted analytics API and display a compact view or link to the full dashboard. Provider UI code should contain no CRM refresh token.

## Suggested build sequence

1. **Foundation:** choose tenant identity, hosting region, database, queue, secret store, retention policy, and metric definitions. Implement connection state and scoped credentials.
2. **First vertical slice:** Bitrix24 OAuth app -> account discovery -> paginated read of deals, contacts, activities, pipelines/stages -> canonical mapping -> a two-axis commercial/work dashboard -> event refetch -> reconciliation. Sales deals are classified as `sale`; purchase processes require an explicit mapping. This is a proposed starting point because Bitrix24 is explicitly in scope and has documented widget placements.
3. **Second connector:** Kommo, including OAuth, form-encoded webhooks, custom fields, and strict API throttling. Validate that the canonical model holds across two different CRM structures.
4. **Standalone release:** add user authentication, tenant administration, per-object sync status, connection repair, and metric coverage displays. Only then promise analytics freshness.
5. **First embed:** Bitrix24 CRM tab or app page using the existing analytics API. Verify installation, launch context, session exchange, frame behavior, and navigation in a real test portal.
6. **Expansion:** prioritize HubSpot, Pipedrive, Salesforce, Zoho, and Dataverse based on actual customer demand, API access, cost, and support burden. Research each embedded experience independently.

## Acceptance criteria for the vertical slice

- A customer authorizes one CRM account and sees its verified provider account identity before import.
- Initial import resumes after interruption without duplicate canonical records or skipped pages.
- New and changed records converge after event processing and reconciliation; verified delete events tombstone records. Before production, choose and prove a policy for missed delete events versus changed CRM permissions. A disconnected or revoked account visibly changes status.
- Every analytics response is scoped to one tenant and reports data freshness, metric version, source currency, and known coverage limitations.
- The dashboard distinguishes commercial values from activity counts, compares them by responsible person, and labels unclassified or unmapped processes clearly.
- Secrets are absent from browser bundles, API responses, logs, and committed files.
- A sandbox demonstration covers two customer accounts with no cross-account data exposure.
- Embedded launch can be completed without a long-lived CRM credential in browser storage.

## Decisions to confirm

These decisions affect implementation but cannot be inferred from the current repository:

1. Target customers and first CRM market: Bitrix24/Kommo first, or a different provider order?
2. The two-axis analytical goal is confirmed. Which exact metrics and time windows are required for the first release, and do they require historical stage transitions predating installation?
3. Expected tenant size, data retention period, and region where CRM data may be stored.
4. Whether standalone login must use the customer's identity provider or can use our own authentication.
5. Whether marketplace publication is needed immediately or private installations are acceptable during pilot testing.

Until those are answered, the first vertical slice and the storage/queue choices are recommendations, not approved product commitments.
