# Modul 10: Status i servisi

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, grep, provjera backend guardova i e2e pokrivenosti). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **ST** (status stranica i incidenti) i **SV** (katalog servisa, kategorije, forme, onboarding, prozori nedostupnosti). Ovo se ne miješa sa O/OB (modul 9), KB (modul 7), RS (modul 8), R (modul 6) i S (modul 5).

Provjere izvršene u sandboxu:
- **Čitanje u cijelosti (frontend, status):** `pages/status-page.tsx` (303), `lib/status/status-view.ts` (113), `services/status-api.ts` (144), `components/status/incident-form-dialog.tsx` (281), `components/status/incident-card.tsx` (177), `components/status/incident-update-dialog.tsx` (160), `components/status/service-incident-banner.tsx` (94), `components/status/ticket-incidents-panel.tsx` (196).
- **Čitanje u cijelosti (frontend, servisi):** `pages/services-page.tsx` (266), `services/service-catalog-api.ts` (238), `services/service-forms-api.ts` (33), `components/services/service-catalog-table.tsx` (376), `service-catalog-list.tsx` (183), `service-catalog-filter-bar.tsx` (156), `service-catalog-category-chips.tsx` (50), `service-category-chip.tsx` (31), `service-catalog-lifecycle-actions.tsx` (114), `service-catalog-lifecycle-dialog.tsx` (48), `service-catalog-mutation-form.tsx` (279), `service-catalog-mutation-sheet.tsx` (134), `service-downtime-window-form.tsx` (144), `service-downtime-windows-panel.tsx` (138), `categories/service-categories-panel.tsx` (129), `onboarding/service-onboarding-wizard.tsx` (297), `onboarding/onboarding-wizard-steps.tsx` (112), `onboarding/onboarding-service-step.tsx` (91), `onboarding/onboarding-form-step.tsx` (41), `onboarding/onboarding-routing-step.tsx` (59), `onboarding/onboarding-sla-step.tsx` (64), `onboarding/onboarding-approvals-step.tsx` (59), `form-builder/service-form-builder.tsx` (161), `form-builder/service-form-builder-sheet.tsx` (45), `form-builder/form-builder-actions.tsx` (67), `form-builder/form-field-editor.tsx` (174), `form-builder/form-field-list.tsx` (57), `form-builder/form-version-history.tsx` (60).
- **Čitanje u cijelosti (lib):** `use-service-catalog.ts`, `use-catalog-routing-coverage.ts`, `use-visible-onboardings.ts`, `use-service-categories.ts`, `load-visible-onboardings.ts`, `load-catalog-routing-coverage.ts`, `service-catalog-load-state.ts`, `resolve-catalog-write-flags.ts`, `filter-service-catalog-rows.ts`, `form-field-draft.ts`, `ensure-service-form.ts`, `load-or-start-onboarding.ts`, `require-catalog-change-reason.ts`, `complete-onboarding-step.ts`, `map-service-catalog-error.ts`, `lib/sla/sla-profile-name.ts`.
- **Samo pregled (nazivi, potpisi, upotreba):** `services/service-onboarding-api.ts` (160), `services/service-downtime-api.ts` (88), `services/service-categories-api.ts` (59), `categories/service-category-mutation-form.tsx` (96, do reda 40), `categories/service-category-mutation-sheet.tsx` (98), `categories/service-categories-admin-sheet.tsx` (56), `service-downtime-windows-sheet.tsx` (43), `service-downtime-window-row.tsx` (58), `service-catalog-read-only-banner.tsx` (24), `onboarding/service-onboarding-stepper.tsx` (25), `onboarding/service-onboarding-pipeline-card.tsx` (81). Mapiranja `map-service-category-error.ts`, `map-service-forms-error.ts`, `map-service-onboarding-error.ts` nisu pročitana, samo struktura. Nisu pročitani `catalog-routing-index.ts`, `catalog-coverage-note.ts`, `allowed-service-lifecycle-transitions.ts`, `onboarding-step-state.ts`, `default-service-form-schema.ts`, `downtime-datetime.ts` (osim pregleda).
- **Backend (guardovi i servisi):** `status-page/status-page.controller.ts` (cijelo), `status-page/public-status-page.controller.ts` (overview), `status-page/status-page.service.ts` (`forTicket`, filteri vidljivosti), `status-page/status-incidents.service.ts` (`linkTicket`, `unlinkTicket`, `subscribe`, `assertStaffTicket`, `eventDetail`), `service-catalog/service-availability.controller.ts` (dekoratori), `service-catalog/service-categories.controller.ts`, `services.controller.ts`, `service-forms.controller.ts` (dekoratori). **Nije provjereno:** backend `service-onboarding` guardovi, validacija ciklusa u kategorijama (`service-categories` servis).
- **E2E:** `21-status-monitoring.spec.ts` (3 testa: admin vidi zdravlje i test alarm; tok incidenta od obavještenja do rješavanja; obični korisnik ne može da upravlja) i `42-catalog-sla-routing-ux.spec.ts` (4 testa: kreiranje/izmjena servisa, onboarding, lifecycle i filteri; SLA kalendar; routing; overflow na širinama). Nije pročitan svaki red.
- **Pretraga:** `as never`, `as unknown`, `: any`, `eslint-disable`, `console.`, `TODO`, `dangerouslySetInnerHTML` u obuhvaćenom kodu: samo `t as never` (2 mjesta u modulu, 36 u cijelom `src`). Nema ESLint, Prettier konfiguracije niti `lint` skripte u `frontend/` (`package.json` ima samo `test` među provjerama kvaliteta).
- **Nije pokrenut pregledač.** Nalaz SV1 (beskonačni render) potvrđen je izolovanom reprodukcijom sa React 18.3.1 i jsdom, koja ponavlja isti obrazac hookova. Treba ga potvrditi i u stvarnoj aplikaciji (React DevTools profiler na `/services` pri sporom učitavanju).

