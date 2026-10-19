# Modul 1: Ljuska, routing i navigacija — ponovni audit

**Datum ponovnog audita:** 2026-10-19
**Auditirani SHA:** `338b4b7b3360a9aca9763f4bca44fed80238bf41`
**Prethodni dokument:** baseline 6/10 od 2026-10-13 i closeout od 2026-10-14
**Trenutna ocjena:** **8/10**
**Oznake nalaza:** isključivo **LR1–LR8**.

## Sažetak

Prethodni closeout je uglavnom potvrđen: fail-safe install gate, globalni i page error boundary, siguran povratak nakon prijave, 404 stranica, navigacijske ikone, mobilno zatvaranje menija, izdvojena pravila pristupa, ESLint/Prettier i osnovni guard testovi postoje i rade.

Modul ipak nije „max full“. Najveći preostali problem je da su routing, navigacija, ikone i guard poruke i dalje četiri ručno održavana izvora podataka. `router.tsx` ima 376 linija i 15 ponovljenih `RequireAccess` blokova. Ranije prihvaćeni rizik „Gap 8“ zato se ponovo otvara kao **LR1**. Dodatno su potvrđeni nedostatak route/navigation parity testa, djelimična guard neusklađenost za Assets/Problems/Changes, sticky page boundary pri query/hash navigaciji i odsustvo direktnog testa kompleksne komandne palete.

Nije pronađen novi P0 sigurnosni problem. Server ostaje konačni autoritet pristupa; nalazi se odnose na frontend konzistentnost, pouzdanost i održavanje.

## Scope

Uključeni su `main.tsx`, `app/*`, `application-shell`, header/sidebar/command palette, auth/access/error guardi, a11y shell komponente, `navigation.ts`, `navigation-icons.ts`, `route-access.ts`, install gate, login return-path, `NotFoundPage` i povezani testovi.

Sadržaj pojedinačnih stranica, backend autorizacija, header indikatori i Install wizard koraci pregledani su samo kao cross-reference.

## Izvršene provjere

1. Ponovo su pročitani router, shell, header/sidebar, auth/access guardi, install gate, navigacijski katalog, ikone, route-access i komandna paleta.
2. Potvrđeno je **15** produkcijskih `RequireAccess` blokova u `router.tsx`.
3. Veličine ključnih fajlova:
   - `router.tsx`: **376** linija;
   - `command-palette.tsx`: **409** linija;
   - `navigation.ts`: **277** linija;
   - `route-access.ts`: **204** linije;
   - `application-shell.tsx`: **105** linija.
4. Ciljani Vitest scope: **12/12 fajlova i 51/51 test prolaze**.
5. U istoj sesiji puni frontend Vitest je prošao: **333/333 fajlova i 1338/1338 testova**.
6. U istoj sesiji prošli su TypeScript/produkcijski build i ciljani ESLint.
7. Browser/E2E za modul 1 nije ponovo pokrenut. Stari B22 screenshot iz 2026-10-14 nije nova runtime verifikacija.

## Potvrđeno zatvoreno iz prethodnog audita

| Prethodna oblast                     | Trenutni dokaz                                                 | Status           |
| ------------------------------------ | -------------------------------------------------------------- | ---------------- |
| Install status greška vodi na wizard | Provider ima `loading/error/ready`; error prikazuje retry      | Zatvoreno        |
| Globalni bijeli ekran                | Root `errorElement` i page `RouteErrorBoundary`                | Zatvoreno uz LR4 |
| `/docs` ikona                        | `/docs` mapiran na `FileText`; ikone imaju test                | Zatvoreno        |
| Gubitak query/hash nakon login-a     | `RequireAuth` sprema puni path; login koristi `safeReturnPath` | Zatvoreno        |
| Remount bannera                      | `key` je na page wrapperu; banneri su izvan njega              | Zatvoreno uz LR4 |
| Dupli mobile-close                   | Jedan effect prati `location.key`                              | Zatvoreno        |
| Dupli `isStaff`                      | Shell koristi `isTicketStaff`                                  | Zatvoreno        |
| Tihi `console.error`                 | Centralni client logger i `no-console` guard                   | Zatvoreno        |
| Hard-coded sidebar shortcut          | Koristi `shortcutHint("newTicket")`                            | Zatvoreno        |
| Tihi `*` redirect                    | Renderuje se `NotFoundPage`                                    | Zatvoreno        |
| i18n init blank screen               | Greška se prijavi, aplikacija se ipak renderuje                | Zatvoreno        |
| Osnovni guard testovi                | Direktni auth/access/install/error testovi postoje             | Zatvoreno        |

