# Theme — EP-HelpDesk tokeni

Ovaj fajl je **implementacijski katalog tokena** (hex, Tailwind `@theme`, geometrija, kretanje). Nije samostalni dizajn-sistem.

## Izvori (hijerarhija)

1. **Tematika (mjerodavno):** ovaj fajl — implementacijski katalog tokena, paleta i kontrasta.
   Izvor istine je kod: [`frontend/src/index.css`](../../frontend/src/index.css) + [`frontend/tailwind.config.ts`](../../frontend/tailwind.config.ts).
   `.cursor/docs/theme-source.md` je **penzionisan** (stara dark-only paleta) — ne koristi ga kao izvor.
2. **UX / interakcija:** [`Master UI-UX Design Constitution.md`](../../docs/design/Master%20UI-UX%20Design%20Constitution.md) — north star, layout po ekranu, obrasci, a11y, jezik.
3. **Živi dokaz:** [`demo/`](../../demo/) — prototip novog identiteta; **Visual QA → Primitive-i → Theme** u aplikaciji.
   `referenca-dizajn/` je **arhiviran** (vidi [`referenca-dizajn/README.md`](../../referenca-dizajn/README.md)).

Ako se ovaj fajl i kod ne slažu, **pobjeđuje kod**. Ako se UX i Constitution ne slažu, **pobjeđuje Constitution**.

App shape: **multipage application shell** (nije one-page). Pulse je **light-first sa ravnopravnim tamnim modom**;
`classic` je uvijek tamna (dark-only) i ostaje dostupna tokom tranzicije. Hijerarhija ploha je ista u obje svjetline:
`background → surface → elevated`.

CSS varijable: [`frontend/src/index.css`](../../frontend/src/index.css). Font: Inter preko `index.html`/`index.css`.

---

# Pulse (aktivni dizajn-sistem)

Pulse je novi vizuelni identitet i **default tema** frontenda. Definisan je u
[`frontend/src/index.css`](../../frontend/src/index.css) i mapiran u
[`frontend/tailwind.config.ts`](../../frontend/tailwind.config.ts).

## Model tema

| Atribut na `<html>` | Značenje |
|---|---|
| `data-theme="pulse"` | novi identitet, svijetli po defaultu |
| `data-theme="classic"` | stara tamna tema, sačuvana tokom tranzicije |
| `.dark` | tamni mod aktivne teme (`classic` je uvijek tamna) |
| `data-accent="indigo\|teal\|rose\|cyan\|amber\|orange"` | **brend paleta** unutar Pulse-a (`indigo` je zadana) |

Kombinacije: `pulse` (svijetla) · `pulse` + `.dark` · `classic` (uvijek `.dark`) × jedna od šest paleti
(paleta se ignoriše u `classic` — tamo je brend uvijek njegova plava).

- Kontrakt je u [`frontend/src/lib/theme/theme-storage.ts`](../../frontend/src/lib/theme/theme-storage.ts),
  provider u `theme-provider.tsx`, birač u `components/layout/theme-switcher.tsx`.
- `index.html` primjenjuje temu **prije prvog paint-a** (bez treperenja) i postavlja `data-theme`, `data-accent` i `.dark`;
  neispravna vrijednost u `localStorage` se sanitizuje na default. Ako skripta padne, ostaje `classic`.
