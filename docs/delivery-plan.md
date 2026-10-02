# Delivery models and implementation plan

Status: release design proposed on 2026-09-30; prototype checkpoint below reflects code on 2026-10-02. Implemented operator features do not imply customer authentication, production hosting or a verified embedded integration.

## Current prototype checkpoint

| Area | Implemented | Still required for release |
| --- | --- | --- |
| Ingestion foundation | Scoped SQLite records, encrypted credentials/payloads, transactional page checkpoints, persisted jobs, restart recovery and reconciliation ([code architecture](code-architecture.md)) | Production storage/coordination, retention, measured quotas and missed-delete policy |
| Connectors | Bitrix24 and shared Kommo/amoCRM adapter; OAuth, canonical mapping and event handling covered by mocked integration tests | Recorded sandbox evidence per provider/plan; Kommo/amoCRM sandbox verification remains pending ([playbooks](connectors/)) |
| Operator access | Email/password sessions, scoped built-in/custom roles, users and audit ([access control](access-control.md)) | Customer identity model and multi-instance session/throttle design |
| Analytics | Workspace metrics v2: sales, purchases, work by manager, signals and coverage ([definitions](metrics.md)) | Time windows, missing-currency/purchase coverage and verified links below; no historical-stage reconstruction |
| Admin UI | Connection setup/repair, sync status, mappings, analytics, permissions, welcome presentation and guided tour ([onboarding](onboarding.md)) | Validate against real CRM data and record end-to-end sandbox evidence |
| Delivery | Locally runnable standalone operator UI | Customer-facing release, CRM embedding and production operations remain proposed |

Local tests prove our implementation against fixtures. They do not demonstrate a successful installation, plan entitlement, event delivery or API quota in a real CRM. Vendor research dates are separate from sandbox verification dates.

## Two delivery models, one backend

| Model | Customer experience | Technical shape | First-release guidance |
| --- | --- | --- | --- |
| Standalone | Customer connects a CRM and opens our own analytics site. | OAuth install, hosted ingestion/analytics API, independent web UI and user login. | Build this first to validate sync, tenant isolation, and metric definitions. |
| Embedded | Customer opens analytics from a tab, card, sidebar, or menu inside their CRM. | The same backend serves a provider-specific extension shell; launch context maps to the stored connection and a short-lived app session. | Add one provider at a time after its official extension surface and auth handshake are proven in a sandbox. |

