# Backend audit 01 — authentication

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/authentication`  
**Baseline ocjena:** **7,42/10**  
**Nalazi:** 3 P1, 4 P2, 1 P3, 6 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

Authentication modul ima zrelu funkcionalnu širinu: lokalna i Entra prijava, HttpOnly cookie i bearer transport, MFA/TOTP, recovery kodovi, WebAuthn passkeys, session registry, podesivi rate limit/CAPTCHA, password policy, HIBP i detaljan audit/notification trag. Kriptografske primitive su uglavnom pažljivo izvedene, ulazi su ograničeni, cookie i CSRF/origin zaštita su jaki, a testni katalog je opsežan.

Audit ipak nalazi tri visoka session/MFA integritetna problema. Refresh eksplicitno izdaje novi token kada `sid` više nema aktivan registry red; Redis revocation je dizajniran da fail-open radi čak i poslije logouta/password resetovanja; a MFA token nema atomsku claim/consume operaciju, pa paralelne potvrde enrollmenta mogu izdati više sesija i vratiti različite recovery setove. Zbog otvorenih P1 nalaza ukupna ocjena je ograničena na manje od 7,50 prema jedinstvenom standardu.

Nema dokaza o trenutnom neautorizovanom cross-user čitanju, curenju MFA tajne ili prihvatanju nepotpisanog JWT-a. Nalazi su izvedeni direktno iz kontrolnog toka i postojeći test čak zaključava jedan problematičan refresh slučaj kao očekivano ponašanje.

## 2. Scope i inventar

| Metrika                    |                                                                                    Vrijednost |
| -------------------------- | --------------------------------------------------------------------------------------------: |
| TypeScript fajlovi         |                                                                                           120 |
| Produkcijski fajlovi       |                                                                                            80 |
| Spec fajlovi               |                                                                                            40 |
| Produkcijske linije        |                                                                                         7.206 |
| Kontroleri                 |                                                                                             2 |
| Servisi                    |                                                                                             9 |
| Direktne module zavisnosti | `audit-log`, `authorization`, `branding`, `notifications`, `privacy`, `settings`, `websocket` |

Pregledane povezane površine:

- `prisma/schema/account-security.prisma` i relevantne migracije;
- `User`, role i identity polja iz `identity.prisma`;
- frontend `auth-api.ts`, `account-security-api.ts`, session store i parseri;
- E2E specifikacije 37, 39, 46, 47, 48 i 55;
- Redis, CORS, principal-context, audit-log i notification ugovori;
- session/MFA/passkey/password DTO-i i error mapping.

## 3. Arhitektura i tokovi

### 3.1. Prijava

`AuthenticationController` prihvata lokalne, extension i Entra tokove. `AuthenticationService` bira provider, učitava korisnika, provjerava password-expiry/MFA flow, kreira `UserSession` i izdaje JWT sa `sid`/`jti`. Browser dobija `Secure; HttpOnly; SameSite=Strict` cookie, dok extension koristi bearer token iz tijela.

### 3.2. Sesije

`SessionAuthenticationGuard` provjerava JWT i Redis revocation stanje, učitava principal context i odbija neaktivne korisnike ili `mustChangePassword`. `SessionRegistryService` čuva durable session redove, aktivnost i revocation metadata. Refresh je jedino mjesto koje provjerava registry red i idle timeout; običan API zahtjev ne čita `UserSession`.

### 3.3. MFA i passkey

TOTP tajna je AES-256-GCM šifrovana. TOTP replay koristi compare-and-set nad `lastUsedStep`; recovery kodovi su keyed HMAC zapisi i troše se atomskim `updateMany`. Passkey challenge je jednokratan u Redis/in-memory storeu, a WebAuthn biblioteka provjerava challenge, RP ID, origin i potpis.

### 3.4. Rate limiting i vanjski servisi

Password login koristi odvojene pseudonimizirane account/IP buckete, Redis Lua rezervacije i progresivno kašnjenje. CAPTCHA se uključuje po pragu. HIBP ima timeout, cache i eksplicitni fail-open signal. Entra JWKS dohvat trenutno nema timeout ni cache.

## 4. API matrica

| Metoda i ruta                                       | Zaštita/credential               | Namjena                           |
| --------------------------------------------------- | -------------------------------- | --------------------------------- |
| `GET /auth/providers`                               | javno                            | dostupni provideri i CAPTCHA opis |
| `POST /auth/login`                                  | javno + account/IP limiter       | lokalna prijava                   |
| `POST /auth/extension/login`                        | javno + isti limiter             | extension prijava bez cookieja    |
| `POST /auth/extension/mfa/verify`                   | MFA token                        | extension drugi faktor            |
| `POST /auth/entra`                                  | javno + IP limiter               | Entra ID token prijava            |
| `POST /auth/change-password`                        | password-change bearer + limiter | prisilna promjena lozinke         |
| `POST /auth/mfa/verify`                             | MFA token + account limiter      | TOTP/recovery potvrda             |
| `POST /auth/mfa/passkey/start`                      | MFA token                        | WebAuthn challenge                |
| `POST /auth/mfa/passkey/verify`                     | MFA token + challenge            | WebAuthn potvrda                  |
| `POST /auth/mfa/enroll/start`                       | enrollment token                 | prisilni TOTP setup               |
| `POST /auth/mfa/enroll/confirm`                     | enrollment token + code          | potvrda i recovery kodovi         |
| `POST /auth/refresh`                                | session guard                    | rotacija/produženje sesije        |
| `POST /auth/logout`                                 | idempotentno, token opcionalan   | brisanje cookieja i revocation    |
| `GET /auth/security`                                | session guard                    | vlastiti security pregled         |
| `POST /auth/security/passkey/register/start`        | session guard                    | registracijski challenge          |
| `POST /auth/security/passkey/register/confirm`      | session + TOTP ako postoji       | spremanje passkeya                |
| `DELETE/PATCH /auth/security/passkey/:credentialId` | session + ownership              | uklanjanje/preimenovanje          |
| `POST /auth/password`                               | session + trenutna lozinka       | vlastita promjena lozinke         |
| `GET /auth/sessions`                                | session guard                    | vlastite aktivne sesije           |
| `DELETE /auth/sessions/:sessionId`                  | session + ownership              | opoziv jedne sesije               |
| `POST /auth/sessions/revoke-others`                 | session guard                    | opoziv svih drugih sesija         |
| `POST /auth/mfa/setup[/confirm]`                    | session guard                    | dobrovoljni TOTP setup            |
| `POST /auth/mfa/disable`                            | session + MFA code/policy        | isključivanje TOTP-a              |
| `POST /auth/mfa/recovery-codes`                     | session + TOTP                   | regeneracija recovery kodova      |

DTO whitelist, zabrana nepoznatih polja i osnovni size limiti postoje na oba kontrolera. Cookie state-changing zahtjevi zahtijevaju dozvoljen `Origin`; bearer klijenti nisu ambient-credential CSRF površina.

## 5. Prisma i transakcijska analiza

- `UserMfa.userId` je primarni ključ i on-delete cascade.
- Recovery kodovi imaju indekse `(userId)` i `(userId,keyId,usedAt)`; jednokratna upotreba radi CAS nad `usedAt:null`.
- `UserPasskeyCredential.credentialId` je globalno unique; `userId` je indeksiran.
- `UserSession` ima indekse za korisnika/status/expiry, expiry i last-seen cleanup.
- `UserSession.id`, passkey row ID i recovery ID koriste Prisma `cuid()`, ne UUID.
- Password history održavanje i recovery-code zamjena koriste transakcije.
- MFA enrollment transakcija jeste atomska unutar jednog poziva, ali nema predicate koji sprječava dvije paralelne potvrde istog pending enrollmenta.
- Session registry i Redis revocation nisu jedna transakcijska cjelina; DB može reći revoked dok token i dalje prolazi ako Redis zapis ne uspije.

## 6. Testovi i izvršeni gateovi

### 6.1. Postojeća pokrivenost

Modul ima 40 spec fajlova za providere, local/Entra tokove, normalizaciju claimova, JWT/socket provjeru, cookies/guard, rate limiting, MFA primitive/enrollment/recovery/disable, password policy/HIBP, passkey, session registry/revocation, config loadere i super-admin invariant.

Relevantni browser dokazi postoje u E2E 37, 39, 46, 47, 48 i 55. Oni pokrivaju glavni login/MFA/logout, session revoke-others, password invalidation, passkey, rate limit/CAPTCHA i refresh bez UI remounta. Ne pokrivaju Redis outage niti paralelnu MFA/passkey konkurenciju.

### 6.2. Lokalni rezultat

Poziv:

```bash
npx jest --runInBand src/modules/authentication
```

Rezultat bez generisanog Prisma klijenta:

- **40 suiteova otkriveno**;
- **16 suiteova prošlo**;
- **91/91 izvršenih testova prošlo**;
- **24 suitea nisu kompajlirana** jer `backend/src/generated/prisma/client` ne postoji.

Pokušaj:

```bash
DATABASE_URL=postgresql://audit:audit@127.0.0.1:5432/audit npm run db:generate
```

Prisma konfiguracija je učitana, ali generator je blokiran jer sandbox ne može preuzeti engine sa `binaries.prisma.sh`. Ovo je **environment-blocked**, ne test failure i ne pass. Raniji backend ESLint je zelen. Audit ne skriva ovu blokadu.

## 7. Pozitivni nalazi

1. JWT provjera zaključava algoritam za Entra, issuer i audience; MFA/password tokeni se eksplicitno odbijaju kao session tokeni.
2. Cookie je `Secure`, `HttpOnly`, `SameSite=Strict`; unsafe cookie requesti imaju allowlisted-origin provjeru.
3. TOTP replay i recovery-code reuse imaju database CAS zaštitu.
4. MFA tajne koriste AES-256-GCM, recovery kodovi keyed HMAC sa key ID rotacijom i konstantnim poređenjem.
5. Password/IP rate limiting pseudonimizira ključeve, koristi atomsku Redis logiku i ne zaključava račun trajno.
6. Login-failure audit ne zapisuje raw e-mail, IP, password ili token; HIBP i CAPTCHA imaju bounded ulaze i sanitizovane logove.

## 8. Registar nalaza

| ID                   | Severity | Naslov                                                                         | Status   | Veličina |
| -------------------- | -------- | ------------------------------------------------------------------------------ | -------- | -------- |
| BA-authentication-01 | P1       | Refresh oživljava session čiji registry red ne postoji                         | zatvoreno (W2.14) | S        |
| BA-authentication-02 | P1       | Opoziv sesije fail-open krši logout/password-reset garanciju tokom Redis kvara | zatvoreno (W2.15) | L        |
| BA-authentication-03 | P1       | MFA enrollment token i potvrda nisu atomski single-use                         | zatvoreno (W2.16) | M        |
| BA-authentication-04 | P2       | Endpoint za opoziv jedne sesije očekuje UUID, a schema izdaje CUID             | zatvoreno (W2.17) | S        |
| BA-authentication-05 | P2       | Passkey counter update nema compare-and-set zaštitu                            | zatvoreno (W2.18) | M        |
| BA-authentication-06 | P2       | Entra JWKS dohvat nema timeout ni cache                                        | zatvoreno (W2.19) | M        |
| BA-authentication-07 | P2       | Kritični testni gate zavisi od mrežnog Prisma engine downloada                 | zatvoreno (W2.20) | M        |
| BA-authentication-08 | P3       | Clone detekcija jednog passkeya briše sve korisnikove passkeye                 | otvoreno | S        |
| BA-authentication-09 | P3       | 401 guarda ne briše mrtav `helpdesk_session` cookie                            | zatvoreno (W2.15a) | S        |

## 9. Detaljni nalazi

### BA-authentication-01 — Refresh oživljava neaktivnu sesiju

- **Dokaz:** `AuthenticationService.refresh()` poziva `findActive(sessionId)`, ali kada rezultat bude `null`, nastavlja na `touch`, izdaje novi JWT i koristi `claims.rememberMe`. Test „does not revoke when there is no live registry row“ eksplicitno očekuje uspješan refresh.
- **Uticaj:** izbrisan, istekao ili drugačije nedostupan registry red ne prekida refresh. Durable session registry zato nije autoritativan za refresh, a 30-dnevni claim može nastaviti produžavati sesiju.
- **Root cause:** `null` je tretiran kao kompatibilni fallback iako legacy tokeni već imaju poseban `sid === null` migracijski tok.
- **Korekcija:** za token sa `sid` zahtijevati aktivan red čiji `userId` odgovara subjectu; `null` vraća 401 bez izdavanja/toucha.
- **Acceptance:** unit test za missing/expired/revoked/wrong-user red; E2E pokušaj refresh-a poslije DB/administrativnog opoziva.
- **Owner:** authentication/session owner.

### Implementacijski status Vala 2 / W2.2 (2026-10-24)

SHA `10e8fd6ea1c328d647b6f2bc77960567f8bc8af5`, CI `40119814862`, uvodi PostgreSQL authority provjeru svakog modernog `sid` tokena i fail-closed Redis read outage. Multi-replica real-PostgreSQL test potvrđuje da revocation commit jedne replike važi na narednoj provjeri druge replike uprkos stale Redis stanju. `BA-authentication-02` ipak ostaje otvoren dok legacy JWT bez `sid` ne dobije durable cutoff koji preživljava neuspjeli Redis write.

### Implementacijski status Vala 2 / W2.14 (2026-11-25)

Zatvoreno. `AuthenticationService.refresh()` za token sa `sid` sada zahtijeva aktivan registry red
(`findActive`) **i** poklapanje `userId` sa subjectom tokena; `null` ili tuđi red vraćaju **401
`INVALID_CREDENTIALS` bez izdavanja tokena i bez `touch`-a**. `rememberMe` se čita iz registry reda, a ne iz
claima, pa registry postaje autoritet i za produženje sesije. Legacy `sid === null` migracijski tok ostaje
netaknut (kratkotrajni `provider: 'legacy'` red, nikad 30 dana).

Test koji je kvar propisivao („does not revoke when there is no live registry row") je invertiran; dodati su
slučajevi za tuđi red i za legacy tok. Realni PostgreSQL integracioni test dokazuje da `findActive` vraća
`null` za opozvan, istekao i obrisan red, a E2E 37 poslije `revoke-others` traži `POST /auth/refresh` → 401 i
nikakav živ `helpdesk_session` cookie.

Detalj isporuke: `docs/backend/implementation/347-w214-ba-authentication-01-refresh-registry.md`.

### BA-authentication-02 — Revocation fail-open

- **Dokaz:** `SessionRevocationStore.isRevoked()` na svaku Redis grešku vraća `false`; svi write failurei se samo loguju. Guard običnog zahtjeva ne provjerava `UserSession` bazu.
- **Uticaj:** ukradeni JWT može ostati važeći do isteka i nakon logouta, promjene lozinke, MFA resetovanja, deaktivacije ili admin revocationa ako Redis nije dostupan. API i audit mogu prijaviti uspješan opoziv dok enforcement nije primijenjen.
- **Root cause:** globalna availability-over-revocation odluka bez durable fallbacka ili eksplicitnog degraded-security statusa.
- **Korekcija:** definisati hibridnu strategiju: durable version/cutoff u bazi ili kratki DB fallback za sigurnosno opozvane korisnike, health alarm i jasno fail ponašanje. Ne uvoditi naivni DB query na svaki zahtjev bez performance testa.
- **Acceptance:** fault-injection testovi za Redis read/write outage poslije logout/password reset/deactivation; token mora biti odbijen ili sistem mora eksplicitno fail-closed prema odobrenoj politici.
- **Owner:** authentication + platform/Redis owner.

### Implementacijski status Vala 2 / W2.15 (2026-11-25)

Zatvoreno. Hybridna strategija je sada eksplicitna: **PostgreSQL je autoritet, Redis je akcelerator**.

- Tokeni sa `sid` su i prije ovog paketa bili durable (`UserSession.revokedAt`, `W2.2`).
- Legacy tokeni bez `sid` sada imaju **durable cutoff na `User`** (`tokensInvalidBefore`,
  `tokensInvalidBeforeExceptJti`). Piše ga svaki "revoke all" put (`logout` legacy tokena, promjena lozinke,
  MFA reset, deaktivacija, admin `revoke-others`, directory sync, CLI `reset-mfa`), a čita ga **isti
  `findUnique` koji je guard legacy grane ionako radio** — nula dodatnih upita i nula dodatnih round-tripova.
- Neuspjeli Redis write više ne produžava život tokena: cutoff je u bazi, a greška pri upisu cutoffa je
  `Logger.error` (alarm), ne 500 za korisnika koji je već završio logout.
- Cijena: legacy cutoff je per-user, pa sign-out sa starog tokena gasi **sve** legacy tokene tog korisnika.
  To je prihvaćeno svjesno — legacy tokeni su ograničena migracijska populacija (1 h životni vijek, nijedan
  novi od uvođenja registra), a alternativa je nova tabela per-`jti` opoziva sa sopstvenim cleanupom.
  Preferirana precizna opoziva i dalje ide preko Redis `auth:revoked-jti:*` dok je Redis zdrav.

Detalj isporuke: `docs/backend/implementation/349-w215-ba-authentication-02-durable-legacy-cutoff.md`.

### BA-authentication-03 — Neatomski MFA single-use

- **Dokaz:** `verifyMfaToken()` provjerava revocation, zatim `confirmMfaEnrollment()` mijenja MFA stanje, `consumeMfaToken()` tek poslije toga zapisuje revocation, pa se izdaje sesija. Revocation write nije atomic claim i fail-open je. `MfaService.confirmEnrollment()` početni `enabledAt` check nije dio CAS update predicatea.
- **Uticaj:** dvije paralelne potvrde istog enrollment tokena/koda mogu obje uspjeti, kreirati dvije sesije i vratiti različite recovery-code liste; samo zadnji DB set ostaje validan. Kod Redis kvara isti MFA token može se ponovo koristiti do JWT isteka.
- **Root cause:** check/use/revoke raspoređeni su kroz Redis i Prisma bez jednokratnog claim stanja.
- **Korekcija:** atomically claim MFA `jti` prije state changea, sa jasno definisanim rollback/retry stanjem; enrollment update mora imati `enabledAt:null` i pending identity predicate ili transakcijski lock.
- **Acceptance:** konkurentni test sa dvije potvrde: tačno jedna sesija i jedan recovery set; replay i Redis failure testovi.
- **Owner:** authentication/MFA owner.

#### Implementacijski status Vala 2 / W2.16 (2026-11-25)

- MFA token se sada **claim-uje prije ijedne provjere koda**, u novoj tabeli `MfaTokenClaim` (`jti` je primarni
  ključ): `INSERT` je atomski claim, `P2002` znači da je token već iskorišten ili je u letu, a `consumedAt` je
  jedina oznaka „potrošen". Redis `auth:revoked-jti:*` ostaje akcelerator, ne autoritet.
- **Replay** sada vraća `401 INVALID_CREDENTIALS` i **ne izvršava provjeru koda** — nema oraklja koji bi potvrdio
  da je kod bio tačan. Odbijen kod **oslobađa** claim (`DELETE … WHERE consumedAt IS NULL`), pa tipfeler ne
  košta novu prijavu; konzumiran claim se nikad ne oslobađa.
- **`confirmEnrollment`** je compare-and-set unutar `$transaction`: `updateMany` sa predikatom
  `{enabledAt: null, pendingSecretEncrypted: <pročitano>, pendingCreatedAt: {gt: now - 15 min}}`, recovery kodovi
  u istoj transakciji. `count === 0` ⇒ `409 MFA_ALREADY_ENABLED`; gubitnik ne piše ni jedan kod.
- **Cijena:** jedna tabela koja se trimuje na svakoj potrošnji (retention 24 h), jedan `INSERT` + jedan `UPDATE`
  po MFA prijavi i lease od 30 s za claim procesa koji je pao između claima i potvrde.
- Dokaz: 11 novih unit testova (uključujući **Redis failure** i dvije paralelne potvrde) + 2 integracijska nad
  realnim PostgreSQL-om (paralelni `INSERT`, dvije paralelne potvrde ⇒ jedan recovery set).
- Detalj isporuke: `docs/backend/implementation/350-w216-ba-authentication-03-atomic-mfa-single-use.md`.

### BA-authentication-04 — UUID/CUID mismatch

- **Dokaz:** `DELETE /auth/sessions/:sessionId` koristi `ParseUUIDPipe`; `UserSession.id` je `@default(cuid())`, a frontend šalje ID vraćen iz `GET /auth/sessions`.
- **Uticaj:** opoziv pojedinačne moderne sesije završava 400 prije ownership provjere. „Opozovi ostale“ radi drugim putem, pa kvar može ostati neprimijećen.
- **Korekcija:** koristiti bounded CUID/string validator usklađen sa schema ugovorom ili migrirati ID strategiju eksplicitno; dodati controller contract test sa stvarnim schema-shape fixtureom.
- **Acceptance:** listani session ID se može opozvati; nevažeći/tuđi ID ostaje sigurno odbijen.
- **Owner:** authentication API owner.

#### Implementacijski status Vala 2 / W2.17 (2026-11-25)

- `:sessionId` se validira **prema šemi**, ne prema pretpostavci: novi `CuidParamPipe`
  (`common/validation/cuid-param.pipe.ts`, `^c[0-9a-z]{19,29}$`) prihvata `@default(cuid())` oblik, a sve ostalo
  (UUID, velika slova, predugačko, non-string) odbija sa `400 INVALID_ID` **prije** ijednog upita.
- Provjera vlasništva je netaknuta: tuđi, dobro oblikovan ID i dalje daje `404 SESSION_NOT_FOUND`, pa odgovor ne
  otkriva ništa o tuđoj sesiji.
- Dokaz: pipe spec **6** (granice 19/20/30/31, UUID, uppercase, non-string), controller contract test **4** —
  uključujući regression anchor koji pokazuje da `ParseUUIDPipe` odbija isti ID koji lista vrati — i novi E2E test
  u specu 37 (`204` za sopstveni listani ID, `400 INVALID_ID` za malformed, `404` za tuđi, drugi klijent ostaje
  prijavljen). E2E se izvršava poslije deploya builda; vidi closeout.
- Detalj isporuke: `docs/backend/implementation/351-w217-ba-authentication-04-cuid-session-param.md`.

### BA-authentication-05 — Passkey counter race

- **Dokaz:** `verifyAssertion()` čita counter, validira assertion i radi bezuslovni `update({id})`. Za razliku od TOTP-a, update nema predicate na prethodni counter.
- **Uticaj:** paralelne ceremonije mogu obje proći sa istim početnim stanjem; sporiji upis može vratiti niži counter i oslabiti clone/replay signal.
- **Korekcija:** CAS `updateMany` nad `id` i očekivanim counterom, zahtijevati `count===1`; posebno tretirati counterless authenticatore prema WebAuthn pravilima.
- **Acceptance:** race test sa dvije validacije i obrnutim redom upisa; counter nikad ne regresira i samo dozvoljeni winner prolazi.
- **Owner:** authentication/WebAuthn owner.

#### Implementacijski status Vala 2 / W2.18 (2026-11-26)

- Upis countera je **compare-and-set**: `updateMany({ where: { id, counter: <pročitana vrijednost> } })` uz
  `count === 1`; bez podudaranja se **ne upisuje ništa**, pa counter nikad ne regresira.
- Gubitnik CAS-a dobija `401 MFA_INVALID_CODE` kao **stale duplikat** (paralelna ceremonija je već pomjerila
  counter) i **faktor se ne briše**; clone odluka (`newCounter <= stored > 0` ⇒ `PASSKEY_CLONED` + brisanje)
  ostaje ispred upisa i nepromijenjena.
- Counterless autentikatori (`counter = 0`) ostaju dozvoljeni paralelno — po WebAuthn pravilu nema šta porediti.
- Dokaz: 4 nova/proširena unit testa (CAS predikat, gubitnik bez brisanja, nestali red, clone granica) i
  `passkey-counter-cas.integration.spec.ts` sa realnim PostgreSQL-om — barijera drži dvije ceremonije poslije
  čitanja istog reda: tačno jedan pobjednik, `counter 5 → 6`, red prezivljava; plus counterless par gdje oba prolaze.
- Detalj isporuke: `docs/backend/implementation/352-w218-ba-authentication-05-passkey-counter-cas.md`.

### BA-authentication-06 — JWKS bez timeouta/cachea

#### Implementacijski status Vala 2 / W2.19 (2026-10-29)

- JWKS dokument se dohvata kroz `entra-jwks-key-resolver.ts`: **timeout** 5 s (`AbortController`), **cache** po
  `jwksUrl` sa TTL-om 24 h i indeksom `kid → JWK`, **jedan** kontrolisani refresh na nepoznat `kid` (cooldown 30 s
  da `kid` iz napada ne može postati generator vanjskih poziva) i **ograničenje dokumenta** na 256 KB
  (`content-length` + dekodirano tijelo) uz validaciju oblika `{ keys: [...] }`.
- Paralelne prijave dijele jedan `fetch` (single-flight); transportni ispad služi keširani dokument uz `warn` do
  7 dana, dok malformiran/prevelik odgovor **nikad** ne vraća stare ključeve (fail-closed).
- Verifikator je singleton i drži jedan resolver — jedan dokument po procesu, ne po prijavi.
- Dokaz: `entra-jwks-key-resolver.spec.ts` (11 testova: timeout, cache-hit, cache po URL-u, rotacija, unknown-kid
  burst, malformed/oversized/non-2xx, greška se ne kešira, stale granica) + novi test u
  `microsoft-entra-id-token.verifier.spec.ts` za nalet prijava; lokalno 61/61.
- Detalj isporuke: `docs/backend/implementation/353-w219-ba-authentication-06-entra-jwks-cache-timeout.md`.

- **Dokaz:** `resolve-entra-jwks-public-key.ts` radi `fetch(jwksUrl)` bez `AbortSignal`, cachea ili bounded response kontrole; poziva se za svaku Entra prijavu.
- **Uticaj:** spor Microsoft/network odgovor može držati request i resurse neograničeno; outage ili login burst nepotrebno multiplicira vanjske pozive.
- **Korekcija:** timeout, cache po issuer/kid sa kontrolisanim TTL-om, jedan refresh na unknown `kid`, maksimalna veličina dokumenta i metrički signal.
- **Acceptance:** timeout, cache-hit, key-rotation/unknown-kid i malformed/oversized response testovi.
- **Owner:** authentication/Entra owner.

### BA-authentication-07 — Prisma generator blokira audit testove

#### Implementacijski status Vala 2 / W2.20 (2026-11-29)

- Uzrok je bio eager `ensureBinariesExist()` na startu Prisma CLI-ja (`prisma generate --help` pada isto), a
  `generate`/`validate`/`format` engine binar **ne koriste** — rade iz WASM enginea u `prisma` paketu.
- `scripts/prisma-offline.mjs` za te tri komande postavlja `PRISMA_SCHEMA_ENGINE_BINARY` na sentinel u repou
  (`generate` više ne ide na `binaries.prisma.sh`); `migrate`/`db` putevi su netaknuti i dalje traže pravi engine.
- `prisma/engines.lock.json` pinuje `enginesVersion`/`engineCommit`, a `scripts/prisma-offline.test.mjs` pada kad
  pin driftuje od instaliranog `@prisma/engines-version`.
- Jest `globalSetup` generiše klijent na čistom checkoutu (offline), pa 24 suitea više ne padaju na
  `Cannot find module '../../generated/prisma/client'`; Dockerfile i `db:generate`/`db:validate` idu kroz wrapper.
- Dokaz: obrisan `src/generated/prisma` + `PRISMA_ENGINES_MIRROR=http://127.0.0.1:9` → validate + generate prolaze;
  `npx jest src/modules/authentication` = **43 passed / 3 skipped, 372 testa**; wrapper test 7/7; CI korak
  „Prove generate/validate need no network" + „Run every authentication suite".
