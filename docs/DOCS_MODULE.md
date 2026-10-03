# Docs modul — dizajn (Faza 3 zadatka)

> **Status:** korak **(a)** — dizajn i kriteriji prihvatanja. Kod se piše u koracima (b) backend, (c) frontend
> i (d) Faza 2 modula + CI, po potvrđenom planu sesije od 2026-10-03.
> **Izvori za ovaj dokument:** stvarni kod i dokumentacija u repozitoriju (putanje navedene uz svaku tvrdnju);
> `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` §3 (ciljna struktura wikija); `REVIEW_ANALIZA.md` §5 (stanje
> dokumentacije) i `DOCS_CHANGELOG.md`.
> **Pravilo:** ništa iz ovog dokumenta nije tvrdnja o stanju koda dok se ne implementira; ovdje je *dizajn*.

---

## 1. Svrha i obim

Cilj modula je da dokumentacija koju smo napisali u Fazi 2 (`docs/user-guide/**`, 23 vodiča + teze) bude
**dostupna u samoj aplikaciji**, na jednom mjestu, pretraživo i sa istim tekstom koji je već provjeren protiv
koda. Do sada je ta dokumentacija živjela samo u repozitoriju (`docs/user-guide/`) i u internom alatu za
pregled markdowna — krajnji korisnik je nije mogao otvoriti.

**Obim (prva faza modula):**

