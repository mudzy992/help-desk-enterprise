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
| DB upita po HTTP zahtjevu | ≤ 2 prosječno | instrumentirano, **nije mjereno** | `db_queries_per_request=` log (F0 middleware, `backend/src/common/request-context/request-metrics.middleware.ts`); authz keš: 0 upita po zahtjevu uz pogodak (after-f2 §2.2) |
| DB QPS ukupno | < 1.000 uz pool 40 | nije mjereno | pool 40 / worker 10 (`DB_POOL_MAX`, F1.4); after-f1 §1 |
| SLA scan ciklus | < 15 s @ 100k otvorenih | kod-nalaz: 2 statementa po ciklusu, `LIMIT 2000` | after-f2 §2.1 — due-only `nextDueAt` upit + batch `IN`; index `(resolutionCompletedAt, nextDueAt)` |
| WS emit-ova / s | < 500 | kod-nalaz: ≈ 50/s (flag `off`) vs ≈ 2.040/s prije | after-f3 §2 — grupa od 200 ne dobija puni payload nego `group.feed-changed` < 200 B; metrika `ws_emits_*` je u logu |
| WS emit-ova / s — **notifikacije (fan-out po korisniku)** | < 500 sve zajedno | **kod-nalaz, širi budžet**: grupa od 200 članova = 200 redova u `Notification` **i 200 emita** po događaju; pri 10 događaja/s ≈ 2.000/s — samostalno preko budžeta | `notifications/fan-out/publish-created-notifications.ts` (per-user emit) — `perf/results/after-f4-2026-09-24.md` §7 rizik 2; mjeri se `ops/sql/measure-notification-fan-out.sql` + `ws_emits_user` iz loga |
| Dashboard payload | < 100 KB | kod-nalaz: agregatni summary, keš 15 s | after-f2 §2.4 — `GET /reports/dashboard/summary?scope=`, `GET /reports/sla/summary` |
| Pretraga: zahtjeva po unosu | 1 | kod-nalaz: 1 zahtjev po unosu (AbortController + debounce) | after-f1 §2 + after-f3 §3 — `GET /search?q=…` |
| Frontend zahtjevi po sesijskoj ruti | katalog ≤ 1 / staleTime | kod-nalaz: React Query keš (`queryKeys.*`, `staleTime` u `frontend/src/lib/query/query-client.ts`) umjesto ponovnog poziva po mountu | after-f3 §3 |

| Metrika | Budžet | CI prag (smoke) | Zašto takav prag |
|---|---|---|---|
| k6 error rate (2.800 VU, 30 min) | < 0,5 % | < 1 % | budžet × 2 za dijeljene CI runnere i hladan JIT — komentar u `perf/config.js::ciThresholds` |
| P95 read (CI) | < 200 ms | < 500 ms | budžet × 2,5: nema izmjerenog P95 iz F3 (kod-nalaz), pa se prag veže na budžet; iron rule „mjereno × 1,5" primjenjuje se na prvom CI runu s pravim brojkama |
| P95 mutacija (CI) | < 400 ms | < 1.000 ms | isto, budžet × 2,5 |
| avg `db_queries_per_request` (CI) | ≤ 2 | ≤ 3 | budžet + 1 (agregatni upiti računaju se kao jedan zahtjev); provjerava se iz `api.log` u CI koraku. **Bootstrap (`/install/*`, `/health`) se izuzima** — vrti se jednom po stacku i nije dio profila opterećenja; ispisuje se odvojeno u istom koraku |

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
