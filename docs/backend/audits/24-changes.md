# Backend audit 24 — `changes`

**Status:** audit završen<br>
**Datum:** 2026-10-23<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **4,28/10**<br>
**Nalazi:** 7 P1, 10 P2, 3 P3<br>
**Implementacija:** W7.1 je djelimično zatvorio `BA-changes-01`; ostali nalazi su otvoreni.

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
| BA-changes-01 | P1       | CHANGE_MANAGER i scoped ADMIN role-name bypass daju globalni OU read/write scope              | zatvoreno |
| BA-changes-02 | P1       | Asset search/link/detail zaobilaze `asset.read` i CMDB OU scope                               | zatvoreno |
| BA-changes-03 | P1       | Direct problem link write provjerava samo existence, ne `problem.read` visibility             | zatvoreno |
| BA-changes-04 | P1       | Conflict preview sa arbitrary referencama otkriva foreign change schedule i identitet         | zatvoreno |
| BA-changes-05 | P1       | Calendar vraća globalne downtime poruke/service/change ID bez viewer scopea                    | zatvoreno |
| BA-changes-06 | P1       | CAB voter/quorum nije zamrznut, a glasovi neeligible bivših članova i dalje odlučuju round     | zatvoreno |
| BA-changes-07 | P1       | Reminder/overdue marker se postavlja prije primaoca i potvrđene/persistirane isporuke          | zatvoreno |
| BA-changes-08 | P2       | Lifecycle commit i downtime sync/release nisu durable; status i availability mogu odstupati    | zatvoreno (W7.64) |
| BA-changes-09 | P2       | Requester/owner/CAB visibility izuzeci vraćaju puni plan, linkove, events i vote komentare     | zatvoreno (W7.65) |
| BA-changes-10 | P2       | Owner eligibility ne veže `change.manage` assignment za OU konkretnog changea                 | zatvoreno (W7.66) |
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

- **01:** zatvoreno u W7.1 — assignment-derived scope; global manager pravo samo uz eksplicitni installation grant. Dokaz: [W7.1 implementation](../implementation/87-domain-assignment-scope.md).
- **02:** zatvoreno u W7.43 — picker, write link i response projekcija koriste `asset.read` i asset OU
  scope preko zajedničkog helpera `assets/asset-link-access.ts`. Dokaz:
  [W7.43 implementation](../implementation/264-w743-changes-02-asset-scope.md).
- **03:** zatvoreno u W7.44 — direct problem link ponavlja `problem.read` visibility i dozvoljeni status
  (`CHANGE_PROBLEM_CLOSED` za zatvoren/otkazan problem). Dokaz:
  [W7.44 implementation](../implementation/265-w744-changes-03-problem-link.md).
- **04:** zatvoreno u W7.45 — preview scope-uje reference i broji, ali ne imenuje, nedostupne konflikte.
  Dokaz: [W7.45 implementation](../implementation/266-w745-changes-04-conflict-preview.md).
- **05:** zatvoreno u W7.46 — downtime prozori changea filtriraju se SQL-om po istoj visibility politici,
  a skriveni se broje (`restrictedDowntime`). Dokaz:
  [W7.46 implementation](../implementation/267-w746-changes-05-calendar-downtime.md).
- **06:** zatvoreno u W7.47 — runda se otvara sa zamrznutim `voterSnapshot { round, voters, quorum }` u
  `status` eventu; glasovi van tog skupa se ne broje, a membership drift ne mijenja kvorum. Dokaz:
  [W7.47 implementation](../implementation/268-w747-changes-06-cab-round-snapshot.md).
- **14:** otvoreno — CAB eligibility hard-limit 100 još tiho odsijeca članove (P2).
- **07:** outbox/delivery state; marker tek nakon policy-dovoljnog persisted outcomea.
- **08:** zatvoreno u W7.64 — durable outbox/reconciler je već postojao (`BA-service-catalog-11`), a paket je
  zatvorio jedinu stvarno otvorenu granu: tekst downtime prozora (naslov changea) nije se konvergirao ni u
  sync-u ni u drift provjeri. Dokaz: [W7.64 implementation](../implementation/285-w764-changes-08-downtime-window-text.md).
