# Backend audit 19 — `integration-queue`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **4,41/10**  
**Nalazi:** 4 P1, 8 P2, 3 P3

> Ovaj audit čuva baseline presjek od 2026-10-23. Kasniji finding-level closeouti se dodaju kao statusne dopune; ne mijenjaju retrospektivne baseline opise, broj nalaza ni ocjenu. W6.34 je zatvorio samo `BA-integration-queue-01` (§18); W6.35 je zatvorio samo `BA-integration-queue-02` (§19); W6.36 je zatvorio samo `BA-integration-queue-03` (§20) kroz eksplicitni `PUBLISHED_BEST_EFFORT` ishod; W6.37 je zatvorio samo `BA-integration-queue-04` (§21) uz globalnu autorizaciju i redigovan default response. `BA-integration-queue-05` i ostali nalazi ostaju otvoreni.

## 1. Executive summary

`integration-queue` persistira i izvršava EMAIL, EDGE_EVENT i TEAMS poslove, vodi attempts/backoff/DLQ stanje, daje administratorski pregled/retry, worker heartbeat i DLQ retention. Dobra osnova uključuje DB evidenciju, tipizirane parsere, email dedupe u downstreamu, eksponencijalni backoff, permanent-recipient klasifikaciju, provider suppression delay, stabilne schedulere, cursor admin listu i heartbeat self-healing.

Baseline je ipak **4,41/10**. Četiri P1 nalaza pogađaju delivery correctness i privatnost. DB red i BullMQ posao nisu atomarno povezani: pad nakon DB writea, prije queue add-a, ostavlja trajno orphanovan PENDING/FAILED posao bez reconciliationa; isti gap postoji pri retryju. Processor nema conditional claim/lease pa dupli Bull poslovi mogu paralelno izvršiti isti integration job. EDGE_EVENT tretira Redis `PUBLISH` rezultat nula kao uspjeh i označava posao COMPLETED iako nije bilo subscriber isporuke. Admin queue API vraća kompletne email/Edge/Teams payloadove globalno svakom ADMIN assignmentu sa permisijom, bez scope filtriranja ili redakcije.

Dodatni rizici su provider-side duplicate nakon crasha, status transition race, neograničeni payloadi i DLQ delete, heartbeat koji ne dokazuje processing, settings promjena između pokušaja, nepostojanje retentiona za COMPLETED poslove i slaba E2E crash/recovery matrica. Nema P0. Na datum baseline audita popravke nisu bile implementirane; W6.34 kasnije je zatvorio samo `BA-integration-queue-01`.

## 2. Scope i inventar

- 30 produkcijskih TypeScript fajlova;
- 10 direktnih specova;
- 1.576 aktuelnih produkcijskih LOC;
- 1 controller, 11 injectable servisa/komponenti i 2 BullMQ procesora;
- Prisma `IntegrationJob`: type/status/payload/error/attempts/nextRetryAt/timestamps;
- kanali: EMAIL, EDGE_EVENT i TEAMS;
- lifecycle: enqueue, process, internal delayed retry, DLQ, admin retry i DLQ retention;
- infrastruktura: dvije BullMQ queue, Redis pub/sub bridge, heartbeat i scheduler reconciliation;
- integracije: notifications/email, Teams, settings, websocket realtime, ops-health, authorization i Redis;
- E2E 04 je jedina direktna referenca.

Registarskih 1.606 LOC korigovano je direktnim brojanjem na 1.576.

## 3. Arhitektura i lifecycle

Producer prvo kreira `IntegrationJob(PENDING)` u Postgresu, zatim dodaje BullMQ job sa DB ID-em. Worker učita red, preskače COMPLETED/DLQ, učita settings, bez status preconditiona radi `markProcessing` i dispatchuje kanal. Uspjeh piše COMPLETED. Greška računa threshold/backoff, piše FAILED pa dodaje novi delayed Bull job, ili piše DLQ. Admin može resetovati FAILED/DLQ na PENDING i dodati poseban Bull job.

Email worker ponovo učitava aktuelnu channel konfiguraciju i koristi notification email delivery claim. Edge worker publishuje JSON na Redis kanal, a API subscriber ga prevodi u lokalni TicketRealtimeHub; Socket.IO adapter zatim širi emit. Teams worker učitava aktuelne entity činjenice i šalje/updateuje card.

Maintenance queue registruje heartbeat i DLQ retention schedule; dodatni lokalni timer piše heartbeat svakih deset sekundi. Scheduler se reassertuje svakih pet minuta.

## 4. API, authorization i privacy

Controller zahtijeva session, ADMIN role i `integrations.queue.manage`. Lista je cursor-paginirana po statusu, a retry dozvoljava samo FAILED/DLQ. DTO status allowlist i whitelist validation su uredni.

