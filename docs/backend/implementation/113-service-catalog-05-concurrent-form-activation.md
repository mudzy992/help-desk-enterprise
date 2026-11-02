# Implementacijski checkpoint — `BA-service-catalog-05` (u toku)

**Paket:** audit 15 / `service-catalog` — konkurentna aktivacija verzija forme<br>
**Nalaz:** `BA-service-catalog-05` (P2) — **otvoren**; implementacija započeta, acceptance nije završen<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**BA-04 prethodni status:** zatvoren odvojeno po izričitoj owner-directed odluci 2026-11-02; deklarisani agregat je 563 otvorena / 129 zatvorenih / 692 ukupno, machine-readable 566 otvorenih / 115 zatvorenih / 11 historijskih; `service-catalog` ima 8 otvorenih / 7 zatvorenih<br>
**Migracija / ciljna baza:** nema Prisma schema promjene, migracije ni pristupa/upisa u ciljnu bazu<br>
**Spec 56 / prag:** nisu mijenjani; nema browser/spec 56 sign-offa

## Nalaz i acceptance

Audit je utvrdio da standardna API aktivacija retire-a druge `ACTIVE` verzije prije aktiviranja ciljne forme, ali se paralelni pozivi ne serijalizuju i ciljna `DRAFT` verzija nije ponovo provjeravana nakon čekanja. Install-seed putanja je drugi activation writer. Kada je `allowMultipleActiveVersions=false`, prihvatljivo stanje nakon bilo kojeg skupa konkurentnih aktivacija je najviše jedna `ACTIVE` verzija za servis. Kada je postavka `true`, aktivne verzije se ne smiju retire-ati samo radi serijalizacije; više njih mora ostati dozvoljeno.

Acceptance uključuje zajedničku transakcijsku koordinaciju API-ja i install-seeda, ponovno čitanje/validaciju ciljne verzije nakon dobijanja locka, atomsku retire/activate operaciju, concurrency dokaz na PostgreSQL-u i dokaz da lock redoslijed ne deadlocka sa `applyCatalogSnapshot`. BA-06 create/version-allocation race i svi drugi nalazi ostaju van scopea.

## Implementacija u radu

- Novi `withServiceFormActivationLock` koristi postojeći `DatabaseLockService.withAdvisoryLock` sa namespaceom `service-catalog.form-activation` i ključem `serviceId`, pa uzima `LOCK TABLE "FormVersion" IN ROW EXCLUSIVE MODE` prije callbacka. Aktivacija ne zaključava `Service`, pa se ne formira kružni lock redoslijed sa snapshot apply-jem.
- `applyCatalogSnapshot` uzima `SHARE ROW EXCLUSIVE` lock nad `Service`/`FormVersion`. API activation lock se uzima prije ciljnoj verziji pripadajućeg `SELECT ... FOR UPDATE`; time activation ne drži red dok čeka snapshot table lock. Snapshotov lock i activationov writer lock se serijalizuju na FormVersion tabeli.
- `activateServiceFormVersion` sada obavlja advisory/table lock, zaključava ciljnu verziju, ponovo učitava stanje nakon čekanja i zahtijeva `DRAFT`. U jednoj `ReadCommitted` transakciji retire-a ostale `ACTIVE` verzije samo kada je `allowMultipleActiveVersions=false`, zatim aktivira ciljnu verziju i bilježi change log.
- `ensureInstallSeedFormVersion` koristi isti per-service lock u transakciji za pronalaženje/kreiranje i aktivaciju; postavka koja dopušta više aktivnih verzija ostaje poštovana. Nema migracije.
- Dodani su unit testovi za lock redoslijed i ponašanje obje vrijednosti postavke, te PostgreSQL integration testovi za dvije konkurentne API aktivacije, API-vs-install-seed aktivaciju i serijalizaciju sa stvarnim `applyCatalogSnapshot` table-lock tokom. BA-05 suite je upisan u izolovani PostgreSQL integration runner i njegov registry test.
- In-memory service-catalog, onboarding i install-seed harnessi izlažu raw-query/write metode potrebne za zajednički lock helper.

## Lokalna verifikacija

- Ciljani ESLint nad BA-05 TypeScript fajlovima i izmijenjenim harnessima: **passed** (ponoviti nakon finalnog diff pregleda).
- `with-service-form-activation-lock.spec.ts`: **1/1 passed**; potvrđuje redoslijed advisory lock → FormVersion writer table lock → operacija.
- Install-seed `service`, `reuse` i `rollback` suiteovi: **12/12 passed**. `install-seed.parametrized.spec.ts` je **failure pri učitavanju**, prije izvršavanja testova, jer lokalno nedostaje `generated/prisma/client`; nije sign-off.
- `service-forms.service.spec.ts` je također **failure pri učitavanju**, prije izvršavanja testova, zbog nedostajućeg generated Prisma clienta; nije sign-off.
- `npm ci` je završio. `npm run db:generate` nije mogao završiti jer Prisma CLI nije mogao preuzeti schema-engine sa `binaries.prisma.sh` u ovom sandboxu; nije bilo DB konekcije ni migracije. `PRIVACY_IT_DATABASE_URL` nije postavljen, pa novi real-PostgreSQL concurrency suite nije lokalno izvršen.
- Backend findings traceability: **692/692**, severity `P1=174, P2=368, P3=150`; registry testovi **12/12 passed**. Docs-content testovi **9/9 passed**; docs guard **passed** (32 stranice, 8 prevoda, 10 provjera); isolated-integration runner registry testovi **3/3 passed**. `git diff --check`: **passed**.

Lokalni Jest load failures i neizvršeni integration suite nisu predstavljeni kao passed. Potrebni su CI build/full Jest i disposable PostgreSQL integration na commit-u koji sadrži BA-05.

## CI checkpoint na `ee7229e`

Push CI [`41526774775`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41526774775) završio je **failure**. Generated Prisma validation/generation, route wiring checks, frontend build/test i Docs guard bili su **passed**. Backend build **failed** na `TS2322` u `create-in-memory-service-onboarding-prisma.ts`: BA-05 je dodao `$queryRaw`/`$executeRaw` ugovore u zajednički service-catalog fake, ali izvedeni onboarding fake ih nije deklarisao u svom eksplicitnom tipu. U follow-up izmjeni su ta dva fake raw metoda dodana u taj tip. Zbog build failurea backend lint i full Jest nisu se pokrenuli.

Backend container/supply-chain image build je **failed**, a PostgreSQL/Redis integration job je **failed** na deployment-wide connection-budget koraku; `Run real PostgreSQL integration suites` je bio **skipped**. E2E critical/install i read-only service-form inventory bili su **skipped**. CI gate je **failure**. `gh run view --log-failed` vratio je `EOF`, pa nema dostupnog detaljnog dokaza za image-build i connection-budget uzroke; ne pripisuju se BA-05 bez loga. Perf smoke [`41526774529`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41526774529) je **failure** na API build koraku; k6 nije pokrenut i nema perf mjerenja. Ovaj CI pokušaj zato nije acceptance; potrebno je ponoviti nakon type-fixa.

## Status i sljedeći korak

BA-05 ostaje **otvoren** dok generated Prisma CI build/full Jest i registrovani PostgreSQL integration suite ne prođu i dok owner ne prihvati paket. Nakon CI-ja pregledati lock-wait/invariant dokaze i dokumentovati svaki `passed`, `skipped` ili `failure` odvojeno. Ne otvarati PR prema `master`, ne mergeati i ne deployati bez zasebne dozvole. Nema promjene BA-routing-02, BA-06, drugih nalaza, speca 56, praga `250 ms` ni W7.15 ponašanja.
