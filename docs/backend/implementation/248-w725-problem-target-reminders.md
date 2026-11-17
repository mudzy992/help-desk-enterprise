# Package closeout — W7.25

**Paket:** W7.25 — durable target reminders (row prije pokušaja, terminalni ishod, retry/dead-letter, ručni retry)<br>
**Nalaz:** `BA-problems-07` (P1) — zatvoren<br>
**Kodni commit:** `1516498` (implementacija) + `61a1491` (test doubles i prošireni konstruktor kontrolera)<br>
**Finalni testani SHA:** `61a1491`<br>
**CI:** vidi § CI i testni dokaz<br>
**DB migracije:** `20271130250000_problem_target_reminders` (add-only; nema manualnog backfill-a)

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §10: satni sweep je upisivao stage u `Problem.targetRemindersSent`
**prije** rješavanja primaoca i prije ijedne isporuke, uz komentar „Recorded first: a crash after this skips one
reminder instead of repeating it forever“. Svaki od tih puteva — pad procesa između markera i slanja, deaktiviran ili
anonimizovan vlasnik, problem bez vlasnika i bez grupnog menadžera, sve preference OFF, pad in-app upisa, pad e-mail
isporuke — trajno je označavao stage kao poslan, a problem je tvrdio da je podsjetnik poslan. `notifier.targetDue`
vraćao je samo broj isporuka, a greške su se gutale u `logger.warn`, pa sweep nije ni znao da nešto nije isporučeno.

