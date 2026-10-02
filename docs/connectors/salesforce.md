# Salesforce connector playbook

Status: **planned**. Research date: 2026-10-02 (via search; direct fetch was blocked).

## Operator setup
1. Once per service: create an External Client App (preferred for new integrations) or Connected App with the OAuth web-server flow, callback `${APP_ORIGIN}/oauth/salesforce/callback`, scopes `api` and `refresh_token`.
2. Per customer: choose production or sandbox login (`login.salesforce.com` / `test.salesforce.com`) or a My Domain; authorize as an integration user with read access to Opportunity, Account, Contact, Task, Event, User.
3. Customer admin enables Change Data Capture for the needed objects (Setup → Change Data Capture).

## Authorization
- OAuth 2.0 web server flow; the token response includes `instance_url`, which is the base URL for all API calls ([refresh token flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_refresh_token_flow.htm&language=en_US&type=5)).
- Refresh token lifetime is governed by the org's app policy (it can be "valid until revoked", time-boxed, or rotated). Treat `invalid_grant` as revocation.
- Account identity: the org ID (from the identity URL in the token response).

## Data we read
| Canonical entity | Axis | Source | Pagination | Notes |
| --- | --- | --- | --- | --- |
| Pipeline, Stage | context | `OpportunityStage` (+ sales processes / record types) | SOQL | `IsWon`, `IsClosed` flags give outcome semantics. |
| CommercialItem | commercial | `Opportunity` | REST query `nextRecordsUrl`; Bulk API 2.0 for large backfills ([Bulk 2.0 query](https://developer.salesforce.com/docs/platform/api-asynch/guide/query-bulk-api-2-0.html)) | `Amount`, `CurrencyIsoCode` (multi-currency orgs only), `OwnerId`, `StageName`. |
| Activity | work | `Task` (calls via `TaskSubtype = 'Call'`), `Event` (meetings) | same | `WhatId` links to Opportunity/Account. |
| Stage history | — | `OpportunityHistory` / field history | same | Real transitions if the org keeps them. |
| Users | context | `User` | same | |

Incremental scans use `SystemModstamp > :watermark` with an overlap window.

## Incremental sync and change capture
Change Data Capture covers create/update/delete/undelete for supported objects; subscribe via Pub/Sub API and persist the last processed Replay ID. Events are retained for 72 hours — after a longer outage, run a `SystemModstamp` reconciliation ([durability](https://developer.salesforce.com/docs/platform/pub-sub-api/guide/event-message-durability.html), [subscribe](https://developer.salesforce.com/docs/platform/change-data-capture/guide/cdc-subscribe.html), [allocations](https://developer.salesforce.com/docs/platform/change-data-capture/guide/cdc-allocations.html)).

## Limits and failure handling
Daily API request allocation per org (edition-dependent) and CDC delivery allocations. Prefer Bulk API 2.0 for backfill to save request quota.

## Embedded surface
Canvas app ([Canvas quick start](https://developer.salesforce.com/docs/platform/canvas-framework/guide/quick-start-intro-create.html)) or a native Lightning component calling our API.

## Pitfalls
- `CurrencyIsoCode` exists only in multi-currency orgs; dated exchange rates may apply.
- Pub/Sub API is gRPC: the adapter needs a long-lived subscriber process, unlike the HTTP webhook adapters.

## Sources
Linked inline.
