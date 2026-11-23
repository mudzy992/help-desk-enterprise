# W7.96 — `BA-reports-06`: izmjena rasporeda i njen audit red su jedna transakcija

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Schedule mutation/run finalizacija i globalni audit nisu atomarni”<br>
**Kod:** `reports/schedules/report-schedules.service.ts` (`create`, `update`, `setEnabled`, `remove` + `auditIn` /
`auditInput`), `reports/schedules/scheduled-report.runner.ts` (finalizacija runa i `report.schedule.sent` u jednom
`$transaction`); specovi: `report-schedules.audit-atomicity.spec.ts` (**novo, 6**), `report-schedules.spec.ts`
(+1 za runner, harness dobio `$transaction`), `report-schedule-audit-atomicity.integration.spec.ts` (**novo, 3**,
PostgreSQL); registracija u `scripts/run-isolated-integration.mjs`<br>
**DB migracija:** **ne** — mijenja se samo granica transakcije<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

Svaka izmjena rasporeda je committovala prvo, a **onda** pisala globalni audit red:

```ts
await this.prisma.$transaction([…]);              // raspored + primaoci
await this.audit(actor, auditLogActions.reportScheduleUpdated, …);  // tek poslije commit-a
```

Iz toga slijede tri konkretna kvara:

1. **Audit padne, izmjena ostaje.** Administrator dobije grešku i pomisli da ništa nije promijenjeno, a raspored
   je već promijenjen — i bez traga u audit lancu.
2. **Proces padne između dvije stavke.** Izmjena postoji bez zapisa, ili brisanje ostane „nevidljivo” u auditnom
   smislu: red je obrisan, a nema zapisa ko ga je obrisao i šta je nestalo.
3. **Isto u runner-u.** `ReportScheduleRun` se finalizuje (status/sentCount), pa se tek onda piše
   `report.schedule.sent`. Pad između toga ostavlja ili završen run bez audit reda, ili run koji je i dalje
   `RUNNING` a audit tvrdi da je poslan — pa ga sweep može uzeti kao stale i poslati ponovo.

## Rješenje

**Audit red piše transakcija koja piše i izmjenu.** `recordAuditEntry` je i ranije primao transakcijski klijent
(`AuditLogTransactionalClient`); sada mu se prosljeđuje `Prisma.TransactionClient` umjesto korijenskog klijenta.

- `create`: audit se dodaje **unutar** iste transakcije koja drži limit bravu iz W7.94 (poslije `create`).
- `update`: audit ide u transakciju koja već radi CAS iz W7.95 i zamjenu primalaca. Redoslijed u transakciji je
  `updateMany` (CAS, pa `version + 1`) → primaoci → audit; „prije/poslije” snapshot se računa iz reda pročitanog
  prije transakcije, pa opisuje stanje koje je zaista commitovano.
- `setEnabled`: nova transakcija oko CAS-a i audita (audit se i dalje piše samo kad se prekidač stvarno mijenja).
- `remove`: `deleteMany` (CAS iz W7.95) i audit u istoj transakciji — brisanje i zapis o brisanju su nedjeljivi.
- `scheduled-report.runner.execute`: `reportScheduleRun.update` (finalizacija) i `recordAuditEntry` u jednom
  `$transaction`.

**Posljedica po ponašanje (namjerna):** ako audit ne može da se upiše, API sada vraća grešku **i izmjena je
poništena** — do tada je vraćao grešku uz već primijenjenu izmjenu. Za runner: ako finalizacija ne može da se
commituje, run ostaje `RUNNING` (i sweep ga po `staleRunMs` preuzima), a audit ne tvrdi da je poslan.

**Šta ostaje izvan transakcije i zašto.** `sendTest` šalje e-mail pa piše `report.schedule.test_sent`: slanje je
spoljni efekat (SMTP), pa se ne može commitovati zajedno sa zapisom — audit je tada zapis o **već poslanom**
e-mailu. Isto važi za pojedinačne isporuke primaocima unutar runner-a (`notificationEmailDelivery` ima svoj
`dedupeKey`); paket ne tvrdi exactly-once isporuku, nego atomarnost **zapisa o ishodu**.

**Redoslijed brave.** U `create` transakcija sada drži limit bravu (W7.94) **i** audit chain bravu
(`appendAuditLog` uzima `pg_advisory_xact_lock` po particiji). Redoslijed je uvijek „limit → audit chain”, a nijedan
drugi put ne uzima limit bravu, pa nema ciklusa. Cijena je nekoliko milisekundi duže držanje brave, što je
zanemarljivo za admin operaciju koja se dešava nekoliko puta dnevno.

## Testni dokaz

**`report-schedules.audit-atomicity.spec.ts` (novo, 6):** `create`, `update`, `setEnabled` i `remove` pišu
**sve** svoje redove (raspored, primaoci, audit) sa oznakom `tx`; kad audit padne, `create`/`remove` odbiju cijelu
operaciju i transakcija se rollbackuje.

**`report-schedules.spec.ts` (+1):** runner finalizuje run i piše audit u istoj transakciji (`['run:tx',
'audit:tx']`); harness je dobio `$transaction` koji prosljeđuje isti fake klijent i prati da nijedan upis nije
pobjegao van transakcije.

**`report-schedule-audit-atomicity.integration.spec.ts` (novo, 3, PostgreSQL):** sa audit klijentom koji baca
grešku, finalizacija runa se **rollbackuje** (run ostaje `RUNNING`, `finishedAt` null, nula audit redova); sa
ispravnim auditom oba reda postoje; brisanje rasporeda se rollbackuje kad audit padne (red preživi, bez audit
reda). Padajući audit je injektovan pošteno — klijent zadržava `$executeRaw` (chain bravu) transakcije, a baca
samo na `auditLog.create`.

**Lokalno:** backend **945 suite / 5.442 testa** (101 suite skipped: integracije bez baze); `reports` **36 suite /
193 testa** (+7); `eslint` zelen; `wiring:check` **632 rute**, `db:migration-policy:check` **123 migracije**,
`check-docs-content` OK. Frontend nije diran.

## Šta nije urađeno i zašto

- **Bez outbox-a za audit.** Audit lanac je u istoj bazi kao i izmjena, pa transakcija pokriva i upis i njegov
  red; outbox bi imao smisla tek ako bi audit išao u drugi sistem.
- **`sendTest` audit nije atomaran** (spoljni e-mail) — dokumentovano gore.
- **Isporuka e-maila nije exactly-once.** `dedupeKey` po runu/primaocu sprječava duplikat na retry, ali pad nakon
  SMTP prihvatanja a prije upisa isporuke ostaje moguć; to je `BA-reports-07` (run/tombstone politika), ne ovaj
  paket.
- **Retencija/tombstone runova** (`BA-reports-07`) i **BullMQ reconciliation** (`BA-reports-08`) ostaju otvoreni.

## CI i testni dokaz

_(upisuje se po završetku runa)_

## Registar nalaza

`BA-reports-06` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **314 zatvoreno /
382 otvoreno / 696**; Val 7 **93 / 18 (0/8/10)**, `reports` **6/19**.

## Veze

- [Audit 26 — §6 i §22 (closeout)](../audits/26-reports.md)
- [317 — W7.95, verzija/CAS](317-w795-reports-05-schedule-version-cas.md)
- [316 — W7.94, limit rasporeda](316-w794-reports-04-schedule-limit-lock.md)
- [Registar nalaza](../BACKEND-FINDINGS-REGISTER.md)
