-- W7.63 (BA-search-07, odobreno): trigram indeksi nad imenikom.
--
-- `GET /search?types=user` filtrira `"displayName" ILIKE '%needle%' OR
-- "email" ILIKE '%needle%'`. Vodeći wildcard ne može koristiti B-tree (ni
-- unique indeks na `email`), pa je plan bio `Seq Scan` preko cijele tabele —
-- izmjereno u W7.61 (`search-query-plan.integration.spec.ts`, 12k redova).
-- Isti obrazac i isti operator razred kao `Ticket`/`KnowledgeArticle`/`Asset`:
-- GIN indeks sa `gin_trgm_ops`, a ekstenzija je već instalirana migracijom
-- `20260923140000_search_trigram_indexes` (ponovljeno ovdje da migracija ne
-- zavisi od redoslijeda kojim je baza nastala).
--
-- CONCURRENTLY drži pisanje u `User` dostupnim dok se indeksi grade; zato ova
-- migracija mora ostati izvan transakcije (isti pristup kao trigram migracija
-- iz Faze 1.2).
--
-- Rollback je dvije linije (uklanjanje indeksa po imenu) i opisan je u
-- `docs/backend/implementation/284-w763-user-trigram-index-migration.md`.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_displayName_trgm_idx"
    ON "User" USING gin ("displayName" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_email_trgm_idx"
    ON "User" USING gin ("email" gin_trgm_ops);
