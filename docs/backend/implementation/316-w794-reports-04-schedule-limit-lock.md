# W7.94 — `BA-reports-04`: `maxSchedules` se troši unutar zaključane transakcije

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „`maxSchedules` count-then-create je TOCTOU i limit se može prekoračiti”<br>
**Kod:** `reports/schedules/report-schedule-limit.ts` (**novo** — `withReportScheduleLimitLock` +
`withReportScheduleLimit`), `reports/schedules/report-schedules.service.ts` (`create` broji i upisuje unutar
`$transaction`), `reports/reports.constants.ts` (novi kod `REPORT_SCHEDULE_LIMIT_UNAVAILABLE`),
`reports/map-reports-error.ts` (503 za taj kod), `scripts/run-isolated-integration.mjs` (registracija nove
integracije); testovi: nova `report-schedules.limit.spec.ts` (**4**), nova
`report-schedule-limit.integration.spec.ts` (**2**, PostgreSQL); frontend `lib/reports/report-trends-view.ts`,
`components/reports/trends/report-trends-panel.tsx`, i18n bs/en, `report-schedule-sheet.spec.tsx` (**2**)<br>
**DB migracija:** **ne** — limit je i dalje broj redova; mijenja se samo **gdje** se broji<br>
**Rute:** nepromijenjene (632)<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

`create` je radio ovako:

```ts
const total = await this.prisma.reportSchedule.count();
if (total >= configuration.maxSchedules) {
  throw new ReportsError(reportErrorCodes.scheduleLimit, { max: configuration.maxSchedules });
}
// … pa tek onda create
```

Između `count()` i `create()` nema ničega. Dva administratora (ili dva taba) koji snimaju u istom trenutku oba
pročitaju `total = 49` pod limitom 50, oba prođu provjeru i instalacija završi na **51** redu. Isto tako dva
paralelna snimanja pod limitom 1 daju dva rasporeda. Greška je tiha u oba smjera: nema ni greške ni audit
signala da je limit prekršen — samo stanje koje provjera nikad nije opisivala.

## Rješenje

**Provjera i potrošnja limita su jedna transakcija sa `pg_advisory_xact_lock`.**

### Ključ je globalan, jer je i limit globalan

`maxSchedules` je broj **svih** rasporeda u instalaciji, ne po jedinici — zato svi pisci uzimaju isti ključ
(`namespace: 'reports.schedule-limit'`, `key: 'schedules'`). Drugi pisac čeka prvi, pa broji red koji je prvi
**komitovao** (READ COMMITTED uzima svjež snapshot po statementu) i dobija čisto `REPORT_SCHEDULE_LIMIT` umjesto
prepunjene tabele.

Brava je `pg_advisory_xact_lock` preko postojećeg `DatabaseLockService` (isti primitiv koji koriste
service-catalog i knowledge-base): oslobađa se na commit, na rollback i na prekinutu konekciju, pa srušen zahtjev
ne može zaglaviti limit. Lock timeout je **2 s**, namjerno kraći od Prisma-inog default budžeta interaktivne
transakcije (5 s) — inače bi `lock_timeout` stigao poslije Prisma timeouta i greška bi izašla kao nemapiran
`P2028`. Kada brava istekne, API vraća novi `REPORT_SCHEDULE_LIMIT_UNAVAILABLE` (503, „pokušajte ponovo”), a ne
lažni „limit je dostignut”.

### Critical section je jedna funkcija, ne kopija u testu

```ts
export function withReportScheduleLimit<T>(
  transaction: Prisma.TransactionClient,
  limits: { readonly maxSchedules: number },
  create: () => Promise<T>,
): Promise<T> {
  return withReportScheduleLimitLock(transaction, async () => {
    const total = await transaction.reportSchedule.count();
    if (total >= limits.maxSchedules) {
      throw new ReportsError(reportErrorCodes.scheduleLimit, { max: limits.maxSchedules });
    }
    return create();
  });
}
```

