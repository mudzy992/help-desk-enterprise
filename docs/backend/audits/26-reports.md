# Backend audit 26 — `reports`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,70/10**  
**Nalazi:** 2 P1, 12 P2, 5 P3<br>
**Implementacija:** **4/19 zatvoreno** — W7.53 (`BA-reports-01`), W7.54 (`BA-reports-02`), W7.93
(`BA-reports-03`, relacijski OU/service validator reference rasporeda) i W7.94 (`BA-reports-04`, limit
rasporeda unutar zaključane transakcije). Ova statusna dopuna ne mijenja susjedne nalaze ni ocjenu.

## 1. Executive summary

`reports` obuhvata dashboard/SLA summary, administrativni dashboard i bottleneck analitiku, trendove, 19 report packova, CSV/JSON/PDF audit, Redis cache i sedmične/mjesečne e-mail rasporede. Pozitivna osnova je značajna: controlleri traže eksplicitne role/permissione i OU scope, summary ponovo koristi ticket-list visibility builder, SQL putevi agregiraju dashboard/trendove u bazi, prozori i DTO ugovori su bounded, povjerljivi ping-pong naslov se maskira, recipient pristup se ponovo provjerava pri slanju, a scheduled slot ima DB unique dedupe.

Baseline je **4,70/10**. Dva P1 nalaza pogađaju resource safety i semantiku zakazanih izvještaja. Pack preview/export i attachment put uglavnom učitavaju cijeli scoped skup i tek nakon izgradnje svih redova provjeravaju 10k/50k limit; KB, ticket, feedback, time, asset i drugi loaderi zato mogu iscrpiti DB/memoriju prije odbijanja. Drugo, schedule `serviceId`, `groupId` i `priority` filteri važe za e-mail trend/overdue sekcije, ali se potpuno ignorišu za sve CSV attachmente: poruka označena kao usko filtrirana može distribuirati podatke cijelog OU podstabla.

Dodatni rizici su foreign service/group reference bez relacijskog scopea, schedule limit race, mutation/audit neatomarnost, lost update, brisanje run historije, Redis scheduler bez reconciliationa, SMTP accepted/DB-mark crash prozor, stale cache nakon scope promjene, slabi cache shape guardovi i nepotpuna privacy/retention matrica. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 86 produkcijskih TypeScript fajlova;
- 27 direktnih specova;
- 9.996 aktuelnih produkcijskih LOC;
- 3 controllera, 15 injectable servisa/komponenti i 1 BullMQ processor;
- Prisma: `ReportSchedule`, `ReportScheduleRecipient`, `ReportScheduleRun` i relacije prema OU/service/group/user;
- integracije: authorization, tickets/SLA/CSAT/time tracking, KB, assets, problems, changes, audit-log, settings, Redis, BullMQ i SMTP;
- E2E dokaz: 14, 15, 17, 18, 22, 23, 29, 30, 55 i 56.

Registarskih 10.082 LOC korigovano je na 9.996, a injectable inventar sa 5 na 15.

## 3. Authorization i vidljivost

Administrativna report površina zahtijeva ADMIN/SUPER_ADMIN, `reports.export` i `audit.export`, te OU guard. Schedule administracija dodatno traži `reports.schedule.manage`, a service ponovo provjerava OU pristup po zapisu. List schedulea skriva nepristupačne jedinice. Recipient eligibility koristi isti report access contract, aktivan user i ponovnu provjeru pri slanju.

Dashboard/SLA summary je namjerno dostupan svim prijavljenim korisnicima. Umjesto kopirane politike koristi `buildTicketListWhere`, pa requester/agent/admin brojači slijede list visibility, uključuju archive i confidential pravila tog centralnog buildera. To je dobar obrazac.

Schedule validacija ipak samo potvrđuje da service i group ID postoje. Ne potvrđuje da pripadaju izabranom OU podstablu niti da actor ima service scope. Foreign reference se vraća u schedule view i e-mail scope labelu; ovisno o filteru može dati nulti/neočekivani rezultat i otkriti naziv resursa. Potreban je relacijski OU/service/group validator.

## 4. Report packovi, privatnost i export

Packovi pokrivaju KPI, overdue/service, close codes, ping-pong, time tracking, KB helpfulness, asset, problem i change izvještaje. DTO i configuration allowlist ograničavaju format/pack; maksimalni vremenski prozor je 366 dana. CSV formula escaping i confidential ping-pong placeholder su pozitivne zaštite. Export se auditira sa actorom, OU-om, prozorom, formatom, brojem redova i filenameom.

