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

| Grupa                  | Fajlovi / dokaz                                                                                                                   | Uloga                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Kontrole i forme       | `button.tsx`, `control.ts`, `field.tsx`, `checkbox.tsx`, `switch.tsx`, `segmented.tsx`, `chip.tsx`                                | Unos, izbor, akcije i stanje greške       |
| Dijalozi i površine    | `modal.tsx`, `confirm-dialog.tsx`, `sheet.tsx`, `responsive-surface.tsx`, `dropdown-menu.tsx`                                     | Radix fokus, portal, Escape i modalnost   |
| Navigacija i struktura | `tabs.tsx`, `wizard-stepper.tsx`, `page-header.tsx`, `detail-section.tsx`, `filter-bar.tsx`, `scroll-region.tsx`, `separator.tsx` | Navigacija, sekcije i raspored            |
| Prikaz podataka        | `card.tsx`, `stat-card.tsx`, `badge.tsx`, `progress.tsx`, `avatar.tsx`, `kbd.tsx`, `relative-time.tsx`                            | Kartice, statusi, progres i identitet     |
| Feedback               | `toast.tsx`, `skeleton.tsx`, `empty-state.tsx`, `api-error-text.tsx`, `warning.tsx`, `panel-error-boundary.tsx`                   | Učitavanje, upozorenje, greška i oporavak |
| Testovi                | `badge.spec.tsx`, `field.spec.ts`, `confirm-dialog.spec.tsx`, `panel-error-boundary.spec.tsx`                                     | 4 fajla / 7 testova                       |
| Pulse tokeni           | `frontend/src/index.css`, `.cursor/docs/theme.md`, `Master UI-UX Design Constitution.md`                                          | Palete i pravila dizajn sistema           |
| Pulse guardovi         | `check-pulse-design-system.mjs`, `check-theme-contrast.mjs`, `check-a11y-static.mjs`                                              | Tokeni, kontrast i statički a11y          |
| Install most           | `styles/install-shim.css`, `scripts/check-install-aurora.mjs`, `audit/frontend/11-install.md`                                     | Scoped Aurora mapiranje i leak zaštita    |

---

## Trenutna implementacija

### Dijalozi i responsive površine

`Modal`, `Sheet` i `DropdownMenu` obavijaju Radix primitive. `ResponsiveSurface` ispravno koristi `ModalTitle`/`ModalDescription` na desktopu i odgovarajuće Sheet primitive na kompaktnom viewportu. Direktni potrošači koji ručno montiraju `ModalTitle` takođe dobijaju Radix `aria-labelledby`.

Međutim, zajednički `ModalHeader` i dalje renderuje obične `<h2>` i `<p>`. Radix Dialog **1.1.23** programsko ime veže za montirani `Dialog.Title`; obični heading nije dovoljan. Time su pogođeni `ConfirmDialog` i najmanje 13 drugih `ModalHeader` poziva. `ConfirmDialog` test provjerava samo klik na danger akciju — ne ime dijaloga, početni fokus ni Escape.

### Field i kontrole

`Field` ima napredni render-prop oblik koji generiše `id`, `aria-describedby`, `aria-invalid`, `aria-errormessage` i `aria-required`; njegova tri testa prolaze. Legacy children oblik i dalje omotava kontrolu, hint i grešku u `<label>`, pa ne može automatski dodati iste ARIA veze. Grubi inventar daje **281 `<Field>` upotrebu**; statički grep nije dovoljno pouzdan da razdvoji sve render-prop pozive, pa procenat migracije nije proglašen izmjerenim.

`UnderlineTabs` koristi `tablist/tab`, a `Segmented` `radiogroup/radio`, ali sva dugmad ostaju u tab redoslijedu. Nema Arrow/Home/End ponašanja, roving `tabIndex`, niti ugovora `aria-controls`/`tabpanel` za tabove.

### Toast, feedback i loaderi

`ToastProvider` ima queue, deduplikaciju, limit od tri prikaza, pauzu na hover/fokus, trajanje po tonu, `alert/status` i request ID kopiranje. Provider behavior test potvrđuje dedup/count, limit i promociju queuea, pauzu timera, Escape te action/dismissal. Sinhroni `queueRef` je autoritativan za imperativne operacije prije React commita, pa `toast()` vraća ID stvarno kreiranog ili spojenog zapisa.

