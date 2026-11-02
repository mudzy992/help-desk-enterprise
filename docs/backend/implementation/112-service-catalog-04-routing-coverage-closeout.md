# Paketni checkpoint — `BA-service-catalog-04` (implementacija validirana; nalaz otvoren)

**Paket:** audit 15 / `service-catalog` — dokaz routing coverage pri aktivaciji<br>
**Nalaz:** `BA-service-catalog-04` (P1) — implementacija je prošla full CI; status ostaje otvoren do owner-directed closeouta<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Politika koju je korisnik izabrao:** postojeći globalni `private.ticket.routing.requireCoverage` ostaje eksplicitni, reason-audited override. `true` blokira nepotpunu coverage; `false` dopušta aktivaciju uz warning, a lifecycle change log bilježi politiku i coverage rezultat.<br>
**Migracija / DB:** nema nove schema migracije ni pristupa/upisa u ciljnu bazu; CI integration testovi koriste disposable bazu i postojeći migration replay tok<br>
**CI / deployment:** commit `88ad398` ima zeleni CI [`41511684641`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41511684641) na punom backend build/test i integration gateu. E2E, inventory i uslovni image-enforcement koraci bili su `skipped`; deployment nije potvrđen

## Nalaz i acceptance

Audit 15 opisuje rizik da servis postane `ACTIVE` uz nepokrivene origin OU-ove, zbog čega tiketi mogu završiti u `UNROUTED` fallbacku. Acceptance je policy-driven exact/ancestor coverage za OU-ove i blokiranje pri nepotpunoj coverage kada `private.ticket.routing.requireCoverage=true`. Korisnik je izabrao postojeći globalni setting kao jedini override; izmjena settinga zahtijeva razlog i dobija settings change-log zapis. Kada je setting `false`, lifecycle event mora zasebno evidentirati primijenjenu override politiku, coverage rezultat i missing OU set.

## Implementacija

- `RoutingService.evaluateActivationCoverage` vraća strukturirani `ServiceRoutingCoverageEvaluation` nakon postojeće `assertOrWarnActivationRoutingCoverage` politike: nepotpuna coverage uz `requireCoverage=true` i dalje baca `ROUTING_COVERAGE_MISSING`; optional modu vraća evaluaciju.
- Oba produkcijska lifecycle activation puta — `ServiceCatalogService.transitionLifecycle` i `finalizeServiceOnboarding` — prenose evaluaciju do transakcijskog service change loga. Zajednički builder zapisuje `policySettingKey`, `requireCoverage`, `hasCoverage`, broj potrebnih origin OU-ova, `missingOriginUnitIds` i `overrideApplied` pod `diff.routingCoverage`.
- Persisted service-onboarding adapter je prebačen na strukturiranu evaluaciju. UI/API warning `ROUTING_COVERAGE_MISSING` pri optional, nepotpunoj coverage ostaje nepromijenjen. Default onboarding provider bez persisted routing sistema i dalje vraća `null`.
- Opis settinga je preciziran za coverage svakog OU-a, warning ponašanje optional moda i postojeći reason/change-log ugovor. Postojeći settings persist tok nije mijenjan.
- Onboarding finalizacija je uključena jer je zaseban produkcijski DRAFT→ACTIVE lifecycle put. BA-routing-02 kod i status nisu mijenjani; BA-04 koristi postojeći evaluator.

## Verifikacija

- ESLint za trenutno izmijenjene TypeScript fajlove: **passed**.
- Lokalni `routing.coverage-activation.spec.ts` sa `ts-jest` diagnostics isključenim: **7/7 passed**.
- Service-catalog i service-onboarding ciljani Jest suiteovi ne mogu lokalno učitati `generated/prisma/client`; standardno lokalno pokretanje je dodatno blokirano nedostajućim `generated/prisma/enums` i Prisma delegate tipovima. Ne označavaju se kao passed.
- Docs guard je prošao (**32 stranice, 8 prevoda, 10 provjera**); docs guard tests **9/9 passed**. Traceability **692/692** (`P1=174, P2=368, P3=150`); testovi **12/12 passed**. `git diff --check` prošao je. Prettier za novi checkpoint prolazi; širi check prijavljuje ranije potvrđene baseline razlike i fajlovi nisu masovno preformatirani.

### Prvi CI pokušaj na `28abebf`

