# Modul 10: Status i servisi — dubinski reaudit

**Datum reauditiranja:** 2026-10-20
**Scope:** `/status`, `/services`, incidenti uz tiket, servisni katalog, kategorije, onboarding, obrasci servisa, dostupnost i planirani prekidi
**Status:** otvoren za implementaciju
**Aktuelna ocjena:** **9,8/10 nakon Faze 8**
**Cilj:** **10/10** uz stvarni browser/E2E dokaz

---

## 1. Izvršni sažetak

Modul je znatno zreliji od arhivskog audita od 13–15. oktobra. Backend ima ozbiljne autorizacijske i domenske granice, katalog više nema raniji render loop, onboarding čuva kreirani draft prije narednog koraka, status refresh zadržava prethodni overview, a servisni katalog razlikuje početnu grešku od pozadinske greške. Postoje i korisni E2E scenariji `21-status-monitoring.spec.ts` i `42-catalog-sla-routing-ux.spec.ts`.

Ipak, oznaka „zatvoren, 7/10“ iz starog dokumenta više nije prihvatljiva kao aktuelni audit. Većina tada „prihvaćenih rizika“ i dalje je stvarni backlog, a današnji standard repozitorija je viši nakon modula 11–16 i faznog zatvaranja modula 09.

Faze 1–8 su izdvojile latest-only controllere, zaštitile mutation tokove, uspostavile civil-time i URL ugovore te ujednačile query/recovery i statičku održivost. Preostali rizik za 10/10 je stvarni browser dokaz i dio direktne page/component matrice.

Ocjena **9,8/10 nakon Faze 8** je maksimalna ocjena bez izvršenog browser/E2E closeouta. Ne tretira odsustvo regresije kao dokaz browser korektnosti.

---

## 2. Scope i pregledani dokaz

### Frontend ulazne tačke

- `frontend/src/pages/status-page.tsx`
- `frontend/src/pages/services-page.tsx`
- `frontend/src/components/status/*`
- `frontend/src/components/services/*`
- `frontend/src/lib/status/*`
- `frontend/src/lib/services/*`
- `frontend/src/services/status-api.ts`
- `frontend/src/services/service-*-api.ts`
- route i navigation ugovori u `frontend/src/app/router.tsx` i `frontend/src/lib/navigation.ts`

### Backend reference

- `backend/src/modules/status-page/*`
- `backend/src/modules/service-catalog/*`
- controller guardovi, permission dekoratori i service-scope zaštita
- incident lifecycle, availability/downtime i form-schema validatori

### Testni dokaz

- frontend unit/helper/hook testovi za status-view, katalog filtering/load state, routing coverage, onboarding, lifecycle i error mape;
- backend status/service-catalog testovi, uključujući authorization compatibility i domenske validatore;
- E2E `21-status-monitoring.spec.ts` i `42-catalog-sla-routing-ux.spec.ts` su pregledani kao kod;
- browser scenariji nisu izvršeni u ovom reauditiranju jer lokalni backend/frontend stack nije dostupan.

### Važno razgraničenje

- „Test postoji“ ne znači da je izvršen u browseru.
- Pure helper test ne zatvara React lifecycle, race, focus ili responsive rizik.
- Backend validacija ne zamjenjuje jasan frontend field-level ugovor.
- Arhivski „prihvaćen rizik“ nije automatski zatvoren nalaz.

---

## 3. Arhitektura i pozitivni nalazi

### 3.1 Backend autorizacija je dobra osnova

Service catalog controlleri koriste `SessionAuthenticationGuard`, `RoleGuard`, typed permission ključeve i `RequireServiceScope`. Write ovlasti su razdvojene na catalog, forms i availability domene. Authorization compatibility testovi dokazuju da catalog write ne postaje implicitno availability write i da se service scope primjenjuje na osjetljive operacije.

Status backend je zaseban modul sa incident lifecycleom, subscriptionima, ticket linkovima, public/staff vidljivošću i resolve previewom. To je bolja osnova od UI-only skrivanja akcija.

### 3.2 Katalog pravilno razlikuje početno i pozadinsko učitavanje

`serviceCatalogLoadState` i `ServicesPage` razlikuju početni skeleton/error od refresh upozorenja uz postojeće podatke. `useServiceCategories` čuva posljednju uspješnu listu pri prolaznoj grešci. Ovo je ispravan stale-data recovery obrazac.

