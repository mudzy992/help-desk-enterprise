# HANDOFF — Help Desk Enterprise

**Datum:** 2026-10-30  
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

W7.16 **nije započet**. Počinje tek nakon razrješenja perf i ostalih PR CI blokatora. Tačan W7.16 nalaz još nije odabran/odobren: prije implementacije konsultovati aktivni registar i tražiti eksplicitno odobrenje za konkretan scope.

### PR i korisnička dozvola u ovoj sesiji

PR #11 (`arena/298fb5c9-help-desk-enterprise` → `master`) je otvoren. Korisnik je u ovoj sesiji izričito zatražio da se nakon HANDOFF commit/push koraka pokuša normalni merge PR-a #11. Ta dozvola je **samo za PR #11 u ovoj sesiji**; ne daje dozvolu za nove PR-ove niti za buduće mergeove. Koristiti normalni `gh pr merge 11 --merge`, bez `--auto` i bez administrativnog bypassa. Ako GitHub odbije merge zbog CI/zaštite grane, ne zaobilaziti blokadu; prijaviti rezultat korisniku. U novoj sesiji prvo provjeriti stvarno stanje PR-a i grane, ne pretpostavljati da je merge uspio.

## 3. CI dokaz i nerazriješeni blokatori

**Zeleni push CI:**
- `41067304475` na kodnom SHA `11f43efd37d448142f6c33f99096555ee8f7419d` — backend, PostgreSQL/Redis integration, frontend, docs/container/supply-chain i CI gate prošli.
- `41068758830` na closeout SHA `c631fc06e9c5309487434123273ca252237a68ae` — završni push CI zelen.
- Push CI je preskočio E2E poslove i image high/critical vulnerability enforcement; ne predstavljati ih kao izvršene/prošle.

**PR CI nije zelen; ne tretirati W7.15 kao merge-ready samo na osnovu push CI:**
- Prvi PR pokušaj: CI `41071433209` pao je na `tests/54-dashboard.spec.ts:17` zbog Playwright strict-mode selectora koji je pronašao dva linka; osnovni backend, PostgreSQL/Redis, frontend i docs poslovi su prošli. Perf `41071433185` imao je prosjek `db_queries_per_request=6.323` prema budžetu `2.1`.
- Ponovni PR pokušaj na SHA `0bd5970593da5791efcec9c5e548a0db2e1fdb5d`: CI `41073878957` prošao je backend build/test, PostgreSQL/Redis, container/supply-chain, docs guard i frontend, ali je E2E `GET /services` pao zbog `UND_ERR_CONNECT_TIMEOUT` prema `api.desk.ba101.top`. Perf `41073878668` prošao je 7/9 pragova; pali su `tickets_list_duration` i `http_req_failed`; query prosjek `6.216` prema budžetu `2.1` preko 3.381 aplikacijskih zahtjeva.
- Posljednji tada poznati tip `f776c38` bio je docs-only i nije imao novi prijavljeni GitHub check. U svakoj sesiji ponovo provjeriti checks na aktuelnom SHA.

Ovi problemi nisu klasifikovani kao raniji/pre-existing; samo je utvrđeno da su u E2E/performance putanjama izvan W7.15 asset hard-delete diff-a. Nisu popravljani u W7.15. Korisnik je izričito rekao da ne idemo na naredni paket dok CI nije razriješen. Prvo trijažirati E2E target/dostupnost i selector problem ako se ponovi; zatim profile-ovati k6 query budget, ticket-list latenciju i HTTP greške. Ne spuštati pragove bez dokaza.

## 4. Obavezna promjena CI grane u narednoj sesiji

