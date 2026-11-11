# Package closeout — `BA-service-catalog-01`

**Paket:** audit 15 / `service-catalog` — serijalizacija izmjene FormVersion i ticket bindinga<br>
**Nalaz:** `BA-service-catalog-01` (P1) — zatvoren za `updateServiceFormVersion`, uz zeleni CI i PostgreSQL concurrency dokaz<br>
**Implementacijski commit:** `18456f845f07b67207a9fb8e4ba12ce1bdf79247`<br>
**Finalni testani SHA:** `18456f845f07b67207a9fb8e4ba12ce1bdf79247`<br>
**CI:** [`41456326648`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41456326648) — success na finalnom kodnom SHA-u<br>
**Perf smoke:** [`41456326902`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41456326902) — failure na nepovezanim search/ticket-message pragovima; BA service-catalog i query-budget pragovi prošli su<br>
**DB migracije:** nema Prisma schema promjene ni BA-01 migracije

## Nalaz i acceptance

`updateServiceFormVersion` je ranije učitavao FormVersion i broj ticket-a prije transakcije, a zatim ažurirao schema JSON bez svježe provjere pod lockom. Ticket INSERT je mogao vezati istu verziju nakon counta, ali prije izmjene; time bi već sačuvani `formData` mogao dobiti drugačije značenje.

Acceptance je ograničen na ovu standardnu FormVersion update putanju: ticket FK bind i edit moraju se serijalizovati; pod `ReadCommitted` transakcijom mora se zaključati FormVersion red pa ponovo provjeriti ownership/service, status i ticket count prije mutacije; izmjena korištene ili aktivne verzije mora ostati HTTP 409 `FORM_VERSION_IMMUTABLE`. Direktni unit i PostgreSQL concurrency testovi te CI gate su prošli.

Zatvaranje ne tvrdi da je svaka konfiguracijska mutacija globalno zaštićena. `applyCatalogSnapshot` i njegovo zaobilaženje domain/lifecycle invarianata ostaju zaseban otvoreni nalaz `BA-service-catalog-02` (P1); ostali susjedni nalazi nisu mijenjani.

## Implementacija

- `update-service-form-version.ts` zadržava početni read/count precheck radi ranijeg not-found, service-mismatch i immutability error precedencea. Taj precheck nije autoritativan; nakon njega transakcija `ReadCommitted` uzima `SELECT "id" ... FOR UPDATE`, ponovo učitava verziju za traženi servis, ponovo broji tickete i provjerava status prije schema updatea i changelog upisa.
- PostgreSQL FK provjera na `Ticket.formVersionId` uzima `KEY SHARE` lock na FormVersion i drži ga do završetka ticket transakcije. Taj lock je konfliktan sa updaterovim `FOR UPDATE`: ako ticket bind dobije lock prvi, updater čeka i nakon commit-a ponovo vidi ticket te odbija izmjenu; ako se status promijeni prvi, updater čeka i zatim ponovo provjerava ACTIVE status. Komentar u `create-ticket.ts` bilježi oslonac na FK lock protokol; runtime ticket-create ponašanje nije mijenjano.
- Postojeći API/error ugovor ostaje nepromijenjen: immutable verzija vraća `FORM_VERSION_IMMUTABLE` / HTTP 409. Nije dodana nova ruta, request polje, migracija ni schema kolona.
- `applyCatalogSnapshot`, drugi direktni FormVersion mutatori, ticket-create runtime, spec 56 i prag `250 ms` nisu mijenjani. Nema zaključka da je konfiguracijski BA-02 put popravljen.

## Direktni testni dokaz

- `backend/src/modules/service-catalog/service-forms.service.spec.ts` — Draft verzija bez ticketa može dobiti novu shemu uz očuvane `formVersionRef` i `version`; testni in-memory harness dobija `$queryRaw` stub samo lokalno u ovom testu i ne simulira row lock.
- `backend/src/modules/service-catalog/service-form-version-immutability.integration.spec.ts` — registrovani real-PostgreSQL suite sadrži dvije race provjere. (1) Ticket FK bind se desi unutar još otvorene transakcije; updater se potvrđeno vidi kako čeka row lock, nakon čega odbija sa HTTP 409 / `FORM_VERSION_IMMUTABLE`; red ostaje DRAFT sa originalnom shemom, a ticket count je 1. Test radi direktni row INSERT da izoluje FK lock; nije end-to-end poziv cijelog `createTicket` servisa. (2) Paralelna aktivacija promijeni status dok updater čeka; updater ponovo vidi ACTIVE, vraća isti 409, shema ostaje nepromijenjena, ticket count 0.
- `backend/scripts/run-isolated-integration.mjs` registruje ovaj suite u izolovanom real-DB runneru; `backend/scripts/run-isolated-integration.test.mjs` provjerava runner/database-isolation pomoćne funkcije.

