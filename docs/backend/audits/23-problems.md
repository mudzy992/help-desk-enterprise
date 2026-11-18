# Backend audit 23 — `problems`

**Status:** audit završen<br>
**Datum:** 2026-10-23<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **4,21/10**<br>
**Nalazi:** 7 P1, 10 P2, 4 P3<br>
**Implementacija:** W7.1 je djelimično zatvorio `BA-problems-01`, W7.20 owner-directed `BA-problems-04`, a W7.21 `BA-problems-02`; W7.22–W7.32 zatvorili su `BA-problems-03`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13` i `14`; W7.30 je otvorio `BA-problems-20` (DB provenance whitelist za dvije nove audit akcije), a W7.31 `BA-problems-21` (nedurabilan dispatch problem notifikacija); W7.38 je zatvorio `BA-problems-20`, W7.39 `BA-problems-17`, a W7.40 `BA-problems-18`; otvoreni su ostali
P3 nalazi ovog audita.

## 1. Executive summary

`problems` implementira ITIL problem lifecycle, RCA/5-whys, known error/workaround, povezivanje ticketa/asseta/servisa/incidenata, targete po business kalendaru, bulk resolution, KB draft, notifikacije, auto-close i report/privacy integracije. Dobre osnove su DTO whitelist, DB-backed broj, optimistic version za core update/status, transakcijski event/audit na ključnim transitionima, status requirements, one-problem-per-ticket unique, confidential ticket redakcija i privacy scrub/export.

Baseline je **4,21/10**. Sedam P1 nalaza pogađaju scope, horizontalno otkrivanje i integritet masovnih operacija. `PROBLEM_MANAGER` se pretvara u globalni OU scope; linked-ticket izuzetak otvara cijeli problem i listu drugih ticketa; CMDB linkovi potpuno zaobilaze `asset.read` scope; unlink ne provjerava pristup target ticketu; `problem.close` bulk resolution preskače per-ticket authorization; problem status se commit-a prije neobnovljivog bulk ticket koraka; target reminder marker se upisuje prije dokazane isporuke.

Dodatni rizici su orphan problem pri create+link, orphan KB draft, neatomarni link eventovi, nepotpun audit, boot-only scheduler, stale group/owner eligibility i hard truncation. Svih osam direktnih suiteova je compile-blocked nepotpunim generated Prisma clientom; nijedan test nije izvršen. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 22 produkcijska TypeScript fajla;
- 8 direktnih specova;
- 3.350 aktuelnih produkcijskih LOC;
- 1 controller, 8 injectable servisa/komponenti i 1 BullMQ processor;
- Prisma: `Problem`, `ProblemTicket`, `ProblemAsset`, `ProblemService`, `ProblemIncident`, `ProblemEvent`, `ProblemSequence`;
- integracije: authorization/RBAC, groups/OU/users, tickets, assets, status-page, knowledge-base, notifications/email, reports, privacy, settings, business calendars i BullMQ;
- primarni E2E dokaz: 29–30.

Registarskih 3.372 LOC korigovano je na 3.350.

## 3. API, permission i scope model

Controller je session-guarded i koristi globalni whitelist/forbid validation pipe. Servisi provjeravaju addon, permission i direct-ID visibility. Core foreign ID je uglavnom not-found, a write operacije dodatno zahtijevaju problem-group authority.

Međutim `problemViewerOf` koristi asset viewer sa `problem.` prefiksom, a viewer namjerno označava `PROBLEM_MANAGER` kao globalan. Svaki takav assignment zato ima `scope.all`, čak i ako je assignment vezan za jedan OU. `list/get/events` tada nemaju OU filter i ne traže group membership za read. Manager jedne grupe može čitati naslove, opis, RCA, workaround, resolution, vlasnike i historiju svih problema instalacije. Group authority ograničava dio writeova, ali ne popravlja globalni read.

ADMIN assignment je također globalan neovisno o assignment OU, kao u assets auditu. Scope mora dolaziti iz assignmenta; cross-unit group rad treba biti eksplicitna capability/grant politika, ne role-name bypass.

## 4. Linked-ticket visibility i horizontalno širenje

`problemVisibilityWhere` daje puni problem svakome ko je assignee ili član assigned grupe bilo kojeg povezanog ticketa. To može biti opravdano radi workarounda, ali pristup nije field-scoped. Korisnik dobija kompletan description/RCA/5-whys/resolution, owner/creator i sve event detail podatke.

Nakon toga `listForProblem` vraća do 500 svih povezanih ticketa. Za non-confidential ticket izlaže ID/broj/naslov/status/prioritet/requestera/OU/assignee, iako viewer možda radi samo na jednom drugom ticketu. Confidential ticket rediguje title/requester, ali i dalje otkriva broj, status, prioritet, OU i assignee. Potrebna je per-ticket access projekcija: inaccessible ticket kao count/redigovan placeholder, a osjetljivi RCA/event fields po zasebnom pravu.

Reporter trajno zadržava puni read preko `createdByUserId`, čak i nakon transfera problema u foreign OU/grupu. Ta odluka treba explicitno definisati minimalna polja i lifecycle, ne automatski puni operativni zapis.

## 5. Ticket link/unlink i authorization

Link zahtijeva `problem.report`, vidljiv problem i aktuelni staff writable access za svaki ticket. DB unique na `ticketId` garantuje da ticket pripada najviše jednom problemu. Problem event i ticket system event nastaju u istoj transakciji. Ovo je dobra osnova.

Unlink ne poziva `staffTicket` prije deletea. Dovoljno je imati `problem.report` i vidljivost problema; korisnik koji radi na jednom linked ticketu može ukloniti bilo koji drugi link ako sazna ticket ID. Tek poslije transakcije pokušava učitati ticket radi realtime publisha. Authorization mora biti ponovljen prije writea i vezan za isti zaključani ticket/link state.

Create endpoint prvo transakcijski kreira problem, zatim controller odvojeno linkuje `ticketIds`. Partial skip/failure vraća već kreiran problem; potpuni neuspjeh može ostaviti orphan problem i potrošen sequence. Ako je UX ugovor „create from selected tickets“, potrebna je jedna command transakcija ili eksplicitan partial rezultat/compensation.

Povezivanje ticketa na `RESOLVED` problem označava recurrence, ali `CLOSED` nije linkable iako notifier recurrence prihvata CLOSED. Ugovor i komentar nisu usklađeni.

## 6. Bulk ticket resolution

`problem.close` se tretira kao delegacija za svaki linked ticket „whatever unit it came from“. Kada viewer ima permission, `candidates` potpuno preskače `loadAccessibleTicket`; group membership nad problemom postaje pravo preuzimanja i rješavanja svih ticketa, uključujući confidential/foreign ticket kojem viewer više nema pristup. Istorijski pristup linkera nije dovoljan authorization dokaz za kasnijeg managera. Delegacija mora biti scope-aware, eksplicitno zabilježena i provjerena po ticketu u trenutku writea.

Controller prvo commit-a problem transition u `RESOLVED`, pa tek zatim poziva `resolveTickets` ticket po ticket. Crash/timeout između koraka ostavlja problem riješenim i sve tickete otvorenim. Ako svi ticket updateovi padnu, API ipak vraća problem kao RESOLVED sa failed listom. Nema zasebnog retry endpointa; ponavljanje status zahtjeva pada kao invalid same-state transition. Operator mora reopen pa ponovo resolve, mijenjajući target/history/notifikacije.

Unutar loopa ticket status se mijenja prije requester poruke. Message failure ostavlja ticket RESOLVED bez obećane poruke i samo `messageSent=false`; nema durable retry taska. Potreban je persisted resolution command/run sa item statusima, idempotency keyem, retry/resume API-jem i jasno definisanim problem completion kriterijem.

## 7. Core lifecycle, concurrency i audit

Problem sequence koristi atomic SQL upsert/increment. Create event i global audit su u transakciji. Update/status koriste version predicate; status zahtijeva owner/RCA/category/workaround/resolution prema transitionu. Auto-close koristi status+version CAS i transactional audit.

General update emitira `ProblemEvent`, ali ne globalni audit. Claim također nema globalni audit. Owner/group/OU/service/RCA promjene zato nisu u kanonskom audit logu iako status jeste. Long text event bilježi samo naziv promijenjenog polja, što je dobro za minimizaciju, ali audit policy mora razlikovati forensic metadata i osjetljivi sadržaj.

**W7.30:** update i claim sada pišu `problem.updated`/`problem.claimed` u istoj transakciji, sa top-level OJ scopeom i actorom kao `create`/`changeStatus`. Metadata nosi `changedFields`, `textChanged` i `previous*`/trenutne vrijednosti samo za reference i klasifikacije; sadržaj descriptiona/RCA/workarouna/resolutiona se ne kopira. DB provenance trigger i dalje ne poznaje dvije nove akcije — to je `BA-problems-20` (P2), jer whitelist živi u već primijenjenoj migraciji.

Group authority se provjerava nad pre-update grupom. Manager stare grupe može premjestiti problem u bilo koju drugu problem grupu, jer se target group membership/authority ne provjerava. Nakon toga može odabrati ownera iz nove grupe. To je cross-group handoff bez prihvata ili target-group authorityja.

Owner eligibility query provjerava aktivnost, membership i da korisnik negdje kroz neku rolu ima `problem.manage`, ali ne da permission assignment pokriva problem OU/target grupu. Kasniji role/group revoke ne uklanja ownera niti automatski zaustavlja target notifikacije toj osobi.

## 8. Asset, service i incident veze

CMDB feature switch se provjerava, ali `searchAssets`, suggestions, `linkAssets` i get linked assets nikad ne zahtijevaju `asset.read` niti koriste asset OU scope. Problem manager može pretraživati installation-wide asset tag/name/serial, vidjeti tip/OU/status i vezati arbitrary asset po ID-u. Ovo direktno zaobilazi assets authorization granicu. Reverse asset endpoint filtrira problem scope, ali ne popravlja forward leak.

Service i status-page incident pickeri su također installation-wide. Ako ti domeni imaju service/OU visibility, mora se koristiti njihov access policy. Problem group authority sama po sebi nije pravo nad svim servisima i incidentima.

Asset link create+event je transakcijski. Unlink asset te service/incident link/unlink rade business write pa odvojeni event; event failure ostavlja promjenu bez historije ili klijentu vraća grešku nakon uspješnog writea. Sve veze trebaju isti transactional mutation+event obrazac.

Liste linkova koriste hard 200 bez `hasMore`; suggestions mogu sadržati foreign assete izvedene iz ticketa drugih korisnika.

## 9. Knowledge article lifecycle

Draft builder scrubuje poznate osobe iz problema/ticketa i kreiranje prolazi kroz centralni KB authorization. Link na problem koristi conditional `knowledgeArticleId=null`, event i global audit u transakciji.

Sam KB article se ipak kreira prije problem transakcije. Dva concurrent zahtjeva mogu oba kreirati draft; samo jedan pobjeđuje conditional link, dok drugi ostaje orphan draft u knowledge-baseu. I običan DB/audit failure nakon article createa ostavlja isti orphan. Potreban je idempotency key/unique problem draft relation ili compensation delete sa reconciliationom.

**W7.27:** članak, njegov change-log red, conditional link, problem event i audit sada su jedna transakcija (`createKnowledgeArticle` prima pozivaočev `Prisma.TransactionClient` i ne otvara ugniježđenu transakciju), pa pad linka/eventa/audita ili gubitak trke poništava i draft. Ponovljeni submit i gubitnik trke replayaju povezani članak sa 200 (`existingArticle`), a `PROBLEM_ARTICLE_EXISTS` ostaje za `GET …/draft`. Legacy orphan draftovi se, po odluci vlasnika, ne čiste.

Problem može promijeniti service/OU nakon kreiranja članka, bez politike synca; to može ostaviti članak u drugačijem scopeu od izvornog problema. Article link je one-way i nema unlink/replacement lifecycle.

## 10. Target, reminders, notifications i scheduler

Target koristi aktivan business-hours kalendar, timezone/civil days, holidaye i priority working-day konfiguraciju. Priority promjena rearmira target; reopen računa novi target. Notification koristi preference policy, in-app dedupe i centralni durable email delivery helper.

Sweep marker je upisan **prije** `targetDue`. Komentar eksplicitno bira gubitak umjesto duplikata. Crash, nula recipienta, deaktiviran owner, sve preference OFF, notification DB failure ili email-only failure ostavljaju stage trajno označenim. Marker mora značiti persisted/delivered policy outcome, a ne započet pokušaj. Potreban je outbox/delivery state po problem+target+stage+recipient i retry/dead-letter reconciliation.

**W7.25 (zatvoreno, vidi §26):** podsjetnik je sada durable red `ProblemTargetReminder` po problemu, targetu i stageu. Red se piše prije pokušaja i claim-uje atomski, a `Problem.targetRemindersSent` se dodaje tek nakon terminalnog ishoda: `SENT` (barem jedan primalac je dobio in-app ili e-mail) ili `NO_RECIPIENT` (politika nije ostavila primaoca — konačan ishod, bez retryja). Pad isporuke je `FAILED` sa backoffom 2/10/60/240 min i `DEAD` poslije pet pokušaja, uz ručni retry za `problem.manage`. Ponovno slanje je bezbjedno zbog stabilnih dedupe ključeva u notifikacijama i e-mail ledgeru.

Owner/group/status notifikacije koriste `Date.now()` u occurrence ključu. Retry istog poslovnog događaja dobija novi dedupe key i može duplirati poruke; event/version ID treba biti stabilni occurrence. Fire-and-forget greška se samo loguje i nema durable recoveryja.

**W7.31:** occurrence se više ne čita sa sata. Vlasnik/grupa/status nose verziju koju je write proizveo (`v<n>`), create nosi `created`, handoff svoj `handoffId`, runda rješavanja `run:<id>:<status>`, podsjetnik `stage`+`targetAt`, a rekurencija SHA-256 digest referenci tiketa (bez identifikatora u payloadu). Isti događaj zato uvijek daje isti ključ, pa retry pronalazi postojeći in-app red i ledger red umjesto nove poruke; dedupe je po primaocu, pa resume runde obavještava samo novo riješene agente. Fire-and-forget dio nalaza nije mijenjan — sada je evidentiran kao `BA-problems-21` (P3), sa stabilnim occurrence-om kao ispunjenim preduslovom.

Scheduler registruje hourly job samo na module init. Stable scheduler ID pomaže kod normalnog restarta, ali Redis flush/restart poslije boota se ne reconciliuje do redeploya. Registracijska greška se guta. Nema health provjere scheduler presence, last sweep/auto-close age, overdue backlog ni notification delivery drift.

**W7.32 (zatvoreno, vidi §33):** scheduler se više ne registruje samo na bootu. Svaki worker
svake minute provjerava postoji li `problem-sweep-hourly` u Redisu i vraća ga ako ga nema
(`upsertJobScheduler` je idempotentan po ID-u), pa Redis flush/failover više ne zaustavlja
podsjetnike i auto-close do redeploya. Registracijska greška nije bila „progutana“ u kodu koji je
audit opisao — `onModuleInit` je bacao i boot je padao — ali nije bilo nikakvog oporavka poslije
boota; sada se neuspjeli reconcile loguje i ponavlja svake minute, a boot i dalje pada ako
obavezni raspored ne nastane. Health: sweep je u `ops-health` očekivani scheduler, pa
`scheduler.late` pokriva `not_registered`, `not_picked_up`, `failing` i `no_recent_success` sa
granicom od 75 minuta (zadnji sweep i, s njim, zadnji auto-close). Delivery drift ima vlastiti
alarm `problems.reminders.stuck` (DEAD redovi, istekao backoff, preuzimanje srušenog ciklusa, uz
starost najstarijeg), a prekoračeni rokovi putuju kao detalj alarma i ostaju metrika reporta
`problem_backlog` — prag za njihov vlastiti alarm nije izmišljen.

## 11. Privacy, retention i data exposure

Privacy anonymization pronalazi probleme gdje je osoba creator/owner ili je njen ticket u scrub scopeu, scrubuje glavne tekstove, 5-whys i event detail. Export uključuje probleme gdje je osoba reporter/owner i njene actions. To je vrijedna integracija.

Coverage je ipak heuristic: tekst može imenovati osobu koja nije creator/owner/requester povezanog ticketa i tada problem neće ući u scrub skup. Problem events s identitetom drugih osoba scrubuje se samo ako je problem već odabran. Notifier body/email i KB draft mogu replicirati problem title/RCA izvan problem retention granice.

Nema problem retention/tombstone politike. DB cascade briše events i veze samo ako se problem fizički izbriše, ali API delete ne postoji. Closed/cancelled zapisi, event JSON i link metadata ostaju neograničeno. Potrebna je eksplicitna ITSM/legal retention politika i provjera pseudonymized owner/creator prikaza.

**W7.34 (zatvoreno, vidi §35):** sve četiri tačke su zatvorene bez migracije. Anonimizacija sada bira
problem i po **imenovanju u tekstu**: `problem-mentions.ts` gradi filter iz istih identiteta i pragova
koje scrubber zamjenjuje (adresa, lokalni dio ≥ 5, DN, login ≥ 4, puno ime u oba redoslijeda), eventi se
traže jednim ograničenim `ILIKE` upitom nad `detail::text`, a `scrub-problem-mentions.ts` scrubuje i
in-app kopije problema (`payload.problemId`) i članak baze znanja koji je problem napravio. Replike više
ne izlaze iz granice: obavještenje nosi samo `broj · naslov` (≤ 500) i pokazivač na problem, e-mail se
ne pohranjuje (ledger čuva primaoca i status, ne tijelo), a nacrt članka se redaktuje zajedno s
problemom — objavljeni članak ima svoj životni ciklus i dira ga samo anonimizacija, i to tako što mijenja
identitete. Nova retention kategorija `problemContent` (default 0, minimum 180 dana, obavezan probni
prolaz, poslije `ticketContent` u noćnom redu) redaktuje naslov, opis, uzrok, 5-zašto, zaobilazno
rješenje, rješenje i razlog otkazivanja, razloge predaje, poruke resolution runa, event `detail`, kopije
u obavještenjima i nacrt članka, a **kostur** (broj, status, datumi, grupa, jedinica, usluga, veze)
ostaje za reporte i pretragu. Pravna blokada vlasnika, kreatora ili povezanog tiketa preskače problem.
Pseudonimizirani prikaz je provjeren čitanjem: ime vlasnika i kreatora se nigdje ne denormalizuje, nego
se čita kroz `userSelect`, pa pseudonim odmah zamijeni ime na svim mjestima.

## 12. Pagination, resource i operativnost

Glavni register ima bounded cursor i total. Events uzima 200, linked tickets 500, links 200, reverse links 50, notifier candidates 2.000 i options 2.000 bez `hasMore` ili paginationa. `listForProblem.total` je zapravo dužina trunciranog rezultata, pa može lažno tvrditi ukupno 500.
**W7.39:** tihe granice su zatvorene (§37) — svaka lista se čita sa `limit + 1` i vraća `hasMore`, a
`listForProblem.total`/`open` se broje. Namjerno ograničeni ostaju `searchIncidents` (`take: 200`, W7.29) i
notifier kandidati (interni skup primalaca, ne lista koju korisnik čita).

Bulk resolution radi sekvencijalne ticket access/update/message pozive do konfigurisanog limita; konfiguracija se samo provjerava kao integer, bez lokalnog min/max clampa u loaderu. Pogrešna setting vrijednost može povećati latency/resource pritisak. Sweep batch 500 obrađuje svaki red sekvencijalno i nema oldest-overdue/starvation metriku.

**W7.40:** granice su zatvorene (§38) — jedan izvor granica (`problemSettingBounds`) koristi i validacija pri pisanju i klamp pri čitanju, pa red van granica ne odlučuje o resursima zahtjeva; sweep ima vremenski budžet po ticku, dokaz punog batcha (`batch + 1`) i `deferred`/`budgetReached` u ishodu; health signal nosi starost najstarijeg prekoračenog roka i auto-close zaostatka, a ne samo brojeve. Starvation metrika je starost, ne zbir.

## 13. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/problems -name '*.spec.ts' -print | sort)
```

