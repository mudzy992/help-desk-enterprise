# Package closeout — W7.26

**Paket:** W7.26 — atomsko kreiranje problema sa početnim ticket linkovima i idempotentni create<br>
**Nalaz:** `BA-problems-08` (P2) — zatvoren<br>
**Kodni commit:** `81d737b`<br>
**Finalni testani SHA:** `81d737b`<br>
**CI:** run [`44094239725`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44094239725) — **success**<br>
**DB migracije:** `20271201000000_problem_create_idempotency` (add-only; nema backfill-a)

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §5: `POST /problems` je bio dvije komande. `ProblemsService.create`
je u svojoj transakciji upisao problem, `ProblemEvent` `created` i audit red i vratio `id`, a `ProblemTicketsController`
je tek nakon toga pozvao `ProblemTicketsService.link`. Ako link padne, ako proces umre između dvije komande ili ako
klijent ponovi zahtjev poslije izgubljenog odgovora, ostaje kreiran problem bez ijednog tiketa (orphan) i potrošen
`ProblemSequence` broj — ili dva identična problema. `link` je uz to bio tolerantan po tiketu: bez ijednog uspjeha
vraćao je `{ linked: [], skipped: [...] }`, a create endpoint je i dalje odgovarao 2xx sa problemom.

Acceptance je zatvoren kroz dvije odluke vlasnika (2026-11-17, `ask_user`):

1. **`partial_atomic`** — problem, linkovi, problem eventovi, ticket system eventovi i audit su **jedna transakcija**;
   nedostupni tiketi ostaju u `ticketLinks.skipped` sa istim razlozima i dijalog ih prikazuje kao i do sada. Ako
   **nijedan** tiket nije linkovan, komanda se poništava u cjelini (4xx, bez problema, bez potrošenog sequence broja).
   Nije odabrano „sve ili ništa“ za svaki pojedini tiket ni strict flag koji bi zahtijevao sve tikete.
2. **`client_key`** — create dobija opciono UUID polje `clientRequestId` i unique ključ
   `(createdByUserId, clientRequestId)`; ponovljeni zahtjev sa istim ključem i istim autorom **replaya** isti problem.
   To zahtijeva još jednu add-only migraciju u ovom paketu.

Ne mijenja se W7.23 delegacija (`problem.close` + group authority), W7.24 group rješavanje ni W7.25 durable target
podsjetnici. Ne mijenja se UX ugovor dijaloga: djelimičan batch drži dijalog otvoren dok agent ne vidi šta nije
linkovano.

## Implementacija

- **Jedna transakcija (`ProblemsService.create`):** sequence upsert, `problem.create`, `ProblemEvent` `created`,
  `recordAuditEntry` i prvi linkovi su u istom `$transaction` pozivu. `ProblemTicketsService.linkInTransaction` radi
  unutar pozivaočevog klijenta: provjere (merged, read-only, postojeći link), `ProblemTicket` red, problem event
  `ticket_linked` i staff-only `insertSystemTicketEvent`. Nema ugniježđene transakcije.
- **Sve ili ništa bez ijednog linka:** ako je batch neprazan a `linked.length === 0`, create baca
  `ProblemError(problemErrorCodes.ticketsNotLinked, 'ticketIds')` → HTTP 409 `PROBLEM_TICKETS_NOT_LINKED`. Rollback
  vraća i `ProblemSequence` (nema praznina u numeraciji zbog neuspjele komande). Djelimičan batch (`linked > 0`)
  vraća 201 sa `ticketLinks.skipped` kao prije.
- **Race bez aborted transakcije:** prije „je li tiket već linkovan“ čitanja uzimaju se `FOR UPDATE` red-lockovi nad
  `Ticket` redovima u stabilnom (`ORDER BY "id"`) poretku. Dvije konkurentne komande (create iz tiketa vs. ticket
  panel) zato serijalizuju provjeru: gubitnik vidi postojeći link i prijavi `other_problem` umjesto da obori cijelu
  transakciju na unique indeksu `ProblemTicket.ticketId`. `link()` (attach na postojeći problem) zadržava jednu
  transakciju po tiketu, pa ostatak batcha preživi pad jednog tiketa — sada kroz isti `linkTicket` core.
