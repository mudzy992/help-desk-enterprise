# PROMPT ZA AGENTA — FAZA 1: Stop-krvarenje (paginacija, pretraga, polling, pool)

> **Kako se koristi:** Otvori **novi** agent session. Zalijepi CIJELI ovaj dokument kao prvi prompt. Preduslov: Faza 0 završena (baseline postoji u `perf/results/`).
> **Izvršni cilj faze:** ukloniti 70–80% nepotrebnog protoka podataka BEZ ijedne promjene domenske logike. Detalji: `PERFORMANCE_PHASE_PLAN.md` FAZA 1.
> **Kapija koja mora proći na kraju:** DB QPS pada ≥ 5×, P95 lista/dashboard < 250 ms, dashboard odgovor < 100 KB (k6, isti scenario kao baseline).

---

## 1. TVOJA ULOGA

Ti je **senior fullstack inženjer** (NestJS + Prisma + React/Vite). Radiš četiri nezavisne, redoslijedno bezazlene ispravke. Svaka stavka = zaseban logički diff. Ne miješaj stavke u jedan diff. Svaka ispravka mora biti unaprijed-kompatibilna za klijente koji se još nisu promijenili, OSIM gdje ovaj dokument izričito kaže da se mijenjaju oba zajedno.

## 2. OBavezno PROČITAJ

1. `PERFORMANCE_PHASE_PLAN.md` — FAZA 1 (§1.1–§1.4) + §5 (prioriteti) + §6.2 (rizici Faze 1)
2. `backend/src/modules/tickets/list-tickets.ts` (cijeli) + `tickets.controller.ts` (paging grana ~76–85)
3. `frontend/src/services/tickets-api.ts` (listTickets ~180 i svi pozivaoci)
4. `frontend/src/components/layout/header-search-match.tsx` i `header-search.tsx`
5. `frontend/src/lib/notifications/use-inbox-notifications.ts`
6. `backend/src/common/prisma/prisma.service.ts`, `backend/.env.example`
7. `frontend/src/lib/dashboard/use-dashboard-summary.ts`, `frontend/src/lib/sla/use-sla-page-data.ts`, `frontend/src/lib/tickets/use-ticket-list.ts`
8. Postojeći `*.spec.ts` uz svaki fajl koji diraš — OBAVEZNO ih proširiti, ne mijenjati postojeće slučajeve bez razloga

## 3. VJEŠTINE

- Prisma paginacija + `select` projekcije; SQL indeks strategija (EXPLAIN ANALYZE)
- REST dizajn kompatibilnosti; React hooks refaktor bez promjene vizuelnog ponašanja
- pg_trgm / ILIKE pretraga; node-postgres Pool tuniranje
- Čitanje postojećih test obrazaca (in-memory delegati) i njihovo očuvanje

## 4. ŽELJEZNA PRAVILA

1. **Domenska logika netaknuta:** visibility/RBAC where-uslovi, redoslijed sortiranja, statusna mašina — ostaju bajt-po-bajt isti. Radiš SAMO obim/protok.
2. **Kompatibilnost odgovora:** klijent i server mijenjaš u istoj ispravci; nikad backend "breaking" bez istovremene klijentske izmjene.
3. **Pagination granica je apsolutna:** nijedan listni endpoint ne smije vratiti > 50 redova, čak ni s eksplicitnim `pageSize=10000` (server clampuje).
4. Nove bibloteke: zabranjene, osim ako ih ovaj dokument ne navede — sve je izvodivo postojećim stackovima.
5. Svaka stavka: prvo test koji pokazuje problem (ili novi test koji "zaključava" novo ponašanje), pa implementacija.
6. Stil repo-a: mali funkcijski moduli, `readonly` tipovi, colocated `.spec.ts`, in-memory delegati za testiranje portova; bez `any`.
7. Redoslijed: 1.4 (pool) → 1.1 (paginacija) → 1.2 (pretraga) → 1.3 (polling). Ne preskači.

## 5. STAVKE

### STAVKA 1.4 — pg Pool + timeouti (napor S) — PRVA

**ŠTA/PROBLEM/CILJ:** vidi plan §1.4. Danas: `new PrismaPg({ connectionString })` → pg default `max=10`, bez timeouta.

