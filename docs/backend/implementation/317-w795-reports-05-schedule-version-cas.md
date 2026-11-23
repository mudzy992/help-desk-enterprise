# W7.95 — `BA-reports-05`: admin izmjene rasporeda su uslovljene verzijom (`If-Match`)

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Schedule mutation nema version/CAS; paralelni update/enable/delete je last-write-wins”<br>
**Kod:** `prisma/schema/reporting.prisma` (`ReportSchedule.version`), migracija
`20271201160000_report_schedule_version`, `common/database/database-runtime-contract.ts` (schema sentinel),
`reports/schedules/report-schedules.controller.ts` (`If-Match` na `PUT`/`PATCH enabled`/`DELETE`),
`reports/schedules/report-schedules.service.ts` (CAS u `update`/`setEnabled`/`remove` + `staleScheduleWrite`),
`reports/schedules/report-schedule.record.ts` i `ReportScheduleView.version`; testovi: nova
`report-schedules.version.spec.ts` (**8**), nova `report-schedule-version.integration.spec.ts` (**3**, PostgreSQL);
frontend `services/report-schedules-api.ts` (+`If-Match`, +`version`), `components/reports/schedules/*`,
`lib/reports/report-trends-view.ts`, `components/reports/trends/report-trends-panel.tsx`, i18n bs/en, novi
`services/report-schedules-api.spec.ts` (**3**) i `report-schedule-sheet.spec.tsx` (**2 → 3**); e2e
`e2e/tests/18-reports-schedules.spec.ts` (brisanje nosi token)<br>
**DB migracija:** **da, aditivna** — `version INTEGER NOT NULL DEFAULT 1`<br>
**Rute:** nepromijenjene (632), ali tri rute sada **traže** `If-Match`<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

`update`, `setEnabled` i `remove` su pisali po `id`-ju, bez ikakve predpostavke o stanju koje je klijent vidio:

```ts
await this.prisma.reportSchedule.update({ where: { id }, data: { ...data.fields, enabled } });
```

Dva administratora (ili isti administrator u dva taba) otvore isti raspored; prvi promijeni primaoce, drugi —
koji je formu otvorio prije prvog — promijeni naziv i snimi. Rezultat je **drugi upis koji vraća primaoce na
staro stanje**, bez ikakve greške: prvi administrator je upravo izgubio svoju izmjenu i nikada to ne sazna. Isto
važi za prekidač `enabled` i za brisanje: brisanje reda koji je neko upravo uredio uništava rad koji niko nije
namjeravao odbaciti.

## Rješenje

**Verzija na redu + `If-Match` na tri admin rute**, po istom obrascu koji već koriste `announcements`,
`service-catalog` i `changes`.

### Token

- `ReportSchedule.version Int @default(1)` (migracija `20271201160000_report_schedule_version`, aditivna).
- `ReportScheduleView.version` nosi token do klijenta; API prima `If-Match: "vN"` (`parseIfMatch` iz
  `common/optimistic-concurrency`, isti parser koji koristi `announcements`).
- Nedostajući header ⇒ **428** `OPTIMISTIC_PRECONDITION_REQUIRED`; neispravan/weak/wildcard/multi-value ⇒ **400**
  `OPTIMISTIC_IF_MATCH_INVALID`. Oba se dižu prije servisa, pa neispravan zahtjev ne dira bazu.

### CAS je predikat, ne „pročitaj pa uporedi”

```ts
const updated = await transaction.reportSchedule.updateMany({
  where: { id, version: expectedVersion },
  data: { ...data.fields, enabled, version: expectedVersion + 1 },
});
if (updated.count !== 1) throw await this.staleScheduleWrite(id);
```

- `count !== 1` znači da red nije bio na očekivanoj verziji: **ništa nije upisano**, ni raspored ni primaoci
  (zamjena primalaca je u istoj transakciji, poslije CAS-a).
- `staleScheduleWrite` klasifikuje gubitak: red koji je u međuvremenu obrisan ⇒ **404**
  `REPORT_SCHEDULE_NOT_FOUND` (isti kod kao ostatak modula); red koji je otišao dalje ⇒ **412**
  `OPTIMISTIC_STALE_WRITE` sa `currentEtag: "vN"`, pa klijent zna šta je aktuelno.
- `deleteMany({ where: { id, version } })` je brisanje istom logikom: briše se **red koji je korisnik vidio**.
- `setEnabled` provjerava token i kad prekidač ne mijenja ništa: tab koji je iza mora to da sazna, a ne da mu se
  potvrdi zastarjela slika.