`RoleGuard` poziva authorization bez obaveznog OU scopea. Default ADMIN dobija queue permission, uključujući service/OU-scoped assignment. Repository nema tenant/service/OU podatak ni filter. `toIntegrationJobResponse` vraća sirovi payload: email adresu, subject, plain text, HTML, reply-to i headere; Edge sadrži user/ticket ID i proizvoljni notification payload; Teams sadrži conversation/entity/user reference. Scoped administrator tako može čitati globalne foreign payloadove. `lastError` može dodatno sadržati provider adresu/response detalje.

Queue operacije su sistemske i vjerovatno trebaju global ops ovlaštenje. Ako scoped administracija mora postojati, job mora nositi provjeren scope metadata i lista/retry ga mora enforceovati prije paginationa. Default response treba biti redigovan summary; full payload samo posebno auditirano break-glass pravo.

## 5. Atomarnost, claim i konkurencija

Najveća rupa je dual-write:

1. enqueue kreira DB red pa radi Bull `add`;
2. failure piše FAILED pa radi delayed `add`;
3. admin retry resetuje DB pa radi `add`.

Pad procesa između koraka ostavlja posao bez Bull reprezentacije. Nema sweepera koji traži PENDING/FAILED sa isteklim `nextRetryAt` i idempotentno reenqueuea. Ako `queue.add` u failure handleru baci, originalni Bull posao pada/removes se, a DB red ostaje FAILED. Ovo je trajni delivery loss.

`markProcessing` je obični `update`, bez `where status in PENDING/FAILED`, lease tokena ili compare-and-swapa. Dva Bull joba za isti DB ID mogu oba proći početni read, oba incrementirati attempts i oba dispatchovati. Email downstream claim ublažava dio duplikata, ali Teams send-before-upsert i Edge publish nisu exactly-once. Concurrent admin retry dodatno može resetovati attempts dok worker radi; kasniji worker completion/failure prepisuje admin stanje.

State machine nema processing owner/lease/startedAt. Crash nakon `markProcessing`, prije failure/completion, ostavlja PROCESSING zauvijek; nema stale-processing recoveryja. To je dio istog P1 recovery nalaza.

## 6. Kanalna semantika i idempotency

### Email

Payload parser provjerava tipove i filtrira CR/LF u header vrijednostima. Downstream `NotificationEmailDelivery` dedupe pruža dobru zaštitu. Ipak SMTP uspjeh pa procesni pad prije SENT/COMPLETED može nakon stale takeovera poslati duplikat. Queue status ne zna provider outcome niti `UNKNOWN` stanje.

### Edge realtime

Redis `publish` vraća broj subscriber konekcija. Servis ignoriše rezultat; nula znači da nijedan API subscriber nije primio događaj, ali job postaje COMPLETED. Redis pub/sub nema persistence/replay. Čak i uz subscriber, njegov lokalni parse/hub/socket emit nema ack. Ovaj kanal ne smije predstavljati durable success samo na osnovu izvršenog PUBLISH-a; potreban je durable stream/outbox ili eksplicitna best-effort semantika koja ne koristi COMPLETED kao delivered.

### Teams

Teams koristi unique card key i state hash, ali prvi send se dešava prije card upserta. Crash ili DB kvar poslije provider send-a uzrokuje retry i drugi card. Nonretryable Teams greška vraća `skipped`, pa queue job postaje COMPLETED bez statusa koji razlikuje stvarnu isporuku od permanentnog odustajanja. `mode=off`, missing conversation/entity i mismatch takođe završavaju kao COMPLETED.

## 7. Payload validation i retention

Email parser nema maksimalnu dužinu za recipient, subject, text, HTML, headers, broj headera ili ukupni payload. Edge event nema limit za event name, ticket/user ID niti dubinu/veličinu `data`; Teams parser granice pripadaju drugom modulu. Veliki JSON opterećuje DB, Bull serialization, Redis pub/sub i admin response.

Retention briše samo DLQ stariji od roka, jednim neograničenim `deleteMany`. COMPLETED poslovi, uključujući email sadržaj/adresu i event podatke, ostaju neograničeno. FAILED/PENDING/PROCESSING takođe nemaju max-age/reconciliation policy. DLQ retention može napraviti veliki lock/WAL spike i nema batch/cursor.

Privacy/anonymization modul nema poseban IntegrationJob cleanup/redaction. Cascade nije moguća jer payload je JSON bez FK-a. User/ticket brisanje zato ostavlja identifikatore i sadržaj u historijskim jobovima.

## 8. Retry, settings i state transition

Backoff je eksponencijalan i capped; DLQ threshold uzima minimum dva settings limita. Permanent recipient rejection ide odmah u DLQ, a provider suppression poštuje retry-after plus margin. To su dobre odluke.