| # | Funkcionalnost | Zahtjev |
|---|---|---|
| 1 | Ulaz u modul | stavka menija **Dokumentacija** + ruta `/docs` |
| 2 | Navigacija | lijevi nav po modulima, desni TOC stranice, breadcrumbs, **Prethodna**/**Sljedeća**, anchori |
| 3 | Render | markdown: tabele, code blokovi s isticanjem, slike, callouti; bez sirovog HTML-a |
| 4 | Pretraga | naslov + tekst + tagovi, poštuje uloge korisnika, isticanje pogodaka |
| 5 | Filtriranje | filter po ulozi + datum izmjene stranice |
| 6 | Okolina | responzivnost + postojeća tema, prazno stanje, 404 za nepoznatu stranicu |
| 7 | Faza 2 modula (odvojeno, korak d) | kontekstualna „?“ pomoć, feedback, nedavno posjećeno, štampa/PDF, i18n |
| 8 | Izvor sadržaja | `docs/user-guide/**` + `TEZE-ZA-DOKUMENTACIJU.md` kao **jedini izvor** (single source of truth) |
| 9 | Sigurnost | sanitizacija markdowna, zaštita od path traversal-a, auth guard + provjera uloge na serveru |

**Izvan obima:** uređivanje dokumentacije iz aplikacije (nema editora, nema baze za sadržaj), komentari i
verzije stranica, pretraga kroz kod ili `docs/plans/**`.

---

## 2. Potvrđene odluke (ulaz u dizajn)

Ovo su odluke vlasnika zadatka od 2026-10-03; dizajn ih ne preispituje, samo ih provodi.

| # | Odluka | Posljedica u dizajnu |
|---|---|---|
| D1 | Sadržaj se **ne duplira u kodu**; izvor su `docs/user-guide/**` i teze | Generisano ogledalo + provjera sinhronizacije (§3) |
| D2 | Docs je **B1** varijanta: backend služi sadržaj, ogledalo sadržaja živi u `backend/` (jer frontend build context `./frontend` ne vidi `docs/`, vidi `docker-compose.yml:64–66`) | `backend/content/docs/**` + `backend/Dockerfile` kao integraciona tačka (§5, §9) |
| D3 | Provjera uloge **na serveru** (ne samo u UI) | `DocsAccessService` u svakom čitanju (§6) |
| D4 | `frontend/src/lib/privacy/simple-markdown.ts` se **smije proširiti** | Renderer ostaje jedan, bez nove biblioteke (§7) |
| D5 | Tehničke stranice vide samo **ADMIN/SUPER_ADMIN**; **nema novih rola** | `roles` u frontmatteru; filter u navigaciji i pretrazi (§4) |
| D6 | Jezici: **BS i EN obavezno, prioritet BS** | Sadržaj BS u prvoj fazi; i18n UI odmah, EN sadržaj u koraku (d) (§10, §11) |
| D7 | Frontmatter polja: `title, slug, module, audience, roles, order, tags, updatedAt` | Šema u §3.3 |
| D8 | Dokumenti isporuke: `REVIEW_ANALIZA.md` i `DOCS_CHANGELOG.md` u root, ovaj dokument u `docs/` | Evidencija u koraku (d) |

---

## 3. Sadržaj: izvor, frontmatter i ogledalo

### 3.1 Jedan izvor

```
docs/user-guide/*.md            ← izvor (BS), uređuje se kao i do sada
        │  scripts/generate-docs-content.mjs
        ▼
backend/content/docs/*.md       ← generisano ogledalo (committed; ne uređivati ručno)
backend/content/docs/manifest.json
        │  backend/src/modules/docs/docs-content.repository.ts (čita pri startu)
        ▼
GET /docs/*  →  frontend /docs
```

Ogledalo je **generisani artefakt**: nosi isti tekst, a `manifest.json` nosi metapodatke (slug, dio, publika,
role, order, tagovi, `updatedAt`, broj riječi, spisak naslova za TOC). Ručna izmjena fajla u ogledalu pada na
provjeri sinhronizacije (§9) — jedini način da se sadržaj promijeni je izmjena izvora i ponovno pokretanje
generatora.

### 3.2 YAML frontmatter (u izvoru)

Svaka stranica u `docs/user-guide/` dobija frontmatter na vrhu:

```yaml
---
title: Uloge i permisije (RBAC)
slug: uloge-i-permisije
module: M4
part: administrator
audience: [Agent, Administrator]
roles: [AGENT, ADMIN, SUPER_ADMIN]
order: 20
tags: [rbac, permisije, uloge, 403]
---
```

Pravila:

- `title` — naslov stranice; mora odgovarati naslovu `#` u dokumentu (provjerava se),
- `slug` — jedinstven, `[a-z0-9-]`, koristi se u URL-u `/docs/<slug>`,
- `module` — oznaka modula iz `REVIEW_ANALIZA.md` (M1…M15) ili `—` za uvodne/referentne stranice,
- `part` — jedan od šest dijelova iz `TEZE-ZA-DOKUMENTACIJU.md` §3: `pocetak`, `korisnik`, `agent`,
  `administrator`, `operativa`, `referenca`,
- `audience` — ljudski čitljiva publika (za prikaz),
- `roles` — **mašinski** filter: podskup `USER`, `AGENT`, `ADMIN`, `SUPER_ADMIN` (+ paketske role
  `ASSET_MANAGER`, `PROBLEM_MANAGER`, `CHANGE_MANAGER` kad stranica njima pripada); `roles: []` znači
  „svi prijavljeni korisnici“,
- `order` — redoslijed unutar dijela (10, 20, 30 …),
- `tags` — riječi za pretragu i za budući filter po tagovima.

### 3.3 `updatedAt` i `module` se ne pišu rukom

`updatedAt` **nije** u frontmatteru izvora: generator ga izvodi iz gita (`git log -1 --format=%cs -- <fajl>`),
pa se ne može zaboraviti ažurirati. Ako git istorija nije dostupna (shallow klon), generator zadržava
vrijednost iz postojećeg `manifest.json`, a ako ni nje nema, upisuje `null` i UI prikazuje „—“.

### 3.4 Pokrivenost stranica

Prva faza modula prikazuje **29 stranica**: 23 vodiča iz `docs/user-guide/` i 6 uvodno-referentnih
stranica napisanih u koraku (b):

| Stranica | Dio | Sadržaj | Izvor |
|---|---|---|---|
| **Početak rada** | `pocetak` | prvi koraci: prijava, gdje je šta u meniju, kako otvoriti tiket | izvod iz `prijava-i-mfa.md`, `tiketi.md`, `precice-i-pristupacnost.md` |
| **Pregled modula** | `pocetak` | tabela 15 modula: čemu služi + link na stranicu | `REVIEW_ANALIZA.md` §M1–M15 (samo rečenice o namjeni) |
| **Uloge i dozvole** | `referenca` | skraćeni uvod u role i permisije sa linkom na puni vodič | `uloge-i-permisije.md` |
| **Česta pitanja** | `referenca` | sva pitanja iz sekcija *Česta pitanja i greške* svih vodiča, sa linkovima | 23 vodiča |
| **Rječnik** | `referenca` | pojmovi: tiket, SLA, CSAT, KB, CMDB, CAB, routing, scope, policy paket | vodiči + `TEZE` |
| **Šta je novo** | `referenca` | zadnjih N datuma iz `DOCS_CHANGELOG.md` (samo stavke koje se tiču korisnika) | `DOCS_CHANGELOG.md` |

Novih tvrdnji o ponašanju aplikacije na tim stranicama **nema** — to su izvodi i linkovi. Ako se pokaže da neka
tvrdnja nema izvor, ide u `[NEJASNO]` i ne objavljuje se.

Mapiranje 29 stranica u dijelove (konačno stanje koraka (b); unutar dijela po `order`):

| Dio | Stranice (slugovi) |
|---|---|
| `pocetak` | `pocetak-rad` (5), `instalacija` (10, ADMIN/SUPER_ADMIN), `prijava-i-mfa` (20), `precice-i-pristupacnost` (30), `pregled-modula` (40) |
| `korisnik` | `tiketi` (10), `odobrenja-i-csat` (20), `status-incidenti-i-planirani-prekidi` (30), `baza-znanja` (40), `najave` (50) |
| `agent` | `prosljedjivanje-tiketa` (10), `sabloni-i-playbooks` (20), `realtime-i-obavjestenja` (30), `dezurstva` (40) |
| `administrator` | `katalog-usluga-i-forme` (10), `usmjeravanje-i-prioritet` (20), `sla` (30), `korisnici-oj-i-grupe` (40), `uloge-i-permisije` (50), `policy-paketi` (60), `posta` (70), `nadzorna-ploca-i-izvjestaji` (80), `imovina` (90), `problemi` (100), `promjene` (110) |
| `operativa` | (nema stranica u prvoj fazi — sadržaj iz `docs/ops/**` nije izvor modula) |
| `referenca` | `uloge-i-dozvole` (10), `cesta-pitanja` (20), `rjecnik` (30), `sta-je-novo` (40) |

Dvije izmjene u odnosu na radnu verziju iz koraka (a):

- **`usmjeravanje-i-prioritet` je u dijelu `administrator`**, ne `agent`: ekran za pravila usmjeravanja je u
  administraciji (M7), a vodič ga opisuje s te strane; `agent` dio pokriva rad na tiketima i dežurstva.
- **`referenca` je stvarni dio** (nije samo napomena): četiri uvodno-referentne stranice, sve bez rolnih
  ograničenja.

**Za potvrdu:** `imovina` sadrži i korisnički dio („Moja imovina“), a `tiketi` sadrži i agentske sekcije; oba su
smještena u dio po *primarnoj* publici. Alternativa je da se dijelovi režu po sekcijama unutar vodiča, što bi
značilo razdvajanje jednog `.md` fajla na dva — skuplje za održavanje.

**N1 (8 vodiča bez propisanih sekcija) je zatvoren u koraku (b):** svih 29 stranica ima istih osam sekcija
(`Čemu služi ovaj modul` … `Povezani moduli`), provjereno skriptom `scripts/check-docs-content.mjs` i
`node scripts/generate-docs-content.mjs --check`.

---

## 4. Navigacija i struktura stranice

```
/docs                          → prva dostupna stranica (ili prazno stanje)
/docs/<slug>                   → stranica
/docs?q=<upit>                 → rezultati pretrage
```

| Element | Sadržaj | Izvor podataka |
|---|---|---|
| Lijevi nav | 6 dijelova; unutar dijela stranice po `order`; prikazuje samo ono što korisnik smije otvoriti | `GET /docs/navigation` |
| Breadcrumbs | `Dokumentacija › <dio> › <stranica>` | isti odgovor |
| Desni TOC | naslovi `##`/`###` sa anchorima; aktivna sekcija se prati skrolom | `manifest.json` (naslovi + anchori) |
| Prethodna / Sljedeća | susjedi u istom dijelu po `order` | `GET /docs/pages/:slug` |
| Anchori | `#<slugifikovan-naslov>`; klizni link pored naslova | slugifikacija u §7.2 |
| Filter po ulozi | prekidači za publiku (Korisnik/Agent/Administrator/Operativa); mijenja lijevi nav i pretragu | klijentski filter nad `roles`/`audience` |
| Datum izmjene | „Ažurirano: <datum>“ u zaglavlju stranice | `updatedAt` iz manifesta |

Prazno stanje (nema stranica za ulogu / nema rezultata pretrage) i 404 (nepoznat slug) su obavezni ekrani sa
porukom i linkom na `/docs`.

---

## 5. Backend

### 5.1 Fajlovi

```
backend/src/modules/docs/
  docs.module.ts                     — registracija u AppModule
  docs.controller.ts                 — GET /docs/navigation, /docs/pages/:slug, /docs/search
  docs.service.ts                    — poslovna logika (navigacija, stranica, pretraga)
  docs-content.repository.ts         — čita ogledalo pri startu, drži indeks u memoriji
  docs-access.service.ts             — provjera `roles` protiv sesije (D3, D5)
  docs.constants.ts                  — kodovi grešaka, limiti, putanja sadržaja
  docs.types.ts                      — tipovi odgovora i manifesta
  docs.error.ts                      — `DocsError` sa kodovima
  *.spec.ts                          — testovi po fajlu
backend/content/docs/                — generisano ogledalo (ne uređivati ručno)
scripts/generate-docs-content.mjs    — generator ogledala + manifesta
scripts/check-docs-content.mjs       — CI validacija sadržaja i sinhronizacije
```

### 5.2 Endpointi

| Ruta | Odgovor | Napomena |
|---|---|---|
| `GET /docs/navigation` | dijelovi + stranice vidljive korisniku + `updatedAt` | bez `roles` filtera za tuđe stranice |
| `GET /docs/pages/:slug` | `title`, `slug`, `part`, `module`, `audience`, `tags`, `updatedAt`, `markdown`, `toc[]`, `previous`/`next` | nepoznat **ili** nedozvoljen slug → 404 (§6) |
| `GET /docs/search?q=&limit=` | `results[]` sa `slug`, `title`, `part`, `excerpt`, `matches`, `score` | filtrirano po rolama, `limit` ≤ 50 |

Faza 2 modula (korak d) dodaje: `POST /docs/pages/:slug/feedback` (ocjena „je li pomoglo“, ide u postojeću
tabelu obavještenja/audita po odluci iz koraka (d)), `GET /docs/recent` (nedavno posjećeno — čuva se lokalno u
pregledaču, endpoint nije potreban) i `GET /docs/pages/:slug/print` (isti markdown, drugačiji CSS za štampu).

Svi endpointi vraćaju `Cache-Control: no-store` (sadržaj zavisi od uloga) i ne diraju bazu.

### 5.3 Učitavanje sadržaja

- Čita se **jednom, pri startu procesa** (`OnModuleInit`), iz `backend/content/docs/` (env `DOCS_CONTENT_ROOT`
  nije potreban; putanja se izvodi iz `__dirname` + `../../../content/docs`, što u kontejneru odgovara
  `/usr/app/content/docs`).
- U memoriji se drži: `Map<slug, page>`, lista dijelova, invertovani indeks `token → slugovi` i naslovi za TOC.
  Obim je mali (Faza 2: ~5 300 linija / ~400 KB), pa indeksiranje traje milisekunde i ne dira bazu.
- Ako ogledalo nedostaje ili je `manifest.json` neispravan, modul **ne ruši aplikaciju**: endpointi vraćaju
  503 `DOCS_CONTENT_UNAVAILABLE`, a health ruta ostaje zelena (dokumentacija nije kritična za rad tiketa).

---

## 6. Autorizacija i sigurnost

| Rizik | Mjera | Gdje se provodi |
|---|---|---|
| Neautorizovan čitanje | `SessionAuthenticationGuard` na kontroleru | `docs.controller.ts` |
| Čitanje tehničke stranice bez role | `roles` iz frontmattera ↔ role sesije; **404** (ne 403) za nepoznat i za nedozvoljen slug, da se ne otkriva postojanje internih stranica | `docs-access.service.ts` |
| Filtriranje navigacije i pretrage | isti servis, prije sastavljanja odgovora | `docs.service.ts` |
| Path traversal (`/docs/pages/../../etc/passwd`) | slug se validira regexom `^[a-z0-9-]{1,80}$` **prije** bilo kakvog pristupa fajlu; stranice se traže isključivo u `Map`-i iz manifesta, nikad `path.join` sa korisničkim ulazom | `docs.service.ts` |
| XSS kroz markdown | renderer ne emituje sirov HTML: `<`, `>` i `&` se escapiraju i u tekstu i u code blokovima; nema `dangerouslySetInnerHTML` sa neescapiranim sadržajem | `frontend/src/lib/privacy/simple-markdown.ts` (+ `markdown-view.tsx`) |
| XXS kroz linkove | dozvoljene su samo `http(s):`, `mailto:` i relativne putanje; `javascript:` se odbija | isti fajl |
| Tajne u dokumentaciji | `check-docs-content.mjs` traži obrasce (`password=`, `token=`, `Bearer `, privatni ključevi, `postgresql://…:…@`) i pada | CI |
| Curenje internih putanja | stranice iz `docs/plans/**` i `docs/ops/**` nisu u izvoru modula | generator |

**Pravilo za tehničke stranice:** `instalacija`, `dezurstva`, dijelovi o backup-u i tajnama nose `roles:
[ADMIN, SUPER_ADMIN]`; sadržaj o Coolify/backup-u se pritom ne duplira iz `ops/**` — stranica opisuje samo ono
što je već u vodiču.

---

## 7. Renderer i pretraga

### 7.1 Proširenje `simple-markdown.ts`

Postojeći renderer (privatnost, `markdown-view.tsx`) već pokriva naslove, liste, tabele i code blokove. Za Docs
modul se dodaju:

1. **anchori** (`id` na `h2`/`h3` + klizni link),
2. **callouti** (`> **Napomena:**` / `> **Upozorenje:**` u vizuelno izdvojene blokove),
3. **slike** (`![alt](putanja)`; putanja se razrješava relative na `/docs-assets/…` i validira u CI),
4. **isticanje** koda (postojeći jednostavni highlighter se proširuje na `json`, `ts`, `bash`, `sql`).

Sve četiri stavke se dodaju **u isti fajl i njegove testove**, bez nove biblioteke (D4). Ako se pokaže da
isticanje koda zahtijeva veliku zavisnost, odluka se vraća vlasniku zadatka.

### 7.2 Slugifikacija naslova

`naslov → mala slova, dijakritika u ASCII (č→c, ć→c, ž→z, š→s, đ→d), ostalo → '-', bez duplih '-'`.
Sudar slugova u istom dokumentu rješava se sufiksom `-2`, `-3`. Isti algoritam koriste generator (TOC u
manifestu) i klijent (klizanje na sekciju), pa se anchor ne može razići.

### 7.3 Pretraga

- **Indeks:** inverzni indeks nad tokenima iz naslova, tagova i teksta; tokenizacija po ne-slovima, uz
  normalizaciju dijakritike (isti algoritam kao slugifikacija), pa `permisije` nalazi i `permisija`.
- **Rangiranje:** naslov > tagovi > prva pojava u tekstu; broj pojava kao tie-breaker; najviše 50 rezultata.
- **Isticanje:** server vraća `excerpt` sa markacijama `<mark>…</mark>` **kao podatke** (`excerptParts[]`);
  klijent sam gradi `<mark>` element — server nikad ne vraća HTML.
- **Uloge:** pretraga radi samo nad stranicama koje korisnik smije otvoriti; ako je filter po ulozi uključen u
  UI-u, filtrira se i po njemu.
- **Keširanje:** indeks se gradi jednom pri startu; nema I/O po zahtjevu i nema dodatnog opterećenja baze.
- **Ograničenja (priznata):** nema stemminga za BS, nema „fuzzy“ pretrage; upit kraći od 2 znaka se odbija
  (`DOCS_QUERY_TOO_SHORT`), duži od 100 znakova se skraćuje.

---

## 8. Frontend

```
frontend/src/pages/docs-page.tsx            — /docs/:slug (jedna stranica, dvije kolone)
frontend/src/components/docs/
  docs-sidebar.tsx                          — lijevi nav po dijelovima
  docs-toc.tsx                              — desni TOC + aktivna sekcija
  docs-search.tsx                           — polje + rezultati + isticanje
  docs-breadcrumbs.tsx
  docs-pager.tsx                            — Prethodna / Sljedeća
  docs-role-filter.tsx                      — filter po publici/roli
  docs-empty-state.tsx                      — prazno stanje i 404
  use-docs-navigation.ts                    — hook (fetch + keš u memoriji sesije)
  use-docs-page.ts
frontend/src/lib/docs/docs-slug.ts          — `docsSlug('…')` helper za kontekstualnu „?“ pomoć
```

Integracione tačke (minimalne, sve ostalo je novi kod modula):

| Tačka | Fajl | Promjena |
|---|---|---|
| Ruta | `frontend/src/app/router.tsx` | `docs` ruta sa `RequireAuth` |
| Meni | `frontend/src/lib/navigation.ts` | nova stavka `docs` u dijelu **Pregled** (ili **Administracija** — potvrditi) |
| Vidljivost | `frontend/src/lib/session/route-access.ts` | `navigationAccessKinds.docs` = svaki prijavljeni korisnik |
| i18n | `frontend/src/i18n/locales/{bs,en}/common.json` | `navigation.docs` + `docs.*` (BS i EN) |
| Tema/responzivnost | postojeći Tailwind tokeni i `ApplicationShell` | bez novih boja i brendova |

Prihod od postojećih komponenti: `RequireAuth`, `ApplicationShell`, `EmptyState`/`ErrorState` ako postoje,
`markdown-view.tsx`. Modul **ne** uvodi novi state menadžer; keš navigacije je običan `useState`/`useMemo` u
hooku, sa `Cache-Control: no-store` na serveru.

Kontekstualna „?“ pomoć (korak d) koristi `docsSlug('uloge-i-permisije')` i link na `/docs/<slug>#<anchor>`;
`check-docs-content.mjs` provjerava da svaki literal iz koda postoji u manifestu.

---

## 9. Build, generisanje i CI

| Korak | Komanda | Kada |
|---|---|---|
| Generisanje ogledala | `node scripts/generate-docs-content.mjs` | ručno poslije izmjene `docs/user-guide/**` i pri svakom commit-u tih fajlova |
| Validacija | `node scripts/check-docs-content.mjs` | lokalno i u CI (uz postojećih 7 `check-*`) |
| Build slike | `backend/Dockerfile`: dodati `COPY --from=builder /usr/app/content ./content` u runtime stage | jednom, kao integraciona tačka |

Šta `check-docs-content.mjs` provjerava:

1. **frontmatter** — sva obavezna polja, `slug` jedinstven i u `[a-z0-9-]`, `part` iz dozvoljene liste,
   `roles` samo poznate role, `order` broj;
2. **sinhronizacija** — ponovno generisanje u memoriji daje identične fajlove (`git diff --exit-code` u CI);
3. **veze** — svaki relativni markdown link unutar `docs/user-guide/**` pokazuje na postojeći fajl/anchor;
4. **slike** — svaka referenca postoji i nije izvan `docs/user-guide/assets/`;
5. **tajne** — obrasci iz §6;
6. **slugovi iz koda** — svaki `docsSlug('…')` literal postoji u manifestu;
7. **anchori** — jedinstveni unutar stranice.

Pravilo za repozitorij (dodaje se u `README.md`/`CONTRIBUTING.md` u koraku d): **izmjena funkcionalnosti
povlači izmjenu Docs stranice u istom commitu** — isto pravilo koje `TEZE` §1 već traži za teze.

---

## 10. Faza 2 modula (korak d)

| Funkcionalnost | Dizajn | Zavisnost |
|---|---|---|
| Kontekstualna „?“ pomoć | dugme u zaglavlju ekrana → `/docs/<slug>#<anchor>`, mapiranje ekran→slug u `docs-slug.ts` | korak (b) daje slugove |
| Feedback („je li stranica pomogla?“) | dvije ikone na dnu stranice; zapis u postojeću audit/obavijesnu tabelu — **odluka u koraku d** | nema novih tabela ako se ne odobri |
| Nedavno posjećeno | lista zadnjih 5 stranica u `localStorage` (bez servera, bez ličnih podataka) | nema |
| Štampa / PDF | `window.print()` + print CSS (bez server PDF-a) | nema |
| i18n sadržaja | EN verzije stranica kao `docs/user-guide/en/<slug>.md`; jezik se bira u zaglavlju modula, fallback BS | prevod: odvojen posao, ne u ovom zadatku |

---

## 11. Koraci isporuke

| Korak | Sadržaj | Dokaz |
|---|---|---|
| **(a)** | ovaj dokument + kriteriji prihvatanja + poravnanje `instalacija.md` i `prijava-i-mfa.md` na 8 obaveznih sekcija | dokument u `docs/`, red u `DOCS_CHANGELOG.md` |
| **(b)** | frontmatter na 23 vodiča, 6 uvodnih stranica, generator + ogledalo + `manifest.json`, backend modul, testovi, Dockerfile | `npx jest` zeleno, `check-docs-content.mjs` prolazi, `npm run build` + Dockerfile provjeren lokalno |
| **(c)** | `/docs` UI (nav, TOC, breadcrumbs, pretraga, filter, 404, prazno stanje, responzivnost), i18n BS/EN, prošireni renderer | `tsc`, `check-a11y-static`, `check-theme-contrast`, `check-hooks-order`, ručni pregled |
| **(d)** | Faza 2 modula („?“, feedback, nedavno, štampa, i18n okvir), CI provjera + README/CONTRIBUTING pravilo, evidencija (`REVIEW_ANALIZA.md`, `DOCS_CHANGELOG.md`), nove ocjene | 8/8 `check-*`, sažetak i commit po koraku |

---

## 12. Kriteriji prihvatanja

- [ ] **1. Ulaz u modul:** stavka menija **Dokumentacija** vidi se svakom prijavljenom korisniku i vodi na
  `/docs`; ruta je zaštićena prijavom.
- [ ] **2. Navigacija:** lijevi nav po modulima/dijelovima, desni TOC sa anchorima, breadcrumbs,
  **Prethodna**/**Sljedeća**; aktivna stranica i aktivna sekcija su vidljivo označene.
