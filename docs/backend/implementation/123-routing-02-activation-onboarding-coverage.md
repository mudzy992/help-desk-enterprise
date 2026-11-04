# BA-routing-02 — activation i onboarding coverage follow-up

**Status:** implementation je na `c098ad4ee102bca3ed84745080afd1175867ab5c`, a CI/generated-Prisma/PG-integration gateovi su prošli. CI/E2E [`41905212413`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41905212413) na `e32a999` je passed za odabrani spec 42, ali taj test samo započinje onboarding i ne asertuje persisted `suggest`/`validate` missing-set ugovor; zato `BA-routing-02` ostaje otvoren do direktnog acceptancea.
**Val:** 5
**Audit izvor:** [13 — routing, BA-routing-02](../audits/13-routing.md#ba-routing-02--activation-coverage-je-postoji-jedno-pravilo)
**Prethodni zapis:** [W5.21 historical closeout](48-routing-service-activation-coverage.md)

## Uočeni preostali jaz

W5.21 je uveo coverage evaluaciju za service activation i onboarding finalizaciju: svaki obavezni origin OU mora se razriješiti exact pravilom ili pravilom najbližeg ancestor OU-a. Međutim, persisted onboarding `suggest` i `validate` putanje i dalje su koristile `routingRule.count({ serviceId }) > 0`. Jedno pravilo je zato još moglo proizvesti routing referencu kao da je konfiguracija spremna.

Izvorni statusni red `BA-routing-02` ostaje **otvoren**. Ovaj follow-up ne prepisuje historijski W5.21 zapis niti tvrdi da je nalaz zatvoren.

## Ugovor i izmjena

- Mandatory origin skup su svi trenutno upisani `OrganizationalUnit` zapisi. Shema nema `inactive`/`cannot originate ticket` oznaku niti per-service OU allowlist, pa se proizvoljno izostavljanje OU-a ne smatra sigurnim.
- Coverage koristi istu exact-then-ancestor semantiku kao ticket resolution. Missing ID-evi su sortirani deterministično po `ouPath`, uz ID tie-break. Pravila ostaju relacioni zapisi; strani ključevi štite OU/service/group targete, a postojeća BA-routing-01 provjera target eligibility pri mutaciji ostaje nepromijenjena.
- Onboarding suggestion se prikazuje samo kada postoji routing konfiguracija i required coverage nije nepotpuna. Validacija reference koristi istu evaluaciju; `requireCoverage=true` odbija reference s kodom `ROUTING_COVERAGE_MISSING`.
- Blokirajući odgovor sada nosi `details.routingCoverage` sa `hasCoverage`, `requireCoverage`, `requiredOriginUnitCount` i punim `missingOriginUnitIds` skupom. Onboarding step validation isti detalj sačuva u `lastValidationErrors` i vrati kao strukturirani error; parsiranje persisted JSON-a provjerava taj envelope.
- `requireCoverage=false` ostaje eksplicitan override: nepotpuna coverage može proći onboarding/aktivaciju uz `ROUTING_COVERAGE_MISSING` warning; onboarding finalizacija čuva istu missing listu i `overrideApplied: true` u service change-log auditu.
- Nema nove migracije, target-DB pristupa, migration runa, deploya, mergea ni PR-a.

## Izvršivi dokaz u paketu

- Routing evaluator: bez pravila, jedan leaf-rule, ancestor fallback, nezavisno OU stablo i determinističan missing set.
- Onboarding routing provider: partial required coverage ne vraća lažnu suggestion/reference; root ancestor fallback pokriva cijelo stablo; optional policy dopušta nepotpunu konfiguraciju uz structured evaluation.
- Service activation error response sadrži missing set.
- Onboarding step revalidation, nakon što se coverage promijeni, odbija završetak, izbacuje strukturirani missing set i čuva isti detalj u `lastValidationErrors`.
- Onboarding optional override zadržava warning i audit sa `overrideApplied: true`.

## Lokalna validacija i preostali gateovi

- Ciljani ESLint za routing, service-catalog i onboarding fajlove je prošao; četiri targeted Jest suite-a su **15/15 passed** uz transpile-only režim i privremeni ignored Prisma shim. Shim je uklonjen. Ovo lokalno izvođenje samo po sebi nije generated-Prisma dokaz.
- CI [`41850862952`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850862952) na SHA `c098ad4ee102bca3ed84745080afd1175867ab5c` je **success** za generated Prisma, backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs, container/supply-chain i CI gate. Push CI E2E critical/install poslovi su `skipped`.
- CI integration runner uključuje `routing-critical-matrix.integration.spec.ts`; real PostgreSQL/Redis integration job je passed na disposable bazi. Nema nove migracije niti target-DB pristupa.
- Dispatch [`41836729106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41836729106) na prethodnom code SHA `78ba1c1` imao je E2E critical-flow job success (12 passed), ali log download je vratio `EOF`; tačan spec-set nije potvrđen i taj run se ne tretira kao full post-merge acceptance.
- CI/E2E [`41905212413`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41905212413) na SHA `e32a999117fdc44bb7ece178587bd0aeca7af039` je success; korisnikov odabir obuhvatao je specove 02/15/42. Spec 42 prolazi onboarding UI start, ali ne poziva niti asertuje persisted `suggest`/`validate` missing-set kontrakt koji je specifičan za ovaj nalaz. E2E report download je završio `EOF`, pa per-spec counts nisu nezavisno pregledani. Ovaj run se bilježi, ali sam ne zatvara `BA-routing-02`.
- Scheduled full E2E [`41790672838`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41790672838) pao je na starijem `master` SHA `8aab8e46` (103 passed, 16 failed, 2 flaky, 2 skipped). Trinaest testova je zapelo na obaveznom `reason`; kasniji commit `2706ea1a` s E2E reason-helper korekcijom je predak trenutnog SHA-a. Još su bila dva API timeouta i jedan change-scheduling assertion mismatch. Ovaj run nije dokaz trenutnog BA-routing-02 koda.
- Iako su selected specs 02/15/42 prošli, direktni E2E acceptance za persisted onboarding `suggest`/`validate` missing-set kontrakt i puni post-merge critical-flow acceptance ostaju **pending**. Ne pokretati puni flow ručno; čekati sljedeći scheduled run ili korisnikov post-merge run ID, pa provjeriti tačan SHA/job i `skipped`/failed rezultate.
- Nema target-DB pristupa ni migration runa. `BA-routing-02` status nije promijenjen ovim paketom; W5.50 je zasebno zatvorio `BA-routing-03/04`.

`BA-routing-02` ostaje otvoren do propisanog E2E/owner acceptancea; Val 5 je trenutno 60/74 na finding statusu.
