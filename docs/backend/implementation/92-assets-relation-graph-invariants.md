# W7.6 — Asset relation graph invariants (`BA-assets-06`)

**Paket:** W7.6 / `BA-assets-06` (P2), samo ovaj nalaz  
**Status:** završeno  
**Migracija:** `20271027230000_asset_relation_graph_invariants`  
**Kodni/testani SHA:** `d4f0a5b980d6a1527486ad97a604ff8869be7f37`  
**Finalni CI:** [`40950115033`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40950115033) — zelen

## Problem i granice paketa

`AssetsService.addRelation` je prije W7.6 provjeravao directed cycle i obrnuti `CONNECTED_TO` red prije transakcije. Dvije transakcije su zato mogle proći isti pre-check pa zasebno upisati suprotne directed veze ili simetrične duplikate. W7.6 premješta konačni autoritet na PostgreSQL, zadržavajući aplikacijske pre-checkove kao brzu putanju i radi postojećih API grešaka.

Directed vrste su `DEPENDS_ON`, `RUNS_ON`, `PART_OF` i `INSTALLED_ON`; `CONNECTED_TO` je simetričan. Nisu mijenjani relation authorization/OU scope, cross-boundary mutation pravila, DTO shape ni drugi assets nalazi. `BA-assets-07`–`BA-assets-19` ostaju izvan scopea.

## Implementacija

Migracija radi u jednoj transakciji i prvo uzima `SHARE ROW EXCLUSIVE` lock nad `AssetRelation`, pa fail-closed provjerava postojeće podatke:

- rekurzivnim reachability pre-flightom odbija već postojeći cycle kroz directed vrste;
- grupisanjem po `LEAST(fromAssetId, toAssetId)`/`GREATEST(...)` odbija postojeće duple `CONNECTED_TO` parove;
- tek nakon čistog pre-flighta instalira guardove.

Za simetričnu vezu dodan je partial unique expression index `AssetRelation_connected_to_canonical_key` nad kanonskim, neuređenim endpointima za `kind = 'CONNECTED_TO'`. Postojeći directional unique indeks ostaje za ostale vrste i iste-orijentisane duplikate.

Za directed cycle konačni guard je statement-level PostgreSQL trigger protokol:

1. `BEFORE INSERT` i `BEFORE UPDATE` uzimaju transaction-scoped advisory lock `(74293751, 6)` prije row/index/FK rada; relation write transakcije se tako serijalizuju.
2. `AFTER INSERT`/`AFTER UPDATE` koriste `NEW TABLE` transition relation i rekurzivnu reachability provjeru nad konačnim stanjem cijele naredbe. Provjera obuhvata i multi-row insert/update.
3. Cycle se odbija sa SQLSTATE `23514` i imenovanim invariantom `AssetRelation_directed_acyclic`. Brisanje samo uklanja grane i ne može stvoriti cycle; izmjene endpointa/kind prolaze kroz update guard.

Globalni advisory lock serijalizuje rijetke relation INSERT/UPDATE writeove, uključujući `CONNECTED_TO`; readovi nisu zaključani. DB-only indeks/triggeri su namjerni jer Prisma schema ne može izraziti ovaj partial expression index ni grafovski constraint trigger. Prisma model ima komentar na migraciju, a runtime schema sentinel je pomjeren na novu migraciju.

`AssetsService.addRelation` sada mapira imenovani directed-cycle conflict (Prisma adapter `P2039` i kompatibilni Prisma/PostgreSQL kodovi) na postojeći `ASSET_RELATION_CYCLE`; matching endpoint/kind unique konflikt (`P2002`/`23505`) vraća postojeći `ASSET_RELATION_EXISTS`. Nevezani DB konflikti se ne preklasifikuju.

## Acceptance i dokaz

Nova real-PostgreSQL suite `asset-relations-concurrency.integration.spec.ts` registrovana je u `run-isolated-integration.mjs`. Šest slučajeva prolazi direktno preko PostgreSQL-a:

1. simultani suprotni directed edge inserti: tačno jedan red ostaje;
2. tri paralelna writera koji zatvaraju tročlani cycle: dvije grane mogu ostati, a treći writer se odbija;
3. paralelni obrnuti `CONNECTED_TO` inserti: kanonski unique index dopušta tačno jedan red;
4. multi-row insert directed cyclea se odbija i cijeli statement se rollbacka;
5. dugačak lanac iznad aplikacijskog `relationDepthMax` prolazi bounded pre-check, ali DB odbije zatvaranje cyclea i API zadrži `ASSET_RELATION_CYCLE`;
6. postojeći obrnuti `CONNECTED_TO` API zahtjev zadrži `ASSET_RELATION_EXISTS`.

Dodatni unit classifier suite ima četiri testa za imenovane cycle/unique greške i neklasifikovanje nepovezanih constrainta. Runner contract test i migration-policy check su prošli. Postojeći W7.2 display test fixture je promijenjen sa suprotne directed veze na `CONNECTED_TO`; time zadržava provjeru incoming/outgoing scope prikaza, bez stvaranja nevažećeg directed cyclea. Nije mijenjan W7.2 scope kod.

Finalni CI [`40950115033`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40950115033) na testanom SHA-u je zelen: Prisma validate/generate, backend build/lint/unit suite, PostgreSQL+Redis migracija i integracija, frontend build/test, docs guard, container/supply-chain i CI gate prošli su. Push workflow je preskočio oba E2E joba; image high/critical enforcement je `skipped` jer je scanner count bio nula.

Dvije ranije W7.6 CI iteracije su pale zbog koda/podešavanja iz ovog paketa i korigovane su prije finalnog zelenog CI-a:

