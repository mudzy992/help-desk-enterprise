# Backend audit 30 — `config-versioning`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **3,55/10**  
**Nalazi:** 7 P1, 10 P2, 3 P3

## 1. Executive summary

`config-versioning` snima i primjenjuje settings, routing, SLA, catalog/forms i shared template/playbook konfiguraciju; podržava validate, diff, shadow, activate, rollback te signed/unsigned portable package import/export. Pozitivna osnova postoji: snapshot parser i validatori, secret exclusion, package checksum/HMAC, natural-key resolution, transakcijska aktivacija sa change-logom/auditom, razlog promjene i routing replacement u istoj transakciji.

Baseline je **3,55/10**. Sedam P1 nalaza pogađaju authorization, konkurentnost i istinitost rollbacka. Svaki ADMIN može bez read permissiona dobiti puni snapshot svih privatnih non-secret postavki; `settings.write`/import permission se tretiraju globalno bez assignment scopea. Validation se može isključiti, nakon čega DRAFT postaje VALIDATED i invalidan snapshot može biti aktiviran. Paralelne aktivacije nemaju candidate/previous-active CAS niti DB invariant „tačno jedan ACTIVE“, pa mogu ostaviti više ACTIVE redova i primijeniti stale snapshot. Apply semantika je hibridna: routing/SLA rules se globalno brišu, settings i dio SLA se samo upsertuju, a catalog/forms/templates tiho preskaču missing redove; verzija se ipak označi ACTIVE i rollback nije vjerna restauracija. Konfigurisani `scopes` upravljaju prvenstveno validacijom, ali collect/apply i dalje obrađuju sve domene. Package export može sa običnim `settings.write` iznijeti privatne i environment-bound vrijednosti.

Dodatni rizici su race u numeraciji verzija, orphan rollback DRAFT, stale validate/status transition, shadow koji ne zapisuje SHADOW status, neograničena lista/snapshot response veličina, nedostatak retentiona i većinski compile-blokirani testovi. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 51 produkcijski TypeScript fajl;
- 4 direktna speca;
- 4.412 aktuelnih produkcijskih LOC;
- 1 controller i 4 injectable servisa/komponente;
- Prisma: `ConfigVersion`; primjenjuje `AppSetting`, routing, SLA, catalog/forms, response templates i playbooks;
- integracije: settings registry/cache, authorization, change-log/audit, routing, SLA, service catalog, templates i package signing;
- primarni E2E dokaz: 09.

Registarskih 4.463 LOC korigovano je na 4.412, a injectable inventar sa 2 na 4.

## 3. Authorization i snapshot disclosure

Controller traži ADMIN role. Create/activate/rollback/shadow/validate/export uglavnom traže `settings.write`, import traži `config.version.import`. Međutim list/get/diff nemaju read permission. `GET :id` vraća puni snapshot: privatne postavke, routing veze, OU/group reference, SLA, form schema, template body i playbook metadata. Secret settings se ispravno ne snimaju, ali „private“ nije isto što i bezopasno.

Bilo koji scoped ADMIN assignment može zato čitati globalnu konfiguraciju. Isto tako `settings.write` ili import permission iz bilo kojeg assignmenta prolazi RoleGuard bez konkretnog OU/service resourcea i daje globalnu aktivaciju/rollback/import moć. Za kritični globalni control plane potreban je eksplicitni global permission ili SUPER_ADMIN, MFA/re-auth i separation-of-duties; scoped assignment ne smije implicitno postati globalan.

Export koristi `settings.write`, ne zaseban export permission, i query `includeEnvironmentBound=true` odmah uključuje environment-bound privatne vrijednosti. Nema step-up potvrde ni policy zabrane za osjetljive non-secret URL-ove, DN-ove i identifikatore. Export mora imati zaseban permission, reason, re-auth i classification-aware allowlist.

## 4. Snapshot granica i secret handling

