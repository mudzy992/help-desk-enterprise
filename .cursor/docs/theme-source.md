# Master UI-UX Design Constitution — EP-HelpDesk

> Source of truth za vizuelni i interakcijski jezik EP-HelpDesk sistema.

> Ako bilo koji globalni/template dizajn princip (Apple-linear, one-page, generički SaaS dashboard)

> dođe u sukob s ovim dokumentom — **ovaj dokument pobjeđuje**.

> Tokeni: `.cursor/docs/theme.md` · Stack: React (Vite) + Tailwind + shadcn/Radix

---

## 1. Filozofija dizajna

EP-HelpDesk je **enterprise radni alat**, ne marketing stranica. Dizajn služi ljudima koji u njemu

žive 8 sati dnevno — agentima, vlasnicima grupa i administratorima.

Pet neprokršivih principa:

1. **Informacija ispred ukrasa.** Boja, sjena i pokret postoje samo da bi prenijeli značenje.

2. **Dark-first.** Enterprise dark hijerarhija je default: `background → surface → elevated`.

   Nikad ne invertovati light temu "u tamnu".

3. **Gustoća s disanjem.** "Dense but breathable" — puno podataka po ekranu, ali sa sistemskim

   whitespace-om, čitljivim redoslijedom i bez vizuelne panike.

4. **Multipage app shell.** Traka za navigaciju lijevo, sadržaj desno, rute po modulima.

   Nema one-page skrolanja, nema hero sekcija, nema "scroll storytellinga".

5. **Svaka promjena ima trag.** Sve admin akcije traže razlog (change log), svi izvozi se

   auditiraju, svi tajmeri i rokovi su vidljivi. Sistem nikad ne radi "tihu magiju".

---

## 2. Paleta boja

### 2.1 Neutralne površine (80–90% ekrana)

| Token | Hex | Upotreba |

|---|---|---|

| `background` | `#0B1220` | Podloga aplikacije, unosi (input), pozadina koda |

| `surface` | `#111827` | Kartice, sidebar, topbar, tabele |

| `elevated` | `#1B2436` | Hover stanja, dropdowni, aktivni nav itemi, tooltipi |

| `border` | `#243044` | Svi obrubi, razdjelnici, okviri tabela |

| `text` | `#E5E7EB` | Primarni tekst |

| `muted` | `#9CA3AF` | Sekundarni tekst, meta podaci, placeholderi |

### 2.2 Brand + semantika (10–20% ekrana)

| Token | Hex | Dozvoljena upotreba |

|---|---|---|

| `primary` | `#2563EB` | CTA, aktivna navigacija, fokus, selekcija, status "u radu" |

| `accent` | `#22C55E` | **Rijedak** highlight (npr. policy pack oznaka). Nije success, nije status. |

| `success` | `#16A34A` | Uspjeh, riješen, SLA u okviru, exact routing |

| `warning` | `#F59E0B` | Upozorenje, čeka se nešto/koga, SLA pod rizikom, pauze, zastarjelo |

| `danger` | `#EF4444` | Greške, destruktivno, **Kritičan prioritet**, SLA prekoračenje, UNROUTED |

| `info` | `#38BDF8` | Informativno, "na čekanju", održavanje, naslijeđeni fallback |

**Pravilo kontrasta na tamnoj pozadini:** semantičke boje se kao *tekst* nikad ne crtaju punom

saturošću na tint pozadini — koriste se svjetlije varijante radi čitljivosti:

| Namjena | Tekst boja na dark |

|---|---|

| primary tekst/link | `#7FA8F5` |

| success tekst | `#4ADE80` |

| warning / danger / info tekst | puni token (čitljivi su i puni) |

### 2.3 Tint formule (badge/chip površine)

Semantički badge = **boja/8–15% pozadina + boja/25–40% obrub + svijetli tekst**.

Primjeri: `bg-primary/15 text-[#7FA8F5] border-primary/35` · `bg-danger/10 text-danger border-danger/35`.

### 2.4 Željezna pravila o boji

- **Boja nije dekoracija.** Svaka obojena površina mora odgovoriti na pitanje "šta ovo znači?".

- **Crvena samo kad korisnik mora reagovati** — ili ako je "Kritičan" prioritet (domena).

