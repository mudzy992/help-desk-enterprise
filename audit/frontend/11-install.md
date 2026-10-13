# Modul 11: Install (čarobnjak za instalaciju)

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, grep, provjera backend guardova). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **IN** (install). Ovo se ne miješa sa oznakama drugih modula (O, OB, ST, SV, KB, RS, R, S).

Provjere izvršene u sandboxu:
- **Čitanje u cijelosti:** `pages/install-page.tsx` (146), `app/install-setup-provider.tsx` (69), `app/install-setup-layout.tsx` (23), `lib/resolve-install-gate-navigation.ts` (31), `lib/resolve-install-wizard-step.ts` (47), `components/install/install-token-gate.tsx` (80), `lib/install/install-token-store.ts` (28), `components/install/install-super-admin-step.tsx` (239), `components/install/install-login-provider-step.tsx` (197), `components/install/install-complete-step.tsx` (44).
- **Čitanje dijelova:** `components/install/install-smtp-step.tsx` (uslovi učitavanja i snimanja), `install-seed-step.tsx` i `install-addons-step.tsx` (učitavanje i greške, pregled ostalog), `services/install-api.ts` (tipovi i potpisi, 121), `app/router.tsx` (rute 80–90 i 336–346), `services/api.ts` (`installTokenHeaders`, 110).
- **Samo pregled:** `install-smtp-fields.tsx` (105), `install-ldaps-bind-fields.tsx` (85), `install-entra-ad-fields.tsx` (67), `install-addons-step.tsx` (red za dodatak), `install-gate-skeleton.tsx` (24), `services/install-addons-api.ts`, `install-seed-api.ts`, `install-smtp-api.ts`, `lib/build-install-*.ts`, `lib/install-addon-copy.ts`, `lib/map-install-*-error.ts` (jedan primjer: `map-install-seed-error.ts`).
- **Backend:** `install/install.controller.ts` (dekoratori i guardovi), `install/install-wizard-lock.guard.ts` (cijelo), `install/install-token.ts` (`assertInstallToken`, `isInstallTokenProtectedRequest`). **Nije provjereno:** servisi za svaki korak (`install-*.service.ts`), `install-complete.service.ts`.
- **Testovi:** unit testovi u `lib/` (11 fajlova, uključujući `install/install-token-store.spec.ts`). Nema komponentskih testova za korake. E2E instalaciju radi API helper `e2e/helpers/ensure-install.ts`, a UI čarobnjaka nijedan e2e test ne pokriva.
- **Pretraga:** `any`, `as never`, `eslint-disable`, `console.` u modulu: nijedan pogodak. Komentari sa oznakama revizija i plana: nekoliko pogodaka (vidi IN9).
- **Nije pokrenut pregledač.** Nalazi IN1 i IN2 izvedeni su čitanjem toka koda. Treba ih potvrditi simulacijom greške na `/install/status` (zaustavljen backend ili blokiran zahtjev) i greške mreže na gate-u.

---

## Modul

Čarobnjak se pokazuje samo dok instalacija nije završena. Sastoji se od šest koraka: super admin, način prijave (lokalno ili Entra/AD sa LDAPS bind-om), SMTP, seed podataka, dodaci (add-on) i završetak. Pristup je zaštićen tokenom `INSTALL_TOKEN` koji operater unosi na ekranu. Tok odlučuje backend preko `nextStep`, a frontend samo prikazuje korak.

