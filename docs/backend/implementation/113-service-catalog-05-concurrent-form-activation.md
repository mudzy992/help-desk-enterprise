# Implementacijski checkpoint — `BA-service-catalog-05` (owner-directed closeout)

**Paket:** audit 15 / `service-catalog` — konkurentna aktivacija verzija forme<br>
**Nalaz:** `BA-service-catalog-05` (P2) — **zatvoren owner-directed 2026-11-02** nakon korisnikove prijave urednog redeploya; deployment nije nezavisno provjeren<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**BA-04 prethodni status:** zatvoren odvojeno po izričitoj owner-directed odluci 2026-11-02; deklarisani agregat je 563 otvorena / 129 zatvorenih / 692 ukupno, machine-readable 566 otvorenih / 115 zatvorenih / 11 historijskih; `service-catalog` ima 8 otvorenih / 7 zatvorenih<br>
**Migracija / ciljna baza:** nema Prisma schema promjene, migracije ni pristupa/upisa u ciljnu bazu<br>
**Spec 56 / prag:** nisu mijenjani; nema browser/spec 56 sign-offa

## Nalaz i acceptance

Audit je utvrdio da standardna API aktivacija retire-a druge `ACTIVE` verzije prije aktiviranja ciljne forme, ali se paralelni pozivi ne serijalizuju i ciljna `DRAFT` verzija nije ponovo provjeravana nakon čekanja. Install-seed putanja je drugi activation writer. Kada je `allowMultipleActiveVersions=false`, prihvatljivo stanje nakon bilo kojeg skupa konkurentnih aktivacija je najviše jedna `ACTIVE` verzija za servis. Kada je postavka `true`, aktivne verzije se ne smiju retire-ati samo radi serijalizacije; više njih mora ostati dozvoljeno.

Acceptance uključuje zajedničku transakcijsku koordinaciju API-ja i install-seeda, ponovno čitanje/validaciju ciljne verzije nakon dobijanja locka, atomsku retire/activate operaciju, concurrency dokaz na PostgreSQL-u i dokaz da lock redoslijed ne deadlocka sa `applyCatalogSnapshot`. BA-06 create/version-allocation race i svi drugi nalazi ostaju van scopea.

## Implementacija

- Novi `withServiceFormActivationLock` koristi postojeći `DatabaseLockService.withAdvisoryLock` sa namespaceom `service-catalog.form-activation` i ključem `serviceId`, pa uzima `LOCK TABLE "FormVersion" IN ROW EXCLUSIVE MODE` prije callbacka. Aktivacija ne zaključava `Service`, pa se ne formira kružni lock redoslijed sa snapshot apply-jem.
- `applyCatalogSnapshot` uzima `SHARE ROW EXCLUSIVE` lock nad `Service`/`FormVersion`. API activation lock se uzima prije ciljnoj verziji pripadajućeg `SELECT ... FOR UPDATE`; time activation ne drži red dok čeka snapshot table lock. Snapshotov lock i activationov writer lock se serijalizuju na FormVersion tabeli.
- `activateServiceFormVersion` sada obavlja advisory/table lock, zaključava ciljnu verziju, ponovo učitava stanje nakon čekanja i zahtijeva `DRAFT`. U jednoj `ReadCommitted` transakciji retire-a ostale `ACTIVE` verzije samo kada je `allowMultipleActiveVersions=false`, zatim aktivira ciljnu verziju i bilježi change log.
- `ensureInstallSeedFormVersion` koristi isti per-service lock u transakciji za pronalaženje/kreiranje i aktivaciju; postavka koja dopušta više aktivnih verzija ostaje poštovana. Nema migracije.
- Dodani su unit testovi za lock redoslijed i ponašanje obje vrijednosti postavke, te PostgreSQL integration testovi za dvije konkurentne API aktivacije, API-vs-install-seed aktivaciju i serijalizaciju sa stvarnim `applyCatalogSnapshot` table-lock tokom. BA-05 suite je upisan u izolovani PostgreSQL integration runner i njegov registry test.
- Unit harnessi za form-version aktivaciju lokalno dodaju raw-query/write stubs; opći service-catalog fake ostaje bez `$queryRaw` kako bi downtime-summary testovi zadržali in-memory query putanju. Install-seed fake zasebno izlaže metode potrebne za zajednički lock helper.

