# W5.49 — `BA-templates-03` playbook definition concurrency

- **Date:** 2026-11-04
- **Branch:** `arena/864951a6-help-desk-enterprise`
- **Scope:** `BA-templates-03` only — stale/concurrent playbook definition updates.
- **State:** code and tests added; awaiting branch CI/PostgreSQL integration and the Val-5 acceptance gate. The finding remains open.

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

## Acceptance and boundary

- `BA-templates-03` stays open until required CI and the scheduled relevant E2E/final Val-5 acceptance are reviewed on the current code lineage.
- `BA-templates-01`, `BA-templates-02`, `BA-templates-04` onward, routing findings, and BA-15 acceptance remain independent.
- No target database, migration, deployment, PR, merge, Perf-threshold change, or manual E2E dispatch was performed.
- Playbook update clients must send the loaded `expectedUpdatedAt`; the current frontend editor does so. The server rejects a missing revision rather than silently reverting to last-write-wins.
