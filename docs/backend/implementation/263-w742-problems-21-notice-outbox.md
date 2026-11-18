# Package closeout — W7.42

**Paket:** W7.42 — problem notifikacije kao trajne outbox intencije (retry + replay)<br>
**Nalaz:** `BA-problems-21` (P3) — **zatvoren**<br>
**Kodni commit:** `71d0e82` (funkcionalnost), `8ecc8d3` (CI popravke)<br>
**Finalni testani SHA:** `8ecc8d3`<br>
**CI:** [`44388576210`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44388576210) — zelen<br>
**DB migracije:** nema (ponovno korištena postojeća `OutboxMessage` tabela)

## Nalaz i acceptance

Problem notifikacija je bila **fire-and-forget**: `ProblemNotifier.run(label, op)` je pokrenuo dostavu i
zaboravio je (`void op().catch(...)`). Ako SMTP veza padne, ako baza vrati grešku pri upisu in-app reda ili
ako proces umre tokom dostave, poruka je izgubljena i **niko ne zna da je bila dužna**. Retry nije postojao,
replay također, a jedini trag je bio `warn` log.

Acceptance: (1) namjera se **perzistira prije slanja**, (2) neuspjela dostava se **retryja** i može se
**replayati**, (3) dedupe po stabilnom occurrence-u iz W7.31 ostaje (ponovljeni zahtjev ne smije proizvesti
drugu poruku), (4) neuspjela dostava **ne obara** korisničku akciju, (5) vidljivost (health + logovi) i
dead-letter stanje, (6) testovi i zelen CI gate.

## Implementacija

**Jedan topic, jedna tabela.** Iskorištena je postojeća generička outbox infrastruktura
(`TransactionalOutboxService`, tabela `OutboxMessage`, lease 60 s, eksponencijalni backoff, retencija 7 dana,
`ON CONFLICT (topic, dedupeKey) DO NOTHING`) — bez nove tabele i **bez migracije**. Novi topic:
`problem.notice.dispatch`, `maxAttempts = 8` (≈ pola dana retryja).

- `problem-notice-outbox.ts` — unija namjera (`owner-assigned`, `group-assigned`, `status-changed`,
  `recurrence`, `handoff-requested`, `handoff-decided`), dedupe ključ, JSON payload, parser i mapiranje na
  notifier. Payload nosi **samo identifikatore** (`problemId`, `handoffId`, `targetGroupId`,
  `requesterUserId`, `status`, `actorUserId`, `occurrence`) — nikad naslov, opis ni broj tiketa.
- `ProblemNoticeService` — `enqueue(transaction, intents)` upisuje namjeru **u istoj transakciji** kao
  promjena koju objavljuje; `enqueueAfterCommit(intents)` za komande koje se sastoje od više transakcija
  (recurrence nakon linkanja, resolution run u controlleru). Neuspješan upis u transakciji ruši pisanje
  (baza je ta koja ne radi), a neuspješan upis nakon commita je samo `warn` — korisnička radnja je već
  potvrđena.
- `ProblemNoticeOutboxProcessor` (worker-only, `ProblemNoticeWorkerModule`) — svake 2 s claima do 25 redova
  (`FOR UPDATE SKIP LOCKED` + lease), dostavlja kroz postojeći notifier i **ne guta** grešku: outbox odlučuje
  o retryju i dead-letteru. Dead-letter redovi se automatski replayaju **jednom u 15 min** (batch 10, actor
  `problem-notice-dispatcher`), pa i ručni i automatski replay idu kroz istu `replayDeadLetter` operaciju
  (koja bilježi ko je i zašto replayao). `problem_notice_dead_letter_replayed` log nosi id reda.
- Pozivi su pomjereni sa „posalji pa zaboravi“ na „zapiši namjeru“: `create`, `update`, `changeStatus`
  (unutar transakcije), `handoff.request`/`accept`/`decide` (unutar transakcije), `recurrence`
  (nakon commita linka) i četiri run-scoped statusne notifikacije u `ProblemsController`.
- **Occurrence se ne mijenja (W7.31):** `created`, `v<version>`, `handoff:<id>`, `run:<id>:<status>`,
  `recurrence:<digest>`. Outbox dedupe ključ je
  `problem-notice:<kind>:<problemId>:<occurrence>:a<digest actor-a>`; notifier i dalje dedupira **po
  primaocu** (`problem:<type>:<id>:<occurrence>:<userId>`), pa djelimično uspješna dostava na retryju
  stiže samo onima koji je još nisu dobili. Actor je u ključu zato što notifier izuzima aktera iz primatelja
  i zato što `resume` istog resolution runa izvodi **drugi** manager sa istim occurrence-om — ta druga
  komanda mora moći zakazati notifikaciju za agente koje prva nije stigla, dok per-user dedupe čuva da je
  ne dobiju dvaput.
