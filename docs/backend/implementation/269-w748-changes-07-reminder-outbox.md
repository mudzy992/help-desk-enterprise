# Package closeout — W7.48

**Paket:** W7.48 — reminder/overdue markica samo uz retryable, persistiranu isporuku<br>
**Nalaz:** `BA-changes-07` (P1) — **zatvoren**<br>
**Kodni commit:** `e61ffee`<br>
**Finalni testani SHA:** `e61ffee`<br>
**CI:** [`44473902632`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44473902632) — zelen (16m26s)<br>
**DB migracije:** nema (reuse postojeće `OutboxMessage` tabele i `OutboxModule`-a)

## Nalaz i acceptance

Audit `24-changes.md` §9 i §19 točka 6: `ChangeSweepService.run()` je radio `updateMany` kojim **prvo** postavlja
`reminderSentAt` / `overdueNotifiedAt`, zatim pisao `ChangeEvent`, a tek onda zvao `ChangeNotifier`. Pad
notifikacije je završavao u `catch`-u sa `logger.warn` — markica je ostajala postavljena, primaocu ništa nije
stiglo, ponovnog pokušaja nije bilo (markica je ujedno i `where` filter sljedećeg sweepa), a `overdue` je bio
potpuno izgubljen jer se `IMPLEMENTING` change rijetko vraća u taj prozor. Markica je dakle tvrdila „poslano“
za isporuku koja nije ni pokušana.

Acceptance: (1) markica postoji **samo** uz persistiranu, retryable namjeru isporuke, (2) pad isporuke ne
ostavlja markicu koja tvrdi „poslano“ i ne gubi notifikaciju, (3) concurrent workers i ponovni run ne šalju
isti podsjetnik dvaput, (4) zaglavljena isporuka je operativno vidljiva, (5) zelen CI gate.

Odluka o pristupu: markica se **ne** pomjera iza isporuke. Da se postavlja nakon slanja, dva radnika bi mogla
pročitati isti `null` i poslati dvaput — upravo suprotno nalazu. Umjesto toga markica i outbox `INSERT` idu u
**istu transakciju**: markica tada znači „namjera je trajno zapisana i garantovano ponovljiva“, a retry je
vlasništvo outboxa. To je jedini oblik u kojem su oba zahtjeva (bez dvostrukog slanja i bez tihog gubitka)
istovremeno istinita.

## Implementacija

- **`changes/sweep/change-reminder-outbox.ts` (novo)** — topic `change.reminder.dispatch`,
  `maxAttempts = 8`, `changeReminderPendingWarningAgeMs = 15 min`; `changeReminderOccurrence(kind, facts)`
  vezuje namjeru za **prozor** (`s<plannedStart epoch>` / `o<plannedEnd epoch>`), pa pomjeren prozor dobija
  novi ključ, a isti prozor nikad drugi red; `changeReminderDedupeKey()` daje
  `change-reminder:<kind>:<changeId>:<occurrence>` (prolazi outbox `keyPattern`, 8–160 znakova);
  `enqueueChangeReminder()` prima **transaction** i prosljeđuje ga u `TransactionalOutboxService.enqueue`;
  `readChangeReminderPayload()` je fail-closed (odbija ne-objekte, prazan/predugačak `changeId`, nepoznat
  `kind`, `occurrence` koja nije `^[so]\d{1,16}$`).
- **`changes/sweep/change-sweep.service.ts`** — `run()` više ne zove notifier i više ne piše markicu izvan
  transakcije. Za svakog kandidata: `$transaction` → uvjetni `updateMany` (claim; `status` + `null` markica) →
  `changeEvent.create` (`action: 'reminder'`, `detail.kind`) → `enqueueChangeReminder`. Ako `count === 0`,
  transakcija vraća `false` i ne piše ništa (drugi radnik je već claimovao). Ako bilo koji korak padne,
  transakcija se rollbackuje: markica ostaje `NULL`, pa je sljedeći sweep ponovo razmatra, a greška se loguje
  kao `change_sweep_enqueue_failed change=<id>` i **ne prekida** ostatak batcha. `ChangeNotifier` je uklonjen
  iz konstruktora (isporuka je sada odgovornost dispatcher-a).
