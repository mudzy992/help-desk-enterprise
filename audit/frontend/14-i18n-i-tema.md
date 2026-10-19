# Modul 14: `i18n` i tema

Datum audita: 2026-10-19
Grana: `arena/bd31e07b-help-desk-enterprise`
Status: implementacijski re-audit; IT5–IT10 obrađeni, IT3/IT4 djelimični, IT2 namjerno nije mijenjan.
Oznake nalaza: **IT** (i18n i tema).

**Metod.** Ključevi su provjereni skriptom (Python, JSON flatten): broj ključeva, paritet bs/en, ključevi korišteni u `t("…")` pozivima, plural forme. Teme i locale su čitani u cijelosti (`i18n/config.ts`, `i18n/locale.ts`, `i18n/use-locale.ts`, `i18n/locale-preference-sync.ts`, `i18n/i18next.d.ts`, `lib/theme/theme-provider.tsx`, `lib/theme/theme-storage.ts` (zaglavlje), `components/layout/theme-switcher.tsx` (aria i ključevi), `index.html` (pre-paint skripta)). Ne mogu se potvrditi bez build analize: veličina bundle-a i broj ključeva koji se koriste dinamički.

---

## Modul

Dvije teme aplikacije (`pulse` i `classic`, sa modovima `light`/`dark`/`system` i šest akcenata) i dva jezika (`bs` podrazumijevani, `en` fallback). Prevodi su u jednom namespace-u `common`, u dva JSON fajla. Tip ključeva je generisan iz `bs` JSON-a kroz `i18next.d.ts`. Tema se primjenjuje prije prvog renderovanja kroz inline skriptu u `index.html`.

---

## Povezani fajlovi i folderi

| Fajl                                                | Uloga                                                                       | Linija       |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ------------ |
| `frontend/src/i18n/config.ts`                       | Inicijalizacija i18next, resursi, missing-key upozorenje u DEV              | 69           |
| `frontend/src/i18n/locale.ts`                       | `supportedLocales`, `parseLocale`, čuvanje u `localStorage`, `lang` atribut | 49           |
| `frontend/src/i18n/use-locale.ts`                   | Hook za promjenu jezika, čuva i na serveru                                  | 37           |
| `frontend/src/i18n/locale-preference-sync.ts`       | Odluka pri prijavi: push ili apply jezika sa servera                        | 24           |
| `frontend/src/i18n/i18next.d.ts`                    | Tipovi ključeva iz `bs/common.json`                                         | 12           |
| `frontend/src/i18n/locales/bs/common.json`          | Prevodi (bosanski), 8 170 ključeva, 565 KB                                  | 9 320 linija |
| `frontend/src/i18n/locales/en/common.json`          | Prevodi (engleski), 8 090 ključeva, 550 KB                                  | 9 240 linija |
| `frontend/src/i18n/*.spec.ts`                       | Pokrivenost admin-ops i settings-registry ključeva                          | 4 fajla      |
| `frontend/src/lib/theme/theme-provider.tsx`         | Kontekst teme, sistemski mod, primjena na `<html>`                          | 163          |
| `frontend/src/lib/theme/theme-storage.ts`           | Ugovor tema (tipovi, ključevi, `isDarkAppearance`)                          | 89           |
| `frontend/src/lib/theme/semantic-meta.ts`           | Meta podaci tema                                                            | 75           |
| `frontend/src/components/layout/theme-switcher.tsx` | Meni teme, moda i akcenta                                                   | 162          |
| `frontend/src/components/layout/locale-select.tsx`  | Izbor jezika                                                                | 33           |
| `frontend/index.html`                               | Pre-paint skripta: migracija starih ključeva i primjena teme                | —            |

---

## Trenutna implementacija

**Jezik.** `i18next` sa `react-i18next`, `lng` iz `localStorage` (`service-desk.locale`), `fallbackLng: "en"`, `ns: ["common"]`, `escapeValue: false` (React escapuje). Missing-key upozorenje samo u DEV (`missingKeyHandler`). `languageChanged` postavlja `<html lang>`. `useLocale` čuva izbor lokalno i, ako postoji sesija, šalje `updateUserPreferences({ preferredLocale })` (best effort).

