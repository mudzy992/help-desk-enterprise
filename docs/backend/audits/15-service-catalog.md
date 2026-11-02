# Backend audit 15 — `service-catalog`

**Status:** audit završen; implementacija Faze 0 u toku — samo `BA-service-catalog-10`<br>
**Datum audita:** 2026-10-23<br>
**Ažurirano:** 2026-11-02<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **5,23/10**<br>
**Nalazi:** 4 P1, 8 P2, 3 P3

## 1. Executive summary

`service-catalog` upravlja kategorijama, servisima, lifecycleom, verzioniranim formama, availability statusom i downtime prozorima. Modul ima dobru funkcionalnu osnovu: strict DTO pipeline, odvojene write permisije, service scope na mutacijama postojećih servisa, lifecycle vidljivost po ulozi, DB unique slug/version ugovore, historijsko vezivanje ticketa za `formVersionId` i transakcijski change log za većinu mutacija.

Baseline je ipak **5,23/10**. Četiri P1 nalaza pogađaju integritet, dostupnost i operativnost. Draft forma može postati korištena između immutable provjere i updatea, pa se schema historijskog ticketa retroaktivno mijenja. Config-versioning direktno prepisuje schema/status postojećih formi i zaobilazi immutable/lifecycle/multiple-active invariante. Administrator može konfigurirati regularni izraz sa katastrofalnim backtrackingom, a svaki prijavljeni requester ga pokreće nad vlastitim inputom. Aktivacija servisa nasljeđuje routing “any rule” provjeru i može objaviti servis dok relevantni OU-ovi ostaju `UNROUTED`.

Dodatno postoje race aktivacije i numerisanja formi, preklapajući downtime prozori, category ciklusi, silent last-write-wins, neograničene liste i nedosljedan audit-reason ugovor. Nema P0. Cijeli backend audit ciklus je završen; aktivni implementacijski scope je samo `BA-service-catalog-10` (P2), dok ostali nalazi ostaju nepromijenjeni i izvan paketa.

## Aktivni implementacijski ulaz — `BA-service-catalog-10` (2026-11-02)

Odobreni paket obuhvata samo nalaz 10: bounded/paginirani service, list, form i downtime readovi uz stabilan response envelope, vremenski period za downtime i projekciju/summary umjesto punih schema/related podataka. Ostali nalazi 01–09 i 11–15 ostaju izvan scopea. Nalaz 10 ostaje `otvoreno` dok se svi acceptance kriteriji iz sekcije 17 ne dokažu.

Faza 0 je započeta pregledom audit plana, relevantnih frontend putanja i CI dokaza. Run [`41317644590`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41317644590) na SHA `6606ce475fd08092dbe863fd714b09ba2d236b77` prošao je assets specs 25/28 **8/8**, ali E2E suite je imao **11 passed / 1 failed**: spec 56 keyboard-surfaces timeoutovao je nakon 90 sekundi, pa su E2E critical flow i gate pali. Run [`41325198062`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41325198062) na istom SHA imao je **3 passed / 1 failed / 0 flaky / 0 skipped**; neuspjeh speca 56 `/services` bio je **292 ms prema 250 ms**, pa su E2E i gate pali. Full scheduled run [`41283381903`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41283381903) na starijem SHA `24ed17a0a347d0205ef5f0b4496e5830ed2e250e` zabilježio je `/services` **359 ms** i nije bio zelen. Ovo su gate činjenice, ne dokazana uzročna analiza; test 56, njegova očekivanja i prag ostaju nepromijenjeni.

