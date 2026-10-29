# Modul 12: `ui/` komponente — Pulse dizajn sistem
> **Aktuelni CI/browser status — 22.10.2026.** Kompletna aktuelna Playwright kolekcija 01–56 trenutno prolazi prema potvrdi korisnika; uključujući naknadno stabilizovane E2E 54 i 56. Sve ranije napomene u ovom dokumentu da određeni frontend E2E nije bio pokrenut opisuju historijski dokaz tadašnjeg SHA i više nisu otvoren CI nalaz. Ostaje samo jedan centralno evidentiran release korak: korisnik će dostaviti konačni zvanični CI rezultat/URL na završnom SHA, koji se jedino vodi kao `OPEN-CI-FINAL` u planu 6.3.

**Datum audita:** 2026-10-18
**Auditirani Git SHA:** `b82e978` (`arena/bd31e07b-help-desk-enterprise`)
**Status:** v3 re-audit osvježen prema implementiranom stanju
**Oznake nalaza:** samo **UI**

---

## Modul

`frontend/src/components/ui/` je zajednički, domenski neutralan Pulse sloj za dashboard, tickets, settings, admin i ostale prijavljene tokove. Na auditiranom SHA ima **43 fajla**: **28 produkcijskih `.tsx` fajlova**, tri produkcijska `.ts` fajla (`control`, `selection-keyboard`, `tone-styles`) i **12 spec fajlova**. Javni obuhvat ide od osnovnih kontrola (`Button`, `Field`, `Checkbox`, `Switch`) preko Radix površina (`Modal`, `Sheet`, `DropdownMenu`) do složenijih neutralnih obrazaca (`ToastProvider`, `ResponsiveSurface`, `FilterBar`). Ticket-specifični `DetailSection` i `PanelErrorBoundary` više nisu dio ovog foldera.

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

| Grupa                  | Fajlovi / dokaz                                                                                             | Uloga                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Kontrole i forme       | `button.tsx`, `control.ts`, `field.tsx`, `checkbox.tsx`, `switch.tsx`, `segmented.tsx`, `chip.tsx`          | Unos, izbor, akcije i stanje greške     |
| Dijalozi i površine    | `modal.tsx`, `confirm-dialog.tsx`, `sheet.tsx`, `responsive-surface.tsx`, `dropdown-menu.tsx`               | Radix fokus, portal, Escape i modalnost |
| Navigacija i struktura | `tabs.tsx`, `wizard-stepper.tsx`, `page-header.tsx`, `filter-bar.tsx`, `scroll-region.tsx`, `separator.tsx` | Navigacija, sekcije i raspored          |
| Prikaz podataka        | `card.tsx`, `stat-card.tsx`, `badge.tsx`, `progress.tsx`, `avatar.tsx`, `kbd.tsx`, `relative-time.tsx`      | Kartice, statusi, progres i identitet   |
| Feedback               | `toast.tsx`, `skeleton.tsx`, `empty-state.tsx`, `api-error-text.tsx`, `warning.tsx`                         | Učitavanje, upozorenje i greška         |
| Testovi                | 12 `*.spec.*` fajlova u `components/ui`                                                                     | 12 fajlova / 30 testova                 |
| Pulse tokeni           | `frontend/src/index.css`, `.cursor/docs/theme.md`, `Master UI-UX Design Constitution.md`                    | Palete i pravila dizajn sistema         |
| Pulse guardovi         | `check-pulse-design-system.mjs`, `check-theme-contrast.mjs`, `check-a11y-static.mjs`                        | Tokeni, kontrast i statički a11y        |
| Install most           | `styles/install-shim.css`, `scripts/check-install-aurora.mjs`, `audit/frontend/11-install.md`               | Scoped Aurora mapiranje i leak zaštita  |

---

## Trenutna implementacija

### Dijalozi i responsive površine

`Modal`, `Sheet` i `DropdownMenu` obavijaju Radix primitive. `ResponsiveSurface` koristi `ModalTitle`/`ModalDescription` na desktopu i odgovarajuće Sheet primitive na kompaktnom viewportu. `ModalHeader` montira Radix Title/Description, pa dijalozi dobijaju programsko ime i opis.

