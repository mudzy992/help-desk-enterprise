# Implementacijski checkpoint — `BA-service-catalog-08` (u toku)

**Paket:** audit 15 / `service-catalog` — acyclic category-parent invariant<br>
**Nalaz:** `BA-service-catalog-08` (P2) — **otvoren**; implementacija započeta<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odobrenje:** korisnik je 2026-11-03 odobrio BA-07 zatvaranje nakon zelenog CI-ja/Perf-a i izričito naložio početak BA-08<br>
**BA-07 prethodni status:** zatvoren owner-directed nakon CI `41628259091` i Perf `41628258814`, oba **success** na `65bad6e7`; closeout je u [115 checkpointu](115-service-catalog-07-downtime-overlap-race.md)<br>
**Kontrolni zbir nakon BA-07:** deklarisano 560 otvoren / 132 zatvoren / 692 ukupno; machine-readable 563 otvorena / 118 zatvorenih / 11 historijskih; `service-catalog` 5 otvorenih / 10 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana.<br>
**Migracija / ciljna baza:** nema schema promjene ni migracije; target DB nije korišten<br>
**BA-08 CI / Perf:** CI `41636094640` i Perf `41636094688` na `c9a59de1` završili su **failure**; backend type error je ispravljen lokalno, follow-up CI/Perf još treba potvrditi

## Nalaz i acceptance

Audit baseline potvrđuje da `assertCategoryParentIsValid` detektuje self-parent i postojeći ciklus, ali dvije istovremene promjene mogu obje pročitati staru acyclic strukturu, validirati svoje roditelje i zatim upisati suprotne edgeove. Time nastaje ciklus u `ServiceCategory` parent grafu.

BA-08 acceptance:

1. Svaki API writer koji umeće ili mijenja non-null `parentId` koristi isti transaction-scoped advisory lock za cijelu hijerarhiju kategorija; parent existence/cycle validation i write/change-log su u istoj `ReadCommitted` transakciji.
2. `updateCategory` učitava trenutnu kategoriju nakon locka, pa validacija i before/after log polaze od svježe parent strukture. `createCategory` sa parentom dijeli isti lock; root create bez parenta ne mijenja graph edge.
3. Dvije istovremene suprotne reparent promjene ne mogu napraviti ciklus: najviše jedna uspije, a gubitnik dobija stabilnu `CIRCULAR_CATEGORY` grešku. Konačni PostgreSQL graph mora ostati acyclic.
4. Real PostgreSQL suite koristi odvojene klijente, potvrđuje da writers zaista čekaju isti advisory lock i provjerava konačno stanje. Pored suprotnih updateova pokriva parented category create putanju.
5. Bez Prisma schema promjene, migracije, DB constrainta, BA-routing-02 izmjene ili BA-09 optimistic-concurrency ugovora. Ostali finding statusi ne mijenjaju se.

## Implementacija započeta

- Novi `withServiceCategoryParentMutationLock` uzima globalni hierarchy lock kroz `DatabaseLockService`; timeout se mapira na service-unavailable `CATEGORY_TREE_LOCK_UNAVAILABLE`.
- `updateServiceCategory` premješta read, parent validation, update i change-log u jednu `ReadCommitted` transakciju; read se obavlja nakon locka.
- `createServiceCategory` sa non-null parentom validira i upisuje pod istim lockom. Root create ostaje bez graph locka jer ne dodaje parent edge.
- Dodan je unit test koji odbacuje pomjeranje root kategorije ispod vlastitog potomka i provjerava da DB state ostaje nepromijenjen.
- Dodan je isolated PostgreSQL BA-08 suite sa suprotnim concurrent reparent updateovima i parented create lock coverage; runner registry i guard test su ažurirani.

## Verifikacija do sada

- `node scripts/check-backend-findings.mjs` prošao je **692/692**, severity/owner/wave; `node --test scripts/check-backend-findings.test.mjs` **13/13**. Docs guard je **OK** (32 stranice, 8 prevoda, 10 provjera), a `node --test scripts/check-docs-content.test.mjs` **9/9**. Isolated-integration registry/harness test je **3/3**; ovo ne predstavlja izvršavanje real PostgreSQL suitea. `git diff --check` je prošao.
- Cijeli `npm run lint` backend je **passed** bez grešaka; prijavio je 3 ESLint warninga u postojećem, nepovezanom `src/modules/sla/sla-scan-failure-quarantine.spec.ts`. Ciljani Jest za `service-catalog.service.spec.ts` nije izvršio testove (0 tests) jer nedostaje generated Prisma `src/generated/prisma/enums`; nije test-assertion failure.
- Lokalni `npm run build` nije mogao typecheckati BA-08: checkout nema generated Prisma Client (`src/generated/prisma/client`), pa je build završio sa 3.390 nedostajućih-client/delegate dijagnostika. `npm run db:generate` je pokušao Prisma schema-engine download, ali TLS pristup `binaries.prisma.sh` nije uspio. Lokalni typecheck zato ostaje ograničen; generated-Prisma CI rezultat i tačan TS2322 uzrok opisani su niže.
- Real PostgreSQL suite nije pokrenut: `DATABASE_URL`, `E2E_DATABASE_URL` i `PRIVACY_IT_DATABASE_URL` su lokalno unset; target DB nije korišten, niti je migracija pokrenuta. CI `41628259091` / Perf `41628258814` validiraju BA-07 commit `65bad6e7`, ne BA-08 izmjene. E2E nije pokrenut; spec 56/prag `250 ms` nisu mijenjani.
- Prvi BA-08 push CI [`41636094640`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41636094640) na `c9a59de1` je **failure**: backend build annotation je TS2322 u `src/modules/service-onboarding/create-in-memory-service-onboarding-prisma.ts:45`, jer explicit fake-Prisma shape nije deklarisao `$queryRaw` koji je dodan u zajednički lažni Prisma klijent service-cataloga. Backend full Jest je `skipped`; real PostgreSQL integration suites nisu pokrenute, jer integration job pao je ranije na deployment-wide connection-budget koraku. Frontend build/test i Docs guard su **passed**. Container runtime image build je **failure**.
- Perf [`41636094688`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41636094688) je **failure** na `Build the API`; k6 nije pokrenut i metrike nisu ocijenjene. E2E install/critical i read-only inventory bili su **skipped**. Ove rezultate ne predstavljati kao BA-08 acceptance.
- Follow-up ispravka je urađena u interfejsu onboarding lažnog Prisma klijenta (deklaracija `$queryRaw` odražava već postojeći stub); izmjena čeka punu CI/Perf potvrdu.
- `npm ci` je prošao, ali npm je prijavio 38 dependency vulnerabilities (1 low / 37 moderate); lockfile nije mijenjan i to nije BA-08 scope.
- Očekivani acceptance kodovi: `CIRCULAR_CATEGORY` ostaje HTTP 400; advisory-lock timeout vraća 503 `CATEGORY_TREE_LOCK_UNAVAILABLE`. BA-08 se ne zatvara prije zelenog generated-Prisma build/full Jest, real PostgreSQL suitea i zasebne korisničke odluke.

## Status i sljedeći korak

BA-08 je aktivan i **otvoren**. Završiti code review, izvršiti targeted Jest/lint/build i real PostgreSQL suite kroz CI, pregledati Perf smoke bez unaprijed zadane zelene tvrdnje, zatim dokumentovati tačne `passed`/`skipped`/`failure` rezultate. Ne praviti PR prema `master`, merge ili deployment bez zasebne dozvole. BA-07 je zatvoren; BA-09 i ostali nalazi ostaju otvoreni/nepromijenjeni.
