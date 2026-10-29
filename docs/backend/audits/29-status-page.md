# Backend audit 29 — `status-page`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,11/10**  
**Nalazi:** 5 P1, 10 P2, 4 P3

## 1. Executive summary

`status-page` pokriva prijavljenu i opcionu javnu status stranicu, service availability/uptime, incident CRUD i timeline, ALL_USERS/STAFF_ONLY vidljivost, povezivanje tiketa, subscription i in-app obavijesti. Pozitivna osnova je značajna: public je default-off i fail-closed, javni response se eksplicitno sanitizuje, DTO ugovori su strogi, core create/update/link/audit operacije su transakcijske, status transition ima guarded CAS, ticket link koristi centralni ticket access, uptime spaja preklopljene outage intervale i javni endpoint ima cache/rate limit.

Baseline je **4,11/10**. Pet P1 nalaza pogađaju scope, disclosure, availability i delivery pouzdanost. Bilo koji AGENT/ADMIN assignment čini actora globalnim staff viewerom, a bilo koji `status.incidents.manage` assignment daje globalnu mutation moć bez OU/service scopea. Incident koji je nakon subscribea promijenjen iz ALL_USERS u STAFF_ONLY i dalje pri resolutionu šalje naslov i update starom non-staff subscriberu. Start notification terminalno odsijeca primatelje nakon 2.000 bez durable cursor/backloga. Resolution učitava neograničen skup subscribers/requesters, sinhrono fan-outa u API requestu, a zatim označava sve subscriptione notified čak i kada je pojedinačni notification write pao. Read put za do 300 incidenata učitava sve timeline updateove bez per-incident limita, a uptime query učitava sve DOWN spanove u prozoru.

Dodatni rizici su link/unlink incidenta bez incident-manage ili incident-visibility provjere, lifecycle edit bez opšteg version/CAS-a, unbounded service/window površina, public IP limiter/proxy trust, process-local cache, odsustvo incident retentiona i compile-blokirana većina suiteova. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 9 produkcijskih TypeScript fajlova;
- 5 direktnih specova;
- 1.313 aktuelnih produkcijskih LOC;
- 2 controllera i 3 injectable servisa/komponente;
- Prisma: `ServiceIncident`, incident-service/update/subscription i ticket-incident link; koristi i `ServiceDowntimeWindow`;
- integracije: principal/RBAC, service catalog availability, tickets/access policy/events, notifications/preferences, audit-log, settings, Redis i privacy actor;
- primarni E2E dokaz: 21; reference 22/56.

Registarskih 1.322 LOC korigovano je na 1.313, a injectable inventar sa 2 na 3.

## 3. Authorization i visibility

Signed-in čitanje je otvoreno svim korisnicima; requester vidi samo ALL_USERS, dok staff vidi i STAFF_ONLY, autore updateova i counters. Mutation controller traži `status.incidents.manage`; ticket link/unlink umjesto toga traži staff pristup konkretnom tiketu. Public endpoint postoji samo kada su enabled+public uključeni.

`statusViewerFromContext` ipak globalizuje role i permission assignment. Bilo koji AGENT ili ADMIN roleKey iz bilo kojeg OU/service assignmenta daje `isStaff=true` za sve STAFF_ONLY incidente u sistemu. Bilo koji assignment sa `status.incidents.manage` daje `canManage=true`, a controller `RoleGuard` također nema incident/service resource locator. Scoped operator zato može čitati autor imena/counters i uređivati incidente foreign servisa. Potrebna je resource-aware odluka prema svim incident serviceovima, sa eksplicitnim global modeom samo za global assignment/SUPER_ADMIN.

Service ID validacija provjerava samo existence, ne actorov service/OU scope. Create/edit može vezati do 50 foreign serviceova. `openForService` je dostupan svakom signed-in korisniku za proizvoljan service ID, što je prihvatljivo samo ako je katalog globalan; politika nije eksplicitna.

## 4. STAFF_ONLY i subscription lifecycle

Subscribe pravilno odbija STAFF_ONLY incident non-staff vieweru. Međutim edit dopušta promjenu visibilityja ALL_USERS → STAFF_ONLY bez uklanjanja/revalidacije postojećih non-staff subscriptiona. `notifyResolved` uvijek uključuje sve pending subscribers, bez provjere aktuelne visibility/role eligibility. Bivši requester zato dobija naslov i resolution message internog incidenta. Ovo je direktan cross-classification disclosure.

