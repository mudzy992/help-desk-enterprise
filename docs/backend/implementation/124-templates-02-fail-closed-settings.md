# W5.48 — BA-templates-02: fail-closed settings enforcement

- **Status:** branch CI passed; `BA-templates-02` remains open pending its scheduled full critical-flow E2E acceptance. Perf smoke did not run for this package because its active-branch path filter is limited to service-catalog/performance files.
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
- Local execution of adjacent backend suites/full backend build is limited by the sandbox checkout lacking generated Prisma client artifacts. The loader suite ran directly (5/5), but the ticket close-code spec was compile-blocked before any assertions because the generated PrismaService type lacks the `group` delegate; other Prisma-dependent suites also hit missing `generated/prisma/enums` and delegates. These are not recorded as local test passes; the CI evidence below generated Prisma and ran backend full Jest, including the ticket-path and Ops-health suites.
- Branch CI [`41876403874`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41876403874) on code SHA `f1077dc` completed successfully: backend build/full Jest, PostgreSQL+Redis integration, frontend build/full tests, docs guard, and container/supply-chain job passed. Push E2E critical-flow/install jobs were **skipped**, so they are not acceptance evidence.
- Perf smoke did not trigger: `.github/workflows/perf-smoke.yml` path-filters active-branch runs to service-catalog/performance files; W5.48 changes no such path. Latest Perf run [`41850863346`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850863346) passed on earlier SHA `c098ad4`, but is not a W5.48/current-SHA result. No thresholds were changed and no manual Perf dispatch was made.
- No target DB was used, no migration was executed, and no full E2E was manually dispatched.

## Val-5 sequence and closure state

- `BA-templates-01` remains open pending its own final relevant E2E/acceptance evidence.
- `BA-templates-02` is the current authorized package. Its finding status remains **open** until the scheduled full critical-flow E2E acceptance on the current code lineage is reviewed; a green unit test or CI alone does not close it. The push E2E jobs were skipped, and there is no current-SHA Perf run.
- `BA-templates-03` is the next P1 in sequence, but has not started and is not bundled into W5.48.
- `BA-routing-02` and BA-15 full critical-flow acceptance remain independent pending gates.

There is no Prisma schema change, migration, target-database action, deployment, PR, merge, or threshold change in this package.
