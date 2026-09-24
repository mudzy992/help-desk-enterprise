# Staging checklist — zatvaranje 3 rizika iz `perf/results/after-f4-2026-09-24.md` §7

Ovo je radna lista za četiri mjerenja koja pretvaraju „kod-nalaz" u „izmjereno".
Redoslijed je namjeran: 1 i 2 su jeftini i hvataju infrastrukturne pretpostavke,
3 daje brojke za SLO tabelu, 4 odlučuje da li je potrebna opcija A za notifikacije.

**Prije početka**

| Šta | Zašto |
|---|---|
| Staging okruženje s **2 API instance** iza LB-a | rizik 3 (sticky/drain) se ne može izmjeriti na jednoj instanci |
| Redis koji aplikacija koristi (`REDIS_URL`) i ACL user `ephelpdesk` | kanali adaptera su već u `ops/redis-acl.line` |
| k6 ≥ 0.46 | `winget install k6 --source winget` (Windows) ili `brew install k6` |
| Test nalozi na stagingu (`agent.it@…`, `requester@…`) | `perf/config.js` ih čita iz env-a |
| 100k tiketa (stavka 3) | `ops/sql/seed-large-dataset.sql`; bez toga lista/SLA skener nisu na realnoj veličini |

Sve komande ispod imaju `<…>` na mjestima gdje upisuješ svoje vrijednosti. Lozinke
drži u shell varijablama (`export REDIS_PASSWORD=…`) da ne završe u historiji fajla.

---

## 1. Cross-instance emit + rolling deploy *(rizik 3, ~1 h)*

> **Rezultat 2026-09-24 (server mudzy-server, `REDIS_URL=redis://ephelpdesk:***@127.0.0.1:6379`):**
> preflight 6/6 ✔ (AUTH, PING, PUBLISH, PSUBSCRIBE `socket.io#/#*`, SUBSCRIBE request/response),
> dokaz ✔ — klijent na instanci B primio `group.feed-changed` emit s instance A. **Cross-instance emit DOKAZAN.**
> Rolling deploy (ispod) i dalje otvoren.

**1a. Dokaz da dvije instance dijele sobe** (skripta diže dva Socket.IO servera s
pravim Redis adapterom i pravim klijentom — ne treba aplikacija, samo Redis):

```bash
# u repo rootu; trebaju node_modules u backend/ i frontend/ (npm install u oba)
export REDIS_URL='redis://ephelpdesk:<REDIS_PASSWORD>@<redis-host>:6379'

# prvo SAMO Redis + ACL (ne diže servere) — kaže TAČNO gdje je problem
node ops/ws-cross-instance-check.mjs --preflight

# pa puni dokaz
node ops/ws-cross-instance-check.mjs
```

Očekivano: `✔` i izlazni kod 0.

**Izlazni kodovi** (razlikuju „nije dokazano" od „nije ni mjereno"):

| Kod | Značenje |
|---|---|
| 0 | dokazano — emit s instance A stigao je klijentu na instanci B |
| 1 | adapter nije prenio — Redis je zdrav, dokaz nije prošao |
| 2 | Redis nedostupan ili ACL odbija kanale — vidi ispis preflighta |
| 3 | greška harnessa / provjera je neispravna, nije presuda o adapteru |

Kod 2 s `ECONNRESET` uz tunel koji pokazuje `LISTENING` znači: ssh prihvati vezu
lokalno, pa ne uspije otvoriti kanal do cilja (najčešće `redis-core` je Docker
mrežno ime koje SSH server ne razrješava). Tražiti u `ssh -v` ispisu:
`channel N: open failed: connect failed: <razlog>`, pa tunel usmjeriti na **IP
kontejnera** ili na objavljeni host port, a ne na Docker mrežno ime.
Kod 2 s `NOPERM ... access a channel` znači ACL: dodati **aditivno**, bez
`resetchannels` — `ACL SETUSER ephelpdesk &socket.io#/#*` pa `ACL SAVE`
(`PSUBSCRIBE` traži literalno poklapanje patterna; `&socket.io#*` ne pokriva
`socket.io#/#*`). Detalji u `ops/runbook/redis-down.md`.

**Prečac bez tunela:** aplikacija već sama sebi dokazuje adapter pri startu —
u API logu svake instance tražiti `ws_adapter_redis_ok=1`. Ako je umjesto toga
`ws_adapter_redis_acl_denied channel=...`, instanca radi s in-memory adapterom i
sobe su samo lokalne (vidi `ops/ws-rolling-deploy.md`).

**1b. Rolling deploy s dvije instance** (drain + reconnect, `ops/ws-rolling-deploy.md`):

1. otvori klijenta (browser) na instancu A, ostavi WS otvoren;
2. ugasi instancu A i gledaj log instance B: klijent se mora reconnectovati bez
   ručnog refresha;
3. ponovi s instancom B.

Upisati u izvještaj: je li reconnect prošao, koliko je trajao, je li bilo
`ws_reconnect_storm` upozorenja (ako jest — `ops/runbook/ws-reconnect-storm.md`).

---

## 2. `perf-smoke` s pravim brojkama *(rizik 1 — prvi dio, ~10 min)*

Workflow se **ne** pokreće na push u `arena/*` granu; pokreće se na
`pull_request` prema `master`/`main` i ručno (`workflow_dispatch`). Prvi run je
pokrenut na PR-u #2; ponovni runovi:

- UI: **Actions → Perf smoke → Run workflow** (grana `arena/01a0cefc-help-desk-enterprise`),
- ili lokalno u repo-u: `gh workflow run perf-smoke.yml --ref arena/01a0cefc-help-desk-enterprise`.

