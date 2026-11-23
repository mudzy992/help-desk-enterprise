# Backend audit 26 — `reports`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,70/10**  
**Nalazi:** 2 P1, 12 P2, 5 P3<br>
**Implementacija:** **16/19 zatvoreno** — W7.53 (`BA-reports-01`), W7.54 (`BA-reports-02`), W7.93
(`BA-reports-03`, relacijski OU/service validator reference rasporeda), W7.94 (`BA-reports-04`, limit
rasporeda unutar zaključane transakcije), W7.95 (`BA-reports-05`, `version`/`If-Match` na admin izmjenama
rasporeda), W7.96 (`BA-reports-06`, audit red u transakciji izmjene), W7.97 (`BA-reports-07`, run log preživi
brisanje rasporeda), W7.98 (`BA-reports-08`, sweep sam vraća svoj Redis raspored), W7.99 (`BA-reports-09`,
at-least-once isporuka bez slijepog ponovnog slanja), W7.100 (`BA-reports-10`, cache key nosi verziju
autorizacije), W7.101 (`BA-reports-11`, svaki read izvještaja je projekcija), W7.102 (`BA-reports-12`, katalog i
pola-otvoreni ugovor prozora), W7.103 (`BA-reports-14`, retention run loga kao zaseban, batched posao) i W7.104
(`BA-reports-13`, privacy/anonymization matrica sa scrubom run JSON-a i bannerom u e-mailu) i W7.105
(`BA-reports-15`, verzionisan i veličinom ograničen cache sa strožim validatorima) i W7.106 (`BA-reports-16`,
„pošalji sada” kao komanda sa `Idempotency-Key` i unique `commandKey` na run redu). Ova statusna dopuna ne mijenja
susjedne nalaze ni ocjenu.

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
novi operativni kod `REPORT_SCHEDULE_LIMIT_UNAVAILABLE` (503), a ne lažni „limit dostignut”. Detalji:
[316](../implementation/316-w794-reports-04-schedule-limit-lock.md).

**Status poslije W7.103 (§29):** retention run loga više nije dio delivery sweepa: 180-dnevni prozor se
primjenjuje u **zasebnom dnevnom poslu** (`report-schedules-retention-daily`, 03:17 UTC) koji se registruje i
reconcile-uje kao i sweep, a sweep **takođe** prži prije nego pročita svoju konfiguraciju — pa isključen scheduled
e-mail ili konfiguracija koja ne može da se učita ne čuvaju run log zauvijek. Brisanje je batched (500 po batchu,
najviše 40 batcheva po prolazu) i **baca** grešku umjesto `catch(() => undefined)`: dnevni posao je retry-uje, a
sweep je loguje i nastavlja isporuku. Detalji:
[325](../implementation/325-w7103-reports-14-run-retention.md).

**Status poslije W7.102 (§28):** prozor izvještaja ima **jedan ugovor** — pola-otvoren `[from, to)`, početak ulazi,
kraj ne — i **katalog** (`pack-window-semantics.ts`) koji za svaki pack kaže da li period bira događaje
(`event-time`), opisuje trenutno stanje (`snapshot-time`) ili oboje (`mixed`), te koji timestamp/koji snapshot
dio. Semantika je vidljiva pozivaocu kroz `listPacks()` (`windowSemantics`), preview (`window.boundaries`,
`window.semantics`) i audit exporta (`boundaries`, `windowMode`). Detalji:
[324](../implementation/324-w7102-reports-12-window-semantics.md).

**Status poslije W7.101 (§27):** svaki čitani red u reports toku je sada **projekcija**. Ticket snapshot nosi samo
kolone koje agregati čitaju (`reportTicketSnapshotSelect`), a identifikacione kolone (`title`, `ticketNumber`,
`isConfidential`) dobija samo pack koji stvarno štampa tiket (`projection: 'row'`) — free text (`description`,
`formData`, `resolutionSummary`) nije dio nijedne projekcije. Time je nestao i posljednji cijeli-red read
(no-window put dashboard/bottleneck fallbacka). Detalji:
[323](../implementation/323-w7101-reports-11-read-projections.md).

**Status poslije W7.105 (§31):** sva tri cachea (dashboard/SLA summary, OU dashboard, trendovi) čitaju i pišu kroz
**envelope** `{ v, data }`: zapis nosi verziju šeme, veličina se mjeri u **bajtovima** i odbija prije parsiranja
(cap 256 KiB), a plitki validatori su zamijenjeni strogim i bounded provjerama svakog polja koje ekran čita
(`isPlainRecord` odbija nizove, `isFiniteNumber` `NaN`/`Infinity`, `isCount` negativne i frakcionalne brojače).
`oversized` i `invalid_json` se brišu; `version_mismatch` se **ne** briše, jer bi rolling deploy dva builda
evictirala jedan drugom zapise. Detalji: [327](../implementation/327-w7105-reports-15-cache-envelope.md).

**Status poslije W7.100 (§26):** per-user summary cache key više ne sadrži samo `(user, zone)` nego i
**verziju autorizacije** (`User.authzVersion`): svaka sigurnosna promjena (rola/permission, članstvo u grupi,
premještaj OJ, deaktivacija, reset lozinke) čini stari zapis nedostupnim **na sljedećem zahtjevu**, ne na kraju
TTL-a. Staleness nakon ticket mutacije ostaje dokumentovana granica (60 s, odobreno u stagingu); OU dashboard cache
nije sigurnosni problem jer se pristup provjerava prije čitanja. Detalji:
[322](../implementation/322-w7100-reports-10-authorization-aware-cache.md).

**Status poslije W7.99 (§25):** isporuka scheduled izvještaja je **at-least-once**: ledger red (`userId`,
`dedupeKey` = `report:<slotKey>`) se claim-uje prije SMTP-a, a neizvjestan ishod (SMTP prihvatio, mark izgubljen)
postaje `UNKNOWN` koji se **nikad** ne šalje automatski ponovo. Run log više ne tvrdi „slanje nije uspjelo” za
takav slučaj — dobija vlastiti razlog `delivery_unknown`. Detalji:
[321](../implementation/321-w799-reports-09-at-least-once-delivery.md).

**Status poslije W7.98 (§24):** sweep se više ne upisuje samo na `onModuleInit` — `ReportSchedulesSchedulerService`
svakih **60 s** provjerava `getJobSchedulers()` i vraća izgubljenu registraciju (`report_schedules_schedule_recovered`),
a raspored je u `expectedSchedulers`, pa gubitak koji nadživi reconcile ide na `scheduler.late` (budžet **20 min**,
četiri prozora). `runDue` i dalje šalje samo najnoviji propušteni slot; stariji se bilježe kao `missed`. Detalji:
[320](../implementation/320-w798-reports-08-scheduler-reconciliation.md).

**Status poslije W7.97 (§23):** `ReportScheduleRun.scheduleId` je sada nullable sa `ON DELETE SET NULL`, a run nosi
snapshot `scheduleName`/`organizationalUnitId`; brisanje rasporeda **odvezuje** run log umjesto da ga kaskadno
obriše, pa isti 180-dnevni retention vrijedi za žive i obrisane rasporede. Detalji:
[319](../implementation/319-w797-reports-07-run-tombstone.md).

**Status poslije W7.96 (§22):** izmjena rasporeda i njen globalni audit red su jedna transakcija (`create`,
`update`, `enabled`, `delete`, te finalizacija runa u runner-u), pa pad audita poništava izmjenu umjesto da je
ostavi bez zapisa. Detalji: [318](../implementation/318-w796-reports-06-transactional-audit.md).

