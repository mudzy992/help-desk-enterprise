# Modul 16 — `/admin/teams` (Microsoft Teams administracija)

**Datum v2 re-audita:** 2026-10-19
**Auditirani Git SHA:** `bb5e9c5430e319cdd6bc2a6e94fa83012eb57b12`
**Status:** v2 re-audit završen; samo dokumentacija, bez implementacijskih izmjena.
**Oznake nalaza:** isključivo **TM1–TM12**.

## Provjere izvršene

1. **Inventar i čitanje koda:**
   - `frontend/src/pages/teams-admin-page.tsx` — **693 linije**;
   - `frontend/src/services/teams-api.ts` — 150 linija;
   - `frontend/src/lib/teams/map-teams-error.ts` — 18 linija;
   - `frontend/src/components/teams/adaptive-card-preview.tsx` — 277 linija;
   - `frontend/src/lib/teams/adaptive-card-text.ts` — 42 linije;
   - `adaptive-card-text.spec.ts` — 21 linija;
   - `frontend/src/lib/download/trigger-blob-download.ts` — 8 linija.
2. `components/teams/` i dalje sadrži samo `adaptive-card-preview.tsx`. Status, kanali i simulator nisu izdvojeni iz stranice; nema `use-teams-simulator` hooka (**TM2**).
3. **TM1:** pregledani su `simulatorPollMs`, `refresh`, `setInterval`, promjene `userId/scope`, sticky error, vidljivost dokumenta i aktivni tab.
4. **TM3:** izvršen grep za `ApiErrorText`, `mapApiError` i `readApiRequestId`. Teams stranica ne koristi nijedan od ta tri zajednička helpera; koristi samo `mapTeamsError`, koji vraća `TeamsErrorKey` bez request ID-a.
5. **TM5:** pregledana su oba `Action.OpenUrl` izlaza (`Container.selectAction` i action set). Oba direktno prosljeđuju string u `href`; nema `sanitizeUrl`, `URL` parsiranja ni http(s) allowliste.
6. **TM4/TM6/TM8–TM12:** provjerene readiness ikone, zaglavlja tabele, live transkript, event mapa i non-null assertion, redoslijed brisanja teksta, user picker, nestanak simulator taba, confirm callback, ponovljeni async blokovi i lokalni `fact` helper.
7. **Pristup:** provjereni su `router.tsx`, `canOpenTeamsAdminPage` i svih osam Teams admin endpointa. Frontend i backend koriste istu permisiju `integrationsTeamsManage`; SuperAdmin frontend bypass odgovara serverskom modelu dozvola.
8. **AdaptiveCardPreview scope:** grep potvrđuje da ga produkcijski koristi samo `teams-admin-page.tsx`; TM5 je ograničen na admin Teams simulator.
9. **Izvršeno:** `cd frontend && npx vitest run src/lib/teams` — 1/1 fajl, 2/2 testa prošla.
10. **E2E 33 nije pokrenut** jer nema podignutog backend/frontend E2E okruženja. Spec je pročitan: provjerava API permisije, status tab, simulator tab i axe za ta dva taba. **Channels tab nema axe prolaz**, suprotno tvrdnji starog audita da su pokrivena sva tri taba.

---

## Modul

`/admin/teams` ima tri taba:

- **Status** — efektivni i konfigurisani režim, metrike, readiness provjera i preuzimanje Teams ZIP paketa;
- **Kanali** — veze grupa sa Teams kanalima, događaji i uključivanje naslova;
- **Simulator** — uslovno dostupan, bira korisnika i personal/channel scope, šalje aktivnosti i prikazuje transkript sa Adaptive Card pregledima.

Simulator tab postoji samo kada API vrati `simulatorAvailable: true`. Backend administrativne rute zahtijevaju `integrationsTeamsManage`.

---

## Povezani fajlovi

| Fajl                                                      | Uloga                                                  | Linije |
| --------------------------------------------------------- | ------------------------------------------------------ | -----: |
| `frontend/src/pages/teams-admin-page.tsx`                 | Page, tri taba, polling, helperi i sva akcijska stanja |    693 |
| `frontend/src/components/teams/adaptive-card-preview.tsx` | Renderer podržanog Adaptive Card podskupa              |    277 |
| `frontend/src/services/teams-api.ts`                      | Status/readiness/paket/kanali/simulator API i tipovi   |    150 |
| `frontend/src/lib/teams/map-teams-error.ts`               | Teams API greška → i18n ključ                          |     18 |
| `frontend/src/lib/teams/adaptive-card-text.ts`            | Bold/escape tekst i merge action podataka              |     42 |
| `frontend/src/lib/teams/adaptive-card-text.spec.ts`       | Dva unit testa tekst/action helpera                    |     21 |
| `frontend/src/lib/download/trigger-blob-download.ts`      | Blob download i cleanup URL-a                          |      8 |
| `backend/src/modules/teams/teams-admin.controller.ts`     | Guardovi i admin/me API ugovor                         |      — |
| `e2e/tests/33-teams-simulator.spec.ts`                    | Integracijski tok bota, admin status/simulator i axe   |      — |

