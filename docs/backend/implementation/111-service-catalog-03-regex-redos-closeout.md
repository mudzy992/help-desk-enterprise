# Paketni closeout — `BA-service-catalog-03` (zatvoren po izričitoj owner-odluci; bez E2E sign-offa)

**Paket:** audit 15 / `service-catalog` — regex ReDoS zaštita<br>
**Nalaz:** `BA-service-catalog-03` (P1) — zatvoren owner-directed odlukom nakon što je korisnik potvrdio merge na `master` i zeleni CI/inventory run `41501000022`<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Kod / CI:** implementacija `06e92d6`, read-only workflow `2704f74`; korisnik je potvrdio merge na `master`. Run [`41501000022`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41501000022) na SHA `07592a7` (`master`) **success**: inventory, backend build/full tests, PostgreSQL/Redis integration, frontend, docs, container/supply-chain i CI gate passed; E2E install/critical i conditional image-enforcement korak **skipped**. Raniji Perf smoke `41493052534` **failed** na `search_duration p(95)<500 ms` (izvan BA-03 scopea).<br>
**Target-DB inventura:** read-only job u runu `41501000022` nad prod-identičnim `E2E_DATABASE_URL` **passed**: `formVersionCount=205`, `formsWithPatterns=0`, `patternCount=0`, `safePatternCount=0`, `unsafePatternCount=0`. DRAFT, ACTIVE i RETIRED: svaki `safe=0`, `unsafe=0`. Nema patterna za remedijaciju ni DB upisa/migracije.<br>
**Migracija / dependency:** nema Prisma migracije i nema nove runtime dependency<br>
**E2E / deployment:** E2E install wizard i critical flows bili su **skipped** u runu `41501000022`; nema browser/spec 56 sign-offa. Run ne sadrži deployment job; zatvaranje je owner-directed na korisnikov izričit zahtjev nakon mergea i green CI/inventory dokaza, ne tvrdnja da je deployment posebno provjeren.

## Nalaz i trenutni status

Audit je utvrdio da backend sinhrono izvršava administratorski JavaScript regex nad requester inputom. Ograničenje patterna na 256 znakova ne sprečava katastrofalni backtracking, a `maxLength` nije obavezan.

Kodni checkpoint uvodi safe-subset zaštitu, obavezni UTF-8 byte cap, fail-closed ponašanje za legacy pattern koji nije siguran, zaštitu svih standardnih schema-write/activation i config-snapshot puteva, browser-side zabranu regex evaluacije te read-only inventuru postojećih konfiguracija. Korisnik je potvrdio merge na `master` i dostavio run `41501000022`; provjera GitHub runa potvrđuje **success** za inventory, backend build/full tests, PostgreSQL/Redis integration, frontend, docs, container/supply-chain i CI gate. Inventory je read-only i vratio je `formVersionCount=205`, `formsWithPatterns=0`, `patternCount=0`, `safePatternCount=0`, `unsafePatternCount=0`; za svaki od DRAFT/ACTIVE/RETIRED vrijedi `safe=0`, `unsafe=0`. Nije bilo DB upisa ni migracije. **BA-03 je zatvoren po izričitom owner-directed zahtjevu korisnika** nakon mergea i ovih dokaza. E2E install/critical jobs bili su skipped, deployment nije job u ovom CI runu i nije potvrđen zasebnim deployment dokazom; zato se ne tvrdi E2E/spec 56 sign-off niti da je workflow sam izvršio deployment. Audit job nije objavio report artifact, a javni log prikazuje samo aggregate count-e.

## Implementacija