Settings se učitavaju na svakom pokušaju. Queue `enabled` i type tokeni koriste se pri producer odluci, ali processor ne provjerava da li je kanal naknadno isključen iz queue tipova; dispatch ipak ide. Email configuration može odbiti delivery-ready i potrošiti pokušaje do DLQ tokom planskog disablea. Ne postoji paused/cancelled status niti operator bulk resume.

`lastError` čuva raw `error.message` bez stabilnog codea, klasifikovane retryability metadata ili dokumentovane redakcije. Provider/transport greška može sadržati adresu, host ili response tekst. Admin retry briše error/attempts, gubeći operativni trag; nema audit loga ko je retry pokrenuo.

## 9. Heartbeat, health i observability

Heartbeat dokazuje samo da neki worker proces može SET-ovati Redis. Lokalni timer ga održava i ako glavni integration processor ne claimuje poslove, DB je nedostupan, dispatch dependency je slomljen ili backlog stoji. Worker status zato može biti `active` uz potpuno mrtav delivery path.

Pozitivno je što TTL nadživljava stale threshold, read failure vraća unknown, schedule ima reconcile, a local timer uklanja queue-schedule single point of failure. Nedostaju queue lag/oldest PENDING, stale PROCESSING, due FAILED bez Bull joba, per-channel success/failure/DLQ, publish subscriber count, retry-add failure i admin retry audit metrike. Heartbeat vrijednost nema instance ID ni capability/version.

