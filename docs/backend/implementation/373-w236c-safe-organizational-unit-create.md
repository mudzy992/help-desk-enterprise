# 373 — W2.36c: dodavanje OU je jednoznačno i atomsko (nema „sačuvano, čeka očitavanje")

**Paket:** `W2.36c` (runtime bug + UX, uz `W2.36`) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** organizational-units / directory-sync owner · **Povezano:** `W2.36` (tree shape), `W2.35b` (audit scope), `W2.9` (scope)
**DB migracije:** ne · **API:** novo `POST /directory-sync/manual-catalog/organizational-units/from-tree`; `POST /directory-sync/read` u režimu `manual_catalog` prima i scope izvan AD baznog DN-a

## 1. Prijava i stanje instalacije

SuperAdmin je u **Imenik korisnika → Org. jedinice** dodao ogranak ispod korijena i dobio:

> „Sačuvano u katalogu — pokreće se očitavanje da se pojavi u stablu…"

Ogranak se **nikad nije pojavio**, ali je bio ponuđen kao **parent** u formi, a **Pokreni ručno očitavanje** je
vraćalo `400 INVALID_SCOPE: Directory read scope is invalid or unrestricted`.

Stanje iz baze (korisnikov SQL):

```sql
SELECT "ouPath", "distinguishedName" FROM "OrganizationalUnit";
-- /Korisnici | OU=Korisnici,DC=local
```

Dakle: stablo je u `DC=local`, a katalog (i bazni DN-ovi) su u `DC=example,DC=com` iz `seed-database.ts`.

## 2. Četiri uzroka, jedan lanac

| # | Uzrok | Posljedica |
| --- | --- | --- |
| 1 | Forma je **klijentu tražila `distinguishedName`** i `parentExternalId` iz **kataloga** | moglo se upisati ime pod parentom kojeg stablo nema — DN koji nijedno čitanje ne prihvata |
| 2 | Katalog i stablo su **dva imenska prostora** (`example.com` vs `DC=local`) | i ispravno ime daje DN izvan baznog DN-a |
| 3 | `parseDirectoryReadScope` je **AD pravila** (`OU` obavezan, nikad forest root, scope ⊆ bazni DN) primjenjivao i na `manual_catalog`, gdje nema LDAP-a | svako čitanje `400 INVALID_SCOPE`, pa ni jedinica nikad ne nastane |
| 4 | Neuspjeh materijalizacije se vezao na **`unit.externalId`**, a stablo crta greške po **`node.id`** | greška se **nigdje** nije prikazala; hint „pokreće se očitavanje" je ostajao zauvijek |

Zajedno: red u katalogu (vidljiv kao parent) bez reda u stablu, i tišina umjesto greške.

## 3. Korekcija

### 3.1 Nova, sigurna putanja kreiranja

`POST /directory-sync/manual-catalog/organizational-units/from-tree` prima **samo**:

```json
{ "displayName": "Prodaja", "parentOrganizationalUnitId": "<tree id | null>", "type": "BRANCH" }
```

`distinguishedName` i `parentExternalId` **nisu** polja DTO-a; globalni `forbidNonWhitelisted` pipe odbija tijelo
koje ih pošalje. Server (`create-organizational-unit-from-tree.ts`) u **jednoj transakciji**:

1. normalizuje naziv i odbija `INVALID_NAME` sa `details.reason` (`empty` / `too_long` / `forbidden_character`);
2. učitava parent **iz stabla** (`PARENT_NOT_FOUND` ako ga nema);
3. izvodi `ouPath` i DN (`OU=<naziv>,<parent DN>`; za korijen `OU=<naziv>,<namespace stabla>`), gdje namespace
   dolazi iz **stvarnog stabla**, ne iz seeda; ako stablo nema nijednu jedinicu → `DIRECTORY_NAMESPACE_UNKNOWN`;
4. odbija duplikat (`DUPLICATE_PATH` / `DUPLICATE_DISTINGUISHED_NAME`) **prije** ijednog upisa, sa values koje se
   sudarile u `details`;
5. **usvaja** parent (i pretke) u katalog ako tamo još nisu — katalog tako prestaje biti paralelni svijet;
6. upisuje OU red + njegov OU-scoped audit, pa katalog red + katalog audit, i bumpuje reviziju kataloga.

Rezultat: nema stanja „sačuvano u katalogu, čeka očitavanje" — ili su oba reda tu, ili nijedan.

### 3.2 Forma ne može biti popunjena pogrešno

| Polje | Prije | Poslije |
| --- | --- | --- |
| Parent | lista **kataloga** | lista **stabla** (`/Korisnici`, `/Korisnici/Direkcija`, …) + „bez nadređene" |
| DN | read-only, ali izveden iz kataloškog parenta | read-only, izveden iz **stabla**; prikazuje tačno ono što server upisuje |
| Naziv | provjera tek na serveru | provjera dok kucate (`empty`, `too_long`, `forbidden_character`, `duplicate_path`), `aria-invalid` + poruka |
| Sačuvaj | aktivan za neispravan unos | **zatvoren** dok unos nije ispravan |

Klijentska pravila su **ogledalo** servera (`validate-organizational-unit-name.ts` ↔ `normalize-manual-organizational-unit-name.ts`);
server ostaje jedini autoritet.

