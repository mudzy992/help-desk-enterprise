# Modul 12: `ui/` komponente — Pulse dizajn sistem

**Datum audita:** 2026-10-18
**Auditirani Git SHA:** `72fb2f34471f7d65ca7673fd7c5b0a719e19ad98` (`origin/master`)
**Status:** v2 re-audit završen; kod nije mijenjan
**Oznake nalaza:** samo **UI**

---

## Modul

`frontend/src/components/ui/` je zajednički Pulse sloj za dashboard, tickets, settings, admin i ostale prijavljene tokove. Na auditiranom SHA ima **36 fajlova**: **31 produkcijski `.tsx` fajl**, jedan `control.ts` i **4 spec fajla**. Javni obuhvat ide od osnovnih kontrola (`Button`, `Field`, `Checkbox`, `Switch`) preko Radix površina (`Modal`, `Sheet`, `DropdownMenu`) do složenijih obrazaca (`ToastProvider`, `ResponsiveSurface`, `FilterBar`, `PanelErrorBoundary`).

Potrošnja je velika: grep nalazi oko 290 fajlova koji uvoze `button`, 137 `badge`, 127 `card`, 108 `skeleton`, 80 `field`, 80 `toast`, 51 `api-error-text`, 44 `sheet` i 33 `confirm-dialog`. Zbog toga mali API ili a11y propust u `ui/` ima širok horizontalni uticaj.

Izvor vizuelne istine su semantičke klase i tokeni iz `frontend/src/index.css`, uz pravila iz `Master UI-UX Design Constitution.md` i `.cursor/docs/theme.md`. Guardovi provjeravaju palete, kontrast, hardkodirane boje, i18n, fokus i dio statičke pristupačnosti.

### Definicija „max full“

- svaki dijalog ima programsko ime i opis; forme prijavljuju grešku; custom tabs/radiogroup podržavaju WAI-ARIA tastaturu;
- potvrde koriste jedan testabilan `ConfirmDialog`, bez `window.confirm`;
- `ui/` nema domenske importe, ili postoji eksplicitan migracijski plan i lint granica;
- Modal, ConfirmDialog, Toast, Field, Tabs i Segmented imaju smislen behavior/a11y test;
- Pulse tokeni ostaju bez zabranjenih hardkodiranih boja, a sva tri Pulse guarda su zelena;
- svaka promjena semantičkih utility klasa u `ui/` prolazi Aurora shim skener.

---

## Pulse `ui/` vs. Install shim

Pulse `ui/` je izvor istine za aplikaciju poslije instalacije. Install Wizard v2 je namjerno zaseban Aurora vizuelni jezik i ne treba ga približavati dashboard/settings izgledu. Modul 12 odgovara za stabilan semantički API, Pulse tokene i pristupačno ponašanje primitiva; modul 11 odgovara za Aurora canvas, `--iw-*` tokene, motion i scoped mapiranje.

Most je `frontend/src/styles/install-shim.css`: install koraci nastavljaju koristiti `ui/` primitive i semantičke Tailwind klase, ali ih `[data-install-theme="aurora"]` mapira na Aurora tokene, uključujući Radix portale. Regresija nastaje kada nova ili izmijenjena `ui/` klasa procuri kao Pulse boja u install, odnosno kada utility koji se koristi u install stablu nema shim pravilo.

`scripts/check-install-aurora.mjs` skenira install stablo i odabrane `ui/` primitive. Na ovom SHA prijavljuje **27 token klasa i 0 shim praznina**, kao i 0 beskonačnih geometrijskih animacija na interaktivnim kontejnerima. Modul 12 zato ne treba duplicirati Aurora dizajn, ali svaka promjena utility ugovora mora proći ovaj cross-modul guard.

---

## Povezani fajlovi

