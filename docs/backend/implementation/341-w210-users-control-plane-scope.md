# W2.10 — `BA-users-01`: users control plane poštuje OU scope i destinaciju granta

**Paket:** Val 2, P1 (scope enforcement OU/users/groups), **size L**<br>
**Nalaz:** „ADMIN users control plane ignoriše OU/service scope”<br>
**Kod:** `modules/users/users.controller.ts`, `user-security.controller.ts`, `users.service.ts`,
`list-users-summary.ts`, `assert-user-manage-scope.ts` (**novo**), `resolve-user-list-scope.ts` (**novo**),
`create-test-…` nema (fixtures su lokalne),
`modules/authorization/{authorization.constants,authorization.types,permission-catalog,read-authorization-requirements,authorize-http-execution,authorization.service}.ts`<br>
**Frontend:** `lib/session/permission-keys.ts`, `bs`/`en` `common.json` (`permissions.catalog.keys`)<br>
**Specovi:** `resolve-user-list-scope.spec.ts` (**novo, 6**), `assert-user-manage-scope.spec.ts` (**novo, 6**),
`users.list-scope.spec.ts` (**novo, 5**), `user-security.controller.guard.spec.ts` (**novo, 3**),
`users.controller.guard.spec.ts` (prepisan, 5), `authorize-http-execution.spec.ts` (+3)<br>
**DB migracija:** **nema** (dvije nove permissione su podaci; vidi „Operativna napomena”)<br>
**Rute:** nepromijenjene (632) · **Env:** nema novih varijabli

## Nalaz

Audit `04-users.md` §10 je bio eksplicitan: tri users kontrolera puštala su ADMIN/SA preko `@RequireRoles`, list query
nije imao actor filter, a `assertCanManageTargetUser` je znao samo razliku actor/target `isSuperAdmin`. Posljedica iz
audita: ADMIN sa rolom scoped na OU A otvori listu, nađe korisnika iz OU B, resetuje mu MFA/lozinku ili ga
deaktivira, a zatim mu dodijeli ADMIN u scopeu koji sam ne kontroliše.

Uz to je paket morao riješiti tri mjesta gdje *ruta* ne vidi metu:

- **lista** — `GET /users` nema id u URL-u, pa nema šta da se scope-uje dekoratorom;
- **premještanje** — `PATCH /users/:id` nosi `organizationalUnitId` u tijelu (destinacija), a scope iz URL-a pokriva
  samo trenutnu OU korisnika (izvor);
- **grant/revoke role** — `POST`/`DELETE /users/:id/roles` mijenjaju **scope role**, ne samo korisnika; bez provjere
  scoped ADMIN dodjeljuje service/OU scope koji sam ne posjeduje ili skida grant koji ne kontroliše.

## Odluka

**Kontrolna ravnina korisnika ima isti ugovor kao OU control plane iz W2.9: eksplicitna permissiona, OU scope iz
assignments i posebna provjera za destinaciju koju ruta ne vidi.**

| Ruta | Permissiona | Guard | Scope lokator | Dodatna provjera |
| --- | --- | --- | --- | --- |
| `GET /users` | `user.manage` | `RoleGuard` (klasa) | — | lista se **suzi** na OU-e aktera |
| `POST /users` | `user.manage` | `OuAccessGuard` | `organizationalUnitId` (tijelo) | — (kreiranje bez OU-e = globalni akt) |
| `PATCH /users/:id` | `user.manage` | `OuAccessGuard` | `userId` → `resource: 'user'` | **destinacija premještanja** |
| `DELETE /users/:id` | `user.manage` | `OuAccessGuard` | `userId` → `user` | — |
| `GET /users/:id/roles` | `user.manage` | `OuAccessGuard` | `userId` → `user` | — |
| `POST /users/:id/roles` | `user.manage` | `OuAccessGuard` | `userId` → `user` | **destinacija granta** (OU **ili** service) |
| `DELETE /users/:id/roles/:userRoleId` | `user.manage` | `OuAccessGuard` | `userId` → `user` | **scope granta koji se skida** |
| `POST /users/:id/reset-password` | `user.security.manage` | `OuAccessGuard` | `userId` → `user` | — |
| `GET /users/:id/security` | `user.security.manage` | `OuAccessGuard` | `userId` → `user` | — |
| `POST /users/:id/sessions/revoke-all`, `POST /users/:id/mfa/reset` | `user.security.manage` | `OuAccessGuard` | `userId` → `user` | — |

