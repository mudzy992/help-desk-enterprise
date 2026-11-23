# W7.103 — `BA-reports-14`: retention run loga kao zaseban, batched i vidljiv posao

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Run retention prune je best-effort i zavisi od aktivnog sweepa”<br>
**Kod:** `report-schedule-run-retention.ts` (**novo**), `report-schedule.constants.ts`,
`scheduled-report.runner.ts`, `report-schedules.processor.ts`, `report-schedules.scheduler.service.ts`<br>
**Specovi:** `report-schedule-run-retention.spec.ts` (**novo, 7**), `report-schedules.processor.spec.ts`
(**novo, 4**), `report-schedules.spec.ts` (+3), `report-schedules.scheduler.spec.ts` (+1, 5 ažurirano),
`scheduled-jobs.wiring.spec.ts` (11 rasporeda), `report-schedule-run-tombstone.integration.spec.ts` (stvarni pass)<br>
**DB migracija:** **ne** (indeks `ReportScheduleRun(createdAt)` već postoji)<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45194677143`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45194677143) ✓ na `ed03e9a`

## Nalaz

Design §5.3 obećava da se run log čuva **180 dana**, ali je jedina implementacija bila:

```ts
// runDue(), na samom kraju
await this.prisma.reportScheduleRun
  .deleteMany({ where: { createdAt: { lt: cutoff } } })
  .catch(() => undefined);
