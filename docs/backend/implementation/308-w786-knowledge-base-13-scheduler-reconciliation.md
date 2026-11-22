# W7.86 — `BA-knowledge-base-13`: scheduler se sam vraća nakon Redis gubitka, a view flush više ne visi o podsjetniku

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view flush”<br>
**Kod:** `knowledge-base-review-reminder.job.constants.ts` (dvije konstante),
`knowledge-base-review-reminder.scheduler.service.ts` (reconcile + `OnModuleDestroy`),
`knowledge-base-review-reminder.service.ts` (`processDueWithSummary` + `KnowledgeReviewReminderRun`),
`knowledge-base-review-reminder.processor.ts` (prepisan: nezavisne polovine i health linija),
`portal/knowledge-article-views.ts` (`inspectKnowledgeViewBacklog`, `readPendingFinishedDays`),
`portal/knowledge-view-flush.service.ts` (`backlog()`), `ops-health/ops-health.constants.ts`
(`expectedKnowledgeSchedulers`), `common/scheduled-jobs/job-scheduler-presence.ts` (novo: `isSchedulerRegistered`,
`missingSchedulers`) + isti popravak u `announcement-sweep`, `announcement-retention`, `change-sweep`,
`problem-sweep`, `on-call-sweep` i `inbound-email` scheduler servisima (sekundarni defekt, vidi dolje); testovi: novi
`knowledge-base-review-reminder.scheduler.spec.ts` (**7**), novi `knowledge-base-review-reminder.processor.spec.ts`
(**7**), novi `knowledge-scheduler-reconciliation.integration.spec.ts` (**2**, Redis-gated), novi
`job-scheduler-presence.spec.ts` (**5**), `knowledge-portal.service.spec.ts` (15 → **17**),
`ops-signal-collector.spec.ts` / `evaluate-ops-signals.spec.ts` (+3), `scripts/run-isolated-integration.mjs`
(registracija novog speca)<br>
**DB migracija:** nema<br>
**CI:** [`45012253359`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45012253359) — **success** na
`1411111` (prva dva runa su pala i oba nalaza su popravljena, vidi „CI i testni dokaz”)

## Nalaz

Dvije tihe stvari u istom poslu, plus treća koja ih je držala nevidljivima.

1. **Zakazani posao se upisuje jednom i nikad više ne provjerava.** `onModuleInit` je radio
   `upsertJobScheduler` i to je bilo sve. Raspored živi u Redis-u: restart Redis-a bez perzistencije, `FLUSHALL`,
   failover na praznu instancu ili restore starijeg snapshot-a ga obrišu — i **ništa** se ne žali. Do sljedećeg
   deploya ne pokreće se ni podsjetnik na pregled članaka **ni** flush view brojača, jer oboje vozi isti job.
2. **Flush je visio o podsjetniku.** U `process()` je `automation.processDue()` bio prvi, a flush drugi i **samo
   ako prvi uspije**. Jedan pad u reminder upitu (npr. privremeno nedostupan loader, loš red u scopeu) značio je da
   brojači pregleda stoje u Redis-u — a `knowledgeViewKeys` imaju **TTL od 8 dana**, pa je bug u podsjetniku mogao
   trajno uništiti analitiku pregleda. Obrnuto je bilo „ispravno” (pad flush-a nije obarao podsjetnike), ali
   asimetrija nije bila dokumentovana ni testirana, nego slučajna posljedica reda naredbi.
3. **Nije se znalo koliko posla čeka.** Flush je vraćao samo broj upisanih članaka; „nema šta da se flushuje” i
   „sweep nije radio sedmicu, ključeve ćemo izgubiti” izgledali su isto u logu. `ops-health` je znao da queue
   `knowledge-base-review-reminder` postoji (brojao je failed/waiting), ali **ne** da je njegov raspored obavezan —
   `scheduler.late` ga nije gledao, pa gubitak rasporeda nije bio alarm nego tišina.

## Rješenje

**Samoiscjeljujući raspored + nezavisne polovine + jedna vidljiva linija, bez migracije i bez promjene ugovora.**

