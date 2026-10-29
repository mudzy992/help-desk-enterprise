# W5.21 — Potpuna routing coverage provjera pri aktivaciji servisa

**Finding:** `BA-routing-02`  
**Implementacija:** `da66f2c`  
**CI:** `40374063956` — zelen

## Problem

Aktivacijski gate je coverage svodio na `routingRule.count({ serviceId }) > 0`. Jedno pravilo za jedan leaf OU zato je označavalo cijeli servis pokrivenim, iako ostali OU-ovi nisu imali exact niti ancestor fallback resolution.

## Implementirani ugovor

Za servis se sada učitavaju svi organizacioni OU-ovi i njegova routing pravila. Svaki OU iz kojeg ticket može poticati mora imati:

1. vlastito exact pravilo; ili
2. pravilo na nekom ancestor OU-u.

Evaluacija vraća `requiredOriginUnitCount` i determinističan `missingOriginUnitIds` skup. `hasCoverage=true` vrijedi samo kada je missing skup prazan. Postojeća politika ostaje očuvana: uz `requireCoverage=true` nepotpuna matrica blokira aktivaciju sa `ROUTING_COVERAGE_MISSING`; uz `false` aktivacija dobija isti eksplicitni warning.

Ugovor pokriva više nezavisnih OU stabala: root pravilo jednog stabla ne pokriva root ili potomke drugog stabla.

## Izvršivi dokaz

Testovi potvrđuju:

- servis bez pravila ima sva tri harness OU-a u missing skupu;
- jedno leaf pravilo ne daje lažno potpunu coverage ocjenu;
- root pravilo pokriva vlastiti root i sve potomke ancestor fallbackom;
- nezavisno OU stablo ostaje eksplicitno nepokriveno;
- required politika blokira, a non-required politika vraća warning.

## CI dokaz

CI `40374063956` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut jer paket nema browser flow.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-02` je zatvoren. Registar prelazi na **635 otvorenih / 57 zatvorenih / 692 ukupno**.