**Lokalni napredak 2026-11-02 — BA-10 ostaje otvoren.** Implementacijski diff obuhvata: (1) `/services` default 50/max 100, cursor-straničenje sa stabilnim sortiranjem i filter-bound cursorom, `total`/`hasMore`, server-side filterima i response-byte limitom; katalog UI učitava 50 po strani i prestaje na 500 redova, a frontend collector unit test modelira 500 stavki kroz pet 100-item stranica (nije DB/load fixture); (2) kategorije imaju cursor-envelope, default 50/max 100 i response cap, a frontend agregacija staje na 1.000; (3) historija formi ima default 20/max 50, cursor i tačan total, ticket count se čita kroz projekciju umjesto sekvencijalnog N+1, aktivna forma se za catalog summary projektuje na identitet/broj polja, a ticket-create dobija poseban read jedne aktivne scheme; builder učitava najviše 25 stranica/500 verzija i eksplicitno prikazuje limit; (4) downtime lista ima period-overlap filter, period najviše 730 dana, cursor vezan za servis i period, default 50/max 100, exact total/hasMore i response cap; runtime service readovi učitavaju najviše jedan aktivni i najbliži upcoming prozor po servisu uz agregirani upcoming count, a overlap provjera traži najviše jedan konfliktni red. Za BA-10 nema schema promjene ni migracije.

**Lokalna verifikacija na checkpointu prije rebase-a:** frontend full suite `npm test` — **430 suites / 1.668 tests passed**; `npm run build` i `npm run i18n:check` (8.914 locale keys, 4.558 statičkih `t()` keys, 88 dynamic prefixes) su prošli, a ciljani ESLint je prošao za backend service-catalog i relevantni frontend. Prettier check je prošao za izmijenjene/dodane BA-10 backend source i relevantne frontend fajlove; širi check nad cijelim backend modulom uključuje baseline razlike. Backend standardni Jest pokušaj (5 suites, 0 testova izvršeno) nije mogao kompajlirati jer checkout nema generisani `src/generated/prisma/enums`. `npm run build` je **pao**: Nest/TypeScript je prijavio **3.380 grešaka**, počevši od nedostajućeg `src/generated/prisma/client`; bez generisanog klijenta kaskadne delegate/type greške ne mogu se razdvojiti od stvarnih tipnih problema. Prisma schema-engine download/help pokušaj je blokiran TLS pristupom `binaries.prisma.sh`. Dodatno je pokrenuto **22 lokalna logic-smoke testa / 5 suites** preko privremenog generated-client stuba i `ts-jest` transpile-only; svi su prošli, ali to **nije** zvanična backend typecheck/Jest potvrda i privremeni stubovi su uklonjeni. Nema target-DB pristupa ni BA-10 migracije. E2E/Perf nisu pokrenuti; lokalni browser E2E je blokiran nedostupnim `e2e/.env` i Docker executable. Prethodni CI run `41329745071` na SHA `5be8591cc2ef51875575bf51601b0a61ee6f420d` imao je backend, frontend, PostgreSQL/Redis integration, docs, container/supply-chain i CI gate **passed**, E2E critical/install jobove **skipped**, Perf **not run**; taj SHA ne uključuje BA-10 izmjene.

**Provjere nakon rebase-a 2026-11-02 na checkpoint SHA `1b5b0422ab6882fd39164a3185e9b6fc64f8a34f`:** frontend full suite ponovo je prošao (**430 suites / 1.668 tests**), frontend build i i18n check su prošli, a ciljano ESLint je prošao za BA-10 backend service-catalog i relevantni frontend. U `e2e` je `npm ci` instalirao 24 paketa bez prijavljenih ranjivosti, a `npx tsc --noEmit` prošao je za helper/spec TypeScript. Browser E2E i Perf nisu pokrenuti: `e2e/.env` i Docker nisu dostupni. Standardni backend Jest/build nisu ponavljani nakon rebase-a; postojeća blokada ostaje nedostajući generated Prisma Client, dok je targeted backend ESLint prošao. `git diff --check` prošao je nakon razrješavanja konflikata. Ova provjera ne daje database/load profil niti CI acceptance.

