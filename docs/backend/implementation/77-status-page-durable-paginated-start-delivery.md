# W6.4 — Durable paginated status-incident start delivery

**Finding:** `BA-status-page-04`  
**Implementacija:** `4ea6fad`, korekcije `7575f0b`, `cab7d18`, `e97b685`  
**Finalni CI:** `40766102694` — zelen

## Problem

Start notification je u API requestu sekvencijalno obrađivao najviše 2.000 distinct requestera bez stabilnog ordera ili cursora. Primaoci iznad limita nisu imali durable backlog niti retry put i trajno su gubili obavijest. Velika publika je istovremeno povećavala create latency.

## Implementacija

- Create incidenta sada u istoj DB transakciji sa incidentom, prvim updateom i auditom upisuje deduplicirani `status.incident.start` intent u postojeći centralni transactional outbox.
- API više ne radi sinhroni fan-out; `notified` zato predstavlja samo sinhrono kreirane obavijesti i za queued start delivery iznosi nula.
- Worker-only `StatusPageWorkerModule` registruje stabilni BullMQ scheduler `status-incident-start-delivery-every-minute`, processor i delivery servis.
- Svaki outbox delivery keyset-paginira aktivne requestere otvorenih ticketa po stabilnom `User.id` cursoru u batchu od 250, bez terminalnog ukupnog limita.
- Outbox lease, heartbeat, retry, max-attempt/dead-letter i replay mehanika koriste postojeći centralni durable primitive; djelimičan retry je siguran jer je notification dedupe ključ deterministički po incidentu i korisniku.
- Jedan sweep obrađuje najviše deset delivery runova radi bounded worker vremena, dok preostali durable backlog ostaje za naredni scheduler tick.
- Worker prije deliveryja ponovo provjerava incident. Ako je visibility u međuvremenu sužen na `STAFF_ONLY`, javni delivery se završava bez disclosurea.
- Scheduler je dodat u worker wiring test i u frontend admin-ops i18n katalog na bosanskom i engleskom.

## Testni dokaz

- Direktni delivery test simulira više od jedne pune stranice, potvrđuje drugi keyset cursor, obradu svih primalaca i determinističke dedupe ključeve.
- Direktni test potvrđuje otkazivanje pending javne isporuke nakon visibility restrikcije.
- Stvarni PostgreSQL status-page scenario potvrđuje da create commit-a `PENDING` outbox red prije isporuke, worker ga obrađuje i tek tada nastaje notification.
- CI `40763301664` otkrio je TypeScript inference grešku; `7575f0b` je dodao eksplicitni tip stranice.
- CI `40763756891` otkrio je da novi worker queue nije bio u boot wiring fixtureu; `cab7d18` ga je dodao.
- CI `40764969714` imao je zelene backend i PostgreSQL dokaze, ali je frontend coverage guard ispravno odbio scheduler bez lokalizovanog admin naziva; `e97b685` je zatvorio i18n ugovor.
- Finalni CI `40766102694` potpuno je zelen: backend build/test, stvarni PostgreSQL/Redis shard, frontend, docs, worker wiring, container/supply-chain i završni gate.

## Migracije i release

Paket koristi već postojeću `OutboxMessage` infrastrukturu i nema novu DB migraciju niti posebnu ručnu release DB radnju. Worker proces mora biti aktivan, kao i za ostale postojeće scheduled/outbox poslove.

## Ishod

`BA-status-page-04` je zatvoren. Start delivery više nema terminalni cap od 2.000, API request nije vezan za veličinu publike, a svaki commitovani intent ima durable retry/dead-letter/replay put i paginiranu obradu. Registar prelazi na **605 otvorenih / 87 zatvorenih / 692 ukupno**.
