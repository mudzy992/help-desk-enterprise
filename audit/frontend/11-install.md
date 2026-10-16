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

## Status ispravki (Install wizard v2 — F0 + F1, 2026-10-15)

Obim ove sesije: samo **F0 (stabilizacija)** i **F1 (backend osnova)** iz `.cursor/plans/install-wizard-v2/`. F2–F6 (identitet, tim, nova ljuska, standard/full sadržaj, E2E 51/52, dashboard checklista) nisu rađeni.

**Zatvoreno**

- **IN2 (urađeno, F0.1):** `install-token-gate.tsx` otključava **samo** na uspješan `GET /install/super-admin`. Token se šalje kandidatom (`loadInstallSuperAdmin(token)`), a u `sessionStorage` upisuje tek nakon uspjeha; mrežna greška, 5xx i timeout ostavljaju gate zatvoren uz `install.tokenUnavailable` i „Pokušaj ponovo“; `INSTALL_TOKEN_INVALID`/403 i `INSTALL_TOKEN_NOT_CONFIGURED` imaju svoje poruke i brišu sačuvani token. Test: `install-token-gate.spec.tsx` (5 slučajeva).
- **IN3 (urađeno, F0.2):** novi `lib/install/use-install-step-resource.ts` (`loading | error | ready`, retry, cancel na unmount, `setData` nakon snimanja) + `components/install/install-step-load-error.tsx` (poruka, request id, retry). Primijenjeno na super admin, prijava, SMTP, seed i dodatke: u `error` stanju forma se **ne** renderuje. Testovi: `use-install-step-resource.spec.tsx`, `install-step-load-error.spec.tsx`, `install-smtp-step.spec.tsx` (dokaz da nema polja ni dugmeta).
- **IN4 (urađeno, F0.3):** `pages/install-page.tsx` nema više lokalni `setStep` ni `.catch(() => setStep("superAdmin"))`; korak se računa iz konteksta (`resolve-rendered-step.ts`), a fallback je prvi korak koji paket još blokira (`steps.<key>.blocking`), nikad slijepo prvi korak.
- **IN5 (urađeno, F0.3):** status čita samo `InstallSetupProvider` (`nextStep`, `steps`, `profile`, `readiness`); korak nakon snimanja zove `reload()`, a osvježavanje zadržava prikazani ekran umjesto da vrati skeleton.
- **IN1 (ostaje urađeno, potvrđeno):** provider i dalje na grešku ide u `error` stanje; dopunjen test u `install-setup-layout.spec.tsx` mock-om readiness poziva.
- **Nalaz „complete bez readiness provjere“ (urađeno, F0.7):** `evaluate-install-readiness.ts` (čista funkcija, 8 provjera iz `00_overview.md` §3) + `read-install-readiness-source.ts`; `install-complete.service.ts` odbija nedovršenu instalaciju sa `409 INSTALL_NOT_READY` i `details.missing`; frontend `map-install-complete-error.ts` prevodi u `install.complete.notReady` i ispisuje listu kroz `install.readiness.<key>`. Testovi: `evaluate-install-readiness.spec.ts`, `install-complete.service.spec.ts` (novi slučaj), `map-install-complete-error.spec.ts`.
- **Nalaz „korak Dodaci se preskače nakon osvježavanja“ (urađeno, F0.5):** `read-install-step-states.ts` računa `addons.completed` iz `has-saved-install-addons.ts` (bar jedan upisan `private.addons.*` ključ). Test: `install-setup.addons.spec.ts`. Frontend prikazuje `install.addons.notSavedHint` dok korak nije potvrđen.
- **Nalaz „prazna fallback grupa“ (urađeno, F0.6):** `seed-install-minimum.ts` poziva `ensure-install-fallback-group-member.ts`, koji kroz istu domensku funkciju kao `POST /groups/:groupId/members/:userId` (`addGroupMember`) dodaje SuperAdmina u grupu; ponovljeni seed ne duplira članstvo (test u `install-seed.reuse.spec.ts` / gotovini wizarda).
- **Greške bez `role="alert"` (urađeno, F0.4):** seed, SMTP, prijava i završetak sada imaju `role="alert"`; super admin je imao samo listu pravila lozinke, pa je dodat i na opštu grešku.
- **IN13 (djelimično):** obrazac `useEffect` + `isCancelled` + skeleton zamijenjen jednim hookom u pet koraka; `InstallStepLoadError` je jedan zajednički prikaz.

