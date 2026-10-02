# <Provider> connector playbook

Status: planned | in development | available. Research date: YYYY-MM-DD. Every API claim links to official documentation; anything not yet observed in a sandbox is marked **unverified**.

## Operator setup (what the admin UI asks for)
Numbered steps an operator performs once per service and once per customer account. Mirror them in `ProviderInfo.setupSteps`.

## Authorization
Flow, endpoints, token lifetimes, refresh rules, account identity returned, how to detect revocation.

## Data we read
| Canonical entity | Axis | Source object / endpoint | Pagination | Notes |

## Incremental sync and change capture
Event source, payload completeness, delivery/retry guarantees, ordering, replay/cursor persistence, reconciliation strategy, delete detection.

## Limits and failure handling
Rate limits, page sizes, error codes that mean auth failure vs. retryable failure.

## Embedded surface
Supported extension points and what must be proven in a sandbox.

## Pitfalls
Provider-specific traps that would corrupt metrics or tenant isolation.

## Sources
