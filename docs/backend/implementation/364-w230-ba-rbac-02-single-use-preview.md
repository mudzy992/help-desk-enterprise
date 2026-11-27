# 364 — W2.30 `BA-rbac-02`: pregled uticaja je jednokratan, jer ga upis troši u svojoj transakciji

**Paket:** `W2.30` · **Nalaz:** `BA-rbac-02` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC/authorization owner · **Povezano:** `BA-rbac-01` (W2.29), `BA-authentication-03` (W2.16 — isti obrazac)
**DB migracije:** **da** — `20271202160000_w230_rbac_preview_claim` (aditivna: `CREATE TABLE` + `CREATE INDEX`, bez odbora za destruktivni SQL)

## 1. Nalaz i provjera premise

Baseline audita: „token nema nonce/`jti`, server ne čuva consumed stanje, pa se isti token može koristiti više
puta do 15 minuta." Uticaj: replay starog `PUT`-a može vratiti raniji permission skup nakon naknadne izmjene.

Poslije W2.29 (`BA-rbac-01`) stanje je bilo:

| Tvrdnja | Poslije W2.29 |
| --- | --- |
| token nema `jti` | **tačno** |
| server ne čuva consumed stanje | **tačno** |
| replay koji mijenja skup | **blokiran** — baseline CAS (`PREVIEW_STALE`) |
| replay koji **ne** mijenja skup (no-op potvrda) | **prolazi** — baseline je i dalje baseline, pa CAS nema šta da primijeti, a upis ponovo piše audit red |

Dakle nalaz nije bio zatvoren W2.29: ostao je tačno onaj slučaj koji audit i imenuje („uključujući no-op odluku
prema eksplicitnoj politici"). Acceptance („drugi PUT istog tokena vraća stale/consumed i ne piše novi audit")
traži **durable** consumed stanje, ne poređenje skupova.

## 2. Korekcija

### 2.1 Preview se sada pamti, ne samo potpisuje

Nova tabela `RolePermissionPreviewClaim` (`jti` PK, `roleKey`, `actorUserId?`, `issuedAt`, `expiresAt`,
`consumedAt?`, indeks nad `expiresAt`) je jedan red po izdatom pregledu. `previewRolePermissionImpact` prije
potpisivanja:

1. obriše redove kojima je `expiresAt` prošao (tabela ostaje ograničena TTL-om, bez schedulera);
2. upiše red sa `jti = randomUUID()`;
3. potpiše token koji sada nosi i `jti` (unutar HMAC-a, kao i baseline iz W2.29).

`jti` je **obavezan** ulaz u `signRolePermissionPreviewToken`, a `decode` odbija token bez njega — pa nijedan
budući pozivalac ne može izdati pregled koji se ne može potrošiti.

### 2.2 Upis troši pregled atomski, u istoj transakciji

`replaceRolePermissions`, nakon advisory locka i baseline CAS-a:

```ts
const claim = await transaction.rolePermissionPreviewClaim.updateMany({
  where: { jti: preview.jti, roleKey: role.key, actorUserId: preview.actorUserId, consumedAt: null },
  data: { consumedAt: new Date() },
});
```

`count === 1` je jedina propusnica. Zato:

- **dva paralelna `PUT`-a istog tokena** ⇒ jedan prolazi, drugi dobija `409 PREVIEW_CONSUMED` (claim je `UPDATE`
  nad `consumedAt IS NULL`, a transakcije su ionako serijalizovane advisory lockom);
- **rollback oslobađa pregled**: ako upis padne (zastario baseline, `SUPER_ADMIN` immutable, fault), claim se
  vraća sa transakcijom — administrator ne gubi pregled zbog greške koja nije njegova;
- **no-op potvrda** (skup se ne mijenja) prolazi prvi put i **nikad** drugi — to je slučaj koji W2.29 nije mogao
  pokriti;
- token izdan prije deploya (nema reda) ⇒ `409 PREVIEW_REQUIRED`, a ne tiha propusnica.

### 2.3 Novi kod `PREVIEW_CONSUMED`

`RbacErrorCode` dobija `PREVIEW_CONSUMED`, `mapRbacError` ga prevodi u **409** sa porukom „taj pregled je već
iskorišten — pokrenite ga ponovo", a frontend (`map-rbac-error.ts` + `permissions.errorPreviewConsumed` u `bs` i
`en`) ga prikazuje isto kao zastario pregled. Razlika je namjerna: `PREVIEW_STALE` znači „nešto se promijenilo",
`PREVIEW_CONSUMED` znači „ovaj pregled je već potvrđen".

### 2.4 Zašto ne Redis

Redis u ovom sistemu nije autoritet (vidi W2.15/W2.25): ista klasa problema (jednokratnost MFA tokena) već je
riješena durable redom u PostgreSQL-u, jer Redis flush ili restart tiho vraća replay. Za sigurnosnu kapiju koja
pušta izmjenu permisija, „tiho otvoreno poslije restarta" nije prihvatljivo.

## 3. Dokaz