**Status poslije W7.95 (§21):** admin izmjene (`update`, `enabled`, `delete`) su uslovljene verzijom reda
(`If-Match: "vN"`, `version` kolona, 412 `OPTIMISTIC_STALE_WRITE`, 428 bez headera), pa paralelni update/enable/
delete više nije last-write-wins; runner i scheduler ne dižu verziju, da noćni run ne pravi lažne konflikte.
Transakcijski audit (`BA-reports-06`, W7.96) i run/tombstone politika (`BA-reports-07`, W7.97) su zatvoreni —
vidi §22 i §23. Detalji: [317](../implementation/317-w795-reports-05-schedule-version-cas.md).

## 7. Scheduled execution, dedupe i recovery

Due query je bounded na 20 i stabilno sortiran. Missed slotovi se evidentiraju, unique `slotKey` claim sprečava dva normalna workera, stale RUNNING može biti preuzet, recipients se reautorizuju, domen e-maila se provjerava i slanje je individualno. Run outcome i audit bilježe sent/skipped/omitted.

Attachment generator ne prenosi schedule filtere u pack load. `buildContent` primjenjuje service/group/priority na trend i overdue, dok `buildAttachments` šalje samo OU IDs, window i pack. Recipient zato dobija OU-wide CSV uz poruku/scope koji sugeriše uži presjek. Ovo je podatkovna i ugovorna greška visokog prioriteta.

Delivery claim zatim SMTP send pa DB `mark sent` ima neizbježan crash prozor: SMTP može prihvatiti poruku, proces pasti prije markiranja, stale retry otpustiti/preuzeti claim i poslati duplikat. Message-ID može pomoći downstream dedupeu, ali nije dokaz exactly-once. Run se može završiti, a audit write pasti i ostaviti job kao failed nakon stvarnog slanja. Potrebna je eksplicitna at-least-once semantika, durable outbox/provider idempotency gdje postoji i reconciler za stale delivery/run.

BullMQ scheduler se upisuje samo na module init. Redis flush poslije boota uklanja repeat scheduler bez periodičnog self-heala. `runDue` može nadoknaditi slotove tek kada sweep ponovo postoji; potreban je periodic reconcile/health alarm. `runNow` nema command idempotency key i svaki dvoklik legitimno kreira novi manual run i novi e-mail.

**Status poslije W7.106 (§32):** „pošalji sada” je sada **komanda sa identitetom**. `POST /reports/schedules/:id/run-now`
traži `Idempotency-Key`; isti ključ vraća spremljeni odgovor (bez drugog job-a), isti ključ sa drugim rasporedom je
`409`, a ključ putuje u job i u novu unique kolonu `ReportScheduleRun.commandKey` — pa čak i dva joba, dva workera ili
crash poslije enqueue-a proizvode **jedan** run i **jedan** e-mail. Zakazani runovi ostaju `NULL` (nema sudara sa
`slotKey`). Detalji: [328](../implementation/328-w7106-reports-16-run-now-idempotency.md).

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
| BA-reports-05 | P2       | Schedule mutation nema version/CAS; paralelni update/enable/delete je last-write-wins          | zatvoreno (W7.95) |
| BA-reports-06 | P2       | Schedule mutation/run finalizacija i globalni audit nisu atomarni                             | zatvoreno (W7.96) |
| BA-reports-07 | P2       | Brisanje schedulea kaskadno briše run historiju prije 180 dana                                | zatvoreno (W7.97) |
| BA-reports-08 | P2       | BullMQ repeat scheduler nema reconciliation nakon Redis gubitka                               | zatvoreno (W7.98) |
| BA-reports-09 | P2       | SMTP accepted → DB mark crash prozor može duplirati scheduled e-mail                          | zatvoreno (W7.99) |
| BA-reports-10 | P2       | Summary/dashboard cache nema scope-revoke/mutation invalidaciju; stale authorization prozor   | zatvoreno (W7.100) |
| BA-reports-11 | P2       | KB/ticket loaderi čitaju nekorištene osjetljive kolone i šire privacy blast radius            | zatvoreno (W7.101) |
| BA-reports-12 | P2       | Packovi nemaju formalno usklađenu event-time/snapshot-time window semantiku                    | zatvoreno (W7.102) |
| BA-reports-13 | P2       | Privacy/anonymization matrica ne pokriva run JSON, recipients, mail kopije i replike           | zatvoreno (W7.104) |
| BA-reports-14 | P2       | Run retention prune je best-effort i zavisi od aktivnog sweepa                                | zatvoreno (W7.103) |
| BA-reports-15 | P3       | Redis cache parseri validiraju samo plitki shape bez schema/version/size granice               | zatvoreno (W7.105) |
| BA-reports-16 | P3       | `runNow` nema command idempotency i ponovljen zahtjev šalje novi manual report                 | zatvoreno (W7.106) |
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

## 21. Implementacijski closeout — W7.95 (`BA-reports-05`)

**Nalaz:** `update`, `setEnabled` i `remove` su pisali po `id`-ju bez predpostavke o stanju koje je klijent vidio.
Dva taba nad istim rasporedom: drugi upis tiho vraća prvi (naziv, primaoci, OU, prekidač), a brisanje reda koji je
neko upravo uredio uništava rad bez ijedne greške.

**Rješenje.**

- **`version` na redu + `If-Match`:** aditivna migracija `20271201160000_report_schedule_version` dodaje
  `version INTEGER NOT NULL DEFAULT 1`; `ReportScheduleView.version` je token, a rute `PUT :id`,
  `PATCH :id/enabled` i `DELETE :id` ga traže (`parseIfMatch`; 428 bez headera, 400 za weak/malformed).
- **CAS kao predikat:** `updateMany({ where: { id, version }, data: { …, version: expectedVersion + 1 } })` i
  `deleteMany({ where: { id, version } })`; `count !== 1` ⇒ ništa nije upisano, a `staleScheduleWrite` vraća 412
  sa `currentEtag` (ili 404 ako je red u međuvremenu obrisan). Primaoci se mijenjaju u istoj zaključanoj sekvenci
  **poslije** CAS-a, pa zastarjeli snimak ne dira ni njih.
- **Token se provjerava i kad je izmjena bespredmetna** (`setEnabled` na već postavljeno stanje): tab koji je iza
  mora to saznati. Servis odbija i token koji nije cijeli broj ≥ 1, jer bi Prisma `undefined` izbacio iz `where` i
  CAS se tiho vratio u slijepi upis.
- **Verziju dižu samo admin izmjene:** runner/scheduler pišu `lastRunAt`/`nextRunAt` bez `version`, pa pozadinski
  run ne pretvara otvoren editor u lažni konflikt.
- **Klijent:** API šalje `If-Match` na sve tri rute i prosljeđuje verziju reda koji je korisnik učitao; na 412 lista
  se sama osvježava uz bs/en poruku `reports.errors.OPTIMISTIC_STALE_WRITE`.

**Testni dokaz:** `report-schedules.version.spec.ts` (**8**), `report-schedule-version.integration.spec.ts` (**3**,
PostgreSQL — dva paralelna upisa iz iste verzije daju `[0,1]`, brisanje briše samo prikazanu verziju, run ne diže
verziju), frontend `report-schedules-api.spec.ts` (**3**), `report-schedule-sheet.spec.tsx` (**1 → 3**); e2e
brisanje nosi token. Lokalno: backend **944 suite / 5.434 testa**, `reports` **35/186**, frontend **476 fajlova /
1.898 testa**; `eslint`/`tsc`/`prettier`/`i18n:check`/`wiring:check` (632 rute)/`db:migration-policy:check`
(123 migracije) zeleni.