**Sinhronizacija.** `decideLocaleSync` pri prijavi: ako server nema jezik, šalje se trenutni; ako se razlikuje, primjenjuje se serverski. Dobro: jezik e-mailova prati jezik UI-ja.

**Prevodi.** Oba JSON fajla imaju isti raspon ključeva (bs 8 170, en 8 090). Svih 80 ključeva koji postoje samo u `bs` su plural forme `_few` (bosanski ima one/few/other, engleski one/other). Tip ključeva je iz `bs` JSON-a (`CustomTypeOptions`), pa `t("ključ")` proverava tip.

**Tema.** Tri ortogonalne ose: `design` (`pulse` | `classic`), `mode` (`light` | `dark` | `system`), `accent` (6 vrijednosti). `ThemeProvider` čita stanje iz `localStorage` (`service-desk.theme.*`), prati `prefers-color-scheme` i upisuje `data-theme`, `data-accent` i klasu `dark` na `<html>`. `classic` je uvijek taman (`isDarkAppearance`).

**Pre-paint skripta** (`index.html`): prvo migrira stare ključeve (`legacy` prefiksi ključeva (stari localStorage ključevi) → aktuelni `service-desk.*` ključevi), zatim postavlja `data-theme`, `data-accent` i `dark` prije prvog crtanja. Komentar kaže da je ručno usklađena sa `theme-storage.ts`.

**Dobro urađeno.** Tipovi ključeva kroz `i18next.d.ts`. Paritet ključeva bs/en gotovo potpun. Dvije spec datoteke provjeravaju pokrivenost (admin-ops, settings-registry). Theme switcher ima `aria-label` i `title` na okidaču. Pre-paint skripta sprječava treperenje pogrešne teme. Odluka o sinhronizaciji jezika je čista funkcija sa testom.

---

## Realno/željeno stanje

| Oblast               | Realno stanje                                                           | Željeno stanje                                               |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Učitavanje prijevoda | Oba JSON-a (≈1,1 MB sirovo) su statički importovana u `config.ts` (IT2) | Učitavanje jezika na zahtjev ili po namespace-u              |
| Namespace            | Jedan `common` sa 8 170 ključeva (IT2)                                  | Podjela po domenu (tickets, admin, install…)                 |
| Vrijednosti          | 201 ključ ima isti tekst u bs i en, neki su engleski i u bs UI-ju (IT3) | Bosanski prijevod ili svjesno zadržan termin                 |
| Dinamički ključevi   | Ključevi u šablonima (`${status}`) i `as never` (IT4)                   | Tipizovani mapiranja (`Record<Status, TranslationKey>`)      |
| Pokrivenost          | Testovi samo za dva domena (IT5)                                        | Test: paritet, bez nepostojećih ključeva, bez neiskorištenih |
| Tema u HTML-u        | Skripta u `index.html` ručno usklađena sa TS kodom (IT6)                | Jedan izvor (generisan ili provjeren testom)                 |
| Promjena teme        | `toggleMode` upisuje u `localStorage` unutar `setState` updatera (IT7)  | Upis u efektu ili u eksplicitnom handleru                    |

---

## Gap analiza

