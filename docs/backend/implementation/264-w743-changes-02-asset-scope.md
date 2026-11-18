# Package closeout — W7.43

**Paket:** W7.43 — CMDB veze na changeu poštuju `asset.read` i asset OU scope<br>
**Nalaz:** `BA-changes-02` (P1) — **zatvoren**<br>
**Kodni commit:** `e620ed2` (funkcionalnost), `9c05f29` (CI popravka tipova u specu)<br>
**Finalni testani SHA:** `9c05f29`<br>
**CI:** [`44397715817`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44397715817) — zelen (11m16s)<br>
**DB migracije:** nema (promjena je isključivo u autorizacijskom sloju i projekciji responsea)

## Nalaz i acceptance

Audit `24-changes.md` §4 i §19 točka 2: asset picker je tražio samo `change.request` + CMDB switch i pretraživao
**globalno** po tagu, nazivu i serijskom broju; `assertReferences` je za write provjeravao **samo postojanje**
(`asset.count({ id: { in } })`); `toDetail` je vraćao **sve** povezane assete bez obzira na `asset.read` i OU.
Posljedica: requester iz jedne OU mogao je enumerisati tuđe assete, povezati ih i u detailu dobiti njihov
ID/tag/naziv — modul je zaobilazio granicu CMDB-a koju problems modul već poštuje od W7.22.

Acceptance: (1) picker vraća samo assete za koje viewer ima `asset.read` u njihovoj OU, (2) write link odbija
tuđi/nedostupni asset **isto kao nepostojeći** (`CHANGE_ASSET_NOT_FOUND`, bez potvrde postojanja), (3) response
shape (detail i `assetCount` u listi) ne otkriva nedostupne assete, (4) `change.*` semantika i
`BA-changes-01` (assignment-derived scope) ostaju nepromijenjeni, (5) zelen CI gate.

## Implementacija

- **Jedno mjesto odluke — `assets/asset-link-access.ts` (novo).** `assetLinkAccess(prisma, userId)` vraća
  `{ allowed, where, scope }`: principal se učitava iz baze (`loadPrincipalContext`), viewer se gradi
  **`asset.` prefiksom** (ne `change.`), pa globalni `change.manage`/`CHANGE_MANAGER` assignment ne postaje
  globalni CMDB grant; nedostajući ili neaktivan principal i nedostatak `asset.read` fail-close. Scope je
  OU putanja assignmana uz fallback na home unit (`assetViewerFromContext` → `resolveAssetScope`).
  `where` je Prisma predikat (`null` = sve OU), a `scope` je isti rezultat za redove koji su već u memoriji
  (`assetLinkVisible`) — zato nema dvije istine o tome šta je vidljivo.
  - `problem-asset-access.ts` je prepisan na **tanki wrapper** iznad istog helpera; javni ugovor
    (`{ allowed, where }`, `assetWhereOf`, `allowed:false ⇒ where:null ⇒ noUnits`) je nepromijenjen, pa
    `BA-problems-03` dobija istu logiku bez ijedne izmjene ponašanja (problems suiteovi prolaze nepromijenjeni).
- **Picker (`searchAssets`).** `AND[assetLinkWhere(access), OR[tag/name/serial contains]]`; without
  `asset.read` → `{ items: [] }` bez ijednog CMDB upita. Filter i `take: 10` ostaju kakvi su bili; `OR` je
  u `AND` grani namjerno — raspršeni `id: { in: [] }` bi ga pregazio.
- **Write (`assertReferences`).** `asset.count` je sada `AND[assetLinkWhere(access), { id: { in } }]`, pa
  tuđi i izvan-scope ID daju `CHANGE_ASSET_NOT_FOUND` bez razlike u odnosu na nepostojeći; `cmdb_disabled`
  detalj je netaknut i provjerava se prije scopea.
- **Detail.** `detailSelect` za povezani asset sada nosi i `organizationalUnit.ouPath` (potreban za
  in-memory provjeru), a projekcija `visibleAssets()` vraća **samo** `{ id, assetTag, name }` — OU putanja
  nikad ne izlazi u response. `_count.assets` namjerno ostaje **globalni**, jer ga `changeFactsOf()` koristi
  kao `linkCount` u lifecycle pravilima (§6: `links` requirement); response `assetCount` zato ide kroz
  poseban parametar `toListItem(row, configuration, assetCount)` i prikazuje **vidljivi** broj.
- **Lista.** Za scoped viewera `visibleAssetCounts()` radi jedan `groupBy` po `changeId` nad
  `ChangeRequestAsset` sa `asset: assetLinkWhere(access)`; za globalnog viewera (`where === null`) vraća
  `null` i koristi se pohranjeni `_count` (nema dodatnog upita). Mapa se **pre-popunjava nulama** za svaki
  red: change bez vidljivog linka mora pisati 0, a ne pasti na ne-scopeovani pohranjeni broj (taj fail-open
  je nađen lokalnim testom i popravljen prije commita).
- **Reverse filter `?assetId=`.** Isti predikat: `assets: { some: { assetId, asset: assetLinkWhere(access) } }`
  — tuđi asset ID ne može postati oracle postojanja kroz listu changeova.
- **Update ne briše nevidljive linkove.** Pošto editor bez `asset.read` u OU-u povezanog asseta taj link
  nikad ne vidi, save bi ga tiho obrisao i u historiju upisao lažno uklanjanje. `removedAssets` se zato
  računa samo nad linkovima koje viewer vidi; skriveni linkovi ostaju netaknuti. Za viewera bez ograničenja
  ponašanje je identično starom (skup = svi linkovi).
