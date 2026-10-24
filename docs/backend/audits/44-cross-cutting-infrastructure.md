# Backend audit 44 — cross-cutting infrastruktura

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik jedinice:** kritičan  
**Baseline ocjena:** **3,20/10**  
**Nalazi:** 8 P1, 17 P2, 7 P3

## 1. Executive summary

Ova jedinica pokriva infrastrukturu koju dijele svi backend moduli: `src/common`, API/worker bootstrap i root wiring, Prisma/PostgreSQL, Redis/BullMQ, globalne HTTP granice, request context/error handling, scheduled jobs, CLI/seed, migracije i container/deploy ugovor. Inventar obuhvata 52 produkcijska common fajla, 27 common specova i 2.509 produkcijskih LOC, 76 migracijskih direktorija i 16 produkcijskih CLI skripti.

Baseline je **3,20/10**. Pozitivne osnove postoje: eksplicitni DB pool/statement timeouti, request ID/ALS, uniformni error envelope, CORS allowlist, Helmet, 512 KiB JSON limit, strict global validation, bounded in-process cache, idempotent BullMQ scheduler ID-evi, shutdown hookovi i više direktnih unit testova. Ipak production sigurnosni i operativni ugovor nije enterprise zatvoren.

Container radi kao root, build nije reproduktivan (`npm ci || npm install`), finalni image nasljeđuje kompletan builder `node_modules` sa dev alatima i koristi mutable base tagove. Ista `DATABASE_URL` vjerovatno služi i aplikaciji i `prisma migrate deploy`, pa runtime proces dobija migration/DDL privilegije. Svaka API replika prije starta pokreće migracije, bez zasebnog release joba, rollout preflighta, backup/restore gatea ili dokumentovanog rollback ugovora.

Redis nema TLS konfiguraciju niti connection URL/CA contract; DB primjer također ne zahtijeva TLS. Principal authorization cache vjeruje Redis payloadu do 60 sekundi i grešku invalidacije namjerno guta, pa deaktivacija ili oduzimanje prava može ostati aktivno nakon uspješne DB mutacije. Scheduler registration guta Redis greške i worker se svejedno objavljuje kao “started”; proces može biti živ, a nijedan periodični posao registrovan.

Worker nema startup readiness server, drain stanje, shutdown deadline ni fatal fallback. API health ne dokazuje schema kompatibilnost, write sposobnost ili queue flow. CLI procesi koriste direktnu privilegovanu DB konekciju bez jedinstvenog environment/target guarda; demo seed piše podatke po defaultu, a `--remove` hard-deletea bez potvrde, razloga ili audit zapisa.

Direktni presjek izvršio je 31 suite: **25 suiteova je prošlo, 6 je compile-blokirano; svih 77 izvršenih testova je zeleno**. Blokade su prvenstveno posljedica odsutnog generated Prisma clienta/enuma; dva compile errora dodatno pokazuju da `PrismaService` bez generisanog base tipa nema delegate shape. `npm audit --omit=dev` prijavljuje 4 moderate ranjivosti (`exceljs`, `ldapts` i tranzitivni `uuid`/`ip-address`). Popravke nisu implementirane.

## 2. Scope i inventar

- `backend/src/common/**`: 52 produkcijska TS fajla, 27 specova, 2.509 LOC;
- `main.ts`, `app.module.ts`, API bootstrap i globalni middleware/pipe/filter/interceptor wiring;
- `worker.ts`, `worker.module.ts`, create/start/shutdown worker lifecycle;
- Prisma service, custom `pg.Pool`, instrumentation i multi-file schema;
- 76 Prisma migration direktorija;
- Redis module/client, BullMQ root konfiguracija, pub/sub i cache;
- CORS, Helmet, proxy, body/raw-body i validation granice;
- request ID, AsyncLocalStorage, error envelope, request log i metrics;
- 16 produkcijskih CLI skripti i database seed;
- Dockerfile, Compose, npm dependency/build i runtime granice.

## 3. API bootstrap i globalni HTTP ugovor

