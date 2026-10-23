# Backend implementacija — Val 0: reprodukcija i safety net

**Status:** u toku  
**Početak:** 2026-10-23  
**Master plan:** [Backend implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md)

## Pravilo završetka

Val 0 je završen tek kada clean checkout ima reproducibilan install/generate/build/test tok, disposable PostgreSQL/Redis integration harness, migration replay, route/guard i API/worker wiring dokaz, BA traceability gate te početne container safety testove. Lokalna environment blokada se ne označava kao pass; CI dokaz mora biti vezan za tačan SHA.

## Paket 0.1 — zaključan baseline i BA traceability

**Status:** završeno; potvrđeno u CI runu `40014367779` na SHA `f7202a52e53b1d6b32dfa38e4d83e98631497fd0`.

Implementirano:

- Node/npm runtime contract je deklarisan u `backend/package.json` (`Node 22`, `npm 10`);
- `packageManager` i lockfile zajedno zaključavaju installer major/version;
- `scripts/check-backend-findings.mjs` parsira svih 44 source audita i odbija:
  - nestalu audit jedinicu;
  - dupliciran BA ID;
  - promjenu zaključanog total/severity baselinea;
  - nalaz bez primarnog workstream ownera i implementacijskog vala;
  - nesinhronizovan machine-readable plan;
- `docs/backend/backend-findings-plan.json` mapira svih 692 nalaza na ownera, prvi val i početni status;
- guard ima četiri direktna Node testa;
- backend CI izvršava guard i njegove testove prije Prisma generate/build/test koraka.

### Direktni dokaz

```text
npm ci
PASS — 1000 paketa instalirano iz lockfilea

node scripts/check-backend-findings.mjs
PASS — 692/692; P1=174, P2=368, P3=150; owner/val potpun

node --test scripts/check-backend-findings.test.mjs
PASS — 4/4
```

Lokalni `prisma generate` ostaje **environment-blocked** jer sandbox nema mrežni pristup `binaries.prisma.sh`; lokalni build/full Jest zato nije zamijenio CI dokaz. CI je na SHA-u paketa 0.2 uspješno izvršio traceability gate prije Prisma/build/test lanca.

### Nalazi i status

Paket 0.1 nije samostalno zatvorio produkcijski BA nalaz; njegov guard sada čuva status koji dolazi iz izvornog audit reda i sinhronizuje machine-readable plan.

## Paket 0.2 — generated Prisma/build gate i compile-blokirani suiteovi

**Status:** završeno; CI run [`40014942994`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40014942994) zelen na završnom SHA paketa `803a0a173878bb93500d57c72895768005202f9f`.

Implementirano:

- CI validira kompletnu multi-file Prisma schemu prije generisanja;
- `npm run db:generate` je eksplicitan obavezni korak;
- novi generated-artifact gate dokazuje `client.ts`, `enums.ts`, `models.ts` i `internal/class.ts` prije builda;
- gate ima tri izolovana testa za kompletan, nedostajući i stale/pogrešan output;
- šest suiteova koji su tokom audita bili compile-blokirani sada imaju eksplicitan CI korak prije full Jest regresije;
- branch push daje zvanični CI dokaz bez PR-a i bez pokretanja remote E2E stacka.

### CI dokaz

```text
Prisma validate                         PASS
Prisma generate                         PASS
Generated Prisma artefakti              4/4 PASS
Generated-artifact guard testovi        3/3 PASS
Backend build                           PASS
Backend lint                            PASS
Ranije compile-blokirani suiteovi       6/6 PASS
Kompletan backend Jest                  PASS
Frontend build + test                   PASS
Docs guard                              PASS
CI gate                                 PASS
```

Prvi run `40013822041` je ispravno pao na preuskom `PrismaClient` content markeru nakon uspješnog generate koraka. Marker je korigovan da prihvati stvarni Prisma 7 export shape, njegov unit test je ponovo prošao, a kompletan drugi run je zelen. Neuspjeli run nije skriven niti predstavljen kao pass.

### Zatvoren nalaz

- `BA-xcut-31` — generated Prisma artefakt je sada obavezni CI gate, a svih šest ranije compile-blokiranih suiteova izvršava se i prolazi.

## Paket 0.3 — disposable PostgreSQL/Redis harness i migration replay

**Status:** završeno; CI run [`40018015822`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40018015822) zelen na SHA `cb446d9483f2ee22b3d306ff68e0335564f6e5c0`.

Implementirano:

- zaseban required `Backend PostgreSQL + Redis integration` CI job;
- disposable PostgreSQL 17 i Redis 7 service containeri sa healthcheckovima;
- kompletan `prisma migrate deploy` replay svih 76 migracijskih direktorija na praznoj bazi;
- `prisma migrate status` dokaz da nema pending/failed migracije;
- PostgreSQL read/write/rollback i Redis NX/read/delete/cleanup smoke;
- tri direktna testa dependency smoke harnessa;
- izolacijski runner koji za svaki real-DB suite klonira potpuno migriranu template bazu, izvršava suite i bazu briše sa `FORCE` cleanupom;
- tri direktna testa sigurnog database naming/URL isolation contracta;
- pet stvarnih PostgreSQL integration suiteova sada ulazi u obavezni CI gate;
- integration failure output se objavljuje kao GitHub annotation, pa dokaz nije skriven iza nedostupnog runner log hosta;
- završni CI gate eksplicitno zavisi od integration joba.

### CI dokaz

```text
PostgreSQL 17 / Redis 7 healthcheck       PASS
Prisma generate + artefakti               PASS
76/76 migration direktorija replay        PASS
Prisma migrate status                     PASS — database schema up to date
Dependency/isolation harness testovi       6/6 PASS
PostgreSQL transaction + Redis cleanup     PASS
Privacy retention integration              8/8 PASS
Privacy anonymization integration          6/6 PASS
Privacy export integration                 4/4 PASS, 1 budget test svjesno skipped
Status-page integration                    5/5 PASS
Ops-alert engine integration               7/7 PASS
Backend build/lint/full Jest                PASS
Frontend build/test, docs i CI gate         PASS
```

Prvi integration run je otkrio dvije stvarne safety-net greške, bez prikrivanja:

1. suiteovi su dijelili istu bazu pa su retention countovi bili kontaminirani podacima drugih suiteova;
2. tri ops-alert integration scenarija nisu pratila deklarisani `openAfter: 2` hysteresis i 15-minutni notification retry.

Prvi problem je riješen per-suite database izolacijom; drugi korekcijom test scenarija prema postojećem produkcijskom state-machine ugovoru. Produkcijska ops-alert logika nije mijenjana.

### Nalazi i status

Paket uvodi izvršni migration/dependency dokaz, ali ne zatvara široke production nalaze o TLS-u, privilege separationu, rollout concurrencyju, restoreu ili Redis failoveru. Oni ostaju otvoreni za Valove 1 i 9. Zbir ostaje **691 otvoren / 1 zatvoren**.

## Preostali paketi Vala 0

1. **0.4 — route/guard manifest i API/worker wiring snapshot**;
2. **0.5 — container UID/filesystem/signal/storage safety testovi**;
3. **0.6 — završni Val 0 regression, traceability update i commit dokaz**.