---

## Modul

Modul pokriva dva nezavisna dijela koja dijele jednu stranicu i jezik:

- **Status (`/status`)** je javna i interna stranica stanja servisa. Prikazuje ukupno stanje, planirane prekide, aktivne incidente i istoriju. Upravljači (`statusIncidentsManage`) otvaraju incident, dodaju ažuriranja, rješavaju ga i vide koliko ljudi će biti obaviješteno. Iz tiketa se vidi „poznati problem“ i može se vezati ili odvezati incident. Osvježavanje je na 60 sekundi uz provjeru vidljivosti taba.
- **Servisi (`/services`)** je katalog za administratore: lista sa filterima, kategorije, kreiranje i izmjena, lifecycle (DRAFT → ACTIVE → DEPRECATED), prozori nedostupnosti, forme sa verzijama i wizard za uvođenje servisa (SERVICE → FORM → ROUTING → SLA → APPROVALS → finalize).

Najveći rizik je u dijelu servisa: stranica drži više od deset overlay stanja, dva ručna `useState` načina učitavanja podataka pored react-query, i nekoliko mjesta gdje se stanje prikaza razlikuje od stanja koje se šalje. Status dio je u boljem stanju na backendu (vidljivost je zaštićena u servisu, ne samo u UI), ali na frontendu ima tihe greške i jedno pitanje oko vezivanja tiketa za incident.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/status-page.tsx` | Stranica statusa, polling 60s, dijalozi | 303 |
| `frontend/src/lib/status/status-view.ts` | Stanje, tonovi, mapiranje grešaka, prelazi statusa | 113 |
| `frontend/src/services/status-api.ts` | Tipovi i API `/status/*` | 144 |
| `frontend/src/components/status/` | Dijalog incidenta, kartica, ažuriranje, banner, panel u tiketu | 6 fajlova, ~1 100 |
| `frontend/src/pages/services-page.tsx` | Stranica servisa, orkestracija overlay-a | 266 |
| `frontend/src/components/services/` | Tabela, lista, filteri, forme, wizard, forme (builder), prozori, kategorije | ~45 fajlova |
| `frontend/src/lib/services/` | Hookovi učitavanja, mapiranje grešaka, pravila, helperi wizarda | ~40 fajlova |
| `frontend/src/services/service-*.ts` | API za katalog, kategorije, forme, onboarding, prozore | 5 fajlova |
| `frontend/src/lib/sla/sla-profile-name.ts` | Lokalizacija imena SLA profila (koristi se i u servisima) | — |
| `frontend/src/components/tickets/create-ticket-draft-view.tsx`, `create-ticket-form.tsx` | Potrošači: `ServiceIncidentBanner` („poznati problem“) i preselekcija servisa iz URL-a | — |
| `backend/src/modules/status-page/` | Kontroleri, incidenti, vidljivost, javni endpoint | — |
| `backend/src/modules/service-catalog/` | Kontroleri servisa, kategorija, formi, prozora | — |
| `e2e/tests/21-status-monitoring.spec.ts`, `e2e/tests/42-catalog-sla-routing-ux.spec.ts` | E2E pokrivenost | 3 + 4 testa |
| `frontend/src/lib/status/status-view.spec.ts`, `frontend/src/lib/services/*.spec.ts` | Jedinični testovi (samo lib) | 15 fajlova u `lib/services`, 1 u `lib/status` |

---

## Trenutna implementacija

**Status.** `StatusPage` drži `overview`, `loadError`, `refreshing`, `nowMs`, `busyId`, `formMode` i `updateTarget`. Učitavanje ide preko `load` sa `inFlight` ref zaštitom, a `setInterval` od 60 s proverava `document.visibilityState`. Greška pri osvježavanju se upisuje u `loadError`, ali se prikazuje samo kad `overview === null`. `IncidentCard` prikazuje tri posljednja ažuriranja i dugme za proširenje. `IncidentFormDialog` kreira i mijenja incident, a `IncidentUpdateDialog` objavljuje ažuriranje ili rješava incident uz pregled broja obaviještenih (`resolve-preview`). `TicketIncidentsPanel` za zaposlene prikazuje vezane incidente, dugme za vezu i „Novi incident“ (samo sa `statusIncidentsManage`). Za podnosioca prikazuje samo otvorene javne incidente. `ServiceIncidentBanner` se učitava samo kad katalog kaže da servis ima incident, tako da izbor zdravog servisa ne stvara dodatni zahtjev.

**Servisi.** `ServicesPage` kombinuje pet hookova: `useServiceCatalog` (react-query), `useServiceCategories` i `useCatalogRoutingCoverage` (ručno, sa `requestSequence` ref), `useVisibleOnboardings` (po jedan zahtjev po DRAFT servisu) i `useAdminConfigLiveRefresh`. Prikaz ima tri stanja preko `serviceCatalogLoadState` (čista funkcija sa testom): učitavanje, greška prije prvog uspjeha, i spremno. Greška pri osvježavanju nakon uspjeha prikazuje upozorenje sa dugmetom za ponovni pokušaj (`hasRefreshError`). Lista (`ServiceCatalogList`) drži filtere, računa vidljive redove u `useMemo` preko `filterServiceCatalogRows` (pretraga bez dijakritika), i prikazuje prazno stanje sa razlikom „nema rezultata“ i „nema servisa“. Tabela ima osam kolona i meni akcija po redu. Forma servisa (`ServiceCatalogMutationForm`) traži razlog promjene, a lifecycle prelazi, brisanje i prozori nedostupnosti traže razlog. Wizard je modal sa stepperom i koracima; `completeServiceOnboardingStep` i `completeNamedOnboardingStep` šalju korak na backend. `ServiceFormBuilder` upravlja verzijama forme (DRAFT, ACTIVE, RETIRED), uređivanjem polja i opcijama za select.

**Backend.** Kontroleri za status koriste `SessionAuthenticationGuard` na nivou klase. Pisanja (`POST/PATCH incidents`, `updates`, `resolve-preview`) imaju `RoleGuard` i `statusIncidentsManage`. Čitanja i veze tiket↔incident nemaju `RoleGuard`, a provjeravaju se u servisu. Vidljivost je u servisu: `STAFF_ONLY` se za podnosioce filtrira (`status-page.service.ts`), anonimni javni endpoint koristi `anonymousViewer` i `ALL_USERS` (`public-status-page.controller.ts`, sa in-memory keš i limitom po IP), `subscribe` provjerava vidljivost incidenta. Servisni kontroleri za pisanja imaju `serviceCatalogWrite`, `serviceAvailabilityWrite` i `serviceFormsWrite`, a UI koristi iste permisije (`resolveCatalogWriteFlags`).

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Greška osvježavanja statusa | Tiha: uz stare podatke nema poruke, polling ne javlja grešku | Greška uz stare podatke, sa vremenom posljednjeg uspješnog osvježavanja i dugmetom |
| Greška na katalogu nakon uspjeha | Upozorenje i retry (`hasRefreshError`) | Isti obrazac na `/status` (usklađenost) |
| Render katalog bez podataka | Beskonačni render dok je katalog u učitavanju ili greškom (SV1) | Stabilna referenca praznih podataka, bez ponovnog renderovanja |
| Wizard, greška pri snimanju | Svi koraci nestanu, nema retry-a u režimu kreiranja | Greška iznad koraka, koraci ostaju, unos sačuvan |
| Kreiranje servisa u wizardu | Nije atomično, ponovni pokušaj kreira duplikat (SV3) | Jedan atomičan zahtjev ili idempotentan korak |
| Dugme „Kreiraj tiket“ iz kataloga | Ne preselektuje servis | Preselektuje servis preko `?serviceId=` |
| Select za policy pack i SLA | Vrijednost van liste prikazuje „—“ (SV7) | Prikaz odgovara stanju ili se vrijednost drži vidljivom |
| Opcije select polja | Dodavanje, bez brisanja; tekst hardkodiran (SV8) | Dodavanje i brisanje; i18n |
| Greška učitavanja SLA profila | Prikazuje se kao „nema profila“ (tiho) | Posebna poruka sa retry-em |
| Učitavanje podataka | Pet obrazaca (react-query, ručno, lokalni fetch) | Jedan obrazac (react-query) |
| Tipovi API-ja | Ručno prepisani iz backenda | Zajednička šema ili generisani tipovi |
| Lint i format | Nema ESLint/Prettier ni `lint` skripte | `react-hooks/exhaustive-deps` i Prettier u CI |
| Testovi komponenti | Nema za `components/status` i `components/services` | Komponentski testovi za wizard, dijalog incidenta, panel u tiketu |
| E2E | Osnovni tokovi (incident, servis, onboarding) | Dodati: prozori, verzije formi, kategorije, veza tiket↔incident, STAFF_ONLY u UI |

---

## Gap analiza

1. **Stabilnost renderovanja (kritično).** `useServiceCatalog` vraća `query.data ?? []`, što je novi niz pri svakom renderu dok nema podataka. `useVisibleOnboardings` ima `[rows]` kao zavisnost i u efektu uvijek postavlja novi niz (`filter` ili `[]`), pa se stanje mijenja i render se ponavlja. Ovo traje dok je katalog u učitavanju ili u greški. Izolovana reprodukcija to potvrđuje („Maximum update depth exceeded“).
2. **Tihi neuspjesi.** Status: greška osvježavanja (ST1), `IncidentProblemLinks` guta grešku (ST7), `ServiceIncidentBanner` i `TicketIncidentsPanel` potiskuju grešku bez poruke. Katalog: `listSlaProfiles` i `listPersistedPolicyPacks` padaju u praznu listu (SV7, SV23), `ensureServiceForm` guta grešku za pisca (SV4).
3. **Nekonzistentnost prikaza i stanja.** Select za policy pack i SLA ne prikazuje vrijednost koju šalje (SV7). Tabela „Kreiraj tiket“ ne prenosi servis (SV9). Prozor nedostupnosti ima `count: 1` hardkodiran (SV10).
4. **Neatomični tokovi.** Kreiranje servisa u wizardu radi dva zahtjeva bez rollback-a (SV3). `ensureServiceForm` može napraviti dupli prvi version na prolaznu grešku (SV4).
5. **Nepotrebno opterećenje.** Otvaranje ili snimanje forme pokreće puni `reloadCatalog` (services i sve stranice routing pokrivenosti) (SV5). `useVisibleOnboardings` pravi zahtjev po DRAFT servisu pri svakom osvježavanju (SV6). `listSlaProfiles` se poziva u tri komponente.
6. **Duplikacija.** Forma servisa i `OnboardingServiceStep` dijele ista polja i pravila (SV14). Mapiranja grešaka (4 fajla), `sequence` obrazac (4 mjesta), `json` helper (9 fajlova u `src/services`), tonovi bedževa sa ugniježđenim ternarima.
7. **Tipovi i i18n.** `t as never` na 36 mjesta u 24 fajla (`formatSlaProfileName` prima pogrešan tip prevodioca). `label(t: unknown, key)` u formi servisa zaobilazi TS. `values as CreateServiceInput` u sheet-u. Hardkodirani stringovi: „Opcija”, „opcija_1”, „polje_”, engleski razlog revizije u `complete-onboarding-step.ts`.
8. **Mrtav kod.** `ServiceOnboardingPipelineCard` (nigdje se ne koristi), `overallTone` (nigdje se ne koristi, ni u testovima), `isValidFieldIdentifier` (samo u spec-u, UI ne validira ID polja), `countUpcomingDowntimeWindows`, `getServiceFormVersion`, `getServiceCategory`, `routingConfigurationReference` (0 upotreba izvan fajla), `shouldWarnServiceRuntimeAvailability` (omotač bez vrijednosti).
9. **Pristupačnost.** `status-overall` nema `role="status"`, pa promjena stanja nije najavljena (ST6). Chip-ovi filtera nemaju `aria-pressed`. `aria-label` na `<span>—</span>` nema efekta. Verzije forme nemaju `aria-current`.
10. **Automatizacija.** Nema ESLint-a sa `react-hooks` pravilima, pa nisu uhvaćeni efekti sa nepotpunim zavisnostima (ST4, SV1, SV13). Nema Prettier-a, nema `lint` skripte.
11. **Testovi.** Komponente status i servisi nemaju jedinične testove (samo lib). E2E ne pokriva: prozore nedostupnosti, verzije formi (kreiranje, aktivacija), kategorije (CRUD), uklanjanje veze tiket↔incident, `STAFF_ONLY` u UI, grešku pri snimanju u wizardu.

---

## Mišljenje tima i preporuka

Tim bi prvo riješio stabilnost renderovanja i tihe greške, jer su to stvari koje korisnik vidi odmah: stranica koja troši CPU dok čeka katalog, i status koji izgleda svježe a nije. Odmah iza toga ide wizard: greška u koraku ne bi smjela da sakrije unos, a kreiranje u dva koraka mora biti sigurno pri ponovnom pokušaju.

Preporuka nije veliki refaktor. Tri stvari su dovoljne za većinu koristi:
- jedan obrazac učitavanja (react-query) za katalog, kategorije, pokrivenost i onboarding, sa zajedničkim `useLatestRequest` helperom gdje react-query ne pokriva slučaj;
- jedan `ErrorBanner` sa vremenom posljednjeg uspjeha i retry-em, koji koriste i `/status` i `/services`;
- razdvojen `OnboardingServiceStep` i forma servisa preko zajedničkog hooka za polja.

Preporučujem da `window`-sjenčenje (ST2), mrtvi kod (SV17) i `t as never` (SV15) budu u istom PR-u kao pravila ESLint-a. Tako se ne vraćaju.

Pitanje za backend: `linkTicket` i `unlinkTicket` provjeravaju samo da je akter staff na tiketu, a ne `statusIncidentsManage` niti vidljivost incidenta (ST10). Ako je cilj da svaki agent na tiketu može da veže bilo koji incident, to treba napisati u dokumentaciji. Ako nije, potrebna je provjera. Sistemski događaj upisuje naslov incidenta u tiket, pa ovo može biti i pitanje privatnosti za `STAFF_ONLY` incidente.

---

## Bugovi i neusklađenosti

### Status (ST)

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| ST1 | Srednja | Greška osvježavanja se ne prikazuje kad `overview` postoji. Polling tiho ostavlja stare podatke bez oznake. | `pages/status-page.tsx` (`loadError` čita se samo u `overview === null`, ~137–146) |
| ST2 | Niska | `overview.planned.map((window) =>` sjenči globalni `window` (u istoj komponenti se koristi `window.setInterval`). | `pages/status-page.tsx` (~205) |
| ST3 | Niska | `overallTone` nije korišten nigdje (ni u komponentama ni u testovima). Mrtav kod. | `lib/status/status-view.ts` (62) |
| ST4 | Srednja | `IncidentFormDialog`: efekti sa nepotpunim zavisnostima. Efekat za servise se ponovo pokreće na svaki toggle dok je `services === null`. `servicesFailed` se ne resetuje i nema retry. Greška se prikazuje kao prazna lista. | `components/status/incident-form-dialog.tsx` |
| ST5 | Niska | `max` na `datetime-local` je računat pri renderu (zastarjeva ako je dijalog otvoren). `toLocalInput` koristi zonu pregledača, a rasporedi (modul 9) koriste `settings.timeZone`. Dizajn, za odluku. | `components/status/incident-form-dialog.tsx` (~248) |
| ST6 | Niska | `status-overall` nema `role="status"`/`aria-live`. Promjena stanja nije najavljena čitaču ekrana. Ostali banneri to imaju. | `pages/status-page.tsx` (165) |
| ST7 | Srednja | `IncidentProblemLinks`: po jedan react-query upit po kartici za upravljače, greška se guta (`data?.items ?? []`). | `components/problems/problem-reference-list.tsx` (48–59), korišćeno u `incident-card.tsx` |
| ST8 | Niska | `TicketIncidentsPanel.load` nema `cancelled`/`active` zaštitu (race pri promjeni `versionKey`). `canManage` ima redundantan uslov (`isSuperAdmin` i `hasRole` i `hasPermission`). | `components/status/ticket-incidents-panel.tsx` |
| ST9 | Niska | Dugme „Ukloni vezu“ ima jedan klik bez potvrde. Kategorije imaju dvostepenu potvrdu, pa je ponašanje nekonzistentno. | `components/status/ticket-incidents-panel.tsx` |
| ST10 | Srednja (za provjeru) | `linkTicket` i `unlinkTicket` ne provjeravaju vidljivost incidenta niti `statusIncidentsManage`, samo staff na tiketu. `eventDetail()` upisuje naslov incidenta u sistemski događaj tiketa, pa `STAFF_ONLY` naslov može završiti u tiketu koji vidi podnosilac. Treba provjeriti da li podnosilac vidi sistemske događaje. | `backend/src/modules/status-page/status-incidents.service.ts` (235–288, 326–342, 429) |
| ST11 | Niska | `IncidentUpdateDialog`: greška učitavanja preview-a nema retry (effect ne ponavlja zbog `preview !== null`). `notify` je podrazumijevano uključen. | `components/status/incident-update-dialog.tsx` |
| ST12 | Niska | `incident-card.tsx` i `ticket-incidents-panel.tsx` koriste `availabilityTone` za impact. Dvije domene su spojene. | `components/status/incident-card.tsx` (69) |

### Servisi (SV)

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| SV1 | Visoka | **Beskonačni render dok katalog nema podatke.** `rows: query.data ?? []` daje novi niz pri svakom renderu, a `useVisibleOnboardings` ima `[rows]` u zavisnostima i u efektu uvijek postavlja novo stanje. Potvrđeno izolovanom reprodukcijom (React 18.3.1 + jsdom): „Maximum update depth exceeded“. Treba potvrditi u pregledaču. | `lib/services/use-service-catalog.ts`, `lib/services/use-visible-onboardings.ts` |
| SV2 | Visoka | **Wizard sakriva korake na bilo koju grešku.** Uslov je `!isLoadingOnboarding && errorKey === null`, pa greška pri snimanju koraka ukloni formu. U režimu kreiranja (`serviceId === null`) nema retry-a, pa korisnik ostaje blokiran i gubi unos. | `components/services/onboarding/service-onboarding-wizard.tsx` |
| SV3 | Visoka | **Kreiranje servisa nije atomično.** `completeServiceOnboardingStep` (kreiranje) pa `saveOnboardingServiceStep`. Ako drugi poziv padne, `record` ostaje `null`, pa ponovni pokušaj kreira drugi servis sa istim slugom (409, prikazano kao „duplicate slug“). Razlog revizije je hardkodiran na engleskom. | `lib/services/complete-onboarding-step.ts` |
| SV4 | Srednja | `ensureServiceForm` guta grešku GET-a za pisca i pokušava `createServiceForm`. Na prolaznu grešku može napraviti dupli prvi version. Komentar koristi `///` (neuobičajen oblik). | `lib/services/ensure-service-form.ts` |
| SV5 | Srednja | `ServiceFormBuilder` poziva `onActiveVersion` pri svakom `applyForm` (otvaranje, snimanje), a sheet tada radi `onChanged()` = `reloadCatalog()`: puni katalog i sve stranice routing pokrivenosti. | `components/services/form-builder/service-form-builder-sheet.tsx`, `service-form-builder.tsx` |
| SV6 | Srednja | `loadVisibleOnboardings` pravi zahtjev po DRAFT servisu (N+1) i ponavlja se pri svakom `rows` (svaki reload). | `lib/services/load-visible-onboardings.ts`, `use-visible-onboardings.ts` |
| SV7 | Srednja | **Select prikazuje drugu vrijednost od sačuvane.** `policyPackId` (onemogućen paket se filtrira iz opcija) i `slaProfileId` (profil nije učitan) ostaju u stanju, ali select prikazuje „—“. Snimanje šalje sačuvanu vrijednost. Greška učitavanja SLA profila je tiha. | `components/services/service-catalog-mutation-form.tsx` (~150–250) |
| SV8 | Srednja | Opcije select polja: nema brisanja opcije. Stringovi „Opcija”, „opcija_1” i „polje_” su hardkodirani (`form-field-editor.tsx`, `form-field-draft.ts`). `isValidFieldIdentifier` se ne koristi u UI, pa ID nije validiran dok backend ne odbije snimanje. | `components/services/form-builder/form-field-editor.tsx`, `lib/services/form-field-draft.ts` |
| SV9 | Srednja | Dugme „Kreiraj tiket“ u tabeli vodi na `/tickets/new` bez `?serviceId=`. Forma tiketa čita `serviceId` iz URL-a, pa se servis ne preselektuje. | `components/services/service-catalog-table.tsx` (~313), `components/tickets/create-ticket-form.tsx` (43) |
| SV10 | Niska | `services.downtime.upcomingBadge` uvijek ima `count: 1` (`hasUpcomingDowntime` je bulova vrijednost). `categoryName` se fallback-uje na `service.slug`. | `components/services/service-catalog-table.tsx` |
| SV11 | Srednja | Tri načina učitavanja u istom ekranu: react-query (`useServiceCatalog`), ručni `useState` + `requestSequence` (`useServiceCategories`, `useCatalogRoutingCoverage`, `useVisibleOnboardings`), lokalni fetch bez keša (wizard, forma, sheet, prozori). | `pages/services-page.tsx`, `lib/services/use-*.ts` |
| SV12 | Srednja | Forma servisa i `OnboardingServiceStep` dupliraju polja i validaciju. | `service-catalog-mutation-form.tsx`, `onboarding/onboarding-service-step.tsx` |
| SV13 | Niska | `ServiceDowntimeWindowsPanel`: `useEffect(() => reload(), [serviceId])` bez `reload` u zavisnostima i bez `cancelled` zaštite. Svako osvježavanje vraća panel na skeleton (treperenje). Greška vraća praznu listu i istovremeno poruku „nema prozora“. | `components/services/service-downtime-windows-panel.tsx` |
| SV14 | Niska | `services-page.tsx` `wizardServiceId` (`undefined`/`null`/id) i `downtime-windows-panel` `editing` (`undefined`/`null`/objekat) su tri-stanja koja se teško čitaju. Treba discriminated union. | `pages/services-page.tsx`, `service-downtime-windows-panel.tsx` |
| SV15 | Srednja | `t as never` u 36 mjesta (24 fajla), uključujući `formatSlaProfileName`. `label(t: unknown, key)` u formi servisa zaobilazi TS. `values as CreateServiceInput` u sheet-u (create i update nisu razdvojeni tipovima). | `components/services/service-catalog-mutation-form.tsx`, `service-catalog-mutation-sheet.tsx`, `lib/sla/sla-profile-name.ts` (cross-cutting) |
| SV16 | Niska | `const json` helper ponovljen u 9 fajlova `src/services/*`. `service-catalog-api.ts` koristi `JSON.stringify` direktno (nekonzistentno). | `src/services/*-api.ts` (cross-cutting) |
| SV17 | Niska | Mrtav kod: `ServiceOnboardingPipelineCard`, `countUpcomingDowntimeWindows`, `getServiceFormVersion`, `getServiceCategory`, `routingConfigurationReference`, `shouldWarnServiceRuntimeAvailability`, `isValidFieldIdentifier` (samo u spec-u). `listServiceCategories` je re-export u `service-catalog-api.ts`, pa postoje dvije putanje za isti tip. | razni |
| SV18 | Srednja | Tipovi su ručno prepisani iz backenda bez zajedničke šeme. `effectiveAvailability?` duplira `availability`, `incidentImpact?` je opcionalan bez razloga. | `services/service-catalog-api.ts` (1–130) |
| SV19 | Niska | `parentOptions` u formi kategorije isključuje samo sebe, a ne i potomke, pa je cikl u UI moguć. Backend validaciju nije provjereno. | `components/services/categories/service-category-mutation-form.tsx` |
| SV20 | Niska | Brisanje DRAFT servisa i otkazivanje prozora: samo razlog, bez potvrde. Kategorije imaju dvostepenu potvrdu. | `service-catalog-lifecycle-actions.tsx`, `service-downtime-windows-panel.tsx` |
| SV21 | Niska | Labela dugmeta za ponovno učitavanje u routing koraku je `services.onboarding.next` („Dalje“). Upozorenje o pokrivenosti se prikazuje dvaput (wizard i routing korak). | `onboarding/onboarding-routing-step.tsx`, `service-onboarding-wizard.tsx` |
| SV22 | Srednja (vjerovatno) | `OnboardingSlaStep`: `useState(selectedId || activeProfiles[0]?.id)` se računa jednom. Ako profili stignu poslije montiranja, vrijednost ostaje `""` i „Dalje“ je onemogućeno dok korisnik ne promijeni izbor. Potvrditi u pregledaču. | `components/services/onboarding/onboarding-sla-step.tsx` |
| SV23 | Niska | `OnboardingWizardSteps`/`service-onboarding-wizard.tsx`: `completed === 5` je magični broj umjesto `SERVICE_ONBOARDING_STEPS.length - 1`. | `components/services/onboarding/service-onboarding-wizard.tsx` |
| SV24 | Niska | `service-catalog-list.tsx`: `useEffect` za resetovanje `originUnitId` je derivirano stanje. | `components/services/service-catalog-list.tsx` |
| SV25 | Niska | ID-ovi u putanjama (`/services/${id}`) nisu enkodirani. ID-ovi su UUID, pa je rizik nizak. | `services/service-catalog-api.ts` i ostali `*-api.ts` |
| SV26 | Niska (za provjeru) | `GET /services` je dostupan svakom autentifikovanom korisniku i vraća `openTicketCount` i `activeForm`. Namjeravano je za podnosioce, ali nije dokumentovano. | `backend/src/modules/service-catalog/services.controller.ts` (63) |

---

## Ocjena: 5/10

Obrazloženje:
- **Plus:** backend vidljivost incidenata je u servisu (`STAFF_ONLY`, `ALL_USERS`, javni keš), pisanja imaju permisije na kontroleru, a UI koristi iste permisije (`resolveCatalogWriteFlags`). Stanja učitavanja su izdvojena u čistu funkciju sa testom (`serviceCatalogLoadState`). Greške su tipizovane (`ServiceCatalogErrorKey`) i prolaze kroz `t()`. Pretraga je otporna na dijakritike. Brisanje kategorije ima dvostepenu potvrdu. Stranica servisa ima obrazac za grešku pri osvježavanju (`hasRefreshError`), koji `/status` nema. E2E pokriva glavne tokove.
- **Minus:** beskonačni render dok katalog nema podataka (SV1), wizard koji sakrije unos i ne dozvoljava retry (SV2), neatomično kreiranje servisa (SV3), tihe greške na statusu (ST1) i u katalogu (SV7, SV22), select koji prikazuje pogrešnu vrijednost (SV7), dugme „Kreiraj tiket“ bez preselekcije (SV9), pet obrazaca učitavanja i dupliranje (SV11, SV12), `t as never` i ručni tipovi (SV15, SV18), mrtav kod, nema ESLint-a ni komponentskih testova.
- Ocjena je ispod modula 9 (6/10) jer je SV1 i SV2 utiču na korisnika odmah. Ispravke mogu popraviti ocjenu za 2 do 3 boda.

---

## Must-Have kandidati (modul 10)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **SV1:** stabilna referenca za prazne podatke u `useServiceCatalog` i `useVisibleOnboardings` (bez novog niza pri svakom renderu). Potvrditi u pregledaču prije i poslije.
2. **SV2 i SV3:** wizard prikazuje grešku uz korake (ne umjesto njih), ima retry i u režimu kreiranja, a kreiranje servisa je idempotentno ili atomično pri ponovnom pokušaju.
3. **ST1:** greška osvježavanja statusa uz stare podatke, sa vremenom posljednjeg uspjeha i retry-em. Isti obrazac kao `hasRefreshError` na `/services`.
4. **SV9:** dugme „Kreiraj tiket“ prenosi `?serviceId=`.
5. **SV7 i SV22:** select za policy pack i SLA prikazuje sačuvanu vrijednost (ili je jasno označena kao nedostupna), greška učitavanja profila se prikazuje, a efekat za inicijalnu vrijednost reaguje na učitavanje profila.
6. **ST10 (backend, za provjeru):** odluka o pravilu za `linkTicket`, `unlinkTicket` i `eventDetail` sa `STAFF_ONLY` incidentima. Ako je potrebno, dodati provjeru vidljivosti.
7. **SV5 i SV6:** zatvoriti puni `reloadCatalog` pri otvaranju forme i ograničiti zahtjeve za DRAFT onboarding na promjenu broja DRAFT servisa.
8. **SV8:** brisanje opcija select polja, i18n za „Opcija“ i „opcija_1“, validacija ID-a polja u UI.
9. **Automatizacija:** ESLint sa `react-hooks/exhaustive-deps`, Prettier, `lint` skripta u `frontend/package.json`. Uključiti ST4, SV13 u ispravke.
10. **Testovi:** komponentski testovi za `ServiceOnboardingWizard` (greška, retry, kreiranje), `IncidentFormDialog` (servisi i greška), `TicketIncidentsPanel` (veza i odveza); e2e za prozore nedostupnosti, verzije formi i CRUD kategorija.
11. **Cross-cutting (sa modulima 5 i 16):** `t as never` zamijeniti pravim tipom prevodioca (`TFunction`) i zajednički `json` helper za `src/services`.

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.
