# 362 — W2.28 `BA-authorization-04`: Prisma precondition je zajednička faza, a ne trik Jest-a

**Paket:** `W2.28` · **Nalaz:** `BA-authorization-04` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** backend platform/CI · **Povezano:** `BA-authentication-07` (W2.20), `BA-authorization-02`

## 1. Nalaz i šta je stvarno ostalo otvoreno

Baseline audita: „10/25 suiteova ne kompajlira bez `src/generated/prisma/client`; engine download nije dostupan
u audit sandboxu." Nalaz je od početka upućivao na zajednički platformski problem (`BA-authentication-07`), i
**W2.20 ga je većim dijelom zatvorio**: `scripts/prisma-offline.mjs` (generate/validate bez `schema-engine`
binara), `prisma/engines.lock.json` (pin engine-a za migrate put), `scripts/check-generated-prisma.mjs` (guard
nad artefaktima) i Dockerfile koji generiše kroz offline wrapper.

Provjera premise prije ovog paketa pokazala je da je od nalaza ostalo **tri** stvari, i nijedna nije bila
„fale nam binari":

| Šta je W2.20 ostavio | Zašto to nije bilo dovoljno za ovaj nalaz |
| --- | --- |
| `globalSetup` u `jest.config.cjs` | pokriva **samo** Jest; `npm run build` na čistom checkoutu i dalje pada sa `Cannot find module .../generated/prisma/client`, tj. acceptance („i backend build") nije bio dokazan |
| dokaz iz W2.20 („43 passed / 3 skipped", obrisan klijent + mrtav mirror) | mjerio je **authentication** suiteove; nijedan zapis ne pokazuje da **authorization** modul — 29 fajlova danas — prolazi u tom režimu |
| politika generisanja zapisana u `jest-prisma-setup.cjs` | pravilo je živjelo u Jest specifičnom fajlu, pa ga drugi ulazi nisu mogli naslijediti bez kopiranja |

Sam defekt iz audita („10/25 ne kompajlira") **više ne postoji**: modul se danas kompajlira i izvršava, ali to
nije bilo ni zapisano ni čuvano testom. Zato ovaj paket ne ponavlja W2.20 mehanizam — izvlači ga na zajedničko
mjesto i dokazuje acceptance na tačno onom modulu na kojem je nalaz nastao.

## 2. Korekcija

### 2.1 Jedna precondition faza za sve ulaze

Novi `backend/scripts/ensure-generated-prisma.mjs` izvozi `ensureGeneratedPrisma()` koji:

1. pita **postojeći** guard (`inspectGeneratedPrisma`) da li su sva četiri obavezna artefakta tu — ako jesu,
   posao je gotov (brz put, svaki CI run);
2. ako nisu, generiše kroz `scripts/prisma-offline.mjs` (bez `schema-engine` binara — radi sa zatvorenom mrežom);
3. ako generate padne ili artefakti i dalje ne valjaju, baca poruku koja imenuje ručnu komandu
   (`npm run db:generate`) umjesto da test padne na `Cannot find module`.

Ulazi koji je sada dijele:

| Ulaz | Kako | Efekat |
| --- | --- | --- |
| `npm run build` | `prebuild` → `node scripts/ensure-generated-prisma.mjs` | čist checkout se builduje bez ručnog koraka i bez mreže |
| Jest (unit **i** izolovani integracijski runner, jer oba idu kroz `jest.config.cjs`) | `scripts/jest-prisma-setup.cjs` delegira na isti helper | ponašanje W2.20 nepromijenjeno, pravilo više nije u Jest fajlu |
| operator / CI | `npm run db:ensure-generated` | ista poruka i isti ishod kao u build putu |

`PRISMA_SKIP_JEST_GENERATE=1` (W2.20) i `PRISMA_SKIP_ENSURE_GENERATED=1` (novi CLI) ostaju izlazi za
dijagnostiku.

### 2.2 Dokaz je u CI-ju, na modulu iz nalaza

`Backend build + test` job sada, sa mrtvim mirrorom (`PRISMA_ENGINES_MIRROR: http://127.0.0.1:9`):

```yaml
rm -rf src/generated/prisma
npm run build                      # prolazi kroz prebuild → offline generate
npm run check:prisma-generated
rm -rf src/generated/prisma
npm test -- --runInBand src/modules/authorization   # globalSetup generiše offline
npm run check:prisma-generated
```

Time je acceptance provjeren doslovno: **build** i **authorization suiteovi** rade iz stanja u kojem klijenta
nema, a svaki pokušaj preuzimanja engine-a puca odmah. Redoslijed je namjerno **poslije** `wiring:check` — stale
route manifest mora pasti prije bilo kojeg builda (postojeći guard test to i dalje traži).

### 2.3 Guard nad guardom

- `scripts/ensure-generated-prisma.test.mjs` (4 testa, `node --test`): brz put bez ijedne generacije i bez
  šuma; generisanje + re-verifikacija; pad generate-a ⇒ poruka sa ručnom komandom; generacija koja ne zadovolji
  guard ⇒ poruka sa listom problema. Zavisnosti (`inspect`, `runGenerate`, `warn`) su injektovane, pa test ne
  dira pravi klijent ni mrežu.
- `scripts/check-workflows-yaml.test.mjs` (+1): backend job **mora** imati `db:ensure-generated:test`, mrtav
  mirror i `npm test -- --runInBand src/modules/authorization`, i klijent mora biti obrisan **prije** suiteova.
  Brisanje dokaza iz workflowa ruši test.

## 3. Dokaz

### 3.1 Lokalno (isti režim kao CI: obrisan klijent, mrtav mirror)

```
$ rm -rf src/generated/prisma
$ PRISMA_ENGINES_MIRROR=http://127.0.0.1:9 npm run build
Prisma klijent nije generisan (4 problema) — generišem ga offline prije kompajliranja (W2.28).
✔ Generated Prisma Client (7.10.1) to ./src/generated/prisma in 1.77s
Prisma klijent je generisan offline; nastavljam.
> nest build            (exit 0)

$ rm -rf src/generated/prisma
$ PRISMA_ENGINES_MIRROR=http://127.0.0.1:9 npm test -- --runInBand src/modules/authorization
Test Suites: 2 skipped, 27 passed, 27 of 29 total
Tests:       2 skipped, 127 passed, 129 total
```

Modul ima **29** spec fajlova: **27 unit** (svi izvršeni) i **2 real-DB integracijska**
(`evaluate-resource-policy.integration.spec.ts`, `route-authorization-negative-matrix.integration.spec.ts`) koji
su u Jest-u preskočeni bez `PRIVACY_IT_DATABASE_URL`, a izvršavaju se u `Backend PostgreSQL + Redis integration`
poslu jer su registrovani u `scripts/run-isolated-integration.mjs`. Nijedan suite nije „compile-blocked" —
broj iz audita (10/25) je pao na 0.

### 3.2 Guardovi

| Provjera | Ishod |
| --- | --- |
| `npm run db:ensure-generated:test` | 4/4 |
| `npm run db:offline:test` (W2.20) | 7/7 |
| `npm run check:prisma-generated:test` | 3/3 |
| `node --test scripts/check-workflows-yaml.test.mjs` | 15/15 (uključujući novi test) |
| `node scripts/check-workflows-yaml.mjs` | OK |
| `eslint` na nova tri fajla | čist |

### 3.3 CI

_Detalji se dopunjavaju uz PR._

## 4. Šta paket mijenja u ponašanju

- `npm run build` na čistom checkoutu **više ne pada**: `prebuild` generiše klijent offline. Kada je klijent
  već tu, korak je no-op (jedan guard čitanje).
- Poruke o neuspjehu generisanja sada imenuju `npm run db:generate` i ispis iznad, umjesto da izgledaju kao
  greška u kodu pod testom.
- Nijedan HTTP kontrakt, šema, migracija ni runtime put se ne mijenjaju: paket dira build/test infrastrukturu.

## 5. Granica paketa

- **Ne** mijenja W2.20 mehanizam (`prisma-offline.mjs`, `engines.lock.json`, `check-generated-prisma.mjs` ni
  Dockerfile) — samo ga izlaže kroz zajednički ulaz i dodaje dokaz.
- **Ne** dodaje `prestart:dev`/`prestart`: dev put i dalje koristi postojeći `npm run db:init` (migrate +
  generate + build + seed) ili jednokratni `npm run db:ensure-generated`; build i testovi su ti koji su sada
  samodovoljni.
- **Ne** dira `BA-authorization-02` (route authorization registry) — to je sljedeći paket modela dozvola.
- **Ne** pokreće integracijske suiteove bez baze: oni ostaju u izolovanom runneru i CI integracijskom poslu.

## 6. Reference

- Kod: `backend/scripts/ensure-generated-prisma.mjs`, `backend/scripts/jest-prisma-setup.cjs`,
  `backend/package.json` (`prebuild`, `db:ensure-generated`, `db:ensure-generated:test`).
- Testovi: `backend/scripts/ensure-generated-prisma.test.mjs`,
  `scripts/check-workflows-yaml.test.mjs` (+1), `.github/workflows/ci.yml` (novi koraci u `Backend build + test`).
- Prethodni paket istog korijena: `docs/backend/implementation/354-w220-ba-authentication-07-prisma-offline-generate.md`.
- Audit: `docs/backend/audits/02-authorization.md` §`BA-authorization-04`.