Pet namjernih odluka:

- **Dvije permissione, ne jedna.** `user.manage` (kreiranje/izmjena/brisanje/role) i `user.security.manage`
  (sigurnosni pregled, privremena lozinka, sesije, MFA) su odvojeni jer su različiti rizici: instalacija može
  delegirati uređivanje profila bez prava na preuzimanje naloga. ADMIN dobija obje kao default, pa se ponašanje
  postojećih instalacija ne mijenja.
- **Ime role više nije autorizacija.** `@RequireRoles(ADMIN, SUPER_ADMIN)` je uklonjen sa oba kontrolera; vrijedi
  permissiona (+ `OuAccessGuard` gdje postoji meta). Važeći grant je onaj koji nosi permissionu — rola je samo nosač.
- **Enumeracija ide po OU-i, ne po servisu.** `user.manage` scoped na OU vidi korisnike svog podstabla. Grant scoped
  **na servis** ne proširuje listu: servisni scope kaže koje servisne resurse rola kontroliše, a ne čini ljude koji na
  tom servisu imaju rolu popisivima. Bez OU granta lista je prazna (fail-closed), ne „svi”.
- **Grant se provjerava na destinaciji, revoke na scopeu granta.** `authorizeResource` je ista funkcija koju koristi
  svaki drugi modul, pa se globalni grant, OU-scoped grant, servisni grant i SuperAdmin bypass tumače identično. Grant
  sa `organizationalUnitId: null` i `serviceId: null` (globalna rola) traži globalni grant — i pri dodjeli i pri
  oduzimanju.
- **SuperAdmin-only ostaje strože, ne scope-blind.** `UserDirectoryIdentityController` (link/unlink AD identiteta)
  ostaje `SUPER_ADMIN`-only; taj paket ga ne otvara ADMIN-u, samo dokumentuje da je i dalje izvan dosega scoped ADMIN-a.

### Kako se korisnik prevodi u OU

`AuthorizationScopeLocator` je dobio drugu vrijednost `resource: 'user'`. Guard ne dobija korisnika od handlera, nego
ga sam razriješi preko `AuthorizationService.resolveUserOrganizationalUnitId` (jedan `SELECT organizationalUnitId`) i
tek onda pita evaluator. Korisnik bez OU-e razriješi se u `null`, što **nije** wildcard: scoped grant ga ne pokriva,
globalni grant i SuperAdmin ga pokrivaju. Nepostojeći korisnik se ponaša isto (403 za scoped aktera) — poruka ne
otkriva da li korisnik postoji.

## Implementacija

### 1. `resource: 'user'` u authorization aparatu

`AuthorizationScopeLocator.resource` je proširen na `'group' | 'user'`; `readAuthorizationRequirements` prihvata obje
vrijednosti i odbija sve ostalo (nepoznat resurs = nema scopea). `authorize-http-execution` bira resolver po resursu, a
`AuthorizationService.resolveUserOrganizationalUnitId` je nova metoda pored postojeće group varijante.

### 2. Lista — `resolve-user-list-scope` + `listSummaryPageForActor`

`resolveUserListScope(context)` vraća ili `unrestricted` (globalni grant, ili lokalni SuperAdmin) ili skup `ouPath`
prefiksa. `UsersService.listSummaryPageForActor` razriješi prefikse u OU id-eve (`ouPath` ili `ouPath` sa prefiksom
`<path>/` — ista granica segmenata kao `doesOrganizationalUnitScopeCover`) i prosljeđuje `organizationalUnitIds` u isti
query i u isti `count`, pa `X-Total-Count` ne može objaviti korisnike koje stranica skriva. Prazan scope = `in: []` =
nula redova; nedostajući loader ili nedostajući akter takođe daju prazan scope (nikad „svi”).

### 3. Destinacija — `assertActorManagesUserDestination`