- **13:** desired downtime state + reconciliation worker, retry/dead-letter i scheduler/health self-heal.
- **09:** zatvoreno u W7.65 — vidljivost je postala projekcija (`full`/`participant`/`voter`/`observer`), event
  diffovi, asset/problem linkovi i vote komentari više ne idu izuzetim čitaocima. Dokaz:
  [W7.65 implementation](../implementation/286-w765-changes-09-role-projection.md).
- **10:** zatvoreno u W7.66 — eligibility koristi isti scope resolver kao `canManage` (picker, save i
  reconciler se ne mogu razići), a revokacija/deaktivacija se bilježi kao `owner_ineligible` event. Dokaz:
  [W7.66 implementation](../implementation/287-w766-changes-10-owner-eligibility.md).
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

## 20. Implementacijski closeout — W7.1 (`BA-changes-01`)

Na SHA `49c6559949606ebd87c867f37fe2ce9f0363d1c0`, uz zeleni CI `40911525016`, `ChangeAccessService.require()` zadržava scoped `CHANGE_MANAGER` i `ADMIN` u assignment OU-u; cross-unit `CHANGE_MANAGER` traži installation-wide assignment. CAB membership je i dalje obavezna zasebna provjera. Nema nove migracije; baseline ostaje audit snapshot, a preostali nalazi su otvoreni. Zajednički testni i CI dokaz: [87-domain-assignment-scope.md](../implementation/87-domain-assignment-scope.md).

## 21. Implementacijski closeout — W7.43 (`BA-changes-02`)

Na `9c05f29`, uz zeleni CI `44397715817`, CMDB veze na changeu više ne zaobilaze CMDB granicu:
`searchAssets`, `assertReferences` i projekcija detaila/liste koriste isti helper
(`assets/asset-link-access.ts`) koji problems modul koristi od W7.22 — odluka se izvodi iz `asset.`
prefiksa, tuđi ID se vraća kao `CHANGE_ASSET_NOT_FOUND`, a `assetCount` prati vidljive linkove. Update
namjerno ne briše linkove koje editor ne vidi. Nema nove migracije; `service.*` scope ostaje otvorena
observacija iz §4 (nema vlastiti ID u registru), a `BA-changes-03` je sljedeći P1. Zajednički dokaz:
[264-w743-changes-02-asset-scope.md](../implementation/264-w743-changes-02-asset-scope.md).

## 22. Implementacijski closeout — W7.44 (`BA-changes-03`)

Na `056d4db`, uz zeleni CI `44400859473`, direct `problemId` na create/update prolazi punu link politiku
pickera: `problem.read` vidljivost (koja je u kodu već bila preko `canReadProblem`) **i** dozvoljeni status.
Tuđi ili nečitljiv problem i dalje daje `CHANGE_PROBLEM_NOT_FOUND` (bez potvrde postojanja), a čitljiv ali
zatvoren/otkazan problem daje novi `CHANGE_PROBLEM_CLOSED` (409) sa statusom u detalju; update koji ne dira
problem ne revalidira postojeći link. Nema migracije. Zajednički dokaz:
[265-w744-changes-03-problem-link.md](../implementation/265-w744-changes-03-problem-link.md).

## 23. Implementacijski closeout — W7.45 (`BA-changes-04`)

Na `6d3b701`, uz zeleni CI `44404252202`, conflict preview ne može više poslužiti kao enumerator tuđeg
rasporeda: traženi `assetIds` prolaze kroz `asset.read` scope (W7.43 helper), `changeId` se poštuje samo ako
ga viewer smije čitati, a `describe()` dobija publiku — dostupni konflikti zadržavaju puni oblik, nedostupni se
svode na `restricted: { changes, downtime }` i **i dalje postavljaju `hasWarnings`**, pa acknowledgement ne
može proći tiho. Frontend prikazuje brojeve bez imena. Nema migracije; `04` zatvoren, `05` (calendar downtime)
ostaje sljedeći P1. Dokaz:
[266-w745-changes-04-conflict-preview.md](../implementation/266-w745-changes-04-conflict-preview.md).