Modul je mali (oko 1 600 linija u frontendu), ali je jedini dio aplikacije koji radi prije prijave, pa greške u njemu imaju najveći uticaj: greška na pokretanju može da pošalje svakog korisnika na instalacioni ekran, a greška u učitavanju koraka može da prepiše postojeću konfiguraciju.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/install-page.tsx` | Ljuska čarobnjaka, korak iz statusa, napredak | 146 |
| `frontend/src/components/install/` | Koraci (super admin, prijava, SMTP, seed, dodaci, završetak), token gate, polja | 11 fajlova, ~1 250 |
| `frontend/src/app/install-setup-provider.tsx` | Kontekst statusa instalacije (učitava se pri pokretanju) | 69 |
| `frontend/src/app/install-setup-layout.tsx` | Preusmjeravanje rutâ prema statusu instalacije | 23 |
| `frontend/src/app/router.tsx` | Ruta `/install` i `/_visual-qa` (samo u development buildu) | 80–90, 336–346 |
| `frontend/src/lib/resolve-install-gate-navigation.ts` | Odluka o preusmjeravanju | 31 |
| `frontend/src/lib/resolve-install-wizard-step.ts` | Mašina koraka (u produkciji nekorišten, vidi IN6) | 47 |
| `frontend/src/lib/install/install-token-store.ts` | Čuvanje tokena u `sessionStorage` | 28 |
| `frontend/src/lib/build-install-*.ts`, `lib/map-install-*-error.ts`, `lib/install-addon-copy.ts` | Građenje ulaza i mapiranje grešaka | ~12 fajlova |
| `frontend/src/services/install-*.ts` | API za `/install/*` | 4 fajla |
| `backend/src/modules/install/` | Kontroler, guard zaključavanja, provjera tokena, servisi koraka | — |
| `e2e/helpers/ensure-install.ts` | Instalacija kroz API za e2e | — |

---

## Trenutna implementacija

**Pokretanje.** `InstallSetupProvider` pri pokretanju aplikacije učitava `/install/status` i drži `isLoading` i `isCompleted`. Sve rute su obavijene u `InstallSetupLayout`: dok status nije stigao, prikazuje se skeleton. Zatim `resolveInstallGateNavigation` odlučuje: ako je instalacija završena, `/install` vodi na `/`; ako nije, sve osim `/install` i `/_visual-qa` vodi na `/install`.

**Ljuska.** `InstallPage` ponovo učitava status (drugi zahtjev) i postavlja korak iz `nextStep` (fallback na `superAdmin`). Prikazuje traku napretka, `WizardStepper` i naslov/tekst koraka iz `installWizardCopyKeys`. Korak `complete` poziva `markCompleted()`, što pokreće preusmjeravanje na `/`.

**Token.** `InstallTokenGate` se prikazuje umjesto čarobnjaka dok nema tokena u `sessionStorage`. Pri slanju upisuje token, zove `GET /install/super-admin` i, ako prođe, otključava čarobnjak. `apiRequest` dodaje `X-Install-Token` za sve `/install/` zahtjeve.

**Koraci.** Svaki korak učitava svoj status (`useEffect` sa `isCancelled`), prikazuje skeleton, pa formu. Snimanje prolazi kroz `build-install-*` (ulaz) i `map-install-*` (greška u ključ prevoda), a poruka greške ide u `role="alert"`. Lozinke se unose u `type="password"` sa `autoComplete="new-password"`; pravila lozinke dolaze sa servera (`fallbackPasswordPolicy` se koristi dok ne stignu).

**Backend.** `InstallController` ima `InstallWizardLockGuard` na nivou klase. Guard: kad je instalacija završena, mutacije su zaključane (`createInstallLockedException`); kad nije, zahtjevi koji su zaštićeni (`isInstallTokenProtectedRequest`) traže validan `X-Install-Token` (`assertInstallToken`, 403 za pogrešan token, `INSTALL_TOKEN_NOT_CONFIGURED` ako token nije podešen). `/install/status` je otvoren.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Greška pri učitavanju statusa na pokretanju | Svaka ruta se preusmjerava na `/install` (IN1) | Greška sa dugmetom za ponovni pokušaj; korisnik ostaje na svojoj ruti |
| Provjera tokena | Greška mreže ili 500 otključava čarobnjak bez provjere (IN2) | Otključava se samo na uspješnu provjeru; ostale greške se prijavljuju |
| Učitavanje koraka | Greška tiho daje praznu/podrazumijevanu formu (IN3) | Greška sa retry-em; forma se ne prikazuje dok stanje nije poznato |
| Status na `/install` | Učitava se dva puta (provider i ljuska) (IN5) | Jedno učitavanje, dijeljeno kroz kontekst |
| Korak posle greške statusa | Završena instalacija prikazuje „kreiraj super admina“ (IN4) | Greška, ne fallback na prvi korak |
| Mašina koraka | Dvije implementacije (backend `nextStep` i frontend `resolveInstallWizardStep`, nekorišten) (IN6) | Jedna (backend), frontend samo prikazuje |
| Token u pregledaču | `sessionStorage`, bez provjere pri inicijalizaciji (IN7) | Memorija tab-a ili provjera pri svakom otvaranju |
| Testovi | Samo lib, nema komponentskih, nema UI e2e | Komponentski testovi za svaki korak i gate; e2e za čarobnjak |
| Komentari | Oznake revizija i plana, opisi „kako je nekad bilo“ (IN9) | Komentar objašnjava zašto, bez istorije |

---

## Gap analiza

1. **Fail-open na pokretanju (IN1).** `InstallSetupProvider` u `catch` postavlja `isCompleted: false`. `resolveInstallGateNavigation` tada za svaku rutu van `/install` vraća `/install`. Dakle, prolazna greška `/install/status` (mreža, 500, 429, zastoj backend-a) na završenoj instalaciji šalje sve korisnike na instalacioni ekran, uključujući prijavljene. Backend odbija mutacije na završenoj instalaciji, pa podaci nisu direktno ugroženi, ali je korisničko iskustvo pogrešno, a ekran za kreiranje super admina postaje vidljiv.
2. **Gate otključava na bilo koju grešku (IN2).** U `InstallTokenGate.submit`, grana `gateError === null` (sve osim 403 i `INSTALL_TOKEN_NOT_CONFIGURED`) postavlja `setIsUnlocked(true)`. Mrežna greška ili 500 tada otključava čarobnjak sa tokenom koji nije provjeren, a token je već zapisan u `sessionStorage`. Backend i dalje odbija zahtjeve, ali je gate bez svrhe kad padne mreža.
3. **Tiho učitavanje i prepisivanje konfiguracije (IN3).** U `InstallLoginProviderStep`, `InstallSmtpStep`, `InstallSuperAdminStep`, `InstallSeedStep` i `InstallAddonsStep`, greška učitavanja samo postavlja `isLoading=false`. Forma se prikazuje sa podrazumijevanim vrijednostima. Kod prijave, podrazumijevano je `local`, pa snimanje može zamijeniti već podešen Entra/AD. Kod SMTP-a, podrazumijevano je `enabled=false`, pa snimanje može isključiti postojeći SMTP. Ovo nije potvrđeno na serveru, ali je ponašanje forme jasno iz koda.
4. **Pogrešan fallback koraka (IN4).** `InstallPage` na grešku statusa postavlja `superAdmin`. Na završenoj instalaciji to znači formu za kreiranje super admina (backend je odbija, ali je forma vidljiva).
5. **Dupliranje i čekanje.** `/install` učitava status dva puta (provider i ljuska). Cijela aplikacija čeka isti zahtjev prije prvog prikaza, uključujući `/login` i `/privacy-notice`. To dodaje jedno mrežno čekanje svakom učitavanju.
6. **Mrtav kod i dvostruki tip (IN6).** `resolveInstallWizardStep` nije korišten u produkciji (samo u spec-u). Komentar u `install-page.tsx` tvrdi suprotno. `InstallWizardStep` je definisan u `services/install-api.ts` i u `lib/resolve-install-wizard-step.ts`.
7. **Token u pregledaču (IN7).** Token je u `sessionStorage`, pa ga može pročitati svaka skripta na stranici. Inicijalizacija `useState(() => readInstallToken() !== null)` ne provjerava token, pa zastarjeli token otvara čarobnjak, koji zatim pada na svakom pozivu.
8. **Pristupačnost (IN12).** Hint pravila lozinke nije povezan sa poljem (`aria-describedby`). Polja za Entra i LDAPS nemaju opis. Radio grupa ima `fieldset/legend` (dobro).
9. **Duplikacija (IN8, IN10, IN13).** Zaglavlje i raster su ponovljeni u `InstallTokenGate` i `InstallPage`. Obrazac `useEffect` + `isCancelled` + skeleton ponovljen je u šest koraka. `fallbackPasswordPolicy` duplira serversko pravilo. Pet fajlova `map-install-*-error.ts` ima isti obrazac kao četiri `map-service-*-error.ts` u modulu 10.
10. **Humanizacija (IN9).** Oznake revizija („Review 2026-09-25 (S4)“, „Review N9“, „Paket 5.1 (M1 #1)“) i interni žargon („Pulse install wizard“, „untouched“) u više fajlova. Gate JSX u `install-token-gate.tsx` ima pogrešnu indentaciju (bez Prettier-a, vidi automatizaciju).
11. **UX čarobnjaka (IN11).** Nema povratka na prethodni korak. Korak `seed` pokreće se jednim klikom bez opisa šta se kreira (treba provjeriti da li je seed idempotentan). Korak se ne može ponovo otvoriti da se promijeni prethodni unos.
12. **Automatizacija i testovi (IN14).** Nema komponentskih testova za korake i gate. E2E ne prolazi kroz UI čarobnjaka (instalacija ide kroz API). Nema ESLint-a ni Prettier-a u `frontend/`.

**Što je dobro:** server vodi tok (`nextStep`), greške su tipizovane (`map-install-*`), lozinke su `type="password"` sa ispravnim `autoComplete`, pravila lozinke dolaze sa servera, greške idu u `role="alert"`, `/_visual-qa` je samo u development buildu (router, 343–345), backend zaključava mutacije na završenoj instalaciji i traži token za zaštićene putanje dok instalacija nije završena.

---

## Mišljenje tima i preporuka

Backend je solidan: zaključavanje i provjera tokena su na serveru, pa frontend greške ne mogu da otvore mutacije. Problem je u frontendu koji previše pretpostavlja. Čarobnjak mora da bude konzervativan: ako ne zna stanje, ne smije da pokaže formu, ne smije da otključa i ne smije da preusmjeri korisnika koji je već prijavljen.

Preporuka je mala i fokusirana:
- **Stanje statusa je trostruko** (`loading`, `ready`, `error`). Pri `error`, ruta ostaje, a prikazuje se poruka sa retry-em. Ne koristi se `isCompleted: false`.
- **Gate otključava samo na uspjeh** (ili na 403, gdje se jasno javlja „pogrešan token“). Ostalo prikazuje grešku.
- **Koraci imaju tri stanja** (`loading`, `error`, `ready`), kao što već ima `services-page`. Formu ne prikazivati dok stanje nije poznato.
- **Jedan izvor statusa** kroz kontekst, bez drugog zahtjeva na `/install`.
- **Obrisati mrtvi `resolveInstallWizardStep`** ili ga vratiti kao jedinu mašinu koraka, i ispraviti komentar.

Tim preporučuje e2e za: pad `/install/status` na završenoj instalaciji (ne smije se preusmjeriti), pogrešan token (poruka), greška mreže na gate-u (ostaje zaključano), i izmjena postojeće prijave kroz korak (ne prepisuje se bez potvrde).

---

## Bugovi i neusklađenosti

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| IN1 | Visoka | Greška `/install/status` pri pokretanju preusmjerava sve rute na `/install`, uključujući prijavljene korisnike i `/login`. | `app/install-setup-provider.tsx` (catch), `app/install-setup-layout.tsx`, `lib/resolve-install-gate-navigation.ts` |
| IN2 | Visoka | `InstallTokenGate.submit`: svaka greška osim 403 i `INSTALL_TOKEN_NOT_CONFIGURED` otključava čarobnjak bez provjere tokena. | `components/install/install-token-gate.tsx` (`toGateError`, `submit`) |
| IN3 | Visoka | Greška učitavanja koraka daje praznu ili podrazumijevanu formu. Snimanje može prepisati postojeću konfiguraciju (prijava na `local`, SMTP na `disabled`). | `install-login-provider-step.tsx`, `install-smtp-step.tsx`, `install-super-admin-step.tsx`, `install-seed-step.tsx`, `install-addons-step.tsx` |
| IN4 | Srednja | Greška statusa na `/install` vraća korak na `superAdmin`, pa se na završenoj instalaciji prikazuje forma za kreiranje. | `pages/install-page.tsx` (`.catch`) |
| IN5 | Srednja | Status se na `/install` učitava dva puta (provider i ljuska). Aplikacija čeka isti zahtjev prije svakog prikaza. | `install-setup-provider.tsx`, `pages/install-page.tsx` |
| IN6 | Niska | `resolveInstallWizardStep` nije korišten u produkciji. Komentar u `install-page.tsx` tvrdi suprotno. `InstallWizardStep` tip je definisan dvaput. | `lib/resolve-install-wizard-step.ts`, `services/install-api.ts` (3), `pages/install-page.tsx` (21) |
| IN7 | Niska | Token u `sessionStorage` je dostupan svakoj skripti na stranici. Inicijalizacija gate-a ne provjerava zastarjeli token. | `lib/install/install-token-store.ts`, `install-token-gate.tsx` (`useState`) |
| IN8 | Niska | Zaglavlje i raster ponovljeni u gate-u i ljusci. Gate JSX ima pogrešnu indentaciju. | `install-token-gate.tsx`, `pages/install-page.tsx` |
| IN9 | Niska | Oznake revizija i plana u komentarima („Review 2026-09-25 (S4)“, „Review N9“, „Paket 5.1 (M1 #1)“, „Pulse install wizard“). | `install-token-store.ts`, `install-token-gate.tsx`, `install-super-admin-step.tsx`, `install-page.tsx`, `router.tsx` |
| IN10 | Niska | `fallbackPasswordPolicy` duplira serversko pravilo (12/128, blocklist). | `install-super-admin-step.tsx` |
| IN11 | Niska | Nema povratka na prethodni korak. Seed se pokreće bez opisa posljedica. | `pages/install-page.tsx`, `install-seed-step.tsx` |
| IN12 | Niska | Hint pravila lozinke nije povezan sa poljem. Polja Entra i LDAPS nemaju opis. | `install-super-admin-step.tsx`, `install-entra-ad-fields.tsx`, `install-ldaps-bind-fields.tsx` |
| IN13 | Niska | Obrazac učitavanja koraka ponovljen u šest komponenti. Pet fajlova `map-install-*-error.ts` ima isti obrazac kao u modulu 10. | `components/install/*`, `lib/map-install-*-error.ts` |
| IN14 | Niska | Nema komponentskih testova za korake i gate. E2E ne prolazi kroz UI čarobnjaka. | `frontend/src/components/install/`, `e2e/helpers/ensure-install.ts` |

---

## Ocjena: 5/10

Obrazloženje:
- **Plus:** tok vodi server (`nextStep`), backend zaključava mutacije na završenoj instalaciji i traži token za zaštićene putanje, greške su tipizovane i prikazuju se u `role="alert"`, polja za lozinku i tajne su pravilno označena, `/_visual-qa` je samo u development buildu, a lib sloj je pokriven testovima.
- **Minus:** prolazna greška na pokretanju preusmjerava sve korisnike na instalaciju (IN1), gate otključava na grešku mreže (IN2), greška učitavanja može prepisati konfiguraciju (IN3), fallback na prvi korak na završenoj instalaciji (IN4), dupli zahtjevi i mrtav kod, nema komponentskih ni UI e2e testova.
- Ocjena je ispod modula 9 i 10 jer IN1 i IN3 utiču na sve korisnike, odnosno na podatke konfiguracije, a ne samo na jedan ekran.

---

## Must-Have kandidati (modul 11)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **IN1:** stanje statusa sa `error` stanjem, bez `isCompleted: false` pri grešci; ruta ostaje ista, a poruka ima retry. Potvrditi simulacijom greške `/install/status`.
2. **IN2:** gate otključava samo na uspjeh ili na jasno 403; ostale greške se prikazuju. Token se ne čuva prije provjere.
3. **IN3:** svaki korak ima `error` stanje sa retry-em; forma se ne prikazuje dok stanje nije poznato. Posebno: prijava i SMTP.
4. **IN4:** fallback na `superAdmin` zamijeniti greškom.
5. **IN5:** jedno učitavanje statusa kroz kontekst.
6. **IN6:** obrisati ili vratiti `resolveInstallWizardStep`; jedan `InstallWizardStep` tip.
7. **IN14 (e2e):** pad statusa na završenoj instalaciji (bez preusmjeravanja), pogrešan token (poruka), greška mreže na gate-u (zaključano), izmjena prijave ne prepisuje bez potvrde.
8. **IN9, IN8:** ukloniti oznake revizija iz komentara, ispraviti indentaciju gate-a (sa Prettier-om).
9. **IN7:** token u memoriji tab-a ili provjera pri svakom otvaranju; razmotriti.
10. **Cross-cutting (sa modulima 5, 10, 16):** zajednički obrazac za `map-*-error` i `useEffect` učitavanja.

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.

## Status ispravki (Paket 6.1.1)

- **IN1 (urađeno):** greška pri učitavanju statusa više ne postavlja `isCompleted: false`. Gate prikazuje `InstallStatusError` sa dugmetom za ponovni pokušaj (vidjeti `01-ljuska-routing-navigacija.md`, B1).
- IN2, IN3, IN4, IN5, IN6, IN7, IN9, IN14: otvoreno, rade se u paketu 6.1.11.
