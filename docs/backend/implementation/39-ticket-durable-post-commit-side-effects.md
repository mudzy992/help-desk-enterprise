# W5.12 — Durable post-commit side-effect recovery

**Finding:** `BA-tickets-12`  
**Implementacija:** `9277647`, health dopuna `816da4d`  
**CI:** `40325366346` — zelen

## Problem

Ticket DB commit i naknadni SLA, realtime te notification/e-mail fan-out nisu imali zajedničku durable recovery granicu. Pad procesa ili Redis/provider kvar poslije commita mogao je trajno izgubiti izvedeni side effect.

## Implementirani ugovor

- PostgreSQL trigger za svaki committed `TicketMessage` u istoj transakciji kreira `ticket.message.delivery` outbox intent;
- trigger za svaku stvarnu promjenu ticket statusa ili prioriteta u istoj transakciji kreira `ticket.sla.effects` intent sa prethodnim statusom i vremenom promjene;
- rollback poslovnog writea automatski rollbackuje i intent, pa ne postoji phantom delivery;
- message consumer ponovo učitava committed message i ticket, zatim objavljuje isti realtime payload; postojeći notification fan-out koristi message-ID dedupe ključeve, pa retry ne duplira persisted notification/e-mail rad;
- SLA consumer ponovo učitava committed ticket i primjenjuje status/priority događaj kroz postojeći idempotentni SLA sync;
- worker obrada koristi postojeći `TransactionalOutboxService`: `FOR UPDATE SKIP LOCKED`, lease heartbeat/recovery, bounded batch, eksponencijalni backoff, maksimalne pokušaje, `DEAD_LETTER` i auditirani manual replay;
- reconciler izlaže health snapshot: pending/processing broj, dead-letter broj i starost najstarijeg pending intenta;
- ranije durable split attachment copy/promotion ostaje pokriven `StorageWriteIntent` protokolom, dok ova faza zatvara zajednički ticket message/SLA/realtime/notification post-commit prozor.

## Direktni dokaz

`ticket-side-effect-outbox.integration.spec.ts` na stvarnom PostgreSQL-u potvrđuje:

1. message insert i njegov delivery intent commitaju zajedno;
2. status update i njegov SLA intent commitaju zajedno;
3. injektovani kvar nakon oba poslovna writea i trigger-intenta rollbackuje message, priority promjenu i oba nova intenta.

Postojeći `transactional-outbox.integration.spec.ts` direktno dokazuje concurrent single-claim delivery, privremeni kvar/retry, terminalni dead-letter i manual replay. Puni CI `40325366346` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija — obavezna release radnja

Paket uvodi novu migraciju:

`20271026120000_ticket_side_effect_outbox`

Migracija dodaje PostgreSQL trigger funkcije i triggere, bez nove poslovne tabele. **Migraciju je obavezno ručno pokrenuti standardnim release migratorom pri releaseu/redeployu prije pokretanja nove verzije API/worker procesa.** Runtime migration sentinel je ažuriran na ovu migraciju.

## Ishod

`BA-tickets-12` je zatvoren. Registar prelazi na **644 otvorena / 48 zatvorenih / 692 ukupno**.
