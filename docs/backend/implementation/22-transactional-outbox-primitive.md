# W4.2 — Transactional outbox primitive

**Status:** završen 25.10.2026.  
**Implementacija:** `9d82058`, test korekcije `7848a16` i `40664e4`.  
**Zeleni CI dokaz:** `40213179907`.

## 1. Kanonski ugovor

`TransactionalOutboxService.enqueue(transaction, input)` zahtijeva postojeći Prisma `TransactionClient`: business mutation i durable delivery intent zato commitaju ili rollbackuju zajedno. Topic je bounded machine namespace od 3–100 znakova, dedupe key ima 8–160 znakova, payload je canonical JSON ograničen na 64 KiB, a attempts su ograničeni na 1–100. Unique `(topic,dedupeKey)` daje idempotentan enqueue; isti ključ s drugim canonical payload hashom pada sa `OUTBOX_PAYLOAD_MISMATCH`.

`dispatchOne(topic, handler)` claimuje tačno jednu due poruku atomskim PostgreSQL `FOR UPDATE SKIP LOCKED` updateom. Claim sadrži UUID owner token, 60-sekundni lease i atomski povećan attempt. Heartbeat obnavlja lease tokom handlera. Complete/fail su owner-token CAS operacije, pa drugi worker ne može završiti tuđi claim.

Failure vraća poruku u `PENDING` sa determinističkim exponential backoffom od 1 sekunde do najviše jednog sata. Zadnji dozvoljeni pokušaj prelazi u terminalni `DEAD_LETTER`. Istekli crash claim može preuzeti drugi worker; istekli claim nakon finalnog pokušaja se deterministički terminalizira umjesto da ostane zaglavljen.

## 2. Delivery semantika

Outbox daje **at-least-once** delivery. Crash nakon uspješnog vanjskog efekta, a prije lokalnog `SUCCEEDED` CAS-a, može proizvesti ponovnu isporuku. Zato provider/consumer mora koristiti stabilni `OutboxMessage.id` kao idempotency/dedupe identifikator. Sistem ne tvrdi nemogući exactly-once ugovor preko vanjske sistemske granice.

Uspješni i dead-letter redovi zadržavaju se sedam dana. `purgeExpired` briše samo terminalne redove, u bounded batchu 1–1.000, defaultno 500. Pending/processing posao se retention cleanupom ne gubi.

## 3. Replay alat

`replayDeadLetter` koristi status CAS i prihvata bounded operator identitet i obavezni reason. Resetuje attempt/backoff, povećava `replayCount`, te trajno zapisuje `lastReplayedAt`, `lastReplayedBy` i `lastReplayReason`. Replay reda koji nije `DEAD_LETTER` vraća stabilan `OUTBOX_REPLAY_CONFLICT`.

## 4. DB i release ugovor

Migracija `20271025190000_transactional_outbox` dodaje:

- enum `OutboxStatus`: `PENDING`, `PROCESSING`, `SUCCEEDED`, `DEAD_LETTER`;
- `OutboxMessage` sa payload hashom, leaseom, attempts/backoffom, terminalnim stanjem i replay provenanceom;
- unique dedupe i claim/lease/retention indekse;
- DB CHECK granice za attempts i processing lease invariant.

Runtime schema sentinel pomjeren je na novu migraciju, a restricted runtime u CI i dalje prolazi DML-only/DDL-denial dokaz.

> **Obavezna release radnja:** `20271025190000_transactional_outbox` mora se ručno izvršiti kroz release migrator pri releaseu/redeployu. Obični runtime deploy ne izvršava migracije.

## 5. Test dokaz

Stvarni PostgreSQL integration testovi dokazuju:

1. rollback business transakcije uklanja i outbox intent;
2. canonical dedupe i payload mismatch;
3. dva paralelna workera proizvode samo jedan handler poziv;
4. expired lease recovery nakon simuliranog worker crasha;
5. poison item prelazi u dead letter;
6. operator replay čuva provenance i nakon toga uspješno isporučuje.

CI `40213179907` dodatno potvrđuje Prisma validate/generate, migration replay, build, lint, pune testove, container i supply-chain gateove.

## 6. Scope nalaza

W4.2 isporučuje platformsku osnovu, ali ne prebacuje automatski postojeće privacy, tickets, notifications i druge producere. Nijedan domenski finding zato nije umjetno zatvoren; registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno** do zasebne integracije i dokaza svakog callera.

## 7. Sljedeći paket

Sljedeći paket je **Backend Val 4 / W4.3 — optimistic version/If-Match primitive sa stabilnim stale-write conflict ugovorom**.