`PanelSkeleton` je dominantan loader (108 importera) i izlaže jedan status naziv. `Warning` je tokenizovan `role="alert"` prikaz upozorenja sa skrivenom dekorativnom ikonom i vlastitim semantičkim testom. Ticket-specifični `PanelErrorBoundary` izoluje render grešku, prijavljuje je loggeru i nudi testirani retry izvan neutralnog `ui/` sloja.

### Tokeni i guardovi

Komponente uglavnom koriste Pulse semantičke tokene. Pulse design-system i contrast guard su zeleni; kontrastni guard je provjerio 12 paleta × 23 para, sa najnižim izmjerenim parom **4,90:1**. Statički a11y guard je takođe zelen, ali njegova pravila pokrivaju icon-button naziv, img alt, click/keyboard, pozitivan tabindex, focus outline i disabled opacity — **ne** provjerava DialogTitle, tabs roving model, progressbar semantiku ili Field runtime veze.

---

## Realno / željeno — samo otvoreno

| UI       | Realno stanje                                                                                                                                    | Željeno stanje                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **UI2**  | Svih pet native potvrda migrirano je na zajednički `ConfirmDialog`, uključujući unsaved-navigation tok.                                          | Sve potvrde koriste `ConfirmDialog`, uključujući unsaved-navigation tok.        |
| **UI3**  | Tabs i Segmented imaju roving fokus, jedan tab stop, Arrow/Home/End wrap-around i testirani selection ugovor.                                    | WAI-ARIA tabs/radiogroup tastatura, fokus i panel veze.                         |
| **UI4**  | Render-prop Field je ispravan i testiran; legacy oblik ne prenosi a11y stanje na kontrolu.                                                       | Migrirati legacy upotrebe ili uvesti API koji uvijek povezuje label/hint/error. |
| **UI5**  | `ui/` produkcijski kod zavisi samo od drugih UI primitiva i neutralne infrastrukture; domenski adapteri su izvan foldera, a ESLint čuva granicu. | Održavati neutralnu granicu lint zaštitom.                                      |
| **UI6**  | Badge/Stat/Progress imaju odvojene mape istih tonova; Chip duplira remove JSX.                                                                   | Zajednički tone ugovor i jedan remove primitive.                                |
| **UI7**  | Modal, ConfirmDialog, Toast, oba Field API-ja, Tabs, Segmented i FilterBar imaju behavior/semantičke testove.                                    | Održavati kompletan behavior ugovor regresijskim testovima.                     |
| **UI8**  | Progress, WizardStepper, Avatar, Skeleton i DetailSection imaju eksplicitnu, testiranu semantiku.                                                | Eksplicitna semantika i runtime/axe potvrda.                                    |
| **UI9**  | `PageHeader` koristi `"\u0000brand"` sentinel.                                                                                                   | Tipizovan crumb model.                                                          |
| **UI10** | Switch/Chip/Avatar koriste `bg-white`, `bg-black/*` ili `ring-black/white`; trenutni guard ih ne odbija.                                         | Tokeni za thumb, hover i avatar ring ili dokumentovan, guardovan izuzetak.      |
| **UI11** | Ostali su fazni/audit komentari i zastario navod `~100` potrošača `control.ts`.                                                                  | Komentari objašnjavaju ugovor i razlog, bez istorije implementacije.            |
| **UI12** | `toast()` sinhrono vraća ID stvarno kreiranog ili dedupliciranog zapisa, uključujući pozive prije React commita.                                 | Održavati tačan ugovor behavior testom.                                         |
| **UI13** | Više javnih Radix exporta nema potrošača.                                                                                                        | Smanjiti API ili eksplicitno dokumentovati namjerni passthrough.                |
| **UI14** | Button zadržava alias parove varijanti.                                                                                                          | Jedan kanonski naziv po namjeri uz migraciju.                                   |
| **UI15** | `ariaLabel`/`label` i `ui.close`/`shell.close` ostaju neujednačeni.                                                                              | Konzistentan prop i i18n ugovor.                                                |
| **UI17** | Warning ima eksplicitni alert ugovor i semantički test; ticket `PanelErrorBoundary` i njegov test su u ticket sloju.                             | Održavati oba feedback ugovora testovima.                                       |

