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
| P95 bilo kojeg read endpointa | < 200 ms | **nije mjereno** (kod-nalaz) | `perf/results/after-f3-2026-09-24.md` §5 — okruženje bez k6/Postgres/Redis/LB; struktura dokazana (paginacija, agregati, keš), mjeri se prvim `k6 run perf/full.js` |
| P95 bilo koje mutacije | < 400 ms | **nije mjereno** (kod-nalaz) | isto |
| DB upita po HTTP zahtjevu | cilj ≤ 2,0 prosječno (kapija 2,5 = CI 2,084 × 1,2) | **izmjereno u CI-ju (run [36041855923](https://github.com/mudzy992/help-desk-enterprise/actions/runs/36041855923), 65.048 zahtjeva, 2026-09-24): 2,084** — 18,4 → 8,7 → 5,0 → **2,1**. Lokalni rig je pokazao 1,705 (topli keševi; upiti u interaktivnim transakcijama se ne broje) — mjerodavan je CI (lokalno: poruka 4 · lista 3 · inbox 3 · `/search` 3 · detalj 2 · dashboard 0,07 · unread 0,01) | `db_queries_per_request=` iz `api.log` (F0 middleware). Koraci posljednjeg smanjenja: dijeljeni settings snapshot (`SETTINGS_SNAPSHOT_TTL_MS`, invalidacija na promjenu), keš scope kataloga, kratki spoj za povjerljive tikete, jedan raw upit za SLA + CSAT stranice (`load-ticket-sla-and-csat.ts`), opcija A grupnih notifikacija. Ranija historija: settings snapshot (`perf-07`), keš display labela. **Pouka:** prazna baza daje lažno niske brojke — mjeri se samo na seedanim podacima |
| DB QPS ukupno | < 1.000 uz pool 40 | nije mjereno | pool 40 / worker 10 (`DB_POOL_MAX`, F1.4); after-f1 §1 |
| SLA scan ciklus | < 15 s @ 100k otvorenih | kod-nalaz: 2 statementa po ciklusu, `LIMIT 2000` | after-f2 §2.1 — due-only `nextDueAt` upit + batch `IN`; index `(resolutionCompletedAt, nextDueAt)` |
| WS emit-ova / s | < 500 | kod-nalaz: ≈ 50/s (flag `off`) vs ≈ 2.040/s prije | after-f3 §2 — grupa od 200 ne dobija puni payload nego `group.feed-changed` < 200 B; metrika `ws_emits_*` je u logu |
| WS emit-ova / s — **notifikacije** | < 500 sve zajedno | **riješeno opcijom A** (2026-09-24): događaj za grupu = **1 red** u `Notification` (`groupId`, `excludedUserIds`) i **1 emit** u sobu grupe, neovisno o broju članova; čitanje po korisniku kroz `NotificationReceipt`; badge keš poništava se jednim `INCR` epohe grupe | `notifications/fan-out/insert-group-notification.ts`, `publish-created-notifications.ts`, `unread-count-cache.ts`; migracija `20260924180000_group_notifications` |
| Dashboard payload | < 100 KB | kod-nalaz: agregatni summary, keš 15 s | after-f2 §2.4 — `GET /reports/dashboard/summary?scope=`, `GET /reports/sla/summary` |
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