### 3.1 Unit

| Fajl | Test | Šta dokazuje |
| --- | --- | --- |
| `role-permission-preview-token.spec.ts` (11) | `jti` u round-tripu | token imenuje red koji će se trošiti |
| | izmijenjen `jti` u tijelu ⇒ `PREVIEW_REQUIRED` | `jti` je pod potpisom, ne može se preusmjeriti na tuđi pregled |
| | token bez `jti` ⇒ `PREVIEW_REQUIRED` | stariji/nepotpun token ne prolazi |
| `roles.service.spec.ts` (+1) | no-op pregled, dva `PUT`-a | prvi prolazi, drugi `PREVIEW_CONSUMED`, **jedan** `deleteMany` i **jedan** audit red |

```
$ npx jest src/modules/rbac --runInBand
Test Suites: 1 skipped, 5 passed, 5 of 6 total
Tests:       2 skipped, 35 passed, 37 total
```

### 3.2 Real-DB integracija

`role-permission-preview-cas.integration.spec.ts` (registrovan u `run-isolated-integration.mjs`, izvršava ga
`Backend PostgreSQL + Redis integration`) sada ima četiri scenarija; dva nova su za ovaj nalaz:

| Test | Šta dokazuje |
| --- | --- |
| isti token dvaput, no-op skup | prvi `PUT` prolazi, drugi `PREVIEW_CONSUMED`, skup nepromijenjen, **+1** audit red |
| dva paralelna `PUT`-a istog tokena | tačno jedan fulfilled, jedan `PREVIEW_CONSUMED`, **+1** audit red |

`afterAll` briše i claim redove (`rolePermissionPreviewClaim.deleteMany({ where: { roleKey } })`), pa spec ne
ostavlja stanje za sljedeće.

### 3.3 Guardovi, šema i lint

| Provjera | Ishod |
| --- | --- |
| `npm run db:migration-policy:check` | 130 migracija, destruktivni SQL bez novih odobrenja ✓ |
| sentinel `expectedSchemaMigration` | `20271202160000_w230_rbac_preview_claim` (+ pin u `database-runtime-contract.spec.ts`) |
| `npx jest src/common/database` | 28 passed / 3 skipped ✓ |
| `npx jest src/modules/rbac src/modules/authorization` | 35 + 159 testova ✓ |
| `npx tsc --noEmit` (backend, frontend) | bez nove greške |
| `npx vitest run src/i18n src/lib/rbac` | 4 testa ✓ (ključevi `bs`/`en` usklađeni) |
| `node scripts/check-docs-content.mjs` | OK (32 stranice, 8 prevoda) |
| `npm run audit:traceability` | 698/698, **359 zatvoreno / 339 otvoreno** |

### 3.4 CI

PR #48, run: vidi §6 (popunjava se iz runa).

## 4. Šta paket mijenja u ponašanju

- `POST /roles/:key/permissions/preview` sada **piše** jedan red (prije je bio čisto računanje). To je cijena
  durable jednokratnosti; red je mali, TTL-om ograničen i briše se pri svakom sljedećem pregledu.
- Drugi `PUT` sa istom potvrdom ⇒ **409 `PREVIEW_CONSUMED`** (bilo da je prvi upis promijenio skup ili ne).
- Neuspješan `PUT` (zastario pregled, immutable uloga, fault) **ne troši** pregled.
- Nova tabela i migracija; `ready` sentinel je podignut na novu migraciju.

## 5. Granica paketa

- **Ne** mijenja politiku no-op upisa: potvrda bez promjene skupa i dalje prolazi (i piše audit red) — samo
  jednom. Odluka „no-op se odbija" nije donesena ovim paketom.
- **Ne** dira `BA-rbac-01` mehanizam (baseline CAS ostaje prvi, pa claim drugi) niti `BA-rbac-03`/`05`.
- **Ne** uvodi scheduler za čišćenje: trim je oportunistički, na svakom pregledu, nad indeksiranim `expiresAt`.
- **Ne** dira MFA claim (`MfaTokenClaim`) ni njegove semantike — obrazac je isti, tabele su odvojene jer je
  životni ciklus različit.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/364-w230-ba-rbac-02-single-use-preview.md` | ovaj dokument |
| `backend/content/docs/uloge-i-permisije.md` (+ `manifest.json`), `docs/user-guide/uloge-i-permisije.md` | pregled je „samo jednom", novi red validacija i FAQ za `PREVIEW_CONSUMED` |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-02` → `zatvoreno (W2.30)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.30` u ledgeru |

| Posao | Ishod |
| --- | --- |
| `Backend build + test` | _popunjava se_ |
| `Backend PostgreSQL + Redis integration` (migracija + 4 integracijska scenarija) | _popunjava se_ |
| `Frontend build + test` | _popunjava se_ |
| `Backend container + supply chain` | _popunjava se_ |
| `Docs guard` | _popunjava se_ |
| `E2E critical flows` | _popunjava se_ |
| `CI gate` | _popunjava se_ |