**Novi nalazi iz F0/F1**

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| IN15 | Srednja | `GET /install/status` sada nosi `profile` i `steps.<key>.{skipped,required,offered,blocking}`, ali ljuska ih još ne koristi (korak paketa nema UI) — do F3 stanje je vidljivo samo kroz API. | `frontend/src/pages/install-page.tsx`, `lib/install/resolve-rendered-step.ts` |
| IN16 | Niska | Katalog paketa vraća `labelKey` oblika `install.profile.item.<key>`; prijevodi tih ključeva još nisu upisani (F3 ih dodaje uz ekran paketa). Do tada bi ekran paketa prikazao sirove ključeve. | `backend/src/modules/install/install-profile.catalog.ts`, `frontend/src/i18n/locales/{bs,en}/common.json` |
| IN17 | Niska | Zatvoren u F3: „Podesi kasnije“ je u footeru ljuske za svaki `skippable` korak, ostatak je opisan u F3 bloku. | `frontend/src/components/install/`, `services/install-profile-api.ts` |
| IN18 | Niska | Zatvoren nakon F3: install ključevi nose `readOnly` metadata, red u listi ima oznaku „Čarobnjak“, a dijalog prikazuje objašnjenje bez editora i bez dugmeta za snimanje. | `backend/src/modules/settings/definitions/install-wizard-settings.ts`, `frontend/src/components/settings/settings-registry-row.tsx` |

**I dalje otvoreno**

- **IN6:** `resolveInstallWizardStep` nije korišten u produkciji (samo `installWizardCopyKeys` iz istog fajla); `InstallWizardStep` tip postoji u `services/install-api.ts` i `lib/resolve-install-wizard-step.ts`. Uklanjanje je dio F3 ljuske.
- **IN7:** token je i dalje u `sessionStorage` (ranije se nije provjeravao; sada se pri mountu tiho provjerava i briše ako padne). Prelazak na memoriju tab-a nije u obimu F0/F1.
- **IN8, IN9, IN10:** zaglavlje/raster gate-a i ljuske i dalje su dva mjesta; `fallbackPasswordPolicy` i dalje postoji kao fallback dok serverska pravila ne stignu (namjerno, sa komentarom); oznake tipa „F0.1 (IN2)“ u komentarima su zadržane kao i ostatak repoa.
- **IN11, IN12:** povratak na prethodni korak i `aria-describedby` za hint lozinke/Entra/LDAPS polja — F3.
- **IN14:** dodati komponentski testovi (gate, hook, load error, SMTP korak, provider/ljuska), ali još nema testova za svaki korak niti E2E prolaska kroz UI čarobnjaka (F6, projekat `install-wizard`, scenariji 51/52).

**Status nakon F2 (Minimum sadržaj)**

