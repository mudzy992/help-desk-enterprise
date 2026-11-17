# W7.24 — BA-problems-06: durable per-ticket group rješavanje s resume-om

**Status: implementacija kompletna; CI [`44050719920`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44050719920) na `0eaf4a1` je zelen; čeka korisničku vizuelnu provjeru.** Group rješavanje problema više nije „jedan prolaz best-effort“: run se zapisuje prije promjene statusa problema, svaki tiket ima vlastito stanje i broj pokušaja, poruka podnosiocu koristi stabilan idempotency ključ, a `POST /problems/:id/resolution-runs/:runId/resume` ponavlja tačno nedovršene tikete. `RESOLVED` se i dalje postavlja odmah; run smije ostati `PARTIAL` i problem tada prikazuje „rješavanje tiketa nije dovršeno“ uz dugme **Nastavi rješavanje**.

## Triage

BA-problems-06 (P2), audit [23-problems.md](../audits/23-problems.md):

> Problem se commit-a `RESOLVED` prije bulk rješavanja ticketa; ako proces padne između, ticketi ostaju otvoreni bez ikakvog traga i bez retryja. Nema durable stanja po tiketu, nema resume-a, a poruka podnosiocu je best-effort.

Prije W7.24 `resolveTickets` je radio u jednom prolazu: kandidati → `takeOverForProblem`/`update` → `createMessage`, sve u memoriji. Pad procesa, timeout ili neuspjela poruka ostavljali su nedovršeni posao bez zapisa; ponovni poziv nije znao šta je već urađeno, a poruka nije imala stabilan ključ.

