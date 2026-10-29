# Backend implementacija — Val 1: production safety perimeter

**Status:** u toku  
**Početak:** 2026-10-24  
**Master plan:** [Backend implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md)

## Paket W1.1 — container i supply chain

**Status:** završeno; CI run [`40073544355`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40073544355) zelen na SHA `f7615c7196cae623aa50376869ddea771e2f38cc`.

### Implementirano

- sva tri Docker stagea koriste pregledom zaključani `node:22-alpine` digest;
- build koristi isključivo strict `npm ci`; fallback na `npm install` je uklonjen;
- zaseban `production-deps` stage instalira `--omit=dev --omit=optional --ignore-scripts` skup;
- runtime kopira samo production dependencies i kompajlirani output;
- Nest CLI, TypeScript, Prisma CLI/schema, source tree, npm, npx i corepack ne postoje u finalnom imageu;
- runtime `zlib` je eksplicitno zaključan na sigurnosno korigovanu `1.3.2-r1` verziju;
- direktne i tranzitivne dependency ranjivosti su sanirane nadogradnjama i zaključanim `overrides` pravilima;
- `npm audit --omit=dev --audit-level=high` je obavezni CI gate i vraća nula ranjivosti;
- Syft generiše CycloneDX JSON SBOM stvarnog runtime imagea;
- Grype pravi puni inventar svih image nalaza i zaseban actionable high/critical gate koji obuhvata nalaze za koje postoji upstream popravka;
- actionable high/critical rezultat mora biti nula; izvještaj svih nalaza se i dalje čuva radi transparentnosti i budućih base refresh odluka;
- image archive dobija GitHub/Sigstore build-provenance attestation vezan za tačan commit i workflow identity;
- dependency audit, SBOM, puni scan i actionable scan čuvaju se 30 dana kao `backend-supply-chain-<SHA>` CI artefakt;
- sve korištene supply-chain GitHub akcije zaključane su na pune commit SHA vrijednosti;
- statički container guard i četiri negativna/pozitivna testa sprečavaju vraćanje mutable basea, install fallbacka, builder dependencyja ili nepinovane sigurnosne korekcije;
- stvarni runtime probe potvrđuje non-root proces, read-only root, writable tmpfs/uploads, odsustvo build/package-manager alata i graceful `SIGTERM`.

### Izvršni dokaz

```text
Production npm audit                         0 vulnerabilities
Container contract testovi                   4/4 PASS
Digest-pinned runtime build                  PASS
CycloneDX image SBOM                         PASS
Puni Grype inventar                          PASS / artifact
Actionable high/critical image gate          0 / PASS
GitHub/Sigstore provenance attestation       PASS
Supply-chain evidence upload                 PASS
Runtime UID/filesystem/toolchain/signal      PASS
Backend build/lint/full Jest                 PASS
PostgreSQL/Redis integration                 PASS
Frontend build/test i docs                   PASS
Završni CI gate                              PASS
```

Tokom implementacije scan je izvršno otkrio ranjive OpenSSL, glibc, Perl, npm-transitive i `zlib` slojeve u ranijim Alpine/Debian/distroless kandidatima. Ti pokušaji nisu proglašeni uspjehom. Finalni image koristi ažurirani Alpine digest, uklanja npm toolchain i pinovano koriguje posljednji actionable `zlib` nalaz. Puni non-actionable/upstream inventar ostaje dokazni artefakt; ne prikriva se VEX-om niti se predstavlja kao apsolutno odsustvo svih budućih CVE zapisa.

### Zatvoreni nalazi

- `BA-xcut-04` — uklonjeni su install fallback, mutable base i builder/dev dependencies iz runtimea;
- `BA-xcut-24` — production dependency audit sada ima nula low/moderate/high/critical nalaza;
- `BA-xcut-29` — SBOM, puni/actionable image scan i potpisana provenance attestation sada su izvršni deploy dokaz.

Kanonski zbir je sada **686 otvorenih / 6 zatvorenih** nalaza.

## Paket W1.2 — DB/migration privilege separation

**Status:** završeno; CI run [`40075479663`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40075479663) zelen na SHA `97e78ab7e1d1b61e4812723d570b1bc20337a173`.

### Implementirano