`main.ts` uključuje raw-body capture, JSON limit 512 KiB, optional `TRUST_PROXY`, Helmet, allowlist CORS, global validation, request-ID middleware, request/query metrike i event-loop monitor. Ovo je dobra centralizovana baza. Validation pipe koristi transform/whitelist/forbid režim i error mapping ne vraća stack klijentu.

Nedostaci:

- `TRUST_PROXY` je permissive numeric/string konfiguracija bez startup validacije očekivane proxy topologije; pogrešna vrijednost utiče na IP-based kontrole i secure-cookie semantiku;
- raw body se zadržava za svaki JSON zahtjev, ne samo webhook rute, pa svaki request ima dodatnu memorijsku kopiju;
- request ID prihvata proizvoljan nonempty client string bez max dužine, charseta ili regeneracije na vanjskom trust boundaryju; može povećati log/metric payload i unijeti kontrolne znakove;
- `enableShutdownHooks()` se poziva dvaput;
- nema globalnog HTTP rate-limitera; Teams inbound koristi process-local mapu koja se resetuje po replici/restartu i lako se zaobilazi horizontalnim skaliranjem;
- globalni exception filter dolazi iz `ObservabilityModule`, globalni read-only interceptor iz `AuthorizationModule`, a setup guard iz `InstallModule`; sigurnosni wiring zavisi od feature import grafa umjesto malog root infrastructure modula i wiring contract testa koji dokazuje redoslijed.

Privacy notice je namjerno javna, a Teams inbound ima vlastiti JWT/HMAC ugovor; odsustvo session guarda na ta dva controllera nije samo po sebi nalaz. Međutim repository-wide route manifest koji dokazuje da su sve ostale rute auth/scoping pokrivene ne postoji.

## 4. Environment i startup validacija

Konfiguracija se čita disperzovano direktno iz `process.env`. Pojedini loaderi validiraju vlastite brojeve, ali nema jedinstvene typed startup sheme koja prije bindanja porta provjerava:

- required secrets, minimalnu entropiju i međusobnu konzistentnost current/previous ključeva;
- produkcijski CORS, proxy, cookie i public URL contract;
- DB/Redis TLS/auth zahtjeve;
- pool vrijednosti naspram broja API/worker replika i DB connection limita;
- BullMQ prefix/queue namespace po environmentu;
- storage path writeability/persistence;
- zabranjene development/E2E vrijednosti u produkciji.

Neki invalidni optional parametri tiho padaju na default. To je pogodno za lokalni razvoj, ali production typo ne smije mijenjati sigurnosnu ili kapacitetnu politiku bez fatalne startup greške.

## 5. Prisma client, pool i transakcijske granice

`PrismaService` pravi custom `pg.Pool` sa eksplicitnim max/min, connection timeoutom, idle timeoutom i `statement_timeout`. Instrumented pool mjeri query count/latency i saturation error mapira u kontrolisan HTTP odgovor. Ovo je kvalitetnija osnova od implicitnog default poola.

Rizici:

- `DATABASE_URL` je jedini credential. Compose istim environmentom prvo izvršava `prisma migrate deploy`, zatim starta API; nema dokaza o posebnom migration owneru i restricted runtime role. Kompromitovani API zato može imati DDL/drop/tamper privilegije, uključujući audit podatke;
- pool limit je per-process. Nema globalnog budžeta `replicas × API pool + workers × pool + CLI/migrate`, niti deployment admission provjere prema Postgres `max_connections`;
- query instrumentation eksplicitno ne vidi dedicated clients interactive transakcija, pa metrike predstavljaju lower bound; nema DB-side slow query/lock/transaction-age korelacije;
- statement timeout ne rješava transaction timeout, lock timeout niti idle-in-transaction timeout kao dokumentovan komplet;
- repository-wide transaction invariant ne postoji: mnogi moduli mogu odvojiti business mutation, audit/change-log/outbox i cache invalidaciju;
- readiness `SELECT 1` ne dokazuje da je očekivana schema verzija primijenjena ni da runtime role može izvršiti reprezentativni read/write.

## 6. Migracije, rollout i rollback

