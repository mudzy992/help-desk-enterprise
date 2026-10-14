# Modul 2: Auth i sesija

Datum prvobitnog audita: 2026-10-13; ponovna provjera i closeout: 2026-10-14.
Grana: `arena/91f1c029-help-desk-enterprise` (HEAD `daca898`; izmjene nisu commitovane).
Status: zatvoren po kriteriju plana 6.1; svaki A1–A25 ima konačan status u tabeli closeout-a. A2 ručna/browser QA je **nije izvršena** i zasebno prihvaćena kao ograničen rizik; A8 MSAL `sessionStorage`, A14 fail-open i A15 login split ostaju datirani, obrazloženi prihvaćeni rizici.

Provjere izvršene u sandboxu:
- `@simplewebauthn/browser` verzija `14.0.0` (provjeren tip `platformAuthenticatorIsAvailable(): Promise<boolean>` u `node_modules`).
- Pretraga po obrascima rizika (`as unknown as`, `as never`, `eslint-disable`, `localStorage`, `console`, `dangerouslySetInnerHTML`) u cijelom modulu. `dangerouslySetInnerHTML` nije pronađen.
- Ponovna provjera React Query capabilities, keep-alive, cookie/session store i `storage` listenera.
- Browser QA i E2E specovi 37/39 nisu pokrenuti u ovom okruženju (vidi status i ručne A2 korake ispod).

---

## Modul

**Auth i sesija.** Obuhvata:
- prijavu (lokalnu i Microsoft Entra), obradu MFA koraka, prisilnu promjenu lozinke i prvu MFA postavku
- čuvanje sesije, obnavljanje tokena (keep-alive), odjavu i obradu 401 odgovora
- zaštitu sesijskih podataka (capabilities, uloge, permisije)
- korisnički profil „Sigurnost naloga“: lozinka, MFA, passkey, aktivne sesije
- CAPTCHA (Turnstile) na prijavi
- WebAuthn (passkey) ceremonije u browseru

Granica modula: `require-auth.tsx` i `require-access.tsx` su pregledani u modulu 1 i ovdje se pominju samo tamo gdje utiču na sesiju. `session-controls.tsx` je pregledan u modulu 1; raniji `SessionSignInControls` je uklonjen (A7).

**Pregledano u punom obimu u ponovnoj provjeri (A23):** `frontend/src/components/account-security/passkey-section.tsx` i `frontend/src/components/account-security/mfa-section.tsx`; pregled bez izmjena koda.

**Granica prvobitnog audita (2026-10-13):** sljedeći fajlovi tada nisu bili pročitani u punom obimu: `mfa-code-dialog.tsx`, `password-section.tsx`, `change-password-form.tsx` (dio), `aaguid.ts`, `passkey-errors.ts`, `map-mfa-step-error.ts`, `describe-user-agent.ts`. Za closeout 2026-10-14 relevantni A-ID putevi su provjereni ciljano kroz implementaciju i testove; ova historijska granica nije otvoren A-ID nalaz. Konačni status svakog ID-ja je u tabeli ispod.

---

## Povezani fajlovi i folderi

**Stranice**
- `frontend/src/pages/login-page.tsx` (621 linija; A6 minimalne izmjene, A15 refaktor odgođen)
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
- `frontend/src/components/layout/session-controls.tsx`

**Komponente za profil**
- `frontend/src/components/account-security/` (8 fajlova): `passkey-section.tsx` (356), `mfa-section.tsx` (153), `password-section.tsx` (112), `sessions-list.tsx` (60), `mfa-code-dialog.tsx` (41), `password-expiry-banner.tsx` (40)

**Ostalo**
- `frontend/src/main.tsx` i `app/app.tsx` (samo provider `QueryClient`)
- `frontend/src/lib/query/query-keys.ts` (`accountSecurity`)

---

## Trenutna implementacija

**Model sesije.** Backend nosi aplikacijsku sesiju u `helpdesk_session` HttpOnly kolačiću; frontend JavaScript ne čita taj token. `session-store.ts` čuva samo `{ principal, expiresAt }` u `localStorage` pod ključem `service-desk.session` i odbacuje stare zapise koji sadrže token. `useSession()` koristi `useSyncExternalStore`; njegov `storage` listener sluša samo promjene tog ključa i propagira prijavu/odjavu između tabova.

