# Paketni checkpoint — `BA-service-catalog-04` (implementacija u toku)

**Paket:** audit 15 / `service-catalog` — dokaz routing coverage pri aktivaciji<br>
**Nalaz:** `BA-service-catalog-04` (P1) — otvoren; implementacija i puni acceptance još nisu završeni<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Politika koju je korisnik izabrao:** zadržati postojeći globalni `private.ticket.routing.requireCoverage` kao eksplicitni, reason-audited override. `true` blokira nepotpunu coverage; `false` dopušta aktivaciju uz warning, a lifecycle change log bilježi politiku i rezultat coverage evaluacije.<br>
**Migracija / DB:** nema schema promjene, migracije, DB upisa ni pristupa ciljnoj bazi<br>
**CI / deployment:** novi CI run za ovu izmjenu još nije dostupan; BA-04 ostaje otvoren do backend CI acceptancea. Deployment/rollout nije potvrđen ni dio ovog checkpointa

## Nalaz i acceptance

Audit 15 opisuje rizik da servis postane `ACTIVE` uz nepokrivene origin OU-ove, zbog čega tiketi mogu završiti u `UNROUTED` fallbacku. Acceptance je policy-driven exact/ancestor coverage za OU-ove i blokiranje pri nepotpunoj coverage kada `private.ticket.routing.requireCoverage=true`. Korisnik je izabrao postojeći globalni setting kao jedini override; izmjena settinga zahtijeva razlog i bilježi se u settings change logu. Kada je setting `false`, lifecycle event mora zasebno evidentirati primijenjenu override politiku, coverage rezultat i missing OU set.

## Implementacija u toku

- `RoutingService.evaluateActivationCoverage` sada vraća strukturirani `ServiceRoutingCoverageEvaluation` nakon primjene postojećeg `assertOrWarnActivationRoutingCoverage`: missing coverage i `requireCoverage=true` i dalje bacaju `ROUTING_COVERAGE_MISSING`; u optional modu rezultat se vraća pozivaocu.
- Lifecycle aktivacija prenosi coverage evaluaciju do transakcijskog change loga. `diff.routingCoverage` bilježi setting key, `requireCoverage`, `hasCoverage`, broj zahtijevanih origin OU-ova, `missingOriginUnitIds` i `overrideApplied`. Postojeći API warning `ROUTING_COVERAGE_MISSING` ostaje nepromijenjen kada se aktivira uz nepotpunu coverage.
- Opis settinga je ažuriran da odražava coverage svakog OU-a, warning ponašanje optional moda i reason/change-log ugovor.
- Nije mijenjan kod niti status `BA-routing-02`; BA-04 koristi postojeći evaluator iz routing modula.

## Verifikacija

- ESLint za izmijenjene TypeScript fajlove: **passed**.
- Docs guard: **passed** (32 stranice, 8 prevoda, 10 provjera); docs guard tests **9/9 passed**.
- Traceability: **692/692** (P1=174, P2=368, P3=150); traceability tests **12/12 passed**. `git diff --check`: **passed**.
- `routing.coverage-activation.spec.ts` u lokalnom pokretanju sa `ts-jest` diagnostics isključenim: **7/7 passed**.
- Standardno lokalno Jest pokretanje nije došlo do testova u tri ciljana suitea jer sandbox nema generisani Prisma Client: TypeScript javlja nedostajuće `generated/prisma/enums` i Prisma delegate tipove. Pri pokretanju bez ts-jest diagnostics-a routing suite prolazi, ali dva service-catalog suitea ne mogu učitati nedostajući `generated/prisma/client`. Ovo je lokalni generated-client blocker, ne označava se kao pass.
- Puni backend build/test i PostgreSQL/Redis CI za BA-04 još nisu pokrenuti nakon ove izmjene. Browser E2E/Perf nisu korišteni kao BA-04 sign-off.

## Scope i naredni korak

Mijenjan je samo BA-04 service activation auditability i pripadajući routing response type/settings description/testovi. Nema migracije ni deploymenta. Sljedeće je pushati ovu izmjenu isključivo na `arena/864951a6-help-desk-enterprise`, potvrditi puni GitHub backend CI i zatim dokumentovati passed/skipped/failure rezultate. Nalaz ostaje otvoren do CI acceptancea i owner-directed closeouta; deployment se ne tvrdi. Nema PR-a ni mergea prema `master`.
