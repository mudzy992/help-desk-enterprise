# Triage noćnog CI-ja 2026-11-22 (run 44999494543): crveno je bilo u reporteru, ne u proizvodu

**Kontekst:** scheduled `CI` run [`44999494543`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44999494543)
na `master` SHA `a6686d9` (W7.84). Zeleni: `Detect changes`, `Docs guard`, `Backend build + test`,
`Backend container + supply chain`, `Frontend build + test`, `Backend PostgreSQL + Redis integration`. Crveni:
`E2E critical flows` i `CI gate`.
**DB migracija:** nema<br>
**Novi nalaz u registru:** nema — ovo nije Val 7 paket nego popravka CI reportera i dijagnostike grešaka.

## Šta je run zaista uradio

`Run E2E (smoke on a pull request, full on schedule / dispatch)` (**korak 11**) je **završio zeleno**:

```
Playwright (results.json): 124 passed, 0 failed, 3 flaky, 1 skipped.
```

Zajedno sa tim, `stack-watch.json` je zabilježio **flapping** stakla: `GET /health` je padao u četiri navrata između
`2026-11-22T07:56:43Z` i `2026-11-22T08:13:28Z` (17 minuta), ali nikad **4 uzastopna** probe, pa watchdog
(`E2E_STACK_FAILURES_TO_ABORT=4`) nije zaustavio run — otuda `aborted: false` i 4 `::warning title=E2E stack probe
failed::` anotacije umjesto prekida. Tri flaky testa su pala unutar tog okna i prošla na retry:

| Test | Poruka | Grupa |
|---|---|---|
| `09-config-ops` (validate → shadow → activate → rollback) | `ApiRequestError: CONFIG_VALIDATION_FAILED: {…"details":{}}` | (C) dijagnostika + (A) paralelni katalog |
| `15-workflow-unrouted-realtime` | `page.goto` prekinut sa `chrome-error://chromewebdata/` | (A) outage |
| `21-status-monitoring` | `NETWORK POST … failed (UND_ERR_CONNECT_TIMEOUT …)` | (A) outage |

`38-users-groups-rbac` je **preskočen namjerno**: destruktivna trka „zadnja dva aktivna SuperAdmina” traži instalaciju
u kojoj je konfigurisani račun **jedini** aktivni lokalni SuperAdmin sa **jednom** dodjelom; skip nosi brojeve u
razlogu (`results.json`), pa se ne računa kao pokrivenost.

## Uzrok 1 — crveni job: reporter je pukao, ne testovi

Korak 13 (`Report the stack probe timeline`) bio je jedini crveni korak. Bio je inline shell sa `set -u` koji u
`::error` anotaciji čita `$E2E_API_URL` — a ta varijabla postoji **samo u `env:` drugih koraka** (Preflight, E2E run);
na nivou `e2e` joba definisani su samo `E2E_SSH_*`. Reprodukcija istog snippet-a sa `stack-watch.json` koji ima
outage i bez `E2E_API_URL`:

```
$ env -u E2E_API_URL bash step.sh; echo $?
stack-watch.json: {"aborted":false,…,"outage":{…}}
step.sh: line 12: E2E_API_URL: unbound variable
1
```

Dakle reporter je padao **tačno kad ima šta da prijavi**: mirna noć bi bila zelena, a svaki outage — čak i onaj koji
testovi prežive — pretvarao se u crveni gate. Isti korak je padao i u ranijim noćima
([`44699058066`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44699058066),
[`44486788126`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44486788126)), ali tamo je korak 11 već bio
crven pa se šum nije vidio.

## Uzrok 2 — zašto flaky `09-config-ops` nije imao razlog

Tijelo odgovora je bilo `CONFIG_VALIDATION_FAILED` sa `details: {}`. Razlog nije bio prazan u proizvodu:
`ConfigVersioningError` nosi listu problema (`ConfigValidationIssue[]`), a globalni filter
(`backend/src/common/request-context/format-error-response.ts`, `buildDetails`) je **odbacivao svaki `details` koji je
niz** i vraćao `{}`. Isto je važilo za `NotificationPreferencesError` (lista nerazrješivih preferencija). Klijent je
dobijao kod bez ijednog razloga — tačno u slučaju gdje je razlog cijeli odgovor. I `ApiRequestError` je nosio samo
`CODE: <body>`, bez metode i putanje, pa se iz tri pokušaja u `09-config-ops` (create → validate → shadow → activate →
rollback) nije moglo reći **koji** poziv je odbijen.