Servis je zove unutar `this.prisma.$transaction(...)`, a PostgreSQL integracija zove **istu funkciju** — pa test
dokazuje produkcijsku sekvencu, a ne njenu kopiju koja može odlutati.

### Validacija ostaje ispred brave

Redoslijed u `create` je: `requireScheduled` → `validate` (autorizacija, OU/service opseg iz W7.93, primaoci,
packovi) → **zatim** zaključana transakcija sa `count` + `create`. Validacija je skupa i ne mijenja broj redova,
pa brava drži samo dva statementa. Posljedica koju treba znati: zahtjev koji će ionako pasti na limitu sada prvo
plati validaciju — namjerna razmjena, jer je pogreška na limitu i dalje ista (`REPORT_SCHEDULE_LIMIT` sa `max`).

## Testni dokaz

**`report-schedules.limit.spec.ts` (novo, 4):** na limitu se `create` **ne poziva** i greška nosi
`{ max }`; na 49/50 redoslijed poziva je **brava → count → create** (brava se uzima prije brojanja, brojanje
prije upisa); kad brava vrati `55P03`, odgovor je `REPORT_SCHEDULE_LIMIT_UNAVAILABLE` i ništa se ne upisuje;
odbijanje je `ReportsError`, ne generički pad.

**`report-schedule-limit.integration.spec.ts` (novo, 2, PostgreSQL):** dva paralelna `withReportScheduleLimit`
poziva pod limitom 1 daju **tačno jedan** uspjeh i jedan `REPORT_SCHEDULE_LIMIT`, a broj redova je 1; treći
pokušaj na limitu je odbijen, a **brisanje rasporeda oslobađa slot** (limit je broj redova, ne brojač koji
treba resetovati).

**Frontend `report-schedule-sheet.spec.tsx` (1 → 2):** forma prikazuje
`reports.errors.REPORT_SCHEDULE_LIMIT_UNAVAILABLE` kada server vrati 503 za zauzetu bravu.

**Lokalno:** backend **943 suite / 5.427 testa** (99 suiteova skipped: integracije bez baze), 318 skipped;
`reports` **34 suite / 178 testa** (+1 integracioni koji se lokalno preskače); frontend **475 fajlova / 1.894
testa**; `eslint`, `tsc -b`, `prettier --check`, `i18n:check` zeleni; `wiring:check` **632 rute**,
`db:migration-policy:check` **122 migracije**, `check-docs-content` OK.

## Šta nije urađeno i zašto

- **Bez DB ograničenja tipa „najviše N redova”.** PostgreSQL nema deklarativni constraint za globalni broj
  redova; alternativa je brojač-red u novoj tabeli, što je migracija i novo mjesto koje može da se raziđe sa
  stvarnim brojem redova. Brava + brojanje unutar nje je isti garant bez dodatne šeme.
- **`update`/`delete` ne uzimaju bravu.** Oni ne mijenjaju broj redova prema gore (delete ga smanjuje), pa ne
  mogu prekoračiti limit; paralelni update/delete je `BA-reports-05`.
- **`runNow` idempotencija i transakcijski audit** ostaju `BA-reports-06`/`BA-reports-16`; paket ne dira
  postojeći `report.schedule.created` audit niti njegovu atomarnost.
- **Perf smoke:** registracija nove integracije dira `backend/scripts/run-isolated-integration.*`, što je putanja
  koja pokreće i `Perf smoke` workflow; ako se pokrene, njegov rezultat se navodi u CI sekciji.

## CI i testni dokaz

_(upisuje se po završetku runa)_

## Registar nalaza

`BA-reports-04` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **312 zatvoreno /
384 otvoreno / 696**; Val 7 **91 / 20 (0/10/10)**, `reports` **4/19**.

## Veze

- [Audit 26 — §6 i §20 (closeout)](../audits/26-reports.md)
- [315 — W7.93, opseg reference rasporeda](315-w793-reports-03-schedule-reference-scope.md)
- [Registar nalaza](../BACKEND-FINDINGS-REGISTER.md)