- **Reconcile.** `KnowledgeBaseReviewReminderSchedulerService` poslije inicijalne registracije postavlja
  `setInterval` na `knowledgeBaseReviewReminderReconcileMilliseconds` (**60 s**) koji zove `reconcileSchedule()`:
  jedan `queue.getJobSchedulers(0, -1)`, provjera da li je `kb-review-reminder-quarter-hourly` tu, i — samo kad
  nije — ponovna registracija kroz isti `registerRepeatableJob` uz `logger.warn
  kb_review_reminder_schedule_recovered id=…`. Registracija je idempotentna po ID-u, pa dva workera koja se
  istovremeno „popravljaju” ne mogu napraviti dva rasporeda. Timer je `unref()`-ovan (ne drži proces ni jest
  workera na životu) i `onModuleDestroy` ga čisti; drugi `onModuleInit` ne pravi drugi timer.
- **Alarm.** Raspored je sada u `expectedKnowledgeSchedulers` i ulazi u `expectedSchedulers`, pa ga
  `evaluate-ops-signals` gleda kao i ostale obavezne sweepove: `not_registered`, `not_picked_up`, `failing` i
  `no_recent_success` sa budžetom `knowledgeBaseReviewReminderLastSuccessMaxAgeMs` = **30 min** (dva prozora po
  15 min; jedan propušten prozor je normalan jitter rolling restarta, dva znače da posao — i flush — nije
  završen). Reconcile pokriva gubitak unutar minute; alarm je za gubitak koji **nadživi** reconcile (Redis nije
  dostupan, registracija se odbija, job se ne preuzima).
- **Nezavisne polovine.** `process()` prvo izvrši sweep, pa flush — ali svaki u svom `try`. Sweep greška se i dalje
  **rethrow-uje** (job ostaje crven tamo gdje treba), a flush se izvršava **i kada sweep padne**; pad flush-a ostaje
  `logger.warn` i ne obara posao, jer brojači čekaju u Redis-u i sljedeći run ih pokupi.
- **Vidljivost.** Jedna linija po prolazu nosi oba svijeta:
  `kb_due_candidates`, `kb_batches`, `kb_reminders_sent`, `kb_no_recipient_articles`, `kb_unresolved_scope_articles`,
  `kb_blocked_recipients`, `kb_capped` (iz `processDueWithSummary`), `kb_views_flushed`, `kb_views_pending_days`,
  `kb_views_lag_days` (iz novog `backlog()`). Uz to dva `logger.warn`: kad je backlog pregleda veći od jednog
  prolaza (`candidates`/`batches`) i kad su brojači pregleda **≥ 2 dana** zaostali
  (`knowledge view counters are N day(s) behind … keys expire after 8 days`) — prag 2 od 8 dana ostavlja ~6 dana
  za reakciju prije nego TTL pojede podatke.
- **Mjerenje zaostatka.** Novi `inspectKnowledgeViewBacklog({ redis, now })` čita **jednom** `SMEMBERS` nad
  `knowledgeViewKeys.pendingDays`, filtrira završene UTC dane (`readPendingFinishedDays`, isti predikat koji flush
  koristi — sada na jednom mjestu) i vraća `{ pendingFinishedDays, oldestFinishedDay, lagDays }`. Bez Redis klijenta
  `backlog()` vraća `null` (tada se ništa ni ne baferuje).
- **Ugovor.** `processDueWithSummary(now)` vraća `KnowledgeReviewReminderRun` (`sent`, `candidates`, `batches`,
  `noRecipientArticles`, `unresolvedScopeArticles`, `reminderBlockedRecipients`, `capped`), a `processDue` je sada
  `(await this.processDueWithSummary(now)).sent` — isti tip, isti pozivaoci, isti dedupe ključevi.

### Zašto ne drugačije

- **Poseban queue za flush.** Novi queue, novi worker modul, novi raspored koji opet treba reconcile — za posao koji
  traje milisekunde i ionako ide svakih 15 minuta. Cijena bi bila veća od koristi; razdvajanje **unutar** posla daje
  istu nezavisnost bez nove pokretne dionice.
- **Samo alarm, bez reconcile-a.** `scheduler.late` je nužan ali ne dovoljan: alarm kaže „ne radi”, ne vraća
  raspored. Bez reconcile-a bi svaki Redis restart tražio ljudsku intervenciju (ili deploy) da podsjetnici i flush
  ponovo krenu.
- **Samo reconcile, bez alarma.** Suprotna greška: ako Redis odbija upis, reconcile tiho ne uspijeva svakih 60 s i
  posao nestane bez ijednog signala. Zato `scheduler.late` i reconcile idu zajedno.
- **Nadoknađivanje propuštenih prozora.** Nije potrebno: obje polovine obrađuju „sve što je dospjelo” (sweep:
  `reviewDueAt <= now`; flush: svi završeni dani u pending setu), a ne „taj prozor”. Propušten prozor znači
  kašnjenje, ne gubitak — sve dok ključevi ne isteknu, a to sada hvata `kb_views_lag_days`.