### 3.3 Raniji onboarding kvarovi su stvarno popravljeni

Wizard više ne skriva draft kada naredni korak padne. Kreirani onboarding zapis se pamti prije nastavka, a SLA korak reaguje na profile koji stignu asinhrono. Postoje direktni RTL testovi za ključne recovery tokove.

### 3.4 Status stranica čuva overview pri refresh grešci

Pozadinska greška se prikazuje uz postojeći overview i request ID, dok polling ostaje aktivan. Ukupno stanje ima `role="status"`, incident kartice koriste semantičke sekcije, a public/staff ponašanje je odvojeno backend odgovorom.

### 3.5 Domenski helperi i backend validatori su iznad prosjeka

Postoje helperi/testovi za lifecycle transitions, routing coverage, form field draftove, change reason, availability evaluation, downtime range/overlap, kategorije i open-ticket agregate. To smanjuje rizik da se kompleksna pravila sakriju u JSX-u.

---

## 4. Aktivni nalazi

### SS1 — Status mutation tokovi imaju synchronous operation guard

**Prioritet:** zatvoreno kroz Faze 2 i 3

Incident create/edit, update/resolve i status-page subscription koriste synchronous `useOperationGuard`; ključevi subscription, link i unlink operacija uključuju incident/ticket identitet. Ticket panel zadržava recovery nakon greške, a unlink prolazi kroz eksplicitni danger confirmation dijalog. React pending state ostaje prezentacijski signal, ne jedina concurrency zaštita.

### SS2 — `/status` request lifecycle je eksplicitan i latest-only

**Prioritet:** zatvoreno u Fazi 1

`useStatusOverviewData` sada je jedini vlasnik overview query identityja, initial/background greške, request ID-a, `nowMs` vremena i visibility-aware pollinga. Svaki reload dobija latest-request token i vraća typed rezultat (`applied`, `error`, `stale`); stariji odgovor ne može prepisati noviji, a unmount poništava aktivni token.

Stari overview ostaje vidljiv na refresh grešci. Domain error se mapira prije generičkog API fallbacka, uključujući `STATUS_PAGE_DISABLED`, a mutation callbackovi čekaju isti eksplicitni `reload()` ugovor umjesto page-local `inFlight` prečice. Direktni hook testovi pokrivaju stale retention, request correlation, overlapping response order, hidden-tab polling i unmount cancellation.

### SS3 — Incident dependency loading ima eksplicitan query/retry ugovor

**Prioritet:** zatvoreno u Fazi 2

Incident editor koristi zaseban React Query ključ za servisne opcije, bez kolizije s catalog-row cache oblikom. Query je aktivan samo dok je dijalog otvoren, čuva uspješne podatke kroz refresh, prikazuje povezanu grešku, request ID i eksplicitni Retry bez zatvaranja dijaloga ili gubitka drafta. Aktivni servisi i već sačuvani neaktivni izbori deriviraju se iz query rezultata umjesto effecta zavisnog od `serviceIds`.

### SS4 — Incident i downtime imaju eksplicitan civil-time ugovor

**Prioritet:** zatvoreno u Fazi 4

Incident i downtime `datetime-local` vrijednosti koriste dokumentovan browser-zone civil-time ugovor i na API granici postaju ISO instant. Centralni helper odbija neispravne kalendarske vrijednosti i nepostojeće civilno vrijeme round-trip provjerom; downtime dodatno validira strogo rastući interval prije slanja.

Obje forme prikazuju stvarnu IANA zonu preglednika, downtime period prikazuje zonu i puni lokalizovani raspon, a incident `max` se osvježava svakih 30 sekundi dok je dijalog otvoren. Pure testovi pokrivaju round-trip, neispravne vrijednosti, cross-zone prikaz, sarajevski DST skok i cross-day/range pravila.

### SS5 — Ticket incident panel ima eksplicitan identity/recovery ugovor

**Prioritet:** zatvoreno u Fazi 3

`useTicketIncidentsData` posjeduje identity `{ticketId, versionKey}`, latest-only guard, stale-data retention i query error/request ID. Promjena tiketa poništava prethodni scope, pa odgovor starog tiketa ne može prepisati novi. Initial greška više ne skriva panel: korisnik dobija `ApiErrorText` i Retry, dok background greška zadržava prethodne incidente.