1. **Pokrivenost i kvalitet prevoda su dobri.** 8 170 ključeva, paritet bs/en (samo `_few` razlika, koja je ispravna). Svi literal ključevi koji se koriste u `t("…")` postoje u bs JSON-u (provjereno: 0 nedostajućih, uključujući plural baze). Ovo je jači rezultat nego u većini modula.
2. **Učitavanje cijelog prevodnog paketa odmah (IT2, srednja).** `config.ts` statički importuje `bs/common.json` i `en/common.json`. Jedan jezik korisnika ne treba drugi, a oba su u početnom bundle-u (≈1,1 MB sirovo, gzip manji). Nisam mjerio veličinu u build-u; treba potvrditi analizom bundle-a. Jedan namespace takođe znači da se cijeli prevodni skup učitava za svaki ekran.
3. **Engleske riječi u bosanskom UI-ju (IT3, niska).** 201 ključ ima isti tekst u oba jezika (dio su vlastite imena i tehnički termini, što je u redu). Primjeri koji nisu prevedeni u `bs`: `configVersions.statuses.VALIDATED` → „VALIDATED“ (sirova vrijednost enuma se prikazuje korisniku), `settings.system.installWizard` → „Install wizard“, `a11y.chart.period` → „Period“, `teamsAdmin.mode.simulator` → „Simulator“, `configVersions.package.kinds.playbook` → „Playbook“. Ovo je potrebno ručno pregledati sa prevodiocem.
4. **Dinamički ključevi zaobilaze tipove (IT4, srednja).** U kodu je približno 225 `t()` poziva sa dinamičkim ključem (šablon ili varijabla, gruba procjena; npr. `settings.emailTemplates.providers.${provider}`, `configVersions.statuses.${version.status}`, `services.downtime.phase.${window.phase}`). Ovi ključevi nisu provjereni TypeScript-om. Uz to, `t(key as never, … as never) as unknown as string` (vidjeti modul 13, LB6 i modul 10, SV15). Greška u ključu se vidi tek u runtime-u (DEV upozorenje, u produkciji prikazuje ključ). Preporuka: mapa `Record<Status, TranslationKey>` ili `TFunction` tip.
5. **Pokrivenost testovima (IT5, srednja).** Specovi pokrivaju admin-ops i settings-registry. Nema testa za: paritet bs/en (u ovom auditu nađeno 0 razlika osim `_few`, ali nema zaštite od regresije), nepostojeće ključeve u `t()` pozivima (trenutno 0, bez alata), i neiskorištene ključeve (`~3 975` ključeva nije pronađeno kao literal u `t("…")`; dio je dinamički ili u konfiguracijskim objektima, pa je potreban pravi alat, npr. `i18next-parser`, da se potvrdi). Nema ESLint pravila za nelokalizovan tekst u JSX-u.
6. **Pre-paint skripta i `theme-storage.ts` (IT6, niska).** `index.html` ponavlja listu ključeva i dozvoljene vrijednosti (`pulse`, `classic`, `light`…) i kaže da je „ručno usklađena“. Ako se doda nova vrijednost u TS, skripta je ne zna i tema se vraća na podrazumijevanu pri prvom crtanju. Pre-paint skripta takođe migrira stari ključ sesije u aktuelni (sesija u `localStorage`, vidjeti modul 2).
7. **Side effect u `setState` updateru (IT7, niska).** `toggleMode` u `theme-provider.tsx` poziva `writeStored` i `readSystemPrefersDark()` unutar `setModeState((previous) => …)`. Updater treba biti čist; u StrictMode se izvršava dva puta. Ponašanje je ispravno, ali je obrazac pogrešan (isti kao UI12 u modulu 12).
8. **Ostalo (niska).** Hardkodirani `"bs"` i `"en"` u `asset-import-panel.tsx` (`i18n.language.startsWith("en") ? "en" : "bs"`) duplira `parseLocale`. `on-call-calendar.tsx` koristi `bs-BA` i `en-GB` (ispravno za prikaz), a `on-call-view.ts` koristi `en-US` za parsiranje dijelova datuma (namjerno, nije prikaz). `privacy-notice-editor.tsx` ima hardkodirane oznake jezika `BS`/`EN` (prihvatljivo). `index.html` ima prazan `catch (error) {}`. Komentari „Paket 1.5“ i „Paket 4.1“ u `use-locale.ts`, `locale-preference-sync.ts` i `index.html`.
9. **Tema.** Pulse i classic su dobro izolovani tokenima (vidjeti modul 12). Akcent se primjenjuje samo na `pulse` (dokumentovano). `ThemeProvider` ispravno pretplaćuje `matchMedia` i čisti listener. Nema greške u sistemskom modu. Meni teme ima `aria-label`, ali nema `aria-checked` na opcijama moda i akcenta (`DropdownMenuItem` bez `role="menuitemradio"`), pa čitač ekrana ne prikazuje koja je opcija aktivna.

**Što je dobro:** prevodi su gotovo kompletni i tipizovani; sinhronizacija jezika sa serverom; tema bez treperenja; čista odluka za sinhronizaciju; testovi za pokrivenost; oznake jezika i teme su dosljedne.

---

## Mišljenje tima i preporuka

