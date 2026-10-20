# Modul 10: Status i servisi — dubinski reaudit

**Datum reauditiranja:** 2026-10-20
**Scope:** `/status`, `/services`, incidenti uz tiket, servisni katalog, kategorije, onboarding, obrasci servisa, dostupnost i planirani prekidi
**Status:** otvoren za implementaciju
**Aktuelna ocjena:** **8,3/10 nakon Faze 2**
**Cilj:** **10/10** uz stvarni browser/E2E dokaz

---

## 1. Izvršni sažetak

Modul je znatno zreliji od arhivskog audita od 13–15. oktobra. Backend ima ozbiljne autorizacijske i domenske granice, katalog više nema raniji render loop, onboarding čuva kreirani draft prije narednog koraka, status refresh zadržava prethodni overview, a servisni katalog razlikuje početnu grešku od pozadinske greške. Postoje i korisni E2E scenariji `21-status-monitoring.spec.ts` i `42-catalog-sla-routing-ux.spec.ts`.

Ipak, oznaka „zatvoren, 7/10“ iz starog dokumenta više nije prihvatljiva kao aktuelni audit. Većina tada „prihvaćenih rizika“ i dalje je stvarni backlog, a današnji standard repozitorija je viši nakon modula 11–16 i faznog zatvaranja modula 09.

Faza 1 je u međuvremenu izdvojila i direktno testirala latest-only `/status` controller. Najvažniji preostali rizici su:

1. status i incident mutation tokovi nemaju synchronous concurrency guard;
2. incident forme nemaju robustan dependency-retry ni eksplicitan civil-time ugovor;
3. servisni filteri i otvoreni workspace nisu URL-backed;
4. katalog kombinuje React Query i više ručnih request state mašina sa različitim recovery pravilima;
5. downtime panel briše prethodne podatke na refresh grešci i nema request identity zaštitu;
6. kritične komponente nemaju direktne component/page testove;
7. browser dokaz nije izvršen u ovom reauditiranju.

Ocjena **7,8/10 nakon Faze 1** priznaje jaku backend osnovu i ranije popravke, ali ne tretira odsustvo regresije kao dokaz korektnosti.

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

### SS1 — Status mutation tokovi nisu zaštićeni od synchronous double-submit racea

**Prioritet:** P1
**Lokacije:** `status-page.tsx`, `incident-form-dialog.tsx`, `incident-update-dialog.tsx`, `ticket-incidents-panel.tsx`

`setSaving(true)`, `setBusy(true)` i `setBusyId(...)` postaju vidljivi tek nakon React updatea. Dva click/submit događaja u istom tasku mogu pokrenuti dva `createIncident`, `editIncident`, `postIncidentUpdate`, subscribe/unsubscribe ili link/unlink zahtjeva. `ticket-incidents-panel.tsx` ima generički `run`, ali nema synchronous lock po operaciji ili entitetu.

Globalni `busyId` na status stranici dodatno blokira sve subscription akcije zbog jednog incidenta, iako identitet operacije nije eksplicitan.

**Za zatvaranje:** `useOperationGuard`/`createOperationGuard` sa ključem operacije i incident/ticket ID-em; direktni testovi za double submit, retry nakon greške i nezavisne entitete.

### SS2 — `/status` request lifecycle je eksplicitan i latest-only

**Prioritet:** zatvoreno u Fazi 1

`useStatusOverviewData` sada je jedini vlasnik overview query identityja, initial/background greške, request ID-a, `nowMs` vremena i visibility-aware pollinga. Svaki reload dobija latest-request token i vraća typed rezultat (`applied`, `error`, `stale`); stariji odgovor ne može prepisati noviji, a unmount poništava aktivni token.

Stari overview ostaje vidljiv na refresh grešci. Domain error se mapira prije generičkog API fallbacka, uključujući `STATUS_PAGE_DISABLED`, a mutation callbackovi čekaju isti eksplicitni `reload()` ugovor umjesto page-local `inFlight` prečice. Direktni hook testovi pokrivaju stale retention, request correlation, overlapping response order, hidden-tab polling i unmount cancellation.

### SS3 — Incident dependency loading ima eksplicitan query/retry ugovor

**Prioritet:** zatvoreno u Fazi 2

Incident editor koristi zaseban React Query ključ za servisne opcije, bez kolizije s catalog-row cache oblikom. Query je aktivan samo dok je dijalog otvoren, čuva uspješne podatke kroz refresh, prikazuje povezanu grešku, request ID i eksplicitni Retry bez zatvaranja dijaloga ili gubitka drafta. Aktivni servisi i već sačuvani neaktivni izbori deriviraju se iz query rezultata umjesto effecta zavisnog od `serviceIds`.

### SS4 — Civil-time ugovor incidenta i downtimea nije eksplicitan

**Prioritet:** P1
**Lokacije:** `incident-form-dialog.tsx`, `service-downtime-window-form.tsx`, status/downtime prikazi

