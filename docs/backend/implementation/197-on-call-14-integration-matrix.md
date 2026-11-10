# BA-on-call-14: service/concurrency/revocation integracijska matrica

Status: **otvoreno**. Direktni service specovi (BA-on-call-01…13) pokrivaju scope, swap interval/accept revalidaciju, owner eligibility, iCal autorizaciju, scheduler/retention ponašanje i truncation kroz mockove, ali konkurencija nad stvarnom bazom (SERIALIZABLE dedupe race, schedule-save CAS race) i revokacija nad stvarnim redovima nisu imali integracijski dokaz, a E2E 44 je provjeravao samo pozitivan schedule tok.

## Izmjena

Bez promjene produkcijskog koda. Novi `backend/src/modules/on-call/on-call.integration.spec.ts` (registrovan u `run-isolated-integration.mjs`, izvršava se u CI PostgreSQL poslu) nad stvarnom bazom dokazuje: (1) sekvencijalni identični pending swap odbijen je kao duplikat i ostaje tačno jedan red; (2) dva konkurentna identična swapa daju tačno jednog pobjednika i jedan pending red; (3) dva konkurentna spremanja rasporeda s istom `expectedUpdatedAt` revizijom daju jednog pobjednika i jedan `ON_CALL_SCHEDULE_CONFLICT`; (4) iCal feed radi, opoziv tokena briše red, ostavlja audit zapis `oncall.calendar_token.revoked` i feed nakon toga vraća null; (5) uklanjanje `oncall.read` permisije gase feed i nakon vraćanja permisije. E2E 44 dobio je revokacijski scenarij: rotacija tokena → javni feed 200 → opoziv → feed 404.

## Testovi i granice

Lokalno (bez baze) integracijski spec se preskače po `describeIfDatabase` obrascu kao i ostali; on-call unit suite 16/68 prolazi, runner testovi prolaze, E2E TypeScript provjera prolazi. Migracija nije rađena.

## CI dokaz

Implementacija je pushana u commitima `5135b91` i `020370f` (prvi CI `42915498694` pao je samo na revokacijskom slučaju: brisanje same `oncall.read` dozvole nije potpuna revokacija jer i `oncall.manage` daje čitanje — test sada uklanja obje dozvole). Završni GitHub Actions CI run [`42916845757`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42916845757) za commit `020370f` završio je **success**: Detect changes, Docs guard, Frontend build + test, Backend build + test (generated Prisma), Backend container + supply chain i Backend PostgreSQL + Redis integration (uključuje novu on-call matricu, 5/5). E2E 44 proširenje se izvršava u E2E poslovima van ovog push CI-ja. Nalaz ostaje otvoren do operativne potvrde.