Ovo je najzdraviji dio aplikacije po pitanju prevoda: skoro potpun paritet, tipovi, dokumentovan izbor. Glavni problemi su skalabilnost (jedan namespace, oba jezika odmah) i pouzdanost dinamičkih ključeva (`as never`, šabloni). Tema je dobro urađena, a jedina ozbiljnija stvar je ručna sinhronizacija pre-paint skripte.

Preporuka redom:

1. IT4: tipizovati dinamičke ključeve (mape `Record<Status, TranslationKey>`), ukloniti `as never` (zajedno sa modulima 10 i 13).
2. IT5: alat za provjeru ključeva (paritet, nepostojeći, neiskorišteni) u `npm run i18n:check`, uključen u CI.
3. IT2: lazy učitavanje jezika (`i18next-http-backend` ili dinamički `import()`), ili bar provjera veličine bundle-a.
4. IT3: prevodilac pregleda 201 ključ sa istim tekstom (posebno enum vrijednosti).
5. IT6: pre-paint skripta da se generiše iz `theme-storage.ts` ili da test poredi listu vrijednosti.
6. IT8: menu teme sa `role="menuitemradio"` i `aria-checked`.

---

## Bugovi i neusklađenosti

| ID   | Ozbiljnost   | Nalaz                                                                                                                                                   | Lokacija                                                                                                                                                |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IT2  | Srednja      | Oba prevodna paketa (≈1,1 MB sirovo) statički importovana, jedan namespace.                                                                             | `i18n/config.ts`                                                                                                                                        |
| IT3  | Niska        | 201 ključ sa istim tekstom u bs i en; sirova enum vrijednost prikazana korisniku (`VALIDATED`), engleske riječi u bs UI-ju.                             | `configVersions.statuses.*`, `settings.system.installWizard`, `a11y.chart.period`, `teamsAdmin.mode.simulator`, `configVersions.package.kinds.playbook` |
| IT4  | Srednja      | Približno 225 `t()` poziva sa dinamičkim ključem (šablon `${…}` ili varijabla) bez provjere tipova; `t(key as never, … as never) as unknown as string`. | `lib/tickets/ticket-text.ts`, `lib/charts/chart-summary.ts` i ostali pozivi sa šablonima                                                                |
| IT5  | Srednja      | Nema provjere pariteta, nepostojećih i neiskorištenih ključeva u CI-ju; nema ESLint pravila za tekst u JSX-u.                                           | `i18n/*.spec.ts` (samo dva domena)                                                                                                                      |
| IT6  | Niska        | Pre-paint skripta ručno usklađena sa `theme-storage.ts`; migracija starog ključa sesije.                                                                | `index.html`, `lib/theme/theme-storage.ts`                                                                                                              |
| IT7  | Niska        | Side effect (`writeStored`) u `setState` updateru u `toggleMode`.                                                                                       | `lib/theme/theme-provider.tsx`                                                                                                                          |
| IT8  | Niska (a11y) | Opcije moda i akcenta u meniju bez `aria-checked`/`menuitemradio`.                                                                                      | `components/layout/theme-switcher.tsx`                                                                                                                  |
| IT9  | Niska        | Duplirana logika jezika (`startsWith("en") ? "en" : "bs"`) umjesto `parseLocale`.                                                                       | `components/assets/asset-import-panel.tsx`                                                                                                              |
| IT10 | Niska        | Prazan `catch (error) {}` u pre-paint skripti; oznake „Paket 1.5“, „Paket 4.1“ u komentarima.                                                           | `index.html`, `i18n/use-locale.ts`, `i18n/locale-preference-sync.ts`                                                                                    |

---

## Ocjena: 7/10

Obrazloženje:

- **Plus:** skoro potpun paritet prevoda (8 170 ključeva), tipovi ključeva, provjera nepostojećih literal ključeva (0 nalaza), dobro dokumentovan izbor teme i jezika, sinhronizacija jezika sa serverom, pre-paint primjena teme bez treperenja.
- **Minus:** monolitni JSON bez lazy učitavanja, dinamički ključevi bez tipova (`as never`), nema alata za provjeru ključeva u CI-ju, nekoliko engleskih vrijednosti u bs UI-ju, ručna sinhronizacija pre-paint skripte.

---

