# Početni implementacijski checkpoint — `BA-service-catalog-15`

**Nalaz:** `BA-service-catalog-15` (P3) — kritična concurrency/security/config test matrica nije izvršiva ni kompletna.<br>
**Status:** otvoren; BA-15 je započet kroz coverage inventory i acceptance plan — nalaz nije zatvoren.<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Početak:** 2026-11-03, nakon BA-14 closeouta u [closeoutu 120](120-service-catalog-14-incident-read-fail-closed.md).<br>
**Schema / ciljna baza:** nema schema promjene ni target-DB pristupa. Ako bude potrebno izvršiti DB testove, koristiti samo disposable CI/test bazu; ne pokretati migracije nad ciljnom bazom.

## Nalaz i granice

Audit je zabilježio kritične testne dimenzije: concurrency raceovi, immutable ticket/form granica, security/permission i regex odbijanja, config snapshot/rollback invariante, downtime reconciliation, routing/install/ticket integracije, failure/retry ponašanje i large-catalog budžeti. Istorijski audit pokušaj od 2026-10-23 imao je 4/23 suitea passed, 19/23 compile-blocked zbog nedostajućeg generated Prisma Clienta/enuma/delegata i 15/15 izvršenih testova passed. To je **historijski baseline**, ne aktuelni rezultat.

BA-14 je zatvoren zasebno. BA-15 se bavi dokazivom izvršivošću i pokrivenošću test matrice, a ne implicitnim ponovnim otvaranjem BA-01–14. BA-routing-02, BA-changes-08/13, spec 56 i druge susjedne stavke ostaju izvan scopea. Ako matrica otkrije reproducibilan runtime nedostatak, prvo ga evidentirati zasebno i ne širiti ovaj test-only scope bez odobrenja.

## Trenutni executable baseline

Finalni BA-14 CI [`41728680530`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41728680530) na SHA `7dd9c05c1655f1c5ce0dee881cfbee037b9c5028` je **success** za generated-Prisma backend build/lint/full Jest, PostgreSQL/Redis integration, frontend, docs, container/supply-chain i CI gate. Time je trenutna backend test infrastruktura izvršena u CI sa generisanim Prisma Clientom; to samo po sebi ne dokazuje da svaka matrix stavka ima očekivani test ili da su svi concurrency/security/config slučajevi pokriveni. Reproducibilni runneri su `cd backend && npm test` (Jest) i `cd backend && npm run test:integration` (izolovani PostgreSQL/Redis integration runner); koju matricu stavku koji runner mora izvršiti provjerava se u ovom nalazu.

Trenutni inventory u `backend/src/modules/service-catalog` sadrži **44 `*.spec.ts` fajla**: **37 unit/service** i **7 `.integration.spec.ts`**. Candidate PostgreSQL integration fajlovi su:

- `service-catalog-optimistic-concurrency.integration.spec.ts`
- `service-catalog-pagination.integration.spec.ts`
- `service-category-parent-race.integration.spec.ts`
- `service-downtime-window-overlap.integration.spec.ts`
- `service-form-version-activation.integration.spec.ts`
- `service-form-version-create.integration.spec.ts`
- `service-form-version-immutability.integration.spec.ts`

Dodatni cross-module candidate coverage je u `backend/src/modules/config-versioning/apply-catalog-snapshot.spec.ts`, `apply-catalog-snapshot.integration.spec.ts`, `validate-catalog-domain-snapshot.spec.ts` i `backend/src/modules/changes/change-downtime-outbox-reconciler.service.spec.ts`; routing/auth/form-security coverage uključuje service-catalog, service-onboarding i routing suites. Ovo je početni filename inventory, **ne** row-by-row assertion audit niti acceptance dokaz za svaku invariante.

## Početna matrix mapa — pokrivenost se još provjerava

