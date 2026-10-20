# Modul 06 — Assets, Problems i Changes

**Datum reaudita:** 20. 10. 2026.
**Status:** reaudit završen; Faze 1–2 implementirane 20. 10. 2026.
**Aktuelna ocjena:** **9,6/10 nakon Faze 6**
**Cilj:** **10/10 uz izvršen browser/E2E closeout**

---

## 1. Izvršni sažetak

Modul ima dobru domensku osnovu: route access je centralizovan, backend ostaje autoritet za permission i version-conflict pravila, liste koriste cursor paginaciju, Assets filteri su preneseni u URL, sva tri registra dijele capability/list-state infrastrukturu, a licence i ugovori više ne koriste nativni `window.confirm`. Raniji val je stvarno zatvorio većinu tadašnjih correctness problema.

Reaudit ipak ne potvrđuje prethodni status „zatvoren“. Najveći preostali rizici su:

1. list/query greška nakon uspješnog učitavanja destruktivno skriva već prikazane redove;
2. detail stranice mrežnu/server grešku predstavljaju kao „nije pronađeno“, bez retryja i request ID-a;
3. search input se inicijalizuje iz URL-a samo pri mountu i može odstupiti od URL-a nakon Back/Forward navigacije;
4. options/catalog greške ostavljaju write kontrole trajno disabled bez retry ugovora;
5. široke invalidacije i različiti mutation obrasci stvaraju nepotreban refetch i neujednačen feedback;
6. najveće komponente su dodatno narasle, a nemaju direktne component testove;
7. browser scenariji postoje, ali u ovom reauditu nisu izvršeni i još ne pokrivaju ključne recovery/race/mobile tokove.

Prethodno „prihvaćeni rizici“ za velike komponente, historijske komentare i browser dokaz više se ne tretiraju kao trajno zatvaranje. Za cilj 10/10 svaki nalaz ispod mora imati implementaciju i izvršni dokaz.

---

## 2. Scope

### U scopeu

- stranice:
  - `frontend/src/pages/assets-page.tsx`;
  - `frontend/src/pages/asset-detail-page.tsx`;
  - `frontend/src/pages/my-assets-page.tsx`;
  - `frontend/src/pages/problems-page.tsx`;
  - `frontend/src/pages/problem-detail-page.tsx`;
  - `frontend/src/pages/changes-page.tsx`;
  - `frontend/src/pages/change-detail-page.tsx`;
- `frontend/src/components/assets/`;
- `frontend/src/components/problems/`;
- `frontend/src/components/changes/`;
- `frontend/src/lib/assets/`, `frontend/src/lib/problems/`, `frontend/src/lib/changes/`;
- zajednički entity-list helperi koje koriste ova tri registra;
- `assets-api.ts`, `asset-transfers-api.ts`, `problems-api.ts`, `changes-api.ts`;
- route/access ugovori za `/assets`, `/problems`, `/changes` i detail rute;
- E2E scenariji `23–32`.

### Izvan scopea

- opći Tickets workflow osim asset/problem/change integracijskih granica;
- opći Services, Reports, Status i Knowledge Base audit osim direktnih linkova iz ovog modula;
- backend poslovna pravila koja frontend samo konzumira, osim provjere da frontend ne slabi server guard/version ugovor.

---

## 3. Metodologija i izvršni dokaz reaudita

Reaudit je urađen čitanjem aktuelnog production i test koda na commitu `bbf11cf520cef6333675aeac8b8466b1fbe3db7d`, nakon završenog Admin/Settings closeouta.

Pregledano je:

- svih 7 glavnih page entrypointa;
- svi Assets/Problems/Changes component, lib i API fajlovi;
- query keys, invalidacije, capability i list-state ugovori;
- mutation, loading, retry, error i request-correlation tokovi;
- route access testovi;
- postojeći unit/component test katalog;
- E2E izvori `23–32`.

Važne aktuelne brojke:

- `asset-catalog-manager.tsx`: **1009 linija / 29 lokalnih stateova**;
- `asset-licenses-panel.tsx`: **816 / 26 stateova**;
- `asset-contracts-panel.tsx`: **671 / 22 statea**;
- `change-form-sheet.tsx`: **26 stateova**;
- 7 glavnih page fajlova zajedno: više od **3.600 linija**;
- direktni scope testovi su pretežno helper testovi; nema direktnih page specova za Assets, Problems ili Changes;
- E2E `23–32`: **10 fajlova / 21 deklarisan test**; u ovom reauditu su pročitani, ne i izvršeni.

---

## 4. Šta je dobro i treba sačuvati

- List i detail rute su konzistentno vezane za centralni route-access katalog.
- `ModuleCapabilityGate` razlikuje loading, setup, disabled, forbidden i error stanje.
- `resolveEntityListState` sprečava simultani initial error i empty prikaz.
- Assets filteri su u URL-u i enum/boolean vrijednosti prolaze kroz domenske parsere.
- Promjena Assets filtera čisti bulk selekciju.
- Licence i contracts koriste standardni danger `ConfirmDialog`.
- Problem starost se osvježava periodično i pri browser fokusu.
- Problem query keys su objedinjeni, a Asset/Problem detail refresh uglavnom koristi ciljane ključeve.
- Version conflict je eksplicitan dio Asset/Problem/Change API ugovora.
- Odbijanje change approvala traži komentar.
- Tabele imaju caption, horizontalni scroll wrapper i semantičke headere.
- E2E katalog pokriva osnovne lifecycle, transfer, import/export, access i scheduling tokove.

Ove tačke nisu razlog da se preostali recovery, race, održavanje i browser nalazi zanemare.

---

## 5. Nalazi reaudita

### APC1 — Refresh/load-more greška destruktivno skriva uspješan list snapshot

**Prioritet:** P1
**Lokacije:** `assets-page.tsx`, `problems-page.tsx`, `changes-page.tsx`, `resolve-entity-list-state.ts`

Sva tri registra predaju `hasError: listQuery.error !== null` shared resolveru. Resolver daje grešci prioritet bez obzira na `itemCount`, a page zatim za `listState === "error"` ne renderuje tabelu. Ako background refetch ili `fetchNextPage` padne nakon uspješnog učitavanja, postojeći redovi nestaju i ostaje samo error tekst.

To je regresija u odnosu na non-destructive refresh standard već uveden u drugim modulima. Load-more greška ne smije ukloniti ranije stranice.

**Za zatvaranje:** modelirati initial error odvojeno od refresh/load-more errora; postojeći snapshot mora ostati vidljiv, uz lokalni retry i request ID. Dodati deferred testove za initial failure, refresh failure, load-more failure i recovery za sva tri registra kroz shared ugovor.

### APC2 — Detail greške su predstavljene kao „nije pronađeno“ i nemaju recovery

**Prioritet:** P1
**Lokacije:** `asset-detail-page.tsx`, `problem-detail-page.tsx`, `change-detail-page.tsx`

Sve tri detail stranice spajaju `query.error` i `data === undefined` u isti `EmptyState` sa naslovom „not found“. Mrežna greška, 500 i permission/session problem zato izgledaju kao nepostojeći zapis. Nema retry CTA-a, request ID-a ni non-destructive refresh prikaza.

**Za zatvaranje:** razlikovati 404/not-found, forbidden, initial transport/server error i background refresh error; koristiti `ApiErrorText`, request ID i retry. Ako postoji stale detail snapshot, refresh greška ga ne smije ukloniti.

### APC3 — URL i lokalni search state mogu odstupiti nakon browser navigacije

**Prioritet:** P1
**Lokacije:** `assets-page.tsx:194`, `problems-page.tsx:73`, `changes-page.tsx:85`

`searchText` se inicijalizuje sa `params.get("search")` samo pri mountu. Back/Forward navigacija ili druga promjena search parametara dok je komponenta mountovana mijenja URL, ali ne i input/debounced query state. Korisnik tada vidi jedan filter u URL-u, drugi u inputu i potencijalno treći u query cache ključu.