- [ ] **3. Render:** tabele, code blokovi s isticanjem, slike i callouti se prikazuju; sirov HTML iz sadržaja
  se **ne** izvršava (escapira se).
- [ ] **4. Pretraga:** radi po naslovu, tekstu i tagovima, poštuje uloge korisnika (ne prikazuje nedozvoljene
  stranice) i ističe pogotke; upit kraći od 2 znaka vraća jasnu poruku.
- [ ] **5. Filtriranje:** filter po ulozi mijenja lijevi nav i rezultate pretrage; datum izmjene (`updatedAt`)
  prikazan je na svakoj stranici i dolazi iz gita, ne iz ručnog unosa.
- [ ] **6. Okolina:** stranice su responzivne (mobilni: sklopiv nav i TOC), koriste postojeću temu; prazno
  stanje i 404 imaju poruku i link na `/docs`.
- [ ] **7. Faza 2 modula:** kontekstualna „?“ pomoć vodi na tačnu stranicu/anchor, feedback se bilježi, lista
  nedavno posjećenih radi, štampa/PDF daje čitljiv dokument, i18n okvir radi (BS sadržaj, EN struktura).
- [ ] **8. Izvor sadržaja:** sve što se prikazuje dolazi iz `docs/user-guide/**` + `TEZE-ZA-DOKUMENTACIJU.md`
  preko generisanog ogledala; nema ručno prepisanog sadržaja u kodu, a provjera sinhronizacije pada ako se
  ogledalo i izvor raziđu.
