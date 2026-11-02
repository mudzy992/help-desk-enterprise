# Package closeout — `BA-service-catalog-12`

**Paket:** audit 15 / `service-catalog` — global catalog writes i scoped admin draft listing<br>
**Nalaz:** `BA-service-catalog-12` (P2) — zatvoren nakon ciljane implementacije i zelenog CI gatea<br>
**Implementacijski commit:** `14dbb9451326074f777b5d6102773e88f06c2286`<br>
**Finalni testani SHA:** `14dbb9451326074f777b5d6102773e88f06c2286`<br>
**CI:** [`41448717393`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41448717393) — success na finalnom testanom SHA-u<br>
**Perf smoke:** [`41448717783`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41448717783) — success na istom SHA-u<br>
**DB migracije:** nema BA-12 migracije ni izmjene Prisma sheme

## Nalaz i acceptance

Audit je utvrdio da su `POST /services` i category CRUD globalni resursi, a postojeći write permission nema resource locator za service/OU scope. Audit je također utvrdio da `GET /services` admin lifecycle skup izvodi iz agregiranih rola, pa service-scoped ADMIN može tražiti tuđe draftove.

Prije bilo kakve promjene write policy-ja dodani su i izvršeni targeted `RoleGuard` testovi. Oni potvrđuju da postojeći evaluator već odbija service-scoped i OU-scoped ADMIN assignment na globalnom service/category createu, dok globalni ADMIN prolazi. Write policy zato nije mijenjan; testna regresijska zaštita dokumentuje stvarni guard ugovor.

Acceptance za listu: globalni ADMIN/SUPER_ADMIN zadržava globalni lifecycle pristup; service-scoped ADMIN zadržava javnu globalnu lifecycle vidljivost i dobija ostale lifecycle statuse samo za dodijeljene service ID-jeve; OU-only ADMIN bez mapiranja OU-a na servise ne dobija globalni draft pristup. Javni ACTIVE katalog ostaje vidljiv globalno kao i ranije.

## Implementacija

- `serviceListVisibilityForPrincipal` izvodi globalni ili service-scoped pristup iz `PrincipalContext.assignments`, umjesto da svaki `ADMIN` role key automatski znači globalnu draft vidljivost. Globalni ADMIN/SuperAdmin ostaje globalan. Service ID-jevi se dedupliciraju i normalizuju; OU-only assignment ne proizvodi service scope.
- `GET /services` prosljeđuje javne lifecycle statuse i dodatni service scope u `ListServicesInput`. Upit primjenjuje public lifecycle granu globalno i dodatne non-public statuse samo uz `id IN (dodijeljeni servisi)`, prije counta i paginacije — nema post-filtera koji bi kvario total/page envelope.
- Cursor filter fingerprint uključuje SHA-256 fingerprint sortiranog service scopea, ne sirove service ID-jeve. Scope promjena odbija stari cursor sa postojećim `INVALID_SERVICE_LIST_CURSOR` ugovorom. Cursor fingerprint bez scoped ID-jeva zadržava prethodni oblik.
- `POST /services` i category write policy, javni ACTIVE read, spec 56, njegova očekivanja i prag `250 ms` nisu mijenjani. BA-10/11, BA-changes-08/13 i svi ostali nalazi ostaju izvan ovog paketa. Nema promjene UI-ja.

## Direktni testni dokaz

- `backend/src/modules/service-catalog/service-catalog.authorization-compatibility.spec.ts` — `RoleGuard` odbija globalni service i category create za service-scoped i OU-scoped ADMIN; globalni ADMIN category create prolazi. Postojeći globalni ADMIN service-create test ostaje.
- `backend/src/modules/service-catalog/service-visible-lifecycles.spec.ts` — globalni ADMIN/SuperAdmin, service-scoped ADMIN, kombinovane USER/AGENT role, OU-only ADMIN i nedostajući principal context.
- `backend/src/modules/service-catalog/list-services.spec.ts` — in-memory query vraća assigned draft, skriva foreign draft, zadržava empty-page ponašanje za nepristupačan eksplicitni lifecycle i odbija cursor nakon promjene scopea.
- `backend/src/modules/service-catalog/service-catalog-pagination.integration.spec.ts` — novi BA-12 PostgreSQL case pokriva assigned draft, foreign draft, globalni ACTIVE servis, eksplicitni DRAFT filter i scope-bound cursor; suite je već registrovan u `backend/scripts/run-isolated-integration.mjs`.

## CI i testni dokaz

CI [`41448717393`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41448717393) na `{14dbb9451326074f777b5d6102773e88f06c2286}` završio je `success`:

- **Backend build + test:** passed; Prisma Client je generisan u CI-u, schema/build/lint/wiring i full Jest posao prošli su.
- **PostgreSQL/Redis integration:** passed; disposable DB migration/replay, harnessi i `Run real PostgreSQL integration suites` prošli su. BA-12 test je u registrovanom `service-catalog-pagination.integration.spec.ts` suiteu. GitHub raw job-log preuzimanje za izdvajanje per-suite Jest broja vratilo je `EOF`; job conclusion i CI gate su success.
- **Frontend build + test:** passed; lint, format check, suite, build i budget koraci prošli su.
- **Docs guard, container/supply chain i CI gate:** passed.
- **Skipped:** `E2E critical flows` i `E2E install wizard` bili su `skipped` na push triggeru; conditional `Enforce zero high/critical image vulnerabilities` korak također je `skipped`. Nijedan od tih koraka nije prikazan kao passed. Browser E2E/spec 56 zato nema sign-off iz ovog runa.
- **Neuspjeli CI pokušaji:** nema prije zelenog runa.

Odvojeni Perf smoke [`41448717783`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41448717783) na istom SHA-u je `success`. K6 je zabilježio `GET /services?take=100` p95 **28.68 ms**, max **361.41 ms**, payload p95/max **111.16 KB**, **1.200** service zahtjeva i bez service-catalog contract failurea; service-catalog latency i payload gateovi prošli su. Globalni query-budget prosjek bio je **2.094** preko **48.393** zahtjeva (limit `2.1`, p95 7, max 34). Korak `Publish the numbers on the pull request` bio je `skipped` jer nema PR-a. Ovo je API/k6 Perf dokaz, ne browser long-task mjerenje speca 56. Log anotacije su dostupne kroz run summary; E2E nije pokrenut.

## Registar nalaza

- Zatvoren: samo `BA-service-catalog-12` (P2).
- Ostaju otvoreni u modulu: `BA-service-catalog-01`–`09` i `BA-service-catalog-13`–`15`. `BA-changes-08` i `BA-changes-13` ostaju zasebno otvoreni.
- `service-catalog`: 4 P1, 8 P2, 3 P3 ukupno; **12 otvorenih / 3 zatvorena**.
- Globalni deklarisani zbir: **567 otvorenih / 125 zatvorenih / 692 ukupno**. Machine-readable source: **570 otvorenih / 111 zatvorenih / 11 historijskih / 692 ukupno**. Preegzistentna razlika od tri statusa ostaje; severity zbir je P1=174, P2=368, P3=150.

## Migracija, rollout i rollback

Nema Prisma schema promjene, BA-12 migracije, manual DB koraka ni target-DB pristupa. PostgreSQL/Redis integration i Perf CI koriste disposable/ephemeral okruženje sa postojećim migracijama; ciljna instalacija nije provjeravana niti mijenjana.

Rollout je samo aplikacijski. Deployati novu API verziju na sve instance; dok stara instanca još služi zahtjeve, ona i dalje ima prethodnu globalnu admin-draft vidljivost. Service-scoped admin cursori nastali po starom filteru odbijaju se nakon prelaska na novi scope-bound fingerprint i klijent treba zatražiti novu stranicu.

Rollback na prethodni aplikacijski SHA vraća BA-12 draft-visibility izloženost, pa nije neutralan rollback i treba ga tretirati kao sigurnosni izuzetak. Nema DB rollbacka jer nema migracije.

## Lokalna provjera i ograničenja

- Ciljani ESLint nad svih 9 izmijenjenih backend fajlova prošao je; `git diff --check` je prošao. Prettier `--check` za ovaj closeout, `docs/backend/README.md` i `backend-findings-plan.json` prošao je.
- `node scripts/check-docs-content.mjs` prošao je (**32 stranice, 8 prevoda, 10 provjera**) i `node --test scripts/check-docs-content.test.mjs` prošao je **9/9**; backend findings traceability je prošao **692/692**, a `node --test scripts/check-backend-findings.test.mjs` **12/12**. JSON parse je prošao.
- Standardni lokalni Jest pokušaj za 3 ciljana suitea nije došao do testova: checkout nema generisani `backend/src/generated/prisma/client`/`enums`, pa je ts-jest stao na nedostajućim Prisma modulima i tipovima (**0 testova izvršeno**). Ovo je lokalno generated-client ograničenje, ne prikazuje se kao test pass.
- Kao odvojen logic smoke, ista 3 suitea prošla su **3 suites / 18 tests** uz ts-jest transpile-only i privremene Prisma enum/client stubove. Privremeni stubovi su uklonjeni nakon testa; ovo nije zvanični typecheck/Jest dokaz. Zvanični backend build/full Jest i PostgreSQL/Redis integration dokaz dolazi iz zelenog CI-ja sa stvarnim generisanim klijentom.
- Lokalno nije pokrenut `npm run build`, real-DB integration suite, Prisma generation ni migracija; ciljna baza nije korištena. GitHub log download za detaljan integration suite output vratio je `EOF`, ali CI job status i gate su success.

## Sljedeći paket

**`BA-service-catalog-13` (P3):** dosljedan caller-supplied reason ugovor za category/lifecycle/form mutacije. Nije započet; potreban je zaseban acceptance prije implementacije. Nema PR-a prema `master`, mergea ni promjene grane.