**CI push run `41415377244` na SHA `bc0f83a662850b08587209586b4c093cad089a9b`: `failure`.** `Detect changes` i `Docs guard` prošli su. `Frontend build + test` je prošao (uključujući lint, Prettier, full frontend testove, build i bundle budget). `Backend build + test` pao je na `Verify route/guard and root-module wiring snapshot`; schema validation, Prisma client generation i generated-artifact guard prije toga su prošli, a wiring tests, backend build/lint/Jest i ostali kasniji koraci su `skipped`. `Backend container + supply chain` prošao je static Docker/Compose checks, guard tests, Compose model i dependency audit, ali je pao na `Build the digest-pinned production runtime image`; SBOM, vulnerability scan/enforcement i attestation koraci su `skipped`. `Backend PostgreSQL + Redis integration` prošao je Redis TLS/stalled-recovery provjere, generisanje Prisma Clienta, migration policy/role/replay/privilege/history provjere, ali je pao na `Verify deployment-wide connection budget`; backup/restore, harness i PostgreSQL integration suites su `skipped`. Taj korak izvršava `npm run build && ... db:budget:check`; sa zadanim ulazima iz workflowa formula daje 102/120 konekcija, ali raw log se nije mogao preuzeti (`gh run view --log-failed` završio je `EOF`), pa nije potvrđeno koji podkorak je pao. `CI gate` je pao; `E2E critical flows` i `E2E install wizard` su `skipped`; Perf nije pokrenut.

Nakon tog runa commit `ab385a40359ffb92fcfb2372ba717dd0738c06fd` osvježio je `docs/backend/backend-wiring-manifest.json` za `ServiceFormsController.getActiveForm` (`GET /services/:serviceId/form/active`), čime snapshot sada sadrži **619 ruta / 599 authenticated**; lokalni `npm run wiring:check` prolazi. Nema CI run-a na SHA `ab385a4…` jer push sadrži samo `docs/**`, koje workflow namjerno `paths-ignore`-uje. Pokušaj ručnog workflow dispatcha za specs `42,56` uz uključene gates odbijen je HTTP `403 Resource not accessible by integration`; zato nema targeted E2E rezultata na aktuelnom checkpointu. Run `41415377244` prethodi manifest korekciji i ne predstavlja post-fix CI acceptance.

Uzročnost speca 56 nije profilisana niti potvrđena. Nisu mijenjani spec 56, njegov prag od 250 ms ni njegova očekivanja; nema dokaza da nova lokalna paginacija rješava 292 ms/timeout. Preostaju standardni backend build/Jest sa stvarnim generisanim Prisma Clientom, DB query-plan/row/byte/time verifikacija nad kontrolisanim 500/100k-service fixtureom i relevantni E2E/Perf na finalnom SHA. API DB pool default `statement_timeout=5.000 ms` (`DB_STATEMENT_TIMEOUT_MS` configurable do 600.000 ms) je globalni limit po SQL statementu, ne BA-10 end-to-end request budget; stvarno trajanje requesta nije izmjereno. Ne zatvarati nalaz na osnovu privremenog stuba ili CI poslova koji nisu E2E acceptance.

**Rollout/rollback i scope:** nema deploya, target-DB pristupa ni BA-10 migracije za rollback. Promijenjeni response-envelope-i zahtijevaju zajednički rollout/rollback backend API-ja i frontend potrošača. Korisnik je izričito odobrio checkpoint i push svih tadašnjih 239 status-entries na Arena grani, dok BA-10 ostaje otvoren; taj nalog ne mijenja acceptance niti zatvara susjedne nalaze. Registry brojevi/statusi nisu mijenjani, nalazi 01–09 i 11–15 ostaju izvan scopea, a naredni scope ostaje isključivo `BA-service-catalog-10`. Ne otvarati PR prema `master` bez tri zasebna eksplicitna odobrenja.

## 2. Scope i inventar

- 124 produkcijska TypeScript fajla;
- 23 direktna speca;
- 6.241 aktuelna fizička produkcijska LOC;
- 4 kontrolera i 6 injectable servisa/configuration loadera;
- Prisma `ServiceCategory`, `Service`, `ServiceDowntimeWindow`, `FormVersion` i `ServiceOnboarding`;
- integracije sa tickets, routing, SLA, approvals/policy packs, incidents/status-page, changes, onboarding, install, config-versioning, teams i knowledge portalom;
- E2E 42 kao primarni catalog CRUD/onboarding dokaz, uz 02, 15, 34, 52, 53 i 56.

