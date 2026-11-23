# W7.106 — `BA-reports-16`: „Pošalji sada” kao komanda sa identitetom

**Paket:** Val 7, `reports`, **P3**<br>
**Nalaz:** „`runNow` nema command idempotency i ponovljen zahtjev šalje novi manual report”<br>
**Kod:** `report-schedule.constants.ts` (namespace, pattern, `reportScheduleManualJobId`), `reports.constants.ts`
(novi kod), `report-schedules.controller.ts` (header), `report-schedules.service.ts` (`runNow`), `scheduled-report.runner.ts`
(`runManual` + `ManualRunOutcome`), `report-schedules.processor.ts`, `map-reports-error.ts`, `reports.module.ts`,
`database-runtime-contract.ts`<br>
**Specovi:** `report-schedules.run-now.spec.ts` (**novo, 13**), `report-schedules.spec.ts` (+4, 30),
`report-schedules.processor.spec.ts` (+1, 7), `report-schedule-run-now-idempotency.integration.spec.ts`
(**novo, 4**, PostgreSQL), `database-runtime-contract.spec.ts` (sentinel)<br>
**DB migracija:** **da** — `20271201180000_report_schedule_run_command_key` (**125.**, aditivna: kolona + unique
indeks; bez destruktivnog approvala)<br>
**Rute:** nepromijenjene po broju (632); `POST /reports/schedules/:id/run-now` sada **traži** `Idempotency-Key`<br>
**Frontend:** `report-schedules-api.ts`, `lib/reports/report-command-key.ts` (**novo**), panel; specovi (+3 api, +4
command key)<br>
**CI:** [run `45244785069`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45244785069) ✓ na `aaaa9fe`

## Nalaz

`runNow` je bio običan `POST`: provjeri pristup, `queue.add(...)`, vrati `{queued:true}`. Nijedan dio zahtjeva nije
nosio identitet komande, pa su svi ovi slučajevi bili **legitimno novi manual run** — svaki sa stvarnim e-mailom
svakom primaocu:

1. dvoklik na dugme (dva zahtjeva, dva job-a);
2. browser/proxy retry nakon timeouta (prvi zahtjev je možda prošao);
3. dvije otvorene kartice ili dva administratora koja kliknu u isto vrijeme;
4. retry job-a u workeru, ako je prvi pokušaj pao poslije prihvatanja.

`removeOnComplete: { count: 50 }` i `attempts: 1` nisu pomagali: job bez `jobId`-ja je uvijek nov. Za razliku od
`tickets/reopen`, `confidential` i `split`, koji svi idu kroz `RequestIdempotencyService`, `reports` ga nije koristio.

## Rješenje

### 1. Header je obavezan, format se validira

`POST /reports/schedules/:id/run-now` traži `Idempotency-Key` (isto kao `tickets/:id/reopen`): bez headera ili sa
samo bjelinama → `400 IDEMPOTENCY_KEY_REQUIRED`, prije ijednog poziva servisa. Servis zatim provjerava **format**
(`^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`, isti koji `RequestIdempotencyService` prihvata) i vraća
`400 REPORT_IDEMPOTENCY_KEY_INVALID` — loš header je greška klijenta, ne 500 iz idempotency sloja.

### 2. Replay na nivou zahtjeva

`runNow` ide kroz `RequestIdempotencyService.execute` u namespace-u `report.schedule.run-now`, sa payloadom
`{ scheduleId, actorUserId }`:

| Situacija | Ishod |
| --- | --- |
| prvi zahtjev | enqueue + zapis `SUCCEEDED` sa odgovorom `{queued:true}` |
| isti ključ, isti schedule | **replay** spremljenog odgovora, **nema** drugog job-a |
| isti ključ, drugi schedule/akter | `409 IDEMPOTENCY_PAYLOAD_MISMATCH` (to je druga komanda, ne ponavljanje) |
| isti ključ dok prvi traje | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` |
| bez queue-a | `{queued:false}`, kao i prije (idempotency zapis se ne pravi) |

Namespace je dio ključa u `IdempotencyRecord`, pa se ključ ne može sudariti sa tiketskom komandom iste vrijednosti.

### 3. Unique `commandKey` na run redu — prava garancija

Replay pokriva HTTP sloj, ali ne može pokriti crash **poslije** enqueue-a i **prije** commit-a idempotency zapisa, ni
dva workera. Zato ključ putuje do baze: `ReportScheduleRun.commandKey` je `String? @unique`, a runner upisuje run sa
tim ključem **prije** nego što komponuje i pošalje ijednu poruku.

- Prvi job: `create` prođe → run `RUNNING` → slanje.
- Drugi job za isti ključ: `P2002` na `commandKey` → runner **ne** šalje, loguje
  `report_schedule_manual_duplicate schedule=… run=<id prvog>` i vraća `{outcome:'duplicate'}`.
- Zakazani runovi ostavljaju `commandKey = NULL` (NULL se nikad ne sudara), pa `slotKey` dedupe ostaje netaknut.

Posljedica: **jedna komanda = jedan run = jedan e-mail**, bez obzira na broj jobova, tabova, retryja ili worker
padova. Operater koji svjesno želi još jedan izvještaj koristi **novi** ključ — i to je jedini način da se pošalje
ponovo.

### 4. Queue prima ključ, job id je bez `:`

Job payload nosi `commandKey`, a `jobId = report-manual-<sha256(key)[0..32]>`. Hash je nužan jer BullMQ koristi `:`
kao separator i odbija takve id-eve, a ključ klijenta ga smije sadržavati. `jobId` je samo jeftini dedupe za dvoklik
dok prvi job još čeka; garancija je unique kolona.

### 5. Frontend: ključ po namjeri, ne po kliku

`runReportScheduleNow(id, idempotencyKey)` šalje header. Panel drži **jedan ključ po rasporedu** dok ishod nije
poznat (`lib/reports/report-command-key.ts`): ponovni klik poslije greške je **ista** komanda (isti ključ → replay),
a ključ se oslobađa samo kad server definitivno odgovori, pa sljedeće svjesno slanje dobija novi ključ. Bez toga bi
„pokušaj ponovo” nakon timeouta bio drugi izvještaj.

## Posljedice po ponašanje

- Ponovljeni zahtjev sa istim ključem: `202 {queued:true}` iz zapisa, **bez** novog job-a i bez novog e-maila.
- Dvoklik: drugi zahtjev je ili replay ili (ako je prvi još u toku) `409`; u svakom slučaju jedan izvještaj.
- Isti ključ za drugi raspored: `409` — bolje glasna greška nego tiho preskočen izvještaj.
- Zakazani izvještaji: nepromijenjeni (`commandKey` je `NULL`).
- Migracija je aditivna; `slotKey` i njegova semantika nisu dirani.

## Testni dokaz

`report-schedules.run-now.spec.ts` (**novo, 13**): job nosi ključ i BullMQ-bezbjedan `jobId`; isti ključ dvaput
→ jedan `add`; različit ključ → drugi job; isti ključ za drugi raspored → `PAYLOAD_MISMATCH` i nijedan `add`; četiri
oblika neispravnog ključa → `REPORT_IDEMPOTENCY_KEY_INVALID` i ništa se ne upisuje; bez pristupa → `SCHEDULE_NOT_FOUND`
prije queue-a; bez queue-a → `{queued:false}`; bez injektovanog idempotency servisa (defanzivno) → i dalje queue;
mapiranje `IdempotencyError` → 400/409; kontroler odbija nedostajući/bjelinasti header **prije** servisa.

`report-schedules.spec.ts` (+4): dva `runManual` sa istim ključem → jedan run, jedan e-mail, drugi `duplicate`; novi
ključ → drugi run i drugi e-mail; job bez ključa (stari queue sadržaj) i dalje radi i piše `commandKey: null`;
nepostojeći raspored → `{outcome:'missing'}`. `report-schedules.processor.spec.ts` (+1): ključ stiže do runnera.

`report-schedule-run-now-idempotency.integration.spec.ts` (**novo, 4**, PostgreSQL): drugi insert sa istim ključem je
`P2002`; **osam paralelnih** inserta sa istim ključem → tačno jedan prolazi, sedam `P2002`; dva različita ključa → dva
reda; dva zakazana runa (`commandKey = NULL`) → dva reda.

Lokalno: `reports` **45 suite / 336 testova** (20 skipped bez baze/Redis-a), `common/database` 28, `nest build` zelen,
`npm run lint` bez grešaka, `wiring:check` 632, `db:migration-policy:check` **125** migracija; frontend
`report-schedules-api` **6** i `report-command-key` **4** testa, `tsc --noEmit` zelen.

## Otvoreno i dokumentovano

- Idempotency zapis se čuva **24 h** (zajednička politika `IdempotencyRecord`, purge postoji). Nakon toga isti ključ
  je nova komanda — ali unique `commandKey` na run redu i dalje sprečava duplikat dokle god run postoji (180 dana).
- Ključ vezuje komandu za **raspored i aktera**, ne za vrijeme: namjerno, jer retry poslije 10 minuta je ista komanda.
- `runNow` ne piše revizorski zapis (kao ni prije); run log je trag izvršavanja. Read-audit preview-a je
  `BA-reports-18`, PDF intent `BA-reports-17`.

Sljedeće u `reports`: `BA-reports-17` (PDF intent), `-18` (preview read-audit), `-19` (12 compile-blocked suiteova /
fault matrica).

## Dokaz

CI [`45244785069`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45244785069) **success** na `aaaa9fe`: `Backend build + test`, `Backend PostgreSQL + Redis integration`
(novi shard sa `report-schedule-run-now-idempotency.integration.spec.ts`), `Frontend build + test`,
`Backend container + supply chain` i `Docs guard` (`E2E` i inventura `skipped`, kako je konfigurisano).

Prvi run [`45240042433`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45240042433) pao je **samo** na
`Frontend build + test` zbog Prettier formata u `report-schedules-api.spec.ts` (lint, tsc, 477 test fajlova i build
bili su zeleni lokalno) — popravljeno u `aaaa9fe`. Detalji u
[26-reports.md, §32](../audits/26-reports.md#32-implementacijski-closeout--w7106-ba-reports-16).
