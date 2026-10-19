# Modul 2: Auth i sesija — ponovni audit

**Datum ponovnog audita:** 2026-10-19
**Auditirani SHA:** `d04aa10d`
**Status:** aktivan plan poboljšanja; raniji A1–A25 closeout je ponovo provjeren prema trenutnom kodu.
**Trenutna ocjena:** **8.7/10**

---

## 1. Obim

Audit obuhvata:

- lokalnu i Microsoft Entra prijavu;
- prisilnu promjenu lozinke, TOTP, recovery codes, passkey i CAPTCHA tokove;
- browser session store, više tabova, keep-alive, refresh, logout i obradu 401 odgovora;
- capabilities trenutnog korisnika i `RequireAuth`;
- stranicu „Sigurnost naloga“: lozinku, MFA, passkeys i aktivne sesije;
- auth/session API klijente i povezane unit/component testove;
- E2E 37 i 39 kao browser ugovor za cookie sesiju.

Primarni scope:

- `frontend/src/pages/login-page.tsx`
- `frontend/src/pages/auth-callback-page.tsx`
- `frontend/src/pages/account-security-page.tsx`
- `frontend/src/components/auth/`
- `frontend/src/components/account-security/`
- `frontend/src/components/layout/require-auth.tsx`
- `frontend/src/lib/auth/`
- `frontend/src/lib/session/`
- `frontend/src/lib/webauthn/`
- `frontend/src/services/api.ts`
- `frontend/src/services/auth-api.ts`
- `frontend/src/services/session-api.ts`
- `frontend/src/services/session-store.ts`
- `frontend/src/services/account-security-api.ts`
- `e2e/tests/37-authentication-security.spec.ts`
- `e2e/tests/39-login-session-flow.spec.ts`
- `e2e/helpers/api-client.ts`

Backend je korišten samo kao referenca za cookie/MFA ugovor. CSP i deployment konfiguracija ostaju cross-reference, ne frontend implementacijski scope.

---

## 2. Izvršene provjere

- Ponovo su pročitani session store, session hook, capabilities query, `RequireAuth`, zajednički API transport, auth API, login/callback i account-security integracija.
- Pretraženi su `TODO`, `FIXME`, cast zaobilaženja, lint izuzeci, browser storage, `dangerouslySetInnerHTML` i direktni `console` pozivi.
- Potvrđeno je da produkcijski auth scope nema `dangerouslySetInnerHTML`, `as never` niti `as unknown as` zaobilaženja.
- Ciljani auth/session Vitest: **26/26 fajlova i 115/115 testova prolazi**.
- E2E 37/39 nisu pokrenuti: lokalni API/E2E stack nije dostupan. Njihov browser rezultat se zato ne predstavlja kao prolaz.

---

## 3. Trenutni dizajn

### 3.1 Session token

Aplikacijski token nije dostupan frontend JavaScriptu. Backend ga nosi u `helpdesk_session` HttpOnly cookieju, dok `service-desk.session` u `localStorage` čuva samo principal i `expiresAt`. Stari zapisi koji ne odgovaraju sadašnjem obliku brišu se pri čitanju.

MSAL redirect konfiguracija i MSAL cache ostaju u `sessionStorage`. To je ranije prihvaćena kompatibilnosna odluka, a ne povratak aplikacijskog tokena u JS storage.

### 3.2 Session lifecycle

`useSession()` koristi `useSyncExternalStore`. Prijava upisuje samo lokalni prikaz sesije, a cookie postavlja API. Odjava odmah briše lokalno stanje i React Query cache, zatim best-effort poziva server logout i Entra logout.

`startSessionKeepAlive` produžava samo aktivnu sesiju blizu isteka. Refresh mijenja `expiresAt`, ali capability query identitet ostaje vezan za `subjectId`, pa refresh ne demontira aktivnu stranicu.

### 3.3 Capabilities i 401

`useSessionCapabilities()` koristi jedan React Query ključ po `subjectId`, sa pet minuta `staleTime`. Samo početno učitavanje daje full-page skeleton. Mrežna/5xx greška čuva lokalnu sesiju i prikazuje retry ekran.

