# Modul 2: Auth i sesija

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise` (HEAD `e0659824`)
Status: zatvoren (korisnička potvrda 2026-10-14). Must-Have 1–8 su urađeni; ranija provjera u ovom izvještaju bilježi da E2E 37/39 i provjera u pregledaču nisu bili pokrenuti.

Provjere izvršene u sandboxu:
- `@simplewebauthn/browser` verzija `14.0.0` (provjeren tip `platformAuthenticatorIsAvailable(): Promise<boolean>` u `node_modules`)
- Pretraga po obrascima rizika (`as unknown as`, `as never`, `eslint-disable`, `localStorage`, `console`, `dangerouslySetInnerHTML`) u cijelom modulu. `dangerouslySetInnerHTML` nije pronađen.
- Brojanje poziva `useSessionCapabilities()` po komponentama ljuske.
- Nije pokrenut pregledač. Nalazi A1 i A2 zasnovani su na čitanju koda i treba ih potvrditi ručno (vidi dolje).

---

## Modul

**Auth i sesija.** Obuhvata:
- prijavu (lokalnu i Microsoft Entra), obradu MFA koraka, prisilnu promjenu lozinke i prvu MFA postavku
- čuvanje sesije, obnavljanje tokena (keep-alive), odjavu i obradu 401 odgovora
- zaštitu sesijskih podataka (capabilities, uloge, permisije)
- korisnički profil „Sigurnost naloga“: lozinka, MFA, passkey, aktivne sesije
- CAPTCHA (Turnstile) na prijavi
- WebAuthn (passkey) ceremonije u browseru

Granica modula: `require-auth.tsx` i `require-access.tsx` su pregledani u modulu 1 i ovdje se pominju samo tamo gdje utiču na sesiju. `session-controls.tsx` je pregledan u modulu 1, ali je `SessionSignInControls` ovdje.

**Nisu pročitani u punom obimu** (pregledani su grep-om i djelimično): `passkey-section.tsx` (linije 1–200 i 200–356 samo grep), `mfa-section.tsx`, `mfa-code-dialog.tsx`, `password-section.tsx`, `change-password-form.tsx` (dio), `aaguid.ts`, `passkey-errors.ts`, `map-mfa-step-error.ts`, `describe-user-agent.ts`. Nalazi iz tih fajlova su označeni kao „djelimično pregledano“.

---

## Povezani fajlovi i folderi

**Stranice**
- `frontend/src/pages/login-page.tsx` (600 linija)
- `frontend/src/pages/auth-callback-page.tsx` (63)
- `frontend/src/pages/account-security-page.tsx` (182)

**Sesija i stanje**
- `frontend/src/lib/session/use-session.ts` (218)
- `frontend/src/lib/session/use-session-capabilities.ts` (63)
- `frontend/src/lib/session/session-keep-alive.ts` (88) + `.spec.ts`
- `frontend/src/lib/session/permission-keys.ts`, `session-role-label.ts`
- `frontend/src/services/session-store.ts` (68) + `.spec.ts`
- `frontend/src/services/session-api.ts`
- `frontend/src/services/api.ts` (204) + `api-unauthorized.spec.ts`, `api-empty-body.spec.ts`

**Auth API i Entra**
- `frontend/src/services/auth-api.ts` (183)
- `frontend/src/services/account-security-api.ts` (119)
- `frontend/src/lib/auth/entra-redirect.ts` (141) + `.spec.ts`
- `frontend/src/lib/auth/mfa-method.ts` (55) + `.spec.ts`
- `frontend/src/lib/auth/map-mfa-step-error.ts` + `.spec.ts`
- `frontend/src/lib/auth/describe-user-agent.ts` + `.spec.ts`

**WebAuthn (passkey)**
- `frontend/src/lib/webauthn/passkey-ceremony.ts` (113) + `.spec.ts`
- `frontend/src/lib/webauthn/passkey-errors.ts` (90) + `.spec.ts`
- `frontend/src/lib/webauthn/use-passkey-availability.ts` (30)
- `frontend/src/lib/webauthn/aaguid.ts` (59) + `.spec.ts`

**Komponente za prijavu**
- `frontend/src/components/auth/` (14 fajlova): `captcha-challenge.tsx` (150), `mfa-method-step.tsx` (141), `mfa-code-form.tsx` (119), `mfa-enrollment.tsx` (111), `change-password-form.tsx` (147), `identity-confirm-dialog.tsx` (124), `recovery-codes-panel.tsx` (73), `password-strength-meter.tsx` (67), `password-feedback.ts`
- `frontend/src/components/layout/session-controls.tsx` (108) i `session-sign-in-controls.tsx` (83)

**Komponente za profil**
- `frontend/src/components/account-security/` (8 fajlova): `passkey-section.tsx` (356), `mfa-section.tsx` (153), `password-section.tsx` (112), `sessions-list.tsx` (60), `mfa-code-dialog.tsx` (41), `password-expiry-banner.tsx` (40)

**Ostalo**
- `frontend/src/main.tsx` i `app/app.tsx` (samo provider `QueryClient`)
- `frontend/src/lib/query/query-keys.ts` (`accountSecurity`)

---

## Trenutna implementacija

**Model sesije.** Sesija je jedan JSON objekat u `localStorage` pod ključem `service-desk.session`: `{ accessToken, principal }` (`session-store.ts`). Čita se preko `readStoredSession()` sa keširanjem po sirovom stringu. `useSession()` ga pretplaćuje preko `useSyncExternalStore` i jedne ručne liste slušalaca (`emitSessionChange`). Ne postoji listener za `storage` event.

**Prijava.** `login-page.tsx` je konačni automat sa koracima: `credentials` → `change` (prisilna promjena lozinke) → `mfa` (kod ili passkey) → `enroll` (prva MFA postavka) → `codes` (rezervni kodovi) → sesija. `signIn()` vraća `SignInOutcome` koji određuje korak. Ako je korisnik na `/login` sa `pendingSignIn` u router state-u (iz header forme), korak se nastavlja tu.

**CAPTCHA.** Turnstile se prikazuje tek kad server vrati `CAPTCHA_REQUIRED` ili `CAPTCHA_FAILED`. Skripta se učitava na zahtjev (`captcha-challenge.tsx`). Token je jednokratan, pa se widget resetuje posle svakog odbijenog pokušaja.

**Entra (Microsoft).** `entra-redirect.ts` učitava MSAL lijeno. `startEntraSignIn` čuva konfiguraciju u `sessionStorage`, zatim radi `loginRedirect` sa `state = safeReturnPath(returnPath)`. `auth-callback-page.tsx` završava redirect, šalje ID token na `/auth/entra` i nastavlja na povratnu putanju.

**Obnavljanje sesije.** `startSessionKeepAlive` (`session-keep-alive.ts`) svake minute provjerava `exp` iz JWT-a. Ako je do isteka manje od 10 minuta i korisnik je aktivan (`pointerdown`, `keydown`, `scroll`, `visibilitychange`) u zadnjih 60 minuta, poziva `/auth/refresh` i upisuje novi token. Ako je token istekao, poziva `expireSession`.

**401 obrada.** `api.ts` poziva `unauthorizedHandler` (postavlja ga `RequireAuth`) na 401 odgovor na zahtjev koji je poslao token. Putanje za potvrdu MFA koda, passkey i rate-limit izuzete su (`confirmationPaths`), jer tamo 401 znači pogrešan kod, a ne isteklu sesiju.

**Odjava.** `useSession().signOut()` poziva `/auth/logout` (opozivanje na serveru, bez čekanja), briše lokalnu sesiju i pokušava Entra single logout.

**Capabilities.** `useSessionCapabilities()` na svaki poziv radi `getCurrentSession()` (`/auth/session`) i čuva rezultat u `useState`. Poziva se u 38 fajlova.

**Profil.** `account-security-page.tsx` čita `/auth/security` preko react-query (`queryKeys.accountSecurity`), a listu sesija preko `useState`/`useEffect`. Passkey sekcija, dijalozi za potvrdu identiteta i banner za istek lozinke dijele isti keš.

**Passkey.** `passkey-ceremony.ts` omotava `@simplewebauthn/browser` (`startRegistration`, `startAuthentication`) i vraća rezultat `ok` / `cancelled` / `unsupported` / `failed`. Server odlučuje o svemu bitnom (challenge, origin, counter).

---

## Realno/željeno stanje

| Oblast | Željeno | Realno |
|---|---|---|
| Greška pri učitavanju sesije | Mrežna greška ili 5xx ne odjavljuje korisnika | Svaka greška `/auth/session` postavlja `session = null`, pa `RequireAuth` poziva `signOut()`, a `signOut()` poziva `/auth/logout` (A1) |
| Obnavljanje tokena | Korisnik na stranici ostaje na stranici | Svako obnavljanje mijenja `accessToken`, što pokreće ponovo učitavanje capabilities i prikaz skeletona (A2) |
| Izvor istine za sesiju | Jedan zahtjev, jedan keš | 38 nezavisnih `useState` instanci, najmanje 7 zahtjeva pri svakom učitavanju osnovne ljuske (A3) |
| Više tabova | Odjava u jednom tabu važi u svim | Ostali tabovi nastavljaju dok se ne desi sljedeći render ili 401 (A4) |
| Passkey dostupnost | Passkey se nudi samo kad uređaj može da ga koristi | `browserCanUsePasskeys()` uvijek vraća tačno kad je WebAuthn podržan (A5) |
| CAPTCHA | Greška je vidljiva korisniku | Ako server traži CAPTCHA, a widget se ne može prikazati, dugme radi i nema poruke (A6) |
| Čuvanje tokena | Token nije dostupan JavaScriptu | Token je u `localStorage`, MSAL cache u `sessionStorage` (A8) |
| Tipovi WebAuthn odgovora | Validirani ili bar tipizirani | Dvostruki `as unknown as` cast bez validacije (A10) |
| Testovi kritičnih tokova | Testovi za sesiju, 401, prijavu i odjavu | Testovi za logiku pomoćnih funkcija postoje, ali ne za hookove ni stranice (A9) |
| Loaderi i greške na profilu | Skeleton, poruka i „pokušaj ponovo“ | Nema skeletona dok se učitava pregled, greška nema dugme za ponovni pokušaj |

---

## Gap analiza

**Kritični i visoki gapovi**

1. **Mrežna greška odjavljuje korisnika i poništava sesiju na serveru (A1).** `use-session-capabilities.ts:36-40` na bilo koju grešku postavlja `session` na `null`. `require-auth.tsx:61-63` na to poziva `signOut()`. `use-session.ts:195-205` poziva `logoutSession()`, koji opoziva token na serveru. Prekid veze, 502 sa proxy-ja, ili restart API-ja tokom deploy-a dovoljni su da korisnik izgubi sesiju. Ovo je posebno važno nakon redeploy-a koji je upravo završen. Isti obrazac kao B1 u modulu 1: greška se tretira kao negativan odgovor.

2. **Obnavljanje tokena demontira stranicu (A2).** Keep-alive obnavlja token otprilike svakih 50 minuta aktivnom korisniku (`refreshWindowMs = 10 min` od `1 h` tokena). `use-session-capabilities.ts:22-49` ima `accessToken` u dependency listi, pa `setIsLoading(true)` pri svakom obnavljanju. `require-auth.tsx:70-72` tada vraća `InstallGateSkeleton` umjesto `<Outlet />`, što demontira cijelu stranicu. Ako korisnik piše tiket, komentar ili podešava formu, nesačuvani unos se gubi. **Potvrditi u pregledaču:** otvoriti stranicu sa formom, unijeti tekst, pričekati 50 minuta (ili skratiti `refreshWindowMs` lokalno) i pratiti da li se forma resetuje.

**Srednji gapovi**

3. **Nema keša za capabilities (A3).** Sedam komponenti osnovne ljuske poziva `useSessionCapabilities()`: `RequireAuth`, `ApplicationShell`, `AppSidebar`, `SidebarUserCard`, `OnCallHeaderIndicator`, `CommandPalette` (uvijek montiran) i `SessionControls`. Svaka pokreće `GET /auth/session`. `RequireAccess` na zaštićenim stranicama dodaje još jedan. Ovo nije provjereno mjerenjem u Network tabu. Tačan broj treba izmjeriti. Rješenje je react-query ključ `currentSession` sa jednim izvorom.

4. **Odjava se ne propagira između tabova (A4).** `session-store.ts` nema `storage` listener. Kad se sesija obriše u jednom tabu, drugi tab nastavlja da prikazuje aplikaciju do sljedećeg rendera ili 401 odgovora.

5. **Provjera passkey dostupnosti je neispravna (A5).** `passkey-ceremony.ts:34-41` piše `browserSupportsWebAuthn() && platformAuthenticatorIsAvailable() !== null`. Funkcija `platformAuthenticatorIsAvailable()` vraća `Promise<boolean>` (potvrđeno u `@simplewebauthn/browser@14.0.0`), pa je poređenje sa `null` uvijek tačno. Dugme „Potvrdi passkeyjem“ se nudi i na uređajima bez ugrađenog autentikatora (npr. desktop bez Windows Hello/Touch ID). Funkcija se koristi sinhrono u renderu (`mfa-method-step.tsx:50`, `account-security-page.tsx:34`, `use-passkey-availability.ts:27`).

6. **Tihi neuspjeh CAPTCHA (A6).** `login-page.tsx:189-191` postavlja `isCaptchaRequired` kad server vrati `CAPTCHA_REQUIRED`, ali `hasError` ostaje `false`. Ako je `providers.captcha.provider` `none` ili `siteKey` nedostaje, widget se ne prikazuje, dugme za prijavu nije onemogućeno (`:534-539`), i korisnik ne vidi ništa poslije klika. Ovo se dešava samo pri pogrešnoj konfiguraciji, ali korisnik nema nikakav signal.

7. **Login forma u headeru bez CAPTCHA podrške (A7).** `session-sign-in-controls.tsx` je neobezbijeđen login obrazac. Ne šalje `captchaToken`, ne prikazuje poruku za 429 i ne koristi `CAPTCHA_REQUIRED`. Praktično je nedostižan jer je header unutar ljuske koja se ne renderuje bez sesije, ali je i dalje u kodu i može se ponovo uključiti.

8. **Token u `localStorage` (A8).** `session-store.ts` čuva `accessToken` u `localStorage`, a `entra-redirect.ts:89` MSAL cache u `sessionStorage`. Svaki JavaScript na stranici, uključujući eventualni XSS ili kompromitovanu zavisnost, može pročitati token. Ovo je arhitekturska odluka: httpOnly cookie za sesiju i refresh je standardna zaštita. Nije mijenjano, ali treba da bude eksplicitna odluka tima.

9. **Nema testova za kritične hookove i stranice (A9).** Testovi postoje za pomoćne funkcije (`decideKeepAlive`, `safeReturnPath`, `mfa-method`, `passkey-errors`), ali ne za `useSession`, `useSessionCapabilities`, `RequireAuth`, `login-page`, `auth-callback-page`, `change-password-form`, `identity-confirm-dialog`, `account-security-page`, `mfa-code-form`, `sessions-list`, `password-expiry-banner` i `recovery-codes-panel`. Gapovi A1 i A2 ne bi bili uhvaćeni trenutnim testovima.

**Niski gapovi**

10. **Dvostruki cast bez validacije (A10).** `mfa-method-step.tsx:70`, `identity-confirm-dialog.tsx:67`, `passkey-section.tsx:103`, `passkey-ceremony.ts:91,107` koriste `as unknown as`. WebAuthn odgovor se prosljeđuje serveru bez provjere oblika. Server odlučuje, ali tip ne govori istinu.

11. **`as never` zaobilazi i18n tipove (A11).** Ukupno 36 pojavljivanja u frontend-u. U ovom modulu `passkey-section.tsx` koristi `t(passkeyDeviceKindKey(...) as never)`. Ključ se ne provjerava, pa greška u ključu prolazi bez upozorenja TypeScript-a.

12. **Komentar za lint pravilo bez efekta (A12).** `mfa-enrollment.tsx:50` ima `// eslint-disable-next-line react-hooks/exhaustive-deps`, ali repo nema ESLint konfiguraciju (vidi modul 1). Komentar je bez efekta i vodi u pogrešan zaključak. Osim toga, StrictMode u razvojnom modu pokreće efekat dva puta, pa se `loadSecret()` zove dva puta i server kreira dva enrollment-a.

