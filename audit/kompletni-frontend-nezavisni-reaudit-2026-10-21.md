# Potpuno nezavisni reaudit kompletnog frontenda

**Datum:** 21.10.2026.  
**Auditirani commit:** `7f0391c1e71fb36940269d5ff479d54142698f51` (`Update ci.yml`)  
**Grana:** `arena/bd31e07b-help-desk-enterprise`  
**Opseg:** kompletan `frontend/`, pripadajući browser ugovori u `e2e/` i nužne backend/API referentne tačke.  
**Metoda:** fresh/blind reaudit nakon prenosa 53 commita. Postojeći dokumenti u `audit/frontend/`, kao ni prethodni nezavisni audit, nisu čitani niti korišteni pri formiranju nalaza.

---

## 1. Izvršni sažetak

Frontend je funkcionalno širok i tehnički zreo enterprise SPA. Trenutni vrh grane prolazi production build, TypeScript, puni ESLint, Prettier provjeru, dizajn/i18n ugovor, statički contrast audit i kompletan frontend test suite. Postoji centralizovan cookie-session API sloj, capability-based route zaštita, error/retry infrastruktura, realtime invalidacija, URL-backed radne površine, dobre accessibility primitive i veoma široka testna baza.

Prenesene izmjene popravljaju nekoliko stvarnih browser/a11y rubova: SLA scroll regioni su sada fokusabilni i imenovani, progress elementi imaju pristupačne labele, Assets pretraga ima eksplicitni URL history ugovor, a više E2E selektora i cleanup tokova je ojačano. Raniji direktni E2E timeout na uklonjenom onboarding requestu više ne postoji.

Ipak, fresh reaudit nalazi da najveći sistemski rizici ostaju:

- početni/shared JavaScript payload je previsok;
- produkcijski dependency audit nije čist;
- više administrativnih tokova i dalje pretvara grešku u prazne podatke;
- polling nema zajedničku visibility/backoff politiku;
- ključni Assets/Reports/Privacy/On-call/Changes moduli su monolitni;
- route splitting nije dosljedan;
- runtime API validacija nije sistemska;
- novi E2E 42 više ne testira mrežni onboarding ugovor i sadrži netačan komentar o N+1 ponašanju;
- `force: true` u lifecycle E2E koraku može maskirati stvarni interakcijski problem;
- nekoliko konkretnih Status/Services semantičkih i regresijskih praznina ostaje otvoreno.

### Nezavisna ocjena

| Dimenzija | Ocjena | Obrazloženje |
|---|---:|---|
| Funkcionalna potpunost | 9,7/10 | Izuzetno široka enterprise površina i kompletni glavni tokovi |
| Arhitektura | 8,9/10 | Dobri cross-cutting temelji; route i veliki moduli nisu dosljedno razloženi |
| Sigurnost i privatnost | 9,3/10 | HttpOnly session i dobar API sloj; dependency audit ostaje otvoren |
| Autorizacija | 9,7/10 | Centralizovan capability/route model i backend autoritet |
| UX i recovery | 9,3/10 | Jaka stanja i retry; silent partial failures ostaju |
| Pristupačnost | 9,6/10 | Dobar shell, primitive i novi scroll/progress popravci; live browser dokaz ostaje presudan |
| Internacionalizacija | 9,8/10 | 8.806 bs/en ključeva sa potvrđenim paritetom |
| Performanse | 8,5/10 | Bundle, eager rute, polling i full routing scan su glavni minus |
| Testabilnost | 9,3/10 | 1.566 frontend testova i 57 E2E specova; nekoliko važnih contract rupa |
| Održavanje | 8,7/10 | Veliki hotspotovi, mrtav helper i dependency hygiene |

**Ukupna fresh ocjena: 9,2/10.**

Ocjena je viša od prethodno auditiranog stanja zbog potvrđenih a11y/browser poboljšanja i uklanjanja direktnog stale network waita iz E2E 42, ali nije 10/10 zbog mjerljivih performansnih, dependency i contract rizika.

---

## 2. Dokazni trag i validacija

### 2.1 Inventar

- **1.462** TypeScript/TSX fajla u `frontend/src`;
- približno **125.155** linija produkcijskog TS/TSX koda;
- **403** frontend spec fajla;
- **57** Playwright E2E spec fajlova;
- **8.806** i18n ključeva sa bs/en paritetom;
- **4.524** statična `t()` ključa potvrđena u oba localea;
- **87** potvrđenih dinamičkih i18n prefiksa.