Run [CI `41508326486`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41508326486) završio je **failure**. Docs guard i frontend build/test **passed**. Backend build **failed** na `TS2322` u `service-onboarding/persisted-onboarding-routing.provider.ts:44`: providerov raniji string/`null` return tip više nije odgovarao strukturiranom return tipu `RoutingService.evaluateActivationCoverage`. Taj downstream consumer-fix i onboarding lifecycle audit dokaz se dodaju u ovom BA-04 paketu. PostgreSQL/Redis integration job pao je na `Verify deployment-wide connection budget`, a container job na image buildu; raw logovi tih koraka nisu bili dostupni, pa uzrok izvan dokumentovanog TS2322 nije pripisan BA-04. Real DB suiteovi zbog ranijeg integration koraka nisu se izvršili. Read-only inventory i oba browser E2E posla bili su **skipped**.

Perf run [41508326537](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41508326537) **failed prije k6-a** na `Build the API`; check annotation pokazuje isti `TS2322`. Metrike i query-budget gate nisu izvršeni.

### Drugi CI pokušaj na `ef9333a`

Run [CI `41509926839`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41509926839) završio je **failure**. Backend build, lint, API wiring/SLA checks, PostgreSQL/Redis integration sa real suiteovima, frontend build/test, container/supply-chain i Docs guard **passed**. Full backend Jest pao je na test-compile grešci `TS2339`/`TS7006` u `service-onboarding.routing-coverage.spec.ts`: assertion je čitao `harness.memory.changeLogs`, koje test harness ne izlaže; pravi log niz je `harness.memory.catalog.changeLogs`. Ta referenca je ispravljena u narednom commitu `88ad398`; test je potvrđen u završnom CI runu `41511684641`. `CI gate` drugog pokušaja je zbog te greške bio failure. Read-only inventory, E2E critical flows i E2E install wizard bili su **skipped**. High/critical image enforcement je također **skipped**; nije označen kao passed. `gh run view --log-failed` završio je `EOF`; tačna Jest dijagnostika je sačuvana kroz GitHub check annotation.

PostgreSQL/Redis connection-budget i container image-build failures iz prvog runa `41508326486` nisu se ponovili u `41509926839`; oba odgovarajuća jobs su prošla u drugom runu.

Perf run [41509926840](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41509926840) izvršio je k6, ali je **failure** na nepovezanom `GET /search p(95)<500 ms` pragu: izmjereno **685.08 ms**. BA-04/service-catalog p95 **35.03 ms** (`<500 ms`) i payload **111.16 KB** (`<=1024 KB`) passed; query-budget avg **2.090** preko **48,240** zahtjeva (gate **2.1**) passed; ticket-message p95 **855.16 ms** (`<1000 ms`) passed. K6 nije BA-04 acceptance, search nije mijenjan, a ukupni Perf smoke ostaje failure.

### Završni CI na `88ad398`

Run [CI `41511684641`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41511684641) na SHA `88ad398786cebaf0b1686a0c5ed86d27ade8e812` završio je **success**. Backend annotated build, lint, puni Jest (uključujući ispravljeni onboarding coverage-evidence test), API wiring/SLA checks, PostgreSQL/Redis integration i real suiteovi, frontend build/test, Docs guard, container/supply-chain i CI gate svi su **passed**. `Read-only service-form pattern inventory`, E2E critical flows, E2E install wizard i uslovni high/critical image-enforcement korak bili su **skipped**. Nema E2E/spec 56 sign-offa niti deployment tvrdnje.

Najnoviji relevantni Perf run `41509926840` je na `ef9333a` (runtime kod identičan `88ad398`; kasnija izmjena je bila test/docs-only): ukupni smoke je **failure** na search p95 `685.08 ms` prema `<500 ms`; BA-04/service-catalog p95, payload i query-budget gates su **passed**. Nema Perf runa na `88ad398`; search nije BA-04 scope i nije mijenjan.

## Scope i naredni korak

Promjene ostaju ograničene na BA-04 coverage evaluation, evidence u oba lifecycle activation loga, downstream onboarding type adapter i ciljane testove/dokumentaciju. Finalni CI acceptance za kod je zelen na `88ad398`; nema nove migracije, target-DB pristupa/upisa ni potvrđenog deploymenta. BA-04 status namjerno ostaje otvoren do owner-directed closeouta; ne započinje se drugi nalaz. Nema PR-a ni mergea prema `master`.