Postoje 76 timestampovanih migracija i multi-file Prisma schema. Nekoliko većih indeksa koristi `CONCURRENTLY`, što pokazuje svijest o online migracijama. Međutim disciplina nije standardizovana:

- migracije se izvršavaju pri startu svake API replike; rollout može imati više konkurentnih migratora i aplikacijske replike različitih verzija;
- nema zasebnog release/migration joba sa advisory ownershipom, timeoutom, status dokazom i blokadom app rollouta;
- nema expand/backfill/contract policyja ni CI lintera za `DROP`, `SET NOT NULL`, enum promjene, nekonkurentne unique indekse i DML delete;
- migracije sadrže hard delete i destruktivne transformacije (`DELETE`, `DROP COLUMN`, recovery-code brisanje), bez obaveznog row-count manifesta, exporta ili operator approvala;
- više migracija ima datume mjesecima u budućnosti u odnosu na audit datum, sve do 2027-10; timestamp više nije pouzdan deployment redoslijed/porijeklo;
- komentari za rollback postoje samo sporadično; Prisma nema automatski down migration, a nema rehearsal dokaza da backup restore ispunjava RPO/RTO;
- nema schema sentinel/version compatibility checka u readinessu;
- `CREATE EXTENSION` i DDL impliciraju elevated privilegije koje runtime role ne treba imati.

## 7. Redis, BullMQ i cache semantika

Redis client koristi lazy connect i kontrolisani close. API cache/pubsub je uglavnom fail-open prema DB, dok BullMQ opravdano koristi `maxRetriesPerRequest: null`. Scheduler ID i `upsertJobScheduler` sprečavaju duplikat rasporeda između worker replika.

Kritični gapovi:

- common konfiguracija izlaže host/port/password/db, ali ne TLS, CA, server name ili `rediss://`; credentials i cache/session-like podaci mogu ići plaintext mrežom;
- nema obaveznog environment/tenant key prefixa za common authz ključeve; dijeljeni Redis DB između staging/production deploymenta može kolidirati;
- reconnect/backoff/offline queue/circuit-breaker i maksimalno vrijeme startup pokušaja nisu kompletan eksplicitni ugovor;
- `registerRepeatableJob` hvata svaku grešku i samo loguje warning. Worker zatim loguje “started”, iako raspored možda nije instaliran; nema retry/reconcile loopa ni readiness degradacije;
- authz cache payload se smatra autoritativnim do TTL-a bez DB version provjere. Ako mutacija uspije, a Redis invalidacija zakaže ili caller zaboravi invalidaciju, ukinuta prava/deaktivacija ostaju upotrebljivi do 60 sekundi;
- invalidation i cache read/write greške su namjerno potpuno swallowed, bez sigurnosne metrike/alarma;
- in-process admin realtime hub ne prelazi granice replike; admin promjena na replici A nije emitovana websocket klijentima na replici B.

## 8. Worker wiring, jobs i shutdown

API i worker imaju odvojene root module, što je dobro za procesnu izolaciju. Scheduled jobs koriste idempotent scheduler ID-eve, a worker close poziva Nest lifecycle i zatvara providere.

Nedostaje production lifecycle ugovor:

- worker nema HTTP readiness/liveness endpoint; vanjski orchestrator ne može razlikovati process alive od svih queue/scheduler konekcija spremnih;
- startup ne čeka dokaz da su obavezni scheduler-i registrovani; partial Redis failure završava zelenim startup logom;
- nema globalnog “draining” stanja koje prestaje uzimati nove poslove prije gašenja;
- shutdown nema deadline/watchdog. Ako `application.close()` visi, SIGTERM nikad ne završava; drugi signal se ignoriše zbog `isShuttingDown`;
- nakon closea se poziva `process.exit(0)`, što može presjeći kasne log/telemetry flush operacije;
- nema shutdown outcome metrika ni evidencije unfinished/stalled poslova;
- wiring test je compile-blokiran bez generated Prisma clienta, pa audit nije dobio izvršni dokaz da API ne registruje jobove i worker ih registruje tačno jednom.

## 9. Logging, error mapping i observability

