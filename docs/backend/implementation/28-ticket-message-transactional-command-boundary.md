# W5.1 — Ticket message transactional command boundary

**Status:** završen 25.10.2026.  
**Implementacija:** `64493ed`; korekcije `91e8fcd`, `c83431d`, `0fe417f`; PostgreSQL dokaz `15d86c9`.  
**Zeleni CI dokaz:** `40223728831`.

## 1. Zatvoreni nalaz

Ovim paketom zatvoren je **BA-tickets-01**: HTTP create-message više ne može commitovati jednu poruku, vratiti transportnu grešku i zatim na retry kreirati drugu poruku.

Registar nakon paketa iznosi **655 otvorenih / 37 zatvorenih / 692 ukupno**.

## 2. Idempotentni HTTP command

`CreateTicketMessageDto` sada zahtijeva UUID v4 `idempotencyKey`. Frontend generiše ključ za svaki send intent i šalje ga u request bodyju. Backend koristi namespace po ticketu i centralni W4.1 persisted idempotency primitive.

Request hash obuhvata ticket, actora, message type/body, merged-copy flag i response-template ID. Isti ključ i isti payload vraćaju persisted HTTP 201 rezultat bez ponovnog callbacka. Isti ključ sa drugim payloadom vraća stabilni `IDEMPOTENCY_PAYLOAD_MISMATCH`.

`TicketMessage` dodatno ima nullable legacy-kompatibilni `idempotencyKey` i DB unique `(ticketId,idempotencyKey)`. HTTP boundary ga zahtijeva; nullable kolona čuva kompatibilnost trusted internih legacy callera dok se njihovi posebni provider-dedupe tokovi ne prebace u kasnijim paketima.

## 3. Jedna DB transakcija

Unutar idempotency-owned transakcije sada nastaju:

- primarni `TicketMessage`;
- first-response timestamp;
- template usage statistika;
- mention redovi;
- redaction system event;
- waiting-for-user resume, change-log i system event;
- opcionalne merged-child message kopije;
- canonical audit `ticket.message_created` bez message bodyja;
- durable `ticket.message.effects` outbox intent;
- persisted idempotency HTTP rezultat.

Kvar bilo kojeg od tih koraka rollbackuje poruku, događaje, audit, outbox i rezultat zajedno. Audit metadata je versionirano allowlistovan (`idempotencyKey`, `messageId`, `messageType`, `source`), action→ticket entity ugovor je zatvoren, a OU scope dolazi iz ticket `originUnitId`.

## 4. Post-commit efekti

Realtime publish i postojeći SLA fast path pokreću se tek nakon uspješnog commita i samo za prvi, nereplayani zahtjev. Njihov durable recovery intent je `ticket.message.effects` outbox red vezan za stabilni message ID.

Ovaj paket ne proglašava **BA-tickets-12** zatvorenim: potpuni worker consumer/cutover za SLA, notification i realtime recovery još nije isporučen. W5.1 daje durable intent i uklanja message-core partial commit, ali BA-tickets-12 ostaje otvoren do dokaza end-to-end consumera i replaya.

Follower auto-add ostaje postojeći best-effort izvedeni collaboration efekt i nije dio poruke/audita kao source-of-truth. Mention redovi, koji utiču na notification publiku, jesu u transakciji.

## 5. Migracija

Migracija `20271026010000_ticket_message_command_boundary` dodaje nullable `TicketMessage.idempotencyKey` i unique `(ticketId,idempotencyKey)`. Runtime schema sentinel pomjeren je na ovu migraciju.

> **Obavezna release radnja:** `20271026010000_ticket_message_command_boundary` mora se ručno pokrenuti kroz release migrator pri releaseu/redeployu. Obični runtime deploy ne izvršava migracije.

## 6. Dokaz

Stvarni PostgreSQL test dokazuje:

1. prvi command kreira tačno jednu poruku i tačno jedan outbox intent;
2. retry istog key/payloada vraća isti persisted rezultat i callback se ne ponavlja;
3. persisted poruka ostaje jedna;
4. payload drift sa istim keyem pada;
5. fault nakon message + outbox writea rollbackuje oba reda.

Puni CI `40223728831` potvrđuje migration replay, restricted runtime DML/DDL granicu, Prisma validate/generate, backend build/lint/pune testove, stvarne PostgreSQL suiteove, frontend i i18n audit registry parity, container i supply-chain gateove.

## 7. Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.2 — ticket confidential break-glass grant + change/audit/system event u jednoj transakciji, sa immutable correlation ID-em i durable vanjskim efektima**.
