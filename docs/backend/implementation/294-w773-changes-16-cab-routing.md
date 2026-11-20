# W7.73 — `BA-changes-16`: promjena ide u CAB tijelo svoje jedinice, bez pogađanja

**Paket:** Val 7, audit 24 / `changes` — CAB routing politika<br>
**Nalaz:** `BA-changes-16` (P2) — „Default CAB je alfabetički prvi group, bez OU/service routing politike”<br>
**Kodni commit:** `d5379ac` · **CI:** [44756240551](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44756240551)<br>
**DB migracija:** **nema** — routing koristi postojeću vezu `Group.organizationalUnitId`

## Šta je nalaz tvrdio

Audit 24 §10: „Default CAB bira alfabetički prvi CAB group kada input izostane. U multi-CAB instalaciji to
može tiho poslati change pogrešnom tijelu. Treba eksplicitna konfiguracija po OU/service ili obavezan izbor.”

Nalaz je bio tačan na **dva** mjesta, ne jednom:

| Sloj | Prije |
| --- | --- |
| server | `findFirst({ isCabGroup: true }, orderBy: { name: 'asc' })` — prvi po abecedi |
| forma | `setCabGroupId(change?.cabGroup?.id ?? options.cabGroups[0]?.id ?? "")` — isti slučaj, jedan sloj više, i to kao **eksplicitan** izbor |

Drugi sloj je gori: forma je poslala `cabGroupId` prvog po abecedi kao da ga je korisnik odabrao, pa se u
auditu nije moglo razlikovati „tražilac je odabrao” od „nešto je odabralo umjesto njega”. `<select>` uz to
nije imao praznu opciju, pa je i prazno stanje izgledalo kao da je prva grupa odabrana.

## Šta je urađeno

**1. Pravilo routinga (`change-cab-routing.ts`)** — odlučuje bez pogađanja:

| Situacija | Ishod |
| --- | --- |
| `cabGroupId` je poslan | `explicit` — grupa se ne dira (i može biti izvan jedinice, npr. centralni CAB) |
| jedinica promjene ima **tačno jednu** CAB grupu | `single-covering` — ta grupa |
| najbliži predak jedinice ima **tačno jednu** CAB grupu | `single-covering` — ta grupa (najbliži nivo pobjeđuje) |
| nivo ima **više** CAB grupa | **409 `CHANGE_CAB_GROUP_REQUIRED`** — tražilac mora odabrati |
| lanac jedinice nema nijednu, instalacija ima **tačno jednu** | `single-installation` — ta grupa |
| lanac nema nijednu, instalacija ima **više** | **409 `CHANGE_CAB_GROUP_REQUIRED`** |
| instalacija nema nijednu CAB grupu | **409 `CHANGE_CAB_GROUP_REQUIRED`** |

Nema više `orderBy: name`. LANAC je jedinica promjene i njeni preci (`/Skupina/Regija/Site` →
`/Skupina/Regija` → `/Skupina`), što je **eksplicitna konfiguracija po OU** iz podataka koji već postoje:
`Group.organizationalUnitId` je obavezan, pa CAB grupa već pripada jedinici. Zato paket ne traži migraciju ni
novo polje. Routing po **servisu** nije uveden: to bi bio nov ugovor (i migracija) koji ovaj nalaz ne traži, a
uvođenje „po servisu” bez podataka značilo bi opet pogađanje.

**2. Servis (`changes.service.ts`)**

- `create`: STANDARD ostaje bez CAB grupe; NORMAL/EMERGENCY prolazi kroz resolver. Upit ide nivo po nivo i
  staje na prvom nivou koji odlučuje, pa je broj upita ograničen dubinom OU stabla, a ne brojem CAB grupa.
- `update`: brisanje CAB grupe (`cabGroupId: null`) na non-STANDARD promjeni je odbijeno istim kodom. Prije
  toga je takva promjena ostajala bez tijela koje odobrava, a sljedeća autorizacija bi pala na
  `CHANGE_NO_APPROVERS` — dakle nedostižna promjena bez ikakvog signala u trenutku brisanja.