Link/unlink koriste ID-scoped operation guard. Unlink sada ima danger confirmation koji jasno kaže da se uklanja samo veza, ne incident; neuspjeh ostavlja dijalog otvoren za retry. Kandidat lookup i dalje koristi overview endpoint, ali više nije correctness blokator nalaza.

### SS6 — Servisni katalog ima validiran URL-backed prikaz

**Prioritet:** zatvoreno u Fazi 5

Search, kategorija, lifecycle i origin-unit filteri sada se čitaju i ažuriraju kroz validirani search-param model. Create, edit, onboarding, form builder, downtime, lifecycle i categories workspace koriste stabilni `workspace/service` ugovor, pa refresh i deep link reproduciraju isti katalog prikaz.

Updater čuva nepovezane URL parametre. Nakon učitavanja podataka kanonizuju se nedostupni category, origin-unit i service ID-evi; query/routing outage ne briše scope koji još nije moguće pouzdano validirati. Pure parser/update/canonicalization testovi i MemoryRouter Back/Forward test zatvaraju regresijski ugovor.

### SS7 — Services read modeli imaju ujednačen query/recovery sloj

**Prioritet:** zatvoreno u Fazi 6

Katalog, kategorije, routing coverage i onboarding lookup sada koriste typed React Query ključeve. Reload callbackovi zavise od stabilnog `refetch` ugovora, a kategorijska promjena osvježava samo kategorije i katalog; routing se osvježava samo za servisne/routing promjene ili objedinjeni live refresh.

Routing greška više ne briše posljednji uspješni index niti tiho gasi filter: stranica prikazuje background upozorenje, mapiranu grešku, request ID i Retry. Onboarding draftovi se učitavaju kroz jedan keyed batch orchestration scope; postojeći `allSettled` loader izoluje parcijalni neuspjeh pojedinog servisa tako da zdrav progress ostaje vidljiv. Transport i dalje koristi izolovane per-service readove, ali više nema N nezavisnih UI state mašina niti correctness coupling između njih.

### SS8 — Downtime panel ima identity/recovery i mutation ugovor

**Prioritet:** zatvoreno u Fazi 6

Typed downtime controller koristi query identitet po `serviceId`, razdvaja initial loading od background refresh stanja i zadržava posljednje uspješne periode na grešci. Query greška izlaže request ID i Retry, a A→B promjena servisa ne može prikazati odgovor prethodnog scopea.

Cancel mutation ima per-service/per-window synchronous operation guard, danger confirmation i zaseban mutation error/request ID. Neuspjeh ostavlja potvrdu otvorenom, dok query greška više ne dijeli mutation error slot niti briše zdrave podatke.

### SS9 — Form i katalog mutation ugovori su retry-safe i typed

**Prioritet:** zatvoreno u Fazi 7

Create/update servisni inputi više se ne spajaju castovima: neutralne form vrijednosti mapiraju se u eksplicitne `CreateServiceInput` i `UpdateServiceInput` grane. Service, category, lifecycle i form-builder mutation tokovi koriste synchronous operation guard ključeve po entitetu i akciji.

`ensureServiceForm` kreira prvu verziju samo nakon uspješnog praznog GET-a. Read outage više ne pokreće mutation, a konkurentni `FORM_ALREADY_EXISTS` tretira se kao idempotentan uspjeh i završava ponovnim GET-om, bez dupliranja verzije. Direktni testovi pokrivaju empty/create, postojeću verziju, read outage, read-only i konkurentni create recovery.

### SS10 — Category i form-builder validacija zatvara greške prije submitovanja

**Prioritet:** zatvoreno u Fazi 7

Category parent izbor sada izbacuje samu kategoriju i sve potomke na proizvoljnoj dubini, pa korisnik ne može sastaviti ciklus prije submitovanja. Form builder koristi isti field-ID obrazac kao backend, prikazuje povezanu field grešku i blokira save za nevažeće/duplirane ID-eve, prazne labele te prazne ili duplirane select opcije.

Pure testovi pokrivaju višeslojno category stablo i form draft matricu. Backend validacija ostaje defense-in-depth, ali više nije prvi trenutak u kojem se osnovna greška otkriva.

### SS11 — Održivost i production hygiene imaju statički ugovor

**Prioritet:** zatvoreno u Fazi 8

Services workspace sada se iz URL modela prevodi u discriminated union (`closed`, `create`, `categories`, `onboarding` ili service-scoped workspace), pa stranica više ne interpretira nezavisni par nullable vrijednosti. URL enum parseri koriste type guardove bez assertion castova.

