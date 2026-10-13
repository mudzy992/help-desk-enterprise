# Modul 16: `/admin/teams` (integracija sa Microsoft Teams)

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, provjera backend guarda, provjera e2e testa). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **TM** (teams admin).

Provjere izvršene u sandboxu:
- **Čitanje u cijelosti:** `pages/teams-admin-page.tsx` (515 linija), `services/teams-api.ts` (140, potpisi i tipovi), `lib/teams/map-teams-error.ts` (18), `components/teams/adaptive-card-preview.tsx` (195, mjesta sa `href`).
- **Backend:** `backend/src/modules/teams/teams-admin.controller.ts` (dekoratori: `SessionAuthenticationGuard`, `RoleGuard`, `RequirePermissions(integrationsTeamsManage)` na svim `admin/*` rutama).
- **Rutiranje:** `app/router.tsx` (~251–260, `RequireAccess` sa `canOpenTeamsAdminPage`), `lib/session/route-access.ts` (154).
- **Testovi:** `e2e/tests/33-teams-simulator.spec.ts` (dva testa: simulirani lični chat, tiket, odgovor, stranica admina, axe; i T4b: kartica tiketa, KB pretraga, status, komande agenta). `lib/teams/adaptive-card-text.spec.ts` (tekst kartice). Nema komponentskih testova za stranicu.
- **Pretraga:** `grep` za `href=`, `!` (non-null), `in`-operator nad mapama, `setInterval`.

---

## Modul

`/admin/teams` je administracija integracije sa Microsoft Teams: tri kartice (status, kanali, simulator). Status prikazuje režim (isključeno, simulator, live), statistiku, provjeru spremnosti (readiness) i preuzimanje Teams paketa (ZIP, bs ili en). Kanali povezuju grupe sa Teams kanalima i biraju događaje za obavještenja. Simulator (samo ako je uključen) šalje aktivnosti kao da je korisnik u Teams-u i prikazuje odgovore bota, uključujući adaptivne kartice.

---

## Povezani fajlovi i folderi