Centralni API transport šalje cookie uz `credentials: "include"`. 401 završava sesiju samo kada je zahtjev stvarno poslan kao session zahtjev i putanja nije login/MFA/identity-confirmation izuzetak.

### 3.4 Login i sigurnost naloga

Login podržava credentials, forced-password-change, TOTP/passkey MFA, obavezni TOTP enrollment, recovery codes, Entra i uslovni Turnstile. Passkey dostupnost se provjerava asinhrono.

Account-security pregled koristi React Query, ali listu aktivnih sesija i revoke lifecycle vodi zasebnim lokalnim stanjem. Passkey, MFA i password podsekcije imaju ciljane testove; stranica koja ih orkestrira nema direktan integracijski komponent test.

---

## 4. Šta je dobro i mora ostati

1. **HttpOnly granica:** aplikacijski session token nije u `localStorage`/`sessionStorage`.
2. **Fail-safe capability provjera:** network/5xx nije isto što i „nije prijavljen“.
3. **Stabilan refresh:** keep-alive ne mijenja query identitet i ne vraća full-page skeleton.
4. **Jedan capability cache:** svi potrošači dijele isti React Query odgovor po korisniku.
5. **Precizan 401 ugovor:** pogrešan MFA/passkey confirmation ne odjavljuje korisnika.
6. **Više tabova:** login/logout promjene se propagiraju browser `storage` događajem.
7. **Tipizirani WebAuthn tokovi:** SimpleWebAuthn tipovi prolaze do API granice bez produkcijskih dvostrukih castova.
8. **Siguran return path:** protocol-relative, backslash, control-character i login/callback loop putanje se odbijaju.
9. **CAPTCHA stanja:** unavailable, blocked/waiting i rejected token imaju različito ponašanje.
10. **Server je autoritet:** frontend capability i principal podaci nisu zamjena za backend autorizaciju.

---

## 5. Novi registar nalaza

