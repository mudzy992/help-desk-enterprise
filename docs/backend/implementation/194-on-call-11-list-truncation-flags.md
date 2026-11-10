# BA-on-call-11: liste zamjena/zahtjeva prijavljuju skraćenje (hasMore)

Status: **otvoreno**. Detalj grupe je zamjene rezao na 200, a pending zahtjeve na 100; `mySwaps` na 50 — bez ikakve naznake da lista nije potpuna, pa je duža historija tiho nestajala iz UI ugovora.

## Izmjena

Backend sada dohvaća jedan red viška i vraća eksplicitne zastavice: detalj nosi `overridesHasMore`/`swapsHasMore` (liste i dalje ograničene na 200/100), a `GET /on-call/swaps` uz `swaps` vraća i `hasMore` (limit 50). Frontend zastavice prikazuje kao napomenu „Prikazuje se samo prvih {{limit}} zapisa; lista je duža od prikaza" (bs/en) ispod zamjena i pending zahtjeva u detalju grupe te ispod vlastitih zahtjeva. Puna keyset paginacija nije uvedena — ugovor sada pošteno signalizira skraćenje umjesto da ga skriva; paginacija se može dodati kasnije bez promjene oblika odgovora.

## Testovi i granice

Novi backend spec pokriva `mySwaps` (51 red → 50 + `hasMore`) i detalj (201/101 red → 200/100 + obje zastavice); frontend build i lint prolaze. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
