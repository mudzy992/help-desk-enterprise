# 363 — W2.29 `BA-rbac-01`: preview nosi baseline, a `PUT` ga poredi u transakciji

**Paket:** `W2.29` · **Nalaz:** `BA-rbac-01` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC/authorization owner · **Povezano:** `BA-rbac-02` (W2.30), `BA-rbac-05` (W2.32), paket 5.1 (M4 B2)

## 1. Nalaz i provjera premise

Baseline audita: „token potpisuje samo role key, predloženi skup, aktera i vrijeme. `previousPermissionKeys` se
čita tek u replace toku i ne poredi s preview baselineom. Role nema revision polje." Scenarij: SuperAdmin A
pregleda skup X; SuperAdmin B spremi Y; A unutar 15 minuta spremi X; Y se tiho prepisuje.

Provjera premise prije paketa (kod, ne audit):

| Tvrdnja iz nalaza | Stanje prije W2.29 |
| --- | --- |
| token nosi `roleKey`, `permissionKeys`, `actorUserId`, `issuedAt/expiresAt` | **tačno** (`role-permission-preview-token.ts`) |
| nema revision polja na `Role` | **tačno** (`identity.prisma`, `model Role`: `id/key/name/isSystem/createdAt/updatedAt`) |
| `previousPermissionKeys` se čita izvan transakcije | **tačno** (`replace-role-permissions.ts`, prije `prisma.$transaction`) |
| postoji bilo kakva zaštita od međuvremenske tuđe izmjene | **ne** — ni baseline u tokenu ni CAS u transakciji |

