# W2.20 — `BA-authentication-07`: Prisma generate/validate offline, bez engine downloada

**Paket:** W2.20<br>
**Nalaz:** `BA-authentication-07` (P2) — zatvoren<br>
**Kodni commit:** `5e0ced9`<br>
**Finalni testani SHA:** `5e0ced9` (kod, svi poslovi zeleni)<br>
**CI:** [`45787401701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45787401701)<br>
**DB migracije:** **ne** — nema promjene šeme

## Nalaz

Audit je tvrdio: „24/40 suiteova ne kompajlira bez generated clienta; generator pokušava runtime download sa
`binaries.prisma.sh`, nedostupnim u audit okruženju."

Reprodukcija u ovom okruženju (mreža dozvoljava samo nekoliko hostova) potvrdila je nalaz i pokazala da je
uzrok **drugačiji nego što se činilo**:

```
$ cd backend && DATABASE_URL=... npx prisma generate
Loaded Prisma config from prisma.config.ts.

Error: request to https://binaries.prisma.sh/all_commits/d1b3f377.../debian-openssl-3.0.x/schema-engine.sha256
failed, reason: Client network socket disconnected before secure TLS connection was established
```

Dvije stvari su ključne:

1. **`prisma generate --help` pada isto.** Download nije posljedica generisanja — Prisma 7 CLI na startu, prije
   dispečinga komande, poziva `ensureBinariesExist()` i pokušava dohvatiti `schema-engine` za tekuću platformu.
2. **Taj binar nije potreban za `generate`/`validate`/`format`.** Te komande rade iz WASM enginea koji je već u
   `prisma` npm paketu (`build/schema_engine_bg.wasm`, `build/prisma_schema_build_bg.wasm`). Native engine treba
   samo `migrate`/`db` putu.

Posljedica za repo: bez `src/generated/prisma` suiteovi padaju na `Cannot find module
'../../generated/prisma/client'` — stack trace koji ne govori ništa o kodu koji se testira, i to na svakom
čistom checkoutu bez mreže.

## Promjena

### 1. Wrapper `backend/scripts/prisma-offline.mjs`

Za `generate`, `validate` i `format` postavlja `PRISMA_SCHEMA_ENGINE_BINARY` na **sentinel** u repou
(`scripts/prisma-offline-schema-engine.mjs`), pa CLI-jeva provjera „postoji li binar" prolazi bez ijednog
mrežnog poziva. Sentinel je stvarni, izvršivi fajl, ali **nije** engine: ako ga ikad nešto izvrši, ispisuje
akcionu poruku i izlazi sa 1 — buduća Prisma verzija koja počne koristiti native engine za te komande pada
glasno, umjesto da tiho generiše nešto pogrešno.

Za sve ostalo (`migrate`, `db`, `migrate status`, …) wrapper **ne mijenja okolinu**: ti putevi stvarno trebaju
pravi engine, pa se ponašaju kao i ranije (download, ili operatorov `PRISMA_SCHEMA_ENGINE_BINARY` /
`PRISMA_ENGINES_MIRROR`). Ako je operator stage-ovao pravi binar, wrapper ga ne dira ni za offline-safe komande.

`planInvocation()` je čista funkcija — odluku dokazuje unit test, bez pokretanja CLI-ja.

### 2. Pin engine-a: `backend/prisma/engines.lock.json`

```json
{
  "enginesVersion": "d1b3f377ca835d73fd50954a5e22128b9ebdd6b8",
  "engineCommit": "d1b3f377ca835d73fd50954a5e22128b9ebdd6b8",
  "buildPathRequiresEngineBinary": false,
  "migratePathRequiresEngineBinary": true,
  "offlineStaging": { "variable": "PRISMA_SCHEMA_ENGINE_BINARY", "mirrorVariable": "PRISMA_ENGINES_MIRROR", … }
}
```

`scripts/prisma-offline.test.mjs` čita instalirani `@prisma/engines-version` i **pada kad pin driftuje** — Prisma
bump mora u isti pregledani commit nositi i izmjenu pina. (Audit je tražio „pinovani engine ili dozvoljeni
mirror"; ovdje je pin eksplicitan, a build put uopšte ne treba binar.)

### 3. `globalSetup` za Jest: `backend/scripts/jest-prisma-setup.cjs`

Na čistom checkoutu generiše klijent **prije** radnika, offline, i to samo kad artefakti nedostaju (na svakom
CI prolazu i svakom normalnom lokalnom radu to je no-op). Ako generisanje ne uspije, pada sa listom problema iz
guard-a i uputom `npm run db:generate`, umjesto 24 kriptična `Cannot find module`. Isključivo preko
`PRISMA_SKIP_JEST_GENERATE=1`.

### 4. Skripte i image

- `db:generate` → `node scripts/prisma-offline.mjs generate`
- novi `db:validate`, novi `db:offline:test`
- `db:init`: `prisma migrate deploy && npm run db:generate && …` (migrate i dalje treba engine; generate ne)
- **`backend/Dockerfile`**: `RUN node scripts/prisma-offline.mjs generate` — image build više ne zavisi od
  `binaries.prisma.sh`

### 5. CI

`ci.yml`, backend posao:

| Korak | Šta dokazuje |
| --- | --- |
| `npm run db:validate` (umjesto `npx prisma validate`) | šema se validira bez mreže |
| `npm run db:offline:test` | ugovor wrappera + pin engine-a (7 testova) |
| **„Prove generate/validate need no network (wiped client, dead mirror)"** — `rm -rf src/generated/prisma`, `PRISMA_ENGINES_MIRROR=http://127.0.0.1:9`, pa validate + generate + guard | generisanje je dokazano offline; svaki download bi odmah pao na `ECONNREFUSED` |
| **„Run every authentication suite"** — `npx jest src/modules/authentication --ci` | acceptance iz nalaza: svi auth suiteovi zeleni |

`perf-smoke.yml`: `npx prisma generate` → `npm run db:generate`.

Nije mijenjano: `migrate`/`db` putevi, `check-generated-prisma` guard i njegov test, kontejnerski ugovor,
migracije, šema.

## Dokaz (lokalno, bez mreže)

Sve u sandboxu gdje `binaries.prisma.sh` **nije dostupan**, uz `PRISMA_ENGINES_MIRROR=http://127.0.0.1:9` da
svaki eventualni download odmah padne:

| Radnja | Rezultat |
| --- | --- |
| `rm -rf src/generated/prisma` → `npm run db:validate` | `The schemas at prisma/schema are valid 🚀` |
| `npm run db:generate` | `✔ Generated Prisma Client (7.10.1) to ./src/generated/prisma in 1.30s` |
| `npm run check:prisma-generated` | `✓ generated Prisma gate: 4/4 obavezna artefakta` |
| `npx jest src/modules/authentication` **sa obrisanim klijentom** | **43 passed, 3 skipped (integracija), 372 testa, 0 failed** — klijent generisan offline u `globalSetup`-u |
| `npm run db:offline:test` | **7/7** |
| `node scripts/prisma-offline.mjs migrate status` | ispiše „zahtijeva pravi schema engine", pa Prisma pokuša download i padne (`ECONNREFUSED`) — **sentinel se ne daje migrate putu** |
| `npm run lint` | 0 error (6 postojećih warninga) |
| `npm run container:check` | ✓ non-root, SIGTERM, read-only, dropped caps |
| `npm run wiring:check` | ✓ 99 kontrolera / 633 rute (nepromijenjeno) |
| `npm run check:prisma-generated:test` | ✓ |

**Šta `db:offline:test` pokriva (7 testova):** offline-safe lista je tačno `generate|validate|format`; sve tri
komande dobijaju sentinel i `PRISMA_HIDE_UPDATE_MESSAGE`; operatorov `PRISMA_SCHEMA_ENGINE_BINARY` ostaje
netaknut; `migrate`/`db`/prazna komanda **nikad** ne dobijaju sentinel; placeholder `DATABASE_URL` se dodaje
samo kad ga nema; sentinel postoji, izvršiv je, i izvršavanje daje exit 1 sa uputom na `prisma/engines.lock.json`;
pin engine-a odgovara instaliranom `@prisma/engines-version`.

**Napomena o „40 suiteova":** nalaz je pisan kad je modul imao 40 spec fajlova; danas ih je **46** (43 unit + 3
integracijska). Acceptance je ispunjen na tekućem broju: 43/43 unit suitea prolaze na čistom checkoutu bez mreže,
a 3 integracijska se u CI izvršavaju u poslu „Backend PostgreSQL + Redis integration".