### Cijena

Po worker instanci jedan `getJobSchedulers` na 60 s (jedan Redis roundtrip; jeftinije od bilo kojeg job-a koji
pokreće) i jedan `SMEMBERS` po izvršavanju posla (set je ograničen TTL-om na ≤ 8 dana). Nema novih upita prema bazi,
nema novih kolona, nema novog queue-a.

## Direktni testni dokaz

**`knowledge-base-review-reminder.scheduler.spec.ts` (novo, 6):** init registruje kvartalni raspored kroz zajednički
`registerRepeatableJob` ugovor; raspored koji Redis još ima se **ne** dira; poslije gubitka (`getJobSchedulers` prazan)
`reconcileSchedule()` vraća `['kb-review-reminder-quarter-hourly']` i ponovo registruje; timer sam pozove reconcile i
`onModuleDestroy` ga zaustavi (nema poziva poslije destroy); dva `onModuleInit` ne prave dva timera; greška
reconcile-a ostaje vidljiva pozivaocu (da bi je timer mogao logovati, a worker ostati živ).

**`knowledge-base-review-reminder.processor.spec.ts` (novo, 7):** zdrav prolaz loguje sve brojeve sweepa i flush-a;
**sweep baci ⇒ flush se ipak izvrši** i posao **padne** (rethrow); **pad flush-a ⇒ posao ostaje zelen** uz warn; dva
završena dana zaostatka ⇒ warn o TTL-u; jedan **nezavršen** dan ⇒ **nema** warn-a (današnji dan se ne flushuje);
cap prekoračen ⇒ warn imenuje `candidates`/`batches`; worker bez flush servisa (`@Optional()`) ne pada.

**`knowledge-scheduler-reconciliation.integration.spec.ts` (novo, 2, pod stvarnim Redis-om):** poslije brisanja
registracije `reconcileSchedule()` je vraća i raspored ponovo postoji; dva workera protiv istog Redis-a daju
**tačno jedan** raspored. Spec je registrovan u isolated runneru.

**Ostalo:** `knowledge-portal.service.spec.ts` **15 → 17** (`inspectKnowledgeViewBacklog` broji samo završene dane i
daje `lagDays`; prazan set ⇒ `null`/`null`), `ops-signal-collector.spec.ts` + `evaluate-ops-signals.spec.ts` **+3**
(raspored ulazi u `expectedSchedulers` sa 30-min budžetom; `not_registered` ⇒ `scheduler.late` sa ID-em), backend
`knowledge-base` + `ops-health` **336 testova / 6 skipped**, `scheduled-jobs.wiring.spec.ts` +
`worker.module.spec.ts` **3/3 bez izmjena** (graf se diže sa novim servisom), `node --test
scripts/run-isolated-integration.test.mjs` **23/23**, `eslint` zelen na svih 13 diranih fajlova.

`tsc --noEmit` u sandboxu prijavljuje 1.483 greške, sve iz generisanog Prisma stuba (`$transaction` callback,
`any` delegati) — u diranim fajlovima **jedina** je `knowledge-article-views.ts(151,36)` TS7006 na `writeDayViews`,
postojeći kod koji ovaj paket ne dira; nema nove greške.

## CI i testni dokaz

Prvi run [`45010012368`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45010012368) na `558b4ce`
pao je u jobu **Backend PostgreSQL + Redis integration**, korak „Run real PostgreSQL integration suites”, i to na
**novom** acceptance specu — `restores the quarter-hourly sweep after Redis loses the registration`. To je bio
najkorisniji mogući ishod prvog runa: unit testovi su imali lažni oblik podatka, a pravi BullMQ ga je odbio.

### Sekundarni defekt otkriven acceptance testom: `id` nije ID rasporeda

`queue.getJobSchedulers()` u BullMQ 5.81 **ne** popunjava `id` za raspored napravljen kroz `upsertJobScheduler`:
`transformSchedulerData` vraća `{ key: '<scheduler id>', name, next, pattern, … }`, a `id` postoji samo na
**legacy** repeatable redovima (`keyToData`), gdje je `key` sirovi `name:id:endDate:tz:pattern` string. Svih sedam
self-healing scheduler servisa je provjeravalo `entry.id`, pa je svaki **zdrav** raspored izgledao izgubljen:
worker bi ga ponovo registrovao na svakom tick-u i pisao lažni `*_schedule_recovered` warn — šum koji sakriva baš
onu jednu liniju koju operator treba da vidi, uz Redis upis po workeru po minutu. Ops-health collector je od ranije
čitao `scheduler.key ?? scheduler.id`; reconcile putevi su bili izuzetak.

