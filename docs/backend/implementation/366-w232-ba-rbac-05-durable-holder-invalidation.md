# 366 — W2.32 `BA-rbac-05`: invalidation nosilaca role je dio commita, a ne nada poslije njega

**Paket:** `W2.32` · **Nalaz:** `BA-rbac-05` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** RBAC + authorization/platform owner · **Povezano:** `BA-rbac-01` (W2.29), `BA-rbac-02` (W2.30), `BA-rbac-03` (W2.31), `BA-groups-02` (W2.25, isti obrazac fencea)
**DB migracije:** ne (koristi postojeće `User.authzVersion` i `OutboxMessage`)

## 1. Nalaz i provjera premise

Baseline audita: „`replaceRolePermissions` commituje matricu i audit, zatim poziva hook. `RolesService` invalidator
drži kao optional; invalidator dalje best-effort hvata greške." Uticaj: korisnici do isteka cache TTL-a mogu
zadržati uklonjeno pravo, API već vraća uspjeh i nema durable retry zapisa.

Provjera premise u kodu prije paketa:

| Tvrdnja | Stanje prije W2.32 |
| --- | --- |
| hook se poziva **poslije** `$transaction`, kao odvojen korak | **tačno** (`replace-role-permissions.ts`: `await invalidateRoleHolders(role.id)` iza transakcije) |
| bump `authzVersion` se dešava u tom post-commit koraku | **tačno** (`PrincipalContextInvalidator.invalidateRoleHolders` → `invalidateUsers`) |
| greška bumpa se guta | **tačno** (`try { … } catch { logger.warn(…); return 0; }`), pa i `invalidateUsers` ima fallback koji takođe guta |
| postoji durable zapis namjere invalidacije | **ne** — nijedan red se ne upisuje u transakciji |
| `RolesService` invalidator je optional | **tačno** (`@Optional()`), ali `AuthenticationModule` ga izvozi, pa u produkciji postoji; problem nije bio DI nego vrijeme i tišina |
| loader provjerava keširani payload protiv baze | **tačno** (`matchesDurableAuthority`: `authority.authzVersion === cached.authzVersion`), ali verzija se nije mijenjala u transakciji — pa fence nije imao šta odbiti |

Dakle nalaz nije zastario: **postojeći** mehanizam (verzija u keš ključu + fence u loaderu) je bio ispravan, ali
je verziju pomjerao netransakcijski, best-effort korak. Ako Redis ili sam hook padnu, commit je već prijavljen kao
uspjeh, a stari grant ostaje „važeći" jer se njegova verzija poklapa sa onom u bazi.

## 2. Korekcija

### 2.1 Fence je dio upisa, ne obavijest o upisu

`replaceRolePermissions` sada **unutar iste transakcije** (poslije matrice, claima i audit reda) radi:

1. `userRole.findMany({ where: { roleId }, select: { userId }, distinct: ['userId'], orderBy: { userId } })` —
   jedinstveni nosioci role;
2. `user.updateMany({ where: { id: { in: userIds } }, data: { authzVersion: { increment: 1 } } })`;
3. `user.findMany(...)` da se pročitaju **nove** verzije iz iste transakcije.

Vraća se `fencedHolders: readonly RoleHolderFence[]` (`{userId, authzVersion}`). Time je uklanjanje prava
**fail-closed po konstrukciji**: keširani principal context nosi staru verziju, a `PrincipalContextLoader`
uspoređuje je sa `User.authzVersion` na svakom hit-u — payload stare verzije se nikad više ne servira, čak i ako
Redis nikad ne dobije nikakvu poruku. Redis, hook i outbox smiju pasti; nijedan od njih nije ono što čini da
uklonjeno pravo prestane da važi.

### 2.2 Post-commit korak samo objavljuje ono što je baza već odlučila

`RoleHoldersInvalidationHook` sada prima `(roleId, fencedHolders)`; `RolesService` ih predaje novoj metodi
`PrincipalContextInvalidator.publishCommittedRoleHolders(roleId, holders)`, koja:

- pomjera pointer `authz:{userId}:current` na **komitovanu** verziju (bez drugog bumpa — drugi bump bi proširio
  prozor koji je commit trebao zatvoriti, isto pravilo kao W2.25 `BA-groups-02`),
- objavljuje socket invalidaciju (`kind: 'users'`) da se žive sesije odmah odspojе,
- **baca** ako Redis nije dostupan (`redis_<status>` ili greška pisanja), umjesto da tiho vrati 0.

`RolesService.publishRoleHolders` hvata tu grešku, loguje `authz_role_invalidation_deferred` i nastavlja — upis je
već uspješan i već na snazi. Kada invalidator nije u DI-ju (unit testovi, CLI), loguje
`authz_role_invalidation_unwired … fallback=durable_fence`.

### 2.3 Durable retry: outbox poruka u istoj transakciji

Unutar transakcije, ako rola ima nosioce, zakazuje se poruka kroz postojeću infrastrukturu
(`CacheInvalidationService.schedule`, tema `cache.invalidate.authz.role-holders`):

| Polje | Vrijednost |
| --- | --- |
| `namespace` | `authz.role-holders` |
| `key` | `roleId` |
| `revision` | najviša komitovana `authzVersion` među nosiocima |
| `dedupeKey` | `<revision>:<sha256(roleId)>` (svaki sljedeći replace bumpuje dalje, pa se ključ ne sudara) |
| `maxAttempts` | 20 (postavlja `CacheInvalidationService`) |

Payload **ne nosi listu korisnika**: `RoleHoldersInvalidationDispatcher` pri dostavi ponovo čita nosioce i njihove
verzije iz baze. Zato je poruka ograničene veličine (radi i za role sa hiljadama dodjela) i samoiscjeljujuća —
retry poslije kasnije izmjene role objavljuje verzije koje baza **sada** drži.

`RoleHoldersInvalidationDispatcher` (novi, u `RbacModule`) svakih 3 s drenira do 25 poruka. Uspjeh loguje
`authz_role_invalidation_published role=… users=… revision=…`, neuspjeh pušta grešku outboxu (retry/dead-letter),
pa API nikad ne tvrdi da je keš očišćen kada nije.

### 2.4 Metrika

Brojevi koje nalaz traži sada postoje na dva mjesta, bez novog sistema metrike:

- **strukturirani logovi**: `authz_role_invalidation_published` (users, revision), `authz_role_invalidation_deferred`
  (users, reason), `authz_role_invalidation_unwired`, `authz_role_invalidation_drain_failed`;
- **durable stanje**: `OutboxMessage.status/attempts/lastError` za temu `cache.invalidate.authz.role-holders` je
  trajni brojač neisporučenih invalidacija (i dead-letter ako se probije 20 pokušaja).

## 3. Dokaz

### 3.1 Unit (`roles.service.spec.ts` +5, `role-holders-invalidation.dispatcher.spec.ts` +4)

| Test | Šta dokazuje |
| --- | --- |
| `bumps every holder authzVersion inside the write transaction` | `userRole.findMany(distinct)` + `user.updateMany({ increment: 1 })` se izvršavaju u upisu; hook dobija `[{user-1,7},{user-2,4}]` |
| `keeps the change effective when the cache notice fails` | obavijest odbija (`redis unavailable`), `replace` **uspijeva**, a bump je već urađen |
| `schedules the durable retry inside the transaction with the highest committed version` | `schedule(tx, {namespace:'authz.role-holders', key: role.id, revision: 11})` |
| `fences and schedules nothing when the role has no holders` | nula nosilaca → nema bumpa, nema obavijesti, nema poruke |
| `does not fence anyone when the write itself failed` | pad `rolePermission.deleteMany` → nema `user.updateMany` (fence se rollbackuje sa upisom) |
| dispatcher: drain do `idle`, cap 25 | poruke se obrađuju serijski, jedna po `dispatchOne` |
| dispatcher: nosioci se čitaju pri dostavi | `roleHolderVersions(role-1)` → `publishCommittedRoleHolders(role-1, [{user-1,4}])` |
| dispatcher: rola bez nosilaca | ne objavljuje ništa (nema šta da se tombstoneuje) |
| dispatcher: greška se **pušta** | outbox dobija `retry`, umjesto da se uspjeh lažno prijavi |