- Nema gradijenata, nema boja po kategorijama korisnika "da bude veselo". Avatari koriste

  fiksnu paletu od 6 prigušenih, nezasićenih nijansi.

---

## 3. Tipografija

- **Porodica:** Inter (ui-sans-serif fallback). 450 težina dozvoljena za body.

- **Skala (strogo):**

| Sloj | Veličina | Težina | Primjer |

|---|---|---|---|

| Meta / label gore | 10–11.5px | 500–600, uppercase, tracking 0.07–0.12em | zaglavlja kolona, sekcijski naslovi |

| Metadata | 11–12.5px | 400–500 | vrijeme, DN putanje, opisi badgeva |

| Body | 12.5–14px | 400–450 | tekst tiketa, poruke, opisi |

| Sekcijski naslov | 13.5–14px | 600 | naslov kartice |

| Page title | 19–20px | 600, tracking -0.01em | samo po jedan po stranici |

| Velike metrike | 24–26px | 600, tabular-nums | KPI brojke, centar donuta |

- **Numerika:** ID-jevi `EP-1043`), tajmeri, procenati i iznosi uvijek s `tabular-nums`

  `font-feature-settings: "tnum"`) — stabilne širine cifara, nema "poskakivanja" u tabelama.

- Veće veličine od 26px — ne postoje u aplikaciji. Ovo nije landing page.

- Line-height: tijesno za naslove (1.2–1.35), opušteno za čitanje (1.5–1.6 u porukama).

---

## 4. Geometrija i dubina

| Element | Radius |

|---|---|

| Badge, checkbox, mali chip | 5–6px |

| Dugmad, inputi, select, tabovi | 6px |

| Kartice, paneli, dropdowni, tooltipi | 8px |

| Krugovi | samo avatar, status tačke, donut |

- **Zabranjeno:** pill dugmad, kartice 20–30px radius, "bubble" chat oblici s ekstremnim radiusima.

- **Elevacija kroz border, ne kroz sjenu.** Razina se izražava `border #243044` + kontrastom

  površina `background → surface → elevated`). Prave sjene `shadow-xl black/40`) samo za

  *plutajuće* slojeve: dropdown meni, tooltip, mobilni overlay.

- Border-hijerarhija: puni `border` za strukturu, `border/70`, `border/50`, `border/40` za sve

  dublje/unutrašnje razdjelnike.

---

## 5. App shell (kostur aplikacije)

```

┌────────────┬─────────────────────────────────────────────┐

│  SIDEBAR   │  TOPBAR: pretraga · status · zvonce · profil │

│  248px     ├─────────────────────────────────────────────┤

│  brand     │                                             │

│  [+ Novi]  │   PAGE HEADER (breadcrumb, title, actions)  │

│  sekcije   │                                             │

│  nav items │   SADRŽAJ (max-w 1400px, px 4–8, py 6)      │

│  bedževi   │                                             │

│  —         │                                             │

│  user card │                                             │

└────────────┴─────────────────────────────────────────────┘

```

### 5.1 Sidebar — pravila

- Širina 248px, `surface` + desni border. Vertikalno: brand (h-14) → primarni CTA → sekcije → user card.

- **Primarni CTA ("Novi tiket")** je jedino puno `primary` dugme u chrome-u; prečica `N`.

- Sekcije imaju uppercase naslove 10px / tracking 0.12em / muted 60%: *Pregled, Tiketi, Usluge i znanje, Administracija*.

- Nav item: h-8.5, ikona 15.5px stroke 1.9, label 13px. Aktivan = `bg-elevated` + **lijeva

  indikatorska crtica 2.5px primary** + ikona u `#7FA8F5`.

- Količinski bedževi (broj tiketa u inboxu itd.) — neutralni; crveni samo za nešto čemu pristupaš *sada*.

- Dno: user card s avatarom, imenom i rolom ("SuperAdmin · lokalni nalog").

### 5.2 Topbar — pravila

- Visina 56px (h-14), `surface`, donji border.

- Pretraga: max-w-md, `background` input, ikona lijevo, **⌘K hint** desno; pokriva tikete + KB + korisnike.

- Status sistema: čip s pulsirajućom success tačkom ("Svi sistemi operativni") — diskretan, desno.

