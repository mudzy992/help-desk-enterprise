# W5.6 — Ticket approval decision/gate concurrency-safe granica

## Status

Završeno. Završni implementacijski SHA je `e4ab71c`; puni zeleni CI dokaz je run `40235330066`.

## Zatvoreni nalaz

- `BA-tickets-06` — paralelne approval odluke više ne mogu obje uspjeti, a isti ticket workflow korak ne može imati duple approval redove.

## Implementirani ugovor

- Approval decision koristi conditional `updateMany` claim nad `(approvalId, ticketId, status=PENDING)`.
- Samo pobjednik može u istoj transakciji promijeniti ticket status i zapisati change log, participant i system/decision događaje.
- Ticket status transition je također conditional nad očekivanim statusom; concurrent status drift ruši cijelu transakciju.
- Gubitnici stabilno dobijaju `APPROVAL_NOT_PENDING` ili `APPROVAL_TRANSITION_FORBIDDEN` i ne ostavljaju audit/event side effecte.
- Approval gate conditional claimuje očekivani ticket status prije kreiranja approvala.
- DB unique granica `TicketApproval(ticketId, stepOrder)` garantuje tačno jedan approval po workflow koraku.
- Migracija fail-closed odbija legacy duplikate porukom `TICKET_APPROVAL_DUPLICATE_STEP_REPAIR_REQUIRED`, umjesto da proizvoljno odbaci moguću poslovnu odluku.
- Schema readiness sentinel prati novu migraciju.

## PostgreSQL dokaz

`backend/src/modules/tickets/approvals/ticket-approval-concurrency.integration.spec.ts` na stvarnom PostgreSQL-u pokreće 20 paralelnih approve/reject pokušaja i dokazuje:

1. tačno jedan zahtjev pobjeđuje;
2. preostalih 19 zahtjeva je odbijeno;
3. postoji tačno jedan approval red za `(ticketId, stepOrder=1)`;
4. konačni ticket status odgovara pobjedničkoj odluci;
5. DB unique constraint odbija drugi approval za isti workflow korak.

## Validacija

CI `40235330066` je potpuno zelen: migration policy i replay, backend build/lint/unit, stvarni PostgreSQL/Redis integration suite, frontend build/test/format, docs guard i container/supply-chain provjere.

## Migracija — obavezna ručna release radnja

Paket uvodi migraciju `20271026100000_ticket_approval_concurrency_boundary`. Ona se mora **ručno pokrenuti kroz release migrator pri releaseu/redeployu**. Ako migracija prijavi `TICKET_APPROVAL_DUPLICATE_STEP_REPAIR_REQUIRED`, operator mora prvo pregledati i eksplicitno popraviti legacy duplikate; migracija ih namjerno ne briše automatski.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.7 — permission-correct i manifestovani CSV export (`BA-tickets-07`)**.
