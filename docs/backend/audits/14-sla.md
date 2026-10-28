# Backend audit 14 — `sla`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,09/10**  
**Nalazi:** 4 P1, 8 P2, 4 P3

## 1. Executive summary

`sla` pokriva business-hours kalendare, profile, prioritetna pravila, escalation politiku, per-ticket satove, compliance, backfill i periodični BullMQ scan. Osnova je sadržajna: timer podržava start/pause/resume/completion/recompute, scan je bounded i indeksiran, konfiguracijske mutacije uglavnom imaju transakcijski change log, compliance ima OU guard, a notification fan-out podržava user/role/group i on-call fallback.

Baseline je ipak **5,09/10**. Četiri P1 nalaza pogađaju pouzdanost i izolaciju. Runtime flagovi i escalation ključevi zapisuju se prije događaja/notificationa, pa kvar trajno gubi signal. Scanner i ticket lifecycle paralelno rade read/evaluate/unconditional update bez locka ili verzije. `sla.write` scope se uopšte ne veže za mutirani OU/service/target, pa scoped administrator dobija globalnu SLA administraciju. Civil-time konverzija na DST prijelazu može vratiti deadline prije početka; direktna reprodukcija za Sarajevo spring-forward vratila je 30 business minuta kao `00:00Z` za start `00:30Z`.

Dodatno postoje race prvog starta, poison-batch ponašanje, scheduler bez živog recoveryja, read-before-write konfiguracijske invariante, neograničen compliance load, nekonzistentan startup seed i aktivni satovi bez verzioniranog config/recompute ugovora. Nema P0. Popravke ostaju zabranjene do završetka kompletnog backend audita i konsolidovanog plana.

## 2. Scope i inventar

- 120 produkcijskih TypeScript fajlova;
- 28 direktnih specova;
- 7.503 aktuelne fizičke produkcijske LOC;
- 6 kontrolera i 9 glavnih injectable servisa, plus BullMQ processor/scheduler;
- Prisma `BusinessHoursCalendar`, `CalendarHoliday`, `SlaProfile`, `SlaRule`, `TicketSlaState` i `SlaEscalationRule`;
- settings, tickets, service catalog, OU, groups, roles/users, notifications, on-call, reports, websocket/change-log i config-versioning integracije;
- E2E 07, 42, 50 i 55 kao primarni dokaz, uz reference 01, 10, 18, 22, 33, 36, 41, 52, 53, 54 i 56.

Javne površine su calendar/profile/rule/escalation CRUD i change log, priority matrix te OU-scoped compliance. Interna površina obuhvata ticket event port, business-time jezgru, state persistence, runtime događaje, backfill, due scan i seed.

## 3. Arhitektura i poslovni tok

Ticket create i lifecycle događaji pozivaju `TicketSlaTimersService.apply`. Prvi poziv razrješava profil/rule/calendar i kreira `TicketSlaState`; sljedeći pozivi računaju pause/resume, first response, completion, breach, at-risk, escalation keys i `nextDueAt`. Worker svake minute bira bounded skup due stateova, sinhronizuje ih i backfilluje bounded skup otvorenih ticketa bez statea.

Business vrijeme se računa u civilnim minutama kalendarskog timezonea, sa weekly intervalima i praznicima. Escalation se pokreće tek nakon breach-a i offseta; runtime event proizvodi SLA change log, ticket system event i in-app/email/realtime fan-out. Compliance učitava terminalne stateove odabranog OU podstabla i agregira ih u procesu.

Ključni arhitekturni problem je da state transition, outbox/event i notification intent nisu jedna atomarna operacija. Drugi je da isti state mijenjaju request i worker putanja bez concurrency protokola.

## 4. API/permission/scope matrica