**ISPRAVKA:**
- `PrismaService`: eksplicitan `new Pool({ connectionString, max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 3000 })`; `max` iz env `DB_POOL_MAX` (default 40)
- `statement_timeout`: postaviti per-session kroz pool `connection` config ili `afterConnect` hook (default 5000 ms); dokumentuj izuzetak za worker konekcije
- Ažuriraj `backend/.env.example` (`DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`) i `docker-compose.yml` env mapiranje
- `.spec.ts`: parser env → pool config (granice, defaulti)

**PONAŠANJE:** Pod umjetnim opterećenjem (k6 smoke) — nula `connection timeout` grešaka; upit > 5 s pada s vidljivim requestId-jem u logu.

**VERIFIKACIJA:** test klase konfiguracije; ručno: `SHOW statement_timeout;` na konekciji iz poola; k6 smoke p95 bez regresije.

### STAVKA 1.1 — Obavezna paginacija listi tiketa (napor M)

**ŠTA/PROBLEM/CILJ:** plan §1.1. Ukloniti "plain array bez limita" granu (`list-tickets.ts` ~114). Max 50, default 25.

**ISPRAVKA (backend):**
- `list-tickets.ts`: `paging` uvijek obavezan — `pageSize = clamp(query.pageSize ?? 25, 1, 50)`; odgovor uvijek `{ items, total, page, pageSize }` (oblik koji već postoji kao grana — ne izmišljaj novi)
- Dodaj `select` projekciju za listni prikaz: bez teških polja (npr. opis/formData — provjeri shemu `prisma/schema/ticketing.prisma` šta listni DTO stvarno koristi)
- Detaljni endpoint (`GET /tickets/:id`) ostaje puni — ne diraj
- Testovi: paging spec (`tickets.list-paging.spec.ts`) — dodaj slučajeve: default=25, clamp na 50, `total` tačan, stabilan `orderBy` (dodaj `id` tiebreaker ako ga nema — obavezno deterministic order!)

**ISPRAVKA (frontend):**
- Svi pozivaoci (`use-ticket-list.ts`, `use-dashboard-summary.ts`, `use-sla-page-data.ts`, `header-search-match.tsx`) prelaze na paginirani oblik:
  - `use-ticket-list.ts`: paginacija/infinite u UI-ju bez vizuelne regresije
  - dashboard/SLA/pretraga: PRIVREMENO (do Faze 1.2/2.4) dohvataju samo prvu stranicu gdje je još dopustivo, i komunikacija prema korisniku: ovi ekrani će u Fazi 1.2/2.4 doći na prave endpointove — u ovoj stavci im JE ZABRANJENO vući sve stranice u petlji ("while nextPage") — to bi bilo gore od bolesti
- `tickets-api.ts`: tip odgovora ažurirati; helper `listTicketsPage(query)`

**PONAŠANJE:** Network: svaki odgovor liste ≤ 50 redova; UI liste rade kao i prije (uz pager); dashboard i dalje prikazuje podatke iako je privremeno ograničen (dokumentovano u izvještaju kao poznato ograničenje do Faze 2.4).

**VERIFIKACIJA:** `npm test`; k6 `browser_dashboard`: veličina odgovora `/tickets` < 100 KB; EXPLAIN liste nema seq scan bez LIMIT u `pg_stat_statements` top-listi.

### STAVKA 1.2 — Server-side pretraga (napor M)

**ŠTA/PROBLEM/CILJ:** plan §1.2. `searchHeaderSources` danas = `listTickets()` + `listKnowledgeArticles()` + po 1 poziv po OU.

**ISPRAVKA (backend):**
- Novi modul/kontroler endpoint `GET /search?q=&types=ticket,article,user&limit=15`:
  - 3 paralelna upita; svaki poštuje ISTI RBAC/visibility where kao odgovarajuća lista (ponovi obrazac, bez copy-paste dupliranja — izdvoj zajedničku funkciju ako je čisto)
  - Tiketi: `ILIKE` po broju/naslovu; artikli po naslovu; korisnici po displayName/email; svaki `LIMIT 15`
  - `pg_trgm`: migracija `CREATE EXTENSION IF NOT EXISTS pg_trgm` + GIN indeks(i) `CONCURRENTLY` (provjeri postojeće migracije za `CONCURRENTLY` obrasce; Prisma migracije — ručni SQL blok u migraciji je dopustiv, dokumentuj)
