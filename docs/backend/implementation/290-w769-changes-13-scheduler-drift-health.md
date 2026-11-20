# W7.69 — `BA-changes-13`: scheduler koji se sam vraća i mjerljivo zdravlje sweepa

**Paket:** Val 7, audit 24 / `changes` — scheduler, reminders i downtime drift<br>
**Nalaz:** `BA-changes-13` (P2) — „Scheduler nema Redis-loss reconciliation ni delivery/downtime drift
health”<br>
**Kodni commit:** `6254166` · **CI:** [44722424829](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44722424829)<br>
**DB migracija:** **nema** — dva ograničena upita i jedan Redis metrički zapis

## Šta je nalaz tvrdio

Audit 24 §9 (četiri tačke):

1. **Scheduler se registruje samo pri bootu.** `ChangeSweepSchedulerService` je zvao
   `upsertJobScheduler` jednom u `onModuleInit`. Redis flush ili failover na praznu instancu briše schedule i
   **ništa ga ne vraća do redeploya** — kvartalni sweep tiho prestane, pa ne izlaze ni najave početka ni
   upozorenja na prekoračenje.
2. **Registracijska greška poslije boota se ne reconciliuje.** Boot je fail-fast (dobro), ali ako registracija
   padne u toku rada nema ponovnog pokušaja.
3. **Nema health metrike**: nema scheduler presence, last-run, upcoming-undelivered, overdue backlog ni
   downtime-drift brojeva. Kartica „System health” nije mogla odgovoriti da li podsjetnici izlaze.
4. **Downtime drift je postojao, ali se nije vidio.** `ChangeDowntimeOutboxReconciler` je drift trovao i
   logovao, a brojevi nisu nigdje završili — pa „da li servisni kalendar još prati plan?” nije bilo mjerljivo.

## Šta je urađeno

**1. Sweep se sam vraća** (`sweep/change-sweep.scheduler.service.ts`)

`reconcileSchedule()` jednom u minuti (`changeSweepReconcileMilliseconds = 60_000`) pročita
`queue.getJobSchedulers(0, -1)`; ako `changeSweepSchedulerId` nije tu, ponovo registruje i loguje
`change_sweep_schedule_recovered id=…`. Registracija ide kroz zajednički `registerRepeatableJob` helper (isti
keep-counts kao prije: 5 completed / 20 failed, attempts 2, exponential backoff 60 s) — isti obrazac kao
problem sweep iz W7.32. `upsertJobScheduler` je idempotentan po scheduler id-u, pa N workera konvergira na
**tačno jedan** schedule. Timer je `unref()`-an i čisti se u `onModuleDestroy`.

Boot ostaje fail-fast: worker koji ne može da zakaže sweep ne smije se pretvarati da je zdrav. Greška u
reconcile prolazu se loguje kao `change_sweep_schedule_reconcile_failed` i **ne ruši proces** — sljedeća minuta
pokušava ponovo.

**2. Sweep je sada očekivani scheduler** (`ops-health/ops-health.constants.ts`)

`expectedChangeSchedulers` ulazi u `expectedSchedulers`, pa `scheduler.late` pokriva:

| Stanje | Značenje |
| --- | --- |
| `not_registered` | schedule nije u Redis-u (flush/failover) |
| `not_picked_up` | job zakazan, ali ga nijedan worker nije uzeo |
| `failing` | job pada u zadnjem prozoru |
| `no_recent_success` | nema uspjeha duže od `changeSweepLastSuccessMaxAgeMs = 30 min` (jedan prozor + grace) |

**3. Drift prolaz se zapisuje** (`changes/change-downtime-drift-metrics.ts`)

`ChangeDowntimeDriftMetricStore` piše u Redis `changes:ops:downtime-drift` sa TTL-om 24 h, a `read()` je
**fail-closed**: nečitljiv zapis vraća `null` (nepoznato), nikad `0`. Reconciler broji cijeli keyset prolaz
(`pass.scanned`, `pass.driftedIds` — `Set`, da change koji se pomjerio između stranica bude jedan) i zapisuje
**samo kada kursor obiđe cijeli skup ili je tabela prazna** — inače bi brojevi opisivali zadnjih 100 redova.
Greška zapisa je `change_downtime_drift_metrics_failed` i ne prekida prolaz.

**4. Novi ops signal `changeOperations`** (`ops-health/collect-change-operations-signal.ts`)

| Grupa | Polja |
| --- | --- |
| `reminders` | `upcoming24h`, `dueReminders`, `overdueOpen`, `oldestOverdueMinutes`, `reminderHoursBeforeStart` |
| `delivery` | `pending`, `processing`, `deadLetter`, `oldestPendingMinutes` |
| `downtime` | `skippedServices24h`, `lastPass { completedAtMs, scanned, drifted }` |