**Prijava.** `login-page.tsx` zadržava tok `credentials` → `change` (prisilna promjena lozinke) → `mfa` (TOTP ili passkey) → `enroll` (prva MFA postavka) → `codes` (rezervni kodovi) → sesija. `signIn()` vraća `SignInOutcome` koji određuje sljedeći korak. A15 login-page split je odgođen po odluci vlasnika; fajl trenutno ima približno 621 liniju.

**CAPTCHA.** Turnstile se pojavljuje tek nakon `CAPTCHA_REQUIRED` ili `CAPTCHA_FAILED`, a skripta se učitava na zahtjev. Zajednički `CaptchaSlot` koriste credentials i MFA/TOTP. Nedostajuća ili nevažeća konfiguracija, kao i greška pri učitavanju widgeta, prikazuje `session.captchaUnavailable` i blokira submit; čekanje ili istek tokena prikazuje `session.captchaBlocked` i također blokira submit. Odbijeni token se uklanja/resetuje. Passkey MFA ostaje zaseban način prijave bez CAPTCHA polja.

**Entra (Microsoft).** `entra-redirect.ts` lijeno učitava MSAL, čuva konfiguraciju i MSAL cache u `sessionStorage`, a `loginRedirect` koristi `state = safeReturnPath(returnPath)`. `auth-callback-page.tsx` završava redirect, šalje ID token na `/auth/entra` i nastavlja na povratnu putanju. MSAL cache u `sessionStorage` je prihvaćen follow-up rizik; nije prebačen na `memoryStorage` niti je uključen deprecated `storeAuthStateInCookie`.

**Obnavljanje sesije.** `startSessionKeepAlive` (`session-keep-alive.ts`) provjerava sesiju svake minute. Ako do `expiresAt` ima manje od 10 minuta, a korisnik je bio aktivan u zadnjih 60 minuta, poziva `/auth/refresh`, upisuje novi `expiresAt` i emituje promjenu sesije. Istekla sesija se prosljeđuje `expireSession`. Capabilities su React Query upit `queryKeys.currentSession(subjectId)` sa `staleTime` od pet minuta; promjena roka sesije ne mijenja ključ i ne pokreće full-page skeleton.

**401 obrada.** `api.ts` poziva `unauthorizedHandler` (postavlja ga `RequireAuth`) samo za 401 odgovora na zahtjev koji je poslao aplikacijsku sesiju; potvrde MFA/passkey i druge izuzete putanje ostaju odvojene. Mrežna greška ili 5xx pri provjeri capabilities zadržava lokalnu sesiju i prikazuje `SessionCheckError` s retry.

**Odjava.** `useSession().signOut()` poziva `/auth/logout` bez čekanja na odgovor, briše lokalni principal/rok i pokušava Entra single logout.

**Profil.** `account-security-page.tsx` učitava pregled preko React Query (`queryKeys.accountSecurity`) i prikazuje skeleton/retry. Lista sesija je lokalno stanje; pojedinačna odjava traži potvrdu. Banner isteka lozinke koristi isti keš.

**Passkey.** `passkey-ceremony.ts` omotava `@simplewebauthn/browser` (`startRegistration`, `startAuthentication`) i vraća `ok` / `cancelled` / `unsupported` / `failed`. Server odlučuje o challengeu, originu i counteru.

---

## Realno/željeno stanje (ponovo provjereno)

