# W5.43 — Scope-aware and paginated SLA administration reads

**Finding:** `BA-sla-13`  
**Implementacija:** `33a3f09`, `44f905a`, `ffefe6e`, `b0da440`, `dc72754`  
**CI:** `40697181339` — zelen

## Problem

SLA administracijski GET endpointi oslanjali su se na ADMIN rolu i globalni write guard. Profile, kalendare, pravila, escalation pravila i change logove vraćali su kao nepaginirane nizove, a DB helperi su koristili neograničeni `findMany`. Nije postojao zaseban `sla.read`, niti je request principalov OU/service assignment ograničavao listu ili pojedinačni resurs.

## Implementacija

- Katalog, sistemska ADMIN dodjela i EN/BS permission prikaz sada sadrže `sla.read`; postojeći globalni `sla.write` i SuperAdmin bypass ostaju nepromijenjeni za mutacije.
- GET guard prihvata `sla.read` ili nadskup `sla.write` na assignmentu, dok POST/PATCH/DELETE i dalje zahtijevaju globalni `sla.write` assignment.
- Request principal se svodi na eksplicitni globalni flag, deduplicirane OU putanje i service ID-eve. Rule DB predicate uključuje globalno pravilo koje važi u svakom scopeu, pravila iz dozvoljenog service scopea i pravila čiji OU pripada dozvoljenom podstablu.
- Profile i kalendari su vidljivi samo kada sadrže barem jedno scope-vidljivo pravilo; escalation pravila nasljeđuju odluku svog profila.
- Pojedinačni profile/calendar/rule/escalation GET i pripadajući change-log endpoint prvo rade isti fail-closed DB scope lookup i za nedozvoljen resurs vraćaju isti not-found ishod kao za nepostojeći resurs.
- Sve konfiguracijske liste imaju `take` 1–100, stabilni ID cursor, look-ahead red, `total`, `hasMore` i `nextCursor`. Change log koristi postojeći `listChangeLogPage`, stabilni `(createdAt,id)` cursor i isti page envelope.
- Frontend SLA API konzumira page envelope i nastavlja isključivo preko `nextCursor`; nijedan pojedinačni backend poziv više ne može učitati neograničenu listu.

## Dokaz

- Direktni unit test potvrđuje globalni assignment, OU path i service predicate te odsustvo sibling/cross-service vrijednosti.
- Guard test potvrđuje da OU-scoped `sla.read` može čitati, ali ne može mutirati, i da čitanje bez `sla.read`/`sla.write` pada zatvoreno.
- Stvarni PostgreSQL test `sla-admin-read-scope.integration.spec.ts` kreira root/child i sibling OU, dozvoljeni i drugi servis, globalno/OU/service pravilo i potvrđuje globalni rezultat, dozvoljeni subtree/service rezultat, sibling/cross-service odbijanje, profilsku vidljivost i cursor stranice bez preklapanja.
- Finalni CI `40697181339` je potpuno zelen: backend build/lint/cijeli unit suite, stvarni PostgreSQL/Redis integration shard, frontend lint/format/test/build, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju. Permission katalog se usklađuje postojećim idempotentnim authorization bootstrap mehanizmom.

## Ishod

SLA administracijska čitanja više nisu role-only, globalno vidljiva niti DB-neograničena. Scope odluka je jednaka za listu, pojedinačni resurs i change log, a cursor ugovor je bounded i nastavljiv. `BA-sla-13` je zatvoren; registar prelazi na **613 otvorenih / 79 zatvorenih / 692 ukupno**.