`collectConfigSnapshot` koristi public+private settings API, koji ne vraća secret vrijednosti. Apply dodatno preskače registry definicije označene secret. Portable export također izbacuje secret i po defaultu environment-bound settings. Ovo je dobra defense-in-depth osnova.

Snapshot ipak uvijek prikuplja routing, kompletan SLA, services/forms, OU/group reference i templates, bez obzira na `configuration.scopes`. `scopes` se upisuje kao metadata i koristi za izbor validatora, ali `applyConfigSnapshot` bez scope uslova poziva svih pet apply funkcija. Operator koji vjeruje da je verzionisanje ograničeno na settings može ipak aktivirati globalni routing/SLA/catalog/template state. To je kritično odstupanje ugovora.

Detail/diff/change-log mogu sadržati veliki privatni snapshot. `recordConfigVersionChange` zapisuje cijeli snapshot kao `after`, stvarajući dodatnu trajnu repliku. Nema klasifikacijske matrice ni field-level redakcije za privatne non-secret vrijednosti.

## 5. Validation i activation gate

Parser provjerava schema version i strukturu, a validatori pokrivaju settings, routing, SLA i forms. Aktivacija zahtijeva status VALIDATED ili SHADOW i razlog promjene. Međutim kada je `validationEnabled=false`, `validateConfigSnapshot` vraća praznu listu; `validate()` zatim DRAFT označi VALIDATED. `assertConfigActivationAllowed` također vidi nula grešaka. Postavka tako potpuno uklanja safety gate nad kritičnim destructive applyem.

Čak i uz validation uključen, catalog lifecycle/classification/availability, template/playbook semantika i puna primjenjivost missing recorda nisu adekvatno validirani. `blockActivationOnError=false` utiče na revalidation pri activationu, a status može ostati VALIDATED nakon promjene registryja/referenci. Snapshot je immutable u aplikaciji, ali live reference nisu.

Validation bypass za kritični control plane ne smije postojati; može postojati samo break-glass workflow sa SUPER_ADMIN+MFA, drugim odobravateljem, reasonom i eksplicitnim audit alarmom.

## 6. Apply i rollback istinitost

Apply je jedna DB transakcija, ali domene imaju različitu semantiku:

- routing briše sva pravila i kreira snapshot set;
- SLA rules/escalations brišu sve odsutne redove;
- calendars/profiles/priority matrix samo upsertuju i ne uklanjaju odsutne;
- settings samo upsertuje snapshot ključeve i ne vraća odsutne/resetovane vrijednosti;
- catalog/forms ažuriraju samo postojeće ID-eve, missing red tiho preskaču;
- templates/playbooks koriste `updateMany`, a `count=0` se ignoriše;
- personal templates su namjerno izvan scopea.

Verzija se nakon toga bez completeness dokaza označava ACTIVE. „Rollback“ zato može globalno obrisati novija routing/SLA pravila, ali ostaviti novije calendars/settings/matrix vrijednosti i preskočiti obrisan catalog/template zapis. Rezultat nije snapshot ni vjerna restauracija, nego nedokumentovan merge/replace hibrid.

Svaka domena mora imati eksplicitni REPLACE/MERGE/REFERENCE_ONLY ugovor, preflight plan sa create/update/delete/skip brojevima i hard failure za neočekivani missing row. ACTIVE status smije nastati samo kada post-apply recollect/hash odgovara očekivanom snapshotu.

## 7. Concurrency i stanje verzija

`nextVersionNumber()` radi read-max + 1 pa create. Paralelni create/import/rollback može dobiti isti broj i jedan završava raw unique konfliktom. Važnije, activate čita candidate i previousActive izvan transakcije. `persistActivatedConfigVersion` zatim updateuje oba po ID-u bez status predicatea/versiona. Dvije paralelne aktivacije mogu obje primijeniti snapshot, demotirati isti previous active i obje postati ACTIVE. Schema nema partial unique invariant za jedan ACTIVE.

