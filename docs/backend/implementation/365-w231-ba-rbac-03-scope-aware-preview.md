# 365 — W2.31 `BA-rbac-03`: pregled uticaja mjeri efekat u scopeu assignmenta, ne u praznini

**Paket:** `W2.31` · **Nalaz:** `BA-rbac-03` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC + authorization owner · **Povezano:** `BA-rbac-01` (W2.29), `BA-rbac-02` (W2.30), `BA-rbac-06` (W2.57)
**DB migracije:** ne

## 1. Nalaz i provjera premise

Baseline audita: „preview kreira zahtjev sa `requireOrganizationalUnitScope:false`, `requireServiceScope:false` i
oba scope ID-a `null`. Authorization evaluator namjerno odbija scoped assignment na globalnoj provjeri." Uticaj:
korisnik sa AGENT/ADMIN rolom ograničenom na OJ ili servis stvarno dobije/izgubi pravo unutar scopea, ali
before/after odluka ostaje deny/deny i uzorak se ne prikazuje.

Provjera premise u kodu prije paketa:

| Tvrdnja | Stanje prije W2.31 |
| --- | --- |
| preview evaluira svaku pogođenu osobu sa `organizationalUnitId: null`, `serviceId: null` | **tačno** (`preview-role-permission-impact.ts`) |
| `requireOrganizationalUnitScope`/`requireServiceScope` su uvijek `false` | **tačno** |
| evaluator odbija scoped assignment na globalnoj provjeri | **tačno** (`evaluate-authorization-access.ts`: `else if (assignment.organizationalUnitId !== null && !scopeAgnostic) return false`) |
| preview uopšte čita scope assignmenta | **ne** — `userRole.findMany` je birao samo `user` |

Dakle nalaz nije bio zastario: preview nije ni znao gdje assignment živi, a evaluator je na globalnoj provjeri
scoped grant odbijao po dizajnu. Posljedica: **svaki** OU/service efekat je bio nevidljiv, a ne samo „pogrešan".

## 2. Korekcija

### 2.1 Pregled čita assignment, ne samo korisnika

`userRole.findMany` sada bira `id`, `organizationalUnitId`, `serviceId`, `organizationalUnit{id,name,ouPath}`,
`service{id,name}` i `user`, sortira po `user.displayName`, `id` (deterministički) i skenira do
`previewAssignmentLimit = 25` assignmenta — dovoljno za uzorke i brojače, ograničeno za role sa hiljadama dodjela.

### 2.2 Evaluacija u scopeu assignmenta

Za svaki `(assignment, promijenjeni ključ)` preview sada gradi zahtjev iz **scopea assignmenta**:

| Assignment | Zahtjev |
| --- | --- |
| bez OU i bez servisa | `organizationalUnitId: null`, `serviceId: null`, oba `require*Scope: false` |
| OU | `organizationalUnitId: <assignment OU>`, `requireOrganizationalUnitScope: true` |
| servis | `serviceId: <assignment service>`, `requireServiceScope: true` |
| OU + servis | oba, sa oba `require*Scope: true` |

Coverage i dalje računa **evaluator** (`doesOrganizationalUnitScopeCover`, `doesServiceScopeCover`) — preview ne
duplicira pravilo, samo pita tačno ono pitanje koje odluka u produkciji pita.

**Scope-agnostic ključevi** (`oncall.read`, `oncall.manage`) su izuzetak: evaluator ih dodjeljuje bez obzira na
scope, pa se za scoped assignment takav ključ evaluira **i** u njegovom scopeu **i** globalno. Bez toga bi
uklanjanje `oncall.read` sa OU-scoped role izgledalo kao gubitak „samo u toj OJ", a stvarno važi svuda.

### 2.3 Izvještaj imenuje scope

`RolePermissionPreviewSample` dobija `assignmentId` i `scope`
(`kind: 'global' | 'organizational-unit' | 'service' | 'organizational-unit-and-service'`, `organizationalUnitId`,
`organizationalUnitName`, `organizationalUnitPath`, `serviceId`, `serviceName`). Novi `scopeImpacts` broji **sve**
promijenjene odluke po scopeu, ne samo tri prikazane — to je mjera „koliko je velik domet promjene".

API oblik: `GET`-ekvivalentan odgovor `POST /roles/:roleKey/permissions/preview` je proširen **aditivno** (nova
polja); `PUT` ugovor, token i audit nisu dirani.

### 2.4 UI