## Realno / željeno — samo otvoreno

| Oblast                  | Realno                                                          | Željeno                                            |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Definicija ruta         | 376 linija JSX-a i 15 ponovljenih guard blokova                 | Tipizovani route katalog/helper                    |
| Paritet menija i ruta   | Više ručno sinhronizovanih izvora                               | Test za path, access i ikonu svih destinacija      |
| Assets/Problems/Changes | Sidebar koristi capability pravila; route ne koristi isti guard | Jedna eksplicitna i testirana odluka               |
| Page error reset        | Boundary se remountuje samo na pathname                         | Reset na relevantni search/hash ili navigation key |
| Command palette         | 409 linija, bez direktnog testa komponente                      | Async, keyboard, a11y i access testovi             |
| Guard poruke            | Ručni key union i četiri propsa                                 | Tipizovani descriptor                              |
| Komentari               | Ponovo postoje F0/F1/F6/IN/Aurora oznake                        | Trajni komentari bez faznih oznaka                 |
| Header dokaz            | Stari mock screenshot                                           | Aktuelni ponovljivi responsive test                |

## Gap analiza i master tabela

| ID      | Prioritet     | Status         | Nalaz / dokaz                                                                                                                                                                                          | Kriterij zatvaranja                                                                                                                  |
| ------- | ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **LR1** | P1 / visoko   | **Otvoren**    | `router.tsx` ima 376 linija i 15 gotovo identičnih `RequireAccess` blokova. Raniji Gap 8 više nije opravdano držati trajno otvorenim.                                                                  | Tipizovani route descriptor/helper centralizuje guard, poruke i ikonu; URL ugovor ostaje isti.                                       |
| **LR2** | P1 / srednje  | **Otvoren**    | Navigacija, route JSX, access switch i icon mapa održavaju se odvojeno. Nema sistemskog parity testa.                                                                                                  | Test pokriva navigacijske stavke, route descriptor, access kind i ikonu; izuzeci su eksplicitni.                                     |
| **LR3** | P1 / srednje  | **Djelimično** | Assets/Problems/Changes filtriraju se iz menija prema module + permission pravilima, ali njihove rute nisu u `RequireAccess`. Direct URL nema isti frontend rezultat kao meni.                         | Dokumentovati i testirati page-level odluku ili koristiti isti guard za list/detail rute.                                            |
| **LR4** | P1 / srednje  | **Otvoren**    | Page wrapper i boundary imaju `key={location.pathname}`. Query/hash navigacija ne montira svjež boundary i fallback može ostati sticky.                                                                | Route identity uključuje relevantni search/hash ili boundary resetuje error na navigation key; test reprodukuje query-only oporavak. |
| **LR5** | P1 / srednje  | **Otvoren**    | `command-palette.tsx` ima 409 linija. Nema direktnog testa za debounce/abort, stale response, keyboard wrap, active descendant, access filter i navigaciju. Komentar kaže 300 ms, konstanta je 250 ms. | Izdvojiti search/row model ili hook; dodati direktne interakcijske testove i uskladiti komentar.                                     |
| **LR6** | P2 / nisko    | **Otvoren**    | `ForbiddenMessageKey` je ručni union, a svaki guard zasebno prima check, title, body i icon.                                                                                                           | Descriptor tipom veže capability check, poruke i ikonu; nema ručnog union održavanja u komponenti.                                   |
| **LR7** | P2 / nisko    | **Otvoren**    | U scope-u su ponovo `F0.3`, `IN4/IN5`, `F1`, `F6.2` i „Aurora“. Prethodni closeout je tvrdio da su uklonjene.                                                                                          | Ostaviti trajno „zašto“ objašnjenje; grep scope-a nema interne fazne oznake.                                                         |
| **LR8** | P2 / provjera | **Otvoren**    | B22 se oslanja na mock screenshot iz 2026-10-14; nema aktuelnog responsive regression testa.                                                                                                           | Playwright/component test na 360 i 390 px potvrđuje bez overflowa i dostupnost kontrola.                                             |

## Dobro i vrijedno zadržavanja

- Install gate ne pretpostavlja da je sistem neinstaliran kada status API padne.
- `safeReturnPath` štiti login redirect od otvorenog preusmjeravanja.
- Root i page boundary daju vidljiv izlaz i prijavljuju grešku loggeru.
- Capability funkcije su čiste i dobro testirane.
- Sidebar i paleta koriste isti `filterNavigationSections`.
- Remote search koristi debounce i `AbortController`.
- Skip link, route focus manager, announcer regije, `aria-current`, focus trap i listbox semantika daju dobru a11y osnovu.
- 404 je vidljiv ekran, ne tihi redirect.
- Lazy chunk recovery ostaje kvalitetno riješen.