| Površina              | Guard                        | Scope                                  | Zaključak                                        |
| --------------------- | ---------------------------- | -------------------------------------- | ------------------------------------------------ |
| calendar/profile CRUD | ADMIN + `sla.write`          | nema resource scope dekoratora         | scoped pravo postaje globalno                    |
| rule CRUD             | ADMIN + `sla.write`          | DTO nosi OU/service, guard ih ne veže  | cross-scope write                                |
| escalation CRUD       | ADMIN + `sla.write`          | target user/role/group nije scoped     | globalni target katalog                          |
| priority matrix PATCH | ADMIN + `sla.write`          | globalna konfiguracija                 | nema posebne global permission odluke            |
| admin list/change log | ADMIN                        | nema `sla.read` permissiona/paginacije | role-only global read                            |
| priority matrix GET   | prijavljeni user/agent/admin | globalno                               | opravdano ticket runtime upotrebom               |
| compliance GET        | ADMIN + OU scope             | query OU descendant tree               | ticket scope korektan, profile metadata globalan |

Strict ValidationPipe i reason ugovor su pozitivni. Permission katalog ima samo `sla.write`, ne `sla.read`; najkritičnije je što authorization assignment scope nije propagiran u write odluku.

## 5. Podaci, transakcije i konkurencija

`TicketSlaState.ticketId` je unique, a `(resolutionCompletedAt,nextDueAt)` indeks podržava due scan. Međutim prvi start koristi `create`; dva paralelna poziva oba vide null, a gubitnik dobija raw Prisma unique grešku umjesto reload/idempotentnog uspjeha.

Postojeći state se čita, evaluira i bezuslovno updateuje. Nema row locka, optimistic versiona ni `updatedAt` preconditiona. Scanner može prepisati request-path `respondedAt`, pause stanje, breach/at-risk flag, escalation key ili `nextDueAt`; oba procesa zatim emituju prema vlastitim zastarjelim `previous` snapshotima.

Calendar/profile/rule/escalation CRUD uglavnom drži write i change log u jednoj transakciji. Ipak uniqueness SLA rule scopea, escalation offseta i maksimalnog broja nivoa su aplikacijski read-before-write bez DB constrainta/locka. Update je silent last-write-wins, a before snapshot može biti zastario.

## 6. Business time, DST i praznici

Weekly-hours parser odbacuje preklapanja, invalidno vrijeme i prazan kalendar; holiday parser validira stvarni datum i duplikate. Standardni 08–16 testovi, vikend i praznik rade.

`fromZonedCivilTime` ipak radi samo jednu offset aproksimaciju i ne validira round-trip civilnog vremena. Na nepostojećem ili ponovljenom satu rezultat nije monotoničan. Direktni dokaz:

```text
Europe/Sarajevo, nedjelja 01:00–04:00
start 2026-03-29T00:30:00Z + 30 business min => 2026-03-29T00:00:00Z
start 2026-03-29T00:30:00Z + 60 business min => isti start
fall-back + 120 min => 2026-11-01T00:30:00Z
```

Dakle validna administratorska noćna smjena može dati deadline prije starta ili preskočiti sedmicu. Postojeći testovi nemaju spring gap, fall fold, midnight/24:00, timezone ekstrem ni add/count round-trip preko DST-a.

## 7. Async, recovery i notification fan-out

BullMQ scheduler ID i upsert su idempotentni; job ima exponential retry, retention i jedan worker delivery ugovor. Ali ako inicijalni Redis `upsertJobScheduler` padne, servis samo loguje warning i više ne pokušava do restarta. Processor sekvencijalno obrađuje batch; jedna poison state greška prekida ostatak i retryja već obrađene redove.

`persistTicketSlaState` se izvršava prije `emitTicketSlaRuntimeEvents`. Event zatim zasebno piše SLA change log, ticket system event, ponovo učitava ticket i radi notification fan-out. Kvar bilo kojeg koraka ostavlja parcijalno stanje. Pošto su breach flag/key već trajno postavljeni, retry više ne vidi tranziciju.

Escalation fan-out podržava explicit user, sve role assignments, grupu, trenutnog on-call korisnika i fallback na grupu. Dedupe key je vezan za message ID. Ipak recipient query ne filtrira inactive/deleted usera, aktivno članstvo ni OU eligibility; prazna grupa/role i obrisano pravilo mogu završiti sa nula primalaca nakon što je key označen fired. On-call audit namjerno guta grešku.

## 8. Seed, backfill, config-versioning i integracije

