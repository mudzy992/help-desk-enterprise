# Backend audit 28 — `announcements`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **4,31/10**  
**Nalazi:** 4 P1, 11 P2, 4 P3

## 1. Executive summary

`announcements` pokriva draft/publish/withdraw lifecycle, vremenski aktivne banner/modal najave, role/OU/group publiku, acknowledgement/dismissal, revision historiju, izvještaj i CSV, in-app/e-mail/Teams distribuciju, reminder, retention i BullMQ sweep. Pozitivna osnova je jaka: strict DTO, server-side audience predicate, aktivnost izvedena iz vremena, transakcijski core mutation+audit, idempotent acknowledge/dismiss, publish status claim, e-mail batch/cursor/delivery ledger, preference/domain provjera i CSV formula neutralizacija.

Baseline je **4,31/10**. Četiri P1 nalaza pogađaju authorization, availability i resource safety. `announcement.manage` ili `announcement.report.read` u bilo kojem assignmentu tretira se kao globalna dozvola bez OU/service scopea, pa scoped actor može upravljati svim najavama ili izvesti identitete/e-mailove cijele publike. Active i archive uzimaju globalnih 50/100 redova prije visibility filtera, pa foreign najave mogu istisnuti kritičnu najavu namijenjenu vieweru. In-app fan-out uzima prvih 20.000 korisnika, ali prije toga trajno postavlja `audienceNotifiedAt`; ostatak publike se nikad ne obrađuje. Report/CSV učitava cijelu aktuelnu publiku i sve acknowledgement redove bez limita/paginacije, stvarajući memory/PII export rizik.

Dodatni rizici su agentova foreign group/service referenca, concurrent lifecycle bez version/CAS-a, queue/reminder recovery prozori, Teams terminal claim prije slanja, SMTP duplicate crash prozor, scheduler bez Redis-loss reconciliationa, current-audience izvještaj nasuprot publish snapshotu i nepotpuna retention/anonymization matrica. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 16 produkcijskih TypeScript fajlova;
- 2 direktna speca;
- 2.086 aktuelnih produkcijskih LOC;
- 1 controller, 3 injectable servisa/komponente i 1 BullMQ processor;
- Prisma: `Announcement`, acknowledgement, dismissal, revision i email-run modeli;
- integracije: principal context/RBAC, OU/group/service, notifications/preferences/e-mail, Teams, audit-log, settings, privacy i BullMQ;
- primarni E2E dokaz: 45; reference 22/56.

Registarskih 2.102 LOC korigovano je na 2.086.

## 3. Authorization i management scope

Svi user endpointi traže sesiju. Active/ack/dismiss dodatno provjeravaju vremensku aktivnost i audience membership. Management je u serviceu: SUPER_ADMIN ili actor sa `announcement.manage`; report traži `announcement.report.read`. Agent može objavljivati samo kada je postavka uključena i announcement ima eksplicitne audience OU-ove unutar njegovog home podstabla.

`announcementViewerFromContext` ipak radi `assignments.some(permission)` bez scope evaluacije. Dozvola dodijeljena za jednu OU/service jedinicu postaje `canManageAll` nad svim najavama. Isto važi za `announcement.report.read`, čiji CSV sadrži puno ime, e-mail, jedinicu i vrijeme acknowledgementa. Ovo je direktan cross-scope privilege escalation. Potrebna je authorization-service odluka za konkretan announcement/audience OU, a globalni pristup samo za eksplicitno globalan assignment ili SUPER_ADMIN.

Agent restriction provjerava samo `audienceOrganizationalUnitIds`. Group ID mora samo postojati, service ID mora samo postojati; ne provjerava se pripadnost agentovom podstablu. Options agentu filtrira units/groups, ali vraća sve services, a API se ne smije oslanjati na UI. Foreign group/service reference može otkriti naziv i proizvesti publiku/oznaku izvan namjeravanog scopea. Preview audience također ne potvrđuje da IDs postoje za globalnog managera i može služiti kao count oracle.

## 4. Audience i user visibility

Audience koristi AND između nepraznih role/OU/group filtera; OU uključuje potomke. Worker predicate dodatno traži active i non-anonymized user. User-side filter koristi principal roleKeys, aktuelne groupIds i home OU path. Ovo je konzistentna osnova.

`active` prvo uzima 50 najnovijih globalno aktivnih najava, tek zatim filtrira viewer audience. `archive` radi isto sa 100 globalnih redova. U velikoj instalaciji foreign najave mogu popuniti cap i sakriti CRITICAL/MODAL najavu namijenjenu korisniku. Nema cursor/`hasMore`, a active rezultat se dodatno sortira po severity tek poslije capa. Audience predicate mora biti pushan u DB ili query mora bounded-cursor skenirati do viewer limita uz eksplicitni incomplete contract.

