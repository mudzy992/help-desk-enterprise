# BA-on-call-13: identični pending swap zahtjevi se odbijaju, broj otvorenih je ograničen

Status: **zatvoreno** (operativna potvrda korisnika: sve DA — prvi zahtjev prolazi, identičan drugi odbijen porukom o duplikatu bez novog reda, kolega dobio jednu notifikaciju). Zahtjev za zamjenu mogao se slati neograničeno puta s istim kolegom, rasporedom i intervalom; svaki je pravio novi pending red i novu notifikaciju kolegi (spam), a lista podnosioca mogla je rasti bez granice.

## Izmjena

Bez migracije. `requestSwap` sada u SERIALIZABLE transakciji (isti obrazac kao swap accept, BA-on-call-05) prije upisa provjerava: (1) semantički duplikat — pending red s istim rasporedom, podnosiocem, kolegom i intervalom → nova greška `ON_CALL_SWAP_DUPLICATE` (HTTP 409); (2) granicu otvorenih zahtjeva po podnosiocu — `onCallLimits.maxPendingSwapRequests = 50` → `ON_CALL_SWAP_LIMIT_REACHED` (HTTP 429). SERIALIZABLE izolacija zatvara race između dvaju istovremenih identičnih zahtjeva. Frontend obje greške mapira na razumljive poruke (bs/en).

## Testovi i granice

Novi `on-call.service.swap-dedupe.spec.ts` (4 testa): duplikat se odbija bez upisa i notifikacije, upit koristi tačan raspored/par/interval, granica od 50 odbija daljnje zahtjeve, a regularan zahtjev prolazi unutar SERIALIZABLE transakcije. Postojeći swap harness je dobio `findFirst`/`count` mockove. Lokalno on-call suite: 16 suiteova / 68 testova; frontend format/lint/build i i18n provjere prolaze.

## CI dokaz

Implementacija je pushana u commitima `d3ba32b`, `ed7d919`, `0b4b804` i `27a1fc7` (prvi CI krugovi pali su na tipskoj grešci — izgubljeni paralelni edit u konstantama, zatim nepostojeći `TooManyRequestsException` u ovoj verziji Nesta; ispravljeno codebase obrascem `HttpException` + `HttpStatus.TOO_MANY_REQUESTS`). Završni GitHub Actions CI run [`42908631348`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42908631348) za commit `27a1fc7` završio je **success**: Detect changes, Docs guard, Frontend build + test, Backend build + test (generated Prisma), Backend container + supply chain i Backend PostgreSQL + Redis integration. Nalaz ostaje otvoren do operativne potvrde.
