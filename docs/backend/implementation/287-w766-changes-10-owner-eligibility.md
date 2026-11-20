# W7.66 — `BA-changes-10`: owner eligibility vezana za OU changea

**Paket:** Val 7, audit 24 / `changes` — owner assignment scope i reconciliation<br>
**Nalaz:** `BA-changes-10` (P2) — „Owner eligibility ne veže `change.manage` assignment za OU konkretnog
changea”<br>
**Kodni commit:** `ce6f2f1` (+ `7562031` tip, `eba1f66` format) · **CI:**
[`44696149887`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44696149887) (success)<br>
**DB migracija:** nema — provjera je izvedena iz postojećih assignmenta, a drift se bilježi u postojeću
`ChangeEvent` tabelu

## Šta je nalaz tvrdio

`assertReferences` je provjeravao samo da owner **postoji**, da je aktivan i da ima `change.manage` **bilo gdje**.
Posljedica je bila dvostruka: picker (`GET /changes/owners`) je nudio scoped managere iz tuđih OU-a, a save je
takvog ownera prihvatao. Change je time dobijao vlasnika koji ga, po `canManage` logici, ne može mijenjati — ili
ga je mogao mijenjati samo dok neko ne primijeti. Drugi dio nalaza: kad owneru kasnije bude **revokovan**
assignment, **deaktiviran** ili **anonimiziran** nalog, ništa se nije rekonsolidovalo — change je tiho ostajao bez
efektivnog vlasnika, a historija nije objašnjavala zašto.

## Šta je urađeno

**Jedno pravilo, tri mjesta.** Novi `change-owner-eligibility.ts` izvodi scope iz **istog** resolvera koji koristi
`canManage`: `assetViewerFromContext(context, userId, 'change.')` → `resolveAssetScope(…, change.manage, homeUnitPath)`
→ `isPathInScope`. Picker, write validacija i reconciler zovu istu funkciju, pa se ne mogu razići.

| Ishod | `reason` | Značenje |
| --- | --- | --- |
| prolazi | `eligible` | aktivan, neanonimiziran, `change.manage` pokriva unit changea (ili predak) |
| pada | `missing` | korisnik ne postoji (obrisan) |
| pada | `inactive` | `isActive = false` |
| pada | `anonymized` | `anonymizedAt` postavljen |
| pada | `out_of_scope` | assignment ne pokriva unit; **fail-closed** i kad unit path nije poznat |

- **Write putanja.** `assertOwnerEligible(ownerUserId, organizationalUnitId)` je javna metoda servisa:
  nepoznat unit ⇒ `CHANGE_UNIT_NOT_FOUND`; nepodoban owner ⇒ `CHANGE_OWNER_NOT_MANAGER` sa `detail` = razlog.
  `create` validira ownera prema `unitId` **uvijek** kad je owner zadat.
- **Update validira samo promjenu.** `update` računa efektivni par `(owner, unit)` i provjeru izvodi **samo** kad se
  owner ili unit mijenjaju. Change čiji je owner kasnije izgubio assignment ostaje urediv (window, plan, status) —
  inače bi revokacija zamrzla svaki takav change do ručne intervencije.
- **Picker.** `GET /changes/owners` prima `organizationalUnitId`; bez njega koristi `viewer.homeOrganizationalUnitId`,
  a bez ijednog vraća praznu listu (nikad „svi manageri”). Upit over-fetchuje `take: 60`, filtrira scope u
  memoriji i vraća `slice(0, 20)`; principal podaci za cijelu stranu se učitavaju **jednim** `user.findMany`
  (`principalContextInclude` + `organizationalUnit.ouPath`), ne po kandidatu.
- **Reconciliation.** `ChangeOwnerReconciler` (worker-only modul, tik svakih 5 min, keyset po `id`, batch 100)
  skenira žive change-ove s ownerom (`status notIn [CLOSED, REJECTED, CANCELLED]`), ponovo izračuna eligibility i
  zapiše **jedan** `owner` event sa `detail { reason: 'owner_ineligible', eligibility, ownerUserId }`. Event se ne
  ponavlja za isti par (zadnji `owner` event je već isti), a claim/reassignment ga prirodno resetuje. Owner se
  **ne briše**: change bez vlasnika kršio bi lifecycle pravila, a i dalje ga može preuzeti (`claim`) ili
  reassignovati manager tog OU-a.