---

## Gap analiza

### UI1 — dijalozi imaju programsko ime (zatvoren)

`ModalHeader` sada interno koristi već izvezene `ModalTitle` i `ModalDescription`, bez promjene API-ja potrošača. `ConfirmDialog` test dokazuje imenovani `alertdialog`, povezani opis, početni fokus na sigurnoj akciji i zatvaranje Escape tipkom.

### UI2 — jedinstvena potvrda (zatvoren)

Ticket participants, ticket attachments, unlink/delete user i email-template unsaved navigation sada koriste zajednički `ConfirmDialog`. Destruktivne akcije nose danger intent, async user akcije pending stanje, a blocker se pravilno nastavlja ili resetuje bez browser prompta. Produkcijski `src/` nema `window.confirm` poziva.

### UI3 — keyboard selection ugovor (zatvoren)

`UnderlineTabs` i `Segmented` sada koriste roving `tabIndex`, jedan aktivni tab stop, horizontalnu orijentaciju te Arrow/Home/End navigaciju sa wrap-around ponašanjem. Keyboard izbor mijenja kontrolisanu vrijednost i premješta fokus, a tab item može eksplicitno navesti `panelId` za `aria-controls`. Behavior test pokriva oba obrasca.

### UI4 — forma

Field render-prop je dobar cilj, ali legacy grana ne može čarobno mutirati proizvoljno dijete; roadmap treba migraciju potrošača, mjeren codemod i privremeni lint/deprecation, ne novu heuristiku sa `cloneElement` bez tipne granice.

### UI5 — domenske zavisnosti (zatvoren)

`ApiErrorText` sada prihvata neutralni tip prevodnog ključa umjesto unije osam domenskih error tipova. `RelativeTime` koristi neutralni date formatter, a Toast strukturno čita opcionalni `requestId` bez zavisnosti od API klase. Čisti `ui/PageHeader` prima već pripremljene crumbove i opcionalni supplement; branding, routing i docs pomoć nalaze se u `components/layout/page-header.tsx`. Ticket `DetailSection` i `PanelErrorBoundary`, zajedno sa ticket loggingom/copyjem, premješteni su u `components/tickets/`.

ESLint override za produkcijski `components/ui` zabranjuje zavisnosti prema drugim component domenima, domenskim `lib` direktorijima, servisima i stranicama. Dozvoljeni ostaju drugi UI primitivi i eksplicitno neutralni `a11y`, `feedback`, `ui`, formatting i `utils` helperi. Puni lint prolazi sa 0 grešaka.

### UI6, UI9–UI15 — održavanje API-ja

Ovi nalazi nisu pojedinačno kritični, ali zajedno šire javnu površinu i dopuštaju divergenciju: četiri tone mape, alias varijante, sentinel, neujednačeni propovi i mrtvi passthrough exporti. UI12 je zatvoren sinhronim queue izvorom i regresijskim testom povratnog ID-a.

### UI7 i UI8 — dokaz ponašanja

UI7 je zatvoren sa 9 UI spec fajlova i 24 testa. Modal testira ime/opis, premještanje i vraćanje fokusa, Escape i close kontrolu; FilterBar testira search callback, povezani collapsible panel, inicijalno aktivne filtere, pristupačni count, reset i označene grupe/kontrole. ConfirmDialog, Toast, oba Field API-ja, Tabs i Segmented zadržavaju svoje behavior/semantičke testove. Statički guard nije zamjena za ove runtime testove.

### UI16 — shim/regresija

**Zatvoren na auditiranom SHA.** Aurora guard nalazi 27 semantičkih token klasa i 0 nepokrivenih utilityja u install toku. Nalaz se mora ponovo otvoriti pri svakoj promjeni `ui/` klase koja se koristi u installu ako guard prijavi prazninu.

### UI17 — novi feedback elementi (zatvoren)