## Definicija „max full“

Modul dobija 10/10 kada:

1. route descriptor ukloni ponovljene guard blokove bez promjene URL-ova (**LR1**);
2. route/navigation/access/icon parity ima automatski test (**LR2**);
3. Assets/Problems/Changes imaju eksplicitno i testirano jednako ponašanje menija, palete i direct URL-a (**LR3**);
4. page boundary se oporavlja i pri query/hash navigaciji (**LR4**);
5. komandna paleta ima direktne async, keyboard i a11y testove te manju komponentu (**LR5**);
6. guard descriptor ukloni ručni key union i kopirani ugovor (**LR6**);
7. scope komentari više ne nose fazne oznake (**LR7**);
8. aktuelni responsive test potvrdi header na 360/390 px (**LR8**);
9. TypeScript, ESLint, format, ciljani testovi i puni frontend suite prolaze;
10. browser test bude jasno označen kao pokrenut ili nepokrenut.

## Status implementacije — Faza 1 (2026-10-19)

Faza 1 je kompletirana na reaudit osnovi `ea0f546`:

| Nalaz | Status nakon Faze 1 | Dokaz                                                                                                                                                                                            |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LR1   | **Zatvoren**        | `router.tsx` je smanjen sa 376 na 109 linija. Jedini produkcijski `RequireAccess` nalazi se u zajedničkom `ProtectedRoute`; 21 zaštićena list/detail/editor ruta dolazi iz tipizovanog kataloga. |
| LR2   | **Zatvoren**        | `protected-route-catalog.spec.ts` provjerava jedinstvene pathove, postojanje ikone te navigation/route access paritet za sve guardane navigacijske destinacije.                                  |
| LR3   | **Zatvoren**        | Assets, Problems i Changes list/detail rute koriste isti `canOpen*` guard i isti access kind kao sidebar i komandna paleta.                                                                      |
| LR6   | **Zatvoren**        | Guard descriptor veže page, check, access kind, title/body ključeve i icon path; `RequireAccess` više nema ručno pobrojavanje svakog title/body ključa.                                          |

Implementacijski detalji:

- uveden je `app/protected-route-catalog.tsx` kao tipizovani ugovor guardanih ruta;
- uveden je mali `ProtectedRoute` renderer;
- URL ugovor je sačuvan, uključujući template/playbook create/detail rute;
- fallback ikone se dobijaju iz postojećeg `navigation-icons` izvora;
- javne, authenticated-only, nested ticket/KB i legacy redirect rute ostale su eksplicitne u routeru;
- privremena ocjena nakon Faze 1 je **9/10**; LR4, LR5, LR7 i LR8 ostaju za naredne faze.

Verifikacija Faze 1:

- TypeScript i produkcijski frontend build — prolaze;
- ESLint — 0 grešaka, 12 postojećih upozorenja izvan izmijenjenog routing scope-a;
- i18n/design-system check — prolazi, 8788 ključeva i bs/en parity;
- ciljani routing testovi — 25/25 prolaze;
- puni frontend Vitest — **334/334 fajlova i 1341/1341 test prolaze**;
- `git diff --check` — prolazi.

## Status implementacije — Faza 2 (2026-10-19)

Faza 2 je kompletirana i **LR4 je zatvoren**:

- uveden je čisti `pageRenderKey` koji identitet ekrana gradi iz `pathname + search + hash`;
- page wrapper sada remountuje vlastiti `RouteErrorBoundary` i animaciju kada query ili hash odabere drugi ekran;
- maintenance, password-expiry i announcement banneri ostaju izvan keyed wrappera i ne remountuju se;
- regresioni test prvo izaziva render grešku, zatim potvrđuje oporavak na query-only navigaciji, pa isti tok ponavlja za hash-only navigaciju;
- privremena ocjena nakon Faze 2 je **9.2/10**; otvoreni ostaju LR5, LR7 i LR8.

Verifikacija Faze 2:

- ciljani boundary test — 2/2 prolaze;
- TypeScript i produkcijski frontend build — prolaze;
- ciljani ESLint izmijenjenih fajlova — prolazi bez upozorenja;
- i18n/design-system check — prolazi, 8788 ključeva i bs/en parity;
- puni frontend Vitest — **334/334 fajlova i 1342/1342 testa prolaze**;
- `git diff --check` — prolazi.