Rezultat: **0/8 suiteova izvršeno; 8/8 compile-blocked; 0 testova izvršeno**. Primarna blokada je `Cannot find module '../../generated/prisma/client'`, zatim nedostajući `problem`, `problemTicket`, `problemAsset`, `serviceIncident`, `businessHoursCalendar`, `user`, `ticket` i `$transaction` delegati. Nije bilo prilike za assertion rezultat.

Specovi nominalno pokrivaju access, links, resolution, rules, target, tickets, controller query i reminder plan. E2E 29 provjerava report packove i a11y; E2E 30 prolazi happy lifecycle kao SUPER_ADMIN, agent deny, optimistic stale update, requirements, bulk resolve, recurrence i a11y.

Nisu pokriveni scoped problem manager/global read, linked-one-ticket cross-ticket exposure, foreign asset search/link, unauthorized unlink, delegated foreign/confidential ticket resolve, crash između problem/ticket resolution, all-failed retry, reminder delivery failure, concurrent article orphan, target-group handoff, Redis loss ni hard truncation.

## 14. Pozitivni nalazi

1. Session guard i strict DTO whitelist.
2. Addon + problem-group activation gate.
3. Atomic DB sequence i formatiran broj.
4. Core create/status event i audit su transakcijski.
5. Update/status imaju optimistic version conflict.
6. Jasna transition matrica i required RCA/workaround/resolution.
7. One-problem-per-ticket je DB unique.
8. Link ticket provjerava aktuelni staff writable access.
9. Ticket system event i problem link event nastaju atomarno.
10. Confidential ticket title/requester se rediguju.
11. Business-calendar target je timezone/DST-aware.
12. Auto-close ima status/version CAS i audit.
13. Notification preference i durable email helper se koriste.
14. KB create koristi centralni authorization i scrubber.
15. Privacy export/anonymization imaju problems integraciju.
16. Glavni register ima cursor, limit i total.