## CI i testni dokaz

CI [`41456326648`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41456326648) na `{18456f845f07b67207a9fb8e4ba12ce1bdf79247}` završio je **success**:

- **Backend build + test:** passed — Prisma schema/artifact provjere, generated Prisma Client, backend build, lint, safety/wiring matrice i `npm test -- --ci --coverage=false` prošli su.
- **PostgreSQL/Redis integration:** passed — migracije su replayovane na disposable CI bazi; integration/isolation harnessi i `Run real PostgreSQL integration suites` prošli su. Novi `service-form-version-immutability.integration.spec.ts` nalazi se u runneru. GitHub raw job-log preuzimanje vratilo je `EOF`, pa nema izdvojenog per-suite test counta; navodi se job/step success, ne izmišljeni broj.
- **Frontend build + test:** passed — production dependency gate, lint, format, tests, build i bundle/cold-route budžeti prošli su.
- **Docs guard, backend container + supply chain i CI gate:** passed na implementacijskom SHA-u. Closeout-only dokumentacijske izmjene urađene su nakon tog runa; push workflow ignoriše docs-only commit, pa su te završne izmjene provjerene lokalnim docs/content i traceability guardovima ispod.
- **Skipped:** `E2E critical flows` je skipped jer push nije PR/schedule/manual E2E dispatch; `E2E install wizard` je skipped jer zahtijeva `workflow_dispatch` sa `install_spec`. Conditional `Enforce zero high/critical image vulnerabilities` korak je također skipped prema svom `if` uslovu; ne računam ga kao zasebno izvršen/pass korak. E2E/spec 56 sign-off nije ostvaren.
- **Neuspjeli CI pokušaji i korekcije:**
  - CI [`41454031231`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41454031231) na SHA `97a5f156adb85b2da074d9aa2fec5db1dfe49151` pao je na TypeScript grešci jer je query-lock metoda bila obavezna u tipu zajedničkog in-memory harnessa koji je ne implementirao. Odvojeni Perf [`41454031312`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41454031312) pao je na istom backend build blockeru prije k6 smoke-a. U commit-u `2ff3979854eb7bc8766bf288521e076bcb468ff3` query-lock tip je učinjen opcionalnim.
  - CI [`41454740801`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41454740801) na SHA `2ff3979854eb7bc8766bf288521e076bcb468ff3` prošao je build/lint i real-PostgreSQL integration, ali Jest je pao: `load-service-downtime-summary.spec.ts:66` očekivao je 2 reda, dobio 0; `service-catalog.availability.spec.ts:97` očekivao je `SCHEDULED_DOWNTIME`, dobio `CURRENTLY_AVAILABLE`. Uzrok je bila moja regresija: `$queryRaw` je bio dodan u shared fake pa su ta dva testa prešla na raw-query putanju sa praznim stub rezultatom. Commit `18456f8` uklanja shared property i postavlja stub samo u BA-01 unit testu; također čuva stari brzi error-precedence check, dok je konačna provjera i dalje pod lockom. Finalni CI iznad je zelen.
  - Neuspjeli Perf smoke [`41454740802`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41454740802) na SHA `2ff3979854eb7bc8766bf288521e076bcb468ff3` prijavio je `GET /search` p95 **969.93 ms** prema `<500 ms` i `POST /tickets/:id/messages` p95 **1265.02 ms** prema `<1000 ms`; service-catalog p95 **90.02 ms** i query-budget prosjek **2.092** prema `2.1` prošli su.

