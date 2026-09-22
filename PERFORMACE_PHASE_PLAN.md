# PERFORMANSE — Fazni dokument remedijacije

**Predmet:** `mudzy992/help-desk-enterprise` (EP-HelpDesk)
**Ciljni profil opterećenja:** 3.000–4.000 registrovanih korisnika, ~70% istovremeno aktivnih (2.100–2.800)
**Metodologija:** statička analiza koda (WebSocket gateway, SLA modul, notification fan-out, auth/RBAC lanac, frontend obrasci dohvata) + model opterećenja izveden iz konstanti u kodu
**Presuda ulaza (baseline):** sistem na ciljnoj skali **kolabira** — i to ne zbog kapaciteta servera, već zbog obrazaca "po zahtjevu / po događaju / po tick-u tajmera"

---

## 0. Uvod i okvir

### 0.1 Scenario procjene

| Parametar | Vrijednost | Napomena |
|---|---|---|
| Registrovani korisnici | 3.500 (raspon 3.000–4.000) | |
| Istovremeno aktivnih | 2.450 (70%) | prijavljeni, pišu tikete, agenti odgovaraju |
| Interaktivni HTTP zahtjevi | ~18 / korisnik / min | navigacija, liste, akcije |
| Događaji na tiketima | ~600 / min (10 / s) | poruke, statusi, dodjele |
| Otvoreni tiketi (SLA skener) | ~50.000 | raste kroz vrijeme |
| Ukupno tiketa u tabeli | ~200.000 | godišnji rast |
| Prosječna grupa agenata | ~200 | fan-out množilac |

### 0.2 Ključne konstante izmjerene u kodu (osnov modela)

| Konstanta | Lokacija | Vrijednost |
|---|---|---|
| SLA scan interval | `backend/src/modules/sla/sla.constants.ts:30` | 60 s |
| Inbox polling interval | `frontend/src/lib/notifications/use-inbox-notifications.ts:56` | 30 s |
| pg pool | `backend/src/common/prisma/prisma.service.ts:15` | default = 10 konekcija |
| Authz upiti po zahtjevu | `session-authentication.guard.ts:36` + `authorization-context.loader.ts:81,104` | 3–4 DB upita |
| Socket adapter | `websocket.gateway.ts:45` | nema — in-memory (1 instanca) |

### 0.3 Procijenjeni protok na ciljnoj skali (baseline, prije popravki)

| Metrika | Vrijednost | Kapacitet | Status |
|---|---|---|---|
| HTTP zahtjeva / s | ~950 | — | — |
| DB upita / s | **~5.500** | ~500 (pool 10 × 50 qps) | **11× preko** |
| Socket emit-ova / s | **~4.600** | ~8.000 / proces | napeto |
| Notification INSERT-a / s | **~2.000** | — | write amplification |
| Trajanje SLA ciklusa | **~7 min** | < 60 s (interval) | **ciklus > interval** |
| Punorama tiketa po dashboardu | **~240 MB** | < 100 KB | **2.400× preko** |

### 0.4 Legenda

- **P0** — blokira skalu; bez popravke sistem NE izdržava ciljno opterećenje
- **P1** — drži se do ~700 aktivnih; kolabira na 2.450
- **P2** — higijena, otpornost, operativa
- **Napor:** S (< 1 dan) · M (1–3 dana) · L (> 3 dana)
- Svaka stavka prati predložak: **ŠTA → PROBLEM → CILJ → ISPRAVKE → KAKO TREBA DA SE PONAŠA → VERIFIKACIJA**

---

## FAZA 0 — Osnova: mjerenje prije mijenjanja (0,5–1 dan, napor S)

### 0.A ŠTA
Postaviti minimalnu opservabilnost i reproduktivan load test PRIJE nego se dira ijedna linija.

### PROBLEM
Ne postoji način da se dokaže ni "kolaps" ni "popravka" — sve izjave o performansama ostaju nagađanja. Repo ima observability modul, ali nema definisanog budžeta performansi (SLO).

### CILJ
- Reproduktivan k6/Gatling scenario: **2.800 virtualnih korisnika, 30 min, 70% aktivnih**
- Kontrolna tabla metrika: HTTP P50/P95/P99, DB QPS, broj aktivnih DB konekcija, broj WS veza, emit-ova/s, trajanje SLA ciklusa, broj setInterval job-iteracija
- Baseline snimljen i arhiviran (usporedba "prije/poslije" po fazi)

### ISPRAVKE
1. k6 skripta sa profilima: `browser_dashboard` (GET /tickets + inbox), `agent_ticket_flow` (lista → detalj → poruka), `requester_create` (kreiranje tiketa), WS klijenti (socket.io konekcija + join ticket sobe)
2. Uključiti `pg_stat_activity` i `pg_stat_statements` na bazi; logovati `waiting` konekcije poola
3. Dodati endpoint/metriku: trajanje posljednjeg SLA ciklusa i broj obrađenih zapisa
4. Definisati SLO tabelu (iz odjeljka 6.1) kao ulaz za prihvatne kriterije svih faza

