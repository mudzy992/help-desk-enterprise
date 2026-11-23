# W7.93 — `BA-reports-03`: referenca rasporeda mora pripadati izabranoj jedinici i opsegu aktera

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Schedule service/group reference nije vezana za izabrani OU/service scope”<br>
**Kod:** `reports/reports.constants.ts` (novi kod `REPORT_SCHEDULE_SCOPE_INVALID`),
`reports/schedules/report-schedule-scope.ts` (**novo**, čista validacija podstabla),
`reports/schedules/report-access.checker.ts` (`reportScheduleServiceScopeRequirements` +
`canUseScheduleService`), `reports/schedules/report-schedules.service.ts` (validacija na snimanju,
`loadScopeLabels` na čitanju), `reports/schedules/scheduled-report.runner.ts` (`visibleGroupName` za scope
liniju e-maila); testovi: nova `report-schedule-scope.spec.ts` (**5**), nova `report-schedules.scope.spec.ts`
(**9**), `report-schedules.spec.ts` (**+1**); frontend `lib/reports/report-trends-view.ts`,
`components/reports/trends/report-trends-panel.tsx`, i18n bs/en, nova
`components/reports/schedules/report-schedule-sheet.spec.tsx` (**1**)<br>
**DB migracija:** **ne** — nema promjene šeme<br>
**Rute:** nepromijenjene (632)<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

`ReportSchedulesService.validate` je za `serviceId` i `groupId` pitao samo **postoji li** red:

```ts
this.prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } }),
this.prisma.group.findUnique({ where: { id: input.groupId }, select: { id: true } }),
```

Tri posljedice, sve tihe:

1. **Grupa izvan podstabla.** Raspored je vezan za jednu organizacionu jedinicu i njene potomke, ali je
   prihvatao grupu iz **roditelja ili sestrinske grane**. Filter tada vraća prazan ili pogrešan presjek, a
   korisnik ne dobija nikakav signal da je filter besmislen.
2. **Servis van opsega aktera.** Servis je globalni katalog (nema svoj OU), pa „pripada li jedinici” nije
   pitanje — pravo pitanje je **smije li ga akter koristiti**. Nije se provjeravalo: administrator OU-a je
   mogao zakačiti izvještaj na servis koji mu nije u opsegu.
3. **Otkrivanje naziva.** Naziv strane grupe/servisa se vraćao u `schedule view` i u **scope liniju e-maila**
   („Grupa: …”), pa je primalac iz jedne jedinice saznavao za resurs izvan nje. Isto tako, različit odgovor
   za „nepostojeći” i „strani” ID bio bi oracle za postojanje.

## Rješenje

**Snimanje odbija, čitanje ne odaje, a oba odgovora za „nepoznato” i „strano” su identična.**

### Servis: opseg aktera

`reportScheduleServiceScopeRequirements` je isti zahtjev kao dekoratori kontrolera (ADMIN/SUPER_ADMIN +
`reports.schedule.manage`), ali sa `serviceScope: { field: 'serviceId' }` i `requireServiceScope: true`.
`ReportAccessChecker.canUseScheduleService` ide kroz isti `AuthorizationService`, pa važi pravilo koje vektori
već koriste: assignment **bez** servisa pokriva svaki servis, a assignment sa servisom samo taj.

### Grupa: podstablo jedinice

`report-schedule-scope.ts` je čist i pokriva granice koje su u auditu i navedene:

```ts
isGroupWithinUnitSubtree({ scopeUnitPath: '/Korisnici/IT', groupUnitPath: '/Korisnici/IT/ServiceDesk' }) // true
isGroupWithinUnitSubtree({ scopeUnitPath: '/Korisnici/IT', groupUnitPath: '/Korisnici/HR' })            // false
isGroupWithinUnitSubtree({ scopeUnitPath: '/Korisnici/IT', groupUnitPath: '/Korisnici/ITX' })           // false
```

Posljednji red je razlog zašto se ne koristi `startsWith` nad stringom: `/Korisnici/ITX` počinje sa
`/Korisnici/IT`, ali nije ispod njega. Zato helper delegira na `doesOrganizationalUnitScopeCover`, istu
funkciju kojom se ocjenjuje OU scope svuda drugdje.

### Jedan odgovor za dvije situacije

Novi kod `REPORT_SCHEDULE_SCOPE_INVALID` (400) vraća se i za **nepostojeću** i za **stranu** referencu, sa
`field: 'serviceId' | 'groupId'`. Test to pinuje doslovno: `expect(unknown).toEqual(foreign)` — ako neko
kasnije razdvoji te dvije grane, test pada. Frontend mapira kod na bs/en poruku („Izabrana usluga ili grupa ne
postoji ili nije u opsegu izabrane organizacione jedinice…”), pa korisnik zna koje polje popraviti, a API ne
kaže koji ID postoji.

