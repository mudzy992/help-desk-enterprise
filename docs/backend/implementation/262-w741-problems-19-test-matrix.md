# Package closeout — W7.41

**Paket:** W7.41 — dokazivu izvršavanje problem suiteova i matrica concurrency/failure pokrivenosti<br>
**Nalaz:** `BA-problems-19` (P3) — **zatvoren**<br>
**Kodni commit:** `5d658b2` (dva nova testa + proširen safety-net gate)<br>
**Finalni testani SHA:** `5d658b2`<br>
**CI:** [`44353568657`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44353568657) — zelen<br>
**DB migracije:** nema; **produkcijski kod nije mijenjan**

## Nalaz i acceptance

Audit je 2026-10-23 pokrenuo sve problem specove i dobio **0/8 izvršenih suiteova, 8/8 compile-blocked**
(`Cannot find module '../../generated/prisma/client'`), pa nije bilo nijednog assertion rezultata. Uz to je
ostala lista scenarija bez pokrivenosti: scoped manager/global read, cross-ticket ekspozicija, strani
asset, neovlašteni unlink, delegirano rješavanje stranih/povjerljivih tiketa, pad između problem/ticket
rješavanja, svi-neuspjeli retry, neuspjela dostava podsjetnika, paralelni orphan članka, handoff grupe,
gubitak Redisa i hard truncation.

Acceptance: (1) suiteovi se **izvršavaju**, a ne samo prevode, (2) regresija na „compile-blocked“ mora
rušiti CI, a ne tiho preskočiti testove, (3) svaki scenarij iz liste ima dokaz ili eksplicitno obrazložen
izostanak, (4) concurrency se dokazuje tamo gdje je deterministički dokaziv.

## Dokaz da blokade nema

| Sloj | Broj | Gdje se izvršava |
|---|---|---|
| Unit suiteovi modula `problems` | **33 suitea / 272 testa** | lokalno i CI `npm test` |
| Integracijski suiteovi modula | **2 suitea** (`problem-asset-scope`, `problem-ticket-unlink`) | CI `Backend PostgreSQL + Redis integration` |
| Safety-net gate (`test:safety-net:compile`) | 9 suiteova, od toga **3 problems** | CI korak „Run suites previously blocked by missing generated Prisma types“ |

Tri problems suitea su dodana u safety-net gate (`problem-tickets.service`, `problem-resolution-run.service`,
`problems.controller`) — to je korak koji u CI-ju postoji **upravo** za suiteove koji su bili blokirani
nedostajućim generisanim klijentom. Time nestašica klijenta ponovo ruši build umjesto da testove tiho
preskoči; prije ovog paketa problems suiteovi nisu bili u tom gateu, pa je regresija mogla proći nezapaženo.

## Matrica pokrivenosti (scenariji iz audita)

| # | Scenarij | Dokaz | Sloj |
|---|---|---|---|
| 1 | Scoped problem manager / global read | `problem-access.service.spec.ts` › „keeps scoped ADMIN and PROBLEM_MANAGER permissions inside their assignment OU“, „allows cross-unit problem scope only for an installation-wide manager assignment“ | unit |
| 2 | Cross-ticket ekspozicija (jedan tiket = jedan problem) | `problem-tickets.service.spec.ts` › „applies the canonical ticket predicate…“, „does not remove a link belonging to another problem“, **novo** „turns a lost unique-key race into \u2018the ticket belongs to another problem\u2018“; `problem-ticket-unlink.integration.spec.ts` › „lists and counts only tickets visible under the canonical confidentiality policy“, „does not delete a link concurrently moved to another problem“ | unit + integracija |
| 3 | Strani asset (pretraga/link) | `problem-asset-access.spec.ts` (7 testova), `problem-links.service.spec.ts` › „filters linked assets and suggestions by the CMDB scope of the viewer“, „refuses to link or unlink an asset outside the CMDB scope“; `problem-asset-scope.integration.spec.ts` › „searches only CMDB items inside the asset scope“, „refuses to link a foreign item by id“ | unit + integracija |
| 4 | Neovlašteni unlink | `problem-tickets.service.spec.ts` › „does not unlink when the ticket policy rejects the write“, „checks writable staff access within the transaction before unlinking“; `problem-ticket-unlink.integration.spec.ts` › „serializes competing unlinks: one succeeds, one is not linked“, „maps inaccessible targets to the existing not-found HTTP contract“ | unit + integracija |
| 5 | Delegirano rješavanje stranih/povjerljivih tiketa | `problem-resolution-run.service.spec.ts` › „never delegates confidential tickets and re-proves the delegation on a takeover“; `problem-resolution.service.spec.ts` › „needs problem.close even before looking at the tickets“, „fails closed before loading candidates when ticket policy is unavailable“ | unit |
| 6 | Pad između problem i ticket rješavanja | `problem-resolution-run.service.spec.ts` › „finishes a crashed attempt without resolving the ticket twice“, „stores a pending reply and resumes with the same key when the message failed“ | unit |
| 7 | Svi neuspjeli + retry | `problem-resolution-run.service.spec.ts` › **novo** „reports an every-ticket failure as a failed run that a resume cannot reopen“, „keeps the other tickets going when one fails, and only retries the retryable ones“ | unit |
| 8 | Neuspjela dostava podsjetnika | `problem-target-reminder.service.spec.ts` › „a failing notifier leaves the reminder retryable and writes no marker“, „the hourly pass retries only what is due and dead-letters on the fifth failure“, „a reminder claimed by a live worker is not retried in parallel“ | unit |
| 9 | Paralelni orphan članka | `problem-resolution.service.spec.ts` › „rolls the draft back when the link fails, leaving no orphan article“, „replays the winner when a concurrent create takes the link first“, „creates the draft inside the caller transaction instead of before it“ | unit |
| 10 | Handoff u drugu grupu | `problem-handoff-guards.spec.ts` (status, scope, bystander, cancel, final problem) i `problem-handoff.service.spec.ts` (prihvatanje, duplikat, scope, revoke) | unit |
| 11 | Gubitak Redisa | `sweep/problem-sweep.scheduler.spec.ts` › „restores the schedule after Redis lost it and logs the recovery“, „fails the boot when the mandatory schedule cannot be registered“, „keeps the recovery attempt going when registering fails once“ | unit |
| 12 | Hard truncation | `problem-events-visibility.spec.ts`, `problem-tickets.service.spec.ts` › „reports the real total and hasMore beyond the ticket window“, `problem-links.service.spec.ts` › „announces each capped section…“, „announces a capped reverse list on the asset card“, `problem-service-visibility.spec.ts` | unit (W7.39) |

