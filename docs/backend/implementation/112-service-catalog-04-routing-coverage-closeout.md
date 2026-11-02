# Paketni checkpoint — `BA-service-catalog-04` (implementacija u toku)

**Paket:** audit 15 / `service-catalog` — dokaz routing coverage pri aktivaciji<br>
**Nalaz:** `BA-service-catalog-04` (P1) — otvoren; CI je otkrio neusklađen downstream consumer i slijedi njegov BA-04 adapter-fix<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Politika koju je korisnik izabrao:** postojeći globalni `private.ticket.routing.requireCoverage` ostaje eksplicitni, reason-audited override. `true` blokira nepotpunu coverage; `false` dopušta aktivaciju uz warning, a lifecycle change log bilježi politiku i coverage rezultat.<br>
**Migracija / DB:** nema schema promjene, migracije, DB upisa ni pristupa ciljnoj bazi<br>
**CI / deployment:** commit `28abebf` je pushovan; CI run `41508326486` otkrio je TS2322 u service-onboarding consumeru, koji se koriguje u istom BA-04 scopeu. Nema potvrđenog deployment/rollouta

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

Perf run [41508326537](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41508326537) **failed prije k6-a** na `Build the API`; check annotation pokazuje isti `TS2322`. Metrike i query-budget gate nisu izvršeni, pa nema BA-04 Perf rezultata. `gh run view --log-failed` za oba runa završio je `EOF`; build dijagnostika je sačuvana kroz GitHub check annotation.

Puni backend build/test, PostgreSQL/Redis integration i CI gate za follow-up izmjene još nisu potvrđeni. E2E/spec 56 i Perf nisu BA-04 sign-off; ne tvrdi se deployment.

## Scope i naredni korak

Promjene ostaju ograničene na BA-04 coverage evaluation, evidence u oba lifecycle activation loga, downstream onboarding type adapter i ciljane testove/dokumentaciju. Nema migracije ni deploymenta. Sljedeće je završiti lokalne provjere, commitovati i pushati follow-up isključivo na `arena/864951a6-help-desk-enterprise`, pa provjeriti CI za tačan SHA. Nalaz ostaje otvoren do CI acceptancea i owner-directed closeouta. Nema PR-a ni mergea prema `master`.
