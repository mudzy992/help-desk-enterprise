# CHECKLIST — quality-e2e-critical-flows

## Faza 1

- [x] Playwright u `e2e/` (sopstveni package.json)
- [x] README lokalni run
- [x] `.env.example` bez pravih secreta
- [x] global-setup: health + install (ako treba) + aktori
- [x] Matrica `quality-e2e-critical-flows`

## Faza 2

- [x] 01 ticket create (katalog, validacija, KB intercept, inbox)
- [x] 02 routing match + unrouted fallback
- [x] 03 approvals approve + reject

## Faza 3

- [x] 04 in-app + EMAIL job + EDGE_EVENT job
- [x] 05 bulk required + preview + rate limit
- [x] 06 confidential hide + break-glass audit

## Faza 4

- [x] 07 SLA timers + pause + overdue badge/filter
- [x] 08 close code + CSAT prompt + KPI
- [x] 09 validate → shadow → activate → rollback
- [ ] Full suite zelen lokalno (zahtijeva live stack; nije pokrenuto u ovom CI okruženju)
- [x] MATRIX + CHANGELOG ažurirani

## Namjerno nije

- [x] Cypress / visual QA framework
- [x] Zamjena Jest/Vitest
- [ ] `[x]` u TASKS.md (korisnik ručno)
- CI unit gate je u `.github/workflows/ci.yml` (R7c); E2E job odvojen (workflow_dispatch / main)
