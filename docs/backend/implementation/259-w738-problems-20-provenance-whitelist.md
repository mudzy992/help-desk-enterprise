# Package closeout — W7.38

**Paket:** W7.38 — DB provenance whitelist za `problem.updated`/`problem.claimed`<br>
**Nalaz:** `BA-problems-20` (P2) — **zatvoren**<br>
**Kodni commit:** `f34290e`<br>
**Finalni testani SHA:** `f34290e`<br>
**CI:** [`44303067683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44303067683) — zelen<br>
**DB migracije:** `20271201120000_audit_scope_provenance_problem_actions` (manual apply prije/uz deploy)

## Nalaz i acceptance

`enforce_audit_scope_provenance` je DB trigger iz migracije `20271025140000` koji, prije upisa u
`AuditLog`, provjerava da `organizationalUnitId` reda odgovara jedinici samog entiteta. Svoju listu akcija
drži u SQL-u, a W7.30 je uveo dvije nove kanonske akcije (`problem.updated`, `problem.claimed`) i
registrovao ih kao `entity` scope. Trigger ih nije poznavao, pa je za njih scope bio ispravan **samo po
konstrukciji** (isti red, ista transakcija) — bez provjere u bazi. Svaki budući pisac koji pošalje drugu
jedinicu prošao bi nekažnjeno, a audit lanac bi se particionirao u pogrešnu OJ.

Acceptance: (1) baza odbija `problem.updated`/`problem.claimed` sa jedinicom koja nije jedinica problema,
(2) prihvata kanonsku, (3) whitelist i kod više ne mogu driftovati neprimijećeno.

## Implementacija

- **Migracija `20271201120000_audit_scope_provenance_problem_actions`** — `CREATE OR REPLACE FUNCTION`
  (ne drop/create triggera): trigger `AuditLog_scope_provenance` ostaje vezan za istu funkciju, pa nijedan
  red nije bez zaštite tokom zamjene i ništa se ne prepisuje. Problem grana sada glasi
  `problem.created, problem.updated, problem.claimed, problem.status_changed, problem.closed,
  problem.cancelled, problem.reopened, problem.knowledge_article_created, problem.tickets_resolved` →
  `Problem.organizationalUnitId`. Ostatak funkcije je bajt-za-bajt prethodna definicija.
- **Drugi drift iste klase, pronađen guardom:** `ticket.message_created` je u registru `entity`, a
  `tickets-collaboration.service.ts` ga piše sa `ticket.originUnitId` — dakle kanonski — ali ga trigger
  nikad nije provjeravao. Dodat u ticket granu iste migracije.
- **Guard `audit-scope-provenance-whitelist.spec.ts`** — čita `prisma/migrations`, uzima **posljednju**
  definiciju funkcije, parsira grane u `akcija → (tabela, kolona)` i poredi sa
  `auditActionScopeRegistry`: svaka `entity` akcija mora biti provjerena protiv tačno one tabele i kolone
  koju njen prefiks posjeduje (`ticket* → Ticket.originUnitId`, `group* → Group.organizationalUnitId`,
  `organizational_unit* → OrganizationalUnit.id`, `problem* → Problem.organizationalUnitId`,
  `change* → ChangeRequest.organizationalUnitId`, `asset* → Asset.organizationalUnitId`), nijedna akcija
  ne smije ostati kao stale, svaka se provjerava tačno jednom, i trigger mora ostati vezan (bez
  `DROP TRIGGER`). Akcije su imenovane i tačkom i donjom crtom (`ticket_confidential_viewed`), pa se
  prefiks traži po oba separatora.
- **Sentinel** `expectedSchemaMigration` → nova migracija (readiness odbija bazu koja zaostaje za kodom).
- **Nije obuhvaćeno:** nema promjene aplikativnog koda ni API oblika; akcije su i dosad pisale kanonsku
  jedinicu, pa nijedan zahtjev ne mijenja ponašanje. Ostali `producer`-scope nalazi (npr. party/ticket
  akcije koje nisu `entity`) ostaju van whitelista po politici.

## Direktni testni dokaz

- `src/modules/audit-log/audit-scope-provenance-whitelist.spec.ts` (6) — jedinica koja **čita stvarne
  migracije**: pokrivenost svih `entity` akcija, tačna tabela/kolona po prefiksu, bez stale unosa, bez
  dvostrukih provjera, trigger vezan, i eksplicitno `problem.updated`/`problem.claimed` → `Problem`.
  Ovaj test je i otkrio `ticket.message_created`.
- `src/modules/audit-log/audit-scope-provenance.integration.spec.ts` (+1, realna baza) — kreira OJ i
  problem, pa za obje akcije: tuđa jedinica ⇒ `AUDIT_SCOPE_PROVENANCE_MISMATCH` i **nula** redova;
  kanonska jedinica ⇒ red sa `organizationalUnitId` problema. Postojeći slučajevi (OU mismatch, globalna
  akcija bez scopea) ostaju.
- `src/common/database/database-runtime-contract.spec.ts` — sentinel pinovan na novu migraciju.

## CI i testni dokaz

CI run [`44303067683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44303067683) na `f34290e`:

- **Backend:** generisani Prisma, build, lint, safety-net, wiring, SLA matrica i pun Jest — uspješno.
- **PostgreSQL/Redis integration:** uspješno, uključujući **novu migraciju primijenjenu** i izmijenjeni
  `audit-scope-provenance.integration.spec.ts`.
- **Frontend:** lint, format, testovi, build i budget — uspješno (bez izmjena u frontendu).
- **Docs/CI gate/container:** Docs guard, container + supply chain i CI gate uspješni.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`.
- **Neuspjeli pokušaji:** nema.

Lokalno: `jest` ciljano `src/modules/audit-log` + `src/common/database` (22 suiteova / 90 testova; dva
suitea `audit-log.repository`/`audit-anchor-runtime` ne mogu se pokrenuti u sandboxu jer je Prisma klijent
ručni stub bez runtime klase — u CI-ju se generiše pravi), `eslint` čist, `check-migration-policy.mjs`
(119 migracija), `tsc` filtriran na izmijenjene fajlove bez grešaka. Integration suite lokalno `skipped`
(nema `PRIVACY_IT_DATABASE_URL`); dokaz je CI posao.

## Registar nalaza

- Zatvoreni: `BA-problems-20` (P2).
- Ostaju otvoreni u ovom auditu: `BA-problems-17`, `BA-problems-18`, `BA-problems-19`, `BA-problems-21`
  (svi P3).
- Kontrolni zbir (prebrojano iz `backend-findings-plan.json` i redova registra, ne prepisano): source/plan
  **438 otvorenih / 258 zatvorenih / 696 ukupno**; ovaj registar **448/248**; Val 7 **37/111** (74 otvorena:
  13/40/21); `problems` **17/21**.
- **Ispravka zatečenog zbira:** ranije closeout poruke navodile su registar 450/246, a stvarni redovi prije
  ovog paketa bili su **449/247**; poslije zatvaranja `BA-problems-20` tačno je **448/248**. Slično, Val 7
  otvoreni po severity prije paketa bili su 13/41/21 (ne 13/42/20). Brojevi su ovdje izvedeni iz podataka,
  pa se dalje prenose kako stoje.

## Migracija, rollout i rollback

- **Migracija:** `20271201120000_audit_scope_provenance_problem_actions` — `CREATE OR REPLACE FUNCTION`,
  bez DDL-a na tabelama, bez prepisivanja redova, trajanje u milisekundama (samo zamjena tijela funkcije).
- **Redoslijed deploya:** migracija prije (ili uz) novu sliku. Novi kod piše iste akcije kao i stari; ako
  aplikacija krene prije migracije, ponašanje je staro (bez DB provjere) — bez greške. Obrnuto, baza sa
  migracijom i stara aplikacija: i dalje prolazi, jer su i stari pisci slali kanonsku jedinicu. Sentinela
  `expectedSchemaMigration` tjera readiness da odbije bazu koja zaostaje.
- **Provjera poslije primjene (opcionalno, psql):**
  `SELECT pg_get_functiondef('enforce_audit_scope_provenance'::regprocedure) LIKE '%problem.claimed%';`
  očekivano `t`.
- **Rollback:** forward-only, kako politika traži. Vraćanje stare definicije je nova migracija koja ponovo
  isključuje provjeru za te akcije (i vraća rupu), pa nije preporučeno; podaci nisu dirani ni u jednom
  smjeru, pa nema potrebe za rollbackom podataka.

## Sljedeći paket

**W7.39 — `BA-problems-17` (P3):** liste događaja/tiketa/veza/reverse/options se tiho hard-trunciraju i
`total` može biti netačan; cilj je vidljiv `hasMore`/`capped` ugovor uz tačan broj ili eksplicitnu
napomenu u UI-ju. Nije započet prije zelenog gatea za ovaj paket.
