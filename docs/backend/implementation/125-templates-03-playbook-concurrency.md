# W5.49 — `BA-templates-03` playbook definition concurrency

- **Date:** 2026-11-04
- **Branch:** `arena/864951a6-help-desk-enterprise`
- **Scope:** `BA-templates-03` only — stale/concurrent playbook definition updates.
- **State:** code, direct tests, isolated PostgreSQL race test, push CI and Perf passed; `BA-templates-03` was subsequently closed per explicit owner-directed instruction together with 01/02. E2E 16 remained skipped, so full Val-5 acceptance is still pending.

## Change

- The playbook editor sends the `updatedAt` value from its loaded definition as `expectedUpdatedAt` on `PUT /playbooks/:playbookId`.
- The service returns `PLAYBOOK_PRECONDITION_REQUIRED` when the revision is missing and `PLAYBOOK_VERSION_CONFLICT` (HTTP 409) for a stale revision.
- Within the existing transaction, the first write is a conditional `playbook.updateMany` matching `id`, `deletedAt: null`, and the exact loaded `updatedAt`. It advances `updatedAt` monotonically and increments checklist `version` only when step content changes.
- A losing compare-and-set throws before touching scope joins, steps, or audit. The winner replaces scope joins and steps, reads the resulting definition, and records its before/after audit in that same transaction. Any later failure rolls back the entire replacement.
- The editor preserves unsaved form values on conflict, displays a Bosnian/English explanation, and disables another save with the stale token.

The existing `version` meaning is intentionally preserved: it describes the checklist snapshot, not metadata/scope edits. `updatedAt` is the concurrency revision for the complete definition. No Prisma schema or migration is needed.

## Tests added

- Direct service tests cover required and stale preconditions, HTTP 400/409 mapping, one conditional claim, conditional step-version increment, and a failed CAS with no scope/step/audit writes.
- `playbook-definition-concurrency.integration.spec.ts` is registered in the isolated PostgreSQL CI runner. A transaction-entry barrier ensures both administrators load and validate the same revision before either CAS begins; they submit different names, scopes, and steps. Acceptance requires exactly one success, one conflict from the CAS, one audit, and a final definition matching only the winner.

## Validation recorded before push

- Frontend Vitest: **432 files / 1,676 tests passed**; the newly added playbook-error mapping test then passed separately (**1/1**).
- Frontend production build: passed.
- Targeted frontend/backend ESLint, frontend i18n parity, frontend formatting, and `git diff --check`: passed.
- Backend isolated-integration harness: **6/6 passed**, including BA-templates-03 shard registration.
- Backend service Jest and the PostgreSQL race spec have **not** been run locally. The backend suite was previously compile-blocked by this checkout's generated Prisma types (`TS2339`, missing `group` in unrelated `routing.service.ts`); the real race test is reserved for the disposable PostgreSQL CI harness under the no-local-DB/migration constraint. They are intended for push-triggered generated-Prisma/PostgreSQL CI; no manual full CI/E2E dispatch is made during Val 5.

## Push-triggered CI and Perf

- Branch CI [`41886832531`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832531) on `d9839433a9c43bb9e3fce2eb55c0868595948d0b` passed the generated-Prisma backend build/tests, PostgreSQL+Redis integration job, frontend build/tests, docs guard, and container/supply-chain job. The BA-templates-03 concurrency spec is registered in that integration harness. E2E install-wizard and critical-flow jobs were **skipped**, so this run is not the final E2E acceptance.
- Perf smoke [`41886832553`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832553) on the same SHA passed the configured k6 thresholds. The query-budget summary was average **1.926** queries/request over **50,503** requests, p95 **2**, maximum **34**, against the unchanged gate of **2.1**. No Perf thresholds were modified.
- Both runs were push-triggered; no manual full CI or E2E workflow was dispatched.

## Acceptance and boundary

- At the W5.49 checkpoint, `BA-templates-03` remained open pending scheduled E2E/final Val-5 acceptance. This historical status was superseded by the owner-directed 2026-11-04 closeout below.
- `BA-templates-01/02` were independent of W5.49 at that checkpoint; both were later closed together with 03. `BA-templates-04` onward, routing findings, and BA-15 acceptance remain separate.
- No target database, migration, deployment, PR, merge, Perf-threshold change, or manual E2E dispatch was performed in W5.49.
- Playbook update clients must send the loaded `expectedUpdatedAt`; the current frontend editor does so. The server rejects a missing revision rather than silently reverting to last-write-wins.


## Subsequent owner-directed closeout (2026-11-04)

Po izričitoj korisničkoj uputi `BA-templates-03` je zatvoren zajedno s `BA-templates-01/02`. W5.49 CI [`41886832531`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832531) na `d983943` i Perf [`41886832553`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832553) prošli su; registrovani PostgreSQL dual-writer integration suite bio je dio CI integration joba. Noviji zajednički CI [`41915186268`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41915186268) i Perf [`41915186314`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41915186314) prošli su na `70f52e4b`. E2E install/critical-flow poslovi su bili `skipped`, a run `41916949315` na ranijem `a625446c` nije pokretao templates E2E 16. Status je owner-directed zatvoren, uz izričito pending templates E2E 16/finalni Val-5 acceptance; nema tvrdnje o E2E sign-offu.