| Grupa | Fajlovi / dokaz | Uloga |
|---|---|---|
| Kontrole i forme | `button.tsx`, `control.ts`, `field.tsx`, `checkbox.tsx`, `switch.tsx`, `segmented.tsx`, `chip.tsx` | Unos, izbor, akcije i stanje greške |
| Dijalozi i površine | `modal.tsx`, `confirm-dialog.tsx`, `sheet.tsx`, `responsive-surface.tsx`, `dropdown-menu.tsx` | Radix fokus, portal, Escape i modalnost |
| Navigacija i struktura | `tabs.tsx`, `wizard-stepper.tsx`, `page-header.tsx`, `detail-section.tsx`, `filter-bar.tsx`, `scroll-region.tsx`, `separator.tsx` | Navigacija, sekcije i raspored |
| Prikaz podataka | `card.tsx`, `stat-card.tsx`, `badge.tsx`, `progress.tsx`, `avatar.tsx`, `kbd.tsx`, `relative-time.tsx` | Kartice, statusi, progres i identitet |
| Feedback | `toast.tsx`, `skeleton.tsx`, `empty-state.tsx`, `api-error-text.tsx`, `warning.tsx`, `panel-error-boundary.tsx` | Učitavanje, upozorenje, greška i oporavak |
| Testovi | `badge.spec.tsx`, `field.spec.ts`, `confirm-dialog.spec.tsx`, `panel-error-boundary.spec.tsx` | 4 fajla / 7 testova |
| Pulse tokeni | `frontend/src/index.css`, `.cursor/docs/theme.md`, `Master UI-UX Design Constitution.md` | Palete i pravila dizajn sistema |
| Pulse guardovi | `check-pulse-design-system.mjs`, `check-theme-contrast.mjs`, `check-a11y-static.mjs` | Tokeni, kontrast i statički a11y |
| Install most | `styles/install-shim.css`, `scripts/check-install-aurora.mjs`, `audit/frontend/11-install.md` | Scoped Aurora mapiranje i leak zaštita |

---

## Trenutna implementacija

### Dijalozi i responsive površine

`Modal`, `Sheet` i `DropdownMenu` obavijaju Radix primitive. `ResponsiveSurface` ispravno koristi `ModalTitle`/`ModalDescription` na desktopu i odgovarajuće Sheet primitive na kompaktnom viewportu. Direktni potrošači koji ručno montiraju `ModalTitle` takođe dobijaju Radix `aria-labelledby`.

Međutim, zajednički `ModalHeader` i dalje renderuje obične `<h2>` i `<p>`. Radix Dialog **1.1.23** programsko ime veže za montirani `Dialog.Title`; obični heading nije dovoljan. Time su pogođeni `ConfirmDialog` i najmanje 13 drugih `ModalHeader` poziva. `ConfirmDialog` test provjerava samo klik na danger akciju — ne ime dijaloga, početni fokus ni Escape.

### Field i kontrole

`Field` ima napredni render-prop oblik koji generiše `id`, `aria-describedby`, `aria-invalid`, `aria-errormessage` i `aria-required`; njegova tri testa prolaze. Legacy children oblik i dalje omotava kontrolu, hint i grešku u `<label>`, pa ne može automatski dodati iste ARIA veze. Grubi inventar daje **281 `<Field>` upotrebu**; statički grep nije dovoljno pouzdan da razdvoji sve render-prop pozive, pa procenat migracije nije proglašen izmjerenim.

`UnderlineTabs` koristi `tablist/tab`, a `Segmented` `radiogroup/radio`, ali sva dugmad ostaju u tab redoslijedu. Nema Arrow/Home/End ponašanja, roving `tabIndex`, niti ugovora `aria-controls`/`tabpanel` za tabove.

### Toast, feedback i loaderi

`ToastProvider` ima queue, deduplikaciju, limit od tri prikaza, pauzu na hover/fokus, trajanje po tonu, `alert/status` i request ID kopiranje. I dalje nema vlastiti test. Povratna vrijednost `toast()` zavisi od `resolvedId` koji se mijenja unutar React state updatera; kod deduplikacije može vratiti kandidat umjesto stvarnog spojenog ID-a.

`PanelSkeleton` je dominantan loader (108 importera) i ima `role="status"`, ali istovremeno nosi `aria-label` i isti `sr-only` tekst. `Warning` je tokenizovan prikaz upozorenja sa skrivenom dekorativnom ikonom. Novi `PanelErrorBoundary` izoluje render grešku, prijavljuje je loggeru i nudi retry; ima test oporavka i `role="alert"`, ali je naziv/log event/fallback copy vezan za ticket domen i zato pojačava UI5.

### Tokeni i guardovi

Komponente uglavnom koriste Pulse semantičke tokene. Pulse design-system i contrast guard su zeleni; kontrastni guard je provjerio 12 paleta × 23 para, sa najnižim izmjerenim parom **4,90:1**. Statički a11y guard je takođe zelen, ali njegova pravila pokrivaju icon-button naziv, img alt, click/keyboard, pozitivan tabindex, focus outline i disabled opacity — **ne** provjerava DialogTitle, tabs roving model, progressbar semantiku ili Field runtime veze.

---

## Realno / željeno — samo otvoreno