Brojčani formatter koristi zajednički cache, a status/services scope više nema delivery-history komentare. Novi hygiene gate skenira production komponente i controllere i sprečava povratak `Paket`, `Faza`, `Val`, numerisanih paragrafa i internih oznaka. Query i mutation controller granice iz ranijih faza ostavljaju prezentacijskim komponentama typed data/error ugovore.

### SS12 — Testna mreža ne pokriva kritične page/component state mašine

**Prioritet:** P1

Postoje kvalitetni pure/helper testovi, ali nedostaju direktni testovi za:

- StatusPage initial/background error, polling, stale response i subscription race;
- IncidentForm dependency failure/retry, civil time i double submit;
- IncidentUpdate resolve preview failure/retry i submit race;
- TicketIncidentsPanel ticket identity, silent error, link/unlink race;
- ServicesPage partial query failure i live-refresh race;
- URL state, jer još nije implementiran;
- downtime stale refresh/service switch/cancel race;
- category/form builder/onboarding mutation recovery matrice.

E2E `21` i `42` su vrijedni end-to-end scenariji, ali nisu zamjena za determinističke state-machine testove. U ovom reauditiranju su pročitani, ne izvršeni.

**Za zatvaranje:** direktna hook/component/page mreža, zatim stvarni Playwright run sa trace/screenshot dokazom.

### SS13 — Browser accessibility/responsive closeout nije aktuelno dokazan

**Prioritet:** P1 za 10/10

Potrebno je izvršiti, ne samo održavati, browser matricu:

- `/status` kao user i manager;
- incident create/edit/update/resolve/subscribe;
- ticket known-problem i staff link/unlink panel;
- `/services` filteri, editori, onboarding, form builder, kategorije i downtime;
- 320/375/768/1280 px, 200% zoom, keyboard/focus return;
- serious/critical axe;
- initial/background failure, stale A→B identity i synchronous double-submit;
- revision SHA, rezultat bez skipova, trace i screenshot artefakti.

Bez ovog dokaza ocjena ne može biti 10/10.

---

## 5. Ocjena po oblasti

| Oblast                                        |   Trenutno |      Cilj |
| --------------------------------------------- | ---------: | --------: |
| Backend autorizacija i domenske granice       |        9,3 |        10 |
| Query identity, stale state i recovery        |        6,7 |        10 |
| Mutation concurrency i cache konzistentnost   |        6,3 |        10 |
| Civil-time, dostupnost i incident correctness |        7,2 |        10 |
| URL/shareability i navigacija                 |        5,5 |        10 |
| Accessibility i responsive struktura          |        7,8 |        10 |
| Testabilnost i održivost                      |        6,9 |        10 |
| Browser/E2E dokaz                             |        4,5 |        10 |
| **Ukupno**                                    | **7,4/10** | **10/10** |

Ocjena nije aritmetički prosjek. P1 correctness, recovery i concurrency rizici nose veću težinu od količine implementirane funkcionalnosti.

---

## 6. Fazni implementacijski plan do 10/10

### Faza 1 — Status overview controller i recovery

**Nalazi:** `SS2`, dio `SS12`

1. Izdvojiti `useStatusOverviewData`.
2. Modelirati initial/background error i request ID.
3. Uvesti latest-only/unmount zaštitu i visibility-aware polling.
4. Definisati mutation-follow-up refresh ugovor.
5. Dodati direktne hook/page testove.

**Exit gate:** stari overview ostaje vidljiv na refresh grešci, stale odgovor ne može pobijediti, a svaki retry je eksplicitan.

**Status nakon Faze 1: završeno.**

- `StatusPage` više ne posjeduje ručni `inFlight`, polling i query error state; koristi typed `useStatusOverviewData`.
- Overlapping refreshi su latest-only, unmount poništava request identitet, a polling ne radi dok je dokument skriven.
- Initial i background greške dijele domain-first mapiranje, request ID i eksplicitan Retry, uz očuvanje prethodnog overviewa.
- Mutation follow-up koristi isti awaitable reload ugovor. `SS2` i pripadajući dio `SS12` su zatvoreni.

**Izvršni dokaz:** ciljni suite prolazi **2/2 fajla i 10/10 testova**; puni frontend Vitest prolazi **394/394 fajla i 1544/1544 testa**. Production TypeScript/Vite build, puni ESLint, i18n/design-system, Prettier i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E nije izvršen.