- **IN16 (i dalje otvoreno):** prijevodi `install.profile.item.*` čekaju F3 ekran paketa.
- **IN17 (djelimično urađeno, F2.3):** korak **Tim** sada ima dugme „Podesi kasnije“ (`install.step.skip` → `skipInstallStep("team")`) i time je Minimum završiv bez tima; SMTP i dodaci dobijaju isto dugme u F3, a povratak na odgođeni korak (`install.step.undoSkip`) tek sa ljuskom F3.
- **IN18 (i dalje otvoreno, prošireno):** sada su vidljiva i dva nova ključa (`private.install.steps.{identity,team}.skipped`) — read-only oznaka u metadata-i je F3.
- **Novi koraci nose isti F0 obrazac:** `install-identity-step.tsx`, `install-structure-step.tsx` (zamjenjuje `install-seed-step.tsx`) i `install-team-step.tsx` renderuju formu isključivo iz `useInstallStepResource` stanja `ready`, a grešku prikazuje `InstallStepLoadError` — IN3 je time pokriven i za F2 korake (testovi u `install-identity-step.spec.tsx`, `install-structure-step.spec.tsx`, `install-team-step.spec.tsx`).
- **Privremene lozinke:** `install-team-credentials-dialog.tsx` prikazuje ih jednom (odluka vlasnika 2) i nikad ih ne čita ponovno; `temporaryPasswordDelivery = email` se prikazuje kao poruka bez lozinke.
- **IN15 (i dalje otvoreno):** `steps.<key>` iz `GET /install/status` sada uključuje `identity`/`team` i ljuska ih renderuje, ali ekran izbora paketa i dalje čeka F3.
- **IN14 (djelimično):** dodati komponentski testovi za tri F2 koraka + `install-identity-form.spec.ts`; E2E prolaz kroz UI (F6) ostaje otvoren.

**Status nakon F3 (ljuska)**