Artefakti (k6 summary + `api.log`) se skidaju iz runa:

```bash
gh run list --workflow=perf-smoke.yml --limit 3
gh run download <run-id> -D /tmp/perf-smoke-<run-id>
```

Brojke iz ovog runa idu u `PERF_BUDGETS.md` §1 kao **prvi CI smoke** (200 VU / 5 min,
pragovi ×2,5) — nije zamjena za stavku 3.

---

## 3. Puni profil na stagingu *(rizik 1 — glavni dio, ~½ dana)*

**3a. Dataset** (jednom; vidi zaglavlje SQL-a za detalje):

```bash
psql "$STAGING_DATABASE_URL" -v seed_count=100000 -f ops/sql/seed-large-dataset.sql
# na kraju ispisuje kontrolu: seed_tickets, due_now, i EXPLAIN skenera (mora biti Index Scan)
```

**3b. Uzmi IDs i naloge** koje scenariji traže:

```bash
psql "$STAGING_DATABASE_URL" -Atc "SELECT string_agg(id, ',') FROM (SELECT id FROM \"Ticket\" WHERE title LIKE '[staging-seed]%' LIMIT 30) s"
```

**3c. DB snapshot prije/poslije** (da se vidi gdje baza provodi vrijeme — k6 vidi samo latenciju):

```bash
psql "$STAGING_DATABASE_URL" -f ops/sql/enable_pg_stat_statements.sql   # jednom
psql "$STAGING_DATABASE_URL" -f ops/sql/snapshot_db_stats.sql > perf/results/staging-<datum>.db-before.txt
```

**3d. Run** (k6 s tvoje mašine prema staging API-ju):

```bash
export BASE_URL='https://<staging-api>'
export AGENT_EMAIL='<agent>' AGENT_PASSWORD='<…>'
export REQUESTER_EMAIL='<requester>' REQUESTER_PASSWORD='<…>'
export TICKET_IDS='<ids iz 3b>' SEARCH_TERM='<pojam>'
export REPORT_LABEL=staging-<datum>
k6 run perf/full.js            # puni profil: 2800 VU / 30 min
# brži uvid: k6 run -e VU=800 -e DURATION=10m -e REPORT_LABEL=staging-800vu perf/full.js
psql "$STAGING_DATABASE_URL" -f ops/sql/snapshot_db_stats.sql > perf/results/"$REPORT_LABEL".db-after.txt
```

Izlaz: `perf/results/<label>.json` i `<label>.md`. **Pošalji oba** (ili commitaj u
repo pa javi) — ostatak radim ja:

```bash
node perf/import-results.mjs perf/results/staging-<datum>.json --label staging-<datum>
```

Skripta ispiše redove za `PERF_BUDGETS.md` §1 sa ✅/⚠ po budžetu i izlaznim kodom
1 ako je nešto iznad. Redove koje k6 ne vidi (`db_queries_per_request`, `ws_emits_*`,
`sla_scan_*`) čitamo iz `api.log`:

```bash
grep -o 'db_queries_per_request=[0-9.]*' api.log | tail -200
grep -oE 'ws_emits_[a-z_]+=[0-9]+' api.log | tail -200
grep -oE 'sla_scan_[a-z_]+=[0-9]+' api.log | tail -50
```

**3e. Kapija iz plana:** P95 read > 200 ms ili P95 mutacija > 400 ms → prvo
`perf/results/after-f3` §6 redoslijed optimizacija, pa ponovni run; ne mijenjati
budžete da bi brojke prošle.

---

## 4. Notifikacije: veličina grupa + fan-out *(rizik 2, ~1 h + odluka)*

Pusti upite **dok traje** k6 run iz stavke 3 (ili odmah poslije), da `Notification`
sadrži fan-out baš tog opterećenja:

```bash
psql "$STAGING_DATABASE_URL" -v window='30 minutes' -f ops/sql/measure-notification-fan-out.sql
```

Šta gledati:

| Rezultat | Značenje | Akcija |
|---|---|---|
| `max_members` ≤ 50 i `rows_per_second` ≪ 500 | grupe su male, per-user emit se uklapa u budžet | opcija A **nije** potrebna; upisati brojke kao nalaz |
| `max_members` > 200 ili `rows_per_second` blizu/preko 500 | jedan grupni događaj troši cijeli budžet | opcija A: `Notification.groupId` + seen-mark, **jedan** emit u group sobu |

Odluku (da/ne + brojke) upisujemo u `PERF_BUDGETS.md` §1 (red „WS emit-ova / s") i u
§7 izvještaja `perf/results/after-f4-2026-09-24.md`; ako je „da", implementacija ide
kao zaseban patch (migracija + payload ugovor + testovi), ne u istom koraku.

---

## Šta ide kome

| Korak | Ko pokreće | Šta vraća |
|---|---|---|
| 1a | ti (ili bilo ko s pristupom Redis-u) | `✔` / greška iz skripte |
| 1b | ops | rezultat reconnecta iz oba smjera |
| 2 | CI (automatski na PR) | link na run; brojke upisujem ja |
| 3a–3d | ti | `<label>.json` + `<label>.md` + `api.log` isječci |
| 3e, upis u dokumente | ja | patch za `PERF_BUDGETS.md` / izvještaj |
| 4 | ti pokreće upite, ja tumačim | odluka o opciji A |

## Brojke nakon runa

Jedna komanda (SLO tabela + `db_queries_per_request` po pravilima CI kapije):
`ops/collect-staging-numbers.sh perf/results/<label>.json api.log`.
Detaljno uputstvo za verifikacije A/B/C: `ops/uputstvo-verifikacije.md`.
