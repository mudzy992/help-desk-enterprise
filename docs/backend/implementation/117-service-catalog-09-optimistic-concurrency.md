# Implementacijski checkpoint — `BA-service-catalog-09` (završni status u closeoutu 118)

**Paket:** audit 15 / `service-catalog` — optimistic concurrency za service/category izmjene<br>
**Nalaz:** `BA-service-catalog-09` (P2) — **zatvoren owner-directed 2026-11-03**; ovaj dokument čuva historijski checkpoint prije closeouta<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odluka pri početku:** korisnik je 2026-11-03 odobrio BA-08 closeout i naložio početak BA-09; kasnija BA-09 statusna odluka i evidence su u [118 closeoutu](118-service-catalog-09-owner-directed-closeout.md)<br>
**BA-08 prethodni status:** zatvoren owner-directed nakon zelenih CI/Perf runova `41638462836` / `41638462783` na `5415f502`; closeout je u [116 checkpointu](116-service-catalog-08-category-parent-cycle-race.md)<br>
**Kontrolni zbir na BA-09 početnom checkpointu (historijski):** deklarisano 559 otvoren / 133 zatvoren / 692 ukupno; machine-readable 562 otvorena / 119 zatvorenih / 11 historijskih; `service-catalog` 4 otvorena / 11 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana; nakon BA-09 closeouta ažurirani zbir je naveden u [118](118-service-catalog-09-owner-directed-closeout.md).<br>
**Schema / ciljna baza u tom checkpointu:** Prisma schema i aditivna migracija `20271030130000_service_catalog_optimistic_revisions` dodani su u radno stablo; tada nije bilo lokalne primjene migracije, konfiguriranih `DATABASE_URL`/`E2E_DATABASE_URL` ni pristupa ciljnoj bazi. Kasniju korisnikovu prijavu primjene migracije i ograničenje nezavisne provjere bilježi [118 closeout](118-service-catalog-09-owner-directed-closeout.md).<br>
**Acceptance:** optimistic `revision` + strong `If-Match`, atomic compare-and-swap, stale-write konflikt i committed before/after change-log snapshot; detalji su ispod.

## Nalaz i početni pregled

Audit 15 nalazi da service, category, lifecycle i availability update putanje mogu raditi read-check pa bezuslovan write. Dva administratora koji uređuju isti prethodno učitan zapis mogu zato tiho pregaziti jedan drugog. Dio change logova dodatno gradi `before` iz čitanja prije transakcije, pa pri utrci može evidentirati snapshot koji nije bio neposredno prethodni zapisani sadržaj.

Početni code review potvrdio je:

- `updateService` čita i validira servis prije transakcije, zatim radi unconditional `service.update`;
- `transitionServiceLifecycle` i `updateServiceAvailability` također rade read pa unconditional update unutar naknadne transakcije;
- `updateServiceCategory` već koristi BA-08 hierarchy advisory lock, ali još nema caller revision precondition;
- response tipovi već izlažu `updatedAt`, ali nijedna od ovih HTTP mutacija ne zahtijeva `If-Match`;
- postojeći `OptimisticConcurrencyService` već standardizira strong `"vN"`, 428 missing-precondition, 400 malformed, 412 stale-write i trenutni ETag u odgovoru; BA-09 će ga koristiti.

## Kriteriji prihvata