- Detalj isporuke: `docs/backend/implementation/354-w220-ba-authentication-07-prisma-offline-generate.md`.

- **Dokaz:** 24/40 suiteova ne kompajlira bez generated clienta; generator pokušava runtime download sa `binaries.prisma.sh`, nedostupnim u audit okruženju.
- **Uticaj:** clean/offline CI ili ograničeni runner ne može dokazati kritične auth suiteove i build iako 16 izolovanih suiteova prolazi.
- **Korekcija:** CI image/cache mora sadržati pinovani Prisma engine ili dozvoljeni mirror; generation treba biti eksplicitna precondition faza sa checksumom.
- **Acceptance:** clean, network-restricted reproducible install/generate/build i svih 40 auth suiteova.
- **Owner:** backend platform/CI owner.

### BA-authentication-08 — Clone incident briše sve passkeye

- **Dokaz:** stale counter jedne credential grane izvršava `deleteMany({where:{userId}})`.
- **Uticaj:** greška ili klon jednog authenticatora uklanja sve nezavisne passkeye, povećava lockout/DoS površinu i otežava forenziku.
- **Korekcija:** invalidirati samo pogođeni credential, sačuvati incident metadata/audit i obavijestiti korisnika; globalni reset koristiti samo uz eksplicitnu politiku.
- **Acceptance:** clone test ostavlja drugi credential aktivnim i stvara audit/notification dokaz.
- **Owner:** authentication/WebAuthn owner.

