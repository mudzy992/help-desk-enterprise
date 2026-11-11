# Backend audit 17 — `notifications`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,05/10**  
**Nalazi:** 3 P1, 8 P2, 4 P3

## 1. Executive summary

`notifications` objedinjuje inbox, grupne i personalne obavijesti, realtime emitovanje, SMTP, email templatee, preference, quiet hours, digest, sedmični izvještaj, Edge/Teams događaje i retention workere. Pozitivna osnova je značajna: recipient dedupe ključevi i DB unique indeksi, group-row model koji izbjegava fan-out eksploziju, receipt read state, preference katalog i lockovi, email allowlist/redaction, stale-claim takeover, bounded digest/retention batch i BullMQ scheduler ID-evi.

Baseline je ipak **5,05/10**. Tri P1 nalaza pogađaju pouzdanost i privatnost. Glavni notification tok nastaje iz lokalnog in-memory `TicketRealtimeHub` listenera, pokreće se kao odvojeni `void` Promise nakon ticket događaja i nema durable outbox/replay; restart ili procesni pad može trajno izgubiti inbox, email i downstream događaj. Grupni inbox authorization koristi 30-sekundni membership cache, pa uklonjeni član može u tom prozoru čitati naslov, body i payload novih ili zadržanih grupnih obavijesti. Digest pri slanju ponovo učitava ticket sadržaj, ali ne provjerava da primalac još ima pristup ticketu; nakon forwarda, promjene grupe/OU-a ili role može poslati foreign ticket broj, status, event, link i za nekonfidencijalni ticket naslov.

Dodatni rizici su preference read fail-open koji zaobilazi opt-out, phantom publish pri concurrent batch insertu, mark-all race, email stale takeover sa mogućim duplikatom, inbox bez cursora, trajna email-delivery PII evidencija i slaba recovery/observability matrica. Nema P0. Nalazi nisu popravljani jer implementacija ostaje zaključana do završetka kompletnog backend audit ciklusa.

## 2. Scope i inventar

- 87 produkcijskih TypeScript fajlova;
- 41 direktni spec;
- 9.691 aktuelni produkcijski LOC;
- 3 kontrolera, 10 injectable servisa/komponenti i 2 BullMQ procesora;
- Prisma: `Notification`, `NotificationReceipt`, `NotificationEmailDelivery`, `UserNotificationPreference`, `UserNotificationSchedule`, `NotificationDigestItem` i povezani integration jobs;
- kanali: inbox, user/group realtime, SMTP email, digest/quiet flush, weekly email, Edge i Teams kroz integration queue;
- cross-module producenti: tickets/collaboration, approvals, forwarding, SLA runtime, ops alerts, bulk broadcast, on-call, settings, integration queue i realtime bridge;
- primarni E2E dokaz je 36, uz reference 02, 10, 18, 21, 22, 40, 51 i 54.

Registarska ranija procjena od 9.778 LOC korigovana je direktnim brojanjem na 9.691.

## 3. Arhitektura i tokovi

Ticket message/event se nakon domenskog writea objavljuje na procesnom `TicketRealtimeHub`-u. `NotificationsFanOutService` se pretplaćuje pri inicijalizaciji i za svaki payload odvojeno: učita policy, kreira personal/group inbox redove, emituje realtime i Edge događaje, zatim šalje ili queuea email. Inbox dedupe je `(userId,dedupeKey)` ili `(groupId,dedupeKey)`; email dedupe je `(userId,dedupeKey)`.

Personal inbox čuva read state na notification redu. Group inbox je jedan red po događaju; vidljivost zavisi od aktuelnog članstva, vremena pristupanja i `excludedUserIds`, dok `NotificationReceipt` čuva per-user read. Preference odluka kombinuje katalog, administratorske lockove/default, user override, quiet hours i on-call bypass. DIGEST/QUIET email se čuva kao minimalni item bez bodyja, a scheduled worker kasnije učitava aktuelni ticket i sastavlja sažetak.

