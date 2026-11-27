# 368 — W2.34 `BA-rbac-07`: DTO ima limite — veličina je dio ugovora

**Paket:** `W2.34` · **Nalaz:** `BA-rbac-07` (P3) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC API owner · **Povezano:** `BA-rbac-01`/`02` (preview token), `BA-rbac-06` (W2.33)
**DB migracije:** ne

## 1. Nalaz i provjera premise

Baseline audita: „DTO provjerava array/string, ali nema `ArrayMaxSize`, per-key `MaxLength` niti `MaxLength` za
preview token. Razlog jedini ima limit 500." Uticaj: autorizovani ili kompromitovani SuperAdmin klijent može poslati
ekstremno veliku kolekciju/token i izazvati nepotreban CPU/memory rad prije catalog odbijanja.

Provjera premise u kodu prije paketa:

| Tvrdnja | Stanje prije W2.34 |
| --- | --- |
| `permissionKeys` provjerava samo `IsArray` + `IsString({each})` | **tačno** (`ReplaceRolePermissionsDto`, `PreviewRolePermissionsDto`) |
| per-key dužina nije ograničena | **tačno** |
| `previewToken` nema `MaxLength` | **tačno** (`IsString` + `IsNotEmpty`) |
| `reason` ima limit 500 | **tačno** |
| globalni tijelo-limit postoji kao vanjski sloj | **tačno** (`jsonBodyLimit = '512kb'` u `main.ts`) |
| validacija je globalna (pipe instaliran u `main.ts`) | **tačno** (`createGlobalValidationPipe()`, `whitelist`/`forbidNonWhitelisted`/`transform`) |

Nalaz nije zastario: `512kb` je vanjski sloj koji ograničava cijelo tijelo, ali unutar njega je prolazilo sve što
stigne do servisa — `assertKnownPermissionKeys` bi odbio tek **poslije** rada na velikom nizu, a token bi ušao u
HMAC/JSON obradu prije nego što se utvrdi da je besmislen.

## 2. Korekcija

### 2.1 Limiti vezani za katalog, ne za magične brojeve

| Konstanta | Vrijednost | Zašto |
| --- | --- | --- |
| `permissionKeysMaxCount` | `permissionCatalogEntries.length` (**72**) | rola ne može držati više prava nego što katalog ima; granica se pomjera sama kada se katalog promijeni |
| `permissionKeyMaxLength` | **120** | najduži ključ u katalogu je 23 znaka (`ticket.forward.cross-ou`); 120 ostavlja prostor za buduću konvenciju, a ne za payload |
| `previewTokenMaxLength` | **32 768** | gornja granica stvarnog formata: `base64url(payload).base64url(hmac)`, payload nosi baseline **i** predloženi skup na dužinskom plafonu (≈ 18 kB JSON → ≈ 24 kB base64url) + 43 znaka potpisa |

Sve tri su u DTO modulu i izvezene, pa ih test i budući klijent mogu koristiti bez prepisivanja brojeva.

### 2.2 Primjena na oba ulaza

| DTO | Polje | Ograničenja |
| --- | --- | --- |
| `ReplaceRolePermissionsDto` | `permissionKeys` | `IsArray` + `ArrayMaxSize(72)` + `IsString({each})` + `MaxLength(120, {each})` |
| | `previewToken` | `IsString` + `IsNotEmpty` + `MaxLength(32 768)` |
| | `reason` | nepromijenjeno (`IsString`, `IsNotEmpty`, `MaxLength(500)`) |
| `PreviewRolePermissionsDto` | `permissionKeys` | `IsArray` + `ArrayMaxSize(72)` + `IsString({each})` + `MaxLength(120, {each})` |

Pipe je već globalan (`createGlobalValidationPipe`), pa prekoračenje završava kao `400 Bad Request` **prije**
kontolera i servisa; `whitelist`/`forbidNonWhitelisted` ostaju kakvi su bili.

## 3. Dokaz

### 3.1 Unit (`replace-role-permissions.dto.spec.ts`, +8)

Testovi ne provjeravaju DTO „u praznini": kroz `createGlobalValidationPipe()` — **isti pipe koji aplikacija
instalira u `main.ts`** — puštaju tijelo kroz `transform`, pa dokazuju odgovor koji klijent vidi (400), a ne
ponašanje klase.