- Defaulti se mijenjaju konstantama: `DEFAULT_THEME_DESIGN`, `DEFAULT_THEME_MODE`, `DEFAULT_THEME_ACCENT`.
- Tri ulaza u izgled, jedan kontrakt (`useTheme()`): birač u topbaru · korisnički meni → **Izgled** · stranica
  **`/appearance`** ([`frontend/src/pages/appearance-page.tsx`](../../frontend/src/pages/appearance-page.tsx)),
  koja ima i **živi pregled** sastavljen od pravih primitiva (nema odvojene „preview" teme).

## Kako su tokeni zapisani

Token je **RGB kanal**, ne gotova boja. To je ono što drži `/alpha` modifikatore ispravnim u svim temama:

```css
:root[data-theme="pulse"] { --surface: 255 255 255; }
```
```ts
surface: "rgb(var(--surface) / <alpha-value>)"   // bg-surface, bg-surface/60
```

## Brend palete (`data-accent`)

Treća osa rotira **samo brend boje**; površine, radijusi, sjene i semantički tonovi se ne mijenjaju —
zato paleta radi u obje svjetline bez ijednog dodatnog bloka po modu. Paletni blok mijenja **8 varijabli + glow**:
`--primary`, `--primary-hover`, `--primary-active`, `--primary-foreground`, `--ring`, `--link`,
`--selection-bg`, `--selection-fg`, `--shadow-glow`.

| Paleta | `data-accent` | Svjetla `--primary` | Tamna `--primary` | Karakter |
|---|---|---|---|---|
| Indigo (**zadana**) | `indigo` | 91 91 214 | 111 102 223 | postojeći Pulse brend |
| Teal | `teal` | 15 118 110 | 45 212 191 | hladna, smirena |
| Rose | `rose` | 190 18 60 | 251 113 133 | topla, izražena |
| Cyan | `cyan` | 14 116 144 | 6 182 212 | svježa, tehnička |
| Amber | `amber` | 161 98 7 | 231 183 2 | topla, zlatna |
| Orange | `orange` | 194 65 12 | 249 115 22 | žarka, energična |

Selektori su oblikovani kao `:root[data-theme="pulse"][data-accent="teal"]` (specifičnost pobjeđuje bazni blok
bez obzira na redoslijed) i **scoped su na `pulse`** — `classic` zadržava svoju plavu.

**Pravilo rampe za tri kasnije palete (cyan / amber / orange):** brend hex je **tamni** korak. Živahna brend
boja ne može da drži bijeli tekst na 4.5:1 u svijetlom modu (`#06b6d4` daje 2.43:1), pa svijetli blok uzima
istu nijansu jedan stepen niže u Tailwind rampi (700) — isto kao što `teal` i `rose` već rade. Tamni blok
vraća brend hex u punoj vrijednosti, uz hover/active korake svjetlijim (300/200).

**Kako dodati paletu (5 koraka):**

1. Blok `:root[data-theme="pulse"][data-accent="<ime>"]` i njegov `.dark` par u `frontend/src/index.css`
   (8 varijabli + `--shadow-glow`).
2. Ime u `ThemeAccent`, `THEME_ACCENTS` i `isThemeAccent` (`frontend/src/lib/theme/theme-storage.ts`).
3. Ključevi `theme.accent<Ime>` (+ `…Hint`) u `bs` **i** `en`.
4. Preview uzorci `.accent-swatch-<ime>` (+ `.dark` varijanta) u `index.css`.
5. Vrijednost u sanitizaciju pre-paint skripte u `frontend/index.html` — bez toga se izbor tiho vrati na
   `indigo` nakon prvog reloada.

UI se prilagođava sam (birač, `/appearance`, `role="radiogroup"` iteriraju `THEME_ACCENTS`).
`--primary-foreground` nije ukras: **svijetla primary boja traži taman tekst na sebi**.
Preview uzorci (`.accent-swatch-*` u `index.css`) su jedina hardkodirana boja van tokena — moraju prikazati
paletu koja **nije** aktivna, pa ne mogu čitati `--primary`.

## Kontrast (izmjerene vrijednosti)

Prag: **≥ 4.5:1** za tekst. Mjereno na generisanom CSS-u (12 kombinacija × 4 mjerenja = 48/48 na svim paletama):

| Paleta | Svjetlina | Tekst na primary | Primary kao tekst | Link | Selekcija |
|---|---|---|---|---|---|
| indigo | svjetla | 5.37:1 | 5.37:1 | 6.41:1 | 12.44:1 |
| indigo | tamna | 4.52:1 | **4.00:1** ⚠ | 6.68:1 | 12.77:1 |
| teal | svjetla | 5.47:1 | 5.47:1 | 7.58:1 | 9.88:1 |
| teal | tamna | 7.77:1 | 9.71:1 | 12.22:1 | 8.79:1 |
| rose | svjetla | 6.29:1 | 6.29:1 | 8.02:1 | 9.87:1 |
| rose | tamna | 5.81:1 | 6.72:1 | 9.56:1 | 10.51:1 |
| cyan | svjetla | 5.36:1 | 5.36:1 | 7.27:1 | 9.13:1 |
| cyan | tamna | 5.52:1 | 7.45:1 | 12.48:1 | 9.99:1 |
| amber | svjetla | 4.92:1 | 4.92:1 | 6.85:1 | 10.11:1 |
| amber | tamna | 7.75:1 | 9.62:1 | 13.72:1 | 8.81:1 |
| orange | svjetla | 5.18:1 | 5.18:1 | 7.31:1 | 10.53:1 |
| orange | tamna | 5.58:1 | 6.45:1 | 10.72:1 | 10.79:1 |

⚠ jedina vrijednost ispod AA je **postojeća** indigo paleta u tamnom modu (`text-primary` = 4.00:1) — baseline iz Faze 0,
ne regresija; nove palete su strože. Najniža od novih je **amber u svijetlom modu (4.92:1)** — žuta rampa pada
ispod 4.5:1 već od 600 stepena, zato je 700 najsvjetliji korak koji može biti svijetla `--primary`.

**Dva pravila koja se lako pogrešno „poprave":**

- `::selection` se crta kao alpha blend **preko podloge**, pa `--selection-fg` mora biti **taman u svijetlim paletama,
  a svijetao u tamnim** — nikad ista vrijednost za obje (pogrešna prva verzija je dala 1.65:1).
- `--primary-foreground` prati primarnu boju, ne svjetlinu teme (u tamnoj teal paleti je **tamno na svijetlom**).

## Tokeni (RGB kanali)

| Token | classic | pulse (light) | pulse + `.dark` | Upotreba |
|---|---|---|---|---|
| `--background` | 11 18 32 | 245 246 248 | 13 14 18 | canvas |
| `--surface` | 17 24 39 | 255 255 255 | 20 22 28 | kartice, sidebar, topbar |
| `--elevated` | 27 36 54 | 248 249 251 | 26 29 36 | sekundarne plohe, tintovi |
| `--popover` | 27 36 54 | 255 255 255 | 30 33 41 | dropdown, tooltip, toast |
| `--surface-hover` | 27 36 54 | 243 244 247 | 30 34 42 | hover redova, stavki menija |
| `--border` | 36 48 68 | 228 230 235 | 38 42 52 | obrubi |
| `--line-strong` | 49 64 92 | 209 213 221 | 58 63 76 | hover obrub |
| `--foreground` | 229 231 235 | 20 22 29 | 233 235 241 | primarni tekst |
| `--muted` | 156 163 175 | 106 113 128 | 127 135 152 | sekundarni tekst |
| `--primary` | 37 99 235 | 91 91 214 | 111 102 223 | CTA, aktivna nav |
| `--primary-hover` | 29 79 216 | 74 74 196 | 124 115 228 | hover CTA |
| `--primary-active` | 27 68 190 | 63 63 176 | 138 129 233 | active CTA |
| `--link` | 127 168 245 | 79 79 199 | 154 147 236 | **tekst na primary tintu**, linkovi, ID-evi |
| `--accent` | 34 197 94 | 15 118 110 | 45 212 191 | rijedak highlight (nije success) |
| `--ok` | 74 222 128 | 21 128 61 | 74 222 128 | tekst pozitivnog stanja |
| `--success` | 22 163 74 | 21 128 61 | 34 197 94 | fill/tint pozitivnog stanja |
| `--warning` | 245 158 11 | 180 83 9 | 251 191 36 | čeka se, SLA rizik |
| `--danger` | 239 68 68 | 220 38 38 | 248 113 113 | greške, Kritičan, breach |
| `--info` | 56 189 248 | 3 105 161 | 56 189 248 | na čekanju, održavanje |
| `--hold` | 192 132 252 | 126 34 206 | 192 132 252 | odobrenja, povjerljivo |
| `--scrim` | 0 0 0 | 15 18 25 | 0 0 0 | overlay iza modala/drawera |

Svaki semantički token kao **tekst** je ≥ 4.5:1 na svojoj površini u sva tri bloka.

## Geometrija i elevacija (tokeni po temi)

| Token | classic | pulse | Napomena |
|---|---|---|---|
| `--radius-sm` | 4px | 6px | chip, kbd |
| `--radius-md` | 6px | 8px | dugmad, inputi, tabovi |
| `--radius-lg` | 8px | 12px | kartice, paneli, dropdowni |
| `--shadow-card` | `none` | 1px hairline lift | kartice |
| `--shadow-pop` | `0 20px 25px -5px` + `0 8px 10px -6px`, crna 40% | mekša, 18%/8% | plutajući slojevi |
| `--shadow-glow` | `none` | primary halo | aktivni korak čarobnjaka, primarni CTA |

Zato `rounded-lg` i `shadow-card` u komponentama **automatski** prate temu — nema grananja po ekranima.

## Avatar paleta

`--avatar-{1..6}-bg` / `--avatar-{1..6}-fg`, po temi. classic zadržava originalne hex vrijednosti.
Kod: `frontend/src/components/ui/avatar.tsx`.

## Checklist za novu boju

1. Dodaj varijablu u **sva tri** bloka u `index.css` (inače je u jednoj temi nedefinisana).
2. Dodaj mapiranje u `tailwind.config.ts` kao `rgb(var(--x) / <alpha-value>)`.
3. Provjeri kontrast ≥ 4.5:1 kao tekst na `surface` u sva tri bloka.
4. Ako je status: dodaj u `frontend/src/lib/theme/semantic-meta.ts`, ne u komponentu.
5. Nikad `#RRGGBB` u `.tsx` (jedini izuzetak su `.accent-swatch-*` preview uzorci u `index.css`).
6. **Ako je brend boja** (a ne neutralna/semantička): dodaj je u paletne blokove (§ Brend palete), ne u bazni blok.

Živa referenca: **Visual QA → Primitive-i → Theme** (`frontend/src/components/visual-qa/visual-qa-theme-board.tsx`)
prikazuje sve tokene, tonove i nove primitive u aktivnoj temi. Za izbor izgleda i živi pregled: **`/appearance`**.

Provjera prije commita: `npx tsc -b`, `npx vitest run`, `npx vite build`, te klasa-proba kroz generisani CSS
(klasa koja ne postoji u CSS-u je mrtva klasa čak i kad izgleda ispravno u kodu).

Automatska provjera pravila iz ovog dokumenta (radi iz korijena repoa, bez instalacije):

```bash
node scripts/check-pulse-design-system.mjs
```

Provjerava: da je `theme-source.md` arhiviran i da se nigdje ne citira kao izvor; da nema hardkodiranih boja
(hex, Tailwind default paleta, `rgb()` bez tokena); da sva tri token bloka i svi paletni blokovi imaju isti skup
varijabli i da svaka paleta iz koda ima CSS blok + i18n ključeve; da nema `rounded-xl`; da `bs`/`en` parity i svi
statički `t()` ključevi razrješavaju; da pre-paint skripta čita iste storage ključeve kao `theme-storage.ts`.
Vrti se i u CI-ju (`.github/workflows/ci.yml`, frontend job).

---

# classic — naslijeđeni katalog

> Sve tabele ispod opisuju **stari** sistem i vrijede za `data-theme="classic"`.
> Vrijednosti su i dalje tačne (classic je zamrznut), ali se ne koriste za nove ekrane.

---

## Neutral surfaces (80–90% UI)

| Token | Hex | CSS var | Upotreba |
|---|---|---|---|
| `background` | `#0B1220` | `--color-background` | podloga, inputi, kod |
| `surface` | `#111827` | `--color-surface` | kartice, sidebar, topbar, tabele |
| `elevated` | `#1B2436` | `--color-elevated` | hover, dropdown, aktivni nav, tooltip |
| `border` | `#243044` | `--color-border` | obrubi, razdjelnici, scrollbar |
| `text` | `#E5E7EB` | `--color-text` | primarni tekst |
| `muted` | `#9CA3AF` | `--color-muted` | sekundarni tekst, meta, placeholder |

Border-hijerarhija: puni `border` → `border/70` → `border/50` → `border/40`.

## Brand + semantic (10–20%)

| Token | Hex | CSS var | Dozvoljena upotreba |
|---|---|---|---|
| `primary` | `#2563EB` | `--color-primary` | CTA, aktivna nav, fokus, selekcija, "u radu" |
| `primary-foreground` | `#FFFFFF` | `--color-primary-foreground` | tekst na primary fill |
| `accent` | `#22C55E` | `--color-accent` | **rijedak** highlight (npr. policy pack). Nije success. |
| `success` | `#16A34A` | `--color-success` | uspjeh, riješen, SLA u okviru, EXACT |
| `warning` | `#F59E0B` | `--color-warning` | čeka se, SLA rizik, pauza, zastarjelo |
| `danger` | `#EF4444` | `--color-danger` | greške, destructive, Kritičan, SLA breach, UNROUTED |
| `info` | `#38BDF8` | `--color-info` | na čekanju, održavanje, PARENT_FALLBACK |

Boja nije dekoracija. Crvena samo kad korisnik mora reagovati.

## Kontrast na dark + interakcijski hex

Semantičke boje kao *tekst* na tint pozadini: svjetlije varijante, ne puna saturacija.

| Namjena | Hex | Tailwind u referenci |
|---|---|---|
| primary tekst / link / ID | `#7FA8F5` | `text-[#7FA8F5]` |
| success tekst | `#4ADE80` | `text-[#4ADE80]` |
| warning / danger / info tekst | puni token | `text-warning` / `text-danger` / `text-info` |
| primary hover | `#1D4FD8` | `hover:bg-[#1D4FD8]` |
| primary active | `#1B44BE` | `active:bg-[#1B44BE]` |
| hover border | `#31405C` | `hover:border-[#31405C]` |
| chart 2. serija (neutral) | `#3B4A6B` | `bg-[#3B4A6B]` |
| selection | `rgba(37, 99, 235, 0.35)` | `::selection` u `index.css` |
| focus ring | `rgba(37, 99, 235, 0.7)` | `outline 2px primary/70`, radius 4px |

## Tint formule (badge / chip)

Semantički badge = **boja/8–15% bg + boja/25–40% border + svijetli tekst**. Uvijek s tekstom (boja sama nikad ne nosi značenje). Radius 6px, `px-1.5`, 11px medium, opciona tačka 6px.

Živi primjeri: [`referenca-dizajn/src/components/ui.tsx`](../../referenca-dizajn/src/components/ui.tsx) (`BADGE_TONES`).

| Tone | Klasa |
|---|---|
| neutral | `bg-elevated/70 text-muted border-border` |
| primary | `bg-primary/15 text-[#7FA8F5] border-primary/35` |
| accent | `bg-accent/10 text-accent border-accent/30` |
| success | `bg-success/10 text-[#4ADE80] border-success/30` |
| warning | `bg-warning/10 text-warning border-warning/30` |
| danger | `bg-danger/10 text-danger border-danger/35` |
| info | `bg-info/10 text-info border-info/30` |

## Avatar paleta (6 fiksnih, hash od imena)

Krug, max 2 inicijala. xs 20px / sm 26px / md 32px. Kod: `AVATAR_HUES` u `referenca-dizajn/src/components/ui.tsx` (arhivirano) i `frontend/src/components/ui/avatar.tsx`.

| Bg | Tekst |
|---|---|
| `#22355C` | `#9DBCF5` |
| `#1D3A34` | `#8AD8C2` |
| `#3A2D1D` | `#E4BE8A` |
| `#2D2A4A` | `#B6ADF0` |
| `#3A2430` | `#E8A7BC` |
| `#26383E` | `#93D3E4` |

---

## Typography

Porodica: **Inter** (`--font-sans: "Inter", ui-sans-serif, …`). Težine 400 / 450 / 500 / 600. Body default 14px u `index.css`; skala u UI-ju stroža.

| Sloj | Veličina | Težina | Primjer |
|---|---|---|---|
| Meta / label gore | 10–11.5px | 500–600, uppercase, tracking 0.07–0.12em | kolone, sekcijski naslovi |
| Metadata | 11–12.5px | 400–500 | vrijeme, DN, badge opis |
| Body | 12.5–14px | 400–450 | tiket, poruke |
| Sekcijski naslov | 13.5–14px | 600 | naslov kartice |
| Page title | 19–20px | 600, tracking -0.01em | **jedan** po stranici |
| Velike metrike | 24–26px | 600, `tabular-nums` | KPI, donut centar |

Max 26px — nema landing veličina. Line-height: naslovi 1.2–1.35, čitanje 1.5–1.6.

Numerika (`ID`, tajmeri, %, iznosi): klasa `.tnum` → `font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1`. Ticket ID uvijek `#7FA8F5` + underline na hover.

Ikone: Lucide, stroke **1.8–2**. Nav ikona 15.5px / 1.9.

---

## Geometry

| Element | Radius | Token |
|---|---|---|
| Badge, checkbox, mali chip | 5–6px | `rounded-md` |
| Dugmad, inputi, select, tabovi | 6px | `--radius-md` |
| Kartice, paneli, dropdowni, tooltipi | 8px | `--radius-lg` |
| Krugovi | samo avatar, status tačka, donut, toggle thumb | — |

Zabranjeno: pill dugmad, kartice 20–30px, bubble chat s ekstremnim radiusom.

**Elevacija kroz border, ne sjenu.** Sjena `shadow-xl shadow-black/40` samo na plutajućim slojevima (dropdown, tooltip, overlay, notif panel). Hover na karticama: border `#31405C` + eventualno `elevated/30`.

Spacing: Tailwind skala. Dense but breathable. Kartice 12–16px razmak. Sadržaj `max-w-[1400px]`, px 16/32, py 24.

---

## Motion

Kriva: `cubic-bezier(0.22, 0.68, 0.36, 1)`. Klase u [`index.css`](../../referenca-dizajn/src/index.css).

| Token | Trajanje | Klasa |
|---|---|---|
| hover/focus boja | 150ms | `duration-150` |
| dropdown `pop-in` | 160ms | `.pop-in` |
| fade | 180ms | `.fade-in` |
| ulaz stranice `page-in` (translateY 6px) | 240ms | `.page-in` |
| stubići grafa | 500ms | `.bar-grow` |
| donut ring | 700ms | `.draw-ring` |
| status pulse (samo "sve živo") | 2.4s | `.dot-pulse` |

Stagger 28ms **samo** na graf stubićima. Zabranjeno: parallax, scroll-jack, treperavi full-screen skeleton, konfeti, bouncy easing. Upozorenja ne pulsiraju.

---

## App shell (mjere)

Živo: [`frontend/src/components/layout/application-shell.tsx`](../../frontend/src/layouts/application-shell.tsx) · prototip: [`demo/`](../../demo/).

| Dio | Mjera |
|---|---|
| Sidebar | 248px, `surface`, desni border |
| Brand / topbar | h-14 (56px) |
| Nav item | h-8.5, label 13px; aktivan = `bg-elevated` + lijeva crtica 2.5px primary + ikona `#7FA8F5` |
| Sekcijski naslov nav | 10px uppercase tracking 0.12em muted/60 |
| Primarni CTA | jedino puno `primary` dugme u chrome-u ("Novi tiket", prečica `N`) |
| Topbar pretraga | max-w-md, `background` input, ⌘K |
| Notif panel | 380px, `elevated` + sjena |
| Page header | breadcrumb 11.5px muted · title 19px · subtitle 12.5px muted |

Nav sekcije: Pregled · Tiketi · Usluge i znanje · Administracija. Rute: [`referenca-dizajn/src/nav.ts`](../../referenca-dizajn/src/nav.ts).

---

## Komponente (tokeni)

Pravila i anti-obrasci: [Constitution](../../docs/design/Master%20UI-UX%20Design%20Constitution.md) §26. Implementacija: `frontend/src/components/ui/`.

**Dugmad** — radius 6px; `xs` h-6.5 · `sm` h-8 · `md` h-9; ikona 12–15px, gap 6px; disabled opacity 45%.

| Varijanta | Površina |
|---|---|
| `primary` | fill, hover `#1D4FD8`, active `#1B44BE` |
| `outline` | surface + border, hover elevated + `#31405C` |
| `subtle` | elevated/60 + border/70 |
| `ghost` | bez okvira, hover elevated |
| `danger` | danger/10 + border danger/40 (uvijek s potvrdom) |

**Forme** — input/select h-9, textarea min-h ~90px; `bg-background/60`; hover `#31405C`; fokus primary. Label 12.5px medium; obavezno = crvena `*`; hint 11.5px muted.

**Tabela** — header 10.5px uppercase tracking 0.08em muted/70; red ~44px, min 36px; `divide-y divide-border/50`; hover `bg-elevated/40`; ID `#7FA8F5` + tnum.

**Tabovi** — 12.5px; aktivni = donja crtica primary 2px.

**Toggle** — h-5 w-9, thumb 14px; on = primary; off = elevated/border.

**KPI** — label 11.5px uppercase muted → 24px tnum → delta (boja samo ako nosi odluku).

**Grafovi** — [`charts.tsx`](../../referenca-dizajn/src/components/charts.tsx): donut thickness ~15, track `#1B2436`; stubići primary + `#3B4A6B`, top radius 3px. Nema 3D / gridova.

**Empty state** — rounded-lg border elevated ikona + naslov 13px + objašnjenje 12px + akcija. Nikad samo "Nema podataka".

---

## Semantička mapa (status → tone)

Kod: [`frontend/src/lib/theme/semantic-meta.ts`](../../frontend/src/lib/theme/semantic-meta.ts) (`STATUS_META`, `PRIORITY_META`, …). Labele iz RAW / domain modela — ovdje samo vizuelni ton.

| Domen | Mapiranje |
|---|---|
| Status tiketa | Na čekanju=info · Dodijeljen/U obradi=primary · Čeka korisnika=warning · Riješen=success · Zatvoren=neutral |
| Prioritet | Nizak=neutral · Srednji=info · Visok=warning · **Kritičan=danger** (+ Flame u inboxu). Nikad ručni odabir. |
| SLA | U okviru=success · Pod rizikom 75%=warning · **Prekoračen=danger** · Pauziran=warning |
| Routing | EXACT=success ("E") · PARENT_FALLBACK=info ("N") · **UNROUTED=danger** ("×") — rupa vidljiva |
| Katalog lifecycle | Nacrt=neutral · Aktivan=success · Zastarjelo=warning |
| Availability | Dostupno=success · Otežan rad=warning · Održavanje=info |
| Chat | svoj javni=primary tint · tuđi=surface · interna=warning tint + lock · sistem=italic muted, bez balona |
| Audit ikone | status/assign=primary · sla=warning · routing=info · approval=success · security=danger · edit=neutral |
| Change log diff | prije=danger + line-through · poslije=success |

---

## Referenca — ekrani (linkovi)

Svaki ekran koristi `.page-in` + `max-w-[1400px] px-4 py-6 lg:px-8`.

| Ekran | Fajl | Šta dokazuje |
|---|---|---|
| Shell | [`src/components/Shell.tsx`](../../referenca-dizajn/src/components/Shell.tsx) | sidebar 248px, CTA, nav crtica, ⌘K, zvonce 380px, user card |
| UI primitives | [`src/components/ui.tsx`](../../referenca-dizajn/src/components/ui.tsx) | Badge, Button, Card, Avatar, Field, Tabs, Toggle, StatCard, EmptyState |
| Grafovi | [`src/components/charts.tsx`](../../referenca-dizajn/src/components/charts.tsx) | donut, stubići, trake |
| Nadzorna ploča | [`src/pages/Dashboard.tsx`](../../referenca-dizajn/src/pages/Dashboard.tsx) | KPI, donut statusa, queue load |
| Tiketi | [`src/pages/Tickets.tsx`](../../referenca-dizajn/src/pages/Tickets.tsx) | tabela, filteri, bulk traka (bez bulk close) |
| Detalj tiketa | [`src/pages/TicketDetail.tsx`](../../referenca-dizajn/src/pages/TicketDetail.tsx) | SLA tajmeri, chat tints, approvals, audit |
| Novi tiket | [`src/pages/NewTicket.tsx`](../../referenca-dizajn/src/pages/NewTicket.tsx) | wizard + **KB intercept** (obavezan korak) |
| Grupni inbox | [`src/pages/Inbox.tsx`](../../referenca-dizajn/src/pages/Inbox.tsx) | preuzimanje, UNROUTED banner, auto-assign badge |
| Katalog | [`src/pages/Catalog.tsx`](../../referenca-dizajn/src/pages/Catalog.tsx) | lifecycle / availability tints, onboarding stepper |
| Baza znanja | [`src/pages/Knowledge.tsx`](../../referenca-dizajn/src/pages/Knowledge.tsx) | kartice, helpful %, feedback |
| Usmjeravanje | [`src/pages/Routing.tsx`](../../referenca-dizajn/src/pages/Routing.tsx) | coverage matrica E/N/×, change log diff |
| SLA | [`src/pages/Sla.tsx`](../../referenca-dizajn/src/pages/Sla.tsx) | profili, kalendar, timer vizual |
| Admin | [`src/pages/Admin.tsx`](../../referenca-dizajn/src/pages/Admin.tsx) | OU tree, policy packs, addons, audit export |
| Izvještaji | [`src/pages/Reports.tsx`](../../referenca-dizajn/src/pages/Reports.tsx) | bottleneck trake, serija `#3B4A6B` |
| Token CSS | [`src/index.css`](../../referenca-dizajn/src/index.css) | `@theme`, focus, scrollbar, animacije, `.tnum` |
| Domena/tone | [`src/lib/core.ts`](../../referenca-dizajn/src/lib/core.ts) | meta mape + priority matrica |
| Rute | [`src/nav.ts`](../../referenca-dizajn/src/nav.ts) | shell rute |

UX obrasci (wizard, inbox, SLA panel, bulk, matrica, change log, notif, pretraga): [Constitution](../../docs/design/Master%20UI-UX%20Design%20Constitution.md).

---

## Tailwind `@theme` (kopija za frontend)

Implementiraj identično u `frontend` kao u referenci:

```css
@theme {
  --color-background: #0b1220;
  --color-surface: #111827;
  --color-elevated: #1b2436;
  --color-border: #243044;
  --color-text: #e5e7eb;
  --color-muted: #9ca3af;
  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;
  --color-accent: #22c55e;
  --color-success: #16a34a;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #38bdf8;
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

Nema dodatnih brand boja. Gradijent je samo `.pulse-gradient` (brend pano prijave/instalacije). Checklist prije merge-a: § Checklist za novu boju (gore) + Constitution §40.