Međutim limit se primjenjuje poslije `loadReportPackBuildInput` i `buildReportPackRows`. Ticket put može učitati sve aktivne zapise prozora, KB put sve article kolone i sve voteove bez vremenskog filtera, time tracking sve entryje, a asset/problem/change putevi imaju neujednačene capove. Preview također gradi cijeli rezultat radi `totalRows`, iako vraća samo preview slice. `exportRows=50.000` i attachment limit nisu zaštita od rada koji se već dogodio.

KB loader koristi puni `knowledgeArticle.findMany`, uključujući body i druge kolone koje helpfulness pack ne koristi. Ticket snapshot učitava naslov i confidential marker za većinu packova iako ih mnogi ne trebaju. To povećava privacy blast radius u memoriji. Svaki pack treba projection, DB aggregate/pagination i preflight/capped query (`limit+1`).

## 5. Dashboard, bottleneck, trends i cache

Produkcijski dashboard, bottleneck i trend put koriste parametrizovan SQL i agregiraju u PostgreSQL-u. Trend bucketi su bounded postavkom, OU subtree ulazi u cache key, a timezone, CSAT prag/skala, SLA i filteri su uključeni. Dashboard cache flooruje computation i key na isti minut. Summary cache je per-user i koristi single-flight.

Service/group trend filteri nisu relacijski validirani, pa foreign ID može djelovati kao oracle i proizvesti zavodljiv prazan presjek. Redis cache nema eksplicitnu invalidaciju na ticket mutation, permission/scope revoke ili settings promjenu; TTL ograničava stale period, ali per-user summary može do minute prikazivati broj nakon revokea. Potrebno je dokumentovati prihvatljiv stale authorization prozor ili invalidirati scope cache pri sigurnosnoj promjeni.

Cache deserializacija provjerava samo nekoliko top-level tipova. Ne validira window, points/KPI elemente, numeričku konačnost ni maksimalnu veličinu. Redis je trust boundary; version/schema validator i payload limit trebaju biti eksplicitni. Dashboard fallback bez `$queryRaw` učitava sve scoped otvorene tikete, što je prihvatljivo za test client, ali se ne smije tiho aktivirati u produkciji zbog pogrešno generisanog clienta.

## 6. Schedule CRUD i concurrency

Create/update imaju strict DTO, recipient unique/limit, pack allowlist i calendar/timezone računanje. Recipient replace i schedule update su u jednoj Prisma transakciji. Ipak:

- `count()` pa `create()` za `maxSchedules` je TOCTOU i paralelni create može preći limit;
- nema `version`/If-Match; paralelni update, enable/disable i delete su last-write-wins;
- create/update/enable/delete commituju domain mutation prije odvojenog audit writea;
- audit failure vraća API grešku iako je mutacija ostala, a delete audit može ostati bez izvornog zapisa;
- `onDelete: Cascade` briše sve runove pri brisanju schedulea, suprotno deklarisanoj 180-dnevnoj operativnoj historiji;
- pomjeranje schedulea u drugi OU mijenja authorization boundary bez CAS-a i bez before/after detalja iz atomarnog snapshot-a.

Potrebni su DB-enforced limit/advisory lock, version predicate, transakcijski audit/outbox i immutable run/tombstone politika.

**Status poslije W7.94 (§20):** limit je sada advisory lock + brojanje unutar iste transakcije
(`withReportScheduleLimit`), pa dva paralelna snimanja ne mogu prekoračiti `maxSchedules`; zauzeta brava daje
novi operativni kod `REPORT_SCHEDULE_LIMIT_UNAVAILABLE` (503), a ne lažni „limit dostignut”. Version/CAS
(`BA-reports-05`), transakcijski audit (`BA-reports-06`) i run/tombstone politika (`BA-reports-07`) ostaju
otvoreni. Detalji: [316](../implementation/316-w794-reports-04-schedule-limit-lock.md).

## 7. Scheduled execution, dedupe i recovery

Due query je bounded na 20 i stabilno sortiran. Missed slotovi se evidentiraju, unique `slotKey` claim sprečava dva normalna workera, stale RUNNING može biti preuzet, recipients se reautorizuju, domen e-maila se provjerava i slanje je individualno. Run outcome i audit bilježe sent/skipped/omitted.