Validate radi read pa `update(id,status=VALIDATED)` bez `where status=DRAFT`; race s aktivacijom/rollbackom može vratiti status unazad. Rollback target/current se čitaju prije transakcije. Rollback prvo kreira novi DRAFT van activation transakcije; apply failure ostavlja orphan rollback verziju. Shadow ne zapisuje status SHADOW, iako activation helper prihvata taj status; workflow status je nepotpun.

Potrebni su DB advisory/global config lock, partial unique ACTIVE invariant ili singleton active pointer, status/version CAS, sekvenca/DB-generated version i rollback create+activate u jednoj transakciji.

## 8. Package import/export integritet

Package ima hard file-size limit, strict top-level parser, canonical SHA-256 checksum, opcionu HMAC signature i timing-safe provjeru. Import nikada direktno ne aktivira; unresolved reference blokira snapshot. Natural-key mappings i provenance se čuvaju. Secret settings su isključene.

Ipak unsigned package se dopušta jednim `confirmUnsigned` flagom istog operatora. Nema trusted-key ID/rotation, source allowlist, anti-replay ni environment policy. HMAC shared key dokazuje samo posjedovanje zajedničke tajne, ne autora. `exportedAt` se strukturno tretira kao proizvoljan neprazan string, a `sourceVersion` nema positive bound.

Parser ograničava ukupne bajtove, ali nema per-array count/depth/string limite za sve nested JSON vrijednosti (`schema`, weeklyHours, settings). 10 MB adversarial package može proizvesti visok CPU/DB plan i ogromnu validation listu. Import numeracija ima isti race, a audit metadata čuva kompletne mappings/created/skipped provenance podatke bez retention odluke.

## 9. Shadow, diff i operativna sigurnost

Shadow uzima zadnjih 200 tiketa i poredi routing/SLA rezultat. To je bounded i korisno, ali nije reprezentativan sample po OU/service/priority, nema seed/coverage metriku i ne obuhvata settings/catalog/forms/templates efekte. Ne zapisuje rezultat, actor, timestamp ni SHADOW status; ne postoji acceptance threshold koji blokira activation.

Diff radi potpuno in-memory nad dva snapshot JSON-a. List vraća sve verzije bez paginationa; get vraća cijeli snapshot. Nema retention/arhiviranja, snapshot compression, size budgeta, checksum/hash kolone ni corruption detection za lokalne ConfigVersion redove. Jedan malformiran historijski snapshot može srušiti list jer svaki zapis prolazi parser.

Cache invalidation se omotava oko transakcije, ali apply-settings poziva shared invalidation tokom transakcije za svaki ključ. Potrebno je dokazati da nijedan drugi proces ne repopulira stale vrijednost prije commit/post-commit invalidacije; invalidation treba biti post-commit, cross-instance i domenski potpuna.

## 10. Audit, privacy i retention

Activate/rollback/import/export imaju audit, a activate/rollback i change-log. Create, validate, shadow, list/get/diff nemaju potpuni security audit. Za kritični control plane posebno nedostaju validation result, shadow result/sample, failed activation/import i package preview/download read audit politika.

ConfigVersion snapshot, importMeta, change-log i audit mogu trajno duplicirati privatnu konfiguraciju, form schema i template body. Nema retention, legal hold, encryption-at-rest/classification ni creator anonymization matrice. `createdByUserId` se SetNull, ali audit/change-log replike ostaju po svojim pravilima.

