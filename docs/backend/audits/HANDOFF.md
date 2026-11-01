# HANDOFF — Help Desk Enterprise

**Datum:** 2026-11-01<br>
**Jezička pravila:** svaka komunikacija i closeout izvještaj korisniku moraju biti isključivo na bosanskom.  
**Svrha:** kontinuitet rada u narednoj Arena sesiji. Sve putanje ispod su relativne putanje unutar repozitorija.

## 1. Nezaobilazna pravila za narednog agenta

1. **Ne otvaraj PR prema `master` bez izričite dozvole korisnika.** Spominjanje „PR cilj `master`“, rad na grani ili ranije otvoren PR nisu dozvola. Prije svakog novog PR-a prema `master` postavi korisniku **tri zasebna pitanja za potvrdu**; sva tri odgovora moraju jasno odobriti baš taj PR. Nejasan odgovor, tišina ili samo jedna/dvije potvrde znače STOP. Dozvola važi samo za tačno navedeni PR i ne prenosi se na buduće PR-ove.
2. Ne mergeuj, ne zatvaraj PR, ne briši granu i ne radi push na `master` bez zasebne izričite dozvole. Prije bilo kakvog završnog GitHub stanja provjeri da su svi željeni fajlovi commitovani i pushovani i da je radno stablo čisto. **Ne dozvoli završetak sesije sa necommitovanim ili nepoguranim radom.**
3. U svakoj sesiji radi samo na Arena automatski kreiranoj grani na kojoj je sesija otvorena. Prvo provjeri `git branch --show-current`, `git status --short` i udaljeni SHA. Ne prebacuj se na drugu granu, ne preimenuj je i ne kreiraj/pushuj drugu granu.
4. Radi fazno i samo na eksplicitno odobrenom paketu/nalazu. Ne zatvaraj susjedne nalaze niti proširuj acceptance bez pitanja. Traži i bilježi CI dokaz za svaki paket.
5. Prije primjene bilo koje migracije provjeri status migracija na **tačnoj ciljnoj bazi**. Ne traži niti prihvataj lozinke/tajne u chatu; target konekcija mora biti podešena kroz sigurno okruženje.
6. Odgovaraj korisniku isključivo na bosanskom i koristi detaljni closeout format iz odjeljka 7.

## 2. Stanje implementacije

### W7.15 / `BA-assets-15` (P2)

W7.15 je implementiran i dokumentovan; zatvoren je samo `BA-assets-15`. Korisnik je odabrao fizički hard-delete samo kada nema poslovnih veza, uz fail-closed blokadu i stabilni HTTP `409` za zavisnosti. `AssetEvent` historija ostaje u arhivi bez Asset FK-a sa originalnim asset ID/tag snapshotom. Historiju obrisanog asseta može čitati samo `SUPER_ADMIN`; demo cleanup ne uklanja poslovne veze.

Ključna implementacija: `AssetsService.remove()` zaključava red i provjerava osam tipova poslovnih veza; PostgreSQL trigger ponavlja blokadu i arhivira evente prije cascadea. Uspješno brisanje zapisuje završni `deleted` event i audit.

**Commiti na grani:**
- Kod: `11f43efd37d448142f6c33f99096555ee8f7419d` — `fix(assets): guard hard deletes and retain event history`.
- Closeout/registar: `c631fc06e9c5309487434123273ca252237a68ae`.
- PR blocker zapis: `0bd5970593da5791efcec9c5e548a0db2e1fdb5d`.
- PR rerun zapis: `f776c387cdfe96af37d9cfe733ed2ba7e516b59b`.

W7.16 je isporučio cursor paginaciju na code SHA `43547a410061cb48c472db4c2ac887cff756f14c`. Na inicijalnom W7.16 checkpointu CI [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) pao je na E2E testu 56 (`/tickets?view=all`, 306 ms prema 250 ms pragu), pa je tada `BA-assets-16` ostao otvoren. Dana 2026-11-01 korisnik je svjesno naložio zatvaranje samo tog nalaza uprkos kasnijem crvenom E2E gateu; ovo je dokumentovani owner acceptance izuzetak, ne green CI rezultat niti waiver za test. Na SHA `6606ce475fd08092dbe863fd714b09ba2d236b77`, run `41317644590` prošao je specs 25/28 8/8, ali keyboard-surfaces test 56 timeoutovao je; run `41325198062` prošao je kodne jobs, ali spec 56 `/services` izmjerio je 292 ms prema 250 ms, pa E2E i gate pali su. Test 56 i prag nisu mijenjani, preskočeni ni oslabljeni; full assets E2E/Perf sign-off nije ostvaren. Potpuni W7.16 dokaz i owner odluka su u `docs/backend/implementation/102-assets-commercial-and-transfer-cursors.md`.

