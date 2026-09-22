# PROMPT ZA AGENTA — FAZA 4: Otpornost, higijena i operativa

> **Kako se koristi:** Otvori **novi** agent session. Zalijepi CIJELI ovaj dokument kao prvi prompt. Preduslov: Faze 0–3 završene (kapije prošle, §7 tabela popunjena do "Nakon F3").
> **Izvršni cilj faze:** API proces = samo request/response + WS; sva automatika u workeru pod BullMQ rasporedom; performance budžeti postaju dio CI-ja i PR discipline; runbookovi za incidente. Detalji: `PERFORMANCE_PHASE_PLAN.md` FAZA 4.
> **Kapija na kraju:** API logovi bez ijedne job iteracije; svaki job tačno 1 izvršenje po rasporedu (dokazano s 2 workera); CI k6 smoke sa pragovima prolazi/blokira po potrebi; SLO tabela objavljena u repo-u.

---

## 1. TVOJA ULOGA

Ti je **platform/SRE inženjer**. Radiš završni sloj: operativnu disciplinu. Kod koji pišeš je mali, ali pravila koja uspostavljaš su dugoročna — zato je svaka odluka o budžetu dokumentovana s RAZLOGOM (izmjerene brojke iz prethodnih faza, ne arbitrarne).

## 2. OBavezno PROČITAJ

1. `PERFORMANCE_PHASE_PLAN.md` — FAZA 4 (§4.1–§4.2) + §6.1 SLO tabela (u dokumentu §4.2) + §7 tabela napretka (popunjena)
2. `backend/src/modules/tickets/archive/ticket-archive-automation.service.ts`
3. `backend/src/modules/tickets/waiting-for-user/waiting-for-user-automation.service.ts`
4. `backend/src/modules/knowledge-base/knowledge-base-review-reminder.service.ts`
5. `backend/src/modules/integration-queue/` (heartbeat, DLQ retention — obrazac setInterval-a koji se ukida)
6. `backend/src/create-worker-application.ts` + `start-worker.ts` + BullMQ moduli (obrazac iz Faze 2.1 već uspostavljen — PONOVI ga)
7. `frontend/src/lib/queue/use-integration-worker-status.ts` (polling koji se zamjenjuje)
8. CI konfiguracija repozitorija (GitHub Actions / šta postoji u `.github/`)
9. `perf/` paket iz Faze 0 (smoke skripta postaje CI korak)

## 3. VJEŠTINE

- BullMQ: repeatable jobs, rasporedi, retry/DLQ politika, izvršenje tačno-jednom uz više workera
- NestJS dijagnostika modula: kako izvrgnuti servis samo u worker kontekstu (conditional providers / zaseban modul)
- CI dizajn: k6 u pipelineu, pragovi (thresholds), artefakti izvještaja
- Runbook pisanje: simptom → uzrok → koraci ublažavanja, bez filozofije

## 4. ŽELJEZNA PRAVILA

1. **Isto ponašanje automatike, drugo mjesto izvršenja:** poslovna logika svakog joba ostaje bajt-identična; mijenjaš okvir pokretanja (kada/gdje/zaključano).
2. **Idempotencija prije premještanja:** za svaki job koji nije očito ponovljiv-siguran, PRVO dodaj optimistic/upsert obradu, pa tek onda prebaci u worker. Dokumentuj po jobu dokaz idempotencije.
3. **Dva workera = jedno izvršenje:** nikad ne vjeruj "pa imamo jednu instancu" — BullMQ repeatable + lock semantika mora to garantovati; testiraj s 2 workera.
4. **Budžeti se izvode iz mjerenja:** svaki prag u CI dolazi s komentarom brojke iz "Nakon F3" izvještaja + marža (npr. P95 prag = izmjereno × 1,5), NE naduvani broj "da prolazi".
5. **Ne diraj domenu:** arhivirajući pravila, waiting-for-user pragovi, KB rokovi — ostaju isti; samo raspored/pokretač/idempotencija.
6. Stil: mali fajlovi, `.spec.ts`, in-memory delegati, readonly tipovi; bez novih packageova.
7. Redoslijed: 4.1 (jobovi) → 4.2 (budžeti/CI/runbook).

## 5. STAVKE

### STAVKA 4.1 — Svi periodični poslovi u worker pod BullMQ (napor S)

**ŠTA/PROBLEM/CILJ:** plan §4.1. Danas: `@Interval` u API procesu (archive 15 min, waiting 15 min, KB reminder 15 min, integration heartbeat/DLQ `setInterval`). Cilj: API = čist; svi poslovi u workeru, raspoređeni, zaključani, mjerljivi.

**ISPRAVKA:**
1. Job-po-job (zaseban diff po poslu):
   - Zamijeni `@Interval(...)` registraciju BullMQ repeatable jobom (isti interval ili cron ekvivalent; koristi obrazac uspostavljen u Fazi 2.1 — konzistentnost iznad svega)
   - Rasporedi RAZMIJESTI (npr. :00, :05, :10 unutar 15-min prozora) — nikad svi istovremeno
   - Dodaj timeout po jobu (`job.opts.timeout`) + broj pokušaja s backoffom; DLQ ponašanje dokumentovano per job
   - Provjeri (i po potrebi dodaj) idempotenciju: archive — "već arhiviran" je no-op; waiting — prelaz samo ako status i dalje ispunjava uslov u istom upitu; KB reminder — dedupe po (article, period) ključu
   - Ukloni servise iz API modul grafa (modul se registruje samo u worker aplikaciji); `setInterval` heartbeat/DLQ servisi prebačeni u isti obrazac
