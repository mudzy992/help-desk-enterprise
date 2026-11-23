# W7.98 — `BA-reports-08`: sweep sam vraća svoj Redis raspored, a gubitak je alarm

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „BullMQ repeat scheduler nema reconciliation nakon Redis gubitka”<br>
**Kod:** `reports/schedules/report-schedules.scheduler.service.ts` (reconcile timer + `OnModuleDestroy` +
zajednički `registerRepeatableJob`), `reports/schedules/report-schedule.constants.ts` (nove konstante
reconcile-a i delivery ugovora), `ops-health/ops-health.constants.ts` (`expectedReportSchedulers` u
`expectedSchedulers`)<br>
**Specovi:** `report-schedules.scheduler.spec.ts` (**novo, 8**),
`report-schedules.scheduler-reconciliation.integration.spec.ts` (**novo, 2**, Redis-gated, registracija u
`scripts/run-isolated-integration.mjs`), `ops-signal-collector.spec.ts` (**+2**), `evaluate-ops-signals.spec.ts`
(**+1**)<br>
**DB migracija:** **ne**<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45165674600`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45165674600) ✓ na `956ca0a`

## Nalaz

`ReportSchedulesSchedulerService.onModuleInit` je radio jedan `upsertJobScheduler` i to je bilo sve. Raspored
živi u Redis-u, ne u bazi: restart Redis-a bez perzistencije, `FLUSHALL`, failover na praznu instancu ili restore
starijeg snapshot-a ga obrišu — i **ništa** se ne žali. Do sljedećeg deploya:

1. **Ne ide nijedan zakazani izvještaj.** Sweep je jedini pokretač `runDue`, pa `nextRunAt` redovi stoje, slotovi
   se ne evidentiraju, a korisnici ne dobijaju ni izvještaj ni obavijest da ga nema.
2. **Ne nastaje ni run log.** Pošto sweep ne prolazi, `ReportScheduleRun` ostaje prazan — pa ni „Historija
   izvršenja” u UI-ju ne pokazuje da je ijedan slot propušten.
3. **Nema signala.** `report-schedules` queue je bio u `opsMonitoredQueueNames` (brojao je failed/waiting), ali
   **nije** bio u `expectedSchedulers`: `scheduler.late` ga nije gledao, pa gubitak rasporeda nije bio alarm nego
   tišina — sve do prve prijave korisnika.

## Rješenje

**Samoiscjeljujući raspored + isti zajednički ugovor registracije + obavezan raspored u ops-health.**

- **Reconcile.** Poslije inicijalne registracije servis postavlja `setInterval` na
  `reportSchedulesReconcileMilliseconds` (**60 s**) koji zove `reconcileSchedule()`: jedan
  `queue.getJobSchedulers(0, -1)`, provjera kroz zajednički predikat `isSchedulerRegistered` (prihvata `key` i
  `id` oblik — isti popravak koji je W7.86 uveo za sedam sweepova) i ponovna registracija **samo** kad rasporeda
  nema, uz `logger.warn report_schedules_schedule_recovered id=report-schedules-5min`. Registracija je
  idempotentna po ID-u, pa se dva workera koja se istovremeno „popravljaju” ne mogu udvojiti. Timer je
  `unref()`-ovan (ne drži proces ni jest workera na životu) i čisti se u `onModuleDestroy`; drugi `onModuleInit`
  ne pravi drugi timer.
- **Zajednički ugovor.** Registracija ide kroz `registerRepeatableJob` kao kod ostalih sweepova, sa istim
  delivery parametrima koje je ovaj queue imao i ranije: `attempts: 1`, `removeOnComplete: { count: 5 }`,
  `removeOnFail: { count: 20 }`. Jedan pokušaj je namjeran — ponovni pokušaj istog sata takmičio bi se sa svojim
  nasljednikom za isti `slotKey` (claim je unique), pa retry ne bi donio ništa osim šuma.
- **Alarm.** Novi `expectedReportSchedulers` ulazi u `expectedSchedulers`, pa health collector sintetiše red i kad
  Redis nema registraciju, a `scheduler.late` pokriva četiri stanja: `not_registered`, `not_picked_up`, `failing`
  i `no_recent_success`. Budžet je `reportSchedulesLastSuccessMaxAgeMs` = **20 min** (četiri petominutna
  prozora): jedan propušten prozor je spor sweep ili jitter rolling restarta, četiri znače da sender stoji.
- **Neuspjeh reconcile-a je vidljiv, ali ne obara worker.** Greška iz `reconcileSchedule()` se loguje kao
  `report_schedules_schedule_reconcile_failed type=…`, a sljedeći tick pokušava ponovo; worker nastavlja da radi
  svoje ostale queue-ove.

### Zašto ne drugačije

- **Samo alarm, bez reconcile-a.** Alarm kaže „ne radi”, ne vraća raspored — svaki Redis restart bi tražio
  ljudsku intervenciju ili deploy da zakazani izvještaji ponovo krenu.
- **Samo reconcile, bez alarma.** Ako Redis odbija upis, reconcile tiho ne uspijeva svakih 60 s i posao nestane
  bez ijednog signala. Zato idu zajedno.
- **Perzistentni raspored u bazi.** Uvelo bi novu tabelu, reconcilirajući posao i migraciju za istu stvar koju
  BullMQ već zna — registracija je jeftina i idempotentna.
- **`every: 5 min` umjesto cron-a.** Zadržan je `*/5 * * * *`, pa se slotovi poravnavaju sa petominutnim
  granicama i `nextRunAt` semantika ostaje nepromijenjena.

### Cijena

Jedan `getJobSchedulers` na 60 s po worker instanci (jedan Redis roundtrip — jeftinije od bilo kojeg job-a koji
pokreće) i nula novih upita prema bazi. Nema nove kolone, nema novog queue-a, nema nove rute.

## Posljedice po ponašanje

- **Namjerno:** izgubljen raspored se vraća u roku od minute, sa istim ID-em i istim cron-om; paralelni
  reconcile je bezopasan.
- **Namjerno:** registracija koja padne na bootu i dalje obara worker (`report_schedules mandatory schedule
  registration failed`) — self-heal nije zamjena za ispravnu konfiguraciju.
- **Reconcile ne nadoknađuje propuštene slotove**, samo vraća raspored: `runDue` šalje najnoviji propušteni slot,
  a starije bilježi kao `SKIPPED`/`missed` (design §5.4). To je postojeća politika, ne regresija.
- **Novi alarmni prag:** sweep koji nije završio 20 min diže `scheduler.late`. Duži zastoj Redis-a sada proizvodi
  alarm umjesto tišine — i to je poenta nalaza.

## Testni dokaz

- **`report-schedules.scheduler.spec.ts` (novo, 8):** init registruje petominutni raspored kroz zajednički ugovor
  (i pinuje `attempts`/keep-counts); zdrava registracija se ne dira; legacy `id` oblik se prihvata; poslije
  gubitka `reconcileSchedule()` vraća `['report-schedules-5min']` i warnuje; timer sam zove reconcile i staje na
  `onModuleDestroy`; dva `onModuleInit` ne prave dva timera; neuspjeli reconcile se loguje i sljedeći tick
  pokušava ponovo; greška ručnog reconcile-a ostaje vidljiva pozivaocu.
- **`report-schedules.scheduler-reconciliation.integration.spec.ts` (novo, 2, stvarni Redis):** poslije
  `removeJobScheduler` reconcile vraća registraciju i raspored ponovo postoji sa istim pattern-om; dva workera
  protiv istog Redis-a daju **tačno jedan** raspored.
- **Ops-health:** `ops-signal-collector.spec.ts` **+2** (red se sintetiše kad Redis nema registraciju; budžet
  20 min), `evaluate-ops-signals.spec.ts` **+1** (`not_registered` i `no_recent_success` za
  `report-schedules-5min`).
- Lokalno: backend **946 suite / 5.455 testa** ✓ (103 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`
  /`REDIS_HOST`), `reports` **37 suite / 203 testa** ✓; `eslint` 0; `wiring` 632 rute; `db:migration-policy` 124
  (bez nove migracije); `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **`runNow` nema command idempotency** — dvoklik i dalje šalje dva manualna izvještaja: `BA-reports-16` (P3).
- **SMTP accepted → DB mark crash prozor** — `BA-reports-09` (P2).
- **Retention zavisi od sweep-a** (`pruneRuns` je best-effort) — `BA-reports-14` (P2).
- **Nadoknađivanje propuštenih slotova** nije uvedeno: politika je „samo najnoviji” (§5.4); ako se to ikada
  promijeni, mijenja se `runDue`, ne reconcile.

## CI i testni dokaz

**Run [`45165674600`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45165674600) — success iz prvog
pokušaja** (push na `arena/864951a6-help-desk-enterprise`, commit `956ca0a`, `CI gate` ✓). Poslovi:
`Backend build + test` ✓, `Backend PostgreSQL + Redis integration` ✓ (102/102 izolovana suitea uključujući novi
`report-schedules.scheduler-reconciliation.integration.spec.ts` — postoji `REDIS_HOST`, pa Redis acceptance nije
skip nego stvarno izvršenje), `Frontend build + test` ✓, `Docs guard` ✓, `Backend container + supply chain` ✓;
`E2E *` preskočeni (nema `e2e` promjena u ovom paketu).

**Zašto je prošlo bez popravke:** jedina nova zavisnost van unit testova je `getJobSchedulers()` na `Queue`, koji
je već korišten u sedam postojećih self-heal servisa i u `ops-signal-collector`-u — pa oblik podatka (`key` vs
`id`) i tipovi nisu bili nova nepoznanica. Lokalni stub Prisma nije dirao ovaj paket (nema DB promjena).

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **946 suite / 5.455 testa** ✓, 103 suite skipped (integracije bez `PRIVACY_IT_DATABASE_URL`/`REDIS_HOST`) |
| `jest src/modules/reports` | **37 suite / 203 testa** ✓ (+5 skipped, uključujući nova dva integraciona speca) |
| `eslint src/modules/reports src/modules/ops-health src/scheduled-jobs.wiring.spec.ts scripts/run-isolated-integration.mjs` | 0 problema ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **316** / otvoreno **380** |

## Registar nalaza

`BA-reports-08` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **316 zatvoreno /
380 otvoreno / 696**; Val 7 **95 / 18 (0/8/10)**, `reports` **8/19**.

## Veze

- [Audit 26 — §7 i §24 (closeout)](../audits/26-reports.md)
- [W7.86 — isti obrazac u `knowledge-base`](308-w786-knowledge-base-13-scheduler-reconciliation.md)
- [W7.97 — run log preživi brisanje rasporeda](319-w797-reports-07-run-tombstone.md)