Acceptance je zatvoren kroz tri odluke vlasnika (2026-11-17, `ask_user` #4):

1. **`new_table`** — stanje podsjetnika ide u novu tabelu `ProblemTargetReminder` (unique `problemId+targetAt+stage`,
   status, `attempts`, `nextAttemptAt`, `lastErrorCode`, `deliveredCount`/`recipientCount`, `claimedAt`).
2. **`policy_terminal`** — nula primalaca je **konačan ishod politike**: `NO_RECIPIENT` se upisuje, marker se
   upisuje, nema retryja, `attempts` i razlog ostaju zapisani. (Nije odabrano „retry do dead-lettera“ ni „terminalno
   bez markera“.)
3. **`auto_plus_ui`** — automatski retry u satnom sweepu (backoff 2/10/60/240 min, dead-letter poslije pet pokušaja)
   **plus** ručni `POST /problems/:id/target-reminders/:reminderId/retry` i panel na detalju problema.

Ne mijenja se §10 politika rokova (business-hours kalendar, `before|due|overdue`, 07:00 start), niti W7.23 delegacija
i W7.24 group rješavanje.

## Implementacija

- **Schema/migracija:** novi enum `ProblemTargetReminderStatus` (`PENDING`, `CLAIMED`, `SENT`, `NO_RECIPIENT`,
  `FAILED`, `DEAD`, `CANCELLED`) i model `ProblemTargetReminder` u `backend/prisma/schema/problems.prisma`; unique
  `[problemId, targetAt, stage]`, indeksi `[status, nextAttemptAt]` i `[problemId, createdAt]`, FK `Cascade` na
  problem, CHECK na `attempts >= 0`, `0 <= deliveredCount <= recipientCount` i `stage IN ('before','due','overdue')`.
  Migracija `20271130250000_problem_target_reminders` je add-only (nema destructive SQL-a → nema approval hasha), a
  sentinel `expectedSchemaMigration` i njegov spec pomjereni su na nju.
- **State machine (`sweep/problem-target-reminders.ts`):** čista funkcija `decideProblemReminderOutcome` prevodi
  ishod pokušaja u status: `delivered > 0` → `SENT`; `recipients === 0 && failures === 0` → `NO_RECIPIENT`;
  `failures > 0` → `FAILED` uz backoff (`attempts >= 5` → `DEAD`); primijenjeni kanal bez potvrde →
  `FAILED`/`NOTHING_DELIVERED`. Samo `SENT` i `NO_RECIPIENT` vraćaju `appendsMarker: true`.
- **Invarijanta „marker poslije ishoda“:** red se kreira **prije** pokušaja (`ensure`, unique key čini ga
  idempotentnim), claim je atomski `updateMany` (PENDING, FAILED sa isteklim backoffom, stale `CLAIMED` stariji od
  30 min) sa `attempts` inkrementom, a `finalize` piše status/countere/`nextAttemptAt`/`completedAt` **samo dok je red
  još `CLAIMED`** (claim fence). Legacy marker `Problem.targetRemindersSent` dodaje se **nakon** terminalnog reda, i
  to `updateMany` sa `targetAt` fence-om — pa rearmiran target (promjena prioriteta, reopen) nikad ne dobije marker
  starog targeta. Ako proces padne između reda i markera, sljedeći sweep popravi marker iz reda (`repairMarker`), bez
  ponovnog slanja, jer je red terminalan.
- **Sweep:** `ProblemSweepService.remindDetailed` radi dvije faze po ticku: (1) `retryDue` — PENDING bez pokušaja,
  FAILED sa isteklim backoffom i stale CLAIMED; (2) planiranje današnjeg stagea i pokušaj samo ako red nije
  terminalan. Rezultat je `ProblemSweepResult.reminderOutcomes` (`attempted/sent/noRecipient/failed/dead/cancelled`),
  a log linija više ne kaže „reminders=N“ nego `reminders_sent`, `reminders_no_recipient`, `reminders_failed`,
  `reminders_dead`, `reminders_cancelled`. `remind()` ostaje javni `number` (broj potvrđeno poslanih) radi
  kompatibilnosti.
- **Notifier:** `ProblemNotifier.targetDueDetailed` vraća `ProblemNoticeOutcome` (`delivered`, `recipients`,
  `failures`, `errorCode`); `targetDue` ostaje `number` wrapper. Fan-out sada broji primaoca kao „dozvoljen barem
  jedan kanal“ (in-app po preferenciji ili e-mail nakon `isAllowedNotificationEmailAddress`), a e-mail ishod
  klasifikuje iz durable ledgera (`EMAIL_PENDING` za `NotificationEmailRetryNotDueError`, `EMAIL_UNKNOWN`,
  `EMAIL_DEAD`, `EMAIL_FAILED`) umjesto da ga proguta. In-app replay (postojeći dedupe key) broji se kao isporuka.
  Ostale notifikacije (owner/group/status/recurrence) zadržavaju isto ponašanje; mijenja se samo tačnost brojača.
- **Retry/dead-letter:** backoff 2/10/60/240 min i `DEAD` poslije pet pokušaja; ručni retry vraća budžet na jedan
  pokušaj (`attempts: 1`) i dozvoljen je samo za `PENDING`/`FAILED`/`DEAD`. `SENT`, `NO_RECIPIENT` i `CANCELLED` su
  finalni (`PROBLEM_TARGET_REMINDER_FINAL`, 409), a red koji drži živi worker vraća
  `PROBLEM_TARGET_REMINDER_IN_PROGRESS` (409).
- **Idempotencija ponovnog slanja:** in-app ključ ostaje `problem:problem.targetDue:<problemId>:<stage>:<targetAt>`
  (unique), e-mail ide kroz `NotificationEmailDelivery` koji claim-uje `[userId, dedupeKey]`; retry zato ne može
  napraviti duplu notifikaciju ni dupli e-mail.
- **API:** `GET /problems/:id/target-reminders` (`problem.read` + OU opseg; vraća `{ items, canRetry }`) i
  `POST /problems/:id/target-reminders/:reminderId/retry` (`problem.manage` + `problem.read` + group authority;
  vraća `{ ...problem, targetReminders }`). `canRetry` po redu je tačan (terminalni redovi ga isključuju).
- **Frontend:** novi `ProblemTargetReminderPanel` na detalju problema prikazuje redove **tekućeg** targeta (stage,
  status, primio/ukupno, pokušaji, razlog, sljedeći pokušaj, potvrda isporuke) i nudi **Pokušaj ponovo** samo kad
  `canRetry`; neuspjeh daje i inline alert i danger toast. bs/en ključevi `problems.targetReminders.*`.
- **Nije u scopeu:** promjena §10 politike rokova, notifikacije owner/group/status occurrence (to je `BA-problems-13`),
  scheduler reconciliation (`BA-problems-14`), E2E pokrivenost novih ruta. Ne uvodi se novi audit action: red sam
  nosi trag pokušaja (`attempts`, `lastErrorCode`, `claimedAt`, `completedAt`) i vidljiv je u UI-ju; audit za
  notifikacije nije postojao ni prije ovog paketa.

## Direktni testni dokaz

- `backend/src/modules/problems/sweep/problem-target-reminders.spec.ts` (novo, 12 testova): SENT i NO_RECIPIENT
  dodaju marker, svaki failure ostaje bez markera uz backoff 2/10/60/240, peti failure je `DEAD`, primijenjen kanal
  bez potvrde je `NOTHING_DELIVERED`, claim filter uzima samo PENDING/due FAILED/stale CLAIMED, marker se dodaje bez
  duplikata.
- `backend/src/modules/problems/problem-target-reminder.service.spec.ts` (novo, 11 testova, in-memory tabela):
  marker se piše **poslije** notifiera (`['notifier','marker']`); pad notifiera → `FAILED`/`NOTIFIER_FAILED` bez
  markera i sa `nextAttemptAt = now + 2 min`; nula primalaca → `NO_RECIPIENT` + marker i **nema** drugog pokušaja;
  rearmiran target → `CANCELLED`/`TARGET_MOVED` bez markera i bez notifikacije; zatvoren problem →
  `PROBLEM_NOT_OPEN`; `retryDue` dira samo due redove (1 FAILED ostaje netaknut, 1 prelazi u `DEAD` na petom
  pokušaju); ručni retry oživljava `DEAD` red i vraća budžet na 1; finalni red → 409 `..._FINAL`; živi claim → 409
  `..._IN_PROGRESS`; `list` poštuje `problem.manage` za `canRetry`; `repairMarker` je idempotentan.
- `backend/src/modules/problems/problems.controller.spec.ts`: prošireni konstruktor (7 argumenata) — postojeći create
  regression test ostaje zelen.
- `frontend/src/components/problems/problem-target-reminder-panel.spec.tsx` (novo, 4 testa): FAILED red prikazuje
  razlog i primaoca, retry poziva `retryProblemTargetReminder(problemId, reminderId)` i osvježava; `NO_RECIPIENT`
  objašnjava politiku i nema dugme; neuspjeh daje inline alert **i** danger toast; panel se ne prikazuje bez
  targeta ni za redove starog targeta.
- Postojeći `problem-notifier-visibility.spec.ts`, `plan-problem-reminders.spec.ts`, `problems-audit-scope.spec.ts` i
  `problem-resolution*.spec.ts` prolaze nepromijenjeni (18 problems suiteova, 129 testova lokalno).

## CI i testni dokaz

CI run [`44069568731`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44069568731) na `61a1491`
(2026-11-17 10:57–11:12 UTC):

- **Backend:** `prisma validate`, generisani Prisma artefakti, `audit:traceability`, `wiring:check`
  (99 controllera / 626 ruta), build s anotiranim dijagnostikama, ESLint i full Jest (uključujući 11 novih servis
  testova i 12 testova state machine-a) — svi uspješni.
- **PostgreSQL/Redis integration:** migracija `20271130250000_problem_target_reminders` prošla je kroz release
  migrator i `prisma migrate status`, role/privilege provjere, worker recovery i izolovane real-DB suiteove —
  uspješno. Novi paket nema vlastiti DB suite: in-memory fake pokriva claim/finalize semantiku, a idempotencija
  ponovnog slanja naslanja se na postojeće unique ključeve (`Notification.dedupeKey`,
  `NotificationEmailDelivery[userId, dedupeKey]`) koji su već pokriveni.
- **Frontend:** lint, **Prettier format check**, i18n/hooks/accessibility guardovi, `vitest` (panel + `problems` +
  `i18n`), build i bundle budgeti — uspješni.
- **Docs/CI gate/container:** Docs guard, container + supply chain (SBOM/skeneri) i CI gate uspješni.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows` i `E2E install wizard` — push
  workflow ih ne pokreće (dispatch/schedule only); nisu „passed“. Ciljani E2E nije pokretan za ovaj paket.
- **Neuspjeli pokušaji:**
  - [`44066907484`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44066907484) na `1516498`:
    vlastite greške u testovima, ne u proizvodnom kodu. (1) `problems.controller.spec.ts` je zvao konstruktor sa
    šest argumenata (TS2554) jer kontroler sada injektira reminder servis. (2) In-memory fake tabele u novom specu
    servirao je samo composite unique ključ, pa je claim re-read (`findUnique` po `id`) vraćao `null` i svaki
    pokušaj je izgledao neclaimovan — 7 testova palo. (3) Frontend test je tražio `role="alert"` i pogodio i inline
    alert i danger toast (oba imaju `role="alert"`), pa je `findByRole` bacio „Found multiple elements“. Korekcija:
    `61a1491` (sedmi argument, `findUnique` po `id` u fake-u, scoped inline alert + assert na `data-tone="danger"`
    toast). Nakon korekcije svi problems suiteovi (18/129) i panel spec (4) prolaze i lokalno.


## Registar nalaza

- Zatvoreni: `BA-problems-07` (P1) — durable red po problem+target+stage, marker samo po potvrđenom ishodu,
  `NO_RECIPIENT` kao konačan politički ishod, automatski retry/dead-letter i ručni retry, dokazano zelenim CI-jem.
- Ostaju otvoreni u audit 23: `BA-problems-08`–`BA-problems-19`.
- Kontrolni zbir: **446 otvorenih / 248 zatvorenih / 694 ukupno** (P1 173); globalni registar **458 / 238**; Val 7
  **27 / 109** (82 otvorena: 13 P1 / 49 P2 / 20 P3); `problems` **7/19** (12 otvorenih: 0 P1 / 9 P2 / 3 P3).

## Migracija, rollout i rollback

- Nova migracija `20271130250000_problem_target_reminders` (jedan enum, jedna tabela, unique + dva indeksa, FK,
  tri CHECK-a). Add-only; tabela starta prazna, bez backfill-a. Postojeći `targetRemindersSent` markeri ostaju
  važeći, pa problem koji je već dobio stage ne dobija novi red.
- Deployment: standardni `prisma migrate deploy` u okviru redeploya; nema manualnih koraka ni feature flaga.
  `expectedSchemaMigration` je pomjeren, pa starija baza ne prolazi runtime contract provjeru.
- API je kompatibilan: nova polja (`reminderOutcomes`, `targetReminders`) su aditivna, a nove rute traže iste
  permisije kao postojeći problem detail.
- Rollback: aplikacijski rollback je siguran (stare rute ne čitaju novu tabelu; sweep tada ponovno koristi marker,
  pa se najviše ponovi jedan nepotvrđeni podsjetnik). Schema rollback briše samo `ProblemTargetReminder` redove;
  `Problem`, `Ticket` i notifikacije ostaju netaknuti.

## Lokalna provjera i ograničenja

- `node backend/scripts/check-migration-policy.mjs` — 116 migracija, approval hashevi validni.
- `node backend/scripts/check-backend-wiring.mjs` — 99 controllera / 626 ruta, manifest sinhronizovan.
- `node scripts/check-backend-findings.mjs` — 694/694 traceability.
- `node scripts/check-client-neutral.mjs`, `check-hooks-order.mjs` (589 `.tsx`), `check-ticket-id-leaks.mjs`,
  `check-a11y-static.mjs`, `check-theme-contrast.mjs` — svi prolaze.
- Backend: `ts-jest` suiteovi iz `modules/problems` (18 suiteova / 129 testova) i `eslint` nad promijenjenim
  fajlovima prolaze. Frontend: `vitest` (panel 4 + `problems`/`i18n` 58 testova), `eslint` i `prettier --check src`
  prolaze.
- Ograničenja sandboxa: nema izlaza na `binaries.prisma.sh`, pa `prisma generate` nije izvediv; za lokalni
  `ts-jest`/`tsc` korišten je isključivo sandbox stub `backend/src/generated/prisma/client.ts` (gitignored, nije u
  commitu). Delegate-i su u stubu `any`, pa lokalni `tsc` nije dokaz potpune Prisma tipizacije — puni `nest build`
  i `prisma validate` dokazuje CI. PostgreSQL i Redis nisu dostupni lokalno, pa integracija ide kroz CI.

## Sljedeći paket

**W7.26 — `BA-problems-08` (P2):** create problem + početni ticket link nije atomski i može ostaviti orphan problem.
Nije započet prije zelenog gatea za W7.25.