**Dva nova testa** zatvaraju stvarne praznine, ne prepisuju postojeće: (a) ishod u kojem **svaki** tiket padne
mora biti `FAILED` bez `canResume` i sa odbijenim `resume` (prije je bio pokriven samo mješoviti `PARTIAL`);
(b) izgubljena unique-key trka pri linkanju tiketa mora završiti kao `other_problem` **bez** upisanog linka
i bez history reda od gubitnika (prije je bio pokriven samo pre-check, ne i trka).

## E2E sloj: šta browser ne treba da glumi

Postojeći browser dokazi su `e2e/tests/30-problem-lifecycle.spec.ts` (jedan tok: report → investigate →
known error → resolve tickets → recurrence → close, uz agent deny, stale version, requirements, bulk resolve
i a11y) i `e2e/tests/29-problem-reports.spec.ts` (packovi problema). Oni pokrivaju **korisnički tok**, i to je
prava podjela slojeva:

- **concurrency se ne dokazuje kroz browser.** Dvije transakcije koje se trkaju u milisekundama Playwright ne
  može reproducirati deterministički; dokaz je tamo gdje ima pravu bazu — `problem-ticket-unlink.integration`
  (paralelni unlink, link prebačen drugom problemu) i unique constraint `ProblemTicket.ticketId`.
- **failure putevi** (svi tiketi padnu, dostava podsjetnika padne, Redis izgubi schedule, orphan članak) su
  unit/integration dokazi; browser bi samo dodao vrijeme i flakiness bez nove informacije.

Zato ovaj paket **ne dodaje** nove E2E specove i ne pokreće E2E (pokretanje traži izričitu dozvolu). Ako se
želi ciljani browser dokaz, dovoljno je:

```bash
cd e2e
E2E_BASE_URL=… npx playwright test tests/30-problem-lifecycle.spec.ts tests/29-problem-reports.spec.ts
```

## CI i testni dokaz

CI run [`44353568657`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44353568657) na `5d658b2`:

- **Backend:** generisani Prisma, wiring manifest, build, lint, **prošireni safety-net gate (9 suiteova)**,
  API/worker/scheduler shutdown wiring, SLA matrica i pun Jest — uspješno.
- **PostgreSQL/Redis integration** (2 problems integracijska suitea), **frontend**, **docs**, **container +
  supply chain** i **CI gate** — uspješno.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`.

Lokalno: `src/modules/problems` — **33 suitea / 272 testa** prolaze (s ručnim Prisma stubom u sandboxu; CI
koristi generisani klijent). Frontend nije diran.

## Registar nalaza

- Zatvoreni: `BA-problems-19` (P3).
- Ostaje otvoren u ovom auditu: `BA-problems-21` (P3) — fire-and-forget notifikacije bez outboxa/replaya.
- Kontrolni zbir (prebrojan iz `backend-findings-plan.json` i redova registra): source/plan
  **435 otvorenih / 261 zatvorenih / 696**; ovaj registar **445/251**; Val 7 **40/111** (71 otvoreno:
  13/40/18); `problems` **20/21**.

## Migracija, rollout i rollback

Nema migracije, nema promjene produkcijskog koda i nema promjene API ugovora — paket mijenja samo testove i
CI gate. Rollback je vraćanje prethodne slike; rizik je ograničen na trajanje CI koraka (+~10 s).

## Sljedeći paket

**W7.42 — `BA-problems-21` (P3):** problem notifikacije su fire-and-forget — nema outbox/replay intencije ni
retryja. To je posljednji otvoreni nalaz ovog audita i zatvara `problems` na 21/21. Nije započet prije
zelenog gatea za ovaj paket.
