# Backend audit 34 — `service-onboarding`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,15/10**  
**Nalazi:** 7 P1, 10 P2, 3 P3

## 1. Executive summary

`service-onboarding` je state machine koja kreira ili preuzima DRAFT service, vodi korake SERVICE → FORM → ROUTING → SLA → APPROVALS, dopušta abandon/resume i na kraju aktivira service. Modul ima dobru nominalnu strukturu: session/ADMIN guard, zasebne permissions po domenu, service scope, DTO whitelist i dužinske limite, eksplicitne statuse, active-form provjeru, završnu transakciju koja zajedno aktivira service i završava workflow te change-log za lifecycle i onboarding.

Baseline je **4,15/10**. Sedam P1 nalaza potkopavaju activation invariant i audit atomarnost. Kreiranje servicea, onboarding reda i audit zapisa nije jedna transakcija; gotovo sve save/complete/abandon/resume operacije ažuriraju state pa tek zatim odvojeno auditiraju. Finalna validacija se izvršava prije transakcije i commit koristi stale record bez locka/CAS-a. SLA provider prihvata nepostojeći ili neaktivan profil kao uspješnu validaciju i finalize tada tiho zadržava prethodni SLA. Approvals provider prihvata bilo koji sintaktički reference string kao stvarnu konfiguraciju. Nedostatak routing coveragea je samo warning, pa service može postati ACTIVE bez upotrebljivog routinga. Konfiguracijski security/activation prekidači `requireValidationBeforeActivate` i `autoFillRoutingRequireConfirm` učitavaju se, ali se nigdje ne provode.

Dodatni rizici su last-write-wins JSON state, paralelni complete/abandon/finalize, validation-error write izvan transakcije, generički error collapse, nepostojanje idempotency/version ugovora, mutable completed koraci bez downstream invalidacije, config promjena tokom workflowa i nedovoljan real DB/E2E dokaz. Pokretanje svih sedam suiteova dalo je 1/7 zelen suite, 2/2 izvršena testa zelena i šest compile-blokiranih suiteova. Popravke nisu implementirane.

## 2. Scope i inventar

- 40 produkcijskih TypeScript fajlova;
- 7 direktnih specova;
- 2.515 direktno izmjerenih produkcijskih LOC (registar: 2.555);
- 3 controllera, 2 glavna injectable servisa plus executor/configuration/domain provideri;
- 16 HTTP operacija nad create/start/get/finalize/abandon/resume i pet save/complete koraka;
- Prisma: `ServiceOnboarding`, `Service`, `FormVersion`, `SlaProfile`, routing i change-log;
- nema direktnog service-onboarding E2E scenarija; postoje samo unit/in-memory suiteovi.

## 3. State machine i invarianti

Pozitivno je što registry ima fiksni redoslijed, completed steps se parsiraju i dedupliciraju, status/currentStep se deriviraju, completed/active konzistentnost se provjerava, a COMPLETED i ABANDONED nisu mutable. Service ostaje DRAFT do finalizea.

Ipak `completedSteps` i `lastValidationErrors` su JSON bez DB check/version invarianta. `persistOnboardingRecord` radi update samo po `id`, na osnovu ranije učitanog recorda. Dva paralelna zahtjeva mogu izgubiti completed step, vratiti currentStep unazad, obrisati tuđe validation errors ili pobijediti abandon/finalize. `updatedAt` se ne koristi kao optimistic version.

`assertStepIsReachable` dopušta ponovno uređivanje već završenog ranijeg koraka, ali ne invalidira downstream completed steps. Finalize trenutno ponovo validira sve, što ublažava dio rizika, ali UI/state i READY_FOR_FINALIZATION mogu ostati lažni između editovanja i finalizea.

## 4. Create/start i audit atomarnost

`createServiceOnboarding` prvo poziva centralni `createService` (koji ima vlastitu transakciju), zatim zasebno kreira onboarding i zatim zasebno change-log. Pad drugog koraka ostavlja orphan DRAFT service bez workflowa; pad audita ostavlja uspješan service+workflow bez onboarding audita. Retry može zapeti na slug conflict.

`start` radi read-existing-create pa audit bez jedne transakcije. Unique `serviceId` sprečava dupli onboarding red, ali paralelni poziv dobija raw conflict umjesto stabilnog idempotentnog rezultata. Service lifecycle može se promijeniti između readova i createa.

Sve tri činjenice — DRAFT service, onboarding row i create/start audit — moraju nastati u jednoj transakciji ili durable saga/idempotency ledgeru.

## 5. Save/complete/abandon/resume atomarnost