- `options`: svaka CAB grupa nosi `organizationalUnitId` i `organizationalUnitPath`, da forma može ponuditi
  tačno one grupe koje bi server prihvatio.

**3. Dokazivost (`change.created`, schema v2)**

Audit zapis kreiranja nosi `cabGroupId` i `cabRouting` (`explicit` | `single-covering` |
`single-installation`). Time se iz audit loga vidi **zašto** je promjena otišla u to tijelo, bez čitanja koda i
bez nagađanja iz vremena nastanka. Allowlist je proširen na `['cabGroupId', 'cabRouting',
'organizationalUnitId', 'risk', 'sequence', 'type']`, verzija 2, i oba registra (schema + compatibility) nose
istu verziju; `bumpedSchemaVersions` u specu je ažuriran namjerno, da tiha promjena ugovora padne test.

**4. Frontend**

- `cab-group-candidates.ts` preslikava isto pravilo (najbliži nivo, jedinstven izbor ⇒ predizbor), a
  `useChangeCabGroup` drži stanje: `prefill` pri otvaranju, `applyUnitMove` pri promjeni jedinice (zadržava
  odabir samo ako još pripada novoj jedinici).
- Picker uvijek ima praznu opciju (`changes.form.cabGroupPlaceholder`); predizbor se dešava **samo** kad je
  routing nedvosmislen. Kad nije, polje je vidljivo prazno, ima `*`, hint
  `changes.form.cabGroupRequiredHint`, a snimanje je blokirano dok tražilac ne odabere.
- Nova greška `CHANGE_CAB_GROUP_REQUIRED` mapira se na `changes.errors.cabGroupRequired` (bs/en).
- Pad snimanja se sada oglašava i **danger toastom**, ne samo linijom na dnu dugačke forme.
- `change-form-sheet.tsx` ostaje na granici od 500 linija (module-size gate): routing hook, builder tijela
  zahtjeva (`change-form-body.ts`) i pomoćnici za jedinice/prozor su izdvojeni u `lib/changes`.

## Dokazi

- Backend: `change-cab-routing.spec.ts` (8 testova: lanac, najbliži nivo, više grupa na nivou, fallback na
  jedinu u instalaciji, bez CAB grupe) i `changes-cab-routing.spec.ts` (7 testova kroz stvarni `create`:
  routing + `cabRouting` u audit metadata, „najbliži predak pobjeđuje abecedu”, 409 bez upisa u bazu,
  eksplicitan izbor se ne re-routa, STANDARD bez CAB grupe). Ciljano: `changes`, `audit-log`, `groups`,
  `authorization` — **84 suite / 422 testa** zeleno; `eslint` čist.
- Frontend: `cab-group-candidates.spec.ts` (7), `change-form-cab-routing.spec.tsx` (3 — predizbor jedine
  grupe jedinice i slanje tog id-a; prazan picker i blokirano snimanje kad jedinica ima više grupa; sve grupe
  kad lanac nema nijednu), `change-form-body.spec.ts` (5). Cijeli vitest **469 fajlova / 1868 testova**;
  `tsc -b`, `build`, `bundle:check`, `format:check`, `module-size` zeleni.
- Nema migracije, nema promjene ruta, nema nove zavisnosti.

## Šta ostaje netaknuto

- Postojeći klijenti koji šalju `cabGroupId` (E2E helper, spec 30) ponašaju se isto — njihov izbor je
  `explicit` i resolver se ne poziva.
- Instalacije sa jednom CAB grupom ne primjećuju promjenu: routing je i dalje jednoznačan (`single-covering`
  ili `single-installation`).
- Sljedeći P2 u ovom auditu je `BA-changes-17` (privacy/retention replike); P3 su 18–20.
