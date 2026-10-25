# W5.2 — Ticket confidential break-glass atomic boundary

## Status

Završeno. Implementacijski SHA je `b842ac0`; puni zeleni CI dokaz je run `40225951703`.

## Zatvoreni nalaz

- `BA-tickets-02` — break-glass grant više ne može prethoditi kompletnom audit tragu.

## Implementirani ugovor

- API zahtijeva client-generated UUID v4 `correlationId`.
- `BreakGlassEvent.correlationId` je obavezan UUID i unique DB identitet.
- Frontend generiše ID po submit intentu, zadržava ga kroz transportni retry i mijenja ga samo kada korisnik promijeni reason payload.
- `RequestIdempotencyService` koristi correlation ID kao persisted command key, uz canonical request hash za stabilno odbijanje payload drifta.
- Jedna DB transakcija atomizuje grant, change-log diff, canonical audit, system ticket event, durable outbox intent i uspješni persisted response.
- `ticket.break_glass.effects` outbox koristi correlation ID kao stabilni dedupe key; vanjski efekti nisu dio business transakcije.
- API response vraća isti correlation ID.
- Audit metadata schema eksplicitno dopušta correlation ID, a change-log diff ga čuva uz razlog i rezultat.

## PostgreSQL dokaz

`backend/src/modules/tickets/confidential/break-glass-command.integration.spec.ts` direktno dokazuje:

1. dva paralelna ista zahtjeva daju jedan izvršen command i jedan replay;
2. postoji tačno jedan grant, change log, audit, system event i outbox intent;
3. response body je jednak za original i replay;
4. isti key uz izmijenjeni payload pada sa `IDEMPOTENCY_PAYLOAD_MISMATCH`;
5. fault nakon svih poslovnih writeova vraća grant, change, audit, system event i outbox;
6. claim ostaje recoverable `PROCESSING` zapis bez persisted success responsea, u skladu sa lease-recovery ugovorom primitive.

CI je dodatno replayovao svih 86 migracija kroz release migrator i dokazao restricted runtime DDL denial.

## Validacija

- Backend build, lint, unit i wiring: zeleno.
- Stvarni PostgreSQL/Redis integration suite: zeleno.
- Frontend lint, format, test, build, i18n/design-system i bundle budget: zeleno.
- Container/supply-chain ugovor: zeleno.
- CI gate: zeleno, run `40225951703`.

## Release obaveza

**Migracija `20271026030000_break_glass_atomic_boundary` mora se ručno pokrenuti kroz release migrator pri releaseu/redeployu.** Obični deploy je ne pokreće automatski. Migracija deterministički backfilluje legacy redove, zatim uvodi NOT NULL i unique indeks.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.3 — ticket bulk command durable operation/item manifest, eksplicitan atomic/best-effort režim, idempotentni per-item retry i tačan aggregate audit rezultat (`BA-tickets-03`)**.