### 2.2 Izvršene provjere

| Provjera | Rezultat |
|---|---|
| `npm ci --ignore-scripts` | Prošlo |
| `npm run build` | Prošlo; Vite upozorenje za chunkove >500 kB |
| `npm run lint` | Prošlo bez greške |
| `npm run format:check` | Prošlo |
| `npm run i18n:check` | Prošlo |
| `npm run audit:contrast` | Prošlo; 0 parova ispod 4.5:1 |
| `npm test -- --run` | **403/403 fajla, 1566/1566 testova** |
| `npm audit --omit=dev` | **7 high, 3 moderate** |

### 2.3 Napomene o test outputu

Suite je zelen, ali stderr i dalje sadrži:

- React SSR `useLayoutEffect` upozorenja u `active-timer-indicator.spec.tsx`;
- `react-i18next` upozorenja u toast i confirm-dialog testovima.

To nisu produkcijski kvarovi, ali testni output nije potpuno čist i može sakriti buduće relevantno upozorenje.

### 2.4 Granice audita

Ovaj dokument ne tvrdi da je lično ponovo izvršio svih 57 Playwright specova na live stacku. Statički su pregledani route/E2E ugovori i korištena je korisnikova potvrda zelenog full CI-ja. Za 10/10 ostaje potreban artefakt koji jasno pokazuje spec matricu, browser i commit SHA.

---

## 3. Pozitivni nalazi nakon prenesenih commitova

### 3.1 Accessibility poboljšanja

1. SLA compliance scroll containeri sada imaju `role="region"`, pristupačno ime i `tabIndex={0}`.
2. Ticket SLA progress bar dobija kontekstualnu labelu.
3. Appearance preview progress više nije neimenovan.
4. E2E a11y helper čeka fontove i finite animacije te daje detaljniji failure summary.
5. A11y helper neutralizuje transition/animation za stabilno mjerenje settled stanja.

### 3.2 Browser-contract poboljšanja

1. Assets pretraga se commitira u URL tek nakon debouncea.
2. E2E pokriva deep link, Back/Forward i 320 px horizontal overflow.
3. Globalni CMDB setting dobio je safety restore nakon E2E grupe.
4. Email template confirm test koristi stabilne test ID selektore.
5. Announcement test prati kanonski URL bez suvišnog default query parametra.
6. Dashboard E2E preciznije razlikuje open i critical metriku.
7. E2E 42 više ne čeka uklonjeni per-service onboarding response.

### 3.3 Cross-cutting temelji

1. Session token je u HttpOnly cookieju; localStorage sadrži samo principal i expiry metadata.
2. Raw `fetch` postoji samo u centralnom API wrapperu.
3. 401 lifecycle, request ID, blob download i install-token pravila su centralizovani.
4. Entra return path je validiran protiv open redirect i control/backslash varijanti.
5. Protected route katalog centralizuje permission check i forbidden UX.
6. Shell ima skip link, fokus menadžment, announcer regione i page error boundary.
7. Nisu pronađeni produkcijski `div/span onClick` anti-patterni.
8. Nisu pronađeni native `window.alert/prompt/confirm` tokovi.
9. i18n, theme storage i token ugovori imaju automatizovane provjere.
10. Operation guard, latest-request guard i query cache su dobro zastupljeni.

---

## 4. Prioritetni nalazi

### RF1 — Početni/shared bundle ostaje previsok

**Prioritet:** P0/P1 performanse  
**Dokaz:** production build

Najveći chunkovi:

| Chunk | Raw | Gzip |
|---|---:|---:|
| glavni `index` | 1.300,79 kB | 376,35 kB |
| shared `index` | 427,52 kB | 221,81 kB |
| `common` | 507,84 kB | 166,46 kB |
| `common` | 500,76 kB | 154,94 kB |
| shared `index` | 343,08 kB | 84,76 kB |
| admin page | 248,51 kB | 60,93 kB |

Dashboard, Tickets, Services, Knowledge Base, Appearance, Login i dio auth stranica ostaju eager importovani u root routeru. Za requester/login cold path browser zato parsira značajan kod koji možda nikad neće koristiti.

**Uticaj:** spor cold start, veća memorija, duži parse/compile i slabiji UX na mobilnim/slabijim uređajima.