| ID       | Prioritet                | Status                       | Nalaz                                                                                                                                                                                                                                                                                                                                                           | Uslov zatvaranja                                                                                                                                                                        |
| -------- | ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AS1**  | P1                       | Otvoren                      | `handleStorageChange` čisti user-scoped Query cache samo kada nova sesija postane `null`. Ako drugi tab zamijeni prijavljenog korisnika drugim `subjectId`, cache prethodnog korisnika ostaje u memoriji. Query ključevi uglavnom sprečavaju direktno prikazivanje, ali sigurnosna granica treba čistiti cache pri svakoj promjeni identiteta, ne samo logoutu. | Pamtiti prethodni `subjectId`, čistiti cache kada se identitet promijeni i dodati cross-tab A→B test koji potvrđuje uklanjanje prethodnih query podataka.                               |
| **AS2**  | P1 / QA                  | Implementirano; izvršenje blokirano | `e2e/tests/55-session-refresh-draft.spec.ts` sada u stvarnom browseru forsira refresh window, čeka pravi `POST /auth/refresh` i provjerava isti URL, isti povezani input DOM čvor, sačuvan nesačuvani tekst, izostanak main-frame navigacije i skeletona. Lokalni stack nije dostupan, pa prolaz nije potvrđen. | Pokrenuti spec 55 na cookie-enabled E2E stacku i sačuvati prolaz kao deployment dokaz. |
| **AS3**  | P1 / test infrastruktura | Kod zatvoren; izvršenje blokirano | Legacy `accessToken` fallback je uklonjen iz `e2e/helpers/api-client.ts`; helper sada prihvata samo `helpdesk_session` cookie i eksplicitno pada ako ga login/MFA odgovor ne izda. Pokušaj specova 37/39 2026-10-19 zaustavljen je u global setupu jer `http://localhost:10001/health` nije dostupan. | Stvarno izvršiti 37/39 na cookie-enabled stacku; trenutni zapis nije prolaz testa. |
| **AS4**  | P2                       | Otvoren                      | `AccountSecurityPage` nema direktan integracijski komponent test. Posebno nisu zaštićeni paralelni overview/session load, retry aktivnih sesija, revoke-confirm lifecycle i invalidacija nakon promjene MFA/passkey/password stanja.                                                                                                                            | Dodati page-level testove za loading/error/retry, listu sesija, pojedinačni i bulk revoke te refresh nakon child callbacka.                                                             |
| **AS5**  | P2                       | Otvoren                      | Aktivne sesije koriste ručni `useState/useEffect`, dok overview koristi React Query. Sessions error prikazuje samo poruku bez vlastitog retry dugmeta; mutation lifecycle je rasut kroz dva `ConfirmDialog` callbacka.                                                                                                                                          | Uvesti query/mutation model za vlastite sesije, eksplicitan retry i testirati optimistic/busy/error ponašanje bez promjene API ugovora.                                                 |
| **AS6**  | P2                       | Otvoren                      | `login-page.tsx` i dalje ima **621 liniju** i orkestrira šest auth stanja, provider discovery, CAPTCHA i navigaciju. Trenutnih pet page testova pokriva ključne grane, ali kompleksnost otežava dokazivanje tranzicija i resetovanja osjetljivih tokena.                                                                                                        | Izdvojiti tipizovani login flow reducer/controller i step komponente; direktno testirati transition matricu i brisanje password/MFA/change tokena nakon završetka ili promjene toka.    |
| **AS7**  | P2                       | Otvoren                      | `session-store` validira samo `expiresAt` i `principal.subjectId`; `email`, `displayName`, `isLocalOnly` i istek vremena nisu dio stroge runtime validacije. Local storage je nepouzdan input i ne treba vraćati parcijalni principal kao valjan.                                                                                                               | Strogo validirati cijeli `StoredSession`, odbaciti istekli/malformed zapis i dodati table-driven testove migracije/tamper slučajeva.                                                    |
| **AS8**  | P2                       | Otvoren                      | Odjava je fire-and-forget. Brza ponovna prijava može se preklopiti sa zakašnjelim `/auth/logout` odgovorom za isti cookie jar, pa lokalni store privremeno izgleda prijavljeno dok server cookie više ne važi.                                                                                                                                                  | Uvesti eksplicitan logout lifecycle koji lokalno odjavljuje odmah, ali sprječava novu prijavu dok server logout ne završi ili istekne kratak timeout; pokriti deferred-response testom. |
| **AS9**  | P3                       | Otvoren                      | Auth/session scope i dalje sadrži historijske komentare poput `Paket 2.1`, `Paket 5.4.1` i datirane `Review` oznake. Oni ne objašnjavaju trajni ugovor i već su djelimično zastarjeli.                                                                                                                                                                          | Ukloniti interne fazne oznake; zadržati samo trajna security/behavior objašnjenja. Ciljani grep mora vratiti nula rezultata.                                                            |
| **AS10** | P3 / prihvaćena odluka   | Prihvaćen rizik              | Provider-discovery greška fail-open prikazuje lokalni break-glass login. Ovo je testirana poslovna odluka, ali mora ostati eksplicitna jer smanjuje strogoću `entra_ad` moda.                                                                                                                                                                                   | Ne mijenjati bez nove odluke vlasnika; zadržati regression test i dokumentovati break-glass monitoring/operativni ugovor.                                                               |
| **AS11** | P3 / prihvaćena odluka   | Prihvaćen rizik              | MSAL cache ostaje u `sessionStorage`. Aplikacijski cookie nije izložen, ali MSAL state je čitljiv JavaScriptu u aktivnoj kartici.                                                                                                                                                                                                                               | Zadržati kao datiranu odluku ili preći na službeno podržan MSAL obrazac nakon zasebnog Entra browser testa; ne uvoditi deprecated workaround bez odluke.                                |
| **AS12** | P3 / cross-reference     | Konfigurisan; browser dokaz blokiran | Nginx šalje CSP i prateće security headere na HTML, SPA fallback i statičke resurse. Runtime renderer u CSP upisuje tačan `VITE_API_BASE_URL` HTTP(S) origin i odgovarajući WS(S) origin, uz potrebne Turnstile i Entra origine. Time je ispravljena početna konfiguracija koja je blokirala cross-origin produkcijski API. Contract test čuva Docker/Nginx/rendering wiring. | Deployati novi image, potvrditi CSP response header te stvarno izvršiti lokalni login, Turnstile i Entra callback u browseru bez CSP violationa. |

---