## 10. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/integration-queue -name '*.spec.ts' -print | sort)
```

Rezultat: **10 suiteova ukupno; 2 prošla, 8 compile-blocked; 6/6 izvršenih testova prošlo**. Blokadu uzrokuju nedostajući generated Prisma enumi i `appSetting`/integration delegati. Izvršeni su pure backoff i heartbeat-status testovi; ključni repository/service/processor/failure/scheduler testovi nisu izvršeni.

E2E 04 samo polluje da postoji EMAIL ili EDGE_EVENT job u PENDING/PROCESSING/COMPLETED statusu. Ne zahtijeva COMPLETED, ne potvrđuje provider/subscriber ishod i ne pokriva retry, DLQ, admin retry, crash gap, stale PROCESSING, duplicate claim, privacy scope ili retention.

## 11. Pozitivni nalazi

1. Controller ima session, role i dedicated permission guard.
2. Status input i DTO su allowlisted.
3. Admin lista ima stabilan cursor i bounded page 50.
4. Retry odbija nedozvoljene statuse.
5. DB red čuva attempts/error/nextRetryAt.
6. Exponential backoff je capped.
7. Permanent email recipient failure odmah ide u DLQ.
8. Provider suppression poštuje retry-after.
9. Email parser filtrira unsafe header CR/LF.
10. Email downstream ima dedupe claim.
11. Scheduler ID-evi su stabilni i periodično reconciled.
12. Heartbeat read failure je `unknown`, ne lažno active.
13. Worker maintenance concurrency je jedan.
14. Edge subscriber validira JSON/payload i izoluje malformed poruku.
15. DLQ ima konfigurabilan retention.

## 12. Registar nalaza

| ID                   | Severity | Nalaz                                                                                     | Status   |
| -------------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-integration-queue-01 | P1    | DB/Bull dual-write crash gap trajno orphanira enqueue, retry i admin-retry poslove        | zatvoreno |
| BA-integration-queue-02 | P1    | Processor nema conditional lease claim pa dupli Bull poslovi paralelno dispatchuju        | zatvoreno |
| BA-integration-queue-03 | P1    | EDGE_EVENT bez primaoca ne smije biti COMPLETED; ishod je best-effort ili durable delivery                 | zatvoreno |
| BA-integration-queue-04 | P1    | Scoped ADMIN može čitati globalne sirove email/Edge/Teams payloadove                       | zatvoreno |
| BA-integration-queue-05 | P2    | PROCESSING nema lease/stale recovery i može ostati zauvijek                               | otvoreno |
| BA-integration-queue-06 | P2    | SMTP/Teams send-before-final-state crash može duplirati provider isporuku                  | otvoreno |
| BA-integration-queue-07 | P2    | Payload parseri nemaju veličinske/dubinske resource granice                               | otvoreno |
| BA-integration-queue-08 | P2    | COMPLETED i drugi nedovršeni statusi nemaju retention/redaction lifecycle                 | otvoreno |
| BA-integration-queue-09 | P2    | DLQ retention je neograničen `deleteMany` bez batcha                                      | otvoreno |
| BA-integration-queue-10 | P2    | Heartbeat može biti active dok glavni processing/delivery put ne radi                     | otvoreno |
| BA-integration-queue-11 | P2    | Admin retry nije auditiran i briše attempts/error forenzički trag                         | otvoreno |
| BA-integration-queue-12 | P2    | Runtime queue/type disable nema paused/cancelled semantiku i troši pokušaje               | otvoreno |
| BA-integration-queue-13 | P3    | Raw error message nema stabilan code/redaction ugovor                                     | otvoreno |
| BA-integration-queue-14 | P3    | Teams skipped/gone/nonretryable završava kao generički COMPLETED                          | otvoreno |
| BA-integration-queue-15 | P3    | Kritični DB/processor/crash testovi su compile-blocked i E2E je statusno slab             | otvoreno |

Djelimična mitigacija BA-integration-queue-06 i njena ograničenja dokumentovani su u [paketu 172](../implementation/172-integration-queue-06-provider-outcome-quarantine.md); nalaz ostaje otvoren. Djelimična worker zaštita BA-integration-queue-07 opisana je u [paketu 173](../implementation/173-integration-queue-07-worker-payload-budget.md). Ograničeni DLQ batch BA-integration-queue-09 opisan je u [paketu 174](../implementation/174-integration-queue-09-bounded-dlq-retention.md). Dijagnostički backlog indikator BA-integration-queue-10 opisan je u [paketu 175](../implementation/175-integration-queue-10-liveness-vs-backlog.md), a potvrđena terminal retention politika BA-integration-queue-08 u [paketu 176](../implementation/176-integration-queue-08-terminal-retention.md). Nalazi ostaju otvoreni.

## 13. Detalji P1 nalaza

### BA-integration-queue-01 — orphanovani poslovi

Postgres i Redis ne dijele transakciju. Uvesti transactional outbox: producer samo atomarno piše domain/outbox red; dispatcher claimuje lease i idempotentno upisuje Bull job. Alternativno obavezni reconciler mora nalaziti PENDING bez queue potvrde, due FAILED i stale PROCESSING. `queue.add` ID mora biti stabilan po logical attemptu. Admin retry mora biti auditirana state tranzicija koju isti dispatcher obrađuje.

**W6.34 scope odluka (historijski):** taj finding-level closeout dokazao je oporavak `PENDING` i due `FAILED` redova te auditiranu admin-retry tranziciju koju dispatcher ponovo obrađuje. Tada stale `PROCESSING` recovery i ekskluzivni processor claim nisu bili obuhvaćeni; `BA-integration-queue-02` je kasnije zasebno zatvoren u §19, dok `BA-integration-queue-05` ostaje otvoren.

### BA-integration-queue-02 — nema ekskluzivnog claima

Početni status read i `markProcessing` nisu atomic compare-and-swap. Uvesti conditional update `status/version/nextRetryAt`, owner token, lease expiry i attempt ID. Samo claimant dispatchuje; completion/failure update mora zahtijevati isti lease/version da stale worker ne prepiše novije stanje.

**W6.35 acceptance:** finding-level closeout je u §19; samo pobjednik conditional claim-a smije dispatchovati. Terminal/failure CAS je vezan za status, verziju, pokušaj, attempt ID, owner token i lease timestamp. Stale `PROCESSING` recovery nije implementiran i ostaje u `BA-integration-queue-05`.

### BA-integration-queue-03 — lažni Edge success

Redis pub/sub broj subscriber-a je ignorisan, a ni broj >0 nije end-to-end ack. Prebaciti Edge delivery na durable Redis Stream/Bull→API inbox sa consumer groupom i idempotentnim event ID-em, ili jasno označiti `PUBLISHED_BEST_EFFORT` umjesto COMPLETED/delivered. Nula mora biti retryable/observable, ne success.

**W6.36 acceptance:** Redis `PUBLISH` rezultat `> 0` sada vodi u `PUBLISHED_BEST_EFFORT`, nikada `COMPLETED`; pozitivan subscriber count nije end-to-end acknowledgement. Rezultat `0` daje retryable/observable `EDGE_EVENT_NO_SUBSCRIBERS` i koristi postojeći `FAILED`/backoff/queue put. Ovo zadovoljava eksplicitnu best-effort alternativu iz nalaza; durable Stream/inbox i client acknowledgement nisu implementirani.

### BA-integration-queue-04 — globalni payload disclosure

Permission scope se ne primjenjuje, a response vraća kompletan JSON. Queue management zahtijeva global assignment/SUPER_ADMIN ili scope metadata + authorized query prije cursora. Default lista treba redigovati body/html/data/address i pokazati type/status/error code; full inspect mora imati posebno pravo, reason i audit.

## 14. Ostali nalazi i korekcije

- **05:** processing lease, startedAt/workerId, stale recovery i metric.
- **06:** provider idempotency key/UNKNOWN state; Teams persist reservation prije send-a.
- **07:** schema po tipu, byte/depth/item/header limiti prije DB i prije dispatcha.
- **08:** status-specifičan retention, privacy redaction/anonymization i agregirane metrike.
- **09:** stabilan `(updatedAt,id)` batch delete sa limitom i progress metricom.
- **10:** synthetic processing heartbeat, oldest-job lag i per-channel outcome health.
- **11:** audit actor/reason i immutable attempt history odvojena od current statea.
- **12:** PAUSED/CANCELLED/blocked-config stanje bez attempts potrošnje; operator resume.
- **13:** error code/class/retryable + sanitizovana kratka poruka; raw detalj samo secure log.
- **14:** outcome `SKIPPED/GONE/PERMANENT_FAILURE` sa razlogom, ne COMPLETED bez semantike.
- **15:** generated Prisma/Postgres/Redis CI, fault injection i provider fakes.

## 15. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,60 |
| B. API i ugovori             |    12% |   5,30 |
| C. Auth/authz/scope          |    15% |   4,10 |
| D. Poslovna pravila/stanje   |    13% |   4,40 |
| E. Podaci/Prisma/transakcije |    13% |   4,10 |
| F. Sigurnost/privatnost      |    12% |   4,30 |
| G. Async/integracije         |     8% |   3,70 |
| H. Testovi/dokazivost        |    10% |   3,80 |
| I. Operativnost/perf.        |     7% |   5,80 |
| **Ukupno**                   | **100%** | **4,41/10** |

Ponderisani zbir je 4,414; iskrena matematička ocjena prema tabeli je **4,41/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan popravki

### Faza 0 — safety net

Fault injection u tri dual-write prozora; duplicate Bull claim; stale PROCESSING; Edge zero subscriber; scoped admin foreign payload; SMTP/Teams post-send crash; oversized payload; retention batch.

### Faza 1 — durable lifecycle i P1 scope

Transactional outbox/reconciler; lease/version state machine; durable Edge transport; global/scope-aware redigovani admin API.

### Faza 2 — channel idempotency i outcome

Provider idempotency/UNKNOWN, Teams reservation, explicit skipped/gone/permanent states i immutable attempt history.

### Faza 3 — recovery i config control

Stale processing recovery, due retry sweeper, PAUSED/CANCELLED config semantika, audited admin retry/resume.

### Faza 4 — privacy, retention i bounds

Typed byte-bounded payloadi, completed/failed retention, privacy redaction, batch DLQ cleanup i safe errors.

### Faza 5 — health i observability

Oldest lag, claim success, orphan/stale counts, per-channel outcome, Edge consumer lag, provider unknown i dispatcher health; alert/runbook.

### Faza 6 — finalni gate

Svih 10 direktnih suiteova, Postgres/Redis/Bull integration, fault injection i E2E stvarne isporuke/retry/DLQ/scope na finalnom SHA-u.

## 17. Acceptance i konačna presuda

Acceptance:

1. Nijedan crash između DB i Redis koraka ne ostavlja posao bez eventualnog recoveryja.
2. Samo jedan validan lease dispatchuje logical attempt.
3. Stale PROCESSING se oporavlja ili jasno ide DLQ.
4. Edge delivery ima durable consumer dokaz ili eksplicitni `PUBLISHED_BEST_EFFORT` status; nula subscribera je retryable i nije `COMPLETED`.
5. Scoped admin ne vidi foreign/raw payload.
6. Provider crash recovery ne šalje slijepi duplikat i čuva UNKNOWN dokaz.
7. Payloadi imaju stroge per-type resource granice.
8. Svaki status ima retention/privacy lifecycle.
9. Heartbeat razlikuje process-up od processing-healthy.
10. Direktni, fault-injection, integration i E2E testovi prolaze.

Modul ima solidne pomoćne mehanizme, ali DB evidencija trenutno nije pouzdan source of truth jer queue linkage, claim i recovery nisu atomarni. Uz Edge lažni success i globalni raw admin read, enterprise baseline ne može biti iznad **4,41/10**.

## 18. W6.34 closeout — `BA-integration-queue-01` (2026-11-07)

**Status:** zatvoreno na finding nivou; drugi nalazi audit jedinice 19 i širi Val 6 ostaju nepromijenjeni.

Izmjene na grani `arena/864951a6-help-desk-enterprise` završene su na SHA [`03456b0`](https://github.com/mudzy992/help-desk-enterprise/commit/03456b0471d392b7243db0361868918f558e6461). Kodni commit [`2f76faf`](https://github.com/mudzy992/help-desk-enterprise/commit/2f76faff6422af77486f70c7a753881555cb981b) dodaje bounded oldest-first dispatcher za `PENDING` i due `FAILED` redove, stabilne BullMQ ID-eve i worker-maintenance schedule. Enqueue/admin queue-add neuspjeh ostavlja DB red oporavljivim; retry failure zapisuje email ledger due-time prije prelaska Redis granice. Admin retry sada je transakcijski statusni reset, retryable email-ledger reset i actor-attributed, hash-chained audit zapis; `UNKNOWN` email delivery ostaje blokiran. Ako admin queue-add ne uspije, periodični dispatcher ponovo šalje isti pending job sa stabilnim ID-em. Audit action/schema/compatibility registri i BS/EN admin audit/scheduler prijevodi su usklađeni.

**Acceptance granica:** potvrđeni su enqueue gap, due retry gap, stabilan attempt ID i audited admin retry koji dispatcher ponovo obrađuje. `PROCESSING` stale/lease recovery, exclusive claim i konkurentni processor state-machine problemi nisu riješeni u ovom paketu; ostaju u scopeu `BA-integration-queue-02/05`. Nema tvrdnje o exactly-once provider isporuci. Nisu korišteni target DB, pokretane/mijenjane migracije, otvoren PR, mergean kod niti izvršen deployment.

**Lokalna provjera:** fokusirani Jest je dao 10 suiteova / 41 test passed; jedini PostgreSQL integration spec bio je lokalno skipped (2 testa), jer lokalni generated Prisma client i DB nisu dostupni. Dodatno: `scheduled-jobs.wiring.spec.ts` 2/2; `npm run test:integration-harness` 17/17; `npm run wiring:check` 99 controllers / 619 routes; `npm run audit:traceability` 692/692 prije statusnog updatea; targeted ESLint, frontend audit-i18n coverage 16/16, frontend lint, Prettier i `git diff --check` passed. Privremeni ignored Prisma shims korišteni samo za diagnostics-off Jest su uklonjeni.

**Finalni automatski CI:** [`42404889174`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42404889174), SHA `03456b0`. Generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration (uključujući registrovani BA-01 recovery spec), frontend build/test i Docs guard su passed. E2E critical/install i read-only inventory su skipped. Container/supply-chain job i CI gate **failed** samo na zero-high/critical enforcementu zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fix naveden kao `1.4-r0`); ukupni CI nije zelen. Automatski Perf smoke [`42404889214`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42404889214) **failed** na nepromijenjenom DB-query budžetu: `2.124 > 2.1` kroz 50.707 zahtjeva (p95 3, max 35). Run ne pripisuje uzrok `BA-integration-queue-01`; prag nije mijenjan.

Ovaj closeout zatvara samo `BA-integration-queue-01`. `BA-integration-queue-02/05`, preostali nalazi audit 19, globalni BA-15 full critical-flow acceptance, E2E acceptance i ostali Val 6 scope nisu zatvoreni ovim paketom. Brojevi nakon ove promjene: Val 6 **38/109 zatvorenih, 71 otvoren** (13 P1 / 41 P2 / 17 P3); source audit/generisani plan **523 otvoren / 169 zatvoren**, globalni registar **533/159**. Deset ranijih statusnih divergencija, status-page zapisi i historijski closeouti nisu mijenjani. Detaljni paket: [149 — BA-integration-queue-01 dispatch recovery](../implementation/149-integration-queue-01-dispatch-recovery-closeout.md).

## 19. W6.35 closeout — `BA-integration-queue-02` (2026-11-07)

**Status:** zatvoreno na finding nivou; `BA-integration-queue-05` stale `PROCESSING` recovery i ostali nalazi audit 19 ostaju otvoreni.

Na SHA [`1677c74`](https://github.com/mudzy992/help-desk-enterprise/commit/1677c74578c459050b72a5777d469378b7493f5d), claim se dobija jednim DB compare-and-swap-om nad `status`, `version`, `attempts` i `nextRetryAt`, uz provjeru logical BullMQ attempt ID-a i upis owner tokena/lease expiryja. Processor zove kanalni dispatcher samo poslije uspješnog claima. `COMPLETED`/`FAILED`/`DLQ` tranzicije i retry side-effecti zahtijevaju isti version/attempt/owner/lease dokaz; stale tranzicija ne mijenja status, email ledger ni retry queue. Nova PostgreSQL integration spec dokazuje jednog pobjednika concurrent claima, stale/wrong-owner fencing i nepreuzimanje expired `PROCESSING` reda.

Dodana je migracija `20271031180000_integration_job_processor_claim_fence`; Prisma runtime readiness pinovan je na ovu najnoviju migraciju. CI [`42408942663`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42408942663) prošao je generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration uključujući registrovani BA-02 spec, frontend i Docs guard; migration replay prošao je na disposable CI bazi. **Ukupni CI nije zelen:** container zero-high/critical gate i CI gate failed zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]`. E2E critical/install i read-only inventory su skipped. Perf [`42408942726`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42408942726) **failed** na query budgetu `2.122 > 2.1` kroz 51.120 zahtjeva (p95 3, max 34); uzročnost BA-02 nije utvrđena i prag nije mijenjan.