**Preporuka:** lazy-loadati sve page rute; generisati bundle metafile; odvojiti ticket workspace, charts i velike registrije; uvesti CI budget.

**Acceptance:** nijedan initial/shared chunk >250 kB gzip; requester i login put ne preuzimaju staff/admin module kod; prekoračenje ruši CI.

---

### RF2 — Build upozorenje za veličinu chunka nije release gate

**Prioritet:** P1 governance

Vite prijavljuje chunkove veće od 500 kB, ali build je zelen. Trenutni `module-size.spec.ts` provjerava samo `src/lib` i prag 320 linija; ne pokriva najveće `pages`, `components` i `services` hotspotove niti output bundle.

**Preporuka:** odvojeni CI script za initial gzip total, pojedinačni chunk budget, route chunk budget i broj velikih production modula.

---

### RF3 — Produkcijski dependency audit nije čist

**Prioritet:** P1 sigurnost/supply chain

`npm audit --omit=dev` prijavljuje:

- **7 high**;
- **3 moderate**.

Direktno označeni paketi su `tailwindcss` i `tailwindcss-animate`; transitive lanac uključuje `braces`, `chokidar`, `fast-glob`, `micromatch`, `postcss-nested`, `postcss-selector-parser`, `source-map-js` i `follow-redirects`.

Tailwind je build-time alat, ali se nalazi u `dependencies`, zbog čega ulazi u production audit. `axios` je direktna dependency bez pronađenog produkcijskog importa i povlači `follow-redirects` nalaze.

**Preporuka:** ukloniti `axios`; build-only pakete premjestiti u `devDependencies`; ažurirati lockfile; dokumentovati exploitability i uvesti high/critical gate.

**Acceptance:** nema neodobrenih high/critical nalaza u production dependency skupu.

---

### RF4 — Silent partial failures se prikazuju kao prazan poslovni podatak

**Prioritet:** P1 korektnost

Kritični primjeri:

- Users: neuspješan `listServices()` postaje `[]`;
- Groups: neuspješan `listRoutingRules()` postaje `[]`;
- user role scope summaries: neuspješne role postaju `[]`;
- policy packs panel: neuspješni servisi postaju `[]`;
- service mutation: neuspješni policy packovi postaju `[]`;
- article-from-reply: neuspješne knowledge kategorije postaju `[]`.

Operator ne može razlikovati „nema stavki“ od „request je pao“. To može proizvesti pogrešan izbor ili nepotpunu izmjenu.

**Preporuka:** zajednički partial resource model `{data,error,requestId,retry,isStale}`; sačuvati ranije podatke i blokirati samo zavisnu kontrolu.

---

### RF5 — Polling nema jedinstven visibility/backoff ugovor

**Prioritet:** P1 performanse/stabilnost

Neovisne intervale imaju status, ops health, inbox, Teams simulator, on-call, privacy exports/anonymization, session keepalive, time tracking i drugi moduli. Neki provjeravaju visibility, neki ne; 5-sekundni privacy polling nema zajednički backoff/online policy.

**Preporuka:** centralni polling/query policy sa visibility pause, immediate focus refresh, online/offline stanjem, bounded backoffom i stop uslovom.

---

### RF6 — Produkcijski moduli su i dalje preveliki

**Prioritet:** P1 održavanje

Najveći hotspotovi:

- `services/assets-api.ts` — 1.092 linije;
- `asset-catalog-manager.tsx` — 1.014;
- `report-trends-panel.tsx` — 873;
- `asset-licenses-panel.tsx` — 811;
- `assets-page.tsx` — 786;
- `on-call-page.tsx` — 757;
- `privacy-requests-panel.tsx` — 738;
- `asset-detail-page.tsx` — 732;
- `change-form-sheet.tsx` — 693;
- `asset-contracts-panel.tsx` — 679;
- `privacy-anonymization-panel.tsx` — 665.

`module-size.spec.ts` ne vidi ove fajlove jer nadzire samo `src/lib`.

**Preporuka:** razdvojiti API domene, page model hookove, mutation controllere i pure view komponente; proširiti size contract na cijeli production source.

---

### RF7 — Route splitting je nedosljedan

**Prioritet:** P1/P2

Protected/admin stranice su lazy, ali nekoliko velikih core stranica nije. Standard zavisi od mjesta deklaracije rute, ne od performance budžeta.

**Preporuka:** jedinstveni route manifest sa lazy loaderom za sve stranice; idle prefetch samo vjerovatne sljedeće rute.

