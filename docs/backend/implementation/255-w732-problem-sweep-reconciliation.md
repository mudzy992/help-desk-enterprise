# Package closeout — W7.32

**Paket:** W7.32 — scheduler reconciliation i health satnog problem sweepa<br>
**Nalaz:** `BA-problems-14` (P2) — zatvoren<br>
**Kodni commit:** `c991bee`<br>
**Finalni testani SHA:** `dbad790`<br>
**CI:** [`44254722210`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44254722210) — zelen<br>
**DB migracije:** nema (nema schema promjene)

## Nalaz i acceptance

Nalaz iz §10 audita `23-problems.md` ima dva dijela, a audit ih je opisao zajedno:

1. **Reconciliation.** Satni sweep (`problem-sweep`, cron `23 * * * *`) registrirao je svoj raspored
   samo u `onModuleInit`. Stabilan scheduler ID (`problem-sweep-hourly`) čuvao je raspored kroz
   normalan restart, ali Redis flush ili failover na praznu instancu brisali su schedulera i **ništa
   ga nije vraćalo do sljedećeg deploya** — target podsjetnici i auto-close (`RESOLVED → CLOSED`
   poslije `autoCloseDays`) stajali bi tiho.
2. **Health.** Nije bilo provjere prisustva schedulera, starosti zadnjeg sweepa/auto-closea,
   prekoračenog backloga ni drifta isporuke notifikacija.

Acceptance: (a) radnik sam vraća raspored nakon gubitka u Redisu, bez redeploya, i to čini
idempotentno uz više instanci; (b) registracijska greška je vidljiva i ima oporavak, a obavezni
raspored ipak pada na bootu ako ne nastane; (c) gubitak rasporeda, kasni/zastali sweep i neuspjela
isporuka podsjetnika podižu alarm; (d) nema nove migracije.

**Ispravka audit teksta:** audit tvrdi „registracijska greška se guta“. U kodu prije ovog paketa to
nije bilo tačno — `onModuleInit` je hvatao grešku, logovao `problem_sweep_schedule_failed` i
**bacao** je, pa je boot padao (fail-fast). Ono što je zaista nedostajalo je oporavak **poslije**
boota: nikakav retry ni provjera. Paket je zadržao fail-fast na bootu i dodao reconcile petlju, pa je
tvrdnja sada pokrivena u oba slučaja — i preciznije dokumentovana.

**Odluka o prekoračenom backlogu:** prekoračeni rokovi su radni zalih, ne kvar. Alarm bez prag koji
je dogovorio vlasnik samo bi uvježbao ljude da ga ignorišu, a izmišljanje praga (npr. „10 prekoračenja“)
nije odluka koju paket smije donijeti sam. Zato broj otvorenih problema s prekoračenim rokom putuje
kao **detalj** alarma o zastaloj isporuci i ostaje metrika reporta `problem_backlog` (kolona
`overdue`). To je svjesno ograničenje, navedeno i u runbooku.

## Implementacija

**Reconciliation (`problems/sweep`)**

- `problem-sweep.scheduler.service.ts` sada implementira `OnModuleInit` **i** `OnModuleDestroy`.
  `onModuleInit` registruje raspored i postavlja `setInterval` od 60 s (`unref()`, pa timer ne drži
  proces na graceful shutdownu), koji poziva `reconcileSchedule()`.
- `reconcileSchedule()` čita `queue.getJobSchedulers(0, -1)`, a ako `problem-sweep-hourly` nije tamo,
  ponovno registruje raspored i loguje `problem_sweep_schedule_recovered id=problem-sweep-hourly`.
  Vraća listu vraćenih ID-eva (prazna kad ništa nije trebalo).
- Registracija ide kroz zajednički `registerRepeatableJob` (isti helper kao SLA, privacy, assets,
  announcements, on-call, inbound-email): `upsertJobScheduler` je idempotentan po ID-u, pa N workera
  konvergira na tačno jedan raspored; `attempts: 2`, exponential backoff 60 s, `removeOnComplete: 5`,
  `removeOnFail: 20` — identično ponašanje kao prije, sada kroz jedan kodni put.
- Neuspjeli reconcile se loguje kao `problem_sweep_schedule_reconcile_failed type=<Error>` i sljedeća
  minuta pokušava ponovo. Boot i dalje pada ako prva registracija ne prođe
  (`problem_sweep mandatory schedule registration failed`), jer worker bez obaveznog rasporeda ne
  smije izgledati zdrav.
- Nove konstante: `problemSweepJobLabel = 'problem_sweep'`, `problemSweepCompletedJobsToKeep = 5`,
  `problemSweepFailedJobsToKeep = 20`, `problemSweepReconcileMilliseconds = 60_000`.

**Health: scheduler presence i starost sweepa (`ops-health`)**