## 24. Implementacijski closeout — W7.46 (`BA-changes-05`)

Na `eea32fa`, uz zeleni CI `44406819251`, kalendar više ne objavljuje tuđe downtime prozore: prozor bez
vlasnika ostaje javan, a prozor koji pripada changeu filtriran je **u SQL-u** istim `changeVisibilityWhere`
predikatom kao lista changeova (pa skriveni redovi ne mogu istisnuti vidljive kroz `take`). Skriveni prozori
se vraćaju kao `restrictedDowntime` i UI to kaže, umjesto da tiho nestanu. Nema migracije; `06` (CAB voter
snapshot) je sljedeći P1. Dokaz:
[267-w746-changes-05-calendar-downtime.md](../implementation/267-w746-changes-05-calendar-downtime.md).

## 25. Implementacijski closeout — W7.47 (`BA-changes-06`)

Na `8e1e8e3`, uz zeleni CI `44410001059`, CAB runda ima dokaziv i zamrznut skup glasača: `act()` pri ulasku u
`AUTHORIZATION` upisuje `voterSnapshot { round, voters, quorum }` u isti `status` event (bez nove tabele i bez
migracije), glasovi se broje **samo** iz tog skupa, a kvorum je onaj s kojim je runda otvorena. Član koji je
ušao u CAB poslije otvaranja ne glasa u toj rundi; član koji je izašao zadržava već dat glas (drift ne mijenja
odluku retroaktivno). Runda otvorena prije izdanja radi po starom pravilu (`frozen: false`) dok se ne završi.
`BA-changes-14` (hard-limit 100) ostaje otvoren kao P2. Dokaz:
[268-w747-changes-06-cab-round-snapshot.md](../implementation/268-w747-changes-06-cab-round-snapshot.md).

## 26. Implementacijski closeout — W7.48 (`BA-changes-07`)

Na `e61ffee`, uz zeleni CI `44473902632`, sweep više ne tvrdi da je podsjetnik poslan: claim markice
(`reminderSentAt`/`overdueNotifiedAt`), `ChangeEvent` i **outbox intent** (`change.reminder.dispatch`) pišu se u
istoj transakciji, pa markica znači „persistirana, retryable namjera“, a ne „vjerovatno poslano“. Novi
`ChangeReminderOutboxDispatcher` drenira topic svake 2 s i pušta pad isporuke u outbox retry/dead-letter put;
dedupe ključ je vezan za prozor (`change-reminder:<kind>:<change>:<window>`), pa concurrent workers i ponovni
sweep ne mogu poslati isti podsjetnik dvaput. `ops-health` prikazuje `changeReminderOutbox`
(pending/processing/dead-letter/najstarije) da zaglavljeni podsjetnik bude vidljiv. Nema migracije — koristi se
postojeća `OutboxMessage` tabela. U `24-changes.md` ostaje 13 otvorenih nalaza (P1: nijedan). Dokaz:
[269-w748-changes-07-reminder-outbox.md](../implementation/269-w748-changes-07-reminder-outbox.md).

## 27. Implementacijski closeout — W7.64 (`BA-changes-08`)

**Status nalaza:** zatvoren; paket W7.64, kod `06b3bee`, CI
[`44623850740`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44623850740) **success**, **bez
migracije**. Detalji: [285](../implementation/285-w764-changes-08-downtime-window-text.md).

**Šta je bilo:** §8 je opisao dva koraka koja nisu jedan workflow — lifecycle commit pa best-effort downtime sync
koji guta greške — sa pet mogućih posljedica (SCHEDULED bez prozora, stari prozor poslije reschedulea, aktivan
budući downtime poslije cancel/finish, uspjeh approvala bez usklađene dostupnosti, nema reconciliationa).

