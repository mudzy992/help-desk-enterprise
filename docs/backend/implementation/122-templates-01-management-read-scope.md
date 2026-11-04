# W5.47 — BA-templates-01: izolacija management reads

**Status:** implementacija u toku; `BA-templates-01` ostaje otvoren.
**Scope:** samo shared response-template i playbook management list/get; ne zatvara BA-templates-02/03 niti susjedne nalaze.

## Nalaz i granica paketa

`ticket.templates.manage` može biti ograničen na jedan ili više servisa. Prije paketa, management `listManaged/get` za response templatee i `list/get` za playbooke vraćali su i globalne, kategorijske/grupne, miješane i tuđe service-scope redove. Odgovor je sadržavao interna tijela/instrukcije i scope, često uz `canEdit: false`.

Paket mijenja samo čitanje shared resursa. Personal templates, pickerovo namjerno prikazivanje off-scope rezultata, write policy, settings enforcement i playbook concurrency nisu dio ovog paketa.

## Implementacija

- Izvučen je jedan kanonski izračun dozvoljenih shared-service ID-eva, korišten i postojećom write-scope provjerom. Superadmin ili unscoped manage assignment ostaje globalan; service assignments se dedupliciraju i sortiraju.
- Response-template query zahtijeva najmanje jedan dozvoljeni service, zahtijeva da su **svi** povezani service ID-evi dozvoljeni i isključuje category/group scope za service-only managera.
- Playbook query primjenjuje isti service/category ugovor.
- Scope predikati se dodaju Prisma `where` upitu zajedno sa search/service filterima, prije `orderBy` i `take: 1000`. In-memory provjera je dodatna zaštita; `activeTicketCount` se računa tek za vidljive playbooke.
- Direktni `get` upiti filtriraju prije učitavanja odgovora; foreign shared resursi se ponašaju kao `TEMPLATE_NOT_FOUND` / `PLAYBOOK_NOT_FOUND`.

## Izmijenjeni fajlovi

- `backend/src/modules/templates/template-scope.ts`
- `backend/src/modules/templates/management-read-where.ts`
- `backend/src/modules/templates/response-templates.service.ts`
- `backend/src/modules/templates/playbooks/playbooks.service.ts`
- Odgovarajući unit/pure testovi i `management-read-scope.integration.spec.ts`.

## Trenutni dokaz i ograničenja

- Ciljani ESLint za izmijenjene TS fajlove: prošao.
- Četiri ciljane Jest suite grupe: **68/68 testova passed** uz transpile-only lokalni harness. Zbog nedostajućeg generated Prisma Clienta korišten je privremeni ignored shim samo da se učitaju service moduli; ovo **nije** type-check niti generated-Prisma/DB dokaz.
- Obični Jest pokušaj i `npm run db:generate` nisu mogli koristiti generated client: repou nedostaju `backend/src/generated/prisma/*`, a Prisma generator nije mogao dohvatiti engine sa `binaries.prisma.sh` (host nije dostupan iz ovog sandboxa). Privremeni shim je uklonjen nakon testiranja.
- Dodan je PostgreSQL integration test: 1.001 foreign redovi sortirani prije dozvoljenog reda za oba resource tipa provjeravaju da scope uđe u query prije limita 1.000; provjerava se i da foreign `get` vraća not-found. Test nije pokrenut jer nije korištena disposable `PRIVACY_IT_DATABASE_URL`.
- `git diff --check` je prošao. Nema promjene Prisma sheme ni migracije; ciljnoj bazi nije pristupano niti je migracija izvršavana. E2E, Perf i full CI nisu pokrenuti.

## Acceptance prije zatvaranja BA ID-a

1. Generated Prisma compile i šest direktnih audit-16 specova prolaze.
2. Novi PostgreSQL interleaved-limit test prolazi na disposable CI bazi.
3. Service-only manager dobija samo redove čiji je puni service scope dozvoljen; global, category/group, mixed i foreign redovi nisu vraćeni ni brojani.
4. Global manager, superadmin i personal-template putanje zadržavaju postojeće ponašanje.
5. Relevantni E2E 16 i svi required CI gateovi imaju passed dokaz na finalnom SHA-u. `skipped`/`not run` se ne računaju kao passed.

Do ispunjenja tih uslova, BA-templates-01 i Val 5 ostaju otvoreni. Nema promjene registra/generisanog plana za ovaj ID.
