# Backend audit 19 — `integration-queue`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **4,41/10**  
**Nalazi:** 4 P1, 8 P2, 3 P3

## 1. Executive summary

`integration-queue` persistira i izvršava EMAIL, EDGE_EVENT i TEAMS poslove, vodi attempts/backoff/DLQ stanje, daje administratorski pregled/retry, worker heartbeat i DLQ retention. Dobra osnova uključuje DB evidenciju, tipizirane parsere, email dedupe u downstreamu, eksponencijalni backoff, permanent-recipient klasifikaciju, provider suppression delay, stabilne schedulere, cursor admin listu i heartbeat self-healing.

Baseline je ipak **4,41/10**. Četiri P1 nalaza pogađaju delivery correctness i privatnost. DB red i BullMQ posao nisu atomarno povezani: pad nakon DB writea, prije queue add-a, ostavlja trajno orphanovan PENDING/FAILED posao bez reconciliationa; isti gap postoji pri retryju. Processor nema conditional claim/lease pa dupli Bull poslovi mogu paralelno izvršiti isti integration job. EDGE_EVENT tretira Redis `PUBLISH` rezultat nula kao uspjeh i označava posao COMPLETED iako nije bilo subscriber isporuke. Admin queue API vraća kompletne email/Edge/Teams payloadove globalno svakom ADMIN assignmentu sa permisijom, bez scope filtriranja ili redakcije.

Dodatni rizici su provider-side duplicate nakon crasha, status transition race, neograničeni payloadi i DLQ delete, heartbeat koji ne dokazuje processing, settings promjena između pokušaja, nepostojanje retentiona za COMPLETED poslove i slaba E2E crash/recovery matrica. Nema P0. Popravke nisu implementirane.

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
| BA-integration-queue-01 | P1    | DB/Bull dual-write crash gap trajno orphanira enqueue, retry i admin-retry poslove        | otvoreno |
| BA-integration-queue-02 | P1    | Processor nema conditional lease claim pa dupli Bull poslovi paralelno dispatchuju        | otvoreno |
| BA-integration-queue-03 | P1    | EDGE_EVENT `PUBLISH=0` postaje COMPLETED bez ijednog primaoca ili replaya                 | otvoreno |
| BA-integration-queue-04 | P1    | Scoped ADMIN može čitati globalne sirove email/Edge/Teams payloadove                       | otvoreno |
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

## 13. Detalji P1 nalaza

### BA-integration-queue-01 — orphanovani poslovi

Postgres i Redis ne dijele transakciju. Uvesti transactional outbox: producer samo atomarno piše domain/outbox red; dispatcher claimuje lease i idempotentno upisuje Bull job. Alternativno obavezni reconciler mora nalaziti PENDING bez queue potvrde, due FAILED i stale PROCESSING. `queue.add` ID mora biti stabilan po logical attemptu. Admin retry mora biti auditirana state tranzicija koju isti dispatcher obrađuje.

### BA-integration-queue-02 — nema ekskluzivnog claima

Početni status read i `markProcessing` nisu atomic compare-and-swap. Uvesti conditional update `status/version/nextRetryAt`, owner token, lease expiry i attempt ID. Samo claimant dispatchuje; completion/failure update mora zahtijevati isti lease/version da stale worker ne prepiše novije stanje.

### BA-integration-queue-03 — lažni Edge success

Redis pub/sub broj subscriber-a je ignorisan, a ni broj >0 nije end-to-end ack. Prebaciti Edge delivery na durable Redis Stream/Bull→API inbox sa consumer groupom i idempotentnim event ID-em, ili jasno označiti `PUBLISHED_BEST_EFFORT` umjesto COMPLETED/delivered. Nula mora biti retryable/observable, ne success.

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
4. Edge success ima durable consumer dokaz; nula subscriber-a nije COMPLETED.
5. Scoped admin ne vidi foreign/raw payload.
6. Provider crash recovery ne šalje slijepi duplikat i čuva UNKNOWN dokaz.
7. Payloadi imaju stroge per-type resource granice.
8. Svaki status ima retention/privacy lifecycle.
9. Heartbeat razlikuje process-up od processing-healthy.
10. Direktni, fault-injection, integration i E2E testovi prolaze.

Modul ima solidne pomoćne mehanizme, ali DB evidencija trenutno nije pouzdan source of truth jer queue linkage, claim i recovery nisu atomarni. Uz Edge lažni success i globalni raw admin read, enterprise baseline ne može biti iznad **4,41/10**.