```

Tri problema:

1. **Retention je zavisio od isporuke.** `runDue` je prvo čitao konfiguraciju i vraćao se kad scheduled e-mail nije
   uključen — pa je isključivanje slanja **trajno zaustavljalo** brisanje. Isto za konfiguraciju koja ne može da se
   učita (throw prije prune-a).
2. **Nije imao svoj raspored ni signal.** Nije postojao dnevni/nightly posao koji garantuje rotaciju; `scheduler.late`
   je pratio samo sweep kao cjelinu, a prune nije ostavljao ni log liniju — „uspješno 0 redova” i „nije radio godinu”
   izgledali su isto.
3. **Neograničeno i tiho.** Jedan `deleteMany` nad cijelim backlogom drži dug lock i pravi jedan veliki WAL burst, a
   `.catch(() => undefined)` pretvara `deadlock` ili prekid konekcije u tišinu.

## Rješenje

### 1. Bounded pass (`report-schedule-run-retention.ts`)

`pruneReportScheduleRuns(prisma, { now, batchSize?, maxBatches?, retentionDays? })`:

- čita **id-eve** najstarijih redova izvan prozora (`take = batchSize`, `orderBy: createdAt asc`),
- briše tačno te id-eve (`deleteMany({ where: { id: { in } } })`) — idempotentno, sigurno uz paralelni prolaz,
- kratak batch znači da je prozor prazan; pun batch tjera novi upit,
- staje na `maxBatches` (40 × 500 = 20 000 redova po prolazu) i tada vraća `remaining: true`,
- vraća `{ deleted, cutoff, batches, remaining }`,
- **baca** grešku na DB problem (nema `catch` unutra).

### 2. Zaseban dnevni posao

`report-schedules-retention-daily`, cron `17 3 * * *`, job `prune-schedule-runs`, 3 pokušaja sa eksponencijalnim
backoff-om, na istoj `report-schedules` queue. Procesor ga rutira u `ScheduledReportRunner.pruneExpiredRuns()` i
**pušta grešku do BullMQ-a** (retry + `failed` signal). Reconcile (W7.98) sada provjerava **oba** rasporeda i vraća
samo one koje je stvarno vratio.

### 3. Sweep prži prije svog gate-a

`runDue` poziva retention **prije** čitanja konfiguracije, u `try/catch` koji loguje
`report_schedule_run_prune_failed reason=…` i **nastavlja isporuku**. Tako:

- isključen scheduled e-mail ne zaustavlja rotaciju,
- pad retentiona ne zaustavlja izvještaje (retention problem ≠ delivery problem),
- i ako dnevna registracija nestane, petnaestominutni sweep i dalje rotira log.

### 4. Vidljivost

Svaki prolaz: `report_schedule_runs_pruned deleted=… cutoff=… batches=… remaining=…`. Dnevni posao se retry-uje;
sweep failure ide u log i ne mijenja ishod isporuke.

### Zašto ne drugačije

- **Zadržati prune samo u sweepu, ali prije gate-a** rješava tačku 1, ali ne tačku 2: rotacija bi i dalje zavisila
  od delivery posla (i od njegovog `schedulesPerSweep` budžeta) — nalaz eksplicitno traži da retention ne zavisi od
  sweepa.
- **Posebna queue** bi dala per-job `lastSuccessMaxAgeMs` u ops-health kartici, ali uvodi novu queue u worker,
  ops-health listu i sve wiring testove za posao koji traje milisekunde. Retention zato radi na **oba** mjesta, a
  sweep (koji je expected scheduler sa alarmom od 20 minuta) garantuje da rotacija ima pokrivenu budnost.
- **Postgres `pg_cron`/TTL** nije dostupan u target okruženju i vezao bi politiku za bazu, ne za aplikaciju.
- **Brisanje bez batcheva, ali sa `LIMIT` u podupitu** bi i dalje bilo jedan statement nad velikim brojem redova;
  batch po id-u drži lock kratkim i daje tačan broj obrisanih.

## Posljedice po ponašanje

- Isti prozor (180 dana) i ista tombstone semantika (W7.97): run preživi brisanje rasporeda i briše se samo
  retentionom.
- Novo: rotacija radi i kad je isporuka isključena; prolaz je ograničen i prijavljuje `remaining`; greška je vidljiva
  (log + BullMQ retry) umjesto `<catch>`-a.
- Worker sada drži **11** periodičnih rasporeda (10 ranije) — `scheduled-jobs.wiring.spec.ts` to pinuje.
- Bez migracije, bez novih ruta, bez promjene API-ja.

## Testni dokaz

`report-schedule-run-retention.spec.ts` (**novo, 7**):

1. briše samo redove starije od prozora i vraća `cutoff` = `now − 180 d`;
2. briše u batchevima (puni pa kratki batch, bez trećeg čitanja);
3. staje na budžetu i vraća `remaining: true` (6 od 9 obrisano uz `batchSize 2`, `maxBatches 3`);
4. idempotentan drugi prolaz nad istim `now` briše 0;
5. red **tačno na** `cutoff` ostaje;
6. DB greška izlazi iz funkcije (`rejects.toThrow('deadlock detected')`) — regresija za tiho gutanje;
7. prozor dolazi iz konstante, ne od pozivaoca.

`report-schedules.processor.spec.ts` (**novo, 4**): retention job zove samo `pruneExpiredRuns`; greška retentiona
ide do BullMQ-a; sweep job zove `runDue`; manual job traži `scheduleId` i ignorira job bez njega.

`report-schedules.spec.ts` (+3): prune radi sa **isključenom** isporukom (i to prije gate-a, sa `lt cutoff`);
pad prune-a se loguje (`report_schedule_run_prune_failed`) i isporuka ide dalje; `pruneExpiredRuns` loguje
`report_schedule_runs_pruned deleted=… cutoff=…`.

`report-schedules.scheduler.spec.ts` (+1, 5 ažurirano): dva rasporeda na init-u, reconcile vraća **samo** onaj koji
nedostaje (`report-schedules-retention-daily`), legacy `id`-shape i dalje prihvaćen, timer testovi drain-uju oba
`await`-a.

`report-schedule-run-tombstone.integration.spec.ts` sada poziva **stvarni** pass (`batchSize: 1`) na PostgreSQL-u
umjesto ručno napisanog `deleteMany`-ja — batched `findMany` + `deleteMany` put je dokazan na pravoj bazi.

Lokalno: backend **950 suite / 5.506 testova** ✓ (104 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`);
`reports/schedules` **10 suite / 82 testa**; `eslint` 0; `wiring` 632 rute; `db:migration-policy` 124 (bez nove
migracije); `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **Per-job ops-health signal** za dnevni retention (`lastSuccessMaxAgeMs` na nivou posla, ne queue-a) — svjesno
  izostavljeno; retention radi i na sweepu koji je expected scheduler sa alarmom. Kandidat za budući ops paket.
- **Privacy matrica** nad run JSON-om, primaocima i mail kopijama — `BA-reports-13`.
- **Strict cache schema/version/size** — `BA-reports-15`; **`runNow` idempotency** — `BA-reports-16`;
  **PDF intent** — `BA-reports-17`; **preview read-audit** — `BA-reports-18`.

## CI i testni dokaz

**Run [`45194677143`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45194677143) — success** (push na
`arena/864951a6-help-desk-enterprise`, commit `ed03e9a`, `CI gate` ✓). Poslovi: `Backend build + test` ✓,
`Backend PostgreSQL + Redis integration` ✓ (103/103 izolovana suitea — uključujući tombstone integraciju koja sada
zove stvarni retention pass), `Frontend build + test` ✓, `Docs guard` ✓, `Backend container + supply chain` ✓;
`E2E *` preskočeni (nema `e2e` promjena).

**Prvi run [`45189712610`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45189712610) je pao** i to
je dokumentovan dio posla:

1. `TS2493` u `report-schedules.scheduler.spec.ts` — mock `upsertJobScheduler` nije deklarisao argumente, pa je
   `mock.calls[i][0]` bio prazan tuple. Lokalni `jest` (ts-jest sa `diagnostics` isključenim za neke fajlove) to nije
   uhvatio, CI `nest build` jeste. Popravka: mock prima `(schedulerId, repeat, template)`.
2. `admin-ops-i18n-coverage.spec.ts` — frontend katalog traži da **svaki** `*SchedulerId` iz backend modula ima
   čitljiv naziv u oba jezika. Dodat `report_schedules_retention_daily` (`bs`: „Rotacija historije izvršavanja
   izvještaja”, `en`: „Report run-log retention”).
3. `break-glass-command.integration.spec.ts` (`IDEMPOTENCY_REQUEST_IN_PROGRESS`) — **nepovezan flake** u tickets
   modulu: test istovremeno šalje dva identična zahtjeva i očekuje jedan replay, a pod opterećenjem drugi zahtjev
   zatekne živ `PROCESSING` lease. Ponovljeni run je prošao bez izmjena u tom kodu; flake nije „popravljan” u ovom
   paketu da se ne bi mijenjao tuđi domen bez nalaza.

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **950 suite / 5.506 testova** ✓, 104 suite skipped |
| `jest src/modules/reports` | **41 suite / 254 testa** ✓ (+6 skipped) |
| `jest src/modules/reports/schedules` | **10 suite / 82 testa** ✓ |
| `eslint` (`reports/schedules`, audit-log) | 0 problema ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **321** / otvoreno **375** |

## Registar nalaza

`BA-reports-14` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **321 zatvoreno /
375 otvoreno / 696**; Val 7 **100 / 11 (0/1/10)**, `reports` **13/19**.

## Veze

- [Audit 26 — §29 (closeout) i §12 (registar)](../audits/26-reports.md)
- [W7.97 — run log preživi brisanje rasporeda](319-w797-reports-07-run-tombstone.md)
- [W7.98 — scheduler reconciliation](320-w798-reports-08-scheduler-reconciliation.md)
- [W7.102 — ugovor prozora](324-w7102-reports-12-window-semantics.md)