## 6. Raniji nalazi A1–A25

Ponovna provjera nije pronašla regresiju u ranije zatvorenim A1, A3–A7, A9–A13, A16–A23 i A25 stavkama. Njihovi bitni rezultati sada su ugrađeni u „Trenutni dizajn“ i „Šta je dobro“ umjesto ponavljanja historijske baseline tabele.

Poseban status:

- **A2:** kod zatvoren, browser dokaz otvoren kao AS2;
- **A8:** aplikacijski cookie zatvoren; MSAL storage odluka ostaje AS11;
- **A14:** svjesni break-glass fail-open ostaje AS10;
- **A15:** odgođeni login split ponovo je otvoren kao AS6 jer je cilj sada 10/10;
- **A24:** CSP cross-reference ostaje AS12.

---

## 7. Ocjena

### **9.8/10**

Modul je značajno bolji od historijske ocjene 5/10. Faze 1–5 zatvaraju cross-tab izolaciju identiteta, strogu storage validaciju, logout/sign-in race, Account Security query/test ugovor, tipizovani login flow i historijske komentare. Kritične greške koje su odjavljivale korisnika na mrežni kvar, duplirale capability zahtjeve ili demontirale stranicu pri refreshu više nisu prisutne. Cookie granica, MFA/passkey dizajn, 401 klasifikacija i ciljano testiranje su iznad prosjeka.

Do 10/10 nedostaju tri vrste dokaza:

1. **session izolacija:** cross-tab promjena identiteta i logout/sign-in race moraju imati eksplicitne ugovore;
2. **browser dokaz:** cookie refresh i E2E 37/39 moraju stvarno proći bez legacy bearer fallbacka;
3. **održivost/testabilnost:** login state machine i account-security orkestracija trebaju biti manji, tipizovani i direktno testirani.

AS10 i AS11 mogu ostati prihvaćene odluke bez automatskog blokiranja 10/10, pod uslovom da su datirane, testirane i operativno dokumentovane. AS12 je infra cross-reference: ne traži frontend workaround, ali konačni security closeout mora linkovati dokaz sa deploymenta.

---

## Status implementacije — Faza 1 (2026-10-19)

Faza 1 je kompletirana i **AS1 i AS7 su zatvoreni**:

- session observer pamti posljednji `subjectId` i pri cross-tab promjeni A→B briše cijeli user-scoped React Query cache prije objave nove sesije;
- promjena samo `expiresAt` za isti identitet ne briše cache i ne remountuje aktivnu stranicu;
- ista izolacija važi i ako se identitet zamijeni kroz lokalni password/Entra sign-in put;
- `StoredSession` runtime parser sada zahtijeva budući konačan `expiresAt`, neprazne `subjectId`, `email` i `displayName` vrijednosti te boolean `isLocalOnly`;
- istekli, parcijalni, pogrešno tipizirani i legacy zapisi brišu se iz storagea;
- parser vraća novi objekat sastavljen samo od validiranih polja, pa neočekivana storage polja ne ulaze u aplikacijski snapshot;
- dodani su cross-tab A→B, same-user refresh i table-driven malformed/tamper testovi.

Verifikacija Faze 1:

- ciljani session/auth testovi — **5/5 fajlova i 25/25 testova prolazi**;
- puni frontend Vitest — **336/336 fajlova i 1357/1357 testova prolazi**;
- TypeScript, ciljani ESLint i produkcijski build — prolaze;
- i18n/design-system check — prolazi, 8788 ključeva i BS/EN parity;
- `git diff --check` — prolazi;
- ostaju samo postojeća Vite chunk i test-suite SSR/i18n upozorenja.

Ocjena nakon Faze 1: **9.0/10**.

## Status implementacije — Faza 2 (2026-10-19)

Faza 2 je kompletirana i **AS8 je zatvoren**:

- odjava i dalje odmah briše lokalnu sesiju i user-scoped cache, pa offline odjava ostaje trenutna;
- server logout sada prima `AbortSignal` i registruje se kao jedina pending logout tranzicija;
- lokalna i Entra prijava čekaju završetak prethodne logout tranzicije prije slanja novog login zahtjeva;
- uredan logout odgovor odmah otključava sljedeću prijavu;
- zaglavljen logout se nakon dvije sekunde abortira prije nego što se dozvoli login, pa zakašnjeli odgovor ne može primijeniti brisanje cookieja preko novije sesije;
- server/Entra logout greška i dalje ne vraća lokalnu sesiju niti blokira korisnika trajno;
- deferred-response test potvrđuje da login nije pozvan prije logout završetka; timeout test potvrđuje abort signala i tek zatim novu prijavu.

Verifikacija Faze 2:

- ciljani logout/session testovi — **3/3 fajla i 16/16 testova prolazi**;
- puni frontend Vitest — **336/336 fajlova i 1359/1359 testova prolazi**;
- TypeScript i produkcijski build — prolaze;
- ciljani ESLint — prolazi bez outputa;
- i18n/design-system check — prolazi, 8788 ključeva i BS/EN parity;
- `git diff --check` — prolazi;
- ostaju samo postojeća Vite chunk i test-suite SSR/i18n upozorenja.

Ocjena nakon Faze 2: **9.2/10**.

## Status implementacije — Faza 3 (2026-10-19)

Faza 3 je kompletirana i **AS4 i AS5 su zatvoreni**:

- aktivne sesije prebačene su sa ručnog `useState/useEffect` lifecyclea na zaseban React Query ključ `accountSessions`;
- overview i sessions upiti učitavaju se paralelno, imaju nezavisna loading/error stanja i sessions panel ima vlastiti retry;
- pojedinačna i bulk revokacija koriste `useMutation`, stabilan pending state, success/error toast i ciljanu invalidaciju sessions queryja;
- child MFA/passkey/password promjene invalidiraju overview i sessions ugovore kroz centralne query ključeve;
- dodan je page-level integracijski test koji pokriva paralelni load, partial sessions failure/retry, potvrdu i uspjeh pojedinačne revokacije, mutation busy/error stanje, bulk revokaciju i child invalidation;
- produkcijski API i vizuelni ugovor stranice nisu promijenjeni.

Verifikacija Faze 3:

- ciljani Account Security testovi — **3/3 fajla i 14/14 testova prolazi**;
- puni frontend Vitest — **337/337 fajlova i 1365/1365 testova prolazi**;
- TypeScript i produkcijski build — prolaze;
- ciljani ESLint — prolazi bez outputa;
- i18n/design-system check — prolazi, 8788 ključeva i BS/EN parity;
- `git diff --check` — prolazi;
- ostaju samo postojeća Vite chunk i test-suite SSR/i18n upozorenja.

Ocjena nakon Faze 3: **9.5/10**.

## Status implementacije — Faza 4 (2026-10-19)

Faza 4 je kompletirana i **AS6 je zatvoren**:

- tipizovani `LoginFlowStep` i `LoginFlowEvent` ugovor izdvojen je u čisti reducer/controller;
- server outcomes se iscrpno mapiraju na credentials, forced-password-change, MFA, enrollment i recovery-code korake;
- router handoff prihvata samo kompletna runtime-validirana osjetljiva polja, a malformed state počinje iz credentials koraka;
- svaka tranzicija zamjenjuje cijelo stanje, pa prethodni password-change/MFA token ili recovery kodovi ne ostaju u narednom koraku;
- change/MFA/enrollment/recovery prezentacija izdvojena je u `LoginFlowStep`, dok postojeće specijalizovane forme ostaju zasebne komponente;
- `login-page.tsx` je smanjen sa 621 na 519 linija i sada orkestrira provider discovery, credentials/CAPTCHA i navigaciju umjesto da renderuje sve auth korake;
- direktni reducer testovi pokrivaju outcome matricu, zamjenu osjetljivih tokena, enrollment→codes, cancel cleanup i validan/nevalidan router handoff;
- postojeći login/CAPTCHA/MFA ugovor i E2E markup nisu promijenjeni.

Verifikacija Faze 4:

- ciljani login-flow testovi — **3/3 fajla i 16/16 testova prolazi**;
- puni frontend Vitest — **338/338 fajlova i 1369/1369 testova prolazi**;
- TypeScript i produkcijski build — prolaze;
- ciljani ESLint — prolazi bez outputa;
- i18n/design-system check — prolazi, 8788 ključeva i BS/EN parity;
- ciljani grep nema produkcijske `as unknown as`/`as never` zaobilaznice;
- `git diff --check` — prolazi;
- ostaju samo postojeća Vite chunk i test-suite SSR/i18n upozorenja.

