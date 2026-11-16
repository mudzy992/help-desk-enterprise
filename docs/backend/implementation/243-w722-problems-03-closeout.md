# Package closeout — W7.22

**Paket:** W7.22 — CMDB veze problema iza `asset.read` i asset OU scopea<br>
**Nalaz:** `BA-problems-03` (P1) — implementacija i testni dokaz kompletni; zatvaranje čeka korisničku vizuelnu provjeru<br>
**Kodni commit:** `de03c5d`<br>
**Finalni testani SHA:** `d8175a6`<br>
**CI:** [`43883895790`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43883895790) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §8: `searchAssets`, suggestions, `linkAssets` i `get` linked assets nikad ne traže `asset.read` ni asset OU scope, pa problem manager može installation-wide pretraživati tag/name/serial, vidjeti tip/OU/status i vezati proizvoljan asset po ID-u. Prijedlozi izvedeni iz tiketa mogu sadržavati tuđe CMDB stavke.

Acceptance: svaka CMDB površina problema (picker pretraga, prijedlozi, vezanje, odvezivanje, linked shape, reverse kartica i asset dio historije) poštuje `asset.read` i OU opseg same stavke, filtrira u SQL-u prije limita i agregacije, fail-closed je bez opsega, ne mijenja API shape i ne briše postojeće veze. Service i incident pickeri iz istog audit-odjeljka ostaju `BA-problems-11` — nisu dio ovog acceptancea.

## Implementacija

- `problem-asset-access.ts` (novo): `problemAssetAccess(prisma, userId)` = aktuelni principal (`loadPrincipalContext`) → `assetViewerFromContext(..., 'asset.')` → tačno `asset.read` → `resolveAssetScope` + `unitScopeWhere` na `Asset.organizationalUnit.ouPath`. Nedostajući/neaktivni principal, kao i problem manager bez `asset.read`, padaju na `{ allowed: false, where: null }`; globalni `problem.*` grant se ne širi na CMDB; prazan opseg daje `{ id: { in: [] } }` umjesto NUL sentinela. `assetWhereOf(access)` je jedinstveni filter.
- `problem-links.service.ts`: `get` linked assets (`asset: { is: assetWhereOf(...) }`), `suggestAssets` (presjek nakon ticket-vidljivosti, prije liste i `ticketCount`), `searchAssets` (bez opsega prazna lista bez upita), `linkAssets` (scope u `findMany`; nepotpun skup → `PROBLEM_ASSET_NOT_FOUND` bez transakcije), `unlinkAsset` (`findFirst` kroz opseg prije `deleteMany`), `forAsset` (bez opsega ili bez čitljivog asseta prazna lista prije `reverse`).
- `problems.service.ts`: `asset_linked`/`asset_unlinked` više nisu među „uvijek sigurnim“ akcijama; prikazuju se samo ako je `detail.assetId` čitljiv u opsegu (jedan `asset.findMany` po stranici, bez upita kad nema asset događaja ili nema opsega).
- Error contract: strani asset je identičan nepostojećem (`PROBLEM_ASSET_NOT_FOUND`), bez oracle-a i bez djelomičnih efekata. Nema promjene DTO-a, ruta ni frontenda.

## Direktni testni dokaz

- `problem-asset-access.spec.ts` (7 testova) — nedostajući/neaktivni principal, bez `asset.read`, globalni problem grant koji ne širi CMDB, super admin/globalni admin, scoped grant (put + podputevi), home fallback, prazan opseg bez NUL sentinela.
- `problem-links.service.spec.ts` (13 testova, 6 novih) — linked assets i prijedlozi filtrirani opsegom; bez `asset.read` nemoguć predikat za linked listu i prazni prijedlozi; picker prazan bez opsega i ograničen opsegom; `linkAssets`/`unlinkAsset` odbijaju strani asset bez `$transaction`/`deleteMany`; in-scope link je transakcijski; reverse kartica prazna za nečitljiv asset.
- `problem-events-visibility.spec.ts` (5 testova, 2 nova) — asset događaji filtrirani opsegom, događaji bez `assetId` izostavljeni, bez `asset.read` nijedan asset događaj i bez CMDB upita.
- `problem-asset-scope.integration.spec.ts` (novo, PostgreSQL; registrovan u `scripts/run-isolated-integration.mjs`) — stvarni redovi u dvije OU: pretraga ne vraća strani asset, vezanje stranog pada bez reda i događaja, in-scope vezanje pravi tačno jedan `asset_linked`, kartica skriva strani linked asset i strani prijedlog, odvezivanje stranog ne mijenja stanje, reverse kartica radi samo za čitljiv asset.