## 15. Registar nalaza

| ID             | Severity | Nalaz                                                                                         | Status   |
| -------------- | -------- | --------------------------------------------------------------------------------------------- | -------- |
| BA-problems-01 | P1       | PROBLEM_MANAGER i scoped ADMIN role-name bypass daju globalni OU read scope                   | zatvoreno |
| BA-problems-02 | P1       | Pristup jednom linked ticketu otkriva puni problem i metapodatke svih drugih ticketa           | zatvoreno (W7.21) |
| BA-problems-03 | P1       | Asset search/link/get zaobilaze `asset.read` i CMDB OU scope                                  | zatvoreno (W7.22) |
| BA-problems-04 | P1       | Ticket unlink ne provjerava aktuelni staff access nad ticketom koji uklanja                    | zatvoreno (W7.20 owner-directed) |
| BA-problems-05 | P1       | `problem.close` bulk resolve preskače per-ticket authorization za sve linked tickete           | zatvoreno (W7.23) |
| BA-problems-06 | P1       | Problem se commit-a RESOLVED prije bulk ticketa bez durable retry/resume putanje               | zatvoreno (W7.24) |
| BA-problems-07 | P1       | Target reminder marker se upisuje prije primaoca i potvrđene/persistirane isporuke             | zatvoreno (W7.25) |
| BA-problems-08 | P2       | Create problem + početni ticket link nije atomski i može ostaviti orphan problem               | zatvoreno (W7.26) |
| BA-problems-09 | P2       | KB article nastaje prije conditional linka i concurrent/failure put ostavlja orphan draft      | zatvoreno (W7.27) |
| BA-problems-10 | P2       | Stara grupa može predati problem novoj grupi bez target-group authority/acceptance              | zatvoreno |
| BA-problems-11 | P2       | Service/incident linkovi nemaju njihov scope policy; više link writeova nije atomsko s eventom  | zatvoreno |
| BA-problems-12 | P2       | Claim/general update nemaju kanonski globalni audit                                            | zatvoreno (W7.30) |
| BA-problems-13 | P2       | Owner/group/status notice occurrence koristi vrijeme i nije stabilno idempotentan               | zatvoreno (W7.31) |
| BA-problems-14 | P2       | Scheduler nema reconciliation/health nakon Redis gubitka ili registration failurea             | zatvoreno (W7.32) |
| BA-problems-15 | P2       | Owner eligibility ne veže manage grant za problem OU i ne reconciliuje revoke drift            | zatvoreno (W7.33) |
| BA-problems-16 | P2       | Privacy/retention ne pokrivaju sva imenovanja, notifier/KB replike i closed-record lifecycle    | zatvoreno (W7.34) |
| BA-problems-17 | P3       | Events/tickets/links/reverse/options liste se tiho hard-trunciraju; total može biti netačan     | zatvoreno (W7.39) |
| BA-problems-18 | P3       | Bulk/sweep setting i sekvencijalni rad nemaju potpune resource/health granice                   | zatvoreno (W7.40) |
| BA-problems-19 | P3       | Svih osam direktnih suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica      | otvoreno |
| BA-problems-20 | P2       | DB provenance trigger whitelist ne pokriva `problem.updated`/`problem.claimed`                  | zatvoreno (W7.38) |
| BA-problems-21 | P3       | Problem notifikacije su fire-and-forget: nema outbox/replay intencije ni retryja                | otvoreno |

## 16. Ključne korekcije

- **01:** zatvoreno u W7.1 — assignment-derived OU scope, bez role-name global bypassa; detalj u [implementacijskom dokazu](../implementation/87-domain-assignment-scope.md).
- **02:** minimal linked-ticket problem projection i per-ticket access/redaction prije liste.
- **03:** zatvoreno u W7.22 — `asset.read` + asset OU scope za search, suggestions, link, linked shape, reverse karticu i asset dio historije (vidi §23).
- **04–05:** aktuelni ticket policy na svaki unlink/resolve; W7.23 je delegaciju sveo na povezane ne-povjerljive tikete uz `RESOLVED` problem, problem permisije/OU i group authority, provjereno po tiketu pri upisu (vidi §24).
- **06:** persisted bulk-resolution run/item state, idempotency, resume endpoint i completion policy.
- **07:** zatvoreno u W7.25 — durable `ProblemTargetReminder` red (novi tabela + add-only migracija
  `20271130250000_problem_target_reminders`), claim fence, marker samo po terminalnom ishodu (`SENT`/`NO_RECIPIENT`),
  `NO_RECIPIENT` kao konačan politički ishod, automatski retry/dead-letter u satnom sweepu i ručni
  `POST /problems/:id/target-reminders/:reminderId/retry` (vidi §26).
- **07, 13:** outbox/delivery state i stabilni business event occurrence ključevi.
- **08:** zatvoreno u W7.26 — create problem i početni ticket linkovi su jedna transakcija; djelimičan batch
  ostaje `ticketLinks.skipped`, a kad nijedan tiket ne može biti linkovan cijela komanda se poništava
  (409 `PROBLEM_TICKETS_NOT_LINKED`, bez problema i bez potrošenog sequence broja). Create prima opcioni
  `clientRequestId` sa unique `(createdByUserId, clientRequestId)` i replaya isti problem (vidi §27).
- **09:** KB idempotency/unique problem draft i orphan reconciliation.
- **10–12:** target-group acceptance/authority, transactional link event i potpuni global audit.
- **14–16:** scheduler reconcile/health, eligibility reconciler te formalni privacy/retention lifecycle.
- **17–19:** cursor/hasMore, clamped resource settings i puna Postgres/Redis/fault-injection test matrica.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,20 |
| B. API i ugovori             |    12% |   5,10 |
| C. Auth/authz/scope          |    15% |   3,50 |
| D. Poslovna pravila/stanje   |    13% |   4,40 |
| E. Podaci/Prisma/transakcije |    13% |   4,60 |
| F. Sigurnost/privatnost      |    12% |   4,20 |
| G. Async/integracije         |     8% |   3,70 |
| H. Testovi/dokazivost        |    10% |   3,00 |
| I. Operativnost/perf.        |     7% |   4,00 |
| **Ukupno**                   | **100%** | **4,21/10** |

Ponderisani zbir je 4,207. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 18. Fazni plan

### Faza 0 — safety net

Scoped manager/global read; linked-one-ticket cross-ticket fields; foreign asset search/link; unauthorized unlink; delegated ticket resolve; crash/all-fail bulk resolution; reminder no-recipient/failure; concurrent article; group handoff; Redis flush.

### Faza 1 — P1 authorization

Assignment scope, linked-ticket minimal projection, per-ticket access na list/unlink/resolve i CMDB/service/incident domain policy reuse.

### Faza 2 — P1 workflow recovery

Persisted bulk resolution state machine i durable reminder/outbox marker sa retry/resume/reconciliationom.

### Faza 3 — transaction i audit

Atomic create+links, KB idempotency/cleanup, link+event transakcije, claim/update audit i target-group handoff pravilo.

### Faza 4 — scheduler, eligibility i privacy

Scheduler reconciliation/health, stale owner/group reconciliation, stable notification dedupe i retention/anonymization coverage.

### Faza 5 — API completeness i finalni gate

Cursor/hasMore, truthful totals, resource clamp/metrics, regenerated Prisma client, svih 8 suiteova i E2E 29–30 plus Postgres/Redis/fault-injection testovi na finalnom SHA-u.

## 19. Acceptance i konačna presuda