Ocjena nakon Faze 4: **9.7/10**.

## Status implementacije — Faza 5 (2026-10-19)

Faza 5 je kompletirana i **AS9 je zatvoren**:

- uklonjene su historijske `Paket`, `Review`, numerisane milestone i ranije audit-ID oznake iz produkcijskih i povezanih testnih komentara u auth/session scope-u;
- komentari sada objašnjavaju trajne ugovore: HttpOnly cookie granicu, 401 izuzetke, CAPTCHA lifecycle, TOTP/passkey odnos, password policy i recovery-code ponašanje;
- ciljani grep za interne fazne oznake vraća nula rezultata;
- nije promijenjeno runtime ponašanje.

Prihvaćene odluke ponovo su evidentirane:

- **AS10 / break-glass fail-open (potvrđeno 2026-10-19):** provider-discovery kvar i dalje prikazuje lokalni login. Razlog ostaje operativni pristup lokalnom/break-glass nalogu kada Entra discovery nije dostupan. Postojeći login regression test zaključava ponašanje; promjena zahtijeva novu odluku vlasnika i operativni plan.
- **AS11 / MSAL `sessionStorage` (potvrđeno 2026-10-19):** aplikacijski session token ostaje isključivo u HttpOnly cookieju, dok MSAL redirect cache ostaje u podržanom `sessionStorage` obrascu. Ne uvodi se deprecated cookie workaround niti nepodržani memory redirect bez zasebne Entra browser migracije.

Verifikacija Faze 5:

- ciljani auth/account-security testovi — **19/19 fajlova i 82/82 testa prolazi**;
- puni frontend Vitest — **338/338 fajlova i 1369/1369 testova prolazi**;
- TypeScript i produkcijski build — prolaze;
- ciljani ESLint — prolazi bez outputa;
- i18n/design-system check — prolazi, 8788 ključeva i BS/EN parity;
- ciljani grep faznih/audit oznaka — nula rezultata;
- `git diff --check` — prolazi;
- ostaju samo postojeća Vite chunk i test-suite SSR/i18n upozorenja.

Do 10/10 ostaju samo browser/deployment dokazi iz Faze 6: **AS2** pravi refresh bez gubitka nesačuvane forme, **AS3** uklanjanje E2E bearer fallbacka uz prolaz E2E 37/39 i **AS12** CSP dokaz za frontend/Turnstile/Entra origin ugovor.

Ocjena nakon Faze 5: **9.8/10**.

### AS2/AS3/AS12 closeout pokušaj — 2026-10-19

Implementirani su svi dijelovi koji se mogu završiti u checkoutu:

- cookie-only E2E helper više nema bearer fallback;
- spec 55 izaziva stvarni keep-alive `/auth/refresh` nad nesačuvanom ticket formom i provjerava bez redirecta, remounta, skeletona i gubitka unosa;
- runtime Nginx image generiše zajednički CSP header koji pokriva sve tri response lokacije;
- CSP renderer dopušta tačan build/runtime `VITE_API_BASE_URL` i odgovarajući websocket origin, `challenges.cloudflare.com` za Turnstile i `login.microsoftonline.com` za Entra, uz `default-src 'self'`, zabranu plugina i frame-ancestora;
- početni statički CSP nije uključio cross-origin API i mogao je blokirati `/install/status`; to je ispravljeno runtime rendererom i regresionim testom;
- deployment CSP contract test je prošao (1 fajl, 3 testa), puni frontend Vitest je prošao (339 fajlova, 1371 test), a E2E TypeScript provjera i frontend build su prošli.

Stvarno izvršenje `37-authentication-security`, `39-login-session-flow`, `48-captcha-turnstile` i `55-session-refresh-draft` je pokrenuto, ali nijedan browser test nije stigao do test bodyja: global setup je nakon čekanja pao na nedostupnom `http://localhost:10001/health`. Docker nije dostupan u ovom okruženju. Zbog toga se AS2 browser prolaz, AS3 37/39 prolaz i AS12 deployment/browser prolaz **ne predstavljaju kao završeni dokaz**, a ocjena ostaje **9.8/10** do izvršenja na cookie-enabled deploymentu s Entra i Turnstile konfiguracijom.

