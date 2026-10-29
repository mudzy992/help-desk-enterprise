# W5.23 — Tačan scoped routing coverage total

**Finding:** `BA-routing-04`  
**Implementacija:** scope-aware count `93ead93`, veliki izvršivi dokaz `568141a`  
**CI:** `40377931686` — zelen

## Problem

Ranija scoped grana pokušavala je izračunati `total` pozivom coveragea sa `take: 10_000`, ali je coverage funkcija clampovala stranicu na maksimalno 50 servisa. Naknadni in-memory distinct count zato je bio ograničena aproksimacija i nikada nije mogao pouzdano prijaviti veći scoped skup.

## Implementirani ugovor

W5.22 je service authorization scope premjestio u Prisma `where` prije paginacije. Isti canonical `serviceWhere` sada se koristi za:

- `prisma.service.count` bez page limita;
- cursor stranicu i `take + 1` lookahead;
- eksplicitni service filter i lifecycle filter.

Time `total` predstavlja tačan broj autorizovanih servisa nezavisno od veličine stranice, cursora i broja zabranjenih redova između dozvoljenih redova. Uklonjeni su `take: 10_000`, post-filter i distinct aproksimacija.

## Izvršivi dokaz

Novi test kreira:

- 75 scoped/autorizovanih aktivnih servisa;
- 75 isprepletenih zabranjenih aktivnih servisa;
- scoped viewer assignment za tačno 75 dozvoljenih servisa;
- page size 7 i prolazak kroz sve cursore.

Svaka stranica prijavljuje `total=75`, konačni skup sadrži svih i samo 75 dozvoljenih service ID-eva, a nijedan hidden servis ne prolazi. Test eksplicitno prelazi raniji hard cap od 50.

## CI dokaz

CI `40377931686` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-04` je zatvoren. Registar prelazi na **633 otvorena / 59 zatvorenih / 692 ukupno**.
