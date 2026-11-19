# Paket migracije — W7.63

**Paket:** trigram indeksi nad `User` (izvršenje preporuke iz `BA-search-07`)<br>
**Nalaz:** `BA-search-07` (P2) — već zatvoren u W7.61; ovaj paket isporučuje **odobrenu migraciju**<br>
**Kodni commit:** `92293c8` · **CI:** [`44619519044`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44619519044) (success)<br>
**DB migracija:** `20271201130000_user_search_trigram_indexes` — **primijenjena kroz repo (odobrena od korisnika)**<br>
**Odobrenje:** korisnik je 2026-11-19 izričito odobrio migraciju trigram indeksa nad `User` (prethodni paket ju je svjesno ostavio
neizvršenom jer odobrenje nije bilo dato).

## Zašto

W7.61 je izmjerio (`search-query-plan.integration.spec.ts`, 12.000 korisnika) da `GET /search?types=user` planira
`Seq Scan` preko cijele tabele: predikat je `"displayName" ILIKE '%needle%' OR "email" ILIKE '%needle%'`, a vodeći
wildcard ne može koristiti B-tree — ni unique indeks na `email`. Cijena raste linearno s veličinom imenika, a
jedini lijek je `gin_trgm_ops` indeks, koji je schema promjena. Bez odobrenja paket je stao na dokazu i predlogu;
sada je odobrenje dato i migracija je isporučena.

## Šta je urađeno

- **Migracija** `backend/prisma/migrations/20271201130000_user_search_trigram_indexes/migration.sql`:
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` + dva `CREATE INDEX CONCURRENTLY IF NOT EXISTS ... USING gin (... gin_trgm_ops)`
  (`User_displayName_trgm_idx`, `User_email_trgm_idx`). `CONCURRENTLY` drži pisanje u `User` dostupnim dok se
  indeksi grade (isti pristup kao trigram migracija iz Faze 1.2). SQL fajl **ne sadrži** nijednu destruktivnu
  naredbu — rollback je opisan ovdje, ne u migraciji, pa `check-migration-policy` ne traži approval hash.
- **Šema** (`prisma/schema/identity.prisma`): dva `@@index([...], type: Gin, map: ...)` unosa sa
  `ops: raw("gin_trgm_ops")`, isti obrazac kao `Ticket`, `KnowledgeArticle` i `Asset`, sa komentarom koji veže
  indekse na `GET /search?types=user`.
- **Schema sentinel**: `expectedSchemaMigration` (i njegov spec) pomjereni na novu migraciju — bez toga bi
  `check-migration-policy` i runtime contract prijavili zastarjeli sentinel.
- **Plan-dokaz** (`search-query-plan.integration.spec.ts`): test za imenik više nije adaptivan na „indeks je
  odsutan”; sada **tvrdi da oba indeksa postoje** (`pg_indexes`), mjeri default plan (log) i dokazuje
  upotrebljivost sa `enable_seqscan = off` (indeks preuzima, pregledani redovi < 20 % korpusa). Time suite čuva
  indekse koji sada postoje, umjesto da dokumentuje onaj koji je nedostajao.
- Nema promjene koda aplikacije, konfiguracije ni API ugovora.

## Dokaz

- `node scripts/check-migration-policy.mjs` ⇒ **120 migracija**, destruktivni approval hashevi validni.
- `database-runtime-contract.spec.ts` + search suite: **13 suite / 94 testa** zeleno (lokalno, bez PostgreSQL-a —
  migracija se izvršava u CI-ju).
- CI run [`44619519044`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44619519044) je **success**
  (21:30:53Z–21:44:47Z); u integracionom jobu su zeleni „Replay every migration through the single-owner release
  migrator”, „Verify migration history is current” i „Run real PostgreSQL integration suites” — dakle migracija je
  stvarno primijenjena, a `search-query-plan.integration.spec.ts` je prošao nad šemom koja sadrži oba indeksa.
  E2E kritični/install i inventory su `skipped`; backend build/lint/test, frontend i supply-chain su zeleni.

## Rollback

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ...  -- naprijed
-- rollback:
DROP INDEX CONCURRENTLY "User_displayName_trgm_idx";
DROP INDEX CONCURRENTLY "User_email_trgm_idx";
```
Uz rollback se vraća i `expectedSchemaMigration` na prethodnu migraciju. Podaci se ne mijenjaju; indeksi su
potpuno uklonjivi bez gubitka. Ako se rollback radi na živoj bazi, `CONCURRENTLY` drži pisanje dostupnim i pri
uklanjanju.

## Preostali rizik

1. **Planer nije obavezan koristiti indeks** — na 12k redova sekvencijalni sken je i dalje jeftin, pa default
   plan može ostati `Seq Scan`; dokaz upotrebljivosti je prisilan plan (`enable_seqscan = off`) i on se izvršava
   u CI-ju. Na većem imeniku planer prelazi na bitmap indeks sam.
2. **Cijena održavanja indeksa** — dva dodatna GIN indeksa povećavaju trošak upisa u `User` (korisnici se rijetko
   mijenjaju, ali directory sync može raditi batch update). To je namjeran trade-off: `User` je čitan stalno
   (typeahead), a mijenja se rijetko.
3. **`email` je i dalje `@unique`** (B-tree) — potreban je za jedinstvenost, trigram indeks ga ne zamjenjuje.
4. **Trigram indeks ne rješava semantiku pretrage**: `contains` ostaje substring match; pokrivenost (query plan)
   nije isto što i relevantnost (to bi bio `BA-search-11`/rang, ako se ikad odluči).

## Sljedeće

Sljedeći P2 paket u Val 7 je `BA-changes-08` (prvi otvoreni P2 u `24-changes.md`), po dogovorenom redu auditа.