### Faza 2 — Incident mutation concurrency i dependency ugovor

**Nalazi:** `SS1`, `SS3`, dio `SS12`

1. Uvesti synchronous operation guard za create/edit/update/resolve/subscribe.
2. Prebaciti listu servisa na typed query/cache.
3. Dodati error/request ID/Retry bez gubitka drafta.
4. Razdvojiti query i mutation greške.
5. Testirati double submit i recovery.

**Exit gate:** jedna korisnička namjera proizvodi najviše jedan write zahtjev; dependency outage ne zahtijeva zatvaranje dijaloga.

**Status nakon Faze 2: završeno.**

- Incident create/edit i update/resolve koriste synchronous `useOperationGuard`; subscription akcije su zaključane po incident ID-u.
- Servisne opcije prebačene su na zaseban typed React Query cache sa error/request ID/Retry ugovorom i očuvanjem drafta.
- Uklonjen je dependency effect čiji je retry implicitno zavisio od promjene `serviceIds`. `SS3`, status-page dio `SS1` i pripadajući dio `SS12` su zatvoreni; ticket link/unlink dio `SS1` mapiran je na Fazu 3.

**Izvršni dokaz:** ciljni concurrency/controller suite prolazi; production TypeScript/Vite build i ciljani ESLint prolaze. Puni gate rezultat evidentira se nakon objedinjene Faze 3 regresije.

### Faza 3 — Ticket incident controller

**Nalazi:** `SS5`, dio `SS1`, dio `SS12`

1. Uvesti identity `{ticketId, versionKey}` i latest-only zaštitu.
2. Prikazati initial/background greške i retry.
3. Uvesti per-operation guard za link/unlink.
4. Donijeti potvrđen unlink confirmation/reason ugovor.
5. Dodati requester/staff component testove.

**Exit gate:** panel nikada tiho ne nestaje zbog mrežne greške i odgovor starog tiketa ne može prepisati novi.

**Status nakon Faze 3: završeno.**

- Typed ticket-incidents controller uvodi latest-only `{ticketId, versionKey}` identity, stale retention, request ID i Retry.
- Link/unlink imaju synchronous per-entity guard; unlink ima eksplicitni danger confirmation i ostaje otvoren nakon greške.
- Requester/staff prikaz nastavlja koristiti backend `staff` odgovor, bez UI-only autorizacijske pretpostavke. `SS1`, `SS5` i pripadajući dio `SS12` su zatvoreni.

**Izvršni dokaz:** ciljni controller/guard suite prolazi **3/3 fajla i 7/7 testova**; puni frontend Vitest prolazi **395/395 fajlova i 1546/1546 testova**. Production TypeScript/Vite build, puni ESLint i i18n/design-system gate prolaze; Prettier i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E nije izvršen.

### Faza 4 — Civil-time i dostupnost ugovor

**Nalazi:** `SS4`, dio `SS8`

1. Dokumentovati incident/downtime authoring zonu.
2. Centralizovati civil-time ↔ instant helper.
3. Prikazati IANA zonu uz input i periode.
4. Stabilizovati ili osvježavati `max` u otvorenom incident dijalogu.
5. Dodati DST/cross-zone/range testove.

**Status:** završeno. Browser-zona je vidljiva u authoring formama i periodu, API prima ISO instant, `max` ostaje svjež, a DST/cross-zone/range ugovor ima pure regresijske testove.

**Izvršni dokaz:** production build prolazi; puni frontend Vitest prolazi **396/396 fajlova i 1549/1549 testova**. Ciljani ESLint prolazi. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E nije izvršen.

**Exit gate:** isti ugovor vrijedi u UI-u, API payloadu i prikazu primaoca — ispunjen.

### Faza 5 — URL-backed katalog i workspace

**Nalazi:** `SS6`

1. URL-backed `q`, category, lifecycle i origin-unit filteri.
2. URL-backed otvoreni servis/workspace (`edit`, `onboarding`, `form`, `downtime`, `lifecycle`).
3. Validacija i post-data kanonizacija nedostupnih ID-eva.
4. Očuvanje nepovezanih parametara.
5. Parser/update i browser Back/Forward testovi.

**Status:** završeno. Filteri i svi glavni katalog workspaceovi su URL-backed, nepovezani parametri se čuvaju, a nedostupni ID-evi kanonizuju tek nakon relevantnog data loada.

