# Paket 213 — BA-announcements-19: delivery test pokrivenost

**Status:** zatvoreno (CI 43193350545 success, uključujući Redis integration; vlasnik potvrdio Z1 = DA; audit 28 §45).
**Nalaz:** audit 28 §3.19 (P3) — delivery suite je bio compile-blocked (zastarjeli generisani Prisma client bez announcements delegata), a nedostajali su concurrency/Redis/SMTP/large-audience testovi.

## Stanje pokrivenosti i nove promjene

| Aspekt iz nalaza | Pokriće |
| --- | --- |
| Compile-blocked suite | Riješeno regeneracijom Prisma clienta u CI-ju; `announcement-delivery.spec.ts` se izvršava u svakom CI runu (generated-Prisma build + full test). |
| SMTP kvar | Postojeće: „counts a failed send and carries on", „revisits a previously failed recipient before completing the run", „keeps the run open while a failed recipient retry is not yet due" (BA-09). |
| Large audience | Postojeće: fan-out „notifies the complete publication audience beyond 20,000 in bounded keyset pages" (BA-03) + batch test u delivery specu. |
| **Concurrency (novo)** | `announcement-delivery.spec.ts`: (1) Teams objava se ne šalje kad drugi worker osvoji CAS claim (`updateMany` count 0); (2) dva paralelna sweepa za isti otvoreni run claim sloju predaju identičan `(dedupeKey, userId)` par po primaocu — bez nasumičnog ključa po pokušaju, pa notifications claim mašina (DUPLICATE grana u `deliverNotificationEmail`) sprječava dupli e-mail. |
| **Redis (novo)** | `announcement-scheduler-reconciliation.integration.spec.ts`: pravi BullMQ/Redis — sweep (BA-11) i retention (BA-17) scheduleri se registruju, nakon uklanjanja scheduler zapisa (model flush/failovera) `reconcileSchedule()` ih vraća. Registrovano u `scripts/run-isolated-integration.mjs`; bez `REDIS_HOST` se preskače. |

## Dokaz

- Lokalno (stub harness): delivery spec **17/17** (2 nova concurrency testa), integration spec se preskače bez Redisa po dizajnu; runner harness `node --test scripts/run-isolated-integration.test.mjs` **20/20**.
- CI integration job (PostgreSQL + Redis) je autoritativan za Redis acceptance.
