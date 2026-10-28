# W5.46 — Executable SLA failure/concurrency/scope/DST test matrix

**Finding:** `BA-sla-16`  
**Implementacija:** `9ba00dd`  
**CI:** `40704810126` — zelen

## Problem

SLA testovi su postojali kao rastući skup pojedinačnih specova, ali audit nije imao izvršiv ugovor koji garantuje da kritični failure, concurrency, authorization scope, DST i fake-clock scenariji ostaju prisutni i pokrenuti nakon generisanja Prisma klijenta. PostgreSQL specovi su prolazili kroz generički integration shard bez SLA-specifičnog inventara, pa je brisanje ili pogrešna klasifikacija kritičnog testa mogla proći neprimijećeno.

## Implementacija

- Kanonski `backend/scripts/sla-test-matrix.json` inventariše 20 jedinstvenih kritičnih specova u šest obaveznih kategorija: failure, concurrency, scope, DST, fake-clock i PostgreSQL.
- Runner fail-closed provjerava da svaka kategorija nije prazna, da svaki fajl postoji, da PostgreSQL stavke koriste `.integration.spec.ts` ugovor i da svaki fake-clock test stvarno poziva `jest.useFakeTimers`.
- Runner dodatno zaključava CI preduvjete: generated Prisma korak, izolovani PostgreSQL integration runner i zaseban `npm run test:sla:matrix` gate.
- Izvršni dio matrice pokreće sve neintegracijske kritične specove deterministički, `--runInBand` i `--runTestsByPath`; PostgreSQL stavke ostaju u izolovanom real-DB shardu gdje dobijaju vlastiti migrirani database namespace i cleanup.
- Backend CI sada ima imenovani korak **Run executable SLA failure/concurrency/scope/DST matrix** nakon Prisma generate/build/wiring provjera i prije kompletnog Jest suitea.

## Pokrivena kritična ponašanja

- persist-before-delivery i outbox recovery;
- poison/retry/quarantine i notification flood granice;
- per-ticket/profile concurrency lockovi;
- globalni, OU/service i sibling/cross-scope authorization;
- Sarajevo, New York i Lord Howe gap/fold round-trip invariante;
- scheduler retry/reconciliation, due scan, backfill, timer i breach fake-clock scenariji;
- stvarni PostgreSQL write-lock, scoped admin-read i bounded compliance/observability dokazi.

## Dokaz

- Lokalni matrix contract i backend lint prolaze; inventar prijavljuje **20 unique specs across 6 categories**.
- CI `40704810126` eksplicitno prikazuje zeleni SLA matrix korak nakon generated Prisma klijenta.
- Isti run ima zeleni realni PostgreSQL/Redis shard, kompletan backend suite, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

Kritična SLA test pokrivenost više nije dokumentacijska pretpostavka: ona je verzioniran, fail-closed i izvršiv CI ugovor. `BA-sla-16` je zatvoren; SLA audit jedinica nema preostalih otvorenih nalaza, a centralni registar prelazi na **610 otvorenih / 82 zatvorenih / 692 ukupno**.