**CI dokaz:** run **`45135094518` — `success`** na `b875c25` (commit paketa `497447a` + popravka fixture-a;
Detect changes, Backend build + test, Backend container + supply chain, **Backend PostgreSQL + Redis integration**,
Frontend build + test, Docs guard, CI gate), uz `Perf smoke` **`45132890071` — `success`** nad `497447a`. Prvi run
paketa **`45132890189` — `failure`** na `497447a`: `npm test` je pao jer dva postojeća speca grade
`ReportScheduleRecord` literale i novo obavezno polje `version` im je oborilo compile; popravka je u `b875c25`.

**Otvoreno i dokumentovano:** bez DB trigera za verziju (dizao bi je i run, što je lažni konflikt); transakcijski
audit ostaje `BA-reports-06` — audit red se i dalje piše poslije commit-a; `runNow`/`sendTest` nisu uslovljeni jer
ne mijenjaju konfiguraciju. Detalji:
[317-w795-reports-05-schedule-version-cas.md](../implementation/317-w795-reports-05-schedule-version-cas.md).

## 22. Implementacijski closeout — W7.96 (`BA-reports-06`)

**Nalaz:** svaka izmjena rasporeda je committovala prvo, a tek onda pisala globalni audit red; runner je isto
radio sa finalizacijom `ReportScheduleRun` i `report.schedule.sent`. Tri posljedice: (1) pad audita vraća grešku
uz već primijenjenu izmjenu, (2) pad procesa između dvije stavke ostavlja izmjenu/brisanje bez zapisa, (3) run
može ostati `RUNNING` uz audit koji tvrdi da je poslan, pa ga sweep po `staleRunMs` pošalje ponovo.

**Rješenje.**

- **Audit u transakciji izmjene:** `create`, `update`, `setEnabled` i `remove` prosljeđuju `Prisma.TransactionClient`
  u `recordAuditEntry` (`auditIn`/`auditInput`); u `update` redoslijed je CAS → primaoci → audit; u `remove`
  `deleteMany` i zapis o brisanju su nedjeljivi.
- **Runner:** `reportScheduleRun.update` (status, `sentCount`, `skipped`, `omittedAttachments`, `errorCode`,
  `durationMs`, `finishedAt`) i `report.schedule.sent` u jednom `$transaction`.
- **Novo ponašanje (namjerno):** ako audit ne može da se upiše, izmjena se **poništava** i API vraća grešku; run
  ostaje `RUNNING` i sweep ga preuzima.
- **Redoslijed brave:** „limit (W7.94) → audit chain”, bez ciklusa; nijedan drugi put ne uzima limit bravu.

**Testni dokaz:** `report-schedules.audit-atomicity.spec.ts` (**6** — svi upisi nose `tx`, audit pad poništava
`create`/`remove`), `report-schedules.spec.ts` (**+1** za runner: `['run:tx','audit:tx']`),
`report-schedule-audit-atomicity.integration.spec.ts` (**3**, PostgreSQL — rollback finalizacije runa, commit oba
reda, rollback brisanja). Lokalno: backend **945 suite / 5.442 testa**, `reports` **36/193**; `eslint`/`wiring`
(632 rute)/`db:migration-policy` (123)/`check-docs-content` zeleni; frontend nije diran.

**Otvoreno i dokumentovano:** `sendTest` audit ostaje poslije slanja (SMTP je spoljni efekat); isporuka e-maila
nije exactly-once — `dedupeKey` pokriva retry, ne pad između SMTP prihvatanja i upisa; run/tombstone politika je
`BA-reports-07`, BullMQ reconciliation `BA-reports-08`. Detalji:
[318-w796-reports-06-transactional-audit.md](../implementation/318-w796-reports-06-transactional-audit.md).

## 23. Implementacijski closeout — W7.97 (`BA-reports-07`)

**Nalaz:** `ReportScheduleRun.scheduleId` je bio `NOT NULL` sa `onDelete: Cascade`, pa je `DELETE
/report-schedules/:id` brisao i cijeli run log — i runove mlađe od 180 dana. Retention politika (§5.3) tako nije
važila za obrisane rasporede: isti dokaz se brisao na dva različita načina, a audit brisanja nije mogao reći kome
je izvještaj poslan.

**Rješenje.**

- **Snapshot u runu:** `scheduleName` i `organizationalUnitId` (`NOT NULL`) upisuju se pri kreiranju runa (`claim`,
  `runManual`, missed-slot `createMany`), pa odvezan run ostaje čitljiv.
- **FK `ON DELETE SET NULL`** i nullable `scheduleId`: brisanje rasporeda odvezuje runove, ne briše ih.
- **Retencija kao jedini brisač:** `pruneRuns` (180 dana) vrijedi isto za žive i obrisane rasporede.
- **Indeks** `(organizationalUnitId, createdAt)` za OU-scoped čitanje run loga.
- **Migracija `20271201170000` (124.):** backfill snapshot-a prije `NOT NULL`, `scheduleId` → nullable, FK
  recreate sa `SET NULL`; destructive approval u `ops/migrations/destructive-approvals.json` (nema brisanja
  podataka, samo promjena ponašanja constraint-a).

**Namjerne posljedice:** broj run redova se pri brisanju rasporeda **ne smanjuje**; run obrisanog rasporeda nije
dostupan kroz `GET /report-schedules/:id/runs` (raspored ne postoji → 404) — ostaje u bazi za forenziku i
retenciju. Runovi ne dobijaju FK na `OrganizationalUnit`: OU kaskada ne smije brisati dokaze, pa je OU u runu
snapshot, ne referenca.

**Testni dokaz:** `report-schedule-run-tombstone.integration.spec.ts` (**3**, PostgreSQL — detach + snapshot,
retention granica, `NOT NULL`), `report-schedules.spec.ts` (**+2** — snapshot na scheduliranom i manualnom runu).
Lokalno: backend **945 suite / 5.444 testa**, `reports` **36/195**; `eslint` 0, `wiring` 632 rute,
`db:migration-policy` **124**, `check-docs-content` OK.

**Otvoreno i dokumentovano:** privacy matrica nad run JSON-om i primaocima zatvorena je u W7.104 (§30), exactly-once
isporuka (`BA-reports-09`), BullMQ reconciliation
(`BA-reports-08`). Detalji: [319-w797-reports-07-run-tombstone.md](../implementation/319-w797-reports-07-run-tombstone.md).

## 24. Implementacijski closeout — W7.98 (`BA-reports-08`)

**Nalaz:** `ReportSchedulesSchedulerService.onModuleInit` je radio jedan `upsertJobScheduler` i to je bilo sve.
Raspored živi u Redis-u: restart bez perzistencije, `FLUSHALL`, failover na praznu instancu ili restore starijeg
snapshot-a obrišu ga — i **ništa** se ne žali. Do sljedećeg deploya ne ide nijedan zakazani izvještaj, a ni run log
ne nastaje, pa se gubitak ne vidi ni u `reports` ekranima.

**Rješenje.**

- **Samoiscjeljujući raspored:** poslije inicijalne registracije `setInterval` na **60 s** zove `reconcileSchedule()`
  — `getJobSchedulers(0, -1)` + zajednički predikat `isSchedulerRegistered` (prihvata i `key` i `id` oblik, isti
  popravak koji je W7.86 uveo) — i samo kad rasporeda nema, ponovna registracija kroz `registerRepeatableJob` uz
  `logger.warn report_schedules_schedule_recovered id=report-schedules-5min`. Timer je `unref()`-ovan, čisti se u
  `onModuleDestroy`, a drugi `onModuleInit` ne pravi drugi timer.