Request ID se prenosi kroz AsyncLocalStorage, vraća klijentu i ulazi u error envelope. Recent request buffer je bounded. DB query counter, request duration i event-loop delay daju korisnu osnovu.

Cross-cutting nedostaci:

- nema centralnog structured logger/redaction processor ugovora; više CLI/module mjesta koristi interpolation i `console.*`;
- exception reason/message iz dependency greške ulazi u warning log na više mjesta bez standardnog sanitizer-a;
- request-ID trust boundary nije ograničen;
- metric label/cardinality budžet i CI test nisu centralno definisani; route normalization zavisi od framework trenutka kada je metrika emitovana;
- query instrumentation ne obuhvata interactive transaction clients i ne veže DB span za request/trace;
- nema OpenTelemetry trace konteksta kroz API → BullMQ → worker;
- recent in-memory request log nestaje restartom i razlikuje se po replici; nije audit niti centralni incident log.

## 10. Docker, build i runtime hardening

Backend Dockerfile kompajlira multi-stage image, ali finalni stage nije production-hardened:

- nema `USER`; Node i migration komanda rade kao root;
- finalni image kopira kompletan builder `node_modules` (~590 MiB u trenutnom worktreeu), uključujući devDependencies i build/CLI alatni attack surface;
- `npm ci --include=dev || npm install --include=dev` pretvara lock-integrity grešku u nereproduktivni registry resolve umjesto fatalnog builda;
- `node:22-alpine` nije pinovan digestom; runtime se može promijeniti bez source izmjene;
- nema OCI provenance/SBOM/signing policyja ni image vulnerability gatea vidljivog u deploy ugovoru;
- nema read-only root filesystem, dropped capabilities, `no-new-privileges`, seccomp ili tmpfs contracta;
- upload/storage persistence i permissions nisu image-level preflightovani;
- API container u runtime commandu zadržava Prisma CLI jer sam migrira bazu.

Production dependency audit prijavljuje 4 moderate advisories: direktni `exceljs` i `ldapts`, te tranzitivni `uuid` i `ip-address`. Nema high/critical rezultata u ovom lokalnom snapshotu, ali moderate ReDoS/bounds rizik ostaje otvoren.

### Implementacijski dodatak — W1.1, 2026-10-24

Izvorno stanje iznad ostaje audit trag, ali je izvršno korigovano u paketu W1.1: strict `npm ci`, digest-pinned Alpine stageovi, production-only dependency sloj, uklonjen npm/build toolchain, CycloneDX SBOM, puni Grype inventar, actionable high/critical gate i GitHub/Sigstore provenance prošli su u CI runu [`40073544355`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40073544355). Production npm audit sada vraća nula ranjivosti. Detalji i granice dokaza su u [`../implementation/01-production-safety-perimeter.md`](../implementation/01-production-safety-perimeter.md).

## 11. CLI, seed i operativni blast radius

Pozitivno je što nekoliko CLI-ja ima dry-run, explicit `--apply`, reason i audit zapis. Secret helper ne ispisuje secret osim namjenske `pins` komande uz upozorenje. Ipak ne postoji jedinstveni CLI safety framework.

- svi CLI-ji uzimaju direktni `DATABASE_URL`; nema obaveznog `--environment`, target fingerprinta, production allow flag-a, operator identityja ili step-up potvrde;
- `assets-seed-demo` po defaultu piše demo podatke u target bazu; `--remove` hard-deletea više tabela bez typed confirmation/reason/audit entryja;
- seed i pojedini maintenance tokovi rade izvan Nest config/validation i mimo zajedničkog DB pool/timeout/instrumentation ugovora;
- batch operacije nemaju svugdje resumability/checkpoint, statement/transaction budžet i before/after manifest;
- OS-level pristup containeru praktično postaje aplikacijski super-admin/DB operator, a izvršni image sadrži sve CLI-je;
- nema centralnog append-only operator audit traila koji bilježi command, target, actor, reason, counts i završni hash;
- `ensure-e2e-actors` može mijenjati password/MFA stanje i ima override za policy; production zabrana zavisi od allowliste i operator discipline, ne deployment-level exclusiona.

