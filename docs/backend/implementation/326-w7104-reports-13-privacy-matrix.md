# W7.104 — `BA-reports-13`: privacy/anonymization matrica za `reports`

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Privacy/anonymization matrica ne pokriva run JSON, recipients, mail kopije i replike”<br>
**Kod:** `report-mentions.ts` (**novo**), `scrub-report-mentions.ts` (**novo**), `report-privacy-matrix.ts`
(**novo**), `anonymization-executor.ts` (preview + execute), `report-schedules.service.ts` (`skipped[]`),
`report-email-labels.ts` + `compose-scheduled-report-email.ts` (banner)<br>
**Specovi:** `scrub-report-mentions.spec.ts` (**novo, 8**), `report-privacy-matrix.spec.ts` (**novo, 8**),
`anonymization.integration.spec.ts` (+1 scenario na PostgreSQL-u)<br>
**DB migracija:** **ne** (nijedna kolona se ne mijenja; `skipped` je postojeći `Json`)<br>
**Rute:** nepromijenjene (632) — mijenja se samo **tip** `skipped[].userId` (`string` → `string | null`)<br>
**Frontend:** `report-schedules-api.ts` (tip), `report-schedule-runs-sheet.tsx` + `bs/en` lokal
(`reports.schedules.anonymizedRecipient`)<br>
**CI:** [run `45200003644`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45200003644) ✓ na `846ac24`

## Nalaz

Anonimizacija je obrađivala **žive** primaoce izvještaja (brisanje `ReportScheduleRecipient`, pauziranje rasporeda
bez primalaca, brisanje `NotificationEmailDelivery`), ali **historija** i **vlasništvo** nisu bili pokriveni:

| Površina | Šta je ostajalo | Posljedica |
| --- | --- | --- |
| `ReportScheduleRun.triggeredByUserId` | ko je pritisnuo „pošalji odmah” | trajno vezan ID uz run koji živi 180 dana |
| `ReportScheduleRun.skipped` | `[{ userId, reason }]` | **sirov ID primaoca** u JSON-u, bez ijednog scrub puta |
| `ReportSchedule.createdByUserId` / `updatedByUserId` | ko je napravio/zadnji mijenjao raspored | ID ostaje zauvijek; `updatedBy` nema ni relaciju |
| Redis `reports:*-summary:<userId>:v…` | user id u **ključu** | nije adresirano nikakvom politikom |
| SMTP kopija + CSV prilozi | primaoce, ime i sadržaj izvještaja | van sistema; ništa na poruci nije govorilo šta je i dokle smije živjeti |
| `AuditLog` (`reports.export`, CRUD, „send now”) | akter i entitet | pokriveno generički, ali bez eksplicitne odluke u matrici |

Nije postojala **matrica**: nije se moglo odgovoriti, za jednu površinu, šta sadrži, koliko živi, šta anonimizacija
radi i kojim se brojačem to dokazuje. Zato je nalaz bio P2 — ne zbog jedne greške, nego zbog nepotpune pokrivenosti.

## Rješenje

### 1. Selekcija na jednom mjestu (`report-mentions.ts`)

`collectReportMentions({ prisma, userId })` vraća **isti** skup koji preview pokaže i execute obradi:

- `runsTriggered` — `triggeredByUserId = userId`;
- `runsWithSkipped` — jedan `jsonb` containment upit:
  `SELECT id, skipped FROM "ReportScheduleRun" WHERE "skipped" @> $1::jsonb` sa `'[{"userId":"…"}]'`. Prisma ne
  može izraziti „element niza ima polje = x” prenosivo, a containment pogađa **svaki** entry bez obzira na `reason`;
- `schedulesCreated` / `schedulesUpdated` — dvije odvojene kolone, dvije odvojene selekcije.

### 2. Upis (`scrub-report-mentions.ts`)

| Površina | Upis | Šta ostaje |
| --- | --- | --- |
| `triggeredByUserId` | `updateMany` → `NULL` | trigger `MANUAL`, period, status, brojači |
| `skipped` | entry primaoca ostaje **bez `userId`**, `reason` ostaje | „jedan primalac je bio neaktivan” — bez imena |
| `createdByUserId` / `updatedByUserId` | dva odvojena `updateMany` → `NULL` | raspored, primaoci, scope, historija |

Sve tri operacije imaju ID **u predikatu**, pa je drugi prolaz no-op i dva workera se ne mogu zavrtjeti. Namjerno se
**ne** brišu: `scheduleName`, `organizationalUnitId`, `omittedAttachments` (organizacijski snapshot, W7.97 ga čini
neophodnim da run ostane čitljiv poslije brisanja rasporeda).

### 3. Matrica u kodu (`report-privacy-matrix.ts`) + guard

Jedanaest redova, svaki sa `identity`, `retention`, `action` (jedna od sedam enumerisanih: `delete`, `null`,
`scrub-json`, `retain`, `pseudonymous`, `cache-ttl`, `outside-system`), `countKey` i objašnjenjem gdje je
implementirano. `report-privacy-matrix.spec.ts` **čita `prisma/schema/reporting.prisma`** i pada ako:

- novi `model Report*` nema svoj red (guard nije vakuum: prvo asertira da modela ima tačno tri);
- neka radnja nije iz enumeracije;
- radnja koja **piše** (`delete`/`null`/`scrub-json`) nema brojač, ili radnja koja ne piše ima brojač;
- ID-evi nisu jedinstveni ili je neko polje prazno;
- `mail-copy` red tvrdi da poruka nosi klasifikaciju, a `classificationNote` ne postoji u `bs` **ili** `en` lokalnom
  tekstu (i ne sadrži „interno”/„internal” + „180 dana”/„180 days”).