Migration ID je naveden kao release preduvjet, ali nije pokrenuta nikakva target/local deployment migracija; `be1c79db` nije mijenjana. Nema target-DB pristupa, PR-a, mergea, deploymenta ili redeploy preporuke. Svaka buduća release uputa mora potvrditi sve pending migration ID-eve i njihov redoslijed.

Ovaj closeout zatvara samo `BA-integration-queue-02`; `BA-integration-queue-05`, `BA-integration-queue-03/04`, preostali nalazi audit 19, globalni BA-15 acceptance i ostali Val 6 scope ostaju otvoreni/pending. Novi zbir: Val 6 **39/109 zatvorenih, 70 otvorenih** (12 P1 / 41 P2 / 17 P3); source audit/generisani plan **522 otvoren / 170 zatvoren**, globalni registar **532/160**. Deset statusnih divergencija, status-page zapisi i historijski closeouti nisu mijenjani. Detaljni paket: [150 — BA-integration-queue-02 processor claim fencing](../implementation/150-integration-queue-02-processor-claim-fencing.md).

## 20. W6.36 closeout — `BA-integration-queue-03` (2026-11-07)

**Status:** zatvoreno na finding nivou kroz eksplicitnu best-effort alternativu; `BA-integration-queue-04/05` i svi ostali nalazi audit 19 ostaju otvoreni.