- Zvonce: nepročitane = crveni broj (reakcija potrebna — isplativo crveno). Panel 380px, `elevated` + sjena.

- User meni: avatar + ime + OU/rola; sadržava "Moj profil", "Dodijeljeni tiketi", jezik (BS/EN), odjava.

### 5.3 Page header (svaka stranica)

- Breadcrumb 11.5px muted `Modul / Podmodul / Trenutna`).

- Title 19px semibold; subtitle 12.5px muted (jedna rečenica konteksta — ko vidi, šta znači broj).

- Akcije desno: sekundarne (outline) lijevo od primarne. Max 2–3 akcije; ostalo u meni.

### 5.4 Sadržaj

- Kontejner `max-w-[1400px]`, padding 16px (mobile) / 32px (desktop), vertikalno 24px.

- Razmaci između kartica: 12–16px. Kartica = naslovna traka `CardHeader`) + tijelo.

- Tabele koje prelaze širinu: horizontalni scroll unutar kartice, `min-w-*` po tabeli.

---

## 6. Komponente

### 6.1 Dugmad

| Varijanta | Površina | Upotreba |

|---|---|---|

| `primary` | primary fill, hover `#1D4FD8`, active `#1B44BE` | jedna primarna akcija po kontekstu |

| `outline` | surface + border, hover elevated + svjetliji border | sekundarne akcije |

| `subtle` | elevated/60 + border/70 | tercijarne, unutar panela |

| `ghost` | bez okvira, hover elevated | ikonske i tihe akcije |

| `danger` | danger/10 + border danger/40 | destruktivno (uvijek s potvrdom) |

Visine: `xs` h-6.5 · `sm` h-8 · `md` h-9. Radius 6px. Ikona 12–15px ispred labele,

razmak 6px. Disabled = opacity 45% bez pointera. Fokus: `outline 2px primary/70`.

### 6.2 Badge / čip

- Oblik: rounded-md (6px), border, px-1.5, tekst 11px medium, **uvijek s tekstom** (boja sama nikad ne nosi značenje).

- Opciona tačka `dot`) iste boje 6px ispred teksta.

- Bedževi su informativni elementi, **nisu dugmad** — klikabilni bedž je smell; koristi dugme.

### 6.3 Kartica

- `rounded-lg border border-border bg-surface`. Bez sjene u mirovanju; hover na interaktivnim

  karticama samo svjetliji border `#31405C`) + eventualno elevated/30 pozadina.

- `CardHeader`: naslov 13.5px semibold + opcioni podnaslov 12px + akcije desno; donji border/70.

### 6.4 Tabela

- Zaglavlje: 10.5px uppercase, tracking 0.08em, muted/70, medium — nikad bold crno.

- Redovi: `divide-y divide-border/50`, visina ~44px, hover `bg-elevated/40`.

- Klikabilni red: cijeli red je klik (cursor-pointer); akcije unutar reda zaustavljaju propagaciju.

- ID kolona: `#7FA8F5` + tabular-nums; hover underline.

- Checkbox kolona širine 40px, lijevo.

- Poravnanje: tekst lijevo, brojevi/rokovi desno.

### 6.5 Tabovi

- Podlanični stil: tekst 12.5px, aktivni = tekst puni + **donja crtica primary 2px**, neaktivni muted.

- Count čip uz labelu kad god broj pomaže (npr. "Grupni inbox · 9").

### 6.6 Forme

- Input/select h-9, textarea min-h ~90px; pozadina `background/60`, border, hover `#31405C`, fokus `primary`.

- Label 12.5px medium iznad; obavezna polja = crvena zvjezdica; hint 11.5px muted ispod.

- Validacija prije submit-a; nema "tihih" grešaka — poruka blizu polja, u danger tonu.

- Schema-driven forme (katalog): renderuju ista pravila, polja definisana verzijom forme

  `formVersionRef` fiksiran na tiketu — prikazivati verziju).

### 6.7 Toggle

- h-5 w-9, krug 14px; uključeno = primary; isključeno = elevated/border. Za registry postavke

  i addon katalog. Nema toggle-a bez labela i kratkog opisa posljedice.

### 6.8 KPI / StatCard