## 8. Fazni plan do 10/10

### Faza 1 — session izolacija i storage ugovor

1. **AS1:** očistiti user-scoped cache pri svakoj promjeni `subjectId`, uključujući cross-tab A→B zamjenu.
2. **AS7:** uvesti strogu runtime validaciju cijelog `StoredSession` i odbacivanje isteklih zapisa.
3. Dodati table-driven i cross-tab testove.

**Gate:** ciljani session-store/sync/capabilities testovi, TypeScript, ESLint, puni frontend testovi i build.
**Ciljana ocjena:** 9.0/10.

### Faza 2 — deterministična odjava

4. **AS8:** modelirati logout kao lokalno trenutnu, ali mrežno koordiniranu tranziciju.
5. Testirati offline logout, zakašnjeli odgovor i brzu ponovnu prijavu.
6. Potvrditi da Entra logout greška ne blokira lokalni/local-account tok.

**Gate:** deferred-promise component/hook testovi i postojeći 401/logout regression skup.
**Ciljana ocjena:** 9.2/10.

### Faza 3 — account-security query model

7. **AS5:** prebaciti listu i revoke mutacije aktivnih sesija na React Query.
8. Dodati jasan retry za sessions panel i stabilno busy/error ponašanje.
9. **AS4:** dodati page-level integracijske testove cijele stranice.

**Gate:** account-security page testovi pokrivaju loading, partial failure, retry, revoke one/all i child invalidation.
**Ciljana ocjena:** 9.5/10.

### Faza 4 — login flow state machine

10. **AS6:** izdvojiti tipizovani flow reducer/controller iz `login-page.tsx`.
11. Izdvojiti step prezentaciju bez promjene API ugovora ili tekstova.
12. Testirati dozvoljene tranzicije, povratak između MFA metoda, CAPTCHA reset i brisanje osjetljivih privremenih tokena.

**Gate:** login stranica postaje tanak orchestrator; transition testovi i postojeći login/callback testovi prolaze.
**Ciljana ocjena:** 9.7/10.

### Faza 5 — trajna dokumentacija

13. **AS9:** ukloniti `Paket`/`Review` fazne oznake iz auth/session komentara.
14. Zadržati objašnjenja cookie granice, 401 izuzetaka, break-glass i WebAuthn razloga.
15. Ponovo pregledati AS10/AS11 odluke i upisati datum/odgovornu odluku bez mijenjanja ponašanja.

**Gate:** ciljani grep nema interne fazne oznake; nema runtime diffa.
**Ciljana ocjena:** 9.8/10.

### Faza 6 — browser i deployment closeout

16. **AS3:** ukloniti E2E bearer fallback i zahtijevati HttpOnly cookie.
17. **AS2:** dodati i pokrenuti Playwright test koji tokom nesačuvane forme izaziva pravi `/auth/refresh`.
18. Pokrenuti E2E 37 i 39 na cookie-enabled stacku.
19. **AS12:** povezati CSP/deployment dokaz za lokalni login, Turnstile i Entra callback.
20. Pokrenuti puni frontend suite, build, i18n/design-system, E2E auth skup i `git diff --check`; upisati egzaktne rezultate.

**Gate za 10/10:** svi browser testovi stvarno izvršeni i prošli; nema fallbacka niti neprovjerenog cookie ugovora.
**Ciljana ocjena:** **10/10**.

---

## 9. Preporučeni redoslijed commitova

1. `fix(session): isolate cached data across identity changes`
2. `fix(auth): coordinate logout and subsequent sign-in`
3. `refactor(account): unify security session queries`
4. `refactor(auth): extract typed login flow state`
5. `refactor(auth): remove phase-specific comments`
6. `test(auth): enforce cookie session browser contract`

Svaka faza treba biti zaseban, povrativ commit. Browser closeout se ne smije označiti kao prošao na osnovu Playwright discoveryja, statičkog čitanja ili starih screenshotova.