**Odluke vlasnika (2026-11-17, `ask_user` #3):**

1. **storage = `new_tables`** — run stanje ide u nove tabele (`ProblemResolutionRun`, `ProblemResolutionRunItem`) uz odobrenu add-only migraciju.
2. **completion = `partial`** — problem se postavlja `RESOLVED` odmah; run smije ostati `PARTIAL`, a problem i UI nude Resume dok svi itemi nisu terminalni.
3. **message = `durable`** — poruka podnosiocu pamti stanje na itemu; neuspjeh je `MESSAGE_PENDING` i Resume je ponavlja sa stabilnim ključem (nije best-effort).
4. **resume_api = `manual`** — samo ručni resume API; bez schedulera/sweepera. Crash se rješava ponovnim pozivom istog ključa ili Resume-om.

## Implementacija

### Schema i migracija

- `backend/prisma/schema/problems.prisma`: enumi `ProblemResolutionRunStatus` (`PROCESSING`/`SUCCEEDED`/`PARTIAL`/`FAILED`) i `ProblemResolutionRunItemStatus` (`PENDING`/`RUNNING`/`RESOLVED`/`MESSAGE_PENDING`/`SKIPPED`/`FAILED`), modeli `ProblemResolutionRun` (problem, actor, `requestHash` char(64), `message`, `closeCode`, brojači, `responseBody`, `lastError`, `completedAt`) i `ProblemResolutionRunItem` (tiket, ordinal, status, `reason`, `errorCode`, `retryable`, `messageSent`, `attempts`, `completedAt`).
- Unique `[runId, ticketId]` i `[runId, ordinal]`, indeksi `[runId, status]`, `[problemId, createdAt]`, `[status, updatedAt]`. Veze: `Problem` → `Cascade`, `User` → `Restrict`, item → run `Cascade`.
- Migracija `20271130240000_problem_resolution_runs` je **add-only** (dva enuma, dvije tabele, indeksi, FK, CHECK na brojače): nema destruktivnog SQL-a, pa nije potreban approval hash. Sentinel `expectedSchemaMigration` u `database-runtime-contract.ts` i njegovom specu pomjeren je na novu migraciju; `check-migration-policy` prolazi (115 migracija).
- Tabele startaju prazne; nema backfill-a ni legacy preflighta, i stari runovi ne postoje.

### Servis

- Novi `problem-resolution-run.service.ts` (run stanje) i `problem-resolution-support.ts` (zajednički `loadProblemForResolution`, `resolutionCandidates`, `ticketFailureCode`, `isRetryableTicketFailure`). `ProblemResolutionService` zadržava preview/članke i delegira run pozive, pa je javni oblik `resolveTickets`-a ostao isti.
- **Preflight:** `prepare` prvo validira opcije (poruka ≥ 5 znakova, obavezan/dopušten close code), pa tek onda piše. Novi run se odbija na `RESOLVED`/`CLOSED`/`CANCELLED` problemu (`PROBLEM_STATUS_TRANSITION`), tako da se ne pravi run bez posla.
- **Idempotency:** `runId` je ključ koji bira klijent. Isti `runId` + isti payload → replay (završen run) ili resume (nedovršen); isti `runId` s drugim payloadom → `PROBLEM_RESOLUTION_RUN_CONFLICT` (409); tuđi problem → `PROBLEM_RESOLUTION_RUN_NOT_FOUND` (404). `requestHash` je SHA-256 kanonikalizovanog `{problemId, message, closeCode}`.
- **Redoslijed:** run + itemi → problem `RESOLVED` → po tiketu (takeover/status) → poruka. Ako promjena statusa problema padne, run se označava `FAILED` s kodom greške i **nijedan tiket nije dirán**; takav run nije resumable (`PROBLEM_RESOLUTION_RUN_CLOSED`). Ako proces padne prije promjene statusa, run ostaje `PROCESSING` i Resume sam dovršava `RESOLVED` (self-healing, bez klijentske verzije).
- **Item claim:** `updateMany({ where: { id, status }, data: { status: 'RUNNING', attempts: { increment: 1 } } })`; samo jedan pozivalac pomjeri item, pa dva paralelna resume-a ne pišu dvaput. Stale `RUNNING` (crash) se nastavlja: ako je tiket već `RESOLVED`, radi se samo poruka.
- **Poruka:** `createMessage(..., { idempotencyKey: \`${runId}:${ticketId}\` })` kroz postojeći idempotency sloj. Neuspjeh poruke → `MESSAGE_PENDING` (`retryable=true`), uspjeh → `RESOLVED` + `messageSent=true`. Stoga ponovni poziv ne pravi duplu poruku niti duplu promjenu statusa.
- **Klasifikacija:** `FORBIDDEN`, `PROBLEM_NOT_FOUND`, `PROBLEM_TICKET_NOT_LINKED`, `PROBLEM_STATUS_TRANSITION`, `PROBLEM_OUT_OF_SCOPE` i 4xx HTTP kodovi su permanentni (`retryable=false`), ostalo je retryable. Permanentni `FAILED` i `MESSAGE_PENDING` s `retryable=false` ne blokiraju `canResume`.
- **Završni status:** pending itema → `PARTIAL`; inače `FAILED` ako nijedan tiket nije riješen i ima padova, `PARTIAL` ako ima padova/nedostavljenih poruka, inače `SUCCEEDED`. `responseBody` čuva tačan outcome za replay, pa replay nikad ne izvršava ponovo.
- **Event i audit:** postojeći `tickets_resolved` event i `problemTicketsResolved` audit se pišu jednom po izvršavanju koje je stvarno pokušalo item (`runId`, `resumed`, `messagePending` u detailu); resume bez posla ne piše ništa.
- **Delegacija iz W7.23 ostaje na snazi:** svaki item i dalje prolazi per-ticket `assertProblemDelegation` prije takeover upisa, povjerljivi tiketi nikad nisu delegirani, a `reason`/`no_access` u preview-u i runu se poklapaju.

### API

- `POST /problems/:id/status` s `resolveTickets=true` i dalje radi i vraća `{ ...problem, ticketResolution }`; novi opcioni `resolutionRunId` čini ponovni submit idempotentnim (replay umjesto drugog rješavanja).
- Novo: `POST /problems/:id/resolution-runs` (`runId`, `message`, `closeCode?`), `GET /problems/:id/resolution-runs/latest`, `GET /problems/:id/resolution-runs/:runId`, `POST /problems/:id/resolution-runs/:runId/resume`. Svi traže `problem.read` + `problem.manage` + `problem.close` u OU opsegu problema i group authority; cuvaju `Cache-Control: no-store`.
- `ProblemTicketResolveOutcome` je aditivno proširen (`runId`, `status`, `canResume`, `messagePending`), pa stari klijent i dalje čita `resolved`/`skipped`/`failed`.
- Rute su u `docs/backend/backend-wiring-manifest.json` (99 controllera, 624 rute, sve `authenticated`).

### Frontend

- `problems-api.ts`: tipovi `ProblemResolutionRun`/`ProblemResolutionRunItem`/`ProblemResolutionRunStatus`, `getLatestProblemResolutionRun`, `resumeProblemResolutionRun`, `startProblemResolutionRun`, `ProblemStatusInput.resolutionRunId`.
- `problem-status-sheet.tsx`: jedan `runId` po identičnom submit-u (`crypto.randomUUID()` + fingerprint statusa/poruke/close code-a), pa retry istog submit-a replay-a umjesto drugog rješavanja. Outcome panel prikazuje `PARTIAL` kao „Rješavanje povezanih tiketa nije dovršeno“, sažetak `riješeno X od Y` i dugme **Nastavi rješavanje**; neuspjeh resume-a daje inline alert **i** danger toast.
- Novi `problem-resolution-run-panel.tsx` na detalju problema: nakon reloada čita `resolution-runs/latest` i, dok run ima nedovršenih itema, prikazuje warning sa listom tiketa (status + kod greške) i Resume. Panel se ne prikazuje bez `problem.close` ni kad je run terminalan.
- i18n: `problems.resolveTickets.run.*` (bs/en), uključujući labele item statusa i plural `more_*`.

## Testni dokaz

- `backend/src/modules/problems/problem-resolution-run.service.spec.ts` (novo, 12 testova):
  - `prepare` piše run i iteme sa skip razlozima preview-a; isti ključ+payload je replay/resume, drugi payload je `PROBLEM_RESOLUTION_RUN_CONFLICT`, tuđi problem je `PROBLEM_NOT_FOUND`; novi run na `RESOLVED` problemu je odbijen; poruka/close code se validiraju prije upisa.
  - `execute` prvo postavlja problem `RESOLVED` (self-healing), pa rješava sve pending tikete sa stabilnim ključem `runId:ticketId`, takeover samo za ne-započete, event/audit jednom.
  - jedan pad ne zaustavlja ostale; retryable pad se ponavlja na resume-u, permanentni `FORBIDDEN` ne (attempts 2 vs 1, samo jedan tiket ponovo riješen).
  - neuspjela poruka → `MESSAGE_PENDING`, run `PARTIAL`; resume šalje istu poruku s istim ključem i završava `SUCCEEDED` bez drugog statusnog upisa.
  - crash-scenario (`RUNNING` item + već `RESOLVED` tiket) dovršava samo poruku; `execute` dvaput vraća isti outcome bez novih upisa; `prepare` poslije uspjeha vraća replay.
  - povjerljivi tiket ide vlastitim `loadAccessibleTicket` pristupom, delegacija se ponovno dokazuje pri takeoveru i pad delegacije ne dira tiket.
  - `latest` vraća `PARTIAL`/`canResume` poslije reloada; `abort` označava `FAILED` i resume ga odbija.
- `backend/src/modules/problems/problem-resolution.service.spec.ts` (prerađen): preview/limit/no-access i „fail closed prije kandidata“ ostaju; validacija i izvršavanje su sada delegirani run servisu (provjereno `toHaveBeenCalledWith`).
- `frontend/src/components/problems/problem-resolution-run-panel.spec.tsx` (novo, 3 testa, jsdom): panel prikazuje nedovršene tikete i Resume poziva `resumeProblemResolutionRun(problemId, runId)` pa `onResumed`; bez `canResume` nema panela; bez `problem.close` nema ni upita.
- Migracijska i wiring provjera: `node scripts/check-migration-policy.mjs` (115 migracija, hash-evi validni) i `node scripts/check-backend-wiring.mjs` (624 rute, sinhronizovano).

## Ograničenja

- Lokalno nema `node_modules`, Prisma generisanja, PostgreSQL-a ni `psql`-a, pa puni `tsc`, Jest i integracioni suite nisu lokalno izvedivi; dokaz je CI. Lokalno su izvedeni syntax check promijenjenih fajlova, migration policy, wiring check i findings traceability.
- Nema schedulera/sweepera: `PROCESSING` run bez korisničke akcije čeka ponovni poziv istog ključa ili Resume (odluka `resume_api=manual`).
- Run stanje je perzistentno, ali ne i beskonačno: `message` i `closeCode` se čuvaju u runu, a item čuva samo `ticketNumber` (broj tiketa), ne i naslov.
- `resolution-runs` endpointi nisu u E2E pokriveni; vizuelna provjera je ručna.

## CI i neuspjeli pokušaji

- [`44048074030`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44048074030) na `a119a6e`: frontend Prettier, backend TS2554 u `problem-ticket-unlink.integration.spec.ts` (stari 7-argumentni konstruktor), `AUDIT_METADATA_FIELD_NOT_ALLOWED:problem.tickets_resolved:messagePending` i pad fake-a u run specu. Korekcije: `cb37a3f` (format) i `338803d` (event nosi `runId`/`messagePending`, audit ostaje na tri brojača; spec fake podržava i string status; integracioni konstruktor ažuriran).
- [`44048574659`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44048574659) na `cb37a3f`: isti backend nalazi (format commit nije dirao backend).
- [`44049021694`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44049021694) na `338803d`: tri vlastite assertion greške u novom specu (`RESOLVED` problem u replay testu, `FORBIDDEN` nije bio permanentni kod, `MESSAGE_PENDING` nije bio u `resolved`) i `ws-redis-adapter.integration.spec.ts` timeout. Korekcija `0eaf4a1`; websocket suite je u finalnom runu prošao bez izmjena websocket koda (flake, ne regresija).
- Finalni [`44050719920`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44050719920) na `0eaf4a1`: svi backend/frontend/integration/docs/container poslovi i CI gate uspješni; `E2E critical flows`, `E2E install wizard` i read-only inventory su `skipped` (push workflow ih ne pokreće).
