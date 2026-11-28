# 372 — W2.36b: SuperAdmin matrica permisija je zaključana **i to sada kaže**

**Paket:** `W2.36b` (runtime/UX bug uz W2.36) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** rbac / authorization owner · **Povezano:** `W2.36` (tree shape), `W2.9` (scope filter), `BA-rbac-01`–`08` (matrica i preview)
**DB migracije:** ne · **API promjena:** `PUT /roles/SUPER_ADMIN/permissions` sada `409 SYSTEM_ROLE_PERMISSIONS_IMMUTABLE` (bilo `403`)

## 1. Prijava i premisa

Korisnik (lokalni SuperAdmin, sve role) pokušao je kroz **Administracija → Permisije** dodijeliti SuperAdmin roli
permisiju koja se u matrici prikazivala kao isključena (konkretno `organizationalUnit.manage`) i dobio:

> „Nemate dozvolu za upravljanje permisijama uloga."

Poruka je `permissions.errorForbidden` iz `frontend/src/i18n/locales/bs/common.json`, a `mapRbacError` je prikazuje
za **svaki** 403 ili `FORBIDDEN` — dakle server je odbio upis na autentifikovan i ovlašten račun.

| Tvrdnja | Stanje prije W2.36b |
| --- | --- |
| SuperAdmin smije otvoriti ekran i pregled uticaja | **tačno** — ekran i `POST .../preview` prolaze |
| SuperAdmin smije spremiti matricu **SuperAdmin role** | **ne** — `replaceRolePermissions` baca `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE` unutar transakcije, prije ijednog upisa |
| Taj kod ima svoj HTTP status i svoju poruku | **ne** — `mapRbacError` nema granu, pa pada na `ForbiddenException` ⇒ **403 FORBIDDEN** |
| SuperAdmin pristup zavisi od te matrice | **ne** — evaluator vraća `SUPER_ADMIN_ALLOWED` (uz `isLocalOnly`) **prije** nego pogleda dodjele |
| Matrica u bazi je uvijek jednaka katalogu | **ne** — seed je upisao `allPermissionKeys` **u trenutku seedinga**; permisija dodana kasnije nema red |