- **Alarm:** novi `expectedReportSchedulers` ulazi u `expectedSchedulers`, pa `scheduler.late` pokriva
  `not_registered`, `not_picked_up`, `failing` i `no_recent_success` sa budžetom **20 min** (četiri petominutna
  prozora: jedan propušten prozor je spor sweep ili jitter rolling restarta, četiri znače da sender stoji).
- **Isti delivery ugovor:** sweep i dalje ide sa `attempts: 1` (ponovni pokušaj bi se takmičio sa svojim
  nasljednikom za isti `slotKey`), `removeOnComplete: 5`, `removeOnFail: 20` — sada kroz zajednički helper, pa je
  registracija identična ostalim sweepovima.

**Namjerne posljedice:** jedan `getJobSchedulers` na 60 s po worker instanci (jedan Redis roundtrip); paralelni
reconcile je bezopasan jer je `upsertJobScheduler` idempotentan po ID-u. Reconcile **ne** nadoknađuje propuštene
slotove — `runDue` šalje samo najnoviji, stariji se bilježe kao `missed` (design §5.4).

**Testni dokaz:** `report-schedules.scheduler.spec.ts` (**8** — ugovor registracije, zdrava registracija se ne dira,
legacy `id` oblik, recovery poslije gubitka, timer + destroy, dvostruki init, logovanje neuspjelog reconcile-a,
greška vidljiva pozivaocu), `report-schedules.scheduler-reconciliation.integration.spec.ts` (**2**, stvarni Redis —
vraćanje obrisane registracije i tačno jedan raspored za dva workera), `ops-signal-collector.spec.ts` (**+2**),
`evaluate-ops-signals.spec.ts` (**+1** — `not_registered` i `no_recent_success` za `report-schedules-5min`).
Lokalno: backend **946 suite / 5.455 testa**, `reports` **37/203**; `eslint` 0; rute nepromijenjene (632);
migracije nepromijenjene (**124**); `check-docs-content` OK.

**Otvoreno i dokumentovano:** `runNow` nema command idempotency (`BA-reports-16`), SMTP accepted → DB mark crash
prozor (`BA-reports-09`), retention zavisi od sweep-a (`BA-reports-14`). Detalji:
[320-w798-reports-08-scheduler-reconciliation.md](../implementation/320-w798-reports-08-scheduler-reconciliation.md).

## 25. Implementacijski closeout — W7.99 (`BA-reports-09`)

**Nalaz:** claim → SMTP → `mark sent` ima neizbježan prozor: SMTP može prihvatiti poruku, a proces pasti prije
upisa. Audit je tražio eksplicitnu at-least-once semantiku i reconciler za stale delivery; ono što je stvarno
falilo nije bio ledger (W-ovi iz `notifications` su ga već napravili durabilnim i bez slijepog resenda), nego
**šta reports sloj tvrdi o tom ishodu**: runner je svaki izuzetak prevodio u `delivery_failed`, pa je run log za
poruku koja je možda stigla pisao „slanje nije uspjelo”. Takav zapis vodi operatera u ručno ponovno slanje —
duplikat koji je nalaz i opisivao.

**Rješenje.**

- **Novi razlog preskakanja `delivery_unknown`.** `NotificationEmailOutcomeUnknownError` se u runner-u hvata
  odvojeno od ostalih grešaka (`reportRecipientSkipReasons.deliveryUnknown`), log linija je
  `report_schedule_delivery_unknown` (umjesto `…_delivery_failed`). Frontend mapira oba razloga
  (`reports.schedules.skip.delivery_unknown`, bs/en).
- **Explicit at-least-once ugovor** (i u kodu i u dokumentaciji): jedan izvještaj po `(primalac, slot)` se šalje
  **najmanje jednom**, nikad slijepo dvaput. Ledger je taj koji drži „ne dvaput” — ključ je stabilan
  `report:<slotKey>`, pa i stale-run takeover i ponovni sweep istog slota udaraju u isti red.
- **Stale claim se rješava kao `UNKNOWN`, ne kao retry.** Claim stariji od 10 min se **ne** pušta ponovo; red
  prelazi u `UNKNOWN` sa `lastErrorCode = stale_claim`, bez `nextRetryAt`. Ops-health već broji `stuck` i
  `unknown` redove (`countStuckNotificationEmailDeliveries`, `countUnknownNotificationEmailDeliveries`), pa je taj
  ishod vidljiv i van run loga.
- **Takeover je sada vidljiv.** Kad sweep preuzme stale `RUNNING` run, loguje
  `report_schedule_run_taken_over slot=… run=… stale_after_ms=…` — to je jedina linija koja dokazuje da je
  at-least-once put stvarno prošao (i da je ledger, a ne sreća, spriječio duplikat).

**Posljedice po ponašanje:**

- Neizvjestan ishod **nikada** ne izaziva automatsko ponovno slanje; run ostaje `FAILED`/`PARTIAL` sa
  `delivery_unknown`, a odluka o ponovnom slanju je operaterska (queue-admin replay ne dira `UNKNOWN`).
- Ponovni sweep istog slota, kao i stale takeover, **ne** šalju drugi e-mail: primalac koji je već dobio izvještaj
  se broji kao poslan (`DUPLICATE` nije „preskočen”), pa `sentCount` ostaje tačan.
- Poruka koja je stvarno odbijena (SMTP greška) i dalje ide u `delivery_failed` — dva razloga sada znače dvije
  različite činjenice.

**Testni dokaz:** `report-schedules.spec.ts` (**+3**, jedan postojeći test je **preinačen** — njegova stara
tvrdnja `delivery_failed` je bila upravo bug): neizvjestan ishod poslije prihvaćenog SMTP-a, ponovni sweep istog
slota ne šalje drugi e-mail, stale claim ⇒ `delivery_unknown` + `UNKNOWN`/`nextRetryAt = null`.
`report-schedule-delivery-crash-window.integration.spec.ts` (**novo, 3**, PostgreSQL): CLAIMED red poslije
izgubljenog marka, stale prozor ⇒ `UNKNOWN` i **jedan** SMTP poziv ukupno (i treći prolaz ostaje blokiran),
svjež claim ⇒ `DUPLICATE` bez slanja, bez kvara ⇒ SMTP dokaz prihvatanja u redu + ponovni poziv je no-op. Lokalno:
backend **946 suite / 5.457 testa**, `reports` **37/205**; frontend `vitest src/components/reports` 3 fajla / 9
testova; `eslint` 0; rute i migracije nepromijenjene (632 / 124).

**Otvoreno i dokumentovano:** `runNow` command idempotency (`BA-reports-16`), retention zavisi od sweep-a
(`BA-reports-14`), privacy matrica nad run JSON-om i primaocima (`BA-reports-13`). Provider-level idempotency ne
postoji (SMTP je „best effort” po Message-ID); dokumentovano kao granica, ne kao obećanje. Detalji:
[321-w799-reports-09-at-least-once-delivery.md](../implementation/321-w799-reports-09-at-least-once-delivery.md).

## 26. Implementacijski closeout — W7.100 (`BA-reports-10`)

