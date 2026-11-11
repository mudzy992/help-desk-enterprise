# W6.44 — `BA-announcements-01`: scoped manage/report authorization

**Status:** `BA-announcements-01` zatvoren na finding nivou nakon push-triggered CI-ja `42527240382` (**success**).  
**Scope:** samo Val 6 P1 `BA-announcements-01`; `BA-announcements-02/03/04`, svi P2/P3 i BA-15 full critical-flow acceptance ostaju izvan ovog closeouta.

## Korekcija

`AnnouncementViewer` sada izvodi i čuva odvojene `manageScope` i `reportScope` iz canonical principal assignments. Postojanje `announcement.manage` ili `announcement.report.read` više se ne tretira kao globalna dozvola. Globalni pristup prolazi samo kroz globalni `AuthorizationService` resource decision (eksplicitan globalni assignment ili lokalni `SUPER_ADMIN`). OU-scoped grant ostaje ograničen na svoj OU podstablo. Service-only grant se za announcements fail-closed jer `Service` nema OU relaciju kojom bi se audience membership mogao ograničiti; ne podiže se na globalni ili OU scope.

Management/report provjere vežu dozvolu za audience resurse preko `AuthorizationService.authorizeResource`. Svaki OU naveden u announcement filteru mora biti dozvoljen; ako audience nema OU filter, scoped manager/report viewer nema pristup. Isto pravilo se primjenjuje na collection list, direct detail i sve lifecycle mutatione, create/update ciljnu publiku, preview, report, CSV i reminder. Lista se filtrira prije acknowledgement agregata, a report/CSV odbijanje se izvršava prije queryja za PII redove. Agent-only home-OU policy ostaje odvojeni fallback, bez proširenja ovog findinga na P2 group/service reference validaciju.

## Testovi i CI

Dodani su testovi za odvojene permission scopeove, explicit global i lokalni SuperAdmin, service-only deny, canonical scope mismatch, OU podstablo i audience koji sadrži nedozvoljen ili nepoznat OU. Service regressions pokrivaju scoped list filter, cross-OU create prije mutation transactiona, odvojeni report grant, unfiltered audience deny te CSV deny prije user/acknowledgement PII queryja.

Lokalno su prošli targeted ESLint i **5/5 Jest suitea, 36/36 testova** (tri nova authorization suites uz postojeće audience/delivery suiteove). Lokalni Prisma Client nije generisan: `prisma generate` nije mogao preuzeti schema engine sa `binaries.prisma.sh`; zato su targeted suiteovi pokrenuti uz privremeni ts-jest `diagnostics:false` config. To nije lokalni generated-Prisma type-check. Push-triggered CI [`42527240382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42527240382) na SHA [`90fc15c655bba90fc8f69ca17f2dc76c6bf67819`](https://github.com/mudzy992/help-desk-enterprise/commit/90fc15c655bba90fc8f69ca17f2dc76c6bf67819) je **success** i izvršio pravi generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain posao i CI gate. Read-only inventory, E2E critical/install i conditional high/critical image enforcement bili su `skipped`, ne `passed`; nisu dispatchani ručno.

## Granice i status

- Nema Prisma schema izmjene ni migracije; ciljna baza nije korištena.
- Nije otvoren PR, izvršen merge ili deployment.
- Nakon W6.44 Val 6 je **48/109 zatvorenih, 61 otvorenih (3 P1 / 41 P2 / 17 P3)**. Izvorni auditi/generisani plan: **513 otvorenih / 179 zatvorenih**; globalni registar: **523 otvorena / 169 zatvorenih**. Deset ranijih statusnih razlika ostaje netaknuto.
- Preostali Val 6 P1 su `BA-announcements-02/03/04`. BA-15 full critical-flow acceptance ostaje pending i izvan scopea.
