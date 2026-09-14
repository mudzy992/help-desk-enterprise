# EP-HelpDesk — Implementacioni promptovi po FE tasku

Generisano na osnovu `.cursor/docs/frontend-reference-alignment-plan.md` (status u planu: PLAN VALIDATED, implementacija još nije krenula).

## Kako koristiti ovaj dokument

1. Za **svaki task otvori NOVU agent sesiju** (novi chat) — ne nastavljaj stari razgovor, jer stari kontekst poskupljuje svaki naredni zahtjev.
2. Kopiraj **cijeli sadržaj code bloka** ispod odgovarajućeg taska i zalijepi ga kao prvu poruku.
3. Pregledaj plan koji agent predloži, potvrdi, tek onda reci "Go" / "Kreni".
4. Kad agent završi, TI ručno:
   - provjeriš rezultat u browseru (desktop 1440×900 + mobile 390×844) prema §13 metodologiji iz plana,
   - označiš `[x]` na odgovarajućem tasku u `frontend-reference-alignment-plan.md`,
   - napraviš git commit.
5. Tek onda pređi na sljedeći task iz niza ispod. **Ne preskači redoslijed** — dependency-ji su navedeni u svakom promptu.

## Redoslijed izvođenja (identičan §15 plana)

```
FE-0.1 → FE-0.2 → FE-0.3 → FE-0.4 → FE-0.5 → FE-0.6
→ FE-1.1 → FE-1.2 → FE-1.3 → FE-1.4 → FE-1.5
→ FE-2.1 → FE-2.2 → FE-2.3 → FE-2.4
→ FE-3.1 → FE-3.2 → FE-3.4 → FE-3.5 → FE-3.3 (samo ako je blocker B1 riješen)
→ FE-4.1 → FE-4.2 → FE-4.3
→ FE-5.1 → FE-5.2 → FE-5.3 → FE-5.4 → FE-5.5
→ FE-6.1 → FE-6.2 → FE-6.3
→ FE-7.1 → FE-7.2 → FE-7.3
→ FE-8.1 → FE-8.2 → FE-8.3
→ FE-9.1 → FE-9.2 → FE-9.3 → FE-9.4
```

Napomena: FE-2.4 (link ka Izvještajima) ostaje sakriven/isključen dok FE-4.1 ne doda rutu `/reports`.

## Model / trošak (preporuka iz README-a repozitorija)

- **Auto mode** (bez trošenja kredita) → za FE-0.x, FE-1.x, FE-5.4/5.5, FE-8.x, FE-9.x, i sve "vizuelni polish bez nove logike" taskove.
- **Ručno biran frontier model** → za taskove gdje greška najviše boli: **FE-3.3** (SLA panel, gated B1), **FE-3.4** (Ticket Detail delta — rizik od slučajnog rewrite-a), **FE-6.2** (routing rules/tester), **FE-7.1** (realtime invalidation), i sve taskove koji diraju auth/permission (FE-9.2).

## Blocker B1 — poseban slučaj

Task **FE-3.3** zavisi o blockeru B1 (backend mora izložiti SLA snapshot polja na `TicketResponse`). Ako B1 nije riješen, task FE-3.3 se PRESKAČE (ostaje otvoren) i nastavlja se sa FE-4.1. Prompt za FE-3.3 sadrži eksplicitnu instrukciju agentu da provjeri ovo prvo i stane ako blocker nije riješen.

---

## FE-0.1 — Semantic meta + token usage baseline

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.1 (Semantic meta + token usage baseline) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `referenca-dizajn/src/lib/core.ts`
3. Pročitaj trenutne fajlove koje mijenjaš: `ticket-badges.tsx`, `routing-coverage-table.tsx`, `service-catalog-table.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): none. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Jedna semantička mapa i dogovoreni token aliasi.

Scope (radi SAMO ovo, ništa više):
Novi `frontend/src/lib/theme/semantic-meta.ts`; mapirati domain statuse uključujući `UNROUTED`/`PENDING_APPROVAL`/`ARCHIVED`; `OPERATIONAL` → success "Dostupno".

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Postojeći i18n label keyevi; ne mijenjati backend enum.

Acceptance criteria:
Badge komponente čitaju mapu; nema novih hexova van `theme.md`.

Vizuelni zahtjevi (Visual):
Identični BADGE_TONES kao `ui.tsx`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run test` + `npm run build` u `frontend/`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-0.2 — CSS motion + chart keyframes

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.2 (CSS motion + chart keyframes) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `referenca-dizajn/src/index.css`
3. Pročitaj trenutne fajlove koje mijenjaš: `frontend/src/index.css`
4. Dependency (mora već biti gotovo prije ovog taska): none. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Kanonske animacije dostupne globalno.

Scope (radi SAMO ovo, ništa više):
`frontend/src/index.css` — dodati `.bar-grow`, `.draw-ring`; `prefers-reduced-motion` već pokriva imenovane klase — proširiti i na nove.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Postojeći `page-in` / `pop-in` / `dot-pulse`.

Acceptance criteria:
Klase postoje; reduced-motion gasi i nove.