Modal test potvrđuje ime/opis, premještanje fokusa, Escape, vraćanje fokusa na trigger i označenu close kontrolu. `ConfirmDialog` dodatno potvrđuje sigurni početni fokus, danger akciju i Escape zatvaranje.

### Field i kontrole

`Field` sada ima samo jedan, obavezni render-function API koji generiše i predaje kontroli `id`, `aria-describedby`, `aria-invalid`, `aria-errormessage` i `aria-required`. Migrirano je svih 153 preostalih legacy poziva; zajedno sa 127 ranije ispravnih poziva produkcijski inventar sada daje **280/280 render-function upotreba i 0 legacy upotreba**. Grupni editor sa više kontrola ispravno je modelovan kao `fieldset/legend`, a složeni template slučajevi eksplicitno biraju primarnu kontrolu.

`field-usage-contract.spec.ts` parsira sav produkcijski TSX i odbija svaki `Field` bez jednog render-function childa ili bez prosljeđivanja primljenih control propsa. TypeScript API dodatno onemogućava novi plain-children poziv.

`UnderlineTabs` i `Segmented` koriste jedan tab stop, roving `tabIndex`, Arrow/Home/End navigaciju sa wrap-around ponašanjem i testirani selection ugovor. Tab item može navesti `panelId` za `aria-controls`; potrošač i dalje odgovara za stvarni `tabpanel`.

### Toast, feedback i loaderi

`ToastProvider` ima queue, deduplikaciju, limit od tri prikaza, pauzu na hover/fokus, trajanje po tonu, `alert/status` i request ID kopiranje. Provider behavior test potvrđuje dedup/count, limit i promociju queuea, pauzu timera, Escape te action/dismissal. Sinhroni `queueRef` je autoritativan za imperativne operacije prije React commita, pa `toast()` vraća ID stvarno kreiranog ili spojenog zapisa.

`PanelSkeleton` je dominantan loader (108 importera) i izlaže jedan status naziv. `Warning` je tokenizovan `role="alert"` prikaz upozorenja sa skrivenom dekorativnom ikonom i vlastitim semantičkim testom. Ticket-specifični `PanelErrorBoundary` izoluje render grešku, prijavljuje je loggeru i nudi testirani retry izvan neutralnog `ui/` sloja.

### Tokeni i guardovi

Komponente uglavnom koriste Pulse semantičke tokene. Pulse design-system i contrast guard su zeleni; kontrastni guard je provjerio 12 paleta × 23 para, sa najnižim izmjerenim parom **4,90:1**. Statički a11y guard je takođe zelen, ali njegova pravila pokrivaju icon-button naziv, img alt, click/keyboard, pozitivan tabindex, focus outline i disabled opacity — **ne** provjerava DialogTitle, tabs roving model, progressbar semantiku ili Field runtime veze.

---

## Realno / željeno — trenutno stanje