**Izvršni dokaz:** URL model/history suite prolazi **2/2 fajla i 5/5 testova**; puni frontend Vitest prolazi **398/398 fajlova i 1556/1556 testova**. Production build, puni ESLint, i18n/design-system i Prettier prolaze; `git diff --check` prolazi. Browser/E2E nije izvršen.

**Exit gate:** refresh, deep link i historija deterministički reproduciraju isti katalog prikaz — ispunjen.

### Faza 6 — Ujednačen services query/recovery sloj

**Nalazi:** `SS7`, `SS8`

1. Typed query ključevi za katalog, kategorije, routing i onboarding.
2. Ujednačiti initial/background error i request ID.
3. Zadržati stale routing/downtime podatke na refresh grešci.
4. Batch onboarding summary i ciljane invalidacije.
5. Testirati partial failure i A→B service race.

**Status:** završeno. Services read modeli koriste typed query identitete i stale retention; routing i downtime greške imaju request ID/Retry, invalidacije su ciljane, a downtime cancel ima potvrdu i synchronous guard.

**Izvršni dokaz:** ciljni recovery/race suite prolazi **3/3 fajla i 4/4 testa**; puni frontend Vitest prolazi **400/400 fajlova i 1559/1559 testova**. Production build, puni ESLint, i18n/design-system i Prettier prolaze; `git diff --check` prolazi. Browser/E2E nije izvršen.

**Exit gate:** nijedan parcijalni outage ne briše zdrav, nepovezan scope — ispunjen.

### Faza 7 — Form builder, kategorije i onboarding hardening

**Nalazi:** `SS9`, `SS10`, dio `SS12`

1. Razdvojiti create/update tipove bez castova.
2. Zatvoriti ensure/idempotency recovery.
3. Uvesti frontend field-ID i category-descendant validaciju.
4. Ujednačiti destructive confirmation/reason matricu.
5. Dodati punu onboarding/form/category mutation test mrežu.

**Status:** završeno. Create/update payloadi su typed bez castova; ensure tok je retry-safe; category potomci i field-ID/schema greške validiraju se prije submitovanja; mutation tokovi imaju synchronous guard.

**Izvršni dokaz:** ciljni form/category/guard suite prolazi **4/4 fajla i 10/10 testova**; puni frontend Vitest prolazi **401/401 fajlova i 1563/1563 testova**. Production build, puni ESLint, i18n/design-system i Prettier prolaze; `git diff --check` prolazi. Browser/E2E nije izvršen.

**Exit gate:** partial success se može sigurno ponoviti bez duplikata i bez oslanjanja na kasni generički backend error — ispunjen.

### Faza 8 — Održivost i statički closeout

**Nalazi:** `SS11`, regresija `SS1–SS12`

1. Controller/presentation granice.
2. Discriminated workspace state.
3. Centralni number/date formatteri i typed error ugovori.
4. Ukloniti delivery-history komentare i dodati hygiene gate.
5. Puni frontend/backend relevantni suite, build, ESLint, i18n/design-system, Prettier i `git diff --check`.

**Status:** završeno. Workspace je discriminated, formatter cache je centralizovan, URL parseri su typed bez assertion castova, a comment-hygiene regresija ima statički gate.

**Izvršni dokaz:** novi static/workspace/formatter suite prolazi **3/3 fajla i 7/7 testova**; puni frontend Vitest prolazi **403/403 fajla i 1566/1566 testova**. Frontend production build, puni ESLint, i18n/design-system, Prettier i `git diff --check` prolaze. Relevantni backend Jest je ponovo pokušan nakon `npm ci`, ali generisani Prisma client nije prisutan; `prisma generate` je blokiran ograničenjem mreže prema `binaries.prisma.sh`, pa backend suite nije predstavljen kao zelen. Browser/E2E nije izvršen.

**Exit gate:** svi dostupni deterministički i statički frontend gateovi su zeleni; bez browser dokaza ocjena ostaje najviše 9,8/10 — ispunjen.

### Faza 9 — Browser/E2E closeout

**Nalazi:** `SS13`, završna regresija `SS1–SS13`

1. Proširiti `21` i `42` na failure/race/history tokove.
2. Izvršiti user/manager i ticket-integrated scenarije.
3. Izvršiti responsive, zoom, keyboard/focus i axe matricu.
4. Evidentirati komandu, revision SHA, rezultat bez skipova, trace i screenshot.