`manage` slično uzima globalnih 200 prije agent scope filtera, pa agent može dobiti nepotpunu listu vlastitih najava. Service koristi live role/group/home OU; promjena membershipa odmah mijenja čitanje i delivery. `audienceSizeAtPublish` je samo broj, ne immutable membership snapshot, pa nije dokaz ko je bio obuhvaćen u trenutku objave.

## 5. Lifecycle, revision i concurrency

Create, publish, withdraw i draft delete su auditirani u istoj DB transakciji. Publish koristi `updateMany(id,status=DRAFT)` i time sprečava dupli publish. Published text edit čuva prethodni title/body revision i povećava version. Acknowledge/dismiss koriste DB unique upsert.

Opšti optimistic concurrency ipak ne postoji. DTO ne nosi expected version/If-Match. Paralelni draft update je last-write-wins. Paralelni published edit može udariti u unique `(announcementId,version)` ili zapisati odluku nad zastarjelim audience/status snapshotom. Withdraw koristi `update(id)` bez `status=PUBLISHED` predicatea nakon ranijeg read-a; update/withdraw i end-time promjene mogu se međusobno pregaziti. Revision čuva samo title/body, ne severity, display, end, service ni channel promjene, pa nije potpuna historija objavljenog sadržaja.

Publish audience count se računa prije transakcije i nije snapshot članstva. Update audita `version: row.version`, odnosno staru verziju, bez structured before/after polja. Uvesti version CAS za svaku mutation, status predicate, kompletan revision snapshot i atomarni publication snapshot/outbox.

## 6. In-app notification i reminder

`notifyStarted` prvo atomarno claimuje `audienceNotifiedAt`, zatim eventualno kreira email run, učita najviše 20.000 članova i per-user piše in-app notification. Dedupe key je stabilan, a pojedinačni kvar ne prekida ostatak batcha.

Međutim cap je terminalan: announcement ostaje označen kao notified i korisnici poslije prvih 20.000 nemaju cursor/backlog. Isto važi za reminder `take: 20.000`; `lastReminderAt` se claimuje prije fan-outa, pa truncation ili pad zaključava retry 24 sata. `fanOut` je sekvencijalan i za 20k korisnika može preći worker lock/budget. Potreban je durable fan-out run sa cursorom, per-recipient ledgerom, batch workerom i completed statusom tek nakon cijele publike.

`queueEmailRun` je best-effort nakon claim-a i nema unique business key. Ako create padne nakon `audienceNotifiedAt`, published e-mail se više neće automatski zakazati. Reminder claim pa queue failure također čeka naredni interval. Run key treba biti unique `(announcement,kind,publication/reminder slot)` i kreiran u istoj transakciji/outboxu.

## 7. E-mail i Teams delivery

E-mail runovi su bounded (10 runova, 100 usera po batchu), cursorirani i re-evaluiraju live audience, active status, preferences, quiet/digest policy i address allowlist. Delivery ledger dedupe je po run+useru, a Message-ID je determinističan. Ovo je dobar temelj.

Ipak SMTP accepted → DB mark sent crash prozor može ponoviti poruku pri retryu. Cursor se pomjera i failed recipient se broji, ali se ne retrya unutar istog runa; transient greška trajno preskače korisnika. Ako channel trenutno nije dostupan, svi otvoreni runovi se terminalno završavaju kao disabled, bez operator retry odluke. Potrebna je eksplicitna at-least-once politika, retryable recipient state i reconciliation.

Teams `teamsPostedAt` se postavlja prije webhook poziva. Ako webhook padne, `teamsResult=FAILED`, ali due query više nikad ne bira zapis; transient failure je terminalan. Obrnuti crash nakon webhook successa prije result updatea ostavlja `teamsPostedAt` postavljen i rezultat null, bez reconciliationa. Koristiti outbox/delivery attempt sa retry/backoffom i provider idempotency gdje je moguće.

## 8. Scheduler i recovery

Sweep je bounded na 20 due announcements; processor ima concurrency 1, lock timeout, attempts/backoff i metriku. Derived SCHEDULED/ENDED status izbjegava stale status job.

Repeat scheduler se registruje samo na module init. Redis flush nakon boota može ukloniti scheduler bez self-heala. Dok scheduler ne radi, start notification, e-mail, Teams i receipt retention staju. Nakon povratka, najava koja je već završila više nije due, pa se njena planirana distribucija trajno gubi. Potreban je periodic scheduler reconcile/health, oldest-due alarm i eksplicitna politika missed announcements.

## 9. Report, privacy i retention