13. **Provjera povratne putanje nije potpuna (A13).** `safeReturnPath` (`entra-redirect.ts:28-36`) odbija `//`, ali ne `/\evil.com`. Navigacija je SPA (`navigate`), pa nije iskoristivo za otvoreno preusmjeravanje. Ipak, treba i backslash. `login-page.tsx:154-160` koristi `location.state.from` bez ikakve provjere (trenutno ga postavlja samo `RequireAuth` iz `pathname`).

14. **Fail-open prema lokalnoj prijavi (A14).** `login-page.tsx:140-141`: ako `/auth/providers` padne, stranica prikazuje lokalnu formu. U `entra_ad` režimu ovo otkriva break-glass formu kad je servis djelimično nedostupan. Treba potvrditi da li je to namjera vlasnika.

15. **Veliki fajlovi i ugnježdena logika (A15).** `login-page.tsx` (600 linija) ima pet koraka u jednoj komponenti, ugnježdene ternarne izraze za korake, pet ponovljenih `<h2>` naslova i CAPTCHA na dva mjesta. `passkey-section.tsx` (356 linija) drži listu, registraciju i tri dijaloga. `mfa-code-form.tsx` ima osam ugnježdenih ternara za poruke grešaka. `account-security-page.tsx` koristi react-query za pregled, a `useState`/`useEffect` za sesije.

