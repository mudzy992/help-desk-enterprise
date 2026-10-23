# Backend audit 13 — `routing`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,82/10**  
**Nalazi:** 2 P1, 6 P2, 3 P3

## 1. Executive summary

`routing` određuje handler grupu za novi ticket prema servisu i najbližem pravilu u lancu organizacionih jedinica. Modul ima dobru osnovu: sve HTTP rute su session + ADMIN zaštićene, koriste dedicated read/write permission, mutacije imaju OU/service scope guard, jedinstveni `(originUnitId, serviceId)` DB ugovor, razlog promjene i transakcijski change log. Resolution je determinističan i eksplicitno razlikuje exact, parent fallback i unrouted rezultat.

Baseline je ipak **5,82/10**. Dva P1 nalaza pogađaju izolaciju i operativnu ispravnost. Scoped administrator može pravilo iz svog OU/service scopea usmjeriti na proizvoljnu grupu iz drugog OU-a; time članovi te grupe dobijaju staff vidljivost nad ticketima koje administrator nije smio delegirati. Service activation coverage smatra servis pokrivenim čim postoji bilo koje pravilo, iako ostali relevantni OU-ovi mogu ostati `UNROUTED`.

Coverage i list API-ji dodatno paginiraju/učitavaju prije authorization filtera, scoped total je pogrešno ograničen, rule/change-log liste su neograničene, single resolve učitava kompletno OU stablo, a historija obrisanog pravila nestaje scoped čitaocu. Nema P0. Popravke se ne implementiraju prije završetka kompletnog backend audita i konsolidovanog plana.

## 2. Scope i inventar

- 32 produkcijska TypeScript fajla;
- 8 direktnih specova;
- 1 kontroler, 2 injectable klase;
- 2.382 aktuelne fizičke produkcijske LOC (inventory snapshot: 2.414);
- Prisma `RoutingRule`, OU/service/group relacije, change log, settings i authorization granice;
- consumeri u tickets, service-catalog, service-onboarding, install i config-versioning modulima;
- frontend routing API, parser, coverage matrix/rules UI;
- E2E 02, 15 i 42 kao primarni dokaz, uz povezane 03, 06, 10, 16, 26 i 41 scenarije.

Javne rute: create/update/delete rule; delete impact; per-rule/global changes; handler groups; rules; resolve; coverage.

## 3. Arhitektura i poslovni tok

`RoutingRule` čuva tačno jednu vezu origin OU + service → group. Resolution prvo provjeri servis, učita OU ancestor chain, zatim bira prvo pravilo od exact origin OU-a prema rootu. Ako pravilo ne postoji, vraća `UNROUTED` i konfiguraciju unrouted queuea.

Create/update/delete rade target existence provjere, razlog promjene, effective before/after resolution snapshot i change log. DB write i change log su u istoj Prisma transakciji. Update/delete dodatno upoređuju immutable rule scope sa body scopeom, pa `ruleId` ne može biti iskorišten uz lažni OU/service body.

Coverage paginira po service name/id, a za svaki servis računa sve ili odabrani origin OU. Authorization se, međutim, primjenjuje tek nakon generisanja globalne stranice. Onboarding i service activation koriste samo `count(rule where serviceId)>0`, ne stvarnu matricu pokrivenosti.

## 4. API/permission/scope matrica

| Ruta                                   | Guard                   | Scope                             | Zaključak                      |
| -------------------------------------- | ----------------------- | --------------------------------- | ------------------------------ |
| `POST /routing/rules`                  | ADMIN + `routing.write` | body OU + service                 | target group nije scoped       |
| `PATCH /routing/rules/:id`             | ADMIN + `routing.write` | body OU + service + ID parity     | target group nije scoped       |
| `DELETE /routing/rules/:id`            | ADMIN + `routing.write` | body OU + service + ID parity     | transakcijski audit            |
| `GET /routing/rules/:id/delete-impact` | ADMIN + `routing.read`  | service filter poslije učitavanja | vidljiv rule obavezan          |
| `GET /routing/rules/:id/changes`       | ADMIN + `routing.read`  | service filter                    | deleted scoped rule nedostupan |
| `GET /routing/changes`                 | ADMIN + `routing.read`  | post-filter                       | neograničeno učitavanje        |
| `GET /routing/groups`                  | ADMIN + `routing.read`  | samo “ima neko routing pravo”     | vraća sve grupe                |
| `GET /routing/rules`                   | ADMIN + `routing.read`  | post-filter                       | bez paginacije                 |
| `GET /routing/resolve`                 | ADMIN + `routing.read`  | query OU + service                | korektno guardovano            |
| `GET /routing/coverage`                | ADMIN + `routing.read`  | post-filter                       | pagination/total parity kvar   |