| UI | Realno stanje | Željeno stanje |
|---|---|---|
| **UI1** | `ModalHeader` je obični `h2/p`; `ConfirmDialog` i potrošači nemaju Radix accessible name/description. | `ModalHeader` montira `ModalTitle` i `ModalDescription`; behavior test traži imenovani dialog/alertdialog. |
| **UI2** | Pet stvarnih `window.confirm` poziva ostaje u tickets/users/email templates. | Sve potvrde koriste `ConfirmDialog`, uključujući unsaved-navigation tok. |
| **UI3** | Tabs i Segmented imaju role, ali nemaju roving fokus ni Arrow/Home/End. | WAI-ARIA tabs/radiogroup tastatura, fokus i panel veze. |
| **UI4** | Render-prop Field je ispravan i testiran; legacy oblik ne prenosi a11y stanje na kontrolu. | Migrirati legacy upotrebe ili uvesti API koji uvijek povezuje label/hint/error. |
| **UI5** | `ui/` i dalje zna za error domene, ticket format, docs/branding i ticket panel logging/copy. | Presentational `ui/`; domenska adaptacija izvan foldera + lint granica. |
| **UI6** | Badge/Stat/Progress imaju odvojene mape istih tonova; Chip duplira remove JSX. | Zajednički tone ugovor i jedan remove primitive. |
| **UI7** | 4 spec fajla / 7 testova za 31 produkcijsku komponentu. | Modal, ConfirmDialog fokus/Escape/name, Toast, Field oba API-ja, Tabs, Segmented i FilterBar. |
| **UI8** | Progress nema progressbar ARIA; WizardStepper nema `aria-current`; Avatar se oslanja na title/inicijale; skeleton duplira naziv. | Eksplicitna semantika i runtime/axe potvrda. |
| **UI9** | `PageHeader` koristi `"\u0000brand"` sentinel. | Tipizovan crumb model. |
| **UI10** | Switch/Chip/Avatar koriste `bg-white`, `bg-black/*` ili `ring-black/white`; trenutni guard ih ne odbija. | Tokeni za thumb, hover i avatar ring ili dokumentovan, guardovan izuzetak. |
| **UI11** | Ostali su fazni/audit komentari i zastario navod `~100` potrošača `control.ts`. | Komentari objašnjavaju ugovor i razlog, bez istorije implementacije. |
| **UI12** | `toast()` može vratiti kandidat umjesto ID-a dedupliciranog toasta. | Sinhron, tačan ugovor ili uklonjena/dokumentovana povratna vrijednost. |
| **UI13** | Više javnih Radix exporta nema potrošača. | Smanjiti API ili eksplicitno dokumentovati namjerni passthrough. |
| **UI14** | Button zadržava alias parove varijanti. | Jedan kanonski naziv po namjeri uz migraciju. |
| **UI15** | `ariaLabel`/`label` i `ui.close`/`shell.close` ostaju neujednačeni. | Konzistentan prop i i18n ugovor. |
| **UI17** | Warning je jednostavan i nema test; PanelErrorBoundary je testiran, ali je ticket-specifičan unutar `ui/`. | Testirati Warning semantiku; boundary učiniti generičkim ili premjestiti u ticket sloj. |

---

## Gap analiza

### UI1 — dijalozi bez programskog imena

Ovo ostaje najvažniji nalaz. `ModalHeader` treba interno koristiti već izvezene `ModalTitle` i `ModalDescription`. Time se popravlja `ConfirmDialog` i svi potrošači bez pojedinačne migracije markup-a. Test mora dokazati `getByRole("alertdialog", { name })`, opis, početni fokus i Escape; sadašnji ConfirmDialog spec pokriva samo danger klik.

### UI2 — dvije konvencije potvrde

Ostalo je pet native potvrda: ticket participants, ticket attachments, unlink i delete user te email-template unsaved navigation. Ranija assets mjesta su migrirana, pa je nalaz djelimično smanjen. Native prompt nema Pulse/Aurora temu, intent, pending stanje ni pouzdan testni API.

### UI3 i UI4 — custom interakcija i forma

ARIA role bez očekivane tastature stvaraju semantičko obećanje koje komponenta ne ispunjava. Tabs i radio grupa trebaju aktivni jedini tab stop i smjer strelica. Field render-prop je dobar cilj, ali legacy grana ne može čarobno mutirati proizvoljno dijete; roadmap treba migraciju potrošača, mjeren codemod i privremeni lint/deprecation, ne novu heuristiku sa `cloneElement` bez tipne granice.

### UI5 — domenske zavisnosti