### BA-authentication-09 — 401 ne briše mrtav cookie

- **Dokaz:** `SessionAuthenticationGuard` odbija mrtvu sesiju sa 401 `INVALID_CREDENTIALS`, ali odgovor ne
  sadrži `Set-Cookie`. Cookie briše samo `POST /auth/logout` (i `SessionCookieInterceptor` na uspjehu), pa
  browser zadržava `helpdesk_session` do vlastitog `Max-Age` — kod „Zapamti me" do **30 dana**.
- **Uticaj:** poslije opoziva, isteka ili deaktivacije sesije pregledač i dalje šalje mrtav cookie na svaki
  zahtjev. Svaki ekran dobija 401, SPA se vraća na prijavu, ali cookie ostaje i ponovo se šalje poslije
  prijave druge sesije; uz to svaki takav zahtjev plaća neuspješnu provjeru. Nije propust kontrole pristupa
  (401 je ispravan), nego higijena sesije.
- **Root cause:** brisanje cookieja vezano je za uspješan `logout` tok, a ne za *svaki* odgovor koji sesiju
  proglašava mrtvom.
- **Korekcija:** guard na svaki 401 **za cookie pozivaoce** postavlja `Set-Cookie` sa
  `helpdesk_session=; Max-Age=0` (`buildClearedSessionCookie`). Bearer klijenti nemaju ambijentalni cookie i
  ne dobijaju header; `403 FORBIDDEN_ORIGIN` (sesija je tada valjana) takođe ne briše cookie; kontekst bez
  response objekta ne mijenja 401.