2. Metrike po jobu: `job_duration_ms`, `job_processed`, `job_failed` (Faza 0 obrazac)
3. Frontend: `use-integration-worker-status.ts` — zamijeni polling ručnim osvježavanjem + (ako postoji spreman kanal) socket event; NE uvoditi novi emit samo za ovo bez dokumentovanog razloga — ručno dugme je prihvatljivo
4. Testovi: (a) 2 workera × 3 intervala ⇒ tačno 1 izvršenje (integracijski, docker Redis); (b) idempotencija po jobu (dupli trigger = isti krajnji state); (c) API modul se diže bez ijednog job providera (spec nad module ref-om)

**PONAŠANJE:** API proces: nula job log linija; worker: raspored vidljiv, bez preklapanja; tokom joba: P95 API stabilan (k6 smoke dok job traje — demonstriraj).

### STAVKA 4.2 — Performance budžeti, CI kapija, runbookovi (napor S)

**ŠTA/PROBLEM/CILJ:** plan §4.2. Nema pisanih granica ⇒ svaka prošla greška je bila "nevidljiva". Cilj: SLO tabela + CI k6 smoke s pragovima + incident runbookovi.

**ISPRAVKA:**
1. `PERF_BUDGETS.md` (root): tabela iz plan §4.2, s kolonom "izmjereno u F3" i "izvor brojke" (koji k6 izvještaj)
2. CI korak (`.github/workflows/perf-smoke.yml` ili postojeći pipeline):
   - Podigni servise (Postgres+Redis service containeri), `prisma migrate deploy`, seed minimalni, pokreni API (build artifact)
   - `k6 run perf/smoke.js` s `thresholds`: P95 read < 500 ms (CI hardver — 2,5× budžet, komentarisano!), error rate < 1%, i custom: avg `db_queries_per_request` < 3 (ako je metrika iz Faze 0 dostupna kroz log/endpoint)
   - Artefakt: k6 summary markdown uz build
   - Fail = blokirajući
3. Query-budžet alat (dev/staging): Prisma/pg wrapper koji broji upite po requestId-ju; `> 3` ⇒ WARN log s requestId-jem + endpointom; konfigurabilno env-om, default OFF u produkciji, ON u CI/staging
4. `ops/runbook/`: tri kratka runbooka (simptom → dijagnostika → ublažavanje):
   - `ws-reconnect-storm.md` (deploy/restart oluje: jitter provjera, drain procedura, LB sticky provjera)
   - `redis-down.md` (fail-open putanje iz Faza 2–3, kako izgledaju logovi, povratak)
   - `pg-pool-saturation.md` (waiting klijenti, statement_timeout uloga, privremeno povećanje poola, identifikacija UPITA kroza `pg_stat_statements`)
5. Kvartalna procedura (`ops/quarterly-perf-review.md`): puni load test, revizija indeksa, ekspanata tabele (notifications/audit/tickets) s pragovima za particionisanje (tickets > 5M)

**PONAŠANJE:** PR koji doda endpoint težak > 3 upita/request ili spori P95 preko praga → CI crveno s jasnim razlogom; incidente se rješava po dokumentu, ne improvizacijom.

## 6. DEFINITION OF DONE — KAPIJA FAZA 4 (i cijelog programa)

- [ ] API proces: 0 job iteracija u 24 h logovima; 2 workera ⇒ tačno 1 izvršenje po rasporedu (test + log dokaz)
- [ ] Svaki job: dokumentovana idempotencija + timeout + DLQ politika
- [ ] CI perf-smoke postoji, zeleno s pragovima; namjerno uvedena regresija (test PR u stajgingu) = CI crveno
- [ ] `PERF_BUDGETS.md` + 3 runbooka + kvartalna procedura u repo-u
- [ ] **Puni zaključni load test** (2.800 VU, 30 min): SVE ćelije SLO tabele u granicama; red "Nakon F4 (cilj)" u plan §7 popunjen; konačna tabela napretka (baseline → F4) objavljena

## 7. VAN OBIMA

- Horizontalna autoskaliranja, Kubernetes manifesti, CDN — dokumentuj kao preporuke, ne implementiraj
- Nove funkcionalnosti; promjene domen automatike; edge ekstenzija (Faza 6 originalnog programa — van dosega)
- Prometheus/Grafana stack ako log-pristup već pokriva budžete (preporuka dozvoljena)

## 8. FINALNI IZVJEŠTAJ (obavezan format — zaključni za program)

```
FAZA 4 — ZAKLJUČNI IZVJEŠTAJ
Diff-ovi: <po stavci>
Job karta: <job → raspored → timeout → idempotencija dokaz → DLQ>
CI: <kapija pragovi + izvor brojki>
KONAČNA TABELA: baseline → F1 → F2 → F3 → F4 (sve metrike iz plan §7)
Preostali rizici: <top 3 svlasnički dodijeljena akcija>
Preporuke izvan obima: <lista>
```

## 9. PRAVILA DISKUSIJE

- Budžet se ne popušta da bi CI prošao; popuštanje = odluka čovjeka s komentarom razloga u `PERF_BUDGETS.md`.
- Ako neki job pokaže da NIJE idempotentan i to nije moguće ispraviti unutar S napora → STANI, dokumentuj, predloži poslovnu odluku (zaključavanje reda vs. pomoćni proces).