**Nalaz:** dashboard/SLA summary se keširao pod `(userId, zone)` sa TTL-om od 60 s. Payload je projekcija **onoga
što korisnik smije vidjeti**, pa je nakon scope revokea (rola/permission, grupa, premještaj OJ, deaktivacija) do
minute mogao prikazivati brojeve izračunate pod širim pristupom. Nijedna sigurnosna promjena nije dirala cache, a
TTL je bio jedina granica — što je za *autorizaciju* pogrešna granica.

**Rješenje.**

- **Verzija autorizacije u ključu:** `reports:dashboard-summary:<user>:v<authzVersion>:<zone>` i
  `reports:sla-summary:<user>:v<authzVersion>`. `User.authzVersion` je isti fence koji već koriste principal
  context cache i sesijska provjera, pa revoke mijenja ključ **odmah** — stari zapis postaje nedostupan, a ne
  briše se aktivno (istječe sam u 60 s; nijedan pisac ne mora znati koje korisnike eviktovati).
- **Jedan fenced read više, praktično besplatan:** servis čita `PrincipalContextLoader.load(actorUserId)`, koji je
  unutar zahtjeva memoiziran (isti promise koji su koristili guardovi) i sam provjerava `User.authzVersion`;
  single-flight ključevi takođe uključuju verziju.
- **Postavke u ključu:** reporting zona je i dalje dio dashboard ključa („opened today” granica dana). SLA summary
  ne zavisi od postavki — njegove brojeve nosi `TicketSlaState`, pa nema šta da se invalidira iz settings-a.
- **Mutacija tiketa ostaje TTL:** 60 s je odobrena granica (staging k6, 2026-09-25) — namjerno se **ne** uvodi
  per-write invalidacija, jer bi svaka ticket mutacija morala znati koje cache ključeve gasi.
- **OU dashboard cache (`reports:dashboard:<hash>`) nije sigurnosni problem:** sadržaj jedinice ne zavisi od toga
  ko pita, a pristup se provjerava prije čitanja cache-a.

**Namjerne posljedice:** poslije sigurnosne promjene prvi zahtjev računa iznova (jedan agregat), a ne servira stari
presjek; stari ključevi žive najviše do TTL-a i sami nestaju. Bez migracije, bez novih ruta, bez promjene payloada.

**Testni dokaz:** `summary/report-summary-cache.spec.ts` (**+1**) — ključ nosi verziju, zona i korisnik su i dalje
razdvojeni, promjena verzije mijenja **oba** ključa; `report-summary.service.spec.ts` (**+2**) — poslije bumpea
verzije servis ponovo računa (cache hit samo za istu verziju, oba payloada postoje pod svojim ključem) i SLA
summary se kešira pod istom verzijom. Lokalno: backend **946 suite / 5.460 testa**, `reports` **37/208**;
`eslint` 0; rute i migracije nepromijenjene (632 / 124).

**Otvoreno i dokumentovano:** strogi versioned schema/payload cap Redis parsera je `BA-reports-15` (P3);
retention run loga `BA-reports-14`; privacy matrica `BA-reports-13`. Detalji:
[322-w7100-reports-10-authorization-aware-cache.md](../implementation/322-w7100-reports-10-authorization-aware-cache.md).

## 27. Implementacijski closeout — W7.101 (`BA-reports-11`)

**Nalaz:** reports loaderi su čitali šire nego što im treba, pa je privacy blast radius u memoriji bio veći od
podataka koji izvještaj koristi:

1. **No-window put je čitao cijeli red.** `loadScopedReportTickets` je `select` primjenjivao samo kad je prozor
   zadat; bez prozora (dashboard i bottleneck fallback) Prisma je vraćala **sve** kolone, uključujući
   `description` i `formData`.
2. **Identifikacione kolone za packove koji broje redove.** Prozorski put je uvijek uzimao `title`,
   `ticketNumber` i `isConfidential`, iako `monthly_kpi`, `overdue_by_service` i `top_close_codes` čitaju samo
   `id`, `serviceId`, `closeCodeId` i vremenske oznake.
3. **Close codes cijeli red** (`serviceId`, `isActive`, `createdAt`, `updatedAt`) za pack koji štampa `id/key/name`.
4. **KB loader** je W7.53 već sveo na `id/title/serviceId/organizationalUnitId/viewCount`, pa tu nije bilo šta
   dodatno suziti; feedback upit je bio uzak od ranije.

**Rješenje.**

- **Dvije imenovane projekcije:** `reportTicketSnapshotSelect` (agregati — bez `title`, `ticketNumber`,
  `isConfidential`) i `reportTicketRowSelect` (snapshot + identifikacione kolone). Nijedna ne sadrži free text.
- **Projekcija je obavezna:** `loadScopedReportTickets` uvijek prosljeđuje `select` (default `snapshot`), pa
  cijeli-red read više ne postoji ni na jednom putu. `projection: 'row'` je eksplicitan zahtjev onoga koji štampa
  tiket (danas `forward_ping_pong`, koji ima svoj loader i svoj select).
- **Close codes:** `select: { id, key, name }`.

**Posljedice po ponašanje:** identični payloadi i brojevi; manje kolona u memoriji (nema naslova ni confidential
markera za packove koji ih ne koriste, nema free texta nigdje). `ReportTicketSnapshot` tip i dalje opisuje pun
oblik (packovi su tipizirani nad njim), pa je projekcija garantirana na nivou upita i **testirana** tamo gdje se
može dokazati — u argumentima `findMany`.

**Testni dokaz:** `load-scoped-report-tickets.projection.spec.ts` (**novo, 5**): nijedna projekcija ne sadrži
`description`/`formData`/`resolutionSummary`/`resolutionNote`; agregatna projekcija ne sadrži identifikacione
kolone; **no-window read ima `select`** (regresija za cijeli-red read); `projection: 'row'` daje identifikacione
kolone uz zadate granice prozora i `take`; bez OJ nema upita. Lokalno: backend **947 suite / 5.465 testa**,
`reports` **38/213**; `eslint` 0; rute i migracije nepromijenjene (632 / 124).

**Otvoreno i dokumentovano:** DB agregacija/paginacija za preostale packove ostaje rezidualni rizik (audit §10;
`BA-reports-01` je uveo bounded read + probe red); strogi versioned schema/payload cap Redis parsera je
`BA-reports-15`; privacy matrica nad run JSON-om i primaocima je `BA-reports-13`. Detalji:
[323-w7101-reports-11-read-projections.md](../implementation/323-w7101-reports-11-read-projections.md).

## 28. Implementacijski closeout — W7.102 (`BA-reports-12`)

**Nalaz:** svaki domen je sam odgovarao na pitanje „je li ovaj red u periodu?”, i to na svoj način:

1. **Dvije konvencije gornje granice.** Ticket snapshot, forward ping-pong, time tracking, KB glasovi i KPI
   builder koristili su inkluzivno `to` (`lte`/`<=`); problem, change i asset loaderi isključivo (`lt`). Tiket
   nastao tačno na `to` ulazio je u **dva** susjedna mjeseca — a upravo susjedni mjeseci su ono što scheduled
   izvještaji porede. Dashboard SQL je isto koristio `BETWEEN` (inkluzivno) za tekući i prethodni period, pa je
   „promjena u odnosu na prethodni period” brojala granicu dvaput.
2. **Snapshot packovi bez oznake.** `asset_inventory`, `asset_expiring`, `asset_license_compliance`,
   `asset_inactive_holders`, `problem_backlog` i `overdue_by_service` ne opisuju period nego trenutno stanje
   (`now`, odnosno `horizonDays`), a `monthly_kpi`, `kb_helpfulness`, `problem_top` i `asset_top_tickets` miješaju
   događaje iz perioda sa trenutnim stanjem. Pozivalac iz API-ja nije mogao razlikovati te slučajeve: descriptor je
   nosio samo `key/slug/columns`.
