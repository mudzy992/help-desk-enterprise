# W5.17 — Saved-view `sort:null` clear semantika

**Finding:** `BA-tickets-17`  
**Implementacija:** `5b13cdc`, test-harness korekcija `943286d`  
**CI:** `40344015280` — zelen

## Problem

Update je normalizovao eksplicitni `sort: null`, ali ga je zatim pretvarao u Prisma `undefined`. Prisma `undefined` znači “ne mijenjaj kolonu”, pa klijent nije mogao ukloniti ranije spremljeni sort iako API tip/DTO izričito dopuštaju `null`.

## Implementirani ugovor

Tri ulazna stanja sada imaju različitu semantiku:

- izostavljen `sort` → postojeća vrijednost ostaje nepromijenjena;
- validan sort objekt → vrijednost se validira i zamjenjuje;
- eksplicitni `sort: null` → u nullable JSON kolonu se šalje `Prisma.DbNull`, odnosno sprema se SQL `NULL`.

DTO i domeni tip već su prihvatali `null`; nije bilo potrebno mijenjati javni API. In-memory Prisma delegate sada također razlikuje `DbNull` od `undefined` i, kao pravi Prisma client, ne prepisuje ostala polja čija je update vrijednost `undefined`.

## Direktni dokaz

`tickets.saved-views.spec.ts` potvrđuje da update bez `sort` polja čuva prethodni `{ field: 'updatedAt', direction: 'desc' }`, dok sljedeći update sa `sort: null` vraća i listanjem potvrđuje `null`.

`saved-view-concurrency.integration.spec.ts` na stvarnom PostgreSQL-u potvrđuje isti omit/preserve/clear tok i direktno provjerava da persisted `SavedView.sort` nakon eksplicitnog nulla zaista postaje `null`.

Puni CI `40344015280` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-tickets-17` je zatvoren. Registar prelazi na **639 otvorenih / 53 zatvorena / 692 ukupno**.