1. Nijedan role assignment ne postaje globalan bez eksplicitnog globalnog scopea.
2. Linked-ticket izuzetak ne otkriva druge ticket/requester/OU ili osjetljivi RCA sadržaj.
3. Asset/service/incident veza poštuje authorization izvornog domena.
4. Link/unlink/resolve svaki put provjerava aktuelni ticket access ili eksplicitnu scoped delegaciju.
5. Bulk resolution se može sigurno nastaviti nakon crasha i ne proglašava problem završenim mimo policyja.
6. Reminder stage ostaje retryable dok ne postoji dokaziv delivery outcome.
7. Create/link/article/link-event operacije nemaju orphan ni history gap.
8. Group handoff i owner eligibility su scoped, prihvaćeni i reconciled nakon revokea.
9. Scheduler se sam oporavlja, privacy/retention pokriva replike, a liste ne trunciraju tiho.
10. Svih 8 direktnih suiteova, concurrency/failure integracije i E2E 29–30 prolaze.

Modul ima dobru lifecycle i optimistic-concurrency jezgru, ali njegove cross-domain prečice trenutno proširuju čitanje i write autoritet izvan prihvatljive enterprise granice. Bulk resolution i reminder delivery nisu crash-recoverable. Iskren baseline je **4,21/10**.

## 20. Implementacijski closeout — W7.1 (`BA-problems-01`)

Na SHA `49c6559949606ebd87c867f37fe2ce9f0363d1c0`, uz zeleni CI `40911525016`, `ProblemAccessService.require()` vraća assignment OU za scoped `ADMIN` i `PROBLEM_MANAGER`; cross-unit manager scope ostaje podržan samo za installation-wide assignment. Problem-group authority pravilo nije promijenjeno. Nema nove migracije; baseline ostaje audit snapshot, a preostali P1 nalazi su otvoreni. Zajednički testni i CI dokaz: [87-domain-assignment-scope.md](../implementation/87-domain-assignment-scope.md).

## 21. W7.20 — BA-problems-04 owner-directed closeout

Uklanjanje veze sada prije upisa provjerava target ticket staff/writable policy unutar transakcije nakon zaključavanja reda; status problema se ponovo čita pod zaključavanjem, a delete i oba događaja su transakcijski. Korisnik je potvrdio vizuelne P1/P2/P3 DA i odobrio zatvaranje. CI [43848770196](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43848770196) na `e131879` je success uz skipped E2E/inventory; pojedinačni DB log nije dostupan zbog EOF. Šira HTTP/role/scope matrica i atomska revokacija nisu dokazani, korisničko treperenje u UI-ju ostaje zaseban follow-up. Detalji i ograničenja su u [239](../implementation/239-w720-problem-ticket-unlink.md); ostali nalazi ostaju otvoreni.

## 22. W7.21 — BA-problems-02 closeout

Puni problem, analiza i historija sada su dostupni samo unutar `problem.read` OU opsega; linked-ticket i reporter bypass su uklonjeni. Ticket-predikat se primjenjuje prije limita i agregiranja (lista povezanih tiketa, brojači liste/detalja, resolution preview/izvršenje, CMDB prijedlozi, report packovi i zakazani prilozi po primaocu). Ticket radnik izvan opsega dobija minimalnu karticu s workaroundom, bez linka na problem i bez odvezivanja. Historija problema skriva nedostupne događaje, `tickets_resolved` agregate i nepoznate akcije; ticket historija više ne nosi identitet problema, a stari zapisi se rediguju pri čitanju. Notifikacije se isporučuju samo primaocima s trenutnim `problem.read` opsegom, bez brojeva tiketa u recurrence sadržaju. Privacy izvoz i change veze slijede isti opseg prema odluci vlasnika.

Korisnik je potvrdio vizuelne provjere P1/P2/P3/P4 svim **DA** i odobrio zatvaranje. CI [`43872624265`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43872624265) na SHA `fb41c66` je **success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju, frontend build/test, docs, container/supply-chain i CI gate; E2E critical/install, inventory i uslovni image enforcement bili su `skipped`. Nema migracije. Historijski već isporučene notifikacije/e-mailovi i ranije izgrađeni privacy ZIP-ovi nisu retroaktivno redigovani; potpuna HTTP role matrica i TOCTOU između previewa i izvršenja nisu posebno testirani. Detalji, svi commitovi i lokalna ograničenja su u [241](../implementation/241-w721-problems-02-closeout.md); ostali nalazi ostaju otvoreni.

## 23. W7.22 — BA-problems-03 closeout

CMDB veze problema sada prolaze kroz drugu autorizacionu granicu: `problemAssetAccess` traži aktuelni `asset.read` grant i računa opseg preko `Asset.organizationalUnit.ouPath` (put + podputevi), sa fail-closed ponašanjem za neaktivnog/nepostojećeg principala i nemogućim predikatom za prazan opseg. Globalni `problem.*` grant se ne pretvara u globalni CMDB grant. Filtriranje se primjenjuje prije limita i agregiranja na svim forward površinama: `searchAssets`, `suggestAssets` (ticket-derived prijedlozi), `linkAssets`, `get` linked assets i `unlinkAsset`; reverse `forAsset` kartica sada traži i čitljivost samog asseta, a historija problema prikazuje `asset_linked`/`asset_unlinked` samo za čitljive assete. Strani asset daje `PROBLEM_ASSET_NOT_FOUND` pri vezanju/odvezivanju, bez promjene stanja i bez događaja.

Service i status-page incident pickeri iz §8 nisu mijenjani; oni pripadaju `BA-problems-11` (service/incident scope policy i transakcioni link obrazac). Nema migracije i nema promjene API shape-a.

CI [`43883895790`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43883895790) na SHA `d8175a6` je **success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju (sa novom `problem-asset-scope.integration.spec.ts`), frontend, docs, container/supply-chain i CI gate; E2E critical/install, inventory i uslovni image enforcement bili su `skipped`. Zatvaranje nalaza čeka korisničku vizuelnu provjeru. Detalji, rizici i lokalna ograničenja su u [242](../implementation/242-w722-problem-asset-scope.md) i [243](../implementation/243-w722-problems-03-closeout.md).

## 24. W7.23 — BA-problems-05 closeout

Group rješavanje problema više ne tretira `problem.close` kao ticket-wide bypass. Nova provjera `assertProblemDelegation` (tickets modul) izvršava se u svakoj write putanji (`loadAccessibleTicket`, `getTicket`, `updateTicket`) i prije takeover upisa: tiket mora biti stvarno povezan s tim problemom, problem mora biti `RESOLVED`, korisnik aktivan, mora imati `problem.read`/`problem.manage`/`problem.close` u OU problema i autoritet u problem grupi (installation-wide ADMIN/SUPERADMIN preskaču članstvo, ne permisije). Povjerljivi tiketi nikad nisu pokriveni delegacijom — traže vlastiti ticket/confidential pristup, u previewu se prikazuju kao `no_access`, a delegirani upis se u historiji tiketa bilježi razlogom `ticket_problem_resolution`. Cross-OU rješavanje povezanih tiketa ostaje moguće prema odluci vlasnika.

CI [`44043856970`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44043856970) na SHA `e77e1e6` je **success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju (nova `problem-delegation.integration.spec.ts`), frontend, docs, container/supply-chain i CI gate; E2E critical/install, inventory i uslovni image enforcement bili su `skipped`. Nema migracije. Zatvaranje nalaza čeka korisničku vizuelnu provjeru. Durable retry/resume bulk rješavanja ostaje `BA-problems-06`. Detalji su u [244](../implementation/244-w723-problem-delegation.md) i [245](../implementation/245-w723-problems-05-closeout.md).

## 25. W7.24 — BA-problems-06 closeout

Group rješavanje je sada durable run, ne jedan best-effort prolaz. `ProblemResolutionRun` i `ProblemResolutionRunItem` (nova add-only migracija `20271130240000_problem_resolution_runs`) zapisuju se **prije** promjene statusa problema i prije prvog ticket upisa; svaki item ima vlastiti status, `attempts`, `retryable` i `messageSent`, a `runId` je klijentski idempotency ključ (isti ključ + payload replay-a, drugi payload daje `PROBLEM_RESOLUTION_RUN_CONFLICT`, tuđi problem `PROBLEM_RESOLUTION_RUN_NOT_FOUND`). Poruka podnosiocu ide kroz `createMessage` s ključem `${runId}:${ticketId}`, pa ni ponovni poziv ni Resume ne prave duplu poruku ni duplu promjenu statusa. Item se claim-uje atomski, stale `RUNNING` iz crasha se dovršava (samo poruka ako je tiket već `RESOLVED`), a `PROCESSING` run iz crasha Resume sam dovršava uključujući `RESOLVED` problema. Problem se i dalje postavlja `RESOLVED` odmah, ali run smije ostati `PARTIAL`: status sheet i nova kartica na detalju problema prikazuju „Rješavanje povezanih tiketa nije dovršeno“ i nude **Nastavi rješavanje** dok svi itemi nisu terminalni. Nema schedulera/sweepera (odluka `manual`). W7.23 delegacija ostaje na snazi po tiketu.

CI [`44050719920`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44050719920) na SHA `0eaf4a1` je **success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju, frontend (lint/format/test/build/budget), docs, container/supply-chain i CI gate; E2E critical/install, read-only inventory i uslovni image enforcement bili su `skipped`. Zatvaranje nalaza čeka korisničku vizuelnu provjeru. Detalji, neuspjeli pokušaji i lokalna ograničenja su u [246](../implementation/246-w724-problem-resolution-runs.md) i [247](../implementation/247-w724-problems-06-closeout.md). `BA-problems-07` ostaje sljedeći P1 u ovom auditu.

## 26. W7.25 — BA-problems-07 closeout