## Lokalna verifikacija

- Ciljani ESLint nad BA-05 TypeScript fajlovima i izmijenjenim harnessima: **passed**.
- `with-service-form-activation-lock.spec.ts`: **1/1 passed**; potvrđuje redoslijed advisory lock → FormVersion writer table lock → operacija.
- Install-seed `service`, `reuse` i `rollback` suiteovi: **12/12 passed**. `install-seed.parametrized.spec.ts` je **failure pri učitavanju**, prije izvršavanja testova, jer lokalno nedostaje `generated/prisma/client`; nije sign-off.
- `service-forms.service.spec.ts` je također **failure pri učitavanju**, prije izvršavanja testova, zbog nedostajućeg generated Prisma clienta; nije sign-off.
- `npm ci` je završio. `npm run db:generate` nije mogao završiti jer Prisma CLI nije mogao preuzeti schema-engine sa `binaries.prisma.sh` u ovom sandboxu; nije bilo DB konekcije ni migracije. `PRIVACY_IT_DATABASE_URL` nije postavljen, pa novi real-PostgreSQL concurrency suite nije lokalno izvršen.
- Backend findings traceability: **692/692**, severity `P1=174, P2=368, P3=150`; registry testovi **12/12 passed**. Docs-content testovi **9/9 passed**; docs guard **passed** (32 stranice, 8 prevoda, 10 provjera); isolated-integration runner registry testovi **3/3 passed**. `git diff --check`: **passed**.

Lokalni Jest load failures i lokalno neizvršeni integration suite nisu predstavljeni kao passed; zvanični CI build/full Jest i disposable PostgreSQL rezultati dokumentovani su u završnom checkpointu ispod.

## CI checkpoint na `ee7229e`

Push CI [`41526774775`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41526774775) završio je **failure**. Generated Prisma validation/generation, route wiring checks, frontend build/test i Docs guard bili su **passed**. Backend build **failed** na `TS2322` u `create-in-memory-service-onboarding-prisma.ts`: BA-05 je dodao `$queryRaw`/`$executeRaw` ugovore u zajednički service-catalog fake, ali izvedeni onboarding fake ih nije deklarisao u svom eksplicitnom tipu. U follow-up izmjeni su ta dva fake raw metoda dodana u taj tip. Zbog build failurea backend lint i full Jest nisu se pokrenuli.

Backend container/supply-chain image build je **failed**, a PostgreSQL/Redis integration job je **failed** na deployment-wide connection-budget koraku; `Run real PostgreSQL integration suites` je bio **skipped**. E2E critical/install i read-only service-form inventory bili su **skipped**. CI gate je **failure**. `gh run view --log-failed` vratio je `EOF`, pa nema dostupnog detaljnog dokaza za image-build i connection-budget uzroke; ne pripisuju se BA-05 bez loga. Perf smoke [`41526774529`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41526774529) je **failure** na API build koraku; k6 nije pokrenut i nema perf mjerenja. Ovaj CI pokušaj zato nije acceptance; potrebno je ponoviti nakon type-fixa.

## CI follow-up na `9fd75b9`

CI [`41527594722`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41527594722) završio je **failure**. Backend build sa generated Prisma, lint, suiteovi koji su ranije bili blokirani tipovima, wiring provjere, SLA matrix, frontend, Docs guard i container/supply-chain build bili su **passed**. Full backend Jest je **failed** u `load-service-downtime-summary.spec.ts` i `service-catalog.availability.spec.ts`: raw-query stubs dodani u opći service-catalog in-memory fake prebacili su downtime testove na SQL-projection putanju, čiji test stub vraća prazne rezultate. Popravka uklanja raw metode iz općeg fakea i dodaje ih samo activation unit harnessima. Ostali backend koraci iza Jest nisu izvršeni.

