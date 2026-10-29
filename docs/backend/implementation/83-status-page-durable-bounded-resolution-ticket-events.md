# W6.10 — Durable bounded incident-resolution ticket event delivery

**Finding:** `BA-status-page-11`  
**Implementacija:** `0900d97`  
**Supply-chain korekcije:** `cb52204`, `e98ecab`  
**Finalni CI:** `40836850142` — zelen

## Problem

Resolution transakcija je učitavala sve povezane tickete i za svaki sinhrono upisivala system event prije commita. Broj ticket linkova može rasti nakon kreiranja incidenta i nije imao limit, pa su trajanje locka/transakcije, memorija i rollback površina rasli sa cijelim skupom. Premještanje u retry worker bez dedupea bi, s druge strane, moglo kreirati duple system evente.

## Implementacija

- Resolution transakcija više ne čita `TicketIncidentLink` niti sinhrono piše ticket evente.
- Ista transakcija koja commit-a `RESOLVED`, timeline update i audit uvijek upisuje poseban transactional-outbox intent `status.incident.resolution-ticket-events`.
- Event intent je odvojen od notification intenta. `notifyOnResolve=false` i dalje ne kreira recipient-notification intent niti obavještava korisnike, ali poslovno obavezni ticket lifecycle eventi ostaju durable.
- Postojeći status delivery worker dispatchuje treću temu uz postojeće start/resolution notification teme i koristi isti lease, heartbeat, retry, max-attempt, dead-letter i replay okvir.
- Handler ponovo učitava incident i nastavlja samo ako incident postoji i status je `RESOLVED`.
- Ticket linkovi se keyset-paginiraju po `ticketId ASC` u batchu **250**, bez ukupnog terminalnog capa.
- Svaki ticket event koristi postojeći `insertSystemTicketEvent` sa determinističkim idempotency ključem `status-incident-resolved:<incidentId>`. Postojeći `(ticketId, idempotencyKey)` unique/upsert ugovor čini retry i replay sigurnim po ticketu.
- Recipient notification delivery ostaje nezavisno retryabilan; failure jedne outbox teme ne vraća resolution DB transakciju niti duplicira već upisane ticket evente.

## Testni dokaz

- Write-side unit test potvrđuje dva durable intenta kada su notifications uključene, nijedan sinhroni ticket-event write i nijedan unbounded link read.
- `notifyOnResolve=false` test potvrđuje tačno jedan event intent, bez recipient notification persistencea.
- Direktni worker test generiše 252 linka i potvrđuje dvije keyset stranice, cursor nastavak, svih 252 eventa i isti deterministički per-incident idempotency ključ na svakom ticketu.
- Stvarni PostgreSQL test potvrđuje da su notification i event outbox reda `PENDING`, worker završava oba, resolution notificationi ostaju tačno jednom i ticket dobija očekivani `ticket_incident_resolved` event.
- Postojeći silent resolution scenariji sada eksplicitno sweepaju event intent, čime nema skrivenog backloga između integracijskih slučajeva.
- CI `40835647270` dokazao je zelene backend, PostgreSQL, frontend i docs shardove, ali je container gate otkrio tri novoprijavljena Node 22.23.3 CVE-a. Digest baze je podignut na Node 22.23.4 (`cb52204`), a `e98ecab` je zadržao kanonski `node:22-alpine@sha256:...` oblik koji provjerava container contract.
- Finalni CI `40836850142` potpuno je zelen, uključujući zero-high/critical image scan, backend kompletni suite, stvarni PostgreSQL/Redis, frontend, docs, wiring i završni gate.

## Migracije i release

Paket koristi postojeći transactional outbox i postojeći ticket-message idempotency constraint. **Nema nove DB migracije** niti ručne release DB radnje. Produkcijski worker mora ostati aktivan.

## Ishod

`BA-status-page-11` je zatvoren. Resolution transakcija je konstantna u odnosu na broj ticket linkova, dok worker bez ukupnog capa i bez duplikata eventualno isporučuje event svakom povezanom ticketu. Registar prelazi na **599 otvorenih / 93 zatvorena / 692 ukupno**.
