# BA-routing-02 — activation i onboarding coverage follow-up

**Status:** zatvoren 2026-11-04 po izričitom owner-directed prihvatanju. Push CI [`41915186268`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41915186268) na closeout SHA `70f52e4b29d03de48331fe2f5711dbb4cb2c0f29` prošao je, uključujući persisted onboarding/PostgreSQL integration suite. E2E [`41916949315`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41916949315) je passed sa 4/4, ali na starijem `master` SHA `a625446c3fa9074700ecb1dcd0f0e80c1f3c8cdc`; backend/frontend su skipped, a run ne uključuje novododati peti spec-42 test. Ovaj SHA/spec caveat nije prikriven i detaljan dokaz je u finalnom closeoutu ispod.
**Val:** 5
**Audit izvor:** [13 — routing, BA-routing-02](../audits/13-routing.md#ba-routing-02--activation-coverage-je-postoji-jedno-pravilo)
**Prethodni zapis:** [W5.21 historical closeout](48-routing-service-activation-coverage.md)

## Uočeni preostali jaz

W5.21 je uveo coverage evaluaciju za service activation i onboarding finalizaciju: svaki obavezni origin OU mora se razriješiti exact pravilom ili pravilom najbližeg ancestor OU-a. Međutim, persisted onboarding `suggest` i `validate` putanje i dalje su koristile `routingRule.count({ serviceId }) > 0`. Jedno pravilo je zato još moglo proizvesti routing referencu kao da je konfiguracija spremna.

U trenutku izrade ovog follow-upa izvorni statusni red `BA-routing-02` bio je **otvoren**. Historijski W5.21 zapis ostaje neizmijenjen; kasniji statusni closeout je dokumentovan na kraju ovog paketa.

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

## Historijska validacija i pre-closeout gateovi

- Ciljani ESLint za routing, service-catalog i onboarding fajlove je prošao; četiri targeted Jest suite-a su **15/15 passed** uz transpile-only režim i privremeni ignored Prisma shim. Shim je uklonjen. Ovo lokalno izvođenje samo po sebi nije generated-Prisma dokaz.
- CI [`41850862952`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850862952) na SHA `c098ad4ee102bca3ed84745080afd1175867ab5c` je **success** za generated Prisma, backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs, container/supply-chain i CI gate. Push CI E2E critical/install poslovi su `skipped`.
- CI integration runner uključuje `routing-critical-matrix.integration.spec.ts`; real PostgreSQL/Redis integration job je passed na disposable bazi. Nema nove migracije niti target-DB pristupa.
- Dispatch [`41836729106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41836729106) na prethodnom code SHA `78ba1c1` imao je E2E critical-flow job success (12 passed), ali log download je vratio `EOF`; tačan spec-set nije potvrđen i taj run se ne tretira kao full post-merge acceptance.
- CI/E2E [`41905212413`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41905212413) na SHA `e32a999117fdc44bb7ece178587bd0aeca7af039` je success; korisnikov odabir obuhvatao je specove 02/15/42. Spec 42 prolazi onboarding UI start, ali ne poziva niti asertuje persisted `suggest`/`validate` missing-set kontrakt koji je specifičan za ovaj nalaz. E2E report download je završio `EOF`, pa per-spec counts nisu nezavisno pregledani. Ovaj run se bilježi, ali sam ne zatvara `BA-routing-02`.
- Scheduled full E2E [`41790672838`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41790672838) pao je na starijem `master` SHA `8aab8e46` (103 passed, 16 failed, 2 flaky, 2 skipped). Trinaest testova je zapelo na obaveznom `reason`; kasniji commit `2706ea1a` s E2E reason-helper korekcijom je predak trenutnog SHA-a. Još su bila dva API timeouta i jedan change-scheduling assertion mismatch. Ovaj run nije dokaz trenutnog BA-routing-02 koda.
- Iako su selected specs 02/15/42 prošli, direktni E2E acceptance za persisted onboarding `suggest`/`validate` missing-set kontrakt i puni post-merge critical-flow acceptance ostaju **pending**. Ne pokretati puni flow ručno; čekati sljedeći scheduled run ili korisnikov post-merge run ID, pa provjeriti tačan SHA/job i `skipped`/failed rezultate.
- Nema target-DB pristupa ni migration runa. Ovaj pre-closeout snapshot nije mijenjao `BA-routing-02`; W5.50 je zasebno zatvorio `BA-routing-03/04`.

Ovaj paketni zapis sada bilježi finalni status `BA-routing-02` i vlasnički prihvaćeni dokaz, uz eksplicitno ograničenje da `41916949315` nije izvršio commit `70f52e4b` ni njegov peti spec-42 test.

## Finalni closeout (2026-11-04)

Korisnik je izričito zatražio da se nalaz zatvori ako `41916949315` prođe. Run je **success**: E2E critical-flows `4 passed, 0 failed, 0 flaky, 0 skipped`. `gh run view` potvrđuje `headBranch=master` i `headSha=a625446c3fa9074700ecb1dcd0f0e80c1f3c8cdc`; to nije implementacijski closeout SHA `70f52e4b29d03de48331fe2f5711dbb4cb2c0f29`, a backend/frontend poslovi su bili skipped. Na closeout grani spec 42 otkriva pet testova; zato se ovaj run ne opisuje kao izvršenje novog petog testa ili kao E2E rezultat na `70f52e4b`.

Code-specific acceptance na `70f52e4b` dolazi iz CI [`41915186268`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41915186268): generated-Prisma/backend CI je zelen, a registered disposable PostgreSQL+Redis integration suite `service-onboarding-routing-coverage.integration.spec.ts` prolazi. Suite asertuje da strict coverage nema lažnu suggestion; `save` i `complete` odbijaju `ROUTING_COVERAGE_MISSING` s punim strukturiranim missing-OU skupom; `lastValidationErrors` ga trajno sačuva; `requireCoverage=false` dozvoljava override; finalizacija emituje warning i `routingCoverage` audit s `overrideApplied: true`. Perf [`41915186314`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41915186314) na istom SHA-u je također passed. Targeted E2E workflow dispatch na grani bio je odbijen HTTP 403, pa nije kreiran dodatni run.

Zatvaranje je owner-directed prema izričitom uslovu korisnika, uz razliku između zelenog E2E runa i code-specific CI SHA-a; ne tvrdi se da je `41916949315` izvršio nove testove. Nije se pristupilo ciljnoj bazi niti pokretala migracija. Ova closeout aktivnost nije otvorila PR niti je izvršila merge/deploy; kasnija read-only GitHub provjera pokazala je da `master` sada pokazuje na SHA `70f52e4b29d03de48331fe2f5711dbb4cb2c0f29`, što samo po sebi nije potvrda deploymenta. Val 5 je sada `61/74` zatvoreno; preostalih 13 nalaza su u templates.
