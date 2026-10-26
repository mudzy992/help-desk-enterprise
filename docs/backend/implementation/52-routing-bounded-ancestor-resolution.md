# W5.25 — Bounded OU ancestor resolution

**Finding:** `BA-routing-06`  
**Implementacija:** `4a2dce0`  
**CI:** `40381960475` — zelen

## Problem

Svaki ticket routing resolve/preview poziv učitavao je cijelu `OrganizationalUnit` tabelu, gradio globalnu mapu u memoriji i tek zatim hodao ancestor lancem. Trošak jednog resolvea zato je rastao sa ukupnim brojem OU redova, iako je za odluku potreban samo origin i njegov parent lanac.

## Implementirani ugovor

`loadOrganizationalUnitAncestors` sada počinje od `originUnitId` i radi selektivni `findUnique({id})` za trenutni OU, zatim isključivo slijedi njegov `parentId` do roota. Funkcija više nema `findMany` niti globalni OU scan.

Svojstva:

- broj DB lookupova jednak je stvarnoj dubini ancestor lanca;
- svaki lookup bira samo `id`, `parentId` i `ouPath`;
- nepoznat origin završava nakon jednog lookupa sa `ORIGIN_UNIT_NOT_FOUND`;
- cycle zaštita ostaje kroz visited ID skup;
- hard depth budget je 256 i fail-closed vraća `UNAVAILABLE` sa porukom `ROUTING_ANCESTOR_DEPTH_EXCEEDED` umjesto neograničenog rada.

Batch coverage/activation putevi koji svjesno obrađuju cijelu matricu i dalje koriste in-memory `walkOrganizationalUnitAncestors`; korekcija cilja hot-path pojedinačnog ticket resolve/previewa iz nalaza.

## Izvršivi dokaz

Testovi dokazuju:

1. leaf → child → root koristi tačno tri `findUnique` poziva i nijedan `findMany`;
2. lanac dubine 12 uz dodatnih 10.000 nepovezanih OU fixturea i dalje koristi tačno 12 lookupova;
3. missing origin koristi jedan lookup;
4. dubina iznad 256 fail-closed završava tačno na definisanom budžetu.

Postojeći routing resolution suiteovi i puni CI potvrđuju očuvanu exact/parent-fallback/unrouted semantiku.

## CI dokaz

CI `40381960475` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-06` je zatvoren. Registar prelazi na **631 otvoren / 61 zatvoren / 692 ukupno**.
