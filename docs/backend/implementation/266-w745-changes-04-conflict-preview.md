# Package closeout — W7.45

**Paket:** W7.45 — conflict preview scope-uje reference i ne imenuje nedostupne konflikte<br>
**Nalaz:** `BA-changes-04` (P1) — **zatvoren**<br>
**Kodni commit:** `6d3b701`<br>
**Finalni testani SHA:** `6d3b701`<br>
**CI:** [`44404252202`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44404252202) — zelen (13m39s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `24-changes.md` §5 (prvi pasus) i §19 točka 3: `POST /changes/conflicts/preview` tražio je samo
`change.read`, primao **proizvoljne** `serviceIds`, `assetIds` i `changeId`, a `conflictsFor` je globalno
učitavao aktivne changeove i `describe` vraćao **ID, broj, naslov, status, planirani prozor, zajedničke
servise i asset count** svakog kandidata. Scoped reader je probingom mogao enumerisati tuđi operativni
raspored.

Acceptance: (1) kandidati se scope-filteruju prema `changeVisibilityWhere` čitaoca, (2) nedostupan konflikt se
**ne imenuje** nego svodi na broj (audit dozvoljava „count/window“), (3) nedostupan konflikt i dalje mora
spriječiti tihi prolaz acknowledgementa, (4) tražene reference ne smiju biti oracle (`assetIds` kroz
`asset.read` scope, `changeId` samo ako je čitljiv), (5) zelen CI gate.

## Implementacija

- **`describe(conflicts, configuration, audience?)`** — uz `{ scope, userId }` prvo rješava skup čitljivih
  ID-eva (`readableChangeIds`: `findMany({ AND: [changeVisibilityWhere(...), { id: { in } }] })`), pa:
  dostupni changeovi zadržavaju puni opis (broj, naslov, status, prozor, zajednički servisi, `sharedAssetCount`),
  a nedostupni ulaze samo u `restricted.changes`. Downtime prozor je vidljiv kad nema vlasnika
  (`changeRequestId === null`) ili kad vlasnički change je čitljiv; inače ide u `restricted.downtime`.
  Za viewera bez OU granice `readableChangeIds` vraća `null` i **ne izdaje nijedan dodatni upit**.
- **`hasWarnings`** sada uključuje i `restricted.changes + restricted.downtime`, pa je skriveni konflikt i
  dalje upozorenje (acknowledgement gate u `act` ionako koristi sirovi `ChangeConflicts`, ne projekciju — to
  je namjerno i nepromijenjeno).
- **`preview`** scope-uje ulaz prije enginea: `readableAssetIds` filtrira `assetIds` kroz `asset.read` scope
  (reuse `assets/asset-link-access.ts` iz W7.43 — tuđi asset ID se odbacuje, ne potvrđuje), a `changeId` se
  poštuje za izuzimanje **samo** ako ga viewer smije čitati (`canReadChange`); inače se tretira kao `null`, da
  se stvarni konflikt ne bi sakrio tuđim ID-em. `serviceIds` ostaju kako su bili — servisi su globalni
  katalog bez OU scopea.
- **`GET /changes/:id/conflicts`** (`ChangesService.conflicts`) prosljeđuje istu publiku i vraća isto
  `restricted` polje; rani izlaz za change bez prozora sada vraća `restricted: { changes: 0, downtime: 0 }`
  (stabilan oblik odgovora).
- **Frontend:** `ChangeConflicts` tip dobija **opcionalno** `restricted` (stariji server ga ne šalje), a
  `ChangeConflictsList` prikazuje dva broja bez imena („Još N preklapajućih promjena je izvan vašeg opsega“,
  bs/en, plural `_one/_few/_other`, odnosno `_one/_other`) i **ne** prikazuje „nema konflikata“ kad postoje
  skriveni. Bez novih ruta ili UI stanja.
- **Nije promijenjeno:** `conflictsFor` engine i njegov `take: 200` (hard limit je zasebna P3 stavka,
  `BA-changes-18`), freeze logika, calendar (`BA-changes-05`, sljedeći P1) i lifecycle pravila.

## Direktni testni dokaz

`backend/src/modules/changes/changes-conflict-preview.spec.ts` (5 testova, pravi `ChangeScheduleService`):

- dvije preklapajuće promjene, čitalac vidi jednu ⇒ `changes` ima samo svoju, `restricted = { changes: 1,
  downtime: 0 }`, `hasWarnings: true`, a serijalizovani odgovor **ne sadrži** naslov tuđe promjene; upit
  vidljivosti nosi isti `changeVisibilityWhere` predikat (OU + requester/owner/CAB) i `id in [...]`.
- viewer bez OU granice ⇒ oba konflikta opisana, `restricted = 0/0`, i **nijedan** dodatni upit za skup
  čitljivih ID-eva.
- downtime: prozor bez vlasnika ostaje vidljiv, prozor tuđeg changea se sakriva i broji (`downtime: 1`).
- `assetIds: ['asset-foreign']` ⇒ upit nosi `AND[assetLinkWhere, id in]`, tuđi asset se odbacuje i kandidati
  se traže samo po servisu.
- `changeId` tuđeg changea (viewer ga ne čita) ⇒ **nije** izuzet iz kandidata (`restricted.changes = 1`), tj.
  ne može se koristiti za skrivanje stvarnog konflikta.

Frontend: `change-conflicts-list.spec.tsx` (4 testa) — prazno stanje, imenovan dostupan konflikt, brojanje
skrivenih bez imena i tolerancija na odgovor bez `restricted`.

## CI i testni dokaz

CI run [`44404252202`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44404252202) na `6d3b701`:

- **Backend:** generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest (uključujući novi
  `changes-conflict-preview.spec.ts`) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes` suiteovi — uspješno.
- **Frontend:** lint, format (Prettier), testovi (uključujući novi `change-conflicts-list.spec.tsx`, i18n i
  module-size gate), build i bundle budget — uspješno.
- **Docs guard / container / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.

**Neuspjeli pokušaji:** nema — prvi run je zelen.

Dodatne lokalne provjere i ograničenja: `changes` backend suite **10 suiteova / 55 testova** (prije commita),
`npx eslint` čist; frontend `prettier --check`, `eslint`, `vitest src/i18n src/lib/changes src/components/changes`
(13 fajlova / 68 testova) i `module-size` (115 linija u komponenti) prolaze. Cijeli backend unit run ostaje na
poznatom sandbox baselineu (Prisma stub artefakti, bez novih padova).

## Registar nalaza

- Zatvoreni: `BA-changes-04` (P1).
- Ostaju otvoreni u `24-changes.md`: 16 nalaza (P1: `05`, `06`, `07`).
- Kontrolni zbir: plan **431 otvoreno / 265 zatvoreno / 696**; Val 7 **67 otvoreno / 44 zatvoreno / 111**
  (P1 10 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **441 / 255 / 696**.

## Migracija, rollout i rollback

Nema migracije. API se **suzuje**: preview/detail više ne vraćaju tuđe konflikte imenom, nego brojem; odgovor
dobija `restricted` polje (frontend ga tretira kao opcionalno, pa stariji klijenti ne pucaju). Klijent koji je
računao `changes.length` kao „ima konflikata“ mora uzeti i `restricted` — frontend to radi
(`hasWarnings` sada uključuje skrivene). Rollback: revert `6d3b701`; podataka nema za vraćanje.

## Sljedeći paket

**W7.46 — `BA-changes-05` (P1):** calendar vraća globalne downtime prozore (service, message,
`changeRequestId`) bez viewer scopea — isti filter primijeniti na `/changes/calendar` downtime listu. Nije
započet prije zelenog gatea za ovaj paket.
