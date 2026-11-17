# Package closeout — W7.31

**Paket:** W7.31 — stabilan i idempotentan occurrence ključ za problem notifikacije<br>
**Nalaz:** `BA-problems-13` (P2) — zatvoren<br>
**Kodni commit:** `6a3d66a`<br>
**Finalni testani SHA:** `6a3d66a`<br>
**CI:** [`44194131526`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44194131526) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Oba kanala problem notifikacija dedupliciraju po ključu
`problem:<type>:<problemId>:<occurrence>:<userId>` — in-app red kroz unique `dedupeKey`,
e-mail kroz `NotificationEmailDelivery`. Occurrence je bio **vrijeme**:

| notice | stari occurrence |
|---|---|
| `ownerAssigned` | `${ownerUserId}:${Date.now()}` |
| `groupAssigned` | `${groupId}:${Date.now()}` |
| `statusChanged` | `${status}:${Date.now()}` |
| `recurrence` | `randomUUID()` |

Zato je ponovljeni isti poslovni događaj dobijao novi ključ i drugu poruku: retry
`ProblemTargetReminder` reda, replay komande i ponovljeni poziv notifikacije mogli su duplirati
obavještenje, a dedupe u bazi i ledgeru nije mogao to spriječiti jer je ključ bio nov.

Acceptance: occurrence smije zavisiti **samo** od identiteta promjene koja se saopštava. Isti
događaj ⇒ isti ključ ⇒ jedan in-app red i jedan e-mail ledger red po primaocu; različit događaj ⇒
različit ključ; nikakvo čitanje sata ni slučajnost.

## Implementacija

- **Novi modul `problem-notice-occurrence.ts`**: brendirani tip `ProblemNoticeOccurrence` (objekat,
  ne `string`, da se occurrence ne može zamijeniti sa `actorUserId`) i pet derivatora koji ne čitaju
  sat:
  - `problemVersionOccurrence(version)` → `v<n>` — za vlasnika, grupu i status;
  - `problemCreatedOccurrence` → `created` — problem nastaje jednom, pa replay create-a ne šalje
    drugu poruku;
  - `problemHandoffOccurrence(handoffId)` → `handoff:<id>` — svaki korak predaje ima svoj stabilan id;
  - `problemResolutionRunOccurrence(runId, status)` → `run:<id>:<status>` — klijent bira `runId`, pa
    je replay/resume iste runde isti događaj;
  - `problemTargetDueOccurrence(stage, targetAt)` → `target:<stage>:<ISO>` — podsjetnik pripada
    jednom targetu i stageu;
  - `problemRecurrenceOccurrence(ticketRefs)` → `recurrence:<32 hex>` — SHA-256 digest sortiranih
    referenci, pa ponovljeni link batch daje isti ključ, a identifikatori tiketa se ne prenose u
    dedupe payload.
  Svi derivatori fail-closed: prazna referenca, necijelobrojna verzija i prazan recurrence skup bacaju
  grešku umjesto ključa koji bi dijelili svi događaji.
- **`ProblemNotifier`**: `ownerAssigned`, `groupAssigned` i `statusChanged` sada **zahtijevaju**
  occurrence; `recurrence` i `targetDueDetailed` ga izvode sami iz podataka koje već dobijaju
  (reference tiketa, stage + target). `sendDetailed` odbija prazan ključ
  (`PROBLEM_NOTICE_OCCURRENCE_MISSING`), pa budući poziv bez occurrence-a ne može tiho slati svaki put.
  `Date.now()` i `randomUUID` su uklonjeni iz notifikacija.
- **Pozivaoci**:
  - `create` → `problemCreatedOccurrence` (owner ili group grana);
  - `update` → `problemVersionOccurrence(current.version + 1)`, tj. verzija koju je taj write proizveo;
  - `claim` → nema notifikaciju (akter je novi vlasnik), pa nema ni ključa;
  - handoff `request` (auto-accept) i `accept` → `problemHandoffOccurrence(handoffId)`;
  - `POST /problems/:id/status` → `problemVersionOccurrence(problem.version)` za običan status, a
    `problemResolutionRunOccurrence(runId, status)` kada je uključeno grupno rješavanje;
  - `POST /problems/:id/resolution-runs` i `…/:runId/resume` → `problemResolutionRunOccurrence(runId, 'RESOLVED')`.
  Dedupe je **po primaocu**, pa resume iste runde ne ponavlja poruku onima koji su je dobili, ali
  dostavlja je agentima tiketa koji su prvi put riješeni upravo tim resume-om — dozvoljeno ponašanje,
  bez duplikata.
