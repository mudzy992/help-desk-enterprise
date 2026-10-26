# Backend audit 12 — `tickets`

**Status:** audit završen  
**Datum:** 2026-10-22  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,38/10**  
**Nalazi:** 8 P1, 8 P2, 3 P3

## 1. Executive summary

`tickets` je najveći backend modul i centralna poslovna granica sistema: 470 produkcijskih TypeScript fajlova, 107 direktnih specova, 19 kontrolera, 56 injectable klasa, 34 funkcionalna poddirektorija i 31.516 aktuelnih fizičkih produkcijskih LOC. Pokriva create/read/list/update, visibility, saradnju, confidential pristup, priloge, bulk, approval, forwarding, merge/split, reopen/archive, CSAT, time tracking, routing, guardrails, export, remote, realtime i workere.

Modul ima snažnu authorization osnovu, dobar visibility-parity model, široku DTO validaciju, kvalitetne upload provjere, transakcijske create/update/merge/forward/time-tracking tokove i worker→Redis→API realtime bridge. Nije pronađena javna ticket-data ruta bez session zaštite niti očigledan horizontalni IDOR kroz pregledane detail/list/attachment/confidential putanje.

Baseline je ipak **5,38/10**. Osam P1 nalaza pogađa atomski integritet i siguran retry: poruka može biti trajno kreirana uz API grešku; break-glass pristup može postojati bez kompletnog audit traga; bulk i split mogu ostati parcijalni; split attachment copy deterministički pokazuje na nepostojeći fajl; approval odluke imaju race; CSV export može biti tih i nepotpun; automation claim može trajno potrošiti događaj prije efekta. Nema P0. Popravke se ne implementiraju prije završetka svih backend modula, cross-cutting audita i konsolidovanog plana.

## 2. Scope i inventar

- 470 produkcijskih `.ts` fajlova i 107 direktnih specova;
- 19 kontrolera, 56 injectable klasa i 34 funkcionalna poddirektorija;
- 31.516 aktuelnih fizičkih produkcijskih LOC (inventory snapshot: 31.986);
- Prisma ticket, message, participant, attachment, approval, CSAT, time-log, forwarding, confidential, break-glass, guardrail i saved-view modeli;
- API, worker, BullMQ, Redis pub/sub, filesystem attachment storage, SLA, routing, notifications, mail, settings, audit/change-log i authorization granice;
- relevantni E2E scenariji 01–08, 10, 13–16, 20–22, 26, 30, 33, 40 i 54–56.

Pregledani tokovi: create/get/list/counts/inbox/update/claim; OU/service/group scope; requester/participant/follower/handler visibility; confidential grant i break-glass; poruke, mentioni, follow i linkovi; attachment upload/list/download/delete; bulk preview/execute; approvals; forwarding; merge/unmerge/status propagation; split; reopen/archive; CSAT; timer/manual/correction/sweep; saved views; duplicate guardrails; export; remote requests; realtime i ticket workeri.

## 3. Arhitektura i lifecycle

### 3.1. Core i visibility

Create povezuje ticket, assets i inicijalne sistemske zapise u Prisma transakciji. Update transakcijski povezuje osnovnu promjenu, lifecycle timestampove, change log, sistemske događaje, timer stop i merged-child status. SLA se primjenjuje poslije glavne transakcije i zato ostaje eventualno/parcijalno konzistentan pri kvaru.

`loadAccessibleTicket` i `buildTicketVisibilityWhere` centralizuju requester, staff scope, assignment, group D1, participant, confidential grant i break-glass pravila. Poseban parity fixture pokriva OU prefikse, `_`, više service scopeova, grantove, participaciju, handler grupu i expiry. Counts i pojedine izvedene površine ipak grade dio uslova zasebno, pa parity nije formalno jedan shared predicate za svaki endpoint.

### 3.2. Saradnja, merge, forwarding i split

Create-message prvo zapisuje poruku, pa zasebno obrađuje first response, mention/follow, redaction, waiting resume, SLA i merged-copy. Merge i forwarding imaju kvalitetnije transakcijske granice za DB writeove, audit, participaciju i događaje; SLA/realtime ostaju post-commit side effecti.

Split obrađuje childove sekvencijalno bez operation transakcije/manifesta. Child se kreira prije validacije izabranih poruka/priloga. Attachment copy kreira metadata sa sintetičkom `split-link/...` putanjom koju disk storage direktno čita, ali fizički fajl/link nikad ne nastaje.

### 3.3. Approval, reopen, archive i automation

