# W6.41 — `BA-on-call-01`: OU scope za grupna on-call prava

**Status:** `BA-on-call-01` zatvoren na finding nivou nakon zelenog CI-ja; puna on-call §15/module acceptance ostaje pending.  
**Scope:** samo Val 6 P1 `BA-on-call-01`. P2/P3, `BA-on-call-02/03`, announcements i BA-15 acceptance nisu dio ovog closeouta.  
**Datum:** 2026-10-29

## Problem i korekcija

`onCallViewerFromContext` je ranije svodio `oncall.read/manage` na boolean i gubio OU scope assignmenta. Scoped reader/manager je zato mogao dobiti globalni pristup rasporedima i grupnim informacijama. Sada viewer čuva odvojene read i manage scopeove iz assignmenta; manager može čitati svoje manage-scope grupe, dok read-only grant ne daje pravo upisa. Canonical scope koji nije usklađen sa assignmentom se odbacuje. Service-only grant namjerno ne daje group access jer `Group` nema service relaciju.

`OnCallService` filtrira `overview`, `me` i `mySwaps` po dozvoljenim grupama prije schedule/context upita. Detail, schedule/override create/delete i swap read/write/cancel putanje ponovo provjeravaju konkretnu grupu i njenu trenutnu OU putanju prije čitanja ili izmjene. `oncall.read` i `oncall.manage` se scope-agnostic prosleđuju generičkom `RoleGuard`; autoritativna group OU provjera ostaje u servisu.

Token-based `icalFeed` nije mijenjan: to je zaseban P2, `BA-on-call-07`.

## Testovi i dokaz

Dodani su `on-call-viewer.spec.ts` i `on-call.service.scope.spec.ts` za global/SuperAdmin, OU subtree, service-only, read/manage separation, kolekcijske filtere i direct-ID read/write/swap granice. Ciljane provjere su prvo prošle 7 suitea/39 testova uz dijagnostiku isključenu i 2 suitea/13 testova sa dijagnostikom uključenom, uz ESLint.

Prvi CI [`42514261531`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42514261531) na SHA `986b5d7` prošao je ostale poslove, ali je backend full Jest otkrio tri strict-TypeScript greške u test harnessu. Harness je tipiziran, uklonjena je samoreferenca transaction mocka, a završni targeted scope suite je prošao 12/12 testova uz ESLint.

Finalni SHA [`bd05e0e`](https://github.com/mudzy992/help-desk-enterprise/commit/bd05e0ece040685ba1070971cb00fc7b03ef7341) prošao je CI [`42515632097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42515632097): backend generated-Prisma build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate su `success`. Read-only inventory, E2E install wizard, E2E critical flows i conditional high/critical image-enforcement korak bili su `skipped`, ne `passed`.

## Granice

- Nije korištena target baza, nije dodana ni pokrenuta migracija.
- Nije otvoren PR, izvršen merge ni deployment.
- `BA-on-call-02` (swap interval mora biti requesterova stvarna smjena) i `BA-on-call-03` (concurrent schedule save) ostaju otvoreni P1.
- `BA-on-call-07` i ostali P2/P3 ostaju izvan scopea; BA-15 full critical-flow acceptance i puna on-call §15/module acceptance ostaju pending.
