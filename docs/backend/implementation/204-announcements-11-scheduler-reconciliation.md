# BA-announcements-11: scheduler reconciliation i politika propuštenih najava

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (H1 = DA, H2/H3 = N/A) uz CI `43034654290` success; vidi audit 28 §27. Sweep scheduler registrovao se samo na module initu — Redis flush/failover nakon boota trajno ga je uklanjao bez self-heala, a najava koja je u tom periodu počela i završila više nikad nije bila due, pa se njena distribucija tiho i trajno gubila.

## Izmjena

Bez migracije. `AnnouncementSweepSchedulerService` sada slijedi ustanovljeni reconciliation obrazac (inbound-email/on-call): svakih 60 s provjerava `getJobSchedulers` i ako scheduler nedostaje, ponovo ga registruje (idempotentno po scheduler id-u) uz `announcement_sweep_schedule_recovered` warn u worker logu. Eksplicitna missed-politika u `sweep()`: najava koja je završila dok sweep nije radio **ne distribuira se naknadno** (prozor prikaza je prošao), nego se unutar 24 h od kraja alarmira `announcement_missed_distribution` warn porukom, a pun due red (20) alarmira `announcement_sweep_due_cap_reached` s najstarijim početkom.

## Testovi i granice

Novi `announcement-sweep.scheduler.spec.ts` (3 testa: registracija, oporavak uz log, no-op kad postoji) i `announcements.sweep.spec.ts` (2 testa: missed alarm bez kasne distribucije, due-cap alarm). Lokalno: backend announcements suite 12 suiteova / 73 testa, ciljani ESLint. CI `43034654290` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio H1 = DA (H2/H3 = N/A) — nalaz je zatvoren, vidi audit 28 §27.