16. **Loaderi i greške na profilu (A16).** `account-security-page.tsx` prikazuje sadržaj samo kad je `data` dostupan (`data ? ... : null`), bez skeletona. Greške (`account.security.loadFailed`) nemaju dugme za ponovni pokušaj.

17. **Email u ključu localStorage (A17).** `mfa-method.ts:21-38` pravi ključ `helpdesk.mfa-method:<email>`. To je lični podatak na uređaju. Nizak rizik, ali bi bio bolji `userId` ili hash.

18. **Dokumentacija obećava više nego kod (A18).** `password-expiry-banner.tsx:10-14` kaže da banner podsjeća i na MFA koji nije postavljen. Kod (`:23-25`) provjerava samo `expiresAt`. Ovo je drift dokumentacije i greška u obećanju prema korisniku.

19. **Dvije putanje za 401 i instalacione headere (A19).** `api.ts:100-122` (`authenticatedApiResponse`) provjerava `overridesAuthorization` i šalje `installTokenHeaders`. `api.ts:167-190` (`apiDownloadRequest`) ne radi ni jedno ni drugo. Može biti namjerno (preuzimanja nisu install), ali nije dokumentovano.

20. **Ručno održavane liste putanja (A20).** `api.ts:26-44` (`sessionlessPaths`, `confirmationPaths`) su stringovi. Nova ruta sa 401 ponašanjem mora se ručno dodati, a greška je tiha.

