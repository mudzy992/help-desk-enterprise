# W6.40 — `BA-inbound-email-03`: globalni pristup i zadana redakcija inbound-email admin statusa

**Status:** `BA-inbound-email-03` zatvoren na finding nivou nakon zelenog CI; puna inbound-email §15/module acceptance ostaje pending.  
**Scope:** samo Val 6 P1 `BA-inbound-email-03`. P2/P3, preostali P1 i BA-15 acceptance nisu uključeni.  
**Datum:** 2026-10-29

## Problem i korekcija

`GET /admin/inbound-email/status` vraćao je mailbox-wide history sa sender, subject, ticket i error metapodacima. `POST /admin/inbound-email/test-connection` koristio je isti globalni connector. Baseline je štitio controller ADMIN rolom, ali nije dokazivao da je grant globalan; scoped ADMIN je zato mogao pristupiti podacima izvan svog OU/service scopea, a dopušteni globalni operatori dobijali su nepotrebne PII i sirove connector greške.

`InboundEmailAdminController` zahtijeva `permissionKeys.settingsRead` (`settings.read`) na nivou cijelog controllera, uz postojeće `ADMIN` role i canonical `SessionAuthenticationGuard`/`RoleGuard`. Pošto `settings.read` nije scope-agnostic, OU- ili service-scoped assignment ne zadovoljava globalni zahtjev i authorization se zaustavlja prije ulaska u servis. Isto pravilo važi za status i connection-test. Globalni ADMIN sa unscoped `settings.read` zadržava mailbox-wide status, brojače i ticket reference; nije dodana nova permission key, query scope, schema ni migracija.

Defaultna redakcija je server-side. Recent status query više ne bira `fromAddress` ni `subject`, a response za te vrijednosti vraća samo `[redacted]`. Sačuvani `state.lastError` mapira se na isti marker, a test-connection vraća stabilni `CONNECTION_FAILED` kod umjesto provider exception teksta. UI prikazuje lokalizovanu oznaku redakcije i generičke greške; ni status, test-connection ni client-side catch grane ne prikazuju sirove sender/subject/error detalje. Message bodies se nikada ne vraćaju.

## Testovi i provjera

`backend/src/modules/inbound-email/inbound-email-admin.controller.authorization.spec.ts` pokriva:

1. session guard i canonical `RoleGuard` wiring za oba endpointa;
2. deny OU-scoped i service-scoped ADMIN grantova na oba globalna endpointa;
3. allow globalnom ADMIN-u koji ima `settings.read`;
4. deny ADMIN-u bez `settings.read` i non-ADMIN-u, čak i kad ima taj permission.

Novi `backend/src/modules/inbound-email/inbound-email-admin.service.spec.ts` provjerava da response ne sadrži raw sender, subject, sačuvani error ni connector exception detalje, te da Prisma recent query uopće ne selektuje sender/subject kolone. Lokalno su ciljana dva backend suitea prošla **6/6** uz ts-jest type-diagnostics isključen, jer lokalno nije bio dostupan generisani Prisma client. Ciljani backend ESLint/Prettier, frontend ESLint, i18n paritet i frontend TypeScript build check prošli su. Konačni CI je generisao Prisma client i prošao standardni backend build i full Jest suite.

Finalni kodni SHA [`8c0ba54`](https://github.com/mudzy992/help-desk-enterprise/commit/8c0ba54a1718c5217db1694a366af8f05adbed31) i CI [`42509394030`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42509394030) su **success**. Passed: Detect changes, Docs guard, Backend container + supply chain, Frontend build + test, Backend PostgreSQL + Redis integration, Backend build + test i CI gate. `Read-only service-form pattern inventory`, E2E install wizard i E2E critical flows bili su `skipped`, ne passed; conditional `Enforce zero high/critical image vulnerabilities` korak također je bio `skipped`.

## Granice i preostali scope

- Nije korištena target baza ni mailbox, nije pokretana migracija, PR, merge ili deployment.
- `BA-inbound-email-01` je zatvoren samo za novi recovery path; legacy attempti bez phase/lease dokaza ostaju za operator reconciliation.
- `BA-inbound-email-02` je zatvoren za checker/configuration kod; stvarni Graph/Exchange/IMAP receiver i header-sanitization trust nije operativno potvrđen.
- Puna §15/module acceptance i BA-15 full critical-flow acceptance ostaju pending.
- Preostali Val 6 P1: `BA-on-call-01/02/03` i `BA-announcements-01/02/03/04`. P2/P3 ostaju van scopea.

Nakon ovog closeouta Val 6 je **44/109 zatvorenih, 65 otvorenih (7 P1 / 41 P2 / 17 P3)**. Izvorne audit-tabele/generisani plan imaju **517 otvorenih / 175 zatvorenih**; globalni registar **527 otvorenih / 165 zatvorenih**. Deset ranijih statusnih razlika nije rekoncilirano.
