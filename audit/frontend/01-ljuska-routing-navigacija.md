# Modul 1: Ljuska, routing i navigacija

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise` (HEAD `973efba7`)
Status: analiza završena. Nijedan kod nije mijenjan (čeka se potvrda obima refaktorisanja).

Provjere izvršene u sandboxu:
- `npm ci` u `frontend/` (uspješno)
- `npx tsc -p tsconfig.app.json --noEmit`: prolazi bez grešaka
- `npx vitest run` nad `src/lib/navigation.spec.ts`, `src/lib/session/`, `src/components/layout/`: 4 fajla, 23 testa, svi prolaze

---

## Modul

**Ljuska, routing i navigacija.** Obuhvata:
- rutiranje i zaštitu ruta (`router.tsx`, `require-auth`, `require-access`, `lazy-page`)
- ljusku aplikacije (`application-shell`, `app-header`, `app-sidebar`)
- definiciju menija i pravila pristupa (`navigation.ts`, `navigation-icons.ts`, `route-access.ts`)
- pretragu i komandnu paletu (`command-palette`, `header-search-trigger`)
- ulaznu tačku i providere (`main.tsx`, `app.tsx`) i gate za instalaciju (`install-setup-layout`, `install-setup-provider`, `resolve-install-gate-navigation`)

Granica modula: `notifications-*`, `active-timer-indicator`, `on-call-header-indicator` i `theme-switcher` su pregledani samo u mjeri u kojoj ulaze u header. Njihova logika pripada modulima „notifikacije“, „time tracking“, „on-call“ i „i18n i tema“.

---

## Povezani fajlovi i folderi

**Rutiranje i providere**
- `frontend/src/main.tsx`
- `frontend/src/app/app.tsx`
- `frontend/src/app/router.tsx` (352 linije)
- `frontend/src/app/lazy-page.tsx`
- `frontend/src/app/install-setup-layout.tsx`
- `frontend/src/app/install-setup-provider.tsx`
- `frontend/src/lib/resolve-install-gate-navigation.ts`

**Ljuska i navigacija**
- `frontend/src/layouts/application-shell.tsx` (107 linija)
- `frontend/src/components/layout/app-header.tsx`
- `frontend/src/components/layout/app-sidebar.tsx` (133 linije)
- `frontend/src/components/layout/sidebar-count-badge.tsx`
- `frontend/src/components/layout/sidebar-user-card.tsx`
- `frontend/src/components/layout/brand-mark.tsx`
- `frontend/src/components/layout/system-status-chip.tsx`
- `frontend/src/components/layout/header-search-trigger.tsx`
- `frontend/src/components/layout/header-search-match.tsx` (+ `header-search-match.spec.ts`)
- `frontend/src/components/layout/command-palette.tsx` (406 linija)
- `frontend/src/components/layout/session-controls.tsx`
- `frontend/src/components/layout/theme-switcher.tsx`
- `frontend/src/components/a11y/` (`skip-to-content-link`, `route-focus-manager`, `announcer-regions`)
- `frontend/src/components/shortcuts/` (`global-shortcuts`, `shortcuts-provider`)

**Zaštita ruta**
- `frontend/src/components/layout/require-auth.tsx`
- `frontend/src/components/layout/require-access.tsx`
- `frontend/src/lib/session/route-access.ts` (+ `route-access.spec.ts`)
- `frontend/src/lib/session/use-session-capabilities.ts`
- `frontend/src/lib/session/use-session.ts`
- `frontend/src/lib/session/session-keep-alive.ts` (+ `session-keep-alive.spec.ts`)

**Definicija menija**
- `frontend/src/lib/navigation.ts` (277 linija) + `navigation.spec.ts` (5 testova)
- `frontend/src/lib/navigation-icons.ts`

**Van modula, ali direktno vezano**
- `frontend/src/pages/login-page.tsx` (čita `location.state.from`)
- `frontend/src/components/install/install-gate-skeleton.tsx`
- `frontend/package.json` (skripte i odsustvo ESLint/Prettier)
- `frontend/vitest.config.ts`

---

## Trenutna implementacija

**Ulaz i providori.** `main.tsx` učitava i18n, pokreće branding i migraciju localStorage ključeva, pa tek onda kreira React root (`initializeI18n().then(...)`). `App` slaže providere: `QueryClientProvider` → `ThemeProvider` → `ToastProvider` → `BrowserRouter` → `InstallSetupProvider` → `AppRouter`.

**Routing.** `AppRouter` ima jedan veliki `<Routes>` stablo:
- `InstallSetupLayout` obuhvata **sve** rute (uključujući `/login`, `/install`, `/privacy-notice`).
- `RequireAuth` pa `ApplicationShell` obuhvataju aplikacijske rute.
- Stranice se učitavaju lijeno preko `lazyPage(...)`. Ima ih 45 u `pages/`.
- `RequireAccess` sa `check` funkcijom štiti 15 ruta (`<RequireAccess` se pojavljuje 15 puta u `router.tsx`).
- `*` preusmjerava na `/`. Nema 404 stranice.
- `_visual-qa` ruta postoji samo u DEV modu (`import.meta.env.DEV`).

**Gate za instalaciju.** `InstallSetupProvider` jednom pri startu poziva `loadInstallSetupStatus()`. `InstallSetupLayout` onda za svaku rutu poziva `resolveInstallGateNavigation`: ako sistem nije instaliran, sve ide na `/install`; ako jeste, `/install` ide na `/`.

**Zaštita sesije.** `RequireAuth`:
- bez sačuvane sesije šalje na `/login` i pamti `from` (samo `pathname`)
- dok se učitavaju capabilities, prikazuje `InstallGateSkeleton`
- pokreće keep-alive sesije, sinhronizaciju jezika iz korisničkih preferencija i odjavu ako sesija više nije validna

**Zaštita po ulozi/dozvoli.** `RequireAccess` prima `check(capabilities)` i ključeve za poruku „nema pristupa“ (union tip `ForbiddenMessageKey`). Pravila su u `route-access.ts` (`canOpenReports`, `canOpenPrivacy`, `canOpenAssets`, ...). Ista pravila koristi `filterNavigationSections` za sidebar, pa se meni i rute ne bi trebali razilaziti.

**Ljuska.** `ApplicationShell`:
- vraća `InstallGateSkeleton` dok sesija nije spremna
- računa `isStaff` i obavija sve u `ShortcutsProvider`
- desktop: `<aside>` sa `AppSidebar` (samo `lg+`)
- mobilni: `Sheet` sa istim `AppSidebar`
- `AppHeader` sa dugmadima: meni, pretraga, aktivni tajmer, on-call, status chip, tema, notifikacije, sesija
- `CommandPalette` (uvijek montiran)
- `<main>` sa `key={location.pathname}` i unutra banneri (održavanje, istek lozinke, obavještenja) pa `<Outlet/>`

**Navigacija.** `navigation.ts` drži 4 sekcije sa 20 stavki. Svaka stavka ima `path`, `labelKey`, `end` i `access.kind`. Ikone se traže po `path` kroz `navigationIconFor` (mapa sa 20 unosa, fallback `LayoutDashboard`). Aktivna stavka se računa u `isNavigationItemActive`. Specijalni slučaj za „Svi tiketi“ je po `labelKey`.

**Pretraga i paleta.** `CommandPalette` ima komande (navigacija + akcije) i remote pretragu sa debounce od 300 ms i `AbortController`. Otvara se sa `Ctrl/Cmd+K` (`GlobalShortcuts`) i dugmetom u headeru.

**Dostupnost (a11y).** Postoji skip link, `RouteFocusManager`, `AnnouncerRegions`, `aria-current="page"` na aktivnoj stavci, `aria-label` na `<nav>`, `sr-only` tekst za brojače u badgeu, i `aria-label` na dugmetu za meni.

---

## Realno/željeno stanje

| Oblast | Željeno | Realno |
|---|---|---|
| Gate za instalaciju | Greška pri provjeri statusa ne smije tretirati sistem kao neinstaliran | Greška postavlja `isCompleted: false`, pa se cijela aplikacija preusmjerava na `/install` |
| Greške u renderu | Globalni Error Boundary + poruka sa „pokušaj ponovo“ | Samo `PageLoadBoundary` oko lazy stranica. Greška u `ApplicationShell`, `RequireAuth`, sidebaru ili eager stranici (`DashboardPage`) daje bijeli ekran |
| 404 | Stranica „nije pronađeno“ | `*` → `/` (tihi redirect) |
| Ikone menija | Svaka stavka ima svoju ikonu | `/docs` nema unos u mapi, dobija `LayoutDashboard` (fallback je tih) |
| Povratak nakon prijave | Vraća tačnu adresu uključujući query i hash | Vraća samo `pathname` (`/tickets?view=inbox` → `/tickets`) |
| Banneri i obavještenja | Ostaju mounted između navigacija | Remount pri svakoj navigaciji zbog `key={location.pathname}` |
| Pravila pristupa | Jedan izvor istine | Uglavnom jedan (`route-access.ts`), ali `isStaff` u shellu duplira `isTicketStaff` |
| Ponavljanje u routeru | Konfiguracija ruta podataka + helper | 15 gotovo identičnih `RequireAccess` blokova (352 linije) |
| Alati za kvalitet koda | ESLint, Prettier, jedna komanda za provjeru | Nema ESLint ni Prettier konfiguracije. Skripte: `dev`, `build`, `preview`, `test`, `audit:contrast` |
| Testovi modula | Testovi za rute, zaštitu, ikone i ljusku | 23 testa, ali za `RequireAuth`, `RequireAccess`, `LazyPage`, `ApplicationShell`, rute i ikone nema testova |

---

## Gap analiza

**Kritični i visoki gapovi**

1. **Fail-open ka instalaciji.** Ako API za status instalacije padne (mreža, 500, timeout), `install-setup-provider.tsx` postavlja `isCompleted: false`. Zatim `InstallSetupLayout` vidi `isSetupComplete: false` i `resolveInstallGateNavigation` vraća `/install` za svaku rutu. Korisnik na već instaliranom sistemu, na lošoj vezi, dobija instalacioni čarobnjak umjesto aplikacije. Ovo treba provjeriti i na serveru (da li `/install` API odbija kad je sistem instaliran), ali UI ne bi smio pretpostaviti „nije instalirano“ kad ne zna odgovor.

2. **Nema globalnog Error Boundary.** `router.tsx` nema `errorElement`, a jedini `componentDidCatch` je u `lazy-page.tsx`. Greška u renderu bilo koje eager komponente, ili u samoj ljusci, ruši cijelo stablo. Korisnik vidi prazan ekran i nema poruke ni dugmeta.

3. **Ikona za Dokumentaciju je pogrešna.** `docsNavigationItem.path = "/docs"` nije u `navigationIcons`. Stavka se prikazuje sa ikonom Dashboard. Fallback je tih, pa ništa ne upozorava. Nema testa koji bi ovo uhvatio.

**Srednji gapovi**

4. **Banneri se remountuju pri svakoj navigaciji.** `application-shell.tsx:92` stavlja `key={location.pathname}` na wrapper koji sadrži `MaintenanceBanner`, `PasswordExpiryBanner` i `AnnouncementsHost`. Svaka promjena rute ponovo montira ove komponente, pa se njihovi podaci mogu ponovo dohvatiti i može se vidjeti treperenje. Animacija `page-in` treba ostati samo na `<Outlet/>`.

5. **Deep link se gubi nakon prijave.** `require-auth.tsx:67` i `:75` šalju `from: location.pathname`. Query i hash se gube.

6. **Duplirana pravila.** `application-shell.tsx:45-48` ponovo računa `isStaff` umjesto `isTicketStaff`. `canOpenRouting` i `canOpenSla` su identični `canOpenAdminArea`. `canOpenEmailTemplatesPage` ponavlja iste uslove.

7. **Ručno održavan union `ForbiddenMessageKey`** u `require-access.tsx`. Svaki novi guard mora ručno dopisati dva ključa. Ako se zaboravi, greška se vidi tek u TypeScript-u kod korišćenja, ali ne i u mapi ključeva.

8. **Ponavljanje u routeru.** 15 `RequireAccess` blokova sa po četiri prop-a. Konfiguracija ruta u jednom nizu (path, element, check, ključevi) smanjila bi fajl i greške pri kopiranju.

9. **Nema 404 stranice.** Nepostojeća adresa tiho vodi na dashboard. Korisnik ne zna da je link pogrešan.

10. **Nema ESLint i Prettier.** U `shell` fajlu (`application-shell.tsx:51-105`) JSX unutar `ShortcutsProvider` nije uvučen, što pokazuje da formatiranje nije provjeravano. Bez `react-hooks` pravila nije moguće automatski uhvatiti zavisnosti u `useEffect`.

11. **Nema testova za zaštitu ruta i ljusku.** Nijedan test ne provjerava da `RequireAuth` preusmjerava, da `RequireAccess` prikazuje „nema pristupa“, da svaka stavka menija ima ikonu, ni da je `*` ponašanje namjerno.

**Niski gapovi**

12. **Mješanje odgovornosti u `RequireAuth`.** Jedna komponenta (80 linija) drži keep-alive sesije, sinhronizaciju jezika, odjavu i redirect. Locale sync ima `.catch(() => undefined)` pa tiho guta greške.

13. **`main.tsx` bez `catch`.** `initializeI18n().then(...)` nema obradu greške. Ako i18n padne, aplikacija ostaje prazna bez poruke.

14. **Interne oznake u komentarima.** U modulu ima 39 pojavljivanja oznaka „Paket“, „Review“ i „Faza“ (npr. `router.tsx`, `navigation.ts`, `route-access.ts`). Te oznake nisu objašnjenje, nego kontekst za tim. Trebaju biti u changelogu ili u dokumentaciji, a u kodu ostaje samo zašto.

15. **Krhke konvencije u `navigation.ts`.**
    - `isNavigationItemActive` ima nekorišćen parametar `_search`.
    - `primaryNavigationItems` i `allNavigationItems` su isti niz.
    - Specijalni slučaj za „Svi tiketi“ je po `labelKey` (string), a ne po flagu u stavci.
    - `ticketsNavigationItem.path` sadrži query (`/tickets?view=all`), pa mapa ikona i poređenje putanja zavise od formata stringa.

16. **Konzistencija u `route-access.ts`.** Ponekad `session.isSuperAdmin === true`, ponekad samo `session.isSuperAdmin`. Četiri gotovo identične funkcije za modul (`canOpenAssets`, `canOpenProblems`, `canOpenChanges`, `canOpenOnCall`) bi se mogle svesti na jednu parametrizovanu.

17. **Direktni `console.error` u produkciji** (`lazy-page.tsx:56`). Nema vidljivog pravila o logovanju u frontendu.

18. **Tekst „N“ u dugmetu „Novi tiket“** (`app-sidebar.tsx:51`) je hard-coded. To je hint za prečicu, ali nije prošao kroz i18n.

19. **Header je pretrpan.** Desktop header ima oko 8 kontrola uz pretragu. Na uskim ekranima (oko 360–390 px) nije provjereno da li sve staje. Ovo nije potvrđen bug, nego pitanje za vizuelnu provjeru.

20. **Ponovna renderovanja.** `ApplicationShell` koristi `useLocation`, `useSession`, `useSessionCapabilities` i `usePublicMaintenance`. Svaka promjena rute ponovo renderuje cijeli shell, uključujući `CommandPalette` koji je uvijek montiran. Nije mjereno profilerom, pa je ovo za provjeru, ne dokazan problem.

**Šta je dobro (zadržati)**

- Lazy učitavanje sa obradom zastarjelih chunkova (`reloadForChunkError`, `vite:preloadError`).
- Pravila pristupa su izdvojena u čiste funkcije (`route-access.ts`) i pokrivena testovima.
- Sidebar se filtrira po capabilities, pa meni i rute koriste isti izvor.
- Dostupnost: skip link, fokus na promjenu rute, live regioni, `aria-current`, `sr-only` tekst za brojače.
- Nema `any`, nema `eslint-disable`, nema TODO u modulu. TypeScript prolazi.
- Keep-alive sesije se čisti u `useEffect` cleanup-u (`stop()` i `setUnauthorizedHandler(null)`).

---

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

Arhitektura modula je solidna. Pravila pristupa su u čistim funkcijama, lazy učitavanje je dobro urađeno, a dostupnost je iznad prosjeka za ovakav projekat. Problemi su u tri grupe:

- **Sigurnost i pouzdanost:** fail-open gate za instalaciju i odsustvo globalnog Error Boundary. Ovo treba popraviti prvo jer korisnik može završiti na pogrešnom ekranu ili na bijelom ekranu bez izlaza.
- **Tačnost detalja:** ikona za Dokumentaciju, gubitak query-ja nakon prijave, remount bannera pri navigaciji.
- **Održivost:** ponavljanje u routeru, duplirana pravila, nema ESLint/Prettier i nema testova za zaštitu ruta. Bez alata, sljedeći refaktor nema mrežu sigurnosti.

Preporuka je da se redoslijed uradi ovako:
1. Popraviti gate za instalaciju (stanje „nepoznato“ sa porukom i dugmetom za ponovni pokušaj, bez preusmjeravanja na `/install`).
2. Dodati globalni Error Boundary (`errorElement` na root ruti i boundary u ljusci) sa porukom i dugmetom za ponovno učitavanje.
3. Testovi za `RequireAuth`, `RequireAccess`, `navigationIconFor` (provjera da svaka stavka ima ikonu) i rute preusmjeravanja.
4. Ispraviti `from` (pathname + search + hash), ikonu za `/docs` i `key` na wrapperu.
5. Refaktor routera u konfiguraciju ruta i spajanje pravila (`isStaff` → `isTicketStaff`, parametrizacija `canOpen*`).
6. Dodati ESLint (`typescript-eslint`, `react-hooks`) i Prettier, te skriptu `lint` u CI.

Refaktor se ne radi bez potvrde obima.

---

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| B1 | Visoka | `app/install-setup-provider.tsx:36-39`, `lib/resolve-install-gate-navigation.ts:27-30` | Greška pri `loadInstallSetupStatus` postavlja `isCompleted: false`, pa sve rute idu na `/install`. | Dodati stanje `error`, prikazati poruku i „pokušaj ponovo“. Ne preusmjeravati. |
| B2 | Visoka | `app/router.tsx`, `layouts/application-shell.tsx` | Nema globalnog Error Boundary. Greška u renderu eager komponente daje bijeli ekran. | `errorElement` na root ruti + boundary u ljusci. |
| B3 | Srednja | `lib/navigation-icons.ts`, `lib/navigation.ts:142` | `/docs` nema ikonu, prikazuje se `LayoutDashboard`. Fallback je tih. | Dodati `"/docs": BookOpen` (ili sličnu) i test koji provjerava sve stavke menija. |
| B4 | Srednja | `components/layout/require-auth.tsx:67,75` | `from` sadrži samo `pathname`, query i hash se gube nakon prijave. | `from: location.pathname + location.search + location.hash`. |
| B5 | Srednja | `layouts/application-shell.tsx:92` | `key={location.pathname}` remountuje banere i obavještenja pri svakoj navigaciji. | Premjestiti `key` na `<Outlet/>` wrapper, a banere ostaviti van njega. |
| B6 | Niska | `layouts/application-shell.tsx:33-39` | Mobilni meni se zatvara na dva načina: `useEffect` na promjenu rute (hvata i back/forward) i `onNavigate` na linkovima. Dvije putanje za isto stanje. | Zadržati jedan mehanizam (npr. `useEffect` na `pathname`) i ukloniti `closeMobileNavigation`. |
| B7 | Niska | `layouts/application-shell.tsx:45-48` | `isStaff` duplira `isTicketStaff` iz `route-access.ts`. | Koristiti `isTicketStaff(capabilities)`. |
| B8 | Niska | `layouts/application-shell.tsx:51-105` | Neuvučen JSX unutar `ShortcutsProvider`. Nema Prettier provjere. | Uvesti Prettier i formatirati. |
| B9 | Niska | `lib/navigation.ts:243-267` | Nekorišćen parametar `_search` u `isNavigationItemActive`. | Ukloniti parametar. |
| B10 | Niska | `lib/navigation.ts:241` | `allNavigationItems` je alias za `primaryNavigationItems`. | Jedan naziv. |
| B11 | Niska | `lib/navigation.ts:255` | Specijalni slučaj za „Svi tiketi“ se poredi po `labelKey` stringu. | Flag na stavci (npr. `matchPrefixes`). |
| B12 | Niska | `lib/session/route-access.ts:33,49` i `:163-173` | `canOpenRouting` i `canOpenSla` su identični `canOpenAdminArea`. `canOpenEmailTemplatesPage` ponavlja uslove. | Spojiti u `canOpenAdminArea`. |
| B13 | Niska | `lib/session/route-access.ts:34` i drugi | Mješavina `=== true` i truthy provjera za `isSuperAdmin`. | Ujednačiti. |
| B14 | Niska | `components/layout/require-access.tsx:32` | Prop `loadingLabelKey` ima samo jednu vrijednost (`"session.loading"`). | Ukloniti prop. |
| B15 | Niska | `main.tsx:28` | `initializeI18n().then(...)` nema `catch`. | Dodati `catch` sa osnovnom porukom. |
| B16 | Niska | `components/layout/require-auth.tsx:36-58` | Sync jezika guta grešku (`.catch(() => undefined)`). | Logovati i ne blokirati sesiju. |
| B17 | Niska | `app/lazy-page.tsx:56` | `console.error` direktno u produkciji. | Centralni logger ili usklađenje sa pravilom logovanja. |
| B18 | Niska | `components/layout/app-sidebar.tsx:51` | Tekst „N“ hard-coded. | Prevesti ili izvući u konstantu sa oznakom prečice. |
| B19 | Niska | 39 mjesta u modulu | Interne oznake „Paket / Review / Faza“ u komentarima. | Prebaciti u changelog ili dokumentaciju. |
| B20 | Niska | `app/router.tsx:348` | `*` preusmjerava na `/`, nema 404. | Dodati `NotFoundPage`. |
| B21 | Niska | `lib/resolve-install-gate-navigation.ts:4-15` | `_visual-qa` ruta je konstanta i u produkcionom bundleu, iako postoji samo u DEV modu. | Koristiti `import.meta.env.DEV` i u gate-u. |
| B22 | Za provjeru | `components/layout/app-header.tsx` | Header sa oko 8 kontrola na uskim ekranima. | Vizuelna provjera na 360 i 390 px, uz screenshot. |

---

## Ocjena: 6/10

**Obrazloženje:** Arhitektura (lazy, pravila pristupa u čistim funkcijama, dostupnost, TypeScript bez `any`) je jača od prosjeka. Oduzimaju se bodovi za fail-open gate za instalaciju, odsustvo globalnog Error Boundary, pogrešnu ikonu i gubitak query-ja nakon prijave, zatim za nepostojanje ESLint i Prettier i za testove koji ne pokrivaju zaštitu ruta i ljusku.

---

## Must-Have (za ovaj modul)

1. Gate za instalaciju ne smije preusmjeravati na `/install` kad status nije poznat (B1).
2. Globalni Error Boundary na root ruti i u ljusci (B2).
3. Testovi za `RequireAuth`, `RequireAccess`, rute preusmjeravanja i ikonu za svaku stavku menija (B3, gap 11).
4. Ispraviti `from` nakon prijave (B4).
5. ESLint (`typescript-eslint`, `react-hooks`) i Prettier sa skriptom u CI (gap 10).

## Status ispravki (Paket 6.1.1)

Modul je zatvoren. Sve stavke B1–B22 i Must-Have 1–5 su urađene.

| Stavka | Status | Napomena |
|---|---|---|
| B1 gate za instalaciju | Urađeno | Stanja `loading / error / ready`; `InstallStatusError` sa ponovnim pokušajem. |
| B2 Error Boundary | Urađeno | `RouteErrorBoundary` na korijenu i oko svake stranice u ljusci. |
| B3 ikone i test | Urađeno | `/docs` ima `FileText`; test provjerava ikonu za svaku stavku menija. |
| B4 `from` | Urađeno | `pathname + search + hash`; login prolazi kroz `safeReturnPath`. |
| B5 `key` na stranici | Urađeno | Ključ je na omotaču stranice; banneri ostaju van njega. |
| B6 dva mehanizma zatvaranja menija | Urađeno | Jedan: `useEffect` na `location.key`. Uklonjen `onNavigate`. |
| B7 `isStaff` | Urađeno | Koristi se `isTicketStaff(capabilities)`. |
| B8 formatiranje ljuske | Urađeno | Prettier (ESLint/Prettier paket). |
| B9 `_search` | Urađeno | Parametar uklonjen; testovi prilagođeni. |
| B10 alias `allNavigationItems` | Urađeno | Ostaje `primaryNavigationItems`. |
| B11 oznaka „Svi tiketi“ | Urađeno | Polja `matchPrefixes` i `excludePaths` na stavci, bez poređenja po `labelKey`. |
| B12 duplirani `canOpen*` | Urađeno | `canOpenRouting`, `canOpenSla` i `canOpenEmailTemplatesPage` spojeni u `canOpenAdminArea`. |
| B13 `=== true` i truthy | Urađeno u modulu | `isSuperAdmin` je `boolean`, provjere su ujednačene u `route-access.ts`. Isti obrazac ima još oko 30 mjesta u drugim modulima (vidjeti dolje). |
| B14 prop `loadingLabelKey` | Urađeno | Uklonjen. |
| B15 `initializeI18n` bez `catch` | Urađeno | Greška se prijavljuje, aplikacija se ipak renderuje (prevodi se prikazuju kao ključevi). |
| B16 gutanje greške jezika | Urađeno | `reportClientError("locale_sync_failed", …)`, sesija nije blokirana. |
| B17 `console.error` | Urađeno | `lib/app/client-logger.ts` je jedini izvor ispisa; pravilo ESLint `no-console`. |
| B18 hard-coded „N“ | Urađeno | Tekst prečice dolazi iz kataloga (`shortcutHint("newTicket")`). |
| B19 interne oznake u komentarima | Urađeno | Uklonjene oznake „Paket / Review / Faza“ iz 31 fajla modula. |
| B20 `*` preusmjerava na `/` | Urađeno | `NotFoundPage` unutar ljuske (`app.notFound.*`). |
| B21 `_visual-qa` u produkciji | Urađeno | `isVisualQaRoute` provjerava `import.meta.env.DEV`. |
| B22 zaglavlje na 360 i 390 px | Djelimično | Statička analiza klasa, bez vizuelne provjere (u sandboxu nema browser-a). Naziv tiketa u indikatoru tajmera se skraćuje na malim ekranima. Rizik: dok tajmer radi, polje pretrage se na telefonu svodi na ikonu. |
| ESLint, Prettier, skripta u CI | Urađeno | `lint`, `format:check` u CI-ju; 14 upozorenja `exhaustive-deps` su dug u drugim modulima. |

### Zabilješke za druge module

- **B13, šire:** oko 30 mjesta u `components/`, `pages/` i `lib/` koristi `session?.isSuperAdmin === true`. Ujednačavanje ide u modul 13 (lib) ili kao zajednička stavka.
- **Modul 5:** `EmailTemplatesCard` prima `canWrite`, ali ga ne koristi (komponenta je read-only).
- **Modul 12/13:** `PageLoadBoundary` u `lazy-page.tsx` i `RouteErrorBoundary` imaju gotovo istu fallback poruku. Spojiti u jednu komponentu.
- **Modul 16 ili 13:** `use-session.ts` i ostali fajlovi sa `exhaustive-deps` upozorenjima (14 ukupno).