- [`40947909645`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40947909645) otkrio je da je postojeći `asset-scope-display` fixture pravio suprotne directed veze, što je sada invalidno; fixture je zadržao isti scope cilj koristeći `CONNECTED_TO`.
- [`40949108693`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40949108693) pokazao je da Prisma adapter vraća `P2039` za named SQLSTATE `23514` i da trostruki cycle test treba očekivati dvije uspješne grane i jedan odbijen write. Dodano je mapiranje `P2039` i ispravljena assertion logika.

Lokalno su classifier/runtime-contract Jest testovi (8/8), integration runner harness (3/3), migration policy (97 migracija), ciljani ESLint/Prettier i `git diff --check` prošli. Sandbox nema PostgreSQL/Docker, pa direct DB concurrency i migration replay dokaz dolaze iz CI-ja; Prisma CLI/engine download nije ponavljan.

## Rollout i migracijski pre-flight

Release treba koristiti single-owner `db:migrate:release` migrator, uz backup/snapshot i monitoring migrator lock waita. Migracija drži `SHARE ROW EXCLUSIVE` lock dok provjerava postojeće podatke i instalira oba DB guarda; relation writes čekaju tokom prozora, reads ostaju dostupni.

Za operatorsku dijagnostiku prije migration windowa, kanonski `CONNECTED_TO` duplikati se mogu pronaći ovako:

```sql
SELECT
  LEAST("fromAssetId", "toAssetId") AS "endpointA",
  GREATEST("fromAssetId", "toAssetId") AS "endpointB",
  array_agg("id" ORDER BY "createdAt", "id") AS "relationIds",
  count(*) AS "rowCount"
FROM "AssetRelation"
WHERE "kind" = 'CONNECTED_TO'
GROUP BY LEAST("fromAssetId", "toAssetId"), GREATEST("fromAssetId", "toAssetId")
HAVING count(*) > 1;
```

Directed cycle anchor se može locirati istim reachability pravilom kojim migracija radi pre-flight:

```sql
WITH RECURSIVE directed_reach("startAssetId", "reachableAssetId") AS (
  SELECT "fromAssetId", "toAssetId"
  FROM "AssetRelation"
  WHERE "kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')
  UNION
  SELECT directed_reach."startAssetId", relation."toAssetId"
  FROM directed_reach
  JOIN "AssetRelation" AS relation
    ON relation."fromAssetId" = directed_reach."reachableAssetId"
  WHERE relation."kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')
)
SELECT DISTINCT "startAssetId"
FROM directed_reach
WHERE "startAssetId" = "reachableAssetId";
```

Migracija ništa ne popravlja automatski. Data owner treba odlučiti koji `CONNECTED_TO` duplikat ostaje i koju directed granu treba ukloniti ili preusmjeriti; zatim ponoviti oba dijagnostička upita. Pre-flight failure rollbacka cijelu migraciju prije commita. Ako je neuspjeli pokušaj zapisan u Prisma history, tek nakon popravke označiti taj **failed** pokušaj kao rolled-back sa `prisma migrate resolve --rolled-back 20271027230000_asset_relation_graph_invariants`, pa ponoviti release migrator. Ta komanda se ne koristi za uspješno primijenjenu migraciju.

## Rollback i oporavak

- **Aplikacijski rollback:** može vratiti raniji backend uz zadržane DB index/trigger guardove; podaci ostaju zaštićeni, ali stari kod može konkurentni DB conflict prikazati kao generičku grešku jer nema W7.6 mapping. Ne uklanjati DB sloj samo radi app rollbacka.
- **Failed migration:** preflight/index/trigger promjene su u jednoj PostgreSQL transakciji, zato se neuspjela migracija rollbacka u cijelosti. Popraviti podatke, pa `migrate resolve --rolled-back` koristiti samo za Prisma-zabilježen failed pokušaj prije ponovnog deploya.
- **Uklanjanje nakon uspješne migracije:** Prisma historija je forward-only. Ako je uklanjanje nužno, prvo zaustaviti relation writes, uzeti backup i pripremiti zasebnu odobrenu cleanup migraciju. Njen SQL redoslijed je:

```sql
DROP TRIGGER IF EXISTS "AssetRelation_directed_acyclic_insert" ON "AssetRelation";
DROP TRIGGER IF EXISTS "AssetRelation_directed_acyclic_update" ON "AssetRelation";
DROP TRIGGER IF EXISTS "AssetRelation_graph_write_lock_insert" ON "AssetRelation";
DROP TRIGGER IF EXISTS "AssetRelation_graph_write_lock_update" ON "AssetRelation";
DROP FUNCTION IF EXISTS "validate_asset_relation_acyclic_after_statement"();
DROP FUNCTION IF EXISTS "lock_asset_relation_graph_writes"();
DROP INDEX IF EXISTS "AssetRelation_connected_to_canonical_key";
```

Ne uređivati već primijenjenu migraciju i ne označavati je kao rolled-back. Uklanjanje guardova ponovo dopušta directed cycle i obrnute `CONNECTED_TO` duplikate pri budućim writeovima.

## Registar i sljedeći paket

Zatvoren je samo `BA-assets-06` (P2); deklarisani aggregate registry je sada 583 otvorena / 109 zatvorenih / 692 ukupno, a 19 početnih P1 nalaza u Valu 7 ostaje otvoreno. Machine-readable source redovi prikazuju 586 otvorenih / 95 zatvorenih / 11 historijskih W3 statusa; ranije postojeće odstupanje agregata nije bilo predmet W7.6. `BA-assets-07` i ostali assets nalazi ostaju otvoreni. Sljedeći planirani paket je W7.7 (`BA-assets-07`), ali nije započet.