`PermissionsPreviewPanel` prikazuje scope svakog uzorka („OJ: Finansije", „servis: VPN", „globalno") i, kada
postoji scoped efekat, red „Efekat po scopeu: N globalno · M unutar OJ · K unutar servisa". Ključ liste uzoraka
je `assignmentId + permissionKey + scope.kind`, jer ista osoba sada može imati više redova (po assignmentu).

## 3. Dokaz

### 3.1 Unit (`roles.service.spec.ts`, +5)

| Test | Šta dokazuje |
| --- | --- |
| OU-scoped, uklanjanje `ticket.merge` | `ALLOW → DENY`, `scope.kind = organizational-unit`, ime i `ouPath` iz OJ reda, `scopeImpacts.organizational-unit = 1` |
| service-scoped | `ALLOW → DENY` uz `serviceId` i `serviceName`, `scopeImpacts.service = 1`, `global = 0` |
| OU + servis, dodavanje | `DENY → ALLOW` u `organizational-unit-and-service` |
| scope-agnostic (`oncall.read`) na OU assignmentu | dva uzorka (OU + global), `global = 1` i `organizational-unit = 1` |
| unscoped assignment | ostaje `global`, `scopeImpacts.global = 1` |

Scaffolding je proširen tako da mock sada nosi assignment redove, OU putanje i poznate servise — bez toga bi test
dokazivao samo granu koja ne dira scope.

```
$ npx jest src/modules/rbac --runInBand
Tests: 2 skipped, 40 passed, 42 total
$ npx jest src/modules/rbac src/modules/authorization --runInBand
Test Suites: 4 skipped, 32 passed, 32 of 36 total
Tests:       8 skipped, 167 passed, 175 total
```

### 3.2 Real-DB integracija (`role-permission-preview-scope.integration.spec.ts`)

Registrovan u `scripts/run-isolated-integration.mjs`. Fixture u izolovanoj bazi: OJ (`ouPath`), servis (+
kategorija), role sa `ticket.merge`, tri korisnika — jedan unscoped, jedan OU-scoped, jedan service-scoped.
Kontekst se čita **iz tih redova** (oblik `PrincipalContextLoader`-a, bez Redis keša), a putanju OJ i postojanje
servisa razrješava sam evaluator iz PostgreSQL-a.

| Test | Šta dokazuje |
| --- | --- |
| uklanjanje `ticket.merge` | `scopeImpacts = {global:1, organizational-unit:1, service:1}`, tri uzorka, svaki `ALLOW → DENY`, OU uzorak nosi `ouPath` iz baze, servisni nosi `serviceName` |
| dodavanje `settings.write` | `DENY → ALLOW` u OU i service scopeu (plus globalni za unscoped assignment) |

### 3.3 Guardovi i lint

| Provjera | Ishod |
| --- | --- |
| `npx jest src/modules/rbac src/modules/authorization` | 32 suitea, 167 testova ✓ |
| `npx eslint src/modules/rbac src/modules/authorization` | čist |
| `npx tsc --noEmit` (backend) | bez nove greške (postojeća `announcement-delivery.spec.ts` TS2835 nije iz ovog paketa) |
| `npx tsc --noEmit` (frontend) | čist |
| `npx vitest run src/components/rbac src/i18n` | 9 fajlova, 50 testova ✓ |
| `node scripts/check-docs-content.mjs` | OK |
| `npm run audit:traceability` | 698/698, **360 zatvoreno / 338 otvoreno** |

### 3.4 CI

Prvi prolaz (`46017114945`) crven u `Frontend build + test`: `Format check (Prettier)` na `rbac-api.ts` (popravka
`ab74fe06`), a zatim — poslije te popravke — `npm run build` (`tsc -b && vite build`) je pao na
`Debug Failure. No error for last overload signature`: typed `t` proslijeđen kao parametar (`scopeLabel(t, …)`)
obara TypeScript u build režimu, iako `tsc --noEmit` prolazi. Popravka (`e20adb3c`): label se bira **inline** u
JSX-u, kao i svi ostali `t(...)` pozivi u tom fajlu; uz to je `dist`/`.next` lokalni artefakt uklonjen i
`prettier --check .` je čist.

Drugi prolaz, PR #49, run [`46024298120`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46024298120)
— svi poslovi zeleni:

## 4. Šta paket mijenja u ponašanju

- Preview sada prikazuje OU/service efekte koji su ranije bili nevidljivi (deny/deny) — to je **više** uzoraka i
  veći broj promjena odjednom, ne lažni alarm: svaki uzorak nosi scope u kojem je odluka donesena.
- `scopeImpacts` je novi obavezni dio odgovora; stari klijenti koji čitaju samo `samples`/`affectedUserCount` rade
  nepromijenjeno.
- `affectedUserCount` **nije** mijenjan (broji assignment redove) — to je `BA-rbac-06` (W2.57), namjerno izvan
  granice ovog paketa.
- Nijedna ruta, DTO na `PUT`-u, token, audit metadata ni baza se ne mijenjaju.

## 5. Granica paketa

- **Ne** mijenja evaluator (`evaluate-authorization-access.ts`) ni pravila coverage-a — preview pita, ne presuđuje.
- **Ne** zatvara `BA-rbac-06` (broj pogođenih assignmenta vs jedinstvenih korisnika) ni `BA-rbac-07` (DTO limiti).
- **Ne** uvodi straničenje uzoraka: `previewSampleLimit` ostaje 3, skeniranje je ograničeno na 25 assignmenta, a
  `scopeImpacts` nosi punu sliku i preko te granice (za role sa više assignmenta brojači su donja granica,
  dokumentovano u §2.1).

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/365-w231-ba-rbac-03-scope-aware-preview.md` | ovaj dokument |
| `backend/content/docs/uloge-i-permisije.md` (+ `manifest.json`), `docs/user-guide/uloge-i-permisije.md` | pregled prikazuje efekat po scopeu (globalno / OJ / servis) |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-03` → `zatvoreno (W2.31)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.31` u ledgeru |

| Posao | Ishod |
| --- | --- |
| `Backend build + test` | ✓ 6m35s |
| `Backend PostgreSQL + Redis integration` (novi scope spec) | ✓ 14m42s |
| `Frontend build + test` (uključuje `tsc -b`, vitest i bundle budžete) | ✓ 3m26s |
| `Backend container + supply chain` | ✓ 3m42s |
| `Docs guard` | ✓ 8s |
| `E2E critical flows` | ✓ 11m15s |
| `CI gate` | ✓ |

Push run je zelen sa integracijom i E2E **skipped** (CI ugovor); Perf smoke
[`46024297805`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46024297805) ✓.