### KAKO TREBA DA SE PONAŠA
- Svako može pokrenuti `k6 run perf/smoke.js` i dobiti isti baseline izvještaj
- Svaka faza završava novim load testom; rezultat se upisuje u tabelu napretka (odjeljak 7)

### VERIFIKACIJA
- Baseline izvještaj potvrđuje presudu: DB QPS > kapacitet poola, SLA ciklus > 60 s, P95 > 2 s pri 2.800 VU

---

## FAZA 1 — Stop-krvarenje (Sedmica 1)

Faza koja sa minimalnim rizikom uklanja 70–80% nepotrebnog opterećenja. Nijedna stavka ne mijenja domensku logiku — samo obim podataka koji putuje.

### 1.1 [P0] Obavezna paginacija svih listi tiketa — napor M

**ŠTA:** Ukinuti mogućnost da ijedan poziv vrati kompletnu tabelu tiketa.

**PROBLEM:**
- `backend/src/modules/tickets/list-tickets.ts:114` — kad `page/pageSize` nije poslan, izvršava se `findMany({ where, orderBy })` **bez take/skip** → puni dump
- `frontend/src/services/tickets-api.ts:180` — `listTickets()` **nikad** ne šalje paginaciju
- Pozivaju je: dashboard (`use-dashboard-summary.ts:63`), SLA stranica (`use-sla-page-data.ts:54`), ticket lista (`use-ticket-list.ts:77,95`) i pretraga (`header-search-match.tsx:111`)

**CILJ:** Maksimalan odgovor bilo kojeg listnog endpointa = **50 redova**. Default `pageSize = 25`.

**ISPRAVKE:**
1. Backend: ukloniti "plain array" granu — `paging` postaje obavezan; `pageSize` clampovati na `[1, 50]`; vratiti `{ items, total, page, pageSize }` uvijek
2. Backend: u `findMany` dodati `select` samo kolona potrebnih za listni prikaz (bez `formData`, `description`, historije)
3. Frontend: sve pozive prebaciti na paginirani oblik; liste na infinite-scroll ili pager
4. Indeks provjera: `EXPLAIN` za najčešće filtere (status, assignedGroupId, originUnitId, createdAt DESC); dopuniti kompozitne indekse gdje seq scan ostane

**KAKO TREBA DA SE PONAŠA:**
- `GET /tickets` bez parametara vraća max 25 redova + `total`
- Dashboard učitava < 100 KB podataka (agregati dolaze iz stavke 2.4)
- Nijedan upit nad `tickets` ne izvršava sekvencijalni sken nad cijelom tabelom u produkcijskom volumenu

**VERIFIKACIJA:** k6 `browser_dashboard` — veličina odgovora < 100 KB; `pg_stat_statements` ne pokazuje `SELECT` nad `tickets` bez `LIMIT`; P95 tog endpointa < 150 ms pri 2.800 VU.

---

### 1.2 [P0] Server-side pretraga — napor M

**ŠTA:** Zamijeniti klijentsku pretragu (koja vuče cijelu bazu u browser) serverskim endpointima.

**PROBLEM:**
- `frontend/src/components/layout/header-search-match.tsx:111` — po JEDNOJ pretrazi: `listTickets()` (svi tiketi) + `listKnowledgeArticles()` (svi) + `loadDirectoryUsers()`
- `header-search-match.tsx:97` — `loadDirectoryUsers()` šalje **po jedan HTTP zahtjev za svaku OU** u stablu (enterprise = stotine paralelnih zahtjeva, svaki s punim auth/RBAC lancem)
- Filtriranje se radi u browseru → server ne zna da je "pretraga" uopšte desila

**CILJ:** Jedna pretraga = **1 HTTP zahtjev**, ≤ 15 rezultata po grupi (tiketi/artikli/korisnici).

**ISPRAVKE:**
1. Novi endpoint `GET /search?q=&types=ticket,article,user&limit=15` koji interno radi 3 paralelna upita s `ILIKE`/`pg_trgm`, RBAC-scoped (isti visibility where kao liste)
2. `pg_trgm` ekstenzija + GIN indeksi na poljima pretrage (ticket number/title, article title, user displayName/email)
3. Frontend: debounce 300 ms (postoji), abort prethodnog zahtjeva, cache zadnjih 5 upita
4. Direktorij korisnika: zaseban endpoint `GET /directory/users?search=` umjesto fan-outa po OU

**KAKO TREBA DA SE PONAŠA:**
- Kucanje u pretragu proizvodi najviše 1 zahtjev po završenom unosu (network tab to potvrđuje)
- Odgovor sadrži samo pogotke (max ~45 stavki), redovane po relevanciji/tipu
- Pretraga poštuje istu RBAC vidljivost kao i tiket liste