Approval decision transakcijski povezuje approval/ticket/change/event, ali pre-check statusa je izvan transakcije, a update nema `status=PENDING` uslov. Approval gate radi existence check, ticket status, approval create i event bez jedne transakcije ili unique `(ticketId, stepOrder)` zaštite.

Reopen same-ticket, archive i waiting-for-user tokovi imaju više zasebnih writeova. Archive/waiting/CSAT koriste guardrail claim prije efekta. `expiresAt` se ne koristi za oslobađanje unique fingerprinta, pa failure može trajno onemogućiti retry.

### 3.4. Attachments, CSAT, time tracking i saved views

Upload ima veličinu, MIME signature, extension deny/allowlist, ClamAV, classification inheritance, path containment i cleanup fajla kada DB zapis padne. Delete radi obrnutim redom: blob se briše prije DB transakcije. Download učitava cijeli, do 100 MB fajl u Buffer.

Time tracking koristi PostgreSQL advisory transaction lock po korisniku za start/manual/correction/sweep i ponovo provjerava aktivni red. CSAT je requester-only, status/sample-gated, unique po ticketu i redaction skeniran, ali claim/create/audit/event nisu jedna jedinica.

Saved views su owner-scoped i imaju unique user/name. Max-count i jedan-default pravila su read-then-write bez transakcijske/schema zaštite; `sort:null` se pretvara u Prisma `undefined` i ne briše prethodni sort.

## 4. API/role/permission matrica

| Površina                    | Controller role     | Dublja kontrola                           | Zaključak                     |
| --------------------------- | ------------------- | ----------------------------------------- | ----------------------------- |
| create/routing preview      | USER/AGENT/ADMIN/SA | requester, OU/service/routing/form policy | zaštićeno                     |
| list/counts/detail/form     | USER/AGENT/ADMIN/SA | shared visibility + confidential          | dobra osnova; parity dug      |
| inbox/status                | USER/AGENT/ADMIN/SA | staff/group membership                    | service-gated                 |
| claim/update                | USER/AGENT/ADMIN/SA | writable, staff/scope/status              | service-gated                 |
| participants/messages       | USER/AGENT/ADMIN/SA | access + staff/public-note pravila        | message atomski rizik         |
| follow/mention/link         | staff na metodama   | staff visibility/ownership                | zaštićeno                     |
| attachments                 | USER/AGENT/ADMIN/SA | upload/download permissions + scope       | cross-store rizik             |
| bulk preview/execute        | AGENT/ADMIN/SA      | per-action permission/config/scope        | parcijalni execute            |
| approvals                   | USER/AGENT/ADMIN/SA | approver role + OU/service                | race                          |
| break-glass                 | USER/AGENT/ADMIN/SA | policy/role/reason/expiry                 | audit granica                 |
| context/history/actions/SLA | USER/AGENT/ADMIN/SA | accessible ticket                         | boundedness zavisi od servisa |
| CSAT submit                 | USER/AGENT/ADMIN/SA | requester/status/sample                   | claim granica                 |
| CSAT summary                | AGENT/ADMIN/SA      | visible tickets                           | cap bez paginacije            |
| CSV export                  | AGENT/ADMIN/SA      | export permission unutar scopea           | post-filter nakon limita      |
| forwarding                  | AGENT/ADMIN/SA      | forward/cross-OU/target eligibility       | transakcijski DB tok          |
| priority/merge/unmerge      | AGENT/ADMIN/SA      | dedicated permissions + oba ticketa       | zaštićeno                     |
| reopen                      | USER/AGENT/ADMIN/SA | visibility/writable/policy                | neatomaran same-ticket        |
| saved views                 | AGENT/ADMIN/SA      | owner                                     | concurrency rubovi            |
| split                       | AGENT/ADMIN/SA      | permission/config/writable                | parcijalno i broken copy      |
| time logs                   | USER/AGENT/ADMIN/SA | staff/manage/owner + ticket access        | advisory lock                 |
| `/me/active-timer`          | USER/AGENT/ADMIN/SA | owner                                     | confidential title skriven    |
| remote requests             | USER/AGENT/ADMIN/SA | staff visibility/config                   | rate-limit race               |
| workflow status             | ADMIN/SA            | read-only konfiguracija                   | zaštićeno                     |

Controlleri koriste session guard i strict ValidationPipe. Granularna prava su uglavnom u service/helper sloju; nije pronađena javna ticket-data ruta bez sesije.

## 5. Podaci, transakcije i konkurencija