Attachment generator ne prenosi schedule filtere u pack load. `buildContent` primjenjuje service/group/priority na trend i overdue, dok `buildAttachments` šalje samo OU IDs, window i pack. Recipient zato dobija OU-wide CSV uz poruku/scope koji sugeriše uži presjek. Ovo je podatkovna i ugovorna greška visokog prioriteta.

Delivery claim zatim SMTP send pa DB `mark sent` ima neizbježan crash prozor: SMTP može prihvatiti poruku, proces pasti prije markiranja, stale retry otpustiti/preuzeti claim i poslati duplikat. Message-ID može pomoći downstream dedupeu, ali nije dokaz exactly-once. Run se može završiti, a audit write pasti i ostaviti job kao failed nakon stvarnog slanja. Potrebna je eksplicitna at-least-once semantika, durable outbox/provider idempotency gdje postoji i reconciler za stale delivery/run.

BullMQ scheduler se upisuje samo na module init. Redis flush poslije boota uklanja repeat scheduler bez periodičnog self-heala. `runDue` može nadoknaditi slotove tek kada sweep ponovo postoji; potreban je periodic reconcile/health alarm. `runNow` nema command idempotency key i svaki dvoklik legitimno kreira novi manual run i novi e-mail.

## 8. Integritet filtera i semantike

OU scope uključuje potomke, što je konzistentno kroz pack/dashboard/trend. Međutim report window semantika nije potpuno jednaka po domenima: ticket snapshot bira zapise koji su bili živi u prozoru, KB helpfulness učitava sve članke i feedback bez article/update granice, asset pack koristi `now`, a problem/change loaderi imaju vlastite kriterije. Export mora uz svaki pack dokumentovati event-time, snapshot-time i inclusive/exclusive granice.

**Status poslije W7.93 (§19):** referenca rasporeda je sada relacijski validirana — `serviceId` mora biti servis koji akter smije koristiti (`reportScheduleServiceScopeRequirements`), a `groupId` mora pripadati podstablu izabrane jedinice. Nepoznata i strana referenca vraćaju **isti** kod (`REPORT_SCHEDULE_SCOPE_INVALID`) i polje, pa odgovor nije oracle za postojanje; legacy redovi više ne ispisuju strani naziv u pogledu ni u scope liniji e-maila. Detalji: [315](../implementation/315-w793-reports-03-schedule-reference-scope.md).

`recordPdfExport` auditira klijentsku tvrdnju da je PDF napravljen; server ne izdaje dokument niti može potvrditi uspjeh. To treba zvati print intent/client export event, ne dokaz uspješno preuzetog artefakta.

## 9. Audit, privacy i retention

Direktni exporti imaju dobar audit kontekst. Schedule CRUD/send/test također imaju događaje, ali nisu atomarni sa mutacijom ili run finalizacijom. Preview nije auditiran iako može vratiti osjetljive redove; potrebno je formalno odlučiti je li to read audit ili high-volume telemetry.

Run `skipped` JSON čuva user ID i razlog, schedule recipient relacije i audit/notification delivery replike čuvaju identitet. Run prune je best-effort `.catch(() => undefined)` samo kada sweep radi; delete schedulea briše runove odmah. Nema kompletne matrice za user anonymization, schedule creator/updater, recipient, generated attachment/SMTP kopije, Redis aggregates i audit replike. Attachments se ne pohranjuju u aplikaciji, ali izlaze iz kontrolisanog sistema i trebaju classification/banner i retention smjernicu.