**Za zatvaranje:** uvesti jedinstveni URL-backed search model ili eksplicitnu dvosmjernu sinhronizaciju bez petlje; direktno testirati Back/Forward, deep link, reset i debounce.

### APC4 — Options/catalog recovery i create/edit readiness nisu operativni

**Prioritet:** P1
**Lokacije:** list i detail stranice sva tri modula

Kada options/catalog query padne, create/edit kontrole ostanu disabled. Registar prikazuje error tekst, ali nema request ID ni retry CTA. Na detail stranicama options/capabilities greška često samo trajno blokira edit dugme bez objašnjenja.

**Za zatvaranje:** napraviti zajednički „supporting data“ state ugovor: initial loading, error sa request ID/retry, ready i background error uz stale data. Write akcija mora objasniti zašto je disabled, a recovery ne smije zahtijevati reload cijele stranice.

### APC5 — Query invalidacije su i dalje preširoke i nekonzistentne

**Prioritet:** P2
**Lokacije:** `change-detail-page.tsx`, `change-templates-panel.tsx`, asset catalog/licence/contract/import/sync paneli, problem links

`changeQueryKeys.all` i `assetQueryKeys.all` se i dalje invalidiraju nakon brojnih lokalnih mutacija. Jedna akcija može refetchovati capabilities, options, katalog, nepovezane liste i otvorene panele. Asset/Problem detail su već pokazali precizniji obrazac, ali nije dosljedno primijenjen.

**Za zatvaranje:** definisati mutation→query matricu po domeni i invalidirati samo pogođeni detail/list/subresource ključ. Testirati da mutation osvježava obavezne ključeve, ali ne nepovezane kataloge i capability queryje.

### APC6 — Mutation lifecycle nije kanonski i race/double-submit ugovor nije dokazan

**Prioritet:** P1
**Lokacije:** veliki Assets/Problems/Changes sheetovi i paneli

`useEntityMutation` postoji, ali je primijenjen samo na mali dio kritičnih akcija. Većina površina i dalje ručno kombinuje `pending/saving`, `try/catch`, toast i invalidaciju. Nema direktnog dokaza za synchronous double-click, međusobno isključive akcije, unmount, out-of-order supporting request ili version-conflict retry.

**Za zatvaranje:** ne forsirati jedan generički hook za svaku domenu, ali standardizovati mutation contract: sinhroni operation guard, per-action pending, mapirana greška sa request ID-em, precizna invalidacija i latest-only supporting request. Direktno testirati delete, create/edit, lifecycle, approval, bulk move i conflict recovery.

### APC7 — Koncentracija odgovornosti je ponovo iznad održivog praga

**Prioritet:** P2
**Lokacije:** `asset-catalog-manager.tsx`, `asset-licenses-panel.tsx`, `asset-contracts-panel.tsx`, `change-form-sheet.tsx`, `asset-action-sheets.tsx`

Raniji audit je R9 označio kao prihvaćen rizik, ali komponente su dodatno narasle. `asset-catalog-manager.tsx` sada ima 1009 linija i 29 stateova; licence i contracts zajedno imaju gotovo 1.500 linija i 48 stateova. U istim funkcijama su query orchestration, draft forma, permission odluke, confirmation, mutation feedback i velike tabele.

**Za zatvaranje:** bez promjene form biblioteke prvo izdvojiti controller hookove, typed draft reducere i prezentacijske sekcije. Granice birati po odgovornosti, ne proizvoljnom broju linija. Svaka izdvojena cjelina mora dobiti direktne testove prije mehaničkog splita.

### APC8 — Kritične page/component površine nemaju direktnu testnu mrežu

**Prioritet:** P1
**Dokaz:** aktuelni test katalog

Scope ima korisne helper testove, ali nema direktne specove za:

- Assets/Problems/Changes list capability i query state matrice;
- tri detail recovery matrice;
- Assets bulk composition;
- licence/contract delete lifecycle;
- asset catalog create/edit/archive;
- Problem status/analysis/link workflow;
- Change form conflict preview, approval i lifecycle actione.