| Kritična dimenzija | Kandidatni postojeći testovi / runner | Poznati CI status | BA-15 status |
| --- | --- | --- | --- |
| Form version activation/create i immutable ticket race | `service-form-version-activation.integration.spec.ts`, `service-form-version-create.integration.spec.ts`, `service-form-version-immutability.integration.spec.ts`; `npm run test:integration` | Backend PostgreSQL/Redis integration job **passed** u `41728680530`; per-case assertion mapping još nije napravljen | **U verifikaciji** |
| Optimistic service/category update, downtime overlap i category cycle | `service-catalog-optimistic-concurrency.integration.spec.ts`, `service-downtime-window-overlap.integration.spec.ts`, `service-category-parent-race.integration.spec.ts` | Integration job **passed**; matrica uslova/interleavings još nije potvrđena | **U verifikaciji** |
| Config snapshot validation/apply/rollback i immutable-form zaštita | Config-versioning unit/integration specs | Full backend Jest + integration job **passed**; test assertion scope/rollback slučajevi tek mapirati | **U verifikaciji** |
| Security, permission/scope i unsafe-form patterni | `service-catalog.authorization-compatibility.spec.ts`, `service-forms.authorization-compatibility.spec.ts`, `service-form-pattern-safety.spec.ts`, related routing/onboarding suites | Full backend Jest **passed**; matrix po caller/scope/failure još nije mapirana | **U verifikaciji** |
| Downtime reconciliation, routing/install/ticket/config parity i failure/retry | Changes outbox, routing, onboarding, install/config/ticket integration candidates | Backend/integration workflow **passed** kao cjelina; pojedinačni parity/failure kriteriji još nisu popisani | **U verifikaciji** |
| Large-catalog query/row/byte limits | `service-catalog-pagination.integration.spec.ts` i pagination unit/service specs | Integration job **passed**; zahtjevi i statement/fixture granice treba prepisati u test matrix | **U verifikaciji** |
| Browser/E2E end-to-end sign-off | Workflow `E2E critical flows`, `E2E install wizard` | Oba joba `41728680530` **skipped**; nije prošlo niti je palo | **Nema E2E sign-offa** |

`Read-only service-form pattern inventory` je također bio **skipped** u `41728680530`. Conditional high/critical image enforcement je **skipped**; container/supply-chain job je kao cjelina **passed**. BA-14 Perf `41727639876` pao je prije k6-a, a Perf na finalnom SHA nije pokrenut; to nije Perf evidence za BA-15. Skip se nigdje ne tretira kao passed.

## Privremeni acceptance kriteriji

1. Row-by-row matrix veže svaku kritičnu invariant/security/config tvrdnju za deterministički test, test layer, tačan runner/komandu i rezultat na SHA-u.
2. Nema testova koji samo compile-checkaju ili prolaze preko nepotpunog Prisma stuba kada acceptance zahtijeva stvarni DB invariant; concurrency raceovi koji zavise od PostgreSQL semantike moraju imati disposable real-PostgreSQL dokaz.
3. CI sa generated Prisma Clientom izvršava matrix testove; nema nevidljivih/isključenih testova niti neobjašnjenog compile-blocked coveragea.
4. Nedostajuće testove dodati u odgovarajući postojeći runner i CI gate. Svaki `passed`, `failure` i `skipped` rezultat bilježiti odvojeno. E2E/spec 56 nije zelen bez stvarnog E2E runa; Performance se ne proglašava bez Perf runa.
5. Findings traceability, docs guard i relevantni backend testovi prolaze; BA-15 ostaje otvoren dok matrix i finalni acceptance nisu dokazani.

## Sljedeći koraci

1. Pročitati assertions (ne samo nazive) postojećih unit, PostgreSQL integration i cross-module testova; povezati svaku BA-service-catalog invariantu i severity claim sa konkretnim test-caseom.
2. Usporediti runner registraciju i workflow uslove sa inventoryjem, uključujući šta se izvršava na pushu, šta samo u dispatchu i šta je conditional/skipped.
3. Utvrditi stvarne uncovered, non-deterministic ili non-executable slučajeve; ne dodavati duplicate tests prije te provjere.
4. Implementirati samo test/runner/fixture gapove iz potvrđene BA-15 matrice, zatim ponoviti odgovarajuće backend/Jest, disposable PostgreSQL integration i CI provjere.

Nema target-DB pristupa ni migracije nad ciljnom bazom; CI integration koristi samo disposable test okruženje. Nema PR-a prema `master`, mergea ni deploymenta. BA-14 ostaje zatvoren; BA-15 ostaje otvoren. Ostali nalazi nisu mijenjani.
