# Modul 12: `ui/` komponente (dizajn sistem)

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, grep, provjera Radix izvora). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **UI** (ui komponente).

Provjere izvršene u sandboxu:
- **Čitanje u cijelosti:** `button.tsx`, `modal.tsx`, `confirm-dialog.tsx`, `control.ts`, `toast.tsx`, `field.tsx`, `responsive-surface.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `tabs.tsx`, `wizard-stepper.tsx`, `segmented.tsx`, `checkbox.tsx`, `switch.tsx`, `api-error-text.tsx`, `relative-time.tsx`, `page-header.tsx`, `empty-state.tsx`, `skeleton.tsx`, `filter-bar.tsx`, `chip.tsx`, `badge.tsx`, `stat-card.tsx` (početak), `progress.tsx`, `scroll-region.tsx` (početak), `card.tsx`, `avatar.tsx`, `kbd.tsx`, `separator.tsx`, `detail-section.tsx`.
- **Nije čitano u cijelosti:** `stat-card.tsx` (kraj, 25 linija), `scroll-region.tsx` (kraj, render), `control.ts` je čitan u cijelosti. Ništa od ovoga ne mijenja nalaze.
- **Radix izvor:** `node_modules/@radix-ui/react-dialog` v1.1.23. `aria-labelledby` se postavlja samo kad je `DialogTitle` montiran (`titlePresent`).
- **Grep:** pozivi `window.confirm`, `<ConfirmDialog` (28 fajlova), `<ModalHeader` (15 pojava u 14 fajlova), `<ModalTitle` (9 pojava), `<Progress` (7), `role="progressbar"` (0), `animate-pulse` (3 fajla), `PanelSkeleton` (97 fajlova), `components/ui/control` (216 fajlova), `components/ui/button` (261 fajl), `<button` van `ui/` (80), importi iz `lib/` unutar `ui/` (17 različitih putanja), boje u `ui/` (`bg-white`, `bg-black`, `dark:*-white`).
- **Testovi:** `components/ui/` ima 2 spec fajla (`badge.spec.tsx`, `field.spec.ts`) za 28 komponenti.
- **Nekorišteni exporti** (izvan svog fajla): `ModalTrigger`, `ModalClose`, `SheetTrigger`, `SheetClose`, `SheetPortal`, `SheetOverlay`, `DropdownMenuGroup`.
- **Heuristika Field-a:** grep nalazi ~281 otvorenih `<Field` tagova i ~118 pogodaka za render-funkciju. Ovo je gruba procjena, ne tačan broj.

---

## Modul

`components/ui/` je dizajn sistem aplikacije: 28 fajlova koji obavijaju Radix primitive, cva varijante i tokene teme (`index.css`). Sve ostale oblasti (tickets, admin, install, status…) koriste ove komponente. Modul obuhvata i `control.ts`, zajedničke klase za kontrole, koje se importuju u 216 fajlova.

---

## Povezani fajlovi i folderi

| Grupa | Fajlovi | Uloga |
|---|---|---|
| Osnovne kontrole | `button.tsx` (78), `control.ts` (68), `field.tsx` (149), `checkbox.tsx` (95), `switch.tsx` (29), `segmented.tsx` (65), `chip.tsx` (88) | Dugmad, polja, izbor |
| Dijalozi i paneli | `modal.tsx` (62), `confirm-dialog.tsx` (67), `sheet.tsx` (76), `responsive-surface.tsx` (96), `dropdown-menu.tsx` (71) | Overlay površine |
| Navigacija i struktura | `tabs.tsx` (72), `wizard-stepper.tsx` (77), `page-header.tsx` (62), `detail-section.tsx` (138), `filter-bar.tsx` (116), `scroll-region.tsx` (62), `separator.tsx` (22) | Raspored i navigacija |
| Prikaz podataka | `card.tsx` (63), `stat-card.tsx` (64), `badge.tsx` (84), `progress.tsx` (44), `avatar.tsx` (55), `kbd.tsx` (9), `relative-time.tsx` (23) | Kartice, oznake, vrijeme |
| Povratne informacije | `toast.tsx` (266), `skeleton.tsx` (30), `empty-state.tsx` (24), `api-error-text.tsx` (37) | Greške, učitavanje, prazno stanje |
| Testovi | `badge.spec.tsx`, `field.spec.ts` | 2 od 28 |

---

## Trenutna implementacija

**Osnova.** Komponente obavijaju Radix primitive (`dialog`, `dropdown-menu`, `switch`, `separator`, `slot`). Varijante dugmeta i badge-a su `cva` ili mape tonova. Boje dolaze isključivo iz tokena (`bg-surface`, `text-danger`, `border-border`…), a komentari u `button.tsx` i `control.ts` objašnjavaju kontrast za svaku temu.

**Dijalozi.** Tri obrasca: `Modal` + `ModalContent` + `ModalHeader` (ručni naslov), `ConfirmDialog` (potvrda sa `intent: danger`), `ResponsiveSurface` (Sheet na mobilnom, Modal na desktopu, sa `ModalTitle`). Dijalog ima `role="alertdialog"` u `ConfirmDialog`.

**Field.** Dva oblika: „legacy“ (`<label>` omotava kontrolu, hint i grešku) i render-funkcija (`children(control)` dobija `id`, `aria-describedby`, `aria-invalid`, `aria-errormessage`, `aria-required`).

**Toast.** `ToastProvider` drži red u `toast-queue` (lib), spaja identične poruke (×N), prikazuje najviše tri, pauzira tajmer pri hoveru i fokusu, greške ostaju 10 s i nose kopirajući request ID. `role="alert"` za `warning`/`danger`, inače `role="status"`. Hook `useToast` baca grešku van providera. Koristi se u 69 fajlova.

**Loaderi.** `PanelSkeleton` (role=status, skelet layouta, ne spinner) koristi se u 97 fajlova. `animate-pulse` se pojavljuje samo u 3 fajla, pa je obrazac uglavnom konzistentan.

**Filteri.** `FilterBar` sa pretragom i sklopivim „Napredna pretraga“ panelom koji se sam otvara kad su filteri primijenjeni. Broj aktivnih filtera se čita preko `sr-only` teksta.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Naziv dijaloga | `ModalHeader` renderuje `h2` bez Radix `Title`, pa dijalog nema accessible name (UI1) | Svi dijalozi imaju `DialogTitle` i `DialogDescription` |
| Potvrda brisanja | `ConfirmDialog` je „jedina potvrdna površina“, ali 6 mjesta koristi `window.confirm` (UI2) | Jedan obrazac za potvrdu |
| Tabovi i izbor | `role="tab"` i `role="radio"` bez strelica i roving tabindex (UI3) | Pun WAI-ARIA obrazac |
| Polje forme | Legacy oblik nema `aria-invalid` ni vezu sa greškom (UI4) | Oba oblika povezuju hint i grešku |
| Zavisnosti `ui/` | `ui/` importuje tipove grešaka iz 7 domena, router-zavisne `DocsHelpButton` i branding (UI5) | `ui/` ne zna za domen; mapiranje grešaka i stranice u `features` |
| Tonovi | Tri kopije iste mape tonova (UI6) | Jedan izvor |
| Testovi | 2 spec fajla za 28 komponenti (UI7) | Testovi za dijaloge, toast, tabove, potvrdu, polje, filtere |

---

## Gap analiza

1. **Dijalozi bez imena (UI1).** `ModalHeader` renderuje `<h2>` i `<p>`, ali ne koristi `ModalTitle` / `ModalDescription`. Radix 1.1.23 postavlja `aria-labelledby` samo kad je `Title` montiran, pa dijalog nema accessible name, a opis nije povezan sa dijalogom. Pogođeno je 14 fajlova, uključujući `ConfirmDialog` (28 upotreba), `mfa-code-dialog`, `incident-form-dialog`, `on-call-schedule-dialog`, `announcement-editor-dialog`. Čitač ekrana najavljuje „dijalog“ bez naziva. Popravka je mala: `ModalHeader` treba da koristi `ModalTitle` i `ModalDescription`. Ovo je i najveći omjer uticaja i napora u cijelom modulu.
2. **Dvije konvencije potvrde (UI2).** Komentar `ConfirmDialog` kaže „the one confirmation surface for the application“. Realno: `window.confirm` u `asset-contracts-panel.tsx` (489), `asset-licenses-panel.tsx` (577), `ticket-attachments-panel.tsx` (119), `ticket-participants-panel.tsx` (93), `user-admin-actions.tsx` (63 i 87). Native prompt nije stilizovan, ne poštuje temu, ne može da prikaže `danger` intent i nije testabilan kroz `data-testid`. Brisanje ugovora, licence i priloga ide kroz taj tok.
3. **Tabovi i radio grupe bez tastature (UI3).** `UnderlineTabs` (`role="tablist"`, `role="tab"`) i `Segmented` (`role="radiogroup"`, `role="radio"`) nemaju ARIA strelice ni roving tabindex: svaki tab je zaseban Tab stop. Nema `aria-controls` ni `role="tabpanel"`, pa tab nije povezan sa sadržajem. Ovo je očekivano za WAI-ARIA tabs/radiogroup obrazac, a ovdje nije implementirano.
4. **Dva oblika Field-a (UI4).** Legacy `Field` stavlja hint i grešku unutar `<label>`, pa je ime labele dugo (naziv + hint + greška), a greška nije povezana sa kontrolom (nema `aria-invalid`, `aria-describedby`, `aria-errormessage`). Render-funkcija to radi ispravno. Pošto je legacy oblik dominantan (gruba procjena: većina od ~281 upotreba), većina formi ne prijavlja greške čitaču ekrana. Dodatno, `FilterField` ima drugačiji stil labele (12px, muted) od `Field` (12.5px, foreground) i `labelClassName`.
5. **Zavisnosti `ui/` od domena (UI5).** `api-error-text.tsx` uvozi `ApiErrorKey`, `TicketErrorKey`, `KnowledgeArticleErrorKey`, `RoutingErrorKey`, `ServiceCategoryErrorKey`, `GroupsErrorKey`, `RbacErrorKey`, `UsersErrorKey` iz 7 domena. Svaki novi modul širi union u `ui/`. `relative-time.tsx` i `detail-section.tsx` uvoze iz `lib/tickets`. `page-header.tsx` uvozi `useBranding`, `docsTargetForPath` i renderuje `DocsHelpButton` iz `components/docs`, pa osnovni naslov ekrana zavisi od router-a, brendiranja i dokumentacije. Ovo ruši pravilo da je `ui/` izolovan sloj i stvara rizik cirkularnih zavisnosti.
6. **Duplirane mape tonova (UI6).** `BADGE_TONES` (badge), `STAT_DELTA_TONES` (stat-card) i `PROGRESS_TONES` (progress) imaju iste osam tonova sa različitim klasama za istu semantiku (`hold`, `info`, `success`…). Pri dodavanju tona treba mijenjati tri fajla. `Chip` ima dvije grane sa identičnim JSX-om za dugme „ukloni“.
7. **Testovi (UI7).** Dva spec fajla za 28 komponenti. Nema testova za `Modal`/`ConfirmDialog` (fokus, Escape, naziv), `ToastProvider` (spajanje, pauza, tajmer, Escape), `UnderlineTabs`, `Segmented`, `FilterBar` (sklapanje, brojač), `Field` (render-funkcija i legacy oblik), `ScrollRegion`, `Checkbox` (indeterminate). Toast je najsloženija komponenta i nema test u `ui/`.
8. **Manje pristupačnosti (UI8).** `Progress` nema `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max` (0 pojava u repou, 7 upotreba). `Avatar` ima samo `title` i inicijale (`JK`), pa čitač čita inicijale, a ne ime. `DetailSection` naslov je `<span>`, pa sekcije nisu dostupne kroz navigaciju po naslovima. `WizardStepper` nema `aria-current="step"` na aktivnom koraku. `PanelSkeleton` ima i `aria-label` i `sr-only` tekst (dupli naziv za čitač).
9. **Magični sentinel u PageHeader-u (UI9).** `brandCrumb = "\u0000brand"` je string sa nultim bajtom koji se mijenja u `appName` u renderu. Bolje je tipizovati crumb (`{ kind: "brand" } | string`).
10. **Hardkodirane boje (UI10).** `switch.tsx` koristi `bg-white` za thumb. `chip.tsx` koristi `hover:bg-black/10 dark:hover:bg-white/10` u dvije grane. Komentari u `button.tsx` i `control.ts` tvrde da su sve boje iz tokena, pa je to protivrječje (mali obim).
11. **Zastarjeli i interni komentari (UI11).** `control.ts` kaže „imported by 103 files“, a stvarno je 216. Komentari sadrže oznake plana i revizija: „Paket 5.3.0 (D2)“, „Paket 5.3.4 (D5)“, „Paket 4.1“, „Paket 2.8 §3.1/§3.2/§3.3“, „Faza 3 (d)“, „Constitution §32“, „Run 2026-10-05: axe reported…“ u `button.tsx`. Ovo je istorija, a ne objašnjenje zašto.
12. **Latentni bug u `toast()` (UI12).** `ToastProvider.toast` postavlja `resolvedId` unutar `setQueue` updatera, a `return resolvedId` se izvrši prije nego što React pozove updater (lazy). Vraćeni id je kandidat, ne spojeni id kad je poruka identična. Trenutno nijedan poziv ne koristi povratnu vrijednost (provjereno grep-om), pa nema vidljivog efekta, ali povratna vrijednost je netačna.
13. **Nekorišteni exporti (UI13).** `ModalTrigger`, `ModalClose`, `SheetTrigger`, `SheetClose`, `SheetPortal`, `SheetOverlay`, `DropdownMenuGroup` su izvezeni, a nigdje se ne koriste. Ovo je shadcn šablon, pa nije kritično, ali povećava površinu API-ja.
14. **Dupli API za varijante dugmeta (UI14).** `default`/`primary`, `destructive`/`danger`, `secondary`/`subtle` su aliasi sa istim stilom. Nije jasno koji treba koristiti.
15. **Nedosljedni nazivi (UI15).** `ariaLabel` (Tabs, Segmented) i `label` (FilterBar, ScrollRegion, ConfirmDialog) za istu namjenu. Dvije i18n putanje za isti akcija: `ui.close` (modal) i `shell.close` (sheet).

**Što je dobro:**
- Tokeni i komentari o kontrastu po temi, pa se stil mijenja na jednom mjestu.
- `ConfirmDialog` sa `intent: "danger"` i `data-testid` na dugmadima.
- `ResponsiveSurface` koristi Radix i na mobilnom i na desktopu, pa se fokus i Escape dobijaju iz primitiva.
- `Toast`: `aria-live` po težini, red sa spajanjem, pauza pri fokusu i hoveru, Escape, kopiranje request ID-a.
- `Field` render-funkcija ispravno povezuje aria atribute.
- `DetailSection` ima `aria-expanded` i `aria-controls`.
- `ScrollRegion` dodaje tab stop samo kad je sadržaj zaista skrolabilan (ResizeObserver i MutationObserver se čiste).
- `FilterBar` otvara napredne filtere kad su aktivni, pa se filter koji sužava listu nikad ne sakrije bez brojača.
- `PanelSkeleton` kao jedinstven loader u 97 fajlova.

---

## Mišljenje tima i preporuka

Dizajn sistem je najzreliji dio frontenda do sada: tokeni, Radix primitive, jasan API i dobri komentari o kontrastu. Problemi su u tri grupe. Prva je pristupačnost koja utiče na svaki dijalog (UI1) i na svaku formu sa greškom (UI4), pa je to prioritet. Druga je konzistentnost: `window.confirm` i dvije forme Field-a. Treća je arhitektura: `ui/` ne bi smio da zna za domene, branding i dokumentaciju.

Preporuka redom:
1. UI1 (naslov dijaloga): mala izmjena, veliki efekat, jedan fajl.
2. UI2: zamijeniti 6 `window.confirm` poziva sa `ConfirmDialog`.
3. UI4: legacy `Field` da koristi iste aria atribute kao render-funkcija (ili da se migrira na render-funkciju).
4. UI3: strelice i roving tabindex za `UnderlineTabs` i `Segmented`.
5. UI5: `ui/` bez domenskih importa. Tipove grešaka dobijati kao `string` ključ, a `PageHeader` da dobija `helpSlot` i `brandName` kao props umjesto da ih sam čita.
6. UI7: testovi za dijalog, potvrdu, toast, tabove, Field.
7. Lint pravilo (`no-restricted-imports`) koje zabranjuje `ui/` da importuje iz `lib/<domen>/` i `components/<domen>/`.

---

## Bugovi i neusklađenosti

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| UI1 | Visoka (a11y) | `ModalHeader` ne koristi `ModalTitle`/`ModalDescription`: dijalog nema accessible name ni opis. Pogođeno 14 fajlova, uključujući `ConfirmDialog`. | `components/ui/modal.tsx` (`ModalHeader`), `components/ui/confirm-dialog.tsx` |
| UI2 | Srednja | `window.confirm` na 6 mjesta, uprkos tvrdnji da je `ConfirmDialog` jedina potvrda. | `asset-contracts-panel.tsx:489`, `asset-licenses-panel.tsx:577`, `ticket-attachments-panel.tsx:119`, `ticket-participants-panel.tsx:93`, `user-admin-actions.tsx:63,87` |
| UI3 | Srednja (a11y) | `UnderlineTabs` i `Segmented` nemaju strelice ni roving tabindex; nema `aria-controls`/tabpanel. | `components/ui/tabs.tsx`, `components/ui/segmented.tsx` |
| UI4 | Srednja (a11y) | Legacy `Field`: greška i hint unutar `<label>`, bez `aria-invalid` i `aria-describedby`. Dominantan oblik. | `components/ui/field.tsx` (legacy grana) |
| UI5 | Srednja (arhitektura) | `ui/` importuje tipove iz 8 domena i `branding-store`, `docs-slug`, `DocsHelpButton`. | `api-error-text.tsx`, `relative-time.tsx`, `detail-section.tsx`, `page-header.tsx` |
| UI6 | Niska | Tri mape tonova sa istim tonovima. `Chip` duplira JSX „ukloni“. | `badge.tsx`, `stat-card.tsx`, `progress.tsx`, `chip.tsx` |
| UI7 | Srednja (testovi) | 2 spec fajla za 28 komponenti. Nema testova za Modal, Toast, Tabs, Segmented, FilterBar, Field (legacy). | `components/ui/**/*.spec.*` |
| UI8 | Niska (a11y) | `Progress` bez `role="progressbar"`; `Avatar` bez imena; `DetailSection` naslov nije heading; `WizardStepper` bez `aria-current`; `PanelSkeleton` dupli naziv. | `progress.tsx`, `avatar.tsx`, `detail-section.tsx`, `wizard-stepper.tsx`, `skeleton.tsx` |
| UI9 | Niska | `brandCrumb = "\u0000brand"` magični sentinel. | `components/ui/page-header.tsx` |
| UI10 | Niska | `bg-white` na Switch thumb, `bg-black/10` i `dark:bg-white/10` na Chip-u. Protivrječi komentaru o tokenima. | `switch.tsx`, `chip.tsx` |
| UI11 | Niska | Netačan broj fajlova u `control.ts` („103“, stvarno 216). Oznake plana i revizija u komentarima. | `control.ts`, `button.tsx`, `page-header.tsx`, `toast.tsx`, `responsive-surface.tsx`, `card.tsx` |
| UI12 | Niska (latentno) | `toast()` vraća kandidat id umjesto spojenog kad je poruka identična (updater je lazy). | `components/ui/toast.tsx` (`ToastProvider`) |
| UI13 | Niska | Nekorišteni exporti: `ModalTrigger`, `ModalClose`, `SheetTrigger`, `SheetClose`, `SheetPortal`, `SheetOverlay`, `DropdownMenuGroup`. | `modal.tsx`, `sheet.tsx`, `dropdown-menu.tsx` |
| UI14 | Niska | Aliasi varijanti dugmeta (`default`/`primary`, `destructive`/`danger`, `secondary`/`subtle`). | `components/ui/button.tsx` |
| UI15 | Niska | Nedosljedan naziv props (`ariaLabel` vs `label`) i dva i18n ključa za zatvaranje (`ui.close`, `shell.close`). | `tabs.tsx`, `segmented.tsx`, `filter-bar.tsx`, `modal.tsx`, `sheet.tsx` |

---

## Ocjena: 7/10

Obrazloženje:
- **Plus:** tokeni i kontrast po temi, Radix primitive, jasan API, `ConfirmDialog`, `ResponsiveSurface`, dobro urađen Toast, `Field` render-funkcija, `PanelSkeleton` kao jedinstven loader, `ScrollRegion`, `FilterBar`.
- **Minus:** UI1 utiče na svaki dijalog i na potvrdu brisanja, UI4 utiče na sve forme sa greškom, UI3 na tabove i segmente, UI5 na arhitekturu, UI7 na pouzdanost (2 testa za 28 komponenti).
- Ocjena je iznad modula 9–11 zbog kvaliteta dizajn sistema, ali UI1 i UI2 su stvarni a11y i konzistentnost problemi koji se vide korisnicima.

---

## Must-Have kandidati (modul 12)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **UI1:** `ModalHeader` koristi `ModalTitle` i `ModalDescription`. Provjeriti da svaki dijalog ima naziv (test sa `getByRole('dialog', { name })`).
2. **UI2:** zamijeniti 6 `window.confirm` poziva sa `ConfirmDialog` (brisanje ugovora, licence, priloga, učesnika, korisnika).
3. **UI4:** legacy `Field` da povezuje grešku i hint sa kontrolom (`aria-invalid`, `aria-describedby`), a hint/grešku izmjestiti van `<label>`.
4. **UI3:** strelice i roving tabindex za `UnderlineTabs` i `Segmented`; `aria-controls` i `tabpanel` gdje postoji sadržaj.
5. **UI7:** testovi za `Modal`/`ConfirmDialog`, `ToastProvider`, `UnderlineTabs`, `Segmented`, `FilterBar`, `Field` (oba oblika).
6. **UI5 + lint:** pravilo `no-restricted-imports` za `ui/`; `ApiErrorText` prima string ključ; `PageHeader` dobija help i brand kao props.
7. **UI6:** jedna mapa tonova (`lib/ui/tones.ts` ili `ui/tone.ts`) koju koriste badge, stat-card, progress.
8. **UI8:** `role="progressbar"` sa vrijednostima; `aria-current="step"`; `Avatar` sa `aria-label`; `DetailSection` naslov kao heading.
9. **UI12:** vratiti spojeni id iz `toast()` ili dokumentovati da vraća kandidat.
10. **UI9, UI10, UI11, UI13, UI14, UI15:** čišćenje (sentinel, boje, komentari, nekorišteni exporti, aliasi, nazivi props i i18n ključevi).

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.