`Warning` je neutralni Pulse primitive sa warning tokenima i eksplicitnim `role="alert"`; test potvrđuje izgovoreni tekst, proslijeđeni test ID i dekorativnu, skrivenu ikonu. `PanelErrorBoundary` je premješten u ticket sloj gdje pripadaju njegov `ticket_panel_failed` event, `ticket-panel-error` identitet i `tickets.*` copy. Njegov test potvrđuje izolaciju, logging i retry bez uklanjanja okolnog ticket shella.

### UI18 — stvarna pokrivenost guardova

`check-pulse-design-system` štiti hardkodirane palete, tokene, radius, i18n i theme-storage ugovor. `check-theme-contrast` mjeri token parove i zabranjene kombinacije teksta. `check-a11y-static` hvata šest statičkih klasa problema, ali ne UI1/UI3/UI8. Zato se roadmap ne smije osloniti samo na zelene guardove; potrebni su komponentni testovi i runtime axe/browser dokaz.

---

## Master tabela UI1–UI18

| UI       | Status          | Dokaz                                                                                                                                             |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI1**  | Zatvoren        | `ModalHeader` montira Radix Title/Description; ConfirmDialog test pokriva name, opis, početni fokus i Escape.                                     |
| **UI2**  | **Zatvoren**    | Svih pet tokova koristi `ConfirmDialog`; produkcijski grep za `window.confirm` vraća 0.                                                           |
| **UI3**  | **Zatvoren**    | Roving fokus, Arrow/Home/End, wrap-around i opcionalni panel link pokriveni behavior testom.                                                      |
| **UI4**  | Djelimično      | Render-prop + 3 testa su ispravni; legacy grana ostaje.                                                                                           |
| **UI5**  | **Zatvoren**    | Domenski adapteri su izvan `ui/`; ESLint zabranjuje component-domain, domain-lib, service i page importe u UI produkcijskom kodu.                 |
| **UI6**  | Otvoren         | Tone mape i Chip remove markup su duplicirani.                                                                                                    |
| **UI7**  | **Zatvoren**    | 9 UI spec fajlova / 24 testa; Modal, ConfirmDialog, Toast, Field, Tabs, Segmented i FilterBar ugovori su pokriveni.                               |
| **UI8**  | **Zatvoren**    | Progress value ugovor, wizard current step, Avatar identity/decorative režim, jedan skeleton naziv i imenovani detail region pokriveni testovima. |
| **UI9**  | Otvoren         | NUL sentinel je i dalje u `page-header.tsx`.                                                                                                      |
| **UI10** | Otvoren         | Default black/white utilityji ostaju; guard je zelen, ali ih ne klasifikuje kao zabranjenu paletu.                                                |
| **UI11** | Otvoren         | Fazni komentari i zastario broj potrošača ostaju.                                                                                                 |
| **UI12** | **Zatvoren**    | Sinhroni `queueRef` osigurava stvarni create/dedup ID i spaja uzastopne pre-commit pozive; behavior test potvrđuje isti ID i `×2`.                |
| **UI13** | Otvoren         | Modal/Sheet/Dropdown passthrough exporti uglavnom nemaju vanjske potrošače.                                                                       |
| **UI14** | Prihvaćen rizik | Aliasi čuvaju kompatibilnost; migracija nije funkcionalni prioritet.                                                                              |
| **UI15** | Otvoren         | Prop i close i18n ugovor ostaju neujednačeni.                                                                                                     |
| **UI16** | Zatvoren        | `check-install-aurora`: 27 klasa, 0 shim praznina; check B takođe zelen.                                                                          |
| **UI17** | **Zatvoren**    | Warning ima testirani alert/dekorativnu ikonu ugovor; ticket boundary je u ticket sloju sa testom izolacije, logginga i retryja.                  |
| **UI18** | Djelimično      | Tri guarda su korisna i zelena, ali ne pokrivaju UI1/UI3/UI8 semantiku.                                                                           |

---

## Roadmap do 10/10

### P0 — a11y i široki API uticaj

