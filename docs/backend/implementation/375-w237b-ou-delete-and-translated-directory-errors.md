# 375 — W2.37b: brisanje OU ne zavisi od kataloga, a backend greške se prevode

**Paket:** `W2.37b` (runtime/UX bug uz `W2.36c`, nije BA nalaz) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** organizational-units + directory-sync · **Povezano:** `W2.36c` (kreiranje), `W2.36` (tree oblik), `BA-organizational-units-07` (W2.37, DN ugovor)
**DB migracije:** ne · **API:** `DELETE /organizational-units/:id` sada u istoj transakciji uklanja i kataloški zapis; `409` blokade dobijaju tri nova tipa (`directoryChildren`, `directoryUsers`, `directoryGroups`)

## 1. Prijava

Nakon W2.36c operater je u **Imenik korisnika → Org. jedinice**:

1. dodao **Ogranak** — prošlo,
2. dodao **Poslovnicu** — prošlo,
3. pokušao **obrisati** pogrešno dodanu Poslovnicu → *„Ova OU nije u manual-only katalogu"*,
4. pokušao **Pokreni ručno očitavanje** → *„Directory read is disabled"* — **na engleskom u bosanskom UI-u**.

## 2. Šta je stvarno bilo

### 2.1 Brisanje je tražilo katalog kao uslov

`handleDelete` je prije ijednog zahtjeva zvao `resolveCatalogEntry(node)` (`matchCatalogEntry`). Ako se red ne
nađe, ekran ispiše „nije u katalogu" i **ne pošalje ništa**. Time je stablo — koje je autoritet — zavisilo od
toga da li mu mirror red postoji, pa je brisanje svježe kreirane jedinice moglo pasti bez ijednog zahtjeva.
Suprotna strana istog defekta: **brisanje kroz OJ rutu nije čistilo katalog**, pa je mirror red ostajao, jedinica
se i dalje nudila kao parent, a ponovno kreiranje iste putanje padalo je na `DUPLICATE_PATH`.

### 2.2 Ekran je renderovao backendovu rečenicu

`DirectorySyncCard` je radio `error instanceof ApiError ? error.message : t(...)`, tj. prikazivao **engleski**
tekst iz `map-directory-sync-error.ts`. Frontend je već imao `directorySyncErrorKey()` i oba prevoda — ali ništa
nije tjeralo karticu da ih koristi. Isti obrazac je bio i u `useManualDirectoryCatalogActions.handleSaved`
(neuspjela materijalizacija) i u `asset-directory-sync-card`.

**Zašto automatske provjere nisu uhvatile:** guard `check-ticket-translation-keys` pokriva samo ključeve tiketa,
`i18n:check` provjerava da postojeći `t()` ključevi imaju prijevod — ali nijedan nije provjeravao da **kod iz
backenda** uopšte ima frontend ključ. Dokaz da je rupa bila stvarna: kod `INVALID_SCOPE` (upravo onaj iz W2.36c)
**nije bio** u `KNOWN_CODES` i **nije imao** prijevod ni u `bs` ni u `en`, pa je i ta greška izlazila na engleskom.

### 2.3 „Pokreni ručno očitavanje" u ručnom režimu