Install wizard `install-team-*` nije čitan niti mijenjan.

---

## Trenutna implementacija

### Page i tabovi

`TeamsAdminPage` učitava status preko `loadStatus`, briše page error nakon uspjeha i formira tabove iz statusa. Komponente `StatusTab`, `ChannelsTab`, `SimulatorTab`, `cardsOf` i `inboundLabel` nalaze se u istom fajlu. Sa 693 linije page je dodatno narastao sa 515 linija iz prvog audita i znatno prelazi projektno pravilo približno 200 linija.

Ako `simulatorAvailable` postane `false` dok je aktivan simulator, tab nestaje iz liste, ali `tab` state ostaje `"simulator"`; nijedan sadržaj se tada ne prikazuje.

### Status

Status prikazuje metrike i omogućava readiness i ZIP download. Readiness ikone nose `aria-label`, ali SVG nema eksplicitni `role="img"`; pošto pored njih postoji vidljiv naziv provjere, stabilniji obrazac je dekorativna ikona (`aria-hidden`) plus vidljiv ili sr-only status tekst.

`runReadiness` trenutno poziva `checkTeamsReadiness()` **dva puta uzastopno** i oba rezultata upisuje u isto stanje. To je konkretna regresija unutar ponovljenog async obrasca iz TM10: jedna korisnička akcija šalje dva POST zahtjeva.

### Kanali

Kanali se učitavaju pri mountu. Svaka checkbox izmjena poziva PATCH i zamjenjuje cijeli response. Uklanjanje koristi danger `ConfirmDialog`. Posljednje zaglavlje tabele je prazan `<th aria-label=… />`, bez sr-only tekstualnog sadržaja. `eventKeys` je `Record<string, key>`, filtriranje koristi `event in eventKeys`, a čitanje `eventKeys[event]!`.

### Simulator i polling

`refresh` zavisi od `userId` i `scope`, a effect odmah osvježava i pokreće `setInterval` na 4 sekunde. Trenutno:

- nema in-flight zaštite;
- nema `document.visibilityState` provjere;
- polling se ne zaustavlja kada Teams page/tab nije vidljiv;
- uspješan refresh ne radi `setErrorKey(null)`;
- promjena korisnika ili scopea ne prazni `messages` prije novog odgovora;
- cijeli transkript ima `aria-live="polite"`, pa polling može ponovo najavljivati veći sadržaj;
- forma briše `text` prije nego što `send` uspije.

User picker poziva `listUsersSummary()`, filtrira aktivne korisnike i prikazuje ih sve u običnom `<select>` elementu.

### Greške

Page i sva tri taba imaju odvojene `errorKey`/busy obrasce. `mapTeamsError` ispravno mapira poznate kodove na prevodne ključeve, ali ne čuva request ID. Prikaz je običan `<p className={errorTextClassName}>`, bez zajedničkog `ApiErrorText` obrasca iz modula 12.

### Adaptive Card preview

Renderer prikazuje podržani Teams podskup i React sigurno escapuje tekst. Međutim, `Container.selectAction` i `Action.OpenUrl` direktno koriste `href={asText(...url)}`. Nema validacije šeme, pa defense-in-depth zaštita od `javascript:`/`data:` URL-a nije implementirana. Komponenta se produkcijski koristi samo na ovoj admin stranici.

### Pristup

- route koristi `RequireAccess(check={canOpenTeamsAdminPage})`;
- helper dopušta SuperAdmina ili sesiju sa `integrationsTeamsManage`;
- svih osam `/integrations/teams/admin/*` endpointa ima `@RequirePermissions(integrationsTeamsManage)`;
- `/integrations/teams/me` je namjerno odvojen i dostupan svakom prijavljenom korisniku;
- E2E direktno potvrđuje 403 za običnog korisnika na status i simulator activity endpointima.

Pristup je usklađen.

---

## Definicija „max full“ za modul 16

Modul je maksimalno završen kada:

1. page je ispod približno 200 linija i delegira status, channels i simulator tabove; simulator logika je u testabilnom hooku (**TM2**);
2. polling radi samo na aktivnom/vidljivom simulatoru, ima jedan zahtjev u letu, briše oporavljenu grešku i odmah resetuje transkript pri promjeni konteksta (**TM1**);
3. svi error prikazi koriste `ApiErrorText` i čuvaju request ID (**TM3**);
4. `Action.OpenUrl` i `selectAction` renderuju link samo za valjan `http:`/`https:` URL (**TM5**);
5. readiness, tabela i transkript imaju stabilnu a11y semantiku, uključujući channels axe test (**TM4**);
6. event mapa je iscrpno vezana za `TeamsChannelEvent`, bez `in`/`!` escapeova (**TM6**);
7. simulator čuva neuspješno poslanu poruku, user picker podržava skalabilnu pretragu i nedostupan simulator vraća aktivni tab na status (**TM8/TM9/TM11**);
8. async akcije ne dupliraju boilerplate ni zahtjeve, ConfirmDialog callback je jasan, a statični helperi nisu ponovo kreirani pri renderu (**TM7/TM10/TM12**);
9. postoje komponent/hook testovi za polling, simulator send i channels remove/confirm tok.

---

## Realno / željeno — samo otvoreno

| Oblast          | Realno                                                                                            | Željeno                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Struktura       | Page od 693 linije; sva tri taba i helperi u njemu.                                               | Page samo orkestrira tab i status; tri komponente + simulator hook.                                   |
| Polling         | Stalni interval bez visibility/in-flight zaštite; sticky error i stari transkript.                | Poll samo aktivnog i vidljivog taba; jedan request; čisto stanje konteksta.                           |
| Greške          | Domenski ključ bez request ID-a; obični paragrafi.                                                | `ApiErrorText` sa request ID-em i zajedničkim obrascem.                                               |
| Linkovi kartice | Sirov string postaje `href`.                                                                      | Isključivo parsirani `http:` i `https:` URL-ovi.                                                      |
| A11y            | Nejasna semantika ikona, prazan `<th>`, live cijelog polling transkripta; channels bez axe testa. | Dekorativna ikona + tekst, sr-only naslov akcija, kontrolisana najava novih poruka, axe sva tri taba. |
| Tipovi          | `Record<string>`, `in`, non-null `!`.                                                             | `Record<TeamsChannelEvent, TranslationKey>` i sigurno vlastito članstvo.                              |
| Akcije          | Ponavljan busy/error kod; readiness se šalje dvaput.                                              | Jedan action helper i tačno jedan API poziv po akciji.                                                |
| Simulator UX    | Tekst se briše prije uspjeha; svi korisnici u selectu; tab može nestati.                          | Brisanje nakon uspjeha, pretraživ picker, fallback na status tab.                                     |
| Testovi         | Dva unit testa helpera; E2E status/simulator.                                                     | Hook/komponent testovi i channels axe/confirm pokrivenost.                                            |

---

## Gap analiza i master tabela

| ID       | Prioritet    | Status         | Nalaz                                                                                                                                                                | Kriterij zatvaranja                                                                      |
| -------- | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **TM1**  | P0 / visoko  | **Otvoren**    | Poll svakih 4 s bez visibility, aktivnog taba ili in-flight guarda; uspjeh ne briše refresh grešku; user/scope ne prazne transkript.                                 | Hook testovi potvrđuju jedan request u letu, pause/resume, clear error i reset poruka.   |
| **TM2**  | P0 / visoko  | **Otvoren**    | Page ima 693 linije; tabovi i simulator logika nisu izdvojeni.                                                                                                       | Page približno ≤200 linija; tri tab komponente i `useTeamsSimulator`.                    |
| **TM3**  | P1 / srednje | **Djelimično** | Poznate Teams greške se lokalizuju, ali nema `ApiErrorText`, request ID-a ni najave konzistentne s aplikacijom.                                                      | Zajednički error model/prikaz po tabu sa `readApiRequestId`.                             |
| **TM4**  | P1 / srednje | **Djelimično** | Vidljiv tekst sprečava color-only problem, ali ikone imaju nestabilnu semantiku, action `<th>` je prazan, a polling kontejner cijeli je live. Channels nema axe E2E. | Dekorativne ikone/status tekst, sr-only th, kontrolisana live regija i axe sva tri taba. |
| **TM5**  | P0 / visoko  | **Otvoren**    | Dva Adaptive Card puta prihvataju proizvoljan `href`; nema provjere šeme.                                                                                            | Testirani `safeHttpUrl`: http(s) link; javascript/data/relative nisu linkovi.            |
| **TM6**  | P1 / nisko   | **Otvoren**    | `Record<string>`, prototipski `in` i `eventKeys[event]!` za API događaje.                                                                                            | Iscrpna `TeamsChannelEvent` mapa i vlastito članstvo bez non-null assertiona.            |
| **TM7**  | P2 / nisko   | **Otvoren**    | `onOpenChange` koristi ternarni izraz sa `null` samo radi side effecta.                                                                                              | Eksplicitni `if (!open)` callback i confirm komponent test.                              |
| **TM8**  | P1 / srednje | **Otvoren**    | `setText("")` se izvršava prije uspješnog slanja.                                                                                                                    | Tekst se briše samo nakon uspjeha; neuspjeh čuva draft; test.                            |
| **TM9**  | P2 / nisko   | **Otvoren**    | `listUsersSummary()` puni obični select svim aktivnim korisnicima.                                                                                                   | Postojeći async/search user picker obrazac ili dokumentovan limit/paginacija.            |
| **TM10** | P1 / visoko  | **Otvoren**    | Busy/error try/catch/finally se ponavlja; `runReadiness` trenutno šalje dva identična POST-a.                                                                        | Jedan poziv po akciji i zajednički lokalni async action obrazac.                         |
| **TM11** | P2 / nisko   | **Otvoren**    | Aktivni simulator tab ne vraća se na status kada `simulatorAvailable` postane false.                                                                                 | Effect normalizuje aktivni tab; komponent test.                                          |
| **TM12** | P2 / nisko   | **Otvoren**    | `fact` se definiše pri svakom `StatusTab` renderu; ostao je fazni komentar „Paket 3.1 (§16)“.                                                                        | Statični helper/komponenta i trajni komentar ugovora.                                    |