- **Acceptance:** unit testovi za neaktivan račun, neverifikovan token, bearer poziv, origin-refusal i
  uspješan zahtjev; E2E 37 traži `Max-Age=0` na 401 poslije `revoke-others`.
- **Owner:** authentication/session owner.

## 10. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                                 |
| ------------------------ | -------: | -----: | ----------: | ---------------------------------------------------------------------------- |
| Arhitektura              |      10% |   8,30 |        0,83 | dobra podjela providera/security servisa; velik export i Redis/DB dual state |
| API i ugovori            |      12% |   7,70 |        0,92 | validirani DTO-i i stabilni odgovori; UUID/CUID mismatch                     |
| AuthN/AuthZ/scope        |      15% |   7,00 |        1,05 | jak guard/CSRF/principal model; fail-open revocation                         |
| Poslovna pravila         |      13% |   6,80 |        0,88 | dobra MFA pravila; refresh i single-use konkurencija                         |
| Podaci i transakcije     |      13% |   7,20 |        0,94 | dobri indeksi/CAS za TOTP; MFA/passkey race rupe                             |
| Sigurnost i privatnost   |      12% |   7,20 |        0,86 | jake primitive/redakcija; P1 revocation i enrollment rizik                   |
| Async/integracije        |       8% |   6,90 |        0,55 | Redis Lua i HIBP timeout; JWKS bez timeout/cachea                            |
| Testovi                  |      10% |   7,80 |        0,78 | širok suite/E2E; nema ključnih race/outage testova i gate je blokiran        |
| Operativnost/performance |       7% |   8,60 |        0,60 | metrike i auditi jaki; degraded revocation nije dovoljno signaliziran        |
| **Ukupno**               | **100%** |        | **7,42/10** | ograničeno otvorenim P1 nalazima                                             |