Incident `datetime-local` se parsira browser lokalnom zonom i šalje kao ISO instant, ali editor ne prikazuje IANA zonu niti objašnjava author/recipient semantiku. `max={toLocalInput(new Date())}` se računa tokom rendera i može zastarjeti u dugo otvorenom dijalogu. Sličan civil-time rizik postoji u downtime formi.

Backend ispravno radi s instantima i validira range, ali frontend nema DST/cross-zone contract testove za ovaj modul.

**Za zatvaranje:** dokumentovan civil-time ugovor, vidljiva zona, centralni helperi, stabilan/obnovljen `max`, DST i cross-zone testovi za incident i downtime.

### SS5 — Ticket incident panel tiho nestaje i nema query identity

**Prioritet:** P1
**Lokacija:** `ticket-incidents-panel.tsx`

Svaka load greška postavlja `state=null`, a komponenta zatim vraća `null`. Korisnik i support ne vide grešku, request ID niti retry. Promjena `ticketId`/`versionKey` nema sequence/cancellation zaštitu, pa stariji odgovor može prepisati novi tiket. Picker ponovo učitava cijeli status overview samo radi kandidata.

Unlink nema potvrdu/reason ugovor i link/unlink dijele jedan globalni busy flag. To je correctness i recovery rizik unutar ticket detaila.

**Za zatvaranje:** typed ticket-incidents controller sa identityjem `{ticketId, versionKey}`, initial/background errorom, latest-only zaštitom, kandidat endpointom ili kešom, operation guardom i eksplicitnim unlink confirmation ugovorom.

### SS6 — Servisni katalog nema URL-backed prikaz

**Prioritet:** P1
**Lokacije:** `service-catalog-list.tsx`, `services-page.tsx`

Search, kategorija, lifecycle i origin-unit filteri su lokalni state. Refresh, deep link i browser Back/Forward ih gube. Otvoreni onboarding, editor, lifecycle, downtime, form builder i category workspace također su lokalna tri-state stanja.

Za administrativni katalog je važno da support može podijeliti tačan filtrirani prikaz ili servis. Trenutni `/services` URL to ne može reproducirati.

**Za zatvaranje:** validirani search-param model za filtere i stabilan `open/type/id` workspace ugovor; očuvanje nepovezanih parametara; post-data kanonizacija nedostupnih kategorija/OU/servisa; parser i browser history testovi.

### SS7 — Data loading model je fragmentiran i routing failure je tih

**Prioritet:** P1
**Lokacije:** `use-service-catalog.ts`, `use-service-categories.ts`, `use-catalog-routing-coverage.ts`, `use-visible-onboardings.ts`, `services-page.tsx`

Katalog koristi React Query, dok kategorije, routing coverage i onboardings koriste zasebne ručne sequence state mašine. Njihova recovery pravila nisu ista:

- katalog i kategorije izlažu error/request ID;
- routing coverage na grešci briše index, postavlja `isAvailable=false` i ne izlaže grešku;
- onboarding lookup djelimično radi N+1 po DRAFT servisu;
- `reloadCategories` kaskadno reloada kategorije, katalog i routing čak i kada promjena nije uticala na sve scopeove.

`useServiceCatalog.reload` zavisi od cijelog React Query result objekta (`[query]`), pa stabilnost callbacka nije ugovorno jasna i može širiti nepotrebne effect/live-refresh promjene.

**Za zatvaranje:** typed query ključevi i ujednačen query/recovery sloj; routing error + Retry; ciljane invalidacije; stabilan reload callback; batch onboarding summary.

### SS8 — Downtime panel briše zdrave podatke na grešci i nema race zaštitu

**Prioritet:** P1
**Lokacija:** `service-downtime-windows-panel.tsx`

Svaki reload vraća panel na skeleton, a catch radi `setWindows([])`. Pozadinska greška zato briše posljednju uspješnu listu i istovremeno može prikazati empty copy uz error. Nema request sequence/cancel zaštite kada se brzo promijeni `serviceId` ili sheet zatvori.

Cancel mutation koristi React state kao jedini pending guard, nema synchronous lock, nema potvrdu i dijeli jedan error slot sa query greškom. Request ID se ne prikazuje.

**Za zatvaranje:** typed downtime controller sa initial/background stanjem, latest-only identityjem po service ID-u, stale-data retentionom, query/mutation error razdvajanjem i per-window operation guardom.

### SS9 — Form/onboarding mutation i cache ugovori ostaju djelimični

**Prioritet:** P2
**Lokacije:** form builder, mutation sheet, onboarding wizard i service API helperi

`ensureServiceForm` ima pure test, ali create/retry idempotency cijelog UI toka nije direktno dokazana. Form builder promjene pokreću širok katalog reload. Create/update se i dalje spajaju castom `values as CreateServiceInput`, što skriva razliku ugovora. Dio dinamičkih i18n ključeva i tipova ostaje oslabljen castovima.