Report prikazuje publish audience size, current audience, acknowledgement count, unit agregate, pending subset i zadnjih 20 e-mail runova. CSV neutralizuje spreadsheet formule i export se auditira.

`reportRows` bez limita učitava sve aktuelne članove sa e-mailom i sve acknowledgement redove. JSON koristi samo prvih 200 pending imena, ali je cijeli set već u memoriji; CSV je neograničen. Potrebni su DB agregati, cursorirana pending lista i streaming/chunked CSV sa export budgetom.

Izvještaj miješa `audienceSizeAtPublish` sa live current audience i svim historijskim acknowledgementima. Korisnik koji je izašao iz publike može ostati u acknowledgedCount, ali nije u unit breakdownu; novi član ulazi u pending iako nije bio publika pri publishu. Bez membership snapshot/event ledgera compliance tvrdnja „X od Y“ nije vremenski konzistentna.

Retention briše acknowledgement/dismissal poslije kraja, uz legal hold, ali radi samo tokom aktivnog sweepa i grešku guta. Revisions, withdrawn announcements, email runs, notification delivery, audit, Teams payload i author text nemaju potpunu retention/anonymization matricu. Cascade delete je dopušten samo za draft, što čuva objavljenu historiju, ali user cascade briše receipt i oslanja se na `anonymizedAcknowledgements` koji mora biti dokazan privacy flowom.

## 10. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/announcements/announcement-audience.spec.ts \
  src/modules/announcements/announcement-delivery.spec.ts