```
$ npx jest src/modules/rbac src/modules/authorization --runInBand
Test Suites: 5 skipped, 33 passed, 33 of 38 total
Tests:       9 skipped, 176 passed, 185 total
$ npx jest src/common/principal-context src/common/cache-invalidation src/common/outbox --runInBand
Tests: 15 skipped, 42 passed, 57 total
```

### 3.2 Real-DB integracija (`role-holders-invalidation.integration.spec.ts`)

Registrovan u `scripts/run-isolated-integration.mjs`. Fixture u izolovanoj bazi: role sa `ticket.merge`, jedan
nosilac, pravi `TransactionalOutboxService` + `CacheInvalidationService`, `PrincipalContextLoader` sa lažnim
Redisom (mapa) da bi „keš" bio stvarni objekat koji test može pregledati.

Scenario (jedan test, pet koraka):

| Korak | Šta dokazuje |
| --- | --- |
| 1. replika A učita nosioca | payload `v<version>` i pointer su u kešu, pravo `ticket.merge` je u kontekstu |
| 2. `replace` sa obaviješću koja odbija (`redis_unavailable`) | API **uspijeva**: `[]`, audit i matrica komitovani |
| 3. `authzVersion` = prije + 1 | fence je dio upisa, ne post-commit koraka |
| 4. `OutboxMessage` PENDING, `attempts = 0`, payload `{namespace, key: roleId, revision: novaVerzija}` | namjera invalidacije je durable i komitovana zajedno sa upisom |
| 5. payload stare verzije je **još u Redis-u** i pointer nije pomjeren | nema lažnog dokaza: tombstone se nije desio |
| 6. replika B (isti keš) učita nosioca | `ticket.merge` **nema**, kontekst je nove verzije — fence u bazi je jedino što je odlučilo |
| 7. dispečer sa pokvarenim Redisom | poruka ostaje PENDING, `attempts = 1`, `lastError` sadrži `unavailable` → retry, ne „uspjeh" |
| 8. dispečer sa ispravnim Redisom | `SUCCEEDED`, pointer = nova verzija, socket objava poslana, **`authzVersion` nepromijenjen** (nema drugog bumpa) |

### 3.3 Guardovi i lint

| Provjera | Ishod |
| --- | --- |
| `npx eslint src/modules/rbac src/common/principal-context src/common/cache-invalidation` | čist |
| `npx tsc --noEmit` (backend) | bez nove greške (postojeća `announcement-delivery.spec.ts` TS2835 nije iz ovog paketa) |
| `npx jest src/modules/rbac src/modules/authorization` | 33 suitea, 176 testova ✓ |
| `npx jest src/common/principal-context src/common/cache-invalidation src/common/outbox` | 42 testa ✓ |
| frontend | **nije diran** (nema izmjene UI/ruta) |
| `npm run audit:traceability` | 698/698, **361 zatvoreno / 337 otvoreno** |

### 3.4 CI

Tri prolaza su bila potrebna, i svaki je našao stvarnu grešku u isporuci (ne flake):

1. `46036396183` — `Backend build + test` i `Docs guard` crveni na traceability guardu: `audit:traceability --write`
   je regenerisao i `BACKEND-IMPLEMENTATION-MASTER-PLAN.md`, a taj fajl nije ušao u commit; `npm run
   audit:traceability` i `node scripts/check-backend-findings.mjs` su lokalno reproducirali isti PROBLEM.
   Integracija je pala na `TypeError: Cannot read properties of undefined (reading 'subjectId')` — preview je
   tražio kontekst nosioca od harnessa koji nema default implementaciju, pa je prvi put u ovom paketu bilo stvarnih
   nosilaca koje preview skenira.