Save service prvo mijenja Service kroz service-catalog pa odvojeno piše onboarding audit. Ostali save koraci prvo mijenjaju onboarding JSON/reference pa zatim auditiraju. Complete, abandon i resume slijede isti obrazac. Audit kvar zato ne rollbackuje poslovni state. Obrnuto, response `executor.respond` može pasti nakon uspješnog writea, pa klijent dobija 500 i ponavlja već commitovanu mutaciju.

Complete validation-error put zapisuje `lastValidationErrors`, pa baca exception, bez audit događaja. Operator može izazvati ili promijeniti trajni workflow state kroz neuspješan request bez change-loga. Potreban je jedinstven transactional command po operaciji, required reason/requestId, idempotency key i version/CAS.

## 6. Finalize TOCTOU i concurrency

Finalize učitava record i service, validira svih pet koraka, provjerava routing coverage, ponovo validira SLA/approvals i lifecycle — sve prije `$transaction`. Transakcija zatim bez rereada/locka aktivira service i updateuje stale onboarding record. U međuvremenu drugi zahtjev može promijeniti form status, routing, SLA, approval ref, service fields, abandon status ili completed steps.

Paralelna dva finalizea mogu oba proći pre-check i oba pisati/auditirati activation. Paralelni abandon/save može biti izgubljen. Potreban je row lock/advisory lock ili serializable transakcija, reread svih activation evidencea unutar iste transakcije i CAS nad service/onboarding versionom.

## 7. SLA, approvals i routing evidence

`DefaultOnboardingSlaProvider.validate` parsira ID, čita profil i vraća `resolvedEntityId: null` kada profil ne postoji ili nije aktivan — ne baca grešku. `collectStepValidationIssues` zato označava SLA korak validnim. Finalize zatim koristi `sla.resolvedEntityId ?? service.slaProfileId`, pa nevažeći odabrani SLA tiho postaje stari ili null SLA. Ovo krši značenje save/complete/final validationa.

Approvals provider za `not_required` provjerava trenutni `requiresApproval`, ali svaki drugi sintaktički reference prihvata i postavlja `requiresApproval=true`; nema persisted approval policy/workflow existence, ownership ili readiness dokaza. Service može postati ACTIVE sa izmišljenim approvals referenceom.

Persisted routing provider validira reference preko RoutingService, ali `evaluateActivationCoverage` može vratiti `ROUTING_COVERAGE_MISSING` i finalize to samo vraća kao warning nakon aktivacije. Aktivni service bez route coveragea može prihvatati zahtjeve koje sistem ne može dodijeliti. Ako je gap dozvoljen poslovno, mora postojati eksplicitni override sa step-upom/reasonom i vidljiv degraded lifecycle, ne implicitni warning.

## 8. Konfiguracijski prekidači

Loader strogo čita četiri boolean postavke i fail-closed mapira grešku na UNAVAILABLE. `enabled` se provodi. Međutim `requireValidationBeforeActivate` i `autoFillRoutingRequireConfirm` se nigdje ne koriste izvan parse/type koda. Prvi ne mijenja finalize behavior; drugi ne zahtijeva potvrdu suggestiona. Administratorski control plane zato oglašava konfiguraciju koja nema efekt.

Potrebno je ili implementirati preciznu semantiku i testove ili ukloniti mrtve postavke. Za sigurnost activation validation treba ostati obavezna; ako postoji bypass, mora biti SUPER_ADMIN step-up override sa auditom.

## 9. Authorization i scope

Controlleri traže session+ADMIN. Service/form/routing/SLA/approvals operacije koriste odgovarajuće permissione i service scope. Create nema service scope jer service još ne postoji; start/finalize/abandon/resume imaju `serviceCatalogWrite` i service scope. To je dobra granularna osnova.

GET zahtijeva ADMIN i service scope, ali nema eksplicitnu read permission niti `AdminReadOperation`; u read-only modu čisti read može biti blokiran i capability ugovor je implicitno izveden iz role. Activation je high-impact, ali nema posebnu finalize permission, MFA/step-up ili obavezni reason. Context čuva actor, ali requestId se ne propagira u onboarding change-log.

## 10. Validation i error semantics

DTO whitelist, reference max 128 i centralni Create/Update DTO su pozitivni. Form ref pripada serviceu i complete/finalize zahtijevaju ACTIVE form. JSON parser odbija duplikate/nepoznate korake.

`validateStep` hvata svaki nepoznati exception i pretvara ga u `STEP_PREREQUISITES_NOT_MET`. DB/provider outage tako izgleda kao poslovno nevalidan korak, zapisuje se u state i daje 400 umjesto 503. To maskira incidente i može prepisati ranije korisne validation errors. Potrebne su typed domain greške; infrastruktura mora ostati 5xx/retryable i ne smije mutirati workflow evidence.

