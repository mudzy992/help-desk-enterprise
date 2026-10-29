# W5.22 — Scoped routing coverage paginacija

**Finding:** `BA-routing-03`  
**Implementacija:** `93ead93`  
**CI:** `40375898079` — zelen

## Problem

Coverage endpoint je prvo birao globalnu stranicu servisa i globalni cursor, a zatim post-filterovao rezultate prema viewer scopeu. Scoped stranica zato je mogla biti prazna iako je autorizovani servis postojao iza zabranjenog globalnog reda; cursor i `nextCursor` opisivali su globalni, a ne autorizovani skup.

## Implementirani ugovor

Authorization assignmenti sada ulaze u `computeRoutingCoverage` prije count/cursor/page koraka:

1. service scope se prevodi u dozvoljeni skup service ID-eva unutar Prisma `where` uslova;
2. `count`, stabilni `(name,id)` cursor i `take + 1` rade nad istim autorizovanim skupom;
3. OU scope se primjenjuje pri izgradnji coverage redova za svaki već autorizovani servis;
4. OU i service dijelovi assignmenta ostaju upareni, bez stvaranja privilegijskog cross-producta između odvojenih assignmenta;
5. globalni reader zadržava dosadašnju punu listu.

Uklonjen je raniji post-filter i dodatni `take: 10_000` fallback upit iz service sloja.

## Izvršivi dokaz

Test sa međusobno isprepletenim servisima `allowed A`, `forbidden B`, `allowed C` i `take=1` potvrđuje:

- prva stranica vraća A;
- cursor preskače zabranjeni B;
- druga stranica vraća C;
- `total=2` i `nextCursor` odgovaraju scoped skupu.

Dodatni test sa assignmentima `(OU leaf, service A)` i `(OU parent, service B)` potvrđuje da A ne dobija parent OU redove iz B assignmenta, dok B pravilno dobija parent i descendant redove.

## CI dokaz

CI `40375898079` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-03` je zatvoren. Registar prelazi na **634 otvorena / 58 zatvorenih / 692 ukupno**.