- **Nije mijenjano:** `service.*` linkovi (audit §4 ih navodi kao installation-wide, ali u registru nemaju
  vlastiti ID — ostaje otvorena observacija, van ovog nalaza), problem link (`BA-changes-03`; `canReadProblem`
  je već primijenjen u kodu), conflict/calendar (`BA-changes-04`/`05`), CAB (`06`), reminder (`07`) i
  privacy/retention. Nema promjene `change.*` permissiona, ruta, DTO-a ni UI ugovora — frontend nije diran.

## Direktni testni dokaz

`backend/src/modules/changes/changes-asset-scope.spec.ts` (11 testova, svi kroz pravi `assetLinkAccess` uz
mockovan `loadPrincipalContext`, pa je dokazana i sama veza helpera):

- picker: bez `asset.read` → `{ items: [] }` i **nula** poziva `asset.findMany`; sa `asset.read` u `/inside`
  → `where.AND[0] = { organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] } }`,
  a `OR` pretraga ostaje u `AND[1]`.
- write: tuđi asset (`/outside`) → `CHANGE_ASSET_NOT_FOUND` uz scopeovan `count`; viewer bez `asset.read` →
  isti kod uz nemogući predikat `{ id: { in: [] } }`; asset u scopeu prolazi provjeru i stiže do transakcije.
- update: `assetIds: []` briše **samo** `asset-inside`, dok `asset-outside` link preživljava (`deleteMany`
  primio `{ assetId: { in: ['asset-inside'] } }`).
- detail: 2 linka, 1 u scopeu → `assets` ima jedan zapis, `assetCount = 1`, a serijalizovani response ne
  sadrži `/outside`; bez `asset.read` → `assets: []`, `assetCount = 0`.
- lista: scoped viewer → `[1, 0]` uz jedan `groupBy` (`asset: insideScope`, `changeId in [...]`); globalni
  viewer → pohranjeni `3` i **nema** `groupBy`; reverse `assetId` filter nosi scope u `AND`.
- problems: postojeći `problem-asset-access.spec.ts` i cijeli problems suite prolaze nepromijenjeni nakon
  prebacivanja na zajednički helper (46 suiteova / 348 testova za `changes` + `problems`).

## CI i testni dokaz

CI run [`44397715817`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44397715817) na `9c05f29`:

- **Backend:** generisani Prisma, wiring manifest (**99 controllera / 631 ruta**), build, lint, safety-net i
  pun Jest (uključujući novi `changes-asset-scope.spec.ts`) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes`/`problems` integracijski suiteovi — uspješno; nove
  migracije nema, pa harness nije mijenjan.
- **Frontend:** lint, format (Prettier), testovi (uključujući module-size gate), build i bundle budget —
  uspješno; frontend nije diran.
- **Docs guard / container / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard` — isti
  path-filter razlog kao u prethodnim paketima (workflow ih pokreće samo za odgovarajuće izmjene).

**Neuspjeli pokušaji (vlastita greška, popravljena prije zelenog gatea):**

1. [`44395282334`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44395282334) na `e620ed2` —
   `Backend build + test` **failure**, pa i `CI gate` failure: ts-jest u CI-ju type-checka specove, a novi
   spec je stubove deklarisao bez tipova argumenata i rezultata (`mockResolvedValueOnce` na `never`) i create
   fixture bez obaveznog `type`. Produkcijski kod je prošao build. Korekcija u `9c05f29`: tipiziran
   `QueryArgs` i povratni tipovi stubova, `type: 'NORMAL' as const`; ponašanje testova nepromijenjeno
   (11/11 i lokalno).

Dodatne lokalne provjere i ograničenja: `npx jest` (lokalni stub config) — cijeli backend **11 failed / 865
passed** suiteova i **37 failed / 4881 passed** testova, što je **identičan baseline** kao na `87eb653`
(11/864 i 37/4870, provjereno u zasebnom `git worktree` na HEAD-u); svih 11 padajućih suiteova su
sandbox artefakti Prisma stub-a (`Prisma.sql`, `$queryRaw` tagovi), ne regresije. `npx eslint` na četiri
izmijenjena fajla — čist. `node backend/scripts/check-backend-wiring.mjs` — 99 controllera / 631 ruta.
Prettier nije backend gate (nema konfiguracije ni zavisnosti u `backend/`); frontend nije diran.

## Registar nalaza

- Zatvoreni: `BA-changes-02` (P1) — acceptance dokazan testovima i zelenim CI gateom.
- Ostaju otvoreni u `24-changes.md`: `BA-changes-03`…`20` (P1: `03`, `04`, `05`, `06`, `07`).
- Kontrolni zbir: vidi [`BACKEND-FINDINGS-REGISTER.md`](../BACKEND-FINDINGS-REGISTER.md) — **433 otvoreno / 263 zatvoreno / 696** ukupno; Val 7 **69 otvoreno / 42 zatvoreno / 111** (P1 12 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **443 / 253 / 696**.

## Migracija, rollout i rollback

Nema migracije: nema schema promjene, nema nove tabele ni kolone. Deployment je čist code rollout; API
ugovor se **suzuje** (picker/detail vraćaju manje zapisa, write odbija tuđe ID-eve), pa svaki klijent koji je
ranije slao tuđe asset ID-eve sada dobija `CHANGE_ASSET_NOT_FOUND`; frontend to već mapira kao „asset nije
dostupan“. Rollback je revert commita `e620ed2` (helper i sve pozive vraća na prethodno stanje; podataka nema
za vraćanje).

## Sljedeći paket

**W7.44 — `BA-changes-03` (P1):** direct problem link write mora ponoviti `problem.read` visibility i
dozvoljeni status, ne samo postojanje. Nije započet prije zelenog gatea za ovaj paket.