### Legacy redovi: čitanje i e-mail ne odaju naziv

Validacija na snimanju ne može popraviti redove koji su već sačuvani sa stranom referencom. Zato:

- `ReportSchedulesService.loadScopeLabels` (list i get) jednim upitom učita OU stabla i grupe, pa **skriva**
  `service`/`group` naziv u pogledu ako referenca nije u opsegu čitaoca, i piše
  `report_schedule_scope_outside_subtree schedule=… group=…` u log;
- `ScheduledReportRunner.visibleGroupName` primjenjuje istu provjeru prije scope linije e-maila — primalac
  više ne vidi naziv grupe izvan svoje jedinice.

Filter se pritom ne mijenja: strana grupa i dalje daje prazan presjek (fail-closed), ali **e-mail i API više ne
tvrde** da raspored pokriva taj resurs.

## Testni dokaz

**`report-schedule-scope.spec.ts` (novo, 5):** ista jedinica i potomci prolaze; roditelj, sestra i
`/Korisnici/ITX` ne prolaze; prazna/`null` putanja ne prolazi; `describeReportScheduleScopeProblem` vraća
`groupId` ili `null`.

**`report-schedules.scope.spec.ts` (novo, 9):** stara grupa → `REPORT_SCHEDULE_SCOPE_INVALID` + `field:
groupId` i **ništa se ne upisuje**; nepoznata grupa → **identičan** odgovor kao strana; grupa u jedinici i u
potomku prolazi; servis van opsega aktera → `field: serviceId`, bez upisa; nepoznat servis → identičan odgovor;
servis u opsegu prolazi; legacy red sa stranom grupom → `group: null` i naziv **nije** u serializovanom
pogledu; legacy red sa grupom u podstablu → naziv ostaje; isto za `service` (skriven kad čitalac nema opseg,
vidljiv kad ima).

**`report-schedules.spec.ts` (+1):** `buildContent` legacy rasporeda sa stranom grupom daje
`scope.groupName === null` (a `groupId` ostaje), dok grupa iz podstabla zadržava naziv u scope liniji e-maila.

**Frontend `report-schedule-sheet.spec.tsx` (novo, 1):** forma prikazuje
`reports.errors.REPORT_SCHEDULE_SCOPE_INVALID` kada server odbije snimanje, uz `requestId` iz greške.

**Lokalno:** backend **942 suite / 5.423 testa** (98 suiteova skipped: integracije bez baze), 316 skipped;
`reports` modul **33 suite / 174 testa**; frontend **1.893 testa**, `eslint`, `tsc -b`, `prettier
--check`, `i18n:check` (bs/en parity) zeleni; `wiring:check` **99 controllera / 632 rute** (nepromijenjeno),
`db:migration-policy:check` **122 migracije** ✅, `check-docs-content` OK.

## Šta nije urađeno i zašto

- **Bez migracije i bez backfillа.** Legacy redovi se ne prepisuju automatski: ne postoji način da server
  pogodi je li strana grupa bila namjera ili greška. Oni ostaju čitljivi, ali se naziv skriva, a prvo sljedeće
  snimanje ih mora popraviti (validacija se izvršava i na `update`).
- **Filter se ne „ispravlja” u letu.** Strana referenca daje prazan presjek, nikad prošireni OU-wide presjek —
  isto fail-closed pravilo kao W7.54.
- **Bez novog audit zapisa.** Paket ne mijenja šemu audita; odbijanje je HTTP 400 i ne ostavlja zapis jer se
  ništa nije promijenilo. Postojeći `report.schedule.created/updated` metadata ostaje ista.

## CI i testni dokaz

- **Run:** [CI #45119728300](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45119728300) —
  `success` na `91cdcc2`. Svi poslovi zeleni: backend build + test, backend PostgreSQL + Redis integracije,
  frontend build + test, backend container + supply chain, **docs guard** i CI gate. Novi specovi su unit
  (bez baze), pa nisu trebali novu registraciju u `run-isolated-integration.mjs` — `wiring:check` je ostao na
  **632 rute**, `db:migration-policy:check` na **122 migracije**.
- **Prvi pokušaj je bio čist** — bez padova na build-u ili lint-u; jedina priprema prije runa bila je lokalna
  provjera (backend 942 suite / 5.423 testa, frontend 1.893 testa, `i18n:check` parity, `--check-only` matrica
  iz W7.92 i dalje zelena).

## Registar nalaza

`BA-reports-03` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **311 zatvoreno /
385 otvoreno / 696**; Val 7 **90 / 21 (0/11/10)**, `reports` **3/19**.

## Veze

- [Audit 26 — §8 i §19 (closeout)](../audits/26-reports.md)
- [275 — W7.54, presjek filtera u prilozima](275-w754-reports-02-scheduled-attachment-scope.md)
- [Registar nalaza](../BACKEND-FINDINGS-REGISTER.md)
