# W5.44 — Scope-aware descendant and compliance profile lookups

**Finding:** `BA-sla-14`  
**Implementacija:** `97a5b45`  
**CI:** `40699122969` — zelen

## Problem

Compliance request je za svako čitanje učitavao cijeli OU direktorij, tek potom u Nodeu pronalazio traženi OU i filtrirao potomke po putanji. Bounded PostgreSQL agregacija i compatibility putanja dodatno su unaprijed učitavale globalni skup SLA profila, uključujući profile bez ijednog uzorka u traženom OU i vremenskom opsegu. Trošak je zato rastao sa ukupnim brojem OU/profila u deploymentu, a response je bez eksplicitne policy odluke otkrivao globalne profile kao redove sa nulama.

## Implementacija

- Resolver sada radi uski `findUnique` traženog OU-a, zatim DB-level descendant query sa exact ID-em i `ouPath startsWith` predikatom; sibling i ostatak direktorija nikada se ne materializuju u aplikaciji.
- Nepostojeći OU završava praznim scopeom bez drugog DB upita.
- PostgreSQL compliance putanja prvo radi bounded aggregate nad odobrenim OU ID-evima, izvodi jedinstvene profile ID-eve iz stvarnog rezultata i tek zatim učitava metadata samo tih profila.
- Limit od 1.000 profila ostaje fail-closed, ali više nije vezan za globalni broj konfigurisanih profila nego za scoped rezultat.
- Compatibility putanja prvo učitava scoped ticket SLA redove, deduplicira njihove profile ID-eve i metadata query ograničava `id IN (...)`; prazan rezultat ne radi profile query.
- Profil bez scoped uzorka više se ne vraća kao globalni zero-sample red.

## Dokaz

- Unit test provjerava exact/descendant DB predicate, izostanak sibling grane i izostanak descendant queryja za nepostojeći OU.
- Bounded aggregate test provjerava da metadata query sadrži samo aggregate-derived profile ID i zadržava profilni limit.
- Stvarni PostgreSQL integration test kreira korišteni i nepovezani SLA profil te potvrđuje da scoped compliance rezultat sadrži samo profil sa uzorkom u dozvoljenom OU/time-window skupu.
- Finalni CI `40699122969` je potpuno zelen: backend build/lint/cijeli test suite, stvarni PostgreSQL/Redis integration shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

Compliance descendant i profile metadata lookup trošak više ne raste sa cijelim OU/profile katalogom i globalni profili se ne vraćaju bez scoped uzorka. `BA-sla-14` je zatvoren; registar prelazi na **612 otvorenih / 80 zatvorenih / 692 ukupno**.