- Label 11.5px uppercase muted → vrijednost 24px semibold tabular-nums → delta (boja po značenju)

  → hint 11.5px. Delta je bojana samo ako nosi odluku (+ rok/j cilj).

### 6.9 Grafovi (ručni SVG, tema-first)

- **Donut:** stroke tehnika, thickness ~15, hover deblja segment i dim ostale (opacity 25),

  centar = ukupno ili hover vrijednost; legenda desno s brojem i % .

- **Grupisani stubići:** dva serijska tona (primary + `#3B4A6B` neutralna druga serija),

  radius vrha 3px, stagger animacija 28ms, hover tooltip s tačnim brojevima.

- **Horizontalne trake:** track `border/50`, fill boja samo ako označava prag (grlo=warning,

  prekoračeno=danger, cilj=primary/success).

- Nema 3D, nema gridova u pozadini, osa okvira nema — samo baseline i inline labele.

### 6.10 Empty state

- Okvirna ikona (rounded-lg border elevated) + naslov 13px + objašnjenje 12px (max-w-sm) + akcija.

- Nikad samo "Nema podataka". Uvijek: šta se desilo + šta korisnik može uraditi.

### 6.11 Avatar

- Inicijali (max 2 slova), krug, 6 fiksnih prigušenih nijansi (hash od imena — stabilno).

- Veličine: xs 20px / sm 26px / md 32px. Uz avatarn u listama — ime 12px medium, uloga 10.5px muted.

---

## 7. Semantička mapa domene (statusi → boje)

Ovo je **ukrštanje domene i vizualnog jezika** — mijenja se samo uz izmjenu domene.

### 7.1 Status tiketa

| Status | Ton | Napomena |

|---|---|---|

| Na čekanju | info | ulazno stanje |

| Dodijeljen | primary | ima vlasnika-proces |

| U obradi | primary | aktivan rad |

| Čeka korisnika | warning | pauza; SLA tajmer staje (vidi 7.3) |

| Riješen | success | čeka potvrdu/auto-close |

| Zatvoren | neutral | arhiva; bez boje |

### 7.2 Prioritet (impact × urgency → matrica 3×3)

| Prioritet | Ton | Pravilo |

|---|---|---|

| Nizak | neutral | |

| Srednji | info | |

| Visok | warning | |

| **Kritičan** | **danger** | jedini prioritet koji smije crveniti; u inboxu dodatno Flame ikona |

Matrica: HIGH×HIGH=Kritičan · (HIGH,MEDIUM)/(MEDIUM,HIGH)=Visok ·

(HIGH,LOW)/(MEDIUM,MEDIUM)/(LOW,HIGH)=Srednji · ostalo=Nizak.

Prioritet se **nikad ne bira ručno** — izračunava se; UI uvijek prikazuje "izračunato" porijeklo.

### 7.3 SLA stanje

| Stanje | Ton | UI manifestacija |

|---|---|---|

| U okviru | success | fino, bez panic-a |

| Pod rizikom (75%) | warning | badge + filter "SLA rizik" |

| **Prekoračen** | **danger** | badge, eskalacija, vrh inboxa — traži reakciju |

| Pauziran | warning | chips "pauza" uz tajmer (waiting-for-user / pending-approval) |

### 7.4 Routing ishodi

| Ishod | Ton | Ćelija matrice |

|---|---|---|

| EXACT | success | "E" |

| PARENT_FALLBACK | info | "N" (naslijeđeno) |

| **UNROUTED** | **danger** | "×" — rupa je *vidljiva*, nikad skrivena |

UNROUTED nije greška — ali je vlasnik reda (SUPER_ADMIN) i traži pravilo; zato danger ton.

### 7.5 Katalog

- Lifecycle: Nacrt neutral · Aktivan success · Zastarjelo warning.

- Availability: Dostupno success · Otežan rad warning · Održavanje info.

- Prekid rada se prikazuje kao **info traka** (CalendarClock) — nikad ne blokira create.

### 7.6 Razgovor

- Javni odgovor (svoj igrač): primary tint balon; tudji: surface.

- Interna napomena: warning tint + zaključana ikona (vidljivo samo agentima).

- Sistem: bez balona — italic muted tekst s GitBranch ikonom (routing/SLA događaji).

### 7.7 Audit / aktivnost

