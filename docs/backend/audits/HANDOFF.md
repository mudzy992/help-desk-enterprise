# HANDOFF — Help Desk Enterprise

**Datum:** 2026-10-31<br>
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

W7.16 je isporučio cursor paginaciju na SHA `43547a410061cb48c472db4c2ac887cff756f14c`, ali `BA-assets-16` ostaje otvoren jer CI [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) pao je na E2E testu 56 (`/tickets?view=all`, 306 ms prema 250 ms pragu). Test nije mijenjan, preskočen niti oslabljen. Korisnik je izričito odobrio početak W7.17 uprkos tom gateu; ovo je samo sekvencijska iznimka, ne zelen CI rezultat. W7.16 closeout je `docs/backend/implementation/102-assets-commercial-and-transfer-cursors.md`.

W7.17 / `BA-assets-17` (P3) zatvoren je na SHA `f8fff7e5f651fa2d57f49e03d1950af917514c7e` uz CI gate [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097). Bounded version retry, atomic audit, HTTP 409 i PostgreSQL concurrency test su dokumentovani u `docs/backend/implementation/103-assets-transfer-template-version-retries.md`; CI integration job je prošao, ali suite-specific concurrency log nije dostupan (`EOF`), pa izvršenje nije posebno potvrđeno. `BA-assets-16` ostaje otvoren prema zasebnom W7.16 closeoutu; `BA-assets-18`–`BA-assets-19` ostaju otvoreni i nisu odobreni za naredni rad.

### PR i korisnička dozvola

PR #11 (`arena/298fb5c9-help-desk-enterprise` → `master`) i jednokratna dozvola za njega pripadaju ranijoj sesiji/grani; ta dozvola je iskorištena i **ne važi** za ovaj branch ili budući PR. Za aktuelnu granu `arena/864951a6-help-desk-enterprise` W7.16/W7.17 nije otvoren PR. Ne otvarati novi PR prema `master` bez tri zasebna jasna odobrenja korisnika; ne mergeovati, zatvarati niti brisati PR/granu bez zasebne dozvole.

## 3. CI dokaz i nerazriješeni blokatori

**Zeleni push CI:**
- `41067304475` na kodnom SHA `11f43efd37d448142f6c33f99096555ee8f7419d` — backend, PostgreSQL/Redis integration, frontend, docs/container/supply-chain i CI gate prošli.
- `41068758830` na closeout SHA `c631fc06e9c5309487434123273ca252237a68ae` — završni push CI zelen.
- Push CI je preskočio E2E poslove i image high/critical vulnerability enforcement; ne predstavljati ih kao izvršene/prošle.

**W7.16 push CI nije zelen:** run [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) na `43547a410061cb48c472db4c2ac887cff756f14c` pao je samo na E2E critical flows testu 56 (306 ms prema 250 ms); ostali navedeni build/test/integration/frontend/docs/supply-chain poslovi su prošli. E2E install wizard i image high/critical enforcement su `skipped`, ne passed. Perf run [`41227539109`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539109) je passed. Rerun je GitHub odbio; puni pokušaji i dokaz su u `docs/backend/implementation/102-assets-commercial-and-transfer-cursors.md`. Test nije skipovan niti oslabljen.

**W7.17 feature CI gate je zelen:** run [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097) na `f8fff7e5f651fa2d57f49e03d1950af917514c7e` prošao je backend, PostgreSQL/Redis integration job, frontend, docs, container/supply-chain, E2E critical flows i gate. GitHub job metapodaci pokazuju uspješan `Run real PostgreSQL integration suites` korak; međutim, run log preuzimanje vratilo je `EOF` i nema integration artifacta, pa izvršenje baš W7.17 template concurrency suitea nije potvrđeno i ne treba se prijaviti kao passed. E2E install wizard i image high/critical enforcement korak su `skipped`. Perf smoke [`41235280078`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280078) pao je na search/message latency pragovima; GitHub je odbio rerun.

Traceability/closeout commit `451414ae` nije mijenjao product runtime kod, ali CI [`41240229050`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41240229050) pao je na E2E: 111 passed / 3 failed / 6 flaky / 2 skipped; testovi 25, 54 i 56 su uzrokovali neuspjeh, a CI gate je failed. Njegov Perf smoke [`41240228922`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41240228922) pao je na ticket-message latency pragu. Neuspjesi su eksplicitno evidentirani u W7.17 closeoutu; ne prikazivati ih kao passed, ne mijenjati test 56 i ne proširivati W7.17 scope.

**Historijski PR CI W7.15 na ranijoj grani (ne važi kao check za aktuelnu granu):**
- Prvi PR pokušaj: CI `41071433209` pao je na `tests/54-dashboard.spec.ts:17` zbog Playwright strict-mode selectora koji je pronašao dva linka; osnovni backend, PostgreSQL/Redis, frontend i docs poslovi su prošli. Perf `41071433185` imao je prosjek `db_queries_per_request=6.323` prema budžetu `2.1`.
- Ponovni PR pokušaj na SHA `0bd5970593da5791efcec9c5e548a0db2e1fdb5d`: CI `41073878957` prošao je backend build/test, PostgreSQL/Redis, container/supply-chain, docs guard i frontend, ali je E2E `GET /services` pao zbog `UND_ERR_CONNECT_TIMEOUT` prema `api.desk.ba101.top`. Perf `41073878668` prošao je 7/9 pragova; pali su `tickets_list_duration` i `http_req_failed`; query prosjek `6.216` prema budžetu `2.1` preko 3.381 aplikacijskih zahtjeva.
- Posljednji tada poznati tip `f776c38` bio je docs-only i nije imao novi prijavljeni GitHub check. U svakoj sesiji ponovo provjeriti checks na aktuelnom SHA.