- **`changes/sweep/change-reminder-outbox.dispatcher.ts` (novo)** — `OnModuleInit` timer 2 s, `drain()` radi do
  25 `dispatchOne` poziva po ticku dok ne dobije `idle`; `deliver()` čita payload fail-closed i zove
  `notifier.startingSoon()` / `notifier.overdue()`. Pad isporuke se **ne hvata** — propušta se do outboxa
  (retry sa backoffom, na kraju `DEAD_LETTER`), pa se notifikacija ne gubi. Lease/heartbeat/`claimLost` logiku
  drži `TransactionalOutboxService`.
- **`changes/sweep/change-sweep-worker.module.ts`** — registruje `ChangeReminderOutboxDispatcher` u worker
  kontekstu (uz postojeći `OutboxModule` import).
- **`ops-health/ops-health.service.ts`** — novi `changeReminderOutbox` u `components`: `pending`,
  `processing`, `deadLetter`, `oldestPendingAgeMs`, `status: 'degraded'` kad postoji dead-letter ili najstariji
  aktivni red čeka ≥ 15 min. Time zaglavljena isporuka podsjetnika izlazi na operativnu ploču, umjesto da
  postoji samo u tabeli.
- **Frontend:** `ChangeReminderOutboxHealth` tip (alias na postojeći outbox health oblik), pločica
  „Red podsjetnika na promjene“ u `ComponentGrid`, i18n `changeReminderOutbox` / `changeReminderOutboxValue`
  (bs/en), i `overallOpsState()` tretira `degraded` kao `degraded` (odsutno polje tokom rolling deploya **ne**
  obara stanje, jer je polje opcionalno).
- **Nije promijenjeno:** `planChangeReminder()` (čista funkcija, i dalje pokrivena `plan-change-reminders.spec.ts`),
  `ChangeNotifier` implementacija i šabloni, raspored BullMQ sweep posla (i dalje kvartalni tick), retencija
  outboxa i replay alat (postojeći `TransactionalOutboxService.replayDeadLetter`). Klasifikacija notifikacija
  po primaocima ostaje u domenu `BA-changes-12`/notifications paketa.

## Direktni testni dokaz

- `change-sweep.service.spec.ts` (6 testova) — modul isključen ⇒ nema upita ni namjere; sretan put dokazuje da
  se markica **nikad** ne piše van transakcije (`prisma.changeRequest.updateMany` nije pozvan), da `updateMany`
  ide sa `status` + `null` markicom, da `ChangeEvent` i `enqueue` idu u **istu** transakciju i sa tačnim
  `topic`/`dedupeKey`/`maxAttempts`; overdue grana koristi `plannedEnd` prozor; izgubljeni claim (`count: 0`)
  ne piše event ni namjeru; pad `enqueue`-a ⇒ transakcija pukla, brojači ostaju 0, log
  `change_sweep_enqueue_failed`, run se ne ruši; kandidat koji planner više ne smatra dospjelim ne otvara
  transakciju.
- `change-reminder-outbox.spec.ts` (4 testa) — occurrence je vezan za prozor i odbija `null` datum; dedupe ključ
  prolazi outbox regex i mijenja se kad se prozor pomjeri; `enqueue` dobija **transaction klijenta** i tačan
  payload; parser prihvata ispravan payload i odbija 8 malformiranih oblika.
- `change-reminder-outbox.dispatcher.spec.ts` (4 testa) — drena preko `dispatchOne(topic, handler)` i staje na
  `idle`; `starting_soon`/`overdue` idu u odgovarajuću notifier metodu; pad notifiera se propagira (dokaz da
  isporuka ide u outbox retry); malformiran payload se odbija **prije** ijedne notifikacije.