Jedan helper za tri mjesta (move, grant, revoke). Uzima `AuthorizationService.authorizeResource`, dakle i provjeru da
OU/servis postoje (`INVALID_INPUT` je fail-closed). Revoke prvo pročita grant kroz `listRoles` (koji je već dozvoljen
samo za korisnika u scopeu) i provjeri **scope granta**; nepoznat `userRoleId` ide dalje do servisa, koji odgovara 404
bez otkrivanja.

### 4. UI ugovor

Nove permissione su u katalogu (kategorija *Imenik korisnika*) sa bs/en opisima, i u `permission-keys.ts` na
frontendu. Nijedan ekran nije mijenjan: admin tabovi se već renderuju po permisijama, pa scoped ADMIN vidi **samo svoje
korisnike** bez izmjena u React kodu.

## Vizuelna provjera (ručni koraci u UI)

Potreban je demo stack sa dvije OU (A i B) i tri naloga: `admin.a` (ADMIN **scoped na A**), `admin.global` (ADMIN bez
OU scopea) i `SUPER_ADMIN`. Ako stack nema OU-e, vidi sljedeću sekciju („AD konektor sa testnim OU”) — daje OU stablo
`/Users` i `/Users/IT` i korisnike u njima.

1. **Priprema permissione.** Admin → **Permisije** → rola ADMIN → provjeri da lista sadrži
   „user.manage” („…unutar organizacionih jedinica na koje je rola dodijeljena (W2.10)”). Ako je nema, pokreni
   `npm run cli:seed-role-permissions` (vidi „Operativna napomena”).
2. **Scoped admin vidi samo svoje.** Prijavi se kao `admin.a` → Admin → tab **Korisnici i uloge**. Očekivano: u listi
   su samo korisnici iz OU A (i njenih pod-OU); **korisnik iz OU B se ne pojavljuje**, ni kad ga tražiš pretragom po
   imenu/e-mailu. Broj u zaglavlju (ukupno) mora odgovarati vidljivom skupu, ne cijeloj bazi.
3. **Globalni admin vidi sve.** Isti ekran kao `admin.global` → puna lista, uključujući korisnike B.
4. **Tuđi detalj / izmjena je 403.** Kao `admin.a` probaj otvoriti korisnika iz B preko direktnog URL-a ekrana ili
   API-ja (`GET /api/users/<idB>`) → **403**, poruka bez imena i e-maila korisnika. Isto za `PATCH` (promjena imena) i
   `DELETE`.
5. **Premještanje u tuđu OU je 403.** Kao `admin.a` → **Uredi** na svom korisniku → promijeni organizacionu jedinicu na
   B → **403**, korisnik ostaje u A. Zatim isti pokušaj sa „bez organizacione jedinice” → **403** (globalni akt).
6. **Grant van vlastitog scopea je 403.** Kao `admin.a` → **Korisnici i uloge** → svom korisniku dodaj rolu sa
   organizacionom jedinicom B → **403**. Isto sa servisnim scopeom koji `admin.a` ne posjeduje → **403**. Dodjela
   role unutar A prolazi.
7. **Revoke van vlastitog scopea je 403.** Kao `admin.a` probaj ukloniti korisniku grant koji je scoped na B → **403**;
   grant unutar A se uklanja normalno.
8. **Sigurnosne akcije su odvojene.** Kao `admin.a` otvori sigurnosni panel korisnika iz A → vidiš MFA status i sesije;
   „Reset lozinke”, „Opozovi sve sesije” i „Reset MFA” prolaze. Isti panel za korisnika iz B → **403** već pri
   otvaranju.
9. **SuperAdmin prolazi i ostavlja trag.** Kao `SUPER_ADMIN` ponovi korak 4/5 → prolazi; u Admin → **Audit log** postoji
   **jedan** zapis o bypassu za taj request (metoda + ruta). Bez tog zapisa zahtjev se ne izvršava (fail-closed).
10. **Regresija za običnog korisnika.** Kao USER/AGENT otvori svoj profil i listu tiketa → ništa se ne mijenja; korisnik
    ne dobija „Korisnici i uloge” tab (nema `user.manage`).

## AD konektor sa testnim OU (setup za vizuelnu i E2E provjeru)

Paket ne mijenja konektor, ali provjera scopea traži **stvarno OU stablo**, pa je njegovo podizanje dio isporuke.