Na kodnom SHA [`b9dcc6c`](https://github.com/mudzy992/help-desk-enterprise/commit/b9dcc6cdedc072c542813d8de3653ccaed24c5f0) Redis `PUBLISH` subscriber count više se ne odbacuje. Pozitivan count završava claim-fenced Edge job u `PUBLISHED_BEST_EFFORT`; processor ne označava događaj kao `COMPLETED` niti tvrdi potvrdu krajnjeg klijenta. Nula subscribera baca retryable `EDGE_EVENT_NO_SUBSCRIBERS`; postojeći failure/backoff put čuva error code i `nextRetryAt`, pa job ostaje oporavljiv. Status filter, UI badge i BS/EN prijevodi prikazuju best-effort granicu. PostgreSQL+Redis integration spec pokriva stvarni positive subscriber/payload i zero-subscriber retry stanje; registrovan je u isolated integration runneru.

Migracija `20271031190000_integration_job_edge_publish_best_effort` dodaje Prisma status i postavljena je iza `20271031180000_integration_job_processor_claim_fence`. CI [`42423568636`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42423568636) prošao je generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration i disposable migration replay, frontend build/test i Docs guard. Ukupni CI **nije zelen**: container high/critical gate i CI gate failed zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fix `1.4-r0`); E2E critical/install i read-only inventory su skipped. Perf [`42423568707`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42423568707) **failed** na nepromijenjenom query budgetu `2.122 > 2.1` kroz 50.797 zahtjeva (p95 3, max 34); uzročnost BA-03 nije utvrđena.

