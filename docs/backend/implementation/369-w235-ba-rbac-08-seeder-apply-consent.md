# 369 — W2.35 `BA-rbac-08`: seeder traži potvrdu plana, ne vraća uklonjeno pravo sam

**Paket:** `W2.35` · **Nalaz:** `BA-rbac-08` (P3) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** backend operations / RBAC owner · **Povezano:** `BA-rbac-01`/`02`/`05` (isti princip: odluka se potvrđuje, ne pretpostavlja), `W2.34` (DTO limiti)
**DB migracije:** ne

## 1. Nalaz i provjera premise

Baseline audita: „seeder je aditivan i namjerno dodaje svaki default link koji nedostaje; CLI dry-run nije
kriptografski/optimistički vezan za apply." Uticaj: operator može poslije dry-runa ili bez njega vratiti pravo koje je
SuperAdmin namjerno uklonio — posebno ako se stanje promijeni između dvije komande.

Provjera premise u kodu prije W2.35:

| Tvrdnja | Stanje prije W2.35 |
| --- | --- |
| seeder je aditivan (samo `create`/`upsert`, nikad `delete`) | **tačno** (`seedDefaultRolePermissions`, `ensurePermissionRows`) |
| ponovni run vraća link koji je administrator uklonio | **tačno** — nema nikakve provjere da je uklanjanje bilo namjerno |
| `--dry-run` ne obavezuje apply | **tačno**: dry-run i apply su dvije nezavisne komande; apply ne zna šta je operator vidio |
| dry-run ispisuje plan | tačno, ali **bez ijednog identifikatora** tog plana (samo brojevi po roli) |
| audit nosi operator intent i baseline | **ne** — metadata je imala `roleKey`, `addedPermissionKeys`, `via` |
| install put koristi isti modul | **tačno** (`seedDefaultRolePermissions` pri kreiranju sistema; tamo su defaulti autoritativni) |
| posljedica se može desiti „godinama kasnije" | **tačno** — komanda je dokumentovana kao maintenance za starije instalacije |

Premisa nije zastarjela: `W2.29`–`W2.34` su uredili preview/replace tok, ali seeder je ostao jedini put kojim sistem
**piše** u permission matricu bez ljudske odluke u tom trenutku.

## 2. Korekcija

### 2.1 Plan je jedinica saglasnosti

`computeSeedPlanFingerprint(plan)` (u `src/modules/rbac/seed-default-role-permissions.ts`) računa `sha256` kanonskog
oblika plana: po roli `roleKey`, `roleCreated` i **sortiranu** listu `addedPermissionKeys`. Fingerprint opisuje tačno
ono što bi apply **uradio**, pa:

| Situacija | Fingerprint |
| --- | --- |
| isti plan, drugi redoslijed iteracije | **isti** hash |
| između dry-runa i applya neko doda/ukloni link ili rolu | **drugi** hash → potvrda pada |
| dry-run nad praznom bazom vs. dry-run poslije punog applya | različit (prvi dodaje, drugi ne dodaje ništa) |

Fingerprint se ne oslanja na `existing` brojače ni na vremenske oznake, pa ne „šeta" bez promjene odluke.

### 2.2 CLI: tri načina rada, jedan bez pisanja

Novi modul `src/modules/rbac/seeder-apply-intent.ts` razdvaja **čitanje argumenata** od **ocjene saglasnosti**, pa se
pravilo testira bez procesa i bez baze.

| Komanda | Šta radi |
| --- | --- |
| `… --dry-run` | ispiše plan (po roli, sa ključevima koje bi dodao) + `plan fingerprint: <hash>`; **ništa ne piše** |
| `… --confirm=<hash>` | primijeni **tačno** pregledani plan; ako se plan u međuvremenu promijenio → odbija se |
| `… --restore-defaults` | svjesno vraća defaulte, uključujući linkove koje je administrator uklonio |
| `…` (bez flaga) | **odbija** sa `role_permission_seed_refused`, ispiše plan i fingerprint, izlazni kod **2**, nula upisa |

