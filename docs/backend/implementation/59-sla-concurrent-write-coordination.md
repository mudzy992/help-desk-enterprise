# W5.32 — Koordinacija konkurentnih SLA pisanja

**Finding:** `BA-sla-02`  
**Implementacija:** `0342d63`, `b749eb0`, `9181872`  
**CI:** `40552249815` — zelen

## Problem

Scanner i lifecycle/request putanja su odvojeno radili read/evaluate/update nad cijelim `TicketSlaState` zapisom. Dva workera su zato mogla računati iz istog prethodnog snapshota, vratiti noviji `respondedAt` ili pause/breach/escalation marker na staru vrijednost i proizvesti konkurentne transition intente.

## Implementacija

`syncTicketSlaTimers` sada cijeli produkcijski read/evaluate/write ciklus izvršava u jednoj Prisma transakciji pod PostgreSQL transaction-scoped advisory lockom izvedenim iz ticket ID-a. Scanner, scheduler i request/lifecycle putanje koriste isti entry point i isti lock namespace, pa se pisanja za jedan ticket serijalizuju, dok različiti ticketi ostaju paralelni.

State promjena i W5.31 outbox intent koriste istu zaključanu transakciju. Drugi writer zato nakon čekanja ponovo čita commitovani state prvog writera; transition collector vidi aktuelne markere, a stabilni outbox dedupe ključ ostaje dodatna exactly-once granica.

`Ticket.firstResponseAt` je dodatno promijenjen u monotoni first-writer-wins conditional write (`WHERE firstResponseAt IS NULL`), pa zakašnjeli scanner ili request ne može zamijeniti prvi odgovor novijim timestampom. In-memory adapter zadržava eksplicitni single-threaded fallback.

## PostgreSQL dokaz

Novi obavezni `sla-write-lock.integration.spec.ts` koristi dva nezavisna Prisma/PostgreSQL klijenta i dokazuje:

1. dva konkurentna workera za isti ticket nikad nisu istovremeno u kritičnoj sekciji;
2. dva različita ticketa nisu globalno serijalizovana.

Suite je eksplicitno registrovan u isolated integration runneru, a harness test sprečava njegovo slučajno uklanjanje. Postojeći SLA state-machine testovi dokazuju sticky/monotone breach, response, pause i escalation ponašanje, dok transactional-outbox PostgreSQL suite dokazuje atomic intent, dedupe i single-worker delivery.

## Validacija

- backend ESLint — zelen;
- isolated integration runner harness — **3/3**;
- generated Prisma build i kompletna Jest kolekcija — zeleni u CI-ju;
- novi stvarni PostgreSQL concurrency shard — zelen;
- CI `40552249815` — potpuno zelen, uključujući backend, PostgreSQL/Redis, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju. PostgreSQL advisory lock koristi postojeću infrastrukturu i ne zahtijeva ručnu release DB radnju.

## Ishod

Scanner i lifecycle writer više ne mogu izgubiti međusobne monotone state markere niti nezavisno emitovati istu tranziciju iz zastarjelog snapshota. `BA-sla-02` je zatvoren; registar prelazi na **624 otvorena / 68 zatvorenih / 692 ukupno**.