**VERIFIKACIJA:** k6 scenarija `search_heavy` (10% VU pretražuje 1/min): HTTP req/s raste < 30% naspram bazne; P95 `/search` < 200 ms.

---

### 1.3 [P1] Gašenje suvišnog inbox pollinga — napor S

**ŠTA:** Ukinuti 30-sekundni polling unread-counta dok je WebSocket spojen.

**PROBLEM:**
- `frontend/src/lib/notifications/use-inbox-notifications.ts:56` — `setInterval(refreshUnread, 30_000)` → `GET /notifications/unread-count`
- **Isti podatak istovremeno stiže socket pushom** (`notificationUnreadCount` event, isti fajl): dva kanala za jedno stanje
- Na 2.450 aktivnih = **~82 req/s konstantno**, svaki kroz puni auth lanac (~290 DB upita/s bačeno)

**CILJ:** Nula polling zahtjeva dok je socket zdrav; polling isključivo kao degradirani režim.

**ISPRAVKE:**
1. Uvesti flag `socketHealthy` (postavlja se na `connect`/`disconnect` eventima — socket singleton već emituje ove evente)
2. Interval pokrenuti SAMO kad `socketHealthy === false`; na `connect` odmah `refreshUnread()` + ugasiti interval
3. Backend: `unread-count` keširati u Redisu po userId (TTL 15 s) ili pokriti indeksom `(userId, isRead)` → uvijek brz index-only count

**KAKO TREBA DA SE PONAŠA:**
- Dok je WS spojen: 0 zahtjeva `/notifications/unread-count` u network logu, a badge se i dalje ažurira u realnom vremenu
- Kad WS padne: polling se vrati; kad se WS vrati: polling staje

**VERIFIKACIJA:** Load test: broj poziva `/notifications/unread-count` ≈ 0 uz zdrav WS; badge točnost potvrđena e2e testom (postojeći inbox spec proširen).

---

### 1.4 [P1] pg pool i timeouti — napor S

**ŠTA:** Eksplicitno konfigurisati konekcioni sloj prema Postgresu.

**PROBLEM:**
- `backend/src/common/prisma/prisma.service.ts:15` — `new PrismaPg({ connectionString })` bez Pool konfiguracije → node-postgres **default max = 10** konekcija
- Bez `statement_timeout`: jedan težak upit (punorama, SLA skener) drži konekciju minutama
- Nema PgBouncera: svaka buduća instanca aplikacije multiplicira konekcije

**CILJ:** Predvidljiva posjeda konekcija: pool ≈ 40–60 po instanci uz PgBouncer (transaction pooling), ili 2× CPU jezgara direktno. Nijedan upit ne traje > 5 s.

**ISPRAVKE:**
1. `new Pool({ connectionString, max: POOL_MAX, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 3_000 })` i proslijediti u `PrismaPg`
2. `statement_timeout = 5000` (session default), izuzeci za worker/izvještaje (poseban connection string ili `SET LOCAL`)
3. PgBouncer ispred Postgresa (transaction mode); `DATABASE_URL` aplikacije → PgBouncer; direktna konekcija samo za migracije
4. Metrika: broj `waiting` klijenata poola u observability modul

**KAKO TREBA DA SE PONAŠA:**
- Pod spike opterećenjem zahtjevi čekaju pool redovito (< 100 ms), ne padaju po connection timeoutu
- Upit duži od 5 s se prekida i loguje sa requestId-jem (postojeći request-context to podržava)

**VERIFIKACIJA:** `pg_stat_activity` — broj konekcija stabilan; tokom load testa nula `connection timeout` grešaka; waiting klijenti < 5% trajanja testa.

---

> **Kapija Faze 1:** load test 2.800 VU: DB QPS pada ≥ 5×, P95 dashboard + liste < 250 ms, veličina dashboard odgovora < 100 KB. Bez toga ne ići dalje.

---

## FAZA 2 — Razdužiti bazu i event loop (Sedmice 2–3)

### 2.1 [P0] SLA skener: od N+1 petlje do batch posla u workeru — napor M

**ŠTA:** Kompletno redizajnirati izvrsavanje SLA skeniranja.

**PROBLEM:**
- `backend/src/modules/sla/scan-due-ticket-sla-states.ts:19` — učitava SVE otvorene SLA zapise (`findMany` bez batchinga)
- `:24` — `for (const state of open) { await prisma.ticket.findUnique(...) }` — **sekvencijalan N+1**, jedan po jedan
- `syncTicketSlaTimers` po tiketu radi dodatne upite (slaProfile, zapisi, update) → ~3 upita × 50k tiketa = ~150k upita/ciklus
- `sla.constants.ts:30` — interval 60 s; skener (`ticket-sla-breach-scanner.service.ts`) živi u **API procesu** iako `create-worker-application.ts` postoji
- Rezultat: ciklus traje duže od intervala → preklapanje, event-loop pritisak, sveobuhvatna degradacija latencije

