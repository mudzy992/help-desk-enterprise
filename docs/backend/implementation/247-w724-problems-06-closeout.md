# Package closeout — W7.24

**Paket:** W7.24 — durable bulk resolution (per-ticket run, idempotent replay, manual resume)<br>
**Nalaz:** `BA-problems-06` (P1) — zatvoren<br>
**Kodni commit:** `a119a6e` (implementacija) + `cb37a3f` (format) + `338803d` (audit metadata, run spec, unlink integration) + `0eaf4a1` (outcome pending reply, permanent ticket failures, foreign-run 404)<br>
**Finalni testani SHA:** `0eaf4a1f7c71fb3e2c0831b19edd676adfa15bc6`<br>
**CI:** [`44050719920`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44050719920) — zelen<br>
**DB migracije:** `20271130240000_problem_resolution_runs` (add-only; nema manualnog backfill-a)

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §6: problem se commit-a `RESOLVED` prije bulk rješavanja povezanih tiketa, pa pad procesa, neuspjeli ticket write ili neuspjela poruka ostavljaju nedovršeni posao bez traga, bez retryja i bez idempotentne poruke.

Acceptance je zatvoren kroz četiri odluke vlasnika (2026-11-17, `ask_user` #3):

1. **`new_tables`** — run stanje ide u nove tabele `ProblemResolutionRun`/`ProblemResolutionRunItem`.
2. **`partial`** — problem se postavlja `RESOLVED` odmah; run smije ostati `PARTIAL` i nudi Resume dok svi itemi nisu terminalni, pa se gubitak više ne dešava tiho.
3. **`durable`** — poruka podnosiocu pamti stanje na itemu i ponavlja se sa stabilnim ključem (nije best-effort).
4. **`manual`** — samo ručni resume API; bez schedulera/sweepera.

W7.23 politika delegacije ostaje na snazi: svaki item prolazi per-ticket `assertProblemDelegation` prije takeover upisa, povjerljivi tiketi nikad nisu delegirani.

## Implementacija

- **Schema/migracija:** dva nova enuma i dvije tabele (`backend/prisma/schema/problems.prisma`); unique `[runId, ticketId]`/`[runId, ordinal]`, indeksi po problemu/statusu, FK `Cascade` na problem/run i `Restrict` na actora, CHECK na brojače. Migracija je add-only, pa nije bilo destructive approval hasha; sentinel `expectedSchemaMigration` pomjeren je na novu migraciju.
- **Servis:** novi `problem-resolution-run.service.ts` + `problem-resolution-support.ts`; `resolveTickets`, `resolvePreview` i `assertResolveOptions` zadržavaju javni oblik. `runId` je klijentski idempotency ključ: isti ključ + payload = replay/resume, drugi payload = `PROBLEM_RESOLUTION_RUN_CONFLICT`, tuđi problem = `PROBLEM_RESOLUTION_RUN_NOT_FOUND`.
- **Invarianti:** run + itemi se pišu **prije** promjene statusa problema i prije prvog ticket upisa; item se claim-uje atomski (`PENDING|RUNNING|MESSAGE_PENDING|retryable FAILED` → `RUNNING`, `attempts++`); status tiketa se pamti prije poruke (`MESSAGE_PENDING`), poruka ide kroz `createMessage` s ključem `${runId}:${ticketId}`, pa ponovni poziv ne pravi duplu poruku ni duplu promjenu statusa.
- **Recovery:** `PROCESSING` run iz crasha se dovršava Resume-om, uključujući self-healing `RESOLVED` ako status problema nikad nije upisan. Ako promjena statusa problema padne prije ijednog ticket upisa, run se označava `FAILED` i nije resumable (`PROBLEM_RESOLUTION_RUN_CLOSED`).
- **Klasifikacija:** `FORBIDDEN`/`STATUS_CHANGE_FORBIDDEN`/`NOT_FOUND`/`PROBLEM_*` permanentni kodovi i 4xx se ne retryjaju; ostalo jest. `canResume` je tačan (pending itemi ili retryable pad), pa UI ne nudi besposlen Resume.
- **API:** `POST /problems/:id/status` (`resolveTickets` + opcioni `resolutionRunId`) vraća isti `{ ...problem, ticketResolution }` oblik; novo `POST /problems/:id/resolution-runs`, `GET .../resolution-runs/latest`, `GET .../resolution-runs/:runId`, `POST .../resolution-runs/:runId/resume`. Sve traži `problem.read` + `problem.manage` + `problem.close` u OU opsegu problema i group authority.
- **Frontend:** status sheet drži jedan `runId` po identičnom submit-u; outcome prikazuje „Rješavanje povezanih tiketa nije dovršeno“ + **Nastavi rješavanje**, a neuspjeh daje i inline alert i danger toast. Novi `ProblemResolutionRunPanel` na detalju problema čita najnoviji run i nudi Resume nakon reloada; bez `problem.close` panel se ne prikazuje.
- **Nije u scopeu:** scheduler/sweeper (odluka `manual`), retroaktivno rješavanje starih runova (tabela starta prazna), E2E pokrivenost novih ruta i promjena W7.23 delegacije.

## Direktni testni dokaz

- `backend/src/modules/problems/problem-resolution-run.service.spec.ts` (novo, 12 testova): prepare skip razlozi i validacija prije upisa; replay/conflict/foreign-run; `RESOLVED` problem ne pravi novi run; execute postavlja problem `RESOLVED` pa rješava sa stabilnim ključem; jedan pad ne zaustavlja ostale i resume ponavlja samo retryable item (attempts 2 vs 1); neuspjela poruka → `MESSAGE_PENDING` → resume ista poruka/isti ključ → `SUCCEEDED`; crash-scenario (`RUNNING` + već `RESOLVED` tiket) dovršava samo poruku; dvostruki `execute` vraća isti outcome bez novih upisa; povjerljivi tiket vlastitim pristupom i ponovna delegacija pri takeoveru; `latest`/`abort` ponašanje.
- `backend/src/modules/problems/problem-resolution.service.spec.ts` (prerađen): preview/limit/`no_access`/fail-closed ostaju, a validacija i izvršavanje su dokazano delegirani run servisu.
- `frontend/src/components/problems/problem-resolution-run-panel.spec.tsx` (novo, 3 testa): Resume poziva `resumeProblemResolutionRun(problemId, runId)` i `onResumed`; bez `canResume` nema panela; bez `problem.close` nema upita.
- `backend/src/modules/problems/problem-ticket-unlink.integration.spec.ts`: konstruktor je ažuriran na novi DI oblik (6 argumenata), pa se postojeći real-PostgreSQL problem/visibility suite ponovno izvršava u CI-ju.

## CI i testni dokaz

CI run [`44050719920`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44050719920) na `0eaf4a1`:

- **Backend:** `prisma validate`, generisani Prisma artefakti, `audit:traceability`, `wiring:check` (99 controllera / 624 rute), build s anotiranim dijagnostikama, ESLint i full Jest — svi uspješni.
- **PostgreSQL/Redis integration:** svi izolovani suiteovi prošli, uključujući `problem-ticket-unlink.integration.spec.ts`; novi run nema vlastiti DB suite (unit fake pokriva claim/replay semantiku, a idempotency sloj ima postojeći `request-idempotency.integration.spec.ts`).
- **Frontend:** lint, **Prettier format check**, i18n/hooks/accessibility guardovi, `npm test`, build i bundle budgeti — uspješni.
- **Docs/CI gate/container:** Docs guard, container + supply chain (SBOM/skeneri) i CI gate uspješni.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows` i `E2E install wizard` — push-triggered workflow ih ne pokreće (dispatch/schedule only); nisu „passed“.
- **Neuspjeli pokušaji:**
  - [`44048074030`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44048074030) na `a119a6e`: frontend Prettier format check (vlastita greška — tri fajla nisu bila formatirana), backend TS2554 u `problem-ticket-unlink.integration.spec.ts` (stari konstruktor, 7 argumenata), `AUDIT_METADATA_FIELD_NOT_ALLOWED:problem.tickets_resolved:messagePending` (vlastita greška — audit schema dozvoljava samo `resolved`/`skipped`/`failed`) i pad fake-a u run specu (`where.status.in` za string status). Korekcije: `cb37a3f` (format), `338803d` (metadata split event/audit, spec fake, integracioni konstruktor).
  - [`44048574659`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44048574659) na `cb37a3f`: isti backend nalazi kao gore (format commit nije dirao backend). Isti fiks u `338803d`.
  - [`44049021694`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44049021694) na `338803d`: tri vlastite assertion greške u novom specu (replay test je tražio novi run na već `RESOLVED` problemu; `FORBIDDEN` ticket kod nije bio u permanentnoj listi; `resolved` lista nije uključivala `MESSAGE_PENDING`) i `ws-redis-adapter.integration.spec.ts` timeout na `admin.config.updated`. Korekcije: `0eaf4a1` (permanentni ticket kodovi, `MESSAGE_PENDING` u `resolved`, test fixture, foreign run → `PROBLEM_RESOLUTION_RUN_NOT_FOUND`). WebSocket suite je u finalnom runu prošao bez izmjena websocket koda, pa je zabilježen kao flake, ne kao regresija.

Dodatne lokalne provjere i ograničenja: `node scripts/check-migration-policy.mjs` (115 migracija), `node scripts/check-backend-wiring.mjs` (624 rute, manifest sinhronizovan), `node scripts/check-backend-findings.mjs` (694/694 traceability) i TypeScript syntax check promijenjenih fajlova. Lokalno nema `node_modules`, Prisma generisanja, PostgreSQL-a ni `psql`-a, pa puni `tsc`, Jest i integracija nisu izvedivi van CI-ja; frontend Prettier je provjeren lokalno instaliranim `prettier@3.9.10`.

## Registar nalaza

- Zatvoreni: `BA-problems-06` (P1) — durable run + per-item stanje + idempotentni replay + ručni resume, dokazano zelenim CI-jem.
- Ostaju otvoreni u audit 23: `BA-problems-07`–`BA-problems-19`.
- Kontrolni zbir: **447 otvorenih / 247 zatvorenih / 694 ukupno** (P1 173); globalni registar **457 / 237**; Val 7 **26 / 109** (83 otvorena: 14 P1 / 49 P2 / 20 P3); `problems` **6/19** (13 otvorenih: 1 P1 / 9 P2 / 3 P3).

## Migracija, rollout i rollback

- Nova migracija `20271130240000_problem_resolution_runs` (dva enuma, dvije tabele, tri indeksa, dva unique indeksa, tri FK-a, CHECK). Add-only; tabele startaju prazne, bez backfill-a.
- Deployment: standardni `prisma migrate deploy` u okviru redeploya; nema manualnih koraka ni feature flaga. `expectedSchemaMigration` je pomjeren, pa starija baza neće proći runtime contract provjeru.
- API je kompatibilan: `ticketResolution` zadržava `resolved`/`skipped`/`failed`, a nova polja (`runId`, `status`, `canResume`, `messagePending`) su aditivna i opciona.
- Rollback: aplikacijski rollback je siguran (nove tabele se ne čitaju ako se nove rute ne pozivaju). Schema rollback nije potreban; ako se izvodi, brišu se itemi pa runovi pa enumi — bez uticaja na `Problem`, `Ticket` i `TicketMessage` podatke.

## Sljedeći paket

**W7.25 — `BA-problems-07` (P1):** target reminder marker se upisuje prije primaoca i potvrđene/persistirane isporuke. Nije započet prije zelenog gatea za W7.24.