Pri visibility sužavanju treba transakcijski revokeati ili označiti neeligible subscriptione; pri svakoj isporuci ponovo provjeriti principal eligibility. Subscription model treba reason/status, a ne samo `notifiedAt`.

`unlinkTicket` i posebno `linkTicket` ne provjeravaju da actor smije vidjeti/manageati incident. Dovoljno je da ima staff access nad svojim ticketom i zna incident ID. Može povezati STAFF_ONLY/foreign-service incident, povećati counter i upisati incident title u ticket system event. Iako status-page requester panel filtrira STAFF_ONLY, ticket event potrošači mogu proširiti disclosure. Incident i ticket authorization moraju oba proći prije cross-domain linka.

## 5. Incident lifecycle i concurrency

Create atomarno upisuje incident, prvi update, service veze, ticket link/event i audit. Add-update u transakciji čita status, provjerava forward-only transition i radi `updateMany(id,status)` CAS; paralelno resolve tako daje jedan pobjednički transition. Link/unlink, ticket event i audit su također transakcijski.

Edit ipak radi read-check pa obični `update(id)` bez versiona/status predicatea. Paralelni edit može pregaziti title/impact/visibility/services; edit i resolve race može izmijeniti već resolved incident jer status check nije u write predicateu. Link radi pre-read status check, ali create nema status predicate, pa paralelni resolve može ostaviti novi link na resolved incidentu. Model nema `version`, a timeline/revision ne bilježi editovani prije/poslije sadržaj.

`startedAt` dopušta neograničeno backdating. To mijenja uptime historiju izvan uobičajenog operativnog prozora bez posebne permission/approval kontrole. Potrebni su version/If-Match, write predicates i odobrena backdate granica/audit metadata.

## 6. Read model, uptime i resource granice

Incident broj je capped: 100 open, 200 history, 20 po service/ticket. Međutim svaki incident nested-selectom učitava sve timeline updateove. Jedan incident može imati neograničen broj same-status updateova; status page može zato materijalizovati ogroman response i DB rezultat. Potreban je latest-N timeline + cursor/detail endpoint.

Service list, planned downtime windows i uptime spans nisu capped/paginirani. Uptime query učitava svaki DOWN incident-service span za cijeli history period i sve servise, pa računa u Node procesu. Velik katalog ili incident historija povećava response, memoriju i CPU. Prebaciti union-duration agregaciju u SQL/materialized daily metrics, a catalog response verzionisati/paginirati ili formalno budžetirati.

Open/history `orderBy startedAt` nema `id` tie-breaker niti `hasMore`, pa cap daje nestabilnu i neindikovanu truncation semantiku. Public response nasljeđuje iste limite.

## 7. Notification delivery

Start notification traži requestere otvorenih tiketa na pogođenim servisima, distinct i aktivne, ali uzima samo prvih 2.000 bez ordera/cursora. Incident nema notification-run marker niti backlog, pa ostatak publike nikada ne dobija obavijest. Fan-out je sekvencijalan u create API requestu.

Resolution učitava sve pending subscribers i sve linked requestere bez limita, zatim sekvencijalno piše notificatione u requestu. To je neograničen latency/availability rizik. Nakon fan-outa `updateMany` označava sve subscriptione `notifiedAt=now`, čak i one čiji je `persistInAppNotification` bacio grešku; greška se samo loguje. Takvi korisnici se više ne mogu retryati. Ako mark update padne, dedupe štiti duplikat, ali subscription ostaje pending bez worker reconciliationa.

Potrebna je durable delivery-run/outbox tabela, recipient cursor/state, bounded worker batches, per-recipient terminal status i API koji samo commit-a resolution/outbox.

## 8. Public endpoint, cache i rate limit

Public je default-off; configuration read fallback nikada ne uključuje public. Controller prije cachea ponovo provjerava enabled/public. `toPublicStatusPage` dodatno uklanja STAFF_ONLY, author names, counters i subscribed stanje, što je dobar defense-in-depth. Rate limit je 60/IP/min kroz Redis sa fail-closed ponašanjem (Redis greška → 429, ne propust); bez Redisa postoji bounded memory fallback. IP se izravlja trust-proxy-aware: kada Express `trust proxy` je podešen, koristi se verifikovani `request.ip`, inače connection `remoteAddress`.