- **IN15 (zatvoren, F3):** ekran izbora paketa postoji i `GET /install/status` se koristi u cijelosti — `profile`, `steps.<key>.{completed,skipped,required,offered,skippable,blocking}`; rail crta stanja iz istog payloada, a korak paketa je **prvi i blokira**.
- **IN16 (zatvoren, F3):** `install.profile.item.*` prijevodi (27 stavki) su u oba lokalata, uz `install.profile.{recommended,estimate,showAll,showAllHint,itemRequired,itemOptional,customize,customizeHint,customizeFootNote,lockedHint,current,errorSuperAdmin}` i `install.shell.*`/`install.whatYouGet.*`.
- **IN17 (zatvoren, F3):** „Podesi kasnije“ je sada u footeru svakog koraka koji registry označi `skippable` (SMTP, tim, dodaci), a `install.step.undoSkip` („Vrati u tok“) radi iz pregleda odgođenog koraka. Odluka ide preko `steps.<key>.skippable` iz statusa — UI ne vodi svoju listu dozvoljenih koraka. Korak **Tim** je pri tome izgubio vlastito dugme (F2) da dozvola ostane na jednom mjestu.
- **IN6 (zatvoren, F3):** obrisani `lib/resolve-install-wizard-step.ts` i njegov spec; redoslijed/ikone/naslovi/„Šta dobijaš“ žive u `lib/install/install-step-presentation.ts`, a `pages/install-page.tsx` je kompozicija (94 linije).
- **IN11 (zatvoren, F3 + nalazi):** povratak na prethodni korak postoji i **namjerno je pregled, ne kursor** — `useInstallStepNavigation` otvara samo korak koji paket nudi i koji je već odgovoren (završen ili odgođen), nikad zaključan ili neodgovoren, i resetuje se čim server pomjeri korak. `aria-describedby` je dodan na polja s napomenom (lozinka foundera + pravila politike, SMTP lozinka, Entra tenant/client, LDAPS bind, time zone i logo) — napomena koja objašnjava polje sada putuje s poljem, a kod Entra/LDAPS je i izmještena iz `<label>` da ne ulazi u pristupačno ime kontrole.
- **IN18 (zatvoren):** `SettingDefinitionCommon.readOnly` + `SettingRegistryEntry.readOnly`; svi ključevi čarobnjaka (`private.install.profile` + osam `steps.*.skipped`) su označeni, red u registry listi nosi oznaku „Čarobnjak“, a detalj prikazuje `settings.detail.readOnlyHint` uz onemogućen editor i bez snimanja. API namjerno **ne** odbija ručni `POST /settings/*` — ovo je metadata za UI, ne novo pravilo.
- **F4 (SMTP test, predlošci, policy pack, SLA pregled, dodaci):** čarobnjak sada provjerava ono što obećava. `POST /install/smtp/test` šalje probnu poruku i vraća kod po uzroku (`auth`, `TLS`, `host nedostupan`, `timeout`, `send`) uz `SMTP_TEST_RATE_LIMITED`; panel je ugašen dok SMTP forma ima nesačuvane izmjene (`install-smtp-test-panel.tsx`). `POST /install/blueprints/apply` gradi katalog `itServiceDesk` (5 kategorija / 10 servisa) idempotentno po slugu i **dokazuje** `EXACT` ruting za svaki servis prije commita. `GET/POST /install/policy-pack` primjenjuje paket iz predloška i poštuje `private.policyPacks.disabledKeysCsv`. `GET/POST /install/sla-review` razlikuje „potvrđujem zadano“ (samo marker) od stvarne izmjene (`updateBusinessHoursCalendar` / `patchPriorityMatrix`, `reason: 'install_wizard'`). Dodaci su predstavljeni karticama s ikonom i rečenicom vrijednosti umjesto tehničkih opisa iz kataloga, a paketni defaulti su stvarni (Full uključuje CMDB/probleme/promjene). Nalazi 8 (aria) i 11 (UX povratka) ostaju zatvoreni iz F3/F4 blokova; **IN14 i dalje otvoren** u dijelu „E2E prolaz kroz UI čarobnjaka“ (F6, zaseban projekat nad praznom bazom, scenariji 51/52) — komponentski testovi su prošireni na svaki F4 korak.
- **IN14 (djelimično, F3):** dodati specovi za ljusku (rail stanja, fokus na naslov, reduced motion), feature karticu (zavisnost gasi switch) i ekran paketa (izbor, odgađanje vs zaključano, `errorLocked`) + `use-install-step-navigation.spec.tsx`; E2E prolaz kroz UI (F6) ostaje otvoren.
- **IN19 (zatvoren):** `planInstallProfileReset` sada prima i `previousProfile` i vraća `reopenedStepKeys` — koraci koje novi paket **traži**, a stari ih je samo nudio. `InstallProfileService` briše odgodu samo ako je stvarno bila postavljena (`progress[key].skipped`), u istoj transakciji kao izbor paketa i s istim change-log zapisom, a odgovor `POST /install/profile` nosi `reopenedSteps`. Ljuska iznad vraćenog koraka pokaže `install.shell.reopened` („Novi paket traži ovaj korak…“), pa odgoda pod Minimumom nije tihi odgovor za Standard — operator je donosi ponovno, svjesno. F1 pravilo („koraci koji ostaju zadržavaju stanje“) i dalje važi za sadržaj koraka; mijenja se samo **odgoda**.
- **Popravljeno u F3:** `/install` nije bio unutar `InstallSetupLayout`, pa je neuspješno čitanje statusa prikazivalo skeleton bez izlaza; sada `error` → `GateStatusError` sa „Pokušaj ponovo“.
- **Otvoreno za F6 (kriterij prihvatanja F3):** Lighthouse a11y za `/install` ≥ 95 nije mjeren (nema browsera u sesiji) — urađeni su `vite build`, `tsc`, eslint, prettier i RTL testovi.
- **Nađeno iz CI-ja nakon zatvaranja nalaza:** `install-step-rail.tsx` je koristio `text-muted-foreground/60` i `/80` — `scripts/check-theme-contrast.mjs` (provjera C) ih odbija jer muted token s alfom pada ispod 4.5:1; stanja „locked“/„upcoming“ sada nosi isprekidana ivica i naslov. U istom CI prolazu pao je i `app.module.spec.ts`: šest install servisa uvozilo je `PrismaService` kroz `import type`, pa Nest nije mogao razriješiti parametar konstruktora (vidi `install-di-metadata.spec.ts`).
- **Popravka testnog dvojnika (nađena uz IN19):** `createInMemorySettingsPrisma().appSetting.deleteMany` je razumio samo `key: string`, pa je F1 reset paketa (`key: { in: [...] }`) u testovima brisao **ništa** i prolazio. Dvojnik sada podržava i `{ in: [...] }` kao Prisma, a `install-profile.service.spec.ts` dokazuje da se odgođena zastavica stvarno briše.