## 12. Test rezultat i granice dokaza

Pokrenuto je 27 common specova i 4 root/lifecycle/wiring speca:

```text
Test Suites: 25 passed, 6 failed to compile, 31 total
Tests:       77 passed, 77 total
```

Compile-blokirani su principal context, secret rotation, admin realtime, app module, worker module i scheduled-jobs wiring. Primarni uzrok je odsutan `src/generated/prisma/client`/`enums`; lokalni `db:generate` nije moguć bez pristupa Prisma binary hostu. `PrismaService` delegate compile greške su ista generisana-type granica, dok secret CLI pokazuje i transactional-client type mismatch u ovom stanju.

Nisu izvršeni realni Postgres/Redis integration testovi, migration rehearsal, multi-replica scheduler test, graceful termination test pod aktivnim poslom, container non-root test, TLS handshake test ni restore drill. Zato zelenih 77 testova nije production readiness dokaz.

## 13. Registar nalaza

| ID | Prioritet | Nalaz | Status |
|---|---|---|---|
| BA-xcut-01 | P1 | Runtime container nema `USER` i radi kao root | zatvoreno |
| BA-xcut-02 | P1 | Isti DB credential pokreće migracije i aplikaciju; nema runtime/migration privilege separation | otvoreno |
| BA-xcut-03 | P1 | Redis TLS/CA contract ne postoji, a DB TLS nije production-obavezan | otvoreno |
| BA-xcut-04 | P1 | Build fallback `npm ci \|\| npm install`, mutable images i devDependencies u runtimeu ruše reproducibility/supply-chain granicu |zatvoreno |
| BA-xcut-05 | P1 | Authz cache može služiti ukinuta prava/deaktiviranog usera do TTL-a nakon invalidation failure/omissiona | otvoreno |
| BA-xcut-06 | P1 | Scheduler registration fail-open označava worker started bez obaveznih rasporeda | otvoreno |
| BA-xcut-07 | P1 | Migracije na startu svake API replike bez release gatea, compatibility/backup/rollback ugovora | otvoreno |
| BA-xcut-08 | P1 | Destruktivni/demo CLI ima write-by-default i hard-delete bez production target guarda, potvrde i audita | otvoreno |
| BA-xcut-09 | P2 | Nema jedinstvene typed/fatal production env validacije | otvoreno |
| BA-xcut-10 | P2 | Pool nema deployment-wide connection budget ni admission check | otvoreno |
| BA-xcut-11 | P2 | DB timeout/instrumentation ne pokriva kompletno lock/transaction/dedicated-client ponašanje | otvoreno |
| BA-xcut-12 | P2 | Readiness ne dokazuje schema kompatibilnost, write capability ni queue flow | otvoreno |
| BA-xcut-13 | P2 | Migracije nemaju expand/backfill/contract linter i destruction approval manifest | otvoreno |
| BA-xcut-14 | P2 | Budući migration timestampi do 2027-10 ruše pouzdanu chronology disciplinu | otvoreno |
| BA-xcut-15 | P2 | Redis reconnect/offline queue/circuit-breaker i namespace contract nisu potpuni | otvoreno |
| BA-xcut-16 | P2 | Admin realtime je process-local i gubi cross-replica događaje | otvoreno |
| BA-xcut-17 | P2 | Worker nema readiness/drain/deadline/forced shutdown i telemetry flush ugovor | otvoreno |
| BA-xcut-18 | P2 | Request ID je neograničen untrusted input u logovima/envelopeu | otvoreno |
| BA-xcut-19 | P2 | Globalni guard/filter/interceptor wiring zavisi od feature modula bez centralnog manifest testa | otvoreno |
| BA-xcut-20 | P2 | Nema centralnog structured log redaction i exception sanitizer ugovora | otvoreno |
| BA-xcut-21 | P2 | Metric cardinality i distributed trace propagation nisu dokazani | otvoreno |
| BA-xcut-22 | P2 | Nema globalnog/distribuiranog inbound rate limit ugovora | otvoreno |
| BA-xcut-23 | P2 | Runtime image nema read-only FS/capability/no-new-privileges hardening ni storage permission preflight | zatvoreno |
| BA-xcut-24 | P2 | Production dependency audit ima 4 moderate advisories |zatvoreno |
| BA-xcut-25 | P2 | CLI-ji nemaju zajednički target fingerprint/operator audit/transaction safety framework | otvoreno |
| BA-xcut-26 | P3 | Raw body se kopira za svaki JSON request umjesto samo potpisanih webhook ruta | otvoreno |
| BA-xcut-27 | P3 | Shutdown hooks se uključuju dvaput u API bootstrapu | otvoreno |
| BA-xcut-28 | P3 | Recent request log je samo process-local volatilni buffer | otvoreno |
| BA-xcut-29 | P3 | Nema SBOM/provenance/signing dokaza u deploy ugovoru |zatvoreno |
| BA-xcut-30 | P3 | Secret minimum od 16 bajtova i fallback derivacije nisu centralno klasifikovani po purposeu | otvoreno |
| BA-xcut-31 | P3 | 6/31 direktnih suiteova compile-blokirano je bez generated Prisma artefakta | zatvoreno |
| BA-xcut-32 | P3 | Seed koristi zaseban client mimo common pool/metrics/startup konfiguracije | otvoreno |