`private.auth.adRead.enabled` je `false` po defaultu (svjesno: „nikad implicitno čitanje direktorija"), a u
instalaciji koju je operater pregledao nije bio uključen. U režimu **Ručni katalog** to znači da dugme uvijek
padne. Backend gate **ostaje** (to je sigurnosna odluka, ne bug): promijenjeno je da poruka bude prevedena i da
**imenuje postavku** koju treba uključiti, umjesto engleske rečenice bez puta do rješenja.

## 3. Korekcija

| Mjesto | Prije | Poslije |
| --- | --- | --- |
| brisanje u UI-u | katalog (`DELETE …/manual-catalog/:externalId`) + lokalna provjera podudaranja | `DELETE /organizational-units/:id` — stablo je autoritet, nema lokalnog uslova |
| backend brisanje | OJ red + audit | OJ red, **kataloški mirror red** (ista putanja, podgrana ili DN) i **oba audita** u jednoj transakciji |
| preflight brisanja | 15 brojača | + `directoryChildren`, `directoryUsers`, `directoryGroups` (katalog pod istom putanjom) |
| `DirectorySyncCard` | `ApiError.message` | `t(directorySyncErrorKey(error))` + hint za isključeno čitanje |
| `handleSaved` (materijalizacija) | `ApiError.message` | `t(directorySyncErrorKey(error))` |
| `asset-directory-sync-card` | `(${caught.message})` | `(${t(directorySyncErrorKey(caught))})` |
| `KNOWN_CODES` | 14 kodova | + `INVALID_SCOPE` (jedini backend kod bez ključa) |

Katalog nije ukinut: on ostaje **izvor** za `manual_catalog` čitanje i za izmjenu/pomjeranje (to je `W2.36d`).
Razlika je što brisanje više ne traži da mirror postoji — ako postoji, briše se s njim; ako ne postoji, nema šta
ni ostati.

## 4. Novi guard: `scripts/check-api-error-i18n.mjs`

Dvije provjere, obje u frontend CI jobu:

1. **Pokrivenost** — svaki `DirectorySyncErrorCode` iz `backend/src/modules/directory-sync/directory-sync.error.ts`
   mora postojati u `KNOWN_CODES` i imati `directory.ldaps.errors.<CODE>` u **bs** i **en** (plus `…unknown`).
   Dodavanje backend koda bez prijevoda sada pada na CI-u, a ne u ekranu.
2. **Upotreba** — u `components/organizational-units`, `lib/directory` i `components/assets` nije dozvoljeno čitanje
   `.message` sa uhvaćene API greške. Jedna iznimka je eksplicitno navedena (`asset-transfer-settings-card`, detalj
   validacije šablona) i **guard pada ako iznimka prestane da postoji**, pa se lista ne može zacementirati.

Test `scripts/check-api-error-i18n.test.mjs` (**6**) pokriva: čist slučaj, backend kod bez frontend ključa,
nedostajući prijevod u jednom jeziku, sirovu poruku u površini i zastarjelu iznimku.

## 5. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `delete-organizational-unit.mirror.spec.ts` **4** | mirror red se briše i auditira kao kataloška promjena; jedinica bez mirrora se briše bez kataloškog audita; kataloško dijete pod putanjom daje `HAS_CHILDREN` + `directoryChildren`; mapirani katalog korisnici daju `HAS_MAPPED_USERS` + `directoryUsers` |
| `use-manual-directory-catalog-actions.spec.tsx` **3** | brisanje ide na OJ rutu **i kad katalog nema red**; upozorenje o uklonjenim dodjelama; blokade se prikazuju iz `details.blockers`, nikad kao backendova rečenica |
| `check-api-error-i18n.test.mjs` **6** | guard sam (vidi §4) |
| `organizational-units|directory-sync` (backend) **44 suite / 226 testa** | nema regresije u brisanju, hijerarhiji i katalogu |

Lokalno: frontend `tsc -b`, `eslint`, `prettier`, `vitest` (directory + OU + assets + pages **67**), `i18n:check`
(4.760 statičkih ključeva, 90 dinamičkih prefiksa), `check-api-error-i18n` zeleni; backend `nest build` i `eslint`
čisti.

## 6. Otvoreno i dokumentovano

- **Izmjena/pomjeranje OU** i dalje ide kroz katalog (`PATCH …/:externalId`) — ista klasa rizika kao staro
  kreiranje; kandidat `W2.36d`.
- **`asset-transfer-settings-card`** prikazuje tehnički detalj validacije šablona; prelazak na kodove je zaseban
  posao i eksplicitno je izuzet od guarda.
- **`private.auth.adRead.enabled`** ostaje isključen po defaultu; u ručnom režimu bez njega nema očitavanja.
  Poruka sada imenuje postavku — ali odluka da se prekidač sam uključi nije donesena (mijenja sigurnosni default).
- Ostale površine koje još čitaju `ApiError.message` (npr. `add-user-form`, `change-password-form`) nisu dio ovog
  paketa; guard ih ne pokriva i to je sljedeći logičan korak ako se pokaže isti simptom.
