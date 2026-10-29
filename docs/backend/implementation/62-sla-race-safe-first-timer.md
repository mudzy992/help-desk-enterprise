# W5.35 — Race-safe prvo kreiranje SLA timera

**Finding:** `BA-sla-05`  
**Implementacija:** `0afce88`, `e7efb10`  
**CI:** `40559964964` — zelen

## Problem

Prvi timer je koristio `load null → create`. Dva paralelna poziva su mogla oba izračunati početno stanje, nakon čega bi jedan dobio `P2002` na unique `ticketId`. Poziv zato nije bio idempotentan, a naivni retry/update bi mogao prepisati stanje pobjednika zastarjelim kandidatnim vrijednostima.

## Implementacija

Create put sada koristi `upsert` po jedinstvenom `ticketId` sa namjerno praznim `update` dijelom. Time postojeći pobjednički timer nikad nije prepisan kandidatnim stanjem gubitnika.

Prisma driver adapter može konkurentni upsert realizovati kroz read/create i ipak vratiti `P2002`. Taj slučaj se eksplicitno hvata i ponovno učitava winner po `ticketId`. Ostale greške se ne skrivaju, a nemogućnost učitavanja winnera propagira originalni konflikt. Legacy/in-memory adapter koristi isti create-conflict-reload ugovor.

W5.32 per-ticket transaction lock ostaje primarna koordinacija kompletnog runtime puta; ovaj paket dodatno čini samu primitive prvog kreiranja sigurnom kada je pozvana konkurentno izvan tog locka.

## Dokaz

Fokusirani unit testovi dokazuju:

1. prazan upsert update, bez overwritea;
2. `P2002 → reload winner`;
3. propagaciju svake non-unique greške.

Obavezni stvarni PostgreSQL shard pokreće dva nezavisna Prisma klijenta sa različitim početnim kandidatima nad istim ticketom i dokazuje:

- oba poziva uspijevaju;
- postoji tačno jedan `TicketSlaState` red;
- oba poziva vraćaju isti winner ID;
- winnerovo stanje odgovara jednom kompletnom kandidatu i nije prepisano drugim.

Prvi CI `40559141998` je razotkrio da Prisma adapter može emitovati `P2002` i za upsert; korekcija `e7efb10` dodala je obavezni reload. Finalni CI `40559964964` je potpuno zelen.

## Migracije i release

Paket koristi postojeći unique constraint `TicketSlaState.ticketId`; nema nove DB migracije niti ručne release DB radnje.

## Ishod

Paralelno prvo pokretanje SLA timera sada je idempotentno i first-writer-wins bez silent overwritea. `BA-sla-05` je zatvoren; registar prelazi na **621 otvoren / 71 zatvoren / 692 ukupno**.
