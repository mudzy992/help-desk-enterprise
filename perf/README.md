# perf/ — load test paket (Faza 0)

Reproduktivan k6 scenario za ciljni profil opterećenja iz `PERFORMANCE_PHASE_PLAN.md`
(2.800 istovremeno aktivnih korisnika, ~10 događaja/s na tiketima).

## Instalacija k6

k6 je samostalan CLI, **nije** npm paket — ne dodaje se u `package.json`.

```bash
# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# macOS
brew install k6

# Windows (Git Bash)
winget install k6 --source winget
```

Skripte koriste `k6/experimental/websockets`, što zahtijeva **k6 ≥ 0.46**.
Provjera: `k6 version`.

Bez k6 se ipak može provjeriti da paket nije pokvaren:

```bash
node perf/validate.js     # 18 provjera: parametri, Socket.IO paketi, render izvještaja
```

## Pokretanje

```bash
# 5 minuta, 200 VU — provjera da sve radi (koristi se i u CI-ju)
k6 run perf/smoke.js

# puni baseline: 2.800 VU / 30 min
k6 run perf/full.js

# kraći lokalni baseline (npr. 800 VU / 10 min) — OBAVEZNO napomeni skaliranje
k6 run -e VU=800 -e DURATION=10m -e REPORT_LABEL=baseline-800vu perf/full.js
```

Izlaz ide u `perf/results/`: `<REPORT_LABEL>.json` (sirovi k6 summary) i
`<REPORT_LABEL>.md` (tabela spremna za `PERFORMANCE_PHASE_PLAN.md` §7).

## Varijable okruženja

| Varijabla | Default | Značenje |
|---|---|---|
| `BASE_URL` | `http://localhost:10001` | API; WebSocket URL se izvodi zamjenom `http` → `ws` |
| `VU` | `2800` | broj registrovanih korisnika iz kojih se izvodi 70% aktivnih |
| `DURATION` | `30m` | trajanje svakog scenarija |
| `ACTIVE_RATIO` | `0.7` | udio istovremeno aktivnih |
| `REPORT_LABEL` | `baseline` | ime izvještaja u `perf/results/` |
| `AGENT_EMAIL` / `AGENT_PASSWORD` | `agent.it@example.test` / `change-me` | kredencijali za `setup()` |
| `REQUESTER_EMAIL` / `REQUESTER_PASSWORD` | `requester@example.test` / `change-me` | drugi token u poolu |
| `TICKET_IDS` | (prazno) | CSV id-eva koje WS scenario joinuje |
| `SEARCH_TERM` | `vpn` | osnova za pretragu |

Bez ispravnih kredencijala `setup()` pada s jasnom porukom — bolje nego da test
mjeri 401 odgovore kao "saobraćaj".

## Raspodjela ponašanja (plan §5.1)

| Scenario | Udio | Šta radi |
|---|---|---|
| `browser_dashboard` | 40% | `GET /tickets` + `GET /notifications/unread-count` |
| `agent_ticket_flow` | 35% | `GET /tickets/inbox` → `GET /tickets/:id` → `POST /tickets/:id/messages` (1/30 s po VU) |
| `search_heavy` | 10% | pretraga onako kako je klijent radi **danas** (lista + novi `/search` kad postoji) |
| `websocket_clients` | 15% | Socket.IO konekcija s tokenom, join tiket soba, brojanje eventova |

Scenariji dijele isti kod u `lib/scenarios.js`, pa `smoke.js` i `full.js` mjere
iste putanje.

## Metrike

Custom metrike (`lib/metrics.js`) prate kapije iz plana:

- `tickets_list_duration`, `ticket_detail_duration`, `ticket_message_duration`,
  `unread_count_duration`, `search_duration`, `dashboard_summary_duration` — P50/P95/P99 po endpointu
- `ticket_list_payload_kb`, `dashboard_payload_kb` — veličina odgovora (kapija < 100 KB)
- `unread_count_requests` — dokaz za Fazu 1.3 (≈ 0 uz zdrav WebSocket)
- `ws_events_received`, `ws_connect_errors`, `ws_clients` — realtime sloj
- `http_req_failed` — error rate (kapija < 0,5%)

Aplikacijske metrike iz Faze 0 (`db_queries_per_request`, `event_loop_lag_p95_ms`,
`ws_clients_count`) idu u **log**, ne u k6 — uz svaki test sačuvaj i log isječak:

```bash
docker compose logs backend  | grep -E "db_queries_per_request|event_loop_lag_p95_ms" > perf/results/<label>.app.log
docker compose logs backend  | grep ws_clients_count >> perf/results/<label>.app.log
```

## Baza

Prije testa (jednom, traži restart Postgresa):

```bash
psql "$DATABASE_URL" -f ops/sql/enable_pg_stat_statements.sql
psql "$DATABASE_URL" -f ops/sql/snapshot_db_stats.sql > perf/results/<label>.db-before.txt
```

Poslije testa ponovi snapshot u `<label>.db-after.txt`. Bez snapshot-a izvještaj
nije potpun — k6 vidi latenciju, ali ne vidi gdje baza provodi vrijeme.

## Ograničenja

- WS scenario govori Engine.IO/Socket.IO protokol direktno (detalji u `lib/ws-client.js`).
  Ako server promijeni handshake, to se vidi kao `ws_connect_errors`, a ne kao pucanje testa.
- `search_heavy` namjerno mjeri **trenutno** ponašanje klijenta; poslije Faze 1.2
  isti scenario pokazuje pad broja zahtjeva.
- k6 ne vidi bazu; DB QPS dolazi iz `pg_stat_statements` snapshot-a i aplikacijskog loga.

## Izvještaji (paket 2.5)

Zaseban, ručni scenarij, namjerno izvan `full.js`/`smoke.js` (CI kapija „upiti po zahtjevu" ostaje uporediva):

```bash
k6 run -e BASE_URL=https://api.desk.ba101.top -e ORG_UNIT_ID=<id korijenske OJ> \
       -e REPORTS_EMAIL=… -e REPORTS_PASSWORD=… \
       -e REPORT_LABEL=reports-trends perf/reports-trends.js
```

Tri faze (`REPORT_VU`=5): trend od 12 mjeseci iz keša i `/reports/dashboard`, svaki po `REPORT_DURATION` (zadano 1m), zatim trend od 36 mjeseci bez keša: `COLD_ITERATIONS` (zadano 100, najviše 120) zahtjeva, svaki s jedinstvenim ključem keša (prozor pomjeren za cijele mjesece × filter prioriteta). Ključ keša se gradi iz mjesečnih bucket-a, pa pomak od nekoliko dana ne zaobilazi keš. Između dva pokretanja sačekaj najmanje 10 min (TTL keša). Dijagnostika dashboarda: `docker exec -i <backend> node - < perf/report-dashboard-explain.cjs`. Budžeti p95 se mijenjaju preko `TRENDS_COLD_P95_MS` (1000), `TRENDS_WARM_P95_MS` (150) i `DASHBOARD_P95_MS` (400). Ispravnost SQL agregacije provjerava `perf/report-trends-parity.cjs`.

Na serveru (SSH) prijava s MFA: `source perf/session-login.sh`. Skripta pita e-mail, lozinku i MFA kod (skriveno), pa postavi `ACCESS_TOKEN`, `ORG_UNIT_ID` (krovna OJ) i `BASE_URL`. Nalog s MFA se ne može prijaviti iz k6. Umjesto e-maila i lozinke proslijedi `-e ACCESS_TOKEN=…` iz prijavljenog preglednika (DevTools → Console: `JSON.parse(localStorage.getItem('ep-helpdesk.session')).accessToken`). Token važi oko 1 h, a test traje oko 3 min.

## Imovina / CMDB (paket 3.2)

Zaseban, ručni scenarij (modul je zadano isključen, pa nije u `full.js`/`smoke.js`):

```bash
k6 run -e BASE_URL=https://api.desk.ba101.top \
       -e ASSETS_EMAIL=… -e ASSETS_PASSWORD=… \
       -e REPORT_LABEL=assets-list perf/assets-list.js
```

Traži uključen addon `private.addons.cmdb` i korisnika s `asset.read` (ADMIN ili upravitelj imovine); s MFA proslijedi `-e ACCESS_TOKEN=…` (vidi gore). `ASSETS_VU` (zadano 10) korisnika po `ASSETS_DURATION` (zadano 1m) čita prvu i drugu stranicu registra (50, kursor) i pretragu sa statusom; petina korisnika čita `/assets/overview` ako ima `asset.report.read`. Budžeti p95: `ASSETS_LIST_P95_MS` (200), `ASSETS_SEARCH_P95_MS` (200), `ASSETS_OVERVIEW_P95_MS` (400). Za smislen rezultat pokreni ga nad demo podacima (`assets-seed-demo.js`) ili stvarnim inventarom.
