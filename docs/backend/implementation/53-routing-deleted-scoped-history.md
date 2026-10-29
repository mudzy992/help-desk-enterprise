# W5.26 — Historija obrisanog scoped routing pravila

**Finding:** `BA-routing-07`  
**Implementacija:** `a1fda3b`, migration-policy/sentinel korekcija `5daf251`  
**CI:** `40384827667` — zelen

## Problem

Scoped routing history se autorizovala preko trenutno postojećih i vidljivih `RoutingRule` redova. Nakon brisanja pravila više nije postojao red iz kojeg bi se rekonstruisao OU/service scope, pa je scoped administrator izgubio historiju vlastitog pravila. Globalni reader je mogao koristiti izuzetak, ali scoped reader nije; globalni changes endpoint je također odbacivao logove obrisanih pravila.

## Implementirani ugovor

`ChangeLog` sada ima immutable authorization kolone:

- `scopeOriginUnitId`;
- `scopeServiceId`.

Create, update i delete routing mutacije zapisuju obje vrijednosti u istoj transakciji kao change-log događaj. Delete zato čuva scope prije uklanjanja routing pravila.

Scoped globalni i per-rule history upiti više ne zavise od živog `RoutingRule` reda. Viewer OU/service assignment se prevodi u dozvoljene `(originUnitId, serviceId)` parove i ulazi u DB `count` i cursor-page predicate nad change-log scope kolonama. Time:

- vlastita obrisana historija ostaje dostupna;
- foreign-scope historija ostaje zabranjena;
- `total`, `hasMore` i cursor opisuju samo autorizovani skup;
- globalni reader zadržava puni pristup.

## Migracija i postojeći podaci

Migracija `20271026140000_routing_change_log_scope`:

1. dodaje nullable scope kolone;
2. deterministički backfilluje postojeće `routing_rule` logove iz već sačuvanih `diff.before`/`diff.after` snapshotova;
3. dodaje kompozitni indeks `ChangeLog_routing_scope_page_idx` za autorizovanu page putanju.

Backfill je eksplicitno evidentiran u destructive-migration approval manifestu hashom migracije. Runtime schema sentinel je pomjeren na novu migraciju.

## Izvršivi dokaz

Test kreira own-scope i foreign-scope pravilo, briše oba i potvrđuje:

- scoped viewer i dalje čita create+delete historiju vlastitog obrisanog pravila;
- direktan pristup historiji foreign obrisanog pravila vraća 403;
- globalni routing changes endpoint za scoped view vraća samo događaje vlastitog pravila;
- pagination total ostaje scope-aware.

Puni migration replay u PostgreSQL CI shardu potvrđuje schema, backfill SQL, approval hash, runtime role grant i migracijsku historiju.

## CI dokaz

CI `40384827667` je potpuno zelen: migration policy/replay, PostgreSQL/Redis integration shard, backend build/lint/svi unit suiteovi, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut.

## Release obaveza

Paket **sadrži novu DB migraciju** `20271026140000_routing_change_log_scope`. Mora se ručno primijeniti release migratorom pri narednom redeployu prije pokretanja nove aplikacijske verzije.

## Ishod

`BA-routing-07` je zatvoren. Registar prelazi na **630 otvorenih / 62 zatvorena / 692 ukupno**.
