# W7.3 — Version/CAS zaštita statusa i custody mutacija imovine

**Val:** 7 / W7 — domain workflows (`assets`, `problems`, `changes`, `knowledge-base`, `reports`, `search`)<br>
**Paket:** W7.3 — jedinstveni expected-version/CAS ugovor za asset mutacije<br>
**Nalaz:** `BA-assets-03` (P1) — zatvoren<br>
**Feature commit:** `8f929e0ce8b3bf922ab80e80b5141da20ad2a86a`<br>
**Acceptance-test commit:** `4ecbed60244c9da33d3c91fc693f5fac6120399b`<br>
**Finalni testani SHA:** `4ecbed60244c9da33d3c91fc693f5fac6120399b`<br>
**CI:** [40930141682](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40930141682) — zelen<br>
**DB migracije:** nema

## Nalaz, acceptance i odluka o opsegu

`BA-assets-03` je utvrdio da `changeStatus`, `assign` i `unassign` učitaju trenutni asset, ali transakcijski upisuju samo prema `id`. Paralelni manageri ili direktna mutacija nasuprot transferu zato su mogli pregaziti status/holdera i zapisati evente prema zastarjelom stanju.

Status/custody mutacija prolazi samo ako očekivani `version` odgovara verziji koju je klijent pročitao, a CAS predicate još odgovara `id`, trenutnom statusu i holderu; generalni asset update koristi `id + expected version`. Svaki stale/racing zahtjev vraća `ASSET_VERSION_CONFLICT` kao HTTP 409. Status/custody event i druga pripadajuća DB side effect ponašanja nastaju samo nakon uspješnog CAS-a.

Audit §4 je uz isti ugovor naveo i da generalni `PUT /assets/:id` prihvata opcionalni `version`, pa bez njega može prepisati noviju izmjenu. Ta napomena je uključena u W7.3 closure kriterij: update DTO i servis sada zahtijevaju expected version, dok `POST /assets` za kreiranje ostaje bez verzije. Nalaz nije zatvoren samo na osnovu tri direktne status/custody rute.

## Implementacija

- `AssetStatusDto`, `AssignAssetDto` i `UnassignAssetDto` zahtijevaju pozitivan cijeli `version`; generalni update koristi poseban `UpdateAssetDto` sa obaveznom verzijom.
- `AssetsService.changeStatus()`, `assign()` i `unassign()` prvo odbijaju zastarjeli expected version. U transakciji rade `updateMany` sa CAS uslovima `id + version + status + assignedUserId` i nastavljaju samo ako je `count === 1`.
- Status, holder, version, licence-release i custody/status eventi ostaju u istoj transakciji. Eventi se kreiraju tek nakon uspješnog CAS-a, pa rollback/konflikt ne ostavlja parcijalni history.
- Generalni `update()` provjerava obavezni `input.version` i koristi isti expected version u `updateMany`; `count !== 1` vraća `ASSET_VERSION_CONFLICT`. Klijentski update API sada tipizira verziju kao obaveznu, a asset edit i status UI šalju `asset.version`.
- Uspješne status/assign/unassign mutacije vraćaju novu verziju; idempotentni status/no-op unassign vraća aktuelnu verziju.
- Postojeći error mapper već pretvara `ASSET_VERSION_CONFLICT` u HTTP 409, a frontend već prikazuje lokalizovanu poruku za refresh/pokušaj ponovo.

Nije mijenjan transfer contract, relation scope/mutability, license OU scope, audit-write atomicity ni drugi susjedni nalaz. Paket zatvara samo `BA-assets-03`.

## Direktni testni dokaz

Novi `backend/src/modules/assets/asset-version-cas.integration.spec.ts` poziva stvarni `AssetsService` nad PostgreSQL-om; suite je dodan u isolated integration runner i njegov harness test.

Osam acceptance testova pokriva:

1. **Generalni PUT, stale write:** verzija 1 uspješno pređe na verziju 2; drugi zahtjev sa verzijom 1 dobije conflict, ne promijeni polja i ne stvori drugi `updated` event.
2. **Status, stale zahtjev:** nakon pobjedničkog statusa, stale zahtjev ne mijenja konačni status/verziju i ne emituje dodatni status/custody event.
3. **Assign, stale zahtjev:** holder pobjedničke dodjele ostaje sačuvan; stale dodjela drugom korisniku ne upisuje event.
4. **Unassign, stale zahtjev:** stale pokušaj ne mijenja finalni status/holder i ne emituje drugi `unassigned` event.
5. **Racing stale retirement — holder i licence side effecti:** test zaustavi `RETIRED` zahtjev nakon što učita verziju 1, pusti konkurentni `IN_REPAIR` zahtjev da commit-a verziju 2 pa nastavi stale retirement. Stale CAS dobije conflict; finalni holder ostaje, `LicenseAssignment` count ostaje 1, a jedini event je pobjednički `status` (nema `unassigned` ni `license_released`).
6. **Paralelni status zahtjevi:** barrier u servisu osigurava da oba zahtjeva koriste isti stvarni PostgreSQL snapshot. Tačno jedan CAS pobjeđuje; neuspjeli `LOST` ne oslobađa holdera ako je pobijedio `IN_REPAIR`, a uspješni `LOST` ima tačno jedan automatski custody release.
7. **Paralelni assign zahtjevi:** tačno jedan holder pobjeđuje; finalni asset i jedini `assigned` event odgovaraju istom korisniku.
8. **Paralelni unassign zahtjevi:** tačno jedan novi status pobjeđuje; finalni asset je bez holdera, a jedini custody event odgovara pobjedničkom statusu.

