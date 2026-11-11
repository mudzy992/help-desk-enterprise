# Backend audit 28 — `announcements`

**Status:** audit završen; `BA-announcements-01` zatvoren u W6.44, `BA-announcements-02` zatvoren u W6.45, `BA-announcements-03` zatvoren u W6.46, `BA-announcements-04` zatvoren u W6.47<br>
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **4,31/10**  
**Nalazi:** 4 P1, 11 P2, 4 P3

## 1. Executive summary

`announcements` pokriva draft/publish/withdraw lifecycle, vremenski aktivne banner/modal najave, role/OU/group publiku, acknowledgement/dismissal, revision historiju, izvještaj i CSV, in-app/e-mail/Teams distribuciju, reminder, retention i BullMQ sweep. Pozitivna osnova je jaka: strict DTO, server-side audience predicate, aktivnost izvedena iz vremena, transakcijski core mutation+audit, idempotent acknowledge/dismiss, publish status claim, e-mail batch/cursor/delivery ledger, preference/domain provjera i CSV formula neutralizacija.

Baseline je **4,31/10** prije implementacija. Četiri P1 nalaza u izvornom baselineu pogađaju authorization, availability i resource safety. `BA-announcements-01` zatvoren je u W6.44 nakon scope-aware manage/report authorization; `BA-announcements-02` u W6.45 nakon audience predicate pushdowna prije active/archive capa; `BA-announcements-03` u W6.46 nakon keyset fan-outa bez ukupnog capa; `BA-announcements-04` u W6.47 nakon DB agregata, bounded pending cursor stranica i streaming CSV-a sa hard export budžetom. Sva četiri baseline P1 su zatvorena na finding nivou; to ne zatvara ostale P2/P3 rizike ni BA-15 acceptance.

Dodatni rizici su agentova foreign group/service referenca, concurrent lifecycle bez version/CAS-a, queue/reminder recovery prozori, Teams terminal claim prije slanja, SMTP duplicate crash prozor, scheduler bez Redis-loss reconciliationa, current-audience izvještaj nasuprot publish snapshotu i nepotpuna retention/anonymization matrica. Nema P0. Baseline 4,31/10 ostaje ocjena prije implementacija; `BA-announcements-01`–`04` zatvoreni su redom u W6.44–W6.47. P2/P3 nisu dio ovih closeouta; publish-time membership/report konzistentnost `BA-announcements-12` ostaje otvorena.

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

Baseline `announcementViewerFromContext` radio je `assignments.some(permission)` bez scope evaluacije, pa je scoped `announcement.manage` ili `announcement.report.read` postajao globalan. To je zatvoreno u W6.44: viewer sada drži manage/report scopeove odvojeno; service provjerava konkretan audience preko `AuthorizationService.authorizeResource`, zahtijeva dozvolu za svaki OU u filteru i odbija scoped pristup publici bez OU filtera. Globalna putanja prolazi samo za globalni resource decision (eksplicitan globalni assignment ili lokalni SUPER_ADMIN). Service-only scope se ne pretvara u OU/global scope jer `Service` nema audience OU relaciju; takav grant za announcements fail-closed.

Agent restriction provjerava samo `audienceOrganizationalUnitIds`. Group ID mora samo postojati, service ID mora samo postojati; ne provjerava se pripadnost agentovom podstablu. Options agentu filtrira units/groups, ali vraća sve services, a API se ne smije oslanjati na UI. Foreign group/service reference može otkriti naziv i proizvesti publiku/oznaku izvan namjeravanog scopea. Preview audience također ne potvrđuje da IDs postoje za globalnog managera i može služiti kao count oracle.

## 4. Audience i user visibility

Audience koristi AND između nepraznih role/OU/group filtera; OU uključuje potomke. Worker predicate dodatno traži active i non-anonymized user. User-side filter koristi principal roleKeys, aktuelne groupIds i home OU path. Ovo je konzistentna osnova.