## CI i testni dokaz

CI run [`43883895790`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43883895790) na `d8175a6`:

- **Backend:** generisani Prisma + `check:prisma-generated`, build/lint, full Jest — success.
- **PostgreSQL/Redis integration:** `npm run test:integration` — success, uključujući novu `problem-asset-scope.integration.spec.ts`.
- **Frontend:** lint/format/test/build i budget — success (bez frontend izmjena).
- **Docs/CI gate/container:** docs guard, container + supply chain i CI gate — success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` i uslovni high/critical image enforcement — skipped po konfiguraciji workflowa, ne passed.
- **Neuspjeli pokušaji:**
  - [`43881287791`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43881287791) na `de03c5d` — vlastite test-greške: TS2322/TS2345 zbog usko inferiranih mock tipova pod punim `tsc` i DB constraint `TicketAsset_primary_required` u integracionoj suite. Popravljeno u `cc95d87`.
  - [`43882818767`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43882818767) na `cc95d87` — vlastita greška: `this.access.requireGroupAuthority is not a function` u integracionoj suite. Popravljeno u `d8175a6`.
  - Nema preegzistentnih/env padova u ovom paketu.
- Perf smoke [`43881288118`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43881288118) — success na `de03c5d`; na finalnom SHA `d8175a6` Perf nije pokrenut jer je commit mijenjao samo test fajl.

Dodatne lokalne provjere i ograničenja: ciljane mock suite (`problem-asset-access`, `problem-links.service`, `problem-events-visibility`) prošle su lokalno s `ts-jest diagnostics:false`; ESLint nad svim izmijenjenim fajlovima čist; `check-docs-content` OK; `check-backend-findings` 694/694. Lokalni `prisma generate` i puni `tsc` nisu izvedivi u sandboxu (TLS prema Prisma binaries), pa 5 problems suiteova koje uvoze generisani klijent nije lokalno izvršeno; mjerodavan je CI.

## Registar nalaza

- Zatvoreni: `BA-problems-03` (uz zeleni CI; statusna oznaka u audit/registru/planu je `zatvoreno (W7.22)`, a konačno zatvaranje čeka korisničku vizuelnu provjeru).
- Ostaju otvoreni: ostalih 18 nalaza audita 23, uključujući P1 `BA-problems-05/06/07` i P2 `BA-problems-11` (service/incident scope policy), te svi nalazi auditа 24–27.
- Kontrolni zbir: registar **459 otvoren / 235 zatvorena / 694**; izvorni audit/plan **449 / 245 / 694** (P1 174, P2 370, P3 150 nepromijenjeno). Val 7 **24/109** zatvorenih, **85 otvorenih (16 P1 / 49 P2 / 20 P3)**; problems **4/19** (3/9/3 = 15 otvorenih). Deset starijih statusnih divergencija registra ostaje netaknuto.

## Migracija, rollout i rollback

Nema migracije — nema schema promjene. Deploy je čisto aplikacijski; nema manualnih koraka ni backfilla. API kompatibilnost: rute i shape nepromijenjeni; mijenja se samo sadržaj odgovora za gledaoce bez `asset.read` opsega (prazne liste, `PROBLEM_ASSET_NOT_FOUND`). Rollback = vraćanje prethodnog builda; podaci nisu dirani (postojeće veze se ne brišu, samo skrivaju).

## Preostali rizici

- Service i incident pickeri ostaju installation-wide do `BA-problems-11`.
- Stariji `asset_*` događaji bez `assetId` u detailu više se ne prikazuju.
- Po jedan dodatni `asset` upit na `get`/historiju (i principal učitavanje) — prihvaćen trošak; historija radi upit po stranici od 200 događaja.
- Postojeće veze izvan opsega se skrivaju, ne brišu; širi administrator ih i dalje vidi.
- Nema posebne frontend poruke „izvan opsega“ (namjerno, bez oracle-a).
- `forIncident` reverse putanja ostaje bez incident scope policy (dio `BA-problems-11`).

## Sljedeći paket

**W7.23 — `BA-problems-05` (P1):** `problem.close` bulk resolve mora provesti per-ticket authorization za svaki linked ticket prije promjene statusa, uz fail-closed ponašanje i testni dokaz za stale/paralelne tikete. Nije započet prije zelenog gatea i korisničke vizuelne potvrde za W7.22.