HTTP površina obuhvata category CRUD, service CRUD/list/lifecycle, form create/version/get/update/activate, availability update, downtime CRUD i ticket-creation eligibility.

## 3. Arhitektura i poslovni tok

Servis pripada kategoriji, opcionalno SLA profilu i policy packu. Lifecycle `DRAFT → ACTIVE → DEPRECATED` određuje vidljivost i ticket-create eligibility; aktivacija zahtijeva aktivnu formu i poziva routing coverage warning. Ticket create bira eksplicitnu ili najnoviju aktivnu verziju, parsira schemu, validira `formData`, pa u ticket transakciji čuva stabilni FK na form version.

Availability response kombinuje sačuvani status, aktivni downtime prozor i public incident impact. Namjerno ne blokira ticket create: `ticketCreationAllowed` je uvijek true i status služi za informaciju. Downtime može nastati ručno ili iz scheduled change integracije.

Config-versioning snapshot skuplja sve servise i forme te pri aktivaciji direktno updateuje postojeće redove po ID-u. Upravo taj bypass je najveća cross-module rupa.

## 4. API, permission i scope matrica

| Površina                            | Guard                                      | Scope                                | Zaključak                                                  |
| ----------------------------------- | ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- |
| `POST /services`                    | ADMIN + `service.catalog.write`            | nema service scope za novi resurs    | scoped assignment može globalno kreirati                   |
| service update/lifecycle/delete/get | role/permission prema ruti                 | `serviceId` scope                    | dobro za postojeći servis                                  |
| `GET /services`                     | user/agent/admin                           | lifecycle filter, bez service scopea | javni aktivni katalog namjeran; admin draft lista globalna |
| category CRUD                       | ADMIN; write permission na mutaciji        | kategorije su globalne               | scoped catalog writer ima globalni category write          |
| form write/read                     | dedicated write + service scope; role read | service scope                        | dobra osnovna izolacija                                    |
| availability/downtime write         | dedicated write + service scope            | service scope                        | dobra osnovna izolacija                                    |
| category/list downtime read         | ADMIN role, bez dedicated read prava       | global/category ili service scope    | role-only read ugovor                                      |

Requesteri vide samo ACTIVE, agenti ACTIVE/DEPRECATED, a admini sva stanja. Skriveni single service/form vraća not-found. Međutim administrativni list svih draftova ne filtrira service assignment scope.

## 5. Podaci, transakcije i konkurencija

DB ima unique `Service.slug`, `ServiceCategory.slug` i `(FormVersion.serviceId, version)`. FK relacije uglavnom koriste Restrict/SetNull/Cascade prema poslovnom smislu. Write i change log su najčešće u istoj transakciji.

Concurrency ugovor je slab:

- create prve forme radi `count == 0`, pa create version 1;
- nova verzija čita max, pa create `max + 1`;
- aktivacija prvo retires trenutno aktivne, pa aktivira draft bez service locka;
- immutable provjera broji tickete prije transakcije;
- downtime overlap provjera učitava prozore prije writea;
- category ancestor provjera prolazi lanac prije updatea;
- service/category/lifecycle/availability update je bez version/`updatedAt` preconditiona.

Unique constraint spriječi fizički duplikat verzijskog broja, ali caller dobija provider grešku. Ne postoji DB invariant “najviše jedna ACTIVE forma po servisu” niti overlap exclusion.

## 6. Form schema, validacija i sigurnost

Parser ograničava 64 polja, ID, label, help text, 64 opcije i pattern dužinu na 256 znakova; odbacuje unknown keys, duple ID/order i type-mismatched validation. Ticket validator odbacuje nepoznata data polja i provjerava required/type/range/options.