- Core create/update, merge, forwarding i ključni time-log writeovi koriste Prisma transakcije.
- Create-message, split, reopen, archive, CSAT, confidential audit i bulk operation nemaju end-to-end atomsku/saga granicu.
- `TicketApproval` nema unique `(ticketId, stepOrder)` niti optimistic version; decision update nije conditional.
- Attachment count-before-create može preći limit pod paralelnim uploadom; filesystem i DB ne mogu biti ACID bez manifesta/reconciliationa.
- Guardrail in-process mutex ne štiti više instanci. DB unique štiti isti fingerprint, ali ne atomizira recent-count limit niti claim→effect.
- Saved-view user/name unique je dobar; max-per-user i single-default nisu schema invarijante.
- Duplicate guardrail i remote latest-event prvo učitavaju nepotrebno široke kolekcije u memoriju.
- Export `take 5001` prethodi confidential/permission post-filteru, pa limit nije limit eligible skupa.

## 6. Async, realtime i operativnost

Worker proces ima Redis realtime forwarder, API subscriber i osnovnu envelope validaciju. `ticket.updated` payload izostavlja title/description, staff-only akcije imaju visibility mapping. Objave su best-effort poslije DB commita; Redis kvar se loguje bez durable outbox/replaya.

Time-tracking i unrouted sweep imaju batch limit. Archive i waiting-for-user učitavaju kompletnu dospjelu/status populaciju. Guardrail claim nema stvarni expiry cleanup/reuse. Worker metrics daju processed/failed zbir, ali parcijalni per-ticket kvar prekida cijelu iteraciju i nema operator-visible durable partial manifest.

## 7. Sigurnost i privatnost

Pozitivno: confidential nije automatski dostupan SuperAdminu; requester/assignee/group/participant/grant/break-glass su eksplicitni; follower sam ne daje pristup. Attachment path containment blokira absolute path, NUL, `..` i izlazak iz root-a. CSV formula injection je neutralizovan. Redaction scanning postoji na ključnim free-text putevima.

Rizici: aktivni break-glass može postojati bez kompletnog audit/change/system zapisa; split kopija može predstavljati dokument koji ne postoji; buffered upload/download pojačava memory DoS; export može dati nepotpun regulatorni/operativni skup bez upozorenja; post-commit notification/realtime/SLA kvarovi nisu durable oporavljivi.