Baseline `active` je uzimao 50, a `archive` 100 globalnih redova prije viewer audience filtera; foreign najave su zato mogle popuniti cap i sakriti kritičnu najavu namijenjenu korisniku. W6.45 je zatvorio taj P1 bez promjene postojećih vremenskih prozora i acknowledgement/dismissal filtera: role/OU/group AND-predicate sada se push-a u PostgreSQL prije limita, uz OU home-path ancestry; active query sortira severity prije `take: 50`. Rezultat ostaje namjerno ograničen na postojeće 50/100 vidljivih redova; pagination/`hasMore` za manage/archive/pending ostaje zaseban P2/P3 scope.

`manage` slično uzima globalnih 200 prije agent scope filtera, pa agent može dobiti nepotpunu listu vlastitih najava. Service koristi live role/group/home OU; promjena membershipa odmah mijenja čitanje i delivery. `audienceSizeAtPublish` je samo broj, ne immutable membership snapshot, pa nije dokaz ko je bio obuhvaćen u trenutku objave.

## 5. Lifecycle, revision i concurrency

Create, publish, withdraw i draft delete su auditirani u istoj DB transakciji. Publish koristi `updateMany(id,status=DRAFT)` i time sprečava dupli publish. Published text edit čuva prethodni title/body revision i povećava version. Acknowledge/dismiss koriste DB unique upsert.

Opšti optimistic concurrency ipak ne postoji. DTO ne nosi expected version/If-Match. Paralelni draft update je last-write-wins. Paralelni published edit može udariti u unique `(announcementId,version)` ili zapisati odluku nad zastarjelim audience/status snapshotom. Withdraw koristi `update(id)` bez `status=PUBLISHED` predicatea nakon ranijeg read-a; update/withdraw i end-time promjene mogu se međusobno pregaziti. Revision čuva samo title/body, ne severity, display, end, service ni channel promjene, pa nije potpuna historija objavljenog sadržaja.

Publish audience count se računa prije transakcije i nije snapshot članstva. Update audita `version: row.version`, odnosno staru verziju, bez structured before/after polja. Uvesti version CAS za svaku mutation, status predicate, kompletan revision snapshot i atomarni publication snapshot/outbox.

## 6. In-app notification i reminder

Izvorni audit je zabilježio da `notifyStarted` claimovao `audienceNotifiedAt` prije nego što je učitao najviše 20.000 članova i slao in-app obavještenja; reminder je imao isti ukupni `take` i claimovao `lastReminderAt` prije fan-outa. To je moglo trajno presjeći publiku ili odgoditi retry.

W6.46 uklanja ukupni cap: `fanOutAudienceInPages()` učitava stranice od 1.000 ID-ova uz keyset uslov `id > cursor`, stabilno sortiranje i bez OFFSET-a. Publish i reminder koriste isti prolaz; reminder zadržava audience predicate i isključuje korisnike koji su već acknowledge-ovali. `audienceNotifiedAt` odnosno `lastReminderAt` se claimuju tek nakon što se sve stranice obrade. Ako dohvat stranice ili page-level operacija propagira grešku, marker ne potroši retry prozor; obavještenja iz ranijih stranica zaštićena su postojećim per-recipient dedupe keyjem. Pojedinačni notification-persist kvarovi i dalje se loguju i ne prekidaju fan-out; trajni per-recipient retry je odvojeni `BA-announcements-08` scope. Ovo je sinhroni keyset prolaz, ne durable cursor/run niti outbox.

Preostali `BA-announcements-08` rizik: `queueEmailRun` ostaje best-effort nakon publish/reminder markera i nema unique business key. Ako create padne nakon `audienceNotifiedAt`, published e-mail se više neće automatski zakazati; reminder queue failure čeka naredni interval. Durable run key `(announcement, kind, publication/reminder slot)`, atomarni outbox i recovery/retry nisu dio ovog P1 closeouta.

## 7. E-mail i Teams delivery

