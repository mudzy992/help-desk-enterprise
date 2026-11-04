# W5.50 — PostgreSQL dokaz za scoped routing coverage paginaciju i total

- **Datum:** 2026-11-04
- **Grana:** `arena/864951a6-help-desk-enterprise`
- **Scope:** `BA-routing-03` i `BA-routing-04` zajedno, prema odobrenju korisnika.
- **Stanje:** postojeća query implementacija je ponovo pregledana; dodan je generisani-Prisma/PostgreSQL regresijski test. Push CI i Perf dokaz se upisuju nakon završetka runova. Izvorni nalazi ostaju otvoreni do propisanog finalnog acceptancea.

## Reconciliation prije implementacije

Provjereni su autoritativni statusni redovi u [auditu 13](../audits/13-routing.md), [globalnom registru](../BACKEND-FINDINGS-REGISTER.md) i [mašinski čitljivom planu](../backend-findings-plan.json): oba ID-a su **otvorena** u sva tri izvora. Raniji zapisi W5.22/W5.23 dokumentuju isporuku query ponašanja, ali njihova formulacija „zatvoren“ nije ažurirala kanonske redove. Zato se postojeća logika ne duplira i status ne mijenja bez završnog acceptancea.

## Query/API ugovor

`computeRoutingCoverage` već prevodi viewer service scope u `serviceWhere` i koristi isti predicate za `service.count` i keyset stranicu. Cursor uslov se dodaje samo na `pageServiceWhere`; tako count ostaje nezavisan od cursor/page limita, a zabranjeni servisi ne mogu potrošiti stranicu prije filtriranja. OU/service assignmenti ostaju upareni pri izgradnji coverage redova.

W5.50 ne mijenja runtime ponašanje, API envelope, scope pravila ni Prisma schema. Dodaje stvarni PostgreSQL dokaz na produkcijskom `RoutingService.coverage` putu, jer raniji specovi BA-routing-03/04 koristili su in-memory harness.

## Novi izolovani PostgreSQL dokaz

`routing-critical-matrix.integration.spec.ts` sada kreira 75 dozvoljenih i 75 zabranjenih ACTIVE servisa s međusobno isprepletenim nazivima i dodijeli vieweru samo dozvoljene service ID-eve u jednom OU scopeu. Stranica veličine 7 mora:

- prijaviti `total=75` na svakoj stranici;
- vratiti samo scoped OU redove i samo dozvoljene servise;
- proći svih 75 dozvoljenih ID-eva tačno jednom kroz cursor stranice;
- završiti sa 11 stranica (10 × 7, zatim 5), bez da skriveni servisi potroše limit.

Test je u već registrovanom `routing-critical-matrix.integration.spec.ts` shardu, koji izolovani CI integration runner izvršava nad vlastitom disposable PostgreSQL bazom. Ne koristi se ciljna baza.

## Provjere i acceptance granice

- Backend Jest, generisani Prisma integration suite i Perf se izvršavaju kroz push-triggered CI; lokalno nisu pokretani jer checkout nema `backend/node_modules` ni generisani Prisma client. Čak ni integration-runner harness test nije lokalno startao: Node nije našao `pg` iz nedostajućeg backend `node_modules` (`ERR_MODULE_NOT_FOUND`).
- Nema nove migracije, izmjene Perf pragova, target-DB pristupa ni ručnog full CI/E2E dispatcha.
- `BA-routing-03/04` ostaju otvoreni u auditu, registru i JSON-u dok relevantni E2E `02/15/42` i finalni acceptance ne budu potvrđeni na odgovarajućem SHA-u. `skipped` E2E nije prolaz.
- Poslije push CI/Perf runova ovdje se bilježe tačni SHA, run ID-evi i `passed/skipped` statusi; bez toga se paket ne opisuje kao finalno prihvaćen.
