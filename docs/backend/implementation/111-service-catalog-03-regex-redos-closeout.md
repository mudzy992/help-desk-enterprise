# Paketni checkpoint — `BA-service-catalog-03` (rollout još nije odobren)

**Paket:** audit 15 / `service-catalog` — regex ReDoS zaštita<br>
**Nalaz:** `BA-service-catalog-03` (P1) — implementacija na radnoj grani; status ostaje otvoren dok ne prođu inventura ciljnih patterna i rollout acceptance<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Kodni SHA / CI:** implementacija `06e92d6`, read-only workflow `2704f74`; CI `41493052519` i `41496718042` **passed**; Perf smoke `41493052534` **failed** na `search_duration p(95)<500 ms` (izvan BA-03 scopea)<br>
**Target-DB inventura:** korisnik je potvrdio `E2E_DATABASE_URL` kao prod-identičan cilj; audit nije izvršen jer je workflow dispatch odbijen HTTP 403 prije kreiranja runa<br>
**Migracija / dependency:** nema Prisma migracije i nema nove runtime dependency<br>
**E2E / deployment:** audit i E2E critical/install jobs **skipped** na pushu; nema E2E/spec 56 sign-offa i nije izvršen deployment

## Nalaz i trenutni status

Audit je utvrdio da backend sinhrono izvršava administratorski JavaScript regex nad requester inputom. Ograničenje patterna na 256 znakova ne sprečava katastrofalni backtracking, a `maxLength` nije obavezan.

Kodni checkpoint uvodi safe-subset zaštitu, obavezni UTF-8 byte cap, fail-closed ponašanje za legacy pattern koji nije siguran, zaštitu svih standardnih schema-write/activation i config-snapshot puteva, browser-side zabranu regex evaluacije te read-only inventuru postojećih konfiguracija. CI sa generisanim Prisma Clientom i ciljanim backend/frontend testovima je prošao. Manualni read-only inventory job je pushan, ali `gh workflow run` dispatch je odbijen HTTP 403 prije kreiranja runa; nije uspostavljena DB konekcija. **Nalaz se ne zatvara**: prod-identična ciljna baza još nije klasificirana i kod nije redeployan. Rollout je blokiran do inventure i remedijacije unsafe ACTIVE patterna.

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

1. Prije deploya operator mora potvrditi tačan cilj baze, izgraditi CLI i pokrenuti inventuru s eksplicitnim `DATABASE_URL` za tu bazu. Ova sesija nije čitala niti mijenjala target bazu.
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

**Blocked / nije passed:**

- Lokalni `service-forms.service.spec.ts`, `validate-catalog-domain-snapshot.spec.ts` i `apply-catalog-snapshot.spec.ts` bili su compile-blocked zbog nedostajućeg generisanog Prisma Clienta (0 lokalnih testova izvršeno); isti compile-blocked suiteovi zatim su prošli u punom GitHub backend CI runu nakon generisanja Clienta.
- Target inventory još nije izvršen. Lokalnom runneru nisu dostupni `DATABASE_URL`/`E2E_DATABASE_URL`, `.env` ni generated client; lokalni Prisma CLI bootstrap je blokiran TLS pristupom `binaries.prisma.sh`. Zaseban manual read-only job je dodan i pushan; pokušaj `gh workflow run` završio je HTTP 403 `Resource not accessible by integration` prije kreiranja runa. Nije bilo DB konekcije ni migracije iz ove sesije.
- U CI runu `41493052519`, E2E critical flows i E2E install wizard bili su **skipped** na push triggeru; conditional image high/critical enforcement step je također **skipped**. Nema E2E/spec 56 sign-offa.
- Perf smoke run `41493052534` je **failed** na `search_duration p(95)<500 ms`; to je izvan BA-03 scopea i nije mijenjano. Postojeći spec 56 i prag `250 ms` nisu mijenjani.

## Scope i završni uslovi

Mijenjan je samo BA-03 regex sigurnosni put, njegove direktne write/config integration tačke, frontend matcher/cap, read-only inventory CI job i povezani testovi/lokalizacija/dokumentacija. Nema izmjene speca 56, globalnog praga `250 ms`, W7.15 hard-delete ili event-archival ponašanja, drugih audit nalaza, migracije, DB upisa, deploymenta ili PR-a. Kodni commit `06e92d6` i push na fiksnu granu su završeni; nije bilo mergea.

`BA-service-catalog-03` ostaje **otvoren** dok se ne izvrši target-DB inventura, otklone unsafe ACTIVE patterni i korisnik odobri rollout. Backend CI i relevantni testovi su prošli na stvarnom generisanom Prisma Clientu.