Email može ići direktno ili kao durable `IntegrationJob`. Direktno slanje prvo claimuje delivery red; uspjeh ga označava `SENT`, greška briše claim, a claim stariji od deset minuta može biti preuzet. Retention i digest scheduleri su BullMQ repeatable jobovi.

## 4. API, role, scope i privacy matrica

`/notifications` koristi session + RoleGuard za USER/AGENT/ADMIN/SUPER_ADMIN i uvijek izvodi operaciju nad authenticated subject ID-em. Ne postoji arbitrary-user inbox read. `markRead` prvo pokušava personal scoped update, a group red prihvata samo ako audience provjera kaže da je vidljiv.

Self-service preference rute koriste session i authorization context; admin summary/reset ponavlja actor/target context i štiti SUPER_ADMIN metu. Email-template rute zahtijevaju ADMIN, a write/test dodatno `settings.write`. DTO validacija je whitelist/forbid i preference lista je ograničena na 50.

Problem je što group visibility nije vezana za autoritativan membership read. `loadActorGroupMemberships` koristi per-process scope katalog sa TTL-om; uklonjeno članstvo do isteka keša i dalje zadovoljava `visibleNotificationWhere` i `isNotificationVisibleTo`. Notification red može nositi ticket title/body/payload, pa revocation nije neposredan security boundary.

Recipient resolution radi access filter samo za FOLLOWER primatelje. Assignee/requester/group/approval/SLA recipienti proizlaze iz event/ticket stanja. To je prihvatljivo u trenutku događaja, ali held digest kasnije nema nikakvu novu centralnu ticket-access provjeru. Confidential naslov se prazni, ali broj, status, kategorija događaja i link ostaju; za nekonfidencijalni ticket ostaje i naslov.

## 5. Podaci, idempotency i konkurencija

Pozitivno:

- unique indeksi štite personal/group inbox i email/digest dedupe;
- group receipt ima composite PK i `createMany(skipDuplicates)`;
- inbox batch koristi bounded createMany umjesto N insertova;
- digest item ne čuva message body;
- email claim ima stuck detekciju i takeover;
- retention radi u bounded batch petlji;
- scheduler registration je idempotentna po stabilnom ID-u.

Rupe:

- `insertNotificationBatch` radi read-before-create, zatim bez pregleda stvarnog `createMany.count` vraća i emituje sve lokalno konstruisane redove. Dva paralelna ingestovanja mogu imati jednog DB pobjednika, dok gubitnik ipak publishuje phantom ID i enqueuea dupli Edge događaj;
- `markAllRead` odvojeno updateuje personal redove, čita sve group redove i upisuje receipts bez transakcije/cutoffa. Novi događaj između koraka može biti označen pročitanim iako nije postojao na klik, ili endpoint/realtime može vratiti `0` dok je novi unread već upisan;
- stale email claim takeover ne može razlikovati “SMTP nije poslao” od “SMTP je poslao, proces je pao prije SENT updatea”, pa recovery legitimno može poslati duplikat;
- digest dedupe/deletion nije jedan atomarni delivery state machine; konkurentan/manualni run može netačno brojati poslanu isporuku, a exactly-once nije ostvariv;
- `NotificationEmailDelivery` nema retention niti redakciju `toAddress`, i ostaje nakon user lifecyclea do cascade deletea;
- list endpoint ima samo `take`, bez cursor/offset/hasMore, pa su stariji redovi praktično nedostupni.

## 6. Preference, mandatory, quiet hours i digest

Katalog razlikuje always-on kategorije, role rang, podržane kanale i administratorske lockove. Validation odbija unknown/duplicate/unauthorized kategoriju, OFF za lockovanu isporuku i DIGEST gdje kanal nema tu semantiku. Quiet hours podržavaju vikende, installation timezone i on-call bypass. Deaktivirani user gubi pending digest iteme.