3. **Nije bilo mjesta gdje ugovor živi.** Granice su bile rasute po 15 fajlova; nijedan test nije branio povratak
   na inkluzivno `to`.

**Rješenje.**

- **Jedan interval:** `[from, to)` — `from` je u periodu, `to` nije. `isTimestampInWindow` i svi SQL loader-i
  (`createdAt`, `closedAt`, `resolvedAt`, `startedAt`, `linkedAt`, `identifiedAt`, planned overlap, KB glasovi,
  dashboard/bottleneck SQL) sada koriste istu granicu. Change schedule ostaje jedini **overlap** (`plannedStart <
  to` i `plannedEnd > from`), jer change nije trenutak nego interval.
- **Katalog:** novi `pack-window-semantics.ts` nosi `reportPackWindowSemantics` za svih 18 packova:
  `mode` (`event-time` / `snapshot-time` / `mixed`), `eventTime[]` (npr. `ticket.resolvedAt`,
  `problemEvent.createdAt (action ticket_linked)`), `snapshotParts[]` (npr. `overdueCount (SLA state at now)`,
  `articles (knowledgeArticle rows read as they are now, no article timestamp)`) i `selection`
  (`instant` / `overlap` / `none`).
- **Vidljivo pozivaocu:** `ReportPackDescriptor.windowSemantics` u `GET /reports/packs`;
  `preview.window = { from, to, boundaries: '[from, to)', semantics }`; audit `reports.export` dobija
  `boundaries` i `windowMode` (allowlist u `audit-action-schema-registry.ts`, i dalje `pseudonymous`). Frontend
  prikazuje značku „period bira događaje / stanje u trenutku generisanja / događaji + trenutno stanje” uz preview.

**Posljedice po ponašanje.** Payloadi ostaju isti osim na granici: tiket/događaj tačno na `to` sada pripada
**samo** sljedećem periodu (ranije obama), a audit exporta nosi dva nova ključa. Nijedan pack nije dobio novu
kolonu. Snapshot packovi i dalje ne zavise od perioda — sada to i piše.

**Testni dokaz.** `pack-window-semantics.spec.ts` (**novo, 26 testova**): katalog ima tačno jedan unos po packu;
svaki nosi `[from, to)`; `snapshot-time` nema `eventTime` i ima `snapshotParts` (i obrnuto za `event-time`);
overlap ima samo `change_schedule`; granice `from` ulazi / `to` ne ulazi; dva susjedna perioda **particioniraju**
svaki trenutak tačno jednom; izvorni kod 15 loader-a ne smije vratiti `lte: … window.to` ni `<= window.to` (i
`gt: … window.from` smije samo change overlap). `reports.service.spec.ts` +2 (descriptor nosi semantiku, preview i
audit nose granice/mode). Lokalno: backend **948 suite / 5.491 test**, `reports` **39/239**; frontend **476
fajlova / 1.898 testova**; `eslint` 0; rute i migracije nepromijenjene (632 / 124).

**Otvoreno i dokumentovano:** privacy matrica nad run JSON-om/primaocima (`BA-reports-13`), retention koji zavisi
od sweep-a (`BA-reports-14`), strict schema Redis parsera (`BA-reports-15`), `runNow` idempotency
(`BA-reports-16`), PDF intent (`BA-reports-17`), preview read-audit (`BA-reports-18`). Detalji:
[324-w7102-reports-12-window-semantics.md](../implementation/324-w7102-reports-12-window-semantics.md).

## 29. Implementacijski closeout — W7.103 (`BA-reports-14`)

**Nalaz:** 180-dnevna retention politika run loga (`ReportScheduleRun`) postojala je samo kao jedan `deleteMany` na
kraju delivery sweepa, i to „best-effort” u tri smisla:

1. **Zavisila je od isporuke.** `runDue` je prvo čitao konfiguraciju i vraćao se odmah kad je scheduled e-mail
   isključen — pa se retention zaustavljao bez ijednog signala (run log raste zauvijek, tačno suprotno §5.3).
2. **Nije imala svoj raspored.** Prune se dešavao samo ako sweep uopšte krene; nije bilo dnevnog/nightly posla koji
   garantuje rotaciju, niti ijednog pokazatelja da prune nije radio.
3. **Brisala je neograničeno i ćutke.** Jedan `deleteMany` nad cijelim backlogom drži dug lock i pravi jedan veliki
   WAL burst, a `.catch(() => undefined)` je svaku grešku pretvarao u tišinu — uključujući `deadlock` ili prekid
   konekcije.

**Rješenje.**

- **Novi modul `report-schedule-run-retention.ts`:** `pruneReportScheduleRuns(prisma, { now, batchSize?,
  maxBatches?, retentionDays? })` briše **po id-u** u batchevima (500), staje na budžetu (40 batcheva = 20 000 redova
  po prolazu) i vraća `{ deleted, cutoff, batches, remaining }`. Kratak batch je dokaz da je prozor prazan; pun batch
  tjera novi upit, a `remaining` kaže da sljedeći prolaz nastavlja. Greška se **prosljeđuje**.
- **Zaseban dnevni posao:** `report-schedules-retention-daily` (`17 3 * * *`, job `prune-schedule-runs`, 3 pokušaja
  sa backoff-om) na istoj `report-schedules` queue; procesor ga rutira u `ScheduledReportRunner.pruneExpiredRuns()`,
  a greška ide do BullMQ-a (retry + failure signal) — nema više `catch`.
- **Sweep i dalje prži, ali prije svog gate-a:** `runDue` poziva retention **prije** čitanja konfiguracije, u
  `try/catch` koji loguje `report_schedule_run_prune_failed` i **nastavlja isporuku**. Tako isključen e-mail ne
  zaustavlja rotaciju, a pad retentiona ne zaustavlja izvještaje.
- **Reconcile pokriva oba rasporeda:** W7.98 reconcile se vraćao čim nađe sweep; sada provjerava oba id-a i vraća
  tačno one koje je vratio (`report_schedules_schedule_recovered id=…`).
- **Vidljivost:** svaki prolaz loguje `report_schedule_runs_pruned deleted=… cutoff=… batches=… remaining=…`.

**Posljedice po ponašanje.** Isti prozor (180 dana) i ista semantika tombstone-a (W7.97: run preživi brisanje
rasporeda i briše se samo retentionom). Novo: retention radi i kad je isporuka isključena, radi u batchevima i
prijavljuje koliko je ostalo; dnevni posao se retry-uje. Bez migracije (indeks `ReportScheduleRun(createdAt)` već
postoji), bez novih ruta.

**Testni dokaz.** `report-schedule-run-retention.spec.ts` (**novo, 7**): briše samo starije od prozora i vraća
`cutoff`; briše u batchevima; staje na budžetu uz `remaining: true`; idempotentan drugi prolaz; red tačno na `cutoff`
ostaje; DB greška **izlazi** iz funkcije; prozor dolazi iz konstante. `report-schedules.processor.spec.ts`
(**novo, 4**): retention job zove samo retention, greška ide do BullMQ-a, sweep job zove `runDue`, manual job traži
`scheduleId`. `report-schedules.spec.ts` (+3): prune radi sa isključenom isporukom; pad prune-a se loguje i
isporuka ide dalje; `pruneExpiredRuns` loguje rezultat. `report-schedules.scheduler.spec.ts` (+1, 5 ažurirano):
dva rasporeda na init-u, reconcile vraća samo onaj koji nedostaje, legacy `id` shape i dalje prihvaćen.
`scheduled-jobs.wiring.spec.ts` (11 rasporeda / 22 registracije). `report-schedule-run-tombstone.integration.spec.ts`
sada poziva **stvarni** retention pass na PostgreSQL-u (`batchSize: 1`) umjesto ručno napisanog `deleteMany`-ja.
Lokalno: backend **950 suite / 5.506 testova**, `reports/schedules` **10 suite / 82 testa**, `reports` **41 suite / 254 testa**; `eslint` 0; rute i
migracije nepromijenjene (632 / 124).

