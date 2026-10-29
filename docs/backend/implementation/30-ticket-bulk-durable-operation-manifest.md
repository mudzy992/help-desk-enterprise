# W5.3 — Ticket bulk durable operation/item manifest

## Status

Završeno. Završni implementacijski SHA je `151061e`; puni zeleni CI dokaz je run `40229199458`.

## Zatvoreni nalaz

- `BA-tickets-03` — bulk execute više nema neimenovano parcijalno stanje bez durable rezultata.

## Implementirani ugovor

- API zahtijeva UUID v4 `operationId` i eksplicitan `atomic` ili `best-effort` mode.
- `TicketBulkOperation` čuva actor, action, mode, canonical request hash, status, aggregate brojače i terminalni response.
- `TicketBulkOperationItem` čuva stabilni item key/ticket ID, ordinal, status, attempts, rezultat i bounded error klasifikaciju.
- Unique `(operationId,itemKey)` i `(operationId,ordinal)` granice sprječavaju dupli item.
- Ponovna upotreba operation ID-a sa drugim payloadom pada sa `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Terminalni atomic rezultat se replayuje bez ponovnog izvršenja.
- Atomic režim koristi jednu DB transakciju za sve ticket writeove, per-ticket change/system zapise, aggregate audit, item completion i persisted terminalni rezultat.
- Best-effort režim koristi bounded sekvencijalne per-item transakcije; aggregate audit precizno navodi outcome/succeeded/failed.
- Retry istog parcijalnog best-effort operation ID-a CAS-om vraća operation u processing i bira samo `FAILED`/`PENDING` iteme; raniji uspjesi ostaju netaknuti.
- Frontend čuva operation ID po canonical submit intentu i generiše novi tek kada se selection/action/value/reason promijeni.

## PostgreSQL dokaz

`backend/src/modules/tickets/bulk/ticket-bulk-operation.integration.spec.ts` dokazuje:

1. jedan durable operation sa tačno jednim item redom po keyu;
2. terminalni response replay;
3. payload-drift odbijanje;
4. item completion i terminalni response rollback zajedno nakon faulta;
5. best-effort partial resume bira samo neuspjeli item;
6. uspješni item ostaje sa originalnim attempt brojem.

## Validacija

CI `40229199458` je zelen za backend build/lint/unit, stvarni PostgreSQL/Redis integration suite, replay svih 87 migracija, frontend lint/test/build/bundle i container/supply-chain provjere.

## Release obaveza

**Migracija `20271026050000_ticket_bulk_operation_manifest` mora se ručno pokrenuti kroz release migrator pri releaseu/redeployu.** Obični deploy je ne pokreće automatski.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.4 — ticket split attachment stvarni blob-reference/copy protokol sa storage reconciliation dokazom (`BA-tickets-04`)**.
