# Implementacijski checkpoint — `BA-service-catalog-15`

**Nalaz:** `BA-service-catalog-15` (P3) — kritična concurrency/security/config test matrica nije izvršiva ni kompletna.<br>
**Status:** otvoren; BA-09 runner-gap je popravljen i validiran kroz candidate CI, ali Perf smoke je pao na nepovezanim search/ticket-message pragovima.<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Početak:** 2026-11-03, nakon BA-14 closeouta u [closeoutu 120](120-service-catalog-14-incident-read-fail-closed.md).<br>
**Schema / ciljna baza:** nema schema promjene ni pristupa ciljnoj bazi. Ako se izvršava PostgreSQL matrica, koristiti samo izolovane disposable CI baze.

## Nalaz i granice

Audit je zabilježio kritične testne dimenzije: concurrency raceovi, immutable ticket/form granica, security/permission i regex odbijanja, config snapshot/rollback invariante, downtime reconciliation, routing/install/ticket integracije, failure/retry ponašanje i large-catalog budžeti. Istorijski audit pokušaj od 2026-10-23 imao je 4/23 suitea passed, 19/23 compile-blocked zbog nedostajućeg generated Prisma Clienta/enuma/delegata i 15/15 izvršenih testova passed. To je **historijski baseline**, ne aktuelni rezultat.

BA-14 je zatvoren zasebno. BA-15 se bavi dokazivom izvršivošću/pokrivenošću service-catalog test matrice, a ne implicitnim ponovnim otvaranjem BA-01–14. BA-routing-02, BA-changes-08/13, spec 56 i drugi moduli ostaju izvan scopea. Ako assertion audit otkrije reproducibilan runtime nedostatak, taj nalaz se ne implementira kao nuspojava ovog test-matrix paketa.

## CI baseline i stvarni runner gap

CI run [`41731202528`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41731202528) na remote SHA `57191cec85662d7e9125fce8741e8593af2ed968` bio je **success** za generated-Prisma backend build/lint/full Jest, PostgreSQL/Redis integration, frontend, container/supply-chain, Docs guard i CI gate. To je prethodni, već push-an baseline — **nije** CI nad BA-15 radnim stablom.

Coverage poređenje otkrilo je konkretan izvršivosti propust:

- `backend/src/modules/service-catalog` ima **7** `.integration.spec.ts` fajlova.
- Prije ove izmjene `backend/scripts/run-isolated-integration.mjs` registrovao je samo **6/7**; nedostajao je `service-catalog-optimistic-concurrency.integration.spec.ts` (BA-09, dva real-PostgreSQL CAS/race slučaja).
- Test taj fajl uslovljava sa `PRIVACY_IT_DATABASE_URL` (`describe.skip` kad varijabla nedostaje). CI backend unit/Jest job postavlja samo placeholder `DATABASE_URL`; stvarni `PRIVACY_IT_DATABASE_URL` postoji u odvojenom PostgreSQL integration jobu, koji izvršava samo registrovane suiteove. Zbog toga prethodni zeleni CI **nije izvršio** ovaj BA-09 PostgreSQL suite.

Radna izmjena sada registruje nedostajući suite i dodaje dinamički harness guard: svi `.integration.spec.ts` fajlovi unutar service-catalog moraju biti u izolovanom PostgreSQL registryju. Tako budući novi integration fajl ne može tiho ostati izvan CI runnera. Trenutna lokalna provjera vidi **7/7** service-catalog integration fajlova registrovanih. Ovaj fix ne mijenja runtime kod ni status BA-09.

## Row-by-row matrica

| ID | Invarianta / bitni assertioni | Testovi | Runner |
| --- | --- | --- | --- |
| BA-01 | Ticket FK bind i immutable provjera su serijalizovani; status se re-provjerava nakon čekanja | `service-form-version-immutability.integration.spec.ts`; service/forms unit testovi | `npm test` + `npm run test:integration` |
| BA-02 | Config snapshot ne prepisuje ticket-bound historiju; stale hash, identity/reference i illegal transition se odbacuju prije writea | `apply-catalog-snapshot.spec.ts`, `validate-catalog-domain-snapshot.spec.ts`, `apply-catalog-snapshot.integration.spec.ts` | Jest + izolovani PostgreSQL |
| BA-03 | Unsafe/malformed regex se odbacuje prije persistance/evaluacije; UTF-8/aggregate byte caps i adversarial input su pokriveni | `service-form-pattern-safety.spec.ts`, `parse-configured-form-schema.spec.ts`, `validate-service-form-data.spec.ts` | `npm test` |
| BA-04 | Aktivacija poštuje required-vs-optional routing coverage odluku | `service-catalog.routing-coverage.spec.ts`; routing matrix unit/integration suites | Jest + registrovani routing PostgreSQL shard |
| BA-05 | Paralelna activation ostavlja tačno jednu ACTIVE verziju; API/install/config putanje dijele lock | `service-form-version-activation.integration.spec.ts`, `with-service-form-activation-lock.spec.ts` | Jest + izolovani PostgreSQL |
| BA-06 | Paralelno kreiranje prve/novih form version daje stabilan conflict ili jedinstvene sekvencijalne verzije | `service-form-version-create.integration.spec.ts`, `service-forms.service.spec.ts` | Jest + izolovani PostgreSQL |
| BA-07 | Concurrent overlap create/update/change-sync dozvoljava samo nepreklapajuće downtime prozore | `service-downtime-window-overlap.integration.spec.ts`, range/lock unit specs | Jest + izolovani PostgreSQL |
| BA-08 | Opozitni concurrent category reparent ne može napraviti ciklus; parented create uzima graph lock | `service-category-parent-race.integration.spec.ts`, `service-catalog.service.spec.ts` | Jest + izolovani PostgreSQL |
| BA-09 | Isti ETag daje jednog CAS winnera, stale writer dobija 412, a changelog prati samo committed write | `service-catalog-optimistic-concurrency.spec.ts`, `service-catalog-optimistic-concurrency.integration.spec.ts` | Jest + izolovani PostgreSQL; suite je registrovan, a candidate PostgreSQL/Redis CI job je passed; per-suite log detalji nisu dostupni zbog EOF |
| BA-10 | Cursor/envelope, 500-service fixture, scope, row/byte/statement granice i period-bound downtime | `service-catalog-pagination.integration.spec.ts` i pagination unit/service specs | Jest + izolovani PostgreSQL |
| BA-11 | Durable downtime intent je transakcijski; rollback, dedup, retry/dead-letter i reconciliation health su provjereni | `change-downtime-outbox.integration.spec.ts`, `change-downtime-outbox-reconciler.service.spec.ts`, outbox unit specs | Jest + izolovani PostgreSQL |
| BA-12 | Scoped admin ne dobija global create/draft pristup; dedicated permission i service scope se provjeravaju | `service-catalog.authorization-compatibility.spec.ts`, `service-forms.authorization-compatibility.spec.ts`, `service-visible-lifecycles.spec.ts` | `npm test` |
| BA-13 | Human mutation reason je required, normalizovan, proslijeđen i persisted kroz controller/service putanje | `service-catalog-reason-contract.spec.ts`, `service-catalog-reason-controllers.spec.ts`, service tests | `npm test` |
| BA-14 | Missing delegate/DB read failure propagira stabilni 503 umjesto `incidentImpact: null`/healthy payloada | `load-open-incident-impacts.spec.ts`, `map-service-catalog-error.spec.ts`, `service-catalog.service.spec.ts`; frontend API error mapper | backend Jest + frontend Jest |
| BA-15 | Nijedan service-catalog real-DB integration fajl ne može ostati izvan CI registryja | `run-isolated-integration.test.mjs` — dynamic file/registry equality + explicit BA-09 shard check | `npm run test:integration-harness` |