## Must-Have kandidati (modul 14)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **IT4:** tipizovati dinamičke ključeve (mape), ukloniti `as never` u `t()` wrapper-ima (zajedno sa modulima 10 i 13).
2. **IT5:** `i18n:check` skripta (paritet, nepostojeći, neiskorišteni) u CI; ESLint pravilo za literal tekst u JSX-u (uz modul 16).
3. **IT3:** pregled 201 ključa sa istim tekstom; enum vrijednosti prikazati prevedene (`configVersions.statuses.*`).
4. **IT2:** lazy učitavanje prevoda po jeziku; izmjeriti bundle prije i poslije.
5. **IT6:** pre-paint skripta generisana iz `theme-storage.ts` ili test koji poredi vrijednosti.
6. **IT8:** `role="menuitemradio"` i `aria-checked` u meniju teme.
7. **IT7, IT9, IT10:** čišćenje (updater, `parseLocale`, prazan catch, oznake plana).

---

## Status ispravki (2026-10-19)

| ID   | Status       | Implementirani dokaz                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IT2  | Otvoren      | Lazy učitavanje/namespace split nije rađen bez eksplicitnog zahtjeva i mjerenja bundle-a.                                                                                                                                                                                                                                                              |
| IT3  | Djelimično   | Prevedeni su statusi config verzija te očigledni BS tekstovi za install wizard, simulator i playbook; širi pregled jednakih bs/en vrijednosti ostaje zaseban batch.                                                                                                                                                                                    |
| IT4  | Djelimično   | `chart-summary.ts` već koristi `TFunction`; config-version statusi sada koriste iscrpnu tipizovanu mapu umjesto dinamičkog template ključa u četiri potrošača. Širi dinamički inventar ostaje otvoren po domenima.                                                                                                                                     |
| IT5  | **Zatvoren** | Postojeća provjera u `check-pulse-design-system.mjs` je potvrđena kao jedini izvor: provjerava bs/en paritet uz pluralne forme, statičke `t("…")` ključeve i dinamičke prefikse. Izložena je kao `npm run i18n:check` i eksplicitno se izvršava u frontend CI poslu. Unused-key scan nije uslov zatvaranja zbog legitimnih dinamičkih/config ključeva. |
| IT6  | **Zatvoren** | Pulse guard sada poredi sva tri storage ključa, dozvoljene design/mode/accent vrijednosti i default vrijednosti sa pre-paint skriptom; `theme-contract.spec.ts` daje nezavisan regresijski test.                                                                                                                                                       |
| IT7  | **Zatvoren** | `toggleMode` više nema storage side effect u React state updateru; računa sljedeći mod i prolazi kroz postojeći eksplicitni `setMode` handler.                                                                                                                                                                                                         |
| IT8  | **Zatvoren** | Design, mode i accent opcije izlažu `menuitemradio` + `aria-checked`; jsdom test potvrđuje tri aktivne i osam neaktivnih opcija.                                                                                                                                                                                                                       |
| IT9  | **Zatvoren** | Asset import koristi centralni `parseLocale(i18n.resolvedLanguage ?? i18n.language)`.                                                                                                                                                                                                                                                                  |
| IT10 | **Zatvoren** | Prazni pre-paint catch sada daje lokalni development warning, a dirnuti i18n/index komentari opisuju ugovor bez paket/faznih oznaka.                                                                                                                                                                                                                   |

### Verifikacija

- `check-pulse-design-system.mjs`: 8 772 ključa, bs/en paritet, 4 498 statičkih ključeva i 88 dinamičkih prefiksa; theme storage/vrijednosti/defaulti usklađeni.
- `check-theme-contrast.mjs` i `check-a11y-static.mjs`: prošli.
- `npx vitest run src/i18n`: 5 fajlova / 43 testa.
- puni frontend Vitest: 320/320 fajlova i 1 310/1 310 testova.
- ciljani theme testovi: 2 fajla / 2 testa.
- `npx tsc -b`: prošao.
- `npm run lint`: 0 grešaka, 12 postojećih hook upozorenja.

## Revidirana ocjena: 9/10

IT5–IT10 više nisu otvoreni rizici. Do potpunog zatvaranja ostaju izmjereni i odobreni IT2 lazy-loading zahvat, naredni IT3 prevodilački batch i postepena tipizacija preostalih IT4 dinamičkih domena.