- Servis dodatno odbija `expectedVersion` koji nije siguran cijeli broj ≥ 1. To nije paranoja: Prisma **izbacuje**
  `undefined` iz `where`, pa bi nedostajući token tiho vratio običan slijepi upis — tačno onaj bug koji paket
  uklanja. Kontroler je prva linija (428), servis druga (400).

### Verziju dižu samo admin izmjene

Scheduler i runner pišu `lastRunAt`/`nextRunAt` bez `version`, pa noćni run **ne** pretvara otvoren editor u lažni
konflikt (dokazano integracijom). Sukobljavaju se samo dvije ljudske izmjene, što je i smisao nalaza.

### Klijent

- `services/report-schedules-api.ts` šalje `If-Match` na sve tri rute; tip `ReportSchedule` nosi `version`.
- Lista i forma prosljeđuju **verziju reda koji je korisnik učitao** (`schedule.version`), a ne svježe pročitanu.
- Na 412 lista se **sama osvježava** i prikazuje poruku `reports.errors.OPTIMISTIC_STALE_WRITE` (bs/en):
  „neko drugi je izmijenio ovaj raspored … otvorite ga ponovo”, pa „pokušajte ponovo” postaje radnja, a ne savjet.

## Testni dokaz

**`report-schedules.version.spec.ts` (novo, 8):** zastarjeli `update` ⇒ 412 sa `currentEtag: "v5"` i **bez** diranja
primalaca; svjež `update` ⇒ `where {id, version: 5}` i `version: 6`; nedostajući token ⇒ 400 **bez** `updateMany`
(zaštita od Prisma `undefined`); zastarjeli (i bespredmetni) `setEnabled` ⇒ 412 bez upisa; zastarjeli `remove` ⇒ 412,
svjež ⇒ `deleteMany {id, version}`; obrisan red ⇒ 404 modula; kontroler: `PUT`/`DELETE` bez headera ⇒ 428, `W/"v2"`
⇒ 400, a `"v7"` se prosljeđuje kao **broj 7**.

**`report-schedule-version.integration.spec.ts` (novo, 3, PostgreSQL):** dva paralelna `updateMany` iz iste verzije
daju `[0, 1]` — tačno jedan upis, verzija 2; `deleteMany` briše samo prikazanu verziju (stara ⇒ `count 0`, red
ostaje); run koji upiše `lastRunAt` **ne** mijenja verziju i editor i dalje može snimiti.

**Frontend:** `report-schedules-api.spec.ts` (3) — `If-Match: "vN"` na `PUT`/`PATCH`/`DELETE` i enkodovan id;
`report-schedule-sheet.spec.tsx` (3) — izmjena nosi `schedule.version` (5) i 412 prikazuje poruku.

**Lokalno:** backend **944 suite / 5.434 testa** (101 suite skipped: integracije bez baze); `reports` **35 suite /
186 testa**; frontend **476 fajlova / 1.898 testa**; `eslint`, `tsc -b`, `prettier --check`, `i18n:check` zeleni;
`wiring:check` **632 rute**, `db:migration-policy:check` **123 migracije** (novi sentinel), `check-docs-content` OK.

## Šta nije urađeno i zašto

- **Bez DB trigera za verziju.** Verziju dižu admin upiti (i to je jedina namjera); trigger bi takođe dizao
  verziju na svaki run i pravio lažne konflikte. Integracija zato eksplicitno tvrdi da run **ne** mijenja verziju.
- **`create` nema `If-Match`** — nema šta da se pregazi; limit je pokriven u W7.94.
- **Transakcijski audit (`BA-reports-06`) ostaje otvoren:** audit red se i dalje piše poslije transakcije, pa pad
  između commit-a i audita ostavlja izmjenu bez zapisa. Paket ne tvrdi suprotno.
- **`runNow`/`sendTest` nisu uslovljeni** — oni ne mijenjaju konfiguraciju, a njihova idempotencija je zaseban
  nalaz (`BA-reports-06`/`BA-reports-07`).
- **Perf smoke:** paket dira `backend/scripts/run-isolated-integration.*`, pa se pokreće i `Perf smoke`; rezultat je
  u CI sekciji.

## CI i testni dokaz

_(upisuje se po završetku runa)_

## Registar nalaza

`BA-reports-05` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **313 zatvoreno /
383 otvoreno / 696**; Val 7 **92 / 19 (0/9/10)**, `reports` **5/19**.

## Veze

- [Audit 26 — §6 i §21 (closeout)](../audits/26-reports.md)
- [316 — W7.94, limit rasporeda](316-w794-reports-04-schedule-limit-lock.md)
- [317 — W7.93, opseg reference rasporeda](315-w793-reports-03-schedule-reference-scope.md)
- [Registar nalaza](../BACKEND-FINDINGS-REGISTER.md)