- **Vidljivost stanja.** Detalj vraća `ownerEligible` (`null` kad ownera nema). UI prikazuje
  `changes.detail.ownerNotEligible` (bs/en) uz ime vlasnika, pa se drift vidi i prije nego reconciler napiše event.
  Poruka za `CHANGE_OWNER_NOT_MANAGER` je precizirana na „upravitelj promjena koji pokriva odabranu organizacijsku
  jedinicu” (umjesto „mora biti upravitelj promjena”).
- **Forma.** `searchChangeOwners(search, unitId)` i `changeQueryKeys.owners(search, unitId)` nose unit; picker se
  ne pokreće bez odabranog unta, a promjena unta **odbacuje** već odabranog ownera (manager starog OU-a nije
  nužno manager novog), umjesto da save padne na zastarjelom izboru.

Nema promjene šeme, ruta ni konfiguracije; odgovor detalja je aditivan (`ownerEligible`), a picker restriktivan.

## Dokaz

- `change-owner-eligibility.spec.ts` (6): matrica razloga (in-scope/predak prolazi, strani OU `out_of_scope`,
  inactive i anonymized odbijeni i uz globalni grant, `null` path i prazan scope fail-closed), `changeManageScope`
  za scoped/globalni/service grant (service pada na home unit), batch učitavanje i filtriranje kandidata.
- `changes-owner-scope.spec.ts` (9): write validacija (`out_of_scope`, `inactive`, `anonymized`, `unitNotFound`),
  prihvatanje managera istog i parent unta, picker vraća samo podobne kandidate uz jedan batch principal upit,
  fallback na home unit i prazna lista bez unta, `ownerEligible` u detalju (`false`/`true`/`null`), reconciler
  (jedan event, dedupe, tišina za podobnog ownera, `where` isključuje terminalne statuse).
- Frontend `change-detail-owner-eligibility.spec.tsx` (3): upozorenje za nepodobnog ownera, čist prikaz za
  podobnog, bez poruke kad ownera nema.
- Changes modul: **21 suite / 123 testa**; `+ ops-health + app.module.spec`: **36 suite / 290 testa**; frontend
  `components/changes`: **3 fajla**, cijeli frontend **462 fajla**. `tsc`/`eslint`/`prettier`/`i18n:check` čisti;
  `check-backend-wiring`: 99 controllera / 631 ruta (nepromijenjeno).
- CI [`44696149887`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44696149887) **success**:
  backend build/lint/test, PostgreSQL + Redis integracija, frontend, docs-guard, container/supply-chain i gate.
  E2E i read-only inventory su `skipped`.
- Dva prolaza do zelenog: prvi je pao na `TS2322` (`data.ownerUserId` je Prisma field-update unija, ne `string`),
  drugi na frontend guardovima (modul `change-form-sheet.tsx` 508 > 500 linija → izdvojen
  `useChangeOwnerSearch`; `ownerNotEligible` ključ u pogrešnom bloku; Tailwind default `amber` umjesto `warning`
  tokena). Nijedan nije bio semantička greška u pravilu eligibilityja.

## Preostali rizik

1. **Reconciler ne mijenja podatke** — samo bilježi drift. Odluka o novom vlasniku ostaje ljudska (claim ili
   reassignment); automatsko preuzimanje bi promijenilo odgovornost bez pristanka.
2. **Scope je `change.manage`**, ne `change.read`: manager koji samo čita change ne može biti owner. To je
   namjerno — vlasnik odgovara za izvedbu.
3. **Service-scoped grant** pokriva home unit, isto kao `canManage`; to je postojeća semantika, ovdje samo
   naslijeđena.
4. **Anonimizirani bivši owner** ostaje u historiji kao `null` actor (privacy scrub), pa `detail.ownerUserId` u
   event-u može pokazivati na anonimiziran red.
5. **Batch od 100 po ticku** znači da velika instalacija drift vidi u nekoliko intervala (5 min po strani), ne
   trenutno; keyset cursor se resetuje na kraju prolaza.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-11` (claim/general update nemaju kanonski globalni audit).