## CI

### Kodni commit `5e0ced9` — [`45787401701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45787401701): **success, svi poslovi, bez reruna**

| Posao | Rezultat |
| --- | --- |
| `Backend build + test` | **success** — uključuje `db:validate`, `db:generate`, `check:prisma-generated`, `db:offline:test` (7/7), korak „Prove generate/validate need no network (wiped client, dead mirror)“ i korak „Run every authentication suite“ |
| `Backend PostgreSQL + Redis integration` | success |
| `Backend container + supply chain` | success — image se builda sa `node scripts/prisma-offline.mjs generate` |
| `Frontend build + test` | success |
| `E2E critical flows` | **success** (spec 15 socket flake se nije pojavio) |
| `CI gate` | success |
| `Docs guard` | skipped — u tom commitu nije bilo docs izmjena |
| Perf smoke | [`45787401067`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45787401067) success (`npm run db:generate` u profilu) |

### Docs commit `68dfcaf` — [`45790062044`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45790062044): **E2E crven iz infrastrukturnog razloga**

| Posao | Rezultat |
| --- | --- |
| `Docs guard` | **success** (prvi prolaz guarda na ovom PR-u) |
| `Backend build + test`, `Backend PostgreSQL + Redis integration`, `Backend container + supply chain`, `Frontend build + test` | success |
| `E2E critical flows` | **failure** — ne u specu: pada u `globalSetup`, prije ijednog testa |
| `CI gate` | failure (posljedica E2E posla) |