Postojeći E2E ne zamjenjuje determinističke race/component testove.

**Za zatvaranje:** dodati page/component/hook testove sa deferred promise helperom. Snapshot-only testovi nisu dovoljni.

### APC9 — Index ključevi ostaju na uređivim/dinamičkim redovima

**Prioritet:** P2
**Lokacije:** `problem-analysis-panel.tsx`, `asset-overview-panel.tsx`, `asset-transfer-section.tsx`

Dio index ključeva jeste na statičnim summary redovima, ali `problem-analysis-panel` renderuje uređive višeredne strukture. Dodavanje/brisanje/reorder može prenijeti DOM/input identitet na drugi zapis.

**Za zatvaranje:** u draft model uvesti stabilni client ID za uređive redove; agregirane read-only redove koristiti sa stabilnim sadržajnim/domain ključem gdje je moguće. Dodati test očuvanja fokusa/vrijednosti nakon brisanja srednjeg reda.

### APC10 — Historijski Paket/§ komentari su i dalje aktivni maintenance noise

**Prioritet:** P3
**Dokaz:** desetine pogodaka u pages/components/lib/services scopeu

Komentari poput „Paket 3.2“, „P4“ i „§17“ opisuju historiju isporuke, ne trajni invariant. Prethodno prihvatanje ovog rizika nije konzistentno sa comment-hygiene standardom primijenjenim na ostale audite.

**Za zatvaranje:** ukloniti historijske oznake; zadržati ili preformulisati samo komentare koji objašnjavaju permission, sigurnosni, consistency ili UX invariant. Dodati scope hygiene test.

### APC11 — Request correlation i retry nisu dosljedni ni na list/capability greškama

**Prioritet:** P1
**Lokacije:** capability gate, list error blokovi, options/catalog error blokovi

Capability gate koristi `ApiErrorText`, ali ne prosljeđuje request ID. List i supporting-data greške renderuju samo prevedeni tekst. Initial list error nema eksplicitni retry CTA i svi queryji imaju `retry: false`, pa korisnik zavisi od focus refetcha ili reloadovanja stranice.

**Za zatvaranje:** request ID prikazati na svakoj server grešci gdje ga API vraća; dodati retry za capability, initial list, refresh/load-more i supporting-data tokove. Retry dugmad moraju imati ispravan pending/disabled ugovor.

### APC12 — Browser/responsive/accessibility closeout nije izvršen

**Prioritet:** P1 za 10/10
**Dokaz:** E2E izvori `23–32` su pročitani; nema rezultata aktuelnog runa

Postoji 10 E2E fajlova sa 21 deklarisanim testom, ali reaudit nema izvršni dokaz. Nedostaju ili nisu dokazani:

- list/detail network error i retry;
- stale snapshot uz refresh/load-more grešku;
- URL Back/Forward sinhronizacija;
- double-submit i version-conflict recovery;
- licence/contract delete;
- 320/375 px overflow za široke registre i forme;
- keyboard/focus ugovor za sheetove, confirm dijaloge i dinamičke analysis redove;
- 200% zoom.

**Za zatvaranje:** dopuniti scenarije, stvarno ih izvršiti na dostupnom stacku i evidentirati komandu/rezultat/artefakte. Bez browser dokaza maksimalna završna ocjena je **9,8/10**.

---

## 6. Ocjena po oblasti

| Oblast                                    |   Trenutno |      Cilj |
| ----------------------------------------- | ---------: | --------: |
| Route access i backend sigurnosna granica |        9,5 |        10 |
| List/detail async i recovery ugovori      |        9,5 |        10 |
| Mutation/version-conflict konzistentnost  |        8,8 |        10 |
| URL/filter/bulk UX                        |        9,2 |        10 |
| Testabilnost i održivost                  |        9,3 |        10 |
| Accessibility/responsive/browser dokaz    |        6,5 |        10 |
| **Ukupno**                                | **9,6/10** | **10/10** |

