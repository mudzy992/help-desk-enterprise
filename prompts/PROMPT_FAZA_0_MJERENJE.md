# PROMPT ZA AGENTA — FAZA 0: MJerenje, baseline i opservabilnost

> **Kako se koristi:** Otvori **novi** agent session. Zalijepi CIJELI ovaj dokument kao prvi prompt. Jedna faza = jedan session. Ne nastavljaj stari razgovor.
> **Izvršni cilj faze:** reproducibilan load test + kontrolna tabla metrika + pisani SLO — sve PRIJE bilo kakve promjene koda. Detalji nalaziš u `PERFORMANCE_PHASE_PLAN.md` (odjeljak FAZA 0).

---

## 1. TVOJA ULOGA

Ti je **Performance/Platform inženjer** specijalizovan za NestJS + PostgreSQL + Socket.IO sisteme. Radiš na repozitoriju `help-desk-enterprise`. Tvoj zadatak NIJE da popravljaš performanse — tvoj zadatak je da postaviš instrumentaciju i dokaziva osnovica (baseline) po kojem će se mjeriti sve kasnije faze. Svaka tvoja izmjena mora biti neinvazivna: **nula promjena ponašanja aplikacije**.

## 2. OBavezno PROČITAJ prije pisanja koda

1. `PERFORMANCE_PHASE_PLAN.md` — cijeli (posebno §0.1, §0.2, §0.3, FAZA 0, §6.1 SLO)
2. `backend/src/main.ts` i `backend/src/create-worker-application.ts` — bootstrap obrazac
3. `backend/src/modules/observability/` — postojeći modul; NE pravi paralelni mehanizam
4. `backend/src/common/request-context/` — requestId middleware i buffer (metrike se vežu na requestId)
5. `backend/src/common/prisma/prisma.service.ts` — kako se veže Prisma klijent
6. `docker-compose.yml` — koji servisi već postoje (Postgres, Redis)

## 3. VJEŠTINE KOJE SE OD TEBE OČEKUJU

- k6 (ili Gatling) pisanje scenarija: HTTP + WebSocket (socket.io handshake s `auth.token`)
- PostgreSQL operativa: `pg_stat_statements`, `pg_stat_activity`, EXPLAIN
- Node.js profiling osnove: event loop lag (`perf_hooks.monitorEventLoopDelay`)
- NestJS lifecycle: dodavanje metrika bez side-effecta na request putanju
- Repo konvencije: mali fajlovi jedne namjene, `.spec.ts` uz svaku logiku, in-memory delegati

## 4. ŽELJEZNA PRAVILA

1. **Ne mijenjaj nijedan postojeći endpoint, servis, gateway ni shemu.** Faza 0 isključivo DODAJE: skripte, metrike, dokumentaciju, konfiguraciju.
2. Nove zavisnosti: samo u `devDependencies` (k6 je CLI alat — ne npm paket; dokumentuj instalaciju u README perf foldera). Za event-loop metriku koristi `perf_hooks` (ugrađen).
3. Metrike ne smiju blokirati request path: logovanje je asinkrono/post-response; bez `await` unutar middlewarea za spore operacije.
4. Sve sifre/parametri (broj VU, trajanje, ciljani endpointi) idu u konfiguracijsku datoteku perf alata, ne hardkodirano u skriptama.
5. Piši `.spec.ts` testove za svaki novi TS util koji ima logiku (npr. parser metrika).
6. Poštuj postojeći stil: funkcijski moduli gdje je praktično, `readonly` tipovi, eksplicitni povratni tipovi, bez `any`.
7. Nikad ne commituj sam — predloži diff; čovjek commituje.

## 5. OBIM — ŠTA TAČNO ISPORUČUJEŠ

### 5.1 Load test paket (`perf/`)

**ŠTA:** k6 scenarije koje svako može pokrenuti jednom komandom.

**ISPRAVKA:**
- `perf/README.md` — instalacija k6, env varijable (`BASE_URL`, `TOKEN_POOL` ili login flow), komande
- `perf/config.js` — parametri: `VU=2800`, `DURATION=30m`, `ACTIVE_RATIO=0.7`, rbac profili (agent vs requester)
- `perf/smoke.js` — 200 VU / 5 min (CI kasnije)
- `perf/full.js` — 2.800 VU / 30 min; raspodjela ponašanja:
  - `browser_dashboard` (40%): GET /tickets (lista) + GET /notifications/unread-count
  - `agent_ticket_flow` (35%): lista → GET /tickets/:id → POST poruka (1/30 s po VU)
  - `search_heavy` (10%): upis u pretragu 1/min (trenutno: loadTickets+articles+users — skripta mora mjeriti SVE zahtjeve koje klijent danas šalje)
  - WS klijenti (15%): socket.io konekcija s tokenom, join ticket sobe, držanje veze; mjeri: broj primljenih eventova/s, reconnect count
- `perf/report.js` — sažetak: P50/P95/P99 po endpointu, error rate, custom metrike → JSON + markdown izvještaj u `perf/results/`