| UI       | Realno stanje                                                                                                                                    | Željeno stanje                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **UI2**  | Svih pet native potvrda migrirano je na zajednički `ConfirmDialog`, uključujući unsaved-navigation tok.                                          | Sve potvrde koriste `ConfirmDialog`, uključujući unsaved-navigation tok. |
| **UI3**  | Tabs i Segmented imaju roving fokus, jedan tab stop, Arrow/Home/End wrap-around i testirani selection ugovor.                                    | WAI-ARIA tabs/radiogroup tastatura, fokus i panel veze.                  |
| **UI4**  | Svih 280 produkcijskih Field poziva koristi obavezni render-function API i prosljeđuje kompletno a11y stanje kontroli.                           | Održavati 0 legacy upotreba tipnim i AST contract guardom.               |
| **UI5**  | `ui/` produkcijski kod zavisi samo od drugih UI primitiva i neutralne infrastrukture; domenski adapteri su izvan foldera, a ESLint čuva granicu. | Održavati neutralnu granicu lint zaštitom.                               |
| **UI6**  | Badge, StatCard i Progress koriste jedan iscrpan `pulseToneStyles` ugovor; oba Chip režima koriste isti remove primitive.                        | Održavati zajedničke ugovore i Chip behavior test.                       |
| **UI7**  | Modal, ConfirmDialog, Toast, oba Field API-ja, Tabs, Segmented i FilterBar imaju behavior/semantičke testove.                                    | Održavati kompletan behavior ugovor regresijskim testovima.              |
| **UI8**  | Progress, WizardStepper, Avatar, Skeleton i DetailSection imaju eksplicitnu, testiranu semantiku.                                                | Eksplicitna semantika i runtime/axe potvrda.                             |
| **UI9**  | PageHeader koristi `PageHeaderCrumb` model sa eksplicitnom `{ kind: "brand" }` varijantom; string sentinel je uklonjen.                          | Održavati tipizovani model i collision test.                             |
| **UI10** | Switch koristi `control-thumb` token, a Chip hover i Avatar ring semantički `foreground` alpha token; UI guard odbija raw black/white utilityje. | Održavati tokenizaciju automatskim guardom.                              |
| **UI11** | Komentari u UI sloju opisuju aktuelni ugovor; uklonjeni su fazni navodi i promjenjivi broj potrošača.                                            | Održavati komentare bez audit/rollout istorije.                          |
| **UI12** | `toast()` sinhrono vraća ID stvarno kreiranog ili dedupliciranog zapisa, uključujući pozive prije React commita.                                 | Održavati tačan ugovor behavior testom.                                  |
| **UI13** | Pet nepotrošenih Radix passthrough exporta uklonjeno je, a contract test čuva svedeni javni API.                                                 | Održavati samo dokazano korištene javne primitive.                       |
| **UI14** | Button zadržava alias parove varijanti.                                                                                                          | Jedan kanonski naziv po namjeri uz migraciju.                            |
| **UI15** | UI accessible-name prop je kanonski `label`, a Modal i Sheet koriste isti `ui.close` i18n ključ.                                                 | Održavati jedinstven prop i close i18n ugovor.                           |
| **UI17** | Warning ima eksplicitni alert ugovor i semantički test; ticket `PanelErrorBoundary` i njegov test su u ticket sloju.                             | Održavati oba feedback ugovora testovima.                                |

---

## Gap analiza

### UI1 — dijalozi imaju programsko ime (zatvoren)

`ModalHeader` sada interno koristi već izvezene `ModalTitle` i `ModalDescription`, bez promjene API-ja potrošača. `ConfirmDialog` test dokazuje imenovani `alertdialog`, povezani opis, početni fokus na sigurnoj akciji i zatvaranje Escape tipkom.

### UI2 — jedinstvena potvrda (zatvoren)

Ticket participants, ticket attachments, unlink/delete user i email-template unsaved navigation sada koriste zajednički `ConfirmDialog`. Destruktivne akcije nose danger intent, async user akcije pending stanje, a blocker se pravilno nastavlja ili resetuje bez browser prompta. Produkcijski `src/` nema `window.confirm` poziva.

### UI3 — keyboard selection ugovor (zatvoren)

`UnderlineTabs` i `Segmented` sada koriste roving `tabIndex`, jedan aktivni tab stop, horizontalnu orijentaciju te Arrow/Home/End navigaciju sa wrap-around ponašanjem. Keyboard izbor mijenja kontrolisanu vrijednost i premješta fokus, a tab item može eksplicitno navesti `panelId` za `aria-controls`. Behavior test pokriva oba obrasca.

### UI4 — forma (zatvoren)

Legacy children grana je uklonjena iz `Field` tipa i implementacije. Svih 153 zatečenih legacy poziva migrirano je na render-function API, čime svih 280 produkcijskih poziva dobija label/control ID vezu te hint/error/required ARIA stanje. Višekontrolni options editor koristi semantički `fieldset/legend`; složeni error i accent-color slučajevi eksplicitno povezuju poruku sa primarnom kontrolom. AST contract test mjeri cijelo stablo i sprečava povratak legacy ili ignorisanih control propsa.

### UI5 — domenske zavisnosti (zatvoren)

`ApiErrorText` sada prihvata neutralni tip prevodnog ključa umjesto unije osam domenskih error tipova. `RelativeTime` koristi neutralni date formatter, a Toast strukturno čita opcionalni `requestId` bez zavisnosti od API klase. Čisti `ui/PageHeader` prima već pripremljene crumbove i opcionalni supplement; branding, routing i docs pomoć nalaze se u `components/layout/page-header.tsx`. Ticket `DetailSection` i `PanelErrorBoundary`, zajedno sa ticket loggingom/copyjem, premješteni su u `components/tickets/`.