Starting seed kreira BH_STANDARD, pet profila, četiri priority pravila po profilu, tri ADMIN escalation nivoa i priority matrix. Calendar/profile unique race se djelimično reloaduje. Escalation seed, međutim, radi `count==0`, pa tri zasebne transakcije; paralelni instance startup može kreirati duple laddere, a pad usred toka ostavlja parcijalan profil. Pravila takođe nemaju DB unique zaštitu. `OnModuleInit` propagira DB grešku i može oboriti startup.

Backfill je bounded, bira najstarije otvorene tickete bez statea i iskreno startuje od `createdAt`. Međutim isti poison/race problem prekida batch. Ticket lifecycle pokriva create, agent reply, status, priority, merge/unmerge i waiting-for-user automatizaciju.

Konfiguracijske promjene nemaju verziju u `TicketSlaState`, policy za grandfathering niti kontrolisani bulk recompute. Promjena rule targeta ne prepravlja aktivni sat dok odgovarajući ticket event ne pokrene recompute; calendar/profile promjena može se djelimično primijeniti na star state kroz trenutnu relaciju. Config-versioning snapshot ne predstavlja runtime migration mehanizam. Reports/dashboard koriste state flagove i zato nasljeđuju izgubljene/stale transitione.

## 9. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm ci
npm test -- --runInBand --runTestsByPath $(find src/modules/sla -name '*.spec.ts' -print | sort)
```

Rezultat: **10/28 suiteova prošlo, 18/28 compile-blocked; 27/27 stvarno izvršenih testova prošlo**. Blokada je nepotpun generated Prisma client: `../../generated/prisma/enums` i delegati poput `ticketSlaState`, `slaRule`, `slaEscalationRule`, `ticket`, `organizationalUnit` i `appSetting`. To nije funkcionalni pad izvršenih testova, ali ključni service/integration dokaz nije izvršiv lokalno.

Izvršeni testovi pokrivaju dio business-minute logike, compliance agregaciju, nextDueAt, at-risk/overdue helpere, weekly parser i scan format. Statički postoje timer, breach, scan, scheduler, seed, backfill, notification i CRUD testovi, ali nema transactional failure injectiona, scanner/request racea, scoped admin negativa, DST gap/fold, concurrent seed/admin writea, poison isolationa ni velikog compliance skupa.

E2E 07 pokriva due polja i OU compliance; 42 calendar CRUD/matrix UX; 50 reason na escalation delete; 55 URL state, viewport i axe. Korisnikov potvrđeni Playwright 01–56 prolaz ne dokazuje navedenu concurrency/failure/scope/DST matricu.

## 10. Pozitivni nalazi

1. Bounded i indeksiran due scan sa stvarnim remaining backlog countom.
2. Unique ticket state i FK referencijalna zaštita.
3. Pause/resume, first response, completion, priority recompute i merge događaji su povezani.
4. Config write i change log su uglavnom transakcijski.
5. Calendar/profile DB unique i holiday unique ugovori postoje.
6. Strict DTO, reason normalizacija i no-store compliance response.
7. OU descendant filter štiti compliance ticket redove.
8. At-risk i breach u istom ciklusu ne proizvode notification flood.
9. Group notification koristi jedan group row umjesto reda po članu.
10. On-call ima group fallback i best-effort audit.
11. Backfill je bounded i ne izmišlja first response.
12. Startup seed ne prepisuje postojeće custom profile/rule vrijednosti.

## 11. Registar nalaza

| ID        | Severity | Nalaz                                                                                 | Status   |
| --------- | -------- | ------------------------------------------------------------------------------------- | -------- |
| BA-sla-01 | P1       | State marker se persistira prije eventa pa retry trajno gubi breach/escalation signal | zatvoreno |
| BA-sla-02 | P1       | Scanner i lifecycle bez concurrency protokola gube/dupliraju state i događaje         | zatvoreno |
| BA-sla-03 | P1       | Scoped `sla.write` omogućava globalne SLA mutacije i foreign targete                  | zatvoreno |
| BA-sla-04 | P1       | DST civil-time konverzija može dati deadline prije starta ili preskočiti sedmicu      | zatvoreno |
| BA-sla-05 | P2       | Paralelni prvi timer start vraća unique grešku umjesto idempotentnog uspjeha          | zatvoreno |
| BA-sla-06 | P2       | Scheduler registration nema retry/reconciliation u živom procesu                      | zatvoreno |
| BA-sla-07 | P2       | Jedan poison state prekida scan/backfill batch i ponavlja već obrađene redove         | zatvoreno |
| BA-sla-08 | P2       | Rule/escalation uniqueness i max-level invariante nisu concurrency-safe               | zatvoreno |
| BA-sla-09 | P2       | Compliance neograničeno učitava cijeli OU/time-window skup u memoriju                 | zatvoreno |
| BA-sla-10 | P2       | Startup seed može duplirati/napola kreirati escalation ladder                         | zatvoreno |
| BA-sla-11 | P2       | Aktivni timeri nemaju config verziju, migration ni determinističan recompute policy   | zatvoreno |
| BA-sla-12 | P2       | Escalation recipienti ne garantuju aktivnog/scope-eligible primaoca                   | zatvoreno |
| BA-sla-13 | P3       | Admin read/change-log liste su globalne, role-only i nepaginirane                     | zatvoreno |
| BA-sla-14 | P3       | Compliance i resolution ponavljano učitavaju široke OU/profile skupove                | zatvoreno |
| BA-sla-15 | P3       | Observability nema per-failure/outbox lag/recipient-empty/DST integrity metrike       | zatvoreno |
| BA-sla-16 | P3       | Kritična failure/concurrency/scope/DST test matrica nije izvršiva ni kompletna        | otvoreno |

## 12. Detalji P1 nalaza

### BA-sla-01 — Persist-before-delivery trajno gubi signal

`syncTicketSlaTimers` prvo upisuje breach/at-risk flagove i `firedEscalationKeys`, a tek zatim poziva runtime event pipeline. Ako change log, ticket event, ticket reload ili notification padne, retry učitava već označen state i ne emituje tranziciju. Potreban je transaction + durable outbox sa idempotency ključem po ticket/clock/transition/rule, te zaseban retryable dispatcher. Acceptance mora dokazati failure poslije svakog koraka bez gubitka ili duplikata.

### BA-sla-02 — Izgubljeni updatei između workera i requesta

Obje putanje rade read/evaluate/update nad cijelim stateom. Interleaving može vratiti `respondedAt` na null, izgubiti pause/breach/key ili pogrešno pomjeriti `nextDueAt`; događaji se računaju iz zastarjelog previous snapshot-a. Uvesti row lock ili optimistic version + bounded retry, atomic first-response conditional write i monotone merge pravila. Paralelni PostgreSQL test mora dokazati exactly-once transition intent.

### BA-sla-03 — Permission scope nije resource scope

Controlleri zahtijevaju `sla.write`, ali nemaju OU/service scope dekoratore. Rule DTO eksplicitno nosi OU/service, escalation target nosi globalni user/role/group, a servis samo provjerava postojanje. Administrator sa assignmentom ograničenim na jedan OU/service zato može mijenjati globalne kalendare/profile/matrix i pravila drugih jedinica. Potrebna je formalna global-vs-scoped SLA policy, target eligibility i negativna matrica create/update/delete/list/change-log.

### BA-sla-04 — DST deadline nije monotoničan

Jednoprolazna offset aproksimacija ne rješava nonexistent/ambiguous civilna vremena niti provjerava round-trip. Reprodukcija je vratila due prije starta i sedmični skok. Koristiti dokazanu timezone biblioteku ili eksplicitni disambiguation policy; validirati monotonicity, add/count round-trip i gap/fold ponašanje za sve podržane intervale/timezoneove.

## 13. Detalji ostalih nalaza

- **BA-sla-05:** first create treba race-safe upsert/create-catch-reload, ali ne smije prepisati winnerov state.
- **BA-sla-06:** scheduler treba health/readiness signal i background reconciliation sa backoffom; warning nije recovery.
- **BA-sla-07:** batch treba per-state isolation, dead-letter/quarantine i progress metrike; jedan corrupt red ne smije blokirati ostale.
- **BA-sla-08:** dodati DB/model invariant ili serializable profile lock za effective rule key, escalation offset i max count; update takođe mora imati optimistic precondition.
- **BA-sla-09:** compliance treba DB agregaciju/paginaciju, maksimalan period, row/time/byte budget i query plan.
- **BA-sla-10:** seed treba jednu profile-level transakciju/lock, unique offset i safe concurrent startup; parcijalni seed mora biti detektovan/repariran.
- **BA-sla-11:** definirati immutable config version snapshot i eksplicitni grandfather/recompute workflow sa previewom, auditom i bounded workerom.
- **BA-sla-12:** filtrirati active user/membership/role assignment, provjeriti scope i alarmirati/fallbackovati kada je audience prazan.
- **BA-sla-13:** uvesti `sla.read`, scope-aware DB query i cursor/take za konfiguraciju i change log.
- **BA-sla-14:** koristiti scope-aware descendant query/cache i ne vraćati globalne profile bez policy odluke.
- **BA-sla-15:** metrike: transition/outbox latency, failed/empty fan-out, scan age/backlog/poison, scheduler absent, config version drift i invalid due-before-start.
- **BA-sla-16:** generated Prisma/PostgreSQL CI shard i deterministični fake-clock testovi su obavezni prije popravki.

## 14. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        7,00 |
| B. API i ugovori             |      12% |        6,50 |
| C. Auth/authz/scope          |      15% |        4,00 |
| D. Poslovna pravila/stanje   |      13% |        4,50 |
| E. Podaci/Prisma/transakcije |      13% |        5,00 |
| F. Sigurnost/privatnost      |      12% |        4,80 |
| G. Async/integracije         |       8% |        4,50 |
| H. Testovi/dokazivost        |      10% |        5,20 |
| I. Operativnost/perf.        |       7% |        4,50 |
| **Ukupno**                   | **100%** | **5,09/10** |

Ponderisani zbir je 5,086 i zaokružen na dvije decimale. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 15. Fazni plan popravki

### Faza 0 — safety net

Generated Prisma + PostgreSQL fixture; failure injection za svaki runtime korak; scanner/request race; scoped write negativa; DST gap/fold/midnight matrica; concurrent seed/admin write; poison batch i veliki compliance dataset.

### Faza 1 — P1 integritet

Uvesti version/lock state transition i durable outbox; idempotentni dispatcher; race-safe first start; invalid-state quarantine. Ne mijenjati postojeće markere bez backfill/reconciliation plana.

### Faza 2 — P1 authorization i business time

Formalizovati global/scoped SLA capability i target eligibility. Zamijeniti civil-time konverziju dokazanim gap/fold policyjem i dodati monotonic guard (`dueAt >= start/effective clock`).

### Faza 3 — konfiguracija i podaci

DB invariante za rule/escalation, optimistic config update, atomaran concurrent seed, `sla.read`, paginacija i versioned config snapshot/grandfather-recompute workflow.

### Faza 4 — async, recipienti i recovery

Scheduler reconciliation/health, per-item scan isolation/DLQ, active/scope recipient filter, empty-audience fallback/alarm i outbox-backed notification retry.

### Faza 5 — compliance i performance

DB agregacija, period/page/resource cap, OU descendant query/cache, EXPLAIN/load dokaz i dosljedna report/dashboard semantika.

### Faza 6 — integracije, observability i finalni gate

Uskladiti tickets, service catalog, on-call, notifications, reports i config-versioning; metrike/SLO/runbook; pokrenuti svih 28 specova, povezane module i E2E 07/42/50/55 na finalnom SHA-u.

## 16. Rizik, rollback i acceptance

Najveći rollout rizik je retroaktivna promjena due datuma i duplo slanje već označenih eskalacija. Prvo napraviti read-only classifier za invalid due/state/config drift i outbox reconciliation; ne čistiti fired ključeve masovno. State version/outbox i config version su additive. DST policy mora imati preview migracije, a authorization prvo audit-only telemetry pa enforce.

Globalni acceptance:

1. Nijedan committed transition intent ne može nestati zbog event/notification kvara.
2. Paralelni scanner/request ne gube monotona state polja i ne proizvode dva logical transitiona.
3. Scoped administrator ne čita/mijenja foreign/global SLA resurse bez eksplicitnog prava.
4. Due vrijeme je monotono i determinističko kroz DST gap/fold.
5. First start, seed i admin write su concurrency-safe.
6. Poison state ne blokira healthy batch; scheduler odsustvo je vidljivo i self-healing.
7. Svaka fired eskalacija ima durable delivery status ili eksplicitni empty-audience alarm.
8. Config promjena ima verziju i dokumentovan grandfather/recompute rezultat.
9. Compliance ima tačan scope i bounded DB/memory/time trošak.
10. Direktni, integration i relevantni E2E testovi prolaze na generated Prisma/PostgreSQL okruženju.

## 17. Traceability

| Nalaz     | Primarni dokaz                                     | Faza  |
| --------- | -------------------------------------------------- | ----- |
| BA-sla-01 | sync/persist pa emit/record/fan-out                | 0–1/4 |
| BA-sla-02 | scan i lifecycle unconditional update              | 0–1   |
| BA-sla-03 | controller permission bez OU/service/target scopea | 0–2/3 |
| BA-sla-04 | civil-time kod + direktna DST reprodukcija         | 0–2   |
| BA-sla-05 | load-null pa create unique ticketId                | 0–1   |
| BA-sla-06 | scheduler catch-only warning                       | 0–4   |
| BA-sla-07 | sekvencijalni scan/backfill loop                   | 0–1/4 |
| BA-sla-08 | app read-before-write constraints                  | 0–3   |
| BA-sla-09 | compliance full-row load/agregacija                | 0–5   |
| BA-sla-10 | count-zero pa tri seed transakcije                 | 0–3   |
| BA-sla-11 | state bez config versiona/recompute joba           | 0–3/6 |
| BA-sla-12 | recipient lookup bez active/scope filtera          | 0–4   |
| BA-sla-13 | global list/change-log i permission katalog        | 0–3   |
| BA-sla-14 | OU/profile široki loadovi                          | 0–5   |
| BA-sla-15 | log/backlog bez delivery/integrity SLO-a           | 0–6   |
| BA-sla-16 | Jest compile blokada i nedostajuća matrica         | 0–6   |

## 17.1 Status implementacije

- `BA-sla-01` je zatvoren u W5.31 (`9d00bb0`, CI `40547086540`). SLA state i runtime outbox intent sada se zapisuju atomski; zasebni retryable dispatcher koristi stabilan ticket/clock/transition/rule dedupe ključ i idempotentni sistemski event. Detaljni dokaz: [58-sla-durable-runtime-signal.md](../implementation/58-sla-durable-runtime-signal.md).
- `BA-sla-02` je zatvoren u W5.32 (`9181872`, CI `40552249815`). Jedinstveni per-ticket PostgreSQL transaction lock obuhvata scanner i lifecycle read/evaluate/write ciklus, first response je monotoni conditional write, a obavezni two-client shard dokazuje serijalizaciju bez globalnog blokiranja. Detaljni dokaz: [59-sla-concurrent-write-coordination.md](../implementation/59-sla-concurrent-write-coordination.md).
- `BA-sla-03` je zatvoren u W5.33 (`fc1936f`, CI `40554752106`). SLA konfiguracija je eksplicitno globalna administracijska granica; svi config kontroleri zahtijevaju globalni `sla.write` assignment, dok scoped administratori ne mogu pristupiti globalnim/foreign resursima, historiji ni targetima. Detaljni dokaz: [60-sla-global-administration-scope.md](../implementation/60-sla-global-administration-scope.md).
- `BA-sla-04` je zatvoren u W5.34 (`1b1749b`, CI `40557025171`). Civil-time resolver potvrđuje IANA offset kandidate round-tripom, ima eksplicitnu earlier-fold/later-gap politiku i održava monotone add/count invariante kroz Sarajevo, New York i Lord Howe tranzicije. Detaljni dokaz: [61-sla-dst-safe-civil-time.md](../implementation/61-sla-dst-safe-civil-time.md).
- `BA-sla-05` je zatvoren u W5.35 (`e7efb10`, CI `40559964964`). First-writer-wins upsert ne prepisuje winner state, adapter-level `P2002` reloaduje winner, a two-client PostgreSQL test dokazuje jedan timer i idempotentan rezultat. Detaljni dokaz: [62-sla-race-safe-first-timer.md](../implementation/62-sla-race-safe-first-timer.md).
- `BA-sla-06` je zatvoren u W5.36 (`e588462`, CI `40561511177`). Registracija schedulera ima live exponential-backoff retry, periodični idempotentni reconciliation, strukturirani readiness snapshot i lifecycle-safe shutdown. Detaljni dokaz: [63-sla-self-healing-scheduler-registration.md](../implementation/63-sla-self-healing-scheduler-registration.md).
- `BA-sla-07` je zatvoren u W5.37 (`3935807`, CI `40564945465`). Scan/backfill imaju per-ticket isolation, durable retry/quarantine state i query-level exclusion blocked redova; poison dokaz potvrđuje napredak healthy redova. Migracija `20271027180000_sla_scan_failure_quarantine` je obavezna pri releaseu. Detaljni dokaz: [64-sla-poison-isolated-batches.md](../implementation/64-sla-poison-isolated-batches.md).
- `BA-sla-08` je zatvoren u W5.38 (`4357ba3`, CI `40568593132`). Profile-scoped transaction lock i DB unique indeksi štite rule effective key, escalation offset i max-level pod konkurentnim create/update zahtjevima. Migracija `20271027190000_sla_rule_invariants` je obavezna pri releaseu. Detaljni dokaz: [65-sla-concurrent-rule-invariants.md](../implementation/65-sla-concurrent-rule-invariants.md).
- `BA-sla-09` je zatvoren u W5.39 (`6e22b2d`, CI `40570437083`). Compliance se agregira u PostgreSQL-u bez ticket-row materializacije, uz period/profile/aggregate-row/response-byte/transaction-time budžete i obavezni real-DB dokaz. Detaljni dokaz: [66-sla-bounded-compliance-aggregation.md](../implementation/66-sla-bounded-compliance-aggregation.md).
- `BA-sla-10` je zatvoren u W5.40 (`e47a774`, CI `40572931191`). Starting profile seed sada koristi jednu profile-level transakciju i key-based advisory lock, a parcijalni escalation ladder reparira po očekivanim offsetima. Paralelni startup i repair potvrđeni su na stvarnom PostgreSQL-u. Detaljni dokaz: [67-sla-atomic-repairable-startup-seed.md](../implementation/67-sla-atomic-repairable-startup-seed.md).
- `BA-sla-11` je zatvoren u W5.41 (`b7bb1db`–`e7222be`, CI `40580180368`). Timeri čuvaju immutable rule/calendar snapshot i SHA-256 verziju, grandfather runtime koristi snapshot, a profile-scoped preview/apply workflow radi najviše 100 redova po cursor batchu uz stale token, ticket lock, reason/actor audit i deterministični recompute. Migracija `20271027200000_sla_timer_configuration_snapshot` je korisnički potvrđena kao primijenjena. Detaljni dokaz: [68-sla-versioned-timer-configuration.md](../implementation/68-sla-versioned-timer-configuration.md).
- `BA-sla-12` je zatvoren u W5.42 (`7fced76`, `bf956b2`, `5499a2c`, CI `40584535451`). User/role/group/on-call primaoci sada moraju biti aktivni, neanonimizovani i OU/service-scope podobni; prazna konfigurirana publika koristi handler fallback ili trajni `sla.escalation.audience_empty` audit alarm. Stvarni PostgreSQL dokaz pokriva inactive i sibling-OU odbijanje. Detaljni dokaz: [69-sla-active-scoped-escalation-recipients.md](../implementation/69-sla-active-scoped-escalation-recipients.md).

## 18. Konačna presuda i pretpostavke

SLA domena ima široku funkcionalnu osnovu i više dobrih bounded/audit elemenata, ali trenutno nije pouzdana granica za exactly-once poslovne obaveze: state i delivery su razdvojeni, konkurentni writeri nisu koordinirani, scope permissiona se ne primjenjuje, a DST jezgra može proizvesti nemoguć deadline. Zato je iskren baseline **5,09/10**.

Pretpostavke: scoped permission assignment treba ograničiti SLA rule/target resurse; noćni kalendari su podržani jer validator dopušta sve civilne intervale; breach/escalation event ne smije biti best-effort. Ako business odabere drugačiji config-grandfather ili DST disambiguation policy, mora biti eksplicitno dokumentovan, verzioniran i testiran. Upstream settings/authorization/change-log i downstream notifications/reports nalazi ostaju zasebni auditi.