**Otvoreno i dokumentovano:** per-job vidljivost u ops-health kartici ostaje na nivou queue-a (`scheduler.late`
prati `report-schedules` queue i njen posljednji uspjeh), pa dnevni retention nema **svoj** `lastSuccessMaxAgeMs`;
to je svjesno, jer retention radi i na svakom sweepu (koji je expected scheduler sa alarmom od 20 minuta). Privacy
matrica nad run JSON-om/primaocima ostaje `BA-reports-13`; strict cache schema `BA-reports-15`; `runNow`
idempotency `BA-reports-16`; PDF intent `BA-reports-17`; preview read-audit `BA-reports-18`. Detalji:
[325-w7103-reports-14-run-retention.md](../implementation/325-w7103-reports-14-run-retention.md).

## 30. Implementacijski closeout — W7.104 (`BA-reports-13`)

**Nalaz:** modul je imao nepotpunu privacy sliku — anonimizacija je brisala **žive** primaoce (`ReportScheduleRecipient`,
`NotificationEmailDelivery`) i pauzirala raspored bez primalaca, ali **historija i vlasništvo** nisu bili pokriveni:
`ReportScheduleRun.skipped` je 180 dana čuvao `[{ userId, reason }]` sa sirovim ID-em primaoca, `triggeredByUserId`,
`createdByUserId` i `updatedByUserId` nikad nisu bili dirani, Redis ključ `reports:*-summary:<userId>:v…` nosi ID u
**ključu**, a poštanska kopija i CSV prilozi izlaze iz sistema bez ijedne riječi o klasifikaciji ili roku. Nijedan
dokument nije mogao odgovoriti, za jednu površinu, šta sadrži, koliko živi, šta se s njom radi i čime se to dokazuje.

**Rješenje.**

- **Matrica u kodu:** `report-privacy-matrix.ts` — 11 redova, svaki sa `identity`, `retention`, `action` (jedna od
  sedam enumerisanih radnji: `delete`, `null`, `scrub-json`, `retain`, `pseudonymous`, `cache-ttl`, `outside-system`),
  `countKey` i objašnjenjem gdje je implementirano. Pokriva tri modela (`ReportSchedule`, `ReportScheduleRecipient`,
  `ReportScheduleRun`) i četiri površine van njih (delivery ledger, audit lanac, Redis replika, mail kopija).
- **Selekcija na jednom mjestu:** `report-mentions.ts` — manual trigger, dvije kolone vlasništva i runovi čiji `skipped`
  sadrži osobu, potonji jednim `jsonb` containment upitom (`skipped @> '[{"userId": …}]'`); Prisma ne izražava
  „element niza ima polje = x” prenosivo, a containment pogađa svaki entry bez obzira na `reason`.
- **Upis:** `scrub-report-mentions.ts` — `triggeredByUserId` ⇒ `NULL` (run zadržava trigger, period, status i brojače),
  `skipped` entry gubi `userId` a zadržava `reason`, creator/updater se čiste **odvojeno** (tuđi raspored ne izgubi
  creatora). Sve sa ID-em u predikatu ⇒ drugi prolaz je no-op i dva workera se ne vrte.
- **Preview = execute:** `preview()` broji `reportRunsDetached`, `reportRunSkipped`, `reportSchedulesDetached` iz iste
  selekcije koju prosljeđuje u `execute()`; ranije je preview pokazivao samo žive primaoce.
- **Kopija koja izlazi iz sistema:** aplikacija ne čuva tijelo izvještaja i ne može povući poslanu kopiju, pa
  klasifikacija i rok putuju **s porukom** — `classificationNote` je prvi `notes[]` element svakog scheduled e-maila
  (bs i en), uvijek prisutan, i u testnom i u regularnom slanju.
- **Čitanje poslije anonimizacije:** `runs()` vraća `skipped[].userId: string | null`, a UI prikazuje
  „Anonimizovan primalac”/„Anonymised recipient” uz zadržani razlog (bez toga bi pisalo prazno ime).

**Posljedice po ponašanje.** Run log poslije anonimizacije ima isti period, status, brojače i razloge, ali nijedan
ID osobe; broj primalaca se ne mijenja (historijski snapshot ostaje tačan). Raspored ostaje aktivan ako ima još
primalaca, inače se pauzira (postojeće ponašanje); `createdBy`/`updatedBy` su `NULL`. Audit lanac se ne briše.
Bez migracije i bez novih ruta (632); mijenja se samo jedan DTO tip.

**Testni dokaz.** `scrub-report-mentions.spec.ts` (**novo, 8**): detach bez gubitka činjenica; `reason` preživi, tuđi
i entry bez `userId` netaknuti; idempotencija kroz stvarni containment (drugi prolaz vraća 0); creator/updater
odvojeno; nula upisa bez footprinta; selekcija je jedan containment upit sa **bound** vrijednošću; `stripSkippedUserIds`
ostavlja malformed JSON i broji svaki entry. `report-privacy-matrix.spec.ts` (**novo, 8**): modeli iz šeme, površine van
modela, enumeracije, brojač ⇔ radnja, jedinstveni ID-evi, banner u oba lokalna teksta, retention = 180 dana.
`anonymization.integration.spec.ts` (+1, PostgreSQL): schedule + manual run sa `skipped` za osobu i agenta; poslije
`execute` run zadržava `MANUAL`/`PARTIAL`/`2`/`1`, `triggeredByUserId = null`, `skipped = [{reason: inactive},
{agent, no_access}]`, raspored ima `createdByUserId`/`updatedByUserId = null`, `enabled = true` i samo agenta kao
primaoca. Lokalno: `privacy` + `reports` + `audit-log` **86 suite / 476 testova** (48 skipped bez
`PRIVACY_IT_DATABASE_URL`), frontend **476 fajlova** zeleno, `eslint` 0, `wiring:check` 632, migracije 124. CI
[`45200003644`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45200003644) **success** na `846ac24`.

**Otvoreno i dokumentovano:** Redis replika je `cache-ttl` — ključ nosi user id, vrijednost je agregat bez liste
tiketa, TTL 60 s, pa evakuacija po ID-u ne bi imala šta da sačuva (i tražila bi `SCAN`); SMTP/CSV kopija ostaje van
kontrole aplikacije (banner + retention smjernica, ne brisanje); `AuditLog` je `pseudonymous` — ID-evi ostaju, lanac
se ne briše jer dokazuje ko je šta eksportovao. Detalji:
[326-w7104-reports-13-privacy-matrix.md](../implementation/326-w7104-reports-13-privacy-matrix.md).

## 31. Implementacijski closeout — W7.105 (`BA-reports-15`)