21. **Nekonzistentna potvrda za odjavu sesija (A21).** „Odjavi ostale sesije“ ima `ConfirmDialog`, a pojedinačna „Odjavi“ dugme nema potvrdu. Manje destruktivno, ali nekonzistentno.

22. **Kopiranje rezervnih kodova tiho ne radi (A22).** `recovery-codes-panel.tsx:49-52`: `navigator.clipboard` nije dostupan na nesigurnom HTTP-u, a `.catch(() => undefined)` ne prikazuje poruku.

23. **Djelimično pregledano.** `passkey-section.tsx` i `mfa-section.tsx` nisu pročitani u punom obimu. Preporuka je da se pregledaju u sljedećem prolazu.

24. **Sigurnosne headere nisam provjeravao.** CAPTCHA skripta se učitava sa `challenges.cloudflare.com`. Da li CSP to dozvoljava, nije provjereno u ovom auditu.

**Šta je dobro (zadržati)**

- 401 logika sa izuzecima za potvrdu MFA koda, passkey i rate-limit. Netačan kod ne odjavljuje korisnika usred dijaloga.
- Keep-alive sa limitom neaktivnosti: idle korisnik se ne produžava automatski.
- Odjava opoziva token na serveru, a lokalna odjava radi i offline.
- Entra: `state` se validira kao relativna putanja (osim backslash slučaja), konfiguracija MSAL-a se učitava lijeno.
- CAPTCHA se prikazuje tek posle neuspjeha, token je jednokratan i resetuje se.
- Passkey ceremonije: korisnik koji zatvori sistemski prozor dobija `cancelled`, a ne grešku.
- Rezervni kodovi se prikazuju jednom, dugme „Nastavi“ je aktivno tek posle potvrde.
- Poruke grešaka su mapirane na i18n ključeve, a ne na sirove odgovore servera.
- Mapiranje grešaka za ceremonije: `passkeyErrorCode` čuva ime DOM izuzetka za dijagnostiku.
- Sesijski podaci (`session-role-label`, `permission-keys`) su konstante, bez magičnih stringova u komponentama.

