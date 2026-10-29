# W4.1 — Persisted request-idempotency claim/result primitive

**Status:** završen 25.10.2026.  
**Implementacija:** `290af66`, korekcija testa `f475adc`, završni cleanup/doc commit (ovaj dokument).  
**CI dokaz implementacije:** `40211114841` — potpuno zelen, uključujući stvarni PostgreSQL migration replay i izolovane integration testove.

## 1. Isporučeni ugovor

`RequestIdempotencyService` je jedini reusable claim/result API. Namespace je 3–80 znakova i koristi lowercase machine-name format; key je 8–128 znakova. Canonical JSON request se SHA-256 hashira. Isti `(namespace,key)` s drugim hashom stabilno pada sa `IDEMPOTENCY_PAYLOAD_MISMATCH`.

Prvi poziv atomskim `INSERT ... ON CONFLICT DO NOTHING` upisuje `PROCESSING` claim, UUID owner token, 30-sekundni lease i 24-satni retention. Aktivni duplikat dobija `IDEMPOTENCY_REQUEST_IN_PROGRESS`; istekli lease se reclaimuje tek pod row lockom i dobija novi owner token. Nema read-before-write correctness prozora.

Business callback prima isti Prisma `TransactionClient` u kojem se claim red zaključava i rezultat mijenja u `SUCCEEDED`. Zato business efekt i persisted HTTP status/JSON body commitaju ili rollbackuju zajedno. Kvar callbacka ostavlja ranije commitovan `PROCESSING` claim; nakon lease expiryja novi owner ga može sigurno reclaimovati. Retry nakon izgubljenog odgovora vraća persisted rezultat uz `replayed=true`, bez callbacka.

Response body je ograničen na 64 KiB. Uspjeh se zadržava 24 sata. `purgeExpired(batchSize)` briše istekle redove u bounded batchu 1–1.000 (default 500), uz ponovnu expiry provjeru pri deleteu.

## 2. Persistencija i release granica

Migracija `20271025160000_request_idempotency` dodaje enum `IdempotencyStatus`, tabelu `IdempotencyRecord`, unique `(namespace,key)` i maintenance indekse. Runtime schema sentinel pomjeren je na ovu migraciju. Runtime aplikacija i dalje nema DDL prava.

> **Obavezna release radnja:** migraciju `20271025160000_request_idempotency` treba ručno pokrenuti kroz release migrator pri releaseu/redeployu. Obični runtime deploy je ne izvršava.

## 3. Dokaz

Stvarni PostgreSQL testovi dokazuju:

1. paralelni duplicate delivery: jedan callback i stabilan in-progress ugovor za aktivni duplikat;
2. retry poslije izgubljenog odgovora: persisted rezultat bez drugog efekta;
3. isti key + drugi payload: stabilan hash mismatch;
4. rollback callbacka i reclaim nakon isteka leasea;
5. migration replay, restricted runtime DML i puni backend build/lint/test prolaze u CI `40211114841`.

Prvi CI `40210853965` ispravno je otkrio da je test očekivao čekanje/replay umjesto definisanog aktivnog in-progress ugovora; test je korigovan da provjerava stvarni acceptance contract. Produkcijski algoritam nije oslabljen.

## 4. Scope i nalazi

W4.1 isporučuje platformsku primitivu; ne prebacuje automatski postojeće domenske command handlere. Zato nijedan domenski finding nije umjetno zatvoren i registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**. Ti nalazi se zatvaraju tek kada konkretni caller koristi ovu primitivu i dobije vlastiti dokaz.

## 5. Sljedeći paket

Sljedeći paket je **Backend Val 4 / W4.2 — transactional outbox sa leaseom, attempts, nextAttemptAt, terminal stateom i replay alatom**.
