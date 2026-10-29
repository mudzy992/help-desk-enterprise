# W5.30 — Izvršiva routing kritična PostgreSQL matrica

**Finding:** `BA-routing-11`  
**Implementacija:** `6457460` (`2b2515c` + enum korekcija)  
**CI:** `40524653649` — zelen

## Problem

Routing je imao široke in-memory suiteove, ali nije imao obavezni generated-Prisma/PostgreSQL shard koji na stvarnoj migriranoj šemi dokazuje kritične scope, pagination, fallback i concurrency ugovore. Zbog toga su se DB semantika, Prisma tipovi i routing invarianti mogli razići bez zasebnog routing integration gatea.

## Implementirana matrica

Dodan je `routing-critical-matrix.integration.spec.ts`, koji u vlastitoj izolovanoj i potpuno migriranoj PostgreSQL bazi dokazuje:

1. **Scoped keyset pagination i total** — scoped čitalac dobija samo vlastiti OU/service par; root i sibling/foreign pravila ne ulaze ni u page ni u `total`.
2. **Generated-Prisma parent fallback** — routing kroz dataset sa 120 dodatnih OU zapisa bira root parent pravilo za origin bez exact pravila, sa tačnim `matchedOriginUnitId`, grupom i fallback dubinom.
3. **Concurrent optimistic update** — dva writer-a koriste isti `updatedAt`; tačno jedan uspijeva, drugi dobija `ROUTING_RULE_CONFLICT`, a ChangeLog sadrži tačno jednu update promjenu.

Postojeći fokusirani routing suiteovi ostaju izvršivi dokaz za foreign target authorization, activation coverage, rules/change-log pagination, historiju obrisanog pravila, coverage resource budget i malformed ancestor lanac.

## Obavezni CI shard

Novi suite je eksplicitno dodat u `integrationSpecs` listu izolovanog PostgreSQL runnera. Harness test zahtijeva njegovo prisustvo porukom `nedostaje obavezni routing critical-matrix PostgreSQL shard`, pa se suite ne može slučajno ukloniti iz CI-a dok testovi ostanu zeleni.

Svaki integration suite dobija zasebnu bazu kreiranu iz migriranog templatea i poslije izvršenja se prisilno uklanja. Time routing matrica ne zavisi od reda drugih integration suiteova niti od zajedničkog fixture stanja.

## Izvršivi dokaz

Lokalno su prošli:

- integration-runner harness: **3/3**;
- backend ESLint;
- `git diff --check`.

Zvanični CI generisao je Prisma client, izgradio backend i izvršio novi PostgreSQL shard zajedno sa kompletnom backend kolekcijom.

## CI dokaz

CI `40524653649` je potpuno zelen: backend build/lint/svi testovi, PostgreSQL/Redis integracije uključujući routing critical matrix, frontend build/lint/svi testovi, docs guard, container/supply-chain i završni CI gate su prošli.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release radnju.

## Ishod

`BA-routing-11` je zatvoren. Registar prelazi na **626 otvorenih / 66 zatvorenih / 692 ukupno**.