**CILJ:** Trajanje ciklusa **< 15 s pri 100.000 otvorenih tiketa**, izvan API procesa, bez mogućnosti preklapanja.

**ISPRAVKE:**
1. Query presložiti u batch: `WHERE resolutionCompletedAt IS NULL AND nextDueAt <= now() LIMIT 2000` — obrađuju se samo **dosuđeni** zapisi, ne svi
2. Kompozitni indeks `ticket_sla_state(resolutionCompletedAt, nextDueAt)`
3. Per-ticket logika (business-hours račun) ostaje, ali radi nad batchom s već učitanim tiketima (`findMany({ id: { in: ids } })`) — bez N+1
4. Prebaciti skener u worker aplikaciju (BullMQ repeatable job svaki min) + **distributed lock** (BullMQ već garantuje jedan aktivni posao)
5. Eskalacije/at-risk notifikacije dispatchovati iz iste transakcije batcha, ne zasebnim prolazima
6. Metrika: `sla_scan_duration_ms`, `sla_scan_processed` po ciklusu

**KAKO TREBA DA SE PONAŠA:**
- U logovima workera: ciklus obrađuje (tipično) 10–500 zapisa, ne 50.000
- Tiket koji "probija" SLA označen je u roku ≤ 90 s od stvarnog roka (60 s interval + obrada)
- API proces nema vidljive špikove latencije u trenucima skeniranja

**VERIFIKACIJA:** seed 100k otvorenih tiketa (10% dosuđenih) → ciklus < 15 s; load test: P95 API tokom ciklusa ne raste > 10%; u API procesu nema `sla` log linija.

---

### 2.2 [P0] Auth/RBAC kontekst: keširati, učitati jednom — napor S

**ŠTA:** Svesti autorizaciju po zahtjevu na najviše 1 keš-pročitanje.

**PROBLEM:**
- `backend/src/modules/authentication/session-authentication.guard.ts:36` — `authenticationUserLoader.findById` + `userRoles(include role)` **po svakom zahtjevu**
- `backend/src/modules/authorization/authorization-context.loader.ts:81,104` — isti korisnik se učitava **ponovo** (do dva dodatna `findUnique`) + grupe + OU scope
- Rezultat: 3–4 DB upita prije ijednog poslovnog upita; na ~950 req/s = **~3.300 upita/s čiste autorizacije**
- Redis postoji u projektu (`src/common/redis`) ali se za ovo ne koristi

**CILJ:** ≤ 0,05 DB upita po zahtjevu prosječno (95%+ keš hit), uz korektnu invalidaciju.

**ISPRAVKE:**
1. Jedan "principal context" objekat (user + roleKeys + groupIds + OU scope) učitan **jednom po requestu** i proslijeđen svim guardovima (eliminisati dupla učitavanja)
2. Keš po `userId` u Redisu, TTL 30–60 s; ključ `authz:{userId}:v{version}`
3. Invalidacija: povećati `version` na bilo kojoj promjeni role/grupe/OU pripadnosti (hook na tim mutacijama); kritične operacije (deaktivacija usera) invalidiraju odmah (`DEL` ključa)
4. Fail-open politika: na Redis padu → direktan DB read (sporije, ali radi)

**KAKO TREBA DA SE PONAŠA:**
- Authz DB upiti mjere se u jednocifrenim brojkama po sekundi pri 950 req/s
- Promjena uloge korisnika primjenjuje se ≤ TTL (uz trenutnu invalidaciju na kritičnim mutacijama)
- Deaktiviran korisnik gubi pristup odmah (bez čekanja TTL-a)

**VERIFIKACIJA:** load test: authz udio u DB QPS < 5%; integracijski test: deaktivacija usera → sljedeći zahtjev 401; test keša: 2 uzastopna zahtjeva = 1 DB upit.

---

### 2.3 [P0] Notification fan-out: od O(članova) do O(1) — napor M

**ŠTA:** Eliminisati "po jedan red + po jedan emit za svakog člana grupe" obrasce.

**PROBLEM:**
- `backend/src/modules/notifications/fan-out/fan-out-in-app-notifications.ts:36` — `recipientIds.map(persistInAppNotification)` = pojedinačni insert po primatelju
- `resolve-notification-recipients.ts:77` — primatelji = SVI članovi dodijeljene grupe za svaki ticket događaj
- `publish-created-notifications.ts` — petlja s po jednim realtime publishom po zapisu
- Grupa od 200 agenata → jedna poruka = **200 INSERT-a + 200 emit-ova**; pri 10 događaja/s = 2.000 write/s i rast tabele milionima sedmično