**Status nakon F6 (završetak — provisioning, gotov ekran, checklist)**

- **Zatvoreno u F6 — nalaz 12 / IN14 (E2E dio):** instalacija se sada **može** dokazati kroz UI. `e2e/install-wizard/` je zaseban Playwright projekat (vlastiti `globalSetup` koji samo čeka `/health`, jer zajednički `ensureInstall` završava instalaciju koju spec upravo hoda), sa specovima **51 (Minimum)** i **52 (Standard)**: token gate → paket → SuperAdmin → identitet → lokalna prijava → SMTP (Standard: pravi test mail) → struktura → tim → blueprint → policy pack → SLA pregled → preporuke → dodaci → **provjera spremnosti** → **„Sistem je spreman“**, pa prijava na `/login` i stvarni rutirani tiket (51) odnosno katalog iz predloška i pozvani agent (52). Nalaz je zatvoren u dijelu koji se **može** izvršiti u ovom okruženju: specovi su napisani, tipski provjereni (`tsc --noEmit`) i uvezani u CI kao posao `e2e-install-wizard` (dispatch input `install_spec=51|52`; normalni `e2e` posao se tada povlači). **Mjerenje ostaje za okruženje vlasnika** — sandbox nema Docker, bazu, browser ni stvarnu instalaciju, pa se prolaz 51/52 i Lighthouse a11y za `/install` broje kao *napisano i pripremljeno*, ne kao *izmjereno*.
- **F6.1 (novo, nalaz 10):** „Završi“ više nije dugme u zadnjem koraku forme koje se nada najboljem. Postoji korak **Provjera spremnosti**: lista provjera s `aria-live="polite"`, sr-only riječju statusa (`Ready`/`Missing`/`Deferred` — ikona sama ne nosi značenje), porukom i **„Idi na korak“** na crvenoj stavci; dugme za završetak postoji **samo** dok su sve provjere zelene, a odbijen `complete` ispisuje šta nedostaje i sam ponovo čita stanje. `roles` je jedina crvena stavka bez koraka (sistemske uloge nijedan korak ne pita), pa nema lažnog linka.
- **F6.2 (novo):** gotov ekran nije više mrtva potvrda. Prikazuje sažetak instalacije (paket, organizacija, OU/servisi/grupe/članovi, uključeni dodaci, odgođeno) i tri prva koraka — prvi tiket, poziv timu (samo kad je tim zaista odgođen) i podešavanja. Prijave nema (odluka vlasnika 1): ekran nudi `/login`. Sažetak dolazi uz `GET /install/status` i to samo dok instalacija nije završena.
- **F6.3 (novo):** obećano „kasnije“ više ne nestaje tiho. Kartica **„Završite podešavanje“** na dashboardu nabraja tačno ono što je odgođeno i ono što preporuke nisu zadovoljile; svaka stavka vodi na ekran koji je rješava i **nestaje sama** kad stvar iza nje postoji (nema ručnog „označi kao riješeno“), a **Sakrij** sklanja karticu bez brisanja stavki. Neuspješno čitanje karticu sakrije umjesto da doda drugu grešku na dashboard koji ih već ima.
- **a11y (F6):** status svake provjere je tekst (sr-only riječ) uz ikonu, fokus i dalje ide na naslov koraka, a provjere su obična lista — bez animacije koja bi trebala reduced-motion izuzetak.
- **Otvoreno (IN20):** dolazni e-mail i LDAPS se i dalje ne testiraju iz čarobnjaka (nema rute ni dugmeta; F5/odluka vlasnika 8). Put za buduću rutu je izmjeren: `InboundEmailAdminService.testConnection()` i `DirectoryFullSyncService.testConnection(actorUserId)`.
- **Otvoreno (IN21):** ops-only ponovno pokretanje je isporučeno (`POST /install/restart` + `cli:install-rerun` + runbook), pa se čarobnjak može otvoriti i bez prazne baze — upravo na tome počiva i E2E projekat (spec 52 poslije 51 traži ponovno otvaranje).
- **Za vlasnika:** CI posao wizarda i njegov način pokretanja (dispatch input nasuprot zasebnom reset-stack poslu) su jedina stvar iz F6 koja čeka **potvrdu**, kako i piše u planu faze.
- **Ispravke poslije recenzije CI-ja (2026-10-16):** dvije stvari koje je CI našao su zatvorene. (1) **Kontrast:** dva `text-primary` na *neutralnoj* površini (link „Idi na…“ u `setup-checklist-item.tsx` i vodeća ikona kartice u `install-first-steps.tsx`) su sada `text-link` — §22.1 traži `text-primary` samo na primary ispuni, jer indigo na tamnoj površini daje 4.00:1 (a `text-link` 8.58:1); `scripts/check-theme-contrast.mjs` je zelen. (2) **DI:** `SetupChecklistModule` je uvažavao samo `SettingsModule`, pa se `SessionAuthenticationGuard` nije mogao razrješiti i `app.module.spec.ts` je padao; modul sada uvozi `AuthenticationModule` + `AuthorizationModule`, a novi `setup-checklist.controller.spec.ts` (6 slučajeva: gardovi i metapodaci, `@AdminReadOperation()` samo na GET-u, uvezeni moduli, `403` bez aktera, odjava bez brisanja stavki) čuva i to i stavku plana „bez sesije 401, bez `settingsWrite` 403“.
- **Treća ispravka iz iste recenzije:** `scripts/check-workflows-yaml.test.mjs` je uslov običnog E2E posla držao kao fiksni string, pa je pao na F6 izuzetku za wizard dispatch (`inputs.install_spec == ''`). Očekivanje je ažurirano, a test sada pinuje **par**: wizard posao traži `install_spec != ''`, obični E2E se tada povlači — promjena jedne strane bez druge pada glasno (`node --test scripts/check-workflows-yaml.test.mjs` 6/6).
- **Izmjereno poslije ispravke:** backend **637 prošlo / 5 preskočeno (642 suita), 3320 testova, 0 padajućih** (uključujući `app.module.spec.ts` i `modules/setup-checklist` 2 suite / 9 testova) i frontend **248 / 1062**; `tsc -b`, `eslint`, `format:check` i svih 10 guard skripti (uključujući kontrast) zeleno.

