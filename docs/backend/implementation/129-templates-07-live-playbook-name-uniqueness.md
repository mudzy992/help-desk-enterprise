# BA-templates-07 — case-insensitive uniqueness imena live playbooka

**Datum:** 2026-11-05<br>
**Status:** zatvoren na nivou nalaza nakon automatskog PostgreSQL CI-ja; templates E2E/Val-5 acceptance ostaje pending<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Finalni commit:** [`600b9810288a2cfb7e038f8931202085bf647cf6`](https://github.com/mudzy992/help-desk-enterprise/commit/600b9810288a2cfb7e038f8931202085bf647cf6)<br>
**Implementacijski commit:** [`1b6e483cc3f39de71fe0234e4651c4b1eae8fec1`](https://github.com/mudzy992/help-desk-enterprise/commit/1b6e483cc3f39de71fe0234e4651c4b1eae8fec1)

## Obuhvat

Ovaj checkpoint zatvara samo `BA-templates-07` iz odobrenog P2 scopea `BA-templates-04`–`10`. Ne uključuje `BA-templates-08/09`, nalaze `11`–`13`, BA-15/full-flow acceptance, routing/status-page razlike ili promjene Perf pragova.

- Migracija `20271030150000_playbook_live_name_unique` uzima `SHARE ROW EXCLUSIVE` lock nad `Playbook`, pa prije DDL-a traži grupe sa `lower(name)` duplikatima među redovima `deletedAt IS NULL`. Duplikat izaziva exception i prekida migraciju; nema automatskog brisanja ili preimenovanja podataka.
- Dodaje se partial unique index nad `lower("name")` za sve redove sa `"deletedAt" IS NULL`. `isActive` namjerno nije dio predicate-a: inactive live playbook i dalje rezerviše ime, dok soft-delete oslobađa ime.
- `executeTemplatesOperation` prevodi P2002 sa imenovanim `playbook_live_name_lower_key` indeksom u HTTP 409 `PLAYBOOK_NAME_TAKEN`. Mapper podržava Prisma 7 PostgreSQL driver-adapter format u kojem constraint ime dolazi kroz `meta.driverAdapterError.cause.constraint.index`, uz kompatibilne `meta.target`/constraint oblike.
- Dodan je izolovani PostgreSQL suite za paralelne create i rename pokušaje, inactive-live duplikat i ponovno korištenje naziva nakon soft-delete; suite je registrovan u CI isolated runneru. Database runtime schema sentinel i static migration-policy test prate novu migraciju.

## Acceptance i dokazi

| Kriterij | Dokaz | Ishod |
| --- | --- | --- |
| Live nazivi su unique bez obzira na case i aktivnost; soft-delete oslobađa naziv | `20271030150000_playbook_live_name_unique/migration.sql`; PostgreSQL integration suite | passed u CI |
| Migracija fail-fast odbija postojeće live duplikate, bez auto-repaira | Lock + preflight prije indeksa; `check-migration-policy.test.mjs` static guard; CI migration replay na disposable DB | passed; preflight failure path nije pokretan nad ciljnom bazom |
| Imenovani P2002 se mapira na stabilan HTTP 409 `PLAYBOOK_NAME_TAKEN` | `map-templates-error.spec.ts`; CI PostgreSQL concurrency suite | passed na finalnom SHA-u |
| Paralelni create i rename daju jedan pobjednik i jedan konflikt, bez djelimičnog loser write-a | Registrovani `playbook-name-uniqueness.integration.spec.ts` | passed u CI [`41994559728`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41994559728) |
| Build/typecheck, full backend/frontend gates i izolovana PostgreSQL/Redis integracija | Finalni CI [`41994559728`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41994559728), finalni SHA `600b9810` | passed |
| Perf smoke uz nepromijenjene pragove | [`41993188370`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41993188370), implementacijski SHA `1b6e483`; mapper-only follow-up `600b9810` nije pokrenuo novi Perf workflow zbog path filtera | passed; nema promjene Perf pragova |
| Templates E2E 16, puni Val-5 i BA-15 critical-flow acceptance | Push CI je označio E2E critical/install kao `skipped`; nije pokrenut ručni full E2E | pending, nije passed |

Prvi CI pokušaj [`41993188382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41993188382) izvršio je migraciju i PostgreSQL suite, ali je pokazao da je Prisma 7 driver-adapter P2002 detalj ugniježđen pod `meta.driverAdapterError.cause`, a ne u `meta.target`; tri conflict provjere zato su dobile sirovi Prisma error. Mapper je korigovan u `600b981`; finalni CI `41994559728` na tom SHA-u je prošao, uključujući PostgreSQL suite i CI gate. Prvi neuspjeli CI nije prikazan kao passed.

Lokalno su prošli: `playbooks.service.spec.ts` 24/24, mapper + runtime database-contract Jest 7/7 nakon mapper popravke, isolated integration runner harness 10/10, migration-policy tests 3/3, migration-policy check za 105 migracija, targeted ESLint i `git diff --check`. Lokalni puni `tsc --noEmit` nije mogao završiti jer generated Prisma client nedostaje u checkoutu; finalni CI je generisao client i prošao backend build/typecheck/test.

Nije korištena ciljna baza, lokalno pokretana migracija ili ručni full CI/E2E dispatch; nije otvoren PR, mergean kod niti izvršen deploy. Migration replay i integracijski testovi izvršeni su samo u CI disposable bazama.

## Zaključak

`BA-templates-07` je zatvoren na nivou izvornog nalaza nakon finalnog zelenog CI-ja i successful Perf smoke-a na posljednjem performance-relevant SHA-u. To ne zatvara templates E2E 16, puni Val-5 acceptance, BA-15 full critical-flow gate niti preostale `BA-templates-08/09`. Naredni odobreni nalazi su `BA-templates-08` i `BA-templates-09`; nijedan nije započet ovim checkpointom.