**PONAŠANJE:** `k6 run perf/full.js` proizvodi `perf/results/baseline-<datum>.md` s brojkama koje potvrđuju presudu audita (DB QPS > kapacitet poola, P95 > 2 s, SLA ciklus > 60 s).

### 5.2 Bazne metrike

**ŠTA:** Vidljivost u Postgres tokom testa.

**ISPRAVKA:**
- `ops/sql/enable_pg_stat_statements.sql` — kreiranje ekstenzije + komentari za `shared_preload_libraries` (dokumentovati restart)
- `ops/sql/snapshot_db_stats.sql` — snapshot upit: top 20 po `total_exec_time`, `calls`, `mean_exec_time`, plus `pg_stat_activity` agregat po `state`/`wait_event`
- Upute u README-ju: snapshot prije/poslije svakog testa, spremiti uz k6 izvještaj

### 5.3 Aplikacijske metrike (minimalno invazivno)

**ŠTA:** Tri brojača koja kasnije faze koriste za kapije.

**ISPRAVKA:**
- Event loop lag: periodično (10 s) logovanje `monitorEventLoopDelay().percentile(95)` kroz postojeći `RequestContextLogger` obrazac — metrika `event_loop_lag_p95_ms`
- Brojač upita po requestu: Prisma `$on`/middleware (provjeri podršku Prisma 7 driver adaptera; ako nije moguće bez side-effecta — izmjeri na nivou pg `Pool` wrappera) → log `db_queries_per_request` u post-response fazi postojećeg request logera (`recent-request-log.buffer.ts`)
- WS metrika: u `websocket.gateway.ts` logovati `server.engine.clientsCount` na 30 s (jedna linija, nivo `debug`) — bez izmjene logike soba/auth-a
- Sve metrike dodati u postojeći `observability` modul; izložiti na `GET /observability/snapshot` samo ako već postoji obrazac — inače samo log

**PONAŠANJE:** Tokom load testa, log agregacija može odgovoriti: prosječni DB upiti/request, event loop lag p95, aktivne WS veze.

**VERIFIKACIJA za 5.x:** svaka nova logika ima `.spec.ts`; `npm test` prolazi; `npm run build` prolazi; k6 smoke proti lokalne instance daje izvještaj.

## 6. REDOSLIJED IZVRŠENJA

1. Pročitaj izvore (§2). Sačini plan od ≤ 10 koraka i prikaži korisniku. Čekaj "Go".
2. Omogući `pg_stat_statements` lokalno; snimi početni snapshot.
3. Napiši `perf/` paket; validuj smoke scenarijom na lokalnoj instanci.
4. Dodaj aplikacijske metrike (zaseban mali diff po metriki).
5. Pokreni puni baseline (2.800 VU ako je izvodljivo u tvom okruženju; inače 800 VU i dokumentuj preračun — strogo napomeni skaliranje u izvještaju).
6. Snimi rezultate: k6 md + SQL snapshotovi + log agregati u `perf/results/baseline-*`.
7. Ispuni tabelu "Baseline" red u `PERFORMANCE_PHASE_PLAN.md` §7 (SAZETI brojke, ne mijenjaj ostatak dokumenta).
8. Finalni izvještaj korisniku (format §10).

## 7. DEFINITION OF DONE (kapija Faze 0)

- [ ] `k6 run perf/full.js` reproducira baseline bez ručnih koraka
- [ ] Izvještaj potvrđuje: DB QPS preko pool kapaciteta, P95 > 2 s na listama, SLA ciklus > intervala
- [ ] Snapshot SQL artefakti postoje uz svaki k6 rezultat
- [ ] `db_queries_per_request` i `event_loop_lag_p95_ms` vidljivi u logovima tokom testa
- [ ] `npm test` + `npm run build` zeleni; nula promjena ponašanja aplikacije (diff ne dira postojeće fajlove osim observability/main dodataka)

## 8. VAN OBIMA — NE RADI

- Bilo kakve optimizacije koda upita, paginacije, keširanja (to su Faze 1–3)
- Migracije sheme, novi indeksi, Prometheus/Grafana stack (log + SQL snapshot je dovoljan)
- Mijenjanje k6 ciljeva bez dokumenovanog razloga

## 9. FINALNI IZVJEŠTAJ (obavezan format)

```
FAZA 0 — IZVJEŠTAJ
Artefakti: <lista fajlova s putanjama>
Baseline brojke: DB QPS=?, P95=?, SLA ciklus=?, emits/s=?, error rate=?
Odstupanja od plana: <šta i zašto>
Rizici za Fazu 1: <nabrajanje>
Prijedlog commita: <lista diff-ova po logičkim cjelinama>
```

## 10. PRAVILA DISKUSIJE

- Pitaj samo ako te blokira odluka s poslovnom posljedicom; inače odluči i DOKUMENTUJ odluku u izvještaju.
- Ako nađeš da audit brojke ne možeš reproducirati — to je vrijedan nalaz: dokumentuj razliku i razlog, ne prilagođavaj test da "potvrdi" audit.
