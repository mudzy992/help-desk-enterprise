# W5.36 — Self-healing registracija SLA schedulera

**Finding:** `BA-sla-06`  
**Implementacija:** `e588462`  
**CI:** `40561511177` — zelen

## Problem

Registracija obaveznog SLA scan schedulera bila je jednokratna startup radnja. Kvar Redis/BullMQ veze pri registraciji prekidao je inicijalizaciju, a brisanje ili gubitak schedule zapisa nakon uspješnog starta nije se popravljalo u živom procesu. Log poruka sama nije bila recovery mehanizam niti čitljiv readiness signal.

## Implementacija

`SlaScanSchedulerService` sada održava schedule kroz kontinuirani idempotentni reconciliation loop:

- odmah pokušava `upsertJobScheduler` pri inicijalizaciji;
- ne gasi worker nakon prolaznog registration kvara;
- retry koristi eksponencijalni backoff od 1 s do maksimalno 60 s;
- nakon uspjeha ponavlja idempotentni reconciliation svakih 60 s, pa vraća schedule koji je uklonjen dok proces radi;
- sprečava paralelne reconcile pozive jednom `inFlight` granicom;
- timer je `unref` i uredno se prekida u `onModuleDestroy`.

Servis izlaže strukturirani `getRegistrationHealth()` snapshot sa `ready`, brojem uzastopnih kvarova, posljednjim pokušajem/uspjehom/kvarom i narednim planiranim pokušajem. Neuspjeh odmah postavlja `ready: false`; uspješan retry vraća `ready: true` i resetuje failure counter. Postojeći ops-health SLA scan-late signal ostaje vanjska end-to-end potvrda izvršavanja joba.

## Testovi

Deterministički fake-clock suite dokazuje:

1. uspješnu inicijalnu registraciju i ready health;
2. dva uzastopna kvara sa 1 s / 2 s backoffom, bez gašenja procesa;
3. automatski oporavak i reset healtha nakon trećeg pokušaja;
4. periodični upsert koji rekreira izgubljeni schedule;
5. shutdown koji uklanja timer i sprečava naknadnu registraciju.

## Validacija

- fokusirani scheduler suite: **3/3**;
- backend ESLint — zelen;
- CI `40561511177` — potpuno zelen: generated Prisma/build, kompletna backend kolekcija, PostgreSQL/Redis integracije, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema DB migraciju niti ručnu release DB radnju.

## Ishod

SLA scheduler registration više nije jednokratna startup zavisnost: kvar je vidljiv kroz readiness snapshot i automatski se popravlja sa bounded backoffom u živom workeru. `BA-sla-06` je zatvoren; registar prelazi na **620 otvorenih / 72 zatvorena / 692 ukupno**.
