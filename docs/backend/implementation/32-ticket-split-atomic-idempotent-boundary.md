# W5.5 — Ticket split potpuni preflight, idempotency i atomska multi-child granica

## Status

Završeno. Završni implementacijski SHA je `b65cffa`; puni zeleni CI dokaz je run `40233520653`.

## Zatvoreni nalaz

- `BA-tickets-05` — split više ne može ostaviti parcijalne childove kada kasniji input ili korak nije validan, niti retry može proizvesti duplikate.

## Implementirani ugovor

- HTTP DTO zahtijeva UUID v4 `operationId`; frontend generiše stabilan ID za isti fingerprint korisničkog submit intenta.
- Preflight prije prve poslovne mutacije provjerava sve message i attachment ID-jeve, feature zabrane te zabranjuje višestruki move istog attachmenta.
- Parent, svi child ticketi, poruke, attachment metadata, SLA/event/assignment zapisi i durable storage intenti nastaju unutar jedne PostgreSQL transakcije.
- `createTicket` koristi transaction-aware helper i ne pokušava otvoriti nested Prisma transakciju kada već radi nad transaction clientom.
- Centralni `RequestIdempotencyService` persistira canonical payload hash i rezultat sa parent/child ID-jevima.
- Identičan retry vraća isti persisted rezultat bez ponovnog izvršenja; isti operation ID sa drugim payloadom pada sa `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Response reload eksplicitno rekonstruira child redoslijed prema persisted `childIds`, bez oslanjanja na nedefinisan SQL `IN` redoslijed.
- Attachment copy stage može prethoditi commitu, ali child metadata i `StorageWriteIntent` pripadaju split transakciji. Promotion se pokušava tek poslije commita; rollback čisti staging, a worker zadržava reconciliation odgovornost.
- Realtime objava se ne ponavlja pri replayu.

## PostgreSQL dokaz

`backend/src/modules/tickets/split/split-attachment-storage.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje:

1. injectovana greška nakon ranijeg child writea vraća cijelu multi-child transakciju;
2. nakon rollbacka ne postoji nijedan od pokušaja childova;
3. prvi validni operation ID kreira tačno definisana dva childa;
4. identičan retry vraća identične parent/child ID-jeve i ne izvršava operation callback drugi put;
5. isti operation ID sa drugačijim payloadom stabilno pada;
6. broj childova nakon replaya ostaje tačan, bez duplikata.

Postojeći split unit test dodatno prolazi kroz potpuni message preflight, copy i response reload, dok W5.4 dio iste PostgreSQL/disk suite i dalje dokazuje durable attachment promotion/recovery.

## Validacija

CI `40233520653` je potpuno zelen: backend build/lint/unit, stvarni PostgreSQL/Redis integration suite, migracijski replay i runtime-role provjere, frontend build/test/format, docs guard te container/supply-chain provjere.

## Migracije

Paket ne uvodi novu DB migraciju. Koristi postojeće `RequestIdempotency` i `StorageWriteIntent` schema ugovore. Ranije nepokrenute migracije za te primitive i dalje se moraju ručno primijeniti kroz release migrator pri releaseu/redeployu.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.6 — approval decision/gate concurrency-safe granica (`BA-tickets-06`)**.
