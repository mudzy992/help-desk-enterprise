# W5.50 — PostgreSQL dokaz i acceptance za scoped routing coverage

- **Datum:** 2026-11-04
- **Grana:** `arena/864951a6-help-desk-enterprise`
- **Scope:** `BA-routing-03` i `BA-routing-04` zajedno, prema odobrenju korisnika.
- **Ishod:** postojeći query kod nije dupliciran niti mijenjan. Generated-Prisma/PostgreSQL regresijski test, Perf i odabrani CI/E2E gateovi su passed; oba BA ID-a su sada zatvorena u kanonskom auditu, globalnom registru i generisanom planu.
- **Aktuelni Val 5 status:** 60/74 zatvorena, 14 otvorenih (4 P1, 7 P2, 3 P3). Poznate 10 statusnih razlika između izvornog audita i globalnog registra nisu mijenjane.

## Reconciliation

Prije W5.50, autoritativni statusni redovi u [auditu 13](../audits/13-routing.md), [globalnom registru](../BACKEND-FINDINGS-REGISTER.md) i [mašinski čitljivom planu](../backend-findings-plan.json) označavali su oba ID-a kao **otvorena**. Raniji zapisi W5.22/W5.23 dokumentovali su runtime implementaciju, ali njihove historijske formulacije nisu mijenjale kanonske redove. Nakon prihvaćenih gateova, sva tri statusna izvora sada prikazuju `BA-routing-03` i `BA-routing-04` kao **zatvorena**. `BA-routing-02` nije dio ovog closeouta.

## Query/API ugovor i PostgreSQL test

`computeRoutingCoverage` već prevodi viewer service scope u `serviceWhere` i koristi isti predicate za `service.count` i keyset stranicu. Cursor uslov se dodaje samo na `pageServiceWhere`; tako count ostaje nezavisan od cursor/page limita, a zabranjeni servisi ne mogu potrošiti stranicu prije filtriranja. OU/service assignmenti ostaju upareni pri izgradnji coverage redova.

W5.50 nije mijenjao runtime ponašanje, API envelope, scope pravila ni Prisma schema. Dodao je stvarni PostgreSQL dokaz na produkcijskom `RoutingService.coverage` putu, jer raniji specovi BA-routing-03/04 koristili su in-memory harness.

`routing-critical-matrix.integration.spec.ts` kreira 75 dozvoljenih i 75 zabranjenih ACTIVE servisa s međusobno isprepletenim nazivima i dodijeli vieweru samo dozvoljene service ID-eve u jednom OU scopeu. Stranica veličine 7 mora:

- prijaviti `total=75` na svakoj stranici;
- vratiti samo scoped OU redove i samo dozvoljene servise;
- proći svih 75 dozvoljenih ID-eva tačno jednom kroz cursor stranice;
- završiti sa 11 stranica (10 × 7, zatim 5), bez da skriveni servisi potroše limit.

Test je u već registrovanom `routing-critical-matrix.integration.spec.ts` shardu, koji izolovani CI integration runner izvršava nad vlastitom disposable PostgreSQL bazom. Nije korištena ciljna baza.

## Acceptance i CI dokazi

- Routing integration CI [`41901987106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41901987106) na code SHA-u `2e67f84df77e1b8b9e708d52ff6f5bc9a6eff7bb` je **passed**: generated-Prisma backend build/lint/Jest, real PostgreSQL+Redis integration shard (uključujući novi routing coverage test), frontend, docs guard, container/supply-chain i CI gate. E2E install-wizard i critical-flow poslovi u tom push runu bili su **skipped**; taj run nije korišten kao E2E dokaz.
- Perf [`41905093216`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41905093216) je **success** na SHA-u `e32a999117fdc44bb7ece178587bd0aeca7af039`, istom SHA-u kao CI/E2E run `41905212413`. Query-budget: prosjek `1.925` upita kroz `50,454` zahtjeva, p95 `2`, max `34`, prag `2.1`. Svi k6 latency, failure-rate, service-catalog contract/payload, tickets-list/detail i query-budget gateovi su prošli; Perf pragovi nisu mijenjani.
- CI/E2E [`41905212413`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41905212413) na istom SHA-u je **success**. Backend build/test, PostgreSQL+Redis integration, frontend, docs, container/supply-chain, CI gate i E2E critical-flows job su passed. Prema korisnikovom run scopeu, E2E specovi `02/15/42` su prošli. `E2E install wizard` i `Read-only service-form pattern inventory` bili su skipped, ne passed. Playwright report artifact je postojao, ali njegov download je završio EOF; zato per-spec test counts nisu nezavisno pregledani.
- Rezultati zajedno zadovoljavaju acceptance za `BA-routing-03/04`: produkcijski query je potvrđen nad stvarnim PostgreSQL-om, Perf je prošao na finalnom SHA-u, a traženi routing E2E odabir je prošao na istom SHA-u. Kanonski statusi su ažurirani tek nakon ovih rezultata.
- Lokalno su prošli `node scripts/check-backend-findings.mjs` (**692/692**), njegovih **13/13** guard testova, docs guard (**32 stranice, 8 prevoda, 10 provjera**), docs testovi (**9/9**) i `git diff --check`. Backend Jest i integration test nisu lokalno pokretani jer checkout nema `backend/node_modules` ni generisani Prisma client; integration-runner harness test nije startao jer nedostaje `pg` (`ERR_MODULE_NOT_FOUND`). Realni DB dokaz dolazi iz izolovanog CI-ja.

## Granice i preostali Val 5 scope

Nema nove migracije, target-DB pristupa, runtime koda ni ručnog full CI/E2E dispatcha. `BA-routing-02` ostaje izvan ovog closeouta: run 419052 je imao spec 42 uspješan, ali taj spec samo započinje onboarding i ne asertuje persisted `suggest`/`validate` missing-set ugovor. Template nalazi i BA-15 full critical-flow gate također nisu dio W5.50 statusne promjene.