`pattern` se ipak samo kompajlira sa `new RegExp`. Nema safe-regex analize, timeouta niti RE2 enginea. Requester kontroliše tekst; obrazac poput ugniježđenog kvantifikatora može blokirati Node event loop već na malom inputu. `maxLength` nije obavezan, pa nema ni schema-level gornje granice teksta prije regex izvršenja.

Email provjera je samo `includes('@')`; to je kvalitet validacije, ne sigurnosna granica. Number validator prihvata numeric string, dok se originalna vrijednost ne normalizuje prije persistencea, pa forma može čuvati različite JSON tipove za semantički isti broj.

## 7. Lifecycle, availability i downtime

Lifecycle transition provjerava enabled/allowed transition i aktivnu formu. Routing activation coverage je samo warning, a upstream routing implementacija smatra servis pokrivenim ako postoji bilo koje pravilo. Tako ACTIVE servis može ostaviti druge relevantne OU-ove bez handlera.

Runtime availability korektno bira najnoviji aktivni i najbliži upcoming downtime, kombinuje incident impact bez prepisivanja stored statusa i koristi poluotvoreni vremenski interval. `autoRestoreOperational` se učitava, ali nije potreban jer status nije fizički prepisan tokom downtimea.

Manual downtime overlap je aplikacijska provjera bez concurrency zaštite. Change-schedule integracija je best-effort: `syncDowntime`/`release` gutaju grešku i samo loguju warning, pa scheduled change može završiti bez očekivanog maintenance prikaza. Nema durable retry/reconciliation veze između change lifecyclea i downtime reda.

## 8. Categories, listing i performance

Category parent walker detektuje postojeći ciklus i self-parent, ali paralelne promjene mogu zajedno napraviti ciklus. Missing ancestor se tretira kao kraj lanca (`ancestor?.parentId ?? null`), pa postojeća korupcija ne proizvodi integrity alarm.

Na baseline snapshotu audita (2026-10-23), `GET /services`, categories, downtime windows i form versions nisu imali paginaciju. Service list je učitavao sve vidljive servise i zatim paralelno sve downtime prozore, open-ticket groupBy, incidente, aktivne forme/schema JSON, kategorije i onboarding. Aktivna forma summary učitavala je kompletnu schema vrijednost samo da izbroji polja. Na velikom katalogu nije bilo row/byte/time budgeta; lokalni BA-10 napredak iz 2026-11-02 je opisan u aktivnom ulazu na vrhu dokumenta.

Incident impact read namjerno fail-open vraća “nema incidenta” na svaku DB grešku. Time katalog/status može prikazati OPERATIONAL tokom stvarnog incidenta bez health signala.

## 9. Config-versioning, install i downstream integracije

Config snapshot sadrži service i form redove. `applyCatalogSnapshot` direktno updateuje service slug/category/lifecycle/status i form schema/status. Ne poziva catalog/form domenske invariante, ne provjerava da forma ima ticket, ne osigurava single-active i ne proizvodi per-entity catalog change log. Snapshot validator provjerava parsabilnu schemu i “barem jedna ACTIVE” za aktivni servis, ali ne detektuje više aktivnih verzija, immutable schema drift ili nedozvoljen lifecycle transition.

Install/blueprint putanje ponovo koriste dio helpera i pišu change log, ali imaju zasebne persistence tokove, pa parity mora imati integration test. Onboarding takođe poziva low-level update/validation funkcije. Tickets korektno čuva form FK u istoj ticket create transakciji, ali izbor/validacija forme prethodi transakciji i oslanja se na stabilan ACTIVE status.

## 10. Testovi i E2E dokaz