---

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

Bezbjednosni dizajn modula je dobar: server odlučuje o svemu bitnom, MFA i passkey su dobro razdvojeni, 401 logika zna za razliku između istekle sesije i pogrešnog koda. Problemi su u **načinu na koji frontend tretira greške i stanje sesije**. Dvije stvari su ozbiljne:

- greška na `/auth/session` odjavljuje korisnika i poništava sesiju (A1)
- obnavljanje tokena demontira stranicu i gubi nesačuvani unos (A2)

Obje imaju isti koren kao B1 u modulu 1: stanje sesije se računa lokalno, u više nezavisnih hookova, bez jasnog razlikovanja „ne znam“ od „nije prijavljen“. Zato je prirodno rješenje jedan react-query ključ za `currentSession` sa eksplicitnim stanjima (`loading`, `ready`, `unauthenticated`, `error`), gdje se odjava dešava samo na 401.

Preporuka za redoslijed:
1. Odvojiti 401 od ostalih grešaka u `RequireAuth` i ne pozivati `signOut()` za mrežne greške. Dodati banner „Ne mogu da provjerim sesiju“ sa dugmetom za ponovni pokušaj (A1).
2. Ne mijenjati loading stanje pri obnavljanju tokena. Ovisiti o `principal.subjectId`, a ne o `accessToken` (A2).
3. Preći `useSessionCapabilities` na react-query (A3). Time se rješavaju A2 i A3 jednom promjenom.
4. Ispraviti `browserCanUsePasskeys` u async hook (A5).
5. Dodati testove za `RequireAuth` i `useSessionCapabilities` prije i poslije promjene, uključujući scenario „mrežna greška nije odjava“ (A9).
6. Ukloniti `SessionSignInControls` ili ga svesti na istu logiku kao login stranica (A7).
7. Arhitekturska odluka tima: prelazak na httpOnly cookie za sesiju (A8). Ovo nije hitno, ali treba biti eksplicitna odluka sa dokumentovanim rizikom.

Refaktor se ne radi bez potvrde obima.

