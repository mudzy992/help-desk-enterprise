# W5.50 — PostgreSQL dokaz za scoped routing coverage paginaciju i total

- **Datum:** 2026-11-04
- **Grana:** `arena/864951a6-help-desk-enterprise`
- **Scope:** `BA-routing-03` i `BA-routing-04` zajedno, prema odobrenju korisnika.
- **Stanje:** postojeća query implementacija je ponovo pregledana; generisani-Prisma/PostgreSQL regresijski test prošao je u push CI-ju `41901987106` na SHA-u `2e67f84`. E2E finalni acceptance ostaje pending, pa su izvorni nalazi i dalje otvoreni. Novi Perf smoke nije pokrenut jer paket nije mijenjao runtime kod.

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

## CI, lokalne provjere i acceptance granice

- Push CI [`41901987106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41901987106) na SHA-u `2e67f84df77e1b8b9e708d52ff6f5bc9a6eff7bb` je **passed**: generated-Prisma backend build/lint/Jest, real PostgreSQL+Redis integration shard (uključujući ovaj routing coverage test), frontend, docs guard, container/supply-chain i CI gate. E2E install-wizard i critical-flow jobovi su **skipped**, ne passed.
- Novi Perf smoke nije pokrenut: workflow path filter ne obuhvata routing integration test ni docs, a W5.50 nije mijenjao runtime. Posljednji relevantni Perf [`41886832553`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832553) je passed na `d9839433a9c43bb9e3fce2eb55c0868595948d0b` (average **1.926** upita/request kroz **50.503** zahtjeva; gate **2.1**). Runtime kod se od tog SHA-a nije mijenjao. Nisu mijenjani pragovi niti je Perf ručno dispatchan.
- Lokalno su prošli `node scripts/check-backend-findings.mjs` (**692/692**), njegovih **13/13** guard testova, docs guard (**32 stranice, 8 prevoda, 10 provjera**), docs testovi (**9/9**) i `git diff --check`. Backend Jest i integration test nisu lokalno pokretani jer checkout nema `backend/node_modules` ni generisani Prisma client; integration-runner harness test također nije startao jer nedostaje `pg` (`ERR_MODULE_NOT_FOUND`). Realni DB dokaz dolazi iz izolovanog CI-ja.
- Nema nove migracije, target-DB pristupa ni ručnog full CI/E2E dispatcha.
- `BA-routing-03/04` ostaju otvoreni u auditu, registru i JSON-u dok relevantni E2E `02/15/42` i finalni acceptance ne budu potvrđeni na odgovarajućem SHA-u. `skipped` E2E nije prolaz.