**CILJ:** Konstantan broj upisa po događaju nezavisno od veličine grupe (cilj: 1–2 upisa), čitljiv inbox bez rasta latencije.

**ISPRAVKE — dvostruki pristup (birati po roku):**
- **Opcija A (krajnje stanje):** grupna notifikacija kao JEDAN red (`notification` s `groupId`), pivot `notification_seen(notificationId, userId, seenAt)`; inbox korisnika = join koji izbacuje viđeno; unread count = agregat
- **Opcija B (kratki rok):** zadržati po-korisnik zapise, ali `createMany` batch (1 SQL umjesto N) + jedan publish po grupnoj sobi; klijent badge ažurira iz push payloada
1. Unread count ne računati kad se inbox ne otvara — samo na push eventima
2. Retencija: arhiviranje/brisanje notifikacija starijih od N dana (cron u workeru) s particionisanjem po mjesecu kad tabela prijeđe ~10M redova

**KAKO TREBA DA SE PONAŠA:**
- Poruka na tiketu grupe od 200 agenata: DB upisi ≤ 2 (opcija A) ili 1 batch statement (opcija B), emit-ova ≤ 2 (group soba + ticket soba)
- Inbox svakog agenta pokazuje notifikaciju; označavanje pročitanom kod jednog agenta ne utiče na druge
- `notifications` tabela: rast kontrolisan retencijom; count upiti konstantni po brzini

**VERIFIKACIJA:** integracijski test s grupom od 200: broj izvršenih INSERT statementa po događaju (iz logovanja query-ja) odgovara cilju; load test: notification writes/s < 100 pri 10 događaja/s.

---

### 2.4 [P1] Server-side agregati za dashboard i SLA ekrane — napor S

**ŠTA:** Prestati slati sirove tikete klijentu radi računanja brojčanika.

**PROBLEM:**
- `frontend/src/lib/dashboard/use-dashboard-summary.ts:63` — `listTickets()` → `summarizeTickets(tickets)` u JS-u
- `frontend/src/lib/sla/use-sla-page-data.ts:54` — isti obrazac
- `reports/dashboard` modul na backendu postoji, ali ga klijent ne koristi → dashboard pogled = puni dump + zamrzavanje glavne niti browsera

**CILJ:** Dashboard/SLA ekrani dobijaju **samo metrike** (par KB), računate SQL-om nad istim visibility where-uslovom.

**ISPRAVKE:**
1. Endpoint `GET /reports/dashboard/summary?scope=` — `SELECT status, count(*) GROUP BY status` (+ po prioritetu/grupi) s istim RBAC filterom kao liste
2. Endpoint `GET /reports/sla/summary` — count po SLA stanju (on-track/at-risk/breached) iz `ticket_sla_state`
3. Keš 15–30 s po (korisnik, scope) — dashboard brojke ne moraju biti milisekund-svježe; socket event `ticketUpdated` može invalidirati keš
4. Frontend hookovi zamijeniti pozive ka novim endpointima; ukloniti `summarizeTickets` nad punim dumpom

**KAKO TREBA DA SE PONAŠA:**
- Dashboard odgovor < 20 KB; brojčanici se slažu s listama (isti where)
- Osvježavanje brojčanika ≤ 30 s od promjene stanja tiketa

**VERIFIKACIJA:** k6: dashboard endpoint P95 < 100 ms; vizuelni test: brojke jednake onima iz paginiranih listi na istom filteru.

---

> **Kapija Faze 2:** load test 2.800 VU: DB QPS < 800 uz pool 40, authz udio < 5%, SLA ciklus < 15 s u workeru, notification writes/s < 100, P95 svih ključnih endpointa < 200 ms.

---

## FAZA 3 — Realtime i klijent (Sedmica 4)

### 3.1 [P1] Socket.IO Redis adapter + resursno odvajanje WS-a — napor S

**ŠTA:** Učiniti realtime sloj horizontalno skalabilnim.

**PROBLEM:**
- `backend/src/modules/websocket/websocket.gateway.ts:45` — `afterInit` registruje samo auth middleware; **nema** `server.adapter(...)` → default in-memory
- Implikacije: (a) sobe i emit funkcionišu samo unutar jednog procesa, (b) više instanci = klijenti u "paralelnim svemirima", (c) svaki deploy = istovremeni reconnect 2.800 klijenata (reconnect oluja → pik auth/rejoin upita)
- Redis klijent već postoji (`create-redis-client.ts`, BullMQ ga koristi)

**CILJ:** 2+ instance poslužuju WS bez gubitka događaja; deploy s drainingom proizvodi < 1% vidljivih prekida.