**Status nakon redizajna „Aurora“ (2026-10-16, u radnom stablu)**

- **Zahtjev vlasnika:** vizualni redizajn čarobnjaka, „posebna priča“ od ostatka aplikacije, uz uslov da E2E ugovor (specovi 51/52/53) ostane nepromijenjen. Obim je bio **isključivo vizualni** — nijedan endpoint, korak, ključ ponašanja ni E2E selektor nije mijenjan.
- **IN14 — „E2E prolaz kroz UI čarobnjaka“ je izmjeren i zelen (2026-10-16):** vlasnik je pokrenuo specove **51/52/53** i prošli su, i to sa **aktivnim** aurora animacijama (Playwright config ne postavlja `reducedMotion`). Ono što je do sada bilo „napisano i pripremljeno“ sada je i potvrđeno na stvarnoj instalaciji; od IN14 ostaje **Lighthouse a11y za `/install` ≥ 95**.
- **Nalaz 8 (zaglavlje/raster na dva mjesta) je zatvoren ovim redizajnom, a ne F3/F4 blokom:** `install-brand-panel.tsx` i `install-mobile-header.tsx` su **obrisani**; jedini raster sada nose HUD (`install-top-bar.tsx`, `role="progressbar"` i segmenti na svim širinama) i plan leta (`install-flight-plan.tsx`, rail + „Šta dobijaš“ na `lg` i više). Mobilni „Šta dobijaš“ bottom-sheet je time nestao — prihvaćeno kao dio dizajna.
- **Tema je scoped, ne globalna:** `data-install-theme="aurora"` stoji na `<html>` samo dok je `/install` montiran (`lib/install/use-install-theme.ts`), pa `/login` nakon završetka ostaje na Pulse temi, a `index.css` (Pulse tokeni, `data-theme`/`data-accent`) nije diran. Radix portali (sheet paketa, dijalog sa privremenim lozinkama, toast) naslijede paletu jer atribut stoji na `<html>`.
- **E2E ugovor je sada pinovan, ne samo poštovan:** novi `components/install/install-wizard-e2e-markup.spec.tsx` (jedini `h1`, tijelo prije footera, `#install-token`, `ul[aria-live="polite"] li`, `/login` link) + 2 testa u `shell/install-wizard-shell.spec.tsx` (prvi `form button[type="submit"]` je submit same forme, sva dugmad footera `type="button"`). Copy čuvar `install-wizard-e2e-copy.spec.ts` netaknut (92).
- **Kontrast (IN14 dio) je izmjeren, ne procijenjen:** prva verzija stakla imala je sjaj bez osnovne boje i muted tekst je na najsvjetlijem pikselu aure padao na **2,9:1**. Sada `--iw-panel` (11 16 32 na 0,88) daje ink 12,6 · soft 6,9 · dim 4,7 · akcenti 5,2–10,0; HUD 14,5/7,9/5,4; `ink-on-accent` 10,6–12,6. Iz toga je izvedeno pravilo koje sada stoji u `install-theme.css`: **nijedan sekundarni tekst ne stoji na goli canvas** (canvas nosi samo naslov i dekoraciju). Brojke su pod, ne prosjek — računate su preko piksela kojeg stvarni render ne dostiže.
- **Pokrivenost shima je zatvorena skenerom:** semantičke Tailwind klase koje koraci koriste moraju biti preusmjerene, inače tiho slikaju Pulse tokenima i nijedan test to ne vidi. Skener nad `components/install/**`, odabranim `components/ui/*` i ljuskom našao je 33 takve klase i **1 neprekrivenu** (`focus-visible:outline-primary/70` iz `sheet.tsx`), koja je dobila pravilo; uz nju su zatvorene i `checked:bg-primary` (checkbox), `bg-warning/10` (warning), `bg-warning/5` + `border-warning/30` (panel-error-boundary). **Urađeno istog dana:** `scripts/check-install-aurora.mjs` je sada taj čuvar (CI, `frontend` posao) — izvodi najsvjetliji piksel iz `.iw-backdrop` slojeva, preračunava sve brojke iz kontrastne tablice (13 redova, ±0,15), odbija `.iw-panel` bez neprozirne osnove i pada na utility klasi bez shima (26 klasa, 0 praznina).
- **E2E rizik redizajna (provjeren poslije commita, 2026-10-16):** ugovor o selektorima drži (jedini `h1`, tijelo prije footera, `div.rounded-lg.border`, `ul[aria-live="polite"] li`, `#install-token`, `/login` link) i sada je pinovan čuvarima. Nađena su tri rizika koja testovi ne vide: mrtvi `iw-spin` na airlocku (`.iw-rise` ga je prepisivao — a bez `iw-rise` bi rotirajući kontejner oborio Playwright-ovu stability provjeru i klik na token submit), sweep bez `pointer-events: none` nad redovima koji nose dugme, i sticky HUD bez `scroll-padding-top`. Svi popravljeni, a klasa kvara je automatizovana novim check-om B u `scripts/check-install-aurora.mjs`.
- **Provjera bez backenda:** dev-only ruta `/install-preview` (airlock, korak u ljusci, liftoff) i prerađena Visual QA tabla. Ruta postoji samo pod `import.meta.env.DEV` i **nije** u produkcijskom bundle-u (provjereno grep-om nad `dist/static/*.js`).
- **Izmjereno (sandbox):** `npx vitest run` → **302 fajla / 1271 test** zeleno, `tsc -b` 0 grešaka, `eslint` 0 grešaka / 12 postojećih upozorenja, `prettier --check` čist, `vite build` OK (14 s, `index-*.css` nosi `--iw-panel` i 71 aurora pravilo), 11 guard skripti i 7/7 `scripts/*.test.mjs`. Usput je popravljen **postojeći** flake u `install-page.spec.tsx` (dokazano `git worktree`-om na `ad1be77`: padao u 1 od 3 prolaza) — tijelo koraka se čitalo prije nego se učita, jer ime koraka odmah ispiše plan leta.
- **Zatvoreno:** prolaz 51/52/53 kroz UI je vlasnik izmjerio — **zelen** (2026-10-16); redizajn je commitovan (`6c4a4ad`). **Otvoreno:** izgled u browseru vidi se samo kod vlasnika (`/install-preview`, `/_visual-qa` — sandbox nema Chromium), Lighthouse a11y za `/install` ≥ 95 se još mjeri (IN14), a IN20 (inbound/LDAPS) je nepromijenjen.

