# Implementacijski checkpoint — `BA-service-catalog-15`

**Nalaz:** `BA-service-catalog-15` (P3) — kritična concurrency/security/config test matrica nije izvršiva ni kompletna.<br>
**Status:** otvoren; matrica i runner-gap su obrađeni u radnom stablu, ali kandidat još nema remote CI/Perf acceptance.<br>
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
| BA-09 | Isti ETag daje jednog CAS winnera, stale writer dobija 412, a changelog prati samo committed write | `service-catalog-optimistic-concurrency.spec.ts`, `service-catalog-optimistic-concurrency.integration.spec.ts` | Jest + izolovani PostgreSQL; **integration je sada registrovan, kandidatni remote run još čeka** |
| BA-10 | Cursor/envelope, 500-service fixture, scope, row/byte/statement granice i period-bound downtime | `service-catalog-pagination.integration.spec.ts` i pagination unit/service specs | Jest + izolovani PostgreSQL |
| BA-11 | Durable downtime intent je transakcijski; rollback, dedup, retry/dead-letter i reconciliation health su provjereni | `change-downtime-outbox.integration.spec.ts`, `change-downtime-outbox-reconciler.service.spec.ts`, outbox unit specs | Jest + izolovani PostgreSQL |
| BA-12 | Scoped admin ne dobija global create/draft pristup; dedicated permission i service scope se provjeravaju | `service-catalog.authorization-compatibility.spec.ts`, `service-forms.authorization-compatibility.spec.ts`, `service-visible-lifecycles.spec.ts` | `npm test` |
| BA-13 | Human mutation reason je required, normalizovan, proslijeđen i persisted kroz controller/service putanje | `service-catalog-reason-contract.spec.ts`, `service-catalog-reason-controllers.spec.ts`, service tests | `npm test` |
| BA-14 | Missing delegate/DB read failure propagira stabilni 503 umjesto `incidentImpact: null`/healthy payloada | `load-open-incident-impacts.spec.ts`, `map-service-catalog-error.spec.ts`, `service-catalog.service.spec.ts`; frontend API error mapper | backend Jest + frontend Jest |
| BA-15 | Nijedan service-catalog real-DB integration fajl ne može ostati izvan CI registryja | `run-isolated-integration.test.mjs` — dynamic file/registry equality + explicit BA-09 shard check | `npm run test:integration-harness` |

Prethodni CI `41731202528` je **passed** za suiteove koji su tada bili registrovani, kao i full Jest; ne pripisuje se BA-09 integration suiteu koji je nedostajao. Konačni dokaz ove izmjene zahtijeva remote CI koji izvrši novi runner sa svim **7/7** service-catalog PostgreSQL shardova.

## Provjere nad radnim stablom

**Passed lokalno:**

- `cd backend && npm run test:integration-harness` — **4/4 passed**, uključujući novi 7/7 discovery/registry guard.
- `cd backend && npx eslint scripts/run-isolated-integration.mjs scripts/run-isolated-integration.test.mjs` — **passed**.
- `node --check` nad oba izmijenjena runner fajla — **passed**.
- `git diff --check` — **passed**.

Lokalno nisu dostupni Docker/Podman, PostgreSQL/`psql`, Redis server ili `k6`; `DATABASE_URL`, `PRIVACY_IT_DATABASE_URL` i `REDIS_URL` nisu postavljeni. Zato ovdje nije izvršen real-PostgreSQL BA-09 suite niti lokalni Perf smoke. Prisma generation se ne pokušava ponavljati: prethodni TLS/schema-engine dead end je evidentiran u BA-14 closeoutu.

## CI/Perf acceptance blokada i status

`gh workflow run perf-smoke.yml --ref arena/864951a6-help-desk-enterprise` odbijen je sa HTTP **403 `Resource not accessible by integration`**. To nije Perf run, `failure` ni `skipped`; Perf rezultat je **nije pokrenut**. Push workflow uključuje `backend/scripts/run-isolated-integration.*`, pa GitHub CI i Perf mogu validirati ovaj kandidat nakon push-a na aktivnu Arena granu. Korisnik je tražio da ni zvanični commit ni push ne nastupe prije zelenog CI-ja i Perf-a, ali postojeće Action workflowe nije moguće pokrenuti nad necommitovanom lokalnom izmjenom; lokalni real-DB/Perf runneri također nisu dostupni.

Zbog toga BA-15 i dalje ostaje **otvoren**. Ne označavati CI/Perf kao passed za kandidat. Za završetak prema traženom acceptance-u potreban je owner approval za validation push na istoj Arena grani; tek nakon zelenog candidate CI-ja (uključujući svih 7 service-catalog PostgreSQL shardova) i potpuno zelenog Perf smoke-a može se zvanično zatvoriti BA-15. Ne mijenjati druge nalaze, ne koristiti target DB, ne otvarati PR/merge niti deployati.
