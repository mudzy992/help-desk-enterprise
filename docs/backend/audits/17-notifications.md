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
| BA-notifications-01 | P1       | Primarni fan-out je detached in-memory tok bez outboxa, replaya ili recoveryja              | zatvoreno |
| BA-notifications-02 | P1       | Stale membership cache privremeno zadržava pristup group notification sadržaju              | zatvoreno |
| BA-notifications-03 | P1       | Digest šalje aktuelni ticket sadržaj bez ponovne provjere recipient pristupa                | zatvoreno |
| BA-notifications-04 | P2       | Preference/settings kvar fail-open zaobilazi user opt-out i administratorske lockove        | zatvoreno |
| BA-notifications-05 | P2       | Concurrent batch dedupe gubitnik publishuje phantom notification ID i dupli downstream event | zatvoreno |
| BA-notifications-06 | P2       | `mark-all-read` nema transaction/cutoff i može progutati ili netačno prijaviti novi unread   | zatvoreno |
| BA-notifications-07 | P2       | Stale email claim takeover može duplirati već poslanu poruku                                | zatvoreno |
| BA-notifications-08 | P2       | Inbox nema cursor/hasMore i starija historija je nedostupna                                 | zatvoreno |
| BA-notifications-09 | P2       | Email delivery adresa/status nemaju retention/redaction lifecycle                           | zatvoreno |
| BA-notifications-10 | P2       | Delivery state nema attempts/error/dead/retry ugovor ni dokaz stvarnog provider ishoda      | zatvoreno |
| BA-notifications-11 | P2       | Group mark-all učitava i insertuje neograničen skup ID-eva u jednom HTTP zahtjevu           | zatvoreno |
| BA-notifications-12 | P3       | Digest retention grešku guta i izvještava kao nula                                          | zatvoreno |
| BA-notifications-13 | P3       | Redis fallback test-email limit je per-instance i mapa nema cleanup                         | zatvoreno |
| BA-notifications-14 | P3       | Kritični recovery/scope/concurrency scenariji nemaju E2E dokaz                              | € implementirano (paket 214); čeka se CI dokaz i operativna potvrda AA1 |
| BA-notifications-15 | P3       | Većina DB direktnih suiteova lokalno je compile-blocked generated Prisma klijentom           | zatvoreno |

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
- **09 (zatvoreno W6.26):** postojeća privacy retention kategorija `emailDeliveries` definiše DPO-konfigurabilni rok i briše due redove batchirano; RetentionRun/audit čuvaju agregate bez recipient adrese/statusa. Direktni regression dokaz i caveat za ciljnu postavku su u §27.
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

## 19. Statusna dopuna — BA-notifications-01 closeout (2026-11-05)

`BA-notifications-01` (P1) je zatvoren na nivou nalaza kroz Val 6 paket W6.18. Trigger upisuje fan-out intent u istoj PostgreSQL transakciji kao novi `TicketMessage`; registered worker obavlja replayable delivery. Nema historical backfilla. Integration acceptance u [paketu 133](../implementation/133-notifications-01-durable-ticket-message-fanout.md) potvrđuje commit/rollback zajedno i restart replay u tačno jedan requester inbox red sa `SUCCEEDED` outbox statusom.

Finalni CI [`42043805181`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42043805181) na SHA `0e84472` je success za backend generated-Prisma build/lint/full Jest/SLA matrix, real PostgreSQL+Redis integration, frontend, docs, container/supply-chain i CI gate. E2E critical flows, install wizard i read-only service-form inventory bili su `skipped`; oni nisu BA-notifications-01 replay acceptance. Perf [`42042167541`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42042167541) na runtime SHA `c5cfac4` je success; naredni `0e84472` commit mijenjao je samo testne fajlove, a Perf pragovi nisu mijenjani.

Ova dopuna je historijski W6.18 presjek: tada je mijenjala samo `BA-notifications-01` status, dok su `BA-notifications-02`–`15` ostali otvoreni. BA-15 puni critical-flow acceptance ostao je zasebno pending. Migracija `20271031160000_notifications_ticket_message_fanout_outbox` replayovana je samo na disposable CI bazi; ciljna baza nije korištena ni migrirana.

## 20. Statusna dopuna — BA-notifications-02 closeout (2026-11-05)

`BA-notifications-02` (P1) je zatvoren kroz W6.19. Notification audience sada koristi autoritativno čitanje membershipa iz baze, mimo process `WeakMap` keša; unread-count cache je vezan za tačan membership fingerprint i group epochove. Time promjena membershipa, uključujući remove/re-add, ne može autorizovati notification read niti ponovo koristiti broj za staru publiku.

Acceptance testovi zagrijavaju scope i unread-count keševe, simuliraju revokaciju na drugoj instanci i neposredno provjeravaju list/count/mark-one/mark-all. Edge receipt putanja je dodatno testirana: zastarjeli scope cache još vraća članstvo, ali `recordReceipt` koristi authoritative loader, vrati `NOT_FOUND` i ne zapisuje receipt audit. Dokazi i precizan scope su u [paketu 134](../implementation/134-notifications-02-immediate-group-membership-revocation.md).