PostgreSQL/Redis integration job je stigao do real suiteova; BA-05 suite je imao **2 passed / 1 failed**. Dvije konkurentne API aktivacije i API-vs-install-seed su passed; snapshot-interaction test je pao sa `CONFIG_CATALOG_STATE_CONFLICT` jer je njegov catalog snapshot sadržavao samo fixture trenutnog testa, dok su ranija fixture-i u istom suiteu još postojala. Popravka sada snima sve service/form redove fixture-ima tog izolovanog suitea i pokreće pravi `applyCatalogSnapshot` pod zadržanim table lockom. Nema dokaza da je to produkcijski lock conflict; greška je testnog snapshot fixturea. Ostali CI jobs: detect, frontend, Docs guard i container/supply-chain su **passed**; inventory i oba E2E posla su **skipped**; CI gate je **failure** zbog Jest/integration neuspjeha. Nema spec 56 sign-offa.

## Završni CI checkpoint na `6d98cff`

CI [`41529212182`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41529212182) završio je **success**. Generated-Prisma backend build, backend lint, suiteovi blokirani tipovima, wiring provjere, SLA matrix i **puni backend Jest** bili su **passed**. PostgreSQL/Redis integration job je **passed**, uključujući BA-05 izolovani suite: dvije konkurentne API aktivacije, API-vs-install-seed aktivacija i interakcija sa stvarnim `applyCatalogSnapshot` table-lockom. Frontend build/test, Docs guard, container/supply-chain i CI gate također su **passed**. Read-only service-form inventory, E2E critical flows, E2E install wizard i uslovni high/critical image-enforcement korak bili su **skipped**. Nema browser/spec 56 sign-offa.

Odvojeni Perf smoke [`41529212249`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41529212249) je **failure** samo na `POST /tickets/:id/messages` p95 **1160.83 ms** prema `<1000 ms`. Service-catalog p95 je **33.31 ms** prema `<500 ms`, catalog contract failures **0**, payload **111.16 KB** prema `<=1024 KB`, a query-budget avg **2.093** preko **48,355** zahtjeva prema `2.1` su **passed**; `GET /search` p95 **496.88 ms** prema `<500 ms` je također passed. K6 je izvršen, ali ukupni Perf workflow ostaje failure zbog nepovezanog ticket-message praga; endpoint nije BA-05 scope i nije mijenjan. Spec 56/prag `250 ms` nisu mijenjani.

## Owner-directed closeout i status

Korisnik je 2026-11-02 potvrdio da je BA-05 uredno redeployan i izričito odobrio početak BA-06. BA-05 je zato evidentiran kao **zatvoren owner-directed**. Deploy nije nezavisno provjeren u ovom okruženju; CI `41529212182` potvrđuje kodni build/test/integration, ne produkcijski rollout. Odvojeni Perf `41529212249` ostaje **failure** samo na nepovezanom ticket-message p95; E2E/inventory su bili **skipped**, pa nema spec 56 sign-offa. Ovi statusi ostaju razdvojeni i nisu predstavljeni kao green ukupnog Perf/E2E gatea.

BA-06 je zatvoren owner-directed nakon zelenog CI-ja `41537673319` na `964c8f4`; detalji i odvojeni Perf/E2E statusi su u [114 closeoutu](114-service-catalog-06-form-version-create-race.md). Sljedeći i jedini aktivni scope je BA-07 ([115 checkpoint](115-service-catalog-07-downtime-overlap-race.md)). Ne otvarati PR prema `master`, ne izvršavati novi merge ili deployment bez zasebne dozvole. Nema promjene BA-routing-02, drugih nalaza, speca 56, praga `250 ms` ni W7.15 ponašanja.
