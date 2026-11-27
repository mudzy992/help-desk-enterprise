# 367 — W2.33 `BA-rbac-06`: pregled uticaja broji ljude, a ne dodjele

**Paket:** `W2.33` · **Nalaz:** `BA-rbac-06` (P3) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC owner · **Povezano:** `BA-rbac-03` (W2.31, scope-aware preview), `BA-rbac-05` (W2.32)
**DB migracije:** ne

## 1. Nalaz i provjera premise

Baseline audita: „`userRole.count({roleId})` i sample `findMany` rade nad assignment redovima. Isti korisnik može
istu rolu imati u više OU/service scopeova jer schema nema unique ograničenje koje bi to zabranilo." Uticaj:
`affectedUserCount` može biti veći od broja osoba, a tri sample mjesta može zauzeti ista osoba.

Provjera premise u kodu prije paketa:

| Tvrdnja | Stanje prije W2.33 |
| --- | --- |
| brojač pogođenih je `userRole.count({roleId})` | **tačno** (`preview-role-permission-impact.ts`) |
| uzorci se biraju iz assignment redova bez deduplikacije po osobi | **tačno** (`samples.push` za svaku promijenjenu odluku do limita 3) |
| ista osoba može imati istu rolu u više scopeova | **tačno** — `UserRole` nema unique ograničenje na `(userId, roleId)`; `@@index([roleId])` je samo index |
| skeniranje je ograničeno na 25 assignment redova | **tačno** (`take: 25`) |

Nalaz nije zastario. Pošto W2.31 sada evaluira svaki assignment u njegovom scopeu, isti problem je postao
**vidljiviji**: osoba sa tri scoped dodjele proizvede tri promijenjene odluke, pa je ranije mogla zauzeti sva tri
uzorka i sve tri „osobe" u brojaču.

## 2. Korekcija

### 2.1 Dvije brojke, dvije istine

| Polje | Značenje | Kako se računa |
| --- | --- | --- |
| `affectedUserCount` | **osobe** na koje izmjena utiče | `userRole.groupBy({ by: ['userId'], where: { roleId } })` → broj grupa |
| `affectedAssignmentCount` | **dodjele** (grantovi) iza tih osoba | `userRole.count({ where: { roleId } })` |

Oba polja su u odgovoru; `affectedAssignmentCount` je **novo, aditivno** polje. Ranije značenje
`affectedUserCount`-a (broj redova) time nije izgubljeno — samo je dobilo tačno ime.

### 2.2 Skeniranje je ograničeno po osobama, ne po redovima

`previewAssignmentScanLimit = 250` redova se čita deterministički (`user.displayName`, `id`), a zatim
`assignmentsForDistinctUsers` zadržava **sve dodjele prvih 25 različitih osoba** (`previewUserLimit = 25`).
Zadržavaju se svi redovi tih osoba jer svaki nosi svoj scope — odbacivanje reda bi podcijenilo efekat.

### 2.3 Uzorci: najviše jedan po osobi

`sampledUserIds` pamti osobe koje već imaju uzorak; promijenjena odluka se i dalje **broji** u `scopeImpacts`, ali
se ne prikazuje drugi put za istu osobu. Time tri uzorka zaista znače tri osobe (kada ih ima toliko).

### 2.4 UI

`PermissionsPreviewPanel` prikazuje novi red samo kada se brojke razlikuju:
„**N** dodjela za **M** različitih korisnika" (`permissions.previewAssignmentCount`). Sažetak i dalje počinje brojem
osoba, pa je prva rečenica koju administrator pročita tačna.

## 3. Dokaz

### 3.1 Unit (`roles.service.spec.ts`, +2; ukupno 24 u fajlu)

| Test | Šta dokazuje |
| --- | --- |
| `counts a person with two scoped assignments once and samples them once` | jedna osoba sa OU i service dodjelom: `affectedUserCount = 1`, `affectedAssignmentCount = 2`, **jedan** uzorak, a `scopeImpacts = {organizational-unit: 1, service: 1}` (obje odluke se broje) |
| `reports assignment rows next to the distinct people they belong to` | tri reda / dvije osobe: `2` i `3`, uzorci imaju jedinstvene korisnike |
| postojeći `counts a scope-agnostic permission in the scope and globally` (W2.31) | ažuriran na novo pravilo: globalna odluka se **broji** (`scopeImpacts.global = 1`), ali se za istu osobu ne prikazuje drugi uzorak |

Mock `prisma.userRole` sada ima `groupBy` (distinct osobe) pored `count`/`findMany`, pa testovi razlikuju
„red" od „osobe" — bez toga bi zeleni test dokazivao samo staro ponašanje.