Finalni SHA [`390ad86`](https://github.com/mudzy992/help-desk-enterprise/commit/390ad8608521eb5f37bf2af7a424d669194b742b) prošao je automatski CI [`42088943970`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42088943970): generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs, container/supply-chain i gate su success. E2E critical flows, install wizard i read-only inventory bili su `skipped`; novi Perf nije pokrenut jer notification/Edge putanje nisu u push path filteru. Nema nove migracije, target baza nije korištena i nema PR-a/mergea/deploymenta.

Ova dopuna zatvara samo `BA-notifications-02`. Notifications ima 2/15 zatvorenih; `BA-notifications-03`–`15` ostaju otvoreni. Val 6 je 21/109 zatvorenih sa 88 otvorenih (19 P1 / 49 P2 / 20 P3) i nije završen. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni.

## 21. Statusna dopuna — BA-notifications-03 closeout (2026-11-05)

`BA-notifications-03` (P1) zatvoren je kroz W6.20. Prije svakog digest rendera worker sada batch-queryja held ticket IDs uz centralni `buildTicketSurfaceVisibility` predicate (`surface: 'detail'`) za primaoca. Principal/role/group kontekst i OU scopeovi se učitavaju aktuelno, mimo request/Redis/process scope keševa; confidential policy konfiguracija se učitava fail-closed. Facts query vraća samo vidljive tikete, a denied itemi se izbacuju iz composer ulaza i brišu iz held reda prije slanja.

Ista reautorizacija pokriva `sendTest`: revoked/denied stavke se ne predaju composeru i brišu se. Normalni digest i test-send loguju samo agregatni broj sa razlogom `ticket_visibility_denied`, bez user/ticket ID-jeva ili ticket činjenica. Kvar authz/config/OU/ticket visibility čitanja sprečava slanje; normalni held itemi ostaju za retry, a test-send vraća `TICKET_VISIBILITY_UNAVAILABLE`.

Regresijski testovi zagrijavaju membership scope cache, uklanjaju članstvo i odmah dokazuju deny i u scheduled i u test-digest putanji; dodatni failure test potvrđuje fail-closed ponašanje. Dokazi su u [paketu 135](../implementation/135-notifications-03-digest-recipient-reauthorization.md).

Finalni kodni SHA [`aaf5ea1`](https://github.com/mudzy992/help-desk-enterprise/commit/aaf5ea1ef747144a06dc9a754af2a5159270414e) prošao je automatski CI [`42096685123`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42096685123): generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs guard, container/supply-chain i CI gate su success. E2E critical/install i read-only inventory bili su `skipped`; Perf nije pokrenut jer notification digest putanja nije u push path filteru. Nema nove migracije, target-DB upotrebe, PR-a/mergea/deploymenta.

Ova dopuna zatvara samo `BA-notifications-03`. Notifications ima 3/15 zatvorenih; `BA-notifications-04`–`15` ostaju otvoreni. Val 6 je 22/109 zatvorenih sa 87 otvorenih (18 P1 / 49 P2 / 20 P3) i nije završen. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni.

## 22. Statusna dopuna — BA-notifications-04 closeout (2026-11-05)

`BA-notifications-04` (P2) zatvoren je kroz W6.21. Preference-policy se učitava atomarno: samo potpuno validan settings snapshot može postati last-known-good; snapshot je vezan za `SettingsService` instancu i važi najviše 5 sekundi monotonic vremena. Poslije isteka ili bez validnog snapshot-a dobrovoljna isporuka fail-closed; samo katalogom eksplicitno označene `alwaysOn` kategorije mogu proći bez policyja. Preference, schedule i grupni in-app exclusion read kvarovi/missing delegate-i više se ne tretiraju kao prazna lista ili `inApp=true`; administrativni lockovi i opt-out se ne zaobilaze. Policy greške imaju sanitizovan, throttled warning bez user/ticket/error detalja, a announcement batch odluke se razriješe prije persistiranja primalaca.

Dodani testovi pokrivaju potpune defaults, invalidne vrijednosti, LKG rok i izolaciju, preference/schedule/group read failure, mandatory kategorije, persist/on-call/email i announcement fan-out. Prvi automatski CI [`42104810227`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42104810227) otkrio je canonical-key problem: CSV normalizer pretvara miješano velika slova u lowercase, pa loader je prvo odbacivao validan default `report.weeklyTickets`; korekcija u [`2cb3d6f`](https://github.com/mudzy992/help-desk-enterprise/commit/2cb3d6f4347c39c070ab00139cd8854719a10aa8) mapira normalizovane ključeve nazad na kanonske category ID-eve (uključujući `ticket.timeAutoStopped`). Sljedeći CI [`42106734046`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42106734046) prošao je PostgreSQL/Redis integration, ali Jest je pokazao da announcement delivery test double nije imao preference/schedule read delegate-e; fixture je ispravljen test-only izmjenom u [`42e3d7f`](https://github.com/mudzy992/help-desk-enterprise/commit/42e3d7f29cfe4296313082444daf0b9495abc032).

Finalni SHA [`42e3d7f`](https://github.com/mudzy992/help-desk-enterprise/commit/42e3d7f29cfe4296313082444daf0b9495abc032) prošao je automatski CI [`42108808170`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42108808170): backend build/lint/full Jest, real PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su success. E2E critical flows, install wizard i read-only service-form inventory bili su `skipped`. Perf smoke nije pokrenut jer BA-04 notification paths nisu u workflow push path filteru; nije ručno dispatchan. Nema nove migracije, target-DB upotrebe, PR-a, mergea ni deploymenta.

Ova dopuna zatvara samo `BA-notifications-04`. Notifications ima 4/15 zatvorenih; `BA-notifications-05`–`15` ostaju otvoreni. Val 6 je 23/109 zatvorenih sa 86 otvorenih (18 P1 / 48 P2 / 20 P3) i nije završen. Source audit/generisani plan su 538 otvorenih / 154 zatvorenih; globalni registar 548/144. Deset poznatih statusnih razlika ostaje netaknuto. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni.

## 23. Statusna dopuna — BA-notifications-05 closeout (2026-11-06)

`BA-notifications-05` (P2) zatvoren je kroz W6.22. `insertNotificationBatch` zadržava pre-read samo kao replay optimizaciju; ishod za caller više ne izvodi iz lokalno kreiranih kandidata niti iz procjene prije inserta. PostgreSQL `createManyAndReturn({ data, skipDuplicates: true })` vraća stvarne pobjedničke redove i samo oni postaju fan-out rezultat i ulaz za `NotificationCreatedSink`. Ako konkurentni pozivi oba vide prazan pre-read, unique constraint odabere persistirani pobjednik; gubitnički poziv dobije prazan rezultat i ne emituje phantom ID ili dupli downstream event. In-memory delegate usklađen je sa `createManyAndReturn`, bez promjene postojećeg `createMany` `{ count }` ugovora.

Unit regressions pokrivaju vraćene pobjednike, replay filtriranje, sinkove samo za stvarno insertovane redove i prazan recipient skup. Disposable real-PostgreSQL integration test barijerom prisiljava oba poziva da završe pre-read prije inserta, zatim poredi vraćene/emitted ID-jeve sa persistiranim redovima i potvrđuje da downstream prima samo pobjednike.

Implementacijski/testani SHA [`ee9cc20f06204e3f149ab3a9b833d7bd968d7153`](https://github.com/mudzy992/help-desk-enterprise/commit/ee9cc20f06204e3f149ab3a9b833d7bd968d7153) prošao je automatski CI [`42168601336`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42168601336): backend build/lint/full Jest, PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su success. E2E critical flows, install wizard i read-only inventory su `skipped`; Perf nije pokrenut jer notification paths nisu u push path filteru. Nije korištena target baza niti pokretana migracija; nema PR-a, mergea ili deploymenta.

Ova dopuna zatvara samo `BA-notifications-05`. Notifications ima **5/15** zatvorenih; `BA-notifications-06`–`15` ostaju otvoreni. Val 6 je **24/109** zatvorenih sa **85 otvorenih** (18 P1 / 47 P2 / 20 P3) i nije završen. Source audit/generisani plan su **537 otvorenih / 155 zatvorenih**; redovi globalnog registra **547/145**. Deset poznatih statusnih razlika ostaje netaknuto. Status-page 29 ostaje 19/19. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni; BA-15 nije zatvoren.

## 24. Statusna dopuna — BA-notifications-06 closeout (2026-11-06)

`BA-notifications-06` (P2) zatvoren je kroz W6.23. `markAllNotificationsRead` uhvati jedan server-side `readAt` prije transakcije; personal update i group unread lookup/receipt insert sada su u istoj `RepeatableRead` transakciji. Autoritativni group membership query je prvi statement i uspostavlja snapshot; personal rows i group rows dodatno su ograničeni na `createdAt <= readAt`. Serialization error `P2034` dobija jedan retry uz isti cutoff. Nakon commita unread count se računa iznova izvan transakcije, pa service response i oba realtime događaja nose stvarni post-operation count. Nije promijenjena schema niti uvedena migracija.

Unit regressions ubacuju post-cutoff personal row prije update-a i drugi row između koraka; oboje ostaje unread, a fresh count vraća 2. Service test provjerava response i oba realtime count eventa. Novi disposable PostgreSQL spec postavlja personal i group rows nakon prvog transaction query-ja sa tačnim cutoff vremenom, provjerava stabilni snapshot, receipt za stari group row, unread stanje kasnijih rows i fresh count. Failure scenario forsira receipt write error i potvrđuje rollback personal update-a. Spec je registrovan u isolated integration runneru i guard testu.

Implementacijski/testani SHA [`d7ba5f3`](https://github.com/mudzy992/help-desk-enterprise/commit/d7ba5f39e0851e711afeaf8247aa336967e57901) prošao je automatski CI [`42178850754`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850754): generated-Prisma backend build/lint/full Jest, PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su success. E2E critical/install i read-only inventory bili su `skipped`, ne passed.

Automatski Perf smoke [`42178850841`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850841) je failure samo na globalnom `avg db_queries_per_request`: **2.126** prema nepromijenjenom budgetu **2.1**. K6 latency/payload assertions su passed; route summary sadrži `/notifications/unread-count=2.110` i `/services=10.002`, ali run ne izoluje mark-all-read niti dokazuje da je ova izmjena uzrok. Nisu mijenjani pragovi i nije proširen scope radi Perf rezultata. Zato Perf nije zelen i nema pull/merge/redeploy preporuke. Lokalni generated-Prisma client nije se mogao izgraditi u sandboxu zbog nedostupnog `binaries.prisma.sh`; automatski CI je generisao client i full suite je prošao. Nije korištena target baza niti lokalno pokretana migracija; CI koristi disposable baze. Nema PR-a, mergea ili deploymenta.

Ova dopuna zatvara samo `BA-notifications-06`. Notifications ima **6/15** zatvorenih; `BA-notifications-07`–`15` ostaju otvoreni. Val 6 je **25/109** zatvorenih i **84 otvorenih** (18 P1 / 46 P2 / 20 P3) i nije završen. Source audit/generisani plan su **536 otvorenih / 156 zatvorenih**; redovi globalnog registra su **546/146**. Deset poznatih statusnih razlika ostaje netaknuto. Status-page 29 ostaje 19/19. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni; BA-15 nije zatvoren.

## 25. Statusna dopuna — BA-notifications-07 closeout (2026-11-06)

`BA-notifications-07` (P2) zatvoren je kroz W6.24. Automatski takeover više ne vraća stale `CLAIMED` red u stanje za slanje: pri narednom pokušaju red stariji od 10 minuta prelazi u `UNKNOWN`, a taj pokušaj i kasniji dedupe pokušaji ne pozivaju SMTP. Unique key `[userId,dedupeKey]` čuva evidenciju i blokira slijepi resend. Svaki callerov `Message-ID` se zadržava; ako nedostaje, shared helper stvara deterministički fallback radi korelacije. To nije provider idempotency key ni garancija SMTP deduplikacije.

Ops Health sada izlaže ukupan broj `UNKNOWN` isporuka i UI upozorenje; sanitizovani log fingerprint ne sadrži primaoca, user ID, subject, sadržaj ni sirovi dedupe key. User guide upućuje operatora na provjeru SMTP/MTA evidencije i na ostavljanje ishoda `UNKNOWN`/eskalaciju kad se prihvatanje ne može pouzdano utvrditi. Nema automatskog replaya ni exactly-once obećanja. Status kolona je postojeći `String`, pa nema schema izmjene ni migracije. Rješenje ostaje u zajedničkom email delivery helperu i ops signalu; nisu mijenjani pojedinačni calleri.

Unit regresije pokrivaju stale/fresh claim, blokiranje ponovnog SMTP poziva, stabilni fallback `Message-ID`, privatnost upozorenja i Ops Health signal. Nova disposable PostgreSQL suite provjerava stvarni stale-row transition u `UNKNOWN`, nula SMTP poziva, nulu stuck-claim counta i da kasniji replay ostane no-op; suite je registrovan u isolated integration runneru.

Implementacijski SHA [`d69aec1`](https://github.com/mudzy992/help-desk-enterprise/commit/d69aec157c473de51f1bd4431f1fb481e1f1b402) prošao je generated-Prisma build/lint i disposable PostgreSQL/Redis integration; prvi full CI [`42183267613`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42183267613) našao je dva follow-up problema: Prettier format u Ops Health UI-ju i test fake u report-schedules koji je svaki `updateMany` pogrešno prijavljivao kao stale-claim match. Test fixture i formatting su popravljeni u [`8e68aaf`](https://github.com/mudzy992/help-desk-enterprise/commit/8e68aafd1b7a9fa235299a59b0adeff2cbba22ff). Finalni CI [`42185320693`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42185320693) na SHA `8e68aaf` prošao je backend generated-Prisma build/lint/full Jest, real PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. E2E critical/install i read-only inventory bili su `skipped`.

Automatski Perf [`42183267509`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42183267509) na implementacijskom SHA `d69aec1` pao je samo na globalnom query budgetu: `avg db_queries_per_request=2.125` naspram nepromijenjenog praga `2.1`; route summary navodi `/notifications/unread-count=2.099` i `/services=10.000`. Run ne utvrđuje BA-07 uzročnost. Pragovi nisu mijenjani; test-only follow-up SHA `8e68aaf` nije pokrenuo dodatni Perf run zbog path filtera. Perf zato nije zelen. Lokalno nije korištena target baza niti pokrenuta migracija; CI integration koristi disposable baze. Nema PR-a, mergea ni deploymenta; nema preporuke za pull/merge/redeploy dok Perf gate nije zelen.

Ova dopuna zatvara samo `BA-notifications-07`. Notifications ima **7/15** zatvorenih; `BA-notifications-08`–`15` ostaju otvoreni. Val 6 je **26/109** zatvorenih i **83 otvorenih** (18 P1 / 45 P2 / 20 P3) i nije završen. Source audit/generisani plan su **535 otvorenih / 157 zatvorenih**; redovi globalnog registra su **545/147**. Deset poznatih statusnih razlika ostaje netaknuto; `BA-status-page-01`–`19` ostaju 19/19. Baseline **5,05/10** i BA-15 full critical-flow pending status ostaju nepromijenjeni; BA-15 nije zatvoren.

## 26. Statusna dopuna — BA-notifications-08 closeout (2026-11-06)

`BA-notifications-08` (P2) zatvoren je kroz W6.25. Inbox sada koristi stabilni keyset redoslijed `(createdAt DESC, id DESC)`, versionirani cursor i `limit + 1` sentinel za `hasMore`/`nextCursor`; cursor provjerava user i unread-filter binding. Unread-only predicate ostaje primijenjen na svim stranicama. API limit je ograničen na postojeći default 30 / maksimum 50. Frontend nudi unread filter, load-more i retry; mark-one/mark-all read prekidaju pending list zahtjeve i osvježavaju prvu stranicu, a regresija potvrđuje da zakašnjela stranica ne vraća pročitane stavke.

Cursor codec, unit/service paginacija, frontend hook/panel/API i disposable PostgreSQL suite pokrivaju malformed/filter-bound cursore, jednake timestampove, stabilan tie-break, više stranica bez duplikata/propuštanja, unread parity i stale-response zaštitu. PostgreSQL suite je registrovan u isolated integration runneru i guard testu. Nema schema promjene ni migracije.

Kodni i testani SHA [`9a581f0`](https://github.com/mudzy992/help-desk-enterprise/commit/9a581f07b7103c2b7d33b5068b2db3af5dda0782) prošao je automatski CI [`42233259247`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259247): generated-Prisma backend build/lint/full Jest, PostgreSQL/Redis integration, frontend lint/format/full test/build, Docs guard, container/supply-chain i CI gate su success. E2E critical flows, install wizard, read-only inventory i uslovni image-enforcement korak bili su `skipped`, ne passed. Lokalni frontend build i **441 fajl / 1.695 testova**, ciljani lintovi i isolated-runner guard (**15/15**) su passed. Lokalni normalni backend typecheck bio je blokiran nedostajućim generated Prisma artefaktima; generator nije uspio preuzeti schema engine zbog mrežne TLS greške prema `binaries.prisma.sh`. CI je generisao client i prošao full backend provjeru.

Automatski Perf [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) pao je samo na globalnom `avg db_queries_per_request=2.125` prema nepromijenjenom budgetu `2.1`; ostali prijavljeni latency/payload gateovi su prošli. Run ne izoluje inbox cursor putanju niti utvrđuje BA-08 kao uzrok. Pragovi nisu mijenjani i scope nije proširen. Perf zato nije zelen; nema pull/merge/redeploy preporuke. Push CI je imao skipped E2E/inventory poslove, pa BA-15 full critical-flow acceptance ostaje pending.

Ova dopuna zatvara samo `BA-notifications-08`. Notifications ima **8/15** zatvorenih; `BA-notifications-09`–`15` ostaju otvoreni. Val 6 je **27/109** zatvorenih i **82 otvorena** (18 P1 / 44 P2 / 20 P3) i nije završen. Izvorni audit/generisani plan su **534 otvorena / 158 zatvorenih**; redovi globalnog registra su **544/148**. Deset poznatih statusnih razlika ostaje netaknuto; `BA-status-page-01`–`19` ostaju 19/19. Baseline **5,05/10** i BA-15 status ostaju nepromijenjeni; BA-15 nije zatvoren.

Nije korištena target baza niti je lokalno pokrenuta migracija; CI koristi disposable baze. Nema PR-a, mergea ili deploymenta. Raniji Coolify redeploy handoff je propustio navesti potrebnu migraciju; blocker ostaje zaseban, a tačan migration ID nije utvrđen. Ne zaključivati niti pogađati ga na osnovu ovog schema-neutral paketa. Svaka buduća redeploy uputa mora prvo navesti tačan potreban migration ID i sequencing.

## 27. Statusna dopuna — BA-notifications-09 closeout (2026-11-06)

`BA-notifications-09` (P2) zatvoren je kroz W6.26 nakon provjere postojećeg privacy-retention lifecyclea i dodavanja direktnog regression dokaza. `NotificationEmailDelivery` je pokriven kategorijom `emailDeliveries` u centralnom `RetentionService`; nije uveden drugi notification-specific scheduler niti je mijenjan statusni ugovor.

Postavka `private.privacy.retention.emailDeliveryDays` ima fallback/default **180 dana**, configurable opseg **30–36.500 dana**, a `0` eksplicitno isključuje retention. Period se računa od `createdAt`; nightly sweep je konfigurabilan, sa zadanim vremenom 02:30 `Europe/Sarajevo`, a executor briše redove cutoffom u batchovima do 500. Brisanje cijelog due reda uklanja adresu, status, dedupe ključ i vezu ka korisniku zajedno. Privacy anonymization zasebno briše delivery redove anonimiziranog korisnika.

Dry-run i izvršeni `RetentionRun` čuvaju kategoriju, period, broj i vremenski raspon; email-delivery executor ne zapisuje delivery ID-jeve u `refs`. Audit metadata čuva agregat izvršenja, bez recipient adrese ili delivery-status detalja. Tako se nakon brisanja PII-ja zadržava agregatni dokaz bez čuvanja delivery row-a.

Dodani testovi zaključavaju loader default/config/disable ponašanje i real-PostgreSQL lifecycle: stari `SENT`, `UNKNOWN` i `CLAIMED` zapisi se uklanjaju, noviji zapis ostaje, a RetentionRun/audit dokaz ne sadrže adrese ni delivery status vrijednosti. Suite `retention.integration.spec.ts` već je registrovan u isolated integration runneru.

Finalni kodni/testani SHA [`1b578cb`](https://github.com/mudzy992/help-desk-enterprise/commit/1b578cbf2f636788fa7ec67875470700dfe195f5) prošao je automatski CI [`42254318025`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42254318025): generated-Prisma backend build/lint/full Jest, disposable PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su success. E2E critical flows, install wizard, read-only inventory i uslovni image-enforcement korak bili su `skipped`. CI integration job je prošao; raw per-suite log preuzimanje vratilo je `EOF`, pa se ne navodi suite-specific broj testova.

Perf nije pokrenut jer privacy retention putanje nisu u push path filteru. Posljednji automatski Perf [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) ostaje failure na globalnom `2.125` prema nepromijenjenom `2.1` query budgetu; BA-09 nije utvrđen kao uzrok i prag nije mijenjan. Lokalno nisu pokrenuti puni CI/E2E testovi; dependencies i generated Prisma artefakti nisu bili prisutni. Nije korištena ciljna baza niti je izvršena migracija; nema schema promjene.

Ova dopuna zatvara samo `BA-notifications-09`. Notifications ima **9/15** zatvorenih; `BA-notifications-10`–`15` ostaju otvoreni. Val 6 je **28/109** zatvorenih i **81 otvoren** (18 P1 / 43 P2 / 20 P3), a status-page 29 ostaje 19/19. Izvorni audit/generisani plan su **533 otvorena / 159 zatvorenih**; redovi globalnog registra su **543/149**. Deset poznatih statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan. BA-15 full critical-flow acceptance ostaje pending; Val 6 nije završen.

Nema PR-a, mergea ili deploymenta; Perf nije zelen, pa nema pull/merge/redeploy preporuke. Ciljna instalacija i stvarni setting override nisu provjereni — default 180 dana nije tvrdnja o deployment konfiguraciji. Raniji Coolify redeploy handoff propustio je navesti migraciju; tačan migration ID ostaje neutvrđen i ne smije se pogađati. Sljedeći mogući bounded kandidat je `BA-notifications-10` (P2); nije započet i zahtijeva zasebnu autorizaciju.

## 28. Statusna dopuna — BA-notifications-11 closeout (2026-11-06)

`BA-notifications-11` (P2) zatvoren je kroz W6.27. Group `mark-all-read` više ne materijalizira sve notification ID-eve niti ih šalje u jednom insertu: stranice se čitaju uzlazno po ID-u, `id > lastNotificationId`, sa `take=250`, a receipt-i se upisuju u odvojenom `createMany` batchu za svaku stranicu.

Postojeće BA-06 garancije su sačuvane. Jedan `readAt` cutoff uzima se prije transakcije; autoritativno članstvo i unread group predicate učitavaju se unutar iste `RepeatableRead` transakcije; personal update i sve group receipt stranice ostaju u istom snapshotu. Receipt dedupe, ograničeni P2034 retry i post-commit unread count nisu promijenjeni. Nema schema izmjene ni migracije.

Unit regresija obrađuje 517 group rows u batchovima 250/250/17 i provjerava cursore i sve kreirane receipte. Disposable PostgreSQL regresija obrađuje 251 row: upitni limiti su 250/250, stvarni read page size je 250/1, a receipt insert batchovi su 250/1; svih 251 receipt je potvrđen.

Implementacijski SHA [`2f88329`](https://github.com/mudzy992/help-desk-enterprise/commit/2f8832993441c5f393c25c1dc60b6d1ee83333dc), uz test-fixture follow-upe, završno je testiran na SHA [`040a308`](https://github.com/mudzy992/help-desk-enterprise/commit/040a30863b4979d88b3dfacbec0115de7b16b03c). CI [`42277072185`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42277072185) je success za generated-Prisma backend build/lint/full Jest, real PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. E2E critical/install i read-only inventory poslovi bili su `skipped`. Odvojeni spec-36 status-matcher fix još nema browser-run potvrdu; targeted dispatch nije bio dostupan (`HTTP 403`), pa se ne računa kao passed E2E niti BA-15 sign-off.

Perf nije pokrenut: BA-11 runtime putanja nije u `.github/workflows/perf-smoke.yml` push filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) ostaje stvarni globalni query-budget failure `2.125 > 2.1`; prag nije mijenjan, a run ne pripisuje uzrok BA-11. Nije korištena ciljna baza niti je pokrenuta migracija.

Ova dopuna zatvara samo `BA-notifications-11`. Notifications ima **10/15** zatvorenih; `BA-notifications-10` i `BA-notifications-12`–`15` ostaju otvoreni. Val 6 ima **29/109** zatvorenih i **80 otvorenih** nalaza (18 P1 / 42 P2 / 20 P3); audit jedinica `29 — status-page` ostaje 19/19. Izvorni audit/generisani plan prikazuju **532 otvorena / 160 zatvorenih**, a redovi globalnog registra **542/150**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan. BA-15 full critical-flow acceptance ostaje pending; Val 6 nije završen.

Nema PR-a, mergea ili deploymenta; Perf nije zelen, pa nema pull/merge/redeploy preporuke. BA-11 nema migraciju, ali raniji Coolify redeploy handoff ostaje zaseban blocker: tačan migration ID nije potvrđen i ne smije se pogađati. Svaka buduća redeploy uputa mora unaprijed navesti tačnu potrebnu migraciju i redoslijed. Detalji paketa su u [142 — bounded group mark-all receipt paging](../implementation/142-notifications-11-bounded-group-mark-all-receipts.md).

## 29. Statusna dopuna — BA-notifications-12 closeout (2026-11-06)

`BA-notifications-12` (P3) zatvoren je kroz W6.28. Digest retention brisanje više ne hvata DB/delegate grešku i ne pretvara je u `0`: processor zapisuje sanitizovani `notification_digest_retention_failed type=...` signal i baca isti exception dalje. Zbog toga se normalni success log ne emituje nakon neuspjelog brisanja. Uklonjen je i optional delegate fallback koji je mogao prikazati lažni zero-row success kad generated digest delegate nedostaje.

Notification retention scheduler već registruje BullMQ job sa dva pokušaja i eksponencijalnim backoffom od 30 sekundi. Processor sada ispravno prepušta neuspjeh queue retry mehanizmu. Sam delete je idempotentan; ako se standardni notification purge završi prije digest delete greške, ponovni job može ga sigurno ponoviti.

`notification-retention.processor.spec.ts` potvrđuje stvarni count na uspješnom putu, failure log bez osjetljivog error sadržaja, propagaciju delete exceptiona bez success loga i reject ponašanje kad generated digest delegate nedostaje. Postojeći scheduler test zaključava retry/backoff konfiguraciju. Nije uvedena schema izmjena ni migracija.

Implementacijski i testani SHA [`cc801ef`](https://github.com/mudzy992/help-desk-enterprise/commit/cc801ef41c6698b5d7a068c06634380e673589ff) prošao je CI [`42280702579`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42280702579): generated-Prisma backend build/lint/full Jest, real PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su success. E2E critical/install, read-only inventory i uslovni image-enforcement korak bili su `skipped`. Spec-36 matcher fix nema novi browser-run dokaz; BA-15 full critical-flow acceptance ostaje pending.

Perf nije pokrenut jer notification retention processor putanja nije u `.github/workflows/perf-smoke.yml` push filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) ostaje globalni query-budget failure `2.125 > 2.1`; prag nije mijenjan i run ne utvrđuje BA-12 kao uzrok. Nije korištena ciljna baza, lokalno pokrenuta migracija niti deployment.

Ova dopuna zatvara samo `BA-notifications-12`. Notifications ima **11/15** zatvorenih; `BA-notifications-10`, `BA-notifications-13`, `BA-notifications-14` i `BA-notifications-15` ostaju otvoreni. Val 6 ima **30/109** zatvorenih i **79 otvorenih** nalaza (18 P1 / 42 P2 / 19 P3); audit jedinica `29 — status-page` ostaje 19/19. Izvorni audit/generisani plan prikazuju **531 otvoren / 161 zatvoren**, a redovi globalnog registra **541/151**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan. BA-15 full critical-flow acceptance ostaje pending; Val 6 nije završen.

Nema PR-a, mergea ili deploymenta. BA-12 nema migraciju, ali raniji Coolify redeploy blocker je zaseban: tačan potreban migration ID nije potvrđen i ne smije se pogađati. Svaka buduća redeploy uputa mora unaprijed navesti tačnu potrebnu migraciju i redoslijed. Detalji paketa su u [143 — digest retention failure visibility](../implementation/143-notifications-12-digest-retention-fail-visible.md).

## 30. Statusna dopuna — BA-notifications-10/13/15 closeout (2026-11-07)

`BA-notifications-10`, `BA-notifications-13` i `BA-notifications-15` zatvaraju se na već implementiranom kodu i automatizovanom CI dokazu; detaljni statusni closeout je u [paketu 144](../implementation/144-notifications-10-13-15-status-closeout.md).

- `BA-notifications-10`: delivery state bilježi attempts/retry i `FAILED`/`DEAD`/`UNKNOWN` ishode, a SMTP provider receipt se persistira. Unit regresije su u `deliver-notification-email.spec.ts` i `persist-notification-email-delivery.spec.ts`; `notification-email-delivery-recovery.integration.spec.ts` pokriva DB recovery/provider receipt. CI [`42291432145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42291432145) na `d93ca280` prošao je backend build/full Jest i PostgreSQL+Redis integration.
- `BA-notifications-13`: Redis test-email limiter ograničava na pet po actoru u deset minuta; unavailable/missing Redis je fail-closed (`503`), a stvarni limit breach ostaje `429`. Redis integration suite je registrovan i CI [`42286710936`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42286710936) je passed; najnoviji puni CI [`42291432145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42291432145) također je passed.
- `BA-notifications-15`: CI generiše Prisma client prije backend build/testa; generated-client safety-net compile, puni backend Jest i PostgreSQL+Redis integration job su passed. Puni backend Jest je dokaz za notification suites; safety-net compile nije pogrešno predstavljen kao direktno pokretanje baš tih putanja.
- `BA-notifications-14` ostaje otvoren. Najnoviji CI je preskočio E2E critical flows, install wizard i read-only inventory; traženi kritični recovery/scope/concurrency browser dokaz nije dostupan i nije ručno dispatchan. Odvojeni globalni `BA-15` full critical-flow acceptance također ostaje pending.

Posljednji Perf [`42289613508`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42289613508) ostaje **failed** na nepromijenjenom globalnom query budgetu: prosjek `2.128` prema `2.1` kroz `50,597` zahtjeva (p95 `3`, max `34`). Nema dokaza da se neuspjeh može pripisati ovim notification nalazima; prag nije mijenjan i Perf se ne označava zelenim.

Nema schema izmjene, migracije, target-DB upotrebe, PR-a, mergea ni deploymenta. Zatvorena su tri nalaza: notifications je **14/15**; Val 6 je **33/109** zatvorenih i **76 otvorenih** (18 P1 / 41 P2 / 17 P3); status-page 29 ostaje 19/19. Source audit/generisani plan su **528 otvoren / 164 zatvoren**, a redovi globalnog registra **538/154**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan. Val 6 nije završen.

## 31. Implementacija — BA-notifications-14 (2026-10-29)

Dokazni paket [214](../implementation/214-notifications-14-critical-scenario-evidence.md) mapira svaki scenario iz nalaza na automatski test koji se već izvršava u CI-ju: restart recovery i concurrent dedupe nad fan-out outbox integration suiteom, e-mail recovery/provider ishod, mark-all race i pagination historija nad PostgreSQL integration suiteovima, membership/digest revocation i preference fail-closed nad unit suiteovima, a browser nivo pokriva E2E 36 u dnevnom schedule CI-ju ([`43178874566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43178874566), u cijelosti zelen uključujući E2E critical flows). Bez promjene koda i bez migracije. Nalaz ostaje **otvoren** do CI dokaza na ovom commitu i operativne potvrde vlasnika (AA1 u paketu 214).

## Dopuna — ograničenje dokaza BA-notifications-14

Paket 214 prikuplja postojeće unit i integration dokaze, ali E2E 36 ne dokazuje cijelu recovery/scope/concurrency browser matricu. Nalaz ostaje otvoren; ranije navedena implementacija dokazne matrice ne znači da je tražena E2E pokrivenost potpuna.

## Dopuna — pripremljeni browser realtime test

Opt-in `59-notifications-realtime.spec.ts` povezuje konkretni odgovor s browser Socket.IO događajem i prikazom u otvorenom panelu. Test nije izvršen na stacku, preskače se bez eksplicitnog uključivanja i ne pokriva cjelokupnu recovery/scope/concurrency matricu; detalji su u [paketu 214](../implementation/214-notifications-14-critical-scenario-evidence.md). Nalaz ostaje otvoren.