**Šta je sada:** durable polovina je već bila isporučena kroz `BA-service-catalog-11` i to je **provjereno u
kodu**, ne u dokumentaciji: lifecycle transakcije (`create`, `update`, `act`, `approvals`) enqueueaju
`change.downtime.sync` unutar sebe, `syncDowntime` ne guta greške, outbox ima retry/dead-letter, a
`ChangeDowntimeOutboxReconciler` traži drift i `ops-health` prikazuje backlog. Provjera je našla jednu granu
koja je zaista bila otvorena: tekst prozora (`CHG000012: <naslov>`) je izvedeno stanje koje ni update ni drift
nisu gledali, pa je preimenovan zakazani change trajno ostavljao stari naslov u servisnom kalendaru. Sada
`changeUpdateAffectsDowntime` tretira naslov kao drift, `downtimeMessage` gradi tekst na jednom mjestu,
`syncDowntime` osvježava zastarjele tekstove prozora koji prežive plan (uz service-catalog change log i
`messageUpdated` u eventu), a `hasDowntimeDrift` prijavljuje i message-only odstupanje. Redelivery iste naredbe
ostaje no-op kroz `outboxDedupeKey`.

**Acceptance:** §19 traži da status i dostupnost ne mogu trajno odstupati bez traga i da svaki kvar bude
retryable. To sada vrijedi i za izvedeni tekst prozora: odstupanje je ili odmah konvergirano (sync u istoj
transakciji) ili ga reconciler nađe i ispravi; u oba slučaja ostaje zapis u change historyju i service-catalog
change logu.

**Šta ostaje u ovom modulu:** P1 nema. P2: `09`, `10`, `11`, `12`, `13`, `14`, `15`, `16`, `17`. P3: `18`, `19`,
`20`.

**Preostali rizik:** message-only ispravka čeka sljedeći scan (30 s); skipped service zbog stranog preklapanja
još nije operativni warning (dio `13`); reconciler je keyset batch od 100, pa puni ciklus pri velikom broju
changeova traje više tickova; naslov se skraćuje samo u tekstu prozora.

## 28. Implementacijski closeout — W7.65 (`BA-changes-09`)

**Status nalaza:** zatvoren; paket W7.65, kod `dfaf726` (+`bd66d0e`, `b61813f`, `405407a`), CI
[`44689289402`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44689289402) **success**, **bez
migracije**. Detalji: [286](../implementation/286-w765-changes-09-role-projection.md).

**Šta je bilo:** §3 je opisao visibility izuzetak kao binarni — requester, owner i CAB član dobijali su **cijeli**
detalj izvan svog OU scopea, uključujući planove, tuđe CMDB redove, linked problem, field-level event diffove i
sve CAB komentare; CAB član bez `change.approve` dobijao je isto ako ima `change.read`.

**Šta je sada:** `changeDetailLevel` dijeli čitaoce na `full` (u scopeu), `participant` (requester/owner),
`voter` (CAB + `change.approve`) i `observer` (CAB bez prava glasanja), a `observer` je i fail-closed fallback.
Participant zadržava plan za koji odgovara, voter onaj koji mora ocijeniti, observer samo lifecycle zapis.
Skriveni asset/problem linkovi se ne učitavaju, event `detail` je sveden na lifecycle činjenice, a CAB komentari
ostaju samo za `full`/`voter` i autora (`commentsRedacted`). Odgovor imenuje skrivena polja (`detailLevel`,
`redactedFields`), pa UI kaže „skriveno” umjesto da prikaže prazan plan. Članstvo u CAB-u se provjerava odvojeno
od prava glasanja (`isCabGroupMember`), jer se izuzetak veže na članstvo.

**Acceptance:** §14.7 („Requester/owner/CAB vide samo polja potrebna ulozi”) je ispunjen i mjerljiv: svaki nivo
ima svoj test, a `full` čitaocima se izlaz nije promijenio. Dokaz: 10 backend testova za projekciju, 5 za
komentare, 4 frontend testa za UI poruku.

