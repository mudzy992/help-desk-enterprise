# Pulse UI — Faza 0 + 1 + 2 + 3 (isporuka)

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
| 4–7 | 248 komponenti po modulima (7 talasa), dark mode + podešavanja, dokumentacija, završna verifikacija | ⏳ nije u ovom PR-u |

| Faza | Putanja | Diff |
|---|---|---|
| 0+1 | 79 (69 izmijenjenih + 10 novih) | 3135 linija u 2 patcha |
| 2 | 27 (20 izmijenjenih + 6 novih + 1 brisanje) | 2204 linije u 1 patchu |
| 3 | 9 (5 izmijenjenih + 4 nova) | 856 linija u 1 patchu |
| **Ukupno** | **104 unikatne putanje** (11 se pojavljuje u više setova) | **6195 linija** |

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
└── pulse-04-charts.patch                             9 fajlova   34 KB
```

Patchevi su **sekvencijalni** (03 pretpostavlja 01+02, 04 pretpostavlja 01–03), a svaki zasebno
kompajlira — možeš ih pregledati i primijeniti odvojeno.

```bash
git checkout -b pulse-ui              # ili kako ti već ide tok
git apply demo/patches/pulse-01-theme-tokens-and-infrastructure.patch
git apply demo/patches/pulse-02-ui-primitives.patch
git apply demo/patches/pulse-03-shell-palette-login-wizard.patch
git apply demo/patches/pulse-04-charts.patch
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

Ako želiš jedan commit, primijeni sva tri patcha pa jedan commit.

### Kako provjeriti da je sve primijenjeno

```bash
ls frontend/src/components/layout/command-palette.tsx   # postoji → 03 je primijenjen
ls frontend/src/components/layout/header-search.tsx     # ne smije postojati → 03 briše ovaj fajl
ls frontend/src/components/charts/dual-area-chart.tsx   # postoji → 04 je primijenjen
git status --porcelain | wc -l                          # ~35 putanja nakon 03+04 (na 01+02)
```

---

## 3. Verifikacija (egzaktni rezultati)

Provjereno **i u mom radnom stablu i na svježem klonu baze `5831dfd` sa primijenjenim patchevima**:

| Provjera | Rezultat |
|---|---|
| `git apply --check` (sva četiri patcha) | ✅ čisto, bez konflikata |
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

Isporučeno je Faza 0 + 1 + 2 + 3. Ostaje:

1. **Pilot** sa `DEFAULT_THEME_DESIGN = "classic"` za interni tim, ili odmah `pulse` ako si zadovoljan.
   Tema se prebacuje iz topbara, bez rekompajliranja.
2. **Faza 4** (6–8 dana): 248 komponenti u 7 talasa, svaki talas = zaseban patch i zaseban review:

   | Talas | Moduli | Komponenti | Patch |
   |---|---|---|---|
   | 4.1 | `tickets/` (lista, detalj, composer, bulk, saved views) | 48 | `pulse-05` |
   | 4.2 | `dashboard/`, `reports/` | 11 | `pulse-06` |
   | 4.3 | `services/`, `knowledge-base/` | 41 | `pulse-07` |
   | 4.4 | `sla/`, `routing/`, `policy-packs/` | 41 | `pulse-08` |
   | 4.5 | `admin/`, `users/`, `groups/`, `organizational-units/`, `rbac/`, `settings/` | 41 | `pulse-09` |
   | 4.6 | `config-versions/`, `queue/`, `maintenance/`, `feedback/`, `auth/`, `visual-qa/` | 20 | `pulse-10` |
   | 4.7 | `pages/*` + `lib/` pomoćne (gustina, tema) | 23 | `pulse-11` |

3. **Faza 5** (1 dan): dark mode + stranica podešavanja izgleda (patch `pulse-12`).
4. **Faza 6** (1 dan): `Master UI-UX Design Constitution.md`, `.cursor/docs/theme-source.md`,
   `referenca-dizajn/` — usklađivanje dokumentacije sa novim identitetom.
5. **Faza 7** (1 dan): završna verifikacija i release.

Reci „nastavi na Fazu 4" (ili „kreni na talas 4.1") i krećem, istim tokom (patch po talasu).