Podsjetnik na rok više nije marker koji prethodi isporuci. `ProblemTargetReminder` (nova add-only migracija
`20271130250000_problem_target_reminders`) čuva red po `problemId+targetAt+stage` sa statusom, `attempts`,
`nextAttemptAt`, `lastErrorCode` i brojačima `deliveredCount`/`recipientCount`. Red se kreira **prije** pokušaja,
claim-uje se atomski (`updateMany`, stale claim stariji od 30 min se preuzima) i finalizuje samo dok je `CLAIMED`.
`Problem.targetRemindersSent` se dodaje **nakon** terminalnog reda i to samo za ishod `SENT` (barem jedan primalac je
dobio in-app notifikaciju ili e-mail) ili `NO_RECIPIENT` — odluka vlasnika je da je nula primalaca konačan ishod
politike: marker se upisuje, retryja nema, a `attempts` i razlog ostaju zapisani. Pad isporuke je `FAILED` sa
backoffom 2/10/60/240 min, peti neuspjeh je `DEAD`, a satni sweep i `POST /problems/:id/target-reminders/:reminderId/retry`
(vraća budžet na jedan pokušaj, traži `problem.manage` u OU opsegu i group authority) ga mogu ponoviti. Ponovno
slanje ne duplira notifikacije: in-app ključ `problem:problem.targetDue:<problemId>:<stage>:<targetAt>` i e-mail
`NotificationEmailDelivery[userId, dedupeKey]` ostaju stabilni. `ProblemNotifier.targetDueDetailed` sada vraća
ishod (`delivered`/`recipients`/`failures`/`errorCode` sa kodovima iz e-mail ledgera) umjesto golog broja, pa sweep
loguje `reminders_sent/no_recipient/failed/dead/cancelled`. Detalj problema prikazuje redove tekućeg targeta
(bs/en) i nudi ručni retry sa inline alertom i danger toastom na neuspjeh. Ako proces padne između terminalnog reda i
markera, sljedeći sweep popravi marker iz reda bez ponovnog slanja. W7.23 delegacija i W7.24 group rješavanje nisu
mijenjani.

CI [`44069568731`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44069568731) na `61a1491` je
**success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju (nova migracija
kroz release migrator), frontend (lint/format/testovi/build/budget), docs, container/supply-chain i CI gate; E2E
critical/install i read-only inventory bili su `skipped` (push workflow ih ne pokreće). Prvi pokušaj
[`44066907484`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44066907484) na `1516498` pao je zbog
vlastitih grešaka u testovima (konstruktor kontrolera sa šest argumenata, fake `findUnique` samo po composite ključu,
`role="alert"` dvaput u frontend testu). Detalji su u [248](../implementation/248-w725-problem-target-reminders.md).
`BA-problems-08` je sljedeći P2 u ovom auditu.

## 27. W7.26 — BA-problems-08 closeout

`POST /problems` više nije dvije komande. `ProblemsService.create` u **istoj** transakciji upisuje sequence broj,
problem, `ProblemEvent` `created`, audit red i prve ticket linkove (`ProblemTicketsService.linkInTransaction`), pa
pad linka, pad procesa između koraka ili ponovljeni zahtjev ne mogu ostaviti orphan problem. Nedostupni tiketi
zadržavaju iste razloge i idu u `ticketLinks.skipped` (dijalog ih prikazuje i ostaje otvoren); ako **nijedan** tiket
nije linkovan, komanda se poništava u cjelini — `PROBLEM_TICKETS_NOT_LINKED` (409), bez problema, bez eventova i bez
potrošenog sequence broja. Red-lockovi nad `Ticket` redovima u stabilnom poretku prije „je li već linkovan“ čitanja
čine da konkurentna komanda prijavi `other_problem` umjesto da obori transakciju na unique indeksu. Create prima
opcioni UUID `clientRequestId`; unique `(createdByUserId, clientRequestId)` (add-only migracija
`20271201000000_problem_create_idempotency`) znači da ponovljeni zahtjev sa istim ključem i istim autorom vraća
postojeći problem sa trenutnim linkovima, bez novog sequence broja, a izgubljeni unique race replaya pobjednika.
Realtime ticket eventovi i owner/group notifikacije ostaju poslije commita. Frontend šalje jedan create ključ po
otvorenom formularu i prikazuje novu grešku inline i kao danger toast (bs/en). Ako proces padne poslije commita,
problem i linkovi su već konzistentni; nema kompenzacione putanje jer je sve u jednoj transakciji.

CI [`44094239725`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44094239725) na `81d737b` je
**success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju (nova migracija
kroz release migrator), frontend (lint/format/testovi/build/budget), docs, container/supply-chain i CI gate; E2E
critical/install i read-only inventory bili su `skipped` (push workflow ih ne pokreće). Nije bilo neuspjelih CI
pokušaja za ovaj paket. Detalji su u [249](../implementation/249-w726-problem-create-atomicity.md).
`BA-problems-09` je sljedeći P2 u ovom auditu.

## 28. W7.27 — BA-problems-09 closeout

KB article draft više nije zasebna komanda prije linka. `createKnowledgeArticle` prima opcioni transakcijski klijent i
tada svoje upise (article `DRAFT` + `recordKnowledgeArticleChange`) izvršava **unutar** pozivaočeve transakcije, bez
ugniježđenog `$transaction`; sve autorizacijske i reference provjere ostaju prije `create`. `ProblemResolutionService.createArticle`
zato u jednoj transakciji radi draft, conditional `problem.updateMany where knowledgeArticleId: null`, `ProblemEvent`
`knowledgeArticle` i audit red, uz ponovno čitanje statusa i link fence-a unutar transakcije. Gubitnik trke, pad linka
ili pad eventa/audita poništava i članak, pa orphan draft ne nastaje. Ponovljeni submit i gubitnik trke replayaju
povezani članak sa **200** (`existingArticle` kroz `loadForArticle` sa `allowExisting`); `PROBLEM_ARTICLE_EXISTS`
(409) ostaje za `GET …/knowledge-article/draft`. Posebna kolona/relacija (`KnowledgeArticle.sourceProblemId`) i nova
migracija nisu uvedene, a legacy orphan draftovi se po odluci vlasnika ne čiste (nema sweepa ni reporta). Frontend
sheet prikazuje pad inline i kao danger toast, a replay tretira kao uspjeh.

CI [`44103735795`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44103735795) na `e6dc139` je
**success** uključujući generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integraciju (bez nove
migracije), frontend (lint/format/testovi/build/budget), docs, container/supply-chain i CI gate; E2E critical/install
i read-only inventory bili su `skipped` (push workflow ih ne pokreće). Nije bilo neuspjelih CI pokušaja za ovaj paket.
Detalji su u [250](../implementation/250-w727-problem-article-atomicity.md).

## 29. W7.28 — BA-problems-10 closeout

Promjena grupe više nije polje. `PATCH /problems/:id` sa drugim `groupId` vraća `409 PROBLEM_HANDOFF_REQUIRED`, a isti
kod sa `detail: 'organizationalUnitId'` dobija i premještanje u OJ izvan drveta grupe; OJ unutar drveta ostaje običan
update. Predaja je vlastita komanda: `ProblemHandoff` pamti izvornu i ciljnu grupu/OJ, podnosioca, razlog, status i
odluku, a djelimični unique indeks dozvoljava najviše jednu predaju koja čeka po problemu (`P2002` →
`PROBLEM_HANDOFF_PENDING`). `ProblemHandoffService.request` provjerava da je cilj problem-grupa i da je ciljna OJ u
opsegu podnosioca i u drvetu ciljne grupe; ako podnosilac ima `problem.manage` autoritet nad ciljnom grupom, predaja
se prihvata odmah, inače ostaje `PENDING` i problem **ostaje** u staroj grupi. Prihvat ide kroz `updateMany` sa
`version` CAS-om i provjerom izvorne grupe (`PROBLEM_HANDOFF_CONFLICT`), pomjera grupu i OJ, rješava vlasnika
(zadržava postojećeg ako pripada ciljnoj grupi, inače ga preuzima upravitelj koji prihvati) i upisuje `ProblemEvent` i
audit; odbijanje i otkazivanje ne diraju problem, a prelazak u konačni status otkazuje predaju koja čeka u istoj
transakciji. Detalj nosi `handoff` i `canHandoff|canDecideHandoff|canCancelHandoff`, historija prihvata četiri
`handoff_*` akcije, a notifikacije (`problem.handoffRequested` ciljnoj grupi, `problem.handoffDecided` podnosiocu)
imaju vlastitu kategoriju preferencija. Frontend prikazuje predaju na detalju, daje samo dozvoljene akcije i više ne
šalje promjenu grupe kroz edit sheet — prvo čuva ostale podatke, pa traži predaju sa obaveznim razlogom, uz
eksplicitnu poruku kada je samo prvi korak uspio.

Migracija `20271201010000_problem_handoffs` (add-only) i schema su pripremljene; vlasnik je 2026-11-17 dao izričitu
dozvolu i migracija je uspješno primijenjena na njegovu instalaciju (potvrđeno u razgovoru, bez nezavisne provjere
iz ovog okruženja). CI [`44139365349`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44139365349)
na `6a41a29` je **success** (generisani Prisma, backend build/lint/full Jest, PostgreSQL/Redis integracija, frontend
lint/format/testovi/build/budget, docs, container/supply-chain, gate); E2E critical/install i read-only inventory bili
su `skipped`. Dva ranija pokušaja pala su na vlastitim greškama — `44132873063` na `module-size` budžetu
(`services/problems-api.ts` i `lib/problems/problem-view.ts`) i `44136465539` na audit katalogu bez četiri nove akcije
— oba popravljena prije zelenog runa. Detalji su u [251](../implementation/251-w728-problem-handoff.md).
`BA-problems-11` je sljedeći P2 u ovom auditu.

## 30. W7.29 — BA-problems-11 closeout

Problem više ne može nositi referencu koju matični domen ne pokazuje korisniku. **Servisi:** katalogova vidljivost
(`DRAFT` samo za admine, servisno-scoped ADMIN samo za svoje servise) pretvorena je u Prisma filter
(`service-catalog/service-read-where.ts`) i primijenjena na `options().services`, na `serviceId` u create/update
(`assertReferences`) te na listu, link i unlink dodatnih servisa. **Incidenti:** `status-page/status-viewer.ts` dobija
`statusViewerFromAuthorizationContext`, koji gradi isti scope kao HTTP viewer, a `withIncidentVisibility` sada filtrira
i problemski picker, link i reverse karticu — nestaff vidi samo `ALL_USERS`, a servisno-scoped staff samo `STAFF_ONLY`
incidente čiji su svi servisi u njegovom opsegu. Skriveni servis ili incident vraća isti `not found` kod kao
nepostojeći zapis, pa se postojanje ne odaje. **Atomarnost:** `linkService`, `unlinkService`, `linkIncident`,
`unlinkIncident` i `unlinkAsset` sada pišu promjenu i `ProblemEvent` u istoj transakciji; ponovljeni link ostaje
`{ linked: 0 }` bez druge historije. Frontend edit sheet zadržava servis koji problem već nosi kada ga katalog više ne
nudi, da čuvanje ostalih polja ne ukloni servis tiho. Namjerni hard `take: 200` u pretrazi incidenata (bez `hasMore`) ostaje kako je W7.29 odlučio i
nije dio ovog paketa. Nema migracije ni schema promjene.

