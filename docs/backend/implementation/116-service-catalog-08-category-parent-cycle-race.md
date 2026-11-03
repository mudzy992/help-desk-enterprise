# Implementacijski checkpoint — `BA-service-catalog-08` (tehnički validirano; status otvoren)

**Paket:** audit 15 / `service-catalog` — acyclic category-parent invariant<br>
**Nalaz:** `BA-service-catalog-08` (P2) — **otvoren**; tehnički kriteriji prihvata validirani su u CI/Perf-u, ali nalaz nije zatvaran<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odobrenje:** korisnik je 2026-11-03 odobrio BA-07 zatvaranje nakon zelenog CI-ja/Perf-a i izričito naložio početak BA-08<br>
**BA-07 prethodni status:** zatvoren owner-directed nakon CI `41628259091` i Perf `41628258814`, oba **success** na `65bad6e7`; closeout je u [115 checkpointu](115-service-catalog-07-downtime-overlap-race.md)<br>
**Kontrolni zbir nakon BA-07:** deklarisano 560 otvoren / 132 zatvoren / 692 ukupno; machine-readable 563 otvorena / 118 zatvorenih / 11 historijskih; `service-catalog` 5 otvorenih / 10 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana.<br>
**Migracija / ciljna baza:** nema schema promjene ni migracije; lokalni target DB nije korišten, CI je koristio disposable PostgreSQL<br>
**BA-08 CI / Perf:** CI `41638462836` i Perf `41638462783` na `5415f502` su **success**; full Jest i real PostgreSQL race suite prošli su

## Nalaz i kriteriji prihvata

Audit baseline potvrđuje da `assertCategoryParentIsValid` detektuje self-parent i postojeći ciklus, ali dvije istovremene promjene mogu obje pročitati staru acyclic strukturu, validirati svoje roditelje i zatim upisati suprotne edgeove. Time nastaje ciklus u `ServiceCategory` parent grafu.

BA-08 acceptance:

1. Svaki API writer koji umeće ili mijenja non-null `parentId` koristi isti transaction-scoped advisory lock za cijelu hijerarhiju kategorija; parent existence/cycle validation i write/change-log su u istoj `ReadCommitted` transakciji.
2. `updateCategory` učitava trenutnu kategoriju nakon locka, pa validacija i before/after log polaze od svježe parent strukture. `createCategory` sa parentom dijeli isti lock; root create bez parenta ne mijenja graph edge.
3. Dvije istovremene suprotne reparent promjene ne mogu napraviti ciklus: najviše jedna uspije, a gubitnik dobija stabilnu `CIRCULAR_CATEGORY` grešku. Konačni PostgreSQL graph mora ostati acyclic.
4. Real PostgreSQL suite koristi odvojene klijente, potvrđuje da writers zaista čekaju isti advisory lock i provjerava konačno stanje. Pored suprotnih updateova pokriva parented category create putanju.
5. Bez Prisma schema promjene, migracije, DB constrainta, BA-routing-02 izmjene ili BA-09 optimistic-concurrency ugovora. Ostali finding statusi ne mijenjaju se.

## Implementacija

- Novi `withServiceCategoryParentMutationLock` uzima globalni hierarchy lock kroz `DatabaseLockService`; timeout se mapira na service-unavailable `CATEGORY_TREE_LOCK_UNAVAILABLE`.
- `updateServiceCategory` premješta read, parent validation, update i change-log u jednu `ReadCommitted` transakciju; read se obavlja nakon locka.
- `createServiceCategory` sa non-null parentom validira i upisuje pod istim lockom. Root create ostaje bez graph locka jer ne dodaje parent edge.
- Dodan je unit test koji odbacuje pomjeranje root kategorije ispod vlastitog potomka i provjerava da DB state ostaje nepromijenjen.
- Dodan je isolated PostgreSQL BA-08 suite sa suprotnim concurrent reparent updateovima i parented create lock coverage; runner registry i guard test su ažurirani.

## Rezultati verifikacije

