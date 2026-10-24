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

## Sljedeći paket

**W1.3 — Redis i secret transport:** `rediss`/TLS, CA/server identity, environment namespace, fatalna typed production validacija i pin/rotation ugovor po secret purposeu.