1. **UI1:** prebaciti `ModalHeader` na Radix Title/Description i dodati Modal/ConfirmDialog testove za name, description, focus i Escape.
2. **UI4:** izmjeriti i migrirati legacy Field; održavati zatvoreni UI3 behavior testom.
3. Održavati zatvoreni UI8 behavior testovima za Progress, WizardStepper, Avatar, Skeleton i DetailSection.

### P1 — konzistentnost i pouzdanost

4. Održavati zatvoreni UI2: nove potvrde koriste `ConfirmDialog`, bez native browser prompta.
5. Održavati zatvorene **UI7/UI12** behavior ugovore za Modal, ConfirmDialog, Toast, Field, Tabs, Segmented i FilterBar.
6. Održavati zatvorene **UI5/UI17** granice i feedback testove.

### P2 — Pulse ugovor i čišćenje

7. **UI6/UI9–UI15:** objediniti tonove, ukloniti sentinel/mrtve exporte, kanonizovati props/varijante/i18n i očistiti istorijske komentare.
8. **UI10:** zamijeniti black/white utilityje tokenima ili dokumentovati i automatizovati precizan izuzetak.
9. Za svaki PR pokrenuti sva tri Pulse guarda, ui Vitest paket i `check-install-aurora.mjs`.

---

## Ocjena

**9,0/10**

Modul je širi i pouzdaniji nego 2026-10-13: inventar je porastao, Field render-prop je testiran, ConfirmDialog i PanelErrorBoundary imaju osnovne specove, Pulse token/kontrast/a11y guardovi su zeleni, a Aurora shim trenutno nema praznina. Ocjena ipak ne ide više jer UI1 ostaje širok accessible-name propust, UI2 je zatvoren jedinstvenim ConfirmDialog obrascem, ali UI3/UI4 nisu završeni, arhitektonska granica UI5 je i dalje otvorena, a samo 7 testova ne pokriva Modal/Toast/Tabs behavior. Browser/axe dokaz u ovom re-auditu nije izvršen.

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

## Status implementacije (2026-10-18)

- **UI3 i UI8 zatvoreni:** selection kontrole imaju testiranu tastaturu; Progress/WizardStepper izlažu value/current semantiku; Avatar ima identity/decorative ugovor, Skeleton jedan naziv, a DetailSection imenovani region.
- **UI2 zatvoren:** svih pet native potvrda migrirano je na `ConfirmDialog`; produkcijski `window.confirm` grep je 0.
- **UI7 i UI12 zatvoreni:** `toast()` vraća tačan create/dedup ID i prije React commita; Modal i FilterBar sada imaju kompletne behavior testove, uz postojeće ConfirmDialog, Toast, Field, Tabs i Segmented dokaze. UI paket prolazi 9/9 fajlova i 24/24 testa; puni frontend rezultat je 313/313 fajlova i 1299/1299 testova. Build, format i lint bez grešaka su zeleni (12 postojećih lint upozorenja).
- **UI5 zatvoren:** PageHeader aplikacijski adapter je u layout sloju; DetailSection i PanelErrorBoundary su u ticket sloju; ApiErrorText, RelativeTime i Toast više nemaju domenske importe. `no-restricted-imports` čuva `ui/` granicu. Puni frontend ostaje zelen na 313/313 fajlova i 1299/1299 testova; lint ima 0 grešaka i 12 postojećih upozorenja.
- **UI17 zatvoren:** Warning sada ima `role="alert"` i test za tekst, test ID i skrivenu dekorativnu ikonu; ticket boundary ostaje testiran u ticket sloju. Puni frontend prolazi 314/314 fajlova i 1300/1300 testova.
- **UI1 zatvoren:** `ModalHeader` koristi Radix `ModalTitle`/`ModalDescription` uz nepromijenjen javni API i vizuelne klase. `confirm-dialog.spec.tsx` potvrđuje programsko ime, opis, početni fokus i Escape. Browser/axe nije pokrenut; komponentni Radix ugovor je potvrđen u jsdom testu.

## Status re-audita (2026-10-18)

Stara tvrdnja „28 fajlova / 2 speca / ništa nije urađeno“ više nije važeća. Dokument je prepisan prema `origin/master@72fb2f3`; produkcijski kod nije mijenjan.

**Predložena commit poruka:** `docs(audit): rewrite ui components module 12 review`