**Ocjena nakon F6: 9,5/10 (poslije recenzije CI-ja i njenih ispravki).** Modul je zatvoren kao tok: paket vodi korake, korak se može odgoditi, odgoda se vidi i rješava, završetak je moguć samo kad instalacija stvarno prima tikete, a ono što je ostavljeno za kasnije ima svoje mjesto na dashboardu. Do 10 drže samo mjerenja koja se ne mogu izvesti bez stvarnog okruženja (Lighthouse za `/install`, prolaz 51/52 na živoj instalaciji) i jedan nedostatak po dizajnu (IN20: veze prema LDAPS-u i dolaznom e-mailu se ne testiraju u čarobnjaku).

**Ocjena nakon F3 + nalaza: 9,0/10.** Prvi utisak je sada proizvod, a ne forma: brend pano nosi **stvarne** podatke instalacije, paket je prvi i obavezni korak, „Prilagodi“ mijenja tok kroz server (ne kroz UI trik), odgađanje i povratak su konzistentni u svakom koraku, a motion je ograničen i isključiv po sistemskoj postavci. Sva tri nalaza koja su držala ocjenu (IN19 u semantici paketa, IN18 read-only u registry ekranu, IN11 `aria-describedby`) su zatvorena, pa je jedina preostala stavka E2E prolaz kroz UI i mjerenje a11y u F6.

**Ocjena nakon F2: 7,5/10.** Minimum je sada stvarno sadržajan (identitet, klijentski nazivi strukture, prvi servis sa SLA profilom, tim), svi novi koraci drže F0 obrazac (nema forme bez poznatog stanja), a „Podesi kasnije“ postoji u najmlađem koraku koji ga je u Minimumu i tražio. Ocjena ne ide više jer ekran paketa, opšte odgađanje iz UI-a i E2E pokrivenost još nisu tu (F3/F6).

**Ocjena nakon F0/F1: 7/10.** Tok je sada konzervativan (nema forme bez poznatog stanja, nema otključavanja bez provjere, nema slijepog fallbacka, nema završetka bez readiness provjere), a server je jedini izvor stanja i paketa. Ocjena ne ide više jer su korisnički dijelovi paketa (izbor, odgađanje, povratak, checklista) još bez UI-a i bez E2E pokrivenosti, a dvije stvari iz IN6/IN7 ostaju tehnički dug.