| Oblast | Željeno | Trenutno stanje u kodu |
|---|---|---|
| Greška pri učitavanju sesije | Mrežna greška ili 5xx ne odjavljuje korisnika | Samo 401 završava sesiju; druga greška zadržava je i prikazuje `SessionCheckError` s retry (A1). |
| Obnavljanje sesije | Korisnik ostaje na stranici, a nesnimljeni unos se čuva | Capabilities su vezane za `subjectId`, ne za rok/token; refresh ne vraća pending skeleton (A2). Browser QA još nije izvršen. |
| Izvor capabilities | Jedan upit/keš za trenutnog korisnika | React Query ključ `queryKeys.currentSession(subjectId)` i `staleTime` od pet minuta (A3). |
| Više tabova | Promjena sesije se odmah propagira | `storage` listener filtrira `service-desk.session` (A4). |
| Passkey dostupnost | Ponuditi samo kad platforma može izvršiti ceremoniju | Async hook čeka `platformAuthenticatorIsAvailable()` (A5). |
| CAPTCHA | Razlikovati nedostupnu provjeru od čekanja tokena | `captchaUnavailable` prikazuje pogrešnu/nedostupnu konfiguraciju ili grešku widgeta; `captchaBlocked` znači čekanje tokena. Submit je blokiran u oba obavezna stanja (A6). |
| Čuvanje tokena | Aplikacijski session token nije dostupan JavaScriptu | `helpdesk_session` je HttpOnly; localStorage sadrži samo `principal`/`expiresAt`. MSAL cache za Entra ostaje u `sessionStorage` (A8). |
| Tipovi WebAuthn odgovora | Tipizirani odgovori bez casts u runtime putanjama | Auth/passkey kod koristi tipove `@simplewebauthn/browser`; preostali `as unknown as` u ovom području su samo testni DOM stubovi (A10). |
| Kritični auth testovi | Callback, lokalna prijava, CAPTCHA i istek lozinke imaju regression testove | Ovaj zadatak dodaje LoginPage, Entra callback i password-expiry testove; ostali testovi ostaju raspoređeni po auth/session modulima (A9). |
| Loaderi profila | Skeleton, greška i ponovni pokušaj | `AccountSecurityPage` prikazuje `PanelSkeleton` i retry dugme (A16). |

---

## Početna gap analiza (baseline prije ranijih ispravki)

> Stavke u ovom odjeljku bilježe prvobitne nalaze, ne trenutno stanje. Za ponovnu provjeru koda koristiti „Trenutna implementacija“, „Realno/željeno stanje (ponovo provjereno)“ i status ovog zadatka.

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

## Početni registar bugova i neusklađenosti (baseline nalaza)

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
| A15 | Niska | `pages/login-page.tsx` (621), `passkey-section.tsx` (356), `mfa-code-form.tsx` | Velike komponente, ugnježdeni ternari, ponovljeni naslovi. | Login-page split je odgođen za poseban refaktor po odluci vlasnika. |
| A16 | Niska | `pages/account-security-page.tsx` | Nema skeletona dok se učitava pregled. Greška nema dugme za ponovni pokušaj. | Skeleton i „pokušaj ponovo“. |
| A17 | Niska | `lib/auth/mfa-method.ts:21-38` | Email u ključu localStorage. | Koristiti `userId` ili hash. |
| A18 | Niska | `components/account-security/password-expiry-banner.tsx:10-14` | Komentar obećava podsjetnik za MFA koji nije implementiran. | Ispraviti komentar ili implementirati. |
| A19 | Niska | `services/api.ts:100-122` vs `167-190` | Preuzimanja ne provjeravaju `overridesAuthorization` i ne šalju `installTokenHeaders`. | Provjeriti namjeru, dokumentovati. |
| A20 | Niska | `services/api.ts:26-44` | Ručno održavane liste putanja za 401. | Konstante na jednom mjestu, testirati. |
| A21 | Niska | `components/account-security/sessions-list.tsx` | Pojedinačna odjava sesije bez potvrde. | Konzistentno sa „odjavi ostale“ ili eksplicitno obrazložiti. |
| A22 | Niska | `components/auth/recovery-codes-panel.tsx:49-52` | Kopiranje tiho ne radi na HTTP-u. | Poruka o grešci i fallback (select + copy). |
| A23 | Pregledano 2026-10-14 | `passkey-section.tsx`, `mfa-section.tsx` | Oba fajla pročitana su u punom obimu; nije pronađen konkretan bug. | Bez izmjene koda. |
| A24 | Napomena (van obima) | `frontend/nginx.conf` / CSP | Statički frontend nema CSP zaglavlje; API Helmet ne postavlja CSP za HTML frontend. | Samo zabilježiti; infra/CSP promjene nisu dio ovog zadatka. |
| A25 | Srednja (backend, nalaz iz provjere MFA-a) | `backend/src/modules/authentication/authentication.service.ts:455-456`, `security/account-security-rules.ts:37-46`, `security/mfa.service.ts:221-233`, `account-security.controller.ts:253-258` | Za SUPER_ADMIN (MFA `required`) isključivanje TOTP-a dozvoljeno je kad postoji passkey (`otherFactorRemaining`). Ali pri sljedećoj prijavi `enrolled` se računa samo po TOTP-u, pa `flowFor` vraća `enroll`: korisnik se šalje na ponovno TOTP podešavanje, a passkey se ne nudi kao faktor. Enrollment ekran (`mfa-enrollment.tsx`) nema passkey opciju. Test pokriva samo slučaj „nema TOTP-a i nema passkey-a“ (`authentication.service.spec.ts`, „forces enrollment…“). Prijava passkey-em radi samo u fazi `verify` (kad je TOTP aktivan). | **Odluka vlasnika (potvrđeno):** opcija (a). TOTP ostaje obavezan faktor za SUPER_ADMIN (i za ostale uloge kojima je MFA `required`). Passkey je dodatni način za svakodnevnu prijavu uz TOTP. Rezervni kodovi su sigurnosna mreža za slučaj gubitka telefona. Isključivanje TOTP-a dok je MFA `required` treba biti zabranjeno na backendu. Izmjena koda se ne radi u ovom koraku; čeka se odobrenje obima. Dodati test za scenarij „passkey postoji, TOTP isključen“. |