- odvojeni `servicedesk_migrator` i `servicedesk_runtime` login roleovi sa različitim credentialima;
- runtime role ima DML/sequence usage, ali nema database/schema `CREATE`, `CREATEDB`, `CREATEROLE`, superuser ili replication prava;
- real-DB CI pozitivno potvrđuje runtime read/DML capability i negativno dokazuje SQLSTATE `42501` za `CREATE TABLE`;
- API replika više ne izvršava `prisma migrate deploy`; Compose ima zaseban `release` profil i migration image target;
- release migrator zahtijeva `MIGRATION_DATABASE_URL`, odbija isti username kao runtime i u productionu zahtijeva `sslmode=verify-full`;
- PostgreSQL advisory lock osigurava jednog vlasnika migracije; konkurentni migrator fail-closed prekida release;
- migrator ima eksplicitne `lock_timeout=5s` i `statement_timeout=10min`, a API/worker konekcije dobijaju statement, lock i idle-in-transaction timeout već pri connection startupu;
- production `DATABASE_URL` zahtijeva hostname-verifying TLS (`sslmode=verify-full`);
- deployment admission provjerava zbir `replicas × pool + migrator + reserve` prema `max_connections`;
- readiness uz DB/Redis ping provjerava da je posljednja očekivana migracija završena i da nema nedovršene/failed migration evidencije;
- migration policy gate zaključava latest-schema sentinel i SHA-256 odobrenja za svih 11 postojećih destruktivnih migracija;
- disposable PostgreSQL 17 drill pravi custom-format backup, vraća ga u zasebnu bazu i dokazuje marker, schema compatibility, RPO ≤ 24 h i RTO ≤ 4 h;
- DR runbook sada izričito zahtijeva one-shot release migrator prije API/worker rollouta.

### CI dokaz

```text
Migration policy + sentinel                    76 migracija / PASS
Migration guard testovi                        4/4 PASS
Odvojeni migrator/runtime roleovi              PASS
Single-owner advisory-lock migration replay    76/76 PASS
Runtime DDL denial                             SQLSTATE 42501 / PASS
Migration history                              current / PASS
Deployment connection budget                   PASS
Backup/restore marker + schema                  PASS
RPO ≤ 24 h / RTO ≤ 4 h                         PASS
DB runtime contract testovi                    4/4 PASS
Pool/timeout testovi                           8/8 PASS
PostgreSQL/Redis i pet real-DB suiteova        PASS
Backend/full Jest, frontend, docs i CI gate    PASS
```

### Nalazi

Zatvoreni:

- `BA-xcut-02` — migrator i runtime credential/privilegije su izvršno razdvojeni;
- `BA-xcut-07` — migracije su izvučene iz API replika u single-owner release gate uz compatibility i restore dokaz;
- `BA-xcut-10` — deployment-wide connection budget sada je fatalni admission check.

Namjerno ostaju otvoreni:

- `BA-xcut-03` — DB TLS je sada production-obavezan, ali Redis TLS/CA pripada W1.3;
- `BA-xcut-11` — timeouti pokrivaju dedicated clients, ali query instrumentation još ne broji svaki dedicated-client statement;
- `BA-xcut-12` — readiness dokazuje schema compatibility, ali write i stvarni queue-flow probe još nisu potpuni;
- `BA-xcut-13` — destruktivni approval manifest postoji, ali kompletan expand/backfill/contract lifecycle linter još nije završen.

Kanonski zbir je sada **683 otvorena / 9 zatvorenih** nalaza.

## Paket W1.3 — Redis i secret transport

**Status:** završeno; CI run [`40087131166`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40087131166) zelen na SHA `954f85c147eb4341e7f2eea9cd6eb4f0c40fc96f`.

### Implementirano

- API i worker koriste isti centralni production startup validator;
- production Redis fatalno odbija plaintext, nedostajuću CA, ACL username/password i nevalidan deployment namespace;
- Redis CA se prima kao mounted PEM path ili base64, ali ne kroz dva istovremena izvora;
- ioredis i BullMQ dobijaju isti CA, `servername` i obavezni `rejectUnauthorized: true` ugovor;
- key i queue prefixi uključuju `DEPLOYMENT_ENV`, uz različite staging/production vrijednosti;
- production zabranjuje implicitno izvođenje inbound-email, privacy-tombstone i privacy-export ključeva iz MFA ključa;
- MFA ključ mora biti tačno 32 base64 bajta, config-package signing ključ najmanje 32 znaka, a purpose-specific ključevi eksplicitni;
- dependency URL-ovi koji izlaze preko HTTP-a u productionu zahtijevaju HTTPS;
- Redis client i subscriber logovi emituju samo tip greške, bez raw dependency poruke ili credentiala;
- Compose i oba env kataloga dokumentuju TLS, CA, server identity, namespace i eksplicitne tajne;
- rotation runbook definiše zasebni pin/rotation ugovor za MFA, inbound email, privacy, config signing, JWT/install, DB/Redis i provider tajne.

### Izvršni dokaz