**ISPRAVKE:**
1. Instalirati `@socket.io/redis-adapter`; u `afterInit`: `server.adapter(createAdapter(pubClient, subClient))` s postojećim Redis kredencijalima
2. LB: sticky sessions (cookie) ili WebSocket upgrade ruta po instanci
3. Deploy procedura: `SO_LINGER`/drain — prestati primati nove WS, čekati ≤ 30 s, ugasiti; klijentski reconnect (postoji) + **jitter** dodati u socket.io-client opcije
4. Opcionalno (kad broj instanci poraste): izdvojiti WS gateway u zaseban proces; HTTP API ostaje čist

**KAKO TREBA DA SE PONAŠA:**
- Test s 2 instance: klijent na instanci A dobija event emitovan sa instance B
- Za vrijeme rolling deploya: < 1% klijenata doživi pauzu > 5 s; svi se automatski rejoinaju u svoje sobe (logika postoji u `useTicketRealtime`)

**VERIFIKACIJA:** integracijski test cross-instance (pub/sub dokaz); load test za vrijeme simuliranog rolling restarta: reconnect pik < 60 s, bez petlje `socket_authentication_rejected` u logovima.

---

### 3.2 [P1] Granulacija emit-ova: tihi countere, glasne detalje — napor M

**ŠTA:** Smanjiti mrežni šum group soba bez gubitka sigurnosne segmentacije.

**PROBLEM:**
- `backend/src/modules/websocket/ticket-updated-broadcast-rooms.ts` — svaki `ticketUpdated` ide u `group:{id}` sobu → svaki agent dobija svaki event svakog tiketa u grupi
- `frontend/src/lib/tickets/use-ticket-realtime.ts` — klijent odbacuje nevažne evente (`isStaleTicketEvent`) → filtriranje tek POTROŠENOG bandwidtha
- Pri 600 događaja/min × 200 agenata = **2.000 emit-ova/s** kroz jednu nit; klijenti troše CPU na odbacivanje
- Sigurnosna segmentacija (staff/public sobe, pravilo o internim bilješkama u `broadcast-ticket-realtime.ts`) je korektna — **ne dirati je**

**CILJ:** ≤ 2 "debele" emit-a po događaju (ticket staff/public sobe); grupne sobe dobijaju samo lagane metapodatke.

**ISPRAVKE:**
1. Razdvojiti tipove: `ticketUpdated` (puni payload) → samo ticket sobe + user sobe aktera; novi event `groupFeedChanged { groupId, ticketId, kind }` (< 200 B) → group soba
2. Klijent listnih ekrana: na `groupFeedChanged` označiti affected query kao stale (React Query invalidacija iz 3.3) — povlači samo ako je ekran aktivan i relevantan
3. Zadržati pravilo: interne bilješke/system eventi NIKAD u public/group kanale (regresijski test obavezan)
4. Metrika: emit-ova/s po sobi; alert > prag

**KAKO TREBA DA SE PONAŠA:**
- Agent koji gleda tiket dobija sve detalje odmah (kao i danas)
- Agent na listi grupe vidi "nešto se promijenilo na ticketu #X" indikator; puna promjena se dovlači samo kad mu treba
- Ukupni emit-ovi/s padaju ≥ 10× na istom obimu događaja

**VERIFIKACIJA:** unit test broadcast rooms matrice (staff vs public vs group, internal vs public poruka); load test: emits/s < 500 pri 10 događaja/s; e2e: interna bilješka se nikad ne pojavljuje ni u jednom neautorizovanom kanalu.

---

### 3.3 [P1] Keš sloj klijenta (React Query) + virtualizacija — napor M

**ŠTA:** Uključiti već instalirani `@tanstack/react-query` kao jedinstveni keš/sinhr. sloj i uvesti virtualizaciju dugih listi.

**PROBLEM:**
- `@tanstack/react-query` je u `package.json`, ali **0** upotreba `useQuery(` u `src/`
- Ručni `useState/useEffect` servisi: nema deduplikacije, staleTime-a niti cross-route keša — iste kolekcije (OU stablo, servisi, grupe, routing pravila) povlače se 2–4× po sesiji
- Sve P0/P1 stavke klijentski se **multipliciraju ×2–4** zbog ovoga
- Duge liste (tiketi, audit log) bez virtualizacije → render troškovi rastu s paginacijom/infinite scrollom

**CILJ:** Svaki resurs se dohvata najviše 1× unutar `staleTime` prozora po browser sesiji; liste renderuju ≤ ~60 DOM redova bez obzira na količinu podataka.

**ISPRAVKE:**
1. `QueryClient` s defaultima: `staleTime: 30_000` (katalozi 300_000), `retry: 1`, `refetchOnWindowFocus: false` (realtime već pokriva svježinu)
2. Migrirati po prioritetu: OU stablo, servisi, grupe, routing pravila → listne upite → detalji tiketa
3. Socket eventi (postojeći singleton) = jedinstvena tačka `queryClient.invalidateQueries(...)` mapiranja event → queryKey
4. `zustand` zadržati samo za UI stanje (filteri, selekcije), ne za server podatke
5. Virtualizacija (`@tanstack/react-virtual` ili slično) za listu tiketa i audit log