Ostale kombinacije su greške, ne „skoro pa saglasnost": `--dry-run` sa `--confirm`/`--restore-defaults`,
`--restore-defaults` sa `--confirm`, dva `--confirm`, `--confirm=` bez vrijednosti, nepoznat flag.

### 2.3 Race između pregleda i upisa

CLI prvo **uvijek** čita plan (to je i dry-run izlaz i osnova za potvrdu), pa tek onda piše. Poslije upisa ponovo
računa fingerprint iz stvarnog rezultata; ako se razlikuje od pregledanog, ispiše
`role_permission_seed_plan_drift reviewed=<a> applied=<b>` i u audit upiše **pregledani** hash. Upis se ne poništava
(nema rollback preko dva poziva), ali trag ostaje tačan.

### 2.4 Audit nosi intent i baseline

`rolePermissionReplace` metadata allowlist (registry verzija 1) proširen je za `intent` i `planFingerprint`. Seeder
sada piše:

```json
{
  "roleKey": "ADMIN",
  "addedPermissionKeys": ["ticket.merge"],
  "via": "seed-default-role-permissions",
  "intent": "fingerprint",
  "planFingerprint": "sha256…"
}
```

`intent` je `fingerprint` ili `restore-defaults` — iz auditа se vidi **kako** je operator pristao, ne samo da su
linkovi dodati. Nepoznat ključ i dalje ruši upis (`AUDIT_METADATA_FIELD_NOT_ALLOWED`), pa allowlist nije „labav".

## 3. Dokaz

### 3.1 Unit — pravilo saglasnosti (`seeder-apply-intent.spec.ts`, +8)

| Test | Šta dokazuje |
| --- | --- |
| `reads a dry run` / `reads an explicit restore` / `reads a confirmed plan` | tri legalna načina se parsiraju tačno |
| `refuses a plain run: additive seeding is a policy decision` | **acceptance**: bez flaga nema upisa |
| `refuses an empty or unknown flag set` | `--confirm=`, `--force`, `--dry-run --restore-defaults`, `--restore-defaults --confirm=…` |
| `applies exactly the plan the operator reviewed` | tačan hash → `{allowed:true, consent:'fingerprint'}` |
| `refuses a confirmation whose plan changed since the dry run` | drugi hash → `fingerprint-mismatch` |
| `never treats a dry run as a write` | dry-run nikad nije „allowed" |

### 3.2 Unit — identitet plana (`seed-default-role-permissions.spec.ts`, +3)

| Test | Šta dokazuje |
| --- | --- |
| `is stable for the same plan and independent of ordering` | isti upisi → isti hash, bez obzira na red role/ključeva |
| `changes when the plan would write something different` | dodat ključ ili `roleCreated` → tri različita hashа |
| `is a sha256 hex digest, so it survives copy/paste into --confirm` | 64 heksadecimalna znaka |

### 3.3 Real-DB (`seed-default-role-permissions.integration.spec.ts`, +5, izolovana baza)

Registrovan u `scripts/run-isolated-integration.mjs` (shard lista), pa ga pokreće `npm run test:integration` u CI
jobu `Backend PostgreSQL + Redis integration`.

| Scenario | Dokaz |
| --- | --- |
| dry-run dvaput na praznoj bazi | isti fingerprint, `role.count() === 0` — dry-run ne piše |
| admin ukloni `ADMIN → ticket.merge`, pa „običan" run | odbijeno (`confirmation-required`), link **ostaje uklonjen** |
| `--confirm=<pregledani hash>` | apply vraća link, fingerprint primijenjenog plana **jednak** pregledanom, audit red nosi `intent` + `planFingerprint` |
| dry-run pa još jedno uklanjanje, pa stara potvrda | `fingerprint-mismatch`, bez upisa |
| `--restore-defaults` | vraća kompletan default skup `ADMIN` role |

### 3.4 Guardovi i lokalni rezultat

```
$ npx jest src/modules/rbac src/modules/authorization src/modules/audit-log
Test Suites: 9 skipped, 54 passed, 54 of 63 total
Tests:       19 skipped, 270 passed, 289 total

$ node --test scripts/run-isolated-integration.test.mjs
# pass 24 / # fail 0

$ npx eslint src/modules/rbac src/cli/seed-default-role-permissions.ts src/modules/audit-log/audit-action-schema-registry.ts
čist

$ npx tsc --noEmit   # bez nove greške (postojeća announcement-delivery.spec.ts TS2835)
```