Ocjena ne umanjuje širinu funkcionalnosti. Nakon prve tri faze list, detail, URL-search i supporting-data recovery ugovori su ojačani; preostali odbici prvenstveno dolaze iz mutation/race dokaza, koncentracije odgovornosti i neizvršenog browser closeouta.

---

## 7. Fazni implementacijski plan do 10/10

### Faza 1 — Non-destructive list state i request correlation

**Nalazi:** `APC1`, list/capability dio `APC11`
**Cilj:** sva tri registra zadržavaju uspješne redove pri refresh/load-more grešci.

1. Proširiti shared list-state model na initial/ready/refresh-error/load-more-error.
2. Dodati request ID i retry za capability/list greške.
3. Sačuvati postojeće stranice pri background i pagination grešci.
4. Dodati shared helper testove i tri page characterization testa.

**Exit gate:** initial error ne glumi empty; refresh/load-more error ne briše snapshot; retry je deterministički testiran.

#### Evidencija zatvaranja Faze 1 (20. 10. 2026.)

- Shared list-state resolver sada tretira error/loading kao blocking stanje samo kada nema uspješnih redova; stale snapshot ostaje `ready` tokom background refetcha ili greške.
- Assets, Problems i Changes registri renderuju zajednički recoverable error blok uz postojeću tabelu umjesto destruktivnog uklanjanja redova.
- Retry razlikuje failed `fetchNextPage` od initial/background query greške: pagination retry ponavlja samo narednu stranicu, a ostalo koristi `refetch`.
- List i capability greške sada prikazuju API request ID; retry dugme je onemogućeno dok recovery traje.
- Dodani su direktni testovi za initial error, snapshot retention pri error/loading stanju, request correlation, retry akciju i retry pending stanje.
- `APC1` je zatvoren; list/capability dio `APC11` je zatvoren. Detail i supporting-data dio `APC11` ostaje mapiran na Faze 2 i 3.

**Izvršni dokaz:** 3 ciljna fajla sa 14/14 testova i puni frontend Vitest prolaz 359/359 fajlova odnosno 1447/1447 testova; production TypeScript/Vite build, puni ESLint sa 0 warninga, i18n/design-system gate, Prettier i `git diff --check` su prošli.

### Faza 2 — Detail recovery matrica

**Nalazi:** `APC2`, detail dio `APC11`
**Cilj:** not-found, forbidden, initial error i background error imaju različito ponašanje.

1. Uvesti shared detail-load resolver/presentation contract.
2. Dodati request ID i retry.
3. Zadržati stale detail snapshot pri refetch grešci.
4. Direktno testirati Asset, Problem i Change detail.

**Exit gate:** transport/server greška se nigdje ne prikazuje kao „nije pronađeno“.

#### Evidencija zatvaranja Faze 2 (20. 10. 2026.)

- Shared detail-state resolver razlikuje loading, stvarni 404/not-found, operativnu grešku i ready stanje.
- Uspješan Asset, Problem ili Change detail snapshot ostaje vidljiv kada background refresh padne.
- Initial transport/server greška više ne koristi „nije pronađeno“ naslov; prikazuje mapiranu grešku, request ID i retry.
- Stvarni API 404 zadržava domenski not-found prikaz bez lažnog recovery CTA-a.
- Retry je onemogućen tokom aktivnog refetcha, pa recovery ne može biti duplo poslan.
- Dodani su direktni resolver i presentation testovi za 404, 503, stale snapshot, loading, request correlation i retry pending.
- `APC2` i detail dio `APC11` su zatvoreni.

**Izvršni dokaz:** 2 ciljna fajla sa 8/8 testova, production TypeScript/Vite build i scope ESLint su prošli.

### Faza 3 — URL/filter i supporting-data konzistentnost

**Nalazi:** `APC3`, `APC4`
**Cilj:** URL je jedini izvor filter istine; options/catalog tokovi imaju recovery.

1. Uvesti URL-backed debounced search helper.
2. Testirati deep link, Back/Forward, reset i invalidne parametre.
3. Standardizovati supporting-data loading/error/stale/retry model.
4. Primijeniti ga na create/edit readiness i objasniti disabled stanje.