Javni odgovor koristi shared Redis cache sa verzijom ključa (`status:public:cache:version`). Svaka incident mutacija (create/edit/resolve/link/unlink) inkrementira verziju, što sve instance invalidira odmah umesto čekanja 30s TTL. Cache degrades na per-process recompute kada Redis nije dostupan.

Javni response objavljuje service IDs/names, planned downtime message i ALL_USERS timeline. To je namjerna funkcija, ali content authoring treba upozorenje/classification i test da ticket IDs, interni linkovi ili tajne ne ulaze u slobodni tekst.

## 9. Ticket integracija i audit

Create može vezati najviše 100 tiketa. Svaki ticket se autorizuje unutar iste transakcije koja zaključava incident i upisuje link: `assertStaffTickets` izvrši jedinstvenu deterministic `FOR SHARE` stavku nad svim traženim ticket redovima, verifikuje da svi postoje (inače 404 bez commitovanja), koristi jednu policy snapshot i zahteva `staff` visibility za svaki ticket. Link/unlink koriste isti batch pristup nakon incident locka. System event i audit su u istoj transakciji sa relacijom. Ovo je jaka integracijska osnova; W6.11 zatvara N+1 pre-check race prozor iz `BA-status-page-12`. Resolve transakcija više ne iterira sve linkove niti piše event po tiketu — W6.10 upisuje poseban durable ticket-event outbox intent koji worker keyset-paginira po 250 sa per-ticket idempotency ključem.

Audit ne zapisuje free text, što smanjuje PII replike. Ipak nema edit revisiona, pa audit `changed` + from/to samo za impact/visibility nije dovoljan za rekonstrukciju service/title promjene.

## 10. Privacy i retention

Model čuva slobodni title/message, authorUserId, subscriber userId, linkedByUserId i ticket relacije. User cascade čisti subscription, dok author/link actor postaje implicitno problematičan jer nema deklarisan FK u prikazanom modelu. Nije pronađen status-incident retention/anonymization flow. History endpoint prikazuje samo konfigurisan period, ali DB čuva incidente/updateove/linkove/subscriptions neograničeno.

Potrebna je matrica za incident content, author identity, subscription/delivery state, ticket system event i audit. Legal hold, incident deletion/tombstone, user anonymization i public content takedown nisu formalizovani.