Onboarding je bolji nego u arhivskom stanju, ali nema punu component matricu za svaki korak, stale service identity, close/reopen, synchronous submit i partial API uspjeh.

**Za zatvaranje:** razdvojeni typed create/update inputi, idempotency ključ ili backend-safe retry, ciljane invalidacije i characterization testovi svih onboarding koraka.

### SS10 — Category i form-builder UX se oslanja na backend tek nakon submitovanja

**Prioritet:** P2
**Lokacije:** category mutation, form-field editor/draft

Backend validira category parent ciklus i field identifier, ali UI ne isključuje sve potomke iz parent izbora i ne koristi puni backend field-ID ugovor prije submitovanja. Korisnik grešku saznaje kasno, a field-level recovery nije uvijek precizan.

Brisanje kategorije ima jači confirmation model od brisanja DRAFT servisa i cancelovanja downtime prozora, pa destruktivne akcije nisu dosljedne.

**Za zatvaranje:** frontend mirror validacija uz backend source of truth, potomak-filter, povezane field greške i jedinstvena matrica confirm/reason pravila.

### SS11 — Održivost i production hygiene nisu na standardu novijih modula

**Prioritet:** P2

Najveće komponente imaju 300–400 linija i kombinuju fetch, mutation, permissions, dialog state i prezentaciju. Scope još sadrži delivery-history komentare (`Paket`, numerisani `§`). Tri-state modeli poput `undefined/null/object` nose skriveno značenje. `Intl.NumberFormat` se kreira po komponenti umjesto kroz zajednički cache, a API helperi i error mape nisu potpuno ujednačeni.

**Za zatvaranje:** controller/presentation granice, discriminated workspace unioni, comment-hygiene gate, centralni formatteri i typed API/error ugovori.

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

### Faza 4 — Civil-time i dostupnost ugovor

**Nalazi:** `SS4`, dio `SS8`

1. Dokumentovati incident/downtime authoring zonu.
2. Centralizovati civil-time ↔ instant helper.
3. Prikazati IANA zonu uz input i periode.
4. Stabilizovati ili osvježavati `max` u otvorenom incident dijalogu.
5. Dodati DST/cross-zone/range testove.

**Exit gate:** isti ugovor vrijedi u UI-u, API payloadu i prikazu primaoca.

### Faza 5 — URL-backed katalog i workspace

**Nalazi:** `SS6`

1. URL-backed `q`, category, lifecycle i origin-unit filteri.
2. URL-backed otvoreni servis/workspace (`edit`, `onboarding`, `form`, `downtime`, `lifecycle`).
3. Validacija i post-data kanonizacija nedostupnih ID-eva.
4. Očuvanje nepovezanih parametara.
5. Parser/update i browser Back/Forward testovi.

**Exit gate:** refresh, deep link i historija deterministički reproduciraju isti katalog prikaz.

### Faza 6 — Ujednačen services query/recovery sloj

**Nalazi:** `SS7`, `SS8`

1. Typed query ključevi za katalog, kategorije, routing i onboarding.
2. Ujednačiti initial/background error i request ID.
3. Zadržati stale routing/downtime podatke na refresh grešci.
4. Batch onboarding summary i ciljane invalidacije.
5. Testirati partial failure i A→B service race.

**Exit gate:** nijedan parcijalni outage ne briše zdrav, nepovezan scope.

### Faza 7 — Form builder, kategorije i onboarding hardening

**Nalazi:** `SS9`, `SS10`, dio `SS12`

1. Razdvojiti create/update tipove bez castova.
2. Zatvoriti ensure/idempotency recovery.
3. Uvesti frontend field-ID i category-descendant validaciju.
4. Ujednačiti destructive confirmation/reason matricu.
5. Dodati punu onboarding/form/category mutation test mrežu.

**Exit gate:** partial success se može sigurno ponoviti bez duplikata i bez oslanjanja na kasni generički backend error.

### Faza 8 — Održivost i statički closeout

**Nalazi:** `SS11`, regresija `SS1–SS12`

1. Controller/presentation granice.
2. Discriminated workspace state.
3. Centralni number/date formatteri i typed error ugovori.
4. Ukloniti delivery-history komentare i dodati hygiene gate.
5. Puni frontend/backend relevantni suite, build, ESLint, i18n/design-system, Prettier i `git diff --check`.

**Exit gate:** svi deterministički i statički gateovi zeleni; bez browser dokaza ocjena najviše 9,8/10.

### Faza 9 — Browser/E2E closeout

**Nalazi:** `SS13`, završna regresija `SS1–SS13`

1. Proširiti `21` i `42` na failure/race/history tokove.
2. Izvršiti user/manager i ticket-integrated scenarije.
3. Izvršiti responsive, zoom, keyboard/focus i axe matricu.
4. Evidentirati komandu, revision SHA, rezultat bez skipova, trace i screenshot.

**Exit gate:** `SS1–SS13` zatvoreni i stvarni browser run zelen.

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
