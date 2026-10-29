# Backend audit 23 — `problems`

**Status:** audit završen<br>
**Datum:** 2026-10-23<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **4,21/10**<br>
**Nalazi:** 7 P1, 9 P2, 3 P3<br>
**Implementacija:** W7.1 je djelimično zatvorio `BA-problems-01`; ostali nalazi su otvoreni.

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

Problem može promijeniti service/OU nakon kreiranja članka, bez politike synca; to može ostaviti članak u drugačijem scopeu od izvornog problema. Article link je one-way i nema unlink/replacement lifecycle.

## 10. Target, reminders, notifications i scheduler

Target koristi aktivan business-hours kalendar, timezone/civil days, holidaye i priority working-day konfiguraciju. Priority promjena rearmira target; reopen računa novi target. Notification koristi preference policy, in-app dedupe i centralni durable email delivery helper.

Sweep marker je upisan **prije** `targetDue`. Komentar eksplicitno bira gubitak umjesto duplikata. Crash, nula recipienta, deaktiviran owner, sve preference OFF, notification DB failure ili email-only failure ostavljaju stage trajno označenim. Marker mora značiti persisted/delivered policy outcome, a ne započet pokušaj. Potreban je outbox/delivery state po problem+target+stage+recipient i retry/dead-letter reconciliation.

Owner/group/status notifikacije koriste `Date.now()` u occurrence ključu. Retry istog poslovnog događaja dobija novi dedupe key i može duplirati poruke; event/version ID treba biti stabilni occurrence. Fire-and-forget greška se samo loguje i nema durable recoveryja.

Scheduler registruje hourly job samo na module init. Stable scheduler ID pomaže kod normalnog restarta, ali Redis flush/restart poslije boota se ne reconciliuje do redeploya. Registracijska greška se guta. Nema health provjere scheduler presence, last sweep/auto-close age, overdue backlog ni notification delivery drift.

## 11. Privacy, retention i data exposure

Privacy anonymization pronalazi probleme gdje je osoba creator/owner ili je njen ticket u scrub scopeu, scrubuje glavne tekstove, 5-whys i event detail. Export uključuje probleme gdje je osoba reporter/owner i njene actions. To je vrijedna integracija.

Coverage je ipak heuristic: tekst može imenovati osobu koja nije creator/owner/requester povezanog ticketa i tada problem neće ući u scrub skup. Problem events s identitetom drugih osoba scrubuje se samo ako je problem već odabran. Notifier body/email i KB draft mogu replicirati problem title/RCA izvan problem retention granice.

Nema problem retention/tombstone politike. DB cascade briše events i veze samo ako se problem fizički izbriše, ali API delete ne postoji. Closed/cancelled zapisi, event JSON i link metadata ostaju neograničeno. Potrebna je eksplicitna ITSM/legal retention politika i provjera pseudonymized owner/creator prikaza.

## 12. Pagination, resource i operativnost

Glavni register ima bounded cursor i total. Events uzima 200, linked tickets 500, links 200, reverse links 50, notifier candidates 2.000 i options 2.000 bez `hasMore` ili paginationa. `listForProblem.total` je zapravo dužina trunciranog rezultata, pa može lažno tvrditi ukupno 500.

Bulk resolution radi sekvencijalne ticket access/update/message pozive do konfigurisanog limita; konfiguracija se samo provjerava kao integer, bez lokalnog min/max clampa u loaderu. Pogrešna setting vrijednost može povećati latency/resource pritisak. Sweep batch 500 obrađuje svaki red sekvencijalno i nema oldest-overdue/starvation metriku.

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
| BA-problems-02 | P1       | Pristup jednom linked ticketu otkriva puni problem i metapodatke svih drugih ticketa           | otvoreno |
| BA-problems-03 | P1       | Asset search/link/get zaobilaze `asset.read` i CMDB OU scope                                  | otvoreno |
| BA-problems-04 | P1       | Ticket unlink ne provjerava aktuelni staff access nad ticketom koji uklanja                    | otvoreno |
| BA-problems-05 | P1       | `problem.close` bulk resolve preskače per-ticket authorization za sve linked tickete           | otvoreno |
| BA-problems-06 | P1       | Problem se commit-a RESOLVED prije bulk ticketa bez durable retry/resume putanje               | otvoreno |
| BA-problems-07 | P1       | Target reminder marker se upisuje prije primaoca i potvrđene/persistirane isporuke             | otvoreno |
| BA-problems-08 | P2       | Create problem + početni ticket link nije atomski i može ostaviti orphan problem               | otvoreno |
| BA-problems-09 | P2       | KB article nastaje prije conditional linka i concurrent/failure put ostavlja orphan draft      | otvoreno |
| BA-problems-10 | P2       | Stara grupa može predati problem novoj grupi bez target-group authority/acceptance              | otvoreno |
| BA-problems-11 | P2       | Service/incident linkovi nemaju njihov scope policy; više link writeova nije atomsko s eventom  | otvoreno |
| BA-problems-12 | P2       | Claim/general update nemaju kanonski globalni audit                                            | otvoreno |
| BA-problems-13 | P2       | Owner/group/status notice occurrence koristi vrijeme i nije stabilno idempotentan               | otvoreno |
| BA-problems-14 | P2       | Scheduler nema reconciliation/health nakon Redis gubitka ili registration failurea             | otvoreno |
| BA-problems-15 | P2       | Owner eligibility ne veže manage grant za problem OU i ne reconciliuje revoke drift            | otvoreno |
| BA-problems-16 | P2       | Privacy/retention ne pokrivaju sva imenovanja, notifier/KB replike i closed-record lifecycle    | otvoreno |
| BA-problems-17 | P3       | Events/tickets/links/reverse/options liste se tiho hard-trunciraju; total može biti netačan     | otvoreno |
| BA-problems-18 | P3       | Bulk/sweep setting i sekvencijalni rad nemaju potpune resource/health granice                   | otvoreno |
| BA-problems-19 | P3       | Svih osam direktnih suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica      | otvoreno |

## 16. Ključne korekcije

- **01:** zatvoreno u W7.1 — assignment-derived OU scope, bez role-name global bypassa; detalj u [implementacijskom dokazu](../implementation/87-domain-assignment-scope.md).
- **02:** minimal linked-ticket problem projection i per-ticket access/redaction prije liste.
- **03:** reuse `AssetAccessService`/`asset.read` scope za search, suggestions, link i shape.
- **04–05:** aktuelni ticket policy na svaki unlink/resolve; eksplicitna audited delegation samo unutar dozvoljenog scopea.
- **06:** persisted bulk-resolution run/item state, idempotency, resume endpoint i completion policy.
- **07, 13:** outbox/delivery state i stabilni business event occurrence ključevi.
- **08:** jedinstvena create+link command transakcija ili dokumentovan partial/compensation ugovor.
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