- DTO + class-validator (`limit` clamp 1–25, `q` min 2 znaka). Rate obrazac: isti guard paket kao ostali endpointi.

**ISPRAVKA (frontend):**
- `header-search*.tsx`: zamijeni 3-source fetch JEDNIM pozivom `/search`; zadrži debounce 300 ms; dodaj `AbortController` (otkaži prethodni); prikaži grupe pogodaka iz odgovora
- `loadDirectoryUsers()` i pretplate brisati tek kad pretraga radi end-to-end; OU korisnicima se ne pristupa više iz pretrage

**PONAŠANJE**: 1 zahtjev po završenom unosu; ≤ ~45 stavki; isti rezultati vidljivosti kao liste; typing na 2+ znaka ne proizvodi vodopad zahtjeva.

**VERIFIKACIJA:** integracijski test: agent vidi samo tikete svog scope-a u `/search`; `.spec.ts` za q/clamp granice; k6 `search_heavy`: rast req/s < 30% naspram bazne sesije.

### STAVKA 1.3 — Inbox polling samo kao fallback (napor S)

**ŠTA/PROBLEM/CILJ:** plan §1.3. `use-inbox-notifications.ts:56` polla 30 s iako isti broj stiže socketom.

**ISPRAVKA:**
- U `acquireHelpdeskSocket` (već singleton) izloži zdravlje veze: postojeći `connect`/`disconnect` eventi → flag dostupan klijentskim hookovima (mali util, bez novog state managementa)
- `use-inbox-notifications.ts`: interval pokrenuti SAMO dok `!socketHealthy`; na `connect`: odmah `refreshUnread()` + clearInterval; na `disconnect`: startInterval
- Backend `GET /notifications/unread-count`: dodaj Redis keš po userId TTL 15 s (`src/common/redis` klijent postoji) — invalidacija na fan-out putu (publish-created) DEL ključa; ako Redis nije dostupan → DB fallback (ne failati)
- Testovi: hook unit test (mock socket) — interval OFF dok spojen, ON kad pao; keš util spec (hit/miss/DEL)

**PONAŠANJE:** Zdrav WS ⇒ 0 poziva unread-count; WS pad ⇒ badge i dalje živ; WS povratak ⇒ polling staje; badge korektnost nepromijenjena (postojeći e2e inbox testovi proširiti ako postoje).

**VERIFIKACIJA:** unit testovi + ručni network audit; k6: pozivi `/notifications/unread-count` ≈ 0 pri zdravom WS-u.

## 6. DEFINITION OF DONE — KAPIJA FAZE 1 (sve mora važiti)

- [ ] Svaka stavka = zaseban diff sa svojim testovima; `npm test`, `npm run build`, `npm run lint` zeleni
- [ ] k6 PUNI test: DB QPS ≥ 5× niže od baselinea; P95 liste < 250 ms; odgovor `/tickets` < 100 KB; greške < baseline
- [ ] `perf/results/` ima after-F1 izvještaj + SQL snapshot; popunjen red "Nakon F1" u plan §7 (brojke sažeto)
- [ ] `.env.example` i README dokumentuju nove varijable

## 7. VAN OBIMA

- SLA skener, authz keširanje, fan-out notifikacija, Redis WS adapter, React Query migracija, jobovi (Faze 2–4)
- Vizuelni redizajn; nove funkcionalnosti (favoriti, saved views itd.)
- Full paginacija audit-loga/reports listi ako nisu u obimu dashboard toka (napomenuti u izvještaju, ne dirati)

## 8. FINALNI IZVJEŠTAJ (obavezan format)

```
FAZA 1 — IZVJEŠTAJ
Diff-ovi po stavki: <fajlovi>
Kapija: DB QPS prije/poslije=? P95 prije/poslije=? KB odgovora prije/poslije=?
Poznata ograničenja do sljedećih faza: <dashboard agregati → Faza 2.4, ...>
Odstupanja od plana: <šta/zašto>
Prijedlog commitova: <slijed>
```

## 9. PRAVILA DISKUSIJE

- Ako RBAC where-uslov nije moguće ponoviti bez refaktora domena — STANI i pitaj; sigurnost > rokovi.
- Ako k6 kapija ne prođe, ne "dotjeruj" test — dokumentuj i vrati stavku koja nedonoše.
