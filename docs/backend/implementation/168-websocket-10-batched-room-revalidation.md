# W6.53 — BA-websocket-10: batch room revalidation

**Status:** zatvoreno (2026-10-29) operativnom potvrdom vlasnika uz CI dokaz; vidi audit 18 §30.

## Promjena

- Periodični lokalni group/admin sweep deduplicira socketove po korisniku te koristi autoritativni Prisma `user.findMany` sa joined membership, ADMIN/SUPER_ADMIN role i authz-version snapshotom, u grupama od najviše 250 različitih korisnika. Servis odbija veće batch-eve. Nepostojeći korisnik mapira se na `null` i socket se disconnecta; neaktivan korisnik i authz-version drift zadržavaju postojeći fail-closed disconnect.
- Batch-evi i dalje imaju najviše 25 paralelnih worker-a, 5-sekundni timeout i 30-sekundni non-overlapping scheduler. Neuspjeli batch uklanja managed sobe pogođenih socketova bez čekanja drugih batch-eva; ako adapter ne može potvrditi cleanup, socket se disconnecta. Ostale sobe imaju zasebne kontrole. Izvor bez batch metode zadržava per-user fallback; početni connection setup koristi per-user read.
- Structured process-local logovi evidentiraju checked sockete, distinct users, authorization reads, joined/left/failed, duration, sweep lag i preskočene overlap tickove. To su log signali, ne centralni histogram ili automatski alarm.

## Dokaz i ograničenja

Lokalni ciljani Jest: **2 suitea / 22 testa prošla**, uz `ts-jest diagnostics:false` zbog nedostajućeg generated Prisma Clienta. Testovi koriste mock DB/socket adapter; pokrivaju batch dedup/chunking, context metode, fail-closed, izolaciju sporih batch-eva, concurrency cap, scheduler/lag/overlap i servisnu batch granicu. Ciljani ESLint za četiri promijenjena TypeScript fajla je prošao. Ovo nije generated-Prisma typecheck, stvarni PostgreSQL query trace ni load test. CI/acceptance nisu potvrđeni; full CI/E2E nije ručno pokretan.

`Promise.race` timeout ne otkazuje stvarni Prisma/SQL rad: tokom zastoja in-flight DB posao može premašiti wrapper concurrency i akumulirati se kroz sweepove. Velik broj membership redova po korisniku nije ograničen batch brojem korisnika. Sweep lag je kašnjenje početka u odnosu na očekivani interval, ne direktna revocation-latency metrika; wall-clock promjene utiču na vrijednost. Performans pod stvarnim opterećenjem i generated Prisma `relationLoadStrategy: join` treba potvrditi u CI/acceptance okruženju.

Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Val 6 i BA-websocket-06–11 ostaju otvoreni; BA-06 posebno čeka CI/generated-Prisma i real Redis/two-instance acceptance.
