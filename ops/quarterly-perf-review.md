# Kvartalna revizija performansi

Faza 4.2, plan §4.2, tačka 3. Ponavlja se **svakog kvartala** (kalendarski: prvi
radni dan u januaru/aprilu/julu/oktobru). Vlasnik: platform tim. Trajanje: pola dana.
Rezultat je zapisnik — tabela na kraju ovog dokumenta — plus ažuriranja
`PERF_BUDGETS.md` i red u planu §7.

## 1. Puni load test (kapija programa)

```bash
k6 run perf/full.js        # 2.800 VU / 30 min, profil iz perf/config.js
```
- Uporedi svaku ćeliju SLO tabele (`PERF_BUDGETS.md` §1) s pragom.
- Prepiši red „Nakon F4" u `PERFORMANCE_PHASE_PLAN.md` §7 stvarnim brojkama.
- Ako je ćelija preko budžeta: **ne popuštaj prag** — otvori stavku s uzrokom
  (`request_id` iz `query_budget_exceeded`, najgori endpoint iz k6 izvještaja).

## 2. Revizija indeksa

```sql
-- nekorišteni indeksi (kandidati za brisanje)
select relname, indexrelname, idx_scan from pg_stat_user_indexes where idx_scan = 0 order by 1;
-- duplirani indeksi (isti stupci, drugi redoslijed)
select * from pg_indexes where schemaname = 'public' order by tablename, indexname;
-- veličina i bloat
select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 20;
```
- Provjeri da su indeksi iz F1/F2 još opravdani: `tickets` kompozitni indeksi
  (`20260923120000`), trigram GIN ×3 (`20260923140000`), SLA
  `(resolutionCompletedAt, nextDueAt)` (`20260924140000`).
- Svaki `idx_scan = 0` indeks koji je stariji od dva kvartala → kandidat za
  `DROP INDEX CONCURRENTLY` (nikad `DROP` bez `CONCURRENTLY` u produkciji).

## 3. Ekspanzija tabela i particionisanje

| Tabela | Metrika | Prag za akciju |
|---|---|---|
| `tickets` | broj redova | **> 5M** ⇒ particionisanje po `createdAt` (mjesec ili kvartal) + provjera svih indeksa na particionisanoj tabeli |
| `notifications` | broj redova / starost najstarijeg retencijskog reda | retencija (90 dana, queue `notification-retention`) mora držati tabelu; ako najstariji red > 120 dana ⇒ job ne radi |
| `audit_log` | prirast po kvartalu | > 10M redova/kvartal ⇒ particionisanje ili hladno skladište |
| `TicketSlaState` | broj zapisa s `nextDueAt` starijim od 30 dana | znak da scan ne stiže (provjeri `job_duration_ms` za `sla-scan`) |

```sql
select count(*) from "Ticket";
select min("createdAt"), count(*) from "Notification";
select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 10;
```

## 4. Dokaz da kapija radi (obavezan korak)

Na scratch grani uvedi namjernu regresiju (npr. N+1 u `GET /tickets` ili uklanjanje
keša dashboarda) i otvori PR:
- `.github/workflows/perf-smoke.yml` **mora pasti** (P95 ili `db_queries_per_request`),
- artefakt (`perf-smoke.md`, `api.log`) mora imenovati uzrok,
- zatvori PR bez merge-a.

Ako kapija ne padne — kapija je pokvarena i to je najvažnija stavka kvartala.

## 5. Provjera automatike i realtime-a

- Periodični poslovi (F4.1): u logu `worker.log` svaki job mora imati
  `job=<ime> job_duration_ms=… job_processed=… job_failed=…`; nijedan `*_schedule_failed`.
- **API ne smije imati nijednu job liniju** — `grep 'job=' api.log` mora biti prazan.
- WS: `ws_adapter_redis_ok=1`, `ws_emits_*` unutar budžeta (plan §4.2), bez
  `fallback=in_memory` linija.

## 6. Zapisnik (kopiraj u PR/issue)

| Kvartal | P95 read | P95 mutacija | DB QPS | SLA ciklus | Emit-ovi/s | Error rate | Akcije |
|---|---|---|---|---|---|---|---|
| 2026-Q4 | | | | | | | |
| 2027-Q1 | | | | | | | |

Pravilo: **promjena praga je odluka čovjeka** — upiši razlog u `PERF_BUDGETS.md`
uz red koji mijenjaš; automatsko popuštanje praga nije dopušteno.