## 8. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/tickets -name '*.spec.ts' -print | sort)
```

Rezultat: **29/107 suiteova prošlo, 78 compile-blocked; 106/106 izvršenih testova prošlo**. Blokada je nedostajući `src/generated/prisma/client`/`enums` i posljedični nedostajući Prisma delegati. Blokirani suiteovi nisu proglašeni prolaznim.

Izvršeni pure/unit testovi pokrivaju konfiguracije, parsing, priority, visibility dijelove, redaction, attachment signature/ClamAV helper, guardrail helper, CSAT aggregate, realtime mapping i druge izolovane ugovore. Nedostaju izvršivi DB race/fault testovi za P1 granice.

Pregledani su relevantni E2E fajlovi 01–08, 10, 13–16, 20–22, 26, 30, 33, 40 i 54–56. Oni pokrivaju create/routing/approval/realtime/bulk/confidential/SLA/CSAT/forward/merge/time tracking/workspace i širi closeout. Korisnikov potvrđeni Playwright 01–56 prolaz dokazuje postojeće scenarije, ne nove crash/race/retry slučajeve.

## 9. Pozitivni nalazi

1. Nema javne ticket-data rute bez session zaštite.
2. Visibility predicate i parity fixture su iznadprosječno široki.
3. Confidential pristup je fail-closed i SuperAdmin nije implicitno izuzet.
4. Core create/update i merge/forward DB writeovi imaju dobre transakcijske granice.
5. Bulk execute ponavlja enabled/action/permission/scope gate; preview nije jedina zaštita.
6. Attachment validation provjerava stvarni signature, extension, veličinu, malware i path containment.
7. CSV neutralizuje spreadsheet formule.
8. Approval decision provjerava requester self-approval i OU/service approver scope.
9. Forward target-agent endpoint ne otkriva druge OU bez cross-OU prava.
10. Time tracking koristi distribuirano siguran PostgreSQL advisory transaction lock.
11. CSAT je unique, requester-only i redaction skeniran.
12. Realtime worker bridge postoji i payload je privacy-minimalan.
13. Saved views su strogo owner-scoped.
14. Worker schedule registracija je idempotentna, sa retry/backoff konfiguracijom.

## 10. Registar nalaza

| ID            | Severity | Nalaz                                                                    | Status   |
| ------------- | -------- | ------------------------------------------------------------------------ | -------- |
| BA-tickets-01 | P1       | Create-message može commitovati poruku uz API grešku i dupli retry       | zatvoreno |
| BA-tickets-02 | P1       | Break-glass grant prethodi kompletnom audit tragu                        | zatvoreno |
| BA-tickets-03 | P1       | Bulk execute ostavlja parcijalne promjene bez operation manifesta        | zatvoreno |
| BA-tickets-04 | P1       | Split attachment copy pokazuje na nepostojeći blob                       | zatvoreno |
| BA-tickets-05 | P1       | Split kreira parcijalne childove prije pune validacije                   | zatvoreno |
| BA-tickets-06 | P1       | Approval decision/gate nisu concurrency-safe                             | zatvoreno |
| BA-tickets-07 | P1       | CSV limit prije permission/confidential filtera daje tih nepotpun export | zatvoreno |
| BA-tickets-08 | P1       | Guardrail claim-before-effect može trajno progutati automation/CSAT      | zatvoreno |
| BA-tickets-09 | P2       | Attachment limit/delete i DB/storage lifecycle nisu konzistentni         | zatvoreno |
| BA-tickets-10 | P2       | Reopen same-ticket nije transakcijski niti idempotentan                  | zatvoreno |
| BA-tickets-11 | P2       | Remote rate limit ima race i neograničeno čita system evente             | zatvoreno |
| BA-tickets-12 | P2       | SLA/realtime/notification side effecti nemaju durable outbox/recovery    | zatvoreno |
| BA-tickets-13 | P2       | Archive/waiting workeri nemaju batch/cursor granicu                      | otvoreno |
| BA-tickets-14 | P2       | Duplicate guardrail query i distributed repeat limit nisu bounded/atomic | otvoreno |
| BA-tickets-15 | P2       | Saved-view max/default invarijante nisu concurrency-safe                 | otvoreno |
| BA-tickets-16 | P2       | Attachment I/O bufferuje do 100 MB po zahtjevu                           | otvoreno |
| BA-tickets-17 | P3       | Saved-view `sort:null` ne briše prethodni sort                           | otvoreno |
| BA-tickets-18 | P3       | Counts/derived visibility nisu formalno jedan shared parity ugovor       | otvoreno |
| BA-tickets-19 | P3       | Kritične fault/race grane nemaju izvršiv integration dokaz               | otvoreno |

## 11. Detaljni nalazi

### BA-tickets-01 — Create-message može commitovati poruku uz API grešku

**Dokaz:** `create-ticket-message.ts` zapisuje poruku prije first-response, mention/follow, redaction, waiting resume, SLA i `copyMessageToMergedTickets`; nema client idempotency ključa.  
**Uticaj:** caller dobija grešku nakon trajnog javnog odgovora, retry pravi duplikat i može ponoviti notification/e-mail.  
**Korekcija:** transakcijski core + durable outbox/saga, client request ID unique po ticketu i idempotentni side effecti.  
**Acceptance:** fault nakon svakog koraka daje jedan odgovor i konvergira waiting/SLA/mention/merged-copy.  
**Owner/veličina:** tickets + notifications/SLA, L.

### BA-tickets-02 — Break-glass grant prethodi kompletnom audit tragu — ZATVORENO

**Završni dokaz:** required UUID v4 `correlationId` je unique i immutable na `BreakGlassEvent`, a grant, change log, canonical audit, system event, durable `ticket.break_glass.effects` outbox intent i uspješni idempotency rezultat nastaju u jednoj PostgreSQL transakciji. Isti correlation ID i isti canonical payload vraćaju persisted rezultat bez duplikata; payload drift stabilno pada. Frontend drži isti ID za transportni retry istog submit intenta i mijenja ga tek kada korisnik promijeni payload.
**Test:** `break-glass-command.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje paralelni retry, replay, payload mismatch, tačno jedan grant/audit/change/system/outbox zapis i rollback svih poslovnih efekata nakon faulta; CI `40225951703` potvrđuje migration replay, backend build/unit/integration, frontend i container kolekcije.
**Migracija:** `20271026030000_break_glass_atomic_boundary` backfilluje legacy grantove determinističnim UUID-em, uvodi NOT NULL + unique granicu i mora se ručno pokrenuti kroz release migrator.

### BA-tickets-03 — Bulk execute ostavlja parcijalne promjene — ZATVORENO