---

### RF8 — Kritični API response modeli nemaju sistemsku runtime validaciju

**Prioritet:** P2 resilience

Centralni API sloj radi `JSON.parse(text) as T`. Deploy skew, proxy HTML/JSON ili parcijalni payload može proći do dubokog rendera prije greške. Lokalni parseri postoje za neke import/config tokove, ali ne postoji opšti standard.

**Preporuka:** runtime schema granice najmanje za session/capabilities, install, config packages, paginated envelope, routing i permission-sensitive odgovore.

---

### RF9 — Novi E2E 42 više ne provjerava batch onboarding mrežni ugovor

**Prioritet:** P1 test contract

Direktni stale `waitForResponse(/services/:id/onboarding)` je uklonjen, što je ispravno. Međutim, novi komentar tvrdi da katalog i dalje šalje „one onboarding GET per DRAFT service in parallel“, iako produkcijski kod sada koristi batch summary iz `GET /services`.

Test provjerava samo da se chip pojavi. To potvrđuje vidljivi outcome, ali ne zaključava najvažniju regresiju: da katalog **ne vrati** N+1/per-service GET i očekivane 404 zahtjeve.

**Preporuka:** ispraviti komentar; pratiti browser requestove tokom reload-a; potvrditi batch `GET /services`; eksplicitno očekivati nula catalog-generated `GET /services/:id/onboarding` poziva.

**Acceptance:** E2E pada ako se N+1 obrazac vrati.

---

### RF10 — `force: true` u lifecycle E2E može maskirati stvarni UI problem

**Prioritet:** P1/P2 browser pouzdanost

E2E 42 koristi:

```ts
click({ force: true })
```

na „Manage lifecycle“ menu itemu. Force click zaobilazi Playwright actionability provjere: overlay, pomjeren element, zatvoren meni ili intercept pointera više ne obaraju test iako bi stvarni korisnik bio blokiran.

**Preporuka:** ukloniti force; stabilizovati dropdown lifecycle (vidljivost, fokus, animacija ili scroll) i čekati stvarno actionable stanje.

---

### RF11 — A11y E2E helper može sakriti probleme animiranog/focus stanja

**Prioritet:** P2

Neutralizovanje svih transition/animation pravila prije axe skena smanjuje false positive kontrasta, ali znači da scan ne provjerava stvarno `prefers-reduced-motion` ponašanje, animirani overlay/fokus lifecycle ni kratkotrajna stanja.

**Preporuka:** zadržati settled-state axe scan, ali dodati poseban reduced-motion test i ciljane focus/overlay scenarije bez globalnog animation overridea.

---

### RF12 — E2E global-setting cleanup samo upozorava kada safety restore ne uspije

**Prioritet:** P2 test izolacija

Assets `afterAll` hvata restore grešku i radi `console.warn`, pa grupa može završiti zeleno dok je shared stack ostao sa isključenim CMDB modulom. Kasniji testovi mogu pasti uz udaljen uzrok.

**Preporuka:** restore neuspjeh mora oboriti suite ili pokrenuti verificirani second-chance restore; nakon PATCH-a eksplicitno pročitati setting i potvrditi `true`.

---

### RF13 — Routing coverage katalog i dalje radi serijski full scan

**Prioritet:** P1 performanse

`loadCatalogRoutingCoverage` cursorom čita sve `includeInactive=true` stranice pri otvaranju/refreshu kataloga. Vrijeme i broj zahtjeva rastu linearno sa tenantom.

**Preporuka:** server-side summary/index ili batch nad vidljivim service ID-jevima; bounded page/cursor guard i telemetrija.

---

### RF14 — Form builder i dalje implicitno kreira draft pri otvaranju

**Prioritet:** P1/P2 product semantika

`ensureServiceForm(serviceId, canWrite)` na 404 kreira default formu korisniku sa write pravom. Read/navigation akcija time ima trajni write side-effect bez eksplicitne potvrde.

**Preporuka:** prazno stanje sa „Kreiraj početnu formu“, ili formalno dokumentovan auto-bootstrap sa audit/idempotency dokazom.

---

### RF15 — Nema direktnog component testa za form-drawer request-loop regresiju

**Prioritet:** P1 testabilnost

Nedavno popravljeni callback/effect loop nema test ugovor koji dokazuje:

- jedan initial ensure/get;
- parent rerender ne proizvodi novi request;
- save/activate proizvodi tačno jedan catalog refresh;
- close/unmount ne primjenjuje stale rezultat.

**Preporuka:** component test sheet + builder + parent callback, sa preciznim brojačima API poziva.

---

### RF16 — Upcoming downtime badge i dalje hardkodira `count: 1`

**Prioritet:** P1 korektnost

`service-catalog-table.tsx` na dva mjesta prikazuje `{ count: 1 }` iako model zna samo boolean `hasUpcomingDowntime`. Više budućih prozora daje netačan broj.

**Preporuka:** backend `upcomingDowntimeCount` ili nebrojiva poruka.

---

### RF17 — Mrtvi N+1 onboarding loader ostaje u produkcijskom sourceu

**Prioritet:** P2 održavanje

`load-visible-onboardings.ts` nema produkcijskog consumera, ali implementira stari per-service GET/404 model i ima testove. Netačan E2E komentar pokazuje da mrtvi model već stvara mentalni drift.

**Preporuka:** ukloniti helper i zastarjeli test; batch derivaciju označiti kao jedini ugovor.

---

### RF18 — Batch onboarding contract nije dovoljno zaključan backend testom

**Prioritet:** P2

Backend loader vraća prazan map ako lightweight Prisma harness nema onboarding delegate. To čuva stare testove, ali može maskirati nestanak wiring-a.

**Preporuka:** delegate u harnessu i direktan list-services contract test za active/completed/missing onboarding; zatim ukloniti tihi fallback.

---

### RF19 — Status overview nema immediate refresh na povratak taba

**Prioritet:** P2 operativna svježina

Interval preskače request dok je dokument skriven, ali nema `visibilitychange` refresh. Po povratku status može ostati star do narednog 60-sekundnog ticka.

**Preporuka:** guarded immediate refresh na `visible`.

---

### RF20 — Široke tabele i dalje zavise od horizontalnog scrolla

**Prioritet:** P2/P3 responsive UX

SLA scroll regioni su sada pristupačniji, što je dobro. Međutim, catalog i više admin/report/asset tabela i dalje imaju velike minimalne širine. Na 320–390 px identitet reda i akcije su udaljeni horizontalnim scrollom.

**Preporuka:** kartični mobile prikaz ili sticky identitet/actions kolone; browser matrica sa keyboard provjerom.

---

### RF21 — Best-effort side effecti nemaju objedinjenu observability politiku

**Prioritet:** P3

Knowledge view recording, locale preference sync, dio timer/realtime helpera i nekoliko auxiliary poziva gutaju grešku. UX bez toasta je često ispravan, ali sistematski kvar nije vidljiv.

**Preporuka:** rate-limited client telemetry/logger za best-effort failure kategorije.

---

### RF22 — Test suite je zelen, ali warning output nije čist

**Prioritet:** P3 test hygiene

React SSR i i18next upozorenja su poznata, ali svaki stalni warning smanjuje signal/noise odnos.

**Preporuka:** koristiti odgovarajući test router/render način i inicijalizovan test i18n; u CI eventualno failati na neočekivani `console.error/warn` uz allowlist poznatih slučajeva.

---

## 5. Modul-po-modul procjena

| Modul | Ocjena | Glavni rizik |
|---|---:|---|
| Install/Auth/Session | 9,5 | Velik login page; runtime response validacija i dependency hygiene |
| Shell/Navigation/A11y | 9,7 | A11y settled scan dobar, ali animation/reduced-motion treba zaseban dokaz |
| Dashboard | 9,5 | Eager import i bundle doprinos |
| Tickets | 9,6 | Ogromna funkcionalna površina; održavati route-level browser dokaz |
| Services/Status | 9,1 | Routing scan, form bootstrap, downtime count, loop test i batch contract |
| Routing/SLA | 9,5 | Full coverage query; široke tabele, inače jaka a11y poboljšanja |
| Admin/Settings/RBAC | 9,3 | Silent partial loads i veliki admin chunk |
| Assets/CMDB | 9,0 | Najveći source hotspotovi i global-setting E2E izolacija |
| Problems/Changes | 9,3 | Veliki form/detail moduli |
| Reports | 9,2 | Veliki trend/schedule paneli i polling/query kompleksnost |
| Privacy | 9,3 | 5s polling i veliki paneli |
| Knowledge/Docs | 9,5 | Best-effort observability i partial category load |
| On-call/Announcements | 9,4 | Veliki page/editori; E2E URL ugovor poboljšan |
| Teams/Integracije | 9,5 | Polling politika i vanjski integration state |
| UI/Theme/i18n | 9,8 | Statički ugovori i kontrast odlični |
| Build/Dependencies | 8,4 | Bundle i audit nalaz su najveći horizontalni minus |