- `service-form-pattern-safety.ts` prihvata ograničen jezik: literale, `.`, jednostavne karakter-klase, ograničen skup escape sekvenci, `^` samo na početku, `$` samo na kraju, ukupno najviše jedno varijabilno ponavljanje te fiksne ponavljačke granice do 256 i zbirni fiksni budžet do 1.024. Grupe, alternacije, backreferencei, `\b`/`\B`, lazy ponavljanja, ugniježđena i višestruka varijabilna ponavljanja te neusidrena varijabilna ponavljanja odbijaju se.
- Ograničenje je strukturno, ne heurističko: bez grupa/alternacije nema ugniježđenih alternativnih putanja; najviše jedno varijabilno ponavljanje ne može se kombinovati s drugim; ako postoji, `^` sprečava ponovno pokretanje od svakog input offseta. Patterni bez varijabilnog ponavljanja imaju samo fiksan rad po početnoj poziciji. Pattern je najviše 256 znakova, svako fiksno ponavljanje najviše 256, fiksni budžet najviše 1.024, a regex input se ograničava na 4.096 UTF-8 bajta po polju i 16.384 bajta po zahtjevu. Matcher se zato izvršava samo nad ograničenim linearnim/polinomijalno omeđenim radom; nepouzdan regex izvan podskupa se ne poziva na JS backtracking engineu.
- Byte cap se mjeri nad originalnim stringom prije `trim`, klasifikacije i `.test`; mjeri se stvarna UTF-8 dužina, uključujući višebajtne znakove i surrogate parove. Kada je zbir pattern-inputa preko per-request capa, nijedan pattern u tom zahtjevu se ne evaluira.
- `parseConfiguredFormSchema` i `assertServiceFormPatternsSafe` štite create form, create version, draft update i activation. `validateServiceFormData` ponovo klasificira schema pattern, što pokriva već spremljene legacy forme i direktne interne pozive; unsafe/malformed pattern daje `INVALID` bez regex matcha. Activation odbija unsafe draft.
- `applyCatalogSnapshot` i katalog snapshot validator ne mogu uvesti, izmijeniti ili aktivirati unsafe pattern. Poseban `parseConfiguredLegacyFormSchema` služi samo kompatibilnosti: nepromijenjeni DRAFT/RETIRED pattern može ostati u snapshotu, ali promjena schemme, kreiranje replacement verzije ili ACTIVE status ponovo zahtijeva safe subset. Time se ne prepisuju historijske/immutable forme samo radi migracije regexa. Snapshot koji bi aktivirao unsafe legacy pattern odbija se.
- Frontend više ne poziva `new RegExp` za administratorski pattern. Serverska provjera ostaje autoritativna; browser validacija i input `maxLength` dodatno ograničavaju patterned vrijednosti. Frontend ne prikazuje pattern mismatch lokalno; server vraća postojeću field-validation grešku. Novi `UNSAFE_FORM_PATTERN` dobija lokalizovanu poruku za upravljanje formama.
- `backend/src/cli/classify-service-form-patterns.ts` i `npm run service-forms:patterns:audit` daju read-only, keyset-paginiranu inventuru svih `FormVersion` zapisa. Izvještaj klasificira svaki pattern po statusu, verziji i field ID-u, uključuje dužinu i SHA-256 fingerprint, ali **ne ispisuje raw pattern**. Izlazni fajl se kreira bez overwrite-a (`0600`); exit code `2` označava najmanje jedan unsafe pattern.
- GitHub CI ima ručni `service-form-audit` posao, aktiviran samo inputom `service_form_pattern_audit=true` i potvrdom `confirm_e2e_database_read_only=true`. Koristi samo `E2E_DATABASE_URL`, ne izvodi migracije ni E2E testove; report ostaje privremeno na runneru, dok javni job log prikazuje samo aggregate count-e po statusu, bez ID-a, fingerprinta ili regex teksta. Posao pada ako postoji unsafe ACTIVE pattern; unsafe DRAFT/RETIRED se prijavljuju kao count-i bez blokiranja gatea.

## Kompatibilnost i rollout gate

1. Prije deploya operator mora potvrditi tačan cilj baze i klasificirati sve pattern konfiguracije. Read-only audit `41498990874` je to izvršio nad potvrđenim prod-identičnim `E2E_DATABASE_URL`; nije bilo DB upisa ni migracije. Ako se deploya drugi target, inventuru ponoviti za taj target.
2. **Unsafe ACTIVE count mora biti nula prije rollouta.** Unsafe ACTIVE forma se remedira kreiranjem nove, safe verzije i njenom aktivacijom; immutable/ticket-bound historijska verzija se ne prepisuje. Inventuru ponoviti nakon remedijacije.
3. Klasifikacija unsafe DRAFT/RETIRED patterna se zadržava kao poznati legacy rizik, ali se takvi patterni ne izvršavaju. Mogu ostati nepromijenjeni; standardni write, aktivacija ili config snapshot promjena/aktivacija ih odbija dok se ne zamijene safe patternom. Ovo izbjegava prisilno mijenjanje immutable historije.
4. Tokom miješanog backend rollouta pauzirati service-form schema writeove i config snapshot activation; stara instanca još nema enforcement. Nastaviti tek kada su sve backend instance na novom kodu. Rollback na stari backend ponovo uklanja write/runtime guard i zato zahtijeva pauziranje tih putanja do sigurnog redeploya.
5. Nema migracije ni DB rollback koraka. Ovo je forward-only aplikacijski rollout; migracija nije potrebna.

Read-only inventuru pokrenuti u odobrenom, mrežno dostupnom build okruženju za ciljnu bazu. Ako Prisma Client nije generisan, prvo ga generisati; to nije migracija i ne mijenja bazu:

```bash
cd backend
DATABASE_URL="$TARGET_DATABASE_URL" npm run db:generate # samo ako src/generated/prisma nedostaje
npm run build
DATABASE_URL="$TARGET_DATABASE_URL" npm run service-forms:patterns:audit -- --output /secure/path/service-form-pattern-inventory.json
```

`TARGET_DATABASE_URL` treba postaviti iz odobrenog secret store-a; ne upisivati niti dijeliti credential u terminal logu, chatu ili izvještaju. Izlazni report ne sadrži regex tekst, ali sadrži interne service/form/field identifikatore i mora se čuvati kao operativni artefakt.

Za prod-identičnu `E2E_DATABASE_URL` može se dispatchati izolirani read-only job (browser E2E poslovi su tada eksplicitno preskočeni):