## 14. Ocjena

| Dimenzija | Težina | Ocjena | Ponderisano |
|---|---:|---:|---:|
| Security, secrets i privilege separation | 20% | 2,0 | 0,40 |
| DB lifecycle, transakcije i migracije | 20% | 2,5 | 0,50 |
| Redis, BullMQ i worker pouzdanost | 15% | 3,0 | 0,45 |
| HTTP bootstrap, validation i error granice | 15% | 6,0 | 0,90 |
| Observability i operabilnost | 10% | 4,0 | 0,40 |
| Build, container i supply chain | 10% | 1,5 | 0,15 |
| CLI/seed sigurnost | 5% | 2,5 | 0,13 |
| Testovi i dokaz | 5% | 5,5 | 0,27 |
| **Ukupno** | **100%** |  | **3,20/10** |

Ocjena nije umanjena zato što infrastruktura nema mnogo koda, nego zato što se njen blast radius proteže na svih 43 modula. Dobre lokalne helper implementacije ne kompenziraju root runtime, široke DB privilegije, nešifrovan dependency transport, fail-open scheduler/authz semantiku i nereproduktivan image.

## 15. Obavezni redoslijed sanacije

1. Odvojiti release migrator credential/job od restricted API/worker role; uvesti schema compatibility gate, backup/restore dokaz i expand-contract policy.
2. Izgraditi non-root, digest-pinned, minimalni production image sa strict `npm ci`, production-only dependency slojem i container hardeningom.
3. Uvesti obavezni DB/Redis TLS, CA/server identity, environment namespace i centralnu startup config shemu.
4. Učiniti authorization invalidation security-sigurnim: version authority/revocation mora preživjeti Redis grešku bez stale privilege prozora.
5. Scheduler startup mora imati retry/reconcile i readiness koji ostaje crven dok obavezni rasporedi/queue veze nisu spremni.
6. Dodati worker drain/deadline/forced-exit, queue-aware health i shutdown integration test.
7. Standardizovati CLI target fingerprint, dry-run/apply/confirm/reason/operator audit, least-privilege credential i resumable batch ugovor.
8. Centralizovati request ID trust policy, log redaction, metric cardinality i trace propagation.
9. Dodati migration/container/TLS/multi-replica/restore testove i osigurati generated Prisma artefakt u reproducibilnom CI-u.

## 16. Zaključak

Cross-cutting sloj ima korisne temelje, posebno HTTP validaciju, error envelope, eksplicitni pool i testirane male helper-e. Ali trenutni production ugovor ostavlja kritične granice deployment platformi i operator disciplini. Jedinica je auditirana, ne popravljena. Svi nalazi ulaze u konsolidovani backend plan; implementacija ostaje zabranjena do završetka jedinice 45.