---

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| A1 | Visoka | `lib/session/use-session-capabilities.ts:36-40`, `components/layout/require-auth.tsx:61-63`, `lib/session/use-session.ts:195-205` | Mrežna greška ili 5xx na `/auth/session` odjavljuje korisnika i poziva `/auth/logout`, koji poništava sesiju na serveru. | Odjava samo na 401. Ostale greške: retry, banner, zadržati sesiju. |
| A2 | Visoka | `lib/session/use-session-capabilities.ts:22-49`, `components/layout/require-auth.tsx:70-72` | Obnavljanje tokena (≈ svakih 50 min) pokreće `isLoading` i demontira stranicu, gubi nesačuvani unos. **Potvrditi u pregledaču.** | Ovisiti o `subjectId`, ne o `accessToken`. Ne vraćati skeleton za ponovno učitavanje. |
| A3 | Srednja | `lib/session/use-session-capabilities.ts`, 38 poziva | Nezavisni `useState` i po jedan `GET /auth/session` po komponenti (≥ 7 na ljusci). | react-query ključ `currentSession`. |
| A4 | Srednja | `services/session-store.ts`, `lib/session/use-session.ts:107` | Nema `storage` listenera. Odjava u jednom tabu nije odmah vidljiva u drugim. | Dodati listener na `storage` event za `service-desk.session`. |
| A5 | Srednja | `lib/webauthn/passkey-ceremony.ts:34-41` | `platformAuthenticatorIsAvailable() !== null` uvijek tačno (funkcija vraća `Promise<boolean>`). Passkey se nudi i bez platform autentikatora. Poziva se sinhrono u renderu. | Async hook sa stanjem (`useQuery`), provjera `await platformAuthenticatorIsAvailable()`. |
| A6 | Srednja | `pages/login-page.tsx:189-191, 519-541` | `CAPTCHA_REQUIRED` bez prikazivog widgeta: nema poruke, dugme radi, ništa se ne dešava. | Ako `siteKey` nedostaje, prikazati `session.captchaUnavailable` i onemogućiti dugme. |
| A7 | Srednja | `components/layout/session-sign-in-controls.tsx` | Login forma bez CAPTCHA podrške i bez poruke za 429. Praktično mrtav kod. | Ukloniti. |
| A8 | Srednja | `services/session-store.ts:13-45`, `lib/auth/entra-redirect.ts:89` | Access token u `localStorage`, MSAL cache u `sessionStorage`. Dostupno svakom JS-u na stranici. | Arhitekturska odluka: httpOnly cookie. Nije mijenjano. |
| A9 | Srednja | `lib/session/`, `pages/`, `components/auth/`, `components/account-security/` | Nema testova za `useSession`, `useSessionCapabilities`, `RequireAuth`, `login-page`, `auth-callback-page` i druge. | Testovi za A1 i A2 prvo. |
| A10 | Niska | `mfa-method-step.tsx:70`, `identity-confirm-dialog.tsx:67`, `passkey-section.tsx:103`, `passkey-ceremony.ts:91,107` | `as unknown as Record<string, unknown>`. WebAuthn odgovor nije validiran. | Tipizirati odgovor ili validirati oblik prije slanja. |
| A11 | Niska | `passkey-section.tsx` i ostala mjesta (ukupno 36 u frontend-u) | `t(... as never)` zaobilazi provjeru i18n ključeva. | Tipizirati `passkeyDeviceKindKey` kao `TranslationKey`. |
| A12 | Niska | `components/auth/mfa-enrollment.tsx:50` | `eslint-disable` za pravilo koje nije konfigurisano. StrictMode duplira `loadSecret()`. | Ukloniti komentar, dodati guard za duplo pokretanje efekta. |
| A13 | Niska | `lib/auth/entra-redirect.ts:28-36`, `pages/login-page.tsx:154-160` | `safeReturnPath` ne odbija `/\evil.com`. `location.state.from` se koristi bez provjere. | Odbijati i backslash, koristiti isti validator u oba mjesta. |
| A14 | Niska | `pages/login-page.tsx:140-141` | Ako `/auth/providers` padne, prikazuje se lokalna forma (fail-open). | Potvrditi namjeru vlasnika. |
| A15 | Niska | `pages/login-page.tsx` (600), `passkey-section.tsx` (356), `mfa-code-form.tsx` | Velike komponente, ugnježdeni ternari, ponovljeni naslovi. | Tabela koraka i poruka grešaka (`Record<Code, key>`), razdvojiti dijaloge. |
| A16 | Niska | `pages/account-security-page.tsx` | Nema skeletona dok se učitava pregled. Greška nema dugme za ponovni pokušaj. | Skeleton i „pokušaj ponovo“. |
| A17 | Niska | `lib/auth/mfa-method.ts:21-38` | Email u ključu localStorage. | Koristiti `userId` ili hash. |
| A18 | Niska | `components/account-security/password-expiry-banner.tsx:10-14` | Komentar obećava podsjetnik za MFA koji nije implementiran. | Ispraviti komentar ili implementirati. |
| A19 | Niska | `services/api.ts:100-122` vs `167-190` | Preuzimanja ne provjeravaju `overridesAuthorization` i ne šalju `installTokenHeaders`. | Provjeriti namjeru, dokumentovati. |
| A20 | Niska | `services/api.ts:26-44` | Ručno održavane liste putanja za 401. | Konstante na jednom mjestu, testirati. |
| A21 | Niska | `components/account-security/sessions-list.tsx` | Pojedinačna odjava sesije bez potvrde. | Konzistentno sa „odjavi ostale“ ili eksplicitno obrazložiti. |
| A22 | Niska | `components/auth/recovery-codes-panel.tsx:49-52` | Kopiranje tiho ne radi na HTTP-u. | Poruka o grešci i fallback (select + copy). |
| A23 | Za provjeru | `passkey-section.tsx`, `mfa-section.tsx` | Nisu pročitani u punom obimu. | Pregled u sljedećem prolazu. |
| A24 | Za provjeru | `index.html` / CSP | Da li CSP dozvoljava `challenges.cloudflare.com`. | Provjeriti u konfiguraciji servera. |
| A25 | Srednja (backend, nalaz iz provjere MFA-a) | `backend/src/modules/authentication/authentication.service.ts:455-456`, `security/account-security-rules.ts:37-46`, `security/mfa.service.ts:221-233`, `account-security.controller.ts:253-258` | Za SUPER_ADMIN (MFA `required`) isključivanje TOTP-a dozvoljeno je kad postoji passkey (`otherFactorRemaining`). Ali pri sljedećoj prijavi `enrolled` se računa samo po TOTP-u, pa `flowFor` vraća `enroll`: korisnik se šalje na ponovno TOTP podešavanje, a passkey se ne nudi kao faktor. Enrollment ekran (`mfa-enrollment.tsx`) nema passkey opciju. Test pokriva samo slučaj „nema TOTP-a i nema passkey-a“ (`authentication.service.spec.ts`, „forces enrollment…“). Prijava passkey-em radi samo u fazi `verify` (kad je TOTP aktivan). | **Odluka vlasnika (potvrđeno):** opcija (a). TOTP ostaje obavezan faktor za SUPER_ADMIN (i za ostale uloge kojima je MFA `required`). Passkey je dodatni način za svakodnevnu prijavu uz TOTP. Rezervni kodovi su sigurnosna mreža za slučaj gubitka telefona. Isključivanje TOTP-a dok je MFA `required` treba biti zabranjeno na backendu. Izmjena koda se ne radi u ovom koraku; čeka se odobrenje obima. Dodati test za scenarij „passkey postoji, TOTP isključen“. |