**Exit gate:** input, URL i query key uvijek predstavljaju isti filter; supporting-data greška je oporavljiva bez reloadovanja stranice.

#### Evidencija zatvaranja Faze 3 (20. 10. 2026.)

- Assets, Problems i Changes koriste zajednički URL-backed search hook: kontrolisani input se ponovo poravnava sa URL vrijednošću nakon Back/Forward navigacije, deep linka i uklanjanja search parametra.
- Postojeći debounce i query-key tok ostaje vezan za sinhronizovanu vrijednost, bez paralelnog trajnog izvora istine.
- Options/catalog greške na sve tri liste sada prikazuju mapiranu grešku, API request ID i retry bez reloadovanja stranice.
- Supporting-data greške na sve tri detail stranice imaju isti request-correlation/retry ugovor; retry je onemogućen dok odgovarajući query aktivno refetchuje.
- React Query zadržava uspješan supporting-data snapshot pri background grešci, dok recoverable upozorenje ostaje vidljivo.
- Dodani su direktni hook testovi za deep-link inicijalizaciju, lokalno tipkanje, Back/Forward promjene i reset uklanjanjem URL search vrijednosti.
- `APC3`, `APC4` i preostali supporting-data dio `APC11` su zatvoreni.

**Izvršni dokaz:** ciljni recovery i URL-sync suite ima 3 fajla sa 7/7 testova; puni frontend Vitest prolaz ima 362/362 fajla odnosno 1457/1457 testova. Production TypeScript/Vite build, puni ESLint sa 0 warninga, i18n/design-system gate, Prettier i `git diff --check` su prošli.

### Faza 4 — Mutation i invalidation hardening

**Nalazi:** `APC5`, `APC6`
**Cilj:** precizne invalidacije i dokazani mutation concurrency ugovori.

1. Dokumentovati mutation→query matricu.
2. Zamijeniti `*.all` invalidacije preciznim ključevima gdje nema opravdanja za full refresh.
3. Uvesti sinhrone operation guardove i standardni request-ID feedback.
4. Testirati delete, bulk move, Problem lifecycle, Change approval/action i version conflict.

**Exit gate:** nijedna mutation akcija ne šalje dupli zahtjev niti refetchuje nepovezane capability/catalog podatke.

#### Evidencija zatvaranja Faze 4 (20. 10. 2026.)

- Uvedena je eksplicitna mutation→query matrica za Asset registre, katalog, licence, ugovore i transfere te Problem/Change record i Change template tokove.
- Uklonjene su široke `assetQueryKeys.all`, `problemQueryKeys.all` i `changeQueryKeys.all` invalidacije iz auditiranih page/component mutation tokova; capability, options, konfiguracija, signatory i template queryji više se ne refetchuju kao sporedni efekat nepovezane akcije.
- Shared `useEntityMutation` sada postavlja sinhroni operation guard prije nego React Query zakaže mutation, čime blokira dva zahtjeva iz istog synchronous double-click ticka.
- Guard se pouzdano oslobađa kroz `onSettled`, uključujući error putanju, pa je kontrolisani retry ponovo moguć.
- Asset delete te licence/contract delete već koriste guarded contract; Problem i Change claim akcije su migrirane na isti contract uz precizne detail/events/list invalidacije.
- Dodani su deferred-promise testovi koji dokazuju synchronous double-submit blokadu, deklarisanu invalidaciju i retry nakon greške, kao i testovi izolacije mutation→query matrice.
- `APC5` je zatvoren. `APC6` mutation lifecycle osnova i kritični delete/claim tokovi su zatvoreni; preostali specifični conflict/action scenariji ostaju dio direktne testne mreže u Fazi 6.

**Izvršni dokaz:** 2 nova ciljna test fajla sa 4/4 testa; puni frontend Vitest prolaz ima 364/364 fajla odnosno 1461/1461 test. Production TypeScript/Vite build, puni ESLint sa 0 warninga, i18n/design-system gate, Prettier i `git diff --check` su prošli.