`backend/src/modules/assets/assets-version.dto.spec.ts` provjerava da create ostaje versionless, a update/status/assign/unassign zahtijevaju pozitivan integer; zasebno potvrđuje mapiranje CAS greške na HTTP 409.

## CI i testni dokaz

Feature CI [`40928094487`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40928094487) je bio zelen; nakon dodatnog licence-side-effect testa finalni CI run [`40930141682`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40930141682), na testanom SHA `4ecbed60244c9da33d3c91fc693f5fac6120399b`, također je završen sa `success`:

- **Backend build + test:** Prisma schema/client, build, ESLint, safety-net, wiring, SLA matrix i kompletan backend test — prošli.
- **Backend PostgreSQL + Redis integration:** migracije i privilegije, integration harness, rollback/cleanup i sve isolated real-PostgreSQL suiteove — prošli; `asset-version-cas.integration.spec.ts` je registriran u runneru.
- **Frontend build + test:** guards, ESLint, Prettier, svi frontend testovi, build i budžeti — prošli.
- **Docs guard** i **CI gate** — prošli.
- **Backend container + supply chain** — prošao; korak `Enforce zero high/critical image vulnerabilities` je bio `skipped` prema workflow uslovu, ne `failed`.
- Push workflow je očekivano preskočio **E2E critical flows** i **E2E install wizard**.
- Nije bilo CI pada; nakon kriterijskog pregleda dodan je test koji direktno provjerava holder i device-license side effecte, pa je finalni acceptance SHA ponovo prošao cijeli CI gate.

Dodatna lokalna provjera: frontend ESLint, Prettier, testovi (**427 fajlova / 1.656 testova**) i production build su prošli. Backend ESLint i isolated-integration harness su prošli; ciljani DTO test je prošao. Lokalni backend build/full Jest nije mogao koristiti generisani Prisma client jer sandbox nije mogao dohvatiti Prisma engine sa `binaries.prisma.sh` (TLS socket prekinut); `assets-rules.spec.ts` je zato lokalno blokiran nedostajućim generated clientom. Ovo je sandbox/network ograničenje, ne CI greška: CI je uspješno generisao Prisma client, izgradio backend i izvršio testove/integration suiteove. Backend ESLint je prijavio tri postojeća `no-explicit-any` warninga u nepovezanom `sla-scan-failure-quarantine.spec.ts`, bez lint greške.

## Registar, migracija i rollout

Registar nakon zatvaranja: **586 otvorenih / 106 zatvorenih / 692 ukupno** (ukupno 174 P1, 368 P2 i 150 P3 u registru). Zatvoren je samo `BA-assets-03`; `BA-assets-04` i svi ostali susjedni nalazi ostaju otvoreni.

Nema Prisma schema promjene, DB migracije ni manual apply koraka: CAS koristi postojeću `Asset.version` kolonu i postojeće event modele. Rollout ne zahtijeva DB pripremu. API contract je namjerno strožiji: klijenti `PUT /assets/:id`, `POST /assets/:id/status`, `POST /assets/:id/assign` i `POST /assets/:id/unassign` moraju poslati verziju iz asset prikaza; create endpoint ostaje nepromijenjen. UI edit/status klijenti su usklađeni. Rollback je code revert.

**Sljedeći paket:** W7.4 — `BA-assets-04` (P1), pouzdana reminder delivery/state semantika. W7.3 CI gate je zelen prije napredovanja; drugi nalazi se ne zatvaraju bez vlastitog acceptance i CI dokaza.

## Ponovljivi package-closeout format

Stabilni odgovor za naredne pakete definisan je u [package-closeout-template.md](PACKAGE-CLOSEOUT-TEMPLATE.md) i indeksiran u [backend ulaznoj tački](../README.md). Ovaj closeout koristi isti redoslijed: paket/nalaz, scope/implementacija, direktni testovi, commit/CI, registar, DB/rollout i sljedeći paket.