- `expectedProblemSchedulers` u `ops-health.constants.ts` opisuje `problem-sweep` /
  `problem-sweep-hourly` / `23 * * * *` sa `problemSchedulerLastSuccessMaxAgeMs = 75 min`
  (jedan satni prozor + grace, isto pravilo kao asset rasporedi).
- `includeExpectedAssetSchedulers` je generalizovan u `includeExpectedSchedulers` i sada sintetiše
  red i za problemski sweep: kad Redis više ne drži registraciju, kartica i alarm dobiju red sa
  `registered: false` i zadnjim poznatim uspjehom, umjesto da red tiho nestane. Time `scheduler.late`
  pokriva `not_registered`, `not_picked_up`, `failing` i `no_recent_success` — dakle i „zadnji sweep /
  zadnji auto-close je prestar“.
- Kartica **Administracija → Zdravlje sistema → Zakazani poslovi** već ima labelu
  (`problem-sweep-hourly`) i ispis `notRegistered`, pa nije trebala nova UI komponenta.

**Health: delivery drift (`problems.reminders.stuck`)**

- `problems/sweep/problem-operations.ts` definiše „zaglavljen“ istim riječima kao sweepov pick-up:
  `DEAD`, `FAILED` sa isteklim `nextAttemptAt`, `FAILED` bez `nextAttemptAt`, i `CLAIMED` stariji od
  `problemReminderClaimStaleMilliseconds` (30 min). PENDING redovi nisu zaglavljeni — čekaju svoj rok.
  `breachedProblemTargetWhere` broji `NEW`/`INVESTIGATING`/`KNOWN_ERROR` probleme sa `targetAt < now`.
- `ops-health/collect-problem-operations-signal.ts` (novi, read-only, bez ijednog ID-a problema ili
  primaoca) vraća `stuckReminderDeliveries`, `deadReminderDeliveries`,
  `oldestStuckReminderMinutes` i `breachedOpenTargets`. Probe ima vlastiti timeout (3 s) i pad vraća
  `null`, pa nepoznato stanje ne otvara alarm.
- Novi alarm `problems.reminders.stuck` (UPOZORENJE, 2/2): aktivan kad je `stuckReminderDeliveries > 0`,
  a detalj nosi i broj crklih, starost najstarijeg i broj prekoračenih rokova. Dodat je u katalog,
  `knownOpsAlertKeys`, frontend slug, ikonu, bs/en naslov/akciju, labele detalja i runbook
  (`ops/runbook/ALERTS.md#problem-reminders`).

**Šta nije promijenjeno:** sam sweep (`run()`, planiranje podsjetnika, auto-close) nije diran; nema
nove tabele, kolone, migracije ni API promjene. Retry endpoint i panel na detalju problema ostaju isti.

## Direktni testni dokaz

- `problems/sweep/problem-sweep.scheduler.spec.ts` (novi, 5 testova) — registracija na init sa
  `pattern: '23 * * * *'` i imenom joba; restore nakon gubitka uz `problem_sweep_schedule_recovered`;
  no-op kad raspored postoji (nema drugog `upsertJobScheduler`); **neuspjeli reconcile se loguje i
  sljedeća minuta uspije** (dokaz da greška nije ni progutama ni trajna); boot pada kad obavezna
  registracija ne prođe; `onModuleDestroy` zaustavlja timer (nema daljih `getJobSchedulers` poziva).
- `problems/sweep/problem-operations.spec.ts` (novi, 2 testa) — tačan oblik OR grane (DEAD, dva
  FAILED slučaja, CLAIMED sa `claimedAt < now - 30 min`) i dokaz da PENDING/SENT/NO_RECIPIENT/CANCELLED
  nikad nisu „zaglavljeni“; breached filter isključuje RESOLVED/CLOSED/CANCELLED.
- `ops-health/collect-problem-operations-signal.spec.ts` (novi, 3 testa) — mirno stanje, brojevi +
  starost najstarijeg (90 min), iste where-grane kao sweep, i zaštita od negativne starosti pri
  pomjeranju sata.
- `ops-health/ops-signal-collector.spec.ts` — sintetizovani red za `problem-sweep-hourly`
  (`registered: false`, `pattern '23 * * * *'`, `lastSuccessMaxAgeMs 75 min`) i no-op kad je
  registracija prisutna; postojeći asset testovi zadržani.
- `ops-health/evaluate-ops-signals.spec.ts` — alarm se otvara na zaglavljene redove sa punim detaljem,
  **ne** otvara se na sam prekoračeni backlog (dokumentovana odluka) ni kad je DB probe `null`;
  `scheduler.late` daje `not_registered` za sintetizovani problemski red i `no_recent_success` kad je
  zadnji uspjeh stariji od 75 min.
- `ops-health/ops-alert-catalog.spec.ts` i frontend `admin-ops-i18n-coverage.spec.ts` — katalog,
  slugovi, bs/en naslovi/akcije i labele detalja su pokriveni bez rupe.

## CI i testni dokaz