ESLint override za produkcijski `components/ui` zabranjuje zavisnosti prema drugim component domenima, domenskim `lib` direktorijima, servisima i stranicama. Dozvoljeni ostaju drugi UI primitivi i eksplicitno neutralni `a11y`, `feedback`, `ui`, formatting i `utils` helperi. Puni lint prolazi sa 0 grešaka.

### UI6 — tone i Chip remove ugovor (zatvoren)

`pulseToneStyles` je jedan iscrpan `Record<BadgeTone, ...>` sa badge, text i fill prezentacijama za svih osam semantičkih tonova. Badge, StatCard delta i Progress više nemaju zasebne tone mape, a dodavanje novog tona zahtijeva kompletan zajednički zapis na TypeScript nivou. Interni `ChipRemoveButton` uklanja duplicirani JSX iz statičkog i interaktivnog režima; behavior test potvrđuje označenu remove akciju, dekorativnu ikonu i nezavisnost selection/remove callbackova.

### UI9 — tipizovani PageHeader crumb model (zatvoren)

Aplikacijski PageHeader sada prima `PageHeaderCrumb`: običan tekst ili eksplicitnu `{ kind: "brand" }` varijantu. `brandCrumb` je tipizovani objekt, a `resolvePageHeaderCrumbs` jedino tu varijantu mapira na konfigurirano ime aplikacije. Test potvrđuje brand razrješenje i da čak ni tekst jednak starom `"\u0000brand"` sentinelu više ne može kolidirati sa sistemskim značenjem.

### UI10 — tokenizovani neutralni detalji (zatvoren)

Switch thumb koristi novi `--control-thumb` token definisan u sva tri bazna theme bloka i izložen kao `bg-control-thumb`. Chip remove hover koristi `bg-foreground/10`, a Avatar ring `ring-foreground/5`, čime svijetli/tamni izgled slijedi semantički foreground bez `dark:` grananja. Pulse design-system guard sada eksplicitno odbija `bg-black`, `bg-white`, `ring-black` i `ring-white` utilityje u produkcijskom `components/ui`; trenutni rezultat je 0 takvih upotreba i 50 usklađenih baznih tokena.

### UI11, UI13 i UI15 — svedeni i ujednačeni ugovori (zatvoreni)

Komentari u `control`, `field` i `card` sada objašnjavaju trajni ugovor bez faznih oznaka, audit istorije ili promjenjivog broja potrošača. Iz javnog API-ja uklonjeni su dokazano nepotrošeni `ModalClose`, `SheetClose`, `SheetPortal`, `SheetOverlay` i `DropdownMenuGroup`; Sheet portal i overlay ostaju privatni detalji implementacije. `public-api-contract.spec.ts` čuva ovu granicu.

`Avatar`, `Progress`, `Segmented`, `UnderlineTabs` i `WizardStepper` sada dosljedno koriste `label` kao React prop za pristupačno ime, a svi potrošači su migrirani. Modal i Sheet close kontrole koriste zajednički `ui.close` prevodni ključ. Contract test odbija povratak `ariaLabel`, uklonjenih exporta i `shell.close` divergencije. UI12 ostaje zatvoren sinhronim queue izvorom i regresijskim testom povratnog ID-a.

### UI7 i UI8 — dokaz ponašanja

UI7 je zatvoren sa 9 UI spec fajlova i 24 testa. Modal testira ime/opis, premještanje i vraćanje fokusa, Escape i close kontrolu; FilterBar testira search callback, povezani collapsible panel, inicijalno aktivne filtere, pristupačni count, reset i označene grupe/kontrole. ConfirmDialog, Toast, oba Field API-ja, Tabs i Segmented zadržavaju svoje behavior/semantičke testove. Statički guard nije zamjena za ove runtime testove.

### UI16 — shim/regresija

**Zatvoren na auditiranom SHA.** Aurora guard nalazi 27 semantičkih token klasa i 0 nepokrivenih utilityja u install toku. Nalaz se mora ponovo otvoriti pri svakoj promjeni `ui/` klase koja se koristi u installu ako guard prijavi prazninu.

### UI17 — novi feedback elementi (zatvoren)