### A. Ručni katalog (default, bez AD servera)

`backend/src/seed-database.ts` već seeduje `default-manual-directory-catalog.ts`:

| externalId | ouPath | DN | tip |
| --- | --- | --- | --- |
| `manual_only:ou:users` | `/Users` | `OU=Users,DC=example,DC=com` | DIRECTORATE (root) |
| `manual_only:ou:users-it` | `/Users/IT` | `OU=IT,OU=Users,DC=example,DC=com` | BRANCH (dijete) |
| `manual_only:ou:groups` | `/Groups` | `OU=Groups,DC=example,DC=com` | DIRECTORATE (root) |

Uz njih idu i testni korisnici (`dev.reader` u `/Users`, `it.reader` u `/Users/IT`) i grupe. Koraci:

```bash
cd backend
npm run build                       # dist/ je potreban za CLI skripte
npm run db:seed                     # idempotentno: preskače ako katalog već postoji
```

Zatim Admin → **Organizacija (OU)** → **Stablo organizacionih jedinica** mora prikazati `/Users` (sa djetetom `IT`) i
`/Groups`. Ako je katalog već bio popunjen, `db:seed` vraća `seeded: false` — to je očekivano, ne greška.

### B. Pravi AD preko LDAPS-a

1. U Postavkama (Admin → **Postavke**, sekcija autentifikacije) postavi:
   - `private.auth.adRead.enabled` = `true`
   - `private.auth.adRead.strategy` = `ldaps`
   - `private.auth.adRead.source` = `ldaps` (alternativa `manual_catalog`)
   - `private.auth.adLdapsUrlsCsv` = `ldaps://ad.test.local:636`
   - `private.auth.adBindDn` / `private.auth.adBindPassword` = servisni nalog samo za čitanje
   - `private.auth.adRead.usersBaseDn` = `OU=Users,DC=example,DC=com`
   - `private.auth.adRead.groupsBaseDn` = `OU=Groups,DC=example,DC=com`
2. Na AD strani pripremi **testno OU stablo** tačno kao u katalogu (`OU=Users`, `OU=IT` ispod njega, `OU=Groups`) i po
   jednog korisnika u `Users` i u `IT` — imena ne moraju biti ista, ali **moraju biti u različitim OU-ima**, inače
   koraci 2–8 iz vizuelne provjere nemaju šta da razlikuju.
3. Admin → **Organizacija (OU)** → pokreni sync/uvoz iz imenika; provjeri da su OU-e uvezeni sa `ouPath` koji odgovara
   DN-u.
4. Sigurnosna napomena: `private.auth.adRead.*` je read-only; paket **ne** piše u AD. Ako LDAPS endpoint nije dostupan,
   sync mora pasti vidljivo (Admin → **Ops** → health), ne tiho.

### C. Scoped i globalni admin za provjeru

1. Admin → **Korisnici i uloge** → kreiraj `admin.a` i `admin.global`.
2. `admin.a`: dodijeli rolu ADMIN **sa organizacionom jedinicom `/Users`** (u dijalogu za dodjelu role).
3. `admin.global`: dodijeli rolu ADMIN **bez organizacione jedinice**.
4. Provjeri u **Permisije** da rola ADMIN ima `user.manage` i `user.security.manage`; ako nema, pokreni
   `npm run cli:seed-role-permissions` pa osvježi stranicu.

## Direktni testni dokaz

- `resolve-user-list-scope.spec.ts` (6) — scoped podstablo, unscoped grant, lokalni vs provider-bound SuperAdmin,
  servisni grant ne proširuje listu, grant bez permissione se ignoriše, `null`/`undefined` kontekst = prazan scope.
- `users.list-scope.spec.ts` (5) — prefiks `OU=A/` ulazi u query; isti filter ide u `count`; globalni grant ne pravi
  OU query; bez ijedne OU-e → `in: []`; nedostajući loader i nedostajući akter → `in: []`.
- `assert-user-manage-scope.spec.ts` (6) — poziv kanonskog `authorizeResource` sa destinacijom; 403 bez imena OU-e;
  blank destinacija = „bez OU-e”; servisna destinacija; `null` principal; override permissione.