**Šta se tačno dogodilo (zapisano, ne prikriveno):** `POST /auth/mfa/verify` vraća `401 MFA_INVALID_CODE` za
super-admina u `loginWithRateLimitBackoff` (`e2e/global-setup.ts:30`). Playwright `results.json`:
`0 passed, 0 failed, 0 flaky, 0 skipped`, `expected 0 / unexpected 0` — nijedan spec nije izvršen, pa nijedna
provjera iz ovog paketa nije ni mogla uticati. Dva reruna (`09:20`, `09:51`) pala su **identično** (različiti
`requestId`-ovi, isti `MFA_INVALID_CODE`).

**Zašto to nije ovaj diff:** (1) isti kod je na `5e0ced9` prošao E2E u cjelosti; (2) ovaj commit mijenja samo
`docs/`; (3) paralelno je `master` run [`45789099561`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45789099561)
(u koji je spojen PR #34) visio u koraku „Run E2E“ **preko sat vremena** — dva E2E prolaza na istom stacku, a
super-admin TOTP ima replay zaštitu po vremenskom koraku (`e2e/helpers/mfa.ts`: server odbija korak `<= lastStep`,
prihvata ±1) i samo jedan secret (`E2E_SUPERADMIN_TOTP_SECRET` / `.auth/mfa.json`).

**Preporuka za operativu (akciono):** postaviti repo varijablu `E2E_FORCE_MFA_RESET=1` (workflow je čita na
`ci.yml:959`; `e2e/README.md:82`) ili pokrenuti dispatch sa svježim resetom super-admin MFA uz dostupan SSH
tunel, pa rerun. Do tada `E2E critical flows` na ovom PR-u ostaje crven **iz okruženja**, a zelen je na kodnom
commitu. Ovaj nalaz ide u isti triage kao i `specs=15` flake iz `W2.18`: jedan dijeljeni stack + jedan TOTP
secret = dva paralelna E2E prolaza se međusobno blokiraju.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-07` → `zatvoreno (W2.20)` + implementacijski
  status uz nalaz.
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.20`.
- Regenerisano guardom `audit:traceability` (registar, master plan, plan JSON, audit README).

## Rizik

- **Sentinel je namjerno „lažni" engine.** Cijena nula-downloada bez vendoringa ~20 MB binara po platformi je da
  buduća Prisma verzija koja počne izvršavati native engine za `generate`/`validate` pada sa jasnom porukom
  (`schema engine nije dostupan … prisma/engines.lock.json`). Test to drži eksplicitnim.
- **Pin se mora ažurirati uz Prisma bump** — guard namjerno pada dok se to ne uradi.
- **`globalSetup` generiše u toku testa.** Dva paralelna jest procesa mogu oba generisati; zadnji upis pobjeđuje i
  oba prolaze (generisanje piše iste artefakte). `PRISMA_SKIP_JEST_GENERATE=1` isključuje ponašanje.
- **`migrate`/`db` ostaju mrežno zavisni** bez stage-ovanog binara. To je stvarna potreba native enginea, ne ovaj
  nalaz; offline put je `PRISMA_SCHEMA_ENGINE_BINARY` sa commitom iz `engines.lock.json`.
- `BA-authentication-08` (P3, clone brisanje svih passkeya) ostaje otvoren.

## Vizuelna provjera (ručni koraci)

Nije primjenjivo — nema promjene UI-ja, ruta ni odgovora API-ja. Dokaz je u build/test putu (tabela iznad i CI
koraci).

## Granica paketa

- Nije dirana šema, migracije, seed, `check-generated-prisma` guard, niti bilo koji test osim novih skripti.
- Nije diran produkcijski runtime image (samo builder stage, i to jedna linija).
- Nije dirano ponašanje `migrate`/`db` komandi ni release migratora.

## Sljedeći paket

**W2.21 — `BA-authentication-08` (P3):** clone detekcija jednog passkeya briše sve korisnikove passkeye.
