# Paketni checkpoint — `BA-service-catalog-03` (rollout još nije odobren)

**Paket:** audit 15 / `service-catalog` — regex ReDoS zaštita<br>
**Nalaz:** `BA-service-catalog-03` (P1) — implementacija na radnoj grani; status ostaje otvoren dok ne prođu inventura ciljnih patterna i rollout acceptance<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Kodni SHA / CI:** nema novog commit-a ni CI runa u ovom checkpointu<br>
**Target-DB inventura:** nije pokrenuta; nema pregleda produkcijske baze niti pretpostavke da su postojeći patterni sigurni<br>
**Migracija / dependency:** nema Prisma migracije i nema nove runtime dependency<br>
**E2E / Perf / deployment:** nisu pokrenuti; nema browser/spec 56 ili Perf sign-offa i nije izvršen deployment

## Nalaz i trenutni status

Audit je utvrdio da backend sinhrono izvršava administratorski JavaScript regex nad requester inputom. Ograničenje patterna na 256 znakova ne sprečava katastrofalni backtracking, a `maxLength` nije obavezan.

Kodni checkpoint uvodi safe-subset zaštitu, obavezni UTF-8 byte cap, fail-closed ponašanje za legacy pattern koji nije siguran, zaštitu svih standardnih schema-write/activation i config-snapshot puteva, browser-side zabranu regex evaluacije te read-only inventuru postojećih konfiguracija. **Nalaz se ne zatvara:** produkcijska/target baza nije klasificirana, CI sa generisanim Prisma Clientom nije izvršen i kod nije redeployan. Rollout je blokiran do inventure i remedijacije unsafe ACTIVE patterna.

## Implementacija

- `service-form-pattern-safety.ts` prihvata ograničen jezik: literale, `.`, jednostavne karakter-klase, ograničen skup escape sekvenci, `^` samo na početku, `$` samo na kraju, ukupno najviše jedno varijabilno ponavljanje te fiksne ponavljačke granice do 256 i zbirni fiksni budžet do 1.024. Grupe, alternacije, backreferencei, `\b`/`\B`, lazy ponavljanja, ugniježđena i višestruka varijabilna ponavljanja te neusidrena varijabilna ponavljanja odbijaju se.
- Ograničenje je strukturno, ne heurističko: bez grupa/alternacije nema ugniježđenih alternativnih putanja; najviše jedno varijabilno ponavljanje ne može se kombinovati s drugim; ako postoji, `^` sprečava ponovno pokretanje od svakog input offseta. Patterni bez varijabilnog ponavljanja imaju samo fiksan rad po početnoj poziciji. Pattern je najviše 256 znakova, svako fiksno ponavljanje najviše 256, fiksni budžet najviše 1.024, a regex input se ograničava na 4.096 UTF-8 bajta po polju i 16.384 bajta po zahtjevu. Matcher se zato izvršava samo nad ograničenim linearnim/polinomijalno omeđenim radom; nepouzdan regex izvan podskupa se ne poziva na JS backtracking engineu.
- Byte cap se mjeri nad originalnim stringom prije `trim`, klasifikacije i `.test`; mjeri se stvarna UTF-8 dužina, uključujući višebajtne znakove i surrogate parove. Kada je zbir pattern-inputa preko per-request capa, nijedan pattern u tom zahtjevu se ne evaluira.
- `parseConfiguredFormSchema` i `assertServiceFormPatternsSafe` štite create form, create version, draft update i activation. `validateServiceFormData` ponovo klasificira schema pattern, što pokriva već spremljene legacy forme i direktne interne pozive; unsafe/malformed pattern daje `INVALID` bez regex matcha. Activation odbija unsafe draft.
- `applyCatalogSnapshot` i katalog snapshot validator ne mogu uvesti, izmijeniti ili aktivirati unsafe pattern. Poseban `parseConfiguredLegacyFormSchema` služi samo kompatibilnosti: nepromijenjeni DRAFT/RETIRED pattern može ostati u snapshotu, ali promjena schemme, kreiranje replacement verzije ili ACTIVE status ponovo zahtijeva safe subset. Time se ne prepisuju historijske/immutable forme samo radi migracije regexa. Snapshot koji bi aktivirao unsafe legacy pattern odbija se.
- Frontend više ne poziva `new RegExp` za administratorski pattern. Serverska provjera ostaje autoritativna; browser validacija i input `maxLength` dodatno ograničavaju patterned vrijednosti. Frontend ne prikazuje pattern mismatch lokalno; server vraća postojeću field-validation grešku. Novi `UNSAFE_FORM_PATTERN` dobija lokalizovanu poruku za upravljanje formama.
- `backend/src/cli/classify-service-form-patterns.ts` i `npm run service-forms:patterns:audit` daju read-only, keyset-paginiranu inventuru svih `FormVersion` zapisa. Izvještaj klasificira svaki pattern po statusu, verziji i field ID-u, uključuje dužinu i SHA-256 fingerprint, ali **ne ispisuje raw pattern**. Izlazni fajl se kreira bez overwrite-a (`0600`); exit code `2` označava najmanje jedan unsafe pattern.

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