Migracija je izvršena samo u disposable CI bazi; nema target-DB pristupa, lokalnog migration runa, PR-a, mergea ili deploymenta. `be1c79db` nije mijenjana niti je njen neusaglašeni ID pogađan. Zatvara se samo `BA-integration-queue-03`; `BA-integration-queue-04/05`, preostali nalazi audit 19, BA-15 full critical-flow acceptance i ostali Val 6 scope ostaju otvoreni/pending. Audit 19 je **3/15 zatvorena**; Val 6 **40/109 zatvorenih, 69 otvorenih** (11 P1 / 41 P2 / 17 P3); source audit/generisani plan **521 otvoren / 171 zatvoren**, globalni registar **531/161**. Deset poznatih statusnih divergencija, status-page zapisi i raniji closeouti nisu mijenjani. Detalji: [paket 151 — BA-integration-queue-03](../implementation/151-integration-queue-03-edge-best-effort-closeout.md).

## 21. W6.37 closeout — `BA-integration-queue-04` (2026-11-08)

**Status:** zatvoreno na finding nivou uz globalnu authorization guardu i siguran podrazumijevani response. `BA-integration-queue-05` i svi ostali nalazi audit 19 ostaju otvoreni.

Queue controller i dalje koristi kanonski `RoleGuard`/authorization evaluator. Ciljani testovi potvrđuju da `integrations.queue.manage` uz `ADMIN` role na OU-scoped ili service-scoped assignmentu bude odbijen, prije nego što route handler nastavi; globalni `ADMIN` assignment uz istu permission se prihvati. Controller-scoped guard pokriva queue rute, a local-only `SUPER_ADMIN` bypass ostaje auditan prije pristupa. Nije uveden paralelni ad hoc authorization sloj niti scoped list path koji bi mogao obraditi cursor prije provjere.

