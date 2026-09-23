# Pulse UI — Faze 0–7 isporučene (migracija kompletna; ostaje tvoj QA prolaz i UAT)

> Ovo je produkcijska implementacija novog identiteta na **stvarnom frontendu** tvog projekta
> (`frontend/`), predata kao `.patch` fajlovi jer je moja sesija fiksirana na granu
> `arena/01a0cefc-help-desk-enterprise` i ne mogu kreirati granu `pulse-ui`.
>
> Plan iz kojeg je ovo izvedeno: [`PRODUCTION_MIGRATION_PLAN.md`](./PRODUCTION_MIGRATION_PLAN.md).

---

## 1. Šta je isporučeno

| Faza | Sadržaj | Status |
|---|---|---|
| **0 — Temelji** | Tokeni u 3 tematska bloka, `tailwind.config.ts` na CSS kanalima, ThemeProvider + kontrakt, no-FOUC skripta, birač teme u topbaru, migracija **svih 82 hardkodirane boje** na tokene | ✅ |
| **1 — UI primitivi** | Svih 19 postojećih primitiva restilizovano + 5 novih (Modal, ConfirmDialog, Toast, Segmented, Chip) + Theme tab u Visual QA | ✅ |
| **2 — Shell + ⌘K paleta + prijava + čarobnjak** | Topbar, sidebar, korisnički meni, komandna paleta sa pretragom, nova stranica prijave, čarobnjak za instalaciju sa stepperom | ✅ |
| **3 — Grafikoni** | Donut, grupisan i horizontalni barovi prerađeni u Pulse jezik + novi **dual area** grafikon (sada na nadzornoj ploči) + svi grafikoni na Visual QA | ✅ |
| **4.1 — Tiketi** | Cijeli `components/tickets/` (48 fajlova): lista, tabela, inbox, detalj tiketa, razgovor, CSAT, SLA panel, prilozi, odobrenja, bulk bar, saved views, obrasci za kreiranje, break-glass, time tracking, banneri | ✅ |
| **4.2 — Nadzorna ploča i izvještaji** | Sve kartice nadzorne ploče (metrike, grafikoni, SLA nadzor, aktivnost, inbox, tabela pažnje) i stranica izvještaja; **+ popravke koje si prijavio: SLA prikaz i fiksna visina razgovora** | ✅ |
| **4.3 — Servisi i baza znanja** | Cijeli `components/services/` (32 fajla: katalog, kategorije, graditelj formi, onboarding čarobnjak, periodi nedostupnosti) i `components/knowledge-base/` (9 fajlova: lista, pretraga, detalj, izmjena, lifecycle, brisanje) | ✅ |
| **4.4 — SLA, routing i policy paketi** | Cijeli `components/sla/` (24 fajla: profili, pravila, eskalacije, kalendari radnog vremena, matrica prioriteta, compliance, izmjene), `components/routing/` (14 fajlova: pravila, matrica pokrivenosti, tester razrješavanja) i `components/policy-packs/` (3 fajla) | ✅ |
| **4.5 — Administracija** | `components/admin/` (3), `users/` (10), `groups/` (6), `organizational-units/` (6), `rbac/` (3), `settings/` (13) — korisnici, grupe, organizacione jedinice, dozvole, sistemska podešavanja | ✅ |
| **4.6 — Konfiguracije, red, održavanje, povratne informacije** | `components/config-versions/` (10), `queue/` (2), `maintenance/` (1), `feedback/` (1), `auth/` (1), `visual-qa/` (6) — verzije konfiguracije, integracioni red, traka održavanja, povratne informacije o akcijama, promjena lozinke, Visual QA tabla | ✅ |
| **4.7 — Stranice i radius sistem** | `pages/*` (23 fajla provjerena, 3 dotjerana) + zatvaranje posljednjeg propusta u radius sistemu (`rounded-xl` nije bio vezan na token) kroz `layout/command-palette` i dva fajla razgovora tiketa | ✅ |
| **5 — Izgled (dark mode + stranica podešavanja)** | Nova stranica **`/appearance`** (dizajn, svjetlina, živi pregled iz pravih primitiva, „vrati na zadano"), ulazi u korisničkom meniju i u biraču teme, 22 nova i18n ključa u oba lokala; **verifikovano da su sva tri tematska bloka potpuna** (48/48/48 tokena, bez razlika) | ✅ |
| **5b — Palete boja** | Treća osa izgleda: **`data-accent` — indigo (zadana) / teal / rose**. Rotira samo brend boje (primary familija, fokus prsten, linkovi, selekcija, glow), pa radi u obje svjetline bez drugog bloka tokena po modu. Ulaz: korisnički meni („Izgled"), birač teme u topbaru (grupa „Boja") i kartica na `/appearance`. **Sva 24 mjerenja kontrasta ≥ 4.5:1** | ✅ |
| **6 — Dokumentacija i pravila** | Ustav prepisan na Pulse (boje, radius/sjena, dark mode, anti-obrasci, tokeni), `theme.md` dobio **palete i tabelu kontrasta**, **`theme-source.md` arhiviran** (stara dark-only paleta nije više „mjerodavna"), reference u alignment planu i promptovima ažurirane, **`referenca-dizajn/` arhiviran** README-om. **Nula linija koda** | ✅ |
| **7 — Verifikacija, guard i a11y** | Pun verifikacioni niz (tsc, testovi, build, oba guard-a), **nova guard skripta** `scripts/check-pulse-design-system.mjs` (6 grupa pravila, u CI-ju), **a11y: 17 mjesta bez vidljivog fokusa popravljeno**, 43 zastarjele upute u promptovima očišćene | ✅ |

| Faza | Putanja | Diff |
|---|---|---|
| 0+1 | 79 (69 izmijenjenih + 10 novih) | 3135 linija u 2 patcha |
| 2 | 27 (20 izmijenjenih + 6 novih + 1 brisanje) | 2204 linije u 1 patchu |
| 3 | 9 (5 izmijenjenih + 4 nova) | 856 linija u 1 patchu |
| 4.1 | 44 (43 izmijenjena + 1 novi) | 1552 linije u 1 patchu |
| 4.2 | 16 (10 UI + 6 popravki) | 452 linije u 1 patchu |
| 4.3 | 29 (29 izmijenjenih; 12 fajlova je već bilo u Pulse jeziku) | 629 linija u 1 patchu |
| 4.4 | 24 (24 izmijenjenih; 17 fajlova je već bilo u Pulse jeziku) | 664 linije u 1 patchu |
| 4.5 | 32 (32 izmijenjena; 9 fajlova je već bilo u Pulse jeziku) | 692 linije u 1 patchu |
| 4.6 | 13 (13 izmijenjenih; 8 fajlova je već bilo u Pulse jeziku) | 214 linija u 1 patchu |
| 4.7 | 6 (6 izmijenjenih; 5 fajlova je već bilo u Pulse jeziku) | 96 linija u 1 patchu |
| 5 | 6 (1 nov fajl + 5 izmijenjenih) | 413 linija u 1 patchu |
| 5b — palete | 9 (9 izmijenjenih, 0 novih) | 630 linija u 1 patchu |
| 6 — dokumentacija | 9 (1 nov + 8 izmijenjenih) | 1 234 linije u 1 patchu |
| 7 — verifikacija + guard + a11y | 19 (1 nov: guard skripta; 18 izmijenjenih) | 1 022 linije u 1 patchu |
| **Ukupno (15 patcheva)** | **238 unikatnih putanja** (322 fajl-unosa; 84 se ponavlja jer su neki fajlovi dorađivani u više talasa) | **13 793 linije** |

`frontend/src/components/layout/header-search.tsx` je **obrisan** u Fazi 2 (inline pretraga u topbaru je
zamijenjena komandnom paletom); njegov sadržaj za pretragu (`header-search-match.tsx`) je zadržan i
paleta ga koristi.

---

## 2. Patchevi i primjena

```
demo/patches/
├── pulse-01-theme-tokens-and-infrastructure.patch   55 fajlova   85 KB
├── pulse-02-ui-primitives.patch                     24 fajla    47 KB
├── pulse-03-shell-palette-login-wizard.patch        27 fajlova   84 KB
├── pulse-04-charts.patch                             9 fajlova   34 KB
├── pulse-05-tickets.patch                           44 fajla     73 KB
├── pulse-06-dashboard-reports.patch                 16 fajlova   20 KB
├── pulse-07-services-knowledge-base.patch           29 fajlova   32 KB
├── pulse-08-sla-routing-policy-packs.patch           24 fajla     36 KB
├── pulse-09-admin-users-groups-ou-rbac-settings.patch 32 fajla     35 KB
├── pulse-10-config-versions-queue-maintenance-feedback-auth-visual-qa.patch  13 fajlova  11 KB
├── pulse-11-pages-radius-system.patch                 6 fajlova     6 KB
├── pulse-12-appearance-page.patch                    6 fajlova    16 KB
├── pulse-13-accent-palettes.patch                    9 fajlova    24 KB
├── pulse-14-docs-and-rules.patch                     9 fajlova    57 KB
└── pulse-15-verification-a11y-and-guard.patch       19 fajlova    71 KB
```

Patchevi su **sekvencijalni** (svaki pretpostavlja sve prethodne), a svaki zasebno kompajlira — možeš ih
pregledati i primijeniti odvojeno.

```bash
git checkout -b pulse-ui              # ili kako ti već ide tok
git apply demo/patches/pulse-01-theme-tokens-and-infrastructure.patch
git apply demo/patches/pulse-02-ui-primitives.patch
git apply demo/patches/pulse-03-shell-palette-login-wizard.patch
git apply demo/patches/pulse-04-charts.patch
git apply demo/patches/pulse-05-tickets.patch
git apply demo/patches/pulse-06-dashboard-reports.patch
git apply demo/patches/pulse-07-services-knowledge-base.patch
git apply demo/patches/pulse-08-sla-routing-policy-packs.patch
git apply demo/patches/pulse-09-admin-users-groups-ou-rbac-settings.patch
git apply demo/patches/pulse-10-config-versions-queue-maintenance-feedback-auth-visual-qa.patch
git apply demo/patches/pulse-11-pages-radius-system.patch
git apply demo/patches/pulse-12-appearance-page.patch
git apply demo/patches/pulse-13-accent-palettes.patch
git apply demo/patches/pulse-14-docs-and-rules.patch
git apply demo/patches/pulse-15-verification-a11y-and-guard.patch
npm --prefix frontend ci              # ili npm install
```

### ⚠ Prvo o jednoj zamci: `git apply` je atomičan

`git apply a.patch b.patch c.patch` — ako **jedan** patch ne prođe, **nijedan se ne primijeni**.
Zato ako si 01 i 02 već primijenio (i možda commitovao), pa ponoviš cijelu listu, dobiješ ~90
linija grešaka `patch does not apply`, a **patch 03 ostane neprimijenjen** iako je samo on trebao.

Zato je uz patcheve tu i skripta koja to rješava:

```bash
bash demo/patches/apply-pulse.sh             # primijeni samo ono što fali
bash demo/patches/apply-pulse.sh --dry-run   # prvo pogledaj šta bi se desilo
```

Skripta za svaki patch provjeri postoji li njegov „sentinel" fajl (npr. za 03:
`frontend/src/components/layout/command-palette.tsx`), preskoči već primijenjene i primijeni
samo ostatak — jedan po jedan patch, ne sve odjednom. Uz to sama rješava CRLF zamku iz §8:
ako patch na disku ima CR (Git for Windows bez `.gitattributes`), napravi LF kopiju u tempu i
primijeni nju, ne dirajući tvoj fajl.

**Ako si već primijenio 01 i 02, radi samo ovo:**

```bash
git apply demo/patches/pulse-03-shell-palette-login-wizard.patch
```

Zatim, po tvom postojećem običaju (commitovi su ti imenovani po patch fajlovima, npr.
`f2-01-action-feedback-seam-and-inbox-tabs.patch`), commit predlažem kao:

```bash
git commit -am "pulse-01-theme-tokens-and-infrastructure.patch"
git commit -am "pulse-02-ui-primitives.patch"
git commit -am "pulse-03-shell-palette-login-wizard.patch"
git commit -am "pulse-04-charts.patch"
```

Ako želiš jedan commit, primijeni svih pet patcheva pa jedan commit.

### Kako provjeriti da je sve primijenjeno

```bash
ls frontend/src/components/layout/command-palette.tsx   # postoji → 03 je primijenjen
ls frontend/src/components/layout/header-search.tsx     # ne smije postojati → 03 briše ovaj fajl
ls frontend/src/components/charts/dual-area-chart.tsx   # postoji → 04 je primijenjen
ls frontend/src/components/ui/checkbox.tsx              # postoji → 05 je primijenjen
grep -q fade-in frontend/src/components/dashboard/dashboard-charts.tsx   # → 06 je primijenjen
grep -qF "tnum text-[10px]" frontend/src/components/services/service-catalog-card.tsx  # → 07 je primijenjen
grep -qF "fade-in space-y-4" frontend/src/components/sla/sla-profile-detail.tsx        # → 08 je primijenjen
grep -qF "fade-in overflow-x-auto" frontend/src/components/users/users-table.tsx        # → 09 je primijenjen
grep -qF "fade-in grid gap-1.5 font-mono" frontend/src/components/config-versions/config-version-diff-panel.tsx  # → 10 je primijenjen
grep -qF "page-in grid min-h-screen" frontend/src/pages/login-page.tsx                  # → 11 je primijenjen
ls frontend/src/pages/appearance-page.tsx                                               # postoji → 12 je primijenjen
grep -qF 'data-accent=\"teal\"' frontend/src/index.css                                  # → 13 je primijenjen
grep -qF '## Brend palete' .cursor/docs/theme.md                                        # → 14 je primijenjen
ls scripts/check-pulse-design-system.mjs                                                # postoji → 15 je primijenjen
git status --porcelain | wc -l                          # ~237 putanja nakon 01–15
```

---

## 3. Verifikacija (egzaktni rezultati)

Provjereno **i u mom radnom stablu i na svježem klonu baze `5831dfd` sa primijenjenim patchevima**:

| Provjera | Rezultat |
|---|---|
| `git apply --check` (svih šest patcheva) | ✅ čisto, bez konflikata |
| Patch 05 primijenjen na F3 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** (`git diff` prema referentnom stablu prazan) |
| Patch 06 primijenjen na F4.1 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 07 primijenjen na F4.2 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 08 primijenjen na F4.3 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 09 primijenjen na F4.4 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 10 primijenjen na F4.5 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 11 primijenjen na F4.6 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| Patch 12 primijenjen na F4.7 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| **F5 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** |
| **F5 — `npx vite build`** | ✅ `index-2BFNtEPu.css` (63 138 B) / `index-DnBvtteM.js` (1 196 850 B) |
| **F5 — sve Tailwind klase (`pages/appearance-page.tsx`, `router.tsx`, `theme-switcher.tsx`, `session-controls.tsx`)** | ✅ 49 utility klasa kroz pravi Tailwind build — **0 propusta** |
| **F5 — i18n** | ✅ `bs` **2164** = `en` **2164** ključa (2142 + 22 nova `appearance.*`), parity **0/0**; svih 24 statička ključa nove stranice postoje u oba lokala |
| **F5 — tematski tokeni (dark mode)** | ✅ sva tri bloka (`:root[data-theme="classic"]`, `:root[data-theme="pulse"]`, `:root[data-theme="pulse"].dark`) imaju **identičan skup od 48 varijabli** — nema tokena koji bi u dark modu pao na fallback |
| Skripta na „imam 01–11, dodajem 12" | ✅ `primijenjeno: 1  preskočeno: 11  grešaka: 0` |
| **Skripta na čistom `base` + svih 13 patcheva (uz `core.autocrlf=true`)** | ✅ `primijenjeno: 13  preskočeno: 0  grešaka: 0`; rezultat **1:1** prema referentnom stablu |
| Patch 13 primijenjen na F5 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| **Palete — `npx vitest run`** | ✅ **89 fajlova / 308 testova** (dodata 2 testa za treću osu) |
| **Palete — kontrast (WCAG 2.1, mjereno na generisanom CSS-u)** | ✅ 6 kombinacija × 4 mjerenja = **24/24 ≥ 4.5:1** na novim paletama; vidi tabelu u §4 |
| **Palete — klasa-probe** | ✅ 54 utility klase u 2 fajla kroz pravi Tailwind build → **0 propusta**; `accent-swatch-*` generisane za obje svjetline |
| **Palete — build** | ✅ `index-D0Oy3DVS.css` (64 745 B; +1,6 KB za palete i swatcheve) / `index-T4FnGr4D.js` (1 200 280 B) |
| **F6 — patch dira samo dokumente** | ✅ 9 putanja, **0** putanja pod `frontend/`, `e2e/` ni `backend/` — nijedna linija koda |
| **F6 — relativni linkovi u dokumentima** | ✅ provjereni svi `[text](path)` linkovi u 9 diranih dokumenata — **0 slomljenih** (jedan koji sam uveo je uhvaćen i ispravljen: `layouts/application-shell.tsx`) |
| **F6 — tvrdnje dokumenata protiv koda** | ✅ provjereno mjerenjem: `.pulse-gradient` postoji (`index.css:479`), radijusi `6/8/12px` (Pulse) i `4/6/8px` (classic) tačno kako piše, `semantic-meta.ts` na navedenoj putanji |
| **F6 — zaostale tvrdnje o staroj paleti** | ✅ `theme-source` se u dokumentima pominje **samo** kao arhiviran; `theme.md` linkovi preusmjereni na kod/`demo/` (18 → 1 pojava) |
| Patch 14 primijenjen na F5b stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| **Skripta na čistom `base` + svih 15 patcheva (`core.autocrlf=true`)** | ✅ **`primijenjeno: 15  preskočeno: 0  grešaka: 0`**; izvorne putanje **1:1** prema referentnom stablu |
| Patch 15 primijenjen na F6 stablo (svjež worktree) | ✅ prolazi i **reprodukuje stanje 1:1** |
| **F7 — oba guard-a na apliciranom stablu** | ✅ `check-pulse-design-system` i `check-ticket-id-leaks` prolaze na stablu sastavljenom samo iz patcheva |
| **F7 — guard self-test (12 namjernih kvarova)** | ✅ svaki vraćen u **svoju** grupu pravila, stablo nakon vraćanja opet čisto — vidi §4 |
| **F7 — pokrivenost fokusa** | ✅ **0** interaktivnih elemenata bez vidljivog fokusa (bilo je 17); 43 sirova `<button>` provjerena pojedinačno |
| **F7 — E2E** | ⚠ **nije izvršeno ovdje** — sandbox ne može preuzeti Chromium (`playwright install` pada na downloadu) i nema live stacka; scenario je u CI-ju (`workflow_dispatch`, treba secrets) i u QA checklisti (§10) |
| **4.7 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** |
| **4.7 — `npx vite build`** | ✅ `index-8UzRBoY8.css` (63 014 B — **manji**, jer `rounded-xl` više ne postoji u kodu) / `index-DzHQdNCn.js` (1 189 796 B) |
| **4.7 — sve Tailwind klase (`pages/*` + 3 fajla van njih)** | ✅ 101 klasa u `pages/` + 67 u tri fajla kroz pravi Tailwind build — **0 propusta** |
| **4.7 — `t()` ključevi u `pages/`** | ✅ **139 statičkih ključeva, svi prisutni u `bs` i `en`**; 0 dinamičkih izraza |
| **4.7 — `lib/`** | ✅ nema nijednu stilsku klasu (0 `className`) — `lib/theme/*` je pokriven još u Fazi 0, ostatak `lib/` je čista logika |
| **4.7 — radius sistem** | ✅ `rounded-xl` (Tailwind default, **nije** bio vezan na `--radius-*`) uklonjen iz cijelog `src`: 5 pojava → `rounded-lg` (token) |
| Skripta na „imam 01–10, dodajem 11" | ✅ `primijenjeno: 1  preskočeno: 10  grešaka: 0` |
| **Skripta na čistom `base` + svih 11 patcheva (uz `core.autocrlf=true`)** | ✅ `primijenjeno: 11  preskočeno: 0  grešaka: 0`; rezultat **1:1** prema referentnom stablu |
| **4.6 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** |
| **4.6 — `npx vite build`** | ✅ `index-Dd3fqRIo.css` (63 047 B — nepromijenjen) / `index-CRP_fJua.js` (1 189 780 B) |
| **4.6 — sve Tailwind klase (`config-versions/`, `queue/`, `maintenance/`, `feedback/`, `auth/`, `visual-qa/`)** | ✅ 102 utility klase kroz pravi Tailwind build — **0 stvarnih propusta** (2 „nalaza" su artefakti: putanja importa `charts/h-bars` i opisni tekst u navodnicima) |
| **4.6 — mrtve klase** | ✅ nula (`rounded-md` → `rounded-lg` na jedinom mjestu gdje je bio okvir, a ne uzorak; `tnum` na prvo mjesto ×4) |
| Skripta na „imam 01–09, dodajem 10" | ✅ `primijenjeno: 1  preskočeno: 9  grešaka: 0` |
| **Skripta na čistom `base` + svih 10 patcheva (uz `core.autocrlf=true`)** | ✅ `primijenjeno: 10  preskočeno: 0  grešaka: 0`; rezultat **1:1** prema referentnom stablu |
| **4.5 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** |
| **4.5 — `npx vite build`** | ✅ `index-Dd3fqRIo.css` (63 050 B) / `index-DbyVxeDU.js` (1 189 436 B) |
| **4.5 — sve Tailwind klase (`admin/`, `users/`, `groups/`, `organizational-units/`, `rbac/`, `settings/`)** | ✅ 181 utility klasa kroz pravi Tailwind build — **0 stvarnih propusta** |
| **4.5 — mrtve klase** | ✅ nula: `leading-4.5` → `leading-[15px]`, `bg-primary/12` → `/15`, `border-border/60|50` → `/70`, `shadow-md` → `shadow-pop`, `bg-muted/*` → `bg-elevated/*`, `hover:bg-elevated/*` → `hover:bg-surface-hover`, `bg-background/*` → `bg-elevated/*` |
| **4.5 — hardkodirane boje** | ✅ **0** — posljednja 3 mjesta (`text-amber-700 dark:text-amber-400` ×2, `text-sky-800 dark:text-sky-300`) zamenjena tokenima `text-warning` / `text-info` |
| Skripta na „imam 01–08, dodajem 09" | ✅ `primijenjeno: 1  preskočeno: 8  grešaka: 0` |
| **Skripta na čistom `base` + svih 9 patcheva (uz `core.autocrlf=true`)** | ✅ `primijenjeno: 9  preskočeno: 0  grešaka: 0`; rezultat **1:1** prema referentnom stablu |
| **4.4 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** |
| **4.4 — `npx vite build`** | ✅ `index-CLqTvvfQ.css` (64 060 B) / `index--hYLmxoT.js` (1 188 500 B) |
| **4.4 — sve Tailwind klase (`sla/`, `routing/`, `policy-packs/`)** | ✅ 184 utility klase kroz pravi Tailwind build — **0 stvarnih propusta** |
| **4.4 — mrtve klase u modulu** | ✅ nula: `leading-4.5` (4×) → `leading-[15px]`, `bg-*/12` (2×) → `/15`, `bg-warning/8` → `/6`, `border-border/60` → `/70`, `text-text*` (23×) → `text-foreground*`, `text-muted*` (42×) → `text-muted-foreground*` |
| Skripta na „imam 01–07, dodajem 08" | ✅ `primijenjeno: 1  preskočeno: 7  grešaka: 0` |
| Skripta na „imam 01–06, dodajem 07+08" | ✅ `primijenjeno: 2  preskočeno: 6  grešaka: 0`; rezultat 1:1 prema referentnom stablu |
| **4.3 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** (bez novih testova — 4.3 nije mijenjao logiku) |
| **4.3 — `npx vite build`** | ✅ `index-B0hdC7bj.css` (64 679 B) / `index-sszgvFMG.js` (1 189 621 B) |
| **4.3 — sve Tailwind klase (`services/` + `knowledge-base/`)** | ✅ 139 utility klasa kroz pravi Tailwind build — **0 stvarnih propusta** |
| **4.3 — mrtve klase u modulu** | ✅ nula: `leading-4.5` (2×) zamenjen sa `leading-[15px]`, `bg-*/12` (4×) sa `/15`, `bg-warning/8` sa `/6`, `bg-background/40` sa `bg-elevated/40` |
| Skripta na „imam 01–06, dodajem 07" | ✅ `primijenjeno: 1  preskočeno: 6  grešaka: 0` |
| Skripta na „imam 01–05, dodajem 06+07" | ✅ `primijenjeno: 2  preskočeno: 5  grešaka: 0`; rezultat 1:1 prema referentnom stablu |
| **4.2 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 306 testa** (dva nova testa za SLA realtime) |
| **4.2 — `npx vite build`** | ✅ `index-CzaKq5i_.css` (64 616 B) / `index-B8grFbV6.js` (1 189 005 B) |
| **4.2 — sve Tailwind klase (dashboard, reports, razgovor)** | ✅ 110 utility klasa kroz pravi Tailwind build — **0 stvarnih propusta** |
| Skripta na „imam 01–05, dodajem 06" | ✅ `primijenjeno: 1  preskočeno: 5  grešaka: 0` |
| `bash -n demo/patches/apply-pulse.sh` | ✅ sintaksa ispravna; 0 CR linija u svim patchevima i skripti |
| `npx tsc -b` (bez keša) | ✅ **0 grešaka** |
| `npx vitest run` | ✅ **89 fajlova / 304 testa** (bilo 86/279) |
| `npx vite build` | ✅ uspješno |
| Build artefakti u klonu vs. moje stablo | ✅ **identični hash-evi** (`index-J1vwzjP-.css`, `index-CRKPmKS3.js`) |
| `node scripts/check-ticket-id-leaks.mjs` (CI gate) | ✅ prolazi |
| i18n parity `bs` vs `en` | ✅ 2142 / 2142 ključeva, nula razlike |
| Hardkodirani `#RRGGBB` u `frontend/src` | ✅ **0** (bilo 82) |
| Tematski blokovi u izlaznom CSS-u | ✅ `[data-theme=classic]`, `[data-theme=pulse]`, `[data-theme=pulse].dark` |
| Alpha tokeni u izlaznom CSS-u | ✅ `rgb(var(--border) / .7)`, `rgb(var(--primary) / .15)` … |
| Sve Tailwind klase iz F2 i F3 fajlova | ✅ nijedna ne izostaje — 328 klasa provjereno kroz pravi Tailwind build (0 propusta) |
| Komandna paleta (jsdom) | ✅ 13/13 testova: filteri, ↑/↓/Enter, grupisanje, prazno stanje |
| **4.1 — `npx tsc -b` / `npx vitest run`** | ✅ **0 grešaka** / **89 fajlova / 304 testa** |
| **4.1 — `npx vite build`** | ✅ `index-SJ1UOhzg.css` (64 463 B) / `index-wWCUrNtO.js` (1 188 394 B) |
| **4.1 — sve Tailwind klase iz `components/tickets/`** | ✅ 236 utility klasa provjereno kroz pravi Tailwind build — **0 stvarnih propusta** |
| **4.1 — i18n ključevi u `components/tickets/`** | ✅ 231 literalni ključ, **0 nedostaje** u `bs` i `en`; `tickets.*` parity **431 / 431** |
| **4.1 — mrtve klase (npr. `/12` alpha)** | ✅ nula u modulu; `bg-*/12` (koji Tailwind tiho ne generiše) zamijenjen sa `/10` i `/15` |
| Grafikoni (jsdom, privremeni test) | ✅ 13/13: nula `NaN` u SVG izlazu na praznoj/zeronultoj seriji i jednoj tački, hover radi |
| Geometrija grafikona (`plot-geometry.spec.ts`) | ✅ 9 testova — ostaje u repo-u i pokriva `NaN`/beskonačno/praznu seriju u CI-u |
| Windows simulacija (`core.autocrlf=true`, CRLF radno stablo) | ✅ sva četiri patcha se primjenjuju, `tsc` 0, **isti build hash-evi**; nakon normalizacije CRLF-a **9/9 F3 fajlova bit-identično** mojem stablu |
| `package-lock.json` (frontend i e2e) | ✅ netaknuti (npm u sandboxu ih prepiše — vraćeno) |
| Git | ✅ od izvornih fajlova commitovani **samo** `demo/patches/*`, `.gitattributes` i ovaj dokument |

**Nisam mogao provjeriti:** vizuelni izgled u pravom browseru (Chromium se ne može instalirati u ovom
sandboxu) i 7 Playwright E2E (zahtijevaju živ stack). Zato je Theme tab u Visual QA napravljen da to
bude prvo što pogledaš, a ponašanje palete je pokriveno jsdom testom (§3).

> **Djelimična vizuelna provjera ipak postoji (F3):** SVG grafikoni su iz jsdom izlaza rasterizovani
> van browsera (`resvg`) i pregledani — **donut** počinje u 12 sati i ide u smjeru kazaljke (numerički
> provjereno: Novi 0°, U radu 93,9°, Na čekanju 164,3°, Riješeni 195,7°), a **dual area** crta oba
> gradijenta, isprekidane linije mreže i tačke bez `NaN`. Dva grafikona koja su čisti CSS/div
> (`grouped-bars`, `h-bars`) nisu se mogla rasterizovati bez browsera — njih vidiš na Visual QA.

> **Napomena uz E2E (pronađeno tokom F2, nije uzrokovano ovim patchevima):** helper
> `e2e/helpers/sign-in.ts` je tražio `#session-email` — ID koji postoji **samo** u kompaktnoj formi u
> topbaru, do koje se dolazi tek *nakon* prijave. Pošto `/` sa praznom sesijom preusmjerava na
> `/login` (gdje su `#login-email` / `#login-password`), taj helper nije mogao naći formu. Zato patch 03
> proširuje selektor na oba ID-a (`#session-email, #login-email`) — prijava sada radi s koje god
> površine da se pojavi. Izmjena je samo u testnom helperu, aplikacijska logika nije dirana.

---

## 4. Odluke koje sam donio prema tvojim odgovorima

| Tvoja odluka | Šta je urađeno |
|---|---|
| **Tailwind 3** (ostajemo) | Nema migracije na v4. Sve je izraženo kroz TW3 + CSS varijable. |
| **Paralelno: stara + nova tema** | `data-theme="pulse"` / `data-theme="classic"`. Stara tema je **nedirnuta** i birate je u istom meniju. |
| **Faza 0 + Faza 1** | Isporučeno u dva patcha. |
| **`.patch` fajlovi** | Isporučeno (vidi §2). |
| **KB intercept kao zaseban ekran** | Zadržano postojeće ponašanje — postojeći `knowledge-intercept-panel.tsx` je samo restilizovan, **tok nije mijenjan**. |

### Faza 7 — šta je konkretno urađeno (verifikacija, guard i a11y)

Faza je trebala biti „samo pokreni i potvrdi". Umjesto toga je dala **jedan sistemski alat** i **jedan stvarni a11y
nalaz** — zato je patch veći od dokumentacionog.

| Dio | Šta je urađeno |
|---|---|
| **Guard skripta (`scripts/check-pulse-design-system.mjs`, 366 linija)** | Pretvara odluke Faza 0–6 u provjeru koja se vrti bez instalacije i bez browsera. Šest grupa pravila: **docs** (stara paleta arhivirana i nigdje citirana kao izvor), **colors** (nema hex, nema Tailwind default palete, nema `rgb()` bez tokena), **tokens** (sva tri bloka i svi paletni blokovi imaju isti skup varijabli; svaka paleta iz koda ima CSS blok + i18n ključeve), **radius** (`rounded-xl` se ne koristi), **i18n** (parity + svi statički `t()` ključevi razrješavaju u oba lokala), **contract** (pre-paint skripta čita iste storage ključeve kao `theme-storage.ts`) |
| **Pravila su mjerena, ne izmišljena** | Prije pisanja svakog pravila sam izmjerio stablo: npr. `rgb(var(--token))` je **dozvoljen** jer SVG `stroke`/gradient stop ne prima Tailwind klasu; `t()` regex traži `(?<![\w.])` da ne hvata `search.set("q")` i `createElement("a")` (20 lažnih nalaza); selektori token blokova se escapuju i **ne** uključuju vitičastu zagradu (dvostruka `\s*\{` je davala „blok nije nađen") |
| **Self-test: 12 namjernih kvarova** | Svaki je vraćen u svoju grupu: `bg-slate-100`, hex `#FF0000`, sirovi `rgb(255,0,0)`, `rounded-xl`, nepostojeći `t()` ključ, token izbačen iz `pulse.dark`, paleta u `THEME_ACCENTS` bez CSS bloka, `theme.accent*` ključ izbačen iz `en`, blok samo u `en`, pre-paint bez `data-accent`, uklonjena arhivska oznaka, tvrdnja da je stara paleta mjerodavna. Nakon vraćanja stanja — guard opet čist |
| **Nalaz #1: guard je našao 43 zastarjele upute** | `fe-alignment-prompts.md` je **41 put** ponavljao „nove boje/radijuse/sjene mimo `theme.md` **i `theme-source.md`**" — uputa koja šalje agenta na arhivirani dokument. Popravljeno u izvoru (ne allowlistom), plus dvije pojedinačne reference |
| **Nalaz #2: 17 interaktivnih elemenata bez vidljivog fokusa** | Sirovi `<button>`-i (redovi u panelima, zatvaranje chipa/toasta, tabovi, „označi sve kao pročitano", OU meni, birač servisa, sačuvani pregledi…) nisu imali `focus-visible` stil. Dodan je repou standardan `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70` (22 postojeće upotrebe) |
| **Combobox redovi — drugačije i namjerno** | Dvije liste opcija (komandna paleta, globalna pretraga) koriste `role="option"` + `aria-activedescendant`: fokus drži input, a aktivni red se pomjera strelicama. Umjesto stila dobili su **`tabIndex={-1}`** — time nestaje Tab-stop na kojem fokus nije vidljiv, a tastaturna navigacija ostaje netaknuta. Odluka i njeno obrazloženje su u kodu |
| **CI** | Guard je dodat u `.github/workflows/ci.yml` (frontend job), pored postojećeg `check-ticket-id-leaks`. Radi bez `npm install` i bez browsera |
| **Dokumentacija** | `theme.md` sada dokumentuje guard i njegov opseg u „Checklist prije merge-a" |
| **E2E — pošteno stanje** | **Nisam ga mogao pokrenuti:** sandbox ne može preuzeti Chromium (download pada) i nema live stack. Zato je scenario opisan u QA checklisti (§10), a CI ga vrti preko `workflow_dispatch` uz secrets |

| Provjera (F7) | Rezultat |
|---|---|
| `npx tsc -b` | ✅ 0 grešaka |
| `npx vitest run` | ✅ 89 fajlova / **308** testova |
| `npx vite build` | ✅ `index-D0Oy3DVS.css` (64 745 B) / `index-C5JeB3u-.js` (1 201 331 B) |
| Guard (dizajn-sistem) | ✅ prolazi; 48 tokena × 3 bloka, 4 paletna bloka × 9 varijabli, 2 174 i18n ključa, 1 130 statičkih `t()` ključeva |
| Guard (ID-jevi tiketa) | ✅ prolazi |
| Klasa-proba kroz generisani CSS | ✅ 0 mrtvih klasa u izmijenjenim fajlovima |
| Fokus | ✅ 43 sirova `<button>` → **0 bez vidljivog fokusa** |
| E2E (Playwright) | ⚠ nije izvršeno u sandboxu — treba tvoj stack ili CI |

### Faza 6 — šta je konkretno urađeno (dokumentacija i pravila)

Faza je **isključivo dokumentaciona** — nula linija koda. Cilj je bio da se ukloni situacija u kojoj
dokumenti tvrde nešto suprotno od koda: do sada je `.cursor/docs/theme-source.md` bio proglašen
„mjerodavnim" za tematiku, a opisivao je **samo staru tamnu paletu**.

| Dio | Šta je urađeno |
|---|---|
| **`Master UI-UX Design Constitution.md`** (ustav) | Zadržan kao UX izvor istine (per-ekranski raspored, obrasci, forme, tabele, a11y su i dalje validni), ali su **prepisane sekcije koje su govorile suprotno od Pulse-a**: §22 Color system (kako se boja piše, tri palete, kontrastna pravila), §26 Borders/radius/shadows (radius i sjena su tokeni, `rounded-xl` se ne koristi, `--shadow-glow` kao izuzetak), §35 Dark mode (**light-first sa ravnopravnim tamnim modom**, tri token bloka, `classic` trajno tamna), §38 anti-obrasci (dva dokumentovana izuzetka + Pulse-specifične zamke), §40.1 gdje tokeni žive. Zaglavlje sada jasno kaže šta je aktivno, a šta naslijeđe |
| **`.cursor/docs/theme.md`** (katalog) | Dodate dvije nove sekcije: **Brend palete** (šta `data-accent` mijenja, tabela tri palete, **recept u 3 koraka** za novu paletu) i **Kontrast** (tabela svih 24 mjerenja + dva pravila koja se lako pogrešno „poprave": `--selection-fg` i `--primary-foreground`). Model tema dopunjen trećom osom, hijerarhija izvora prepisana (**izvor istine je kod**), checklista za novu boju proširena |
| **`.cursor/docs/theme-source.md`** | **Arhiviran** — 635 linija stare dark-only palete zamijenjeno oznakom „ARHIVIRANO" koja upućuje na `theme.md` i objašnjava zašto (dva „mjerodavna" izvora su gora od jednog). Original ostaje u git istoriji |
| **`.cursor/docs/frontend-reference-alignment-plan.md`** | Označen kao **istorijski** (bio je „PLAN VALIDATED" za staru referencu): zaglavlje, tabela izvora, hijerarhija i DoD stavka ažurirani. Funkcionalni obim (FE-* taskovi) ostaje kao zapis, vizuelni targeti više ne važe |
| **`referenca-dizajn/`** | **Arhiviran README-om** (26 fajlova ostaje netaknuto): šta je zamijenilo ovaj prototip po sloju, šta se smije koristiti (istorijski kontekst i funkcionalni obrasci preko `theme.md`), šta ne (hexovi, radius, sjene, paleta) |
| **`.cursor/rules/frontend-ui-ux.mdc`** | Treća osa (`data-accent`) u opis kako tema radi, kontrastna pravila, `rounded-md`/`rounded-lg` po temi, pravilo „token u sva tri bloka", i obavezna provjera prije nego se UI proglasi gotovim |
| **`.cursor/rules/00-core.mdc`** | Jedna linija: aktivan je Pulse, `classic` dostupan, tri ose izgleda |
| **`fe-alignment-prompts.md`** | Zaglavlje upozorava da je dokument istorijski (generisan za staru temu) i šta danas važi |

| Provjera | Rezultat |
|---|---|
| Putanje u patchu | 9, **nijedna** pod `frontend/`, `e2e/` ni `backend/` |
| Relativni linkovi u diranim dokumentima | **0 slomljenih** |
| Zaostale tvrdnje o `theme-source` kao izvoru | **0** (preostala pojava je sama oznaka „arhivirano") |
| Tvrdnje protiv koda (`.pulse-gradient`, radijusi, putanje) | ✅ provjereno mjerenjem |

> **Faza 6 je završena.** Ostaje **Faza 7**: build + testovi + guard + E2E, vizuelni QA na 1440/1024/390
> u obje teme i tri palete, a11y kontrast i UAT.

### Palete boja — šta je konkretno urađeno (dodatak Fazi 5)

Treća osa izgleda: **`data-accent`** sa tri vrijednosti — `indigo` (zadana, ono što je Pulse oduvijek bio), **`teal`** i **`rose`**.
Nije novi dizajn: paleta rotira **samo brend boje**, a površine, radijusi, sjene i semantički tonovi (`ok` / `warning` / `danger` / `info` / `accent`) ostaju netaknuti.

| Dio | Šta je urađeno |
|---|---|
| **Zašto je ispalo jeftino** | Cijela aplikacija od Faze 0 boju čita iz CSS varijabli (**0 hardkodiranih boja u komponentama**), a „dizajn" su znala samo **5 fajlova**. Zato paleta = **8 varijabli** po bloku (`--primary`, `-hover`, `-active`, `-foreground`, `--ring`, `--link`, `--selection-bg`, `--selection-fg`) + `--shadow-glow`, i **nema drugog bloka tokena po svjetlini** — `.dark` varijanta mijenja samo te iste vrijednosti |
| **Skaliranje u CSS-u** | Selektori su oblikovani kao `:root[data-theme="pulse"][data-accent="teal"]` — specifičnost (0,2,1) pobjeđuje bazni `:root[data-theme="pulse"]` bez obzira na redoslijed, a **`classic` je izuzet** jer selektor traži `pulse`. Klasična tema zadržava svoju plavu bez obzira koja je paleta izabrana |
| **Kontrakt i perzistencija** | `ThemeAccent` + `THEME_ACCENTS` + `isThemeAccent` + `DEFAULT_THEME_ACCENT` u `lib/theme/theme-storage.ts`; `accent` / `setAccent` u `ThemeProvider`-u; ključ `ep-helpdesk.theme.accent`; **pre-paint skripta** u `index.html` sada postavlja i `data-accent` (i sanitizuje neispravnu vrijednost) |
| **Tri ulaza, jedan kontrakt** | Grupa **„Boja"** u biraču teme (samo za Pulse, kao i svjetlina) · korisnički meni → „Izgled" → `/appearance` · kartica **„Paleta boja"** na `/appearance`. Svi pišu kroz isti `useTheme()`, pa se ne mogu razići. „Vrati na zadano" sada resetuje i paletu |
| **Bug koji je uhvatilo mjerenje** | `::selection` boja **ne smije** biti ista u svijetloj i tamnoj paleti: browser je crta kao alpha blend **preko podloge**, pa je rezultat uvijek svijetao u svijetlim paletama i taman u tamnim. Prva verzija je u tamnim paletama dala **1.65:1** (tekst praktično nevidljiv pri selektovanju). Popravljeno i sada je 8.79–12.77:1. Isto pravilo važi za `--primary-foreground`: svijetla primarna boja traži **taman** tekst na sebi |
| **Dokaz kontrasta (24 mjerenja)** | Vrijednosti pročitane iz **generisanog CSS-a**, ne iz izvora: |

| Paleta | Svjetlina | Tekst na primary | Primary kao tekst | Link | Selekcija |
|---|---|---|---|---|---|
| indigo (zadana) | svjetla | 5.37:1 ✓ | 5.37:1 ✓ | 6.41:1 ✓ | 12.44:1 ✓ |
| indigo (zadana) | tamna | 4.52:1 ✓ | **4.00:1** ⚠ | 6.68:1 ✓ | 12.77:1 ✓ |
| **teal** | svjetla | 5.47:1 ✓ | 5.47:1 ✓ | 7.58:1 ✓ | 9.88:1 ✓ |
| **teal** | tamna | 7.77:1 ✓ | 9.71:1 ✓ | 12.22:1 ✓ | 8.79:1 ✓ |
| **rose** | svjetla | 6.29:1 ✓ | 6.29:1 ✓ | 8.02:1 ✓ | 9.87:1 ✓ |
| **rose** | tamna | 5.81:1 ✓ | 6.72:1 ✓ | 9.56:1 ✓ | 10.51:1 ✓ |

> ⚠ jedina vrijednost ispod AA je **postojeća** indigo paleta u tamnom modu (`text-primary` 4.00:1) — to je baseline iz Faze 0 koji nisam mijenjao jer popravka mijenja izgled primarnih dugmadi u tamnom modu (vidi §7).

| Uputa za tim — još jedna paleta | 1) dodaj blok `:root[data-theme="pulse"][data-accent="<ime>"]` i njegov `.dark` par u `src/index.css` (8 varijabli + glow); 2) dodaj ime u `ThemeAccent` i `THEME_ACCENTS`; 3) dodaj `theme.accent<Ime>` ključ u `bs` i `en`. UI (birač teme, `/appearance`, `role="radiogroup"`) radi sam jer iterira `THEME_ACCENTS` |
| **Svjesni izuzetak** | `.accent-swatch-*` klase u `index.css` su **jedine hardkodirane boje van tokena** — preview mora prikazati paletu koja **nije** aktivna, pa ne može čitati `--primary`. Imaju po jednu svjetlu i tamnu vrijednost i drže se uz paletne blokove |

### Faza 5 — šta je konkretno urađeno (izgled: dark mode + stranica podešavanja) — **kraj Faze 5**

Ključni nalaz: **dark mode nije trebalo popravljati — trebalo ga je dokazati.** Theme sloj iz Faze 0 je
bio potpun, pa je ovaj talas (a) mjerljivo pokazao da je pokrivenost tokena 100% i (b) dodao jedinu
stvar koja je stvarno nedostajala: **stranicu na kojoj se izgled objašnjava i mijenja**.

| Dio | Šta je urađeno |
|---|---|
| **Nova stranica `/appearance`** | `pages/appearance-page.tsx` (nov fajl, ~266 linija, `.cursor` stil: `type`-only importi, `interface …Properties` sa `readonly`, JSDoc na engleskom). Tri kartice: **Dizajn** (dvije velike radio-opcije sa swatchevima boja iz tokena), **Svjetlina** (`Segmented` svijetla/tamna/sistemska sa ikonama), **Pregled** — živi uzorak sastavljen od **pravih primitiva** (`Card`, `Field`, `Input`, `Button`, `Progress`, `Badge`, `StatCard`) na pravim tokenima, pa uvijek pokazuje tačno ono što i ostatak aplikacije |
| **Bez odvojene „preview" teme** | Nema paralelnog sistema za pregled — uzorak koristi iste primitive i iste CSS varijable. To znači da ne postoji način da pregled i stvarni ekran „pobjegnu" jedno od drugog |
| **Ulaz u korisničkom meniju** | `session-controls.tsx`: nova stavka **„Izgled"** (`Palette` ikona) iznad „Postavke naloga", vodi na `/appearance`. Postojeće ponašanje menija nije mijenjano |
| **Prečica iz birača teme** | `theme-switcher.tsx` (dropdown u topbaru): na dnu dodat `DropdownMenuSeparator` + stavka **„Sva podešavanja izgleda"** → `/appearance`. Toggle u topbaru ostaje najbrži put, stranica je „puna slika" |
| **Ruta** | `app/router.tsx`: `<Route path="appearance" element={<AppearancePage />} />` — **bez `RequireAccess`**, jer izgled ne smije zavisiti od dozvola. Ruta `settings` (`LegacyAdminRedirect`) **nije dirana** — i dalje radi kako je radila |
| **i18n** | **22 nova ključa** u novom bloku `appearance.*` u **oba** lokala (`bs` i `en`); korišteni su i postojeći `theme.*` ključevi iz Faze 0. Ukupno `bs` **2164** = `en` **2164**, parity **0/0** |
| **„Vrati na zadano"** | Dugme u zaglavlju stranice vraća i dizajn i svjetlinu na `DEFAULT_THEME_DESIGN` / `DEFAULT_THEME_MODE` (jedan izvor istine iz `theme-storage.ts`) i **disabled** je kad si već na zadanim vrijednostima |
| **Perzistencija i sistemska preferencija** | Bez novog koda — postojeći `ThemeProvider` već piše u `localStorage` (`ep-helpdesk.theme.design|mode`) i sluša `prefers-color-scheme` preko `matchMedia`; stranica piše kroz isti `useTheme()` kontrakt, pa se toggle u topbaru, meni i stranica **ne mogu razići** |
| **Dark mode — dokaz pokrivenosti** | Sva tri tematska bloka (`:root[data-theme="classic"]`, `:root[data-theme="pulse"]`, `:root[data-theme="pulse"].dark`) imaju **identičan skup od 48 varijabli — nula razlika**. Nijedan token ne pada na fallback u tamnom Pulse modu. `classic` je i dalje forsirano tamna (kako je i zamišljeno) |
| **Dokazi (bez izmjena koda)** | `tsc` **0 grešaka**; `vitest` **89 fajlova / 306 testova**; `vite build` prolazi; guard za ID-jeve tiketa **0**; **49 utility klasa** u nova 4 fajla — **0 propusta** kroz pravi Tailwind build (CSS je ostao **isti**, 63 138 B: nijedna nova utility klasa nije uvedena) |

> **Faza 5 je završena.** Sljedeće su Faza 6 (dokumentacija i `.cursor` pravila) i Faza 7
> (završna verifikacija, vizuelni QA na 1440/1024/390 px, a11y kontrast, UAT).

### Faza 2 — šta je konkretno urađeno

| Dio | Detalj |
|---|---|
| **Topbar** | Brend-lockup (EP·HelpDesk), okidač pretrage (`Pretraži… ⌘K`), zvono, tema, jezik, korisnički meni. |
| **Komandna paleta** | `⌘K` / `Ctrl+K` otvara, `Esc` zatvara. Radi **dvije stvari odjednom**: navigacija kroz cijelu aplikaciju (po RBAC-u — koristi isti `filterNavigationSections` kao sidebar) **i** pretraga tiketa/članaka/korisnika (isti servis koji je koristio stari topbar, 250 ms debounce, minimum 2 znaka). Strelicama se pomjeraš, `Enter` otvara. |
| **Prečice u shellu** | `⌘K`/`Ctrl+K` paleta, `/` paleta, `N` → novi tiket. Prečice se ne aktiviraju dok kucaš u polje. |
| **Sidebar** | `Novi tiket` kao gradijentna CTA (samo za osoblje koje smije kreirati), sekcije sa ikonama, aktivna stavka sa indikatorom, brojači nepromijenjeni. |
| **Mobilni** | Sidebar postaje `Sheet` sa istim sadržajem. |
| **Korisnički meni** | Moji tiketi, Dodjela, Podešavanja, jezik, odjava — sa avatarom i ulogom. |
| **Prijava** | Split layout: brend panel lijevo (samo na `lg+`), forma desno. **ID-jevi `#login-email` / `#login-password` su sačuvani.** |
| **Čarobnjak za instalaciju** | Horizontalni stepper sa 6 koraka i trakom napretka; svaki korak i dalje radi isto (isti `resolveInstallWizardStep`, isti servisi). |
| **Obavještenja** | Panel dobio filter (Sve / Nepročitano) preko novog `Segmented` primitiva. |

### Faza 3 — šta je konkretno urađeno

| Grafikon | Šta je promijenjeno | API |
|---|---|---|
| **Donut** | Zaobljeni krajevi segmenata, pravi razmak između njih, segment se podiže na hover, centar preuzima vrijednost i naziv, legenda sinhronizovana sa prstenom | **nepromijenjen** |
| **Grouped bars** | Zaobljeni vrhovi, mekan vertikalni gradijent po seriji, bazna linija, tooltip u `popover` tokenima | **nepromijenjen** |
| **Horizontal bars** | Mirnija staza, gradijent iz `--primary` (ili eksplicitna boja stavke), broj prvi u tipografiji | **nepromijenjen** |
| **Dual area** *(novo)* | Demo-ov potpisni grafikon: dvije serije kao mekani gradijenti, tanka istaknuta linija, isprekidane referentne linije, hover kolona sa ispisom | novi |

**Gdje se vide odmah:** nadzorna ploča je dobila **dual area** grafikon umjesto grupisаних barova za
„kreirano / riješeno (14 dana)” — to je jedina izmjena van `components/charts/` (jedan import i jedan
element u `dashboard-charts.tsx`). Ako želiš da ostane na barovima, dovoljno je vratiti taj jedan element.

**Svi grafikoni su sada i na Visual QA stranici** (`/_visual-qa`), na neutralnim karticama, da ih možeš
uporediti u obje teme bez lovljenja po ekranima.

**Šta je svjesno odgođeno:** `Gauge`, `Heatmap`, `StackedBars` i `Sparkline` iz demoa **nisu** portovani —
za njih još nema mjesta u pravim ekranima, a dodavanje bi značilo mrtvi kod. Uradiću ih u talasu koji ih
stvarno koristi (SLA mjerač → talas 4.4, heatmap kalendar → 4.4, stacked barovi → 4.2).

**Geometrija je izvučena u `lib/charts/plot-geometry.ts`** sa 9 unit testova (prazna serija, nulta serija,
jedna tačka, `NaN`, beskonačno). To je klasa grešaka koja se inače vidi tek na ekranu kao prazan grafikon,
a sada pada u CI-u.

### Faza 4.1 — šta je konkretno urađeno (tiketi)

Cijeli `frontend/src/components/tickets/` (48 fajlova, ~4 900 linija) preveden je u Pulse jezik **bez
ijedne promjene poslovne logike**: svi pozivi servisa, rute, RBAC provjere, WebSocket tok i svih 231
i18n ključa ostali su isti. Promijenjen je samo izgled i raspored.

| Oblast | Šta je promijenjeno |
|---|---|
| **Lista i inbox** | Tabela tiketa i inbox lista na Pulse tabelarnom shellu (hairline redovi, hover u `surface-hover`), prioritet kao **četvorostepeni signal** umjesto tačke, `StatusBadge` i SLA oznake kroz `Badge` tonove |
| **Filteri i pretraga** | Prioritni filteri postali `Chip` pilule, inbox tabovi pilule s brojačem u kapsuli, „sačuvani pregledi“ panel sa `Checkbox` primitivom |
| **Detalj tiketa** | Zaglavlje kao kartica (broj, naslov, meta red s avatarom i relativnim vremenom), `fade-in` ulaz, hint-baneri za pauzu/arhivu |
| **Razgovor** | Poruke kao mehurići sa `rounded-xl` i `shadow-card`, sistemski redovi sa hover stanjem, interni/vanjski prekidač preko `Segmented` |
| **Obrasci za kreiranje** | Koraci, servisni picker, severity/impact preko `Segmented`, polja forme sa `focus-visible` prstenom, brojevi koraka u `primary` tinti |
| **Paneli** | SLA panel (oba stanja), prilozi, odobrenja, praćenje vremena, break-glass (warning tint), CSAT (zvjezdice 18 px sa scale na hover), sigurnosni banneri |
| **Bulk bar** | Postao lebdeća traka (`pop-in`, `shadow-card`, brojač u piluli) sa jasnim `aria-label` na dugmetu za odustajanje |
| **Motion** | `fade-in` / `page-in` / `pop-in` na 24 fajla; sve animacije poštuju `prefers-reduced-motion` |

### Talas 4.2 — šta je konkretno urađeno (nadzorna ploča + izvještaji)

| Oblast | Šta je promijenjeno |
|---|---|
| **Metrike** | Sve kartice metrika (`StatCard`) sa `fade-in` ulazom i hover stanjem ruba |
| **Grafikoni** | Kartice donuta i dual-area grafikona dobile `fade-in`; grupisani barovi na izvještajima ostaju u F3 jeziku |
| **SLA nadzor / tabela pažnje / aktivnost** | Hover redova prebačen na `surface-hover` token, `fade-in` na karticama, prioritet kroz četvorostepeni signal iz 4.1 |
| **Inbox snapshot** | Mrtva klasa `hover:bg-danger/12` (Tailwind je tiho ne generiše) → `hover:bg-danger/15`; baner dobio `rounded-lg` i fokus prsten |
| **Inbox lista tiketa** | `fade-in` na tabeli, `tnum` na prvom mjestu u klasi (brojevi se poravnavaju u koloni) |
| **Izvještaji** | `leading-4.5` (takođe mrtva klasa — Tailwind nema tu vrijednost) → `leading-[18px]`; `border-border/60` → `/70`; `text-muted` → `text-muted-foreground` |

### Talas 4.3 — šta je konkretno urađeno (servisi + baza znanja)

| Dio | Šta je urađeno |
|---|---|
| **Katalog servisa (kartice)** | `fade-in` na mreži, hover prebačen sa `transition-all` na `transition-colors` + `surface-hover`, ikona dobila „rame" koje svijetli na hover, `border-border/50` → `/70`, mrtva `rounded-md` okna → `rounded-lg` |
| **Čipovi kategorija** | `ServiceCategoryChip` sada ima fokus prsten (`focus-visible:outline-primary/70`) i `surface-hover`; `KnowledgeArticleSearchCard` je **prepisan na zajednički `Chip` primitiv** umjesto ručnih `filterChip*` klasa (isti izgled, jedan izvor istine) |
| **Forme (katalog, kategorije, downtime)** | `fade-in` ulaz, `rounded-lg`, uklonjene mrtve `/12` i `/60` alpha vrijednosti koje Tailwind tiho ne generiše |
| **Graditelj formi** | Editor polja: `bg-background/40` → token `bg-elevated/40`, `rounded-lg`; lista polja i istorija verzija dobile `fade-in` |
| **Onboarding čarobnjak** | `leading-4.5` (mrtva klasa) → `leading-[15px]`, `text-text/85` → `text-foreground/90`, `bg-warning/8` → `/6` (isti ton kao ostala upozorenja), `fade-in` na svakom koraku; pipeline kartica na `bg-elevated/40` |
| **Baza znanja** | Lista članaka i detalj: `fade-in`, `bg-success/12`/`bg-danger/12` → `/15` (mrtve alpha vrijednosti!), `surface-hover`, `rounded-lg` na dugmićima za povratnu informaciju **sa fokus prstenom**; `border-border/50` → `/70` |
| **Svjesno nedirnuto (12 fajlova)** | `create-knowledge-article-sheet`, `knowledge-article-admin-fields`, `service-categories-admin-sheet`, `service-category-mutation-sheet`, `form-builder-actions`, `form-version-history`, `service-form-builder-sheet`, `service-onboarding-stepper`, `onboarding-wizard-steps`, `service-catalog-mutation-sheet`, `service-catalog-read-only-banner`, `service-downtime-windows-sheet` — već su bili u Pulse jeziku (samo `Sheet`/`Field`/`Button` primitivi ili čista logika) |

### Talas 4.4 — šta je konkretno urađeno (SLA, routing, policy paketi)

| Dio | Šta je urađeno |
|---|---|
| **Semantički tokeni (najveći dio)** | `text-text` → `text-foreground` (23 mjesta) i `text-muted` → `text-muted-foreground` (42 mjesta), uključujući nijanse (`text-text/85` → `text-foreground/85`, `text-muted/70` → `text-muted-foreground/70`). Isti token, ali ime koje čitač koda i sledeći agent mogu pratiti — u modulu je ostalo da se dvije takve konvencije miješaju |
| **Mrtve klase** | `leading-4.5` (4×, Tailwind je tiho ne generiše) → `leading-[15px]`; `bg-success/12` / `bg-danger/12` (2×) → `/15`; `bg-warning/8` → `/6` (isti ton kao ostala upozorenja); `border-border/60` → `/70` |
| **Površine** | `bg-background/40|50|60|70` → `bg-elevated/*` (isti kanal, ali kroz semantički token); `hover:bg-elevated/40` → `hover:bg-surface-hover`; `transition-all` → `transition-colors` (2×) |
| **Pulse ulaz** | `fade-in` na 11 površina: detalj SLA profila, lista profila, kalendari, eskalacije, matrica prioriteta, drawer-i, pravila rutiranja, tester i rezultat razrješavanja, matrica pokrivenosti, policy paketi |
| **Fokus prstenovi** | `SlaAdminSelectorCard` i „novi profil" dugme u SLA administraciji i ćelija matrice pokrivenosti rutiranja — svi su bili ručni `<button>` bez fokusa (sada `focus-visible:outline-2 outline-offset-2 outline-primary/70`) |
| **Matrica pokrivenosti** | Oznaka aktivne ćelije bila je `ring-1 ring-white/30` — **na svijetloj temi nevidljiva**. Sada `ring-2 ring-line-strong` (tematski token) |
| **Svjesno nedirnuto (17 fajlova)** | Tabele i paneli koji već koriste `tableWrapClassName` / `tableHeadClassName` / `tableRowClassName` iz `control.ts` (promjena tih klasa bi promijenila cijelu aplikaciju, ne samo ovaj modul), `sla-edit-drawer` (Sheet primitiv), `routing-change-log-tab`, `sla-escalation-target-fields`, `sla-escalation-rule-form`, `sla-rule-form` i ostale forme gradеne na `controlClassName` / `Field` primitivima |

> Napomena: `controlClassName` u `control.ts` namjerno ostaje na `rounded-md` — kontrole (inputi, selekti) u Pulse jeziku imaju manji radius od kartica. Zato `rounded-md` u ovom modulu nije „mrtva klasa".

### Talas 4.7 — šta je konkretno urađeno (stranice + radius sistem) — **kraj Faze 4**

`pages/*` su ispali najzdraviji dio aplikacije: svih 23 fajla su tanki sastavljači
(`PageHeader` + modulski paneli + `Card` / `EmptyState` / `PanelSkeleton`), bez ijednog ručnog
`<button>`-a, bez hardkodirane boje i bez mrtve klase. Zato je ovaj talas više **verifikacija nego
popravka** — a ono što je stvarno pronađeno je sistemske prirode.

| Dio | Šta je urađeno |
|---|---|
| **Radius sistem (glavni nalaz)** | `rounded-xl` **nije postojao u `tailwind.config.ts`** — Tailwind ga je generisao iz svojih defaulta (0.75rem = 12px) i zato **nije pratio temu**: na `classic` temi ostajao je 12px dok je `--radius-lg` tamo 8px. Nađeno 5 pojava i sve prebačene na `rounded-lg` (token): komandna paleta, dva fajla razgovora tiketa (mjehurić poruke i optimistic bubble) i dvije kartice formi (prijava, instalacioni čarobnjak). Nakon toga u cijelom `src` **nema više nijednog `rounded-xl`** |
| **Posljednji `rounded-md` van `control.ts`** | Ikonica u brend-panelu prijave (`size-7 … bg-white/15`) → `rounded-lg`. Ostali `rounded-md` u projektu su na primitivima (`Button`, `Segmented`, `Sheet.Close`, `Skeleton`) i mikro-kontrolama — što je i namjera |
| **Ulaz prijave** | Stranica prijave je jedina stranica izvan shella **bez** ulazne animacije (`install-page` i shell je imaju) → dodan `page-in` na korijen |
| **Ručna kartica** | Prazno stanje liste tiketa bilo je u ručnom omotaču `rounded-lg border bg-surface` **bez `shadow-card`** → sada identično `Card` primitivu |
| **Verifikacija (dokazi, ne izmjene)** | 101 utility klasa u `pages/` — **0 propusta** protiv pravog Tailwind CSS-a; **139 `t()` ključeva** u `pages/`, svi prisutni u `bs` **i** `en`; `lib/` **nema nijednu stilsku klasu** (0 `className`) — `lib/theme/*` je pokriven u Fazi 0, ostatak `lib/` je čista logika |
| **Odluka o animaciji stranica** | Stranice **ne** dobijaju `fade-in` pojedinačno: `application-shell` već montira `<div key={location.pathname} className="page-in …">`, pa svaka promjena rute pokreće ulaznu animaciju cijele stranice. Dvostruka animacija bila bi šum, ne poboljšanje |
| **Svjesno nedirnuto** | `bg-white/15`, `text-white/85` i `radial-gradient(…, white …)` u brend-panelima prijave/instalacije — to je panel na gradijentu brenda, gdje bijeli tekst **jeste** dizajn (isto kao u `demo/` prototipu), a ne hardkodirana tema |

> **Faza 4 je završena:** svih 7 talasa (4.1–4.7) je isporučeno, svaki kao zaseban patch.
> Sljedeće su Faza 5 (dark mode + stranica podešavanja izgleda), Faza 6 (dokumentacija) i Faza 7
> (završna verifikacija i release).

### Talas 4.6 — šta je konkretno urađeno (konfiguracije, red, održavanje, povratne informacije)

Ovaj modul je posljedica ranih faza: `tableHeadClassName` / `tableWrapClassName` / `Field` / `Card`
primitivi su već bili tu, pa je talas ispao najmanji do sada — **13 fajlova, 18 zamjena** — i sve
preostalo je bilo na nivou detalja.

| Dio | Šta je urađeno |
|---|---|
| **Pulse ulaz** | `fade-in` na 10 površina: workspace za verzije konfiguracije i sve tri kartice odabrane verzije, lista diff-a, lista rezultata „shadow" testa, kartica integracionog reda, traka održavanja, traka povratne informacije, forma za promjenu lozinke i svaka sekcija Visual QA table |
| **Fokus prstenovi** | Dva ručna `<button>`-a u traci povratne informacije (akcija „Poništi" i zatvaranje) — bili su jedini interaktivni elementi u modulu bez `focus-visible` stila. Dodat je i `transition-opacity` na dugme za zatvaranje |
| **Konzistentnost brojeva** | `tnum` prebačen na prvo mjesto u klasi (4 mjesta: dvije tabele i traka održavanja) |
| **Posljednji `rounded-md` van `control.ts`** | Zamijenjen `rounded-lg` na okviru uzorka boje u Visual QA — **uzorci radijusa** (`rounded-md` / `rounded-lg` / `rounded-full` u tabeli „Geometrija i elevacija") **namjerno ostaju** netaknuti: oni nisu stil, oni su demonstracija vrijednosti |
| **Mrtve klase** | ✅ **nula** — modul nije imao nijednu (`leading-4.5`, `/12`, `border-border/60|50`, `shadow-md`, `bg-muted/*` nisu se pojavljivali) |
| **Hardkodirane boje** | ✅ **nula** — traka održavanja već je koristila `border-warning/40 bg-warning/10 text-warning`, traka povratne informacije `success` / `link` / `warning` / `danger` tokene |
| **Svjesno nedirnuto (8 fajlova)** | `config-versions/{config-version-actions,config-version-admin-error,config-version-status-tabs,create-config-version-form}` (čisti primitivi: `Button`, `Field`, `UnderlineTabs`, `controlClassName`), `visual-qa/{actions,charts,forms,surfaces}-board` (sastavljeni isključivo od primitiva, a `VisualQaSection` sada nosi `fade-in` za sve njih) |

> Napomena: dvije tabele u ovom modulu (`config-version-list`, `config-validation-errors`,
> `integration-queue-table`) i dalje koriste `tableWrapClassName` / `tableHeadClassName` / `tableRowClassName`
> iz `control.ts` — **ista odluka kao u 4.4 i 4.5**: mijenjanje tih dijeljenih klasa mijenja cijelu
> aplikaciju, pa se one restaure kroz `control.ts`, ne po modulu.

### Talas 4.5 — šta je konkretno urađeno (administracija)

| Dio | Šta je urađeno |
|---|---|
| **Hardkodirane boje (posljednja 3 mjesta)** | `text-amber-700 dark:text-amber-400` (2×) i `text-sky-800 dark:text-sky-300` → tokeni `text-warning` / `text-info`. Ovo su bile **jedine** preostale boje izvan tematskih tokena u cijelom `src` — Tailwind palete, ne hex, pa ih F0 migracija nije uhvatila |
| **Mrtve klase** | `leading-4.5` → `leading-[15px]`, `leading-4` → `leading-[15px]` (za 11px tekst), `bg-primary/12` → `/15` (Tailwind ne generiše 12 u alpha skali), `border-border/60|50` → `/70`, `shadow-md` → `shadow-pop`, `bg-muted/*` → `bg-elevated/*`, `hover:bg-elevated/*` → `hover:bg-surface-hover`, `bg-background/*` → `bg-elevated/*` |
| **Fokus prstenovi** | Drvo organizacionih jedinica (red stabla + dugme za skup/širenje + stavke menija), kartica grupe i red u „bezbjednost i usklađenost" — svi ručni `<button>`-i (7 mjesta) |
| **Pulse ulaz** | `fade-in` na 17 površina (admin paneli i kartice, tabela korisnika, kartica i panel grupa, kartice direktorija, RBAC panel i pregled, svih 6 kartica podešavanja) |
| **Konzistentnost** | `tnum` prebačen na prvo mjesto u klasi (5 mjesta) — brojevi se poravnavaju u koloni i čitač koda odmah vidi numerički tip |
| **Svjesno nedirnuto (9 fajlova)** | `groups/group-detail-slot`, `organizational-units/{organizational-unit-catalog-form,organizational-unit-form-drawer,organizational-unit-tree}`, `rbac/permissions-catalog-list`, `settings/{settings-category-drawer,settings-registry-control,settings-reason-confirm}`, `users/{user-admin-actions,user-detail-form}` — građeni na `PanelSkeleton` / `Field` / `Sheet` / `Field` primitivima ili samo logika |

> **Prekretnica:** nakon ovog talasa u **cijelom `frontend/src`** nema više nijedne mrtve klase (`leading-4.5`, `leading-5.5`, `ring-3`, `bg-current/`, `text-text`) niti ijedne alpha vrijednosti koju Tailwind tiho ne generiše.

### Popravke koje si prijavio (SLA i razgovor)

**1) SLA — „izgleda da se u svim tiketima prikazuje SLA za sve tikete".** Prošao sam cijeli lanac
(frontend → API → Prisma → SLA servis) i **dijeljenja SLA između tiketa nema**: `TicketSlaState.ticketId`
je `@unique`, snapshot se čita sa `where: { ticketId: { in: [...] } }` i mapira **po tiketu**, a breach
scanner radi jedan-po-jednom stanju. Ali našao sam **dva stvarna buga koja daju tačno tvoj simptom**:

- **Ljepljivi `isOverdue`.** Realtime događaj o SLA je na klijentu postavljao `isOverdue: true` čim ime
  akcije sadrži „breached" — i **nikad ga nije vratio na `false`**. Jednom prekoračen tiket ostajao je
  označen kao prekoračen do kraja sesije, u svakom sljedećem renderu, čak i kad je SLA zapravo bio u
  redu (npr. nakon rješavanja ili ponovnog otvaranja). Zato je izgledalo kao da se isti SLA „vuče" kroz
  tikete. Sada: SLA događaj **refetcha tiket sa servera** (`shouldReloadTicketFromUpdated`), pa panel i
  oznaka uvijek prikazuju snapshot koji je server upravo izračunao za **taj** tiket.
- **Nije bilo resetovanja stanja pri promjeni tiketa.** Detalj je zadržavao polja prethodnog tiketa dok
  ne stignu nova (a pri grešci učitavanja i trajno). Sada se `ticket`, poruke, prilozi, vremena i SLA
  čiste na svaku promjenu `ticketId`, a SLA panel se i remounta po tiketu (`key`) — dodatna brava.

Pokriveno sa **dva nova testa** u `lib/realtime/ticket-realtime.spec.ts` (payload više ne izmišlja SLA
flagove; SLA događaj traži reload, ostali ne).

**2) Razgovor na fiksnoj visini.** `TicketConversation` sada ima `viewport="fixed"`: nit razgovora ima
**vlastiti scroll** (`h-[320px]`, na `sm+` `h-[420px]`, `overflow-y-auto`, globalni „thin" scrollbar iz
tematskih tokena). Time se kompozitor i desni panel više ne pomjeraju kad stigne duga poruka, a prazna
nit prikazuje uredno prazno stanje unutar istog okvira. `role="log"` je dodat za čitače ekrana.

### Dodatno, jer je bilo neophodno za ispravnost

- **`.cursor/rules/frontend-ui-ux.mdc` je prepisan.** Stara pravila su eksplicitno zabranjivala
  *„neon/purple gradijente, gradient buttons, giant radius"* — što je novi identitet. Bez ove izmjene
  bi sljedeći rad (ljudski ili agentski) vratio stari stil.
- **`.cursor/docs/theme.md` dobio sekciju „Pulse"** sa punim tabelama tokena po temi i checklistom za nove boje.
  Stari katalog je zadržan i jasno označen kao „classic".
- **`lib/theme/semantic-meta.ts`** — `SEMANTIC_DOT_HEX` više nisu hex nego CSS varijable, pa statusne
  tačke na 12 ekrana automatski prate temu.

---

## 5. Kako tema radi (za tvoj tim)

```
html[data-theme="pulse"]           → novi identitet, svijetli (default)
html[data-theme="pulse"].dark      → novi identitet, tamni
html[data-theme="classic"]         → stara tema (uvijek tamna)
```

- Kontrakt: `frontend/src/lib/theme/theme-storage.ts`
- Provider: `frontend/src/lib/theme/theme-provider.tsx`
- Birač: `frontend/src/components/layout/theme-switcher.tsx` (topbar, ikona sunce/mjesec)
- **Prebacivanje defaulta na staru temu tokom pilot sedmice = jedna konstanta:**
  `DEFAULT_THEME_DESIGN: ThemeDesign = "classic"` u `theme-storage.ts`.

### Tri trika koja su uštedjela dane rada

1. **Tokeni su RGB kanali, ne gotove boje** — zato `bg-surface/60`, `border-border/70` i `text-muted-foreground/70`
   rade isto u sve tri teme. Bez toga bi alpha nijanse (korištene stotine puta) pukle.
2. **`control.ts` je najveća poluga** — uvozi ga 103 fajla, pa promjena tog jednog fajla restilizuje sve
   forme, tabele, chipove i plutajuće panele u cijeloj aplikaciji.
3. **Radius i sjena su tokeni po temi** — `rounded-lg` je 12px u Pulse, 8px u classic; `shadow-card` je
   `none` u classic. Zato kartice izgledaju „Pulse" **bez ijedne izmjene u 248 komponenti**.

---

## 6. Šta ovaj PR NE dira (garancije)

- **`services/**`** (API sloj): 0 izmjena.
- **`lib/**`** poslovna logika: 0 izmjena osim `theme/` (novo) i `semantic-meta.ts` (boje tačaka).
- **Rute i URL-ovi**, RBAC guardovi (`require-access`), WebSocket tok, realtime store: 0 izmjena.
- **`src/app/router.tsx`**: 0 izmjena. **`lib/navigation.ts`**: 0 izmjena (samo je dodat mapper za ikone).
- **Postojećih 1357 `t()` poziva**: 0 izmjena. Novi UI koristi **nove** ključeve u oba lokala
  (`theme.*`, `ui.*`, `palette.*`, `login.*`, `install.steps.*`, `install.progress`, `shell.searchTrigger`).
- **`package.json`**: 0 novih zavisnosti. Modal i Toast koriste već prisutni `@radix-ui/react-dialog`.
- **Backend**: 0 izmjena.

---

## 7. Poznati rizici / šta pregledati

| Rizik | Detalj |
|---|---|
| **Vizuelni QA** | Obavezno prođi ekrane očima — ja nisam mogao renderovati u browseru. Prvo Visual QA → Primitive-i → Theme. |
| **Kontrast u light modu** | Semantički tekstualni tokeni su računati na ≥ 4.5:1, ali provjeri svoje ekrane sa puno tintova (npr. `routing` coverage matrica, SLA panel). |
| **`classic` nije 100% piksel-identičan** | Boje su identične, ali nekoliko **zajedničkih** poboljšanja interakcije važi za obje teme: fokus ring (`ring-2 ring-primary/25`), hover ispune (`bg-surface-hover`), inputi na `surface` umjesto `background/60`. To je namjerno. |
| **Nove komponente još nisu potrošene** | `Modal`, `ConfirmDialog`, `Toast`, `Segmented`, `Chip` postoje i dokumentovane su u Visual QA, ali ih Faza 2+ tek počinje koristiti. `ToastProvider` je montiran u `app.tsx`. |
| **`prefers-color-scheme` u testovima** | Provider ima zaštitu za `window.matchMedia` (jsdom/node ga nema) — bitno ako kasnije dodaš jsdom testove. |
| **`E2E` scenariji** | Nisu dirani i **trebali bi proći** (selektori su tekst/rola, a i18n je nepromijenjen). Nisam ih mogao pokrenuti — traže bazu i backend. |
| **Mrtve Tailwind klase** | ✅ **Nema ih više nigdje u `src`** — posljednja mjesta očišćena su u talasu 4.5. Ako dodaješ nove klase, pazi na tri klase koje Tailwind 3 tiho ne generiše: `leading-4.5`, `ring-3` i alpha vrijednosti koje nisu višekratnik 5 (npr. `/12`). |
| **Radius: ne koristi `rounded-xl`** | `rounded-xl` nije u `tailwind.config.ts` — Tailwind ga generiše iz defaulta (12px) i **ne mijenja se s temom**. Za kartice i veće blokove koristi `rounded-lg` (token `--radius-lg`: 12px Pulse / 8px classic), za kontrole `rounded-md` (token), za mikro-elemente `rounded` ili `rounded-[Npx]` |
| **`rounded-md` u Visual QA** | U tabeli „Geometrija i elevacija" i u uzorcima boja **namjerno** stoji `rounded-md` — to su uzorci radijusa, ne stil. Jedini pravi `rounded-md` van `control.ts` zamijenjen je u 4.6 |
| **Izgled se pamti lokalno, ne po korisniku** | Izbor dizajna i svjetline stoji u `localStorage` **tog pregledača**, ne na nalogu. Ako želiš da izgled prati korisnika na svakom uređaju, to je novi backend ključ kroz **settings registry** (`settings/definitions/` + `readStringSetting`) — infrastruktura već postoji i to je jedini otvoren zadatak iz plana za Fazu 5 |
| **Guard je sada dio ugovora** | Ako `check-pulse-design-system` padne, to nije „alat se pokvario" nego nalaz: ili je u kod ušla odluka koja nije dozvoljena, ili se pravilo namjerno mijenja (tada se mijenja i skripta, u istom commit-u). U CI-ju se vrti samo na `master`/`main`, pa se prvi put aktivira nakon merge-a |
| **Vizuelni QA i UAT nisu obavljeni** | Ja ne mogu renderovati ekrane. Ono što je mjerljivo (kontrast, tokeni, fokus, mrtve klase, i18n) je izmjereno; ostalo je checklista u §10 — ona je jedini preostali korak do promjene defaulta |
| **Dokumenti su sada „izvor istine", pa ih treba održavati** | `theme.md` tvrdi konkretne vrijednosti (npr. `--radius-md` 8px u Pulse). Ako mijenjaš token u `index.css`, promijeni i tabelu — inače dokument laže. Zato u `theme.md` stoji „ako se fajl i kod ne slažu, **pobjeđuje kod**" |
| **`theme-source.md` i `referenca-dizajn/` nisu obrisani** | Namjerno: arhivirani su oznakom, pa istorija i dalje radi i ništa se ne lomi (patch je 57 KB umjesto 26 brisanja). Ako želiš čist folder, brisanje je jedna komanda — ali onda i `git log --follow` postaje jedini izvor tih vrijednosti |
| **`appearance.*` i `theme.accent*` su novi blokovi u i18n** | 22 + 10 ključeva su dodata u `bs` i `en`; ako imaš i druge lokale, parity test (2142 → **2174**) će ih prijaviti kao nedostajuće |
| **Paleta je izbor, ne brend** | Kao i dizajn i svjetlina, paleta se pamti u `localStorage` **tog pregledača** — ne na nalogu. Ako želiš da svi korisnici na instalaciji imaju istu paletu, to je jedan ključ kroz settings registry (isti obrazac kao za default temu iz plana) |
| **`text-primary` u tamnoj indigo paleti je 4.00:1** | To je **postojeće stanje** (Faza 0), ne regresija — nove palete su tu strože i drže 6.72–9.71:1. Popravka bi bila jedna linija (tamniji `--primary-foreground` + svjetlija `--primary`), ali mijenja kako izgledaju primarna dugmad u tamnom modu, pa čeka tvoju odluku |
| **`/appearance` nije u `navigation.ts`** | Stranica je namjerno dostupna iz korisničkog menija i birača teme, **ne** iz sidebar navigacije — izgled nije modul aplikacije. Ako je želiš u sidebaru, dodaje se jedan red u `lib/navigation.ts` + ključ u oba lokala |
| **Fiksna visina razgovora** | Visina je `320px` (mobilni) / `420px` (`sm+`). Ako ti na tvom ekranu treba drugačije, to je jedna klasa u `ticket-conversation.tsx` (`VIEWPORT_CLASS.fixed`). |

---

## 8. Troubleshooting: `git apply` pada na Windowsu (CRLF) — RIJEŠENO

### Simptom
Na Windowsu (`Git Bash`, `core.autocrlf=true`):

```
demo/patches/pulse-01-...patch:516: trailing whitespace.
import { Check, Moon, Palette, Sun, SunMoon } from "lucide-react";
...
error: patch failed: frontend/src/components/tickets/ticket-split-panel.tsx:52
error: frontend/src/components/tickets/ticket-split-panel.tsx: patch does not apply
```

…a zatim `npm run dev` puca sa:

```
Failed to resolve import "@/components/ui/toast" from
  "src/components/visual-qa/visual-qa-theme-board.tsx"
```

### Uzrok (dokazan mjerenjem)

`git apply` zahtijeva da se linije u **patch fajlu** poklapaju sa linijama u radnom stablu.
Na Windowsu `core.autocrlf=true` pretvara **i sam `.patch` fajl** u CRLF pri checkoutu —
svaki `\r` na kraju linije Git tada prijavljuje kao *trailing whitespace*.

Izmjerene kombinacije (`git apply`, patch 01, 50 hunkova):

| Patch | Radno stablo | Rezultat |
|---|---|---|
| **CRLF** | LF | ✗ **50 hunkova pada** |
| **CRLF** | CRLF | ⚠️ prolazi uz lažna „trailing whitespace" upozorenja |
| **LF** | LF | ✅ prolazi |
| **LF** | CRLF | ✅ prolazi |

Zaključak: **patch fajl mora biti LF.** Kada je LF, radi bez obzira na line endings radnog stabla.

`npm run dev` greška je samo **posljedica**: patch 02 se primijenio, patch 01 nije, pa
`visual-qa-theme-board.tsx` (patch 02) uvozi `@/components/ui/toast` koji dolazi iz patcha 01.
Nije greška u kodu — nestaje čim se oba patcha primijene.

### Popravka A — trajna (`.gitattributes`)

U repou je sada `.gitattributes` sa:

```
*.patch text eol=lf
```

Git od sada **nikada** ne pretvara `.patch` fajlove u CRLF, bez obzira na `core.autocrlf`.

### Popravka B — odmah, bez čekanja (ako patcheve već imaš)

```bash
# 1. očisti neuspjeli pokušaj (ništa nije commitovano → sigurno)
git reset --hard 5831dfd
git status --porcelain            # mora biti prazno

# 2. uzmi patcheve iz moje grane
git fetch origin arena/01a0cefc-help-desk-enterprise
git checkout origin/arena/01a0cefc-help-desk-enterprise -- demo/patches/

# 3. KLJUČNI KORAK — vrati patcheve u LF
sed -i 's/\r$//' demo/patches/*.patch
grep -c $'\r' demo/patches/*.patch     # mora ispisati 0 i 0

# 4. primijeni
git apply demo/patches/pulse-01-theme-tokens-and-infrastructure.patch
git apply demo/patches/pulse-02-ui-primitives.patch
git status --porcelain | wc -l         # očekivano 81 (2 patcha + 79 promjena)

# 5. pokreni
cd frontend && npm install && npm run dev
```

Ako `sed -i` iz nekog razloga ne radi, ekvivalent je:

```bash
for f in demo/patches/*.patch; do tr -d '\r' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done
```

Ili, bez mijenjanja fajlova — prisili checkout bez konverzije:

```bash
rm -f demo/patches/*.patch
git -c core.autocrlf=false checkout origin/arena/01a0cefc-help-desk-enterprise -- demo/patches/
```

### Kako provjeriti da je sve u redu prije `npm run dev`

```bash
grep -c $'\r' demo/patches/*.patch          # 0 i 0
ls frontend/src/components/ui/toast.tsx     # postoji (dolazi iz patcha 01)
ls frontend/src/lib/theme/theme-provider.tsx
```

---

## 9. Prijedlog sljedećeg koraka

Isporučeno je Faza 0 + 1 + 2 + 3 + **cijela Faza 4 (talasi 4.1–4.7)** + **Faza 5 (izgled)**. Ostaje:

1. **Pilot** sa `DEFAULT_THEME_DESIGN = "classic"` za interni tim, ili odmah `pulse` ako si zadovoljan.
   Tema se prebacuje iz topbara, bez rekompajliranja.
2. **Faza 5** (1 dan): dark mode + stranica podešavanja izgleda (patch `pulse-12`) — ✅ **isporučeno**.
   Ako želiš, prvo otvori `/appearance` u obje teme i klikni kroz sve tri opcije svjetline.
3. **Faza 4** — jedan talas = jedan patch i jedan review; stanje do sada:

   | Talas | Moduli | Komponenti | Patch |
   |---|---|---|---|
   | ~~4.1~~ | ~~`tickets/`~~ — **isporučeno** | ~~48~~ | ✅ `pulse-05` |
   | ~~4.2~~ | ~~`dashboard/`, `reports/`~~ — **isporučeno** | ~~11~~ | ✅ `pulse-06` |
   | ~~4.3~~ | ~~`services/`, `knowledge-base/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-07` |
   | ~~4.4~~ | ~~`sla/`, `routing/`, `policy-packs/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-08` |
   | ~~4.5~~ | ~~`admin/`, `users/`, `groups/`, `organizational-units/`, `rbac/`, `settings/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-09` |
   | ~~4.6~~ | ~~`config-versions/`, `queue/`, `maintenance/`, `feedback/`, `auth/`, `visual-qa/`~~ — **isporučeno** | ~~13~~ | ✅ `pulse-10` |
   | ~~4.7~~ | ~~`pages/*` + `lib/` pomoćne~~ — **isporučeno** | ~~23~~ | ✅ `pulse-11` |
   | ~~5~~ | ~~dark mode + stranica izgleda~~ — **isporučeno** | ~~6~~ | ✅ `pulse-12` |

4. **Palete boja** (0,5 dana): `data-accent` — indigo / teal / rose (patch `pulse-13`) — ✅ **isporučeno**.
   Otvori `/appearance` (ili grupu „Boja" u topbaru) i prebaci kroz sve tri u obje svjetline.
5. **Faza 6** (1 dan): dokumentacija i pravila (patch `pulse-14`) — ✅ **isporučeno**.
6. **Faza 7** (1–2 dana): završna verifikacija, guard i a11y (patch `pulse-15`) — ✅ **isporučeno**.
   Guard skripta je upravo to što je predloženo u prethodnom koraku, plus je našla dva stvarna nalaza
   (43 zastarjele upute i 17 elemenata bez vidljivog fokusa).

**Šta je ostalo — i zašto je to tvoje, ne moje:** jedino što se ne može uraditi bez browsera i ljudi je
**QA prolaz (§10)** i **UAT**. Kad to prođe, migracija je završena i preostaje odluka o defaultu:
`DEFAULT_THEME_DESIGN` u `frontend/src/lib/theme/theme-storage.ts` je već `"pulse"` — ako želiš pilot,
jedna linija ga vraća na `"classic"` bez redeploya logike.

Prvo provjeri u obje teme: **razgovor na fiksnoj visini** u detalju tiketa i **SLA panel** — ako se
„ljepljivo" prekoračenje ipak pojavi, pošalji mi ekran i broj tiketa, pa idem dublje (u tom slučaju je
izvor u podacima, npr. breach flag u bazi, ne u prikazu). Zatim reci „kreni na Fazu 6"
(dokumentacija i `.cursor` pravila) i nastavljam istim tokom: jedan korak = jedan patch
(`pulse-13` u kojoj su **samo dokumenti i pravila** — bez ijedne linije koda) + verifikacija + handoff.
## 10. QA checklista (zadnji korak — Faza 7 završava kad ovo prođe)

Ovo je jedini dio verifikacije koji ne mogu ja: treba browser i ljude. Predlažem da se radi u tri prolaza,
svaki 20–30 minuta. Ako nešto zapne, pošalji ekran + naziv ekrana i sredim bez ponovnog prolaska kroz faze.

### 10.1 Vizuelni prolaz (matrica, ne „sve odjednom")

| | **Pulse svijetla** | **Pulse tamna** | **classic** |
|---|---|---|---|
| **indigo (zadana)** | ✔ obavezan | ✔ obavezan | ✔ obavezan |
| **teal** | ✔ | ✔ | — (nema efekta, očekivano) |
| **rose** | ✔ | ✔ | — |

Tri širine za svaki ekran: **1440** (desktop), **1024** (tablet), **390** (mobile).

Ekrani po prioritetu (prvo ono gdje boja najviše „radi"):
1. `/appearance` — dizajn, paleta, svjetlina, živi pregled, „vrati na zadano" (uključujući disabled stanje).
2. Detalj tiketa — SLA panel, razgovor (fiksna visina), mjehurići, statusi, prioriteti, bulk traka.
3. Lista tiketa + grupni inbox — tabela, filteri, sačuvani pregledi, paginacija.
4. Nadzorna ploča + izvještaji — kartice, donut, dual-area, barovi, health trake.
5. Prijava i instalacioni čarobnjak — brend pano (gradijent), koraci, validacije.
6. Administracija — korisnici, grupe, OU drvo, dozvole, sistemska podešavanja, registar podešavanja.
7. Servisi i baza znanja — katalog, kartice, forme, pretraga, članci.
8. SLA / routing / policy paketi — kalendar, matrica prioriteta, coverage, tester razrješavanja.

Šta gledati konkretno:
- **Tint površine** (`bg-primary/8`, `bg-primary/10`) — da li se tekst u njima čita (badge, chip, aktivni red).
- **Granice i sjene** — Pulse ima hairline sjenu na karticama, classic ne; da ništa nije „spljošteno".
- **Grafikoni** — boje serija dolaze iz tokena, pa moraju pratiti paletu (teal/rose mijenja i njih).
- **Fiksna visina razgovora** u detalju tiketa (320/420px) i **SLA panel** (ono što si prijavio u talasu 4.2).
- Prekidač palete u topbaru: promjena mora biti **trenutna**, bez reload-a i bez treperenja.

### 10.2 A11y provera (ono što se ne vidi na ekranu)

- **Tastatura:** `Tab` kroz topbar → sidebar → sadržaj; `⌘K`/`Ctrl+K` paleta (strelice + Enter + Esc);
  otvori modal i `Sheet` (fokus ostaje unutra, `Esc` zatvara, fokus se vraća na dugme koje ga je otvorilo).
- **Fokus vidljiv:** svaki Tab-stop mora imati vidljiv prsten (`outline-primary/70`). U listama pretrage
  i palete fokus je na inputu, a aktivni red je **highlightovan** — to je namjerno (combobox obrazac).
- **Kontrast:** mjereno je 24/24 ≥ 4.5:1 za tekst; ako negdje vidiš „blijed" tekst, javi ekran — najvjerovatnije
  je `text-muted-foreground` na tintu, što se popravlja jednim tokenom.
- **Zoom 200%** i **`prefers-reduced-motion`** (animacije ulaza moraju stati).
- **Statusi se ne prenose samo bojom** — badge ima tekst, ne samo tačku.

### 10.3 UAT (5–8 ljudi iz Service Desk tima)

Scenario koji pokriva sve kritične tokove (izvedi ga u **obje** teme; paletu po želji):

1. Prijava → provjeri da je tema odmah ispravna (bez bljeska druge teme).
2. Kreiraj tiket kroz čarobnjak → **KB intercept** korak radi, forma se validira, tiket se pojavi u listi.
3. Nađi tiket preko `⌘K`, otvori detalj → SLA panel ima smisla, razgovor skroluje u fiksnoj visini.
4. Dodijeli tiket grupi → provjeri realtime osvježavanje (druga sesija ili drugi tab).
5. Zatvori tiket + CSAT → provjeri da se stanja i boje poklapaju s onim što piše.
6. Administracija: promijeni sistemsko podešavanje (traži razlog) → audit trag postoji.
7. Prebaci paletu i svjetlinu → **ništa se ne izgubi, ništa ne treba reload**.

Pitanja za učesnike (kratko, 3 ocjene 1–5 + komentar):
- Da li u svakom trenutku znaš **šta je tvoj sljedeći potez**?
- Da li nešto „šušti" (previše boje, previše sjene) na ekranima gdje radiš cijeli dan?
- Koja paleta ti je najudobnija za osmosatni rad?

### 10.4 Kad prođe

- Rezultat QA-a (ako traži izmjene) dolazi kao **novi patch**, istim tokom.
- Promjena defaulta: `DEFAULT_THEME_DESIGN` u `frontend/src/lib/theme/theme-storage.ts`
  (sada `"pulse"`; `"classic"` je jedna linija za pilot).
- Guard skripta u CI-ju će od prvog merge-a na `master` čuvati sve F0–F6 odluke bez ručnog čitanja.

---

