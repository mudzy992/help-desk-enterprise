# MATRIX — quality-e2e-critical-flows

## Goal

Playwright coverage for 9 RAW acceptance flows without mocking business APIs.

## Flows → specs

| # | Flow | Spec |
|---|---|---|
| 1 | Ticket create | `e2e/tests/01-ticket-create.spec.ts` |
| 2 | Routing / fallback | `e2e/tests/02-routing-fallback.spec.ts` |
| 3 | Approvals | `e2e/tests/03-approvals.spec.ts` |
| 4 | Realtime / queue | `e2e/tests/04-realtime-notifications.spec.ts` |
| 5 | Bulk broadcast | `e2e/tests/05-bulk-broadcast.spec.ts` |
| 6 | Confidential | `e2e/tests/06-confidential.spec.ts` |
| 7 | SLA | `e2e/tests/07-sla.spec.ts` |
| 8 | Close codes + CSAT | `e2e/tests/08-close-codes-csat.spec.ts` |
| 9 | Config ops | `e2e/tests/09-config-ops.spec.ts` |

## Actors

- SuperAdmin from install / env
- USER + AGENT provisioned (decision A) via Users API + Postgres password hash

## Not in scope

- Visual regression, Cypress, replacing Jest/Vitest
- Starting Postgres/Redis inside GitHub-hosted runners (Coolify contract)