- **Idempotencija create-a:** `CreateProblemDto.clientRequestId` (`@IsOptional() @IsUUID()`), nova kolona
  `Problem.clientRequestId` i unique indeks `Problem_createdByUserId_clientRequestId_key`. Prije validacija create
  traži postojeći problem po `(createdByUserId, clientRequestId)`; ako postoji, vraća njegov detail i **trenutne**
  linkove (`ticketLinks.linked`, `skipped: []`) — nema novog reda, nema novog sequence broja. Prvi zahtjev pobjeđuje:
  replay ne poredi payload (isti ključ = ista komanda). Ako dva konkurentna zahtjeva prođu lookup, gubitnik na
  unique indeksu (P2002) ponovi lookup i vrati pobjednikov problem.
- **Poslije commita:** realtime publish ticket system eventova (`ProblemTicketsService.publish`) i owner/group
  notifikacije ostaju van transakcije, kao i do sada. Recurrence notifier se ne mijenja (nov problem je `NEW`).
- **Frontend:** `problem-link-dialog` i `problem-form-sheet` generišu jedan `clientRequestId` po otvorenom formularu
  (`useRef` + reset na `open`), pa ponovni submit poslije mrežne greške replaya isti problem. Dijalog i dalje drži
  otvoren dijalog kad `skipped.length > 0`. Nova greška se mapira na `problems.errors.ticketsNotLinked` (bs/en) i
  prikazuje se i inline i kao danger toast.
- **Nije u scopeu:** promjena pravila pojedinačnog linka (ticket panel i dalje prijavljuje razlog kao grešku), KB
  article draft (`BA-problems-09`), service/incident link scope (`BA-problems-11`), E2E pokrivenost novog 409 puta.
  Postojeći `RequestIdempotencyService` (`IdempotencyRecord`, retencija 24 h) nije korišten: ključ mora ostati
  trajan i vezan na autora problema, a ne na HTTP prozor.

## Direktni testni dokaz

- `backend/src/modules/problems/problem-create-atomicity.spec.ts` (novo, 6 testova, in-memory fake sa rollback
  semantikom): linkovi se pišu kroz **isti** transakcijski klijent kao problem; djelimičan batch vraća `skipped` i
  publishuje notifikacije poslije commita; nijedan link → `PROBLEM_TICKETS_NOT_LINKED` uz praznu tabelu problema,
  nula eventova i `sequence = 0`; bez `ticketIds` → `ticketLinks: null`; ponovljeni `clientRequestId` ne otvara
  transakciju i vraća trenutne linkove; izgubljeni unique race replaya pobjednika; nepovezana greška transakcije se
  ne guta.
- `backend/src/modules/problems/problem-tickets.service.spec.ts` (+4 testa): `linkInTransaction` linkuje u
  pozivaočevoj transakciji bez ugniježđene, lockuje tikete u sortiranom poretku (`FOR UPDATE`), ostavlja publish
  pozivaocu, prazan batch ne otvara lock, finalni problem se odbija. Postojeći `link`/`unlink`/`listForProblem`
  testovi prolaze nepromijenjeni kroz refaktorisani core.
- `backend/src/modules/problems/problems.controller.spec.ts`: create više ne linkuje nakon servisa — kontroler
  vraća rezultat servisa i ne poziva `ticketLinks.link` ni `problems.get`.
- `backend/src/common/database/database-runtime-contract.spec.ts`: sentinel pomjeren na
  `20271201000000_problem_create_idempotency`.
- `frontend/src/components/problems/problem-link-dialog.spec.tsx` (novo, 2 testa): dva submita poslije mrežne greške
  nose **isti** `clientRequestId`; `PROBLEM_TICKETS_NOT_LINKED` daje inline `role="alert"`
  (`problems.errors.ticketsNotLinked`) **i** danger toast, dijalog ostaje otvoren i `onDone` se ne poziva.
- `frontend/src/lib/problems/problem-view.spec.ts`: novi kod se mapira na `problems.errors.ticketsNotLinked`.
- Lokalno: `modules/problems` 19 suiteova / 140 testova (2 integraciona suitea skipped bez baze), frontend `vitest`
  full 452 fajla / 1773 testa.

## CI i testni dokaz

CI run [`44094239725`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44094239725) na `81d737b`
(2026-11-17 UTC):

- **Backend:** `prisma validate`, generisani Prisma artefakti, `audit:traceability`, `wiring:check`
  (99 controllera / 626 ruta), build s anotiranim dijagnostikama, ESLint i full Jest (uključujući 10 novih/izmijenjenih
  problems testova) — svi uspješni.
- **PostgreSQL/Redis integration:** nova migracija `20271201000000_problem_create_idempotency` prošla je kroz release
  migrator i `prisma migrate status`, role/privilege provjere, worker recovery i real-DB suiteove — uspješno. Paket
  nema vlastiti DB suite: unique indeks i idempotencija su pokriveni fake transakcijom, a stvarni unique indeks
  kreira migracija koju integracija primjenjuje.
