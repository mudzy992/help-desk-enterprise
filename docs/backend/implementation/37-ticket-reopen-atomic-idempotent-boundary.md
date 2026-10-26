# W5.10 — Same-ticket reopen atomska i idempotentna granica

**Finding:** `BA-tickets-10`  
**Implementacija i dokaz:** `7b63508`  
**CI:** `40319657162` — zelen

## Problem

Same-ticket reopen je odvojeno mijenjao ticket, change log, system evente, merged child statuse i SLA side effecte. Paralelni zahtjevi mogli su duplirati tranziciju ili ostaviti parcijalne zapise, a kvar nakon DB commita mogao je izgubiti SLA nastavak.

## Implementirani ugovor

- HTTP endpoint zahtijeva `Idempotency-Key`;
- centralni `RequestIdempotencyService` veže payload hash, owner lease, rezultat i replay uz jednu transakciju;
- conditional `updateMany` claim nad `id/status/updatedAt` dopušta samo jednu tranziciju;
- parent status/timestamps, change log, reopen/comment eventi, merged-child status/change/eventi, SLA outbox intente i terminalni idempotency rezultat commitaju ili rollbackuju zajedno;
- retry istog ključa vraća spremljeni rezultat bez novih eventa, promjena ili realtime poruka;
- promijenjen payload pod istim ključem odbija se postojećim payload-drift ugovorom;
- parent i child SLA rad se evidentira kroz postojeći `TransactionalOutboxService`, sa unique dedupe ključem, leaseom, backoffom, dead-letter stanjem i manual replay podrškom;
- worker-only `ReopenSlaOutboxReconciler` učitava committed ticket i idempotentno primjenjuje SLA događaj.

## Direktni dokaz

`reopen-same-ticket.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje da dva paralelna reopen zahtjeva sa različitim ključevima daju tačno jednu uspješnu statusnu tranziciju, jedan change zapis i jedan SLA outbox intent. Replay pobjedničkog ključa vraća `IN_PROGRESS` ticket bez dodatnog system eventa ili realtime message sink zapisa.

Puni CI `40319657162` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Koristi postojeće `IdempotencyRecord` i `OutboxMessage` sheme.

## Ishod

`BA-tickets-10` je zatvoren. Registar prelazi na **646 otvorenih / 46 zatvorenih / 692 ukupno**.