2. `46039006212` — traceability zelen; integracija i dalje crvena (isti `subjectId`) jer je popravka master plana
   otišla bez popravke loader-a; `Backend container + supply chain` pao na infrastrukturi („The Syft installer failed
   to install v1.54.0"), ne na kodu.
3. `46041324568` — zelen: spec sada koristi **DB-derived** loader (oblik `PrincipalContextLoader`-a, bez Redis
   keša), pa preview evaluira stvarni kontekst nosioca.

Full detalj u §6.

## 4. Šta paket mijenja u ponašanju

- **Krajnji korisnik**: uklonjeno pravo prestaje da važi u trenutku commit-a, bez obzira na stanje Redis-a.
  Ranije je moglo ostati efektivno do isteka TTL-a (60 s) ili trajno ako bump padne.
- **Administrator / API**: `PUT /roles/:roleKey/permissions` se **ne mijenja** — isti status, isti body, isti audit.
  Razlika je u tome što uspjeh sada garantuje i da stari grant nije važeći.
- **Redis**: više nije na kritičnom putu ispravnosti; njegov pad sada znači „skupje sljedeće čitanje", ne „staro
  pravo ostaje". Neisporučena invalidacija ostaje vidljiva kao `OutboxMessage` red i retry se nastavlja.
- **Performanse**: upis role sada radi dva dodatna upita unutar transakcije (`userRole` nosioci + `updateMany` +
  `findMany`), a nosioci se čitaju još jednom pri dostavi. Post-commit put je **jeftiniji** za Redis (jedan
  pointer po nosiocu, jedan `publish`), bez dodatnog DB bumpa.
- **Sockets**: žive sesije se odspajaju pri dostavi; ako dostava kasni, `authzVersion` bump i 15-sekundni socket
  lease recheck i dalje drže sesiju sigurnom.

## 5. Granica paketa

- **Ne** mijenja preview/CAS/claim ugovor (`BA-rbac-01`, `BA-rbac-02`) ni evaluator.
- **Ne** uvodi `Role.revision` polje: izvor istine je `User.authzVersion` (postojeća kolona), a „revision" u poruci
  je samo najviša komitovana verzija nosioca — dovoljna za dedupe i za log.
- **Ne** rješava `BA-rbac-06` (distinct korisnici u previewu), `BA-rbac-07` (DTO limiti), `BA-rbac-08` (seeder) —
  `W2.57`–`W2.59`.
- **Ne** dira seeder CLI (`seed-default-role-permissions`): on i dalje koristi `invalidatePrincipals` hook; isti
  obrazac bi bio sljedeći korak kada se `BA-rbac-08` bude rješavao.
- **Ne** dodaje novi sistem metrike: koristi strukturirane logove i `OutboxMessage` stanje, kao ostali outbox tokovi
  u repou.

## 6. Dokumentacija i dokazi

| Fajl | Šta je promijenjeno |
| --- | --- |
| `docs/backend/implementation/366-w232-ba-rbac-05-durable-holder-invalidation.md` | ovaj dokument |
| `docs/backend/audits/03-rbac.md` | registar `BA-rbac-05` → `zatvoreno (W2.32)`, detaljni nalaz, §13 |
| `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `backend-findings-plan.json`, `audits/README.md` | regenerisano kroz `audit:traceability --write` |
| `docs/backend/EXECUTION-PLAN-REMAINING.md` | red `W2.32` u ledgeru |

Korisnički vodiči nisu mijenjani: ponašanje vidljivo administratoru (status, poruke, ekrani) je isto, a razlika je u
garanciji ispod API-ja.

| Posao | Ishod |
| --- | --- |
| `Backend build + test` (uključuje traceability guard) | ✓ 4m23s |
| `Backend PostgreSQL + Redis integration` (novi holder-invalidation spec) | ✓ 21m54s |
| `Frontend build + test` | ✓ 3m37s |
| `Backend container + supply chain` | ✓ 3m43s |
| `Docs guard` | ✓ 13s |
| `E2E critical flows` | ✓ 10m14s |
| `CI gate` | ✓ |

Push run je zelen sa integracijom i E2E **skipped** (CI ugovor); Perf smoke
[`46041325817`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/46041325817) ✓.