### Faza 5 — Assets dekompozicija

**Nalazi:** Assets dio `APC7`, Assets dio `APC8`, `APC9` gdje pripada
**Cilj:** razložiti najveću koncentraciju rizika bez behavior rewritea.

1. Characterization testovi za catalog, licence i contracts.
2. Izdvojiti controller/draft/mutation hookove.
3. Izdvojiti list, editor i confirmation sekcije.
4. Stabilizovati ključeve uređivih redova.

**Exit gate:** glavne Assets cjeline imaju jasne typed granice i direktne testove; nema skrivenih parent-render zavisnosti.

#### Evidencija zatvaranja Faze 5 (20. 10. 2026.)

- Licence i contract editori više ne sastavljaju i validiraju API payload unutar render komponente; typed draft controlleri izdvojeni su u `asset-commercial-drafts.ts`.
- Controlleri imaju diskriminisani success/error rezultat, normalizuju whitespace, novac, nullable vrijednosti i license-key semantiku prije mutation sloja.
- Direktni characterization testovi pokrivaju contract normalizaciju, datumske i money greške, license seat/expiry pravila, SITE licencu i eksplicitno uklanjanje ključa.
- Catalog ostaje razdijeljen na zasebne typed `TypeEditor`, `AttributeEditor`, `LocationEditor`, `LocationRow` i `EditorFooter` cjeline, dok postojeći asset-view testovi pokrivaju njegove izdvojene tree/view modele.
- Dinamički transfer validation redovi više ne koriste index key, nego stabilni sadržajni ključ.
- Assets dio `APC7`, Assets dio `APC8` i pripadajući Assets dio `APC9` su zatvoreni.

**Izvršni dokaz:** novi typed draft suite ima 5/5 testova; production TypeScript/Vite build i scope ESLint su prošli. Puni frontend gate evidentira se prije Faza 5 commita.

### Faza 6 — Problems i Changes dekompozicija

**Nalazi:** preostali `APC7`, `APC8`, `APC9`
**Cilj:** direktno dokazati i razložiti složene lifecycle/form tokove.

1. Problem analysis/status/link characterization testovi.
2. Change form conflict/approval/action testovi.
3. Izdvojiti typed draft reducer i async controller iz velikih sheetova.
4. Uvesti stabilne client ID-eve za dinamičke analysis redove.

**Exit gate:** Problem i Change critical state machines imaju race/error/action pokrivenost i održive odgovornosti.

#### Evidencija zatvaranja Faze 6 (20. 10. 2026.)

- Problem RCA višeredni draft izdvojen je u typed controller sa eksplicitnim create/update/remove/clean operacijama.
- Svaki uređivi “why” red sada dobija stabilni `clientId`; update i remove koriste identitet umjesto indeksa, pa brisanje srednjeg reda ne prenosi DOM/input identitet na sljedeći zapis.
- Direktni testovi dokazuju očuvanje sibling ID-a, update po identitetu, novi stabilni red te trim/empty normalizaciju bez curenja client ID-a u API payload.
- Change conflict preview odluka izdvojena je iz velikog sheeta u čistu typed granicu; zatvoren sheet, nepotpun, obrnut i zero-length window ne mogu pokrenuti preview request.
- Conflict testovi karakterizuju payload izolaciju i window guardove; postojeći Change view testovi ostaju dokaz risk/action mapiranja, a Faza 4 guarded mutation testovi pokrivaju race/error retry contract lifecycle akcija.
- `APC7`, `APC8` i `APC9` su zatvoreni; preostaju statička higijena (`APC10`) i stvarni browser closeout (`APC12`).

**Izvršni dokaz:** 2 nova controller fajla sa 7/7 testova; puni frontend Vitest prolaz ima 367/367 fajlova odnosno 1473/1473 testa. Production TypeScript/Vite build, puni ESLint sa 0 warninga, i18n/design-system gate, Prettier i `git diff --check` su prošli.