Baseline audit test pokušaj od 2026-10-23 (ne predstavlja verifikaciju aktuelnog BA-10 diffa):

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/service-catalog -name '*.spec.ts' -print | sort)
```

Rezultat tog pokušaja: **4/23 suitea prošla, 19/23 compile-blocked; 15/15 stvarno izvršenih testova prošlo**. Blokada je nepotpun generated Prisma client/enumi i delegati (`serviceCategory`, `ticket`, `group`, `serviceIncidentService`, `$transaction`). Nijedan izvršeni test nije pao.

Izvršeni testovi dokazuju dio schema/form-data i downtime range pure logike. Statički postoje CRUD/lifecycle/availability/auth compatibility testovi, ali nema concurrent activation/version/update, immutable ticket race, regex adversarial, config rollback invariant, downtime reconciliation, category cycle race ni large-catalog testa.

E2E 42 pokriva create/edit/delete draft servisa, onboarding, lifecycle/routing UX i responsive katalog. E2E 52/53 potvrđuju blueprint katalog, a 56 frontend closeout. Korisnikov potvrđeni Playwright 01–56 prolaz ne dokazuje race/failure/security/load matricu.

## 11. Pozitivni nalazi

1. Strict ValidationPipe i whitelist na svim controllerima.
2. Odvojene catalog/forms/availability write permisije.
3. Service scope na mutacijama postojećeg servisa, formi i downtimea.
4. Lifecycle-based fail-closed vidljivost drafta.
5. Stabilni ticket → form-version FK čuva namjeru historijskog modela.
6. DB unique slug i service/version ugovori.
7. Većina write + change-log operacija je transakcijska.
8. Schema parser ima field/option/label/pattern count/length limite.
9. Server odbacuje unknown form-data keys.
10. Aktivacija servisa zahtijeva aktivnu formu.
11. Incident STAFF_ONLY se ne izlaže requester katalogu.
12. Open-ticket count koristi DB groupBy, ne N+1 count.
13. Service list batch učitava related podatke, bez per-service onboarding GET-a.
14. Availability je informativna i dosljedno ne blokira request tokom incidenta.

## 12. Registar nalaza

| ID                    | Severity | Nalaz                                                                                          | Status   |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------- | -------- |
| BA-service-catalog-01 | P1       | Form schema se može izmijeniti nakon što je ticket veže zbog TOCTOU immutable provjere         | otvoreno |
| BA-service-catalog-02 | P1       | Config activation/rollback zaobilazi form/lifecycle invariante i historijsku immutable zaštitu | otvoreno |
| BA-service-catalog-03 | P1       | Admin regex pattern omogućava requester-triggered catastrophic backtracking/ReDoS              | otvoreno |
| BA-service-catalog-04 | P1       | ACTIVE lifecycle prihvata parcijalnu routing coverage i ostavlja OU-ove unrouted               | otvoreno |
| BA-service-catalog-05 | P2       | Concurrent form activation može ostaviti više ACTIVE verzija                                   | otvoreno |
| BA-service-catalog-06 | P2       | First/version create race vraća provider grešku i nema stabilan idempotency/conflict ugovor    | otvoreno |
| BA-service-catalog-07 | P2       | Downtime overlap invariant nije concurrency-safe                                               | otvoreno |
| BA-service-catalog-08 | P2       | Concurrent category parent update može napraviti ciklus                                        | otvoreno |
| BA-service-catalog-09 | P2       | Service/category/lifecycle/availability updatei su silent last-write-wins                      | otvoreno |
| BA-service-catalog-10 | P2       | Service/list/form/downtime readovi su neograničeni i resource-unbounded                        | otvoreno |
| BA-service-catalog-11 | P2       | Change-owned downtime sync je best-effort bez durable retry/reconciliationa                    | otvoreno |
| BA-service-catalog-12 | P2       | Scoped catalog writer može globalno kreirati servise/kategorije i vidjeti sve admin draftove   | otvoreno |
| BA-service-catalog-13 | P3       | Category/lifecycle/form mutacije nemaju dosljedan caller-supplied reason ugovor                | otvoreno |
| BA-service-catalog-14 | P3       | Incident read fail-open tiho prikazuje zdrav servis na DB grešci                               | otvoreno |
| BA-service-catalog-15 | P3       | Kritična concurrency/security/config test matrica nije izvršiva ni kompletna                   | otvoreno |

## 13. Detalji P1 nalaza

### BA-service-catalog-01 — Historijska forma nije stvarno immutable

`updateServiceFormVersion` učita formu, izbroji tickete, zatim tek u kasnijoj transakciji radi bezuslovni update schema JSON-a. Ticket create može vezati isti draft/ACTIVE red između counta i updatea. Posljedica je retroaktivno drugačije značenje već sačuvanog `formData`, prikaza i audit dokaza. Potreban je row/version lock ili conditional update zajedno sa `NOT EXISTS(ticket)` preconditionom; ticket binding i status/schema policy moraju dijeliti isti concurrency protokol.

### BA-service-catalog-02 — Config apply zaobilazi domenu

`applyCatalogSnapshot` direktno mijenja schema/status i service lifecycle. Može izmijeniti korištenu formu, napraviti više ACTIVE verzija, aktivirati servis bez valjane tranzicije/coverage ili promijeniti immutable slug. Validator to ne sprječava. Snapshot mora nositi očekivane verzije/hash, validirati puni domain invariant i primijeniti kroz dedicated bulk policy; immutable historijski red se ne mijenja nego se kreira nova verzija.

### BA-service-catalog-03 — Regex ReDoS

Pattern dužina 256 nije zaštita od ugniježđenih kvantifikatora. `validateServiceFormData` sinhrono izvršava JavaScript regex nad requester tekstom bez sigurnog enginea/timeouta i bez obaveznog maxLengtha. Koristiti RE2 ili strogi safe-regex subset, obavezni input byte cap i adversarial latency test; postojeće nesigurne pattern-e klasificirati prije enforcea.

### BA-service-catalog-04 — Aktivacija ne dokazuje routing coverage

Service lifecycle poziva poznatu routing provjeru koja broji “postoji bilo koje pravilo”. Warning ne blokira, a relevantni OU skup nije definisan. Aktivni servis zato može uredno biti ponuđen requesterima, ali njihovi ticketi završavaju u unrouted fallbacku. Aktivacija mora koristiti policy-driven coverage matricu iz routing nalaza BA-routing-02, uz eksplicitni auditirani override ako business dozvoli parcijalnu coverage.

## 14. Ostali nalazi i korekcije

- **05:** service-level lock/serializable activation ili DB-enforced active pointer; tačno jedna aktivna verzija kada setting to zahtijeva.
- **06:** atomic counter/retry sa mapiranim conflictom; create-form race mora reloadovati ili vratiti stabilan 409.
- **07:** PostgreSQL exclusion constraint ili service advisory/row lock unutar transakcije.
- **08:** category tree closure/materialized path invariant ili serializable lock cijelog relevantnog lanca.
- **09:** optimistic `updatedAt`/version i `If-Match`; change log mora koristiti committed before snapshot.
- **10:** cursor/take, stable total/hasMore, period filter za downtime i schema projection/summary kolona.
- **11:** durable job/outbox, retry, reconciliation scan i health metric za change bez downtime reda.
- **12:** formalizovati global create/category capability i admin list scope; dedicated global permission ako je namjerno.
- **13:** reason DTO i normalizacija za category, lifecycle, forms i delete; bez hardcoded generičkog razloga na human mutaciji.
- **14:** incident query failure metric/degraded marker; ne predstavljati unknown kao pouzdano OPERATIONAL.
- **15:** generated Prisma/PostgreSQL CI shard i failure/concurrency/load matrica.

## 15. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        6,80 |
| B. API i ugovori             |      12% |        6,20 |
| C. Auth/authz/scope          |      15% |        5,40 |
| D. Poslovna pravila/stanje   |      13% |        4,60 |
| E. Podaci/Prisma/transakcije |      13% |        4,80 |
| F. Sigurnost/privatnost      |      12% |        4,40 |
| G. Async/integracije         |       8% |        4,70 |
| H. Testovi/dokazivost        |      10% |        5,20 |
| I. Operativnost/perf.        |       7% |        5,00 |
| **Ukupno**                   | **100%** | **5,23/10** |

Ponderisani zbir je 5,230 i zaokružen na dvije decimale. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan popravki

### Faza 0 — safety net

Generated Prisma/PostgreSQL fixture; immutable ticket race; dual activation/version create; adversarial regex; config activation/rollback; partial routing coverage; downtime/category/update race; 100k-service load.

### Faza 1 — P1 integritet i sigurnost

Uvesti form row/version concurrency protokol i historijsku immutable zabranu; safe regex engine/subset i input cap; blokirajuću policy-driven routing coverage provjeru.

### Faza 2 — config-versioning granica

Version/hash precondition, puni catalog/forms validator i domain-aware apply. Stare korištene forme nikad ne prepisivati; snapshot activation treba kreirati novu verziju ili odbiti drift.

### Faza 3 — DB invariante i konkurencija

Single-active policy, atomic version allocation, downtime exclusion/service lock, category acyclic strategija i optimistic service/category updates.

### Faza 4 — permission i API ugovor

Global-vs-scoped create/category permission, scope-aware admin list, dedicated read odluka, dosljedan reason i paginirani response envelope.

### Faza 5 — integracije, recovery i performance

Routing/onboarding/install/tickets/change/status/config parity; durable downtime reconciliation; bounded related queries, schema summary i large-catalog query plan.

### Faza 6 — observability i finalni gate

Metrike za invariant conflict, regex rejection/latency, config drift, downtime sync i incident unknown; runbook; svih 23 speca i E2E 42/52/53 plus ticket/routing/config scenariji na finalnom SHA-u.

## 17. Rizik, rollback i acceptance

Najveći rollout rizik su postojeće multiple-active forme, nesigurni patterni i snapshoti koji mijenjaju korištene forme. Prvo napraviti read-only classifier; ne retireati ili prepisivati automatski. Safe-regex uvesti observe pa enforce. Active pointer/version i optimistic kolone su additive. Coverage enforcement prvo mora ponuditi preview missing OU seta.

Globalni acceptance:

1. Schema forme vezane za ticket nikad se ne mijenja.
2. Config activation/rollback ne zaobilazi catalog/forms invariante.
3. Requester input ne može izazvati unbounded regex CPU.
4. ACTIVE servis ima dokazanu obaveznu routing coverage ili eksplicitni auditirani override.
5. Single-active, version allocation, downtime overlap i category acyclic ugovori preživljavaju paralelne writeove.
6. Concurrent update vraća conflict umjesto tihog prepisivanja.
7. Scoped admin nema implicitni global create/category/draft pristup bez policy odluke.
8. Liste i related loadovi imaju page/row/byte/time budžet.
9. Change downtime je retryable i reconciled; incident read kvar je vidljiv.
10. Direktni, integration i relevantni E2E testovi prolaze.

## 18. Traceability i konačna presuda

| Nalaz | Primarni dokaz                            | Faza  |
| ----- | ----------------------------------------- | ----- |
| 01    | count ticket pa unconditional form update | 0–1   |
| 02    | `applyCatalogSnapshot` direct update      | 0–2   |
| 03    | `new RegExp(pattern).test(text)`          | 0–1   |
| 04    | lifecycle + routing any-rule coverage     | 0–1/5 |
| 05–09 | read-check-write concurrency tokovi       | 0–3   |
| 10    | unpaged list + batch related full loads   | 0–4/5 |
| 11    | change sync catch-and-warn                | 0–5   |
| 12    | create/category/list scope matrica        | 0–4   |
| 13–14 | DTO reasons i incident catch              | 0–4/6 |
| 15    | Jest rezultat i nedostajuća matrica       | 0–6   |

Modul ima dobru strukturu, validaciju i historijski form FK dizajn, ali upravo immutable, config, regex i activation granice nisu dovoljno čvrste. Zato je iskren baseline **5,23/10**.

Pretpostavke: schema ticketa je pravni/audit historijski dokaz; requester smije kreirati ticket i tokom outagea, što kod eksplicitno modelira; scoped catalog assignment ne bi trebao automatski značiti globalnu category/create administraciju. Konačne cross-module odluke za routing, config-versioning, changes i status page ostaju predmet njihovih audita.