| Fajl | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/teams-admin-page.tsx` | Stranica sa tri taba: `StatusTab`, `ChannelsTab`, `SimulatorTab` i pomoćne funkcije | 515 |
| `frontend/src/services/teams-api.ts` | API poziv za status, readiness, paket, kanale, simulator | 140 |
| `frontend/src/lib/teams/map-teams-error.ts` | Mapiranje grešaka u ključ prevoda | 18 |
| `frontend/src/components/teams/adaptive-card-preview.tsx` | Prikaz adaptivne kartice (tekst, činjenice, akcije) | 195 |
| `frontend/src/lib/teams/adaptive-card-text.ts` | Parsiranje teksta kartice | — |
| `frontend/src/lib/download/trigger-blob-download.ts` | Preuzimanje paketa | — |
| `backend/src/modules/teams/teams-admin.controller.ts` | Admin API (permisija `integrationsTeamsManage`) | — |
| `e2e/tests/33-teams-simulator.spec.ts` | E2E i axe skeniranje | — |

---

## Trenutna implementacija

**Stranica.** `TeamsAdminPage` učitava `getTeamsStatus()` jednom (`loadStatus` kao `useCallback` pa `useEffect(loadStatus, [loadStatus])`). Tab „Simulator“ se pojavljuje samo kad je `status.simulatorAvailable`. Dok status nije stigao, prikazuje se `PanelSkeleton`.

**Status.** Kartica sa činjenicama (`fact` helper), značka režima, vrijeme zadnje poruke (`RelativeTime`), i link na podešavanja kad dodatak nije uključen. Kartica „provjera spremnosti“ poziva `POST …/readiness`, prikazuje ✓/✗ ikone i detalje po provjeri, pa ukupnu značku. Kartica paketa ima dva dugmeta (bs, en).

**Kanali.** Tabela sa grupom, kanalom (team/channel), režimom i događajima kao checkbox-ovi (`eventKeys` mapa), opcijom „uključi naslov“ i dugmetom za uklanjanje sa `ConfirmDialog` (intent `danger`). Svaka promjena poziva `updateTeamsChannel` pa zamjenjuje listu iz odgovora.

**Simulator.** Birač korisnika (`listUsersSummary`, samo aktivni), segment „lično / kanal“, dugme „instaliraj“, transkript koji se osvježava svake 4 s (`setInterval`), polje za poruku (maks. 2000 znakova) i kartice sa akcijama bota (`onCardAction` šalje `action` aktivnost).

**Greške.** `mapTeamsError` vraća jedan od pet ključeva (`appIdRequired`, `publicUrlRequired`, `simulatorOff`, `forbidden` za 403, `generic`). Prikazuju se kao `<p>` sa `errorTextClassName`.

**Pristup.** Route: `canOpenTeamsAdminPage`. Backend: `RequirePermissions(integrationsTeamsManage)` na svakoj `admin/*` ruti. Ruta za korisnika (`me`) je otvorena za prijavljene korisnike (drugi kontroler).

**Dobro urađeno.**
- Backend provjerava permisiju na svakoj admin ruti.
- Identifikatori u URL-u prolaze `encodeURIComponent`.
- Kritična brisanja idu kroz `ConfirmDialog` sa `intent="danger"`.
- Dugmad se onemogućavaju za vrijeme operacije (`busy`).
- Provjera spremnosti ne oslanja se samo na boju: ikona ima `aria-label` (ok/fail), a tekst je prikazan.
- Kanali imaju `<table>` sa zaglavljima.
- E2E test sa axe skeniranjem za oba taba.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Veličina stranice | Jedna datoteka od 515 linija sa tri taba i pomoćnim funkcijama (TM2) | Jedna komponenta po tabu, hook za simulator |
| Greške | Četiri nezavisna `errorKey` stanja, prikaz kao obično `<p>`, bez `role="alert"` i bez ID-a zahtjeva (TM3) | `ApiErrorText` kao u ostatku aplikacije |
| Simulator osvježavanje | Interval od 4 s bez provjere vidljivosti tab-a i bez zaštite od preklapanja zahtjeva (TM1) | Pauza kad tab nije vidljiv; jedan zahtjev u letu |
| Greška simulatora | Greška osvježavanja ostaje prikazana i nakon uspješnog osvježavanja (TM1) | Greška se briše pri uspjehu |
| Adaptivne kartice | `Action.OpenUrl` `href` prihvata bilo koju šemu (TM5) | Samo `https:` i `http:` |
| Tipovi | `Record<string, …>` za događaje, `!` non-null (TM6) | `Record<TeamsEvent, …>` i provjera vlasnih ključeva |
| Pristupačnost | `aria-label` na `svg` bez `role="img"` (TM4) | `role="img"` ili tekst za čitače |

---

## Gap analiza

1. **Simulator osvježava sam od sebe, bez zaštite (TM1, srednja).** `useEffect` u `SimulatorTab` pokreće `setInterval(refresh, 4000)`. Nema provjere `document.visibilityState` (tab u pozadini i dalje šalje zahtjeve), a sporo mreže mogu stvoriti gomilu zahtjeva jer nema zastavice „u letu“. Također, `refresh` u `catch` postavlja `errorKey`, ali u `try` uspješnog osvježavanja se ne briše. Greška ostaje na ekranu i nakon oporavka, dok se ne uradi uspješno slanje. Pri promjeni korisnika ili opsega stari transkript ostaje prikazan do sljedećeg odgovora (kratko prikazivanje tuđih poruka u istom simulatoru).
2. **Veličina i odgovornost (TM2, srednja).** `teams-admin-page.tsx` ima 515 linija: stranica, `StatusTab` (~130), `ChannelsTab` (~120), `SimulatorTab` (~140), `inboundLabel`, `cardsOf`. Logika simulatora (učitavanje, interval, slanje, scroll) je u komponenti, pa se ne može testirati bez renderovanja. Preporuka: `components/teams/status-tab.tsx`, `channels-tab.tsx`, `simulator-tab.tsx`, i hook `use-teams-simulator.ts`.
3. **Greške na više mjesta (TM3, srednja).** `TeamsAdminPage`, `StatusTab`, `ChannelsTab` i `SimulatorTab` imaju svaki svoj `errorKey` i svoj `<p>`. Greška nema `role="alert"`, pa je čitač ekrana ne najavljuje, i nema ID-a zahtjeva (podrška ne može da je prati). U ostatku aplikacije postoji `ApiErrorText` koji to radi. `mapTeamsError` pri tome ne čuva `requestId`.
4. **Pristupačnost ikona i transkripta (TM4, srednja).** `CheckCircle2` i `XCircle` imaju `aria-label`, ali nemaju `role="img"` (ili `aria-hidden` uz tekst), pa čitači ih često ignorišu. Transkript je `aria-live="polite"` na kontejneru koji se osvježava svake 4 s. Prazan `<th aria-label>` u tabeli kanala treba `sr-only` tekst. Ikona dugmeta „osvježi“ ima `aria-label` (dobro).
5. **Nevalidirani `href` u adaptivnim karticama (TM5, srednja, odbrana u dubini).** U `adaptive-card-preview.tsx` `href={asText(action.url)}` (i za `select.url`) provjerava samo da je vrijednost string. Šema nije provjerena, pa je `javascript:` URL moguć ako kartica dođe iz nepouzdanog izvora. Trenutno kartice generiše backend, ali poruke iz ticketa mogu ući u tekst kartice. Preporuka: dozvoliti samo `https:` i `http:`, inače ne prikazivati link.
6. **Tipovi događaja (TM6, niska).** `eventKeys: Record<string, …>` sa `event in eventKeys` i `eventKeys[event]!`. Operator `in` vidi i svojstva iz prototipa (`"constructor" in {}` je `true`), a `!` isključuje provjeru. Tip treba biti `Record<TeamsEvent, …>` (ili `Map`), a `TeamsEvent` iz `teams-api.ts`.
7. **Ponovljeni obrazac (TM10, niska).** Blok `setBusy(true); setErrorKey(null); try { … } catch { setErrorKey(…) } finally { setBusy(false) }` ponavlja se u `runReadiness`, `runPackage`, `ChannelsTab.run`, `send`. Mali hook (`useAsyncAction`) smanjio bi to.
8. **Tekst se briše prije slanja (TM8, niska).** U simulatoru `setText("")` se radi prije `send`. Ako slanje padne, poruka je izgubljena i korisnik mora ponovo da je unese.
9. **Birač korisnika bez pretrage (TM9, niska).** `listUsersSummary()` učitava sve aktivne korisnike u `<select>`. U većoj organizaciji je dugačak spisak i sporo se učitava. Preporuka: pretraga ili ograničen broj rezultata.
10. **Tab koji nestaje (TM11, niska).** Ako se `simulatorAvailable` promijeni na `false` dok je aktivan tab „simulator“, sadržaj nestane, a tab nije u listi. Nema prelaska na „status“.
11. **Sitnice (TM7, TM12, niska).** `onOpenChange={(open) => (open ? null : setPendingRemove(null))}` je teško čitljiv obrazac (treba `if (!open)`). Komentar „Paket 3.1 (§16)“ u zaglavlju. `fact` helper unutar komponente se re-kreira pri svakom renderu.

**Što je dobro:** backend provjerava permisiju na svim admin rutama; identifikatori su enkodirani; brisanje ide kroz `ConfirmDialog`; dugmad su onemogućena za vrijeme akcije; readiness ne zavisi samo od boje; tabela kanala ima zaglavlja; e2e test sa axe skeniranjem za sva tri taba; `mapTeamsError` vraća prevedive ključeve, a ne sirove poruke.

---

## Mišljenje tima i preporuka

Stranica je funkcionalno potpuna i pokrivena e2e testom sa a11y skeniranjem, a backend kontrola pristupa je ispravna. Problemi su u organizaciji koda (jedna velika datoteka sa tri različita toka) i u ponašanju simulatora (polling, sticky greška, stari transkript). Ni jedan od njih nije sigurnosna rupa u backendu. TM5 (`href`) je odbrana u dubini, ali je jeftina za popravku.

Preporuka redom:
1. TM1: simulator polling pauzirati kad tab nije vidljiv; jedan zahtjev u letu; greška se briše pri uspjehu; čistiti transkript pri promjeni korisnika i opsega.
2. TM5: validacija šeme u `href` adaptivnih kartica.
3. TM2 i TM3: razdvojiti stranicu u tabove i hook; zajednički `ApiErrorText`, sa ID-om zahtjeva.
4. TM4: `role="img"` na ikonama; `sr-only` tekst za prazan `th`; razmotriti `aria-live` samo na novim porukama.
5. TM6, TM8, TM9, TM10, TM11, TM7, TM12: tipovi, tekst poruke, pretraga korisnika, fallback taba, čišćenje.
6. Dodati komponentske testove za `SimulatorTab` (polling, greška, promjena korisnika) i za `ChannelsTab` (uklanjanje sa potvrdom).

---

## Bugovi i neusklađenosti

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| TM1 | Srednja | Polling simulatora bez provjere vidljivosti i bez zaštite od preklapanja; greška osvježavanja se ne briše pri uspjehu; stari transkript pri promjeni korisnika ili opsega. | `pages/teams-admin-page.tsx` (`SimulatorTab`, `refresh`) |
| TM2 | Srednja | Stranica od 515 linija sa tri taba i logikom u istoj datoteci. | `pages/teams-admin-page.tsx` |
| TM3 | Srednja | Četiri `errorKey` stanja, bez `role="alert"`, bez ID-a zahtjeva; `ApiErrorText` se ne koristi. | `pages/teams-admin-page.tsx`, `lib/teams/map-teams-error.ts` |
| TM4 | Srednja (a11y) | Ikone sa `aria-label` na `svg` bez `role="img"`; prazan `<th aria-label>`; `aria-live` na često osvježavanom kontejneru. | `pages/teams-admin-page.tsx` (`StatusTab`, `ChannelsTab`, `SimulatorTab`) |
| TM5 | Srednja (odbrana u dubini) | `href` iz `Action.OpenUrl` i `select.url` bez provjere šeme. | `components/teams/adaptive-card-preview.tsx` (linije 83, 148) |
| TM6 | Niska | `Record<string, …>`, `event in eventKeys`, `eventKeys[event]!`. | `pages/teams-admin-page.tsx` (`eventKeys`, `ChannelsTab`) |
| TM7 | Niska | `onOpenChange={(open) => (open ? null : …)}` obrazac; komentar sa oznakom plana. | `pages/teams-admin-page.tsx` |
| TM8 | Niska | Tekst poruke se briše prije slanja i gubi se pri grešci. | `pages/teams-admin-page.tsx` (`SimulatorTab`, `form`) |
| TM9 | Niska | Birač korisnika bez pretrage ili ograničenja. | `pages/teams-admin-page.tsx` (`listUsersSummary`) |
| TM10 | Niska | Ponovljeni obrazac busy/error/finally u četiri funkcije. | `pages/teams-admin-page.tsx` |
| TM11 | Niska | Aktivni tab „simulator“ ostaje kad simulator postane nedostupan. | `pages/teams-admin-page.tsx` (`TeamsAdminPage`) |
| TM12 | Niska | `fact` helper se re-kreira pri svakom renderu. | `pages/teams-admin-page.tsx` (`StatusTab`) |

---

## Ocjena: 6/10

Obrazloženje:
- **Plus:** backend kontrola pristupa po permisiji na svakoj ruti; `ConfirmDialog` za brisanje; readiness bez oslanjanja na boju; e2e test sa axe skeniranjem za sva tri taba; prevodivi ključevi grešaka; enkodirani identifikatori.
- **Minus:** stranica od 515 linija bez razdvajanja; simulator sa polling-om bez zaštite i sticky greškom; greške bez `role="alert"` i bez ID-a zahtjeva; nevalidiran `href` u karticama; nema komponentskih testova.
- Ocjena je niža od modula 15 zbog veličine datoteke i ponašanja simulatora. Backend sigurnost je ispravna.

---

## Must-Have kandidati (modul 16)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **TM1:** simulator — pauza kad tab nije vidljiv, jedan zahtjev u letu, brisanje greške pri uspjehu, čišćenje transkripta pri promjeni korisnika ili opsega.
2. **TM5:** dozvoliti samo `https:` i `http:` za `href` u adaptivnim karticama.
3. **TM3:** `ApiErrorText` za sve greške ove stranice, sa ID-om zahtjeva; `mapTeamsError` da čuva `requestId`.
4. **TM2:** razdvojiti stranicu na `status-tab`, `channels-tab`, `simulator-tab` i `use-teams-simulator`.
5. **TM4:** `role="img"` na ikonama i `sr-only` tekst za prazan `th`.
6. **Testovi:** komponentski testovi za simulator (polling, greška, promjena korisnika) i kanale (uklanjanje sa potvrdom).
7. **TM6, TM8, TM9, TM10, TM11, TM7, TM12:** tipovi događaja, tekst poruke pri grešci, pretraga korisnika, fallback taba, zajednički async hook, čišćenje.

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.
