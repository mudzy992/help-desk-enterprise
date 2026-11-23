# W7.97 — `BA-reports-07`: brisanje rasporeda više ne briše run historiju (tombstone)

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Brisanje schedulea kaskadno briše run historiju prije 180 dana”<br>
**Kod:** `scheduled-report.runner.ts` (`claim` prima zapis rasporeda i u svaki run upisuje
`scheduleName`/`organizationalUnitId`; `runManual` isto; `pruneRuns` komentar), `report-schedules.service.ts`
(`loadLastRuns` preskače odvezane runove, komentar u `remove`), `prisma/schema/reporting.prisma`
(`ReportScheduleRun`: `scheduleId String?`, `scheduleName`, `organizationalUnitId`, `onDelete: SetNull`, novi
indeks)<br>
**Specovi:** `report-schedules.spec.ts` **+2** (`W7.97` snapshot za schedulirani i manualni run; harness dobio
`reportSchedule.findUnique`), `report-schedule-run-tombstone.integration.spec.ts` (**novo, 3**, PostgreSQL)<br>
**DB migracija:** **da** — `20271201170000_report_schedule_run_tombstone` (**124.**), destructive approval
(`DROP CONSTRAINT` + vraćanje FK sa `SET NULL`; backfill prije `NOT NULL`)<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** _(upisuje se po završetku runa)_

## Nalaz

`ReportScheduleRun.scheduleId` je bio `NOT NULL` sa `onDelete: Cascade`. Brisanje rasporeda (`DELETE
/report-schedules/:id`) zato je brisalo **i cijeli njegov run log**, bez obzira na to što je retention politika
(§5.3, `reportScheduleLimits.runRetentionDays = 180`) predviđala da se runovi čuvaju 180 dana. Tri posljedice:

1. **Historija nestaje prije roka.** Raspored napravljen i obrisan u roku od dvije sedmice nestaje zajedno sa
   svakim runom — nema podataka da je slanje ikada bilo zakazano ni kome je poslano.
2. **Brisanje je „tiha” operacija nad dokazima.** Audit `report.schedule.deleted` pamti ime i broj primalaca, ali
   ne i runove: ko je i kada dobio koji izvještaj nestaje u istoj transakciji.
3. **Retencija gubi smisao.** Isti podatak se briše na dva načina — 180 dana za žive rasporede, trenutno za
   obrisane — pa politika zadržavanja zavisi od toga da li je raspored još živ.

## Rješenje

**Run nosi vlastiti snapshot rasporeda, a FK je `ON DELETE SET NULL`.**

- `ReportScheduleRun` dobija `scheduleName` i `organizationalUnitId` (oba `NOT NULL`) — vrijednosti se uzimaju u
  trenutku kreiranja runa (`claim`, `runManual`, missed-slot `createMany`), pa odvezan run i dalje kaže koji ga je
  raspored proizveo i kojoj je jedinici pripadao.
- `scheduleId` postaje `nullable`; FK mijenja `ON DELETE CASCADE` → `ON DELETE SET NULL`. Brisanje rasporeda
  **odvezuje** runove umjesto da ih obriše.
- Indeks `(organizationalUnitId, createdAt)` drži OU-scoped upite nad run logom (i budući retencijski/privacy
  posao iz `BA-reports-13`) bez skena.
- `pruneRuns` (180 dana) ostaje **jedini** put kojim run nestaje; vrijedi isto za žive i obrisane rasporede.
- `loadLastRuns` preskače runove bez `scheduleId` (tombstone se ne miješa u „zadnji run” živih rasporeda).

**Backfill u migraciji:** svi preživjeli runovi imaju živ raspored (kaskada je već pobrisala siročiće), pa
`UPDATE … FROM "ReportSchedule"` popunjava snapshot prije nego što kolone postanu `NOT NULL`. Migracija je
destruktivna samo po obliku (`DROP CONSTRAINT` + isti constraint sa `SET NULL`), bez brisanja podataka — zato ima
approval unos u `ops/migrations/destructive-approvals.json`.

## Posljedice po ponašanje

- **Namjerno:** brisanje rasporeda više ne smanjuje broj run redova. Run log raste dok ga retention ne počisti.
- **Namjerno:** run obrisanog rasporeda nije dostupan kroz `GET /report-schedules/:id/runs` (raspored više ne
  postoji, pa `requireAccessible` vraća 404) — podatak ostaje u bazi za forenziku/retention, ne kao nova ruta.
- **Nepromijenjeno:** `slotKey` je i dalje unique, pa ponovno kreiran raspored sa istim imenom ne nasljeđuje
  slotove starog; retention i dalje briše po `createdAt`.
- **Granica:** OU se briše kaskadno zajedno sa svojim rasporedima; runovi tada ostaju sa OU **snapshotom** (nema FK
  na `OrganizationalUnit`, namjerno — inače bi i OU kaskada brisala dokaze).

## Testni dokaz

- `report-schedule-run-tombstone.integration.spec.ts` (**3**, PostgreSQL): (1) brisanje rasporeda ostavlja run sa
  `scheduleId = NULL` i sačuvanim imenom/OU, (2) run stariji od 180 dana nestaje prune-om dok svježi preživljava,
  (3) run bez `scheduleName` se odbija (`NOT NULL`).
- `report-schedules.spec.ts` (**+2**): schedulirani claim i manualni run nose `scheduleName`/`organizationalUnitId`;
  missed-slot `createMany` redovi isto.
- Lokalno: backend **945 suite / 5.444 testa** ✓ (102 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`),
  `reports` **36 suite / 195 testa** ✓ (4 skipped integracione suite, uključujući novi tombstone spec); `eslint` 0;
  `wiring` 632 rute; `db:migration-policy` **124**; `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **Pristup historiji obrisanog rasporeda** kroz UI/API nije uveden — svjesno, da se ne doda nova ruta bez
  zahtjeva; podatak je u bazi i pokriven retencijom.
- **Retencija zavisi od sweep-a** (`pruneRuns` je best-effort i `.catch(() => undefined)`) — to je `BA-reports-14`.
- **Privacy matrica** nad run JSON-om, primaocima i `scheduleName` snapshotom — `BA-reports-13`.
- **Exactly-once isporuka** e-maila — `BA-reports-09`; **BullMQ reconciliation** — `BA-reports-08`.

## CI i testni dokaz

_(upisuje se po završetku runa)_

## Registar nalaza

`BA-reports-07` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **315 zatvoreno /
381 otvoreno / 696**; Val 7 **94 / 18 (0/8/10)**, `reports` **7/19**.

## Veze

- [Audit 26 — §7 i §23 (closeout)](../audits/26-reports.md)
- [W7.96 — transakcijski audit](318-w796-reports-06-transactional-audit.md)
- [W7.94 — limit rasporeda](316-w794-reports-04-schedule-limit-lock.md)