---

## Roadmap do „max full“

### P0 — sigurnost, polling i struktura

1. **TM5:** dodati čisti `safeHttpUrl` helper i testove za `https`, `http`, `javascript`, `data` i relativni URL.
2. **TM2 + TM1:** prvo izdvojiti `use-teams-simulator`, zatim simulator/status/channels tabove; hook dobija active/visibility/in-flight kontrolu i reset stanja.
3. Dodati hook testove sa fake timerima: overlap, hidden document, povratak u visible, sticky error i promjena user/scope.

### P1 — pouzdanost i a11y

4. **TM10:** odmah ukloniti dupli readiness POST i centralizovati busy/error action obrazac.
5. **TM3:** `ApiErrorText`, `mapApiError`/domenska mapa i `readApiRequestId` po tabu.
6. **TM4:** urediti ikone, action header i live najavu; proširiti E2E axe na channels.
7. **TM6:** tipizovati event mapu.
8. **TM8:** brisati draft nakon uspješnog send rezultata.

### P2 — završni UX i održavanje

9. **TM9:** uvesti postojeći pretraživi user picker obrazac.
10. **TM11:** fallback aktivnog taba.
11. **TM7/TM12:** pojednostaviti confirm callback, izdvojiti `fact`, očistiti fazne komentare.
12. Dodati channels remove/confirm komponent test i simulator smoke render test.

---

## Status ispravki od 2026-10-13

| Stavka          | Stanje 2026-10-19                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| TM1 polling     | **Nije riješen:** isti interval, sticky error i stari transkript; nema visibility/in-flight zaštite.                |
| TM2 split       | **Nije riješen:** page je narastao sa 515 na 693 linije; `components/teams` i dalje ima samo Adaptive Card preview. |
| TM3 error UX    | **Nije riješen:** nema `ApiErrorText` ni request ID-a.                                                              |
| TM4 a11y        | **Djelimično:** status i simulator imaju axe E2E; channels nema. Ostali nalazi ostaju.                              |
| TM5 URL zaštita | **Nije riješen:** oba `href` puta su bez allowliste.                                                                |
| TM6–TM12        | **Nisu riješeni.** Dupli readiness poziv je dodatni konkretni dokaz za TM10.                                        |
| Pristup         | **Potvrđen kao usklađen:** frontend i backend koriste `integrationsTeamsManage`.                                    |
| Testovi         | Helper unit testovi i E2E bot tok postoje; nema page/tab/hook komponent testova.                                    |

---

## Ocjena

# **6/10**

Funkcionalni Teams tok i serverska autorizacija su dobri, ali page je sada još veći, sigurnost linkova i polling ostaju otvoreni, a readiness akcija trenutno duplira POST. Zbog toga nema osnova za povećanje stare ocjene.

### Do 10/10

- zatvoriti **TM5**, zatim zajedno **TM2 + TM1** uz hook testove;
- zatvoriti **TM10**, **TM3**, **TM4**, **TM6** i proširiti axe na channels;
- završiti simulator UX i održavanje kroz **TM7–TM9**, **TM11–TM12** i komponent testove.

## Predložena commit poruka

`docs(audit): rewrite admin Teams module 16 review`
