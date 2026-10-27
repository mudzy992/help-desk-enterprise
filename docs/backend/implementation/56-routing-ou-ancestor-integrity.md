# W5.29 — Fail-closed integritet OU ancestor lanca

**Finding:** `BA-routing-10`  
**Implementacija:** `361c52e`  
**CI:** `40521917956` — zelen

## Problem

Routing resolution i coverage koriste OU ancestor lanac za exact i parent fallback. Walker je ranije tiho prekidao obilazak kada bi naišao na ciklus ili `parentId` koji ne pokazuje na postojeći OU. Oštećen lanac se zato mogao predstaviti kao legitimni korijen i proizvesti `UNROUTED` ili pogrešan fallback umjesto jasnog integrity kvara.

## Implementirani ugovor

Oba ancestor puta sada rade fail-closed:

- DB-backed single-ticket resolution baca `UNAVAILABLE` sa stabilnom porukom `ROUTING_ANCESTOR_CYCLE` kada se ID ponovi;
- missing parent nakon validnog origin OU-a baca `UNAVAILABLE` sa porukom `ROUTING_ANCESTOR_MISSING_PARENT`;
- nepostojeći početni origin zadržava postojeći `ORIGIN_UNIT_NOT_FOUND` ugovor;
- depth budget ostaje 256 i zadržava `ROUTING_ANCESTOR_DEPTH_EXCEEDED`;
- in-memory walker koji koriste coverage i activation evaluacija primjenjuje iste cycle, missing-parent i depth invariants.

Time routing više ne može nastaviti sa parcijalnim ancestor lancem niti korupciju prikazati kao normalan kraj stabla.

## Izvršivi dokaz

Ciljani testovi pokrivaju:

- ispravan leaf → parent → root lanac bez full-table skena;
- nepostojeći origin;
- missing persisted parent;
- dvostrani ancestor ciklus;
- cycle i missing-parent u in-memory coverage walkeru;
- depth-budget fail-closed granicu.

## CI dokaz

CI `40521917956` je potpuno zelen: backend build/lint/svi testovi, PostgreSQL/Redis integracije, frontend build/lint/svi testovi, docs guard, container/supply-chain i završni CI gate su prošli.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release radnju.

## Ishod

`BA-routing-10` je zatvoren. Registar prelazi na **627 otvorenih / 65 zatvorenih / 692 ukupno**.
