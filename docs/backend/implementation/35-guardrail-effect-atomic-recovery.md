# W5.8 — Guardrail claim/effect atomska recovery granica

## Status

Završeno. Završni implementacijski SHA je `c15bf91`; puni zeleni CI dokaz je run `40285216835`.

## Zatvoreni nalaz

- `BA-tickets-08` — guardrail claim više ne može trajno progutati CSAT, waiting-for-user ili archive automatizaciju ako proces padne prije poslovnog efekta.

## Implementirani ugovor

- Centralni `runGuardrailEffectTransaction` izvršava guardrail claim i zaštićeni poslovni efekat u istoj PostgreSQL transakciji.
- CSAT claim, `TicketCsat`, change log i system event sada commit/rollbackuju zajedno.
- Waiting-for-user reminder/auto-close claim, ticket transition, change log i system event sada pripadaju istoj transakciji.
- Closed-ticket archive claim i archive transition također su jedna transakcijska granica.
- Kvar nakon claima vraća claim, poslovni zapis i event, pa sljedeći worker/request može ponovo izvršiti isti fingerprint.
- Helper pri rollbacku vraća i in-memory persisted-message sink na početnu dužinu; realtime sloj zato ne može objaviti event čiji je DB red rollbackovan.
- Uspješno izvršenje zadržava postojeći unique claim kao terminalnu deduplikacijsku granicu.

## PostgreSQL fault/recovery dokaz

`backend/src/modules/tickets/guardrails/guardrail-effect-transaction.integration.spec.ts` na stvarnom PostgreSQL-u:

1. kreira guardrail claim, mijenja ticket i zapisuje system event;
2. injectuje kvar poslije svih tih koraka;
3. potvrđuje da claim, ticket izmjena i event ne postoje nakon rollbacka;
4. potvrđuje da je realtime message sink vraćen;
5. ponavlja isti fingerprint;
6. potvrđuje jedan committed claim, jedan poslovni efekat i jedan event.

## Validacija

CI `40285216835` je potpuno zelen: backend build/lint/unit, stvarni PostgreSQL/Redis integration suite, frontend build/test/format, docs guard i container/supply-chain provjere. E2E critical flow nije pokrenut, u skladu sa ciljanom release trakom.

## Migracije

Paket ne uvodi novu DB migraciju.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.9 — attachment limit/delete i DB/storage lifecycle konzistentnost (`BA-tickets-09`)**.