Dva ograničena upita (sa `opsProbeTimeouts.changeOperationsMs = 3_000`) plus čitanje Postavki i jedan Redis
read. `null` znači **„nije izmjereno”** i u kartici se prikazuje kao „Nepoznato” — nikad kao nula, jer bi nula
tvrdila da je red prazan. Preskočeni servisi zbog tuđeg preklapanja (`skippedServices24h`) idu kroz `$queryRaw`,
jer Prisma `where` ne poznaje `jsonb_array_length`. Drift prolaz stariji od `changeDriftPassMaxAgeMs = 10 min`
(dva reconciler intervala + margina) takođe postaje `null`.

**5. Dva nova alarma** (`ops-health/ops-alert-catalog.ts`)

| Ključ | Uslov | Severity | Hysteresis | Runbook |
| --- | --- | --- | --- | --- |
| `changes.reminders.stuck` | dead-letter > 0 **ili** najstariji pending ≥ `changeReminderPendingWarningAgeMs` (15 min) | WARNING | 2 / 2 | `change-reminders` |
| `changes.downtime.drift` | završen prolaz sa `drifted > 0` | WARNING | 2 / 2 | `change-downtime-drift` |

Jedno drift otkriće je normalno — reconciler ga sam ponovo uputi; alarm postoji za slučaj da se drift
**ponavlja**. Nepoznat signal (isključen collector) nikad ne pali alarm.

**6. Kartica i runbook**

- Nova sekcija `ChangeOperationsSummary` u „System health” (`data-testid="ops-health-changes"`): osam
  `MetricTile`-a u tri stanja (`ok`/`warning`/`unknown`), bs/en copy, `ops-health-api.ts` tipovi.
- Alert slugovi `changes_reminders_stuck` / `changes_downtime_drift` + ikone (`BellRing`, `CalendarSync`) i
  labele svih 11 novih detail polja — inače bi kartica prikazala sirove ključeve.
- `ops/runbook/ALERTS.md`: dva reda u tabeli i dvije sekcije (`## change-reminders`, `## change-downtime-drift`)
  sa tačnom UI putanjom, provjerom i čišćenjem.

## Dokaz

- `change-sweep.scheduler.spec.ts` (5): boot registracija sa istim opcijama, boot fail-fast, reconcile vraća
  schedule kad ga nema, ne dira postojeći, greška reconcilea se loguje bez pada.
- `change-downtime-drift-metrics.spec.ts` (3): zapis sa TTL-om, čitanje, fail-closed `null` na grešku Redisa.
- `change-downtime-outbox-reconciler.service.spec.ts` (11, +4): prolaz sa wrap-om zapisuje `{scanned: 3,
  drifted: 2}`, prazna tabela zapisuje `{0, 0}`, pad Redisa ne obara prolaz (`resolves.toBe(0)`), djelimičan
  prolaz **ne** zapisuje.
- `collect-change-operations-signal.spec.ts` (6): brojevi, `null` za nepoznat Redis/drift prolaz, preskočeni
  servisi kroz raw upit, timeout.
- `evaluate-ops-signals.spec.ts` + `ops-alert-catalog.spec.ts` (**88**): oba alarma neaktivna bez signala,
  dead-letter, star pending, poravnanje ključeva sa runbookom i severity/hysteresis.
- Backend: `npx jest src/modules/changes src/modules/ops-health` **42 suite / 339 testa**; `eslint` 0 errora;
  `wiring:check` 99 controllera / 631 ruta; `db:migration-policy:check` 121 migracija (bez nove).
- Frontend: `ops-health-change-operations.spec.tsx` (4) + i18n/lib.ops/admin **22 fajla / 139 testova**;
  cijeli suite **464 fajla / 1849 testova** zelen; `tsc`, `eslint`, `prettier`, `i18n:check` (9249 ključeva,
  bs/en parity), `module-size` (novi fajl ~150 linija) čisti.
- E2E nije diran; full E2E pokreće korisnik na kraju Vala 7.

## Preostali rizik

1. **Reconcile je „eventually”, ne trenutan** — između brisanja schedule-a i sljedeće provjere prođe do 60 s.
   To je namjerno: gušći interval bi značio Redis poziv po minuti po workeru bez koristi.
2. **`no_recent_success` mjeri sweep, ne isporuku** — sweep može uspješno pisati u outbox dok isporuka stoji;
   to pokriva `changes.reminders.stuck` (dead-letter i star pending), pa se dva alarma ne preklapaju bez
   potrebe.
3. **Drift brojevi su zadnji završen prolaz**, ne kontinuirani brojač. Prolaz koji traje duže od 10 min
   (velika baza) prikazuje se kao „Nepoznato” dok se ne završi — bolje nego prikazati pola skupa.
4. **Marker `reminderSentAt`/`overdueNotifiedAt`** ostaje claim koji outbox preuzima; nalaz iz §9 o markeru
   vezanom za neuspjelu isporuku zatvoren je ranije (W7.46 / `BA-changes-07`), ovaj paket ga ne dira i ne
   duplira `components.changeReminderOutbox`.
5. **Kartica zavisi od workera koji piše signal** — na instalaciji bez `change-sweep-worker` sekcija je
   „Nepoznato”, a alarmi neaktivni. To je fail-closed odluka, ne tišina.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-14` (CAB eligibility hard-limit 100 tiho izostavlja članove i mijenja
quorum).
