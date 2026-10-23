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

## Preostali paketi Vala 0

1. **0.3 — disposable PostgreSQL/Redis harness i migration replay**;
2. **0.4 — route/guard manifest i API/worker wiring snapshot**;
3. **0.5 — container UID/filesystem/signal/storage safety testovi**;
4. **0.6 — završni Val 0 regression, traceability update i commit dokaz**.