- `ops-health.service.spec.ts` (+1 test) — backlog reminder topica se prijavljuje (`pending: 3`,
  `oldestPendingAgeMs: 60_000`) i dead-letter ga degradira.
- Frontend: `vitest src/lib/ops src/components/admin/ops-health-sections.spec.tsx src/i18n` — 11 fajlova /
  72 testa; `tsc --noEmit`, `eslint` i `prettier --check` čisti.

## CI i testni dokaz

CI run [`44473902632`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44473902632) na `e61ffee`
(2026-11-19T06:40:37Z → 06:57:03Z):

- **Backend:** `Detect changes`, generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest
  (uključujući tri nova speca) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes` i `ops-health` suiteovi — uspješno.
- **Frontend build + test:** lint, format, testovi, build i bundle budget — uspješno.
- **Docs guard / Backend container + supply chain / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard` — E2E
  pokreće korisnik; pattern inventory se pokreće samo na izmijenjeni service-form set.
- **Neuspjeli pokušaji:** nema — prvi run je zelen.

Dodatne lokalne provjere i ograničenja: `changes` + `ops-health` 18 suiteova / 181 test prolazi; cijeli backend
unit run 884 suitea (3 preostala sandbox artefakta: `announcement-delivery` traži
`--experimental-vm-modules`, `disk-...streaming` i `problem-mentions` ovise o generisanom Prisma klijentu).
`npx prisma generate` u sandboxu ne može dohvatiti engine binarni paket, pa je lokalno korišten
`src/generated/prisma` stub (gitignored) — CI generiše pravi klijent i tamo je tipizacija dokazana. Tokom rada
je otkriven i ispravljen stvarni propust koji je jedinični testovi propuštali: dispatcher je uvozio
`TransactionalOutboxService` kao **type-only**, pa je Nest DI dobijao `undefined` na indexu 0 — uhvaćeno
`worker.module.spec.ts` boot testom i popravljeno prije commita.

## Registar nalaza

- Zatvoreni: `BA-changes-07` (P1) — `24-changes.md` red je `zatvoreno`, closeout §26.
- Ostaju otvoreni u `24-changes.md`: 13 nalaza, **P1: nijedan** (`08`–`20`, P2/P3).
- Kontrolni zbir: plan **428 otvoreno / 268 zatvoreno / 696**; Val 7 **64 otvoreno / 47 zatvoreno / 111**
  (P1 7 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **438 / 258 / 696**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene: namjere isporuke žive u postojećoj `OutboxMessage` tabeli (topic
`change.reminder.dispatch`), a markice su postojeće kolone `ChangeRequest.reminderSentAt` /
`overdueNotifiedAt`. Nema novih ruta ni promjene postojećih odgovora; `GET /ops/health` dobija opcionalno
`components.changeReminderOutbox` (stariji frontend ga ignoriše, novi frontend tretira odsutno polje kao
nepoznato bez degradacije). Deploy je kompatibilan u oba smjera: ako worker počne pisati namjere prije nego
što dispatcher radi, redovi čekaju u `PENDING` i dreniraju se prvim tickom; ako se dispatcher ugasi, markica
ostaje istinita (isporuka je zapisana) i `ops-health` pokaže backlog. Markice postavljene **prije** deploya
(`reminderSentAt`/`overdueNotifiedAt` bez outbox reda) se ne mogu rekonstruisati — to su istorijski gubici
opisani nalazom i ne mijenjaju se retroaktivno. Rollback: revert `e61ffee` (redovi topica
`change.reminder.dispatch` ostaju kao bezopasni `PENDING`/`DEAD_LETTER` zapisi; stari kod ih ignorše).

## Sljedeći paket

**W7.49 — `BA-knowledge-base-01` (P1):** prvi P1 nalaz knowledge base audita. Nije započet prije zelenog
gatea za ovaj paket.