Prethodni CI `41731202528` je **passed** samo za tada registrovane suiteove i nije izvršio nedostajući BA-09 integration suite. Candidate CI `41779289336` na SHA `2ba0e39c60eee22eac0eb5f7c1b08051ca667c76` je **success**; job `Backend PostgreSQL + Redis integration` i korak `Run real PostgreSQL integration suites` su **passed** nakon dodavanja runner entryja i 7/7 registry guarda. GitHub job-log preuzimanje je vratilo `EOF`, pa se ne navodi zaseban assertion/test-case count za BA-09.

## Provjere nad radnim stablom

**Passed lokalno:**

- `cd backend && npm run test:integration-harness` — **4/4 passed**, uključujući novi 7/7 discovery/registry guard.
- `cd backend && npx eslint scripts/run-isolated-integration.mjs scripts/run-isolated-integration.test.mjs` — **passed**.
- `node --check` nad oba izmijenjena runner fajla — **passed**.
- `git diff --check` — **passed**.

Lokalno nisu dostupni Docker/Podman, PostgreSQL/`psql`, Redis server ili `k6`; `DATABASE_URL`, `PRIVACY_IT_DATABASE_URL` i `REDIS_URL` nisu postavljeni. Zato ovdje nije izvršen real-PostgreSQL BA-09 suite niti lokalni Perf smoke. Prisma generation se ne pokušava ponavljati: prethodni TLS/schema-engine dead end je evidentiran u BA-14 closeoutu.

## Candidate CI/Perf validacija

Korisnik je izričito odobrio validacijski commit/push samo na ovoj Arena grani radi remote provjere. Kandidat je SHA `2ba0e39c60eee22eac0eb5f7c1b08051ca667c76`.

- CI [`41779289336`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41779289336) na istom SHA-u završio je **success**. Backend build/full Jest, PostgreSQL/Redis integration (uključujući `Run real PostgreSQL integration suites`), frontend, docs guard, container/supply-chain i CI gate su **passed**. Read-only service-form inventory, E2E critical flows, E2E install wizard i conditional high/critical image-enforcement korak bili su **skipped**, ne passed; nema E2E/spec 56 sign-offa. GitHub log download je vratio `EOF`, pa se ne prijavljuje zaseban test-case count za BA-09, iako je suite registrovan u kandidatu i integration job prošao.
- Perf [`41779289337`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41779289337) na istom SHA-u je **failure**: `ticket_message_duration` p95 `1246.30 ms` prema `<1000 ms` i `search_duration` p95 `557.34 ms` prema `<500 ms` nisu prošli. Service-catalog p95 `75.44 ms` prema `<500 ms`, contract failures `0` i query-budget avg `2.094` prema `2.1` su **passed**. Search/ticket-message pragovi su izvan BA-15 scopea i ostaju nepromijenjeni.
- Ručni `workflow_dispatch` pokušaj je odbijen sa HTTP **403 `Resource not accessible by integration`**, ali push je automatski pokrenuo navedeni Perf run. `gh run rerun 41779289337 --failed` je odbijen porukom da se run ne može rerunati; novi pokušaj nije kreiran.

**Status:** BA-15 ostaje **otvoren**, jer Perf nije green. CI workflow conclusion je success uz eksplicitno navedene skipove; Perf je izvršen i pao, ne skipped niti passed. Ne mijenjati druge nalaze, BA-routing-02, search/ticket-message kod ili pragove. Nema pristupa target DB-u, migracije nad ciljnom bazom, PR-a, mergea, deploymenta ni dodatnog commit/pusha nakon validacijskog SHA-a.