## 11. Fazni plan popravki

### Faza 0 — reprodukcija i safety net

- BA-01: promijeniti postojeći test koji trenutno očekuje refresh bez registry reda; dodati revoked/expired/wrong-user varijante.
- BA-03/05: konkurentni MFA enrollment i passkey counter harness sa kontrolisanim barrierima.
- BA-04: controller test sa stvarnim CUID session ID-em.
- BA-02: Redis fault-injection testovi za logout, password reset, deactivate i guard.
- BA-06: fake-fetch timeout/cache/rotation testovi.

**Gate:** svi nalazi imaju crveni test prije proizvodne korekcije; postojeći sigurnosni testovi ostaju zeleni.

### Faza 1 — P1 session i MFA integritet

- odbiti refresh svakog `sid` tokena bez aktivnog, subject-matching registry reda;
- uvesti odobreni durable/fail-closed revocation ugovor i degraded-security health signal;
- uvesti atomic claim za MFA token i CAS enrollment commit;
- definisati ponašanje nakon djelimičnog failurea bez izdavanja „ghost“ sesije.

**Gate:** jedan sigurnosni događaj proizvodi najviše jednu sesiju; opozvani token ne radi u fault-injection matrici.

### Faza 2 — API/schema i WebAuthn konkurencija

- uskladiti session path ID validator sa CUID schema ugovorom;
- CAS passkey counter update;
- invalidirati samo pogođeni cloned credential uz audit i notification.