| Test | Šta dokazuje |
| --- | --- |
| `accepts a payload inside every limit` | normalan zahtjev prolazi nepromijenjen |
| `rejects a permission array larger than the catalog with a 400` | 73 elementa → `BadRequestException` |
| `accepts the catalog-sized array itself` | tačno 72 (cijeli katalog) prolazi — limit ne odbija legitiman maksimum |
| `rejects an over-long permission key with a 400` | 121 znak, na **oba** DTO-a |
| `rejects an over-long preview token with a 400` | 32 769 znakova |
| `rejects a permission item that is not a string before reaching the service` | `['ticket.merge', 42]` |
| `keeps the limits pinned to the real catalog` | najduži ključ ≤ 120; `permissionKeysMaxCount === katalog.length`; najgori slučaj tokena staje u 32 KiB uz base64 nadglavljenje |
| `keeps the DTO instance shape used by the controller` | `plainToInstance` ne mijenja ono što kontroler čita |

```
$ npx jest src/modules/rbac/dto --runInBand
Tests: 8 passed, 8 total
$ npx jest src/modules/rbac src/modules/authorization --runInBand
Test Suites: 6 skipped, 34 passed, 34 of 40 total
Tests:       10 skipped, 186 passed, 196 total
```

### 3.2 Guardovi

| Provjera | Ishod |
| --- | --- |
| `npx eslint src/modules/rbac` | čist |
| `npx tsc --noEmit` (backend) | bez nove greške (postojeća `announcement-delivery.spec.ts` TS2835) |
| frontend | **nije diran** (DTO ugovor nema UI promjenu; generička greška već pokriva 400) |
| `npm run audit:traceability` | 698/698, **363 zatvoreno / 335 otvoreno** |

### 3.3 CI

PR #52, run [`46061230132`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46061230132): prvi prolaz je
imao crven `E2E critical flows`, ali ne zbog koda — watchdog je zabilježio **stack outage** (`GET
https://api.desk.ba101.top/health` nije odgovorio), annotacija izričito kaže „STACK OUTAGE — infrastructure, not a
code regression", a testovi u tom prozoru nose `[stack]` oznaku. Poslije `gh run rerun --failed` posao je zelen
(9m46s), pa je `CI gate` zelen.

## 4. Šta paket mijenja u ponašanju

- Zahtjev koji prekorači bilo koji limit sada dobija **400 prije servisa**, umjesto da servis radi na njemu.
- Legitiman maksimum (cijeli katalog, 72 prava) i dalje prolazi; nijedan stvarni scenario nije odsječen.
- Token od 32 KiB je iznad najgoreg slučaja formata, pa nijedan ispravan token — ni onaj sa punim katalogom na obje
  strane — nije odbijen.
- Rute, statusi za ispravne zahtjeve, audit i baza se ne mijenjaju.

## 5. Granica paketa

- **Ne** dira token format, TTL, potpis, CAS ili claim (`BA-rbac-01`, `BA-rbac-02`).
- **Ne** uvodi limit na `roleKey` path parametar ni na druge DTO-e; ovaj nalaz je bio o permissionima i tokenu.
- **Ne** mijenja `jsonBodyLimit` (512 kB) — to je vanjski sloj i ostaje kakav je.
- **Ne** rješava `BA-rbac-08` (seeder) — `W2.59`.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/368-w234-ba-rbac-07-dto-limits.md` | ovaj dokument |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-07` → `zatvoreno (W2.34)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `BACKEND-IMPLEMENTATION-MASTER-PLAN.md`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.34` u ledgeru |

Korisnički vodiči nisu mijenjani: administrator u UI-ju ne može proizvesti zahtjev iznad limita (katalog je
ograničen, a panel šalje izbor iz kataloga); promjena je u tome što neispravan klijent više ne stiže do servisa.

| Posao | Ishod |
| --- | --- |
| `Backend build + test` (uključuje traceability guard i novi DTO spec) | ✓ 5m30s |
| `Backend PostgreSQL + Redis integration` | ✓ 14m45s |
| `Frontend build + test` | ✓ 3m47s |
| `Backend container + supply chain` | ✓ 3m17s |
| `Docs guard` | ✓ 11s |
| `E2E critical flows` | ✓ 9m46s (poslije rerun-a; prvi prolaz — stack outage) |
| `CI gate` | ✓ |

Push run je zelen sa integracijom i E2E **skipped** (CI ugovor); Perf smoke
[`46061230215`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46061230215) ✓.