E-mail runovi su bounded (10 runova, 100 usera po batchu), cursorirani i re-evaluiraju live audience, active status, preferences, quiet/digest policy i address allowlist. Delivery ledger dedupe je po run+useru, a Message-ID je determinističan. Ovo je dobar temelj.

Ipak SMTP accepted → DB mark sent crash prozor može ponoviti poruku pri retryu. Cursor se pomjera i failed recipient se broji, ali se ne retrya unutar istog runa; transient greška trajno preskače korisnika. Ako channel trenutno nije dostupan, svi otvoreni runovi se terminalno završavaju kao disabled, bez operator retry odluke. Potrebna je eksplicitna at-least-once politika, retryable recipient state i reconciliation.

Teams `teamsPostedAt` se postavlja prije webhook poziva. Ako webhook padne, `teamsResult=FAILED`, ali due query više nikad ne bira zapis; transient failure je terminalan. Obrnuti crash nakon webhook successa prije result updatea ostavlja `teamsPostedAt` postavljen i rezultat null, bez reconciliationa. Koristiti outbox/delivery attempt sa retry/backoffom i provider idempotency gdje je moguće.

## 8. Scheduler i recovery

Sweep je bounded na 20 due announcements; processor ima concurrency 1, lock timeout, attempts/backoff i metriku. Derived SCHEDULED/ENDED status izbjegava stale status job.

Repeat scheduler se registruje samo na module init. Redis flush nakon boota može ukloniti scheduler bez self-heala. Dok scheduler ne radi, start notification, e-mail, Teams i receipt retention staju. Nakon povratka, najava koja je već završila više nije due, pa se njena planirana distribucija trajno gubi. Potreban je periodic scheduler reconcile/health, oldest-due alarm i eksplicitna politika missed announcements.

## 9. Report, privacy i retention

Report prikazuje publish audience size, current audience, acknowledgement count, unit agregate, pending subset i zadnjih 20 e-mail runova. CSV neutralizuje spreadsheet formule i export se auditira.

W6.47 zatvorio je BA-04: audience i acknowledged-by-unit su DB `groupBy` agregati, a acknowledgement/pending totali su DB `count`. Pending identiteti dolaze u jednoj announcement-bound ID-keyset stranici do 200 redova bez e-maila. CSV se streama kroz keyset batcheve do 500 uz hard limit 50.000 redova i preflight `413` prije recipient PII čitanja; scoped `requireReport()` ostaje prije agregata i exporta.

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
| BA-announcements-01 | P1       | Scoped manage/report permission postaje globalna i omogućava cross-OU mutation/PII export  | zatvoreno (W6.44) |
| BA-announcements-02 | P1       | Active/archive cap se primjenjuje prije audience filtera i može sakriti kritičnu najavu     | zatvoreno (W6.45) |
| BA-announcements-03 | P1       | In-app/reminder fan-out terminalno odsijeca publiku nakon 20.000 korisnika                  | zatvoreno (W6.46) |
| BA-announcements-04 | P1       | Report/CSV neograničeno učitava current audience, e-mailove i acknowledgement redove        | zatvoreno (W6.47) |
| BA-announcements-05 | P2       | Agent scope ne validira group/service reference prema vlastitom OU podstablu (validacija referenci + options bez servisa za scoped aktore, paket 198) | zatvoreno |
| BA-announcements-06 | P2       | Mutation nema version/CAS; draft/published/lifecycle race može pregaziti stanje (If-Match version CAS za update/publish/withdraw/delete, paket 199) | zatvoreno |
| BA-announcements-07 | P2       | Published revision ne čuva severity/display/end/service/channel promjene (full snapshot + migracija 20271031220000, paket 200) | zatvoreno |
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