Odvojeni finalni Perf smoke [`41456326902`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41456326902) na istom testanom SHA-u je **failure**, ali nije BA-01 acceptance test: `GET /search` p95 **859.54 ms** (`<500 ms`, failed) i `POST /tickets/:id/messages` p95 **1026.25 ms** (`<1000 ms`, failed). `GET /services?take=100` p95 **99.72 ms** prema service-catalog pragu `<500 ms`, catalog contract failures **0**, te globalni query-budget prosjek **2.092** preko **48.151** zahtjeva prema limitu `2.1` prošli su. Ti search/message endpointi nisu mijenjani u BA-01; njihova uzročnost nije istraživana niti se status prikazuje kao green. Ovaj paket se zatvara na concurrency acceptance + zeleni CI, ne na tvrdnji da je cijeli Perf smoke zelen.

## Registar nalaza

- Zatvoren je samo `BA-service-catalog-01` (P1), i to za `updateServiceFormVersion` concurrency putanju opisanu iznad.
- Ostaju otvoreni u `service-catalog`: `BA-service-catalog-02`–`09` i `BA-service-catalog-13`–`15`. `BA-changes-08` i `BA-changes-13` ostaju zasebno otvoreni.
- Modul `service-catalog`: 4 P1, 8 P2 i 3 P3 ukupno; **11 otvorenih / 4 zatvorena**.
- Globalni deklarisani zbir: **566 otvorenih / 126 zatvorenih / 692 ukupno**. Machine-readable source: **569 otvorenih / 112 zatvorenih / 11 historijskih / 692 ukupno**. Severity zbir ostaje P1=174, P2=368, P3=150; preegzistentna razlika od tri statusa prema izvornim redovima ostaje dokumentovana.

## Migracija, rollout i rollback

Nema Prisma schema promjene, BA-01 migracije, manual DB koraka ni target-DB pristupa. CI replay-ovao je postojeće migracije na disposable PostgreSQL bazi; ciljna instalacija nije provjeravana ni mijenjana. Lokalno `DATABASE_URL`, `MIGRATION_DATABASE_URL` i `PRIVACY_IT_DATABASE_URL` nisu postavljeni.

Rollout je aplikacijski i nema API contract rez. Deployati novi backend na sve instance; dok god stara instanca prima update zahtjeve, ona može zadržati raniji race. Rollback je samo na aplikacijski SHA bez BA-01 popravke i vraća ranjivost; nema DB rollbacka niti podataka/migracija za ručno čišćenje.

## Lokalna provjera i ograničenja

- Ciljani ESLint nad BA-01 backend fajlovima prošao je; Prettier `--check` za in-memory harness, service-forms unit spec i concurrency integration spec prošao je.
- `node --test backend/scripts/run-isolated-integration.test.mjs` — **3/3 passed**; `git diff --check` prošao je.
- Nakon closeout dokumenata `node scripts/check-docs-content.mjs` prošao je (**32 stranice, 8 prevoda, 10 provjera**) i `node --test scripts/check-docs-content.test.mjs` prošao je **9/9**. `node scripts/check-backend-findings.mjs` prošao je **692/692**, `node --test scripts/check-backend-findings.test.mjs` **12/12**, a JSON parse je prošao. Prettier check za novi closeout i `docs/backend/README.md` prošao je; pet izmijenjenih historijskih audit/registar fajlova već je bilo neformatirano u roditeljskom SHA-u pa nisu široko preformatirani.
- Lokalni targeted Jest pokušaj ranije nije stigao do testova jer checkout nema generated Prisma enum/client modul (`TS2307`, `../../generated/prisma/enums`; **0 testova izvršeno**). To je sandbox generated-artifact ograničenje, ne pass. Finalni CI je generisao stvarni client i full backend Jest je prošao.
- Real PostgreSQL test nije pokrenut lokalno: `PRIVACY_IT_DATABASE_URL` nije postavljen. Nije lokalno pokrenuta Prisma generation, build, migracija ni target-DB provjera; ne pokušava se migrirati nepoznata baza.

## Sljedeći paket

**`BA-service-catalog-02` (P1):** provjera i domenski sigurno izvršenje config snapshot activation/rollback, uključujući historijsku FormVersion immutability. Nije započet; traži zaseban korisnički acceptance prije implementacije. Nema PR-a prema `master`, mergea ni promjene grane.
