# Pulse UI — Faza 0 + 1 + 2 + 3 + talasi 4.1–4.5 (isporuka)

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
| 4.6–4.7 | Ostali moduli (2 talasa) | ⏳ sljedeće |
| 5–7 | Dark mode + podešavanja, dokumentacija, završna verifikacija | ⏳ |

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
| **Ukupno** | **245 unikatnih putanja** (15 se pojavljuje u više setova) | **10 184 linije** |

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
└── pulse-09-admin-users-groups-ou-rbac-settings.patch 32 fajla     35 KB
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
git status --porcelain | wc -l                          # ~240 putanja nakon 01–09
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

Isporučeno je Faza 0 + 1 + 2 + 3 + talasi 4.1–4.5. Ostaje:

1. **Pilot** sa `DEFAULT_THEME_DESIGN = "classic"` za interni tim, ili odmah `pulse` ako si zadovoljan.
   Tema se prebacuje iz topbara, bez rekompajliranja.
2. **Faza 4** — 6 talasa (4.2–4.7), svaki talas = zaseban patch i zaseban review:

   | Talas | Moduli | Komponenti | Patch |
   |---|---|---|---|
   | ~~4.1~~ | ~~`tickets/`~~ — **isporučeno** | ~~48~~ | ✅ `pulse-05` |
   | ~~4.2~~ | ~~`dashboard/`, `reports/`~~ — **isporučeno** | ~~11~~ | ✅ `pulse-06` |
   | ~~4.3~~ | ~~`services/`, `knowledge-base/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-07` |
   | ~~4.4~~ | ~~`sla/`, `routing/`, `policy-packs/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-08` |
   | ~~4.5~~ | ~~`admin/`, `users/`, `groups/`, `organizational-units/`, `rbac/`, `settings/`~~ — **isporučeno** | ~~41~~ | ✅ `pulse-09` |
   | 4.6 | `config-versions/`, `queue/`, `maintenance/`, `feedback/`, `auth/`, `visual-qa/` | 20 | `pulse-10` |
   | 4.7 | `pages/*` + `lib/` pomoćne (gustina, tema) | 23 | `pulse-11` |

3. **Faza 5** (1 dan): dark mode + stranica podešavanja izgleda (patch `pulse-12`).
4. **Faza 6** (1 dan): `Master UI-UX Design Constitution.md`, `.cursor/docs/theme-source.md`,
   `referenca-dizajn/` — usklađivanje dokumentacije sa novim identitetom.
5. **Faza 7** (1 dan): završna verifikacija i release.

Prvo provjeri u obje teme: **razgovor na fiksnoj visini** u detalju tiketa i **SLA panel** — ako se
„ljepljivo" prekoračenje ipak pojavi, pošalji mi ekran i broj tiketa, pa idem dublje (u tom slučaju je
izvor u podacima, npr. breach flag u bazi, ne u prikazu). Zatim reci „kreni na talas 4.6" i nastavljam
istim tokom: jedan talas = jedan patch (`pulse-10`) + verifikacija + handoff.