W7.17 / `BA-assets-17` (P3) zatvoren je na SHA `f8fff7e5f651fa2d57f49e03d1950af917514c7e` uz CI gate [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097). Bounded version retry, atomic audit, HTTP 409 i PostgreSQL concurrency test su dokumentovani u `docs/backend/implementation/103-assets-transfer-template-version-retries.md`; CI integration job je prošao, ali suite-specific concurrency log nije dostupan (`EOF`), pa izvršenje nije posebno potvrđeno. Na W7.17 checkpointu `BA-assets-16`, `BA-assets-18` i `BA-assets-19` ostali su otvoreni.

W7.18 / `BA-assets-18` (P3) je zatvoren na finalnom testanom SHA `aae99fc8cf08422a7413ad8d60f6e8a1f5e5f84b`, uz zeleni CI [`41255976886`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41255976886). Closeout je `docs/backend/implementation/104-assets-operations-health-metrics.md`. Dodani su bounded Redis overlap/audit-failure counteri, DB workflow metrike i read-only transfer-file scan; W7.10 scheduler-presence/last-success nisu duplicirani, a BA-assets-19 i susjedni nalazi su izvan scopea. E2E critical/install jobovi su `skipped` po cadence politici, Perf nije pokrenut na pushu. `BA-assets-16` ostaje otvoren prema zasebnom W7.16 closeoutu.

