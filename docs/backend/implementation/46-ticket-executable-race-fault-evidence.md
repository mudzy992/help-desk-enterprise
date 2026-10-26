# W5.19 — Executable race/fault evidence completion

**Finding:** `BA-tickets-19`  
**Implementacija:** `dcf57ef`, runtime korekcije `a6dc201`, `dcf94f9`  
**CI:** `40367476585` — zelen

## Problem

Ticket race/fault testovi su postojali u repozitoriju, ali većina novijih suiteova nije bila navedena u `run-isolated-integration.mjs`. Redovni unit job ih je preskakao bez `PRIVACY_IT_DATABASE_URL`, dok je “real PostgreSQL integration” CI shard izvršavao samo četiri rana ticket suitea. Zbog toga zeleni CI nije bio izvršiv dokaz za approval, attachment, export, guardrail, remote, reopen, saved-view i side-effect concurrency grane.

## Implementirani ugovor

Obavezni izolovani PostgreSQL shard sada eksplicitno uključuje kompletnu ticket evidence kolekciju:

1. message idempotency/retry/rollback;
2. confidential break-glass concurrency/rollback;
3. bulk operation partial resume/atomic rollback;
4. split DB/storage rollback, replay i promotion recovery;
5. approval 20-way single-winner race;
6. attachment quota race i durable delete recovery;
7. export scope/confidential filter prije cursor limita;
8. distributed guardrail count+claim race;
9. guardrail claim/effect crash rollback i retry;
10. remote 12-way rate-limit race;
11. same-ticket reopen race/replay;
12. saved-view max/default race i sort-null persist dokaz;
13. ticket message/SLA side-effect trigger commit/rollback.

Svaki suite dobija vlastitu bazu kloniranu iz potpuno migriranog templatea; runner je izvršava `--runInBand`, zatim bazu prisilno uklanja. Harness test sada sadrži obavezni manifest navedenih ticket suiteova, pa njihovo slučajno uklanjanje iz CI sharda ruši raniji dependency/database-isolation korak.

## Nalazi otkriveni tek stvarnim shardom

Prvi kompletni run dokazao je da su W5.14 i W5.15 advisory lock helperi koristili `$queryRaw` nad PostgreSQL `void` povratnom vrijednošću. Prisma nije mogla deserijalizovati `void`, iako build/unit te raniji parcijalni integration shardovi nisu otkrili problem.

Oba helpera sada koriste `$executeRaw`:

- distributed guardrail advisory lock (`a6dc201`);
- saved-view owner advisory lock (`dcf94f9`).

Ponovljeni puni shard potvrđuje stvarno izvršenje i prolaz svih obaveznih race/fault suiteova. Time W5.19 nije samo manifest korekcija nego i direktno pronađen/ispravljen production runtime kvar u ranije nedokazanim granama.

## CI dokaz

CI `40367476585` je potpuno zelen. PostgreSQL/Redis job je izvršio cijeli izolovani integration manifest, uključujući svih 13 ticket race/fault suiteova; backend build/lint/unit, frontend, docs i container/supply-chain poslovi također su zeleni. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Korisnik je potvrdio uspješnu primjenu W5.15 migracije `20271026130000_saved_view_concurrency_invariants`.

## Ishod

`BA-tickets-19` je zatvoren. Cijeli tickets audit modul `BA-tickets-01`–`BA-tickets-19` sada je zatvoren. Registar prelazi na **637 otvorenih / 55 zatvorenih / 692 ukupno**.