## Rješenje

1. **Reporter je sada testirana skripta** — `e2e/scripts/report-stack-outage.mjs` (+ `report-stack-outage.test.mjs`,
   **8 testova**). Čita `stack-watch.json` (API ime iz `apiUrl`, nikad iz okruženja), ispiše timeline, doda step
   summary i **uvijek izlazi 0** — i kad fajl ne postoji i kad je nečitljiv (tada `::warning`, ne pad). Nivo anotacije
   je namjeran: **warning** kad je staklo vraćeno i testovi su odlučili job, **error** kad je watchdog zaustavio run
   (taj run je već crven, anotacija ga objašnjava). Workflow korak 13 sada je
   `node scripts/report-stack-outage.mjs stack-watch.json`; test je dodat u „Test the JSON summarizer and the stack
   watchdog”.
2. **Lista u `details` više se ne odbacuje** — `buildDetails` vraća `details.issues` za niz, a record payload
   zadržava svoje ključeve (`fields`, `blockers`, …) i dalje se spaja sa `messages`. Dva nova testa u
   `format-error-response.spec.ts` (**7** u suiteu).
3. **`ApiRequestError` imenuje poziv** — poruka zadržava prefiks `CODE: <body>` (na koji se oslanjaju postojeće
   asercije) i dodaje `(from POST /config-versioning/…/rollback)`; `details` ostaje polje. Novi offline test
   `e2e/unit/api-client-error-context.spec.ts` (**2 testa**).

## Dokaz (lokalno, bez stakla)

| Provjera | Rezultat |
|---|---|
| `npx jest src/common/request-context` (backend) | **9 suite / 29 testa** ✓ (uključujući 2 nova) |
| `node --test scripts/report-stack-outage.test.mjs` | **8/8** ✓ (missing file, unreadable, healthy, recovered outage ⇒ warning, aborted ⇒ error, epizode, API iz artefakta, step summary) |
| `node --test scripts/summarize-playwright-json.test.mjs scripts/run-e2e.test.mjs scripts/report-stack-outage.test.mjs` | **38/38** ✓ (kako ih CI pokreće) |
| `npx playwright test -c unit/playwright.config.ts` (e2e) | **8 testa** ✓ (2 nova) |
| `npx tsc --noEmit -p e2e/tsconfig.json` | ✓ |
| `node scripts/check-workflows-yaml.mjs` + test | ✓ |
| `eslint` na diranim backend fajlovima | ✓ |

Uzrok 09 flake-a nije mogao biti potvrđen iz logova (sandbox ne može dohvatiti job logove ni artefakte), pa je
dijagnostika popravljena da sljedeći put kaže razlog.

## Preostali rizik (dokumentovan)

1. **`09-config-ops` klasa flake-a ostaje.** Rollback validira **historijski** snapshot spojen sa **trenutnim**
   katalogom/forms (`buildRollbackSnapshot`), a `validateRoutingSnapshot` traži pokrivenost svakog `ACTIVE` servisa ×
   svaku OU (`ROUTING_UNCOVERED`). U paralelnom full suite-u druge specifikacije u tom trenutku prave/brišu servise,
   OU i grupe, pa snapshot može sadržati kombinaciju koju niko nije konfigurisao. Sa `blockActivationOnError` to je
   **fail-closed odbijanje** — legitimno, ali je posljedica dijeljenog stakla, ne regresija. Sljedeći korak (nije
   urađen ovdje, traži odluku): ili serijalizovati destruktivne config/katalog specifikacije, ili rollback validirati
   nad trenutnim stanjem uz eksplicitan `details.issues` (sada vidljiv).
2. **Outage koji testovi prežive ne obara gate.** To je namjerna odluka (testovi odlučuju job; infra je warning +
   step summary). Ako želite da i takav run bude crven, to je jedan nivo anotacije u `outageAnnotation`.
3. **Watchdog ne prekida flapping.** Traži 4 **uzastopna** neuspjeha (~45–60 s); četiri kratka ispada u 17 minuta ga
   ne aktiviraju. To je postojeći dizajn (`E2E_STACK_FAILURES_TO_ABORT`), samo sada vidljiv u summary tabeli kao
   `Failure episodes`.

## Sljedeći paket

**W7.86 — `BA-knowledge-base-13` (P2): scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view
flush.**