Sve rute koriste strict ValidationPipe. SuperAdmin kompatibilnost nasljeđuje globalni authorization ugovor; granularni service-level filter postoji za read površine.

## 5. Podaci, transakcije i konkurencija

- `@@unique([originUnitId, serviceId])` sprječava duplo pravilo i race createa.
- FK relacije koriste `Restrict`, pa OU/service/group sa pravilom ne mogu nestati bez eksplicitnog razvezivanja.
- Create/update/delete i change log su transakcijski.
- Rule scope je immutable; update mijenja samo `groupId`.
- Nema optimistic versiona, ali concurrent update je last-write-wins; oba change loga ostaju, bez indikacije da je drugi radio nad zastarjelim stanjem.
- Migration `20260911080000` je destruktivno deduplikovala postojeća fallback pravila po ID poređenju prije novog unique indeksa; nema sačuvanog migration manifesta izgubljenih konfiguracija.
- Change-log i rules readovi nemaju cursor/limit.

## 6. Sigurnost i privatnost

Najveći rizik je nevezani `groupId`. OU/service scope guard validira gdje se pravilo primjenjuje, ali ne validira kome se ticket delegira. `GET /routing/groups` istom scoped administratoru izlaže ID/naziv svake grupe, a create/update prihvata bilo koji postojeći group ID. Ticket visibility tretira assigned handler grupu kao staff pristup, pa ovo nije samo katalog leakage nego potencijalni cross-OU disclosure.

Pozitivno: ne postoji javna routing ruta; read i write permisije su odvojene; mutation body je striktno validiran; reason se server-side normalizuje; rule ID/scope mismatch se mapira na not-found; response ne sadrži osjetljivi ticket sadržaj.

## 7. Async, integracije i operativnost

Routing nema vlastiti queue/worker. Integracije su sinhrone: ticket create/preview, install seed, onboarding, service activation i config snapshot. Admin config realtime invalidacija označava routing domen, ali DB write/change log i realtime publish nisu dio ovog modula.

Single resolve učitava cijelu OU tabelu, što ticket create putanju čini O(svi OU-ovi) po pozivu. Coverage učitava cijelo OU stablo i matricu service-page × origin-OU; `take` ograničava servise, ali ne broj itema. Nema query/runtime/matrix-size budžeta ni routing-specific metrike za resolve latency, unrouted rate, stale target group ili coverage truncation.

