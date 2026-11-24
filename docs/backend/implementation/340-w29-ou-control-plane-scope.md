# W2.9 — `BA-organizational-units-01`: OU control plane poštuje scope aktera i target hijerarhiju

**Paket:** Val 2, P1 (scope enforcement OU/users/groups), **size L**<br>
**Nalaz:** „OU control plane ignoriše actor OU/service scope i target hijerarhiju”<br>
**Kod:** `modules/organizational-units/organizational-units.controller.ts`, `organizational-units.service.ts`,
`get-organizational-unit-tree.ts`, `organizational-unit.error.ts`, `map-organizational-unit-error.ts`,
`filter-organizational-unit-tree.ts` (**novo**), `assert-organizational-unit-manage-scope.ts` (**novo**),
`create-test-organizational-unit-scope.ts` (**novo, test fixture**),
`modules/authorization/{authorization.constants,permission-catalog}.ts` (**novo permission**)<br>
**Frontend:** `lib/session/permission-keys.ts`, `bs`/`en` `common.json` (`permissions.catalog.keys` — label za novu
permissionu; parity test to traži)<br>
**Specovi:** `filter-organizational-unit-tree.spec.ts` (**novo, 5**), `organizational-units.scope.spec.ts` (**novo,
10**), `organizational-units.controller.guard.spec.ts` (+2), pet postojećih service specova dobija eksplicitnog aktera<br>
**DB migracija:** **nema** (nova permissiona je red u `permission` katalogu, ne u šemi; vidi „Operativna napomena”)<br>
**Rute:** nepromijenjene (632) · **Env:** nema novih varijabli

## Nalaz

Audit (`05-organizational-units.md` §4 i §7) je bio precizan: controller je imao samo
`SessionAuthenticationGuard`, `RoleGuard` i `@RequireRoles(ADMIN)`. Niti jedna ruta nije čitala scope aktera, pa je
scoped ADMIN iz OU A mogao:

- čitati e-mailove korisnika OU B (`GET /organizational-units/:id` i `/users`);
- kreirati dijete u OU B (`POST` sa `parentId` izvan scopea);
- premjestiti/preimenovati OU B ili premjestiti B pod A (`PATCH` bez source/destination provjere);
- mapirati korisnika B u A ili ga odvojiti iz B (`PUT /user-mappings`);
- obrisati OU B i cascade ukloniti njene role assignmente (`DELETE`).

To je horizontalna eskalacija: scoped ADMIN dobija globalnu kontrolu nad topologijom, a promjena topologije mijenja
značenje **tuđih** descendant-scoped grantova. `RoleGuard` to nije mogao spriječiti jer rola nije scope.

## Odluka

**Kontrolna ravnina OU-a ima isti ugovor kao svaki drugi scoped resurs: eksplicitna permissiona + OU scope iz
assignments + posebna provjera za drugi target koji ruta ne vidi.**

| Ruta | Permissiona | Guard | Scope lokator | Dodatna provjera u servisu |
| --- | --- | --- | --- | --- |
| `POST /organizational-units` | `organizationalUnit.manage` | `OuAccessGuard` | `parentId` | — (root OU traži globalni grant) |
| `GET /organizational-units/tree` | — (ostaje USER/AGENT/ADMIN) | — | — | stablo se **suzi** na manage scope aktera |
| `GET /organizational-units/:id` | `organizationalUnit.manage` | `OuAccessGuard` | `organizationalUnitId` | — |
| `GET /organizational-units/:id/users` | `organizationalUnit.manage` | `OuAccessGuard` | `organizationalUnitId` | — |
| `PATCH /organizational-units/:id` | `organizationalUnit.manage` | `OuAccessGuard` | `organizationalUnitId` | **destination parent** (`parentId`) |
| `DELETE /organizational-units/:id` | `organizationalUnit.manage` | `OuAccessGuard` | `organizationalUnitId` | — |
| `PUT /organizational-units/user-mappings` | `organizationalUnit.manage` | `OuAccessGuard` | `organizationalUnitId` | **OU iz koje korisnik izlazi** |

Četiri namjerne odluke:

- **Nova permissiona, ne nova rola.** `organizationalUnit.manage` je u katalogu (kategorija *Imenik korisnika*) i u
  ADMIN defaultima, pa se ponašanje za instalacije koje nisu mijenjale role ne mijenja. Za razliku od role-key
  provjere, permissiona je **opoziva** i **mjerljiva po OU-u**.