- **Frontend:** lint, Prettier format check, i18n/hooks/accessibility guardovi, `vitest` (uključujući novi dijalog
  spec), build i bundle budgeti — uspješni.
- **Docs/CI gate/container:** Docs guard, container + supply chain (SBOM/skeneri) i CI gate uspješni.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows` i `E2E install wizard` — push
  workflow ih ne pokreće (dispatch/schedule only); nisu „passed“. Ciljani E2E nije pokretan za ovaj paket.
- **Neuspjeli pokušaji:** nije bilo nijednog neuspjelog CI runa za ovaj paket.

## Registar nalaza

- Zatvoreni: `BA-problems-08` (P2) — create + početni linkovi su jedna transakcija, totalni neuspjeh linkova
  poništava komandu, create ima trajni idempotency ključ po autoru.
- Ostaju otvoreni u audit 23: `BA-problems-09`–`BA-problems-19`.
- Kontrolni zbir: **445 otvorenih / 249 zatvorenih / 694 ukupno** (P1 174); globalni registar **457 / 239**; Val 7
  **28 / 109** (81 otvoren: 13 P1 / 48 P2 / 20 P3); `problems` **8/19** (11 otvorenih: 0 P1 / 8 P2 / 3 P3).

## Migracija, rollout i rollback

- Nova migracija `20271201000000_problem_create_idempotency`: `ALTER TABLE "Problem" ADD COLUMN "clientRequestId"
  TEXT` i `CREATE UNIQUE INDEX "Problem_createdByUserId_clientRequestId_key" ON "Problem"("createdByUserId",
  "clientRequestId")`. Add-only, bez destructive SQL-a (nema approval hasha) i bez backfill-a: svi postojeći redovi
  ostaju sa `NULL`, a PostgreSQL dozvoljava više `NULL` vrijednosti u unique indeksu.
- Sentinel `expectedSchemaMigration` i njegov spec pomjereni su na novu migraciju (117 migracija ukupno), pa starija
  baza ne prolazi runtime contract provjeru.
- Deployment: standardni `prisma migrate deploy` u okviru redeploya; nema feature flaga ni manualnih koraka.
- API kompatibilnost: `clientRequestId` je opcion, `ticketLinks` oblika nepromijenjen; novo je samo 409
  `PROBLEM_TICKETS_NOT_LINKED` u slučaju koji je do sada vraćao 201 sa problemom bez linkova.
- Rollback: aplikacijski rollback je siguran (stari create ne šalje `clientRequestId` i ne čita novu kolonu; stari
  frontend ne šalje ključ). Schema rollback briše samo kolonu i indeks; `Problem`, `ProblemTicket`, `ProblemEvent`
  redovi i numeracija ostaju netaknuti.

## Lokalna provjera i ograničenja

- `cd backend && node scripts/check-migration-policy.mjs` — 117 migracija, approval hashevi validni.
- `npm run wiring:check` — 99 controllera / 626 ruta, manifest sinhronizovan (nema novih ruta).
- `node scripts/check-backend-findings.mjs` — 694/694 traceability i sinhronizovan plan.
- `check-client-neutral.mjs`, `check-hooks-order.mjs`, `check-ticket-id-leaks.mjs`,
  `check-ticket-translation-keys.mjs`, `check-a11y-static.mjs`, `check-theme-contrast.mjs`, `npm run i18n:check` — svi
  prolaze.
- Backend: `modules/problems` + sentinel spec kroz `ts-jest`; `eslint` nad promijenjenim fajlovima čist. Frontend:
  `tsc -b`, `eslint`, `prettier --check` i full `vitest` prolaze.
- Ograničenja sandboxa: nema izlaza na `binaries.prisma.sh`, pa `prisma generate` nije izvediv i
  `npm run check:prisma-generated` očekivano pada lokalno; za `ts-jest`/`tsc` korišten je isključivo sandbox stub
  `backend/src/generated/prisma/client.ts` (gitignored, nije u commitu), pa lokalni `tsc` nije dokaz pune Prisma
  tipizacije. Puni backend Jest je u sandboxu pao na heap limitu (~2 GB) bez obzira na izmjene, pa je CI jedini dokaz
  full suita. PostgreSQL i Redis nisu dostupni lokalno.

## Sljedeći paket

**W7.27 — `BA-problems-09` (P2):** KB article nastaje prije conditional linka i concurrent/failure put ostavlja
orphan draft. Nije započet prije zelenog gatea za W7.26.