**KAKO TREBA DA SE PONAŠA:**
- Navigacija dashboard → lista → nazad: 0 novih mrežnih zahtjeva unutar staleTime prozora
- Socket event `ticketUpdated` invalidira tačno pogođeni ticket + pogođene liste, ništa više
- Lista od 10.000 redova scrolla bez blokiranja glavne niti (Input latency < 50 ms)

**VERIFIKACIJA:** React Query Devtools: dupli fetch istog queryKey-a ne postoji; network tab pri tipičnoj sesiji: ≥ 50% manje zahtjeva naspram baselinea; Lighthouse/Performance profil liste.

---

> **Kapija Faze 3:** cross-instance WS dokazan; rolling deploy bez vidljivih prekida; emits/s < 500; klijentski zahtjevi po sesiji ≥ 50% manje; P95 interakcija < 100 ms.

---

## FAZA 4 — Otpornost, higijena i operativa (Sedmica 5)

### 4.1 [P2] Svi @Interval jobovi u worker, pod lockom — napor S

**ŠTA:** Iz API procesa izvaditi sve periodične poslove.

**PROBLEM:**
- `@nestjs/schedule` jobovi u API modulu: SLA skener (60 s — riješeno u 2.1, ali obrazac ostaje), `ticket-archive-automation.service.ts` (15 min), `waiting-for-user-automation.service.ts` (15 min), `knowledge-base-review-reminder.service.ts` (15 min), `integration-queue` heartbeat/DLQ retention
- API proces poslužuje i HTTP i WS → svaki job = špik latencije; multi-instance budućnost = paralelno izvršavanje istih poslova

**CILJ:** API proces = samo request/response + WS. Sva automatika: worker proces, BullMQ repeatable (vidljivost, retry, jedinstvenost).

**ISPRAVKE:**
1. Prebaciti `@Interval` servise u BullMQ repeatable jobs unutar `create-worker-application.ts` konteksta
2. Idempotencija: svaki job mora biti siguran za ponovno izvršenje (upsert/optimistic where uslovi)
3. Raspored razmjestiti (ne svi u istoj minuti); timeout po jobu + alarmiranje na DLQ
4. `use-integration-worker-status.ts:30` (frontend polling statusa) — prebaciti na socket event ili ručno osvježavanje

**KAKO TREBA DA SE PONAŠA:**
- U API logovima: nema job iteracija; P95 latencije bez 15-minutnih špikova
- Dva workera pokrenuta: svaki job se izvršava tačno jednom po rasporedu (BullMQ jamči)

**VERIFIKACIJA:** Test s 2 workera: broj izvršenja posla po intervalu = 1; load test tokom job ciklusa: P95 stabilan.

---

### 4.2 [P2] Kapacitivni plan i budžeti performansi — napor S

**ŠTA:** Zadati trajne granice ("performance budget") i procedure koje sprečavaju regresiju.

**PROBLEM:** Svaka dosadašnja greška nastala je najmanje jednom jer nikad nije postojala pisana granica ("koliko smije koštati jedan endpoint / jedan event / jedan tick").

**CILJ (SLO tabela na ciljnoj skali — 2.800 aktivnih, 10 događaja/s):**

| Metrika | Budžet |
|---|---|
| P95 bilo kojeg read endpointa | < 200 ms |
| P95 bilo koje mutacije | < 400 ms |
| DB upita po HTTP zahtjevu | ≤ 2 prosječno |
| DB QPS ukupno | < 1.000 uz pool 40 |
| SLA scan ciklus | < 15 s @ 100k otvorenih |
| WS emit-ova / s | < 500 |
| Dashboard payload | < 100 KB |
| Pretraga: zahtjeva po unosu | 1 |
| Frontend zahtjevi po sesijskoj ruti | katalog ≤ 1/staleTime |
| k6 error rate (2.800 VU, 30 min) | < 0,5% |

**ISPRAVKE:**
1. CI korak: k6 smoke (200 VU, 5 min) s pragom na P95 i error rate — pad = blokirajući
2. Query budžet middleware (dev/staging): > 3 upita po zahtjevu = upozorenje u log s requestId-jem
3. Kvartalno: puni load test (2.800 VU) + revizija indeksa i ekspanata tabele `notifications`/`audit_log`/`tickets` (particionisanje plan kada `tickets` > 5M)
4. Runbook: reconnect oluja, Redis pad, pool zasićenje — s koracima ublažavanja

**KAKO TREBA DA SE PONAŠA:**
- Regresija obima odgovora ili broja upita ne može proći CI neprimijećeno
- Svaki novi endpoint/emit ima dokumentiran budžet u PR opisu

