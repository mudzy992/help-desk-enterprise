# Implementacijski checkpoint — `BA-service-catalog-13` (u toku)

**Nalaz:** `BA-service-catalog-13` (P3) — **otvoren; implementacija u toku**<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Početak:** korisnik je 2026-11-03 odobrio BA-09 closeout i zatražio početak BA-13.<br>
**Prethodni nalaz:** BA-09 zatvoren owner-directed; dokaz i ograničenja su u [118 closeoutu](118-service-catalog-09-owner-directed-closeout.md).<br>
**Schema / migracija / ciljna baza:** BA-13 ne mijenja Prisma schema ni migracije; ciljnoj bazi nije pristupljeno.

## Audit finding i ugovor

Audit 15 nalazi da category, lifecycle i service-form mutacije nisu imale dosljedan caller-supplied reason ugovor: neke putanje su koristile fiksni razlog, a druge nisu prenosile razlog kroz UI/API. Implementacija također pokriva delete putanje i normalizaciju, kako navodi audit.

Za ljudske mutacije razlog je sada obavezan na HTTP DTO/domain granici, trimuje se i ograničen je na 1–512 znakova; prazan ili samo-razmak razlog se odbija. Vrijednost koju je pozivalac unio snima se u `ChangeLog.reason`, a stabilni `diff.action` ostaje zaseban mašinski čitljiv tip radnje. Nema generičkog hard-coded razloga za autentifikovanog ljudskog pozivaoca. Pozivi bez actor-a za interne/system/seed operacije zadržavaju stabilne action fallback razloge.

Obuhvaćene HTTP mutacije:

- kreiranje/ažuriranje service category i category delete (`reason` u bodyju za create/update, query parametar za delete);
- lifecycle transition (`reason` u bodyju);
- form create, version create/update i activation (`reason` u bodyju);
- service delete (`reason` query parametar);
- service create/update nastavljaju koristiti postojeći required DTO reason, sada kroz zajedničku normalizaciju i action audit polja.

Form builder više ne kreira prvu formu kao sporedni efekat čitanja/otvaranja ekrana. Prva forma se kreira eksplicitnom akcijom nakon što administrator unese razlog, tako da nema ljudski actor sa sistemski izmišljenim razlogom. Availability/downtime ugovori i ostali nalazi nisu mijenjani.

## Implementacija u radnom stablu

- Dodan je zajednički reason DTO i normalizator; kategorije, lifecycle, forms, service/category delete, te postojeći service create/update upisuju normalizovan caller reason i stabilni action.
- API/UI pozivi za lifecycle, service/category delete, category create/update i form create/version create/version update/activation šalju uneseni razlog. Forma zahtijeva razlog prije omogućavanja mutacijskih akcija; category delete i category mutation form imaju zaseban obavezan razlog.
- Lokalizovani tekst više ne tvrdi da backend umjesto korisničkog razloga bilježi sistemski razlog.
- Regresijski testovi dodani su za DTO required polje, normalizaciju i persistence audit razloga, category/service CRUD, lifecycle/form mutation i API/controller forwarding.

## Lokalna provjera

- Frontend TypeScript `npx tsc -b --pretty false`: **passed**.
- Ciljani frontend Vitest: **4 fajla / 11 testova passed** (service-catalog concurrency/reason API, form-builder i ensure-form ponašanje).
- Ciljani frontend ESLint, `npm run i18n:check` i Prettier provjera izmijenjenih TS/TSX/JSON fajlova: **passed**.
- Ciljani backend ESLint za izmijenjene module i testove: **passed**.
- Backend Jest/full build nisu izvršeni lokalno jer generated Prisma Client nije prisutan u ovom checkoutu; lokalno se ne označavaju kao passed. Njih je potom validirao CI `41697055454` (detalji ispod).

## CI provjera (2026-11-03)

CI [`41697055454`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41697055454) na SHA `6a3546b2ebd46ff75dde7cba435709468d17f3a3` je **success**: backend generated-Prisma build/lint/full Jest, PostgreSQL/Redis integration na disposable CI bazi, frontend build/test, docs guard, container/supply-chain i CI gate su **passed**. Read-only inventory, E2E critical/install i conditional zero-high/critical image enforcement su **skipped**; nema browser/spec 56 sign-offa.

Perf smoke [`41697055530`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41697055530) na istom SHA-u je **failure** samo na nepovezanom search p95 `956.26 ms` prema `<500 ms`. Ticket-message p95 `945.25 ms`, service-catalog p95 `60.03 ms`, service-catalog contract failures `0`, payload p95 `112.42 KB` i query-budget avg `2.088` prema `2.1` su **passed**. Ovaj Perf neuspjeh nije BA-13 acceptance i nije razlog za proširenje scopea.

## Granice i sljedeći koraci

BA-13 ostaje **otvoren**: CI je potvrdio tehničku implementaciju, ali status nalaza nije zatvoren bez zasebne owner statusne odluke. Nema target-DB pristupa, migracije ni deployment akcije. Nisu mijenjani statusi drugih nalaza niti BA-routing-02; nema PR-a prema `master` ni mergea. Perf failure je zabilježen odvojeno od zelenog CI-ja i ne pripisuje se BA-13.
