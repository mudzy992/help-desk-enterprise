# W6.45 — `BA-announcements-02`: audience filteri prije active/archive capa

**Status:** `BA-announcements-02` zatvoren na finding nivou nakon push-triggered CI-ja [`42531561241`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42531561241) (**success**).
**Kod i testani SHA:** [`94a7fd9de25ea7882190959ad9e6eadde98785c6`](https://github.com/mudzy992/help-desk-enterprise/commit/94a7fd9de25ea7882190959ad9e6eadde98785c6)
**Scope:** samo Val 6 P1 `BA-announcements-02`; `BA-announcements-03/04`, svi P2/P3 i BA-15 full critical-flow acceptance nisu uključeni.
**Datum:** 2026-10-29

## Korekcija

Prije promjene su se active najave ograničavale na globalnih 50, a archive na globalnih 100 redova, pa se viewer audience filtrirao tek nakon capa. Foreign audience rows su zato mogli istisnuti sve relevantne najave, uključujući matching `CRITICAL`.

`AnnouncementsService` sada gradi audience `where` uslov iz istog AND modela kao postojeći `isInAnnouncementAudience`:

- neprazni role, home-OU/ancestor i group filteri moraju svaki odgovarati;
- prazan announcement filter ostaje globalan za tu dimenziju;
- home OU i sve canonical ancestor putanje mapiraju se na exact OU ID-eve, jer announcement OU target uključuje potomke;
- nedostajući/nekvalidan viewer scope ne poklapa neprazne audience filtere;
- taj uslov se spaja u PostgreSQL active/archive query prije postojećih limita. Active query dodatno sortira `severity DESC`, `startsAt DESC`, `id ASC` prije capa 50. Archive ostaje ograničen na postojeći 90-dnevni time window i 100 redova; active acknowledgement/dismissal filteri su nepromijenjeni.

Active i archive limiti su sada eksplicitni constants. Active response zadržava severity rank i deterministički ID tie-break. Manage-list cap, pagination/`hasMore`, fan-out, report/CSV i druga BA-14/BA-03/BA-04/P2/P3 acceptance nisu prošireni.

Dodani su unit testovi za audience query predicates, OU ancestry, capove i fail-closed nedostajući scope. Nova PostgreSQL integracijska regresija registrirana je u isolated runneru: 50 foreign active CRITICAL rows ne mogu istisnuti matching critical notice iza 50 nižeg severity visible rows; 101 foreign archive row ne mogu istisnuti matching arhivsku najavu. Fixture/assertion čuvaju postojeće archive ponašanje u kojem se nedavno aktivne najave mogu pojaviti unutar njegovog prozora.

## Provjere i granice

Lokalno su prošli targeted ESLint, `git diff --check`, isolated-runner guard **20/20** i fokusirani Jest **2/2 suitea, 13/13 testova**. Lokalni generated Prisma Client nije bio dostupan, pa je fokusirani Jest koristio privremeni ts-jest `diagnostics:false` config; to nije lokalni generated-Prisma type-check. Finalni CI [`42531561241`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42531561241) izvršio je pravi generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration (uključujući BA-02 regresiju), frontend build/test, Docs guard, container/supply-chain i CI gate — sve **success**. Read-only inventory, E2E install/critical i conditional high/critical image enforcement bili su `skipped`, ne passed.

Prva dva automatska push CI pokušaja otkrila su samo greške u regresijskom testu: arhivski fixtures prekršili su `endsAt > startsAt`, zatim je assertion pogrešno isključio nedavno aktivne redove iz archive windowa. Obje korekcije su test-only i finalni CI na navedenom SHA-u je zelen.

Odvojeni automatski Perf smoke [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320) na početnom kodnom SHA `60b16dd` zabilježio je globalni query-budget `2.123 > 2.1` (50.847 zahtjeva; p95 3; max 34). Run nije utvrdio BA-02 uzročnost; prag nije mijenjan, Perf nije označen kao zelen niti je ponovljen nakon kasnijih test-only korekcija. Ova finding-level closeout tvrdnja zato se odnosi na BA-02 funkcionalne/integracijske acceptance i zeleni finalni CI, ne na neriješeni globalni Perf threshold.

Nema Prisma schema izmjene ni migracije, target baza nije korištena, nema PR-a, mergea ili deploymenta. Nakon W6.45 Val 6 je **49/109 zatvorenih, 60 otvorenih (2 P1 / 41 P2 / 17 P3)**; source audit/plan **512/180**, globalni registar **522/170**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 su `BA-announcements-03/04`; BA-15 full critical-flow acceptance ostaje pending i izvan scopea.