- **Globalni grant = unscoped assignment.** `organizationalUnit.manage` je dodan u
  `globalOrganizationalUnitPermissionKeys`, pa unscoped ADMIN assignment (klasičan „install administrator”) i dalje
  upravlja cijelom topologijom — bez njega bi svaka instalacija izgubila OU administraciju. Scoped assignment pokriva
  samo svoje podstablo.
- **Drugi target se provjerava u servisu.** `PATCH` sa `parentId` i `PUT /user-mappings` imaju dva resursa; guard vidi
  samo jedan. Bez druge provjere scoped ADMIN bi kroz „mapiraj korisnika u A” ispraznio OU B, ili kroz „premjesti pod
  B” ubacio svoje podstablo u tuđu granu. Odluka se donosi istom funkcijom kao svuda (`evaluateResourcePolicy`), pa se
  SuperAdmin i globalni grant tumače identično.
- **Ne otkrivaj postojanje.** Out-of-scope `GET`/`PATCH`/`DELETE` vraćaju **403 `FORBIDDEN`** iz guarda, a servisni
  refusali isti kod; `NOT_FOUND` ostaje samo za stvarno nepostojeće OU-e. Poruka ne sadrži ime ni put OU-a.

### Stablo

`GET /organizational-units/tree` ostaje dostupan svim rolama (USER/AGENT ga koriste za filtere tiketa i pretrage), ali
ako akter **ima** `organizationalUnit.manage`, stablo se sužava na OU-e koje ta permissiona pokriva. Vidljiva OU kojoj
je parent izvan scopea postaje **korijen** vraćenog stabla: alternativa (zadržati nevidljivog parenta kao stub) bi
procurenula upravo onaj čvor čije ime scope skriva i dala klijentu parenta kojeg ne može razriješiti.

## Implementacija

### 1. Permissiona — `authorization.constants.ts`, `permission-catalog.ts`

`permissionKeys.organizationalUnitManage = 'organizationalUnit.manage'`; ulazi u `adminPermissionKeys`,
`globalOrganizationalUnitPermissionKeys` i u katalog sa opisom koji kaže da je grant **per OU**. Frontend dobija
`organizationalUnitManage` u `permission-keys.ts` i bs/en label; `permission-i18n-coverage.spec.ts` (backend) čita te
dictionaries, pa nova permissiona bez prijevoda ne može proći.

### 2. Controller — guard i metadata po ruti

`@UseGuards(OuAccessGuard)` + `@RequirePermissions(organizationalUnit.manage)` + `@RequireOrganizationalUnitScope(...)`
na šest control-plane ruta. `OuAccessGuard` **nije** controller-level: on zahtijeva OU scope na svakoj ruti, a `tree`
nema jedan target — zato je stablo izuzeto i sužava se u servisu. SuperAdmin bypass i njegov audit ostaju u
`authorizeHttpExecution` (postojeći mehanizam, jedan zapis po requestu, fail-closed ako audit ne prođe).

### 3. Servis — tri odluke

- `getTree(actorUserId)`: učitava authorization kontekst; ako nijedan assignment ne nosi `organizationalUnit.manage`,
  stablo se vraća nepromijenjeno (USER/AGENT put); ako nosi, filtrira po `decideAuthorizationAccess` **po čvoru**, pa
  više scoped assignmenata daje uniju podstabala.
- `assignUser`: dvije provjere — ciljna OU (guard) i OU iz koje korisnik izlazi (`assertActorManagesOrganizationalUnit`).
  Odvajanje korisnika (`organizationalUnitId: null`) ne traži globalni grant, jer nema destinacije.
- `update`: kad se mijenja `parentId`, provjerava se **destinacija**; `parentId: null` (promocija u korijen) traži
  globalni grant, pa to scoped ADMIN ne može.

### 4. Greške

`OrganizationalUnitErrorCode` dobija `FORBIDDEN`, mapa ga prevodi u `ForbiddenException` (403) sa porukom
„The organizational unit is outside the scope the role is assigned to”. Servis koji nema aktera (`actorUserId: null`)
**fail-closed** odbija mapiranje — test to pinuje.