Ikonske pločice po tipu: status/assign primary · sla warning · routing info · approval success · security danger · edit neutral.

---

## 8. UX obrasci (patterns)

### 8.1 Novi tiket — vođeni tok (wizard)

`Usluga → Detalji → Baza znanja (KB intercept) → Pregled` sa stepperom (brojčane pločice,

završeno = success kvačica, aktivno = primary punjenje).

- **KB intercept je obavezni korak** i ne smije se preskočiti ni u jednoj verziji forme.

  Dvije karte ishoda: "Članak je riješio moj problem" (success) / "Nastavi sa slanjem" (primary).

- Korak pregleda prikazuje: routing ishod, izračunati prioritet, SLA profil, potrebna odobrenja,

  verziju forme. Success ekran nakon slanja ponavlja te činjenice (uklj. UNROUTED s vlasnikom).

### 8.2 Grupni inbox — vlasništvo

Grupa je vlasnik; agent preuzima ("Preuzmi") ili auto-assign (Least Busy / Round Robin — badge na

grupi). Neusmjereni red ima zaseban info-banner (danger) koji objašnjava pravilo: *grupa se ne

dodjeljuje proizvoljno; rješenje je routing pravilo ili ručna dodjela.*

### 8.3 SLA panel (detalj tiketa)

Dva tajmera (prvi odgovor / rješenje): progress traka h-1.5, preostalo vrijeme desno

`za 2 sata` / `prekoračeno 40 minuta`), pauza = warning chip s Pause ikonom. Odgovor koji je

zadovoljen prikazuje se kao "zadovoljen" (success), nikad retroaktivno crveno.

### 8.4 Odobrenja

Vertikalni timeline: pločica stanja + uloga odobritelja + osoba + razmak; pending korak dobija

"Odobri / Odbij" akcije. Pauza SLA-a dok traje lanac je naglašena u SLA panelu.

### 8.5 Bulk akcije

Selekcija → plutajuća/vrapčeva traka (primary tint) s brojem: Dodijeli grupi, Dodijeli agentu,

Prioritet, Tag. **Bulk close ne postoji** — uz objašnjenje na traci ("zaštita kvaliteta").

### 8.6 Routing coverage matrica

Usluge × OU; ćelije E/N/× po mapi iz 7.4; legenda uvijek vidljiva; tooltip ćelije = usluga, OU path,

ishod, grupa, dubina fallback-a. Sticky prva kolona. Matrica je alat za pronalaženje rupa —

cilj dizajna je da rupa bude primjetna u pola sekunde.

### 8.7 Change log

Svaki zapis: entitet + ko/kad + razlog (italic, u navodnicima) + diff tabela

`polje | prije | poslije`) — "prije" je danger + line-through, "poslije" success.

Tajne se nikad ne prikazuju (redacted).

### 8.8 Obavještenja

Panel 380px: filter Sve/Nepročitane, "Označi sve" (besplatna akcija — odmah), stavke s ikonom

po tipu (ticket/sla/approval/system), nepročitano = primary tačka + deblji naslov; klik vodi na povezanu rutu.

### 8.9 Pretraga

Jedna globalna traka (tiketi + KB + korisnici), ⌘K. Empty state predlaže kreiranje KB članka

za nepogodjeni upit (kesirani upiti → KB gap analiza).

---

## 9. Interakcija i pokret

- **Trajanja:** 150ms hover/focus boje · 160ms dropdowni `pop-in`) · 180ms fade · 240ms ulaz

  stranice `page-in`: translateY 6px + opacity) · 500–700ms grafovi.

- **Kriva:** `cubic-bezier(0.22, 0.68, 0.36, 1)` (brz ulaz, meko slijetanje).

- **Pulsiranje samo za "sve je živo i zdravo"** (status tačka, sporo 2.4s). Upozorenja ne pulsiraju — crvena i statička je dovoljna.

- Stagger 28ms samo na stubićima grafa i ničem drugom.

- **Zabranjeno:** parallax, scroll-jack, auto-play video, skelet loaderi koji trepere cijeli ekran,

  konfeti pri zatvaranju tiketa, "bouncy" easing.

- Mikro-pohvale dozvoljene: hover podizanje bordera, underline na ID-ju, kartica koja "dahne" u elevated ton.