```text
Centralni validator + Redis unit testovi        31/31 PASS
Plaintext/missing CA/auth/namespace rejection   PASS
Verified Redis 7 TLS handshake                  PASS
Pogrešan CA                                     REJECTED
Pogrešan hostname                               REJECTED
Production/staging key namespace                ISOLATED
BullMQ environment queue prefix                 ISOLATED
Secret-safe Redis error logging                 PASS
Backend build/lint/full Jest                     PASS
PostgreSQL + Redis integracija                  PASS
Container/Compose/supply-chain                  PASS
Frontend, docs i završni CI gate                PASS
```

Prvi CI pokušaj `40086825580` ispravno nije prihvaćen kao dokaz: wiring manifest nije bio osvježen, a TLS fixture private key nije bio čitljiv Redis container useru. SHA `954f85c...` sinhronizuje manifest i postavlja test-fixture dozvole; tek ponovljeni run `40087131166` je potpuno zelen.

### Nalazi

Zatvoreni:

- `BA-xcut-03` — DB i Redis sada imaju production-obavezan hostname-verifying TLS/CA ugovor;
- `BA-xcut-09` — API i worker koriste jedinstvenu typed/fatal production validaciju;
- `BA-xcut-30` — minimumi, fallback i rotacija klasifikovani su po namjeni, a production derivacija je zabranjena.

Namjerno ostaje otvoren:

- `BA-xcut-15` — environment namespace je završen, ali kompletan reconnect/offline-queue/circuit-breaker ugovor pripada narednom lifecycle radu.

Kanonski zbir je sada **680 otvorenih / 12 zatvorenih** nalaza.

## Paket W1.4 — Worker lifecycle

**Status:** završeno; CI run [`40094120401`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40094120401) zelen na SHA `90d93f1739df132cc28cbf6af1f8a11b85c15960`.

### Implementirano

- svaki worker scheduler fatalno prekida startup ako početni `upsertJobScheduler` ne uspije;
- discovery-based reconciler ponovo potvrđuje kompletan mandatory scheduler skup nakon bootstrapa i svakih pet minuta;
- reconcile greška postavlja lifecycle u `degraded`, pa healthcheck više ne proglašava djelimični worker zdravim;
- worker startup ima čvrst deadline od 45 sekundi i tek nakon kompletnog Nest/Bull/scheduler bootstrapa objavljuje `ready`;
- readiness traži i svjež worker heartbeat i lifecycle `ready`, dok Redis/queue nedostupnost vraća non-zero healthcheck;
- SIGTERM/SIGINT prvo objavljuje `draining`, zaustavlja novi BullMQ intake kroz Nest close i čeka aktivne poslove najviše 30 sekundi;
- istekom drain deadlinea ili drugim signalom worker ide forced-exit putanjom, a zaključani posao ostaje BullMQ stalled/retry-safe;
- prije urednog izlaza flushuju se stdout/stderr telemetry sinkovi, uz eksplicitnu tačku proširenja za buduće exportere;
- Redis lifecycle zapis ima TTL i worker ga obnavlja, pa mrtav proces ne može ostaviti trajno zelen readiness;
- realni CI recovery drill prisilno zatvara workera usred aktivnog posla i dokazuje da drugi worker preuzima stalled job u sljedećem pokušaju.

### Izvršni dokaz

```text
Lifecycle/deadline/reconcile unit testovi       14/14 PASS
Mandatory scheduler negative testovi            PASS
Startup deadline i partial-init rejection        PASS
Ready/degraded/draining health contract          PASS
Bounded drain + telemetry flush                  PASS
Forced unfinished-job abandonment               PASS
BullMQ stalled detection i retry                 PASS
Recovered job state                              completed / attemptsStarted=2
Backend build/lint/full Jest                     PASS
PostgreSQL/Redis integration                     PASS
Container, frontend, docs i završni gate         PASS
```

Prvi CI pokušaj `40093799701` nije prihvaćen kao dokaz jer je jedan historijski digest-scheduler test još očekivao fail-open ponašanje. Test je ispravljen da zahtijeva fatalni startup; ponovljeni run `40094120401` potpuno je zelen.

### Nalazi

Zatvoreni:

- `BA-xcut-06` — scheduler registration više ne može fail-open označiti worker pokrenutim, a periodični reconcile liječi izgubljene schedule zapise;
- `BA-xcut-17` — worker sada ima readiness/liveness, startup i drain deadline, drugi-signal forced path, telemetry flush i stvarni stalled recovery dokaz.

Kanonski zbir je sada **678 otvorenih / 14 zatvorenih** nalaza.

## Sljedeći paket

**Backend Val 2 — identity, scope i authorization:** canonical principal/assignment/scope model, session revocation i authz authority koja ne zavisi od stale cachea.
