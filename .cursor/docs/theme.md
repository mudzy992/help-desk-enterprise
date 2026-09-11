# Theme — EP-HelpDesk tokeni

Ovaj fajl je **implementacijski katalog tokena** (hex, Tailwind `@theme`, geometrija, kretanje). Nije samostalni dizajn-sistem.

## Izvori (hijerarhija)

1. **Tematika (mjerodavno):** [`.cursor/docs/theme-source.md`](theme-source.md) — paleta, kontrast, tipografija, geometrija, semantička mapa, motion, anti-obrasci.
2. **UX / interakcija:** [`Master UI-UX Design Constitution.md`](../../Master%20UI-UX%20Design%20Constitution.md) — north star, layout po ekranu, obrasci, a11y, jezik.
3. **Živa referenca:** [`referenca-dizajn/`](../../referenca-dizajn/) — kanonska vizuelna implementacija tokena.

Ako token ovdje i `theme-source.md` nisu usklađeni, **pobjeđuje `theme-source.md`**. Ako UX i Constitution nisu usklađeni, **pobjeđuje Constitution**. Referenca je dokaz kako tokeni izgledaju u UI-ju.

App shape: **multipage application shell** (nije one-page). Dark-first: `background → surface → elevated`. Ne invertovati light temu.

CSS varijable: [`referenca-dizajn/src/index.css`](../../referenca-dizajn/src/index.css) (`@theme`). Font load: [`referenca-dizajn/index.html`](../../referenca-dizajn/index.html).

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

Izvor: [theme-source §2.1](theme-source.md). Border-hijerarhija: puni `border` → `border/70` → `border/50` → `border/40`.

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

Izvor: [theme-source §2.2](theme-source.md). Boja nije dekoracija. Crvena samo kad korisnik mora reagovati.

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

Krug, max 2 inicijala. xs 20px / sm 26px / md 32px. Izvor: [theme-source §6.11](theme-source.md) · kod: `AVATAR_HUES` u `ui.tsx`.

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

Porodica: **Inter** (`--font-sans: "Inter", ui-sans-serif, …`). Težine 400 / 450 / 500 / 600. Body default 14px u `index.css`; skala u UI-ju stroža (theme-source §3).

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

Izvor: [theme-source §5](theme-source.md) · živo: [`referenca-dizajn/src/components/Shell.tsx`](../../referenca-dizajn/src/components/Shell.tsx).

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

Pravila i anti-obrasci: [theme-source §6](theme-source.md), [Constitution](../../Master%20UI-UX%20Design%20Constitution.md). Implementacija: [`ui.tsx`](../../referenca-dizajn/src/components/ui.tsx).

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

Izvor: [theme-source §7](theme-source.md) · kod: [`referenca-dizajn/src/lib/core.ts`](../../referenca-dizajn/src/lib/core.ts) (`STATUS_META`, `PRIORITY_META`, …). Labele iz RAW / domain modela — ovdje samo vizuelni ton.

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

UX obrasci (wizard, inbox, SLA panel, bulk, matrica, change log, notif, pretraga): [theme-source §8](theme-source.md) + Constitution.

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

Nema dodatnih brand boja. Nema gradijenata. Checklist prije merge-a: [theme-source §13](theme-source.md).