- [ ] **9. Sigurnost i validacija:** markdown je sanitizovan (bez XSS-a), slug je validiran (bez path
  traversal-a), svi endpointi su iza auth guarda uz provjeru uloge na serveru, u dokumentaciji nema tajni, a CI
  provjerava frontmatter, jedinstvene slugove, veze, slike i prisustvo slugova iz koda.

---

## 13. Rizici i otvorena pitanja

| # | Rizik / pitanje | Plan |
|---|---|---|
| R1 | `backend/Dockerfile` mora kopirati `content/` u runtime stage — ako se zaboravi, modul u produkciji vraća 503 | integraciona tačka u koraku (b), provjera `test -d content/docs` u Dockerfile-u |
| R2 | Shallow klon u CI-u ne daje `updatedAt` iz gita | fallback na postojeći manifest (§3.3) |
| R3 | Slike u dokumentaciji: gdje ih držati (repo vs. uploads) | `docs/user-guide/assets/` + kopiranje u ogledalo; bez uploada kroz UI |
| R4 | Mjesto stavke **Dokumentacija** u meniju (Pregled ili Administracija) | **za potvrdu** u koraku (a); predlog: dio **Pregled**, jer je dostupna svima |
| R5 | Feedback: nova tabela ili postojeći audit zapis | **za potvrdu** u koraku (d); predlog: postojeći `AuditLog` (bez nove tabele) |
| R6 | Razdvajanje vodiča koji služe dvjema publikama (`tiketi`, `imovina`) | radna odluka u §3.4; promjena samo ako se potvrdi drugačije |
| R7 | Dužina stranica: `tiketi.md` i `baza-znanja.md` su veliki (preko 200 linija) | TOC + anchori; ako zatreba, podjela na sekcije-stranice u koraku (d) |
| R8 | 8 tematskih vodiča nema strukturu od 8 sekcija (nalaz N1) | odluka u koraku (a): poravnati u (b) ili `layout: topic` |
| R9 | Shallow klon bez gita: `updatedAt` i sinhronizacija ogledala u CI-u | manifest kao izvor zadnje poznate vrijednosti; CI koristi puni checkout (ili `fetch-depth: 0`) |

---

## 14. Veza s ostatkom zadatka

- Ovaj dokument **ne mijenja** `REVIEW_ANALIZA.md` (audit) niti `docs/plans/**`; nalazi uočeni tokom
  implementacije idu u `DOCS_CHANGELOG.md`, a stanje modula u `REVIEW_ANALIZA.md` u koraku (d).
- Poslije koraka (d) slijede popravke po valovima iz zaključka Faze 2 (`REVIEW_ANALIZA.md`,
  `# Zaključak Faze 2`, §4), počevši od vala 1.
