# Backend audit 24 — `changes`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,28/10**  
**Nalazi:** 7 P1, 10 P2, 3 P3

## 1. Executive summary

`changes` pruža ITIL lifecycle za STANDARD/NORMAL/EMERGENCY promjene, izračun rizika, CAB glasanje, konflikt/freeze provjere, calendar, standardne template, service downtime prozore, podsjetnike i problem/asset veze. Temelj je funkcionalno širok: atomic broj, optimistic version na core writeovima, jasna state mašina, required planovi/review, CAB membership i requester-self-vote zabrana, transactional vote/event/audit, conflict acknowledgement i privacy integracija.

Baseline je **4,28/10**. Sedam P1 nalaza pogađaju scope, cross-domain authorization, povjerljivost planiranja, CAB integritet i delivery. `CHANGE_MANAGER` i scoped ADMIN postaju globalni; asset search/link zaobilazi CMDB scope; direct problem link provjerava samo postojanje; conflict preview otkriva foreign change detalje; calendar vraća globalne downtime prozore; CAB voter/quorum skup nije zamrznut i stari glasovi mogu odlučiti novi quorum; reminder marker se postavlja prije potvrđene isporuke.

Downtime je best-effort side effect nakon lifecycle commita, pa SCHEDULED/REVIEW/CANCELLED stanje može trajno odstupati od availability kalendara. Dodatni rizici su puna projekcija requester/CAB visibility izuzetaka, owner eligibility bez OU scopea, nepotpun audit, boot-only scheduler, stale conflict acknowledgement i hard truncation. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 23 produkcijska TypeScript fajla;
- 4 direktna speca;
- 3.483 aktuelna produkcijska LOC;
- 1 controller, 8 injectable servisa/komponenti i 1 BullMQ processor;
- Prisma: `ChangeRequest`, service/asset veze, `ChangeApproval`, `ChangeEvent`, `ChangeTemplate`, template-service i `ChangeSequence`;
- integracije: authorization/RBAC, OU/users/groups, assets, problems, service catalog/downtime, settings, notifications/email, privacy i BullMQ;
- primarni E2E dokaz: 31–32.

Registarskih 3.506 LOC korigovano je na 3.483, a servisni inventar sa 7 na 8.

## 3. API, scope i visibility

Controller je session-guarded i koristi strict whitelist/forbid validation. Servisi centralno provjeravaju addon, permission, OU scope i direct-ID visibility. Core writeovi koriste version predicate i foreign direct ID se uglavnom mapira na not-found.

`changeViewerOf` koristi zajednički viewer koji `CHANGE_MANAGER` označava globalnim neovisno o assignment OU. Scoped change manager zato čita i upravlja svakim changeom. ADMIN/SUPER_ADMIN role-name bypass također pretvara scoped assignment u installation-wide grant. Scope mora dolaziti iz assignmenta; global change management mora biti eksplicitno pravo.

Visibility izuzetak daje puni zapis requesteru, owneru i svakom članu CAB grupe, čak i kada je change izvan read scopea. To uključuje description/reason, implementation/backout/test/communication plan, assete, linked problem, događaje i approval komentare. CAB član bez `change.approve` i dalje dobija puni dokument ako ima `change.read`. Potrebne su role-specific projekcije i minimalni calendar/approval podaci.

## 4. Cross-domain asset i problem veze

Asset picker zahtijeva samo `change.request` i CMDB switch. Pretražuje globalno po tag/name/serial, bez `asset.read` i OU filtera. Create/update zatim validira samo da svi asset ID-evi postoje. Requester može enumerisati i povezati foreign asset, a svi viewer-i changea u detailu dobijaju ID/tag/name. Potrebno je koristiti `AssetAccessService` i scope-filterovati search, write i response shape.

Problem search pozitivno koristi `problem.read` i `problemVisibilityWhere`. Međutim create/update `assertReferences` na direct `problemId` provjerava samo addon i existence. Ručno poslan foreign ID zaobilazi search/read policy i detail zatim otkriva broj/naslov/status problema. Write mora ponoviti isti visibility check i dozvoljeni status.

Service liste/linkovi su installation-wide. Ako service authorization ima OU/service granicu, ona mora biti primijenjena i ovdje; change OU sam po sebi nije dokaz prava nad svakim serviceom.