- `status-changed` se upisuje samo za `KNOWN_ERROR` i `RESOLVED`: predikat `problemStatusNoticeWanted` je
  sada u `problems.constants.ts` i koriste ga i notifier i outbox, pa red u redu čekanja nikad nije prazna
  namjera. `ProblemsService.changeStatus` prima `{ statusNotice: 'version' | 'none' }`; resolution run
  prolazi sa `'none'` i sam upisuje run-scoped occurrence — bez toga bi jedan `RESOLVED` kroz run proizveo
  dvije notifikacije.
- **Target reminder ostaje sinhron.** `ProblemTargetReminderService` već ima svoj durable red
  (`ProblemTargetReminder`) sa `attempts`, `nextAttemptAt`, `DEAD` i ručnim retryjem, pa bi outbox bio drugi
  mehanizam za isti posao. `ProblemNotifier.run()` je zato **uklonjen** (nema više nijednog fire-and-forget
  poziva u produkcijskom kodu).
- **Vidljivost:** `ProblemOperationsSignal.noticeOutbox` nosi `pending`, `processing`, `deadLetter` i
  `oldestPendingMinutes`; kartica „Zdravlje sistema“ dobija dva polja (red čekanja + starost najstarijeg,
  crveno ako red stoji > 5 min) i broj mrtvih redova, uz objašnjenje da red koji se ne prazni znači da worker
  ne radi. Nijedan novi alarm-key nije uveden: mrtav red je vidljiv na kartici i u logu, a ne otvara alarm
  sam po sebi (isto načelo kao W7.40 za zaostatak).

**Šta nije obuhvaćeno:** realtime `publish()` ticket događaja (efemerno po prirodi, nije notifikacija),
`targetDue` podsjetnici (imaju svoj durable red), notifikacije drugih modula (imaju svoj fan-out outbox) i
UI za ručni replay outbox reda (replay je dostupan kroz `TransactionalOutboxService.replayDeadLetter` i
automatski; poseban admin ekran nije dio ovog nalaza).

## Direktni testni dokaz

- `problem-notice-intent.spec.ts` — namjera je **u istoj transakciji** (`expect(enqueue.mock.calls[0][0]).toBe(tx)`)
  za `create`, `update` (promjena vlasnika) i `changeStatus`; `INVESTIGATING` ne upisuje ništa;
  `statusNotice: 'none'` potiskuje version occurrence (run vlada occurrence-om); neuspješan upis namjere
  **ruši** statusnu promjenu (`rejects`).
- `problem-notice-outbox.spec.ts` — dedupe ključ je stabilan za isti occurrence i različit za drugu verziju,
  drugi kind i drugog aktera; ključ je unutar `^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$` (i za najduži run
  scenario); payload round-trip za svih šest namjera; payload **ne sadrži** broj tiketa; parser odbija
  nepoznat `kind`, verziju i nedostajuće polje; dispečer mapira svaku namjeru na tačan notifier poziv i
  propagira grešku dostave.
- `problem-notice-outbox.processor.spec.ts` — dostava do `idle`, prekid na `retry`/`dead-letter`, zaštita od
  re-entrancyja, greška dostave **izlazi** iz procesora (outbox radi retry), dead-letter replay jednom u
  cooldownu uz toleranciju na `OUTBOX_REPLAY_CONFLICT` (druga replika je bila brža) i backlog snapshot.
- `problem-notice.service.spec.ts` — topic/`maxAttempts`/dedupe key, prazna lista je no-op, neuspješan
  insert u transakciji se propagira, `enqueueAfterCommit` piše kroz plain klijent i **ne** baca.
- `problem-handoff.service.spec.ts` — prepisan sa `notifier.*` na `queued(notices)`: auto-accept upisuje
  `group-assigned`, pending upisuje `handoff-requested`, accept upisuje **obje** namjere, reject/cancel
  `handoff-decided` — sve unutar transakcije handoff koraka.
- `collect-problem-operations-signal.spec.ts` — tri odvojena pitanja (PENDING / PROCESSING / DEAD_LETTER),
  starost se mjeri **samo** za PENDING redove.
- `ops-health-metrics.spec.tsx` — polja reda čekanja i mrtvih redova, uz slučaj starijeg API-ja koji ih ne
  šalje (sekcija ih tada ne prikazuje).