W7.19 / `BA-assets-19` (P3) zatvoren je samo za sebe. Kodni SHA `93f9feb8ada3aef1ce9d8480ce4f96d1472f751a` ima targeted E2E run [`41314175993`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41314175993): specs 23/27/28, **8 passed / 0 failed / 0 flaky / 0 skipped**; workflow run je na `master`, ne na Arena grani. Branch follow-up SHA `3ee7de073639719d5591a399ffbc0f3057668f14` ima zeleni push code CI [`41302730701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41302730701), s E2E critical/install jobovima `skipped`. Closeout je `docs/backend/implementation/105-assets-concurrency-failure-matrix.md`. `BA-assets-16` i susjedni statusi nisu mijenjani.

### PR i korisnička dozvola

PR #11 (`arena/298fb5c9-help-desk-enterprise` → `master`) i jednokratna dozvola za njega pripadaju ranijoj sesiji/grani; ta dozvola je iskorištena i **ne važi** za ovaj branch ili budući PR. Za aktuelnu granu `arena/864951a6-help-desk-enterprise` W7.16–W7.19 nema PR-a. Ne otvarati novi PR prema `master` bez tri zasebna jasna odobrenja korisnika; ne mergeovati, zatvarati niti brisati PR/granu bez zasebne dozvole.

## 3. CI dokaz i nerazriješeni blokatori

**Zeleni push CI:**
- `41067304475` na kodnom SHA `11f43efd37d448142f6c33f99096555ee8f7419d` — backend, PostgreSQL/Redis integration, frontend, docs/container/supply-chain i CI gate prošli.
- `41068758830` na closeout SHA `c631fc06e9c5309487434123273ca252237a68ae` — završni push CI zelen.
- Push CI je preskočio E2E poslove i image high/critical vulnerability enforcement; ne predstavljati ih kao izvršene/prošle.

**W7.16 push CI nije zelen:** run [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) na `43547a410061cb48c472db4c2ac887cff756f14c` pao je samo na E2E critical flows testu 56 (306 ms prema 250 ms); ostali navedeni build/test/integration/frontend/docs/supply-chain poslovi su prošli. E2E install wizard i image high/critical enforcement su `skipped`, ne passed. Perf run [`41227539109`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539109) je passed. Rerun je GitHub odbio; puni pokušaji i dokaz su u `docs/backend/implementation/102-assets-commercial-and-transfer-cursors.md`. Test nije skipovan niti oslabljen.

**W7.17 feature CI gate je zelen:** run [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097) na `f8fff7e5f651fa2d57f49e03d1950af917514c7e` prošao je backend, PostgreSQL/Redis integration job, frontend, docs, container/supply-chain, E2E critical flows i gate. GitHub job metapodaci pokazuju uspješan `Run real PostgreSQL integration suites` korak; međutim, run log preuzimanje vratilo je `EOF` i nema integration artifacta, pa izvršenje baš W7.17 template concurrency suitea nije potvrđeno i ne treba se prijaviti kao passed. E2E install wizard i image high/critical enforcement korak su `skipped`. Perf smoke [`41235280078`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280078) pao je na search/message latency pragovima; GitHub je odbio rerun.

Traceability/closeout commit `451414ae` nije mijenjao product runtime kod, ali CI [`41240229050`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41240229050) pao je na E2E: 111 passed / 3 failed / 6 flaky / 2 skipped; testovi 25, 54 i 56 su uzrokovali neuspjeh, a CI gate je failed. Njegov Perf smoke [`41240228922`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41240228922) pao je na ticket-message latency pragu. Neuspjesi su eksplicitno evidentirani u W7.17 closeoutu; ne prikazivati ih kao passed, ne mijenjati test 56 i ne proširivati W7.17 scope.

Cadence/workflow commit `fc103fa4cc7ccb01e6b0c4f2bbdf6f18c6043feb` ima CI run [`41246096796`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41246096796) s green gateom za backend, PostgreSQL/Redis job, frontend, docs i container/supply-chain. Oba E2E posla su `skipped` po politici; image high/critical enforcement korak je `skipped`; Perf smoke nije pokrenut na pushu. Ovo nije full E2E/Perf pass i ne poništava raniji crveni run `41240229050`.

**W7.18:** CI [`41255976886`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41255976886) na `aae99fc8cf08422a7413ad8d60f6e8a1f5e5f84b` je zelen za backend build/full Jest, PostgreSQL+Redis integration, frontend, docs guard, container/supply-chain job i CI gate. Novi `asset-operations-metrics.integration.spec.ts` je u isolated runneru, a CI job postavlja `REDIS_HOST`; suite-specific raw log preuzimanje vratilo je `EOF`, pa test-count nije zasebno potvrđen iz loga. E2E critical flows/install wizard su `skipped` po cadence politici; image enforcement step je `skipped` jer workflow uslov nije ispunjen. Perf smoke nije pokrenut na pushu. Početni W7.18 run [`41253138945`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41253138945) pao je na namjerno identičnom i18n placeholderu koji nije bio eksplicitno allowlistan; `8db2fea` ga je klasifikovao i očekivani count ažurirao na 187, a finalni gate je zelen.

**W7.19 / BA-assets-19 evidence i širi regression status:** targeted E2E [`41314175993`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41314175993) na `master` SHA `93f9feb8ada3aef1ce9d8480ce4f96d1472f751a` pokrenuo specs `23,27,28`: **8 passed, 0 failed, 0 flaky, 0 skipped**; Detect changes, Docs guard i CI gate su passed, dok su backend/frontend/integration/container poslovi i E2E install wizard `skipped`. Push CI [`41302730701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41302730701) na aktivnoj grani/SHA `3ee7de073639719d5591a399ffbc0f3057668f14` prošao je Detect changes, frontend, backend, PostgreSQL/Redis integration, container/supply-chain job, Docs guard i CI gate; E2E critical/install jobovi i image enforcement step su `skipped`. Stariji full scheduled run [`41283381903`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41283381903) na `master` SHA `24ed17a0a347d0205ef5f0b4496e5830ed2e250e` nije zelen: backend/frontend/integration/docs/container poslovi su passed, E2E critical i CI gate failed, install wizard skipped. U E2E su prijavljeni API/host timeouts, sada korigovana asset metrics semantika i dashboard locator, te test 56 `/services` 359 ms prema 250 ms; posljednje mapira na otvoreni `BA-service-catalog-10` (P2), ali uzročnost pojedinačnog browser long-taska nije potvrđena jer artifacts/logovi `EOF`. Dva flaky testa nisu imenovana. Zaseban Perf smoke nije pokrenut. `BA-assets-19` je zatvoren samo na package CI + ciljanoj E2E osnovi; full E2E/Perf sign-off assets segmenta ostaje nezavršen.