---

## Ocjena: 5/10

**Obrazloženje:** Bezbjednosni model (MFA, passkey, CAPTCHA, server-side odjava, 401 izuzeci, Entra state) je jak i dobro promišljen. Oduzimaju se bodovi jer dva ozbiljna nalaza (A1 i A2) mogu da odjave korisnika ili da mu obrišu nesačuvani unos, zatim za lokalno čuvanje tokena (A8), za neispravnu passkey provjeru (A5), za nedostatak testova za kritične tokove (A9) i za arhitekturu bez keša (A3).

---

## Must-Have (za ovaj modul)

1. **A1:** mrežna greška ili 5xx na `/auth/session` ne smije odjaviti korisnika niti pozvati `/auth/logout`.
2. **A2:** obnavljanje tokena ne smije demontirati stranicu. Prvo potvrditi u pregledaču.
3. **A3:** jedan izvor za capabilities (react-query), jedan zahtjev po učitavanju.
4. **A9:** testovi za A1 i A2 prije promjene (regresija).
5. **A5:** ispraviti provjeru passkey dostupnosti (async).
6. **A7:** ukloniti `SessionSignInControls`.
7. **A8:** tim treba da donese odluku o čuvanju tokena (httpOnly cookie) i da je dokumentuje.
8. **A25:** zabraniti isključivanje TOTP-a dok je MFA `required` (odluka vlasnika: TOTP ostaje obavezan, passkey je dodatni način prijave). Dodati test za scenarij „passkey postoji, TOTP isključen“. Izmjena koda čeka odobrenje obima.

---

## Status ispravki (val 6.1.2)

Stanje na dan 2026-10-14. Zatvaranje modula potvrdio je korisnik; svaka stavka je označena kao urađena, djelimično urađena, prihvaćen rizik ili pregledana.

| # | Status | Šta je urađeno |
|---|---|---|
| A1 | Urađeno | Mrežna greška ili 5xx na `/auth/session` ne odjavljuje korisnika. `session === null` prikazuje `SessionCheckError` sa „Pokušaj ponovo“. Testovi: `require-auth-session.spec.tsx`. |
| A2 | Urađeno (bez provjere u pregledaču) | Capabilities su na `useQuery` (`staleTime` 5 min). Obnavljanje tokena više ne pokreće `isLoading`, pa se stranica ne demontira. |
| A3 | Urađeno | Jedan izvor: `queryKeys.currentSession(subjectId)`. Test: `use-session-capabilities.spec.tsx`. |
| A4 | Urađeno | `storage` listener u `use-session.ts` filtrira `sessionStorageKey`. Test: `use-session-sync.spec.tsx`. |
| A5 | Urađeno | `platformPasskeyAvailable()` je async, hook `usePlatformPasskeyAvailable`. Odluka vlasnika: samo platform autentikator. |
| A6 | Urađeno | `session.captchaBlocked` se prikazuje iznad dugmeta i u MFA koraku. `declare global var turnstile` umjesto `as unknown`. |
| A7 | Urađeno | `session-sign-in-controls.tsx` obrisan (`git rm`). |
| A8 | Urađeno (kod, bez provjere u pregledaču) | Vidi „Odluka o tokenu (A8)“ ispod. |
| A9 | Urađeno | Novi testovi: sesija (sync, capabilities, require-auth), passkey, MFA kod, enrollment, redirect, recovery kodovi, API download. |
| A10 | Urađeno | Opcije i odgovori WebAuthn-a su tipizirani (`@simplewebauthn/browser`). Uklonjeni `as unknown as`. |
| A11 | Djelimično | `passkeyDeviceKindKey` je template literal; uklonjen `as never` u `passkey-section.tsx`. Ostali `as never` (drugi moduli) ostaju za module 10 i 13. |
| A12 | Urađeno | Uklonjen `eslint-disable`. `pendingSecret` ref sprječava dupli `loadSecret` u StrictMode. QR u zasebnom efektu. |
| A13 | Urađeno | `safeReturnPath` odbija obrnutu kosu crtu, kontrolne znakove i `/login`. Test: `entra-redirect.spec.ts`. |
| A14 | Prihvaćen rizik | Login ostaje fail-open kad `/auth/providers` padne (odluka vlasnika). Lokalna forma se prikazuje; backend i dalje provjerava sve. |
| A15 | Djelimično | `Record` mape za poruke grešaka (`mfa-code-form`, `mfa-enrollment`); dijalog za preimenovanje izdvojen u `passkey-rename-dialog.tsx`. `pages/login-page.tsx` (600 linija) nije razdvojen. |
| A16 | Urađeno | `PanelSkeleton` dok se učitava; greška ima „Pokušaj ponovo“. |
| A17 | Urađeno | Ključ u localStorage je FNV-1a hash e-maila. Stari ključevi ostaju (nema migracije). |
| A18 | Urađeno | Komentar u `password-expiry-banner.tsx` ispravljen. |
| A19 | Urađeno | Jedna `sendRequest` funkcija za JSON i preuzimanja. Test: `api-download.spec.ts`. |
| A20 | Zatvoreno | Liste putanja su konstante u `api.ts`, pokrivene `api-unauthorized.spec.ts`. |
| A21 | Urađeno | Pojedinačna odjava sesije ide kroz `ConfirmDialog`. |
| A22 | Urađeno | `copy()` ima fallback (selekcija kodova, poruka `auth.mfa.copyFailed`). Test: `recovery-codes-panel.spec.tsx`. |
| A23 | Pregledano | `mfa-section.tsx` bez problema. `passkey-section.tsx`: greška preimenovanja bila je iza `aria-hidden` dijaloga, sada je u dijalogu. |
| A24 | Provjereno | Nema CSP-a u `nginx.conf` ni u repu. Turnstile nije blokiran. CSP je zaseban zadatak. |
| A25 | Urađeno | `MFA_REQUIRED_CANNOT_DISABLE` se mapira na poruku (`map-mfa-step-error.ts`). Backend test: `mfa-disable.spec.ts`. |