`api-error-text` uvozi osam error-key tipova; `relative-time` ticket formatter; `page-header` DocsHelpButton, branding store i docs routing; `panel-error-boundary` ticket event/copy. Dozvoljeni infrastrukturni importi (`cn`, a11y helper, viewport hook) nisu problem. Cilj je lint pravilo koje zabranjuje `components/<domen>`, `lib/<domen>` i domenski copy/logger iz `ui/`, uz eksplicitnu allowlistu za neutralnu infrastrukturu.

### UI6, UI9–UI15 — održavanje API-ja

Ovi nalazi nisu pojedinačno kritični, ali zajedno šire javnu površinu i dopuštaju divergenciju: četiri tone mape, alias varijante, sentinel, neujednačeni propovi i mrtvi passthrough exporti. UI12 treba riješiti prije nego potrošač počne koristiti povratni toast ID.

### UI7 i UI8 — dokaz ponašanja

Broj specova je porastao sa 2 na 4, a Field i PanelErrorBoundary imaju korisne testove. Ipak, najveći behavior rizici ostaju netestirani. Zeleni `check-a11y-static` ne zatvara UI1/UI3/UI8: guard nema pravila za DialogTitle, roving fokus, progressbar ni `aria-current`.

### UI16 — shim/regresija

**Zatvoren na auditiranom SHA.** Aurora guard nalazi 27 semantičkih token klasa i 0 nepokrivenih utilityja u install toku. Nalaz se mora ponovo otvoriti pri svakoj promjeni `ui/` klase koja se koristi u installu ako guard prijavi prazninu.

### UI17 — novi feedback elementi

`Warning` je mali Pulse primitive (`p`, dekorativna ikona, warning tokeni) i u installu je shimovan. `PanelErrorBoundary` ima dobar retry/izolacijski test i `role="alert"`, ali nije stvarno generički: event je `ticket_panel_failed`, test id `ticket-panel-error`, a prevodi su `tickets.*`. Arhitektonski pripada ticket sloju ili treba neutralne props.

### UI18 — stvarna pokrivenost guardova

`check-pulse-design-system` štiti hardkodirane palete, tokene, radius, i18n i theme-storage ugovor. `check-theme-contrast` mjeri token parove i zabranjene kombinacije teksta. `check-a11y-static` hvata šest statičkih klasa problema, ali ne UI1/UI3/UI8. Zato se roadmap ne smije osloniti samo na zelene guardove; potrebni su komponentni testovi i runtime axe/browser dokaz.

---

## Master tabela UI1–UI18

| UI | Status | Dokaz |
|---|---|---|
| **UI1** | Otvoren | `ModalHeader` i dalje koristi `h2/p`; Radix 1.1.23 traži montiran Title. |
| **UI2** | Djelimično | Assets potvrde su migrirane; ostaje 5 `window.confirm` poziva. |
| **UI3** | Otvoren | Role postoje; roving fokus i Arrow/Home/End ne postoje. |
| **UI4** | Djelimično | Render-prop + 3 testa su ispravni; legacy grana ostaje. |
| **UI5** | Otvoren | Error domeni, ticket formatter, docs/branding i ticket boundary ostaju u `ui/`. |
| **UI6** | Otvoren | Tone mape i Chip remove markup su duplicirani. |
| **UI7** | Djelimično | 4 spec fajla / 7 prolaznih testova; ključne komponente bez testa. |
| **UI8** | Otvoren | Progress, Avatar, DetailSection, WizardStepper i Skeleton imaju preostale semantičke gapove. |
| **UI9** | Otvoren | NUL sentinel je i dalje u `page-header.tsx`. |
| **UI10** | Otvoren | Default black/white utilityji ostaju; guard je zelen, ali ih ne klasifikuje kao zabranjenu paletu. |
| **UI11** | Otvoren | Fazni komentari i zastario broj potrošača ostaju. |
| **UI12** | Otvoren | Lazy updater i `resolvedId` ugovor nisu promijenjeni. |
| **UI13** | Otvoren | Modal/Sheet/Dropdown passthrough exporti uglavnom nemaju vanjske potrošače. |
| **UI14** | Prihvaćen rizik | Aliasi čuvaju kompatibilnost; migracija nije funkcionalni prioritet. |
| **UI15** | Otvoren | Prop i close i18n ugovor ostaju neujednačeni. |
| **UI16** | Zatvoren | `check-install-aurora`: 27 klasa, 0 shim praznina; check B takođe zelen. |
| **UI17** | Djelimično | Warning uveden; PanelErrorBoundary ima test, ali nosi ticket domen. |
| **UI18** | Djelimično | Tri guarda su korisna i zelena, ali ne pokrivaju UI1/UI3/UI8 semantiku. |