`resolveDeliveryDecisions` namjerno hvata svaki delegate/query kvar i vraća default `inApp:true,email:IMMEDIATE`. Isto radi `findGroupMembersWithInAppOff`, vraćajući praznu exclusion listu. Time DB/client incident ne zaustavlja notifikaciju, ali istovremeno poništava eksplicitni opt-out i može poslati email ili prikazati osjetljivu obavijest koju je korisnik isključio. Ovo je compliance/privacy problem; last-known-good ili fail-safe policy mora razlikovati mandatory kategoriju od dobrovoljnog marketing/operativnog kanala.

Policy settings pojedinačno fail-open padaju na ugrađene default vrijednosti. Kvar čitanja može uključiti preference/digest/quiet funkciju ili ukloniti administratorski lock/bypass. Nema health signala da se događaji obrađuju pod fallback policyjem.

Digest itemi stariji od sedam dana se brišu, ali retention processor hvata svaku digest delete grešku i izvještava `0`, pa trajni kvar delegata/baze izgleda kao uspješan sweep. Digest slanje nema ponovnu access provjeru i to je kritičniji nalaz od same retention rupe.

## 7. Delivery lifecycle, provideri i recovery

Queued email nasljeđuje integration-queue retry/backoff; direktni email nema durable retry. In-app persist, realtime publish, Edge enqueue i email nisu jedna transakcija/outbox. Servis hvata i samo loguje channel grešku, a originalna ticket operacija je već završena. Procesni pad prije ili tokom detached `ingest` nema cursor ni reconciliation.

SMTP config se čita iz settingsa i password ide kroz secret API. Allowlist podržava internal-only, eksplicitne domene i adrese. Public reply excerpt se rediguje; confidential email uklanja naslov/body osjetljivog prikaza. Provider-limit breaker sprečava digest retry oluju.

Delivery status model ima samo string `CLAIMED/SENT`; nema broj pokušaja, next retry, provider ID, zadnju grešku, failed/dead status ni operator retry/cancel. Direktni failure briše jedini trag claima. Ops health vidi stuck claim i last sent, ali ne mjeri izgubljeni hub event, fan-out lag/failure, preference fallback, phantom publish, digest access drop ni delivery duplicate.

## 8. Inbox, realtime, retention i scale

Group-row dizajn značajno smanjuje write amplification, a epoch cache izbjegava stale unread count nakon group insertovanja. Unread count je capped na 1.000. Personal publish invalidira cache i ponovo broji; group publish bumpuje epoch.

`listNotifications` uvijek uzima najnovijih najviše 100 bez cursora. To nije puna paginacija i korisnik ne može do historije unutar retention prozora. `markAllRead` učitava sve unread group ID-eve u memoriju bez batch limita, što na velikoj grupnoj historiji može napraviti veliki request i insert payload. Retention `findMany` nema eksplicitni orderBy; funkcionalno završava, ali stabilan `(createdAt,id)` cursor/order bi dao predvidljiv rad pod kontinuiranim writeovima.

Retention briše inbox i cascade receipts. Ne postoji odgovarajuća politika za email delivery evidenciju. Digest retention failure je silent. Realtime emitovanje nema ack/retry/catch-up cursor; UI se oslanja na kasniji REST refresh.

## 9. Cross-module integracije i E2E

Tickets registruje follower access filter i emituje persisted message payload; SLA registruje runtime channel; bulk ticket operacije registruju broadcast sender; Edge/Teams koriste integration queue. Ovi module-level registri su procesni singletoni: worker ili bootstrap bez registracije fail-closed odbacuje followers, dok restart gubi događaj u letu.

E2E 36 provjerava ops health email blok, test alarm kanale, pojavu `ops.alert`, mark-read i admin karticu. Ostali E2E testovi dodiruju shell badge, workspace i email/forward/report tokove, ali nema end-to-end testa za stvarni ticket event → durable inbox/email nakon restarta, group membership revocation, digest access revocation, preference DB failure, concurrent dedupe, mark-all race, quiet/on-call kombinaciju ili pagination historiju.

## 10. Direktni testni rezultat

Pokrenuto:

```bash
cd backend
npm ci
npm test -- --runInBand --runTestsByPath $(find src/modules/notifications -name '*.spec.ts' -print | sort)
```

Rezultat: **41 suite ukupno; 16 prošlo, 25 compile-blocked; 104/104 izvršena testa prošla**. Blokirane suiteove zaustavlja nepotpun generated Prisma client: nedostaju `generated/prisma/enums`, `$transaction` i delegati za notification preference/schedule/digest, ticket, participant, group, SLA i email delivery modele. `npm ci` je prijavio četiri moderate dependency nalaza.

Prošli pure/helper testovi potvrđuju dio template renderinga, email classification/config, scheduling, cache i rate-limit ponašanja. Rezultat nije puni zeleni modul: većina DB/service integracijskih suiteova se nije izvršila.

## 11. Pozitivni nalazi

1. Inbox API je strogo vezan za authenticated user ID.
2. Admin target preference reset štiti SUPER_ADMIN hijerarhiju i auditira promjenu.
3. DTO whitelist i category/role validation su jasni i bounded.
4. Personal/group/email/digest dedupe imaju DB unique zaštitu.
5. Group receipt model čuva individualni read state bez write fan-outa.
6. Group join time sprečava nasljeđivanje historije nakon novog članstva.
7. Follower recipient access filter je fail-closed kad nije registrovan.
8. Email allowlist i public excerpt redaction smanjuju izlaz podataka.
9. Confidential digest skriva naslov.
10. Digest item ne čuva body.
11. Quiet hours uključuju timezone, weekends i on-call bypass.
12. Inactive user digest itemi se odbacuju.
13. BullMQ scheduler ID-evi i dedupe su stabilni.
14. Retention je batchovan i izvan request patha.
15. Email stuck claim je vidljiv u ops healthu.
16. Unread cache ima group epoch invalidaciju.
17. Test-send endpointi imaju rate limit i poznatu disabled semantiku.

## 12. Registar nalaza

| ID                  | Severity | Nalaz                                                                                       | Status   |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- | -------- |
| BA-notifications-01 | P1       | Primarni fan-out je detached in-memory tok bez outboxa, replaya ili recoveryja              | otvoreno |
| BA-notifications-02 | P1       | Stale membership cache privremeno zadržava pristup group notification sadržaju              | otvoreno |
| BA-notifications-03 | P1       | Digest šalje aktuelni ticket sadržaj bez ponovne provjere recipient pristupa                | otvoreno |
| BA-notifications-04 | P2       | Preference/settings kvar fail-open zaobilazi user opt-out i administratorske lockove        | otvoreno |
| BA-notifications-05 | P2       | Concurrent batch dedupe gubitnik publishuje phantom notification ID i dupli downstream event| otvoreno |
| BA-notifications-06 | P2       | `mark-all-read` nema transaction/cutoff i može progutati ili netačno prijaviti novi unread   | otvoreno |
| BA-notifications-07 | P2       | Stale email claim takeover može duplirati već poslanu poruku                                | otvoreno |
| BA-notifications-08 | P2       | Inbox nema cursor/hasMore i starija historija je nedostupna                                 | otvoreno |
| BA-notifications-09 | P2       | Email delivery adresa/status nemaju retention/redaction lifecycle                           | otvoreno |
| BA-notifications-10 | P2       | Delivery state nema attempts/error/dead/retry ugovor ni dokaz stvarnog provider ishoda      | otvoreno |
| BA-notifications-11 | P2       | Group mark-all učitava i insertuje neograničen skup ID-eva u jednom HTTP zahtjevu           | otvoreno |
| BA-notifications-12 | P3       | Digest retention grešku guta i izvještava kao nula                                          | otvoreno |
| BA-notifications-13 | P3       | Redis fallback test-email limit je per-instance i mapa nema cleanup                         | otvoreno |
| BA-notifications-14 | P3       | Kritični recovery/scope/concurrency scenariji nemaju E2E dokaz                              | otvoreno |
| BA-notifications-15 | P3       | Većina DB direktnih suiteova lokalno je compile-blocked generated Prisma klijentom           | otvoreno |