CI [`44150530683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44150530683) na `bf671ac` je
**success** (generisani Prisma, backend build/lint/safety-net/wiring/SLA matrica/pun Jest, PostgreSQL/Redis
integracija, frontend lint/format/testovi/build/budget, docs, container/supply-chain, gate); E2E critical/install i
read-only inventory bili su `skipped`. Prvi pokušaj `44148379072` na `fea57cd` pao je na vlastitim greškama u novim
test dublovima (self-referencing prisma double, neannotiran `jest.Mock` poziv) i na integration suiteu koji je pravio
`ProblemLinksService` bez authorization loadera; popravljeno u `bf671ac` prije zelenog runa. Detalji su u
[252](../implementation/252-w729-problem-link-scope.md). `BA-problems-12` je sljedeći P2 u ovom auditu.

## 31. W7.30 — BA-problems-12 closeout

General update i claim više nisu „drugi razred“ audit zapisa. `ProblemsService.update` i
`ProblemsService.claim` sada, unutar postojeće transakcije i poslije version predicate-a, pozivaju
`recordAuditEntry` sa dvije nove akcije: `problem.updated` i `problem.claimed`. Oba reda nose
`entityType = problem`, top-level `organizationalUnitId` (odredišna OJ kod premještaja, inače trenutna)
i `actorUserId`, pa se particioniraju u `ou:<stvarna OJ problema>` kao `problem.created` i
`problem.status_changed`. Pad audita poništava i promjenu i `ProblemEvent`.

Metadata je namjerno podijeljena na forenzički i osjetljivi dio. `changedFields` nosi nazive svih
promijenjenih polja, a `previous*`/trenutne vrijednosti se upisuju samo za `ownerUserId`,
`organizationalUnitId`, `serviceId`, `impact`, `urgency`, `priority` i `rootCauseCategory`.
Slobodan tekst (`description`, `rootCause`, `rcaWhys`, `workaround`, `resolution`) pojavljuje se
isključivo **nazivom** u `textChanged`; centralna audit politika odbija te ključeve kao metadata, pa
sadržaj problema ne može procuriti kroz audit log. Claim bilježi samo `ownerUserId` i
`previousOwnerUserId`, a rani izlaz (actor je već vlasnik) ne piše ni event ni audit.

Frontend katalog akcija, polja i zatvorenih vokabulara (`priority`/`urgency`/`impact`) dopunjen je u
bs/en, a `AuditMetadataList` prevodi liste naziva polja samo kada je svaki dio liste poznato polje, da
rečenica sa zarezom ostane netaknuta. Nema migracije ni schema promjene.

Jedno ograničenje ostaje otvoreno i zapisano: DB trigger `enforce_audit_scope_provenance` iz
migracije `20271025140000_audit_scope_provenance` drži whitelist problem akcija i ne poznaje dvije
nove, pa je za njih scope kanonski po konstrukciji (iz istog reda u istoj transakciji) ali bez DB
provjere. To je novi nalaz `BA-problems-20` (P2) i traži izričito odobrenu migraciju; ovaj paket ga
ne rješava.

Lokalno: ciljano `jest` (19 suiteova / 256 testova), cijeli frontend suite (455 fajlova / 1789
testova), `tsc -b`, `eslint`, `prettier --check`, wiring (99/631) i migration policy (118 migracija).
CI [`44184591069`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44184591069) na
`c3230db` je **success** (generisani Prisma, backend build/lint/safety-net/wiring/SLA/pun Jest,
PostgreSQL/Redis integracija, frontend lint/format/testovi/build/budget, docs, container/supply-chain,
gate); E2E critical/install i read-only inventory bili su `skipped`, bez neuspjelih pokušaja. Detalji
su u [253](../implementation/253-w730-problem-canonical-audit.md); završni docs/guard commit `59a43de` prošao je
vlastiti CI [`44187381910`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44187381910)
(`success`). `BA-problems-13` je sljedeći P2 u ovom auditu.

## 32. W7.31 — BA-problems-13 closeout

Occurrence ključ problem notifikacija više ne dolazi sa sata. Novi `problem-notice-occurrence.ts`
izvodi ga isključivo iz identiteta promjene: `v<n>` (verzija koju je write proizveo) za vlasnika, grupu
i status, `created` za novi problem, `handoff:<id>` za korake predaje, `run:<id>:<status>` za rundu
rješavanja, `target:<stage>:<ISO>` za podsjetnik i `recurrence:<sha256>` za link batch koji vraća
problem nakon rješenja. Nijedan derivator ne čita sat niti koristi slučajnost, svi su fail-closed, a
tip je objekat (`{ key }`) da se occurrence ne može zamijeniti sa actorom u pozivu.

`ProblemNotifier` zato prima occurrence kao obavezan argument za `ownerAssigned`, `groupAssigned` i
`statusChanged`, dok `recurrence` i `targetDueDetailed` ključ izvode sami iz podataka koje već imaju.
`sendDetailed` odbija prazan ključ, pa budući poziv bez occurrence-a ne može tiho slati poruku na
svaki retry. Dedupe je po primaocu (`…:<userId>`), što znači da replay iste runde ne ponavlja poruku
onima koji su je dobili, ali stiže agentima tiketa riješenih tek resume-om.

Dokazi: `problem-notice-occurrence.spec.ts` (stabilnost kroz pomjereni sat, razlikovanje događaja,
digest bez identifikatora, fail-closed ulazi) i `problem-notifier-dedupe.spec.ts` (dva poziva istog
događaja ⇒ jedna in-app poruka i jedan ledger red; nova verzija ⇒ nova poruka; replay runde ⇒ samo novi
primalac; prazan ključ ⇒ nijedan upis), uz ažuriran handoff spec. Nema migracije ni schema promjene;
`Notification.dedupeKey` i `NotificationEmailDelivery.dedupeKey` su i dalje unique bez dužinskog
ograničenja.

Fire-and-forget dio nalaza (greška se samo loguje) nije zatvoren ovim paketom: problem notifikacije
nemaju outbox/replay intenciju. To je sada `BA-problems-21` (P3), a stabilni occurrence je preduslov
koji je ovim paketom ispunjen.

Lokalno: 1.357 testova u `problems`/`audit-log`/`notifications`/`tickets` (1.292 prošlo, 65 skipped DB
suiteova), `eslint` čist na svim izmijenjenim fajlovima. CI
[`44194131526`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44194131526) na
`6a3d66a` je **success** (generisani Prisma, backend build/lint/safety-net/wiring/SLA/pun Jest,
PostgreSQL/Redis integracija, frontend lint/format/testovi/build/budget, docs, container/supply-chain,
gate); E2E critical/install i read-only inventory bili su `skipped`, bez neuspjelih pokušaja. Detalji
su u [254](../implementation/254-w731-problem-notice-occurrence.md); završni docs/guard commit `c1bffeb`
prošao je vlastiti CI [`44196502251`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44196502251)
(`success`). `BA-problems-14` je sljedeći P2 u ovom auditu.

## 33. W7.32 — BA-problems-14 closeout

Satni problem sweep više ne ovisi o tome da ga je boot jednom uspješno registrirao. Servis sada
registruje raspored kroz zajednički `registerRepeatableJob` (`problem-sweep-hourly`, `23 * * * *`,
`attempts: 2`, exponential backoff 60 s, keep 5/20 — isto ponašanje kao prije) i, kao i announcements,
assets, on-call i inbound-email, **svake minute** provjerava da raspored još postoji u Redisu. Kad ga
nema (flush, failover na praznu instancu), vraća ga i loguje `problem_sweep_schedule_recovered`;
`upsertJobScheduler` je idempotentan po ID-u, pa više workera konvergira na tačno jedan raspored.
Neuspjeli reconcile se loguje kao `problem_sweep_schedule_reconcile_failed` i ponavlja sljedeće
minute; boot i dalje pada kad obavezna registracija ne prođe. Auditova rečenica „registracijska
greška se guta“ nije odgovarala kodu — `onModuleInit` je bacao i boot je padao — ali nije postojao
nikakav oporavak **poslije** boota, i to je ono što je ovim paketom zatvoreno.

Health strana koristi postojeću mašineriju umjesto nove: `problem-sweep-hourly` je sada očekivani
scheduler u `ops-health`, pa `includeExpectedSchedulers` sintetiše red sa `registered: false` i zadnjim
poznatim uspjehom kad registracija nestane, a granica zadnjeg uspjeha od 75 minuta (jedan satni prozor
plus grace) daje `no_recent_success`/`failing` kroz `scheduler.late` — dakle prisustvo, preuzimanje,
neuspjesi i starost zadnjeg sweepa, a s njim i zadnjeg auto-closea. Kartica **Zdravlje sistema →
Zakazani poslovi** prikazuje taj red bez nove UI komponente.

Drift isporuke podsjetnika dobio je vlastiti alarm `problems.reminders.stuck` i read-only signal
`collect-problem-operations-signal.ts`: `DEAD` redovi, `FAILED` sa isteklim ili odsutnim
`nextAttemptAt`, i `CLAIMED` stariji od 30 minuta — iste grane koje sweep koristi za pick-up — uz
starost najstarijeg zaglavljenog reda. Prekoračeni rokovi (`NEW`/`INVESTIGATING`/`KNOWN_ERROR` sa
`targetAt < now`) putuju kao detalj alarma, a ne kao zaseban alarm: to je radni zalih, već izložen u
reportu `problem_backlog` (kolona `overdue`), i prag za takav alarm traži odluku vlasnika, ne nagađanje
paketa.

Dokazi: `problem-sweep.scheduler.spec.ts` (registracija, restore, no-op kad raspored postoji,
neuspjeli pa uspjeli reconcile, boot fail, destroy zaustavlja timer), `problem-operations.spec.ts`
(oblik pick-up filtera, isključeni terminalni statusi i breached scope), `collect-problem-operations-signal.spec.ts`
(brojevi, starost, zaštita od negativne starosti), `ops-signal-collector.spec.ts` (sintetizovani
problemski red), `evaluate-ops-signals.spec.ts` (alarm sa detaljem, tihi backlog, `null` probe,
`not_registered` i `no_recent_success`), uz katalog i bs/en i18n coverage guard. Nema migracije ni
schema promjene; nema nove tabele, kolone ni API polja.

Lokalno: 766 testova u `problems`/`ops-health`/`notifications`/`audit-log` (727 prošlo, 39 skipped DB
suiteova), frontend `lib/ops`/`components/admin`/`i18n` 128 testova, `eslint` čist, frontend
`tsc --noEmit` čist. CI
[`44254722210`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44254722210) na
`dbad790` je **success**; prvi pokušaj
[`44253172895`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44253172895) na
`c991bee` pao je samo na tipovima u novom test dublu i popravljen je prije zelenog runa. Završni
docs commit `b2df1cc` mijenja samo `docs/**`, pa ga `paths-ignore` namjerno ne pušta u CI; findings
guard (`696/696`, `P1=174 P2=371 P3=151`, 16/16 testova) i docs guard (OK, 32 stranice) prošli su
lokalno. Detalji su u [255](../implementation/255-w732-problem-sweep-reconciliation.md). Sljedeći P2 u ovom auditu je
`BA-problems-15`.

## 34. W7.33 — BA-problems-15 closeout

Pravilo vlasnika bilo je „aktivan, nije anonimiziran, član grupe i ima `problem.manage` **negdje**“. Menadžer
čije ovlasti pokrivaju drugu jedinicu mogao je, dakle, postati vlasnik problema koji ne može voditi — i
dobijati podsjetnike o njemu — a oduzimanje granta nije bilo nigdje primijećeno: problem je zadržao
vlasnika bez ovlasti, a niko to nije rekao ni prikazao.

Pravilo je sada jedno, izraženo u dva oblika u `problem-owner-eligibility.ts`:

- `evaluateProblemOwnerEligibility` — tačna provjera preko kanonskog `resolveAssetScope`/`isPathInScope`
  (isti resolver koji koriste svi read/write putevi, pa zapisani vlasnik ne može proći ovdje a pasti tamo);
  razlozi su `inactive`, `not_manager`, `not_member`, `out_of_scope`.
- `eligibleProblemOwnerWhere` — isti uslov kao jedan Prisma filter za ograničene upite (birač vlasnika,
  voditelji grupe, ciljna grupa predaje). Cross-unit prolaz traži **bezjediničnu** dodjelu role
  `ADMIN`/`SUPER_ADMIN`/`PROBLEM_MANAGER`; dodjela bez jedinice pada na matičnu jedinicu korisnika; putanja
  jedinice `null` **nikad** ne širi opseg. Deset testova u `problem-owner-eligibility.spec.ts` drži oba oblika
  na istom pravilu (preci, tačna/parent dodjela, sestra i dijete odbijeni, matična jedinica, drift razlozi,
  oblik filtera).

Servis sada bira vlasnika i provjerava ga s istim pitanjem i istom jedinicom: create koristi `ouPath`
vraćene jedinice, update `ouPath` jedinice problema, birač vlasnika filtrira po jedinici grupe (tekstualni
filter je odvojen `OR`, pa ga scope filter ne može pregaziti). Mrtva grana „pri promjeni grupe ispusti
vlasnika“ je uklonjena — promjena grupe je predaja (`handoff`), koja vlasnika ponovo rješava za ciljnu
jedinicu; `ProblemHandoffService.resolveOwner` zato čita jedinicu ciljne grupe u transakciji.

**Revoke drift** se rješava čitanjem, bez prepisivanja zapisa i bez migracije:

1. Detalj problema vraća `ownerEligibility: { eligible, reason }` (ili `null` kad vlasnika nema), a UI ispod
   imena vlasnika ispisuje razlog i uputu na `Uredi` (bs/en).
2. `ProblemNotifier` više ne šalje obavještenja vlasniku koji je izgubio ovlast — loguje
   `problem_notice_owner_ineligible problem=… reason=…` i pušta voditelje grupe da preuzmu; i sami voditelji
   se traže po jedinici grupe, pa obavještenje ne ide menadžeru iz drugog dijela stabla.
3. `sweep/problem-owner-drift.ts` broji drift među otvorenim problemima: jedan ograničen pregled (500),
   pa po jedan upit za vlasnike i grupe — nikad upit po problemu. Novi alarm
   `problems.owner.ineligible` (UPOZORENJE 2/2) nosi broj pogođenih, broj pregledanih, razloge i `capped`
   (dostignut limit ⇒ broj je minimum), bez ID-a problema i bez identiteta korisnika. Runbook:
   `ALERTS.md#problem-owner-eligibility`.

Dokazi: `problem-owner-eligibility.spec.ts` (10), `problem-owner-scope.spec.ts` (8 — veza na jedinicu
problema, odbijanje po svakom razlogu, tekstualni filter uz scope, detalj sa driftom), 
`problem-notifier-owner-drift.spec.ts` (4 — vlasnik prima dok ima grant, otkazani vlasnik prepušta
voditeljima, `NO_RECIPIENT` kad nema nikoga, voditelji po jedinici grupe), `problem-owner-drift.spec.ts`
(7 — razlozi, matična jedinica, `capped`, jedan upit po kolekciji) i `evaluate-ops-signals.spec.ts`
(alarm, samo prisutni razlozi, `null` probe). Nema migracije ni schema promjene; nema novog API polja osim
`ownerEligibility` u detalju.

Lokalno: 400 testova u `problems`/`ops-health` (25 skipped DB suiteova), pun frontend `vitest` 1.792
testa, `eslint` čist, frontend `tsc --noEmit` i build čisti. CI
[`44267814464`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44267814464) na `ea16a1e`
je **success** (generisani Prisma, backend build/lint/wiring/SLA matrica/pun Jest, PostgreSQL/Redis
integracija, frontend lint/format/testovi/build/budget, docs, container/supply-chain, gate); E2E
critical/install i inventory bili su `skipped`. Tri ranija pokušaja (`44262744211`, `44263246219`,
`44266623028`) pala su na vlastitim greškama — Prettier na novom tipu, frontend module-size guard na
porastu detalj stranice/`problems-api.ts` i `TS2345` u novom test dublu — i popravljena su prije zelenog
runa. Detalji su u [256](../implementation/256-w733-owner-eligibility.md).
Sljedeći P2 u ovom auditu je `BA-problems-16` (privacy/retention).

**W7.35 — regresija ovog paketa (popravljena).** Filter vlasnika iz W7.33 gradio je pretke jedinice bez
vodećeg `/`, pa je `ouPath: { in: ['Korisnici'] }` tražio nešto što baza ne čuva (`/Korisnici`). Tačna
provjera je i dalje prolazila, pa je neslaganje bilo tiho: birač vlasnika je bio prazan za svaku
jedinicom vezanu dodjelu (korisnička prijava), lista upravitelja ciljne grupe kod predaje bila je prazna,
a obavještenja grupnih upravitelja mogla su ispasti kao `NO_RECIPIENT`. Uzrok je bio u testovima koji su
očekivali pogrešan format (`['root', 'root/ou1']` za `/root/ou1`). Popravka čuva format putanje, birač
sada vraća i jedinicu koju je pretražio (prazna lista više nije nijema), a novi guard izvršava filter u
memoriji i poredi ga sa tačnom provjerom nad matricom stvarnih putanja. Detalji:
[258](../implementation/258-w735-owner-unit-path-regression.md).

## 35. W7.34 — BA-problems-16 closeout

Problem nije imao nijednu od tri stvari koje privacy traži: anonimizacija ga je nalazila samo po vezi
(kreator/vlasnik/tiket), kopije sadržaja (in-app obavještenje, nacrt članka baze znanja) nisu bile vezane
za granicu zadržavanja, a retention kategorija za probleme nije postojala — API `delete` ne postoji, pa
su zatvoreni i otkazani zapisi sa event JSON-om i link metadata ostajali trajno. Pseudonimizirani prikaz
vlasnika i kreatora trebalo je provjeriti, ne pretpostaviti.

**Imenovanja.** `problem-mentions.ts` izvodi filter iz istih identiteta i pragova koje scrubber
zamjenjuje: puna adresa, lokalni dio ≥ 5 znakova, DN, login ≥ 4 znaka i puno ime u oba redoslijeda. Filter
je superset (podstring u bazi može pogoditi token unutar duže riječi), pa je višak redova bezopasan —
scrub je idempotentan, a problem bez ijedne zamjene se preskače. Eventi se ne filtriraju po problemu, nego
jednim ograničenim upitom nad `"detail"::text ILIKE`, jer Prisma ne filtrira tekst unutar `Json` kolone.
`scrub-problem-mentions.ts` je jedan ulaz za izvršenje i preview: problem (veza **ili** imenovanje),
event detalji (vlasnik eventa, odabrani problemi, imenovanje), in-app kopije pronađene preko
`payload.problemId` i članak koji je problem napravio.

**Replike.** Obavještenje nosi `broj · naslov` (≤ 500 znakova) i `payload.problemId`; guard u
`problem-notifier-dedupe.spec.ts` drži da naslov ostane headline i da pokazivač uvijek postoji, jer bez
njega retention kopiju ne bi našao. E-mail se sastavlja pri slanju i ne pohranjuje — `NotificationEmailDelivery`
čuva primaoca, ključ, status i pokušaje, ne tijelo. Nacrt članka baze znanja se redaktuje s problemom;
objavljeni članak se ne dira (verzije, povlačenje i vlasnik su njegov životni ciklus), a identitete u njemu
uklanja anonimizacija, koja mijenja samo identitete.

**Closed-record lifecycle.** Nova kategorija `problemContent` (default 0 = isključeno, minimum 180 dana,
obavezan probni prolaz, u noćnom redu poslije `ticketContent`) redaktuje nosivi sadržaj u jednoj
transakciji po batchu od 50: naslov i opis → marker, uzrok/zaobilazno rješenje/rješenje/razlog otkazivanja
→ `null`, `rcaWhys` i event `detail` → `DbNull`, razlozi predaje i poruke resolution runa → marker, kopije
u obavještenjima i nacrt članka → marker. **Kostur ostaje** (broj, status, prioritet, grupa, jedinica,
usluga, vlasnik, datumi, veze, metrika), pa reporti i pretraga ostaju tačni. Pravna blokada vlasnika,
kreatora ili bilo kojeg povezanog tiketa preskače problem. Idempotencija koristi postojeći marker u
naslovu kao „već redigovano“ stanje, pa **migracije nema**; `refs` runa su `#<sequence>`.

**Prikaz.** Problem ne denormalizuje ime: `listSelect`/`detailSelect` uzimaju `owner`/`createdBy` kroz
`userSelect`, event prikazuje aktera kroz isti join, a notifier čita `owner.displayName` iz `User` reda.
Anonimizacija mijenja `User.displayName` u pseudonim, pa se pseudonim pojavljuje na svim mjestima bez
dodatnog koda.

Uz to je popravljena tiha rupa u frontendu: lista kategorija u `services/privacy-api.ts` nije sadržavala
`statusIncidents`, iako su API, oba prevoda i executor postojali — runovi te kategorije nisu bili vidljivi
ni filtrabilni. Novi `privacy-retention-categories.spec.ts` poredi listu sa backend
`privacy.constants.ts` i traži `name`/`hint` u oba prevoda.

Dokazi: `problem-mentions.spec.ts` (6), `scrub-problem-mentions.spec.ts` (7),
`problem-content-retention.executor.spec.ts` (5), `problem-notifier-dedupe.spec.ts` (+1),
`privacy-retention-categories.spec.ts` (3), uz ažurirane contract guardove
(`attachments.constants.spec.ts`, `retention.integration.spec.ts`) i settings-registry coverage (518
ključeva, naslov ≤ 220). Prvi CI run `44277429190` na `111f3e6` pao je upravo na tim guardovima (lista
executora, redoslijed noći, 517 ključeva i predug naslov), ne na logici; popravljeno u `fcee1e8`, gdje je
CI [`44279046507`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44279046507) **zelen**.
Detalji su u [257](../implementation/257-w734-problems-16-privacy-retention.md). Nema migracije, nema nove
tabele i nema promjene API oblika; default postavke je 0, pa deploy sam ne mijenja nijedan zapis.
`BA-problems-20` (provenance trigger whitelist) zatvoren je u W7.38 — vidi §36.

## 36. W7.38 — BA-problems-20 closeout

DB trigger `enforce_audit_scope_provenance` drži vlastitu listu akcija čija jedinica mora biti jednaka
jedinici entiteta. W7.30 je uveo `problem.updated` i `problem.claimed` kao `entity` akcije, ali lista je
ostala nepromijenjena — pa je za te dvije akcije scope bio ispravan samo po konstrukciji (isti red, ista
transakcija), a baza bi prihvatila i tuđu jedinicu. Migracija
`20271201120000_audit_scope_provenance_problem_actions` zamjenjuje **tijelo funkcije**
(`CREATE OR REPLACE`), pa trigger ostaje vezan i nijedan red nije bez zaštite tokom zamjene; problem grana
sada poznaje obje akcije, a ostatak je bajt-za-bajt prethodna definicija.

Novi guard `audit-scope-provenance-whitelist.spec.ts` čita stvarne migracije, uzima posljednju definiciju
funkcije i poredi je sa `auditActionScopeRegistry`: svaka `entity` akcija mora biti provjerena protiv tačno
one tabele i kolone koju njen prefiks posjeduje, bez stale unosa i bez dvostrukih provjera, uz provjeru da
trigger nije odvezan. Guard je odmah našao **drugi, stariji drift iste klase**: `ticket.message_created` je
u registru `entity`, `tickets-collaboration.service.ts` ga piše sa `ticket.originUnitId` (dakle kanonski),
ali ga trigger nikad nije provjeravao — i ta akcija je dodata u istu migraciju. DB integracija
(`audit-scope-provenance.integration.spec.ts`, +1) dokazuje na realnoj bazi da tuđa jedinica pada sa
`AUDIT_SCOPE_PROVENANCE_MISMATCH` bez upisanog reda, a kanonska prolazi, za obje problem akcije.

Sentinel `expectedSchemaMigration` pomjeren je na novu migraciju, pa readiness odbija bazu koja zaostaje za
kodom. Nema promjene aplikativnog koda, API oblika ni podataka. CI
[`44303067683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44303067683) na `f34290e` je
**success** (generisani Prisma, backend build/lint/safety-net/wiring/SLA/pun Jest, PostgreSQL/Redis
integracija sa primijenjenom migracijom, frontend lint/format/testovi/build/budget, docs,
container/supply-chain, gate); E2E critical/install i read-only inventory su `skipped`, bez neuspjelih
pokušaja. Source/plan **438/258**, ovaj registar **448/248**; Val 7 **37/111** (74 otvorena: 13/40/21),
`problems` **17/21**. (Zatečeni zbir registra bio je 449/247, ne 450/246 kako su ranije poruke navodile;
brojevi su ovdje prebrojani iz redova.) Detalji su u [259](../implementation/259-w738-problems-20-provenance-whitelist.md).

## 37. W7.39 — BA-problems-17 closeout

Pet prozora u problem zapisu više nisu tiha. Događaji (200), povezani ticketi (500), linkovi (200 po
sekciji), reverse kartica asseta/incidenta (50) i birači (2.000) sada se čitaju sa `limit + 1` redom i
vraćaju `hasMore`, pa je skraćivanje **dokazano** iz podataka, a ne izvedeno iz dužine niza. Najvažnija
posljedica je `listForProblem`: `total` i `open` se broje (`count` sa istim visibility predikatom), pa
`total` više nije dužina prozora i ne može lažno tvrditi 500.

Vremenska linija skenira dalje od prozora dok ne nađe jedan vidljivi događaj više ili ne potroši redove
(nevidljivi ne smiju trošiti prozor), uz `eventScanMax` kao granicu rada; ako se skeniranje zaustavi na
granici, flag ostaje konzervativan. Linkovi i birači vraćaju flag **po kolekciji**
(`assets/services/incidents`, `units/services/groups`), jer čitaocu treba koja je lista skraćena.

UI to kaže svuda gdje se lista čita: zajednički `ListTruncationNote` pod vremenskom linijom, tabelom
tiketa (sa stvarnim ukupnim brojem), svakom skraćenom sekcijom taba „Veze“, karticom asseta i incidenta, i
u create/edit formi kada je birač skraćen; copy je u bs/en. `services/problems-api.ts` je rastom ugovora
prešao module-size baseline, pa su događaji i target podsjetnici izdvojeni u vlastite module — limit nije
podizan. Nema migracije; promjena je aditivna, a novi klijent čita flagove defanzivno da staggered deploy
ne može srušiti tab. CI [`44315048317`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44315048317)
na `202153c` je **success** (prvi run `44310320654` na `6033b9c` pao je na vlastitoj `TS2345` grešci u
testnom dublu, popravljenoj u `5b3d3d2`); E2E critical/install i read-only inventory su `skipped`. Detalji
su u [260](../implementation/260-w739-problems-17-list-windows.md).

## 38. W7.40 — BA-problems-18 closeout

Dvije tihe neograničenosti su zatvorene. **Postavke:** loader je prihvatio bilo koji cijeli broj, pa je red
iz baze (nastao prije validacije, iz backupa ili ručno promijenjen) mogao odlučiti koliko tiketa jedan zahtjev
rješava. Granice su sada na jednom mjestu i koristi ih i `assertValue` i `clampIntegerSetting` pri čitanju:
`100000` se ponaša kao `1000`, negativan auto-close kao `0`, a ne-broj se vraća na default. **Sweep:** obje
faze traže `batch + 1` red, pa je pun batch dokazan (`problem_sweep_batch_cap_reached`), deadline se
provjerava između redova (`problem_sweep_budget_reached`, `deferred`, `budgetReached`), a redoslijed ostaje
najstariji-prvi — cap odgađa najnovije, nikoga ne izgladnjuje. Omotači `autoClose()`/`remindDetailed()` čuvaju
stari ugovor.

**Mjerenje:** `ProblemOperationsSignal` dobija `oldestOverdueTargetMinutes`, `autoCloseDue`,
`oldestAutoCloseDueMinutes` i `effectiveAutoCloseDays`; „due“ definiše jedna funkcija koju dijele sweep i
sonda. Nečitljiva postavka je `null` („nepoznato“), nikad tiha nula, a `0 dana` znači „nikad“ i ne broji
ništa. Brojevi su na kartici Zdravlje sistema (nova sekcija uz metrike imovine) i u detaljima
`problemReminderStuck` alarma; sam zaostatak ne otvara alarm — to je rad, ne kvar.

Bulk rješavanje po zahtjevu ostaje sekvencijalno i sada tvrdo ograničeno klampom; prekid rada pokriva
W7.24 durable run sa `PARTIAL` i resume. Nema migracije. CI
[`44325092985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44325092985) na `e81d0cf` je
**success** (prvi run `44322679559` na `2ec2b18` pao je na vlastitoj `TS2352` grešci u novom specu,
popravljenoj u `e81d0cf`); E2E critical/install i read-only inventory su `skipped`. Detalji su u
[261](../implementation/261-w740-problems-18-sweep-bounds.md).