- **01:** resource-aware authorization service za manage/report — zatvoreno u W6.44.
- **02:** role/OU/group audience predicate se primjenjuje u PostgreSQL prije active/archive capa; active severity ordering je također prije capa — zatvoreno u W6.45. **14** (manage-list cap) i **18** (archive/manage/pending cursor/hasMore) ostaju odvojeni; active/archive sada imaju ID tie-break. **05** ostaje otvoren za OU/group/service relacijsku validaciju.
- **03:** W6.46 zamijenio je ukupni 20.000 cap sa 1.000-članim keyset stranicama za publish/reminder i odgodio completion/reminder markere do završetka svih stranica. `BA-announcements-08` ostaje otvoren za durable run/outbox, queue recovery i puni retry/reconcile ugovor.
- **04:** W6.47 zatvoren uz DB agregate, jednu announcement-bound pending stranicu do 200 identiteta i CSV streaming kroz batcheve do 500 uz hard limit od 50.000 redova; BA-12 vremenska konzistentnost ostaje zasebna.
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

Ponderisani zbir je 4,310, odnosno **4,31/10** na izvornom baselineu prije implementacija. Četiri baseline P1 nalaza tada su ograničavala maksimum na 7,49; `BA-announcements-01`–`04` zatvoreni su u W6.44–W6.47. Nova agregatna ocjena nije izračunata.

## 15. Fazni plan

### Faza 0 — safety net

Scoped permission cross-OU; 100 foreign + one critical own; 20.001 recipient; million-row report; concurrent update/withdraw; queue failure; SMTP accepted-crash; Teams 500; Redis flush; membership change.

### Faza 1 — authorization i bounded reads

W6.47 je isporučio DB report agregate i paginated pending/streaming CSV za BA-04. Preostali scope ove faze — group/service scope validation i audience-pushed liste — ostaje otvoren.

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
11. `BA-announcements-01` (W6.44) zatvoren je: manage/report authorization je per-permission i per-audience OU; unfiltered audience traži globalni grant; cross-OU create/report/CSV se odbijaju prije mutation/PII query.
12. `BA-announcements-02` (W6.45) zatvoren je: audience predicate je u active/archive DB queryju prije postojećih capa, uz severity ranking prije active capa i regresiju koja dokazuje da foreign redovi ne sakriju vidljive najave.
13. `BA-announcements-03` (W6.46) zatvoren je: publish/reminder obrađuju cijelu matching publiku kroz keyset stranice od 1.000 bez ukupnog capa, a completion/reminder markeri se zapisuju tek nakon završetka fan-outa.
14. `BA-announcements-04` (W6.47) zatvoren je: report koristi DB agregate, pending identiteti su ograničeni na jednu stranicu do 200, a CSV koristi batcheve do 500 i hard budžet 50.000; publish-time membership snapshot nije uveden.

Modul ima dobru funkcionalnu osnovu, transakcijski audit i promišljen e-mail batching. Izvorni ponderisani baseline prije implementacija je **4,31/10**; W6.44–W6.47 zatvorili su četiri baseline P1 nalaza, uključujući scoped authorization, pre-visibility cap, fan-out truncation i report/CSV resource budget. P2/P3 rizici — naročito publish-time report konzistentnost `BA-announcements-12` — i dalje sprečavaju enterprise ocjenu. Nova agregatna ocjena nije dodijeljena.

## 17. W6.44 closeout — BA-announcements-01

`BA-announcements-01` zatvoren je na finding nivou nakon što scoped manage/report grantovi više ne postaju globalni.

- `AnnouncementViewer` izvodi odvojeni `manageScope` i `reportScope` iz canonical assignments. Globalni bypass zahtijeva globalnu assignment/resource odluku ili lokalni `SUPER_ADMIN`; service-only grant se fail-closed, jer `Service` nema OU relaciju kojom bi se audience membership ograničio.
- List, detail, create/update, publish/withdraw/delete, preview, report, CSV i reminder authorization provjeravaju announcement publiku. Za scoped grant svaki OU u višestrukom audience filteru mora biti dozvoljen kroz `AuthorizationService.authorizeResource`; audience bez OU filtera se odbija. Create/update validiraju novu publiku prije transakcije, a list ograniči redove prije acknowledgement counta. Report/CSV se odbija prije queryja za identitete/e-mailove i acknowledgemente izvan dozvoljenog scopea.
- Agent-only postavka ostaje zaseban home-OU fallback. Editor OU/grupe su filtrirani po dodijeljenim OU scopeovima; P2 `BA-announcements-05` (group/service reference relacijska validacija) i P2/P3 nisu mijenjani.
- Dodani su scope-derivation, canonical mismatch, service-only, SuperAdmin-local, svaki-OU i resource authorization testovi, te service regresije za cross-OU create/list, odvojeni report grant, global audience denial i CSV PII-query denial.