## Status implementacije — Faza 3 (2026-10-19)

Faza 3 je kompletirana i **LR5 je zatvoren**:

- remote search lifecycle izdvojen je u `useCommandPaletteSearch`;
- debounce i minimalna dužina upita imaju imenovane konstante, pa je uklonjena zastarjela 300 ms napomena;
- hook prekida prethodni zahtjev i ne primjenjuje stale rezultat;
- row tip i prezentacijski `PaletteRow` izdvojeni su iz glavne komponente;
- `command-palette.tsx` je smanjen sa 409 na 266 linija;
- direktni hook testovi pokrivaju minimalni upit, debounce od 250 ms, abort i stale-response zaštitu;
- direktni komponent testovi pokrivaju capability filter, `aria-activedescendant`, ArrowUp wrap, Home, ArrowDown, Enter i pointer navigaciju te loading/no-results najavu;
- privremena ocjena nakon Faze 3 je **9.6/10**; otvoreni ostaju LR7 i LR8.

Verifikacija Faze 3:

- ciljani palette testovi — 15/15 prolaze;
- TypeScript i produkcijski frontend build — prolaze;
- ciljani ESLint izmijenjenih fajlova — prolazi bez upozorenja;
- i18n/design-system check — prolazi, 8788 ključeva i bs/en parity;
- puni frontend Vitest — **336/336 fajlova i 1347/1347 testova prolazi**;
- `git diff --check` — prolazi.

## Status implementacije — Faza 4 (2026-10-19)

Faza 4 je kompletirana i **LR7 je zatvoren**:

- uklonjene su interne oznake `F0.3`, `F1`, `F6.2`, `IN4/IN5` i naziv vizuelne faze iz produkcijskih i povezanih testnih komentara u scope-u;
- zadržana su trajna objašnjenja server-selected wizard koraka, advisory readiness ponašanja, completion-screen izuzetka i CSS redoslijeda;
- komentari su u izmijenjenom scope-u ujednačeni na engleski;
- ciljani grep za fazne oznake sada vraća nula rezultata;
- nije promijenjeno runtime ponašanje;
- privremena ocjena nakon Faze 4 je **9.8/10**; otvoren ostaje samo LR8.

Verifikacija Faze 4:

- ciljani install gate testovi — 10/10 prolaze;
- TypeScript i produkcijski frontend build — prolaze;
- ciljani ESLint izmijenjenih fajlova — prolazi bez upozorenja;
- i18n/design-system check — prolazi, 8788 ključeva i bs/en parity;
- puni frontend Vitest — **336/336 fajlova i 1347/1347 testova prolazi**;
- `git diff --check` — prolazi.

## Fazni roadmap

### Faza 1 — ugovor ruta

1. **LR1 + LR6:** uvesti tipizovani guard/route descriptor i prebaciti 15 zaštićenih ruta bez mijenjanja URL-ova.
2. **LR2:** iz istog kataloga izvesti ili provjeriti navigation path/access/icon paritet.
3. **LR3:** eksplicitno riješiti list/detail guard ponašanje za Assets, Problems i Changes.

### Faza 2 — runtime pouzdanost

4. **LR4:** resetovati page boundary na puni navigation identity i dodati regresioni test.
5. **LR5:** izdvojiti palette search/selection model; testirati debounce, abort, stale response, tastaturu i navigaciju.

### Faza 3 — closeout

6. **LR7:** očistiti fazne komentare bez izmjene ponašanja.
7. **LR8:** pokrenuti aktuelni 360/390 responsive browser test.
8. Pokrenuti ciljane i pune frontend provjere; upisati egzaktne rezultate.

## Ocjena

### **8/10**

Prethodnih kritičnih problema više nema, osnovni guardovi i error tokovi su testirani, a dostupnost i session/install ponašanje su iznad prosjeka. Ocjena nije viša jer je centralni routing ugovor i dalje ručno dupliciran, paritet menija i ruta nije automatski garantovan, tri modulske grupe imaju različit route/sidebar guard model, page boundary ima query/hash reset rupu, a najkompleksnija shell komponenta — komandna paleta — nema direktan komponent test.

Do 10/10 nisu potrebne nove poslovne funkcije; potreban je kontrolisan refaktor ugovora ruta, regresioni testovi i aktuelna browser verifikacija.

## Predložena commit poruka

`docs(audit): redo shell routing and navigation review`