**Gate:** individual revoke radi end-to-end; passkey counter ne regresira u paralelnom testu.

### Faza 3 — Entra bounded integration

- dodati timeout, JWKS cache/single-flight, key-rotation refresh, size limit i metrike;
- dokumentovati sigurnu TTL/rotation politiku.

**Gate:** Entra testovi dokazuju timeout, cache i rotaciju bez prihvatanja pogrešnog issuer/audience/algoritma.

### Faza 4 — reproducibilni Prisma/test gate

- obezbijediti pinovani engine u CI image/cacheu ili dozvoljeni mirror;
- clean generation/build bez implicitnog javnog downloada;
- izvršiti svih 40 auth suiteova, relevantne cross-module suiteove i E2E 37/39/46/47/48/55.

**Gate:** nema environment-blocked auth suitea; production/full dependency audit odvojeno evidentiran.

### Faza 5 — dokumentacija i finalna ocjena

- ažurirati API/session/revocation runbook;
- povezati BA-01–08 sa testovima i commitima;
- ponoviti svih devet score presjeka;
- zatvoriti modul tek nakon zvaničnog CI dokaza finalnog implementacijskog SHA.

## 12. Implementacijski rizici i rollback

- Fail-closed revocation može izazvati širu nedostupnost tokom Redis incidenta; dizajn mora imati mjerljiv i testiran fallback prije rollouta.
- Atomic MFA claim mora razlikovati retry nakon transportnog prekida od replaya; pogrešan redoslijed može zaključati legitimnog korisnika.
- JWKS cache ne smije predugo zadržati povučeni ključ niti blokirati Microsoft key rotation.
- Promjena ID validatora je kompatibilna sa postojećim CUID podacima; migracija na UUID nije preporučena kao usputna korekcija.
- Passkey CAS mora poštovati authenticatore sa counterom 0.

