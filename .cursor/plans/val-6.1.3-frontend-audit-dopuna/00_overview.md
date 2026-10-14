# Val 6.1.3-dopuna — frontend audit closeout

## Cilj
Primijeniti trajni kriterij zatvaranja iz paketa 6.1, zatvoriti sve nalaze modula 03 i ponovo potvrditi module 01–02 bez oslanjanja na stare audit oznake.

## Scope
- `docs/plans/modules/6.1-frontend-audit-ispravke.md` — politika zatvaranja i statusi 6.1.1–6.1.3.
- `audit/frontend/03-tickets.md` i ticket UI/hook/service/test fajlovi — svaki T1–T26; bez rada na modulu 04+.
- `audit/frontend/01-ljuska-routing-navigacija.md` i `02-auth-i-sesija.md` — konačan status svakog ID-ja, aktuelni dokazi i prihvaćeni rizici.
- `docs/analysis/TASKS.md` — audit closeout je `[x]`; E2E critical flows je sljedeća aktivna `[~]` stavka i nije izvršena.

## Odluke i ograničenja
- Vlasnik je odobrio fazni plan; commit nije tražen i ne pravi se.
- Gap 8 modula 01: ostaje 15 `RequireAccess` blokova; vlasnik je 2026-10-14 prihvatio datirani rizik. B22 screenshot-i postoje, ali su ograničeni na header crop i mock API.
- A2 browser QA nije izvršen zbog nedostupnog Dockera i `e2e/.env`; status je datirani prihvaćeni rizik, nikada „passed“.
- Zadržati A8 MSAL `sessionStorage` (bez `memoryStorage`/deprecated `storeAuthStateInCookie`), A14 fail-open i A15 login split kao datirane prihvaćene rizike. A24 je dokumentacija-only; bez CSP/infra promjena.
- E2E cookie fallback/TODO ostaje do cookie-enabled deployment-a i prolaza specs 37/39.
- T9 nacrti smiju čuvati samo neosjetljive podatke; composer nacrt je per-ticket u `sessionStorage`.
- T19 koristi postojeći backend inbox pagination metadata; nema backend taska.
- Pulse UI; novi stringovi BS+EN. Bez `ticketText`, novih neopravdanih `eslint-disable` ili TODO bez audit/TASKS reference.

## Odobreni redoslijed i ishod
1. **Policy/plan:** §1 sada zahtijeva status svakog audit finding-a; kasniji rad je `Otvoreno` u auditu ili TASKS; moduli 04+ moraju imati „Kriterij zatvaranja (val 6.1+)“ sa svim ID-jima.
2. **Modul 03:** T1–T26 zatvoreni implementacijom ili dokumentovanim istraživačkim zaključkom (T18/T23); paginacija T19 je frontend-only.
3. **Moduli 01–02:** svi B1–B22 i A1–A25 imaju konačan status; prihvaćeni rizici su datirani i obrazloženi.
4. **Closeout:** validacije i audit dokumenti usklađeni; bez tvrdnje da su browser/E2E prošli.

## Konačna validacija (2026-10-14)
- `frontend/`: lint 0 grešaka/12 hook upozorenja; format check; `npx tsc -b`; Vitest 247 fajlova/1000 testova.
- `npm run build` prolazi uz chunk-size warning.
- 11 root produkcijskih CI guardova prolazi; translation guard 572 keys/5 prefixes (bs/en); scripts tests 35/35; `git diff --check` prolazi.
- Browser/E2E suite nije izvršen. B22 mock preview je samo 56px header capture; A2 QA nije izvršen. T25 backend audit-event emission nije verifikovan.
- Nema commita. Branch `arena/91f1c029-help-desk-enterprise`; HEAD `daca898`.
