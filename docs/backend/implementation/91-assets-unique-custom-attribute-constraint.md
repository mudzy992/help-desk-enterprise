# Package closeout — W7.5

**Paket:** W7.5 — DB invariant za unique custom asset atribute<br>
**Nalaz:** `BA-assets-05` (P2) — zatvoren<br>
**Kodni commit:** `c9773edb259756dc34b0dceb59522a4770b2ee7f`<br>
**Finalni testani SHA:** `c9773edb259756dc34b0dceb59522a4770b2ee7f`<br>
**CI:** [`40942023054`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40942023054) — zelen<br>
**DB migracije:** `20271027220000_asset_unique_attribute_values`

## Nalaz i acceptance

Prije W7.5 jedinstvenost aktivnih custom asset atributa oslanjala se na `lower()` pre-check nad JSON-om prije upisa. Manual create/update i import apply zato nisu imali DB invariant između provjere i writea: paralelni zahtjevi mogli su oba proći i sačuvati duple vrijednosti.

Acceptance je ograničen na `BA-assets-05`: PostgreSQL mora serijalizovati/odbiti konfliktne writeove na canonical vrijednosti, dok postojeći `attributeNotUnique` API odgovor ostaje očuvan gdje je primjenjiv. Normalizovani redovi moraju ostati sinhronizovani pri asset JSON writeu, katalog insertu i promjeni `isUnique`/archive stanja. Susjedni asset nalazi nisu zatvoreni.

## Implementacija

- `AssetUniqueAttributeValue` čuva `(assetId, assetTypeId, attributeId, attributeTypeId, canonicalValue)`. PostgreSQL `lower()` daje canonical semantiku; unique indeks `(attributeId, canonicalValue)` je krajnja concurrency granica.
- Composite foreign keys vežu asset i attribute definition za svoj `typeId`; `CHECK (assetTypeId = attributeTypeId)` sprečava međusobno nepodudaranje tipova. `Asset` i `AssetAttribute` dobijaju odgovarajuće composite unique indekse.
- Migracija prvo radi fail-closed duplicate preflight, zatim backfill svih aktivnih unique atributa i instalaciju triggera u jednoj transakciji pod `SHARE ROW EXCLUSIVE` lockovima nad `Asset`, `AssetAttribute` i `AssetType`. Duplikat u postojećim podacima zaustavlja migraciju bez parcijalnog commita.
- Asset trigger održava canonical redove na `attributes`/`typeId` writeovima. Catalog trigger ih gradi/briše pri insertu te promjenama `isUnique`, `archivedAt`, `key` ili `typeId`. Asset writes uzimaju shared type-scoped advisory lock i stabilno uređene `FOR SHARE` lockove definicija; novi attribute insert uzima odgovarajući exclusive advisory lock prije FK provjere. Time se zatvara insert-vs-write prozor bez nadogradnje parent FK locka.
- Manualni pre-check i import preview sada čitaju normalizovanu tabelu. Matching Prisma `P2002` i PostgreSQL `23505` konflikti se prevode u postojeći `attributeNotUnique` odgovor za manual/catalog/all-or-nothing import tokove; non-strict import bilježi `attribute_not_unique_concurrent` za pogođeni batch.
- Database runtime compatibility sentinel prati novu migraciju. Nije mijenjan javni DTO/API oblik niti su dirani drugi finding paketi.

## Direktni testni dokaz

`backend/src/modules/assets/asset-unique-attributes.integration.spec.ts` je registrovan u izolovanom PostgreSQL integration runneru i ima sedam acceptance scenarija:

1. dva istovremena direktna PostgreSQL asset writea s istom canonical vrijednošću — tačno jedan prolazi;
2. manual create/update, database redovi poslije updatea i postojeći domain error za duplikat;
3. dva istovremena manual updatea koja ciljaju istu vrijednost — jedan pobjeđuje, drugi dobija `attributeNotUnique`;
4. manual pre-check se zaustavlja nakon provjere, import create apply upisuje prvi, a manual write gubi na DB constraintu;
5. import preview koji prethodi manual createu gubi pri applyju, vraća postojeći duplicate error i ne ostavlja partial asset;
6. import UPSERT update uklanja stari canonical red i zadržava novi;
7. catalog uniqueness/archive togglovi rade atomic backfill/removal i odbijaju aktivaciju koja bi napravila duplikate.

`backend/src/modules/assets/asset-unique-attributes.spec.ts` dodaje 4 unit testa za prepoznavanje named-index/field-target `P2002`, native `23505` i odbijanje nepovezanih unique konflikata. `backend/scripts/run-isolated-integration.test.mjs` potvrđuje da je novi real-DB suite uključen u runner.

## CI i testni dokaz

CI run [`40942023054`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40942023054) na `c9773edb259756dc34b0dceb59522a4770b2ee7f`:

- **Backend build + test:** zelen; kompletna Prisma schema validacija i client generation, annotated backend build, lint, prethodno compile-blocked suiteovi, SLA matrix i backend Jest suite prošli su.
- **PostgreSQL + Redis integration:** zelen; migracije su replayane kroz release migrator, migration/role/privilege/connection-budget/restore provjere prošle su, a real PostgreSQL integration suites — uključujući W7.5 — su prošli.
- **Frontend build + test:** zelen.
- **Docs guard:** zelen.
- **Backend container + supply chain:** zelen; container build, SBOM/provenance i runtime provjere prošle su.
- **CI gate:** zelen.
- **Skipped:** `E2E critical flows` se ne pokreće na plain pushu; `E2E install wizard` je manual-dispatch-only. `Enforce zero high/critical image vulnerabilities` je `skipped` jer je scanner output count bio `0`; nije CI pad.
- **Neuspjeli CI pokušaji:** nema za W7.5.

Lokalne provjere:

- `npm run lint` — 0 grešaka; ostala su 3 postojeća `no-explicit-any` upozorenja u nepovezanom `sla-scan-failure-quarantine.spec.ts`.
- `npm test -- --runInBand --runTestsByPath src/modules/assets/asset-unique-attributes.spec.ts` — 4/4 testa prošla.
- `npm run db:migration-policy:check` — prošlo za 96 migracija; `npm run db:migration-policy:test` — 2/2; `npm run test:integration-harness` — 3/3.
- `node --check` za oba isolated-integration runner fajla i `git diff --check` — prošli.
- Lokalno `prisma format` nije moglo preuzeti `schema-engine` sa `binaries.prisma.sh` zbog TLS/network prekida. Lokalni `npm run build` nije validan kodni dokaz: sandbox nema generisani `backend/src/generated/prisma/client`, pa je Nest build prijavio 3.266 kaskadnih tipnih grešaka od nedostajućeg client modula i Prisma delegata. Nema lokalnog `psql`/Docker alata, pa direktna PostgreSQL suite nije pokrenuta u sandboxu. CI je uspješno validirao/generisao klijent, izgradio backend, replayao migraciju na PostgreSQL-u i izvršio integration suite.

## Registar nalaza

- Zatvoren: samo `BA-assets-05` (P2).
- Ostaju otvoreni: `BA-assets-06`–`BA-assets-19`, uključujući graph/race, license scope, ticket primary, scheduler, audit i lifecycle nalaze.
- Deklarisani globalni W7 agregat poslije zatvaranja: **584 otvorenih / 108 zatvorenih / 692 ukupno**; severity snapshot ostaje **174 P1 / 368 P2 / 150 P3**.
- Preegzistentno odstupanje u registru ostaje vidljivo: W7.3 closeout je zabilježio 586/106, W7.4 zaglavlje 585/107, dok source audit redovi/`backend-findings-plan.json` nakon ovog status updatea imaju 587 `otvoreno`, 94 `zatvoreno` i 11 historijskih `završen (W3.x)` statusa. W7.5 ažurira svoj finding i deklarisani W7 agregat, ali namjerno ne rekoncilira tu širu raspodjelu.
- `backend-findings-plan.json` je regenerisan iz source audita; traceability provjerava svih 692 nalaza, severity i owner/wave bez promjene susjednih finding statusa.

