# W5.40 — Atomic and repairable SLA startup seed

**Finding:** `BA-sla-10`  
**Implementacija:** `e47a774`  
**CI:** `40572931191` — zelen

## Problem

Početni SLA profil, njegova četiri priority pravila, tri escalation nivoa i audit zapisi ranije su nastajali kroz više nezavisnih transakcija. Dva konkurentna starta mogla su proći iste read-before-write provjere, a prekid nakon prvog escalation reda ostavljao je ladder koji se više nije popravljao jer je seed tretirao svaki nenulti broj redova kao završen.

## Implementacija

- Svaka početna definicija sada se obrađuje u jednoj profile-level PostgreSQL transakciji.
- Transaction-scoped advisory lock koristi stabilni starting-profile key, pa radi i prije nego što profil dobije DB identifikator i serializira konkurentne instance.
- Profil, default pravila, escalation ladder i pripadajući change-log zapisi commitaju ili rollbackaju kao jedna cjelina.
- Escalation reconciliation više ne koristi `count > 0`; provjerava svaki očekivani offset `0`, `30` i `120` i kreira samo nedostajuće nivoe.
- DB unique invariant `(slaProfileId, triggerOffsetMinutes)` iz W5.38 ostaje završna zaštita od duplikata.
- Postojeće korisnički izmijenjene default vrijednosti i dodatna scope pravila se ne prepisuju.

## Dokaz

- Unit test potvrđuje reparaciju laddera koji sadrži samo preživjeli offset `30`, bez njegovog dupliranja.
- Stvarni PostgreSQL integration test pokreće dva seed procesa paralelno preko dva nezavisna Prisma klijenta i potvrđuje tačno pet profila, četiri default pravila i tri escalation nivoa po profilu.
- Isti real-DB test zatim uklanja dva nivoa, ponavlja startup seed i potvrđuje determinističnu reparaciju kompletnog laddera.
- CI `40572931191` je potpuno zelen: backend build/lint/test, realni PostgreSQL/Redis suite, migration replay, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu DB release radnju.

## Ishod

Startup seed je concurrency-safe, profile-level atomičan i može popraviti parcijalno postojeće početne escalation laddere. `BA-sla-10` je zatvoren; registar prelazi na **616 otvorenih / 76 zatvorenih / 692 ukupno**.