Lokalno je prošlo targeted ESLint i **5/5 Jest suitea, 36/36 testova** (announcement audience/delivery i tri nova authorization suites). Zbog nedostajućeg lokalnog generated Prisma clienta, lokalni Jest je pokrenut kroz privremeni ts-jest `diagnostics:false` config; Prisma Client generacija lokalno nije mogla preuzeti schema engine sa `binaries.prisma.sh`. Push-triggered CI [`42527240382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42527240382) na kodnom SHA [`90fc15c`](https://github.com/mudzy992/help-desk-enterprise/commit/90fc15c655bba90fc8f69ca17f2dc76c6bf67819) je **success**, uključujući pravi generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain posao i CI gate. Read-only inventory, E2E critical/install i conditional high/critical image enforcement bili su `skipped`, ne `passed`; nisu pokretani ručno.

Nema schema izmjene ni migracije, target baza nije korištena; nema PR-a, mergea ili deploymenta. Nakon W6.44 Val 6 je **48/109 zatvorenih, 61 otvorenih (3 P1 / 41 P2 / 17 P3)**; izvorni auditi/generisani plan **513/179**, globalni registar **523/169**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 su `BA-announcements-02/03/04`; P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending i izvan ovog closeouta.

## 18. W6.45 closeout — BA-announcements-02

`BA-announcements-02` zatvoren je na finding nivou nakon audience pushdowna u active/archive PostgreSQL upite prije postojećih viewer capa.

- `audienceWhereForViewer` učitava home OU path i tačne ancestor OU ID-eve; sastavlja AND između role, OU i group dimenzija. Svaka neprazna dimenzija dopušta samo prazan/globalni audience filter ili `hasSome` viewer vrijednosti. Nedostajući viewer scope ne poklapa nijedan neprazan filter, pa se ponašanje zatvara fail-closed.
- Active upit primjenjuje audience prije `take: 50` i sortira po severity descending, `startsAt` descending i ID ascending prije capa. Archive upit primjenjuje isti audience prije `take: 100`, uz nepromijenjene status/time-window uslove. Postojeći acknowledgement/dismissal uslovi active liste ostaju netaknuti; archive zadržava ranije ponašanje da u 90-dnevnom prozoru može sadržavati i trenutno aktivne najave.
- Dodani su unit testovi za role/OU ancestry/group predicate, capove i nedostajući scope; PostgreSQL regresija stvara više od 50 foreign active rows i više od 100 foreign archive rows te provjerava da kritična, matching najava ne nestane. Spec je registrovan u isolated integration runneru uz eksplicitan registry guard.
- Lokalno su prošli targeted ESLint, `git diff --check`, runner guard **20/20** i fokusirani Jest **2/2 suitea, 13/13 testova**. Pošto lokalni generated Prisma Client nije bio dostupan, fokusirani Jest je koristio privremeni ts-jest `diagnostics:false` config; to nije lokalni generated-Prisma type-check. Finalni push-triggered CI [`42531561241`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42531561241) na SHA [`94a7fd9`](https://github.com/mudzy992/help-desk-enterprise/commit/94a7fd9de25ea7882190959ad9e6eadde98785c6) je **success**: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration (uključujući BA-02 cap regresiju), frontend build/test, Docs guard, container/supply-chain job i CI gate su prošli. Read-only inventory, E2E install/critical i conditional high/critical image enforcement bili su `skipped`, ne passed; full E2E nije pokretan ručno.
- Odvojeni automatski Perf smoke [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320), pokrenut na početnom kodnom SHA `60b16dd`, zabilježio je globalni query-budget rezultat **2.123 > 2.1** (50.847 zahtjeva, p95 3, max 34). Run ne atribuiše odstupanje BA-02; threshold nije mijenjan, a taj Perf workflow nije ponovljen nakon kasnijih test-only korekcija. Ovo nije prijavljeno kao zelen Perf gate niti kao BA-02 uzročni rezultat.
- Prva dva push CI pokušaja otkrila su nevažeći arhivski testni vremenski raspon i preusko očekivanje da archive isključuje aktivne najave; oba su ispravljena u testnim fixture/assertionima, a finalni CI gore je prošao.

Nema schema izmjene ni migracije, target baza nije korištena; nema PR-a, mergea ili deploymenta. Nakon W6.45 Val 6 je **49/109 zatvorenih, 60 otvorenih (2 P1 / 41 P2 / 17 P3)**; izvorni auditi/generisani plan **512/180**, globalni registar **522/170**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 su `BA-announcements-03/04`; P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending i izvan ovog closeouta.

## 19. W6.46 closeout — BA-announcements-03

`BA-announcements-03` zatvoren je na finding nivou nakon uklanjanja ukupnog limita od 20.000 korisnika iz in-app publish i reminder fan-outa.

- `notifyMaxRecipients` zamijenjen je `notifyBatchSize: 1_000`; vrijednost je memorijski/query page bound, ne cap ukupne publike. `fanOutAudienceInPages()` učitava samo ID-jeve, sortira stabilno po ID-u i nastavlja sa `id > cursor`; `notifyStarted()` i `remind()` obrađuju stranice dok ih ne ponestane. Reminder zadržava audience predicate i `announcementAcknowledgements: { none: { announcementId } }` filter.
- `audienceNotifiedAt` i `lastReminderAt` više se ne postavljaju prije fan-outa: completion/reminder marker se claimuje tek nakon prolaska svih stranica. Propagirana query/page greška ostavlja marker neclaimovanim, tako da sweep odnosno reminder može pokušati ponovo; postojeći per-recipient dedupe sprečava duplu in-app stavku za već obrađene korisnike. Pojedinačni notification-persist kvarovi i dalje se loguju i ne prekidaju traversal; durable recipient retry, email-run/outbox atomarnost i recovery ostaju izvan P1 closeouta, uključujući P2 `BA-announcements-08`.
- `announcement-fanout.spec.ts` dodaje regresije za kompletnu publiku od **20.005** korisnika kroz bounded keyset stranice, publish marker nakon page failure, reminder interval nakon page failure i eligible reminder publiku kroz više stranica uz acknowledgement filter.
- Lokalno su prošli targeted ESLint, `git diff --check` i fokusirani Jest **4 suitea / 23 testa** uz privremeni ts-jest `diagnostics:false` config, jer generated Prisma Client nije prisutan u workspaceu. Prvi CI [`42534858528`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42534858528) na SHA `007dd55` otkrio je `TS7022` implicit-any inference na recipient query resultu; explicit `{ readonly id: string }[]` tip je dodan u follow-up kodni commit [`aa03659`](https://github.com/mudzy992/help-desk-enterprise/commit/aa036595f9ec15bcf1389b98cd48a3d023b1a42f). Finalni CI [`42535212761`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42535212761) na tom SHA-u je **success**: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration (uključujući deployment-wide connection budget), frontend build/test, Docs guard, production-image build/supply-chain i CI gate prošli su. E2E install/critical, read-only inventory i conditional high/critical image enforcement bili su `skipped`, ne passed; E2E nije ručno pokretan.
- Perf smoke nije pokrenut na W6.46 SHA. Posljednji dostupan Perf [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320) ostaje **failed** na globalnom query budgetu `2.123 > 2.1`, bez BA-03 uzročne atribucije; prag nije mijenjan i Perf nije označen zelenim.

Nema schema izmjene ni migracije; target baza nije korištena. Nema PR-a, mergea ili deploymenta. Nakon W6.46 Val 6 je **50/109 zatvorenih, 59 otvorenih (1 P1 / 41 P2 / 17 P3)**; izvorni auditi/generisani plan **511/181**, globalni registar **521/171**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 je `BA-announcements-04`; `BA-announcements-08` i ostali P2/P3, kao i BA-15 full critical-flow acceptance, ostaju otvoreni/pending i izvan ovog closeouta.

## 20. W6.47 closeout — BA-announcements-04

`BA-announcements-04` zatvoren je na finding nivou nakon DB agregata, ograničene pending stranice i bounded CSV streama. `report()` više ne učitava cijelu publiku ili sve acknowledgement redove u memoriju. `GET /announcements/manage/:id/report/pending` vraća do 200 identiteta uz announcement-bound ID keyset cursor; frontend čuva samo trenutnu stranicu i podržava prethodnu/narednu navigaciju. CSV koristi `StreamableFile`, stabilni ID keyset i batcheve do 500; preflight odbija trenutnu publiku veću od 50.000 prije recipient PII čitanja, a runtime provjera održava hard row budget. BOM, formula-injection zaštita, scoped authorization i audit metadata `{ rows }` su sačuvani.

Lokalno su prošli backend targeted Jest **12/12** uz diagnostics-off, targeted ESLint, frontend report-dialog Vitest **3/3**, ESLint, TypeScript build, i18n parity (**8.964 ključa**), Prettier i production build. Backend wiring check/test je passed uz manifest od 620 ruta. Lokalni generated Prisma client nije dostupan jer sandbox nije mogao preuzeti `schema-engine`; CI generacija i build su zato glavni backend type-check dokaz. Prvi CI [`42577851947`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42577851947) otkrio je stale wiring manifest; nakon osvježenja manifest-a CI [`42578594999`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42578594999) otkrio je literal `500`/`number` TS2322. `requestedTake` je eksplicitno tipiziran kao `number`. Finalni CI [`42579038875`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42579038875) na kodnom/testanom SHA [`598cdc7`](https://github.com/mudzy992/help-desk-enterprise/commit/598cdc797ee6bc287ac5141305e38c3d627687fe) je **success** za generated-Prisma backend build/lint/full test, PostgreSQL+Redis integration, production-image/supply-chain posao, frontend build/test, Docs guard i CI gate. E2E critical/install i read-only inventory su `skipped`; conditional high/critical enforcement je `skipped`, ne passed.

Perf nije pokrenut na W6.47 SHA-u. Posljednji raspoloživi Perf [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320) ostaje **failed** `2.123 > 2.1`, bez BA-04 uzročne atribucije i bez izmjene praga. Nema schema izmjene ni migracije, target baza nije korištena, nema PR-a, mergea ili deploymenta. Nakon W6.47 Val 6 je **51/109 zatvorenih, 58 otvorenih (0 P1 / 41 P2 / 17 P3)**; source audit/plan **510/182**, globalni registar **520/172**. Deset ranijih statusnih razlika ostaje netaknuto. P2 `BA-announcements-12` i P3 `BA-announcements-18`, ostali P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending i izvan ovog P1 closeouta.

## 21. Closeout — BA-announcements-05 (2026-10-29)

`BA-announcements-05` (P2) zatvoren je operativnom potvrdom vlasnika nakon implementacije iz paketa [198](../implementation/198-announcements-05-reference-scope-validation.md). Scoped manager/agent pri create/update više ne može referencirati grupu čiji OU nije unutar njegovog manage scopea ili home podstabla, ne može referencirati nijedan servis (fail-closed, bez OU sidra), a editor opcije scoped aktoru ne nude servise; globalni scope je nepromijenjen. Kodni commit `9f0c144` s novim `announcements.references.spec.ts` (4 testa; lokalno announcements suite 9 suiteova / 56 testova) prošao je CI [`42990837191`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42990837191) (**success**, finalni SHA `498cd55` uključuje i ispravak zastarjelog guard testa za BA-inbound-email-04): generated-Prisma backend build/lint/full test, PostgreSQL+Redis integration, frontend, Docs guard, container/supply-chain i CI gate. Vlasnik je potvrdio: A1 (globalni admin i dalje vidi servise u editoru) = DA, A2 (scoped nalog: samo „Bez usluge", grupe samo iz vlastitog OU) = DA. Nema migracije, PR-a ni mergea; deployment je radio korisnik. Zajedno sa zatvaranjem BA-websocket-06–11 Val 6 je **86/110 zatvorenih, 24 otvorena (0 P1 / 10 P2 / 14 P3)**; source/plan **476/217**, globalni registar **486/207**.

## 22. Closeout — BA-announcements-06 (2026-10-29)

`BA-announcements-06` (P2) zatvoren je operativnom potvrdom vlasnika nakon implementacije iz paketa [199](../implementation/199-announcements-06-version-cas.md). Sve mutacije (update/publish/withdraw/delete) zahtijevaju `If-Match: "v<version>"`, pišu kroz version (i status) predikat i inkrementiraju verziju; gubitnik trke dobija `ANNOUNCEMENT_VERSION_CONFLICT` (409). Kodni commit `77d86bc` prošao je CI [`43004333959`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43004333959) (**success**: generated-Prisma backend build/lint/full test, PostgreSQL+Redis integration, frontend, Docs guard, container/supply-chain, CI gate); novi `announcements.concurrency.spec.ts` ima 5 testova. Vlasnik je potvrdio: C1 (objava/povlačenje/brisanje rade kao prije) = DA, C2 (drugi tab pri spremanju dobija poruku o izmjeni u međuvremenu i njegova izmjena se ne primjenjuje) = DA, C3 (vidljiva samo izmjena prvog taba) = DA. Na vlasnikovu primjedbu da se poruka u dugoj formi lako previdi, editor sada istu grešku prikazuje i kao **toast** (uz postojeći inline alert); pokriveno novim testom u `announcement-editor-dialog.spec.tsx`. Nema migracije, PR-a ni mergea; deployment je radio korisnik. Val 6 je **87/110 zatvorenih, 23 otvorena (0 P1 / 9 P2 / 14 P3)**; source/plan **475/218**, globalni registar **485/208**.

## 23. Closeout — BA-announcements-07 (2026-10-29)

`BA-announcements-07` (P2) zatvoren je operativnom potvrdom vlasnika nakon implementacije iz paketa [200](../implementation/200-announcements-07-full-revision-snapshot.md). Odobrena migracija `20271031220000_announcement_revision_full_snapshot` dodaje nullable snapshot kolone u `AnnouncementRevision`; svaka izmjena objavljene najave (tekst, težina, prikaz, raspored, servis, kanali) sada ostavlja kompletan zapis prethodnog stanja, a `detail()` snapshot izlaže kroz API. Kodni commit `3df2acd` prošao je CI [`43010898018`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43010898018) (**success**: generated-Prisma backend build/lint/full test, PostgreSQL+Redis integration s primjenom migracije na disposable bazi, frontend, Docs guard, container/supply-chain, CI gate). Vlasnik je potvrdio: D1 (redeploy s migracijom i uredno pokretanje) = DA, D2 (izrazena izmjena samo težine objavljene najave spremljena kao i prije) = DA, D3 (historija revizija nije UI-vidljiva) = N/A, pokriveno testovima i CI-jem. Deployment i primjenu migracije na ciljnoj instalaciji radio je korisnik svojim redeployom. Val 6 je **88/110 zatvorenih, 22 otvorena (0 P1 / 8 P2 / 14 P3)**; source/plan **474/219**, globalni registar **484/209**.
