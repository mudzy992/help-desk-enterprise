# BA-on-call-11: liste zamjena/zahtjeva prijavljuju skraćenje (hasMore)

Status: **zatvoreno** (operativna potvrda korisnika: sve DA; zabilježeno i kratko treperenje pri prelasku među grupama kao prijelazno stanje učitavanja detalja, bez utjecaja na prikaz). Detalj grupe je zamjene rezao na 200, a pending zahtjeve na 100; `mySwaps` na 50 — bez ikakve naznake da lista nije potpuna, pa je duža historija tiho nestajala iz UI ugovora.

## Izmjena

Backend sada dohvaća jedan red viška i vraća eksplicitne zastavice: detalj nosi `overridesHasMore`/`swapsHasMore` (liste i dalje ograničene na 200/100), a `GET /on-call/swaps` uz `swaps` vraća i `hasMore` (limit 50). Frontend zastavice prikazuje kao napomenu „Prikazuje se samo prvih {{limit}} zapisa; lista je duža od prikaza" (bs/en) ispod zamjena i pending zahtjeva u detalju grupe te ispod vlastitih zahtjeva. Puna keyset paginacija nije uvedena — ugovor sada pošteno signalizira skraćenje umjesto da ga skriva; paginacija se može dodati kasnije bez promjene oblika odgovora.

## Testovi i granice

Novi backend spec pokriva `mySwaps` (51 red → 50 + `hasMore`) i detalj (201/101 red → 200/100 + obje zastavice); frontend build i lint prolaze. Migracija nije rađena.

## CI dokaz

Implementacija je pushana u commitima `7a1f2ad` i `3aa1aaa`; prvi CI (`42881185902`) pao je na frontend poslu isključivo zbog Prettier formatiranja i limita veličine modula (`on-call-page.tsx` 507 > 500 linija) — ispravljeno izdvajanjem napomene u `OnCallTruncationNote` komponentu i formatiranjem (commit `5bcbd9c`). Završni GitHub Actions CI run [`42886623185`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42886623185) za commit `5bcbd9c` završio je **success**: Detect changes, Docs guard, Frontend build + test, Backend container + supply chain, Backend build + test (generated Prisma) i Backend PostgreSQL + Redis integration. Nalaz ostaje otvoren do operativne potvrde.
