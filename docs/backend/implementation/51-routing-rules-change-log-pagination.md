# W5.24 — Bounded routing rules i change-log paginacija

**Finding:** `BA-routing-05`  
**Implementacija:** `e72b0ee`, build/format korekcija `567f9a4`  
**CI:** `40380455353` — zelen

## Problem

`GET /routing/rules`, globalni routing change log i per-rule change log učitavali su kompletne skupove. Rules i global changes zatim su radili authorization post-filter u procesu, pa su trošak i memorija rasli sa globalnim brojem redova, a API nije imao page granicu, total niti continuation ugovor.

## Implementirani ugovor

Sva tri endpointa sada koriste bounded page odgovor:

- `items`, `total`, `take`, `cursor`, `nextCursor`, `hasMore`;
- default `take=25`, maksimum `100`;
- malformed ili cursor pogrešnog tipa vraća `INVALID_ROUTING_LIST_CURSOR`/HTTP 400.

Routing rules koriste stabilan keyset redoslijed `(serviceId ASC, originUnitId ASC, id ASC)`. OU/service assignment parovi se pretvaraju u scope-aware DB predicate prije `count` i `findMany`; nema globalnog rule učitavanja pa post-filtera.

Change log koristi stabilan `(createdAt DESC, id DESC)` keyset. Za scoped view prvo se učitavaju samo ID-evi trenutno vidljivih pravila, zatim DB `entityId IN (...)` ograničava count i page query; out-of-scope change-log redovi ne ulaze u proces. Historija obrisanog scoped pravila ostaje zaseban `BA-routing-07` ugovor.

Frontend routing API je usklađen sa page responseom. Postojeći potrošači koriste bounded zahtjeve od najviše 100 redova i prate `nextCursor`, čime je uklonjena zavisnost od starog neograničenog response oblika.

## Izvršivi dokaz

Testovi potvrđuju:

- scoped rule total i stranice ne sadrže foreign-OU pravilo;
- dvije `take=1` rule stranice nemaju duplikate i imaju pouzdan `hasMore`;
- change-log `take=1` cursor vraća dvije stabilne, različite stranice uz tačan total;
- scoped global change log ne vraća foreign-rule događaj;
- malformed rule i change cursor vraćaju HTTP 400;
- postojeći globalni i per-rule change-log testovi koriste page ugovor i zadržavaju actor/diff redoslijed.

## CI dokaz

CI `40380455353` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend format/test/build, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-05` je zatvoren. Registar prelazi na **632 otvorena / 60 zatvorenih / 692 ukupno**.
