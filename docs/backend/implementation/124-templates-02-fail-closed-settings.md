# W5.48 — BA-templates-02: fail-closed settings enforcement

- **Status:** implementation is ready for branch CI/Perf; `BA-templates-02` remains open pending its final acceptance evidence.
- **Authorized scope:** only `BA-templates-02`, user-approved 2026-11-04.
- **Branch:** `arena/864951a6-help-desk-enterprise`.
- **Next P1:** `BA-templates-03` — concurrent playbook-definition updates; tracked, not started.

## Finding and acceptance boundary

The pre-fix loader swallowed each settings read error. An installation whose `requiredStepsOnResolve` policy was `block` could therefore resolve/close a ticket as though the mode were `warn`; settings explicitly set to `false` could also fall back to enabled defaults. This package uses the audit-approved **fail-closed** option instead of an in-memory last-known-good cache: on any settings I/O/validation failure, configuration-dependent operations fail with HTTP 503 rather than infer a configuration that was not read.

## Implementation

- `TemplatesConfigurationLoader` awaits all four setting reads and distinguishes read failures from successfully read default/missing values. If any read rejects, it returns no configuration and throws `TEMPLATES_CONFIGURATION_UNAVAILABLE` (503). It does not substitute `warn` or any enabled defaults on that path.
- Ticket status updates load the playbook policy before `updateTicket`; a settings failure therefore rejects resolve/close before any ticket mutation. Bulk status updates use the same loader. Best-effort auto-attach remains best-effort: a settings failure is visible and the playbook is not attached.
- Each failure emits a low-cardinality log metric, `templates_configuration_read_failure_total`, with `policy=fail_closed`. The protected `/ops/health` overview reports a process-local `templatesConfiguration` signal (`ok`/`degraded`, cumulative failures and failure/recovery timestamps); the admin health card marks degraded configuration as a warning. A complete successful read marks recovery and emits a recovery log line.
- No settings values, database error text, user data, or secrets are included in the signal.

## Direct tests

- `backend/src/modules/templates/templates-configuration.loader.spec.ts` covers a failure for each of the four setting keys, explicit disabled flags with `requiredStepsOnResolve='block'`, fail-closed 503 behavior, the metric/health transition, and recovery using the next successful read.
- `backend/src/modules/tickets/tickets.close-codes.spec.ts` verifies a settings failure rejects a ticket resolve and leaves the ticket `IN_PROGRESS`.
- `backend/src/modules/ops-health/ops-health.service.spec.ts` covers the protected health signal; frontend tests cover the warning tile and degraded overall health state in both locale dictionaries.

## Validation status

- Local loader Jest: **5/5 passed**.
- Local targeted frontend Vitest: **20/20 passed** across the ops-health component/view and translation-parity suites. Full frontend Vitest: **432 test files / 1,676 tests passed**; `npm run build` also passed.
- Targeted backend/frontend ESLint, frontend i18n check, and locale JSON parsing: passed. `git diff --check`: passed.
- Local execution of adjacent backend suites/full backend build is limited by the sandbox checkout lacking generated Prisma client artifacts. The loader suite ran directly (5/5), but the ticket close-code spec was compile-blocked before any assertions because the generated PrismaService type lacks the `group` delegate; other Prisma-dependent suites also hit missing `generated/prisma/enums` and delegates. These are not recorded as test passes. CI must generate Prisma and verify the ticket-path and Ops-health suites.
- Branch CI and Perf have not yet run for this implementation checkpoint. No target DB was used, no migration was executed, and no full E2E was manually dispatched.

## Val-5 sequence and closure state

- `BA-templates-01` remains open pending its own final relevant E2E/acceptance evidence.
- `BA-templates-02` is the current authorized package. Its finding status remains **open** until the branch CI/Perf evidence and the scheduled full critical-flow E2E acceptance on the final SHA are reviewed; a green unit test or CI alone does not close it.
- `BA-templates-03` is the next P1 in sequence, but has not started and is not bundled into W5.48.
- `BA-routing-02` and BA-15 full critical-flow acceptance remain independent pending gates.

There is no Prisma schema change, migration, target-database action, deployment, PR, merge, or threshold change in this package.