Popravka je zajednički, testiran predikat `common/scheduled-jobs/job-scheduler-presence.ts`
(`isSchedulerRegistered`, `missingSchedulers` — meč je `key === id || id === id`, pa rade i moderni i legacy redovi)
i njegova upotreba u svih sedam servisa: `knowledge-base` review reminder, `announcement-sweep`,
`announcement-retention`, `change-sweep`, `problem-sweep`, `on-call-sweep`, `inbound-email`. KB unit spec sada hrani
**stvarni** oblik (`key`) i pinuje legacy oblik, novi `job-scheduler-presence.spec.ts` (**5**) pokriva oba oblika i
dokazuje da se sirovi `key` ne čita kao ID, a acceptance spec traži **tačno jedan** raspored kroz isti helper.
Popravak je u `ca92b55`.

Drugi run [`45011775922`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45011775922) na `ca92b55`
dao je **zelen** `Backend PostgreSQL + Redis integration` — što je i bio dokaz da popravak radi pod stvarnim
Redis-om — ali je pao `Backend build + test` na type-checku novog unit speca: `createQueue(present, entry = { key })`
je inferirao parametar kao `{ key: string }`, pa legacy slučaj `{ key, id }` nije kompajlirao (TS2353). Lokalni jest
koristi `diagnostics: false`, pa je to mogao vidjeti samo gate. Popravak je eksplicitni tip
`{ key?: string; id?: string }` (`1411111`).

Finalni run [`45012253359`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45012253359) na `1411111`:
**success** za `Detect changes`, `Docs guard`, `Backend build + test` (uključujući safety-net korak i type-check),
`Backend container + supply chain`, `Frontend build + test`, `Backend PostgreSQL + Redis integration` (novi
acceptance spec prošao stvarno, ne kao skip) i `CI gate`; E2E poslovi (`install wizard`, `critical flows`) i read-only
inventory su `skipped`, kako je konfigurisano za push. `Perf smoke`
[`45010012383`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45010012383) je zelen na `558b4ce`
(kasniji push-evi nisu pokrenuli novi perf run).

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-13` (P2). Modul je time **13/19** (`01`–`13`).
- Ostaju otvoreni u `25-knowledge-base.md`: 6 nalaza, **P1: nema** (`14`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 304 zatvoreno / 392 otvoreno**; Val 7 **83/111**, otvoreno
  **28** (P1 0 / P2 14 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `558b4ce` vraća write-once raspored, flush iza sweep-a i
nijemi backlog; nema podataka za vraćanje. Revert `ca92b55` vraća `id`-samo provjeru — ne vraćaj ga: tada bi svaki
zdravi raspored izgledao izgubljen i sedam sweepova bi se re-registralo svakih 60 s. `1411111` je samo tip u specu. Deploy je siguran u oba smjera: stari worker bez reconcile-a i novi sa
reconcile-om se ne tuku (isti `schedulerId`, idempotentan upsert).

**Preostali rizik (dokumentovan):**

1. **Brojevi žive u logu, ne na ops-health kartici.** `kb_*` linija i dva warn-a su vidljivi kroz pretragu loga i
   kroz job metrike; `scheduler.late` i queue brojači (failed/waiting) su pravi alarmi. Kartica/dashboard nad ovim
   brojevima je reporting posao (P3 nalazi audita 25/26), ne reconciliation — zato nije u ovom paketu.
2. **Reconcile ne nadoknađuje propušten prozor**, samo vraća raspored. To je bezopasno jer obje polovine obrađuju
   „sve dospjelo” i „sve završene dane”, pa prvi sljedeći prolaz pokupi i propušteno.
3. **Flush koji trajno pada** i dalje gubi ključeve poslije 8 dana; warn na 2 dana ostavlja ~6 dana za reakciju, ali
   sam ne popravlja uzrok (npr. trajna greška u `$transaction` upisu).
4. **Reconcile je po instanci.** N workera = N čitanja na minutu; nema koordinacije jer registracija je idempotentna
   po ID-u, pa je i paralelni reconcile bezopasan.

## Sljedeći paket

**W7.87 — `BA-knowledge-base-14` (P2): privacy/retention ne pokriva slobodni tekst, source, comments, notifications
i change-log.**