**Nalaz:** sva tri report cachea (dashboard/SLA summary, OU dashboard, trendovi) radila su `JSON.parse` pa nekoliko
`typeof` provjera i servirala rezultat. Nije bilo **verzije šeme** (deploy ili rollback ostavlja tuđi oblik čitljivim
do isteka TTL-a), nije bilo **granice veličine** (`JSON.parse` nad čim god je u ključu, na svakom zahtjevu), a
validatori su bili plitki: `typeof value === 'object'` propušta niz, `typeof count === 'number'` propušta `-1`,
`1.5` i `Infinity`, a `statusCounts`, `profiles`, `points`, `kpis` i `aging` nisu gledani iznutra — dashboard je
prolazio sa `aging: {}`, trendovi sa `points: [{}]`.

**Rješenje.** Novi `cache/report-cache-envelope.ts` uvodi jedini put do Redisa: zapis je `{ v, data }` (tačno dva
ključa, `v` cijeli broj ≥ 1), veličina se mjeri `Buffer.byteLength` i odbija **prije** parsiranja (cap 256 KiB),
a ishod čitanja ima razlog: `no_client`, `absent`, `oversized`, `invalid_json`, `not_enveloped`,
`version_mismatch`, `invalid_payload`, `error`. Samo `oversized` i `invalid_json` se **brišu** (nikad ne mogu biti
validni); `version_mismatch` se **ne** briše jer bi tokom rolling deploya dva builda evictirala jedan drugom zapise.
Pisanje odbija payload preko capa i onaj koji se ne može serijalizovati. Novi `cache/report-cache-shape.ts` daje
primitve (`isPlainRecord` odbija nizove, `isFiniteNumber` odbija `NaN`/`Infinity`, `isCount` traži nenegativan
cijeli broj, `isBoundedArray`/`everyItem` kap prije gledanja unutar kolekcije). Novi
`cache/parse-report-dashboard-cache.ts` i `cache/parse-report-trends-cache.ts` provjeravaju svako polje koje ekran
čita, uključujući `csatScaleMax > 0` i granularnost iz ovog builda; `summary/parse-report-summary-cache.ts` je
prepisan na iste primitive (trinaest brojača, tačno 14 dana, `statusCounts`/`priorityCounts` sa imenom i brojačem,
SLA `exposure` na svakom nivou).

**Posljedice po ponašanje.** Tuđa, stara, prevelika ili plitka vrijednost više se ne servira — računa se iznova iz
baze (najviše jedan sporiji zahtjev, nikad pogrešan broj); otrovani ključevi nestaju na prvom čitanju. Nema promjene
API-ja, ruta, ključeva ni TTL-ova: `v<authzVersion>` u ključu (W7.100) je **autoritet**, `v` u envelope-u je
**oblik** payloada.

**Testni dokaz.** `report-cache-envelope.spec.ts` (**novo, 14**) i `report-cache-validators.spec.ts` (**novo, 27**)
pokrivaju sve grane tabela iz closeouta (uključujući bajtove vs. znakove i negativan `net`);
`parse-report-summary-cache.spec.ts` 12 → **24**, `report-summary-cache.spec.ts` 5 → **6**,
`report-dashboard.cache.spec.ts` +1 sa **kompletnim** fixture-om (stari `{} as kpis` bio je tačno ono što je plitki
parser propuštao). Lokalno: `reports` **44 suite / 318 testova** (16 skipped bez baze/Redis-a), `eslint` 0,
`nest build` zelen; rute (632) i migracije (124) nepromijenjene. CI [`45232992929`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45232992929) **success** na `189366d`.

**Otvoreno i dokumentovano:** cap je po zapisu (Redis `maxmemory` ostaje infrastruktura); envelope ne mijenja TTL
niti ključ, pa W7.100 garancija ostaje netaknuta; vrijednost koja prođe validator a ipak je poslovno netačna živi do
TTL-a (dokumentovana granica iz W7.100). Detalji:
[327-w7105-reports-15-cache-envelope.md](../implementation/327-w7105-reports-15-cache-envelope.md).

## 32. Implementacijski closeout — W7.106 (`BA-reports-16`)

**Nalaz:** `runNow` je bio običan `POST` — provjeri pristup, `queue.add(...)`, vrati `{queued:true}`. Nijedan dio
zahtjeva nije nosio identitet komande, pa su dvoklik, browser retry nakon timeouta, dvije kartice ili ponovljen job
bili **legitimno novi** manual run, svaki sa stvarnim e-mailom svakom primaocu. `attempts: 1` i
`removeOnComplete: { count: 50 }` nisu pomagali: job bez `jobId`-ja je uvijek nov. Ostale komande u sistemu
(`tickets/reopen`, `confidential`, `split`) idu kroz `RequestIdempotencyService`; `reports` ga nije koristio.

**Rješenje.** (1) Ruta traži `Idempotency-Key` (bez njega `400 IDEMPOTENCY_KEY_REQUIRED`, prije servisa); servis
validira format i vraća `400 REPORT_IDEMPOTENCY_KEY_INVALID` umjesto 500 iz idempotency sloja. (2) `runNow` izvršava
komandu kroz `RequestIdempotencyService` u namespace-u `report.schedule.run-now` sa payloadom
`{ scheduleId, actorUserId }`: isti ključ ⇒ replay spremljenog odgovora bez drugog job-a, isti ključ sa drugim
rasporedom ⇒ `409 IDEMPOTENCY_PAYLOAD_MISMATCH`, ključ u toku ⇒ `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`; bez queue-a
ostaje `{queued:false}`. (3) Ključ putuje u job (`jobId` je hash ključa, jer BullMQ odbija `:` u id-u) i u **novu
unique kolonu** `ReportScheduleRun.commandKey` (migracija `20271201180000`, aditivna): runner upisuje run prije
komponovanja, a drugi job za isti ključ dobija `P2002`, loguje `report_schedule_manual_duplicate` i **ne šalje ništa**.
Zakazani runovi ostavljaju `NULL`, pa `slotKey` dedupe ostaje netaknut. (4) Frontend šalje header i drži **jedan
ključ po rasporedu** dok ishod nije poznat: retry poslije greške je ista komanda, a novi ključ se mint-a tek poslije
definitivnog odgovora.

**Posljedice po ponašanje.** Ponovljeni zahtjev sa istim ključem vraća `202 {queued:true}` iz zapisa, bez novog job-a
i bez novog e-maila; dvoklik je replay ili `409`, nikad dva izvještaja; svjesno novo slanje zahtijeva novi ključ.
Zakazani izvještaji se ne mijenjaju. Rute ostaju 632 (samo jedan obavezan header), migracija je **125.** i aditivna.

**Testni dokaz.** `report-schedules.run-now.spec.ts` (**novo, 13**), `report-schedules.spec.ts` (+4),
`report-schedules.processor.spec.ts` (+1), `report-schedule-run-now-idempotency.integration.spec.ts`
(**novo, 4**, PostgreSQL — uključujući **osam paralelnih** inserta sa istim ključem: tačno jedan prolazi), frontend
`report-schedules-api` (+3) i `report-command-key` (**novo, 4**). Lokalno: `reports` **45 suite / 336 testova**,
`nest build` i `tsc --noEmit` zeleni, `npm run lint` bez grešaka, `wiring:check` 632, migracije **125**.

**Otvoreno i dokumentovano:** idempotency zapis se čuva 24 h (zajednička politika), ali unique `commandKey` na run
redu čuva garanciju dokle god run postoji (180 dana); ključ vezuje komandu za raspored i aktera, ne za vrijeme
(retry poslije 10 minuta je ista komanda); `runNow` ne piše revizorski zapis (run log je trag izvršavanja).
Detalji: [328-w7106-reports-16-run-now-idempotency.md](../implementation/328-w7106-reports-16-run-now-idempotency.md).