```

Rezultat: **1/2 suitea prošao, 1/2 compile-blocked; 8/8 izvršenih testova prošlo**. Audience pure suite je zelen. Delivery suite je blokiran jer generated `PrismaService` nema `announcement`, `announcementEmailRun` i `user` delegate. Nije zabilježen assertion failure.

E2E 45 pokriva create/publish, audience hint, acknowledgement/report, archive, edit revision i withdraw lifecycle. Ne pokriva scoped permission escalation, pre-visibility cap, >20k audience, concurrent update/withdraw, queue failure, SMTP crash, Teams retry, Redis flush, current-vs-publish membership ni retention/legal hold.

## 11. Pozitivni nalazi

1. Strict DTO i bounded title/body/audience filteri.
2. Vremenski status je izveden, ne oslanja se na flip job.
3. AND audience semantika i OU descendant pravilo su eksplicitni.
4. Core mutation i audit su transakcijski.
5. Publish koristi status claim.
6. Published text revision se čuva.
7. Acknowledge/dismiss su idempotentni i DB unique.
8. Active endpoint je `no-store` i withdrawal brzo nestaje.
9. E-mail batch/cursor i recipient delivery ledger.
10. Preference, active/anonymized i e-mail domain filteri.
11. Determinističan Message-ID i individualno slanje.
12. CSV formula neutralizacija i export audit.
13. Legal-hold uslov za receipt retention.
14. Svih 8 izvršenih testova je zeleno.

## 12. Registar nalaza

| ID                  | Severity | Nalaz                                                                                       | Status   |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- | -------- |
| BA-announcements-01 | P1       | Scoped manage/report permission postaje globalna i omogućava cross-OU mutation/PII export  | otvoreno |
| BA-announcements-02 | P1       | Active/archive cap se primjenjuje prije audience filtera i može sakriti kritičnu najavu     | otvoreno |
| BA-announcements-03 | P1       | In-app/reminder fan-out terminalno odsijeca publiku nakon 20.000 korisnika                  | otvoreno |
| BA-announcements-04 | P1       | Report/CSV neograničeno učitava current audience, e-mailove i acknowledgement redove        | otvoreno |
| BA-announcements-05 | P2       | Agent scope ne validira group/service reference prema vlastitom OU podstablu                | otvoreno |
| BA-announcements-06 | P2       | Mutation nema version/CAS; draft/published/lifecycle race može pregaziti stanje             | otvoreno |
| BA-announcements-07 | P2       | Published revision ne čuva severity/display/end/service/channel promjene                    | otvoreno |
| BA-announcements-08 | P2       | Notify/reminder claim i email-run queue nisu atomarni ni pouzdano obnovljivi                | otvoreno |
| BA-announcements-09 | P2       | SMTP accepted → DB mark crash može duplirati e-mail; failed recipient nema retry state      | otvoreno |
| BA-announcements-10 | P2       | Teams claim prije webhooka čini transient failure terminalnim                               | otvoreno |
| BA-announcements-11 | P2       | Scheduler nema Redis-loss reconciliation; završena missed najava se trajno gubi             | otvoreno |
| BA-announcements-12 | P2       | Report miješa publish count sa live membershipom i historijskim acknowledgementima          | otvoreno |
| BA-announcements-13 | P2       | Audience size nije immutable membership snapshot niti transakcijski publish presjek         | otvoreno |
| BA-announcements-14 | P2       | Manage list cap prije agent scope filtera daje nepotpunu vlastitu listu                      | otvoreno |
| BA-announcements-15 | P2       | Retention/anonymization ne pokriva revisions, runs, delivery, Teams i audit replike          | otvoreno |
| BA-announcements-16 | P3       | Preview audience za global manager ne validira unknown IDs i može dati zavodljiv count      | otvoreno |
| BA-announcements-17 | P3       | Retention je best-effort, guta grešku i zavisi od aktivnog sweepa                            | otvoreno |
| BA-announcements-18 | P3       | Nema cursor/hasMore za archive/manage/pending niti stabilan tie-break order                  | otvoreno |
| BA-announcements-19 | P3       | Delivery suite je compile-blocked; nema concurrency/Redis/SMTP/large-audience testa          | otvoreno |

## 13. Ključne korekcije

- **01,05:** resource-aware authorization service za manage/report; OU/group/service relacijska validacija.
- **02,14,18:** audience/scope pushdown ili bounded cursor scan; cursor/hasMore i stabilan order.
- **03,08:** durable in-app fan-out run/cursor/ledger; claim+outbox transakcija; retry/reconcile.
- **04:** DB agregati, paginated pending i streaming CSV sa hard budgetom.
- **06–07:** version/If-Match, status CAS i kompletan immutable published revision snapshot.
- **09–11:** recipient retry state, at-least-once ugovor, Teams outbox i scheduler self-heal/health.
- **12–13:** publication membership snapshot/event ledger i vremenski konzistentan report.
- **15–17:** kompletna privacy/retention matrica, zaseban retention job i alarm/retry.
- **19:** regenerisan Prisma client i Postgres/Redis/SMTP/concurrency/large-audience testovi.

## 14. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,80 |
| B. API i ugovori             |    12% |   5,00 |
| C. Auth/authz/scope          |    15% |   3,60 |
| D. Poslovna pravila/stanje   |    13% |   4,80 |
| E. Podaci/Prisma/transakcije |    13% |   4,20 |
| F. Sigurnost/privatnost      |    12% |   3,80 |
| G. Async/integracije         |     8% |   3,80 |
| H. Testovi/dokazivost        |    10% |   3,80 |
| I. Operativnost/perf.        |     7% |   4,00 |
| **Ukupno**                   | **100%** | **4,31/10** |

Ponderisani zbir je 4,310, odnosno **4,31/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 15. Fazni plan

### Faza 0 — safety net

Scoped permission cross-OU; 100 foreign + one critical own; 20.001 recipient; million-row report; concurrent update/withdraw; queue failure; SMTP accepted-crash; Teams 500; Redis flush; membership change.

### Faza 1 — authorization i bounded reads

Resource-aware manage/report, group/service scope validation, audience-pushed liste, DB report aggregates i streaming CSV.

### Faza 2 — lifecycle i publication truth

Version/CAS, kompletan revision snapshot, publication membership ledger i vremenski tačan report.

### Faza 3 — durable fan-out i channels

In-app/email/Teams outbox, cursorirani recipient state, retries/reconciliation i eksplicitna delivery semantika.

### Faza 4 — scheduler, privacy i retention

Scheduler self-heal/health, missed policy, potpuna anonymization/retention matrica i alarmirani retention job.

### Faza 5 — finalni gate

Regenerisan Prisma client; oba suitea; Postgres concurrency/large audience, Redis restart/flush, SMTP/Teams fault injection i E2E 45 na finalnom SHA-u.

## 16. Acceptance i konačna presuda

1. Nijedna scoped permission ne daje globalni manage/report pristup.
2. Kritična viewer najava se ne može izgubiti zbog foreign globalnog capa.
3. Svaki član publike dobija durable in-app delivery ili dokaziv terminal reason.
4. Report i CSV su bounded/streamed i authorization-safe.
5. Concurrent mutation vraća conflict i revision opisuje kompletno objavljeno stanje.
6. Publish audience i acknowledgement report imaju konzistentnu vremensku osnovu.
7. Queue/channel/scheduler crash ima retry/reconciliation bez tihog gubitka.
8. Group/service audience reference ostaje unutar odobrenog scopea.
9. Retention/anonymization pokriva sve receipt, revision, notification, e-mail, Teams i audit replike.
10. Oba direktna suitea i large-audience/concurrency/fault E2E prolaze.

Modul ima dobru funkcionalnu osnovu, transakcijski audit i promišljen e-mail batching, ali globalizacija scoped permissiona, pre-visibility cap, terminalni 20k fan-out i neograničen PII report sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **4,31/10**.