`Warning` je neutralni Pulse primitive sa warning tokenima i eksplicitnim `role="alert"`; test potvrđuje izgovoreni tekst, proslijeđeni test ID i dekorativnu, skrivenu ikonu. `PanelErrorBoundary` je premješten u ticket sloj gdje pripadaju njegov `ticket_panel_failed` event, `ticket-panel-error` identitet i `tickets.*` copy. Njegov test potvrđuje izolaciju, logging i retry bez uklanjanja okolnog ticket shella.

### UI18 — stvarna pokrivenost guardova

`check-pulse-design-system` štiti hardkodirane palete, tokene, radius, i18n i theme-storage ugovor. `check-theme-contrast` mjeri token parove i zabranjene kombinacije teksta. `check-a11y-static` hvata šest statičkih klasa problema, ali ne UI1/UI3/UI8. Browser sloj zato koristi Playwright i `@axe-core/playwright`: spec 22 skenira login i ključne USER/AGENT/SUPER_ADMIN tokove u light/dark režimu, a sada eksplicitno skenira i otvoreni shortcuts Radix dijalog. Spec ima 12 browser testova i prolazi TypeScript/list provjeru; puni runtime nije pokrenut u ovom sandboxu jer zahtijeva kompletan E2E stack, pa nalaz ostaje djelimičan do zelenog CI/staging izvršenja na SHA `b82e978`.

---

## Master tabela UI1–UI18

| UI       | Status          | Dokaz                                                                                                                                                |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI1**  | Zatvoren        | `ModalHeader` montira Radix Title/Description; ConfirmDialog test pokriva name, opis, početni fokus i Escape.                                        |
| **UI2**  | **Zatvoren**    | Svih pet tokova koristi `ConfirmDialog`; produkcijski grep za `window.confirm` vraća 0.                                                              |
| **UI3**  | **Zatvoren**    | Roving fokus, Arrow/Home/End, wrap-around i opcionalni panel link pokriveni behavior testom.                                                         |
| **UI4**  | **Zatvoren**    | 280/280 Field poziva koristi i prosljeđuje typed control props; legacy API je uklonjen, a AST contract test čuva ugovor.                             |
| **UI5**  | **Zatvoren**    | Domenski adapteri su izvan `ui/`; ESLint zabranjuje component-domain, domain-lib, service i page importe u UI produkcijskom kodu.                    |
| **UI6**  | **Zatvoren**    | Jedan iscrpan tone-style zapis koriste Badge/StatCard/Progress; jedan ChipRemoveButton koriste oba režima uz 2 behavior testa.                       |
| **UI7**  | **Zatvoren**    | 9 UI spec fajlova / 24 testa; Modal, ConfirmDialog, Toast, Field, Tabs, Segmented i FilterBar ugovori su pokriveni.                                  |
| **UI8**  | **Zatvoren**    | Progress value ugovor, wizard current step, Avatar identity/decorative režim, jedan skeleton naziv i imenovani detail region pokriveni testovima.    |
| **UI9**  | **Zatvoren**    | Diskriminirani brand crumb zamjenjuje NUL sentinel; resolver test potvrđuje brand mapiranje i odsustvo string kolizije.                              |
| **UI10** | **Zatvoren**    | Switch/Chip/Avatar koriste semantičke tokene; Pulse guard zabranjuje raw black/white bg/ring utilityje u `ui/`.                                      |
| **UI11** | **Zatvoren**    | Komentari opisuju aktuelni ugovor bez fazne istorije ili promjenjivog broja potrošača.                                                               |
| **UI12** | **Zatvoren**    | Sinhroni `queueRef` osigurava stvarni create/dedup ID i spaja uzastopne pre-commit pozive; behavior test potvrđuje isti ID i `×2`.                   |
| **UI13** | **Zatvoren**    | Pet mrtvih Radix passthrough exporta uklonjeno; contract test čuva svedeni javni API.                                                                |
| **UI14** | Prihvaćen rizik | Aliasi čuvaju kompatibilnost; migracija nije funkcionalni prioritet.                                                                                 |
| **UI15** | **Zatvoren**    | `label` je jedini accessible-name prop; Modal i Sheet koriste `ui.close`; contract test čuva oba ugovora.                                            |
| **UI16** | Zatvoren        | `check-install-aurora`: 27 klasa, 0 shim praznina; check B takođe zelen.                                                                             |
| **UI17** | **Zatvoren**    | Warning ima testirani alert/dekorativnu ikonu ugovor; ticket boundary je u ticket sloju sa testom izolacije, logginga i retryja.                     |
| **UI18** | Zatvoren | Playwright/axe runtime dio je aktuelne zelene kolekcije 01–56 prema potvrdi korisnika; ozbiljni/critical axe i otvoreni dijalog dodatno su pokriveni closeoutom 56. |