- **Nije obuhvaćeno:** problem notifikacije su i dalje fire-and-forget (greška se loguje, nema
  outbox/replay intencije). To je odvojen, sada lakši posao, jer stabilni occurrence je preduslov za
  durable dispatch; evidentiran je kao `BA-problems-21` (P3).

## Direktni testni dokaz

- `backend/src/modules/problems/problem-notice-occurrence.spec.ts` (6 testova): isti događaj daje isti
  ključ i kada se sistemski sat pomjeri za mjesece; različite verzije/handoff id-evi/runde/stageovi i
  različiti link batch-evi daju različite ključeve; recurrence ključ ne sadrži reference tiketa i ne
  zavisi od reda; nevalidan ulaz baca grešku; ključ je zamrznut.
- `backend/src/modules/problems/problem-notifier-dedupe.spec.ts` (4 testa, mokovani kanali sa
  unique-indeks semantikom): dva poziva `ownerAssigned` sa istim occurrence-om kroz pomjereno vrijeme
  daju **istu** `dedupeKey` vrijednost i tačno jedan in-app red i jedan ledger red; druga verzija
  problema daje novi ključ; replay runde obavještava samo novog primaoca; prazan occurrence je odbijen
  bez ijednog upisa.
- `backend/src/modules/problems/problem-handoff.service.spec.ts`: request/accept sada dokazuju da
  notifikacija nosi upravo `problemHandoffOccurrence(handoffId)`.
- Lokalno: 1.357 testova u `problems` + `audit-log` + `notifications` + `tickets` (1.292 prošlo, 65
  skipped DB suiteova bez baze).

## CI i testni dokaz

CI run [`44194131526`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44194131526) na
`6a3d66a`:

- **Backend:** generisani Prisma client, build/lint, safety-net/wiring/SLA matrica i pun Jest — svi
  uspješni.
- **PostgreSQL/Redis integration:** uspješno.
- **Frontend:** lint/format/testovi/build/budget — uspješno (bez izmjena u frontendu).
- **Docs guard / container + supply chain / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.
- **Neuspjeli pokušaji:** nema; prvi run je bio zelen.

Lokalne provjere: `npx jest` ciljano (problems/audit-log/notifications/tickets), `npx eslint` na svim
izmijenjenim fajlovima. Backend `tsc` i `nest build` lokalno nisu izvršivi bez generisanog Prisma
klijenta (sandbox blokira `binaries.prisma.sh`); tu provjeru nosi CI build job.

## Registar nalaza

- Zatvoreni: `BA-problems-13` (P2).
- Novi: `BA-problems-21` (P3) — problem notifikacije nemaju durable dispatch/replay; stabilni
  occurrence je preduslov i sada je ispunjen.
- Ostaju otvoreni u ovom auditu: `BA-problems-14`, `15`, `16`, `17`, `18`, `19`, `20`, `21`.
- Kontrolni zbir: source/plan **442 otvorena / 254 zatvorena / 696 ukupno** (174 P1 / 371 P2 / 151 P3);
  ovaj registar **452/244**; Val 7 **33/111** (78 otvorenih: 13 P1 / 45 P2 / 20 P3); `problems`
  **13/21** (8 otvorenih: 0 P1 / 4 P2 / 4 P3).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene: `Notification.dedupeKey` i
`NotificationEmailDelivery.dedupeKey` već postoje kao unique ključevi bez dužinskog ograničenja, a novi
ključevi su kraći ili iste dužine kao stari (najduži: `run:<uuid>:RESOLVED`).

Rollout je standardni redeploy API/worker imagea; nema manualnog koraka. Jedina kompatibilnost
napomena: **format ključa se mijenja**, pa notifikacija koja je započeta prije deploya i retry-ovana
poslije može jednom duplirati. Rollback je vraćanje prethodnog imagea; stari ključevi ostaju u bazi i
ne smetaju, jer se novi ključevi razlikuju po formatu.

## Sljedeći paket

**W7.32 — `BA-problems-14` (P2):** scheduler reconciliation i health nakon Redis gubitka ili
registration failurea (hourly job se danas registruje samo na module init, greška se guta, nema
last-sweep/overdue indikatora). Nije započet prije zelenog gatea za ovaj paket.