**W7.16 owner-directed status update — 2026-11-01:** korisnik je naložio zatvaranje samo `BA-assets-16`, uz svjesno prihvatanje da globalni E2E gate ostane crven. Targeted run [`41317644590`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41317644590) na `6606ce475fd08092dbe863fd714b09ba2d236b77`: assets specs 25/28 **8/8 passed**, ali E2E suite je 11 passed / 1 failed, jer spec 56 keyboard-surfaces timeoutovao je nakon 90 s; E2E critical flow i gate failed. CI run [`41325198062`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41325198062), isti SHA: backend/frontend, PostgreSQL/Redis, docs, container/supply-chain passed; E2E suite 3 passed / 1 failed / 0 flaky / 0 skipped, spec 56 `/services` **292 ms > 250 ms**, E2E/gate failed, install wizard skipped. Nema claim-a o green E2E gateu; test/threshold su netaknuti, full assets E2E/Perf sign-off i dalje nezavršen. Target DB nije pristupljena, schema/migracija nema; lokalni browser test nije dostupan zbog nedostajućih `e2e/.env` i Docker executable. Potpuno evidentirati kao owner exception u W7.16 closeoutu, bez izmjene susjednih statusa.

**Historijski PR CI W7.15 na ranijoj grani (ne važi kao check za aktuelnu granu):**
- Prvi PR pokušaj: CI `41071433209` pao je na `tests/54-dashboard.spec.ts:17` zbog Playwright strict-mode selectora koji je pronašao dva linka; osnovni backend, PostgreSQL/Redis, frontend i docs poslovi su prošli. Perf `41071433185` imao je prosjek `db_queries_per_request=6.323` prema budžetu `2.1`.
- Ponovni PR pokušaj na SHA `0bd5970593da5791efcec9c5e548a0db2e1fdb5d`: CI `41073878957` prošao je backend build/test, PostgreSQL/Redis, container/supply-chain, docs guard i frontend, ali je E2E `GET /services` pao zbog `UND_ERR_CONNECT_TIMEOUT` prema `api.desk.ba101.top`. Perf `41073878668` prošao je 7/9 pragova; pali su `tickets_list_duration` i `http_req_failed`; query prosjek `6.216` prema budžetu `2.1` preko 3.381 aplikacijskih zahtjeva.
- Posljednji tada poznati tip `f776c38` bio je docs-only i nije imao novi prijavljeni GitHub check. U svakoj sesiji ponovo provjeriti checks na aktuelnom SHA.

Ovi E2E/performance rezultati odnose se samo na raniji W7.15 PR branch i ne predstavljaju checks za aktuelnu granu. Nisu popravljani u W7.15. Za W7.16 finalni gate i W7.17 zatvaranje te odvojeni Perf smoke neuspjeh pogledati [W7.16 closeout](../implementation/102-assets-commercial-and-transfer-cursors.md) i [W7.17 closeout](../implementation/103-assets-transfer-template-version-retries.md).

## 4. CI push grana

Provjereno 2026-11-01: `.github/workflows/ci.yml` `on.push.branches` sadrži samo aktivnu Arena granu `arena/864951a6-help-desk-enterprise`; nema starih Arena grana, `master` ni `main`. `pull_request.branches` nije mijenjan. Pri narednoj sesiji ponovo uporediti allowlist sa `git branch --show-current` i mijenjati ga samo ako je eksplicitno zatraženo; ne pogađati naziv grane niti širiti allowlist.

## 5. Migracije i target baza

Migracija `20271030120000_asset_hard_delete_event_history` je aditivna i odigrana je samo na disposable CI bazi; **nije primijenjena na ciljnu instalaciju**. U ovoj sesiji `DATABASE_URL`, `MIGRATION_DATABASE_URL` i `ASSETS_IT_DATABASE_URL` nisu bili postavljeni, pa target status nije mogao biti provjeren niti je migracija primijenjena. Korisnik je ranije potvrdio uspješnu primjenu W7.14 migracije `20271030110000_asset_transfer_retention_lifecycle`; nikada je ne ponavljati.

Za W7.15: kad korisnik obezbijedi tačan target kroz sigurno okruženje, prvo izvršiti `prisma migrate status` nad tom bazom. Samo ako je W7.14 već uspješno primijenjena, a W7.15 migracija pending, primijeniti W7.15 preko `npm run db:migrate:release` sa pravilno postavljenim migration/runtime credentials i single-owner lockom. Ne primjenjivati na nepoznatu bazu i ne tražiti tajne u chatu.

## 6. Registar nalaza