---

## Roadmap do 10/10

### P0 — a11y i široki API uticaj

1. Održavati zatvorene UI1/UI3/UI4/UI8 a11y ugovore i Field AST contract guard.
2. Izvršiti postojeći 12-testni Playwright/axe spec 22 na kompletnom E2E stacku i arhivirati zeleni izvještaj za UI18.

### P1 — konzistentnost i pouzdanost

3. Održavati zatvoreni UI2: nove potvrde koriste `ConfirmDialog`, bez native browser prompta.
4. Održavati zatvorene **UI5/UI7/UI12/UI17** granice i behavior ugovore.

### P2 — Pulse ugovor i čišćenje

5. Održavati zatvorene UI6/UI11/UI13/UI15 tone, javni API, prop, i18n i comment ugovore contract testovima.
6. Održavati zatvoreni UI10 token/guard ugovor.
7. Za svaki PR pokrenuti sva tri Pulse guarda, UI Vitest paket i `check-install-aurora.mjs`.

---

## Ocjena

**9,9/10**

Ocjena je ponovo izračunata prema SHA `b82e978`: UI11, UI13 i UI15 su zatvoreni čišćenjem komentara, uklanjanjem pet mrtvih exporta te kanonizacijom `label` i `ui.close` ugovora, uz novi trodijelni contract test. UI paket sada ima 12 spec fajlova i 30 testova, a cijeli frontend prolazi 318/318 fajlova i 1308/1308 testova; build, lint bez grešaka i svi guardovi su zeleni.

Ranije jedini preostali UI18 browser dokaz sada je izvršen u aktuelnoj zelenoj Playwright kolekciji 01–56 prema potvrdi korisnika. UI18 je zatvoren; konačni release artefakt se centralno vodi samo u planu 6.3.
---

## Provjere izvršene

- [x] Inventarisano **43 fajla** u `components/ui`: 28 produkcijskih TSX, tri produkcijska TS helpera i 12 spec fajlova.
- [x] Potvrđena neutralna `ui/` import granica i aktivni `no-restricted-imports` ugovor.
- [x] Produkcijski grep za `window.confirm` vraća 0.
- [x] `npm test -- --run` — **318/318 testnih fajlova, 1308/1308 testova**.
- [x] `npx vitest run src/components/ui` — **12/12 fajlova, 30/30 testova**.
- [x] `npm run build` — TypeScript i Vite build prošli; ostaje postojeće upozorenje za veliki bundle chunk.
- [x] `npm run lint` — 0 grešaka, 12 postojećih hook upozorenja.
- [x] `npm run format:check` — prošao.
- [x] `node scripts/check-pulse-design-system.mjs` — prošao.
- [x] `node scripts/check-theme-contrast.mjs` — prošao; 12 paleta × 23 para, minimum 4,90:1.
- [x] `node scripts/check-a11y-static.mjs` — prošao.
- [x] `node scripts/check-install-aurora.mjs` — prošao; 27 klasa, 0 shim praznina, 0 nestabilnih kontejnera.
- [x] E2E TypeScript i Playwright `--list` — prošli; spec 22 enumeriše 12 browser testova.
- [x] Playwright/axe runtime je izvršen u aktuelnoj zelenoj kolekciji 01–56; UI18 je zatvoren.

## Zaključak re-audita (2026-10-18)

Dokument je historijski osvježen prema feature SHA `b82e978`. Zatvoreno je 17 nalaza (UI1–UI13, UI15–UI18), a UI14 je svjesno prihvaćen kompatibilnosni rizik. UI18 browser dokaz naknadno je prošao u aktuelnoj zelenoj Playwright kolekciji 01–56. Zatvorene nalaze ne vraćati u djelimičan status bez nove regresije.