| Provjera | Ishod |
| --- | --- |
| `npm run audit:traceability -- --write` | **698 nalaza, 364 zatvoreno / 334 otvoreno** |
| `npm run audit:traceability` (guard) | ✓ `698/698`, `P1=175 P2=371 P3=152`, registar usklađen |
| `npm run wiring:check` | ✓ 99 kontrolera, 634 rute |
| `npm run lint` | ✓ 0 grešaka (6 postojećih upozorenja u `problems`/`sla` specovima) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| frontend | **nije diran** — komanda je CLI, nema UI promjene |

### 3.5 CI

Push run [`46068933840`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46068933840) (head `2cf42fb6`):

| Posao | Ishod |
| --- | --- |
| `Backend build + test` | ✓ 6m41s (uključuje 11 novih testova i traceability guard) |
| `Frontend build + test` | ✓ 4m38s |
| `Backend container + supply chain` | ✓ 3m50s |
| `Docs guard` | ✓ 9s |
| `CI gate` | ✓ 5s |
| `Backend PostgreSQL + Redis integration` | **skipped** — push ugovor; real-DB shard se izvršava u `pull_request` runu (PR #53) |
| `E2E critical flows` | **skipped** — push ugovor; smoke `01,02,03,15,22,54` ide u `pull_request` runu (PR #53) |

Push run ne dokazuje real-DB shard niti browser tok, pa se ovaj paket ne spaja dok `pull_request` run na istom headu ne
bude zelen — uključujući `Backend PostgreSQL + Redis integration` (novi
`seed-default-role-permissions.integration.spec.ts` shard) i `E2E critical flows`.

## 4. Šta paket mijenja u ponašanju

- Običan maintenance run **više ne mijenja** permission matricu; ispiše plan i izađe sa kodom 2.
- Da bi se nešto primijenilo, operator mora ili potvrditi **taj** plan (`--confirm`) ili izričito reći da vraća
  defaulte (`--restore-defaults`).
- Ako se matrica promijeni između pregleda i applya, stara potvrda više ne važi — nema tihog vraćanja „po starom".
- Audit za dodane linkove sada nosi `intent` i `planFingerprint`, pa se iz zapisa rekonstruiše šta je operator vidio.
- Instalacija je nepromijenjena: `seedDefaultRolePermissions` bez opcija (kako je zove install tok) i dalje popunjava
  defaulte, jer tamo nema prethodne ljudske odluke koju bi trebalo čuvati.

## 5. Granica paketa

- **Ne** mijenja seeder algoritam (aditivan, idempotentan, bez `delete`).
- **Ne** dira role-permission replace/preview tok (`BA-rbac-01`/`02`/`03`), niti invalidaciju nosilaca (`BA-rbac-05`).
- **Ne** uvodi `revision` polje na `Role`; saglasnost se veže za **plan**, ne za red u bazi.
- **Ne** mijenja install/wizard poziv seederа.
- **Ne** dodaje nove audit akcije — proširen je postojeći `rolePermissionReplace` allowlist.
- **Ne** rješava preostale nalaze iz `03-rbac.md` (npr. `BA-rbac-04`, `SUPER_ADMIN` matrica) — oni ostaju na svom
  mjestu u renumber mapi.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/369-w235-ba-rbac-08-seeder-apply-consent.md` | ovaj dokument |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-08` → `zatvoreno (W2.35)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `BACKEND-IMPLEMENTATION-MASTER-PLAN.md`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.35` u ledgeru |

Korisnički vodiči nisu mijenjani: komanda je operatorska (CLI), a ne administratorska UI radnja; jedina promjena koju
administrator osjeti je da mu se uklonjeno pravo **ne vraća** samo.

Napomena o renumber mapi: `368` je u granici paketa naveo `BA-rbac-08` kao `W2.59`; po važećoj mapi paket je
`W2.35`, pa ovaj dokument nosi stvarni broj.
