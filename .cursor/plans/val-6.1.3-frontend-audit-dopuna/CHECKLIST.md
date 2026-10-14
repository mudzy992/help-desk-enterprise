# Checklist — 6.1.3-dopuna

## Plan/policy
- [x] Vlasnik odobrio fazni plan.
- [x] `docs/analysis/TASKS.md` active marker privremeno prebačen na audit, zatim vraćen na E2E.
- [x] §1 zatvaranje ažurirano za sve nalaze, prihvaćene rizike, istraživačke zaključke i module 04+.
- [x] Plan-pack i status tabele usklađeni nakon implementacije.

## Modul 03
- [x] T1–T4 statusi/evidence provjereni.
- [x] T5/T6 podjele uz stabilne javne API-je i smoke/regression testove.
- [x] T7/T8/T10/T20/T26 imaju regresionu pokrivenost.
- [x] T9/T11/T12/T13/T14/T15/T16/T17/T19/T21/T22/T24/T25 implementirani/provjereni i testirani.
- [x] T18 i T23 imaju eksplicitne istraživačke zaključke; browser profiler nije proglašen izvršenim.
- [x] Audit status T1–T26 popunjen; modul 03 zatvoren.

## Moduli 01–02
- [x] B1–B22 i A1–A25 imaju aktuelan konačni status.
- [x] Gap 8 datirano, obrazloženo prihvaćen kao rizik; 15 `RequireAccess` blokova nisu refaktorisani.
- [x] B22 screenshot-i postoje u `audit/frontend/assets/`; mjerenja i ograničenja mock run-a dokumentovani.
- [x] A2 browser QA datirano prihvaćena kao neizvršen rizik; nije proglašena prošlom.
- [x] A8/A14/A15 odluke i razlozi dokumentovani; A24 je documentation-only bez CSP/infra promjena.
- [x] E2E cookie fallback/TODO ostaje otvoren do cookie-enabled deployment + specs 37/39.

## Validacija
- [x] `npm run lint` — 0 grešaka, 12 `react-hooks/exhaustive-deps` upozorenja.
- [x] `npm run format:check`.
- [x] `npx tsc -b`.
- [x] Vitest: 247 fajlova, 1000/1000; uključuje ticket/auth suite.
- [x] Ticket translation + svih 11 produkcijskih CI guardova; `node --test scripts/*.test.mjs` 35/35.
- [x] `npm run build` (Vite chunk-size warning zabilježen); `git diff --check`.
- [x] Bez commita bez izričitog zahtjeva vlasnika.
