# W5.47 — BA-templates-01: izolacija management reads

**Status:** implementacija i CI/izolirani PostgreSQL dokaz su na `c098ad4ee102bca3ed84745080afd1175867ab5c`; `BA-templates-01` ostaje otvoren dok relevantni E2E 16 i završni acceptance ne budu potvrđeni.
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

**Presjek ažuriran 2026-11-04:**

- Ciljani ESLint i četiri lokalne Jest suite grupe: **68/68 passed** uz transpile-only harness i privremeni ignored Prisma shim. Ovo nije lokalni generated-Prisma type-check niti DB dokaz; shim je uklonjen nakon testiranja. Lokalni `npm run db:generate` je ranije bio blokiran nedostupnim `binaries.prisma.sh`.
- CI [`41850862952`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850862952), SHA `c098ad4ee102bca3ed84745080afd1175867ab5c`: **success**. Generated Prisma, backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs, container/supply-chain i CI gate su passed. E2E critical flows/install wizard i read-only inventory su `skipped`, ne passed.
- Važna korekcija dokaznog harness-a: `management-read-scope.integration.spec.ts` ranije nije bio naveden u `backend/scripts/run-isolated-integration.mjs`, pa raniji green integration jobovi nisu dokazivali baš ovaj test. Commit `c098ad4` ga je registrovao i dodao guard test; lokalni integration-harness testovi su **5/5 passed**. U CI `41850862952` korak `Run real PostgreSQL integration suites` je passed na disposable PostgreSQL-u uz taj registrovani spec. GitHub log download je vratio `EOF`, pa per-spec transcript nije nezavisno pročitan; job-level rezultat je success.
- Perf [`41850863346`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850863346) je passed na istom SHA-u; to je opći load-smoke gate, ne funkcionalni dokaz za templates.
- Scheduled full E2E [`41790672838`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41790672838) pao je na starijem `master` SHA `8aab8e46`: summary **103 passed, 16 failed, 2 flaky, 2 skipped**. Test 16 je među neuspjelima zbog obaveznog `reason`; taj test-helper propust je kasnije korigovan commitom `2706ea1a`, koji je predak trenutnog SHA-a. Taj stari run ne validira trenutni kod. U njemu su se dodatno javili dva API connection timeouta i change-scheduling assertion mismatch.
- Dispatch run [`41836729106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41836729106) na `78ba1c1` imao je uspješan E2E job sa 12 passed; logovi nisu bili dostupni (`EOF`), pa tačan spec-set nije potvrđen i run se ne koristi kao dokaz za E2E 16.
- Nema Prisma schema promjene, migracije ili target-DB pristupa. PostgreSQL dokaz koristio je samo disposable CI okruženje.

## Acceptance prije zatvaranja BA ID-a

1. Generated Prisma compile i šest direktnih audit-16 specova imaju passed dokaz u CI `41850862952`.
2. Novi PostgreSQL interleaved-limit test je registrovan u isolated runneru; CI `41850862952` integration job je passed uz taj spec. Per-spec log download je bio nedostupan (`EOF`), pa je raspoloživ job-level exit status.
3. Service-only manager dobija samo redove čiji je puni service scope dozvoljen; global, category/group, mixed i foreign redovi nisu vraćeni ni brojani — pokriveno postojećim testovima paketa.
4. Global manager, superadmin i personal-template putanje zadržavaju postojeće ponašanje — pokriveno postojećim targeted testovima.
5. Relevantni E2E 16 i svi required acceptance gateovi moraju biti `passed` na prihvaćenom finalnom SHA-u. Push CI `41850862952` je E2E critical/install `skipped`; scheduled E2E `41790672838` je na starijem SHA-u i pao je. Zato E2E acceptance ostaje **pending**; `skipped`/`not run` se ne računaju kao passed.

`BA-templates-01` i Val 5 ostaju otvoreni do ispunjenja završnih acceptance gateova; status izvornog nalaza i generisanog plana nije mijenjan. Nema target-DB pristupa niti migracije.