**Status pokušaja (2026-10-20): blokirano infrastrukturom, nije zatvoreno.** E2E TypeScript provjera prolazi, ali lokalni preflight potvrđuje da `localhost:5173` i `localhost:10001/health` nisu dostupni. Pokretanje:

```bash
E2E_RETRIES=0 npx playwright test \
  tests/21-status-monitoring.spec.ts \
  tests/42-catalog-sla-routing-ux.spec.ts --max-failures=1
```

zaustavljeno je u `globalSetup` porukom `E2E stack not ready at http://localhost:10001/health`; nijedan test nije počeo, pa nema legitimnog trace/screenshot/browser dokaza. Pokušaj manualnog GitHub Actions dispatcha za revision `04e05468a75f2b88ea53b87cff668dae41658516` odbijen je sa HTTP 403 (`Resource not accessible by integration`). Ovo se ne računa kao test failure, ali se izričito ne računa ni kao prolaz ili izvršen scenario.

**Za nastavak:** obezbijediti live test stack i E2E actor secrets ili omogućiti Actions workflow dispatch ovom GitHub identitetu; zatim pokrenuti `21` i `42` bez skipova i evidentirati run URL, tačan tested SHA, rezultate, trace, screenshot i axe/responsive matricu.

**Exit gate:** `SS1–SS13` zatvoreni i stvarni browser run zelen — **nije ispunjen**.

---

## 7. Obavezna završna test matrica

### Unit/hook

- status initial/background failure, visibility polling i latest-only;
- operation guard po incidentu/tiketu/windowu;
- civil-time/DST/cross-zone;
- URL parser/update i canonical defaults;
- catalog/category/routing/onboarding partial failure;
- downtime A→B identity i stale retention;
- lifecycle, category descendant i field identifier validacija.

### Component/page

- StatusPage refresh/subscription/dialog orchestration;
- IncidentForm i IncidentUpdate dependency/mutation recovery;
- TicketIncidentsPanel requester/staff/link/unlink;
- ServicesPage partial data i live refresh;
- filter/workspace URL state;
- downtime, lifecycle, category, form builder i onboarding;
- field errors, request ID, retry i focus return.

### Backend

- permission + role + service-scope matrica;
- incident visibility/lifecycle/subscription/link authorization;
- availability/downtime configuration i overlap;
- category cycle i form schema validacija;
- idempotent onboarding/form creation;
- audit reason i mutation diff.

### Browser/E2E

- `21-status-monitoring.spec.ts` proširen failure/race scenarijima;
- `42-catalog-sla-routing-ux.spec.ts` proširen URL/history i partial-outage scenarijima;
- 320/375/768/1280, 200% zoom;
- keyboard-only i focus return;
- serious/critical axe;
- trace/screenshot artefakti i revision SHA.

---

## 8. Preporučeni redoslijed implementacije

1. Faza 1 — Status overview controller.
2. Faza 2 — Incident concurrency i dependency recovery.
3. Faza 3 — Ticket incident identity/recovery.
4. Faza 4 — Civil-time ugovor.
5. Faza 5 — URL-backed katalog/workspace.
6. Faza 6 — Services query/recovery konsolidacija.
7. Faza 7 — Form/category/onboarding hardening.
8. Faza 8 — Statički closeout.
9. Faza 9 — Browser/E2E dokaz.

Redoslijed prvo zatvara correctness i race rizike, zatim shareability i podatkovni sloj, pa održivost i browser dokaz. Vizuelni polish ne treba ići ispred request identityja, mutation guardova i recoveryja.

---

## 9. Zaključak

Status i servisi imaju široku funkcionalnost i jaku backend osnovu, ali trenutni frontend nije na standardu 10/10 koji je uspostavljen u kasnije zatvorenim modulima. Najveći dug nije nedostatak ekrana nego nedovoljno eksplicitan lifecycle: ko je vlasnik query identiteta, šta ostaje vidljivo nakon greške, može li ista namjera poslati dva write zahtjeva i može li URL reproducirati korisnikov kontekst.

Reaudit zato zamjenjuje staru oznaku „zatvoren 7/10“ aktivnim planom od devet faza. Cilj od 10/10 je realan tek nakon determinističkih controller/component testova i stvarno izvršene browser matrice; bez E2E dokaza maksimalna ocjena ostaje 9,8/10.