## 5. Conflict preview i calendar exposure

Conflict engine korektno koristi half-open overlap, zajedničke service/asset ID-eve, freeze timezone i izuzima vlastiti change. Conflict acknowledgement se resetuje kada se prozor promijeni.

`POST /changes/conflicts/preview` zahtijeva samo `change.read`, prima arbitrary `serviceIds`, `assetIds` i `changeId`, a backend ne validira prava nad tim referencama. `conflictsFor` globalno učitava aktivne changeove i `describe` vraća ID, broj, naslov, status, planirani prozor, shared services i asset count. Scoped reader tako može probingom enumerisati foreign operational schedule. Kandidati moraju biti scope-filterovani, a inaccessible konflikt redigovan na count/window ili potpuno sakriven.

Calendar scope-filteruje changeove, ali downtime query nema nikakav viewer filter. Svaki change reader vidi sve service downtime prozore instalacije, service ime, message i `changeRequestId`. To je direktan cross-OU/service leak. Availability visibility politika mora biti primijenjena prije responsea.

Calendar ima `truncated`, što je pozitivno, ali konflikt query hard-limitira 200 bez indikacije. Nevidljiv 201. konflikt može dovesti do lažnog „nema konflikta“ rezultata.

## 6. Lifecycle, optimistic concurrency i business rules

State mašina razdvaja STANDARD/NORMAL/EMERGENCY tok, zahtijeva planove, prozor, CAB, linkove, lead time, freeze, outcome i post-implementation review. STANDARD mora koristiti aktivan low/medium-risk template. Core update/action koristi `{id,version,status}` CAS i transakcijske evente.

Conflict provjera i acknowledgement ipak se izvršavaju prije action transakcije. Paralelni change može ući u AUTHORIZATION/SCHEDULED nakon provjere, pa oba dobiju acknowledgement nad različitim snapshotom. Pošto su konflikti samo warning to nije DB invariant, ali audit mora sačuvati konkretan conflict snapshot/hash; trenutno bilježi samo action.

Scheduled window proširenje vraća change u AUTHORIZATION i povećava round; sužavanje ostaje SCHEDULED. Downtime release/sync se poziva poslije commita. Crash između commita i side effecta ostavlja stare prozore. Nema persisted reconciliation statea ili recovery joba.

Claim i general update imaju domain event, ali nemaju kanonski globalni audit. Owner, OU, CAB grupa, risk, plan i asset/service/problem link promjene zato mogu izostati iz centralnog audit loga.

## 7. CAB voter i quorum integritet

Vote zahtijeva `change.approve`, aktuelno CAB membership, status, version i zabranjuje requestera. Rejection mora imati razlog. Jedan glas po useru/roundu je DB unique; vote, status, event i audit su jedna transakcija.

Međutim round nema zamrznuti voter snapshot ni quorum snapshot. Svaki overview/vote ponovo učitava aktuelne članove i role te računa `min(setting, eligible)`. Tokom glasanja:

- uklanjanje članova spušta quorum;
- dodavanje članova podiže quorum;
- revoke može promijeniti ko je eligible;
- postojeći glasovi uklonjenih/revoked članova ostaju u `votes` i `evaluateChangeVotes` ih ne filtrira prema aktuelnom eligible skupu;
- stari glas može time zadovoljiti novi smanjeni quorum ili stara rejection odluka može završiti round.

Pri ulasku u AUTHORIZATION treba sačuvati round voter/quorum snapshot, ili u istoj zaključanoj transakciji strogo definirati dynamic membership i filtrirati glasove. Promjena CAB grupe/permissiona mora imati eksplicitnu invalidation politiku.

`loadCabVoterIds` uzima prvih 100 bez `hasMore`; grupa sa 101+ članom tiho mijenja eligibility i quorum. Komentar „misconfigured“ nije runtime guard.

## 8. Downtime side effects i consistency

Downtime plan deduplicira own prozore, izbjegava overlapping foreign prozore i release briše budući/skraćuje tekući. Create/update/delete i service-catalog change log su transakcijski unutar applyja.

Lifecycle i downtime ipak nisu jedan durable workflow. `syncDowntime`/`release` hvataju sve greške, samo loguju i vraćaju uspjeh calleru. Posljedice:

- change može biti SCHEDULED bez potrebnog maintenance prozora;
- reschedule može ostaviti stari prozor;
- cancel/finish može ostaviti budući downtime aktivan;
- approval API vraća uspjeh iako availability stanje nije usklađeno;
- nema automatskog reconciliationa očekivani-vs-stvarni prozor.

Potreban je outbox/reconcile job sa desired downtime stateom, retry/dead-letter i health driftom. Skipped service zbog foreign overlap mora biti vidljiv kao operativni warning, ne samo event/log.

## 9. Reminders, notifications i scheduler

Notification koristi preference policy, in-app dedupe i centralni email delivery helper. Approval/decision occurrence uključuje round, a starting/overdue imaju stabilan ključ.

Sweep prvo CAS-om upiše `reminderSentAt`/`overdueNotifiedAt`, zatim kreira event i pokušava notification. Ako event create, recipient lookup ili delivery padne, marker ostaje. Nula recipienta i sve preference OFF također trajno završavaju reminder. Marker mora predstavljati persisted/delivered outcome ili outbox task, ne claim bez lease/retrya.

Scheduler upsertuje stabilan hourly ID samo pri bootu; Redis flush/restart poslije boota i registracijska greška se ne reconciliuju do redeploya. Nema scheduler-presence, last-run, upcoming-undelivered, overdue backlog ni downtime-drift health metrike.

## 10. Owner, template i reference integrity

Owner mora biti active/non-anonymized user koji negdje ima `change.manage`, ali query ne provjerava da permission assignment pokriva OU konkretnog changea. Owner picker zato nudi foreign scoped managere; kasniji revoke/deactivation se ne reconciliuje. Claim koristi actorov aktuelni scope i bolji je od arbitrary owner assignmenta.

Template create/update je transakcijski sa auditom, risk je recomputed i service ID-evi validirani. Existing STANDARD change čuva kopirane planove, što je dobar frozen-intent obrazac. Template update nema optimistic version; dva managera mogu last-write-wins zamijeniti fields/services i oba dobiti audit „updated“ bez before/after.

Default CAB bira alfabetički prvi CAB group kada input izostane. U multi-CAB instalaciji to može tiho poslati change pogrešnom tijelu. Treba eksplicitna konfiguracija po OU/service ili obavezan izbor.

## 11. Privacy i retention

Privacy export uključuje changeove gdje je osoba requester/owner, njene glasove i akcije. Anonymization scrubuje tekstove takvih changeova, vlastite vote komentare i relevantne event detail-e. To je dobra integracija.

Coverage je heuristic: osoba može biti imenovana u planu/changeu kojem nije requester/owner; taj zapis se ne scrubuje. CAB overview čuva i prikazuje vote komentare neograničeno. Downtime message replicira change number/title u service-catalog zapis. Notification/email i linked problem event mogu replicirati podatke izvan change lifecyclea.

Nema formalnog retentiona za closed/rejected/cancelled change, approval komentare i event JSON. API delete ne postoji, pa zapisi ostaju neograničeno. Potrebna je ITSM/legal retention politika i parity za downtime/change-log/notifier replike.

## 12. Resource bounds i API completeness

Glavni register ima cursor, limit i total. Events, approvals, templates, options, conflicts i calendar koriste hard limite 200–2.000. Approval overview uzima 500 svih roundova bez paginationa; templates 500; events 200. Dio endpointa nema `hasMore`, a conflict truncation nije signalizirana.

Configuration integeri nisu lokalno clampovani. Negativan/ogroman quorum, lead time ili reminder hours mogu dati neočekivanu business/resource semantiku, iako setting layer možda validira standardni UI put. Servis mora fail-safe clampovati vlastite granice.

