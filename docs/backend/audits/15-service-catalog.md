# Backend audit 15 — `service-catalog`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **5,23/10**  
**Nalazi:** 4 P1, 8 P2, 3 P3

## 1. Executive summary

`service-catalog` upravlja kategorijama, servisima, lifecycleom, verzioniranim formama, availability statusom i downtime prozorima. Modul ima dobru funkcionalnu osnovu: strict DTO pipeline, odvojene write permisije, service scope na mutacijama postojećih servisa, lifecycle vidljivost po ulozi, DB unique slug/version ugovore, historijsko vezivanje ticketa za `formVersionId` i transakcijski change log za većinu mutacija.

Baseline je ipak **5,23/10**. Četiri P1 nalaza pogađaju integritet, dostupnost i operativnost. Draft forma može postati korištena između immutable provjere i updatea, pa se schema historijskog ticketa retroaktivno mijenja. Config-versioning direktno prepisuje schema/status postojećih formi i zaobilazi immutable/lifecycle/multiple-active invariante. Administrator može konfigurirati regularni izraz sa katastrofalnim backtrackingom, a svaki prijavljeni requester ga pokreće nad vlastitim inputom. Aktivacija servisa nasljeđuje routing “any rule” provjeru i može objaviti servis dok relevantni OU-ovi ostaju `UNROUTED`.

Dodatno postoje race aktivacije i numerisanja formi, preklapajući downtime prozori, category ciklusi, silent last-write-wins, neograničene liste i nedosljedan audit-reason ugovor. Nema P0. Implementacija ostaje zabranjena do završetka cijelog backend audit ciklusa.

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

`GET /services`, categories, downtime windows i form versions nemaju paginaciju. Service list učitava sve vidljive servise i zatim paralelno sve downtime prozore, open-ticket groupBy, incidente, aktivne forme/schema JSON, kategorije i onboarding. Aktivna forma summary učitava kompletnu schema vrijednost samo da izbroji polja. Na velikom katalogu nema row/byte/time budgeta.

Incident impact read namjerno fail-open vraća “nema incidenta” na svaku DB grešku. Time katalog/status može prikazati OPERATIONAL tokom stvarnog incidenta bez health signala.

## 9. Config-versioning, install i downstream integracije

Config snapshot sadrži service i form redove. `applyCatalogSnapshot` direktno updateuje service slug/category/lifecycle/status i form schema/status. Ne poziva catalog/form domenske invariante, ne provjerava da forma ima ticket, ne osigurava single-active i ne proizvodi per-entity catalog change log. Snapshot validator provjerava parsabilnu schemu i “barem jedna ACTIVE” za aktivni servis, ali ne detektuje više aktivnih verzija, immutable schema drift ili nedozvoljen lifecycle transition.

Install/blueprint putanje ponovo koriste dio helpera i pišu change log, ali imaju zasebne persistence tokove, pa parity mora imati integration test. Onboarding takođe poziva low-level update/validation funkcije. Tickets korektno čuva form FK u istoj ticket create transakciji, ali izbor/validacija forme prethodi transakciji i oslanja se na stabilan ACTIVE status.

## 10. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/service-catalog -name '*.spec.ts' -print | sort)
```

Rezultat: **4/23 suitea prošla, 19/23 compile-blocked; 15/15 stvarno izvršenih testova prošlo**. Blokada je nepotpun generated Prisma client/enumi i delegati (`serviceCategory`, `ticket`, `group`, `serviceIncidentService`, `$transaction`). Nijedan izvršeni test nije pao.

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