Korisnik je izričito zatražio da naredni agent promijeni `.github/workflows/ci.yml`: u `on.push.branches` treba ostati **samo tačan naziv nove Arena grane koja je automatski otvorena za narednu sesiju**. Naziv se ne smije pogađati — pročitati ga iz `git branch --show-current` nakon što se sesija otvori. Ukloniti trenutnu `arena/298fb5c9-help-desk-enterprise` i stare Arena grane iz push allowlista; ne dodavati `master`, `main` ni druge grane. Ne mijenjati `pull_request.branches` bez zasebnog naloga. Nakon promjene provjeriti workflow/CI konfiguraciju i dokazati da push trigger cilja samo tu novu granu.

## 5. Migracije i target baza

Migracija `20271030120000_asset_hard_delete_event_history` je aditivna i odigrana je samo na disposable CI bazi; **nije primijenjena na ciljnu instalaciju**. U ovoj sesiji `DATABASE_URL`, `MIGRATION_DATABASE_URL` i `ASSETS_IT_DATABASE_URL` nisu bili postavljeni, pa target status nije mogao biti provjeren niti je migracija primijenjena. Korisnik je ranije potvrdio uspješnu primjenu W7.14 migracije `20271030110000_asset_transfer_retention_lifecycle`; nikada je ne ponavljati.

Za W7.15: kad korisnik obezbijedi tačan target kroz sigurno okruženje, prvo izvršiti `prisma migrate status` nad tom bazom. Samo ako je W7.14 već uspješno primijenjena, a W7.15 migracija pending, primijeniti W7.15 preko `npm run db:migrate:release` sa pravilno postavljenim migration/runtime credentials i single-owner lockom. Ne primjenjivati na nepoznatu bazu i ne tražiti tajne u chatu.

## 6. Registar nalaza

- W7.15 je zatvorio samo `BA-assets-15`; `BA-assets-16`–`BA-assets-19` ostaju otvoreni.
- Deklarisani zbir registra: 574 otvorena / 118 zatvorenih / 692 ukupno.
- Machine-readable plan: 577 otvorenih / 104 zatvorena / 11 historijskih / 692 ukupno. „11 historijskih“ su zapisi `BA-audit-log-01`–`BA-audit-log-11` sa statusima `završen (W3.x)` iz ranijih W3 workstreamova; to nisu novi zatvoren nalaz W7.15 niti 11 zasebnih registara. Postojeća razlika između zbirnih statusa ostaje zasebna i nije usaglašena ovim paketom.

## 7. Način rada i obavezni format odgovora

Za svaki paket:
1. potvrditi tačan BA nalaz, acceptance, granice scope-a i branch/PR pravila;
2. implementirati samo odobreni paket, dodati ciljane unit/integration tests i migration policy provjeru ako ima migracije;
3. pokrenuti lokalne provjere; navesti prepreke iskreno;
4. commitovati i pushovati samo na trenutno otvorenu Arena granu;
5. pratiti CI za pravi SHA i prijaviti i zelene i preskočene/pale provjere; ne preimenovati „skipped“ u „passed“;
6. tek uz potreban dokaz ažurirati registry/closeout i navesti status migracije/target baze.

Svaki detaljni closeout odgovor mora sadržavati: **paket/nalaz; implementaciju; testove; commit i CI SHA/run linkove; PR stanje; registry brojeve; migraciju/rollout; nerazriješene blokatore; sljedeći paket i uslove za početak.**

## 8. Repo-relative orijentiri

- CI workflow: `.github/workflows/ci.yml`
- Perf workflow: `.github/workflows/perf-smoke.yml`
- Findings register: `docs/backend/BACKEND-FINDINGS-REGISTER.md`
- Machine-readable plan: `docs/backend/backend-findings-plan.json`
- Asset audit: `docs/backend/audits/22-assets.md`
- W7.15 closeout: `docs/backend/implementation/101-assets-hard-delete-event-history.md`
- W7.15 migration: `backend/prisma/migrations/20271030120000_asset_hard_delete_event_history/`
- Single-owner migrator: `backend/scripts/run-release-migrations.mjs`
- Runtime migration sentinel: `backend/src/common/database/database-runtime-contract.ts`
