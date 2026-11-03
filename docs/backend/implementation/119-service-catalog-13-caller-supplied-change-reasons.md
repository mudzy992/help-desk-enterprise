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
- Backend Jest/full build još nisu izvršeni lokalno; generated Prisma Client nije prisutan u ovom checkoutu. Ne označavaju se kao passed. CI provjera BA-13 tek predstoji.

## Granice i sljedeći koraci

BA-13 ostaje **otvoren** dok backend generated-Prisma build/full Jest i CI ne validiraju novi DTO/domain/API contract i sve promijenjene call-siteove. Nema target-DB pristupa, migracije, deploya, statusne promjene drugih nalaza, BA-routing-02 izmjene, PR-a prema `master` ni mergea. Odvojeni Perf smoke `41662410321` ostaje **failure** na nepovezanim search/ticket-message pragovima; service-catalog p95 i query-budget su **passed** ([118 closeout](118-service-catalog-09-owner-directed-closeout.md)).