Do not assume arbitrary iframes are accepted by every CRM. Bitrix24 has explicit iframe placements ([official widgets guide](https://apidocs.bitrix24.com/api-reference/widgets/index.html)); HubSpot uses current React UI extensions ([developer platform](https://developers.hubspot.com/developer-platform-basics)); Pipedrive has app panels and actions ([extensions guide](https://pipedrive.readme.io/docs/app-extensions)); Salesforce offers Canvas ([current setup guide](https://developer.salesforce.com/docs/platform/canvas-framework/guide/quick-start-intro-create.html)); Dataverse supports model-driven custom pages ([Microsoft guide](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/navigate-to-custom-page-examples)). The embedded shell may call the hosted analytics API and display a compact view or link to the full dashboard. Provider UI code should contain no CRM refresh token.

## Original release sequence

This sequence describes the target release, not a list of wholly unimplemented features. The checkpoint above records what already exists; production decisions remain open.

1. **Foundation:** choose tenant identity, hosting region, database, queue, secret store, retention policy, and metric definitions. Implement connection state and scoped credentials.
2. **First vertical slice:** Bitrix24 OAuth app -> account discovery -> paginated read of deals, contacts, activities, pipelines/stages -> canonical mapping -> a two-axis commercial/work dashboard -> event refetch -> reconciliation. Sales deals are classified as `sale`; purchase processes require an explicit mapping. This is a proposed starting point because Bitrix24 is explicitly in scope and has documented widget placements.
3. **Second connector:** Kommo, including OAuth, form-encoded webhooks, custom fields, and strict API throttling. Validate that the canonical model holds across two different CRM structures.
4. **Standalone release:** harden the implemented operator authentication, tenant administration, sync status, repair and coverage displays; choose customer authentication and prove freshness with real data before making a promise.
5. **First embed:** Bitrix24 CRM tab or app page using the existing analytics API. Verify installation, launch context, session exchange, frame behavior, and navigation in a real test portal.
6. **Expansion:** Pipedrive and HubSpot adapters exist (mock-tested, built from the official SDKs, sandbox pending; HubSpot app-level webhooks still to design). Prioritize sandbox runs for them, then Salesforce, Zoho, and Dataverse based on actual customer demand, API access, cost, and support burden. Research each embedded experience independently.

## Acceptance criteria for the vertical slice

- A customer authorizes one CRM account and sees its verified provider account identity before import.
- Initial import resumes after interruption without duplicate canonical records or skipped pages.
- New and changed records converge after event processing and reconciliation; verified delete events tombstone records, and each full pass tombstones records the CRM no longer returns (directly for complete listings, after a per-record check for paged ones), behind a mass-deletion guard. Records hidden by changed CRM permissions are treated as deleted; prove this policy in a sandbox before production. A disconnected or revoked account visibly changes status.
- Every analytics response is scoped to one tenant and reports data freshness, metric version, source currency, and known coverage limitations.
- The dashboard distinguishes commercial values from activity counts, compares them by responsible person, and labels unclassified or unmapped processes clearly.
- Secrets are absent from browser bundles, API responses, logs, and committed files.
- A sandbox demonstration covers two customer accounts with no cross-account data exposure.
- Embedded launch can be completed without a long-lived CRM credential in browser storage.

## Engineering follow-ups

These gaps were found in the current code, rather than inferred from the target design. They need focused implementation changes; metric choices must be explicit before changing results.

| Priority | Gap and evidence | Completion criteria |
| --- | --- | --- |
| Before a customer pilot | Server sessions slide by 12 hours, but browser cookies are only issued at sign-in ([authentication](access-control.md#authentication)) | Choose fixed or sliding session lifetime; align cookie and storage expiry. Integration tests cover active use, inactivity, password reset and restart, including `Set-Cookie` behavior |
| Before relying on monetary comparisons | Currency-free amounts enter sums; other-currency coverage counts sales only; unassigned purchases have no coverage counter ([metrics](metrics.md#currency)) | Define missing-currency and purchase coverage policy, bump the metric version, update UI/definitions, and test mixed currencies, missing currency and purchases without an owner |
| Before calling activity links verified | `analyticsRows()` counts a stored target id/kind without checking the target record or connection ([metrics](metrics.md#team-metrics)) | Define whether links cover sales, purchases or both; verify tenant + connection + kind + external id against non-deleted targets. Test missing/deleted targets and colliding ids in different connections; update metric version/wording |
| Before promising synchronization completeness | Delete events and missed deletes are handled: full passes run a per-provider deletion check with a mass-deletion guard (decision 31, [code architecture](code-architecture.md#connection-lifecycle)); permission loss looks like deletion; verified only with mocked providers | Prove delete/restore and permission-change behavior in a sandbox run per provider, confirm Kommo returns 404/204 for deleted records, and publish remaining coverage limits |
| Before connecting customer data | Mocked tests are not live-provider evidence ([connector selection](connectors.md#connector-selection-rule)) | Record provider, plan, date and outcome in the playbook: OAuth refresh/revocation, pagination/restart, subscriptions/polling, duplicates, two-account isolation, mappings and throttling; keep credentials and customer data out of evidence |
| Before adding time-based analytics | Metrics currently cover all loaded records; timezone is stored but not used for date windows ([metrics](metrics.md#response-time-and-freshness)) | Confirm reporting windows and date meanings, normalize source timestamps, test timezone boundaries, and separate observed stage history from current snapshots |

## Decisions to confirm

These decisions affect implementation but cannot be inferred from the current repository:

1. Target customers and first CRM market: Bitrix24/Kommo first, or a different provider order?
2. The two-axis analytical goal is confirmed. Which exact metrics and time windows are required for the first release, and do they require historical stage transitions predating installation?
3. Expected tenant size, data retention period, and region where CRM data may be stored.
4. Whether standalone login must use the customer's identity provider or can use our own authentication.
5. Whether marketplace publication is needed immediately or private installations are acceptable during pilot testing.

Until those are answered, the first vertical slice and the storage/queue choices are recommendations, not approved product commitments.