## 13. Detalji P1 nalaza

### BA-notifications-01 — nedurabilan glavni fan-out

`TicketRealtimeHub.publish` poziva lokalne listenere, a subscriber radi `void this.ingest(payload)`. Nema await veze sa producentom, nema per-event persisted notification outboxa i nema cursora koji bi nakon restarta pronašao propuštene ticket događaje. Catch-and-log štiti ticket operaciju, ali trajno gubi inbox/email/Edge obavijest. Uvesti transactional outbox uz ticket event, idempotent worker i replay/reconciliation; realtime treba biti posljedica persistiranog delivery statea, ne izvor istine.

### BA-notifications-02 — revocation kasni za membership cacheom

Group read/count/mark koriste `loadActorGroupMemberships` iz 30-sekundnog procesnog scope kataloga. Nakon uklanjanja usera iz grupe, cache i dalje proizvodi group condition i omogućava REST čitanje/body/payload te mark-read. Revocation-sensitive read mora koristiti autoritativni membership ili version/epoch invalidiran sinhrono na membership promjenu; test mora zagrijati cache, ukloniti članstvo i odmah dokazati deny.

### BA-notifications-03 — digest ne reautorizuje recipienta

Held item pamti user/ticket, a `sendFor` kasnije queryja ticket direktno po ID-u i renderuje broj, naslov/status/event/link bez centralne ticket access policy provjere. Forward, OU/group promjena, confidential promjena ili role revocation između eventa i digesta nisu uzeti u obzir. Prije rendera batch-provjeriti aktuelnu visibility za svakog usera; denied item obrisati uz metric/audit-safe reason, bez otkrivanja ticket činjenica.

## 14. Ostali nalazi i korekcije

- **04:** last-known-good preference/policy snapshot; voluntary kanal ne smije fail-open ignorisati OFF, mandatory kategorije moraju biti eksplicitne.
- **05:** koristiti `createManyAndReturn`, per-row upsert ili nakon inserta učitati stvarno osvojene ID-eve; publish samo persisted pobjednike.
- **06:** server cutoff/notification version i transakcija; odgovor izračunati nakon operacije, a novi red ostaviti unread.
- **07:** provider idempotency key gdje postoji, stable Message-ID, status `UNKNOWN` i operator reconciliation umjesto slijepog resenda.
- **08:** stabilan `(createdAt,id)` cursor, `hasMore` i unread filter parity.
- **09:** definisati minimalnu delivery retention/redaction politiku i agregirane metrike nakon brisanja PII-ja.
- **10:** eksplicitan state machine PENDING/CLAIMED/SENT/FAILED/UNKNOWN/DEAD sa attempts, nextRetryAt, error code i provider ID-em.
- **11:** batch/cursor receipts ili background command za vrlo veliki inbox; request resource budget.
- **12:** retention failure mora failati job/retry i podići health metric.
- **13:** shared Redis je obavezan za test send ili fail-closed; lokalna mapa treba TTL cleanup i bounded size.
- **14–15:** generated Prisma/PostgreSQL CI shard i navedena negativna/restart/concurrency E2E matrica.

## 15. Baseline score

| Presjek                      |   Težina | Ocjena |
| ---------------------------- | -------: | -----: |
| A. Arhitektura i granice     |      10% |   5,60 |
| B. API i ugovori             |      12% |   6,10 |
| C. Auth/authz/scope          |      15% |   4,30 |
| D. Poslovna pravila/stanje   |      13% |   5,20 |
| E. Podaci/Prisma/transakcije |      13% |   5,50 |
| F. Sigurnost/privatnost      |      12% |   4,50 |
| G. Async/integracije         |       8% |   3,80 |
| H. Testovi/dokazivost        |      10% |   4,60 |
| I. Operativnost/perf.        |       7% |   6,00 |
| **Ukupno**                   | **100%** | **5,05/10** |