- W7.15 zatvorio je samo `BA-assets-15`; W7.16 je zatvoren 2026-11-01 isključivo izričitom korisničkom acceptance odlukom uz crveni globalni E2E gate; W7.17, W7.18 i W7.19 zatvorili su samo svoje pojedinačne nalaze. Ostali asset statusi nisu promijenjeni.
- Trenutni deklarisani zbir: **570 otvorenih / 122 zatvorena / 692 ukupno**.
- Machine-readable plan: **573 otvorena / 108 zatvorenih / 11 historijskih / 692 ukupno**. „11 historijskih“ su zapisi `BA-audit-log-01`–`BA-audit-log-11` sa statusima `završen (W3.x)` iz ranijih W3 workstreamova; nisu novi zatvoreni nalazi Vala 7. Preegzistentna razlika od tri statusa ostaje netaknuta.
- Aktuelni scope je samo `BA-service-catalog-10` (P2) iz audita 15. Faza 0 je počela kao read-only triage/profiling; product code/test changes još nema. `BA-service-onboarding-20` nije scope.

## 7. Način rada i obavezni format odgovora

Za svaki paket:
1. potvrditi tačan BA nalaz, acceptance, granice scope-a i branch/PR pravila;
2. implementirati samo odobreni paket, dodati ciljane unit/integration tests i migration policy provjeru ako ima migracije;
3. pokrenuti lokalne provjere; navesti prepreke iskreno;
4. commitovati i pushovati samo na trenutno otvorenu Arena granu;
5. pratiti CI za pravi SHA i prijaviti i zelene i preskočene/pale provjere; ne preimenovati „skipped“ u „passed“;
6. tek uz potreban dokaz ažurirati registry/closeout i navesti status migracije/target baze.

### CI cadence za W7 / assets segment

Za package-level promjene koristiti ciljane E2E `specs` preko `workflow_dispatch`; ne pokretati kompletan E2E critical flow niti Perf smoke za svaki paket. Kompletan E2E critical flow i Perf smoke ostaju zaseban segment-closeout gate za assets segment, iako su pojedinačni nalazi zatvoreni. Na pushu su backend/frontend/integration i drugi relevantni kodni gateovi i dalje dio CI-ja. `.github/workflows/ci.yml` je podešen da ne pokreće skupi E2E na svakom pushu; E2E ostaje PR smoke, noćni full run i ručni targeted/full dispatch. `.github/workflows/perf-smoke.yml` nema push trigger; Perf ostaje na PR-u i ručnom segment-closeout dispatchu. Izvještavati `skipped`, `not run` i neuspjele rezultate odvojeno; test 56 se ne mijenja/ne preskače. W7.19 je zatvoren na targeted E2E + package CI osnovi; full run `41283381903` je ne-zelen, a zaseban Perf smoke nije pokrenut. `BA-assets-16` je kasnije zatvoren po izričitoj owner acceptance iznimci, ali crveni E2E dokaz ostaje i full segment sign-off nije završen. Ne prikazivati full segment sign-off kao završen.

Svaki detaljni closeout odgovor mora sadržavati: **paket/nalaz; implementaciju; testove; commit i CI SHA/run linkove; PR stanje; registry brojeve; migraciju/rollout; nerazriješene blokatore; sljedeći paket i uslove za početak.**

## 8. Repo-relative orijentiri

- CI workflow: `.github/workflows/ci.yml`
- Perf workflow: `.github/workflows/perf-smoke.yml`
- Findings register: `docs/backend/BACKEND-FINDINGS-REGISTER.md`
- Machine-readable plan: `docs/backend/backend-findings-plan.json`
- Asset audit: `docs/backend/audits/22-assets.md`
- W7.15 closeout: `docs/backend/implementation/101-assets-hard-delete-event-history.md`
- W7.16 closeout/run evidence: `docs/backend/implementation/102-assets-commercial-and-transfer-cursors.md`
- W7.17 closeout/run evidence: `docs/backend/implementation/103-assets-transfer-template-version-retries.md`
- W7.18 closeout/run evidence: `docs/backend/implementation/104-assets-operations-health-metrics.md`
- W7.19 closeout/run evidence: `docs/backend/implementation/105-assets-concurrency-failure-matrix.md`
- W7.15 migration: `backend/prisma/migrations/20271030120000_asset_hard_delete_event_history/`
- Single-owner migrator: `backend/scripts/run-release-migrations.mjs`
- Runtime migration sentinel: `backend/src/common/database/database-runtime-contract.ts`