### Odluka o tokenu (A8)

Access token više ne ide u `localStorage` niti u JS.

- Backend postavlja kolačić `helpdesk_session` (`HttpOnly; Secure; SameSite=Strict; Path=/`, `Max-Age` = trajanje sesije) na odgovorima prijave, Entra prijave, MFA verifikacije, passkey verifikacije, završetka enrollmenta, promjene lozinke i `refresh`. Tijelo odgovora više ne sadrži `accessToken`.
- Guard prihvata kolačić ili `Authorization: Bearer`. Bearer ima prednost. Za kolačić na nesigurnim metodama (POST/PUT/PATCH/DELETE) `Origin` mora biti u `CORS_ORIGIN` listi (CSRF odbrana bez tokena).
- CORS: `credentials: true`, lista origin-a ostaje eksplicitna (bez `*`). Socket.IO: `withCredentials` u frontendu, a kolačić se prihvata samo iz dozvoljenog `Origin`-a (zaštita od CSWSH).
- Logout briše kolačić i opoziva sesiju.
- Frontend čuva samo `principal` i `expiresAt` (`session-store.ts`). Stari zapisi sa tokenom se brišu pri čitanju.
- Ekstenzija: zaseban endpoint `POST /auth/extension/login` vraća bearer token u tijelu i ne postavlja kolačić. Ekstenzija ga čuva u svom storage-u, a SPA ga ne vidi.
- E2E klijent (`e2e/helpers/api-client.ts`) čita `Set-Cookie`, šalje `Cookie` i `Origin` kao preglednik.
- Nije urađeno: MSAL (Entra) cache u `sessionStorage` je zasebna tema i ostaje za kasnije.
- Provjera: backend `tsc` i jest (58 suite, 381 testova za auth, websocket i CORS) prolaze. Frontend `tsc`, vitest (219 fajlova, 937 testova), eslint (0 grešaka), build i guard-skripte prolaze. **E2E specovi 37 i 39 nisu pokrenuti** (zahtijevaju puni stack). **Provjera u pregledaču nije urađena.**
- CI na PR-u #9: backend, frontend, k6 smoke i PR gate E2E (smoke 01, 02, 03, 15, 22) prolaze. E2E gađa deployovani stack iz `master`-a, koji još vraća token u tijelu i ne šalje kolačić, pa `e2e/helpers/api-client.ts` koristi privremeni bearer fallback. Uklanja se nakon deploya ove grane; specovi 37 i 39 (kolačić) se tada provjeravaju u punom noćnom runu.

### Must-Have status

| # | Status |
|---|---|
| 1. A1 | Urađeno |
| 2. A2 | Urađeno. Provjera u pregledaču **nije urađena** (vidjeti gore). |
| 3. A3 | Urađeno |
| 4. A9 | Urađeno |
| 5. A5 | Urađeno |
| 6. A7 | Urađeno |
| 7. A8 | Urađeno (httpOnly kolačić, odluka dokumentovana gore) |
| 8. A25 | Urađeno |

Ocjena pri auditu ostaje **5/10**. Po potrebi se može ponovo ocijeniti nakon naknadne provjere u pregledaču i e2e testova.