**Završni dokaz:** HTTP granica zahtijeva UUID v4 `operationId` i eksplicitan `atomic`/`best-effort` režim. `TicketBulkOperation` i `TicketBulkOperationItem` čuvaju immutable request hash, ordinalni item manifest, attempts, terminalni rezultat i aggregate brojače. Atomic režim izvršava sve domenske writeove, per-ticket audit/system evente, item completion, aggregate audit i persisted rezultat u jednoj transakciji; kvar vraća poslovne writeove i durable manifest označava rollback. Best-effort režim koristi bounded zasebnu transakciju po itemu, čuva tačan success/failure skup i isti operation ID ponovo izvršava samo `FAILED`/`PENDING` iteme. Uspješni itemi se ne ponavljaju, a payload drift stabilno pada. Frontend zadržava operation ID dok je submit payload isti.
**Test:** `ticket-bulk-operation.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje terminal replay, payload mismatch, manifest uniqueness, rollback item completion/resulta i failed-only best-effort resume; puni CI `40229199458` potvrđuje migration replay, backend build/unit/integration, frontend i container kolekcije.
**Migracija:** `20271026050000_ticket_bulk_operation_manifest` uvodi operation/item manifest, DB status/mode/count checkove, unique operation-item/ordinal granice i mora se ručno pokrenuti kroz release migrator.

### BA-tickets-04 — Split attachment copy pokazuje na nepostojeći blob — ZATVORENO

**Završni dokaz:** split copy više ne zapisuje sintetički `split-link/...` path. Izvorni sadržaj se čita kroz containment-validirani attachment storage, stageuje pod durable `ticket.split.attachment` intentom i u istoj DB transakciji kreira child attachment koji pokazuje na stvarni deterministični final key. Original ostaje nezavisan i čitljiv; move i dalje premješta postojeći zapis bez nepotrebnog blob kopiranja.
**Recovery:** worker-only `SplitAttachmentStorageReconciler` bounded obrađuje pending/expired promotion intentove sa lease/backoff/max-attempt semantikom centralnog storage-write protokola; više replika koriste `SKIP LOCKED` claim.
**Test:** `split-attachment-storage.integration.spec.ts` na stvarnom PostgreSQL-u i stvarnom disku injectuje promotion kvar, potvrđuje durable DB attachment + pending intent, zatim reconciliation, čitljiv child blob i očuvan parent blob. Puni CI `40231167864` potvrđuje backend/unit/integration, frontend i container kolekcije.
**Migracija:** paket ne uvodi novu migraciju; koristi postojeći `StorageWriteIntent` ugovor iz migracije `20271025230000_storage_write_protocol`.

### BA-tickets-05 — Split je parcijalan prije pune validacije — ZATVORENO

**Završni dokaz:** HTTP granica zahtijeva UUID v4 `operationId`, a frontend ga zadržava stabilnim za isti submit intent. Potpuni preflight prije prve poslovne mutacije provjerava sve message/attachment ID-jeve, konfiguracijske zabrane i višestruki move istog attachmenta. Parent, svi childovi, poruke, attachment metadata, storage intenti, događaji, SLA i assignment zapisi izvršavaju se u jednoj PostgreSQL transakciji; transaction-aware create helper uklanja nested transaction rizik. Persistirani idempotency rezultat vraća isti uređeni skup child ID-jeva pri identičnom retryu, dok payload drift stabilno pada. Attachment staging se čisti na rollbacku, a promotion počinje tek nakon commita.
**Test:** `split-attachment-storage.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje rollback ranijih child writeova nakon kasne greške, nula preostalih childova, tačno dva childa nakon uspjeha, identičan replay bez drugog izvršenja i payload mismatch. Puni CI `40233520653` potvrđuje backend build/lint/unit, stvarni PostgreSQL/Redis integration, frontend, docs i container/supply-chain kolekcije.
**Migracija:** paket ne uvodi novu migraciju; koristi postojeće `RequestIdempotency` i `StorageWriteIntent` schema ugovore.

### BA-tickets-06 — Approval decision/gate nisu concurrency-safe — ZATVORENO

**Završni dokaz:** approval decision sada conditional claimuje jedini `PENDING` red i očekivani ticket status unutar iste transakcije koja zapisuje sve change/participant/system/decision efekte. Gubitnik ne može zapisati kontradiktoran događaj. Gate conditional claimuje status, a DB unique `(ticketId, stepOrder)` garantuje jedan canonical approval po workflow koraku. Migracija fail-closed odbija legacy duplikate umjesto proizvoljnog brisanja poslovne odluke.
**Test:** `ticket-approval-concurrency.integration.spec.ts` na stvarnom PostgreSQL-u pokreće 20 paralelnih approve/reject odluka: tačno jedna uspijeva, 19 pada, ostaje jedan approval i ticket status odgovara pobjedniku; unique constraint dodatno odbija drugi red za isti korak. Puni CI `40235330066` potvrđuje migration replay/policy, backend build/lint/unit/integration, frontend, docs i container kolekcije.
**Migracija:** `20271026100000_ticket_approval_concurrency_boundary` uvodi unique ticket/step granicu i mora se ručno pokrenuti kroz release migrator; legacy duplikati zahtijevaju prethodnu eksplicitnu operatorsku popravku.

