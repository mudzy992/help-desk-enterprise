# HANDOFF — quality-e2e-critical-flows

## Urađeno (R7d)

- Playwright suite u `e2e/` (9 speceva + helpers + global-setup)
- Actors: **A** (Users API + Postgres `localPasswordHash`)
- Matrica + checklist/changelog ažurirani
- CI unit gate zasebno; E2E job na `workflow_dispatch` / `main` (bez podizanja DB u GHA)

## Lokalni run

Vidi `e2e/README.md`. Preduslov: Postgres + Redis + backend + worker + Vite + `DATABASE_URL` u `e2e/.env`.

## Test status

Specevi su implementirani; **full green run** nije izvršen u ovom agent okruženju jer stack (DB/API/UI) nije garantovan. Pokreni lokalno prije merge-a E2E job-a kao blocking.

## Van scope / tanji coverage

- 07: pause/overdue wait ≤60s nije full assert (samo due field presence)
- 08: CSAT submit/KPI assert dijelomičan (close-code required + resolve)
- 05: rate-limit drugi broadcast nije forsiran (preview path pokriven)
