# Performance budžeti (SLO) i kapije

Faza 4.2, plan §4.2. Ovaj dokument je **jedini izvor istine** za granice koje
performanse moraju zadovoljiti. Svaki broj u tabeli je ili (a) izmjeren i citira
izvještaj iz `perf/results/`, ili (b) eksplicitno označen kao **kod-nalaz** — onda
vrijedi aritmetika iz izvještaja, a ne mjerenje.

Kapija u CI-ju je `.github/workflows/perf-smoke.yml` (k6 smoke, 200 VU / 5 min,
Postgres + Redis service containeri). Prag je **blokirajući**: crven pipeline =
regresija se ne spaja.

## 1. SLO tabela

| Metrika | Budžet | Stanje nakon F3 | Izvor brojke |
|---|---|---|---|
| P95 bilo kojeg read endpointa | < 200 ms | **staging 2026-09-25, 100k tiketa, 200 VU: lista 46 · detalj 29 · unread 23 · dashboard 16 ms ✔; pretraga 763 ms ⚠ (poznati izuzetak, §5)** — ranije: nije mjereno (kod-nalaz) | `perf/results/after-f3-2026-09-24.md` §5 — okruženje bez k6/Postgres/Redis/LB; struktura dokazana (paginacija, agregati, keš), mjeri se prvim `k6 run perf/full.js` |
| P95 bilo koje mutacije | < 400 ms | **staging 2026-09-25, 200 VU: poruka 308 ms ✔** (raste s opterećenjem: 173 → 308 ms od 20 do 200 VU) | §5 |
| DB upita po HTTP zahtjevu | cilj ≤ 2,0 prosječno (kapija 2,5 = CI 2,084 × 1,2) | **izmjereno u CI-ju (run [36041855923](https://github.com/mudzy992/help-desk-enterprise/actions/runs/36041855923), 65.048 zahtjeva, 2026-09-24): 2,084** — 18,4 → 8,7 → 5,0 → **2,1**. Lokalni rig je pokazao 1,705 (topli keševi; upiti u interaktivnim transakcijama se ne broje) — mjerodavan je CI (lokalno: poruka 4 · lista 3 · inbox 3 · `/search` 3 · detalj 2 · dashboard 0,07 · unread 0,01) | `db_queries_per_request=` iz `api.log` (F0 middleware). Koraci posljednjeg smanjenja: dijeljeni settings snapshot (`SETTINGS_SNAPSHOT_TTL_MS`, invalidacija na promjenu), keš scope kataloga, kratki spoj za povjerljive tikete, jedan raw upit za SLA + CSAT stranice (`load-ticket-sla-and-csat.ts`), opcija A grupnih notifikacija. Ranija historija: settings snapshot (`perf-07`), keš display labela. **Pouka:** prazna baza daje lažno niske brojke — mjeri se samo na seedanim podacima |
| DB QPS ukupno | < 1.000 uz pool 40 | nije mjereno | pool 40 / worker 10 (`DB_POOL_MAX`, F1.4); after-f1 §1 |
| SLA scan ciklus | < 15 s @ 100k otvorenih | kod-nalaz: 2 statementa po ciklusu, `LIMIT 2000` | after-f2 §2.1 — due-only `nextDueAt` upit + batch `IN`; index `(resolutionCompletedAt, nextDueAt)` |
| WS emit-ova / s | < 500 | kod-nalaz: ≈ 50/s (flag `off`) vs ≈ 2.040/s prije | after-f3 §2 — grupa od 200 ne dobija puni payload nego `group.feed-changed` < 200 B; metrika `ws_emits_*` je u logu |
| WS emit-ova / s — **notifikacije** | < 500 sve zajedno | **riješeno opcijom A** (2026-09-24): događaj za grupu = **1 red** u `Notification` (`groupId`, `excludedUserIds`) i **1 emit** u sobu grupe, neovisno o broju članova; čitanje po korisniku kroz `NotificationReceipt`; badge keš poništava se jednim `INCR` epohe grupe | `notifications/fan-out/insert-group-notification.ts`, `publish-created-notifications.ts`, `unread-count-cache.ts`; migracija `20260924180000_group_notifications` |
| Dashboard payload | < 100 KB | **staging: 0,6 KB ✔**; agregatni summary, Redis keš **60 s** (`REPORT_SUMMARY_CACHE_TTL_SECONDS`, odluka vlasnika 2026-09-25) + single-flight | after-f2 §2.4 — `GET /reports/dashboard/summary?scope=`, `GET /reports/sla/summary` |
| Pretraga: zahtjeva po unosu | 1 | kod-nalaz: 1 zahtjev po unosu (AbortController + debounce) | after-f1 §2 + after-f3 §3 — `GET /search?q=…` |
| Frontend zahtjevi po sesijskoj ruti | katalog ≤ 1 / staleTime | kod-nalaz: React Query keš (`queryKeys.*`, `staleTime` u `frontend/src/lib/query/query-client.ts`) umjesto ponovnog poziva po mountu | after-f3 §3 |

| Metrika | Budžet | CI prag (smoke) | Zašto takav prag |
|---|---|---|---|
| k6 error rate (2.800 VU, 30 min) | < 0,5 % | < 1 % | budžet × 2 za dijeljene CI runnere i hladan JIT — komentar u `perf/config.js::ciThresholds` |
| P95 read (CI) | < 200 ms | < 500 ms | budžet × 2,5: nema izmjerenog P95 iz F3 (kod-nalaz), pa se prag veže na budžet; iron rule „mjereno × 1,5" primjenjuje se na prvom CI runu s pravim brojkama |
| P95 mutacija (CI) | < 400 ms | < 1.000 ms | isto, budžet × 2,5 |
| avg `db_queries_per_request` (CI) | ≤ 2,0 (cilj) | ≤ 2,5 (CI 2,084 × 1,2) | odluka korisnika: kapija = CI mjerenje × 1,2; provjerava se iz `api.log` u CI koraku. **Bootstrap (`/install/*`, `/health`, `/auth/login|logout|refresh`) se izuzima iz kapije** — vrti se jednom po stacku odnosno po sesiji (`setup()`), pa nije dio profila opterećenja; ispisuje se odvojeno u istom koraku. Izmjereno: `POST /auth/login` ≈ 9 upita (2026-09-24) — nije u SLO tabeli, ali stoji u PR komentaru da se cijena vidi |

## 2. Kako se mjeri

```bash
# Puni profil (2.800 VU / 30 min) — zaključna kapija programa
k6 run perf/full.js                       # izvještaj: perf/results/<REPORT_LABEL>.{json,md}

# CI profil (200 VU / 5 min) — isti pragovi koje vidi CI
PERF_PROFILE=ci k6 run perf/smoke.js

# Broj upita po zahtjevu (dev/staging; u produkciji WARN ostaje isključen)
DB_QUERY_METRICS=true DB_QUERY_BUDGET=3 DB_QUERY_BUDGET_WARN=true npm run start:prod
grep query_budget_exceeded api.log | tail -20     # request_id=… path=… budget=3
```

## 3. Pravila

1. **Budžet se ne popušta da bi CI prošao.** Popuštanje je ljudska odluka i mora
   ostati zapisana ovdje (red u tabeli + razlog + datum). Prag se mijenja _zajedno_
   s komentarom u `perf/config.js`.
2. **Novi endpoint ili novi emit dolazi s budžetom u opisu PR-a** — broj upita po
   zahtjevu i očekivani payload; ako nema broja, PR nije spreman.
3. **Mjerenje prije tvrdnje.** Kod-nalaz (kao svi redovi „nakon F1/F2/F3") je
   privremen dok se ne pokrene `k6 run perf/full.js`; prvi izvještaj prepisuje
   kolonu „stanje" stvarnim brojkama.
4. **Kapija je blokirajuća, artefakti ostaju.** `perf-smoke.md` + `api.log` se
   uploaduju uz svaki run (30 dana) — regresija se analizira bez ponovnog pokretanja.
5. **Query budžet**: u produkciji je brojač uključen (`DB_QUERY_METRICS=true`), a
   upozorenje isključeno (`DB_QUERY_BUDGET_WARN=false`); u CI/stagingu je uključeno.
   Upozorenje sadrži `request_id` i `path`, pa se iz njega ide direktno na uzrok.

## 4. Verifikacija F4.2

- CI: `.github/workflows/perf-smoke.yml` — servisi, migracije, seed, build, API,
  `k6 run perf/smoke.js` s `PERF_PROFILE=ci`, provjera query budžeta iz loga,
  artefakti; pad praga = crven job.
- Regresija se dokazuje namjerno: PR koji podigne broj upita po zahtjevu iznad 3
  (ili P95 preko praga) mora pasti — vidi `ops/quarterly-perf-review.md` §4.
- Kvartalno: `ops/quarterly-perf-review.md` (puni load test + revizija indeksa i
  ekspanata tabela).

## 5. Staging mjerenje C (2026-09-25)

Okruženje: Coolify, jedna API instanca (`DATABASE_POOL_ROLE=api`, pool 40,
statement timeout 5 s), Postgres i Redis na istom hostu; **k6 radi na istom
serveru** (dijeli CPU — brojke su konzervativne). Seed: 100.000 tiketa, 10 %
otvorenih, 12 OU / 3 grupe (`ops/sql/seed-large-dataset.sql`, glavni profil).
`SEARCH_TERM=SEED-0012`, `TICKET_IDS` = 50 tiketa iz agentovih grupa.

| VU (aktivnih) | Zahtjeva / 3 min | Greške | Lista | Detalj | Poruka | Unread | Dashboard | Pretraga | DB upita/zahtjev |
|---|---|---|---|---|---|---|---|---|---|
| 20 (14) | 2.043 | 0 % | 48 | 24 | 173 | 14 | 10 | 105 | 1,43 |
| 50 (35) | 4.852 | 0 % | 42 | 23 | 252 | 16 | 11 | 453 ⚠ | 1,29 |
| 100 (71) | 9.715 | 0 % | 43 | 24 | 270 | 16 | 11 | 316 ⚠ | 1,26 |
| 200 (140) | 18.960 | 0 % | 46 | 29 | 308 | 23 | 16 | 763 ⚠ | 1,25 |

P95 u ms; izvještaji `perf/results/staging-c-{20vu-v5,50vu,100vu,200vu}.{json,md}`
na serveru. Nijedan 5xx ni na jednoj stepenici (~90 zahtjeva/s na 200 VU).

**Put do ovih brojki** (prvi run 2026-09-24 je pao na 20 VU s 500 — iscrpljen pool):

| Nalaz | Popravka | Commit |
|---|---|---|
| Dashboard: 8 paralelnih COUNT-ova nad vidljivim skupom | 1 groupBy + 3 COUNT, single-flight, keš 60 s | `542cc2d`, `bf571c1` |
| Sidebar counts bez keša | single-flight + 5 s (`TICKET_COUNTS_CACHE_TTL_MS`) | `542cc2d` |
| Lista: puni `COUNT(*)` na svakoj stranici (~350 ms) | COUNT do 10.001 („10 000+"), keš po korisniku+filteru 30 s (`TICKET_LIST_TOTAL_CACHE_TTL_MS`) | `542cc2d`, `97db249` |
| Unread badge brojao ~50k SLA notifikacija | COUNT do 1.000 (zvonce ionako „9+") | `be15ff4` |
| Pool/statement timeout → 500 | 503 `DATABASE_BUSY` + `Retry-After` | `542cc2d` |
| DELETE tiketa O(n²): self-FK `reopenedFromTicketId` bez indeksa | indeks + migracija `20260924200000` | `478bb5f` |
| k6: tok agenta s tokenom podnosioca (403), prazan inbox (detalj p95 = 0) | agent token; fallback na `TICKET_IDS` | `c187e38`, `bf571c1` |

**Poznati izuzetak — pretraga.** Plan je ispravan (BitmapOr preko oba trigram
indeksa, povjerljivi podupiti se ne izvršavaju; 31 ms pojedinačno). Trošak je CPU
trigram indeksa za pojam čiji su trigrami u svim redovima (`SEED-…`, isto vrijedi
za djelimičan broj tiketa u produkciji), a jedan korak pretrage ga plaća 3–4 puta
(lista s `q`, njen COUNT, `/search`). Backlog: (1) brza putanja za unos koji liči na
broj tiketa (prefiks preko btree), (2) bez COUNT-a u listi kad je zadan `q`.

**Otvoreno:**
- 800 VU: jedna instanca na dijeljenom hostu to ne može pošteno izmjeriti
  (dial timeout na Traefiku, k6 bez ramp-upa). Mjeri se s više API replika, k6 na
  zasebnoj mašini i ramp-upom.
- SLA notifikacije: ~22 `ticket.sla` notifikacije po prekoračenom tiketu (170k za
  7,6k tiketa) — provjeriti primaoce i deduplikaciju.
- Prva poruka na tiketu: 38–41 DB upit (SLA prvi odgovor + notifikacije); sljedeće 4–5.

### 5.1 Ponovljeno mjerenje nakon popravki (2026-09-25, backend 3295074)

Seed: 100 000 tiketa, 10 % otvorenih, 504 dospjela SLA stanja (5,04 %), 12 OU / 3 grupe.

**Zvanični broj = run s `RAMP_UP`** (`k6 run -e VU=200 -e RAMP_UP=60s -e DURATION=3m …`).
Bez ramp-upa 140 VU u istoj sekundi pogodi sve keševe po korisniku hladne
(dashboard `GROUP BY` do 2 s, ograničeni COUNT liste do 1,3 s) i pretraga/poruke
čekaju na pool — to je artefakt testa, pravi korisnici se ne prijave u istoj sekundi.

| Metrika (p95) | Budžet | 200 VU bez ramp-upa | **200 VU, RAMP_UP=60s** |
|---|---|---|---|
| GET /tickets | 200 ms | 43 ms | **39 ms** |
| GET /tickets/:id | 200 ms | 26 ms | **23 ms** |
| GET /search | 200 ms | 243 ms ⚠ | **25 ms** |
| POST poruka | 400 ms | 412 ms ⚠ | **50 ms** |
| unread-count | 200 ms | 19 ms | **17 ms** |
| dashboard summary | 200 ms | 14 ms | **12 ms** |
| Greške | 0,5 % | 0 % | **0 %** |
| Payload lista / dashboard | 100 KB | 51,6 / 0,6 KB | 51,6 / 0,6 KB |
| WS emitovi | < 500/s | ~11/s | — |
| SLA scan ciklus | < 15 s | 22–137 ms | — |

Pretraga ranije (prije 623d4f4): p95 763 ms na 200 VU.

Preostali spori upiti u stabilnom stanju: ~8/min (>100 ms), to su osvježavanja
keša dashboarda/brojača po korisniku (TTL 60 s / 30 s); ne utiču na p95.
Ako broj korisnika jako poraste, sljedeći korak je da dashboard `GROUP BY` broji
samo otvorene tikete (mijenja prikazane brojke — traži odluku).
