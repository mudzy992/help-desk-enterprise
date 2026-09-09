# Theme

Source of truth za vizuelni jezik: `Master UI-UX Design Constitution.md`.
Ovaj fajl drži **tokene**. Ako token i Constitution nisu usklađeni, Constitution pobjedi u upotrebi.

App shape: **multipage application shell** (nije one-page).

## Neutral surfaces (80–90% UI)

- background: `#0B1220`
- surface: `#111827`
- elevated: `#1B2436`
- border: `#243044`
- text: `#E5E7EB`
- text-muted: `#9CA3AF`

## Brand + semantic (10–20%)

- primary: `#2563EB` — CTA, active nav, focus, selected
- accent: `#22C55E` — rijedak highlight (nije success, nije status za sve)
- success: `#16A34A`
- warning: `#F59E0B`
- danger: `#EF4444` — greške, destructive, Critical priority
- info: `#38BDF8`

Ne koristiti boju radi dekoracije. Crvena samo kad korisnik mora reagovati.

## Typography

- Family: Inter
- metadata: 12–14px
- body: 14–16px
- section headings: 16–20px
- Veće veličine samo za page title / stvarno važan metric

## Geometry

- radius: 8px default (raspon 6–10px). Bez 20–30px kartica i pill buttona.
- shadow: minimal, samo elevation. Preferirati border + surface contrast.
- spacing: sistemska skala (Tailwind). Dense but breathable.

## Dark mode

Ovo je default enterprise dark hijerarhija (background → surface → elevated). Ne invertovati light temu.
