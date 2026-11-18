# Package closeout — W7.40

**Paket:** W7.40 — granice sweep-a i klamp bulk/sweep postavki<br>
**Nalaz:** `BA-problems-18` (P3) — **zatvoren**<br>
**Kodni commit:** `2ec2b18` (klamp + sweep granice + health metrike), `e81d0cf` (tip testa)<br>
**Finalni testani SHA:** `e81d0cf`<br>
**CI:** [`44325092985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44325092985) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Dvije tihe neograničenosti i jedna mjerna slijepa tačka:

1. **Postavke sweep-a i grupnog rješavanja** provjeravane su pri pisanju (1–1000 tiketa, 0–365 dana, 1–365
   radnih dana), ali loader je pri čitanju prihvatao **bilo koji cijeli broj**. Red iz baze koji je nastao
   prije validacije, vraćen iz backupa ili ručno promijenjen mogao je odlučiti koliko tiketa jedan zahtjev
   rješava sekvencijalno.
2. **Satni sweep** imao je samo broj redova (500), bez vremenske granice i bez dokaza da je batch pun. Tick
   koji ne stigne nije to nigdje rekao; nije bilo ni metrike koja pokazuje da zaostatak **raste**, a ne samo
   da postoji.
3. **Bulk rješavanje** je po zahtjevu sekvencijalno, pa mu je granica resursa upravo `bulkResolveMax`;
   W7.24 durable run (`PARTIAL` + resume) već pokriva prekid rada.

Acceptance: (1) nijedna postavka ne može zaobići granicu kroz bazu, (2) tick ima vremensku granicu i javlja
šta je odgodio, (3) pun batch je dokazan, a ne pretpostavljen, (4) zaostatak ima starost, ne samo broj,
(5) ništa se ne gubi tiho.

## Implementacija

- **Jedan izvor granica.** `problemSettingBounds` (`bulkResolveMax` 1–1000, `autoCloseDays` 0–365,
  `targetWorkingDays` 1–365) koristi i `assertValue` pri pisanju i novi `clampIntegerSetting` pri čitanju.
  Van granica se **ne odbija zahtjev**, nego se vrijednost svodi na najbližu granicu; ne-broju se vraća
  default. Tako `100000` u bazi ponaša se kao `1000`, a ne kao poziv koji satima vrti tikete.
- **Sweep: dokazan batch.** Obje faze traže `batch + 1` red; ako stigne 501, batch je pun i to se loguje
  (`problem_sweep_batch_cap_reached phase=… batch=500`). Redoslijed je i dalje najstariji-prvi
  (`resolvedAt: 'asc'`, `targetAt: 'asc'`), pa cap odgađa **najnovije**, a najstariji ne gladuju.
- **Sweep: vremenski budžet.** `problemSweepTickBudgetMilliseconds` = 5 min za satnu kadencu. Deadline se
  provjerava **između redova** (nikad unutar transakcije), pa je prekid čist: `deferred` broji redove koji
  su učitani i nisu obrađeni, `budgetReached` kaže da tick nije stao jer je posla nestalo, a log je
  `problem_sweep_budget_reached phase=… processed=N deferred=M`. Sljedeći tick počinje tim redovima.
- **Legacy ulazi netaknuti.** `autoClose()` i `remindDetailed()` ostaju omotači (`closed` / `counts`), da
  postojeći pozivaoci i testovi ne mijenjaju ugovor; puni ishod nose nove `autoClosePass`/`remindPass`
  metode.
- **Health: starost, ne samo broj.** `ProblemOperationsSignal` dobija
  `oldestOverdueTargetMinutes`, `autoCloseDue`, `oldestAutoCloseDueMinutes` i `effectiveAutoCloseDays`.
  Definicija „due“ je **jedna funkcija** (`autoCloseDueWhere`) koju koriste i sweep (zatvara) i sonda
  (broji), pa se ne mogu razići. `autoCloseDays: 0` = „nikad“, pa ništa nije due; nečitljiva postavka je
  `null` („nepoznato“), nikad tiša nula.
- **UI.** Nova sekcija „Operativne metrike problema“ na kartici Zdravlje sistema (uz metrike imovine) sa
  šest brojeva i linijom „Prag auto-zatvaranja: N dana“; iste brojeve nosi i `problemReminderStuck` alarm
  kao detalje, sa bs/en labelama. Stariji API bez polja je „nedostupno“, ne nula.

## Direktni testni dokaz

- `problem-settings.spec.ts` (6) — klamp na granicama i van njih, fallback za ne-broj, defaulti unutar
  granica, te da `assertValue` odbija tačno one vrijednosti koje bi čitanje moralo klampati.
- `problem-access.service.spec.ts` (+2) — `bulkResolveMax: 100000 → 1000`, `autoCloseDays: -3 → 0`,
  `target.criticalWorkingDays: 0 → 1`, `'14' → default`; u granicama ostaje netaknuto.
- `problem-sweep.service.spec.ts` (6, novi) — budžet istekao prije prvog reda ⇒ 0 obrađenih, `deferred: 3`;
  budžet istekao u toku batcha ⇒ obrađen 1, `deferred: 2`; 501 red ⇒ 500 obrađenih + log cap-a; obje faze
  `orderBy` najstariji-prvi i `take: batch + 1`; omotači rade bez budžeta.
- `problem-operations.spec.ts` (+3) — `autoCloseDueWhere` granica, `0` = nikad (`null`), ista definicija
  za sweep i sondu.
- `collect-problem-operations-signal.spec.ts` (7, ažuriran) — starost najstarijeg prekoračenog roka,
  starost auto-close zaostatka mjerena **od roka** (20 dana riješen + 14 dana prag = 6 dana), `0 dana` bez
  upita, nečitljiva postavka ⇒ `null`.
- `evaluate-ops-signals.spec.ts` — alarm nosi nova četiri detalja; sam zaostatak i dalje ne otvara alarm.
- `ops-health-metrics.spec.tsx` (+4) — brojevi i starosti na kartici, `unknown` za nečitljivu postavku,
  `unavailable` za stariji API, validna `dl` struktura.

## CI i testni dokaz

CI run [`44325092985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44325092985) na `e81d0cf`:

- **Backend:** Prisma schema + generisani klijent, wiring manifest, build sa dijagnostikom, lint, ranije
  blokirani suiteovi, API/worker/scheduler/shutdown wiring, SLA matrica i pun Jest — uspješno.
- **PostgreSQL/Redis integration**, **frontend** (lint, format, pun suite, build), **docs**, **container +
  supply chain** i **CI gate** — uspješno.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`.
- **Neuspjeli pokušaj:** run [`44322679559`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44322679559)
  na `2ec2b18` pao je u koraku Jest-a na **vlastitoj** grešci u novom specu (`TS2352`: cast iz parametra
  mocka koji je deklarisao samo `where`); popravljeno u `e81d0cf` bez promjene ponašanja.

Lokalno: backend pun `jest` — 867/871 suiteova, 4 padaju samo zbog sandbox zamjene Prisma klijenta
(`Prisma.sql` tekst, dinamički import, diskovno skladište, `null` semantika) i nisu vezani za ovaj paket;
`eslint` 0 grešaka; `check-backend-wiring.mjs` i `check-migration-policy.mjs` (119 migracija) prolaze.
Frontend: `tsc -b`, `prettier --check`, `eslint`, pun `vitest` **459 fajlova / 1.813 testova** i
`check-pulse-design-system.mjs`.

## Registar nalaza

- Zatvoreni: `BA-problems-18` (P3).
- Ostaju otvoreni u ovom auditu: `BA-problems-19` i `BA-problems-21` (P3).
- Kontrolni zbir (prebrojan iz `backend-findings-plan.json` i redova registra): source/plan
  **436 otvorenih / 260 zatvorenih / 696**; ovaj registar **446/250**; Val 7 **39/111** (72 otvorena:
  13/40/19); `problems` **19/21**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene; postojeće vrijednosti postavki se ne prepisuju — klamp je na čitanju,
pa je i „popravka“ baze samo promjena postavke u UI-ju. Rollback je vraćanje prethodne slike. Health polja su
aditivna; stariji frontend ih ignoriše, novi frontend na starijem API-ju prikazuje „nedostupno“.

## Sljedeći paket

**W7.41 — `BA-problems-19` (P3):** osam direktnih suiteova bilo je compile-blocked i nedostaje
concurrency/failure E2E matrica; paket zatvara blokadu i dokumentuje matricu (pokretanje E2E-a traži
izričitu dozvolu). Nije započet prije zelenog gatea za ovaj paket.