Time matrica ne može tiho ostarjeti: nova tabela ili ukinut banner obara test.

### 4. Kopija koja izlazi iz sistema

Aplikacija **ne čuva** tijelo izvještaja — šalje ga SMTP-u i ne može ga poslije povući. Zato klasifikacija i
očekivani rok putuju **s porukom**: `classificationNote` je prvi `notes[]` element u
`compose-scheduled-report-email.ts` (bs i en), uvijek prisutan — i u testnom i u regularnom slanju. To je jedina
odbrana koja stvarno stiže do primaoca; dokumentovana je u matrici kao `outside-system`, a ne prećutana.

### 5. Preview i execute

`preview()` sada broji `reportRunsDetached`, `reportRunSkipped`, `reportSchedulesDetached` iz **iste** selekcije
koju prosljeđuje u execute; `execute()` ih dodaje kroz `add(...)`. Time operator prije odobrenja vidi koliko run
redova i rasporeda će ostati bez identiteta — ranije je preview pokazivao samo žive primaoce.

### 6. Čitanje poslije anonimizacije

`report-schedules.service.ts#runs()` sada vraća `skipped[].userId: string | null`; frontend prikazuje
`displayName ?? userId ?? „Anonimizovan primalac”` (bs/en) uz zadržani razlog. Bez toga bi UI prikazivao prazno
ime ili „undefined” za svaki scrubovani entry.

## Posljedice po ponašanje

- Run log poslije anonimizacije: isti period, status, brojači i razlozi; **nema** ID-eva osobe. Broj primalaca se
  ne mijenja (historijski snapshot ostaje tačan).
- Raspored poslije anonimizacije: ostaje aktivan ako ima još primalaca; ako ne, pauzira se (postojeće ponašanje).
  `createdBy`/`updatedBy` su `NULL`.
- Audit lanac se **ne** briše i dalje pokazuje na anonimizovani nalog (hash chain ostaje validan).
- Nema migracije i nema novih ruta; mijenja se jedan DTO tip (`userId` može biti `null`).

## Testni dokaz

`scrub-report-mentions.spec.ts` (**novo, 8**): run se detachuje a činjenice ostaju; `reason` preživi, tuđi entry
netaknut, entry bez `userId` netaknut; **idempotencija** (drugi `collectReportMentions` vraća 0 runova — fake
evaluacija stvarnog containmenta); creator i updater se čiste odvojeno (tuđi raspored ne izgubi creatora); nema
footprinta ⇒ nula upisa; selekcija je jedan `jsonb` containment upit s **bound** vrijednošću; `stripSkippedUserIds`
ostavlja malformed JSON i broji **svaki** entry osobe, ne samo prvi.

`report-privacy-matrix.spec.ts` (**novo, 8**): tri modela iz šeme; pokrivenost van-modela (delivery ledger, audit,
Redis, mail); enumerisane radnje; brojač ⇔ radnja; jedinstveni ID-evi i neprazna objašnjenja; banner u oba lokalna
teksta; retention tvrdnja = 180 dana.

`anonymization.integration.spec.ts` (+1 scenario, PostgreSQL): raspored koji je osoba napravila (sa sobom i agentom
kao primaocem) + manual run sa `skipped = [{osoba, inactive}, {agent, no_access}]`. Poslije `execute`: run zadržava
`MANUAL`/`PARTIAL`/`2`/`1`, `triggeredByUserId = null`, `skipped = [{reason: inactive}, {agent, no_access}]`;
raspored ima `createdByUserId = null`, `updatedByUserId = null`, `enabled = true` i **samo** agenta kao primaoca.

Lokalno: `privacy` + `reports` **67 suite / 405 testova** (44 skipped — integration bez `PRIVACY_IT_DATABASE_URL`);
`reports/schedules` **10 suite / 82 testa**; frontend `components/reports` + `i18n` **11 fajlova / 57 testova**;
`eslint` 0 na backend (`privacy/anonymization`, `reports`) i frontend (dva fajla).

## Otvoreno i dokumentovano

- **Redis replika** (`reports:*-summary:<user>:v<ver>:<zone>`) — ključ sadrži user id, vrijednost je agregat bez
  liste tiketa, TTL 60 s (W7.100). Ne evakuiše se po ID-u: to bi značilo `SCAN` cijelog Redis-a zbog zapisa koji
  sam istekne za minut. Odluka je u matrici (`cache-ttl`), ne prećutana.
- **SMTP/CSV kopija** — van kontrole aplikacije; pokrivena bannerom (`classificationNote`) i retention smjernicom u
  istoj poruci. Brisanje poštanske kopije ostaje odgovornost poštanske politike.
- **`AuditLog`** — `pseudonymous`: ID-evi ostaju, metadata koja imenuje osobu se scrubuje generičkim
  `audit-redaction.ts`; lanac se ne briše jer dokazuje ko je šta eksportovao.

Sljedeće u `reports`: `BA-reports-15` (cache schema/version/size), `-16` (`runNow` idempotency), `-17` (PDF intent),
`-18` (preview read-audit), `-19` (12 compile-blocked suiteova / fault matrica).

## Dokaz

CI [`45200003644`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45200003644) **success** na `846ac24` (`Backend build + test`, `Frontend build + test`,
`Backend PostgreSQL + Redis integration` — uključuje anonymization integraciju sa novim scenarijem — i `Docs guard`;
`E2E` i inventura `skipped`, kako je konfigurisano). Detalji u [26-reports.md, §30](../audits/26-reports.md#30-implementacijski-closeout--w7104-ba-reports-13).