---

## Ocjena: 5/10

**Obrazloženje:** Bezbjednosni model (MFA, passkey, CAPTCHA, server-side odjava, 401 izuzeci, Entra state) je jak i dobro promišljen. Oduzimaju se bodovi jer dva ozbiljna nalaza (A1 i A2) mogu da odjave korisnika ili da mu obrišu nesačuvani unos, zatim za lokalno čuvanje tokena (A8), za neispravnu passkey provjeru (A5), za nedostatak testova za kritične tokove (A9) i za arhitekturu bez keša (A3).

---

## Must-Have (za ovaj modul)

1. **A1:** mrežna greška ili 5xx na `/auth/session` ne smije odjaviti korisnika niti pozvati `/auth/logout`.
2. **A2:** obnavljanje sesije ne smije demontirati stranicu; kod je vezan za `subjectId`, a ručna browser provjera se prati odvojeno i ne označava se kao prošla bez izvršenja.
3. **A3:** jedan izvor za capabilities (React Query), jedan keširani upit po korisniku.
4. **A9:** testovi za A1/A2 i kritične auth tokove postoje; ovaj zadatak dodaje callback, lokalni login, CAPTCHA i banner regresije.
5. **A5:** passkey dostupnost provjerava se asinhrono.
6. **A7:** `SessionSignInControls` je uklonjen.
7. **A8:** aplikacijska sesija koristi HttpOnly cookie; Entra/MSAL cache ostaje u `sessionStorage` kao eksplicitan follow-up rizik.
8. **A25:** obavezni TOTP se ne može isključiti; backend zaštita i test već postoje, bez izmjene u ovom zadatku.

---

## Status ispravki (ovaj zadatak — 2026-10-14)

Tabela ispod bilježi samo rad urađen ili ponovo potvrđen u ovom zadatku; ranije zatvorene A-stavke nisu označene kao novi rad.

| # | Status u ovom zadatku | Rezultat |
|---|---|---|
| A2 | QA koraci dodani; browser QA nije izvršen | U lokalnom okruženju nema Dockera ni `e2e/.env`; rezultat se ne označava kao prošao. Vidi „Ručna provjera A2“. |
| A6 | Urađeno | Zajednički `CaptchaSlot` prikazuje `captchaUnavailable` kod pogrešne/nedostupne konfiguracije ili widgeta; `captchaBlocked` je samo čekanje tokena. Credentials i MFA/TOTP submit su blokirani u oba obavezna stanja. BS/EN tekstovi su usklađeni. |
| A8 | Rizik eksplicitno dokumentovan; cache nije mijenjan | Aplikacijski token ostaje u HttpOnly cookieju; MSAL cache ostaje u `sessionStorage` po odluci vlasnika. `memoryStorage` se ne uvodi uz deprecated `storeAuthStateInCookie`. |
| A9 | Testovi dodani i prošli | Novi testovi pokrivaju lokalni submit, A14 fail-open, CAPTCHA s tokenom i bez site keya (credentials/MFA), uspješan/neuspješan Entra callback i upozorenje isteka lozinke. Auth/session Vitest skup: 23 fajla, 100 testova, svi prošli. |
| A14 | Prihvaćen rizik; bez izmjene ponašanja | Lokalna forma se i dalje prikazuje ako `/auth/providers` ne uspije; postojeće ponašanje je obuhvaćeno testom. |
| A15 | Odgođeno po odluci vlasnika | Nema login-page refaktora u ovom zadatku. `login-page.tsx` je oko 621 liniju; split ostaje poseban follow-up. |
| A23 | Pregledano, bez izmjena koda | `passkey-section.tsx` i `mfa-section.tsx` pročitani su u cijelosti; nije pronađen konkretan bug. |
| A24 | Napomena; infra izmjena van obima | `frontend/nginx.conf` ne postavlja CSP za statički frontend. Backend Helmet zaglavlje važi za API, ne za frontend HTML; CSP ostaje zaseban infra zadatak. |
| E2E cookie | Fallback zadržan | `api-client.ts` ima uslovni TODO s audit referencom. Ukloniti fallback tek kad puni E2E run na deploymentu koji postavlja cookie prođe specove 37 i 39. |