---

## Roadmap do 10/10

### P0 — a11y i široki API uticaj

1. **UI1:** prebaciti `ModalHeader` na Radix Title/Description i dodati Modal/ConfirmDialog testove za name, description, focus i Escape.
2. **UI4/UI3:** izmjeriti i migrirati legacy Field; implementirati roving fokus i WAI-ARIA tastaturu za Tabs/Segmented, sa testovima.
3. **UI8:** dodati Progress ARIA, `aria-current="step"`, Avatar accessible-name/dekorativni ugovor i ukloniti dupli skeleton naziv; potvrditi axe/browserom.

### P1 — konzistentnost i pouzdanost

4. **UI2:** zamijeniti svih pet `window.confirm` tokova `ConfirmDialog` obrascem.
5. **UI7/UI12:** testirati Toast queue/dedup/pauzu/Escape/ID i FilterBar; popraviti ili redefinisati toast ID.
6. **UI5/UI17:** izvući domenske adaptere i ticket boundary iz `ui/`; uvesti `no-restricted-imports` sa infrastrukturnom allowlistom.

### P2 — Pulse ugovor i čišćenje

7. **UI6/UI9–UI15:** objediniti tonove, ukloniti sentinel/mrtve exporte, kanonizovati props/varijante/i18n i očistiti istorijske komentare.
8. **UI10:** zamijeniti black/white utilityje tokenima ili dokumentovati i automatizovati precizan izuzetak.
9. Za svaki PR pokrenuti sva tri Pulse guarda, ui Vitest paket i `check-install-aurora.mjs`.

---

## Ocjena

**7,5/10**

Modul je širi i pouzdaniji nego 2026-10-13: inventar je porastao, Field render-prop je testiran, ConfirmDialog i PanelErrorBoundary imaju osnovne specove, Pulse token/kontrast/a11y guardovi su zeleni, a Aurora shim trenutno nema praznina. Ocjena ipak ne ide više jer UI1 ostaje širok accessible-name propust, UI2 još ima pet native potvrda, UI3/UI4 nisu završeni, arhitektonska granica UI5 je i dalje otvorena, a samo 7 testova ne pokriva Modal/Toast/Tabs behavior. Browser/axe dokaz u ovom re-auditu nije izvršen.

---

## Provjere izvršene

- [x] Inventarisano **36 fajlova** u `components/ui/`: 31 produkcijski TSX, `control.ts` i 4 spec fajla; novi `warning` i `panel-error-boundary` uključeni.
- [x] Pročitani stari audit UI1–UI15, Constitution/theme izvori, novi feedback elementi, `modal`, `field`, `confirm-dialog`, tabs/segmented, progress/avatar/wizard/skeleton i guardovi.
- [x] Puni grep `window.confirm`: **5** stvarnih poziva; dodatni `confirm()` callback na announcements stranici nije browser API.
- [x] Grepani `ModalHeader`, `ModalTitle`, `role="progressbar"`, `animate-pulse`, `PanelSkeleton`, potrošači i importi iz `ui/`.
- [x] Provjeren Radix Dialog **1.1.23** i Title/`aria-labelledby` ugovor.
- [x] Pregledani domenski importi: error-key unioni, ticket formatter, docs/branding i panel boundary.
- [x] `node scripts/check-pulse-design-system.mjs` — prošao.
- [x] `node scripts/check-theme-contrast.mjs` — prošao; 12 paleta × 23 para, minimum 4,90:1.
- [x] `node scripts/check-a11y-static.mjs` — prošao; njegov scope ne zatvara UI1/UI3/UI8.
- [x] `node scripts/check-install-aurora.mjs` — prošao; 27 klasa, 0 shim praznina, 0 nestabilnih kontejnera.
- [x] `npx vitest run src/components/ui` — **4/4 fajla, 7/7 testova prošlo**.
- [ ] Browser, axe i Lighthouse nisu pokrenuti; runtime nalazi nisu zatvoreni bez dokaza.

## Status re-audita (2026-10-18)

Stara tvrdnja „28 fajlova / 2 speca / ništa nije urađeno“ više nije važeća. Dokument je prepisan prema `origin/master@72fb2f3`; produkcijski kod nije mijenjan.

**Predložena commit poruka:** `docs(audit): rewrite ui components module 12 review`
