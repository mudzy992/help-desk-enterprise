# W2.15a — `BA-authentication-09`: 401 guarda ne briše mrtav `helpdesk_session` cookie

**Paket:** W2.15a (izdvojen iz zapažanja pri W2.14)<br>
**Nalaz:** `BA-authentication-09` (P3) — zatvoren<br>
**Kodni commit:** _popunjava se nakon pusha_<br>
**Finalni testani SHA:** _popunjava se nakon pusha_<br>
**CI:** _popunjava se nakon pusha_<br>
**DB migracije:** nema

## Nalaz

`SessionAuthenticationGuard` odbija mrtvu sesiju sa 401 `INVALID_CREDENTIALS`, ali odgovor nije sadržavao
`Set-Cookie`. Cookie `helpdesk_session` brisali su samo `POST /auth/logout` i `SessionCookieInterceptor` na
uspjehu, pa je pregledač zadržavao mrtvu sesiju do vlastitog `Max-Age` — kod „Zapamti me" **do 30 dana**.

Uticaj: poslije opoziva, isteka ili deaktivacije računa svaki zahtjev nosi mrtav cookie i plaća neuspješnu
provjeru; nakon prijave druge sesije u istom pregledaču stari cookie se i dalje šalje. Nije propust kontrole
pristupa (401 je bio ispravan) nego higijena sesije — zbog toga P3, ne više.

Nalaz je zapažen tokom ručne provjere W2.14 na deployanom stacku (odgovor na 401 poslije „Odjavi ostale
sesije" nije sadržavao `Set-Cookie`) i tada je svjesno ostavljen izvan tog paketa.

## Promjena

`backend/src/modules/authentication/session-authentication.guard.ts`:

- svaki 401 iz guarda sada, **za cookie pozivaoce**, postavlja `Set-Cookie: helpdesk_session=; Path=/;
  Max-Age=0; Expires=…; HttpOnly; Secure; SameSite=Strict` (`buildClearedSessionCookie`) prije nego što
  baci izuzetak; exception filter poslije samo dodaje request id, pa se header ne gubi;
- pokriveni su svi putevi koji sesiju proglašavaju mrtvom: neverifikovan token, `AuthenticationError`,
  neaktivan račun i `mustChangePassword`;
- **ne** briše se: bearer pozivima (nemaju ambijentalni cookie — ekstenzija i E2E alati), `403
  FORBIDDEN_ORIGIN` (sesija je tada valjana, odbija se samo porijeklo) i uspješnim zahtjevima;
- kontekst bez response objekta (unit testovi, ne-HTTP pipeline) ne mijenja 401 — pomoćna funkcija ima
  `try/catch` i nikad ne maskira odgovor.

Nije mijenjano: `logout`, `SessionCookieInterceptor`, `buildSessionCookie`, TTL-ovi, refresh tok (W2.14),
rute i DTO-ovi. Nema migracije.

## Dokaz

Unit (`backend/src/modules/authentication/session-authentication.guard.cookie.spec.ts`, novi describe
„clears the dead session cookie"):

- `drops the cookie when the account behind it is no longer active` — 401 + `helpdesk_session=;` +
  `Max-Age=0`;
- `drops the cookie when the session token no longer verifies` — isti header kroz `AuthenticationError`;
- `leaves a bearer caller alone…` — 401 bez `Set-Cookie`;
- `does not clear the cookie on the origin refusal…` — `403 FORBIDDEN_ORIGIN` bez `Set-Cookie`;
- `does not clear the cookie on a successful request` — 200 putanja bez `Set-Cookie`.

Sa starim guardom padaju **2** testa (prvi i drugi); sa popravkom **18/18** u dva guard speca prolazi.

E2E (`e2e/tests/37-authentication-security.spec.ts`): poslije `revoke-others`, `POST /auth/refresh` vraća
401 **i** `Set-Cookie` sa `helpdesk_session=;` + `Max-Age=0`; isti test i dalje tvrdi da živ cookie nije
izdat (W2.14 acceptance).

## CI

_popunjava se nakon pusha._

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-09` (P3, `zatvoreno (W2.15a)`) u
  registru, detalj nalaza i red u traceability matrici (`BA-09`).
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.15a`.
- Regenerisano guardom: **698 nalaza** (P1 175 / P2 371 / **P3 152**), `zatvoreno 343 / otvoreno 355`.
- `scripts/check-backend-findings.mjs` + `scripts/check-backend-findings.test.mjs` — baseline 697 → **698**,
  P3 151 → **152**, sa komentarom zašto se mijenja (novi nalaz, ne „da prođe guard").

## Rizik

- Klijent koji šalje mrtav cookie sada dobija i `Set-Cookie` sa `Max-Age=0`; SPA to ne mora čitati jer
  pregledač sam odbacuje cookie. Ekstenzija (bearer) nije pogođena.
- Ako neki klijent namjerno drži cookie poslije 401 da bi ga „rehabilitovao" — takav tok ne postoji: refresh
  i guard traže živ registry red (W2.14).
- Rollback: vraćanje jednog `clearSessionCookie` poziva; nema šeme ni podataka.

## Vizuelna provjera (ručni koraci, poslije deploya)

1. Prijavi se u dva taba/profila istim korisnikom.
2. U tabu A: „Odjavi ostale sesije".
3. U tabu B osvježi bilo koji ekran: DevTools → Network → odgovor je **401** i u **Response Headers** stoji
   `set-cookie: helpdesk_session=; Path=/; Max-Age=0; …`.
4. Application → Cookies: `helpdesk_session` **nema** (obrisan), a SPA je na ekranu prijave.
5. Prijava u tabu B prolazi normalno; tab A i dalje radi.

## Granica paketa

- Bez novih ruta, bez promjene statusa i kodova greške (`INVALID_CREDENTIALS` ostaje).
- Ne dira W2.14 `refresh()` logiku ni W2.11b fusion; performance se ne mijenja (jedan header na 401 putanji).
- Sljedeći paket ostaje `BA-authentication-02` (W2.15).

## Sljedeći paket

**W2.15 — `BA-authentication-02` (P1):** durable cutoff za legacy JWT bez `sid`, da logout/password-reset
preživi Redis write outage.