1. `Service` i `ServiceCategory` dobijaju additive pozitivan integer `revision`, početna vrijednost `1`; postojeći zapisi ostaju čitljivi bez backfill upisa. Svaki write na servis koji može promijeniti API vidljivo stanje mora rotirati revision, uključujući API, onboarding, config apply, policy-pack i install/seed putanje.
2. Service i category response/list stavke izlažu revision, a pojedinačni GET i uspješni create/update odgovori emituju strong `ETag: "vN"`.
3. `PATCH /services/:serviceId`, `POST /services/:serviceId/lifecycle`, `PATCH /services/:serviceId/availability`, `PATCH /services/:serviceId/onboarding/service` i `PATCH /service-categories/:serviceCategoryId` zahtijevaju tačno jedan strong `If-Match: "vN"`.
4. Missing precondition vraća `OPTIMISTIC_PRECONDITION_REQUIRED` / HTTP 428; malformed/weak/wildcard/multi-value token vraća `OPTIMISTIC_IF_MATCH_INVALID` / HTTP 400; stale writer vraća `OPTIMISTIC_STALE_WRITE` / HTTP 412 uz aktuelni ETag. Mutacije koriste atomic `WHERE id = ? AND revision = expected` i uspješno povećavaju revision tačno jednom.
5. Service metadata, lifecycle i availability koriste isti service revision, pa se izmjene različitih polja međusobno ne mogu tiho pregaziti. Category update koristi zaseban category revision i zadržava BA-08 hierarchy lock.
6. Uspješan CAS, business write i change log su u istoj transakciji. `before` dolazi iz revision-a koji je CAS pobijedio, `after` iz committable write-a; stale gubitnik ne ostavlja change log niti parcijalni side effect.
7. Frontend service/category/lifecycle i onboarding service edit putanje šalju revision koji su stvarno učitale; stale konflikt prikazuje lokalizovanu poruku i zahtijeva refresh prije novog pokušaja.
8. Unit/controller testovi pokrivaju header/error ugovor i stale CAS; real PostgreSQL suite koristi odvojene klijente sa istim ETag-om, dokazuje najviše jedan uspješan upis, jedan 412, tačan revision i tačan audit snapshot.
9. U trenutku checkpointa, bez BA-routing-02 izmjene, zatvaranja drugih nalaza, speca 56/praga `250 ms` ili W7.15 hard-delete/event-archival izmjene; BA-09 je tada ostao otvoren do provjera i zasebne statusne odluke. Ta historijska odluka je kasnije supersedena owner-directed closeoutom 118.

## Status i validacija u trenutku checkpointa (prije closeouta)

U trenutku ovog checkpointa `BA-service-catalog-09` je bio **otvoren; implementacija u toku**. Taj status je supersediran owner-directed closeoutom 2026-11-03, poslije zelenog CI runa `41662410362` i korisnikove prijave uspješnog redeploya i primijenjene migracije. CI/Perf detalji, jasna evidencija `skipped` poslova i napomena da redeploy/migracija nisu nezavisno provjereni nalaze se u [118 closeoutu](118-service-catalog-09-owner-directed-closeout.md). Schema/migracija, atomic revision CAS za service/category mutacije, shared service revision za lifecycle/availability, response revision/strong ETag i `If-Match` kontroleri, direktni service-writer revision increments (uključujući onboarding service-step CAS/If-Match), stale-write greške te frontend revision propagacija i lokalizacija bili su implementirani. Pozitivni safe-integer response parseri su povezani sa service/category create/update i category detail/list putanjama; `getService` ostaje bez parsera prema ranijoj prihvatljivoj odluci.

Lokalna validacija:

- Frontend ciljano: **5 Vitest fajlova / 18 testova passed**; `npx tsc -b --pretty false`, ciljani ESLint/Prettier i `npm run i18n:check` su passed.
- Backend ciljani ESLint: **passed**. Zajednički `OptimisticConcurrencyService` primitive Jest suite: **12/12 passed**. `node scripts/check-migration-policy.mjs` validirao je 103 migracije; policy testovi **2/2 passed**.
- U tom checkpointu `node scripts/check-backend-findings.mjs` je passed za **692/692** nalaza; registry testovi **13/13 passed**. Tada je BA-08 bio `zatvoreno`, a BA-09 `otvoreno` u sinhronizovanom machine-readable planu; BA-09 status je poslije ažuriran na `zatvoreno` owner-directed (118).
- BA-09-specific backend service/controller Jest suite-i pokušani su, ali nisu izvršili nijedan test: lokalni generisani Prisma Client nedostaje. Zasebni shared `OptimisticConcurrencyService` primitive suite je passed **12/12**. Prisma CLI pokušaj je zapeo pri TLS preuzimanju schema enginea sa `binaries.prisma.sh`; taj host trenutno nije dostupan u sandboxu. Zato BA-09 service/controller testovi nisu označeni kao passed.
- U tom trenutku real PostgreSQL integration suite, migracijski replay na disposable PostgreSQL i cijeli CI nisu lokalno pokrenuti. Tada nije korištena ciljna baza, migracija nije bila primijenjena u lokalnom checkoutu i nije bilo database writea iz ovog checkpointa.

**Historijski sljedeći korak:** ponoviti generated-Prisma backend suiteove i integraciju na disposable PostgreSQL CI bazi. To je kasnije ispunjeno u CI `41662410362`; target migration/redeploy je korisnik prijavio, ali nisu nezavisno provjereni. BA-09 closeout i owner-directed statusna odluka su u [118](118-service-catalog-09-owner-directed-closeout.md). Ostali statusi, BA-routing-02, spec 56/prag `250 ms` i W7.15 fail-closed hard-delete/event archival ponašanje nisu mijenjani.