Zato nalaz nije bio zastario: sve tri komponente su bile odsutne. Acceptance iz audita („dva paralelna previewa;
nakon prvog commita drugi PUT obavezno pada bez promjene/audita") nije se mogao ispuniti postojećim tokenom —
on dokazuje **šta** je pregledano, ali ne **od kada**.

## 2. Korekcija

### 2.1 Token nosi baseline

`RolePermissionPreviewTokenPayload` dobija `baselinePermissionKeys`, a `signRolePermissionPreviewToken` ga traži
kao **obavezan** ulaz (nema defaulta, pa ga nijedan budući pozivalac ne može preskočiti). Baseline je normalizovan
isto kao predloženi skup (dedupe + sort), pa potpis ne zavisi od reda.

`previewRolePermissionImpact` ga puni stvarnim stanjem koje je pregled pročitao (`currentPermissionKeys`), pa je
baseline uvijek ono što je administrator vidio na ekranu, a ne ono što klijent tvrdi.

`verifyRolePermissionPreviewToken` dekodira i baseline. Token izdan prije ovog paketa baseline nema, pa ga
`decode` odbija kao `PREVIEW_REQUIRED` — rolling deploy ne propušta nijedan stari token (15 minuta TTL-a, jedan
ponovni pregled).

### 2.2 Compare-and-swap unutar transakcije

`replaceRolePermissions` više ne čita stanje prije transakcije. Redoslijed je sada:

1. verifikacija tokena (potpis, rok, uloga, pregledač, predloženi skup) — nepromijenjeno;
2. `BEGIN` → `pg_advisory_xact_lock` (`lockActiveSuperAdminInvariant`, isti ključ koji serijalizuje sve izmjene
   permission matrice);
3. `SUPER_ADMIN` immutable provjera — nepromijenjeno;
4. **novo:** `getRolePermissions(transaction, role.key)` i poređenje sa `preview.baselinePermissionKeys`;
   razlika ⇒ `RbacError('PREVIEW_STALE')` (409), transakcija se rollbackuje **prije** ijednog `deleteMany`;
5. `ensurePermissionRows` → `deleteMany` → `create` → audit red, sa `previousPermissionKeys` uzetim iz koraka 4.

Time audit `previousPermissionKeys` opisuje stanje koje je upis **stvarno zamijenio**, a ne stanje pročitano prije
locka. Nijedna šema, migracija, DTO ni HTTP ruta se ne mijenjaju: baseline živi u potpisanom tokenu, a CAS u
postojećoj transakciji. `PREVIEW_STALE` je već mapiran na 409 (`map-rbac-error.ts`) i frontend ga već prevodi u
„pregled je zastario, pokrenite ga ponovo" (`frontend/src/lib/rbac/map-rbac-error.ts`), pa UI nema šta novo da nauči.

### 2.3 Zašto baseline, a ne `Role.revision` kolona

Acceptance traži da drugi `PUT` padne; revision kolona bi tražila migraciju, backfill i novo polje u DTO-u, a
dobila bi istu semantiku. Baseline je tačan jer je skup permisija uloge mali, potpisan i već prisutan u pregledu.
Revision bi dodatno pokrio izmjene koje skup **ne** mijenjaju (npr. preimenovanje uloge) — to nije ovaj nalaz i
nije ga potrebno plaćati šemom. Ako se kasnije pojavi potreba za „stale i kad se skup ne mijenja", revision je
nadogradnja ovog mehanizma, ne njegova zamjena.

## 3. Dokaz

### 3.1 Unit (mocked klijent)

`backend/src/modules/rbac/role-permission-preview-token.spec.ts` — 10 testova, uključujući tri nova:

| Test | Šta dokazuje |
| --- | --- |
| round-trip sa baselineom | baseline ulazi u token i vraća se normalizovan |
| baseline je dio potpisa | izmjena baselinea u tijelu ⇒ `PREVIEW_REQUIRED` |
| token bez baselinea (stari build) | `PREVIEW_REQUIRED`, ne tiha propusnica |
| `permissionKeySetsMatch` | prazan baseline je stanje, a ne „nema baselinea" |

`roles.service.spec.ts` — dva nova scenarija i pojačana postojeća asercija:

| Test | Šta dokazuje |
| --- | --- |
| A pregleda → B commit → A `PUT` | `PREVIEW_STALE`, **nula** `deleteMany`/`create`/audit redova, invalidacija nosilaca se ne poziva |
| B pregleda poslije A-inog pregleda, pa `PUT` | prolazi — nalaz kažnjava zastario pregled, ne drugog administratora |
| postojeći „replace swaps permissions" | `previousPermissionKeys` u auditu je stanje iz transakcije |

```
$ npx jest src/modules/rbac src/modules/authorization --runInBand
Test Suites: 3 skipped, 32 passed, 32 of 35 total
Tests:       4 skipped, 159 passed, 163 total
```

### 3.2 Real-DB integracija (`role-permission-preview-cas.integration.spec.ts`)

Registrovan u `scripts/run-isolated-integration.mjs`, pa ga izvršava `Backend PostgreSQL + Redis integration`
posao u izolovanoj bazi. Dvije provjere na stvarnom PostgreSQL-u:

| Test | Šta dokazuje |
| --- | --- |
| sekvencijalno: A pregleda → B commit → A `PUT` | `PREVIEW_STALE`; skup ostaje B-in; **tačno jedan** audit red, sa `previousPermissionKeys` = baseline |
| paralelno: dva previewa istog baselinea, dva različita cilja | `Promise.allSettled` ⇒ tačno jedan fulfilled i jedno `PREVIEW_STALE`; skup = pobjednikov; log +1 red |

Paralelni test namjerno koristi **dva različita** cilja koja oba mijenjaju skup: identični ili no-op skup ne bi
bio valjan svjedok (no-op upis ostavlja baseline netaknut, pa bi oba prolaza prošla).

### 3.3 Guardovi i lint

| Provjera | Ishod |
| --- | --- |
| `npx jest src/modules/rbac` | 5 suiteova, 32 testa ✓ |
| `npx jest src/modules/rbac src/modules/authorization --runInBand` | 32 passed / 3 skipped, 159 testova ✓ |
| `npx eslint` na 6 diranih fajlova | čist |
| `npx tsc --noEmit` (backend) | bez nove greške (postojeća `announcement-delivery.spec.ts` TS2835 nije iz ovog paketa) |
| `npm run audit:traceability` | 698/698, registar usklađen |

### 3.4 CI

PR #47, run [`45999085493`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45999085493) — svi
poslovi zeleni iz **prvog** pokušaja, bez reruna:

## 4. Šta paket mijenja u ponašanju

- `POST /roles/:key/permissions/preview` vraća **isti** oblik odgovora; token je neproziran i sada nosi i baseline.
- `PUT /roles/:key/permissions` odbija pregled stariji od tuđe izmjene sa **409 `PREVIEW_STALE`** — prije
  ijednog upisa i prije ijednog audit reda. Prije ovog paketa isti zahtjev bi prošao i tiho prepisao tuđu izmjenu.
- Token izdan prije deploya (bez baselinea) traži ponovni pregled: `409 PREVIEW_REQUIRED`. Prozor je 15 minuta i
  pogađa samo pregled koji je u toku.
- Nijedna šema, migracija, DTO, ruta ni frontend fajl se ne mijenjaju.

## 5. Granica paketa

- **Ne** zatvara `BA-rbac-02` (token se može ponoviti unutar TTL-a). CAS sada odbija replay **skupa koji se
  mijenja**, ali ponovljeni `PUT` sa istim, no-op skupom i dalje prolazi i piše novi audit red. Jednokratnost
  tokena (nonce/preview zapis) ostaje W2.30.
- **Ne** dira `BA-rbac-05` (durable invalidacija nosilaca) ni `BA-rbac-03` (scope-aware impact) — invalidator se
  i dalje poziva tek poslije commita, nepromijenjenim redoslijedom.
- **Ne** uvodi `Role.revision` kolonu ni migraciju (§2.3).
- **Ne** mijenja `SUPER_ADMIN` immutable pravilo (W2.27/`BA-rbac-04`): ono ostaje prva provjera u transakciji.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/363-w229-ba-rbac-01-preview-baseline-cas.md` | ovaj dokument |
| `docs/backend/audits/03-rbac.md` | registar red `BA-rbac-01` → `zatvoreno (W2.29)`, detaljni nalaz, §13 traceability |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `docs/backend/backend-findings-plan.json`, `docs/backend/audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.29` u ledgeru |

| Posao | Ishod |
| --- | --- |
| `Backend build + test` | ✓ 6m3s |
| `Backend PostgreSQL + Redis integration` (izvršava novi `role-permission-preview-cas` spec) | ✓ 17m51s |
| `Frontend build + test` | ✓ 3m51s |
| `Backend container + supply chain` | ✓ 3m44s |
| `Docs guard` | ✓ 8s |
| `E2E critical flows` | ✓ 10m0s |
| `CI gate` | ✓ |

Push run [`45999079142`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45999079142) ✓ sa
integracijom i E2E **skipped** (CI ugovor za push); Perf smoke
[`45999085457`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45999085457) ✓ i
[`45999079164`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45999079164) ✓.