- `problem-notifier-visibility.spec.ts` — recurrence sada prima occurrence; payload i dalje ne sadrži
  identifikator tiketa.

## CI i testni dokaz

CI run [`44388576210`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44388576210) na `8ecc8d3`:

- **Backend:** generisani Prisma, provjera wiring manifesta (**99 controllera / 631 ruta**, worker lista sa
  `ProblemNoticeWorkerModule`), build, lint, safety-net gate (13 suiteova) i pun Jest — uspješno.
- **PostgreSQL/Redis integration:** postojeći problems integracijski suiteovi — uspješno.
- **Frontend:** lint, **format (Prettier)**, 459 test fajlova / 1815 testova (uključujući module-size gate),
  build i bundle budget — uspješno.
- **Docs/container/CI gate:** uspješno.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`.

**Neuspjeli pokušaji (vlastite greške, popravljene prije zelenog gatea):**

1. [`44382706589`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44382706589) na `71d0e82` —
   `Backend build + test` i `Frontend build + test` **failure**. Uzroci su bili moji, ne infrastrukturni:
   (a) `check-backend-wiring.mjs` nije našao `ProblemNoticeWorkerModule` u manifestu jer manifest nije
   regenerisan; (b) ts-jest u CI-ju type-checka specove, a novi intent spec je prosljeđivao goli `{}` na
   mjesto `TicketAccessPolicyBinder`, a service spec je čitao `mock.calls[0]` netipiziranog `jest.fn()`;
   (c) `prettier --check` je odbio dvije frontend datoteke; (d) `ops-health-metrics.tsx` je narastao na 523
   linije i pao module-size budžet od 500. Popravke: `96489fd` (manifest + tipovi specova + format) i
   `8ecc8d3` (Prettier + izdvajanje sekcije u `ops-health-problem-operations.tsx`).
2. [`44384009505`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44384009505) na `96489fd` —
   `Backend build + test` (tri `ProblemOperationsSignal` literala u `evaluate-ops-signals.spec.ts` bez novog
   obaveznog `noticeOutbox` polja) i `Frontend build + test` (module-size budžet). Popravljeno u `8ecc8d3`.

Lokalno (sandbox sa ručnim Prisma stubom): `src/modules/problems` **37 suiteova / 301 test** i
`src/modules/ops-health` **14 suiteova / 165 testova** prolaze; `app.module.spec`, `worker.module.spec`,
`scheduled-jobs.wiring.spec` i `problems.controller.spec` prolaze (novi worker modul se DI-gradi); eslint
čist na diranim fajlovima; frontend `vitest` 10/10 i `tsc --noEmit` bez greške.

## Registar nalaza

- Zatvoreni: `BA-problems-21` (P3).
- `problems` audit je time **21/21 zatvoren** — nema više otvorenih nalaza u `23-problems.md`.
- Kontrolni zbir (prebrojan iz `backend-findings-plan.json` i redova registra): source/plan
  **434 otvorenih / 262 zatvorenih / 696**; ovaj registar **444/252**; Val 7 **41/111** (70 otvoreno:
  13 P1 / 40 P2 / 17 P3); `problems` **21/21**.

## Migracija, rollout i rollback

Nema migracije: koristi se postojeća `OutboxMessage` tabela i njen `(topic, dedupeKey)` unique constraint.
Nema promjene API ugovora; kartica zdravlja dobija **opciona** polja (`noticeOutbox`), pa stariji API u
rolling deployu samo ne prikaže ta dva polja. Rollout: API upisuje namjere, worker ih dostavlja — oba procesa
moraju biti na novoj verziji da bi se red praznio; tokom deploya red samo raste i prazni se odmah nakon
podizanja workera (`drain()` se poziva i na `onModuleInit`). Rollback je vraćanje prethodne slike: zaostali
redovi ostaju u tabeli, a stara verzija ih ignorše (nema čitača tog topica) — nema gubitka podataka ni
duplih poruka, jer stara verzija šalje sinhrono sa istim occurrence dedupe-om, a redovi istječu za 7 dana.

## Sljedeći paket

`BA-problems-21` je bio posljednji otvoreni nalaz audita `problems`, pa se vraća na naloženi redoslijed P3
paketa: **`notifications-14`**, zatim websocket 12–14, integration-queue 13–15 i inbound-email 11–13
(korisnik je ranije preskočio na `problems`). Naredni paket nije započet prije zelenog CI-ja za ovaj.
