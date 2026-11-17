# Package closeout — W7.30

**Paket:** W7.30 — `BA-problems-12` kanonski audit za claim i general update<br>
**Nalaz:** `BA-problems-12` (P2) — zatvoren<br>
**Kodni commit:** `c3230db`<br>
**Finalni testani SHA:** `c3230db`<br>
**CI:** [`44184591069`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44184591069) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit 23 §7: `create`, `changeStatus`, auto-close, KB članak i handoff pišu kanonski `AuditLog`
red, ali **general update i claim** su pisali samo `ProblemEvent`. Zato promjena vlasnika, OJ,
servisa, impacta/urgencyja/prioriteta ili RCA kategorije nije bila u audit logu, iako je promjena
statusa bila. To je forenzički i compliance gap: audit log je jedini globalni, OU-particionirani i
tamper-evident zapis, a problemska historija je vidljiva samo kroz problemski scope.

Acceptance ovog paketa:

1. general update i claim moraju ostaviti **kanonski** `AuditLog` red sa istim actor/scope dokazom
   kao `create`/`changeStatus` — top-level `organizationalUnitId`, `entityType = problem`,
   `actorUserId` stvarnog izvršioca i `ou:<id>` chain particija;
2. audit metadata mora razlikovati **forenzičke podatke** (koja polja, koje reference, koji
   prioritet) od **osjetljivog sadržaja** (description, RCA, workaround, resolution, rješenje):
   sadržaj se nikad ne kopira u audit, bilježi se samo naziv polja;
3. audit red i promjena problem reda moraju biti **jedna** transakcija;
4. bez migracije i bez promjene javnog API ugovora.

Odluka o susjednim nalazima: audit 23 §7 istovremeno opisuje da DB provenance trigger
(`20271025140000_audit_scope_provenance`) drži whitelist problem akcija. Dvije nove akcije ulaze u
kod-registar, ali ne i u DB whitelist; to je odvojen, usko opisan nalaz `BA-problems-20` (P2) koji
traži vlastitu, izričito odobrenu migraciju. Ovaj paket ga **ne** rješava i ne tvrdi da je rješen.

## Implementacija

- **Nove kanonske akcije** (`audit-log.constants.ts`, `audit-action-schema-registry.ts`,
  `audit-action-scope-registry.ts`, `audit-action-compatibility-registry.ts`):
  - `problem.updated` — schema `pseudonymous`, dopušteni ključevi su `changedFields`, `textChanged`
    i `previous*/to` parovi za `ownerUserId`, `organizationalUnitId`, `serviceId`, `impact`,
    `urgency`, `priority`, `rootCauseCategory`;
  - `problem.claimed` — schema `pseudonymous`, dopušteni ključevi su `ownerUserId` i
    `previousOwnerUserId`.
  Obje su scope `entity` i kompatibilne isključivo sa entitetom `problem`, pa centralna
  `prepareAuditEntry` politika odbija svaki drugi entity ili nedostajući OU.
- **Metadata politika** (`problem-audit.ts`): `problemUpdateAuditMetadata` nikad ne prima vrijednosti
  tekstualnih polja. `changedFields` nosi nazive svih promijenjenih polja, `textChanged` nazive
  promijenjenog slobodnog teksta (`description`, `rootCause`, `rcaWhys`, `workaround`, `resolution`),
  a `previous*`/trenutna vrijednost se upisuje samo za reference i klasifikacije. `title` se pojavljuje
  isključivo kao naziv polja. `problemClaimAuditMetadata` nosi samo `ownerUserId` i
  `previousOwnerUserId`.
- **Transakcijska granica** (`problems.service.ts`): `recordAuditEntry` se poziva **unutar** postojeće
  `update`/`claim` `$transaction`, poslije `problemEvent.create` i poslije `problem.updateMany`
  version predicate, tako da pad audita poništava i promjenu i event. Claim zadržava rani izlaz kada
  je actor već vlasnik: nema promjene, nema eventa i nema audit reda.
- **OU scope**: update koristi odredišnu OJ kada se problem pomjera (`data.organizationalUnitId`), u
  svim ostalim slučajevima trenutnu OJ problema; claim uvijek trenutnu OJ. Red se zato uvijek
  particionira u `ou:<stvarna OJ problema>`.
- **Frontend**: `knownAuditActions` dobija `problem.updated` i `problem.claimed` (bs: „Problem —
  izmijenjen“, „Problem — preuzet u obradu“), katalog metadata polja dobija nova polja
  (`changedFields`, `textChanged`, `previous*` i nazive problemskih tekstualnih polja), a `values`
  dobija zatvorene vokabulare `priority`/`urgency`/`impact`. `AuditMetadataList` sada prevodi i
  **liste naziva polja**: vrijednost se tretira kao lista samo kada je **svaki** njen dio poznato
  polje, pa slobodan tekst sa zarezom ostaje netaknut.