**VERIFIKACIJA:** CI artefakt k6 izvještaja po grani; kvartalni zapisnik s rezultatima (tabela u odjeljku 7).

---

## 5. Prioritetna matrica (brzi pregled)

| # | Stavka | Faza | Sev. | Napor | Glavni efekat |
|---|---|---|---|---|---|
| 1.1 | Paginacija listi tiketa | F1 | P0 | M | Eliminira full-table dumpove |
| 1.2 | Server-side pretraga | F1 | P0 | M | Eliminira N-pozivni fan-out klijenta |
| 1.3 | Inbox polling off | F1 | P1 | S | −82 req/s konstantno |
| 1.4 | pg pool + timeouti | F1 | P1 | S | Uklanja usko grlo konekcija |
| 2.1 | SLA skener batch+worker | F2 | P0 | M | −150k upita/min, miran event loop |
| 2.2 | Authz keš (Redis) | F2 | P0 | S | −3.300 upita/s u vrhu |
| 2.3 | Notification O(1) fan-out | F2 | P0 | M | −2.000 write/s u vrhu |
| 2.4 | Server agregati | F2 | P1 | S | Dashboard < 100 KB |
| 3.1 | Redis WS adapter | F3 | P1 | S | Multi-instance, failover |
| 3.2 | Granulacija emit-ova | F3 | P1 | M | −10× mrežni šum |
| 3.3 | React Query + virtualizacija | F3 | P1 | M | −50% klijentskih zahtjeva |
| 4.1 | Jobovi u worker | F4 | P2 | S | Miran API proces |
| 4.2 | Budžeti + CI load test | F4 | P2 | S | Regresijske kontrole |

Redoslijed unutar faze je istovremeno redoslijed izvršenja (1.1 i 1.4 mogu paralelno; 2.2 prije 2.3 zbog keš infrastrukture).

---

## 6. Zavisnosti, rizici i rollback

### 6.1 Zavisnosti
- **Redis** postaje kritična komponenta (authz keš + WS adapter + BullMQ) → potrebna perzistencija nije, ali HA (replica) preporučena; fail-open na DB read
- **Migracije šeme:** 2.3 opcija A (notification pivot) je breaking za inbox API — koordinirati s klijentom (feature flag: čitaj staro+novo, pa prebaci)
- **Indeksi (1.1, 2.1):** kreirati `CONCURRENTLY` van vršnog vremena

### 6.2 Rizici po fazi
| Rizik | Ublažavanje |
|---|---|
| Paginacija lomi stare klijente (1.1) | Zadržati `{ items, total, ... }` oblik (postoji kao grana), ukloniti samo "bez limita" granu; klijent se ionako mijenja |
| Keš authz zadrži staru ulogu do 60 s (2.2) | Eksplicitna invalidacija na mutacijama; deaktivacija = trenutna |
| Redis adapter različite verzije socketa u tranziciji (3.1) | Rolling deploy prema procedurei; klijentski reconnect podnosi |
| React Query migracija otkrije skrivene zavisnosti o "uvijek svježim" podacima (3.3) | Po-modulna migracija; socket invalidacije pokrivaju svježinu |

### 6.3 Rollback princip
Svaka stavka iza feature flaga ili iza deploy granice (osim indeksa i poola koji su unaprijed kompatibilni). Load test po fazi odlučuje o napretku (kapije na kraju svake faze); ne uspije li kapija — faza se vraća, ne nadovezuje.

---

## 7. Tabela napretka (popunjavati nakon svake faze)

| Kontrolna tačka | DB QPS | P95 read | SLA ciklus | Emit-ovi/s | Dashboard KB | Error rate (k6) |
|---|---|---|---|---|---|---|
| Baseline (prije F1) | ~5.500 | > 2 s | ~7 min | ~4.600 | ~240.000 | > 5% |
| Nakon F1 | | | | | | |
| Nakon F2 | | | | | | |
| Nakon F3 | | | | | | |
| Nakon F4 (cilj) | < 1.000 | < 200 ms | < 15 s | < 500 | < 100 | < 0,5% |

---

## 8. Šta NIJE predmet ovog plana

- Skaliranje infrastrukture servera (zadano je da kapacitet hosta nije problem)
- Funkcionalne izmjene domena (routing logika, SLA pravila, katalog) — osim obrasca izvršavanja
- Edge ekstenzija (`docs/03-edge-extension.md`) — Faza 6 originalnog TASKS.md; primijeniti iste budžete kad se otvori
- Dizajn/UI izmjene koje ne utiču na protok podataka

---

*Dokument izveden iz audita performansi (statika analiza svih navedenih fajlova). Svaka stavka ima mjerljiv prihvatni kriterij; kapije faza su obavezujuće.*