## Verifikacija

**Passed lokално:**

- Backend targeted Jest: **4 suites / 30 tests passed** — safe-subset klasifikacija, UTF-8 byte counting, inventory classifier, configured-schema enforcement i adversarial runtime validation. ReDoS test koristi `^(a+)+$` i input od 4.096 bajta; matcher spy potvrđuje da `RegExp.prototype.test` nije pozvan, a test mora završiti ispod 1.000 ms.
- Backend ESLint za izmijenjene/dodane BA-03 fajlove: **passed**.
- Frontend targeted Vitest: **2 suites / 4 tests passed**, uključujući provjeru da browser ne poziva regex matcher i da odbija input iznad UTF-8 capa.
- Frontend `npm run build`: **passed**.
- Frontend `npm run i18n:check`: **passed** (8.917 locale keys, 4.560 statičkih `t()` ključeva, 88 dinamičkih prefiksa).

**Blocked / nije passed:**

- Backend `service-forms.service.spec.ts`, `validate-catalog-domain-snapshot.spec.ts` i `apply-catalog-snapshot.spec.ts` pokušani su, ali lokalni checkout nema generisani `backend/src/generated/prisma/enums`/Prisma Client; suiteovi su blokirani na TypeScript compile/preflightu (0 testova izvršeno). To nije uspjeh testa niti dokaz da su ovi suiteovi prošli.
- Puni backend build/Jest, PostgreSQL/Redis integration, CI i disposable-DB testovi nisu izvršeni u ovom checkpointu. Korisnik je odabrao staging za inventuru, ali ovaj runner nema `DATABASE_URL`, `.env` ni generisani Prisma Client. Pokušaj učitavanja Prisma CLI-a s inertnim placeholder URL-om bio je blokiran TLS pristupom `binaries.prisma.sh`; nije uspostavljena DB konekcija niti pokrenuta migracija. Target-DB classifier nije pokrenut.
- E2E i Perf nisu pokrenuti/skipped; nema E2E/spec 56 sign-offa. Postojeći spec 56 i njegov prag `250 ms` nisu mijenjani.

## Scope i završni uslovi

Mijenjan je samo BA-03 regex sigurnosni put, njegove direktne write/config integration tačke, frontend matcher/cap i povezani testovi/lokalizacija/dokumentacija. Nema izmjene speca 56, globalnog praga `250 ms`, W7.15 hard-delete ili event-archival ponašanja, drugih audit nalaza, migracije, deploymenta, commita, pushanja ili PR-a.

`BA-service-catalog-03` ostaje **otvoren** dok se ne izvrši target-DB inventura, otklone unsafe ACTIVE patterni, backend CI i relevantni testovi prođu na stvarnom generisanom Prisma Clientu te korisnik odobri rollout.