### Odluka o tokenu i MSAL-u (A8)

- Aplikacijski session token **nije u `localStorage`**: backend ga šalje u `helpdesk_session` HttpOnly cookieju (`Secure; SameSite=Strict; Path=/`); frontend čuva samo `principal` i `expiresAt`. Stari browser zapisi s bearer tokenom brišu se pri čitanju.
- MSAL Entra cache i redirect konfiguracija ostaju u `sessionStorage`. To je prihvaćen rizik/follow-up, ne vraćanje aplikacijskog tokena u JavaScript storage.
- Provjera instaliranog `@azure/msal-browser` 4.30.0: `memoryStorage` redirect bez dodatne postavke se odbija; MSAL traži `storeAuthStateInCookie: true`. Ta postavka je deprecated i sprema privremeni auth state/nonce u cookies. Po odluci vlasnika se ne uključuje; ako tim želi smanjiti MSAL exposure, prvo treba izabrati podržan MSAL 4.x obrazac i zasebno provjeriti Entra redirect u browseru.
- CI E2E koristi vanjski GitHub Actions `E2E_API_URL`, a ne stack pokrenut iz ovog checkouta. PR smoke lista je `01,02,03,15,22`; ne pokreće 37/39. Push na `master` također ne pokreće E2E. Stanje deploymenta iza `E2E_API_URL` nakon najnovijeg mergea nije potvrđeno ovim okruženjem, pa bearer fallback ostaje. Uklanjanje blokira potvrda da je upravo taj deployment prešao na cookie session i puni E2E run prošao 37/39.

### Ručna provjera A2 (5–10 minuta)

**Status 2026-10-14: nije izvršena.** Lokalni Docker nije instaliran, nema `e2e/.env`, a browser QA ne može se tvrditi iz testova ili read-only pregleda.

1. Pokrenuti lokalni frontend **i** backend s podrškom za cookie sesiju; prijaviti se kao testni korisnik.
2. Otvoriti nesačuvanu tiket/komentar ili drugu formu, unijeti jedinstveni tekst (npr. `A2-unsaved-<datum>`) i ne snimati.
3. Simulirati keep-alive refresh. U DevTools konzoli postaviti istom lokalnom session zapisu `expiresAt` na `Date.now() + 3 * 60_000` (ključ `service-desk.session`), označiti tab kao aktivan i sačekati sljedeći keep-alive tick; provjeriti u Network tabu da `/auth/refresh` uspije. Primjer: `const k = "service-desk.session"; const s = JSON.parse(localStorage.getItem(k) ?? "null"); if (!s) throw new Error("Nema lokalne sesije"); s.expiresAt = Date.now() + 3 * 60_000; localStorage.setItem(k, JSON.stringify(s));`. Ne dirati niti zapisivati cookie/token.
4. Ako se API refresh ne može simulirati, u Vite dev konzoli emitovati isti session-refresh događaj preko `import('/src/lib/session/use-session.ts').then(({ notifySessionRefreshed }) => notifySessionRefreshed())`; ovaj rezervni korak provjerava reakciju UI-a, ali nije zamjena za API/keep-alive provjeru.
5. Potvrditi da je uneseni tekst i dalje u formi i da nije prikazan full-page skeleton niti došlo do redirecta. Ponoviti jednom nakon pravog `/auth/refresh` odgovora ako je dostupan.
6. Zabilježiti datum, browser i **prošlo/nije prošlo** tek nakon stvarnog izvršenja.

