# W5.28 — Ukupni resource budget za routing coverage

**Finding:** `BA-routing-09`  
**Implementacija:** `ca6f6fe`  
**CI:** `40401904911` — zelen

## Problem

Coverage `take` je ograničavao samo broj servisa. Jedna stranica je i dalje mogla proizvesti kartezijanski proizvod `servisi × svi vidljivi OU-ovi`, uključujući fallback putanje i labele, bez ukupne granice broja itema, procijenjenih bajtova ili vremena obrade.

## Implementirani ugovor

Coverage sada primjenjuje tri server-side granice:

- najviše **500 itema**;
- najviše **1.000.000 procijenjenih UTF-8 bajtova item payloada**;
- najviše **5.000 ms** računanja coverage rezultata.

Stranica se prekida samo na granici kompletnog servisa, pa jedan servis nikada nije podijeljen između dva cursora. Ako naredni servis prelazi preostali budget, `nextCursor` pokazuje iza posljednjeg kompletnog servisa i sljedeći zahtjev nastavlja bez duplikata ili preskakanja.

Ako već jedan servis sa svim vidljivim OU-ovima prelazi budget, zahtjev fail-closed vraća stabilni `ROUTING_COVERAGE_BUDGET_EXCEEDED` kao HTTP 400. Pozivalac tada mora poslati `originUnitId` filter; filtrirani zahtjev ostaje podržan i bounded.

Odgovor sadrži `resourceBudget` manifest (`maximumItems`, `maximumBytes`, `maximumDurationMs`, stvarni `itemCount`, `estimatedBytes`, `limited`). `RoutingService` dodatno emituje strukturirani `routing.coverage.completed` operativni događaj sa trajanjem, brojem itema, bajtovima i informacijom da li je budget skratio stranicu.

## Izvršivi dokaz

Large-tree test sa 123 OU-a i pet servisa potvrđuje:

- prva stranica ostaje ispod 500 itema i 1 MB;
- rezultat se prekida na kompletnoj granici četvrtog servisa;
- naredni cursor vraća samo peti servis;
- nema duplikata niti gubitka servisnog reda.

Drugi test sa više od 500 OU-ova potvrđuje stabilni HTTP 400 za nefiltrirani pojedinačni servis te uspješan bounded rezultat nakon `originUnitId` filtera.

## CI dokaz

CI `40401904911` je potpuno zelen: backend build/lint/svi testovi, PostgreSQL/Redis integration, frontend build/lint/svi testovi, docs guard, container/supply-chain i završni CI gate su prošli. Puni E2E critical flow nije pokrenut jer paket ima ciljane backend dokaze i ne treba trošiti Gmail SMTP limit.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release radnju.

## Ishod

`BA-routing-09` je zatvoren. Registar prelazi na **628 otvorenih / 64 zatvorena / 692 ukupno**.
