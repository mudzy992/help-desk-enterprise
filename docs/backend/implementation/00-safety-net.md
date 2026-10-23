# Backend implementacija — Val 0: reprodukcija i safety net

**Status:** u toku  
**Početak:** 2026-10-23  
**Master plan:** [Backend implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md)

## Pravilo završetka

Val 0 je završen tek kada clean checkout ima reproducibilan install/generate/build/test tok, disposable PostgreSQL/Redis integration harness, migration replay, route/guard i API/worker wiring dokaz, BA traceability gate te početne container safety testove. Lokalna environment blokada se ne označava kao pass; CI dokaz mora biti vezan za tačan SHA.

## Paket 0.1 — zaključan baseline i BA traceability

**Status:** implementirano; CI dokaz čeka run na završnom SHA paketa.

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

Lokalni `prisma generate` ostaje **environment-blocked** jer sandbox nema mrežni pristup `binaries.prisma.sh`. Zbog toga lokalni build/full Jest nije proglašen zelenim. Postojeći CI generira Prisma client prije builda; rezultat na SHA-u ovog paketa tek treba evidentirati.

### Nalazi i status

Ovaj paket uvodi dokaznu infrastrukturu, ali još ne zatvara produkcijski BA nalaz. `BA-xcut-31` ostaje otvoren dok generated Prisma, build i ranije compile-blokirani suiteovi ne prođu na tačnom CI SHA-u.

## Preostali paketi Vala 0

1. **0.2 — generated Prisma/build gate i compile-blocked suiteovi**;
2. **0.3 — disposable PostgreSQL/Redis harness i migration replay**;
3. **0.4 — route/guard manifest i API/worker wiring snapshot**;
4. **0.5 — container UID/filesystem/signal/storage safety testovi**;
5. **0.6 — završni Val 0 regression, traceability update i commit dokaz**.