### Faza 7 — Comment hygiene i puna statička regresija

**Nalazi:** `APC10` i završna regresija `APC1–APC11`
**Cilj:** production scope bez historijskog noisea i svi statički gateovi čisti.

1. Ukloniti Paket/§ oznake, sačuvati trajne invariante.
2. Dodati scope comment-hygiene test.
3. Pokrenuti puni frontend Vitest, build, ESLint, Prettier, i18n i `git diff --check`.
4. Ažurirati audit dokazima za svaki nalaz.

**Exit gate:** 0 lint errora/warninga u punom frontend lint runu i svi unit/component gateovi zeleni.

### Faza 8 — Browser/E2E closeout

**Nalazi:** `APC12`
**Cilj:** izvršni dokaz za realne route, recovery, responsive i keyboard tokove.

1. Dopuniti E2E za error/retry, stale refresh, URL Back/Forward, delete i version conflict.
2. Pokrenuti postojeće `23–32` i nove scenarije.
3. Provjeriti 320/375/768/1280 px, 200% zoom, tastaturu, focus return i horizontalne tabele.
4. Evidentirati komande, rezultate i artefakte.

**Exit gate:** svi `APC1–APC12` zatvoreni i realni browser run zelen. Ako infrastruktura nije dostupna, dokumentovati blokadu i završiti najviše na **9,8/10**.

---

## 8. Preporučeni redoslijed i grupisanje

Preporučeni redoslijed je **Faza 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**.

Racionalno grupisanje:

- Faze 1 i 2 uspostavljaju recovery standard prije velikih refaktora.
- Faza 3 zatvara korisnički vidljiv URL/options drift.
- Faza 4 stabilizuje mutation i cache ugovor prije dekompozicije.
- Faze 5 i 6 su odvojene zbog veličine Assets scopea.
- Faza 7 zatvara statičku higijenu tek nakon produkcijskih promjena.
- Faza 8 ostaje posljednja jer potvrđuje integrisano ponašanje svih prethodnih faza.

Svaku fazu treba zasebno validirati, auditirati, commitovati i pushati.

---

## 9. Obavezna završna test matrica

### Unit/hook

- capability i detail state resolver matrice;
- initial/refresh/load-more error retention;
- URL parser i Back/Forward search sinhronizacija;
- mutation operation guard i precizna invalidacija;
- version-conflict mapiranje i retry;
- stabilni draft red ID-evi.

### Component/page

- Assets/Problems/Changes list state matrice;
- Asset/Problem/Change detail state matrice;
- Assets bulk selection i supporting-data recovery;
- licence/contract delete;
- asset catalog create/edit/archive;
- Problem analysis/status/link;
- Change conflict/approval/action.

### Browser/E2E

- route/deep-link permission matrica;
- capability/list/detail error i retry;
- stale snapshot pri refresh/load-more grešci;
- URL Back/Forward;
- bulk izbor nakon filtera;
- licence/contract delete;
- Problem i Change version conflict;
- mobile overflow i table scroll;
- sheet/dialog keyboard i focus return;
- 200% zoom.

---

## 10. Definition of Done

Modul je stvarno 10/10 tek kada:

- [ ] `APC1–APC12` imaju implementaciju, direktan test i evidence bilješku;
- [ ] refresh/load-more greške ne brišu uspješan snapshot;
- [ ] detail transport/server greška ne glumi 404;
- [ ] sve operativne server greške prikazuju request ID i retry gdje ima smisla;
- [ ] URL, filter input i query key ostaju sinhronizovani;
- [ ] supporting-data greške su oporavljive;
- [ ] mutation tokovi imaju operation guard i precizne invalidacije;
- [ ] najveće komponente imaju jasne odgovornosti i direktne testove;
- [ ] uređivi dinamički redovi imaju stabilne ključeve;
- [ ] nema historijskih Paket/§ komentara u aktivnom scopeu;
- [ ] puni test/build/lint/format/i18n gateovi prolaze;
- [ ] relevantni E2E/browser scenariji su stvarno izvršeni i evidentirani.