### BA-tickets-07 — CSV export može biti tih i nepotpun — ZATVORENO

**Završni dokaz:** shared visibility, confidential zabrana i tačan OU/service scope assignmenta koji nosi `audit.export` sada pripadaju istom SQL `where` predikatu prije limita. Eligible redovi čitaju se stabilnim ID cursorom u batchovima od 500. Izvoz ima eksplicitan manifest (`exportedCount`, eligible lower bound, lower-bound indikator, `truncated`, `maxRows`) u audit metadata i HTTP `X-Export-*` headerima, pa 5.000-row granica više nije tiha.
**Test:** `ticket-export-scope.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje da confidential i out-of-scope redovi ne mogu potisnuti dva kasnija eligible reda pri limitu dva. Puni CI `40237791891` potvrđuje backend build/lint/unit/integration, frontend, docs i container kolekcije.
**Migracija:** paket ne uvodi novu migraciju.
**Acceptance:** miješani >5.001 dataset izvozi kompletan eligible skup ili eksplicitno odbija kao prevelik.  
**Owner/veličina:** tickets/authorization, M.

### BA-tickets-08 — Claim-before-effect trajno guta posao — ZATVORENO

**Završni dokaz:** centralni `runGuardrailEffectTransaction` sada izvršava claim i zaštićeni efekat u istoj PostgreSQL transakciji za CSAT, waiting-for-user reminder/auto-close i closed-ticket archive. Kvar poslije claima rollbackuje claim, ticket/CSAT/change/event writeove i vraća in-memory realtime sink, pa isti fingerprint ostaje ponovljiv; uspjeh zadržava unique claim kao terminalnu deduplikaciju.
**Test:** `guardrail-effect-transaction.integration.spec.ts` na stvarnom PostgreSQL-u injectuje fault nakon claima, ticket izmjene i eventa, potvrđuje potpuni rollback i prazan sink, zatim uspješan retry sa tačno jednim claimom i efektom. Puni CI `40285216835` potvrđuje backend build/lint/unit/integration, frontend, docs i container kolekcije.
**Migracija:** paket ne uvodi novu migraciju.

### BA-tickets-09 — Attachment concurrency i cross-store nesklad

**Status: zatvoreno u W5.9 (`ad4e930`, CI `40316223173`).** PostgreSQL parent-row lock i transakcijsko ponovno brojanje atomizuju kvotu. Durable deletion intent se upisuje u istoj transakciji koja uklanja metadata; fizički remove tek nakon commita i worker lease/backoff/terminal reconciliation zatvaraju cross-store crash prozor. Stvarni PostgreSQL parallel-upload i storage fault/retry dokaz je u `implementation/36-ticket-attachment-atomic-quota-durable-deletion.md`. **P2, L, tickets/storage.**

### BA-tickets-10 — Reopen same-ticket nije atomski/idempotentan

**Status: zatvoreno u W5.10 (`7b63508`, CI `40319657162`).** Required idempotency key, payload-bound persisted replay, conditional status claim i jedna transakcija sada obuhvataju parent/children, change/event zapise i deduplicirane SLA outbox intente. Stvarni PostgreSQL parallel/replay dokaz je u `implementation/37-ticket-reopen-atomic-idempotent-boundary.md`. **P2, M/L, tickets/SLA.**

### BA-tickets-11 — Remote rate-limit race i široko čitanje

**Status: zatvoreno u W5.11 (`1447ef3`, CI `40322188627`).** DB query sada filtrira tačan remote action i čita samo deterministički najnoviji zapis; parent-row `FOR UPDATE` serijalizuje window check i event insert u jednoj transakciji. Stvarni PostgreSQL test sa 12 paralelnih zahtjeva potvrđuje tačno jedan uspjeh u `implementation/38-ticket-remote-atomic-bounded-rate-limit.md`. **P2, M, tickets.**

### BA-tickets-12 — Post-commit side effecti nisu durable

**Status: zatvoreno u W5.12 (`816da4d`, CI `40325366346`).** Transactional PostgreSQL trigger-intenti sada pokrivaju svaki committed ticket message te svaku status/priority promjenu. Worker consumeri koriste lease/backoff/dead-letter/manual replay, notification fan-out zadržava message-ID dedupe, a health snapshot izlaže pending/dead-letter/oldest-lag stanje. Stvarni PostgreSQL commit/rollback dokaz je u `implementation/39-ticket-durable-post-commit-side-effects.md`. **P2, L/XL, tickets/platform.**

### BA-tickets-13 — Workeri nemaju dosljedan batch limit

Archive i waiting-for-user `findMany` učitavaju cijelu populaciju, za razliku od time/unrouted sweepova. Dodati cursor batch, per-run budget, continuation i per-ticket error isolation. Load test mora dokazati bounded memory/runtime i napredak nakon poison ticketa. **P2, M, tickets/workers.**

### BA-tickets-14 — Duplicate guardrail nije bounded/distributed atomic

`findDuplicateTickets` čita sve requester/service tickete, a datum filtrira u memoriji. `runExclusiveGuardrail` je process-local; distinct fingerprinti mogu paralelno probiti repeat count. Premjestiti date/status/limit u DB i recent-count+claim atomizirati DB lockom/rate-limit modelom. **P2, M, tickets/data.**

### BA-tickets-15 — Saved-view max/default invarijante imaju race

Max je count-then-create; defaulti se pojedinačno čiste prije završnog create/updatea; schema ne garantuje jedan default. Uvesti transakciju i DB-enforced counter/partial unique ili serializable lock po useru. Fault/parallel test dokazuje max i tačno nula/jedan default prema zahtjevu. **P2, M, tickets/data.**

### BA-tickets-16 — Attachment I/O bufferuje do 100 MB

Multer input i storage `writeFile/readFile` koriste kompletan Buffer; svaki download vraća Buffer prije responsea. Paralelni zahtjevi množe heap pressure. Uvesti streaming upload/scan/storage/download, concurrency limit i byte/time backpressure; load test bez OOM-a. **P2, L, tickets/storage.**

### BA-tickets-17 — `sort:null` ne čisti saved-view sort

DTO dopušta null, ali `updateSavedView` mapira null u Prisma `undefined`, pa stara vrijednost ostaje. Razdvojiti omitted od explicit null i dodati contract test. **P3, S, tickets.**

### BA-tickets-18 — Visibility parity nije formalno jedinstven za sve izvedene površine

Detail/list imaju snažan shared model, ali counts, summary, export i pojedine inbox/search izvedbe kombinuju zasebne filtere. Uvesti jednu capability/predicate specifikaciju i generativnu matricu nad svim površinama. **P3, M, tickets/authorization.**

### BA-tickets-19 — Kritične race/fault grane nemaju izvršiv dokaz

Postojeći suite nema dokaz za message retry, approval race, split/storage failure, bulk partial, claim crash, remote race i export post-limit slučaj; 78 suiteova lokalno ne compilea bez generated Prisma. Dodati PostgreSQL/Redis/storage fault harness i obavezni CI shard. **P3, L, tickets/QA.**

## 12. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        6,80 |
| B. API i ugovori             |      12% |        5,80 |
| C. Auth/authz/scope          |      15% |        7,20 |
| D. Poslovna pravila/stanje   |      13% |        4,20 |
| E. Podaci/Prisma/transakcije |      13% |        3,40 |
| F. Sigurnost/privatnost      |      12% |        6,60 |
| G. Async/integracije         |       8% |        3,80 |
| H. Testovi/dokazivost        |      10% |        5,20 |
| I. Operativnost/perf.        |       7% |        4,60 |
| **Ukupno**                   | **100%** | **5,38/10** |

Ponderisani zbir je 5,382 i zaokružen na dvije decimale. Otvoreni P1 nalazi svakako ograničavaju maksimum na 7,49.

## 13. Fazni plan popravki

### Faza 0 — reprodukcija i safety net

PostgreSQL/Redis/filesystem fault harness; parallel approval/remote/upload/saved-view test; message idempotency; split broken-copy; bulk partial; export >5.001 mixed-scope; claim crash/restart; worker load. Generisani Prisma klijent i stvarna DB su obavezni.

### Faza 1 — P1 integritet i sigurnost

Message idempotency/outbox; break-glass transactional audit; bulk operation manifest; split preflight/idempotency i ispravan blob-reference/copy; approval conditional update/schema unique; export DB predicate; claim/effect state machine.

### Faza 2 — poslovni/API ugovori

Reopen conditional lifecycle, remote atomic limit, saved-view explicit-null i invarijante, visibility capability contract, stabilni partial-operation responsei i error kodovi.

### Faza 3 — podaci i transakcije

Additive migracije za idempotency keys, operation/item stanje, approval unique/version, storage deletion state/outbox, single-default enforcement i automation lease/completion. Backfill/reconciliation prije unique aktivacije.

### Faza 4 — async/integracije

Domain outbox, idempotent SLA/notification/realtime consumers, worker cursor/budgets, retry/DLQ/reconciliation, poison-item izolacija i operator-visible backlog/partial stanje.

### Faza 5 — performance, testovi i observability

Streaming attachments, query/time/byte limiti, multi-instance races, metrics za outbox lag/claim age/partial bulk/missing blob, alerti i restore/replay rehearsal. Pokrenuti svih 107 direktnih suiteova i relevantni E2E shard.

### Faza 6 — dokumentacija i finalni gate

API/idempotency/partial-state/runbook dokumentacija, migration rollback rehearsal, production dependency audit, build/lint/test/E2E na finalnom SHA-u i nova audit ocjena.

## 14. Rizik, rollback i acceptance

Najveći migracijski rizik su postojeći dupli approval/default redovi, orphan attachment metadata/blobovi i već potrošeni guardrail claimovi. Prvo napraviti read-only classifier/reconciliation i backup; schema ograničenja uvoditi additive, zatim backfill, validacija i cutover. Outbox/operation manifest uvoditi dual-write prije prebacivanja consumera. Rollback ne smije ukloniti idempotency dok postoje novi retry klijenti.

Globalni acceptance:

1. Jedan client request proizvodi tačno jednu javnu poruku kroz fault/retry.
2. Aktivni break-glass uvijek ima kompletan korelisan audit trag.
3. Bulk/split imaju stabilan operation rezultat i nema skrivenih parcijalnih child/item promjena.
4. Svaki prikazani attachment se može preuzeti ili je eksplicitno u recoverable deletion/copy stanju.
5. Paralelni approval ima jednog pobjednika i jedan pending step.
6. Export je kompletan za eligible skup ili eksplicitno odbijen kao prevelik.
7. Automation crash nakon claima se oporavlja i effect se izvrši tačno jednom efektivno.
8. Storage/DB kvarovi konvergiraju kroz reconciliation.
9. Remote limit i saved-view invarijante drže na više instanci.
10. Workeri i attachment I/O su bounded; svi ciljani testovi su zeleni.

## 15. Traceability

| Nalaz         | Primarni dokaz                                              | Faza    |
| ------------- | ----------------------------------------------------------- | ------- |
| BA-tickets-01 | `create-ticket-message.ts`, collaboration service           | 0–1/4   |
| BA-tickets-02 | confidential create + `record-confidential-access-audit.ts` | 0–1/3   |
| BA-tickets-03 | `bulk/execute-ticket-bulk.ts`, apply akcije                 | 0–1/3   |
| BA-tickets-04 | split transfer + disk storage                               | 0–1/3   |
| BA-tickets-05 | `split/split-ticket.ts` redoslijed                          | 0–1/3   |
| BA-tickets-06 | approval decide/gate + Prisma schema                        | 0–1/3   |
| BA-tickets-07 | `export/export-tickets.ts`                                  | 0–1/2   |
| BA-tickets-08 | guardrail claim + archive/waiting/CSAT                      | 0–1/3/4 |
| BA-tickets-09 | attachment create/delete/storage                            | 0–3/4   |
| BA-tickets-10 | `reopen/reopen-same-ticket.ts`                              | 0–2/4   |
| BA-tickets-11 | remote latest/request                                       | 0–2/3   |
| BA-tickets-12 | post-commit SLA/realtime/notification                       | 0–4     |
| BA-tickets-13 | archive/waiting automation services                         | 0–4/5   |
| BA-tickets-14 | duplicate query + process-local mutex                       | 0–3/5   |
| BA-tickets-15 | saved-view create/update/access                             | 0–2/3   |
| BA-tickets-16 | disk storage/controller Buffer ugovor                       | 0–5     |
| BA-tickets-17 | saved-view update null mapping                              | 0–2     |
| BA-tickets-18 | visibility/list/count/export builders                       | 0–2/5   |
| BA-tickets-19 | Jest rezultat i nedostajući race suiteovi                   | 0–5/6   |

## 16. Konačna presuda i pretpostavke

`tickets` ima dobru authorization i funkcionalnu osnovu, ali enterprise centralni zapis mora imati znatno strožiju atomskost, idempotency, cross-store recovery i bounded worker semantiku. Trenutne poruke, emergency access, bulk/split, approval, export i automation granice opravdavaju **5,38/10**.

Pretpostavke: nalazi upstream authorization/audit/settings modula ostaju otvoreni; lokalni test compile block nije funkcionalni pass; korisnikov potvrđeni Playwright 01–56 prolaz potvrđuje postojeće scenarije, ne nove fault/race slučajeve; shared outbox/worker infrastruktura biće ponovo ocijenjena u cross-cutting jedinici 44.