## 10. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/reports -name '*.spec.ts' -print | sort)
```

Rezultat: **15/27 suiteova prošlo, 12/27 compile-blocked; 64/64 izvršena testa prošla**. Nije zabilježen assertion failure. Blokade su nedostajući `generated/prisma/client`/`enums` i nepotpun `PrismaService` bez delegata i `$queryRaw`.

Zeleni testovi dobro pokrivaju pure pack builder-e, serialization, config parsing, summary cache i calendar helper. Blokirani su schedule, trends, service/dashboard SQL i summary DB ugovori. E2E 17/18 pokrivaju osnovni trend/export/audit i schedule CRUD/deny/test-send; ostali paketi pokrivaju report integracije. Nema dokaza za huge corpus, attachment filter parity, foreign filter IDs, concurrent schedule limit/update, Redis flush, SMTP accepted-crash, run retention ni privacy/anonymization.

## 11. Pozitivni nalazi

1. Strict DTO i allowlist za pack/format/filtere.
2. Role+permission+OU guard na admin reportima.
3. Summary ponovo koristi centralni ticket visibility builder.
4. SQL agregacija za dashboard/bottleneck/trendove.
5. Bounded trend prozor i schedule sweep.
6. Parametrizovan raw SQL.
7. CSV injection escaping i confidential title masking.
8. Export audit nosi actor/scope/window/file/row count.
9. Recipient eligibility se provjerava pri saveu i slanju.
10. Individualno slanje bez BCC-a i e-mail domain policy.
11. Unique scheduled slot i stale-run takeover.
12. Missed slot evidencija i 180-day namjera retencije.
13. Cache key uključuje scope/filter/settings semantiku.
14. Svih 64 izvršena testa je zeleno.

## 12. Registar nalaza

| ID            | Severity | Nalaz                                                                                         | Status   |
| ------------- | -------- | --------------------------------------------------------------------------------------------- | -------- |
| BA-reports-01 | P1       | Pack preview/export/attachment gradi neograničen scoped korpus prije row/size limita          | zatvoreno |
| BA-reports-02 | P1       | Scheduled CSV attachmenti ignorišu service/group/priority filtere i šalju OU-wide podatke     | zatvoreno |
| BA-reports-03 | P2       | Schedule service/group reference nije vezana za izabrani OU/service scope                     | zatvoreno (W7.93) |
| BA-reports-04 | P2       | `maxSchedules` count-then-create je TOCTOU i limit se može prekoračiti                         | zatvoreno (W7.94) |
| BA-reports-05 | P2       | Schedule mutation nema version/CAS; paralelni update/enable/delete je last-write-wins          | otvoreno |
| BA-reports-06 | P2       | Schedule mutation/run finalizacija i globalni audit nisu atomarni                             | otvoreno |
| BA-reports-07 | P2       | Brisanje schedulea kaskadno briše run historiju prije 180 dana                                | otvoreno |
| BA-reports-08 | P2       | BullMQ repeat scheduler nema reconciliation nakon Redis gubitka                               | otvoreno |
| BA-reports-09 | P2       | SMTP accepted → DB mark crash prozor može duplirati scheduled e-mail                          | otvoreno |
| BA-reports-10 | P2       | Summary/dashboard cache nema scope-revoke/mutation invalidaciju; stale authorization prozor   | otvoreno |
| BA-reports-11 | P2       | KB/ticket loaderi čitaju nekorištene osjetljive kolone i šire privacy blast radius            | otvoreno |
| BA-reports-12 | P2       | Packovi nemaju formalno usklađenu event-time/snapshot-time window semantiku                    | otvoreno |
| BA-reports-13 | P2       | Privacy/anonymization matrica ne pokriva run JSON, recipients, mail kopije i replike           | otvoreno |
| BA-reports-14 | P2       | Run retention prune je best-effort i zavisi od aktivnog sweepa                                | otvoreno |
| BA-reports-15 | P3       | Redis cache parseri validiraju samo plitki shape bez schema/version/size granice               | otvoreno |
| BA-reports-16 | P3       | `runNow` nema command idempotency i ponovljen zahtjev šalje novi manual report                 | otvoreno |
| BA-reports-17 | P3       | PDF endpoint evidentira client intent kao export bez potvrde generisanog artefakta             | otvoreno |
| BA-reports-18 | P3       | Preview osjetljivih redova nema formalnu read-audit odluku                                    | otvoreno |
| BA-reports-19 | P3       | Dvanaest suiteova je compile-blocked; failure/concurrency/Redis/SMTP matrica nedostaje          | otvoreno |

## 13. Ključne korekcije

- **01, 11:** pack-specific DB projection/agregacija, cursor/chunk, `limit+1`, preflight i hard resource budget.
- **02–03:** jedinstveni typed report filter koji svaki section/attachment primjenjuje; relacijski OU/service/group validator.
- **04–07:** DB-enforced schedule limit, version/CAS, transakcijski audit/outbox i run tombstone/retention.
- **08–09,14,16:** scheduler self-heal/health, stale-run/delivery reconciler, at-least-once ugovor i manual command key.
- **10,15:** authorization-aware invalidation ili odobren stale prozor; versioned strict cache schema i payload cap.
- **12:** pack metadata sa snapshot/event semantikom i boundary testovima.
- **13,17–18:** privacy/retention matrica, ispravno imenovan PDF intent i odluka o preview auditu.
- **19:** regenerisan Prisma client i real Postgres/Redis/SMTP fault testovi.

## 14. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   6,00 |
| B. API i ugovori             |    12% |   5,20 |
| C. Auth/authz/scope          |    15% |   4,80 |
| D. Poslovna pravila/stanje   |    13% |   5,00 |
| E. Podaci/Prisma/transakcije |    13% |   4,10 |
| F. Sigurnost/privatnost      |    12% |   4,40 |
| G. Async/integracije         |     8% |   4,20 |
| H. Testovi/dokazivost        |    10% |   4,00 |
| I. Operativnost/perf.        |     7% |   4,40 |
| **Ukupno**                   | **100%** | **4,70/10** |

Ponderisani zbir je 4,699, zaokružen na **4,70/10**. Otvoreni P1 nalazi svakako ograničavaju maksimum na 7,49.

## 15. Fazni plan

### Faza 0 — safety net

100k+ corpus; schedule filter parity; foreign service/group; concurrent create/update; Redis flush; SMTP accepted pa crash; delete/run retention; scope revoke tokom cache TTL-a.

### Faza 1 — disclosure i resource safety

DB-bounded pack engine, minimalne projekcije, filter parity i relacijska scope validacija.

### Faza 2 — schedule integrity

DB limit lock, version/CAS, transakcijski audit/outbox, immutable run retention i idempotent manual command.

### Faza 3 — delivery i recovery

Scheduler reconcile/health, delivery/run state machine, stale claim reconciliation i dokumentovan at-least-once ugovor.

### Faza 4 — cache, privacy i semantika

Scope invalidation, strict cache schema, pack window katalog, anonymization/retention i PDF/preview audit politika.

### Faza 5 — finalni gate

Regenerisan Prisma client; svih 27 suiteova; Postgres concurrency/perf, Redis restart/flush, SMTP fault injection i E2E 14/15/17/18/23/29/30/55 na finalnom SHA-u.

## 16. Acceptance i konačna presuda

1. Preview/export/attachment ne materijalizuje više od dozvoljenog budžeta.
2. Svaki scheduled section i attachment primjenjuje identičan OU/service/group/priority scope.
3. Foreign service/group reference se odbija bez existence disclosurea.
4. Schedule limit i verzija opstaju pod paralelnim writeovima.
5. Mutation, run i audit ne ostavljaju kontradiktorna stanja.
6. Run historija opstaje najmanje odobreni retention period i nakon deletea schedulea.
7. Scheduler se sam oporavlja nakon Redis gubitka; delivery retry semantika je dokaziva.
8. Cache ne nadživljava odobren authorization stale prozor i odbija malformiran payload.
9. Privacy/retention pokriva recipients, run JSON, audit, notification delivery i SMTP replike.
10. Svih 27 suiteova i concurrency/perf/fault E2E prolaze.

Modul ima kvalitetan SQL aggregation i authorization temelj, ali post-build limiti, scheduled attachment scope mismatch i nedovršena concurrency/recovery/retention pravila sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **4,70/10**.

## 17. Implementacijski closeout — W7.53 (`BA-reports-01`)

Na `2edc56e`, uz zeleni CI `44518772985`, nijedan report pack više ne gradi neograničen scoped korpus prije
limita. Svaki pozivalac prosljeđuje **jedan budžet** loaderu: preview `reportPackPreviewRowLimits[pack]`
(200 redova za red-list packove, 20.000 za agregatne), export `exportRows` (50.000), scheduled attachment
`configuration.attachmentMaxRows`. Loader uvijek čita `rowLimit + 1`, probe red odbacuje i vraća
`{ input, truncatedInput }`, pa je prekoračenje dokazivo bez čitanja cijelog prozora. Preview zato ne gradi
rezultat radi `totalRows`: `totalRows` je broj pročitanih redova (najviše budžet), a `truncatedInput` i UI
napomena „Najmanje N redova“ kažu da su brojevi donja granica. Export baca `REPORT_TOO_LARGE` **prije**
serijalizacije i audita, a scheduled attachment izostavlja pack kao `too_many_rows` umjesto da pošalje
prepolovičan CSV uz poruku koja tvrdi potpun presjek. KB pack čita usku projekciju članaka (`ReportArticleRow`,
bez `body` i bez nekorištenih kolona), a voteovi su vezani na učitane članke **i** na prozor izvještaja.
Agregatni packovi namjerno imaju veći (ali ograničen) budžet umjesto SQL prepisa KPI logike — granica od 200
redova bi njihove brojeve učinila pogrešnim, ne samo malim; DB agregacija ostaje preostali rizik. Asset packovi
zadržavaju fiksne interne capove (`truncatedInput: false`), a `BA-reports-11` ostaje otvoren za ticket snapshot
kolone. Nema migracije. Dokaz:
[274-w753-reports-01-bounded-pack-reads.md](../implementation/274-w753-reports-01-bounded-pack-reads.md).

## 18. Implementacijski closeout — W7.54 (`BA-reports-02`)

Na `db9b398`, uz zeleni CI `44528116159`, scheduled CSV prilozi više ne prelaze presjek koji e-mail prijavljuje.
Novi `ReportPackFilters` (`serviceId`, `groupId`, `priority`) ulazi u `loadReportPackBuildInput` i **gura se u upit**
prije nego se potroši W7.53 row budžet: ticket packovi filtriraju `serviceId`/`assignedGroupId`/`priority`, time
tracking kroz `ticket`, forward ping-pong filtriranjem tiketa (forwardi se i dalje broje po tiketu), KB pack po
`knowledgeArticle.serviceId`, a problemski packovi po **vlastitom** problem zapisu (servis/grupa/prioritet), ne po
povezanim tiketima. `reportPackScheduleFilterSupport` deklariše dimenzije po packu; pack koji presjek ne može
primijeniti (CMDB i change) se **izostavlja** sa novim reasonom `filter_unsupported` umjesto da pošalje OU-wide
fajl, pa e-mail nikad ne tvrdi uži presjek od sadržaja. Napomena uz priloge i hint u formi rasporeda sada kažu da
prilozi koriste isti period i presjek, a „Historija izvršenja“ mapira novi reason (bs/en). Validacija pri čuvanju
rasporeda nije dio paketa — fail-closed slanje je sigurnije za postojeće rasporede, a relacijska validacija
reference je `BA-reports-03`. Nema migracije. Dokaz:
[275-w754-reports-02-scheduled-attachment-scope.md](../implementation/275-w754-reports-02-scheduled-attachment-scope.md).

## 19. Implementacijski closeout — W7.93 (`BA-reports-03`)

**Nalaz:** `validate` je za `serviceId`/`groupId` provjeravao samo **postojanje** reda. Grupa iz roditelja ili
sestrinske jedinice je prihvatana kao filter, servis van opsega aktera takođe, a njihovi nazivi su se vraćali u
pogled rasporeda i u scope liniju e-maila. Prazan presjek je bio jedini — tihi — signal da referenca ne pripada
ničemu.

**Rješenje.**

- **Servis:** `ReportAccessChecker.canUseScheduleService` traži isti paket kao kontroler
  (ADMIN/SUPER_ADMIN + `reports.schedule.manage`) uz `serviceScope: { field: 'serviceId' }`; assignment bez
  servisa pokriva svaki servis, assignment sa servisom samo svoj.
- **Grupa:** `report-schedule-scope.ts` (`isGroupWithinUnitSubtree`) delegira na
  `doesOrganizationalUnitScopeCover`, pa `/Korisnici/ITX` **nije** ispod `/Korisnici/IT`, a prazna/`null`
  putanja ne prolazi.
- **Bez oracle:** nepoznata i strana referenca vraćaju isti novi kod `REPORT_SCHEDULE_SCOPE_INVALID` (400) sa
  `field`, i to je pinovano testom `expect(unknown).toEqual(foreign)`.
- **Legacy redovi:** `loadScopeLabels` (list/get) i `visibleGroupName` (e-mail) skrivaju naziv reference koja
  nije u opsegu čitaoca/jedinice, uz log `report_schedule_scope_outside_subtree`; filter i dalje daje prazan
  presjek (fail-closed), ali e-mail i API ne tvrde da raspored pokriva taj resurs.
- **Frontend:** novi kod je u `reportTrendErrorCodes` i `reportErrorMessageKeys`, sa bs/en porukom; forma
  rasporeda prikazuje poruku uz `requestId`.

**CI dokaz:** [run #45119728300](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45119728300) —
`success` na `91cdcc2` (backend build + test, PostgreSQL/Redis integracije, frontend build + test, docs guard,
CI gate).

**Testni dokaz:** `report-schedule-scope.spec.ts` (**5**), `report-schedules.scope.spec.ts` (**9**),
`report-schedules.spec.ts` **+1** (scope linija e-maila za legacy red), frontend
`report-schedule-sheet.spec.tsx` (**1**). Lokalno: backend **942 suite / 5.423 testa**, `reports` **33 suite /
174 testa**, frontend **1.893 testa**; `eslint`/`tsc`/`prettier`/`i18n:check`/`wiring:check` (632 rute)/
`db:migration-policy:check` (122) zeleni.

**Otvoreno i dokumentovano:** nema migracije ni backfillа — legacy redovi se ne prepisuju automatski (server ne
može pogoditi je li strana grupa bila namjera), nego se naziv skriva i prvo sljedeće snimanje mora popraviti
referencu; audit zapis se ne piše za odbijeno snimanje jer se ništa nije promijenilo. Detalji:
[315-w793-reports-03-schedule-reference-scope.md](../implementation/315-w793-reports-03-schedule-reference-scope.md).

## 20. Implementacijski closeout — W7.94 (`BA-reports-04`)

**Nalaz:** `create` je radio `count()` pa `create()` bez ičega između. Dva paralelna snimanja pod limitom N oba
pročitaju `N-1`, oba prođu provjeru i instalacija završi na N+1 redu — bez greške i bez signala.

**Rješenje.**

- **Jedan globalni ključ:** `withReportScheduleLimitLock` uzima `pg_advisory_xact_lock` preko
  `DatabaseLockService` (namespace `reports.schedule-limit`, key `schedules`), jer je `maxSchedules` globalan
  broj; drugi pisac čeka, pa broji red koji je prvi komitovao.
- **Critical section je funkcija:** `withReportScheduleLimit(transaction, { maxSchedules }, create)` broji i
  upisuje; servis je zove unutar `$transaction`, a PostgreSQL integracija zove **istu** funkciju, pa dokaz ne
  može odlutati od produkcijske sekvence.
- **Operativni ishod:** lock timeout (2 s, kraće od Prisma-inog 5 s budžeta) prevodi se u novi
  `REPORT_SCHEDULE_LIMIT_UNAVAILABLE` → **503** sa bs/en porukom, umjesto nemapiranog `P2028` ili lažnog
  „limit dostignut”.
- **Validacija ispred brave:** autorizacija/opseg/primaoci se provjeravaju prije zaključavanja, pa brava drži
  samo `count` + `create`.

**Testni dokaz:** `report-schedules.limit.spec.ts` (**4** — odbijanje bez upisa, redoslijed brava→count→create,
`55P03` → 503 kod, `ReportsError`), `report-schedule-limit.integration.spec.ts` (**2**, PostgreSQL — dva
paralelna poziva pod limitom 1 daju jedan uspjeh i jedan `REPORT_SCHEDULE_LIMIT`, broj redova ostaje 1; brisanje
oslobađa slot), frontend `report-schedule-sheet.spec.tsx` (**1 → 2**). Lokalno: backend **943 suite / 5.427
testa**, `reports` **34 suite / 178 testa**, frontend **1.894 testa**; `eslint`/`tsc`/`prettier`/`i18n:check`/
`wiring:check` (632 rute)/`db:migration-policy:check` (122) zeleni.

**CI dokaz:** run **`45128085348` — `success`** na `08b1cea` (Detect changes, Backend container + supply chain,
Docs guard, **Backend PostgreSQL + Redis integration**, Backend build + test, Frontend build + test, CI gate);
`Perf smoke` **`45128085285` — `success`** (paket dira putanju koja ga pokreće).

**Otvoreno i dokumentovano:** nema DB constrainta za globalni broj redova (alternativa je brojač-tabela i
migracija, što bi bilo novo mjesto razilaženja); `update`/`delete` ne uzimaju bravu jer ne mogu povećati broj
redova (njihov CAS je `BA-reports-05`); transakcijski audit ostaje `BA-reports-06`. Detalji:
[316-w794-reports-04-schedule-limit-lock.md](../implementation/316-w794-reports-04-schedule-limit-lock.md).
