# W5.31 — Durable SLA breach/escalation signal

**Finding:** `BA-sla-01`  
**Implementacija:** `9d00bb0`  
**CI:** `40547086540` — zelen

## Problem

`syncTicketSlaTimers` je prvo trajno upisivao deadline/breach marker i `firedEscalationKeys`, a tek zatim pokretao change-log, ticket-event i notification pipeline. Pad između tih koraka ostavljao je state kao već obrađen, pa naredni scan više nije mogao rekonstruisati izgubljeni signal.

## Rješenje

Runtime tranzicije se sada prvo pretvaraju u determinističke event intente. Produkcijski Prisma put u jednoj PostgreSQL transakciji upisuje SLA state i enqueuea svaki intent u postojeći `OutboxMessage`; enqueue kvar zato rollbacka i state marker. Dedupe ključ stabilno uključuje ticket, SLA clock, vrstu tranzicije i escalation-rule identitet.

Zasebni `SlaRuntimeEventOutboxReconciler` drenira temu `sla.runtime.events` koristeći postojeći lease, retry/backoff i dead-letter protokol. Delivery ID postaje idempotency ključ sistemskog ticket eventa. Cijeli change-log/event/reload/fan-out handler izvršava se unutar delivery transakcije: kvar bilo kojeg koraka rollbacka DB efekte i ostavlja outbox retryable; uspješan retry ponovo koristi isti delivery i isti ticket-message identitet.

In-memory adapter zadržava sinhroni put, ali koristi isti deterministički collector, tako da fokusirani state-machine testovi ostaju reprezentativni.

## Dokaz

- Fokusirani test dokazuje da state persist i svi enqueue pozivi koriste isti Prisma transaction callback te da enqueue failure prekida i propagira transakciju.
- Postojeći obavezni `transactional-outbox.integration.spec.ts` na stvarnom migriranom PostgreSQL-u dokazuje zajednički rollback business promjene i intenta, dedupe, single-worker claim, expired-lease recovery i dead-letter replay.
- CI generiše stvarni Prisma client, validira kompletnu šemu, builda backend, pokreće lint, sve Jest suiteove i PostgreSQL/Redis integration shard.
- Zvanični CI `40547086540` je potpuno zelen, uključujući backend build/test, PostgreSQL/Redis integracije, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Nema nove DB migracije: paket ponovo koristi postojeći generički `OutboxMessage` model. Nema posebne ručne DB radnje.

## Ishod

Persist-before-delivery prozor je uklonjen i `BA-sla-01` je zatvoren. Registar prelazi na **625 otvorenih / 67 zatvorenih / 692 ukupno**.