## Vizuelna provjera (ručni koraci u UI)

Za ovaj val se, uz automatske testove, isporučuje i vizuelni checklist. Potreban je demo stack sa bar dvije OU (A i B)
i dva korisnika: `admin.a@…` (ADMIN rola **scoped na A**) i `admin.global@…` (ADMIN rola bez OU scopea), plus
`SUPER_ADMIN` nalog.

1. **Priprema scopea.** Admin → **Permisije** → rola ADMIN → provjeri da lista sadrži novu stavku
   „organizationalUnit.manage” sa opisom „…unutar organizacionih jedinica na koje je rola dodijeljena”. Ako je nema,
   rola je starija od paketa — pokreni `npm run cli:seed-role-permissions` (vidi operativnu napomenu).
2. **Scoped admin vidi samo svoje.** Prijavi se kao `admin.a` → Admin → tab **Organizacija (OU)** → sekcija
   **Stablo organizacionih jedinica**. Očekivano: A je korijen prikaza sa svojom djecom; **B se ne vidi**, kao ni
   OU-i iznad A.
3. **Globalni admin vidi sve.** Isti ekran kao `admin.global` → očekivano: puno stablo (A, B i korijen).
4. **Tuđi detalj je 403.** Kao `admin.a` otvori direktno detalj OU B (ručno u URL-u/adresnoj traci ako UI ne nudi
   link, npr. preko `GET /api/organizational-units/<idB>`) → očekivano **403 FORBIDDEN**, bez imena i puta OU B u
   poruci. Isto za `…/users`.
5. **Tuđa mutacija je 403.** Kao `admin.a` probaj **Uredi → promijeni naziv** na OU B i **Obriši** OU B → oba moraju
   pasti na 403 (u UI: toast/poruka greške, stablo se ne mijenja).
6. **Premještanje u tuđu granu je 403.** Kao `admin.a`: **Uredi** na svom djetetu → promijeni parent na OU B → 403.
   Zatim isti pokušaj sa parentom „— (korijen)” → 403 (promocija u korijen traži globalni grant).
7. **Mapiranje korisnika.** Kao `admin.a`: Admin → **Korisnici i uloge** → korisnik iz OU B → promjena OU na A →
   403. Zatim korisnik iz A → premjesti u dijete od A → prolazi.
8. **SuperAdmin prolazi i ostavlja trag.** Kao `SUPER_ADMIN` ponovi korak 6 (premještanje u B) → prolazi; zatim u
   Admin → **Audit log** potvrdi zapis o bypassu (akcija super-admin bypass sa rutom i metodom) — bez tog zapisa
   zahtjev se ne izvršava (fail-closed).
9. **Regresija za običnog korisnika.** Kao korisnik sa rolom USER otvori ekran za prijavu tiketa → filter po OU-u
   mora i dalje prikazivati puno stablo (korisnik nema manage permissionu; njegov pristup podacima se odlučuje
   drugdje).

> Napomena za korak 8: bypass audit je postojeći mehanizam (`authorizeHttpExecution`) i piše se **jednom po
> requestu**; ako u audit listi vidiš dva zapisa za jedan klik, to je bug koji prijavi.

## Direktni testni dokaz

- `filter-organizational-unit-tree.spec.ts` (5) — scope filter, promocija vidljivog podstabla u korijen, globalni
  prolaz, prazan rezultat i dokaz da ulazni niz nije mutiran.
- `organizational-units.scope.spec.ts` (10) — scoped ADMIN vidi samo svoje podstablo (i ono postaje korijen); globalni
  ADMIN, USER i poziv bez aktera vide puno stablo; mapiranje korisnika **iz** tuđe OU-e je 403; mapiranje **u** tuđu
  OU-u je 403; mapiranje unutar scopea prolazi; premještanje pod tuđi parent je 403; promocija u korijen je 403 za
  scoped ADMIN; poziv bez aktera je 403; lokalni SuperAdmin prolazi; globalni ADMIN fixture put prolazi.
- `organizational-units.controller.guard.spec.ts` (+2) — svih šest control-plane ruta nosi `OuAccessGuard`, permissionu
  `organizationalUnit.manage` i OU scope lokator; `tree` namjerno ne nosi ni permissionu ni scope lokator.