Vizuelni zahtjevi (Visual):
Krivulja `cubic-bezier(0.22, 0.68, 0.36, 1)`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-0.3 — Form primitives (Field, Input, Select, Textarea)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.3 (Form primitives (Field, Input, Select, Textarea)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `referenca-dizajn/src/components/ui.tsx` (Field/Input/Select/Textarea)
3. Pročitaj trenutne fajlove koje mijenjaš: `frontend/src/components/ui/control.ts`
4. Dependency (mora već biti gotovo prije ovog taska): none. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Shared forme umjesto ad-hoc className copy-paste.

Scope (radi SAMO ovo, ništa više):
Komponente koje koriste postojeći `control.ts`; migrirati 1–2 call site-a kao dokaz (npr. routing create), ostalo po modulima kasnije (u njihovim vlastitim taskovima, ne ovdje).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
`controlClassName` export mora ostati (kompatibilnost sa postojećim pozivima).

Acceptance criteria:
h-9, `bg-background/60`, hover `#31405C`, required `*`.

Vizuelni zahtjevi (Visual):
Label 12.5px, hint 11.5px.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build` + postojeći form testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-0.4 — Progress + MetaBadge + StatCard delta + Button aliases

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.4 (Progress + MetaBadge + StatCard delta + Button aliases) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `ui.tsx` (Progress, MetaBadge, StatCard, Button)
3. Pročitaj trenutne fajlove koje mijenjaš: `badge.tsx`, `stat-card.tsx`, `button.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Nedostajući primitive-i i imena varijanti.

Scope (radi SAMO ovo, ništa više):
`progress.tsx` (novi), `MetaBadge` u `badge.tsx`; `StatCard` dodati `delta`/`deltaTone`; `button.tsx` dodati `primary`/`danger`/`subtle` kao alias.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Postojeći `default`/`destructive`/`secondary` moraju ostati (ne smiju se pokvariti postojeći pozivi).

Acceptance criteria:
Alias radi; Progress h-1.5.

Vizuelni zahtjevi (Visual):
StatCard 24px tabular-nums; delta boja samo kad nosi odluku (nije dekorativna).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-0.5 — Charts primitives (Donut, GroupedBars, HBars)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.5 (Charts primitives (Donut, GroupedBars, HBars)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.5 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `referenca-dizajn/src/components/charts.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: nema (ne postoji)
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.2. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Donut, GroupedBars, HBars kao shared komponente.

Scope (radi SAMO ovo, ništa više):
Novi modul(i), ≤200 linija po fajlu (split ako treba) — npr. `frontend/src/components/ui/charts.tsx` ili `components/charts/`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
n/a — novi fajlovi.

Acceptance criteria:
Hover dim efekat, tabular-nums, druga serija boje `#3B4A6B`, track `#1B2436`.

Vizuelni zahtjevi (Visual):
Thickness ~15, bar top radius 3px, stagger 28ms animacija.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build`; vizuelni smoke test na dashboardu radi se tek u FE-2, ne ovdje.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-0.6 — Reference Visual QA Baseline

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-0.6 (Reference Visual QA Baseline) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-0.6 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Live `referenca-dizajn` (`Shell.tsx`, `ui.tsx`); `.cursor/docs/theme.md`; `.cursor/docs/theme-source.md` §13.
3. Pročitaj trenutne fajlove koje mijenjaš: Live `frontend` (`application-shell`, `components/ui/*`).
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1, FE-0.2, FE-0.3, FE-0.4, FE-0.5. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Učiniti visual parity dokazivom i ponovljivom. Ovaj task NE implementira nikakav modul — zaključava vizuelni QA protokol iz §13 plana i prvi put ga izvršava na primitive-ima + trenutnom shell chrome-u.

Scope (radi SAMO ovo, ništa više):
- Pokrenuti OBA UI-ja u browseru (ne uspoređivati samo source/JSX/CSS/tokene):
  - current: `frontend` (Vite, port 5173)
  - reference: `referenca-dizajn` na DRUGOM portu, npr. `npm run dev -- --port 5174`
- Referenca nema URL rute (`App.tsx` + `nav.ts` in-memory) — navigacija je klikom u `Shell`.
- Viewports: desktop 1440×900 i mobile 390×844 (DevTools). Desktop je primarni workspace, mobile mora ostati funkcionalan.
- Screenshot side-by-side (OS/DevTools capture). NE uvoditi Playwright/Chromatic/Percy/Storybook — u repou ih nema i ne smiju se dodavati radi ovog plana. Radni snimci nisu git artefakt.
- Prvi pass pokriva: Button aliases, Badge/MetaBadge, Card, Field/Input/Select/Textarea, Progress, StatCard, Tabs, EmptyState, plus shell chrome (sidebar 248 / overlay 270, topbar h-14, search, bell). Charts rendered smoke NIJE ovdje — to je gate FE-2.2.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne pravi novi design system; popravljaj SAMO ako primitive iz FE-0.1–0.5 vizuelno padne na testu.

Acceptance criteria:
Agent vidi istovremeno reference rendered page i current rendered page. Protokol §13 je izvršiv (portovi, viewports, screenshot pair, mapping tabela). Primitive-i prolaze §13.4 kriterije na desktop + mobile (nema novog hex/radius/shadow). Module gateovi iz §13.5 ostaju otvoreni — nisu dio ovog taska.

Vizuelni zahtjevi (Visual):
§13.4 (layout, tipografija, spacing, tokeni, radius, hover/focus).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovaj task je preduslov za SVE naredne vizuelne gateove (§13.5) u planu.

Verifikacija (prije nego kažeš da je task gotov):
Browser rendered comparison + screenshot pair za shell/primitive-e. `npm run build` u `frontend/`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-1.1 — Navigation IA

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-1.1 (Navigation IA) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-1.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Shell.tsx` NAV_SECTIONS, `nav.ts`
3. Pročitaj trenutne fajlove koje mijenjaš: `navigation.ts`
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Reference sekcije i itemi bez gubitka postojećih ruta.

Scope (radi SAMO ovo, ništa više):
`lib/navigation.ts`, `app-sidebar.tsx`, i18n `navigation.*`.
- Dodati Grupni inbox → `/tickets?view=inbox`.
- Label "Katalog usluga" vizuelno / i18n za `/services` (interni ključ ostaje `services`).
- Zadržati Users/OU/Settings kao zasebne stavke dok ih FE-9 ne spoji u Admin.
- Izvještaji (`/reports`) NE dodavati u ovom tasku — nav item Izvještaji ide u FE-4.1 zajedno sa page-om (ne praviti stub rutu ni disabled item ovdje osim ako je to eksplicitno najjednostavnije rješenje da se ne slomi layout; default: izostaviti do FE-4.1).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Sve postojeće rute moraju raditi; i18n EN fallback ne smije puknuti.

Acceptance criteria:
Inbox je u sidebaru; tickets match uključuje `/tickets/:id`; "end" flagovi (highlight/active) su ispravni.

Vizuelni zahtjevi (Visual):
Sekcijski naslov 10px uppercase, letter-spacing 0.12em.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera navigacije + `npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-1.2 — Sidebar count badges

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-1.2 (Sidebar count badges) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-1.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Shell.tsx` badge na tickets/inbox
3. Pročitaj trenutne fajlove koje mijenjaš: `app-sidebar.tsx` (trenutno nema badge)
4. Dependency (mora već biti gotovo prije ovog taska): FE-1.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Neutralni bedževi za otvorene tikete i inbox+unrouted.

Scope (radi SAMO ovo, ništa više):
Mali hook koji čita postojeći `listTickets` / `listGroupInbox` (cache-friendly, ne spamovati pozive). Badge na tickets/inbox stavkama u sidebaru.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Crveni badge (danger tone) SAMO za unrouted > 0.

Acceptance criteria:
Broj dolazi iz API-ja; 0 se prikazuje konzistentno s referencom (referenca prikazuje broj, ne sakriva ga).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera (signed-in).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-1.3 — Unified header search

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-1.3 (Unified header search) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-1.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Shell search placeholder + Enter→knowledge (mock u referenci). Current već ide na tickets/KB.
3. Pročitaj trenutne fajlove koje mijenjaš: `header-search.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.3 (opcionalno). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Jedna traka pretražuje tikete + KB + korisnike.

Scope (radi SAMO ovo, ništa više):
`header-search.tsx` — na Enter ili u popover listi rezultati iz 3 postojeća izvora; klik vodi na `/tickets/:id`, `/knowledge-base?q=` ili (UNVERIFIED — nema user detail rute) na `/users` sa query parametrom za korisnike.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
⌘K focus ponašanje; i18n placeholder.

Acceptance criteria:
Korisnici se filtriraju iz directory; prazan query ne ruši UI.

Vizuelni zahtjevi (Visual):
Isti input chrome kao referenca.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera za sva tri tipa entiteta (tiket/KB/korisnik).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-1.4 — Notifications panel polish

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-1.4 (Notifications panel polish) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-1.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Shell.tsx` NotificationsPanel
3. Pročitaj trenutne fajlove koje mijenjaš: panel + list + realtime hook
4. Dependency (mora već biti gotovo prije ovog taska): none. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Aktivni filter stil + kind ikone usklađene s referencom.

Scope (radi SAMO ovo, ništa više):
`notifications-panel.tsx`, `notifications-list.tsx`. NE dodavati link "Prikaži historiju" — ta ruta ne postoji u FE i ne smije se izmišljati.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Mark all, unread dot, navigacija na tiket na klik.

Acceptance criteria:
Filter all/unread vizuelno kao referenca (`bg-background` kad je "unread" filter aktivan).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Postojeći `notification-realtime.spec.ts` + manualna provjera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-1.5 — Session menu OU subtitle

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-1.5 (Session menu OU subtitle) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-1.5 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Shell user menu
3. Pročitaj trenutne fajlove koje mijenjaš: `session-controls.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): none. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Topbar user red kao referenca (ime + OU/rola).

Scope (radi SAMO ovo, ništa više):
`session-controls.tsx`; OU čitati iz session/directory AKO postoji polje na session objektu (UNVERIFIED). Ako polje ne postoji, zadržati prikaz rola kao sada.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Login forma, signOut, locale switch, prikaz assigned tickets — sve mora ostati funkcionalno.

Acceptance criteria:
Nema regresije autentikacije.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovo je closing task modula Shell (§13.5 red "Shell.tsx + nav.ts") — provedi vizuelni gate prije nego kažeš da je gotovo.

Verifikacija (prije nego kažeš da je task gotov):
Sign-in/out manualno + postojeći session testovi + §13.5 Shell visual gate (desktop 1440 + mobile 390).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-2.1 — KPI row (operational + reference)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-2.1 (KPI row (operational + reference)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-2.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Dashboard KPI red
3. Pročitaj trenutne fajlove koje mijenjaš: 8 metric kartica (postojeće operativne)
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.4, FE-0.5. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): 4-kolonski StatCard red: otvoreni, kritični, SLA overdue — uz zadržavanje postojećeg inbox/unrouted naglaska.

Scope (radi SAMO ovo, ništa više):
`dashboard-metric-grid.tsx`, `summarize-tickets.ts` (dodati `critical` i `overdue` count).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Linkovi na ticket views; empty/error stanja.

Acceptance criteria:
Brojevi dolaze iz `listTickets`; NEMA fake delte tipa "+3 danas" osim ako se stvarno može izračunati iz `createdAt` (danas). Waiting/Approval/Unrouted linkovi nose postojeći filter query (`status`, `overdue`) umjesto golog `?view=all`.

Vizuelni zahtjevi (Visual):
StatCard hover border `#31405C`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Unit test za `summarize` + `npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-2.2 — Status donut + 14d grouped bars

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-2.2 (Status donut + 14d grouped bars) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-2.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Dashboard Donut + GroupedBars
3. Pročitaj trenutne fajlove koje mijenjaš: nema (ne postoji)
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.5, FE-2.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Reference graf red na dashboardu.

Scope (radi SAMO ovo, ništa više):
Novi `dashboard-charts.tsx`; agregacija iz postojećeg ticket niza (bez novog API poziva).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Recent tickets kartica ostaje netaknuta.

Acceptance criteria:
Prazan niz → EmptyState, NE prazan donut.

Vizuelni zahtjevi (Visual):
Legenda desno, tabular-nums, `.bar-grow` animacija.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera + summarize testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-2.3 — SLA watchlist + inbox snapshot

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-2.3 (SLA watchlist + inbox snapshot) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-2.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Dashboard donji red + `TicketRow` tabela
3. Pročitaj trenutne fajlove koje mijenjaš: Samo recent table postoji trenutno
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.5, FE-2.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Donji red kartica + tabela "Tiketi koji zahtijevaju pažnju".

Scope (radi SAMO ovo, ništa više):
Lista `isOverdue` tiketa (max 5) kao reference SLA nadzor kartica; inbox HBars ako su group labeli dostupni (inače prikazati count listu); tabela pažnje reuse-uje list-table chrome (ID, status, priority, overdue).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
`isOverdue` semantika iz overdue matrice mora ostati ista.

Acceptance criteria:
Klik vodi na ticket detail; recent tabela ostaje ili se spaja sa attention tabelom (ne duplirati iste redove bez razloga).

Vizuelni zahtjevi (Visual):
ID boja `#7FA8F5`, pause chip za waiting/approval statuse.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-2.4 — Dashboard header actions

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-2.4 (Dashboard header actions) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-2.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Dashboard PageHeader
3. Pročitaj trenutne fajlove koje mijenjaš: Trenutno samo dugme Novi tiket
4. Dependency (mora već biti gotovo prije ovog taska): FE-2.1 (link na Izvještaje ostaje sakriven/isključen dok FE-4.1 ne doda rutu — NE dodavati link koji vodi na nepostojeću rutu). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): PageHeader akcije: Izvještaji (enable tek u FE-4) + Novi tiket.

Scope (radi SAMO ovo, ništa više):
`dashboard-page.tsx`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Crumbs/title i18n.

Acceptance criteria:
Loading skeleton ostaje netaknut.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovo je closing task modula Dashboard (§13.5) — provedi vizuelni gate (rendered current vs rendered reference, desktop 1440 + mobile 390, screenshot pair) prije nego kažeš da je gotovo.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build` + §13.5 Dashboard visual gate (rendered `/` vs `Dashboard.tsx`, desktop+mobile).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-3.1 — Tickets list: SLA rizik tab + avatars + ID chrome

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-3.1 (Tickets list: SLA rizik tab + avatars + ID chrome) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-3.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Tickets.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: Status tabs, overdue chip, bulk traka, saved views
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1, FE-0.4. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Lista vizuelno kao `Tickets.tsx`, BEZ CSV exporta.

Scope (radi SAMO ovo, ništa više):
`ticket-list-page.tsx`, `ticket-list-table.tsx`, `ticket-list-filters.tsx`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Bulk akcije BEZ close opcije, saved views, paginacija, confidential ikona. `TicketOverdueBadge` VEĆ postoji na list tabeli — ne diraj tu logiku.

Acceptance criteria:
Tab "SLA rizik" filtrira po `isOverdue`; avatari assignee-a se prikazuju samo kad ime postoji u directory (ako list nema ime, preskoči avatar — ne izmišljaj).

Vizuelni zahtjevi (Visual):
Table head 10.5px uppercase; row hover `elevated/40`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: NE dodavati CSV export — to je eksplicitno isključeno iz scope-a (audit export je Faza 8). Ovo je closing task modula Tickets List — provedi vizuelni gate.

Verifikacija (prije nego kažeš da je task gotov):
`filter-tickets` spec + §13.5 Tickets visual gate (rendered `/tickets` vs `Tickets.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-3.2 — Inbox visual (group tabs)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-3.2 (Inbox visual (group tabs)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-3.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Inbox.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: Flat lista + unrouted banner + claim dugme
4. Dependency (mora već biti gotovo prije ovog taska): FE-1.1, FE-3.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Inbox view vizuelno bliži `Inbox.tsx`.

Scope (radi SAMO ovo, ništa više):
`ticket-inbox-list.tsx`, `ticket-list-page.tsx` kada je `view===inbox`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Claim API, unrouted copy tekst, Flame ikona na CRITICAL prioritetu.

Acceptance criteria:
UNROUTED NIJE group inbox (bitno pravilo iz domain matrica) — neusmjereni red je zaseban tab/banner iz `listTickets` gdje `status===UNROUTED`; `listGroupInbox` ostaje isključivo grupni nepreuzeti. NE miješati UNROUTED u group tabove.

Vizuelni zahtjevi (Visual):
Danger banner, "Preuzmi" dugme kao primary.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovo je closing task modula Inbox — provedi vizuelni gate prije nego kažeš da je gotovo.

Verifikacija (prije nego kažeš da je task gotov):
§13.5 Inbox visual gate (rendered `/tickets?view=inbox` vs `Inbox.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-3.4 — Ticket Detail delta polish (BEZ rewrite-a)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-3.4 (Ticket Detail delta polish (BEZ rewrite-a)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-3.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: TicketDetail header/composer/activity dijelovi
3. Pročitaj trenutne fajlove koje mijenjaš: Navedeni fajlovi
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Sitni reference delta na POSTOJEĆEM layoutu Ticket Detaila. Ovo NIJE rewrite — struktura ostaje ista (breadcrumb → header card → `xl:grid-cols-[1fr_330px]` → tabovi + side stack).

Scope (radi SAMO ovo, ništa više):
`ticket-detail-header.tsx`, `ticket-detail-header-actions.tsx`, `ticket-detail-sidebar.tsx`, `ticket-conversation.tsx`, `ticket-message-composer.tsx`:
- Pause chip "SLA pauziran" kad je status waiting/approval
- Assign akcija ako postoji assign API na detail nivou (claim već postoji; group assign preko postojećeg update/bulk endpointa — NE novi backend poziv)
- Composer Paperclip dugme → wire na isti postojeći `onUpload`
- Activity ikone: APPROVAL već ima success stil; ostalo ostaje GitBranch OSIM ako `message.type` stvarno razlikuje kind

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Cijeli workspace, realtime (Socket.IO), approvals, split, CSAT, confidential, redaction — SVE ostaje funkcionalno bez regresije.

Acceptance criteria:
Nijedan tab nije uklonjen; composer Ctrl+Enter shortcut ostaje raditi.

Vizuelni zahtjevi (Visual):
Header card `px-5 py-4`, sidebar 330px. Ovo je PRIORITY visual gate (§13.5) — Ticket Detail je najbliži referenci od svih modula.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: KRITIČNO: rewrite Ticket Detail-a je EKSPLICITNO zabranjen planom. Ako primijetiš da bi "bilo ljepše" restrukturirati layout — nemoj, samo delta izmjene navedene gore.

Verifikacija (prije nego kažeš da je task gotov):
Browser rendered current vs `TicketDetail.tsx` (desktop + mobile) + postojeći ticket testovi. Screenshot pair. NE mijenjati/rebuildovati layout strukture.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-3.5 — Create ticket wizard chrome

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-3.5 (Create ticket wizard chrome) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-3.5 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `NewTicket.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: Stepper + intercept već su obavezni koraci u toku
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.4. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Stepper vizuel kao `NewTicket.tsx` (Usluga → Detalji → KB intercept → Pregled).

Scope (radi SAMO ovo, ništa više):
`create-ticket-stepper.tsx`, `ticket-create-page.tsx`, intercept view. Unutrašnji kontejner `max-w-[1060px]` (kao referenca); vanjski shell ostaje `max-w-[1400px]`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
KB intercept se ne smije preskakati; schema forma; routing preview ako već postoji na create side panelu.

Acceptance criteria:
Completed step ima success kvačicu; active step ima primary fill.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Closing task modula New Ticket — provedi vizuelni gate.

Verifikacija (prije nego kažeš da je task gotov):
Intercept specs + §13.5 NewTicket visual gate (rendered `/tickets/new` vs `NewTicket.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-3.3 — Ticket Detail SLA panel (GATED na B1)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-3.3 (Ticket Detail SLA panel (GATED na B1)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-3.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: TicketDetail SLA card
3. Pročitaj trenutne fajlove koje mijenjaš: Trenutno nema panela; samo `isOverdue` badge na listi
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.4 (Progress), i OBAVEZNO blocker B1 (backend mora izložiti SLA snapshot na `TicketResponse`). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Constitution §8.3 tajmeri na Ticket Detail.

Scope (radi SAMO ovo, ništa više):
Novi `ticket-sla-panel.tsx` u `ticket-detail-side-stack.tsx` SAMO AKO `TicketResponse` (ili nested snapshot) već izlaže due/pause polja (blocker B1 riješen).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Pause banneri u headeru; socket `applyTicket` logika.

Acceptance criteria:
Response "zadovoljen" se ne boji crveno retroaktivno; pause warning chip; breach je danger boja.

Vizuelni zahtjevi (Visual):
Progress h-1.5, tabular-nums remaining vrijeme.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: STOP GATE: prije bilo kakvog koda, provjeri da li backend `TicketResponse` DTO stvarno izlaže `responseDueAt`/`resolutionDueAt`/pause/breach polja (blocker B1 u §14 plana). Ako NE — ne implementiraj lažni/procijenjeni tajmer. Javi mi da B1 nije riješen i stani (task ostaje otvoren, ne pokušavaj zaobići backend gap frontend proračunom).

Verifikacija (prije nego kažeš da je task gotov):
Unit test mapiranja snapshot→UI + reload detail stranice.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-4.1 — Reports route + layout

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-4.1 (Reports route + layout) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-4.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Reports.tsx` PageHeader
3. Pročitaj trenutne fajlove koje mijenjaš: Ne postoji (nema rute, nema page-a)
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.5, FE-2.1 (reuse agregacijskih helpera). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Nova `/reports` stranica + nav item.

Scope (radi SAMO ovo, ništa više):
`reports-page.tsx`, `router.tsx`, `navigation.ts`, i18n.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Addon flag `private.addons.reports` — ako je false I ako FE već čita taj settings ključ, prikazati EmptyState "dodatak ugašen" (UNVERIFIED da li FE uopšte čita ovaj addon — ako ne čita, ne blokirati stranicu).

Acceptance criteria:
Loading/empty/error stanja iz `listTickets`.

Vizuelni zahtjevi (Visual):
max-w 1400 već dolazi iz shell-a.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
`npm run build`; ručno otvoriti rutu.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-4.2 — Reports charts from ticket aggregations

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-4.2 (Reports charts from ticket aggregations) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-4.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Reports HBars + GroupedBars
3. Pročitaj trenutne fajlove koje mijenjaš: Ne postoji
4. Dependency (mora već biti gotovo prije ovog taska): FE-4.1, FE-0.5. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Bottleneck/volume/aging grafovi iz stvarnih polja: `assignedGroupId`, `serviceId`, `createdAt`, `status`, `isOverdue`.

Scope (radi SAMO ovo, ništa više):
Helper funkcije + Reports body.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
n/a — svi podaci moraju biti izračunati, nema mock brojeva.

Acceptance criteria:
Sufiks "h" (sati) koristiti SAMO ako stvarno imamo duration podatak; dok ga nema, koristiti COUNTS (broj otvorenih po grupi/usluzi) umjesto izmišljenih sati.

Vizuelni zahtjevi (Visual):
Warning boja samo za max bar (usko grlo/bottleneck).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Unit testovi agregacija + manualna provjera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-4.3 — Export action UX (disabled)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-4.3 (Export action UX (disabled)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-4.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Reports actions
3. Pročitaj trenutne fajlove koje mijenjaš: Ne postoji
4. Dependency (mora već biti gotovo prije ovog taska): FE-4.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Outline dugme "Izvoz paketa" — disabled, sa hint tekstom da dolazi u Fazi 8.

Scope (radi SAMO ovo, ništa više):
Reports header akcije. Date range: samo client-side filter po `createdAt` (npr. 14/30 dana) — ovo NIJE novi API poziv.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne pozivati nepostojeći export endpoint.

Acceptance criteria:
Dugme je `disabled` + `aria-disabled`; date filter mijenja agregacije u prikazu.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Closing task modula Reports — provedi vizuelni gate.

Verifikacija (prije nego kažeš da je task gotov):
§13.5 Reports visual gate (rendered `/reports` vs `Reports.tsx`; export ostaje disabled).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-5.1 — Catalog visual (cards + search)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-5.1 (Catalog visual (cards + search)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-5.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Catalog.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: `service-catalog-table.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1, FE-0.3. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Layout kartica po uzoru na `Catalog.tsx`, na podacima iz `listServices()`.

Scope (radi SAMO ovo, ništa više):
`services-page.tsx`, novi `service-catalog-grid.tsx`; zadržati tabelu kao fallback ili je zamijeniti gridom — ali jedan konzistentan pattern, ne oba paralelno bez razloga.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
"Pripremi formu" akcija, lifecycle/availability bedževi, empty state.

Acceptance criteria:
Search po name/slug; prikazati `requiresApproval` i `runtimeAvailability` (kao warning, NIKAD kao blokadu); downtime traka isključivo iz `runtimeAvailability.activeDowntimeWindow`.

Vizuelni zahtjevi (Visual):
1/2/3-kolonski grid kartica, hover `#31405C`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: NE crtati fake kategorije — `categoryId`/`description` NISU na trenutnom `ServiceResponse` DTO-u (blocker B5). Ovo je closing task za layout dio Catalog modula.

Verifikacija (prije nego kažeš da je task gotov):
Catalog load + empty stanje + §13.5 Catalog layout gate (rendered `/services` vs `Catalog.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-5.2 — Catalog API wrappers + create/edit/lifecycle

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-5.2 (Catalog API wrappers + create/edit/lifecycle) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-5.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Catalog CTA "Nova usluga" (u referenci je mock — ovdje mora biti pravi API poziv)
3. Pročitaj trenutne fajlove koje mijenjaš: Trenutno samo list + "pripremi formu"
4. Dependency (mora već biti gotovo prije ovog taska): FE-5.1, FE-0.3. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Pravi admin CRUD za katalog usluga (backend to već podržava).

Scope (radi SAMO ovo, ništa više):
`service-catalog-api.ts` — dodati `create`/`patch`/`lifecycle` wrappere; forme sa `reason` poljem; permission `service.catalog.write`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne diraj logiku eligibility za kreiranje tiketa.

Acceptance criteria:
Lifecycle prelazi po matrici: DRAFT→ACTIVE→DEPRECATED; delete je moguć samo za DRAFT status.

Vizuelni zahtjevi (Visual):
Outline/danger dugmad; change reason kao Field komponenta.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
API error mapping testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-5.3 — Service onboarding wizard UI

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-5.3 (Service onboarding wizard UI) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-5.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Catalog onboarding stepper
3. Pročitaj trenutne fajlove koje mijenjaš: 0 frontend fajlova trenutno (backend postoji, i18n kaže "kreiraju se kroz onboarding")
4. Dependency (mora već biti gotovo prije ovog taska): FE-5.2. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Wizard: servis → forma → routing → SLA → approvals.

Scope (radi SAMO ovo, ništa više):
Novi moduli pod `components/services/onboarding/` + API wrapperi na već postojeće backend rute (`services/:id/onboarding*`).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Lifecycle ostaje DRAFT dok se onboarding ne finalizira.

Acceptance criteria:
Koraci idu redom; finalize poziva postojeći backend endpoint.

Vizuelni zahtjevi (Visual):
`wizard-stepper.tsx` VEĆ postoji — reuse-uj ga, ne pravi novi.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Closing task za onboarding dio Catalog modula.

Verifikacija (prije nego kažeš da je task gotov):
Manualni happy path + error scenariji + §13.5 Catalog onboarding stepper gate (vs `Catalog.tsx` stepper chrome).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-5.4 — Knowledge list visual + filters

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-5.4 (Knowledge list visual + filters) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-5.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Knowledge.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: 2-kolonske kartice već postoje; raw status prikaz; UUID kao owner
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1, directory servis. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Kartice kao `Knowledge.tsx`, BEZ fake tagova/procenata.

Scope (radi SAMO ovo, ništa više):
`knowledge-article-list.tsx`, `knowledge-base-page.tsx`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Feedback thumbs, lifecycle+reason, intercept ranking copy tekst.

Acceptance criteria:
Filter po status/service/stale; i18n za status; owner prikazan kao ime (ne UUID).

Vizuelni zahtjevi (Visual):
Hover title boja `#7FA8F5`; search kartica bez loma border-input chrome-a.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: KRITIČNO: `KnowledgeArticleResponse` DTO NEMA tags/categories/views/intercepts/helpfulPct polja — NE izmišljati ih. To je eksplicitno KEEP-out u planu.

Verifikacija (prije nego kažeš da je task gotov):
List empty/error stanja + §13.5 Knowledge list gate (rendered `/knowledge-base` vs `Knowledge.tsx`; bez fake tagova/procenata).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-5.5 — Knowledge article detail + edit

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-5.5 (Knowledge article detail + edit) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-5.5 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Knowledge title klik (referenca NEMA zasebnu detail page — current treba pravu detail rutu jer je funkcionalna aplikacija, ne mockup)
3. Pročitaj trenutne fajlove koje mijenjaš: `getKnowledgeArticle` postoji u API klijentu ali je neiskorišten
4. Dependency (mora već biti gotovo prije ovog taska): FE-5.4. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Nova ruta `/knowledge-base/:articleId` (ili query varijanta) sa get+patch funkcionalnošću.

Scope (radi SAMO ovo, ništa više):
Nova page; router izmjena; create ostaje na listi ili se premješta u detail CTA — po tvom nahođenju, minimalna izmjena.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Change log `reason` na update; lifecycle akcije.

Acceptance criteria:
404/forbidden mapiranje grešaka; edit dostupan samo uz write permission.

Vizuelni zahtjevi (Visual):
PageHeader crumbs "Usluge i znanje / [naziv članka]".

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Get/update error testovi + manual. NEMA 1:1 reference detail page u dizajnu — chrome baziraj na Knowledge + PageHeader konvencijama, NE izmišljaj novi ekran dizajn.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-6.1 — Coverage matrix

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-6.1 (Coverage matrix) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-6.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Routing.tsx` CoverageMatrix
3. Pročitaj trenutne fajlove koje mijenjaš: Flat tabela
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): E/N/× matrica iz `listRoutingCoverage()`.

Scope (radi SAMO ovo, ništa više):
Zamijeniti ili dopuniti `routing-coverage-table.tsx`; sticky prva kolona; legenda.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
sr-only outcome labeli za screen reader; empty state.

Acceptance criteria:
Ćelija UNROUTED je danger boja; tooltip prikazuje path i depth iz DTO-a.

Vizuelni zahtjevi (Visual):
CELL_STYLE klase preuzete iz reference.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera sa seed coverage podacima.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-6.2 — Rules list + resolve tester + create form selects

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-6.2 (Rules list + resolve tester + create form selects) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-6.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Routing tabovi tester/rules
3. Pročitaj trenutne fajlove koje mijenjaš: Trenutno samo create+coverage
4. Dependency (mora već biti gotovo prije ovog taska): FE-6.1, FE-0.3. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Iskoristiti postojeće `GET /rules` i `GET /resolve` endpoint-e (trenutno neiskorišteni u FE).

Scope (radi SAMO ovo, ništa više):
`routing-api.ts` — dodati list+resolve; tabovi na `routing-page.tsx`; create forma: OU tree + services + group selecti AKO group lista postoji (inače KEEP postojeći id input — groups API je UNVERIFIED, blocker B4).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Create `reason` polje ako backend zahtijeva (provjeri `CreateRoutingRuleInput` DTO pri implementaciji — trenutno ga FE klijent nema; ako backend traži obavezno, dodaj polje u formu).

Acceptance criteria:
Duplicate rule error handling ostaje raditi.

Vizuelni zahtjevi (Visual):
UnderlineTabs komponenta.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: NE implementirati edit/delete/enable niti change log tab — backend nema te endpointe (blocker B3). Closing task modula Routing.

Verifikacija (prije nego kažeš da je task gotov):
Create error specs + §13.5 Routing visual gate (rendered `/routing` vs `Routing.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-6.3 — SLA admin visual (bez promjene logike)

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-6.3 (SLA admin visual (bez promjene logike)) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-6.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Sla.tsx`
3. Pročitaj trenutne fajlove koje mijenjaš: Forme + tabele + change log (funkcionalno već ispred reference — pravi CRUD sa reason i change logom)
4. Dependency (mora već biti gotovo prije ovog taska): FE-0.4; FE-0.5 opcionalno za HBars iz rule exposure counts — preskoči ako ne postoji ticket-by-profile API. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Profile cards + calendar week grid na POSTOJEĆEM CRUD-u — čisto vizuelni task.

Scope (radi SAMO ovo, ništa više):
`sla-profiles-panel.tsx`, `sla-calendars-panel.tsx`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Create/update/delete + reason + change log logika mora ostati identična.

Acceptance criteria:
Ista API ponašanja kao prije.

Vizuelni zahtjevi (Visual):
Selected profile: `border-primary/50 bg-primary/8`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovo je ČISTO vizuelni task — ne mijenjaj CRUD logiku, samo prezentaciju. Closing task modula SLA (ticket-level timeri su odvojen task FE-3.3, gated na B1).

Verifikacija (prije nego kažeš da je task gotov):
Postojeći SLA error specs + §13.5 SLA visual gate (rendered `/sla` vs `Sla.tsx`).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-7.1 — Ticket list/dashboard invalidation

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-7.1 (Ticket list/dashboard invalidation) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-7.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Inbox "realtime aktivan" (mock u referenci)
3. Pročitaj trenutne fajlove koje mijenjaš: Trenutno samo detail page + notifications hook slušaju realtime
4. Dependency (mora već biti gotovo prije ovog taska): FE-3.1, FE-2.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Sprečavanje stale-state na listama putem realtime eventa.

Scope (radi SAMO ovo, ništa više):
Subscribe na `ticket.updated` / `notification.created` u `use-ticket-list` i `use-dashboard-summary` (debounce reload); reuse postojeći `subscribeSocketEvent` + `isStaleTicketEvent` pattern.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Detail room join ostaje; NE dupliraj socket konekcije — koristi postojeći `acquireHelpdeskSocket` singleton.

Acceptance criteria:
Update na drugom klijentu osvježava listu bez punog page refresh-a.

Vizuelni zahtjevi (Visual):
n/a

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Unit testovi na apply helperima + manualna provjera sa dva taba/browsera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-7.2 — Notification deep links completeness

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-7.2 (Notification deep links completeness) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-7.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `routeFromString`
3. Pročitaj trenutne fajlove koje mijenjaš: Postojeći ticket path helper
4. Dependency (mora već biti gotovo prije ovog taska): FE-1.4. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Svi tipovi (kind) notifikacija vode na ispravnu rutu.

Scope (radi SAMO ovo, ništa više):
`notification-kind.ts`, `notificationTicketPath`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Mark read on click ponašanje.

Acceptance criteria:
SLA/approval notifikacije otvaraju ispravan tiket; nepoznat kind ne ruši aplikaciju (graceful fallback).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Proširiti postojeće notification specs.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-7.3 — Composer/list optimistic error recovery chrome

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-7.3 (Composer/list optimistic error recovery chrome) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-7.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: n/a (referenca ima mock send, nema pravi error recovery)
3. Pročitaj trenutne fajlove koje mijenjaš: Optimistic helper
4. Dependency (mora već biti gotovo prije ovog taska): FE-3.4. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Vidljiv error kod optimističkog slanja poruke.

Scope (radi SAMO ovo, ništa više):
`send-ticket-message-optimistic.ts` konzumenti; claim error na listi već postoji kao referentni pattern.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Socket upsert dedup logika.

Acceptance criteria:
Neuspješno slanje ne gubi draft tekst poruke.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Postojeći optimistic testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-8.1 — One-off style sweep

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-8.1 (One-off style sweep) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-8.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: theme.md anti-patterns sekcija
3. Pročitaj trenutne fajlove koje mijenjaš: Cijeli `frontend/src`
4. Dependency (mora već biti gotovo prije ovog taska): FE-1, FE-2, FE-3, FE-4, FE-5, FE-6 (svi modul taskovi moraju biti gotovi prije ovog sweep-a). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Ukloniti lokalne radius/hex/shadow vrijednosti izvan definisanih tokena.

Scope (radi SAMO ovo, ništa više):
Grep kroz cijeli `frontend/src` na `shadow-`, `rounded-full` (na non-avatar elementima), i `#` hex vrijednosti van `.cursor/docs/theme.md`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
`shadow-xl shadow-black/40` je dozvoljen SAMO za floating elemente (`floatingPanelClassName`).

Acceptance criteria:
Grep je čist osim dopuštenih vrijednosti: `#7FA8F5`, `#1D4FD8`, `#31405C`, avatar hue boje, `#3B4A6B`.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Grep provjera + `npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-8.2 — Keyboard, focus, contrast, responsive

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-8.2 (Keyboard, focus, contrast, responsive) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-8.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `index.css` `:focus-visible`
3. Pročitaj trenutne fajlove koje mijenjaš: Već dosta usklađeno
4. Dependency (mora već biti gotovo prije ovog taska): FE-8.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Constitution §10 pristupačnost/a11y pravila.

Scope (radi SAMO ovo, ništa više):
`focus-visible` je već globalno definisan; provjeriti custom trigere (npr. status ▾ dropdown); mobile sidebar; minimalna visina tabele reda 36px.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
`N` i `⌘K` shortcuts moraju raditi.

Acceptance criteria:
Tab navigacija kroz cijeli shell + ticket list checkbox radi; SVI §13.5 module gateovi su prošli na desktop 1440 + mobile 390.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Ovo je GLOBALNI ponovni prolaz svih §13.5 vizuelnih gateova iz svih prethodnih modula — treba ponoviti browser provjeru za shell, dashboard, tickets, inbox, ticket detail, new ticket, reports, catalog, knowledge, routing, sla.

Verifikacija (prije nego kažeš da je task gotov):
Cijeli FE-0.6 protokol — rendered reference vs rendered current, screenshot pair za svaki gate; NE samo grep/source provjera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-8.3 — Loading/empty/error consistency

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-8.3 (Loading/empty/error consistency) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-8.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: EmptyState pattern
3. Pročitaj trenutne fajlove koje mijenjaš: `empty-state.tsx`, `api-error-text.tsx`, `skeleton.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): FE-4, FE-5, FE-6. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Svaki modul mora imati EmptyState + ApiErrorText + skeleton.

Scope (radi SAMO ovo, ništa više):
Reports/catalog/kb/routing/dashboard već su uglavnom pokriveni — popuniti preostale rupe.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
i18n poruke, requestId prikaz na greškama.

Acceptance criteria:
Nijedna lista nije samo "Nema podataka" bez sljedećeg koraka za korisnika.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera po modulu.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-9.1 — Admin shell + tabs

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-9.1 (Admin shell + tabs) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-9.1 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: `Admin.tsx` tabs
3. Pročitaj trenutne fajlove koje mijenjaš: `/users`, `/organizational-units`, `/settings` kao zasebne rute
4. Dependency (mora već biti gotovo prije ovog taska): FE-1.1 (smije prepisati admin nav iteme). Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): `/admin` ruta (ili wrap) sa tabovima org/users/settings/ops koji renderuju postojeće page tijelo (ne novu logiku).

Scope (radi SAMO ovo, ništa više):
`admin-page.tsx`, router, navigation: jedan Admin nav item; deep link putem `?tab=`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Postojeće rute (`/users` itd.) moraju raditi kao redirect na `/admin?tab=`.

Acceptance criteria:
Permission-aware: settings forbidden EmptyState ostaje raditi.

Vizuelni zahtjevi (Visual):
UnderlineTabs + PageHeader "Administracija sistema".

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera tabova.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-9.2 — Org + users visual inside admin

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-9.2 (Org + users visual inside admin) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-9.2 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Admin OuTree / UsersRoles tabovi
3. Pročitaj trenutne fajlove koje mijenjaš: Te page-ove (trenutno zasebne rute)
4. Dependency (mora već biti gotovo prije ovog taska): FE-9.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): OU tree i users tabela unutar admin chrome-a, BEZ nove poslovne logike.

Scope (radi SAMO ovo, ništa više):
Reuse internals iz `organizational-units-page` / `users-page`.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Search, avatari, tree prikaz.

Acceptance criteria:
Read-only mod AKO već postoji session read-only flag u FE (UNVERIFIED — provjeri `useSessionCapabilities`; ako postoji, disable write kontrole).

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-9.3 — Settings tab = email + addon/settings hooks

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-9.3 (Settings tab = email + addon/settings hooks) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-9.3 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Admin SettingsTab (toggles)
3. Pročitaj trenutne fajlove koje mijenjaš: `email-channel-panel.tsx`
4. Dependency (mora već biti gotovo prije ovog taska): FE-9.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Email panel ostaje kao sada; dodati mjesto za buduće addons/toggles (Switch+opis) BEZ implementacije Faze 9 logike.

Scope (radi SAMO ovo, ništa više):
`settings-page.tsx` unutar admin; skeleton sekcija "Dodaci" koja čita postojeći settings registry SAMO AKO API već vraća addon ključeve; inače prikazati samo email panel.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Change log `reason` na email save.

Acceptance criteria:
NE implementirati config versioning/rollback.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Verifikacija (prije nego kažeš da je task gotov):
Postojeći email testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---

## FE-9.4 — Ops tab placeholder

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na stavci FE-9.4 (Ops tab placeholder) iz `.cursor/docs/frontend-reference-alignment-plan.md` (poglavlje 9 "FE taskovi").
NE diraj druge FE-* taskove, ne implementiraj druge module, ne radi refactor ili "popravke" van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj sekciju FE-9.4 u `.cursor/docs/frontend-reference-alignment-plan.md`.
2. Pročitaj referentne fajlove: Admin OpsTab (u referenci su mock jobovi)
3. Pročitaj trenutne fajlove koje mijenjaš: Ne postoji
4. Dependency (mora već biti gotovo prije ovog taska): FE-9.1. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
5. Predloži kratak plan implementacije prije pisanja koda; sačekaj moju potvrdu.

Cilj (Goal): Ops chrome za queue/audit funkcionalnost koja još nema FE API.

Scope (radi SAMO ovo, ništa više):
EmptyState sa tekstom: "Red poslova i audit export dolaze s Fazom 7/8"; BEZ fake job tabele.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
n/a

Acceptance criteria:
Nula mock jobova — EmptyState samo, ništa izmišljeno.

Opšta pravila iz plana (obavezno poštovati):
- Postojeća API/state integracija ostaje; mijenja se samo vizuelni i interakcijski sloj kroz shared primitive-e.
- Zabranjeni su izmišljeni/mock/hardcoded produkcijski podaci svugdje gdje postoji stvarni API/state.
- Ne uvoditi nove boje/hexove/radiuse/sjene mimo `.cursor/docs/theme.md` i `.cursor/docs/theme-source.md`.
- Ne migrirati Tailwind v3→v4; ne mijenjati backend enume/DTO-ove osim ako je task eksplicitno backend-contract task.
- Ako naiđeš na OPEN BLOCKER ili UNVERIFIED stavku (npr. B1–B6 iz poglavlja 14 plana) koja je izvan scope-a ovog taska, ne izmišljaj podatke/API — zaustavi se na tom dijelu, primijeni fallback opisan u tasku (ako postoji) i javi mi.

Napomena specifična za ovaj task: Closing task cijelog Admin modula — provedi vizuelni gate.

Verifikacija (prije nego kažeš da je task gotov):
§13.5 Admin skeleton visual gate (rendered `/admin` vs `Admin.tsx` tabs chrome; ops kao EmptyState).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- NE označavaj checkbox u planu/TASKS dokumentu — to ja radim ručno nakon što provjerim rezultat u browseru.
```

---
## Nakon svih FE taskova

Kad Faza FE-0 → FE-9 prođe visual QA (§13.5 svi gateovi zeleni), tek onda se otvara Faza 6 iz glavnog `TASKS.md` (Edge ekstenzija / WebSocket auto-assignment) — po mogućnosti u novoj sesiji uz pročitan `.cursor/docs/03-edge-extension.md`, što je već van scope-a ovog dokumenta.