Rollback svake faze mora zadržati nove testove i vratiti samo izolovanu behavior promjenu; schema migracije u ovom planu nisu potrebne osim ako revocation dizajn svjesno uvede durable session version.

## 13. Traceability i acceptance

| Nalaz | Safety-net dokaz                                | Korektivni acceptance                         | Širi regresijski dokaz     |
| ----- | ----------------------------------------------- | --------------------------------------------- | -------------------------- |
| BA-01 | missing/revoked/expired/wrong-user refresh test | 401, bez tokena i toucha                      | E2E 37/55                  |
| BA-02 | Redis fault injection                           | opozvani token odbijen po politici            | E2E 37/39 + ops health     |
| BA-03 | parallel enrollment/replay                      | jedan claim, jedna sesija, jedan recovery set | E2E 37/39                  |
| BA-04 | real CUID controller fixture                    | DELETE 204 za vlastitu sesiju                 | account security UI/E2E 37 |
| BA-05 | concurrent counter test                         | CAS i monotoni counter                        | E2E 46                     |
| BA-06 | slow/rotated JWKS fake                          | bounded timeout/cache/rotation                | Entra provider suite       |
| BA-07 | clean offline generation                        | 40/40 suiteova kompajlira i prolazi           | backend build/CI           |
| BA-08 | two-credential clone fixture                    | samo pogođeni credential uklonjen             | E2E 46                     |
| BA-09 | guard 401 × cookie/bearer/origin/success        | `Max-Age=0` samo za mrtvu cookie sesiju       | E2E 37                     |
| BA-09 | guard 401 × cookie/bearer/origin/success        | `Max-Age=0` samo za mrtvu cookie sesiju       | E2E 37                     |

## 14. Konačna presuda

Modul je funkcionalno bogat i ima iznadprosječne kriptografske, privacy i testne temelje, ali session revocation/refresh i MFA concurrency garancije nisu dovoljno stroge za enterprise security granicu. Baseline **7,42/10** je iskren rezultat otvorena tri P1 nalaza, a ne procjena opšte količine funkcionalnosti. Audit modula je završen; implementacija BA-01–08 ostaje odgođena do završetka kompletnog backend audita.