- **Nije obuhvaćeno**: promjena grupe ostaje isključivo handoff komanda (W7.28) sa svojim audit
  akcijama; `problem.updated` se ne emituje za status (to ostaje `problem.status_changed`) ni za
  linkove (vlastite akcije/event). DB provenance whitelist ostaje `BA-problems-20`.

## Direktni testni dokaz

- `backend/src/modules/problems/problems-audit-scope.spec.ts` — 10 testova. Novi:
  - general update piše `problem.updated` sa `organizationalUnitId: ou-1`, `chainPartition: ou:ou-1`,
    `actorUserId` i metadata koji sadrži `changedFields` (`urgency`, `priority`, `description`),
    `textChanged`, `urgency`/`previousUrgency`; serijalizovani metadata **ne sadrži** ni novi ni stari
    tekst opisa (dokaz minimizacije);
  - premještanje u drugu OJ piše red u **odredišnoj** particiji (`ou-2`) sa
    `previousOrganizationalUnitId: ou-1`;
  - update koji ništa ne mijenja ne piše audit red;
  - claim piše `problem.claimed` sa `ownerUserId`/`previousOwnerUserId` u istoj transakciji kao
    `problem.updateMany`.
- `backend/src/modules/audit-log/audit-event-policy.spec.ts` — nove akcije prolaze allowlist i
  schema verziju; novi test dokazuje da `problem.updated` **odbija** `description`, `rootCause`,
  `resolution`, `workaround`, `rcaWhys` i `title` kao metadata ključeve
  (`AUDIT_METADATA_FIELD_NOT_ALLOWED`), a prihvata njihove nazive u `changedFields`/`textChanged`.
- `frontend/src/i18n/admin-ops-i18n-coverage.spec.ts` — katalog akcija i entiteta frontenda mora biti
  **tačno jednak** backend registru, a svaka akcija, polje i zatvoreni vokabular imaju bs/en labelu;
  bez novih labela suite pada.
- `frontend/src/components/admin/audit-metadata-list.spec.tsx` — lista naziva polja se prevodi
  (`field:description, field:ownerUserId`), a rečenica sa zarezom ostaje nepromijenjena.
- Uz to: cijeli `src/modules/problems` + `src/modules/audit-log` lokalno (256 testova) i cijeli
  frontend suite u CI-ju.

## CI i testni dokaz

CI run [`44184591069`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44184591069) na
`c3230db`:

- **Backend:** generisani Prisma client, build/lint, safety-net/wiring/SLA matrica, pun Jest — svi
  uspješni, bez izmjena u test harnessu.
- **PostgreSQL/Redis integration:** uspješno, uključujući audit chain i provenance suiteove.
- **Frontend:** lint/format/testovi (455 fajlova, 1789 testova)/build/budget — uspješno.
- **Docs guard / container + supply chain / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install
  wizard` — workflow ih preskače za ovaj tip izmjene.
- **Neuspjeli pokušaji:** nema; prvi run je bio zelen.

Lokalno: `npx jest` ciljano (problems + audit-log, 19 suiteova / 256 testova), `npx vitest run`
cijeli frontend (455 fajlova / 1789 testova), `npx tsc -b`, `npx eslint` (backend i frontend
izmijenjeni fajlovi), `npx prettier --check` na izmijenjenim fajlovima, `check-backend-wiring.mjs`
(99 controllera / 631 ruta) i `check-migration-policy.mjs` (118 migracija).

## Registar nalaza

- Zatvoreni: `BA-problems-12` (P2) — acceptance dokazan testovima i zelenim CI-jem.
- Novi: `BA-problems-20` (P2) — DB provenance trigger whitelist ne pokriva `problem.updated` i
  `problem.claimed`.
- Ostaju otvoreni u ovom auditu: `BA-problems-13`, `14`, `15`, `16`, `17`, `18`, `19`, `20`.
- Kontrolni zbir: source/plan **442 otvorena / 253 zatvorena / 695 ukupno**; ovaj registar **452/243**;
  Val 7 **32/110** (78 otvorena: 13 P1 / 45 P2 / 20 P3); `problems` **12/20** (8 otvorena: 0 P1 /
  5 P2 / 3 P3).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene: dvije akcije su kod-registar, a njihovi redovi koriste
postojeću `AuditLog` šemu. Redoslijed rollouta je standardni redeploy API/worker imagea; frontend
labela je aditivna, pa stariji frontend samo prikaže generički „Dopunski detalj“ za nova polja.
Rollback je vraćanje prethodnog imagea — novi audit redovi ostaju u lancu i čitljivi su i poslije
rollbacka, jer su akcije zapisane kao podaci, ne kao kod.

**Ručni operativni korak:** nema (nema migracije). `BA-problems-20` će, kada bude odobren, tražiti
`CREATE OR REPLACE FUNCTION "enforce_audit_scope_provenance"` sa dvije nove akcije u problem grani —
to je migracija i namjerno nije dio ovog paketa.

## Sljedeći paket

**W7.31 — `BA-problems-13` (P2):** stable idempotent occurrence key za owner/group/status
notifikacije, bez oslanjanja na vrijeme nastanka. Nije započet prije zelenog gatea za ovaj paket.