### Must-Have status

| # | Status |
|---|---|
| 1. A1 | Urađeno ranije; nije mijenjano u ovom zadatku. |
| 2. A2 | Kod je vezan za `subjectId`; ručna browser QA **NIJE IZVRŠENA** 2026-10-14 u ovom okruženju (Docker nedostupan, `e2e/.env` odsutan). |
| 3. A3 | Urađeno ranije; nije mijenjano u ovom zadatku. |
| 4. A9 | Dodani ciljani testovi za tražene login/callback/CAPTCHA/banner tokove. |
| 5. A5 | Urađeno ranije; nije mijenjano u ovom zadatku. |
| 6. A7 | Urađeno ranije; nije mijenjano u ovom zadatku. |
| 7. A8 | HttpOnly cookie za app session; MSAL `sessionStorage` rizik ostaje eksplicitno prihvaćen/follow-up. |
| 8. A25 | Backend guard i test postoje; nije mijenjano u ovom zadatku. |

### Provjere u ovom zadatku

- Frontend TypeScript: `corepack pnpm exec tsc -b` — prošao.
- Auth/session Vitest: 23 fajla, 100 testova — svi prošli.
- ESLint diranih frontend source/spec fajlova — prošao.
- `node scripts/check-pulse-design-system.mjs` — prošao; BS/EN i18n paritet potvrđen.
- `git diff --check` — prošao.
- E2E 37/39 i backend provjere nisu pokrenuti: backend nije mijenjan; lokalni Docker nije dostupan, `e2e/.env` nedostaje, a CI koristi vanjski deployment.

**Ocjena 5/10** je ocjena prvobitnog audita i nije ponovo izračunata u ovom zadatku.

---

## Konačni closeout status A1–A25 (2026-10-14)

Ova tabela je konačni izvor istine za zatvaranje modula. Svaki ID ima implementacijski dokaz, datirani prihvaćeni rizik ili dokumentovan istraživački zaključak. „Nije izvršeno“ znači da se QA ne predstavlja kao prošla.