## 13. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/changes -name '*.spec.ts' -print | sort)
```

Rezultat: **3/4 suiteova prošlo, 1/4 compile-blocked; 17/17 izvršenih testova prošlo**. Blokiran je `change-access.service.spec.ts` zbog nepotpunog generated Prisma clienta (`group`, `groupMember`, `organizationalUnit`). Nije zabilježen assertion failure.

Zeleni specovi pokrivaju risk/lifecycle/window/freeze/review pravila, conflict/downtime pure plan i reminder planning. Nema direktnih service/Prisma/concurrency testova za approvals, CRUD, templates, schedule side effects ili notifier.

E2E 31–32 pokrivaju happy lifecycle, requester self-vote deny, CAB approval/rejection, lock/version, plans/outcome/review, downtime create/cancel, conflict acknowledgement, freeze, templates i a11y. Ne pokrivaju scoped manager, foreign asset/problem link, preview/calendar leak, dynamic CAB membership, concurrent votes, crash nakon lifecycle commita, reminder failure/Redis loss, owner OU eligibility ni privacy retention.

## 14. Pozitivni nalazi

1. Session guard i strict DTO validation.
2. Addon + CAB-group activation gate.
3. Atomic sequence i formatted number.
4. Core create/action event i audit su transakcijski.
5. Update/action/vote koriste optimistic version/status predicate.
6. Jasna type-specific lifecycle pravila.
7. Risk se server-side računa iz impact × likelihood.
8. Required implementation/backout/test/window/lead/freeze checks.
9. Requester ne može glasati; vote je unique po roundu.
10. Vote/status/event/audit su jedna transakcija.
11. STANDARD koristi aktivan bounded-risk template i kopira plan.
12. Conflict engine ima korektnu overlap semantiku.
13. Window move resetuje conflict/reminder markere.
14. Downtime apply + catalog change log su transakcijski.
15. Notification preference/dedupe/email helper se koriste.
16. Privacy export i scrub imaju changes integraciju.
17. Svih 17 izvršenih testova je zeleno.

## 15. Registar nalaza

| ID            | Severity | Nalaz                                                                                         | Status   |
| ------------- | -------- | --------------------------------------------------------------------------------------------- | -------- |
| BA-changes-01 | P1       | CHANGE_MANAGER i scoped ADMIN role-name bypass daju globalni OU read/write scope              | otvoreno |
| BA-changes-02 | P1       | Asset search/link/detail zaobilaze `asset.read` i CMDB OU scope                               | otvoreno |
| BA-changes-03 | P1       | Direct problem link write provjerava samo existence, ne `problem.read` visibility             | otvoreno |
| BA-changes-04 | P1       | Conflict preview sa arbitrary referencama otkriva foreign change schedule i identitet         | otvoreno |
| BA-changes-05 | P1       | Calendar vraća globalne downtime poruke/service/change ID bez viewer scopea                    | otvoreno |
| BA-changes-06 | P1       | CAB voter/quorum nije zamrznut, a glasovi neeligible bivših članova i dalje odlučuju round     | otvoreno |
| BA-changes-07 | P1       | Reminder/overdue marker se postavlja prije primaoca i potvrđene/persistirane isporuke          | otvoreno |
| BA-changes-08 | P2       | Lifecycle commit i downtime sync/release nisu durable; status i availability mogu odstupati    | otvoreno |
| BA-changes-09 | P2       | Requester/owner/CAB visibility izuzeci vraćaju puni plan, linkove, events i vote komentare     | otvoreno |
| BA-changes-10 | P2       | Owner eligibility ne veže `change.manage` assignment za OU konkretnog changea                 | otvoreno |
| BA-changes-11 | P2       | Claim/general update nemaju kanonski globalni audit                                            | otvoreno |
| BA-changes-12 | P2       | Conflict acknowledgement nema snapshot/hash i može zastarjeti prije action commita             | otvoreno |
| BA-changes-13 | P2       | Scheduler nema Redis-loss reconciliation ni delivery/downtime drift health                     | otvoreno |
| BA-changes-14 | P2       | CAB eligibility hard-limit 100 tiho izostavlja članove i mijenja quorum                        | otvoreno |
| BA-changes-15 | P2       | Template update nema optimistic concurrency/before-after audit                                 | otvoreno |
| BA-changes-16 | P2       | Default CAB je alfabetički prvi group, bez OU/service routing politike                         | otvoreno |
| BA-changes-17 | P2       | Privacy/retention ne pokrivaju sve tekstualne i downtime/notifier/problem replike              | otvoreno |
| BA-changes-18 | P3       | Events/approvals/templates/options/conflicts liste se hard-trunciraju bez potpunog cursor ugovora | otvoreno |
| BA-changes-19 | P3       | Servis ne clampuje quorum/lead/reminder configuration integer granice                          | otvoreno |
| BA-changes-20 | P3       | Jedan suite je compile-blocked; nema service/concurrency/failure E2E matrice                    | otvoreno |

## 16. Ključne korekcije

- **01:** assignment-derived scope; global manager pravo samo kao eksplicitni installation grant.
- **02–03:** reuse asset/problem access policy na search, direct write i response projection.
- **04–05:** scope-filter conflict/calendar reference i redact inaccessible konflikt/downtime detalje.
- **06, 14:** persisted round voter/quorum snapshot ili strogo filtrirana dynamic politika; reject oversized CAB.
- **07:** outbox/delivery state; marker tek nakon policy-dovoljnog persisted outcomea.
- **08, 13:** desired downtime state + reconciliation worker, retry/dead-letter i scheduler/health self-heal.
- **09–10:** role-specific minimal projection i owner OU-grant eligibility/reconciliation.
- **11–12:** potpuni transactional audit i conflict snapshot/hash vezan za action.
- **15–17:** template version, eksplicitni CAB routing i formalni privacy/retention replika lifecycle.
- **18–20:** cursor/hasMore, config clamp i Postgres/Redis/concurrency/fault testovi.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,20 |
| B. API i ugovori             |    12% |   4,90 |
| C. Auth/authz/scope          |    15% |   3,30 |
| D. Poslovna pravila/stanje   |    13% |   5,00 |
| E. Podaci/Prisma/transakcije |    13% |   4,60 |
| F. Sigurnost/privatnost      |    12% |   3,80 |
| G. Async/integracije         |     8% |   3,40 |
| H. Testovi/dokazivost        |    10% |   4,20 |
| I. Operativnost/perf.        |     7% |   4,00 |
| **Ukupno**                   | **100%** | **4,28/10** |

Ponderisani zbir je 4,279. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 18. Fazni plan

### Faza 0 — safety net

Scoped manager/admin; foreign asset/problem link; conflict probing; calendar downtime leak; CAB add/remove/revoke tokom rounda; crash poslije SCHEDULED/CANCELLED; reminder no-recipient/failure; template concurrent update; Redis flush.

### Faza 1 — P1 scope i cross-domain policy

Assignment scope, asset/problem/service access reuse, scoped conflict response i downtime calendar redakcija.

### Faza 2 — CAB governance

Round voter/quorum snapshot, eligible-vote filter, oversized CAB reject i concurrent vote/Postgres testovi.

### Faza 3 — durable downtime i delivery

Desired-state outbox/reconciler za downtime, durable reminder delivery, retries/dead-letter i scheduler self-heal.

### Faza 4 — visibility, audit i ownership

Role-specific projections, OU-aware owner eligibility, update/claim audit i conflict acknowledgement snapshot.

### Faza 5 — template, routing, privacy i finalni gate

Template versioning, CAB routing, retention/anonymization replike, pagination/config bounds; sva 4 suitea, E2E 31–32 i fault-injection na finalnom SHA-u.

## 19. Acceptance i konačna presuda

1. Nijedan role assignment nije globalan bez eksplicitnog global scopea.
2. Asset/problem/service link poštuje authorization izvornog domena na search, write i read.
3. Conflict/calendar ne otkrivaju foreign change/downtime detalje.
4. CAB round ima dokaziv voter/quorum skup; membership drift ne mijenja odluku retroaktivno.
5. Downtime eventualno odgovara lifecycle stanju nakon crasha i Redis gubitka.
6. Reminder marker postoji samo uz retryable persisted delivery outcome.
7. Requester/owner/CAB vide samo polja potrebna ulozi.
8. Owner, template i CAB routing su scoped, versionirani i auditirani.
9. Privacy/retention pokriva downtime/notifier/problem replike, a liste ne trunciraju tiho.
10. Sva 4 direktna suitea, Postgres/Redis/fault integracije i E2E 31–32 prolaze.

Change modul ima dobru state-machine i optimistic jezgru, ali global role bypass, cross-domain reference propusti i nepostojan CAB/downtime/delivery model trenutno nisu dovoljni za enterprise change governance. Iskren baseline je **4,28/10**.