Ponderisani zbir je 5,052, zaokruženo 5,05. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan popravki

### Faza 0 — safety net

Generated Prisma/PostgreSQL fixture; restart između ticket commita i fan-outa; warmed-cache membership revoke; digest access revoke; preference DB failure; parallel batch ingest; mark-all/new-event race; SMTP send/crash/SENT race; >100 inbox history.

### Faza 1 — durable izvor istine i P1 privatnost

Transactional notification outbox, idempotent worker/replay i reconciliation; authorization-versioned group audience; batch central access recheck prije digesta.

### Faza 2 — idempotency i state machine

Persisted-winner publish, provider-aware email states/idempotency, attempts/backoff/dead/unknown i operator retry; digest run claim/lease.

### Faza 3 — preference i read consistency

Last-known-good policy, explicit mandatory semantics, fail-safe voluntary opt-out, mark-all cutoff/transakcija i cache invalidation parity.

### Faza 4 — API, retention i scale

Cursor inbox, hasMore, bounded group receipts, email-delivery PII retention/redaction i retention failure health/retry.

### Faza 5 — observability i integracije

Fan-out lag/failure/replay, fallback-policy, access-drop, provider outcome, duplicate suppression i retention metrike; ops drill za SMTP/Redis/settings/DB incident.

### Faza 6 — finalni gate

Svih 41 direktnih suiteova, integration queue/tickets/settings/on-call testovi i relevantni E2E na finalnom SHA-u; restart i revocation acceptance obavezni.

## 17. Rizik, rollback i acceptance

Outbox migracija mora backfillati samo nedvosmisleno neobrađene evente da ne izazove notification storm. Membership cache korekcija ne smije napraviti DB query po svakom badge pollu; koristiti membership epoch/version uz autoritativni deny. Email `UNKNOWN` zahtijeva jasan operator UX jer automatski resend i automatski drop imaju različit poslovni rizik.

Acceptance:

1. Ticket commit eventualno proizvodi tačno jedan logički notification event i nakon restarta.
2. Uklonjeno članstvo odmah gubi group inbox pristup i kroz zagrijan cache.
3. Digest ne sadrži nijedan ticket za koji recipient više nema pristup.
4. DB/settings incident ne poništava user OFF niti admin lock bez vidljivog policy signala.
5. Concurrent ingest publishuje samo stvarno persistirane ID-eve i jedan downstream događaj.
6. Mark-all ima definisan cutoff; poslije njega nastao događaj ostaje unread.
7. SMTP crash recovery ne šalje slijepo duplikat i ostavlja operatoru dokaz stanja.
8. Inbox historija je cursor-paginirana.
9. Delivery PII ima dokumentovan retention/redaction lifecycle.
10. Svi direktni, integracijski i relevantni E2E testovi prolaze.

## 18. Traceability i konačna presuda

| Nalaz | Primarni dokaz                                         | Faza  |
| ----- | ------------------------------------------------------ | ----- |
| 01    | hub listener + detached `ingest` + catch-and-log       | 0–1   |
| 02    | `loadNotificationAudience` + scope cache TTL           | 0–1   |
| 03    | digest `sendFor` direktni ticket query/render          | 0–1   |
| 04    | preference/policy catch fallback                       | 0–3   |
| 05    | pre-read + `createMany(skipDuplicates)` + local return | 0–2   |
| 06    | odvojeni personal/group mark-all koraci                 | 0–3   |
| 07,10 | email CLAIMED/SENT lifecycle                           | 0–2   |
| 08,11 | list/mark-all query ugovori                            | 0–4   |
| 09,12 | schema + retention processor                           | 0–4   |
| 13–15 | fallback mapa, E2E matrica i Jest rezultat             | 0–6   |

Notifications ima široku funkcionalnost i više dobrih dedupe, privacy i scale odluka, ali notification sistem bez durable izvora, neposredne revocation garancije i digest reautorizacije nije enterprise-pouzdan. Iskren baseline je **5,05/10**.