```
$ npx jest src/modules/rbac src/modules/authorization --runInBand
Test Suites: 6 skipped, 33 passed, 33 of 39 total
Tests:       10 skipped, 178 passed, 188 total
```

### 3.2 Frontend

| Provjera | Ishod |
| --- | --- |
| `npm run build` (`tsc -b && vite build`) | ✓ |
| `npx vitest run src/components/rbac src/i18n` | 9 fajlova, 50 testova ✓ |
| `npx prettier --check .` | ✓ |
| novi test `shows the grants behind a smaller headcount` | panel prikazuje `permissions.previewAssignmentCount` kada je dodjela više od osoba |

### 3.3 Real-DB integracija (`role-permission-preview-distinct-users.integration.spec.ts`)

Registrovan u `scripts/run-isolated-integration.mjs`. Fixture u izolovanoj bazi: role sa `ticket.merge`, jedna OJ,
dvije osobe — A ima **dvije** dodjele (globalnu i OU), B jednu.

| Tvrdnja | Vrijednost |
| --- | --- |
| `affectedAssignmentCount` | `3` |
| `affectedUserCount` | `2` |
| `scopeImpacts` | `{global: 2, organizational-unit: 1, service: 0, ...}` |
| uzorci | `2`, svi različite osobe, `before = allow`, `after = deny` |

Test time dokazuje i da su sve tri odluke izmjerene (dvije globalne + jedna OU), pa brojači nisu izgubljeni
deduplikacijom uzoraka.

### 3.4 Guardovi

| Provjera | Ishod |
| --- | --- |
| `npx eslint src/modules/rbac` | čist |
| `npx tsc --noEmit` (backend) | bez nove greške (postojeća `announcement-delivery.spec.ts` TS2835) |
| `node scripts/check-docs-content.mjs` | OK (32 stranice, 8 prevoda) |
| `npm run audit:traceability` | 698/698, **362 zatvoreno / 336 otvoreno** |

### 3.5 CI

PR #51 — vidi §6.

## 4. Šta paket mijenja u ponašanju

- `affectedUserCount` sada znači **osobe**; za role kod kojih niko nema više dodjela broj je nepromijenjen, a tamo
  gdje ih ima — manji je i tačan. Osoba sa tri dodjele prestaje da se broji kao tri osobe.
- Novo polje `affectedAssignmentCount` nosi staru informaciju; UI ga prikazuje samo kada se razlikuje.
- Uzorci više ne troše mjesta na istu osobu; `scopeImpacts` **nije** mijenjan — i dalje broji sve promijenjene
  odluke po scopeu (dodjela po dodjela), jer je to mjera dometa, a ne broj ljudi.
- Odgovor je aditivno proširen (`affectedAssignmentCount`); `PUT` ugovor, token, audit i rute netaknuti.
- Performanse: jedan `groupBy` upit više umjesto `count`-a istog oblika (jednako skup), skeniranje do 250 redova
  umjesto 25 — ali obrađuje se najviše 25 osoba, pa broj evaluacija po osobi ostaje isti kao prije W2.31.

## 5. Granica paketa

- **Ne** mijenja evaluator, scope pravila (`BA-rbac-03`) niti `scopeImpacts` semantiku.
- **Ne** uvodi unique ograničenje na `(userId, roleId)` u schemi — više scoped dodjela iste role ostaje legitimno
  (npr. agent u dvije OJ); ovaj paket samo ispravlja **izvještaj**.
- **Ne** dira `BA-rbac-05` (durable invalidacija), `BA-rbac-07` (DTO limiti), `BA-rbac-08` (seeder) — `W2.58`,
  `W2.59`.
- Brojevi ostaju donja granica za role sa više od 250 dodjela ili više od 25 osoba; granica je dokumentovana u §2.2.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/367-w233-ba-rbac-06-distinct-affected-users.md` | ovaj dokument |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-06` → `zatvoreno (W2.33)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `BACKEND-IMPLEMENTATION-MASTER-PLAN.md`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.33` u ledgeru |
| `docs/user-guide/uloge-i-permisije.md`, `backend/content/docs/uloge-i-permisije.md` (+ `manifest.json`) | pregled broji osobe, red o dodjelama, uzorci najviše jedan po osobi |

| Posao | Ishod |
| --- | --- |
| `Backend build + test` | _popunjava se_ |
| `Backend PostgreSQL + Redis integration` (novi distinct-users spec) | _popunjava se_ |
| `Frontend build + test` | _popunjava se_ |
| `Backend container + supply chain` | _popunjava se_ |
| `Docs guard` | _popunjava se_ |
| `E2E critical flows` | _popunjava se_ |
| `CI gate` | _popunjava se_ |