---

## 10. Pristupačnost

- `:focus-visible` = 2px primary/70 prsten, radius 4px — **svugdje**, uključujući custom dugmad.

- Boja nikad nije jedini nosilac značenja (uvijek label/tekst uz ton).

- Svjetlije varijante semantičkog teksta na tintovanim pozadinama (vidi 2.2).

- Tastaturne prečice dokumentovane u samom UI-ju `N` novi tiket, `⌘K` pretraga).

- Checkbox/radio = `accent-color: primary`. Tabela može biti gusta, ali red ne smije ispod 36px.

- Datumsko-vremenski prikazi uvijek imaju i apsolutnu vrijednost (title/tooltip) pored relativne.

---

## 11. Jezik i ton (i18n: BS default, EN fallback)

- Glas: **stručan, kratak, bez marketinških pridjeva**. "Tiket je u neusmjerenom redu — dodajte

  routing pravilo ili ručno dodijelite." umjesto "Ups! Nešto je pošlo po zlu!".

- Terminologija (kanonska, ne mijenjati):

  tiket, usluga, katalog usluga, jedinica porijekla (OU), handler grupa, dodijeliti, preuzeti,

  neusmjeren(i red), odobrenje, prilog, interna napomena, baza znanja, usmjeravanje, eskalacija.

- Datumi: `12. feb 2026.` + `14:30` (24h). Relativno: `prije 3 sata`, `za 45 minuta`,

  `prekoračeno 2 sata`, `jučer`.

- **Pluralizacija (pravilo):** n%10=1 i n%100≠11 → "1 sat"; n%10∈2..4 i n%100∉12..14 → "3 sata";

  inače "5 sati". Isto za minute/dane.

- Decimalni zarez: "6,4 h". Valuta: "1 240 KM" (razmak hiljade).

- Kod/identifikatori ostaju latinični ASCII: `EP-1043`, `UNROUTED`, `DUPLICATE_RULE`,

  `private.ticket.unroutedQueue.enabled`, `OU=Tuzla,DC=ep,DC=local`.

---

## 12. Anti-obrasci — eksplicitno zabranjeno

1. Boja radi ukrasa; crvena bez reakcije.

2. Pill dugmad / radius > 10px / marketing hero unutar shella.

3. Sjene za hijerarhiju umjesto border + surface kontrasta.

4. One-page layout, "scrollirajci" dashboard, horizontalne kartice-mrtveubnice.

5. Emoji i ilustracije-talasi umjesto Lucide ikona (stroke ~1.8–2).

6. "Tiho" stanje: loader bez teksta, greška bez poruke, submit bez loading/error stanja.

7. **Silent fallback grupe** — tiket mora biti vidljivo UNROUTED, nikad "default IT grupa".

8. Ručni odabir prioriteta (zaobilazi matricu); ručni SLA override bez razloga.

9. Admin akcije bez polja za razlog (change log) ili admin ekran bez read-only mogućnosti.

10. Auto-magija bez predloga: auto-assign bez vidljivog moda, auto-close bez obavijesti i reopen politike.

11. Kopiranje marketing SaaS obrazaca ("Get started free", tri cjenovna paketa) u helpdesk alat.

12. Svijetla "dark mode" tema koja je samo invertovana light — hijerarhija se projektuje, ne invertuje.

---

## 13. Test usklađenosti (checklist prije merge-a)

- [ ] Sve neutralne površine su iz 2.1; semantika samo iz 2.2 i mape iz sekcije 7.

- [ ] Radius ≤ 10px; sjene samo na plutajućim slojevima.

- [ ] Page title jedan po stranici; tipografska skala iz sekcije 3.

- [ ] Svaka crvena stvar ima akciju koju korisnik može preduzeti.

- [ ] Svaka admin forma ima polje "Razlog izmjene".

- [ ] Tabular-nums na svim ID-jevima, tajmerima i iznosima.

- [ ] Fokus prsten vidljiv na svakoj interaktivnoj kontroli.

- [ ] Relativno vrijeme ima apsolutni tooltip; pluralizacija pravilna.

- [ ] Empty state: šta se desilo + sljedeći korak.

- [ ] KB intercept prisutan u toku kreiranja tiketa.