## 11. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/status-page -name '*.spec.ts' -print | sort)
```

Rezultat: **2/5 suiteova prošla, 3/5 compile-blocked; 9/9 izvršenih testova prošlo**. Zeleni su pure model i viewer testovi. Public controller, incident service i integration suite blokirani su nedostajućim `generated/prisma/client` i nepotpunim `PrismaService` delegatima/`$transaction`. Nije zabilježen assertion failure.

E2E 21 pokriva incident create, start notification, signed-in status/banner, resolve preview/update, requester resolution notification i USER manage deny. Ne pokriva scoped staff/manage, visibility downgrade subscriber, foreign incident linking, >2k start recipients, notification failure, unbounded timeline/links, public cache/rate/proxy, concurrency ni retention.

## 12. Pozitivni nalazi

1. Public default-off i fail-closed configuration.
2. Defense-in-depth public response sanitizer.
3. Strict DTO, bounded service/create-ticket input.
4. Requester ne vidi STAFF_ONLY u standardnim readovima.
5. Core create/link/update-event + audit transakcije.
6. Forward-only status machine i guarded transition CAS.
7. Ticket link koristi centralni ticket access.
8. Acknowledge-style subscription upsert je idempotentan.
9. Availability uzima worst od baseline/window/incidenta.
10. Uptime merge sprječava dvostruko brojanje overlap outagea.
11. Notification preference policy i dedupe keys.
12. Public cache i Redis/memory rate limit.
13. Audit izbjegava kopiranje title/message PII teksta.
14. Svih 9 izvršenih testova je zeleno.

## 13. Registar nalaza

| ID                | Severity | Nalaz                                                                                          | Status   |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------- | -------- |
| BA-status-page-01 | P1       | Scoped AGENT/ADMIN role globalno otkriva STAFF_ONLY incidente, autore i counters               | zatvoreno |
| BA-status-page-02 | P1       | Scoped manage permission postaje globalna mutation dozvola nad svim service incidentima       | zatvoreno |
| BA-status-page-03 | P1       | ALL_USERS→STAFF_ONLY ne revokea subscribera; resolution mu otkriva interni title/message       | zatvoreno |
| BA-status-page-04 | P1       | Start notification terminalno odsijeca primatelje nakon 2.000 bez cursora/backloga             | zatvoreno |
| BA-status-page-05 | P1       | Resolution fan-out je unbounded i sve subscriptione označi notified i nakon pojedinačnog pada | zatvoreno |
| BA-status-page-06 | P2       | Incident timeline nested read nema limit; do 300 incidenata može učitati sve updateove         | zatvoreno |
| BA-status-page-07 | P2       | Link/unlink ne provjerava incident visibility/manage scope, samo ticket staff access            | zatvoreno |
| BA-status-page-08 | P2       | Edit/link lifecycle nema opšti version/CAS i može raceati sa resolveom                          | zatvoreno |
| BA-status-page-09 | P2       | Service IDs se validiraju samo po existenceu, bez actor OU/service scopea                       | zatvoreno |
| BA-status-page-10 | P2       | Uptime spans, active services i downtime windows su neograničeno učitani                        | zatvoreno |
| BA-status-page-11 | P2       | Resolve transakcija piše event za neograničen broj naknadno linkanih tiketa                     | zatvoreno |
| BA-status-page-12 | P2       | Ticket authorization je N+1 pre-check izvan transakcije i može zastarjeti prije link writea     | zatvoreno |
| BA-status-page-13 | P2       | Public rate limit zavisi od trust-proxy/IP ispravnosti i fail-open je pri Redis grešci          | zatvoreno |
| BA-status-page-14 | P2       | Process-local public cache nema mutation invalidation ni multi-instance koherenciju             | zatvoreno |
| BA-status-page-15 | P2       | Incident/update/link/subscription retention i anonymization nisu formalizovani                  | otvoreno |
| BA-status-page-16 | P3       | Open/history capped liste nemaju cursor/hasMore ni stabilan ID tie-breaker                      | otvoreno |
| BA-status-page-17 | P3       | Edit audit/revision ne omogućava rekonstrukciju title/service promjena                          | otvoreno |
| BA-status-page-18 | P3       | Neograničeno backdating incidenta mijenja uptime historiju bez posebne kontrole                 | otvoreno |
| BA-status-page-19 | P3       | Tri od pet suiteova su compile-blockirana; failure/concurrency/large-volume matrica nedostaje   | otvoreno |

### W6.5 closeout — `BA-status-page-05`

Resolution više ne fan-outa notificatione u API requestu: ista transakcija koja postavlja `RESOLVED`, zapisuje update, ticket evente i audit sada upisuje deduplicirani `status.incident.resolution` outbox intent. Postojeći worker u stranicama od 250 keyset-paginira pending subscriptione i, samo za `ALL_USERS`, aktivne povezane requestere; actor se terminalno preskače, a requester notification ima deterministički per-recipient dedupe. Subscription dobija `notifiedAt` tek poslije uspješnog persistencea ili actor-self terminalnog skipa. Recipient exception ostavlja taj i sve neobrađene redove pending i obara outbox pokušaj radi retryja. `notifyOnResolve=false` ostaje silent bez recipient-notification intenta; W6.10 zasebno durabilizira obavezne ticket lifecycle evente. Direktni failure test, stvarni PostgreSQL outbox/worker scenario i kompletni CI `40770312995` su zeleni; dokaz je [78-status-page-durable-resolution-delivery.md](../implementation/78-status-page-durable-resolution-delivery.md). Paket nema novu DB migraciju.

### W6.6 closeout — `BA-status-page-06`

Overview, service, ticket i detail readovi sada ugrađuju najviše 20 najnovijih timeline updateova i jedan probe red, uz `updatesHasMore` i `updatesNextCursor`. Novi autentificirani timeline endpoint primjenjuje isti incident visibility policy, validira `take` do 100 i vraća stabilne `createdAt DESC, id DESC` keyset stranice sa `hasMore`/`nextCursor` ugovorom; author lookup je ograničen na trenutnu stranicu, a public/requester redakcija je očuvana. Unit dokaz i stvarni PostgreSQL scenario sa 25 updateova i stranicama 10 + 10 + 5 prošli su u finalnom CI-ju `40773764675`; dokaz je [79-status-page-bounded-timeline-reads.md](../implementation/79-status-page-bounded-timeline-reads.md). Paket nema novu DB migraciju.

### W6.7 closeout — `BA-status-page-07`

Link i unlink sada zahtijevaju dvije nezavisne resource odluke: actor mora imati `status.incidents.manage` nad svakim servisom incidenta i staff pristup ticketu. Incident scope provjera se izvršava prva i foreign incident prikriva 404 granicom prije ticket authorizationa, title read-a, relation write-a, audita ili system eventa. Unit matrix i stvarni PostgreSQL VPN-scoped administrator scenario potvrđuju negativni cross-service link/unlink bez side effecta i pozitivni same-service tok; kompletni CI `40775040580` je zelen. Dokaz je [80-status-page-dual-resource-ticket-link-authorization.md](../implementation/80-status-page-dual-resource-ticket-link-authorization.md). Paket nema novu DB migraciju.

### W6.8 closeout — `BA-status-page-08`

Incident read sada izlaže postojeći `updatedAt` kao ISO `revision`, a HTTP edit/link/unlink zahtijevaju `If-Match`. Svaki mutation pod zajedničkim per-incident advisory lockom ponovo čita lifecycle stanje i izvršava `updatedAt` CAS; uspjeh rotira token, stale klijent dobija `INCIDENT_CHANGED`, a link dodatno unutar locka ponovo odbija `RESOLVED`. Frontend propagira revision iz učitanog incidenta. Stvarni PostgreSQL test potvrđuje tačno jednog pobjednika za dva paralelna edita istog tokena te odbijen stale link poslije resolutiona bez relation side effecta; kompletni CI `40777527352` je zelen. Dokaz je [81-status-page-optimistic-lifecycle-concurrency.md](../implementation/81-status-page-optimistic-lifecycle-concurrency.md). Paket koristi postojeće `updatedAt` polje i nema novu DB migraciju.

### W6.9 closeout — `BA-status-page-10`

Aktivni catalog i downtime windows sada imaju determinističke probe budžete 500+1 i 1.000+1 te response `servicesHasMore`/`plannedHasMore`; UI truncation prikazuje lokalizovano upozorenje. Uptime više ne materijalizuje incident spanove u Node: parametrizovani PostgreSQL CTE reže intervale na history prozor, window funkcijom formira overlap islands i vraća najviše jedan downtime aggregate po bounded servisu. Stvarni PostgreSQL dokaz sa dva preklopljena intervala vraća 25% za tri sata union downtimea u četverosatnom prozoru; kompletni CI `40832485277` je zelen. Dokaz je [82-status-page-bounded-sql-uptime-and-catalog.md](../implementation/82-status-page-bounded-sql-uptime-and-catalog.md). Paket nema novu DB migraciju.

### W6.10 closeout — `BA-status-page-11`

Resolution transakcija više ne čita sve ticket linkove niti piše event po ticketu. Ona atomski upisuje poseban `status.incident.resolution-ticket-events` outbox intent; worker keyset-paginira `ticketId` u batchu 250 bez ukupnog capa i koristi postojeći `insertSystemTicketEvent` sa determinističkim per-ticket idempotency ključem. `notifyOnResolve=false` i dalje ne kreira recipient-notification intent, ali poslovni ticket eventi ostaju durable. Unit dokaz sa 252 linka i stvarni PostgreSQL outbox/worker scenario su zeleni u finalnom CI-ju `40836850142`. U istom closeoutu Node base digest je podignut na 22.23.4 radi tri novoprijavljena CVE-a i finalni image scan je zelen. Dokaz je [83-status-page-durable-bounded-resolution-ticket-events.md](../implementation/83-status-page-durable-bounded-resolution-ticket-events.md). Paket nema novu DB migraciju.

### W6.11 closeout — `BA-status-page-12`

Ticket autorizacija za incident create/link/unlink više nije N+1 pre-check izvan transakcije. `assertStaffTickets` izvrši jedinstvenu deterministic `FOR SHARE` stavku nad svim traženim ticket redovima unutar iste transakcije koja zaključava incident, verifikuje da svi postoje (inače 404 bez commitovanja), koristi jednu policy snapshot i zahteva `staff` visibility za svaki ticket. Link/unlink koriste isti batch pristup nakon incident locka. Dokaz je [84-status-page-transactional-batched-ticket-authorization.md](../implementation/84-status-page-transactional-batched-ticket-authorization.md). Paket nema novu DB migraciju.

### W6.12 closeout — `BA-status-page-13` i `BA-status-page-14`

Javni status endpoint sada koristi trust-proxy-aware IP za rate limiting (Express `trust proxy` kada je podešen, inače connection `remoteAddress`), a Redis greška više nije fail-open već fail-closed (429). Shared Redis cache (`status:public:page:v{version}`) zamjenjuje per-process Map; verzija se inkrementira na svakoj incident mutaciji (create/edit/resolve/link/unlink), tako sve instance invalidiraju cache Odmah. Dokaz je u [85-status-page-public-endpoint-hardening.md](../implementation/85-status-page-public-endpoint-hardening.md). Paket nema novu DB migraciju.

## 14. Ključne korekcije

- **01–02,09:** resource-aware staff/manage odluka prema incident serviceovima i assignment scopeu.
- **03,07:** re-evaluacija eligibilityja pri deliveryju; revoke pri visibility promjeni; incident+ticket dual authorization.
- **04–05:** durable notification outbox/run, cursorirani recipienti, per-recipient status i worker batches.
- **06,10,16:** latest-N timeline/cursor, SQL uptime agregacija, bounded catalog/window i hasMore contract.
- **08,11–12:** version/If-Match, status predicates, bounded link count i batch/transaction-safe ticket authorization.
- **13–14:** verificiran trust proxy, shared limiter/cache, invalidation i odobren stale SLA.
- **15,17–18:** privacy/retention matrica, edit revision i kontrolisan backdate.
- **19:** regenerisan Prisma client i real Postgres/concurrency/failure/perf/public testovi.

## 15. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,60 |
| B. API i ugovori             |    12% |   5,00 |
| C. Auth/authz/scope          |    15% |   3,20 |
| D. Poslovna pravila/stanje   |    13% |   4,60 |
| E. Podaci/Prisma/transakcije |    13% |   4,20 |
| F. Sigurnost/privatnost      |    12% |   3,50 |
| G. Async/integracije         |     8% |   3,50 |
| H. Testovi/dokazivost        |    10% |   3,60 |
| I. Operativnost/perf.        |     7% |   3,80 |
| **Ukupno**                   | **100%** | **4,11/10** |

Ponderisani zbir je 4,110, odnosno **4,11/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan

### Faza 0 — safety net

Scoped agent/manage cross-service; ALL→STAFF subscriber; foreign incident link; 2.001 start recipient; failed resolution recipient; 10k updates/links; concurrent edit/resolve; spoofed proxy IP; retention.

### Faza 1 — authorization i classification

Resource-aware viewer/manage, service scope, dual incident-ticket authorization i subscriber eligibility/revoke.

### Faza 2 — durable delivery

Resolution/start outbox, cursorirani batches, per-recipient retry/terminal state i bounded API latency.

### Faza 3 — concurrency i bounded data

Incident version/CAS, link/status predicates, timeline pagination, link cap i SQL uptime aggregation.

### Faza 4 — public hardening i privacy

Trust-proxy test, shared cache/limiter/invalidation, stale SLA, retention/anonymization i edit revision.

### Faza 5 — finalni gate

Regenerisan Prisma client; svih 5 suiteova; Postgres concurrency/volume, Redis/cache/proxy, notification fault injection i E2E 21/public status na finalnom SHA-u.

## 17. Acceptance i konačna presuda

1. Scoped role/permission ne otkriva niti mijenja foreign-service incident.
2. Visibility downgrade odmah revokea non-staff read/subscription/delivery.
3. Svaki eligible recipient ima durable delivery ili dokaziv terminal reason.
4. Notification/API rad je bounded bez 2k truncationa ili unbounded resolution requesta.
5. Timeline, links, services, windows i uptime imaju resource budžete/pagination/agregaciju.
6. Concurrent edit/link/resolve vraća conflict umjesto stale writea.
7. Incident i ticket moraju oba biti autorizovani za link/unlink.
8. Public cache/rate limit je proxy-safe, multi-instance koherentan i brzo invalidiran.
9. Retention/anonymization pokriva incident, update, author, subscription, link, ticket event i audit replike.
10. Svih 5 suiteova i scope/classification/concurrency/failure/perf E2E prolaze.

Modul ima dobar public sanitizer, transition CAS i transakcijsku ticket/audit integraciju, ali globalizovani scope, STAFF_ONLY subscriber leak i nedurable notification fan-out sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **4,11/10**.

## Implementacijski closeout — W6.1 (`BA-status-page-01`)

Na SHA `e60e997`, uz potpuno zeleni CI `40732153002`, status viewer razdvaja globalni staff od service/OU-scoped assignmenta. Jedinstveni resource-aware query predikat pokriva overview, history, incident, service i ticket-linked read; OU-only assignment ostaje fail-closed jer incident nema OU dimenziju, a STAFF_ONLY sa više servisa zahtijeva scope nad svakim servisom. Imena autora i counters koriste istu odluku. Public sanitizer je eksplicitna allowlist projekcija. Direktna matrica i stvarni PostgreSQL cross-service test potvrđuju negativnu granicu. Dokaz: [74-status-page-resource-aware-staff-reads.md](../implementation/74-status-page-resource-aware-staff-reads.md). Paket nema DB migraciju.

## Implementacijski closeout — W6.2 (`BA-status-page-02`, `BA-status-page-09`)

Na SHA `55a5de0` i korekciji testnog dokaza `d51ecb6`, uz potpuno zeleni CI `40735765271`, create/edit/update/resolve-preview koriste centralni `AuthorizationService.authorizeResource` nad svakim incident servisom. Foreign mutation je skrivena not-found granicom, dok create i pokušaj dodavanja foreign service ID-a fail-closed odbijaju zahtjev. Stvarni PostgreSQL cross-service scenarij potvrđuje i pozitivnu i negativnu putanju. Link/unlink ostaju u zasebnom `BA-status-page-07` opsegu. Dokaz: [75-status-page-resource-scoped-mutations.md](../implementation/75-status-page-resource-scoped-mutations.md). Paket nema DB migraciju.

## Implementacijski closeout — W6.3 (`BA-status-page-03`)

Na SHA `77c6662`, audit-schema korekciji `6fedf3a` i testnoj izolaciji `deb23bd`, uz potpuno zeleni CI `40760712472`, `ALL_USERS → STAFF_ONLY` atomski opoziva postojeće subscriptione. Edit, subscribe i resolve dijele per-incident PostgreSQL advisory lock, subscribe koristi resource-aware viewer predikat, a audit bilježi samo broj opozvanih redova. Stvarni PostgreSQL dokaz potvrđuje da requester i foreign-service staff ne mogu ponovo subscribeati niti dobiti interni resolution sadržaj, dok odgovarajući scoped staff može. Dokaz: [76-status-page-visibility-transition-subscription-revocation.md](../implementation/76-status-page-visibility-transition-subscription-revocation.md). Paket nema DB migraciju.

## Implementacijski closeout — W6.4 (`BA-status-page-04`)

Na SHA `4ea6fad` uz korekcije `7575f0b`, `cab7d18` i `e97b685`, finalni CI `40766102694`, create atomski upisuje `status.incident.start` transactional-outbox intent. Worker keyset-paginira aktivne requestere otvorenih ticketa u batchu 250 bez ukupnog capa, koristi deterministic recipient dedupe, durable retry/dead-letter/replay i otkazuje javni delivery ako visibility postane `STAFF_ONLY`. Worker wiring i lokalizovani admin scheduler katalog su zaključani testovima. Dokaz: [77-status-page-durable-paginated-start-delivery.md](../implementation/77-status-page-durable-paginated-start-delivery.md). Paket koristi postojeći outbox i nema DB migraciju.