**Šta ostaje u ovom modulu:** P1 nema. P2: `10`, `11`, `12`, `13`, `14`, `15`, `16`, `17`. P3: `18`, `19`, `20`.

**Preostali rizik:** participant namjerno zadržava plan; imena servisa i OU ostaju vidljivi svim nivoima (to je
`BA-changes-10`/service scope tema); event redakcija uklanja `changes` diff i za ownera izvan scopea; CAB roster
je vidljiv članovima svoje grupe; autor uvijek vidi vlastiti komentar.

## 29. Implementacijski closeout — W7.66 (`BA-changes-10`)

**Status nalaza:** zatvoren; paket W7.66, kod `ce6f2f1` (+`7562031` tip, `eba1f66` format), CI
[`44696149887`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44696149887) **success**, **bez
migracije**. Detalji: [287](../implementation/287-w766-changes-10-owner-eligibility.md).

**Šta je bilo:** owner je bio prihvaćan ako **bilo gdje** ima `change.manage`. Picker je zato nudio scoped
managere iz tuđih OU-a, save ih je prihvatao, a change je dobijao vlasnika koji ga po `canManage` pravilu ne može
mijenjati. Kad owneru kasnije bude revokovan assignment, deaktiviran ili anonimiziran nalog, ništa se nije
rekonsolidovalo — change je tiho ostajao bez efektivnog vlasnika, bez zapisa zašto.

**Šta je sada:** `change-owner-eligibility.ts` izvodi scope iz **istog** lanca koji koristi `canManage`
(`assetViewerFromContext` → `resolveAssetScope(change.manage, homeUnitPath)` → `isPathInScope`), pa picker, write
validacija i reconciler dijele jedno pravilo. Ishod je jedan od pet: `eligible`, `missing`, `inactive`,
`anonymized`, `out_of_scope` (fail-closed i za nepoznat unit path). `create` validira ownera prema svom unitu
uvijek; `update` validira efektivni par `(owner, unit)` **samo** kad se owner ili unit mijenjaju, pa change čiji
je owner kasnije izgubio assignment ostaje urediv. `GET /changes/owners` prima `organizationalUnitId` (fallback
`homeOrganizationalUnitId`, bez unta prazna lista), over-fetchuje 60 i filtrira scope sa jednim batch principal
upitom. Worker-only `ChangeOwnerReconciler` (5 min, keyset, batch 100) za žive change-ove bilježi **jedan** `owner`
event (`reason: owner_ineligible`, `eligibility`, `ownerUserId`) i ne ponavlja ga; owner se ne briše, jer change
bez vlasnika krši lifecycle i može ga preuzeti manager tog OU-a. Detalj vraća `ownerEligible` (`null` bez ownera),
UI prikazuje `changes.detail.ownerNotEligible`, a forma odbacuje odabranog ownera kad se unit promijeni.

**Acceptance:** §10 („owner mora biti manager OU-a changea”) je ispunjen i mjerljiv: write validacija, picker,
detalj i reconciler imaju svoje testove (6 + 9 backend, 3 frontend), a nepodoban owner više ne može biti spremljen
niti ponuđen. Nijedna postojeća putanja nije oslabljena: unscoped grant pada na home unit isto kao `canManage`, a
unscoped manager sa `change.manager`/globalnom rolom i dalje pokriva sve.

**Šta ostaje u ovom modulu:** P2: `11`, `12`, `13`, `14`, `15`, `16`, `17`. P3: `18`, `19`, `20`.

**Preostali rizik:** reconciler samo bilježi drift (odluka o novom vlasniku je ljudska); owner mora imati
`change.manage`, ne `change.read`; service-scoped grant pokriva home unit (postojeća semantika); anonimizirani
bivši owner ostaje `null` actor u historiji; batch od 100 po ticku znači da se veliki drift vidi kroz nekoliko
intervala.