Repository list projekcija sada bira samo `id`, `type`, `status`, `lastError`, `attempts`, `nextRetryAt` i timestamps; `payload` se ne učitava u admin listu. Serializer i list/retry response izostavljaju `payload` i sirovi `lastError`; izlaz sadrži samo safe metadata i `lastErrorCode`. Poznati `EDGE_EVENT_NO_SUBSCRIBERS` se izlaže samo za `EDGE_EVENT` sa tačno tom internom porukom, ostale neprazne greške postaju `INTEGRATION_JOB_FAILED`, a nedostajuća greška ostaje `null`. Frontend više ne prikazuje sirovu poruku i koristi BS/EN label za poznat kod i generički fallback za nepoznat kod. Nije uveden full-payload inspect endpoint, posebno pravo, reason ili audit putanja; BA-04 ne širi scope na njih.

Lokalno su frontend fokusirani testovi prošli **3 fajla / 8 testova**, build, targeted ESLint i i18n parity. Backend ciljani Jest prošao je **4 suite / 31 test**, ali taj lokalni prolaz koristio je privremene Prisma enum/client stubove uz `diagnostics:false`, pa nije smatran type-checkom; helperi su uklonjeni. Automatski CI na kodnom/testanom SHA [`f0fe7e3`](https://github.com/mudzy992/help-desk-enterprise/commit/f0fe7e38f0d56b40be0a09809872ef16919a5e8b) prošao je generated-Prisma backend build/lint/full Jest, frontend full build/test/format/budgets, Docs guard i real PostgreSQL+Redis integration/migration replay na disposable CI bazi.

Ukupni CI [`42427621411`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42427621411) **nije zelen**: backend container/supply-chain zero-high/critical gate i CI gate pali su na `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fixed `1.4-r0`). E2E critical/install i read-only inventory su `skipped`. Perf [`42427621434`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42427621434) **failed** na nepromijenjenom query budgetu `2.125 > 2.1` preko 50.759 zahtjeva (p95 3, max 34); run ne dokazuje BA-04 uzročnost. Nije mijenjan Perf prag.

Nema schema promjene ni nove migracije; CI migration replay radio je samo nad disposable bazom. Korisnik je naveo da su sve postojeće migracije primijenjene; target DB nije korištena niti je taj status nezavisno provjeren. Nema PR-a, mergea, deploymenta ni promjene `be1c79db`. Audit 19 sada ima **4/15 zatvorena**; Val 6 **41/109 zatvorenih, 68 otvorenih** (10 P1 / 41 P2 / 17 P3); source audit/generisani plan **520 otvoren / 172 zatvoren**, globalni registar **530/162**. Deset ranijih statusnih divergencija, status-page zapisi i historijski closeouti nisu mijenjani. `BA-integration-queue-05`, `BA-notifications-14`, `BA-websocket-14` i BA-15 full critical-flow acceptance ostaju otvoreni/pending. Detalji: [paket 152 — BA-integration-queue-04](../implementation/152-integration-queue-04-global-admin-response-redaction.md).

## 22. W6.55 implementation status — BA-integration-queue-05 (2026-10-29)

`BA-integration-queue-05` (P2) ostaje **otvoren**. Periodični reconciler sada bounded čita istekle `PROCESSING` claimove i fenced CAS-om ih stavlja u `DLQ` sa safe kodom `PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN`; stari worker ne može prepisati status. Ne radi se automatski retry: provider je možda već prihvatio zahtjev ili je poziv još u toku. Admin retry je blokiran i UI prikazuje razlog; automatski DLQ retention ne briše karantin prije provjere. Legacy red bez leasea koristi 5-minutnu granicu `updatedAt`. Ovo je **karantin, ne potpuni recovery**: lease se ne obnavlja, pa spor aktivni posao može biti karantiniran; nema UI postupka razrješenja, external side-effect fencing-a niti atomic email-ledger reconciliationa. Procesna provjera i postavke u [paketu 170](../implementation/170-integration-queue-05-expired-processing-quarantine.md).

Lokalno: ciljani Jest **4 suitea / 32 testa** sa Prisma stubovima i isključenom TypeScript dijagnostikom, backend/frontend targeted ESLint, frontend Vitest **2/2** i frontend TypeScript prošli su. Dodan PostgreSQL concurrency test nije izvršen lokalno; CI/generated-Prisma, stvarni DB/Redis i provider fault acceptance nisu potvrđeni. Full CI/E2E nije ručno pokretan. Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Registar i Val 6 zbir ostaju nepromijenjeni.

### CI follow-up za W6.55

CI `42687805115` nije prošao backend build: anotacija navodi TS2783 zbog ponovljenog `updatedAt` i tri ranije websocket TS2540 greške; frontend Prettier također je pao. Follow-up uklanja duplirano polje uz očuvan CAS i formatira frontend. Perf `42687805136` nije pokrenuo k6 jer je API build pao. Detalji i granice lokalne provjere: [paket 171](../implementation/171-val6-ci-perf-build-regression-fix.md). BA-05 ostaje otvoren; novi CI/Perf nisu potvrđeni.
