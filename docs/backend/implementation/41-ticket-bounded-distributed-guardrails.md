# W5.14 — Bounded/distributed duplicate guardrail

**Finding:** `BA-tickets-14`  
**Implementacija i dokaz:** `bfcc328`  
**CI:** `40331048262` — zelen

## Problem

Duplicate-ticket detekcija je čitala sve tickete requester/service para i tek u memoriji filtrirala vremenski prozor i parent/reopen redove. Guardrail repeat count koristio je samo process-local Promise lanac, pa su različite API/worker replike mogle istovremeno pročitati isti count i probiti `maxRepeatsPerSubject`.

## Implementirani ugovor

- duplicate candidate query sada u PostgreSQL-u filtrira requester, service, `parentTicketId IS NULL`, `reopenedFromTicketId IS NULL` i `createdAt >= windowStart`;
- query je deterministički sortiran po `createdAt DESC, id DESC` i strogo ograničen na 100 najnovijih kandidata prije CPU similarity izračuna;
- uveden je PostgreSQL transaction-scoped advisory lock izveden iz guardrail subject ključa;
- repeat `count + create` sada se izvršavaju pod istim distributed lockom i u istoj transakciji;
- helper prepoznaje kada caller već posjeduje transaction client, pa ne otvara nevažeću nested transakciju;
- create-ticket duplicate preflight premješten je u istu transakciju kao ticket insert i isti distributed requester/service lock, pa druga replika nakon čekanja vidi committed ticket prve replike;
- postojeći process-local lock ostaje samo jeftina optimizacija unutar jedne replike; correctness granica je PostgreSQL;
- sequence retry čisti prethodni warning sink prije ponovnog transactional pokušaja.

## Direktni dokaz

`guardrail-distributed-claim.integration.spec.ts` na stvarnom PostgreSQL-u paralelno pokreće 20 različitih fingerprinta za isti subject uz limit tri. Test potvrđuje tačno tri `claimed`, 17 `loop` odluka i tačno tri persisted claima. Puni CI ujedno potvrđuje postojeće duplicate-window, same-fingerprint i in-memory create guardrail testove.

Puni CI `40331048262` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Koristi PostgreSQL advisory transaction lock i postojeću `GuardrailClaim` shemu.

Korisnik je potvrdio da je prethodna W5.12 migracija `20271026120000_ticket_side_effect_outbox` uspješno izvršena.

## Ishod

`BA-tickets-14` je zatvoren. Registar prelazi na **642 otvorena / 50 zatvorenih / 692 ukupno**.