---

## 6. Implementacijski plan prema riziku

### Faza 1 — Release i test ugovor

Nalazi: RF3, RF9, RF10, RF12, RF22.

1. Ispraviti E2E 42 komentar i dodati negativnu N+1 mrežnu aserciju.
2. Ukloniti `force: true` kroz stvarnu stabilizaciju menija.
3. Restore failure učiniti fatalnim i verificiranim.
4. Očistiti test warnings.
5. Ukloniti axios i sanirati production dependency audit.

### Faza 2 — Bundle i route skaliranje

Nalazi: RF1, RF2, RF7.

1. Lazy-load svih top-level page ruta.
2. Bundle metafile/analyzer.
3. Initial/shared gzip CI budget.
4. Idle prefetch samo za očekivanu sljedeću rutu.

### Faza 3 — Async/error/polling standard

Nalazi: RF4, RF5, RF8, RF19, RF21.

1. Partial-resource error model.
2. Shared polling policy.
3. Runtime validator granice.
4. Immediate visibility refresh.
5. Best-effort telemetry.

### Faza 4 — Services/Status correctness

Nalazi: RF13–RF18.

1. Routing summary/batch endpoint.
2. Eksplicitni form bootstrap.
3. Form-loop component test.
4. Tačan downtime count.
5. Ukloniti mrtav loader.
6. Backend onboarding batch contract test.

### Faza 5 — Modularizacija hotspotova

Nalaz: RF6.

Redoslijed:

1. `assets-api.ts` po domenima;
2. assets page/catalog/licenses/contracts;
3. report trends/schedules;
4. privacy request/anonymization;
5. on-call page;
6. change form/detail.

### Faza 6 — Responsive i završni browser closeout

Nalazi: RF11, RF20.

1. Mobile table strategija.
2. 320/390/768/1280/1920 px matrica.
3. Keyboard-only i screen-reader smoke.
4. Reduced-motion test bez globalnog animation overridea.
5. Potvrditi tačan CI commit SHA, browser matricu i listu izvršenih E2E specova.

---

## 7. Kriterij za 10/10

Frontend može dobiti nezavisnih 10/10 kada:

- initial/shared bundle ima enforcean i zelen budget;
- nema neodobrenih high/critical production dependency nalaza;
- administrativni partial requesti ne glume prazan poslovni rezultat;
- polling je visibility-aware, dedupliciran i sa backoffom;
- E2E 42 eksplicitno brani povratak N+1 onboarding requestova;
- browser testovi ne koriste `force: true` za ključne korisničke akcije;
- global-setting restore se verificira i obara suite ako ne uspije;
- kritični API payloadi imaju runtime granice;
- najveći moduli imaju odvojene query/mutation/view odgovornosti;
- routing coverage ne radi neograničen full scan;
- form drawer nema implicitni write ili ga product eksplicitno potvrđuje;
- form-loop regresija ima component test;
- downtime count je tačan;
- mrtvi N+1 loader i fallback drift su uklonjeni;
- status refreshuje odmah pri povratku taba;
- responsive/a11y browser matrica je stvarno izvršena i artefaktovana.

---

## 8. Zaključak

Prenesenih 53 commita nisu degradirali frontend; naprotiv, trenutni vrh grane ima bolji browser i accessibility dokaz na nekoliko važnih mjesta. Production build, lint, format, i18n, kontrast i svih 1.566 frontend testova su zeleni.

Najveći preostali jaz do 10/10 nije u nedostatku funkcionalnosti, nego u kontroli skale i dokazivosti: bundle i source hotspotovi, dependency hygiene, dosljedan partial-error/polling ugovor, runtime schema granice i browser testovi koji moraju provjeravati stvarni produkcijski ugovor bez force-click ili stale mentalnog modela.

Ovaj reaudit je zaključen neovisno. Tek naredni korak treba otvoriti postojeće dokumente i napraviti formalnu matricu: **ranije pronađeno**, **riješeno prenesenim commitovima**, **još otvoreno**, **novi nalaz**, **raniji nalaz koji ovaj fresh audit nije reproducirao**.
