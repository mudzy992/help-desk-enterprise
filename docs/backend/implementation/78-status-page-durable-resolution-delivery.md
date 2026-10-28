# W6.5 — Durable bounded status-incident resolution delivery

**Finding:** `BA-status-page-05`  
**Implementacija:** `88d7050`, outbox identity korekcija `2ef9877`  
**Finalni CI:** `40770312995` — zelen

## Problem

Resolution je nakon DB commita sinhrono i neograničeno učitavao sve pending subscribere i povezane requestere, zatim sekvencijalno pisao notificatione u API requestu. Pojedinačna greška se samo logovala, a završni `updateMany` je sve subscriptione označavao kao notified, uključujući primaoce čiji notification nije upisan. Time nije postojao pouzdan retry put, API latency je rastao s publikom i neuspjeli primaoci su terminalno gubili obavijest.

## Implementacija

- Resolution transakcija sada zajedno sa status CAS-om, timeline updateom, ticket eventima i auditom upisuje deduplicirani `status.incident.resolution` transactional-outbox intent.
- API više ne radi resolution fan-out; odgovor `notified: 0` označava da nema sinhrono kreiranih notificationa, dok durable worker preuzima isporuku.
- Postojeći status delivery worker obrađuje i start i resolution teme, uz outbox lease/heartbeat, retry, max-attempt/dead-letter i replay ugovor.
- Pending subscriptioni se čitaju stabilnom keyset paginacijom po `userId`, u stranicama od 250.
- Svaki subscription dobija vlastitu terminalnu odluku: `notifiedAt` se postavlja tek nakon uspješnog notification persistencea ili nakon namjernog actor-self skipa. Ako persistence baci grešku, taj red ostaje pending i cijeli durable intent ide na retry.
- Povezani requesteri se zasebno keyset-paginiraju po `User.id`; deterministic notification dedupe po incidentu i korisniku čini ponovljeni parent delivery sigurnim.
- `STAFF_ONLY` resolution ne enumerira linked requestere, nego samo aktuelne subscriptione koji su prošli W6.3 visibility/re-subscribe granicu.
- `notifyOnResolve=false` ne kreira outbox intent.
- Worker ponovo učitava incident i obrađuje intent samo ako incident stvarno postoji i ima `RESOLVED` status.

## Testni dokaz

- Direktni write-side test potvrđuje da resolution commit-a jedan durable intent, ne poziva notification persistence i ne radi globalni subscription `updateMany`.
- Direktni failure test simulira dva subscribera: prvi notification uspije i samo njegov red dobija `notifiedAt`; drugi persistence pada, njegov red ostaje pending, a delivery baca grešku za outbox retry.
- Stvarni PostgreSQL scenario potvrđuje `PENDING` resolution outbox red, asinhroni API rezultat, worker obradu, tačno jednu obavijest po subscriber/requester primaocu i nula pending subscriptiona nakon uspjeha.
- W6.3 disclosure scenario sada također prolazi kroz durable worker i potvrđuje da raniji requester ne dobija `STAFF_ONLY` resolution sadržaj.
- CI `40769357853` imao je zelene PostgreSQL, frontend, container i build korake, ali je kompletni unit suite otkrio da kratki fixture incident ID nije zadovoljavao centralni outbox dedupe-key minimum. `2ef9877` je uveo kanonski `resolution:<incidentId>` identitet.
- Finalni CI `40770312995` potpuno je zelen: backend build i kompletni suite, stvarni PostgreSQL/Redis shard, frontend, docs, worker wiring, container/supply-chain i završni gate.

## Migracije i release

Paket koristi postojeću `OutboxMessage` i `ServiceIncidentSubscription.notifiedAt` infrastrukturu. Nema nove DB migracije niti posebne ručne release DB radnje. Produkcijski worker mora ostati aktivan.

## Ishod

`BA-status-page-05` je zatvoren. Resolution delivery je durable i paginiran, API više nije vezan za veličinu publike, a neuspjeli subscriber više nikada nije označen kao notified prije uspješnog persistencea. Registar prelazi na **604 otvorena / 88 zatvorenih / 692 ukupno**.