- `node scripts/check-backend-findings.mjs` prošao je **692/692**, severity/owner/wave; `node --test scripts/check-backend-findings.test.mjs` **13/13**. Docs guard je **OK** (32 stranice, 8 prevoda, 10 provjera), a `node --test scripts/check-docs-content.test.mjs` **9/9**. Isolated-integration registry/harness test je **3/3**; ovo ne predstavlja izvršavanje real PostgreSQL suitea. `git diff --check` je prošao.
- Cijeli `npm run lint` backend je **passed** bez grešaka; prijavio je 3 ESLint warninga u postojećem, nepovezanom `src/modules/sla/sla-scan-failure-quarantine.spec.ts`. Ciljani Jest za `service-catalog.service.spec.ts` nije izvršio testove (0 tests) jer nedostaje generated Prisma `src/generated/prisma/enums`; nije test-assertion failure.
- Lokalni `npm run build` nije mogao typecheckati BA-08: checkout nema generated Prisma Client (`src/generated/prisma/client`), pa je build završio sa 3.390 nedostajućih-client/delegate dijagnostika. `npm run db:generate` je pokušao Prisma schema-engine download, ali TLS pristup `binaries.prisma.sh` nije uspio. Lokalni typecheck zato ostaje ograničen; generated-Prisma CI rezultat i tačan TS2322 uzrok opisani su niže.
- Lokalni real PostgreSQL suite nije pokrenut: `DATABASE_URL`, `E2E_DATABASE_URL` i `PRIVACY_IT_DATABASE_URL` su unset; target DB nije korišten, niti je lokalna migracija pokrenuta. Follow-up CI `41637047743` na `0c4da3d8` je izvršio real PostgreSQL/Redis integration job (uključujući registrovani BA-08 suite) i job je **passed**. E2E nije pokrenut; spec 56/prag `250 ms` nisu mijenjani.
- Prvi BA-08 CI [`41636094640`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41636094640) na `c9a59de1` bio je **failure**: TS2322 je pokazao da je `$queryRaw` nedostajao u eksplicitnoj strukturi onboarding lažnog Prisma klijenta. Perf [`41636094688`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41636094688) pao je na `Build the API`; k6 nije pokrenut. Follow-up `0c4da3d8` je omogućio generated-Prisma build i lint, ali je full Jest **failure**: `loadServiceDowntimeSummary.spec.ts` očekivao je 2 prozora, dobio 0; `service-catalog.availability.spec.ts` očekivao je `SCHEDULED_DOWNTIME`, dobio `CURRENTLY_AVAILABLE`. Obje postojeće in-memory test putanje su pogrešno prešle na SQL projekciju jer je `$queryRaw` bio izložen na top-level lažnom Prisma klijentu.
- CI [`41637047743`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41637047743) na `0c4da3d8` imao je generated-Prisma backend build, backend lint, ranije blokirani testni skupovi, API/worker wiring i SLA matrix **passed**. Real PostgreSQL/Redis integration, uključujući BA-08 race suite, backend container/supply-chain, frontend build/test i Docs guard su **passed**. Conditional image-enforcement, E2E install/critical i read-only inventory bili su **skipped**. U tom runu backend full Jest i CI gate su bili **failure** zbog dvije gore navedene regresije; ovaj problem je riješen u narednom commit-u `5415f502`.
- Follow-up popravka ne izlaže `$queryRaw` na glavnom in-memory Prisma fakeu: stub postoji samo na kopiji transakcijskog klijenta koja se predaje interaktivnoj transakciji. Time se čuva in-memory fallback za downtime projekcije, a category lock i dalje dobija query stub; timeout mapping test ostaje ciljano pokriven.
- Finalni CI [`41638462836`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41638462836) na `5415f502` je **success**: generated-Prisma backend build, backend lint, full Jest, ranije blokirani testni skupovi, wiring/SLA provjere, real PostgreSQL/Redis integration (uključujući BA-08 race suite), frontend build/test, docs, container/supply-chain i CI gate su **passed**. E2E install/critical i read-only inventory bili su **skipped**; conditional image-enforcement korak je također **skipped**. Nema browser/spec 56 sign-offa.
- Perf smoke [`41638462783`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41638462783) na istom SHA-u je **success**: service-catalog p95 **32.65 ms** (max **476.90 ms**), payload **111.16 KB**, contract failures **0**; search p95 **409.69 ms**, ticket-message p95 **754.26 ms**. Query-budget avg **2.091/2.1** preko **48,145** zahtjeva (p95 **7**, max **34**); svi K6 pragovi su **passed**. Prag speca 56 `250 ms` nije korišten kao waiver niti je mijenjan.
- `npm ci` je prošao, ali npm je prijavio 38 dependency vulnerabilities (1 low / 37 moderate); lockfile nije mijenjan i to nije BA-08 scope.
- Acceptance kodovi su potvrđeni: `CIRCULAR_CATEGORY` ostaje HTTP 400, a advisory-lock timeout vraća 503 `CATEGORY_TREE_LOCK_UNAVAILABLE`. Generated-Prisma build/full Jest, real PostgreSQL suite i Perf smoke su prošli; BA-08 ipak ostaje otvoren dok korisnik ne donese zasebnu statusnu odluku.

## Status i sljedeći korak

BA-08 je **tehnički implementiran i validiran**: CI build/lint/full Jest i real PostgreSQL integration, te Perf smoke su passed. E2E/install/critical i read-only inventory su skipped; conditional image enforcement je skipped; nema spec 56 sign-offa. Nalaz ostaje **otvoren** isključivo zato što nije data zasebna statusna dozvola za zatvaranje. Nema PR-a prema `master`, mergea ili deploymenta. BA-07 je zatvoren; BA-09 i svi ostali nalazi ostaju otvoreni/nepromijenjeni.
