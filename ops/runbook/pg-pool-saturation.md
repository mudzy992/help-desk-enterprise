# Runbook: zasićenje pg poola

Faza 4.2, plan §4.2. Simptom → dijagnostika → ublažavanje.

## Simptom

- P95 skoči na **svim** endpointima odjednom (nije jedan upit — čeka se konekcija).
- U logu: `DB_POOL_CONNECTION_TIMEOUT_MS` (default 3 s) poruke, `statement timeout`
  (default 5 s) greške, a query budžet upozorenja rastu
  (`query_budget_exceeded request_id=… path=…`).
- `event-loop-lag` monitor pokazuje skok, ali CPU je umjeren — čeka se I/O.

## Dijagnostika

```bash
# 1) Ko čeka konekciju (aktivnost u bazi)
psql "$DATABASE_URL" -c "select state, wait_event_type, count(*) from pg_stat_activity group by 1,2 order by 3 desc;"
# 2) Najskuplji upiti
psql "$DATABASE_URL" -c "select calls, mean_exec_time, left(query, 90) from pg_stat_statements order by mean_exec_time desc limit 20;"   # traži pg_stat_statements
# 3) Naši brojači (pool + po zahtjevu)
grep -E 'db_pool_|db_queries_per_request=' api.log | tail -50
grep query_budget_exceeded api.log | tail -20
```
`request_id` iz upozorenja vodi direktno na zahtjev i endpoint koji je prekoračio
budžet od 3 upita — to je prvo mjesto za optimizaciju (N+1 ili nedostajući keš).

## Ublažavanje

1. **Privremeno povećaj pool** (u env, pa restart instance po jedna — rolling):
   `DB_POOL_MAX` 40 → 60 **samo** ako baza ima slobodne konekcije
   (`max_connections` − trenutno aktivne). Ako nema, povećanje poola samo pomjera
   problem na bazu (klasična greška).
2. **Skini teret** — smanji broj worker replika i/ili pauziraj teške poslove
   (arhiva/KB) jednim restartom workera; API nastavlja normalno.
3. **Nađi i ubij dugotrajne upite**:
   ```bash
   psql "$DATABASE_URL" -c "select pg_cancel_backend(pid) from pg_stat_activity where state='active' and now()-query_start > interval '30 seconds';"
   ```
4. **Statement timeout ostaje** (`DB_STATEMENT_TIMEOUT_MS=5000`): ne diži ga da bi
   „prošlo" — on je zaštita; ako upit treba > 5 s, treba indeks ili keš, ne timeout.
5. **PgBouncer (transaction mode)**: drži `DB_POOL_MAX` na 40 po aplikacijskoj
   instanci; pooler množi konekcije prema bazi — provjeri `pool_mode` i limite
   prije nego što diraš `DB_POOL_MAX`.
6. Trajno: novi indeks (kvartalna revizija,
   `ops/quarterly-perf-review.md`) ili dodatni keš na nivou koji je mjerio budžet.

## Izlazak iz incidenta

- Greske `pool connection timeout` prestale, P95 nazad unutar budžeta (`PERF_BUDGETS.md`),
- `db_queries_per_request` prosjek ≤ 2, upozorenja svedena na poznate izuzetke,
- zapis u `ops/quarterly-perf-review.md`: koji upit, koji indeks/keš, koji broj.
