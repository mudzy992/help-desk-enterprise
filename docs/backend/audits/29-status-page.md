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

Public je default-off; configuration read fallback nikada ne uključuje public. Controller prije cachea ponovo provjerava enabled/public. `toPublicStatusPage` dodatno uklanja STAFF_ONLY, author names, counters i subscribed stanje, što je dobar defense-in-depth. Redis rate limit je 60/IP/min, a bez Redisa postoji bounded memory fallback.

`request.ip` sigurnost zavisi od trust-proxy konfiguracije. Pogrešna konfiguracija može sve korisnike grupisati iza reverse proxy IP-a ili vjerovati spoofovanom forwarded IP-u. Redis failure fail-open je namjeran zbog 30s cachea, ali dopušta bandwidth/serialization abuse. Cache je process-local: svaki API instance radi vlastiti DB refresh, a javni odgovor može do 30s ostati stale nakon incident edit/withdraw/visibility promjene. Za incident status to mora biti eksplicitno odobren stale SLA; preporučljiv je shared cache + mutation invalidation/tag/version.

Javni response objavljuje service IDs/names, planned downtime message i ALL_USERS timeline. To je namjerna funkcija, ali content authoring treba upozorenje/classification i test da ticket IDs, interni linkovi ili tajne ne ulaze u slobodni tekst.

## 9. Ticket integracija i audit

Create može vezati najviše 100 tiketa i prije transakcije svaki prolazi centralni `loadAccessibleTicket` sa staff visibilityjem. Link/unlink isto provjerava ticket. System event i audit su u istoj transakciji sa relacijom. Ovo je jaka integracijska osnova.

N+1 authorization do 100 ticket IDs povećava latency i race prozor prije transakcije. Ticket access može biti revokean između pre-checka i writea. Potreban je batch access evaluator/snapshot ili ponovna scoped provjera u transakciji. Resolve u transakciji iterira sve linkove i piše event po tiketu bez limita; iako create capuje 100, kasniji link endpoint može neograničeno povećati broj linkova. Resolution transakcija može postati veoma velika.

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
| BA-status-page-02 | P1       | Scoped manage permission postaje globalna mutation dozvola nad svim service incidentima       | otvoreno |
| BA-status-page-03 | P1       | ALL_USERS→STAFF_ONLY ne revokea subscribera; resolution mu otkriva interni title/message       | otvoreno |
| BA-status-page-04 | P1       | Start notification terminalno odsijeca primatelje nakon 2.000 bez cursora/backloga             | otvoreno |
| BA-status-page-05 | P1       | Resolution fan-out je unbounded i sve subscriptione označi notified i nakon pojedinačnog pada | otvoreno |
| BA-status-page-06 | P2       | Incident timeline nested read nema limit; do 300 incidenata može učitati sve updateove         | otvoreno |
| BA-status-page-07 | P2       | Link/unlink ne provjerava incident visibility/manage scope, samo ticket staff access            | otvoreno |
| BA-status-page-08 | P2       | Edit/link lifecycle nema opšti version/CAS i može raceati sa resolveom                          | otvoreno |
| BA-status-page-09 | P2       | Service IDs se validiraju samo po existenceu, bez actor OU/service scopea                       | otvoreno |
| BA-status-page-10 | P2       | Uptime spans, active services i downtime windows su neograničeno učitani                        | otvoreno |
| BA-status-page-11 | P2       | Resolve transakcija piše event za neograničen broj naknadno linkanih tiketa                     | otvoreno |
| BA-status-page-12 | P2       | Ticket authorization je N+1 pre-check izvan transakcije i može zastarjeti prije link writea     | otvoreno |
| BA-status-page-13 | P2       | Public rate limit zavisi od trust-proxy/IP ispravnosti i fail-open je pri Redis grešci          | otvoreno |
| BA-status-page-14 | P2       | Process-local public cache nema mutation invalidation ni multi-instance koherenciju             | otvoreno |
| BA-status-page-15 | P2       | Incident/update/link/subscription retention i anonymization nisu formalizovani                  | otvoreno |
| BA-status-page-16 | P3       | Open/history capped liste nemaju cursor/hasMore ni stabilan ID tie-breaker                      | otvoreno |
| BA-status-page-17 | P3       | Edit audit/revision ne omogućava rekonstrukciju title/service promjena                          | otvoreno |
| BA-status-page-18 | P3       | Neograničeno backdating incidenta mijenja uptime historiju bez posebne kontrole                 | otvoreno |
| BA-status-page-19 | P3       | Tri od pet suiteova su compile-blockirana; failure/concurrency/large-volume matrica nedostaje   | otvoreno |

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