## 8. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm ci
npm test -- --runInBand --runTestsByPath $(find src/modules/routing -name '*.spec.ts' -print | sort)
```

`npm ci` je uspješno instalirao 1.000 paketa; npm audit summary je prijavio 4 moderate nalaza, koji ostaju cross-cutting dependency dokaz.

Rezultat routing Jest komande: **0/8 suiteova izvršeno, 8/8 compile-blocked, 0 testova**. Blokada je nedostajući generated Prisma client/delegati (`group`, `service`, `routingRule`, `$transaction`). To nije funkcionalni pad, ali nijedan direktni routing test nije lokalno izvršen.

Specovi statički pokrivaju resolution, CRUD, unique, invalid target, change log, coverage cursor, lifecycle filter, activation warning i authorization guard. Svi default service-level fixturei koriste globalnog routing čitaoca; nema scoped coverage pagination, foreign-group target, deleted scoped history, concurrent update niti velikog OU/matrix testa.

E2E 02 potvrđuje ticket routing/fallback i globalnu coverage paginaciju/filtere. E2E 15 pokriva unrouted target i routing config realtime, a E2E 42 routing UX/onboarding. Korisnikov potvrđeni Playwright 01–56 prolaz ne dokazuje novu scoped/race/load matricu.

## 9. Pozitivni nalazi

1. Sve rute su session + ADMIN i dedicated permission zaštićene.
2. Create/update/delete/resolve imaju OU i service scope guard.
3. Update/delete provjeravaju rule ID protiv body scopea.
4. DB unique pouzdano sprječava dupli OU/service rule.
5. FK `Restrict` štiti referencijalni integritet.
6. Mutacija i change log su u istoj transakciji.
7. Change log sadrži effective before/after resolution, labele i actor/reason.
8. Exact pravilo ima prioritet nad najbližim ancestor fallbackom.
9. Cursor je canonical base64url i odbacuje malformed payload.
10. Coverage service redovi se ne cijepaju između stranica.
11. DTO whitelist odbacuje neočekivana polja.
12. Frontend ima runtime parser za kritični coverage envelope.

## 10. Registar nalaza

| ID            | Severity | Nalaz                                                           | Status   |
| ------------- | -------- | --------------------------------------------------------------- | -------- |
| BA-routing-01 | P1       | Scoped admin može rutirati ticket na grupu izvan svog OU scopea | otvoreno |
| BA-routing-02 | P1       | Service activation “coverage” prihvata bilo koje jedno pravilo  | otvoreno |
| BA-routing-03 | P2       | Scoped coverage paginira prije authorization filtera            | otvoreno |
| BA-routing-04 | P2       | Scoped coverage `total` računa samo ograničenu prvu stranicu    | otvoreno |
| BA-routing-05 | P2       | Rule/change-log liste su neograničene i post-filterirane        | otvoreno |
| BA-routing-06 | P2       | Single-ticket resolve učitava kompletno OU stablo               | otvoreno |
| BA-routing-07 | P2       | Scoped historija obrisanog pravila postaje nedostupna           | otvoreno |
| BA-routing-08 | P2       | Concurrent update je neoznačeni last-write-wins                 | otvoreno |
| BA-routing-09 | P3       | Coverage matrica nema item/byte/runtime budžet                  | otvoreno |
| BA-routing-10 | P3       | OU cycle/missing parent se tiho tretira kao kraj lanca          | otvoreno |
| BA-routing-11 | P3       | Kritične scoped/race/load grane nemaju izvršiv dokaz            | otvoreno |

## 11. Detaljni nalazi

### BA-routing-01 — Scoped admin može izabrati foreign OU grupu

**Dokaz:** `listRoutingHandlerGroups` vraća sve grupe; `assertRoutingTargetsExist` provjerava samo postojanje grupe. Controller scope dekoratori pokrivaju `originUnitId` i `serviceId`, ne `groupId`/`group.organizationalUnitId`.  
**Uticaj:** administrator ograničen na jedan OU/service može pravilo preusmjeriti grupi drugog OU-a. Članovi target grupe dobijaju handler-group staff vidljivost nad novim ticketima, što može postati cross-OU disclosure i operativna otmica queuea.  
**Root cause:** input scope i delegation target scope su modelirani odvojeno, ali samo prvi se autorizuje.  
**Korekcija:** definirati cross-OU routing permission/policy; učitati group OU i zahtijevati pokriven scope ili dedicated cross-OU pravo; `/groups` vratiti samo eligible grupe.  
**Acceptance:** scoped admin ne vidi niti može postaviti foreign group; global/cross-OU admin može; negativni service/OU/group testovi.  
**Owner/veličina:** routing + authorization/groups, M/L.

### BA-routing-02 — Activation coverage je “postoji jedno pravilo”

**Dokaz:** `evaluateServiceRoutingCoverage` poziva `hasRoutingRulesForService`, odnosno `routingRule.count({serviceId}) > 0`.  
**Uticaj:** uz `requireCoverage=true` servis se aktivira sa pravilom za samo jedan OU, dok svi drugi relevantni origin OU-ovi ostaju `UNROUTED`. Onboarding reference daje istu lažnu potvrdu potpunosti.  
**Root cause:** “configuration exists” je zamijenjeno za stvarnu coverage matricu/politiku.  
**Korekcija:** formalno definirati relevantne OU-ove i zahtijevani exact/ancestor fallback; validirati target eligibility i vratiti strukturirani missing set.  
**Acceptance:** aktivacija pada kada ijedan obavezni OU nema validan resolution; warning/override je eksplicitan i auditiran.  
**Owner/veličina:** routing + service-catalog/onboarding, L.

### BA-routing-03 — Scoped coverage paginira globalni skup

`computeRoutingCoverage` prvo bira globalnu service stranicu/cursor, a `RoutingService.coverage` zatim filtrira items prema vieweru. Scoped stranica može biti prazna i preskočiti vidljive servise na kasnijim globalnim stranicama; `nextCursor` opisuje globalni skup. Scope predicate mora ući prije count/cursor/page, uz test međusobno isprepletenih dozvoljenih/zabranjenih servisa. **P2, M/L, routing/authorization.**

### BA-routing-04 — Scoped total je ograničena aproksimacija

Scoped grana poziva coverage sa `take:10000`, ali funkcija clampuje na `routingCoverageMaximumTake`, zatim broji filtrirane service ID-eve samo te stranice. UI računa broj stranica iz netačnog totala. Potreban je DB scope-aware distinct count ili autorizovani service query. **P2, M, routing/data.**

### BA-routing-05 — Rules i change logs nemaju paginaciju

Rules učitava sve redove, zatim sve labele i post-filter; global changes paralelno učitava sve ruleove i sve change logove. Dodati cursor/filter/take, scope-aware DB query i stabilan total/hasMore; ne učitavati out-of-scope redove u proces. **P2, M, routing/API.**

### BA-routing-06 — Resolve učitava kompletno OU stablo

`loadOrganizationalUnitAncestors` radi `organizationalUnit.findMany` bez where za svaki ticket resolve/preview. Uvesti recursive CTE/materialized ancestor relation/path-safe parent traversal ili cache sa invalidacijom; dokazati bounded latency na velikom stablu. **P2, M/L, routing/data.**

### BA-routing-07 — Deleted scoped rule gubi historiju

`listRuleChanges` dopušta deleted rule samo globalnom readeru; `listChanges` filtrira routing-rule log po trenutno vidljivim rule ID-evima. Scope postoji u diff snapshotu, ali se ne koristi. Persistirati/queryjati OU/service scope uz change log ili sigurno parsirati versioned snapshot; scoped admin mora zadržati historiju vlastitog obrisanog pravila. **P2, M, routing/audit.**

### BA-routing-08 — Concurrent update je silent last-write-wins

Update čita existing i before resolution u transakciji, ali nema version/`updatedAt` precondition. Dva administratora mogu oba dobiti uspjeh; drugi prepisuje prvi, a API ne javlja conflict. Dodati optimistic version/If-Match ili conditional updatedAt, sa conflict responseom i parallel testom. **P2, M, routing/data.**

### BA-routing-09 — Coverage nema ukupni resource budget

`take` ograničava servise, ali jedan page proizvodi `services × svi OU-ovi` itema, fallback path arrays i labele. Uvesti item/byte/time cap, OU pagination/filter requirement za velika stabla i metrike. **P3, M, routing/performance.**

### BA-routing-10 — Neispravan OU lanac se tiho skraćuje

Ancestor walker prekida na cycle ili missing parent bez greške. Resolution tada može vratiti `UNROUTED` ili pogrešan fallback umjesto integrity alarma. Fail closed/health signal i data-integrity test su potrebni. **P3, S/M, routing/OU.**

### BA-routing-11 — Nedostaje izvršiva kritična matrica

Svih osam suiteova je lokalno compile-blocked. Postojeći fixture je pretežno global-reader happy path i nema foreign group, scoped pagination, deleted history, concurrent update ni large-tree test. Dodati generated-Prisma PostgreSQL suite i obavezni CI shard. **P3, M/L, routing/QA.**

## 12. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        7,50 |
| B. API i ugovori             |      12% |        6,20 |
| C. Auth/authz/scope          |      15% |        4,80 |
| D. Poslovna pravila/stanje   |      13% |        5,40 |
| E. Podaci/Prisma/transakcije |      13% |        6,80 |
| F. Sigurnost/privatnost      |      12% |        5,80 |
| G. Async/integracije         |       8% |        7,20 |
| H. Testovi/dokazivost        |      10% |        4,00 |
| I. Operativnost/perf.        |       7% |        5,00 |
| **Ukupno**                   | **100%** | **5,82/10** |

Ponderisani zbir je 5,822 i zaokružen na dvije decimale. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 13. Fazni plan popravki

### Faza 0 — safety net

Generated Prisma + PostgreSQL fixture; foreign-group scope test; complete activation matrix; scoped interleaved pagination/total; deleted-rule history; concurrent update; 100k OU/coverage load i malformed-chain test.

### Faza 1 — P1 sigurnost i operativni integritet

Uvesti target-group OU/cross-OU policy u list i mutation putanje. Zamijeniti “any rule” activation provjeru stvarnom policy-driven coverage evaluacijom i strukturiranim missing rezultatima.

### Faza 2 — API i scope ugovor

Scope-aware coverage query prije cursor/count; paginacija rules/changes; deleted history scope; stabilan envelope i frontend parseri za sve kritične responsee.

### Faza 3 — podaci i konkurencija

Optimistic rule version/updatedAt precondition, additive migration i If-Match/conflict ugovor; indeks/query plan za scope-aware service/rule/change-log pristup; ancestor strategija/cache.

### Faza 4 — integracije

Uskladiti ticket create, install, onboarding, catalog activation i config-versioning sa istom routing policy/capability funkcijom; invalidacija cachea i admin realtime poslije commita.

### Faza 5 — performance, testovi i observability

Coverage item/byte/time budget, resolve latency/unrouted-rate metrike, alarmi za foreign/stale target i broken OU chain, multi-admin race i veliki dataset testovi.

### Faza 6 — dokumentacija i finalni gate

Dokumentovati cross-OU policy, coverage definiciju, cursor/ETag i recovery; pokrenuti svih osam suiteova, povezani service/tickets testovi i E2E 02/15/42 na finalnom SHA-u.

## 14. Rizik, rollback i acceptance

Najveći rizik je promjena postojeće namjerne cross-OU konfiguracije i aktivnih servisa koji trenutno imaju samo parcijalnu coverage. Prvo napraviti read-only classifier izvještaj; postojeća foreign pravila ne brisati automatski. Policy uvoditi audit/observe, zatim enforce. Optimistic version je additive. Coverage API promjenu versionirati ili zadržati kompatibilan envelope.

Globalni acceptance:

1. Scoped administrator ne može vidjeti/odabrati neeligible foreign grupu.
2. Cross-OU routing je moguć samo sa eksplicitnom politikom/permisijom i auditom.
3. `requireCoverage` stvarno dokazuje svaki obavezni OU resolution.
4. Scoped coverage nema prazne/preskočene stranice i total je tačan.
5. Rules/changes su paginirani i DB scope-aware.
6. Historija obrisanog pravila ostaje dostupna svom scopeu.
7. Concurrent update vraća conflict jednom učesniku.
8. Single resolve i coverage ostaju u utvrđenim SLO/resource granicama.
9. Broken OU chain proizvodi integrity signal, ne tihi rezultat.
10. Direktni, integration i relevantni E2E testovi prolaze.

## 15. Traceability

| Nalaz         | Primarni dokaz                                 | Faza  |
| ------------- | ---------------------------------------------- | ----- |
| BA-routing-01 | controller scope + group list/target existence | 0–1   |
| BA-routing-02 | activation evaluation + onboarding support     | 0–1/4 |
| BA-routing-03 | coverage compute pa filter                     | 0–2   |
| BA-routing-04 | scoped `take:10000` + internal clamp           | 0–2/3 |
| BA-routing-05 | list rules/change logs                         | 0–2/3 |
| BA-routing-06 | ancestor `findMany`                            | 0–3/5 |
| BA-routing-07 | change-log filtering po live rule ID-u         | 0–2/3 |
| BA-routing-08 | unconditional routing rule update              | 0–3   |
| BA-routing-09 | service × OU matrix                            | 0–5   |
| BA-routing-10 | ancestor cycle/missing-parent break            | 0–3/5 |
| BA-routing-11 | Jest rezultat i fixture matrica                | 0–5/6 |

## 16. Konačna presuda i pretpostavke

Routing resolution algoritam i write audit su dobri, ali delegation target mora biti autorizovan jednako strogo kao origin scope, a “coverage” mora imati dokazivu poslovnu definiciju. Scope, completeness i scale nedostaci opravdavaju **5,82/10**.

Pretpostavke: cross-OU routing nije implicitno dozvoljen svakom scoped administratoru; ako business formalno želi globalni target katalog, potreban je dokumentovan exception i zasebna permission odluka. Upstream authorization/change-log/settings nalazi ostaju otvoreni. Playwright prolaz potvrđuje postojeći global-admin UX, ne scoped negativnu matricu.