## 11. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/config-versioning -name '*.spec.ts' -print | sort)
```

Rezultat: **1/4 suitea prošao, 3/4 compile-blocked; 5/5 izvršenih testova prošlo**. Zelen je status-ready pure suite. Package, validation i shadow suiteovi su blokirani nedostajućim `generated/prisma/enums` i nepotpunim `PrismaService` delegatima. Nije zabilježen assertion failure.

E2E 09 pokriva create, validate, shadow, UI, activate i rollback happy path. Ne pokriva scoped/global auth, validation disabled, dvije paralelne aktivacije, version race, missing catalog/template row, partial scope, apply failure/orphan rollback, unsigned/replayed package, post-apply parity ni cache consistency.

## 12. Pozitivni nalazi

1. Strict controller DTO i file-size limit.
2. Secret vrijednosti nisu u snapshotu niti packageu.
3. Environment-bound package settings su default-off.
4. Canonical checksum, HMAC i timing-safe verification.
5. Import je DRAFT-only i ne aktivira direktno.
6. Reference resolution i blocking report.
7. Aktivacija primjenjuje domene u jednoj DB transakciji.
8. Core activation audit/change-log je u istoj transakciji.
9. Change reason je obavezan za activate/rollback.
10. Routing replacement je atomaran.
11. Shadow sample je bounded na 200.
12. Svih 5 izvršenih testova je zeleno.

## 13. Registar nalaza

| ID                         | Severity | Nalaz                                                                                       | Status   |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------- | -------- |
| BA-config-versioning-01    | P1       | ADMIN bez read permissiona dobija puni globalni privatni snapshot kroz list/get/diff        | zatvoreno |
| BA-config-versioning-02    | P1       | Scoped settings/import permission postaje globalna activate/rollback/import moć             | zatvoreno |
| BA-config-versioning-03    | P1       | Isključena validacija označava DRAFT validnim i dopušta neprovjeren destructive apply       | otvoreno |
| BA-config-versioning-04    | P1       | Paralelna aktivacija nema lock/CAS ni DB invariant jednog ACTIVE reda                       | otvoreno |
| BA-config-versioning-05    | P1       | Apply/rollback je nedokumentovan replace/upsert/skip hibrid i ACTIVE nije dokaz parityja     | otvoreno |
| BA-config-versioning-06    | P1       | Konfigurisani scopes ne ograničavaju collect/apply; sve domene se i dalje primjenjuju        | otvoreno |
| BA-config-versioning-07    | P1       | Export sa settings.write može iznijeti privatne/environment-bound vrijednosti bez step-upa  | otvoreno |
| BA-config-versioning-08    | P2       | nextVersionNumber je read-max race za create/import/rollback                                | otvoreno |
| BA-config-versioning-09    | P2       | Validate/status transition nema CAS i može vratiti stale status                             | otvoreno |
| BA-config-versioning-10    | P2       | Rollback DRAFT nastaje van apply transakcije i ostaje orphan nakon failurea                 | otvoreno |
| BA-config-versioning-11    | P2       | Catalog/forms/templates missing red se tiho preskače                                        | otvoreno |
| BA-config-versioning-12    | P2       | Shadow ne zapisuje SHADOW status, actor, rezultat ni acceptance threshold                   | otvoreno |
| BA-config-versioning-13    | P2       | Unsigned package potvrđuje isti operator; nema key ID/rotation/source allowlist/anti-replay | otvoreno |
| BA-config-versioning-14    | P2       | Package parser nema granularne nested count/depth/size budžete                              | otvoreno |
| BA-config-versioning-15    | P2       | List/get/diff su nepaginirani i snapshotovi nemaju size/hash/corruption budget              | otvoreno |
| BA-config-versioning-16    | P2       | Privatni snapshot se duplicira u ConfigVersion/change-log/importMeta bez retention matrice  | otvoreno |
| BA-config-versioning-17    | P2       | Cache invalidation tokom apply transakcije nema dokaz cross-instance post-commit koherencije | otvoreno |
| BA-config-versioning-18    | P3       | Shadow sample zadnjih 200 tiketa nije stratifikovan ni coverage-mjeren                      | otvoreno |
| BA-config-versioning-19    | P3       | Create/validate/shadow/failure i read/export audit politika nije potpuna                    | otvoreno |
| BA-config-versioning-20    | P3       | Tri od četiri suitea compile-blockirana; nema concurrency/fault/parity test matrice         | otvoreno |

## 14. Ključne korekcije

- **01–02,07:** eksplicitni global control-plane permissions, SUPER_ADMIN/MFA step-up, read/export separation i scope rejection.
- **03:** validation uvijek obavezna; break-glass kao zaseban dual-control workflow.
- **04,08–10:** global activation lock, one-ACTIVE DB invariant, version/status CAS i transakcijski rollback creation.
- **05–06,11:** per-domain apply ugovor, scope-gated collect/validate/apply, preflight plan i post-apply recollect/hash parity.
- **12,18:** durable shadow evidence, stratifikovan sample, coverage i policy threshold.
- **13–14:** key IDs/rotation, trusted source/anti-replay, dual confirmation i granularni package budgets.
- **15–17:** pagination/size/hash, retention/redaction i isključivo post-commit cross-instance invalidation.
- **19–20:** kompletan security audit i regenerisan Prisma/real DB concurrency/failure/E2E dokaz.

## 15. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,00 |
| B. API i ugovori             |    12% |   4,20 |
| C. Auth/authz/scope          |    15% |   2,80 |
| D. Poslovna pravila/stanje   |    13% |   3,60 |
| E. Podaci/Prisma/transakcije |    13% |   3,40 |
| F. Sigurnost/privatnost      |    12% |   3,20 |
| G. Async/integracije         |     8% |   3,20 |
| H. Testovi/dokazivost        |    10% |   3,00 |
| I. Operativnost/perf.        |     7% |   4,00 |
| **Ukupno**                   | **100%** | **3,55/10** |

Ponderisani zbir je 3,554, zaokružen na **3,55/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan

### Faza 0 — safety net

Scoped admin/read/export; validation off; dvije paralelne aktivacije; paralelni create/rollback; missing catalog/template; settings-only scope; apply failure; post-apply parity; cache cross-instance; adversarial package.

### Faza 1 — control-plane authorization

Global permissions, SUPER_ADMIN+MFA step-up, read/export separation, reason i dual-control za break-glass/unsigned/environment-bound operacije.

### Faza 2 — state machine i concurrency

Activation lock, one-ACTIVE invariant, DB version sequence, status/version CAS i rollback create+apply atomarnost.

### Faza 3 — truthful snapshot engine

Scope-gated collect/validate/apply, per-domain semantics, preflight plan, hard missing-row failure i post-apply recollect/hash parity.

### Faza 4 — package, cache i retention

Key rotation/source/replay policy, parser budgets, post-commit cache invalidation, snapshot hash/size/pagination i privacy retention.

### Faza 5 — finalni gate

Regenerisan Prisma client; sva 4 suitea; real Postgres concurrent activation/versioning, failure rollback, package fuzz, cache multi-instance i E2E 09 na finalnom SHA-u.

## 17. Acceptance i konačna presuda

1. Scoped assignment nikad ne daje globalni config read/write/export.
2. Nijedan snapshot se ne aktivira bez obavezne validacije ili auditiranog dual-control break-glassa.
3. DB garantuje tačno jedan ACTIVE config i monotoni unique version pod concurrencyjem.
4. `scopes` identično upravlja collect, validate, diff, apply i parity provjerom.
5. Apply ima eksplicitnu per-domain semantiku i ne smije tiho preskočiti expected row.
6. ACTIVE znači da post-apply recollect/hash odgovara snapshotu.
7. Rollback je atomaran i dokazivo vraća deklarisani state.
8. Package trust ima key rotation, source/replay policy i resource budgets.
9. Snapshot/replike imaju hash, size, retention, redaction i post-commit cache koherenciju.
10. Sva 4 suitea i concurrency/fault/parity/security E2E prolaze.

Modul ima vrijedan transakcijski, audit i package-integrity temelj, ali control-plane authorization, validation bypass, concurrent ACTIVE race i neistinit rollback/apply ugovor predstavljaju kritične enterprise prepreke. Iskren ponderisani baseline je **3,55/10**.
