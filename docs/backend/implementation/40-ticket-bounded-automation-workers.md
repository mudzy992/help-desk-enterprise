# W5.13 — Bounded archive/waiting worker obrada

**Finding:** `BA-tickets-13`  
**Implementacija i dokaz:** `cb3f945`  
**CI:** `40329391858` — zelen

## Problem

Archive i waiting-for-user automatizacije koristile su neograničen `findMany`, učitavale cijelu kandidatsku populaciju i prekidale cijeli prolaz kada jedan ticket baci grešku. Waiting worker je dodatno učitavao i još nedospjele tickete pa ih odbacivao tek u aplikaciji.

## Implementirani ugovor

- zajednički `runBoundedTicketAutomation` izvršava keyset/cursor stranice;
- podrazumijevani batch je 25, a strogi per-run scan budget 100 ticketa;
- ulazne vrijednosti su odbrambeno ograničene na batch 1–100 i run budget 1–1000;
- svaki ticket ima vlastiti `try/catch`, pa poison ticket proizvodi strukturirani worker error i ne blokira ostatak stranice ili naredne stranice;
- cursor se pomjera i nakon greške, što garantuje napredak unutar trenutnog prolaza;
- sljedeći scheduler prolaz ponovo queryja preostale eligible tickete i time predstavlja continuation bez stateful memorijskog cursora;
- archive query filtrira samo `CLOSED` tickete sa `closedAt <= cutoff`, sortira po stabilnom unique `id` cursoru i koristi `take`;
- waiting query u DB-u bira samo auto-close ili još-nepodsjećene reminder kandidate prema dva cutoffa, umjesto cijele `WAITING_FOR_USER` populacije;
- postojeće per-ticket guardrail/transaction granice ostaju nepromijenjene.

## Direktni dokaz

`run-bounded-ticket-automation.spec.ts` koristi populaciju od 10.000 kandidata i potvrđuje da jedan prolaz skenira najviše 100 kroz stranice od najviše 17. Injektovani poison ticket se evidentira, dok obrada nastavlja do posljednjeg elementa run budgeta. Zaseban continuation test obrađuje 23 kandidata kroz tri poziva sa budgetom 10 (`10 + 10 + 3`) bez gubitka napretka.

Puni CI `40329391858` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-tickets-13` je zatvoren. Registar prelazi na **643 otvorena / 49 zatvorenih / 692 ukupno**.
