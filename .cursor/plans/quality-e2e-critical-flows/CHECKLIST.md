# CHECKLIST — quality-e2e-critical-flows

## Faza 1

- [ ] Playwright u `e2e/` (sopstveni package.json)
- [ ] README lokalni run
- [ ] `.env.example` bez pravih secreta
- [ ] global-setup: health + install (ako treba) + aktori
- [ ] Matrica `quality-e2e-critical-flows`

## Faza 2

- [ ] 01 ticket create (katalog, validacija, KB intercept, inbox)
- [ ] 02 routing match + unrouted fallback
- [ ] 03 approvals approve + reject

## Faza 3

- [ ] 04 in-app + EMAIL job + EDGE_EVENT job
- [ ] 05 bulk required + preview + rate limit
- [ ] 06 confidential hide + break-glass audit

## Faza 4

- [ ] 07 SLA timers + pause + overdue badge/filter
- [ ] 08 close code + CSAT prompt + KPI
- [ ] 09 validate → shadow → activate → rollback
- [ ] Full suite zelen lokalno
- [ ] MATRIX + CHANGELOG ažurirani

## Namjerno nije

- [ ] `.github/workflows/` (F9-4)
- [ ] Cypress / visual QA framework
- [ ] Zamjena Jest/Vitest
- [ ] `[x]` u TASKS.md (korisnik ručno)