CI run [`44254722210`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44254722210) na
`dbad790`:

- **Backend:** generisani Prisma, schema validacija, artifact guard, route/guard wiring, build sa
  anotiranim dijagnostikama, lint, „suites previously blocked by missing generated Prisma types“,
  API/worker/scheduler/shutdown wiring, SLA matrica i pun Jest — zeleno.
- **PostgreSQL/Redis integration:** zeleno (13m17s), bez nove migracije.
- **Frontend:** lint, format, testovi, build, bundle/cold-route budget — zeleno.
- **Docs/CI gate/container:** docs guard, container + supply chain, CI gate — zeleno.
- **Skipped:** E2E critical flows, E2E install wizard i read-only service-form pattern inventory
  (workflow ih preskače na ovom putu; nisu „passed“).
- **Neuspjeli pokušaji:** run [`44253172895`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44253172895)
  na `c991bee` pao je **samo** u punom Jest poslu, na vlastitim tipovima u novom
  `collect-problem-operations-signal.spec.ts` (TS2345/TS2493 — `jest.fn` dubl bez tipova argumenta i
  `mock.calls[0]?.[0]` nad tupleom `[]`). Kod je u istom runu prošao build i lint; popravka je u
  `dbad790` (tipizirani dubl, `as unknown as` u where asertacijama), pa je finalni run zelen.

Dodatne lokalne provjere: `problems`+`ops-health`+`notifications`+`audit-log` = 766 testova
(727 prošlo, 39 skipped DB suiteova) sa `--maxWorkers=2`; frontend `lib/ops`+`components/admin`+`i18n`
= 128 testova prošlo; `eslint` čist na svim izmijenjenim backend i frontend fajlovima; frontend
`tsc --noEmit` čist. Backend `tsc`/`nest build` lokalno nije moguć (sandbox ne može generisati Prisma
klijent), pa je taj dokaz pokriven CI build poslom.

## Registar nalaza

- Zatvoreni: `BA-problems-14` (uz gornji acceptance dokaz i zeleni CI).
- Ostaju otvoreni u ovom auditu: `BA-problems-15`, `16`, `17`, `18`, `19`, `20`, `21`.
- Kontrolni zbir: source/plan **441** otvorenih / **255** zatvorenih / **696** ukupno
  (P1 174 / P2 370 / P3 151); ovaj registar **451** / **245**; `problems` **14/21** (7 otvorenih:
  0 P1 / 3 P2 / 4 P3) — stanje poslije ovog paketa.

## Migracija, rollout i rollback

**Nema migracije** i nema schema promjene: paket koristi postojeći `ProblemTargetReminder`, postojeći
BullMQ raspored i postojeći `ops-health` katalog. Rollout je običan deploy workera; prvi reconcile ide
60 s nakon starta, a kartica i alarm počinju mjeriti odmah (prvi uzorak je „nema zaglavljenih“).
Rollback je vraćanje commita — stari kod ponovno registruje raspored na bootu i nema stanja koje bi
ostalo nekompatibilno. Novi alarm se ne mora gasiti: bez zaglavljenih redova ne postoji.

Operativna uputa (bs):

1. **Administracija → Zdravlje sistema → Zakazani poslovi**: red `problem-sweep-hourly`
   (`Provjera rokova problema`) mora imati stanje u redu i svjež „Zadnji uspjeh“ (≤ 75 min).
   `notRegistered` znači da raspored nije u Redisu; worker ga vraća sam u roku od minute.
2. Log workera: `problem_sweep_schedule_recovered id=problem-sweep-hourly` je očekivan oporavak;
   ponavljanje + `problem_sweep_schedule_reconcile_failed` upućuje na Redis (flush, failover,
   eviction), ne na problems modul.
3. **Administracija → Problemi → (problem) → panel „Podsjetnici na rok“**: crven red sa razlogom je
   neisporučen podsjetnik; `Ponovi` šalje ponovni pokušaj (idempotentno po fazi i roku). `NO_RECIPIENT`
   je konačan ishod politike i ne otvara alarm.
4. Alarm `Podsjetnici na rok problema ne izlaze` zatvara se sam dvije čiste provjere nakon uspješne
   isporuke; prekoračeni rokovi ostaju u reportu `problem_backlog`.
5. Čišćenje: nema artifacts; testni podaci se ne stvaraju.

Kontrolna lista (DA/NE/N/A): raspored prisutan nakon restarta **DA**; alarm se ne otvara u mirnom
stanju **DA**; ponovni pokušaj na crklom redu radi **DA**; potrebna migracija **NE**; ručno čišćenje
**N/A**.

## Sljedeći paket

Sljedeći paket je sljedeći **P2** po globalnom redu (P2 prije P3); u ovom auditu to je
**`BA-problems-15` (P2):** owner eligibility mora vezati `problem.manage` grant za OU problema i
reconciliovati revoke drift. Nije započet prije zelenog gatea za ovaj paket.