Ovi E2E/performance rezultati odnose se samo na raniji W7.15 PR branch i ne predstavljaju checks za aktuelnu granu. Nisu popravljani u W7.15. Za W7.16 finalni gate i W7.17 zatvaranje te odvojeni Perf smoke neuspjeh pogledati [W7.16 closeout](../implementation/102-assets-commercial-and-transfer-cursors.md) i [W7.17 closeout](../implementation/103-assets-transfer-template-version-retries.md).

## 4. Obavezna promjena CI grane u narednoj sesiji

Korisnik je izričito zatražio da naredni agent promijeni `.github/workflows/ci.yml`: u `on.push.branches` treba ostati **samo tačan naziv nove Arena grane koja je automatski otvorena za narednu sesiju**. Naziv se ne smije pogađati — pročitati ga iz `git branch --show-current` nakon što se sesija otvori. Ukloniti trenutnu `arena/298fb5c9-help-desk-enterprise` i stare Arena grane iz push allowlista; ne dodavati `master`, `main` ni druge grane. Ne mijenjati `pull_request.branches` bez zasebnog naloga. Nakon promjene provjeriti workflow/CI konfiguraciju i dokazati da push trigger cilja samo tu novu granu.

## 5. Migracije i target baza

Migracija `20271030120000_asset_hard_delete_event_history` je aditivna i odigrana je samo na disposable CI bazi; **nije primijenjena na ciljnu instalaciju**. U ovoj sesiji `DATABASE_URL`, `MIGRATION_DATABASE_URL` i `ASSETS_IT_DATABASE_URL` nisu bili postavljeni, pa target status nije mogao biti provjeren niti je migracija primijenjena. Korisnik je ranije potvrdio uspješnu primjenu W7.14 migracije `20271030110000_asset_transfer_retention_lifecycle`; nikada je ne ponavljati.

Za W7.15: kad korisnik obezbijedi tačan target kroz sigurno okruženje, prvo izvršiti `prisma migrate status` nad tom bazom. Samo ako je W7.14 već uspješno primijenjena, a W7.15 migracija pending, primijeniti W7.15 preko `npm run db:migrate:release` sa pravilno postavljenim migration/runtime credentials i single-owner lockom. Ne primjenjivati na nepoznatu bazu i ne tražiti tajne u chatu.

## 6. Registar nalaza

- W7.15 je zatvorio samo `BA-assets-15`. W7.16 je implementiran, ali `BA-assets-16` ostaje otvoren prema svom finalnom ne-zelenom CI closeoutu; W7.17 zatvorio je samo `BA-assets-17` uz feature CI gate `41235280097`; W7.17 concurrency suite-specific log nije potvrđen zbog `EOF`; `BA-assets-18`–`BA-assets-19` ostaju otvoreni.
- Deklarisani zbir registra nakon W7.17: 573 otvorena / 119 zatvorenih / 692 ukupno.
- Machine-readable plan nakon zatvaranja samo `BA-assets-17`: 576 otvorenih / 105 zatvorenih / 11 historijskih / 692 ukupno. „11 historijskih“ su zapisi `BA-audit-log-01`–`BA-audit-log-11` sa statusima `završen (W3.x)` iz ranijih W3 workstreamova; to nisu novi zatvoreni nalazi Vala 7 niti 11 zasebnih registara. Postojeća razlika od tri statusa ostaje zasebna i nije usaglašena ovim paketom.

## 7. Način rada i obavezni format odgovora

Za svaki paket:
1. potvrditi tačan BA nalaz, acceptance, granice scope-a i branch/PR pravila;
2. implementirati samo odobreni paket, dodati ciljane unit/integration tests i migration policy provjeru ako ima migracije;
3. pokrenuti lokalne provjere; navesti prepreke iskreno;
4. commitovati i pushovati samo na trenutno otvorenu Arena granu;
5. pratiti CI za pravi SHA i prijaviti i zelene i preskočene/pale provjere; ne preimenovati „skipped“ u „passed“;
6. tek uz potreban dokaz ažurirati registry/closeout i navesti status migracije/target baze.

### CI cadence za W7 / assets segment

Za package-level promjene koristiti ciljane E2E `specs` preko `workflow_dispatch`; ne pokretati kompletan E2E critical flow niti Perf smoke za svaki paket. Kompletan E2E critical flow i Perf smoke pokrenuti na kraju segmenta, nakon završetka odobrenih stavki u `docs/backend/audits/22-assets.md`. Na pushu su backend/frontend/integration i drugi relevantni kodni gateovi i dalje dio CI-ja. `.github/workflows/ci.yml` je podešen da ne pokreće skupi E2E na svakom pushu; E2E ostaje PR smoke, noćni full run i ručni targeted/full dispatch. `.github/workflows/perf-smoke.yml` nema push trigger; Perf ostaje na PR-u i ručnom segment-closeout dispatchu. Izvještavati `skipped`, `not run` i neuspjele rezultate odvojeno; test 56 se ne mijenja/ne preskače. `BA-assets-18`–`BA-assets-19` ostaju otvoreni i za implementaciju i dalje traže zasebno odobrenje.

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
- W7.15 migration: `backend/prisma/migrations/20271030120000_asset_hard_delete_event_history/`
- Single-owner migrator: `backend/scripts/run-release-migrations.mjs`
- Runtime migration sentinel: `backend/src/common/database/database-runtime-contract.ts`