- Pet postojećih service specova sada eksplicitno predaje aktera (`administratorContext` / test loader) — bez toga bi
  testovi padali na novi fail-closed put, što je i bio cilj: „nema aktera” više nije prolaz.

## Operativna napomena (bez migracije)

Nova permissiona je **red u podacima**, ne u šemi. Svježa instalacija je dobija kroz instalacioni seed; postojeća
instalacija (uključujući demo stack) dobija je ponovnim pokretanjem već postojeće komande:

```
node dist/src/cli/seed-default-role-permissions.js --dry-run   # pokaži šta bi se dodalo
node dist/src/cli/seed-default-role-permissions.js             # dodaj (idempotentno, ništa ne briše)
```

Do tada ADMIN role bez nove permissione **ne mogu** upravljati OU-ima (fail-closed), a unscoped SUPER_ADMIN može.
To je namjeran ishod: bolje izgubiti pristup dok se permissiona ne dodijeli, nego zadržati scope-blind control plane.

## Lokalna verifikacija i njeno ograničenje

Sandbox u ovoj sesiji ne može `prisma generate` (CLI traži `schema-engine` sa `binaries.prisma.sh`). Da bi module
suiteovi uopšte mogli da se učitaju, lokalno je napravljen **stub generisanog klijenta** u `backend/src/generated/prisma/`
(direktorij je u `.gitignore`, pa stub nije dio commita) i Jest je pokrenut sa isključenom TS dijagnostikom. Rezultat je
zato **runtime dokaz, ne type-check**:

- backend: pun Jest **971 suite / 5.736 testova** (uz stub); OU modul **13 suite / 70 testova**; `authorization`,
  `rbac`, `policy-packs`, `install` i `cli` **104 suite / 525 testova**;
- frontend: **478 fajlova / 1.907 testova** (`vitest run`), uključujući `permission-keys`/i18n parity;
- `eslint --max-warnings=0` na svim izmijenjenim backend fajlovima, `check-docs-content` OK,
  `audit:traceability` 696/696 (**336 zatvoreno / 360 otvoreno**).

Type-check i pune suiteove (bez stuba) daje CI; tamo je dokaz za kompilaciju.

## Granica paketa

- **`BA-organizational-units-06`** („globalni tree read izlaže LDAP/topološku metadata svim korisnicima”) ostaje
  **otvoren**: ovdje je sužen samo control-plane pogled za aktere sa manage permissionom; USER/AGENT i dalje vide puno
  stablo jer ga koriste za filtere. Potpuno rješenje tog nalaza je odvojen paket (vjerojatno `W2.31`).
- **`BA-organizational-units-02`** (cross-instance stale `ouPath` cache) ostaje otvoren — scope odluka je sada
  ispravna, ali katalog se još ne invalidira cross-instance.
- **`BA-organizational-units-03`** (concurrent hierarchy updates) i **`-04`** (case-insensitive DN) nisu dirani.
- **`BA-users-01`** (ADMIN users control plane) je isti sistemski uzrok u drugom modulu i ostaje za `W2.10`.
- Guard ne provjerava **service scope** na ovim rutama jer OU nije servisni resurs; `serviceId` se ne šalje u odluku.

## CI

Prvi run (`45459606355`, commit `a36c1d0`) je pao tek na koraku **„Verify route/guard and root-module wiring snapshot”**:
wiring manifest je inventar guardova po ruti, pa dodavanje `OuAccessGuard` na šest ruta mora da uđe i u njega
(`npm run wiring:write` → `docs/backend/backend-wiring-manifest.json`, +24/−12: `methodGuards` i `policyProof` za
control-plane rute). Nakon regenerisanja i spajanja u jedan commit: run **`45463469776`** (commit `c9cbc48`) —
**success**, svi jobovi zeleni (*Backend build + test*, *Backend PostgreSQL + Redis integration*, *Frontend build +
test*, *Docs guard*, *Backend container + supply chain*, *CI gate*); E2E jobovi skipped jer ovaj paket nema E2E scenarij.

## Registar nalaza

- Zatvoreno: `BA-organizational-units-01` (uz zeleni CI i gornji dokaz).
- Ostaje otvoreno iz istog modula: `-02`, `-03`, `-04`, `-05`, `-06`, `-07`, `-08`, `-09`.