### 3.3 Manual-only čitanje više ne mjeri AD baznim DN-om

`parseDirectoryReadScope` dobija `mode: 'ldaps' | 'manual_catalog'` (default `ldaps`, ponašanje nepromijenjeno).
U `manual_catalog` režimu: forest-root scope je dozvoljen, scope se ne mora nalaziti unutar AD baznog DN-a, a
čitanje cijelog kataloga je izraživo. `DirectorySyncService` prosljeđuje `configuration.source`. Obrazloženje:
manual read je `SELECT` nad redovima koje isti SuperAdmin već vidi kroz `GET …/manual-catalog`, pa AD pravilo tu
nije štitilo ništa — samo je blokiralo rad. LDAPS režim zadržava RAW §466 pravila (test to pinuje).

### 3.4 Seed više ne izmišlja `example.com` kad stablo postoji

`seedManualDirectoryCatalog` prvo gleda stablo: ako ima jedinica, **ogleda ih** u katalog (rekurzivno, sa
`parentExternalId` lancima) i postavlja `private.auth.adRead.usersBaseDn` na korijen stabla; uzorke
(`OU=Users,DC=example,DC=com`…) upisuje samo u praznu instalaciju. Postojeći katalog i postojeće postavke se
**nikad ne prepisuju**.

### 3.5 Greška se vidi

`useManualDirectoryCatalogActions` dobija `catalogError` (poruka **iznad stabla**) pored greške po redu; hint se
gasi kad očitavanje padne. Nova putanja greške prikazuje **u formi**, sa `details` (npr. putanja koja se sudarila).

## 4. Odbijene alternative

- **Samo popraviti poruku** (prikazati `INVALID_SCOPE` umjesto tišine): operator bi i dalje bio blokiran — red u
  katalogu bez reda u stablu ostaje, a DN se i dalje ne može popraviti iz UI-a.
- **Pustiti da klijent i dalje šalje DN**: to je upravo mehanizam kojim je greška nastala.
- **Materijalizacija kroz čitanje nakon commita** (kao prije, ali sa boljom porukom): ostaje prozor u kojem katalog
  ima red a stablo ne; atomski upis ga uklanja po konstrukciji.
- **Dozvoliti `DC=` goli bazni DN i u LDAPS režimu**: to je RAW §466 zabrana (cijela šuma), nije dirano.

## 5. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `create-organizational-unit-from-tree.spec.ts` **7** | DN izveden iz tree parenta; korijen u namespaceu stabla; odbijanje `forbidden_character` (bez upisa); `PARENT_NOT_FOUND`; duplikat putanje bez upisa; `DIRECTORY_NAMESPACE_UNKNOWN`; stale katalog red → `DUPLICATE_PATH` sa oba DN-a; **jedna** transakcija, **dva** audit reda |
| `parse-directory-read-scope.spec.ts` +**5** | manual: `OU=Prodaja,OU=Korisnici,DC=local` i `DC=local` prolaze, čitav katalog prolazi, malformisani DN pada; LDAPS: `DC=local` i dalje pada |
| `seed-manual-directory-catalog.spec.ts` **3** | katalog ogleda stablo (`/Korisnici` → `/Korisnici/Prodaja`, parent lanac), bazni DN iz stabla, uzorci samo u praznoj instalaciji, postojeće se ne prepisuje |
| `organizational-unit-tree-create-form.spec.tsx` **7** | parent lista = stablo; DN preview iz parenta i iz namespacea; zabranjeni znak i dupla putanja blokiraju `Sačuvaj`; POST nosi **tačno** `displayName`/`parentOrganizationalUnitId`/`type`; 409 duplikat i `DIRECTORY_NAMESPACE_UNKNOWN` imaju svoje poruke |

Lokalno: backend `directory-sync/|organizational-units/|audit` **74 suite / 390 testa**; frontend
`organizational-units` + `lib/directory` + `pages` **21 fajl / 64 testa**, `npx tsc -b`, `eslint`, `prettier`
čisti; `i18n:check` 9.424 ključa (bs/en parity), `check-docs-content` OK (32 stranice, 8 prevoda).

## 6. Otvoreno i dokumentovano

- **Izmjena/pomjeranje** OU i dalje ide kroz katalog (`PATCH …/:externalId` sa `parentExternalId`), pa nosi istu
  klasu rizika kao staro kreiranje; kandidat za `W2.36d` (isti obrazac: tree parent + serverski DN).
- Instalacije koje već imaju **stale katalog red** na istoj putanji dobijaju `DUPLICATE_PATH` sa oba DN-a i moraju
  prvo obrisati taj red (brisanje postoji); automatsko „čišćenje" bi pisalo po tuđim redovima.
- `private.auth.adRead.usersBaseDn/groupsBaseDn` nisu uredivi iz UI-a. U manual režimu više ne odlučuju o
  čitanju; ako se uvede LDAPS, i dalje se postavljaju kroz `AppSetting`/install.
- `Pokreni ručno očitavanje` i dalje materijalizuje **sve korijene kataloga** — u instalaciji koja je naslijedila
  seed uzorke to znači da će se pojaviti i `Users`/`Groups` grane; seed popravka sprečava nove, ne prepisuje stare.