```bash
gh workflow run ci.yml --ref arena/864951a6-help-desk-enterprise \
  -f service_form_pattern_audit=true \
  -f confirm_e2e_database_read_only=true \
  -f skip_gates=true
```

Repository je javan, zato taj job **ne uploaduje report i ne ispisuje ID-eve, fingerprint-e ili pattern tekst**; javni log prikazuje samo aggregate count-e po statusu. Za detaljnu remedijaciju unsafe ACTIVE patterna operator treba sačuvati privatni report iz odobrenog secure runnera.

## Verifikacija

**Passed lokално:**

- Backend targeted Jest: **4 suites / 30 tests passed** — safe-subset klasifikacija, UTF-8 byte counting, inventory classifier, configured-schema enforcement i adversarial runtime validation. ReDoS test koristi `^(a+)+$` i input od 4.096 bajta; matcher spy potvrđuje da `RegExp.prototype.test` nije pozvan, a test mora završiti ispod 1.000 ms.
- Backend ESLint za izmijenjene/dodane BA-03 fajlove: **passed**.
- Frontend targeted Vitest: **2 suites / 4 tests passed**, uključujući provjeru da browser ne poziva regex matcher i da odbija input iznad UTF-8 capa.
- Frontend `npm run build`: **passed**.
- Frontend `npm run i18n:check`: **passed** (8.917 locale keys, 4.560 statičkih `t()` ključeva, 88 dinamičkih prefiksa).
- GitHub CI run `41493052519` na `06e92d6`: **passed** — backend build/lint/full Jest (uključujući ranije compile-blocked suiteove), backend PostgreSQL/Redis integration na disposable servisima, frontend build/tests, docs guard i završni CI gate.
- GitHub workflow YAML guard nakon dodavanja read-only inventory joba: **12/12 tests passed**, YAML guard passed, YAML je parsiran i 7 shell steps u novom jobu prošlo `bash -n`.

**Prepreke, skipped i failure:**

- Lokalni `service-forms.service.spec.ts`, `validate-catalog-domain-snapshot.spec.ts` i `apply-catalog-snapshot.spec.ts` bili su compile-blocked zbog nedostajućeg generisanog Prisma Clienta (0 lokalnih testova izvršeno); isti compile-blocked suiteovi zatim su prošli u punom GitHub backend CI runu nakon generisanja Clienta.
- Prod-identični target inventory je **passed** u runu `41501000022` na SHA `07592a7` (`master`; job `125468307183`): `formVersionCount=205`, `formsWithPatterns=0`, `patternCount=0`, `safePatternCount=0`, `unsafePatternCount=0`; DRAFT/ACTIVE/RETIRED imaju svaki `safe=0`, `unsafe=0`. Run `41498990874` imao je isti aggregate rezultat. Audit je bio read-only; nije bilo DB upisa ni migracije. Detaljni privatni report nije sačuvan kao workflow artifact; javni log prikazuje samo aggregate count-e.
- U CI runovima `41493052519`, `41498990874` i `41501000022`, E2E critical flows i E2E install wizard bili su **skipped**; u `41501000022` oba E2E posla su eksplicitno skipped. Conditional image high/critical enforcement step u runu `41501000022` također je **skipped**. Nema E2E/spec 56 sign-offa.
- Perf smoke run `41493052534` je **failed** na `search_duration p(95)<500 ms`; to je izvan BA-03 scopea i nije mijenjano. Postojeći spec 56 i prag `250 ms` nisu mijenjani.

## Scope i završni uslovi

Mijenjan je samo BA-03 regex sigurnosni put, njegove direktne write/config integration tačke, frontend matcher/cap, read-only inventory CI job i povezani testovi/lokalizacija/dokumentacija. Nema izmjene speca 56, globalnog praga `250 ms`, W7.15 hard-delete ili event-archival ponašanja, drugih audit nalaza, migracije ni DB upisa. Korisnik je potvrdio merge BA-03 koda/workflowa na `master`; run `41501000022` potvrđuje `master` SHA `07592a7`. Agent nije izvršio merge/deployment niti otvorio PR. Ovaj closeout update ide samo na fiksnu Arena granu.

`BA-service-catalog-03` je **zatvoren po izričitom owner-directed zahtjevu** nakon što je korisnik potvrdio merge na `master`, a run `41501000022` prošao. Target inventura ima `205` FormVersion zapisa i 0 patterna (`formsWithPatterns=0`, `patternCount=0`), uz `safe=0`/`unsafe=0` u svakom statusu; nema patterna za remedijaciju. Backend/full CI, PostgreSQL/Redis integration, frontend, docs i container/supply-chain poslovi prošli su. E2E critical/install bili su skipped, nema spec 56 sign-offa, a run nije dokaz zasebnog deploymenta. Ovo su ograničenja dokaza, ne prepreka owner-directed zatvaranju. Nakon ovog statusa `service-catalog` ima 9 otvorenih / 6 zatvorenih; deklarisani globalni zbir je 564 otvorenih / 128 zatvorenih, machine-readable plan 567 otvorenih / 114 zatvorenih / 11 historijskih.