| ID | Konačni status | Implementacija / razlog / dokaz |
|---|---|---|
| A1 | Urađeno | Samo 401 vodi u odjavu; network/5xx čuva lokalnu sesiju i prikazuje retry (`SessionCheckError`). Covered by session capabilities/auth specs. |
| A2 | Urađeno (kod); Prihvaćen rizik (browser QA, 2026-10-14) | Query identitet vezan je za `subjectId`, refresh ne vraća full-page skeleton. **Browser QA nije izvršen**: Docker nije dostupan, `e2e/.env` nedostaje. Vlasnik je prihvatio neizvršenu QA kao ograničenje ovog closeout-a; ne tvrditi „prošlo“. Koraci ostaju u „Ručna provjera A2“. |
| A3 | Urađeno | `useSessionCapabilities` dijeli React Query `currentSession(subjectId)` keš; stale/retry i komponentni potrošači provjereni. |
| A4 | Urađeno | `session-store` sluša `storage` promjene za tačan session key i propagira login/logout; unit test postoji. |
| A5 | Urađeno | Platform authenticator dostupnost provjerava se asinhrono kroz hook; unsupported/cancelled/failure stanja su razdvojena. |
| A6 | Urađeno | `CaptchaSlot` razlikuje nedostupnu konfiguraciju od čekanja tokena i blokira submit kad je CAPTCHA obavezna; BS/EN tekstovi i regression tests postoje. |
| A7 | Urađeno | `SessionSignInControls` i fajl za alternativnu login formu uklonjeni; nema preostalog dead login path-a u `frontend/src`. |
| A8 | Urađeno (app token); Prihvaćen rizik (MSAL storage, 2026-10-14) | App session token je HttpOnly cookie; samo principal/expiry je u web storage. MSAL cache ostaje u `sessionStorage` po izričitoj odluci vlasnika: zadržati podržani postojeći Entra redirect obrazac, ne uvoditi `memoryStorage` uz nepodržan redirect i ne uključivati deprecated `storeAuthStateInCookie`. Preostali rizik (MSAL state je čitljiv JS-u u aktivnoj kartici) prihvaćen je radi kompatibilnosti/izbjegavanja deprecated alternative. |
| A9 | Urađeno | Kritični lokalni login, CAPTCHA, A14 fail-open, Entra callback, istek lozinke i session/auth helper tokovi imaju regression testove; puni suite rezultat je u završnim provjerama. |
| A10 | Urađeno | Produkcijske auth/WebAuthn putanje nemaju `as unknown as` casts; preostali casts su DOM/global stubs u test fajlovima. |
| A11 | Urađeno | `as never` i `ticketText` stil zaobilaženja nisu prisutni u produkcijskim auth/session fajlovima; auth stringovi koriste tipizirane i18n ključeve. |
| A12 | Urađeno | `mfa-enrollment` nema `eslint-disable`; `pendingSecret` ref čuva isti enrollment promise kroz StrictMode effect replay. |
| A13 | Urađeno | `safeReturnPath` odbacuje protocol-relative URL, backslash i control chars, kao i login/callback loop; login i Entra redirect koriste validaciju. `entra-redirect.spec.ts` pokriva slučajeve. |
| A14 | Prihvaćen rizik (vlasnik, 2026-10-14) | Fail-open ponašanje je zadržano i testirano. Razlog: lokalna/break-glass prijava treba ostati dostupna kada provider-discovery servis ne odgovara; vlasnik prihvata rizik da se lokalni login pokaže tokom providers API kvara, jer provider failure sam po sebi ne dokazuje da lokalni nalog ne smije ući. |
| A15 | Prihvaćen rizik (vlasnik, 2026-10-14) | Login-page split ostaje odgođen; refaktor nije izvršen. Razlog: promjena je održivost/refactor, ne blokirajuća auth greška; široko mijenjanje multi-step/MFA toka u ovom closeout-u bi povećalo regresioni rizik i prevazišlo odobreni scope. |
| A16 | Urađeno | Account security overview prikazuje skeleton/loading, grešku i retry. |
| A17 | Urađeno | MFA preferencija je per-email razdvojena FNV-1a hash ključem; stvarna e-mail adresa se ne zapisuje kao localStorage key/value. Preference je samo UX, server i dalje odlučuje faktor. |
| A18 | Urađeno | Password-expiry banner komentar i tekst više ne obećavaju MFA reminder koji se ne implementira. |
| A19 | Urađeno | API download ide kroz zajednički `sendRequest`, pa dijeli authorization override, session i install-token headere sa JSON API-jem; centralni kod i tests su izvor ponašanja. |
| A20 | Urađeno | Sessionless/confirmation path liste su centralizovane u `api.ts`; helper klasifikator ima testove za izuzetke. |
| A21 | Urađeno | Pojedinačna revokacija vlastite sesije traži `ConfirmDialog`; `SessionsList` samo šalje odabranu sesiju u confirm flow. |
| A22 | Urađeno | Clipboard odbijanje bira recovery kodove kao fallback i prikazuje BS/EN status da kopiranje nije automatski uspjelo; ručno Ctrl/Cmd+C ostaje moguće. |
| A23 | Zaključeno (istraživanje, 2026-10-14) | `passkey-section.tsx` i `mfa-section.tsx` pročitani u punom obimu; nije pronađen konkretan dodatni bug niti promjena potrebna za ovaj ID. |
| A24 | Zaključeno (dokumentacija-only, 2026-10-14) | CSP/infra nalaz je zabilježen kao van opsega. Nisu mijenjani `nginx.conf`, CSP ili infra i **nije potvrđeno** da je CSP prisutan/dovoljan; nema tvrdnje da je security-header QA prošao. |
| A25 | Urađeno | Backend zabranjuje gašenje TOTP-a kad MFA za nalog mora biti obavezna; `mfa-disable.spec.ts` pokriva passkey-postavljen/TOTP-aktivan scenario. Backend nije mijenjan u ovom audit closeout-u jer guard i test već postoje. |

### Završne provjere modula 02

- Auth/session ciljani testovi: raniji prolaz je zabilježen gore; konačni puni frontend Vitest rezultat nakon svih closeout izmjena naveden je u Modul 03 i TASKS.
- E2E 37/39 i A2 browser QA nisu izvršeni. Cookie fallback/TODO ostaje otvoren do cookie-enabled deployment-a i prolaza tih specova.
- Bez backend izmjena i bez CSP/infra izmjena u ovom zadatku.
