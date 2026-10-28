# W6.6 — Bounded i paginirani status-incident timeline readovi

**Finding:** `BA-status-page-06`  
**Implementacija:** `73dfa9d`, korekcija izolacije integracijskog fixturea `f7944af`  
**Finalni CI:** `40773764675` — zelen

## Problem

Overview je listao do 100 aktivnih i 200 historijskih incidenata, ali je za svaki incident nested relation query materijalizovao sve timeline updateove. Broj updateova po incidentu nije ograničen, pa su DB rezultat, memorija i JSON response mogli rasti bez granice. Nije postojao API ugovor kojim klijent može dohvatiti starije updateove u kontrolisanim stranicama.

## Implementacija

- Svaki incident u overview/service/ticket/detail readu sada ugrađuje najviše **20** najnovijih timeline updateova, uz samo jedan dodatni probe red radi izračuna `updatesHasMore`.
- Ugovor incidenta objavljuje `updatesHasMore` i `updatesNextCursor`; cursor pokazuje na posljednji vraćeni embedded update.
- Dodan je autentificirani `GET /status/incidents/:id/timeline` endpoint sa `cursor` i `take` parametrima.
- Default stranica je **50**, validirani maksimum **100**, a query učitava samo `take + 1` redova.
- Poredak je deterministički `createdAt DESC, id DESC`; nastavak koristi Prisma keyset cursor i `skip: 1`, bez rastućeg offseta.
- Timeline endpoint prije čitanja updateova ponovo primjenjuje postojeći resource-aware incident visibility policy. Nevidljiv i nepostojeći incident imaju istu 404 granicu.
- Author lookup radi samo nad ID-evima trenutne bounded stranice; requesterima author ostaje redigovan.
- Public sanitizer eksplicitno prenosi samo bounded timeline i pagination metadata, bez authora i internih polja.
- Frontend API tipovi i client imaju paginirani timeline ugovor za postepeno učitavanje starijih zapisa.
- Wiring manifest je ažuriran na **613 ruta**.

## Testni dokaz

- Direktni unit test potvrđuje `take + 1`, deterministički order, keyset cursor/skip, `hasMore`, `nextCursor`, bounded rezultat i 404 prije timeline queryja za nevidljiv incident.
- Stvarni PostgreSQL test kreira incident sa **25** updateova: embedded detail vraća 20 i cursor, a eksplicitni timeline endpoint vraća tri nepokrivajuće stranice 10 + 10 + 5.
- Isti PostgreSQL test potvrđuje da service-scoped staff bez pristupa incident servisu dobija 404.
- Prvi CI `40772992606` potvrdio je backend build/unit i container shard, ali je otkrio dvije test-fixture greške: novi otvoreni incident je namjerno bio public pa ga foreign staff smije vidjeti, a ostao je otvoren i mijenjao kasniji service availability assertion. Također je frontend Prettier prijavio format.
- `f7944af` je fixture učinio `STAFF_ONLY`, zatvorio ga nakon pagination dokaza i formatirao frontend client.
- Finalni CI `40773764675` potpuno je zelen: backend kompletni suite/build/lint/wiring, stvarni PostgreSQL/Redis shard, frontend build/test/format, docs, container/supply-chain i završni gate.

## Migracije i release

Paket ne mijenja Prisma model i nema novu DB migraciju niti ručnu release DB radnju.

## Ishod

`BA-status-page-06` je zatvoren. Niti jedan incident-list response više ne može materijalizovati neograničen timeline, dok je potpuna historija dostupna kroz bounded, stabilno paginirani i visibility-scoped endpoint. Registar prelazi na **603 otvorena / 89 zatvorenih / 692 ukupno**.