- `user-security.controller.guard.spec.ts` (3) — `user.security.manage` na klasi, `OuAccessGuard` + user lokator na sve
  tri rute, class-level permission vrijedi i bez handler dekoratora.
- `users.controller.guard.spec.ts` (5) — `user.manage` na klasi, list bez scope lokatora (objašnjeno zašto), šest ruta
  sa `OuAccessGuard` + `{field:'userId', resource:'user'}`, `reset-password` nosi `user.security.manage` umjesto
  `user.manage`.
- `authorize-http-execution.spec.ts` (+3) — `resource: 'user'` razrješava OU preko `resolveUserOrganizationalUnitId`,
  ne zove group resolver, `null` OU → 403 za scoped aktera, metadata se čita kao `{field, resource}`.

## Lokalna verifikacija i njeno ograničenje

Sandbox ne može `prisma generate` (nema `binaries.prisma.sh`), pa je generisani klijent **lokalni stub** u
`backend/src/generated/prisma/` (direktorij je u `.gitignore`) i Jest je pokrenut sa isključenom TS dijagnostikom —
dakle **runtime dokaz, ne type-check**:

- backend pun Jest: **975 suite / 5.763 testa prolazi, 0 padova**, 342 testa skipped (1081 ukupno; skip = integracijski
  suiteovi koji traže bazu/Redis);
- `users` + `authorization`: **52 suite / 234 testa**;
- frontend: **478 fajlova / 1.907 testova**;
- `eslint --max-warnings=0` na `src/modules/users` i `src/modules/authorization`; `check-docs-content` OK;
  `audit:traceability` 696/696.

Type-check i pune suiteove daje CI. Usput je popravljen i sam stub (`Prisma.sql`/`join`/`raw`), jer su bez njih 12
nepovezanih suiteova padala i **prije** ovog paketa — to je artefakt sandboxa, ne regresija.

## Operativna napomena (bez migracije)

```bash
npm run cli:seed-role-permissions -- --dry-run   # pokaži šta bi se dodalo
npm run cli:seed-role-permissions                # dodaj (idempotentno, ništa ne briše)
```

Do tada ADMIN rola bez novih permissiona **ne može** ući u kontrolnu ravninu korisnika (fail-closed), a unscoped
`SUPER_ADMIN` može. To je namjeran ishod: bolje izgubiti pristup dok se permissiona ne dodijeli, nego zadržati
scope-blind kontrolu nad nalozima.

## Granica paketa

- **`BA-users-02`** (parcijalno kreiranje računa, `assertCanAssignRole` prekasno) ostaje otvoren — ovaj paket ne mijenja
  redoslijed koraka u `createUser`.
- **`BA-users-03`** (deaktivacija/identity transitioni ne opozivaju sesije), **`-06`** (durable principal
  invalidacija), **`-07`** (`ParseUUIDPipe` na cuid), **`-08`** (hard-delete preflight), **`-09`** (audit kopira e-mail)
  nisu dirani.
- **`UserDirectoryIdentityController`** ostaje `SUPER_ADMIN`-only; nije pretvoren u permissionu jer je stroži od
  `user.manage` i to nije scope propust.
- **Crew/service mutacije** (npr. bulk operacije nad korisnicima, ako ih modul dobije) nisu u ovom paketu.
- Lista **ne** filtrira po servisnom scopeu (vidi odluku iznad); ako se ukaže potreba za „servisni menadžer vidi svoje
  ljude”, to je nova odluka i novi paket.

## CI

Run **`45492790864`** (commit `60f6258`) — **success iz prvog pokušaja**, svi jobovi zeleni (*Backend build + test*,
*Backend PostgreSQL + Redis integration*, *Frontend build + test*, *Docs guard*, *Backend container + supply chain*,
*CI gate*); E2E jobovi skipped jer paket nema E2E scenarij. Za razliku od W2.9, wiring manifest je regenerisan **prije**
prvog pusha (`npm run wiring:write`: users i security rute sada prijavljuju `OuAccessGuard`), pa posao nije pao.

## Registar nalaza

- Zatvoreno: `BA-users-01`.
- Ostaje otvoreno iz istog modula: `-02`, `-03`, `-06`, `-07`, `-08`, `-09`.