Configuration reference je opaque string; routing/SLA imaju domain resolver, approvals nema. `lastValidationErrors` čuva samo code/step bez evaluatedAt, evidence versiona ili detalja.

## 11. Audit, retention i operativnost

Lifecycle finalize audit i onboarding finalize audit su u istoj završnoj transakciji, što je dobro. Ostale operacije nisu atomske s auditom. Audit diff je minimalan: save često bilježi samo step/reference, complete listu koraka, bez before statea, service fields, config versiona, requestIda ili user reasona.

Abandoned workflows i orphan DRAFT services nemaju expiry/cleanup/ownership/retention politiku. Nema list endpointa za stuck workflows, metrika po statusu/starosti, alert za dugo READY_FOR_FINALIZATION ili repair komandе za inconsistent state. Settings promjena može onemogućiti workflow usred procesa bez migration plana.

## 12. Test dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/service-onboarding -name '*.spec.ts' -print | sort)
```

Rezultat: **1/7 suiteova prošao, 6/7 compile-blockirano; 2/2 izvršena testa prošla**. Zelen je parse-configuration suite. Blokade su nedostajući generated Prisma `client`/`enums`, `$transaction` i `group` delegati.

In-memory suiteovi namjeravaju pokriti workflow, validation, routing coverage i authorization. Ne dokazuju real DB transakcije, lock/isolation, audit rollback, FK race ni cross-instance behavior. Nema E2E testa za cijeli onboarding API. Nedostaju create partial failure, audit failure, concurrent complete/finalize/abandon, stale active form, missing/inactive SLA, fake approval ref, no-route activation, settings toggle i infrastructure-error matrica.

## 13. Pozitivni nalazi

1. Jasna state-machine granica i fiksni redoslijed koraka.
2. Service ostaje DRAFT do finalizea.
3. Final service+workflow+audit commit je transakcijski.
4. Session/ADMIN i granularne domain permissions postoje.
5. Mutacije nad postojećim serviceom imaju service scope.
6. DTO whitelist i reference length limit.
7. Form reference je service-bound; completion traži ACTIVE form.
8. JSON state parser odbija malformed/duplicate korake.
9. Disabled/config read je fail-closed.
10. Abandon/resume imaju eksplicitne transition provjere.
11. Lifecycle transition koristi centralnu konfiguraciju.
12. Validation errors se vraćaju kao strukturirani code/step.

## 14. Registar nalaza

| ID                          | Severity | Nalaz                                                                                              | Status   |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-service-onboarding-01    | P1       | Service create, onboarding row i audit nisu jedna transakcija; orphan DRAFT je moguć               | otvoreno |
| BA-service-onboarding-02    | P1       | Save/complete/abandon/resume state i audit nisu atomarni                                           | otvoreno |
| BA-service-onboarding-03    | P1       | Final validation je izvan commit transakcije; stale evidence može aktivirati service               | otvoreno |
| BA-service-onboarding-04    | P1       | Nema lock/CAS/version; paralelni finalize/save/abandon daje lost update i dupli activation audit    | otvoreno |
| BA-service-onboarding-05    | P1       | Nepostojeći/neaktivni SLA se smatra validnim i finalize tiho zadržava stari/null profil             | otvoreno |
| BA-service-onboarding-06    | P1       | Arbitrary approvals reference se prihvata bez persisted workflow/evidence provjere                  | otvoreno |
| BA-service-onboarding-07    | P1       | Missing routing coverage je samo warning; neupotrebljiv service može postati ACTIVE                 | otvoreno |
| BA-service-onboarding-08    | P2       | requireValidationBeforeActivate i autoFillRoutingRequireConfirm postavke se učitavaju, ali ignorišu | otvoreno |
| BA-service-onboarding-09    | P2       | Completed raniji korak se može izmijeniti bez invalidacije downstream completiona                  | otvoreno |
| BA-service-onboarding-10    | P2       | Validation failure trajno mijenja errors bez audit događaja                                        | otvoreno |
| BA-service-onboarding-11    | P2       | Nepoznata DB/provider greška collapsea u poslovni 400 prerequisite error                            | otvoreno |
| BA-service-onboarding-12    | P2       | Response read može pasti poslije commita; nema idempotency key ni commit outcome ugovor             | otvoreno |
| BA-service-onboarding-13    | P2       | Finalize nema posebnu capability, MFA/step-up ni obavezni change reason                             | otvoreno |
| BA-service-onboarding-14    | P2       | GET nema eksplicitnu read permission/AdminReadOperation metadata                                   | otvoreno |
| BA-service-onboarding-15    | P2       | Audit je bez requestIda, before diffova, config/evidence versiona i korisničkog reasona             | otvoreno |
| BA-service-onboarding-16    | P2       | Config može promijeniti semantiku usred workflowa bez snapshot/migration politike                   | otvoreno |
| BA-service-onboarding-17    | P2       | Nema lifecycle/cleanup/retention politike za abandoned i orphan DRAFT workflowe                     | otvoreno |
| BA-service-onboarding-18    | P3       | LastValidationErrors nema evaluatedAt/evidence version i može ostati stale                          | otvoreno |
| BA-service-onboarding-19    | P3       | Nema list/metrics/alert/repair operativne površine za stuck ili inconsistent workflowe              | otvoreno |
| BA-service-onboarding-20    | P3       | 6/7 suiteova compile-blockirano i nema direktnog onboarding E2E/concurrency/fault dokaza            | otvoreno |

## 15. Ključne korekcije

- **01–02,10,12:** transactional command boundary za business state + audit + outbox, uz idempotency key.
- **03–04:** serializable/row lock, reread evidence u transakciji i optimistic version/CAS.
- **05–07:** strict SLA/approval/routing evidence; fail finalize ili eksplicitni privileged degraded override.
- **08:** ukloniti mrtve settings ili provesti dokumentovanu, testiranu semantiku.
- **09:** edit completed koraka mora invalidirati njega i sve downstream korake/evidence.
- **11:** typed infrastructure errors ostaju 5xx/retryable i ne mijenjaju workflow.
- **13–15:** finalize permission, step-up, reason, requestId i potpuni before/after evidence audit.
- **16–19:** config snapshot/version, retention/cleanup, stuck metrics/list i repair workflow.
- **20:** regenerisan Prisma client, real Postgres concurrency/fault testovi i puni API E2E.

## 16. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,50 |
| B. API i ugovori             |    12% |   4,80 |
| C. Auth/authz/scope          |    15% |   5,40 |
| D. Poslovna pravila/stanje   |    13% |   3,40 |
| E. Podaci/Prisma/transakcije |    13% |   3,10 |
| F. Sigurnost/privatnost      |    12% |   3,80 |
| G. Async/integracije         |     8% |   3,80 |
| H. Testovi/dokazivost        |    10% |   3,00 |
| I. Operativnost/perf.        |     7% |   4,45 |
| **Ukupno**                   | **100%** | **4,15/10** |

Ponderisani zbir je 4,1525, zaokružen na **4,15/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 17. Fazni plan

### Faza 0 — safety net

Real DB testovi za partial create/audit failure, save rollback, concurrent complete/finalize/abandon, stale form, missing SLA, fake approvals, no routing, settings toggle i post-commit response failure.

### Faza 1 — transactional state machine

Jedinstveni command handler po operaciji, row lock/CAS/version, business+audit+outbox transakcija i idempotency ledger.

### Faza 2 — activation evidence

Strict persisted SLA/approval/routing resolvers, final evidence reread pod lockom, evidence/config hash i downstream invalidacija.

### Faza 3 — control plane

Finalize permission, MFA/step-up, reason/requestId, explicit degraded override i efektivna semantika settings prekidača.

### Faza 4 — operations i retention

Stuck list/metrics/alerts, abandoned/orphan cleanup, repair state machine, typed 5xx i config migration politika.

### Faza 5 — finalni gate

Svih 7 suiteova zeleno; real Postgres concurrency/fault matrica; puni create→steps→finalize/abandon/resume authorization E2E na finalnom SHA-u.

## 18. Acceptance i presuda

1. Service, onboarding i audit nikad ne nastaju parcijalno.
2. Svaka state mutacija je CAS/idempotentna i auditirana u istom commitu.
3. Finalize pod lockom ponovo dokazuje active form, stvarni routing, active SLA i persisted approval workflow.
4. Paralelni zahtjevi ne daju lost update, dupli audit ni stale activation.
5. Completed-step edit invalidira downstream evidence.
6. Settings imaju stvaran, dokumentovan efekt ili su uklonjene.
7. Infrastructure failure ostaje retryable 5xx bez state mutationa.
8. Finalize ima zasebnu capability, step-up i required reason.
9. Retention/repair/metrics pokrivaju abandoned, orphan i stuck workflowe.
10. Svih 7 suiteova i prošireni DB/E2E testovi prolaze.

Modul ima dobru nominalnu state-machine strukturu i granularne guards, ali activation evidence i transactional command granice nisu dovoljno pouzdane za enterprise service publishing. Iskren baseline je **4,15/10**.