## Migracija, rollout i rollback

`20271027220000_asset_unique_attribute_values` je nova, forward-only Prisma migracija. Release treba koristiti postojeći single-owner `db:migrate:release` migrator, uz backup/snapshot i monitoring lock waita. Ona ne traži API/DTO rollout koordinaciju: stari application code ne čita novu tabelu, a DB triggeri nastavljaju održavati invariant.

Ako duplicate preflight ne prođe, migracija se rollbacka kao transakcija i release se zaustavlja. Operater prvo treba identifikovati navedeni attribute/canonical value, popraviti ili ukloniti duple postojeće JSON vrijednosti prema data owner odluci, pa tek onda ponoviti migraciju. Ako Prisma nakon rollbacka ostavi failed migration zapis, označiti taj neuspjeli pokušaj kao rolled-back sa `prisma migrate resolve --rolled-back 20271027220000_asset_unique_attribute_values`, pa tek onda ponoviti deploy. Ova komanda je samo za failed migration; uspješno primijenjena migracija ne smije se tako označavati.

Preferirani application rollback je vratiti prethodni app image i ostaviti additive tabelu/indekse/trigger-e: stari kod ih ne referencira, a triggeri ostaju kompatibilni sa JSON writes. **Puno uklanjanje schema objekata nije rollback koji se radi ad hoc nakon uspješne Prisma migracije.** Ako je uklanjanje nužno, vratiti prethodni app/schema i dodati zasebnu forward-only cleanup migraciju kroz uobičajeni review/destructive-SQL approval i release migrator. Prvo zaustaviti/drainati asset/catalog writeove i uzeti backup; sljedeći SQL je sadržaj te cleanup migracije:

```sql
BEGIN;
LOCK TABLE "Asset", "AssetAttribute", "AssetType" IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS "Asset_unique_attribute_values_sync" ON "Asset";
DROP TRIGGER IF EXISTS "AssetAttribute_unique_attribute_values_sync" ON "AssetAttribute";
DROP TRIGGER IF EXISTS "AssetAttribute_unique_attribute_type_scope_lock" ON "AssetAttribute";
DROP FUNCTION IF EXISTS "sync_asset_unique_attribute_values_from_asset"();
DROP FUNCTION IF EXISTS "sync_asset_unique_attribute_values_from_definition"();
DROP FUNCTION IF EXISTS "lock_asset_attribute_type_scope"();
DROP TABLE IF EXISTS "AssetUniqueAttributeValue";
DROP INDEX IF EXISTS "Asset_id_typeId_key";
DROP INDEX IF EXISTS "AssetAttribute_id_typeId_key";
COMMIT;
```

Cleanup migration treba imati prethodnu schema sliku bez ove normalizovane tabele/indeksa i ostaviti originalni W7.5 migration red u `_prisma_migrations` neizmijenjenim — `prisma migrate resolve --rolled-back` ne radi na uspješno primijenjenoj migraciji. Poslije cleanup migracije stari app/schema ostaju usklađeni. Ako W7.5 funkcionalnost kasnije bude vraćena, dodati novu forward migration koja ponovo kreira DB invariant; ne očekivati da Prisma ponovi već uspješan originalni migration. Za običan release rollback bez potrebe za fizičkim uklanjanjem, ostavljanje additive schema objekata i vraćanje starog app imagea ostaje sigurnija i preferirana putanja.

## Sljedeći paket

**W7.6 — `BA-assets-06` (P2):** relation graph cycle/symmetric insert invariant pod paralelnim writeovima, uz direktni PostgreSQL concurrency acceptance i migration/rollback plan. Nije započet u ovom closeoutu; `BA-assets-08` i ostali nalazi ostaju izvan scopea.