Premisa nije zastarjela: zabrana uređivanja je namjerna (komentar u kodu: „Runtime SuperAdmin authority is
intentionally the full catalog. Letting this row be edited creates a deceptive matrix with no runtime effect"),
ali je **prijavljena kao greška ovlaštenja** — ekran je tvrdio jedno, sistem je mislio drugo.

## 2. Uzrok: tri sloja iste istine

1. **Runtime**: `evaluateAuthorizationAccess` prvo provjerava `context.isSuperAdmin → allow(SUPER_ADMIN_ALLOWED)`.
   Matrica `RolePermission` za `SUPER_ADMIN` ne učestvuje u odluci. Permisija koja se u matrici vidi isključeno
   **je** efektivna za SuperAdmin.
2. **Zapis**: `replaceRolePermissions` odbija izmjenu te matrice (`SYSTEM_ROLE_PERMISSIONS_IMMUTABLE`) jer bi
   proizvela prikaz bez dejstva.
3. **Prikaz**: `mapRbacError` nije imao granu za taj kod, pa je 409-situacija izašla kao **403**, a frontend ju je
   preveo u „nemate dozvolu" — poruku koja optužuje tačno onaj račun koji smije uređivati permisije.

Uz to je ekran crtao **stare redove** te role: permisija dodana u katalog poslije seedinga prikazivala se
isključeno, pa je izgledalo da SuperAdmine „nedostaje" pravo koje mu runtime uvijek daje.

## 3. Korekcija

### 3.1 Backend: odbijanje je konflikt, ne zabrana

`mapRbacError` sada mapira `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE` u `ConflictException` (**409**) sa istim kodom i
porukom koja objašnjava zašto (`SuperAdmin always holds the full catalog at runtime…`). Grana je dodata u isti
`if` blok kao preview-konflikti, tako da `PREVIEW_*` ponašanje ostaje netaknuto, a `FORBIDDEN` i dalje daje 403.

### 3.2 Frontend: ekran kaže istinu umjesto da nudi nemoguće snimanje

| Stanje | Prije | Poslije |
| --- | --- | --- |
| Izbor `SUPER_ADMIN` role | obična matrica, sve dostupno | traka „SuperAdmin matrica je nepromjenjiva" sa objašnjenjem |
| Prekidači | klikabilni | vidljivi, `disabled` |
| Dugme „Pregled uticaja" | aktivno | `disabled` |
| Prikazane oznake | redovi iz baze (mogu zaostati) | **cijeli katalog uključen** — runtime istina |
| Poruka za odbijeni upis | „Nemate dozvolu…" | `permissions.errorSystemRoleImmutable` |

Ostale role se ponašaju isto kao prije: `isSystemRole` je `selectedRoleKey === roleKeys.superAdmin`, pa nema
promjene u toku pregled → potvrda → snimanje.

### 3.3 i18n

Nova tri ključa u `permissions` namespace-u, bs i en: `errorSystemRoleImmutable`, `systemRoleImmutableTitle`,
`systemRoleImmutableBody`. Postojeći `errorForbidden` je netaknut (i dalje pokriva stvarni 403).

## 4. Odbijena alternativa

**Dozvoliti uređivanje matrice SuperAdmin role.** Odbijeno: matrica bi izgledala kao izvor prava, a evaluator je
preskače. Administrator bi „uklonio" pravo SuperAdminu i ono bi i dalje radilo — tiho, bez greške, sa revizijskim
tragom koji tvrdi suprotno. Jedina poštena varijanta bila bi **ukloniti bypass** i pustiti matricu da vlada, ali to
mijenja sigurnosni model (SuperAdmin bi mogao ostati bez pristupa administraciji) i traži sopstveni paket sa
invarijantom dostupnosti. Do tada: matrica je zaključana i **to piše na ekranu**.

## 5. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `backend/src/modules/rbac/roles.service.super-admin-matrix.spec.ts` **2** | pravi `PUT` kroz `RolesService.replace` sa potpisanim preview tokenom ⇒ `ConflictException` (409, `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE`), **nije** `ForbiddenException`; nema `rolePermission.deleteMany`, nema `auditLog.create`, nema fence-a; `FORBIDDEN` i dalje 403 |
| `frontend/src/lib/rbac/map-rbac-error.spec.ts` **2** | kod ⇒ `permissions.errorSystemRoleImmutable`; stvarni 403 ⇒ `permissions.errorForbidden` |
| `frontend/src/components/rbac/permissions-panel.spec.tsx` (+**2**) | izbor SuperAdmin role ⇒ traka + oba prekidača `disabled` + dugme `disabled`, i prekidač je `aria-checked=true` iako je u bazi samo jedan red; obična rola ostaje uređiva |
| postojeći `roles.controller.guard.spec.ts`, `roles.service.spec.ts` | gate i tok pregled→snimanje nisu dirani |

Lokalno: backend `rbac/|authorization/` **36 suite / 199 testa** zeleno; frontend `src/components/rbac` + `src/lib/rbac`
**3 fajla / 8 testova**, `npx tsc -b` i `eslint`/`prettier` čisti.

## 6. Otvoreno i dokumentovano

- `listRoles().permissionCount` za `SUPER_ADMIN` i dalje broji **redove u bazi**, ne katalog; ekran to maskira
  (prikazuje pun katalog), ali API nosi star broj. Re-seed ili `allPermissionKeys` u tom polju traži odluku o
  semantici brojača — nije dirano ovdje.
- Matrica ostaje zaključana; eventualno ukidanje bypass-a je sopstveni paket (vidi §4).
- Poruka za `PREVIEW_*` kodove nije dirana; W2.36b dira samo kod koji je prije izlazio kao 403.
