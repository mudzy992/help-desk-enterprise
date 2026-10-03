# REVIEW_ANALIZA — audit aplikacije Service Desk prema projektnom zadatku

> **Faza 2 (audit + dokumentacija).** Dokument se gradi **inkrementalno, modul po modul**; za svaki modul ima
> istih devet cjelina. Redoslijed i podjela na module su dogovoreni u Fazi 1; pauze za potvrdu su na kraju
> svake iteracije.
>
> **Ulazni zadatak:** `RAW_PROJECT.md` (root repoa; izvod iz `EPHELPDESK.pdf`, koji se ne dira). Zadatak je
> ulaz, ne dokaz: provjerava se šta od njega stvarno radi, a bilježi se i ono što je urađeno iznad njega.
>
> **Metod dokazivanja:** svaka tvrdnja o implementaciji ima putanju fajla, ime funkcije i (gdje je korisno)
> broj linije. Ono što nije pročitano ne tvrdi se; nesigurno je označeno `[NEJASNO]`.
>
> **Oznake:** `[ČINJENICA]` = pročitano u kodu · `[MIŠLJENJE]` = recenzentski sud · `[NEJASNO]` = nije
> provjereno. Statusi u gap tabelama: `Implementirano / Djelimično / Nedostaje / Odstupa`.
>
> **Povezani dokumenti:** `docs/REVIEW-2026-09-25.md` (stariji, uži review koda), `docs/PROJEKTNI-ZADATAK-GAP-2026-09-25.md`
> (gap iz septembra, prije paketa 1.1–3.4), `DOCS_CHANGELOG.md` (šta je u dokumentaciji mijenjano i zašto).
>
> **Izmjene izvornog koda:** u Fazi 2 se **ne mijenjaju**. Nalazi se samo bilježe; popravke idu u roadmap.

## Stanje po iteracijama

| Iteracija | Moduli | Stanje |
|---|---|---|
| 1 | M1 Instalacija · M2 Prijava/MFA · M3 Korisnici/OJ/grupe · M4 RBAC · M5 Policy paketi | M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ (iteracija 1 završena) |
| 2 | M6 Katalog usluga i forme · M7 Routing i prioritet · M8 Tiketi · M9 Odobrenja/CSAT · M10 SLA | M6 ✅ · M7 u toku |

---

# M1 — Instalacija (prvi start)

## 1. Planirano u RAW projektnom zadatku

- **MVP IN lista** (`RAW_PROJECT.md:1063`): *„Install wizard (first-run): local SuperAdmin, auth mode local|AD,
  SMTP, seed grupa/servisa/OU, addon flags — vidi `.cursor/docs/04-install-wizard.md`“*. To je jedina stavka
  zadatka koja opisuje prvi start; `.cursor/docs/04-install-wizard.md` nije u ovom repou (`.cursor/` ima
  `docs/theme.md` i `rules/`), pa je mjerodavan ovaj jedan red.
- **Kontekst iz §1** (`RAW_PROJECT.md:29`): SSO preko Entra ID „bez lokalnih lozinki“ — ali uz
  `RAW_PROJECT.md:894–903` (dev/test autentikacija radi bez AD-a, `local_dev` režim, AD čitanje isključeno po
  zadatku i aktivira se ručno). Za instalaciju to znači: prvi nalog mora postojati prije nego što AD/Entra uopšte
  može biti konfigurisan.
- **§6 Settings contract** (`RAW_PROJECT.md:431–470`): sve što wizard upisuje mora ići u registry (public/private,
  tipovi, validacija, secret handling), a ne u env ili hardkodirano.
- **§12 Acceptance** (`RAW_PROJECT.md:891` i dalje): instalacija kao takva nema svoju stavku prihvata; posredno je
  pokrivena zahtjevima za dev autentikaciju i AD čitanje.

## 2. Stvarnost — kako bi profesionalna prva instalacija izgledala `[MIŠLJENJE]`

Industrijski standard za „first-run wizard“ enterprise aplikacije ima šest osobina:

1. **Zaštićen prozor.** Između deploya i završetka instalacije aplikacija je bez ijednog naloga, pa je wizard
   najosjetljiviji endpoint sistema. Standard je: jednokratni token ili privremeni pristup (CLI/reverse-proxy),
   rate limit, detaljno logovanje svakog pristupa, i automatsko zaključavanje čim instalacija završi.
2. **Server je izvor stanja.** Koraci se ne pamte u pregledniku: `GET /install/status` vraća za svaki korak
   (`superAdmin`, `loginProvider`, `smtp`, `seed`, `addons`) je li završen i šta je sljedeće. Klijent samo
   prikazuje. Time prekid rada, osvježavanje taba ili drugi operater nastavljaju tačno gdje se stalo.
3. **Idempotentnost i ponovni ulazak.** Svaki korak se može pozvati dvaput bez štete (upsert, ne „create“),
   seed je u jednoj transakciji i vraća šta je zaista kreirano, a neuspjeh ne ostavlja pola stanja.
4. **Verifikacija, ne samo validacija.** SMTP se testira slanjem probe, LDAPS bind test-konekcijom, Entra
   provjerom discovery dokumenta; format polja je minimum, ne dokaz da konfiguracija radi.
5. **Tajne su write-only.** Lozinke i bind nalozi se nikad ne vraćaju klijentu (samo „postavljeno: da/ne“), a
   upis idu kroz secret handling registryja.
6. **Završetak sa dokazom.** Prije zaključavanja sistem provjeri da SuperAdmin može da se prijavi, da JWT tajna
   postoji i da se seed ruta razrješava; sve to upiše u audit/change log, i tek onda zaključa wizard.

Uz to: nema „demo“ podataka u produkcijskoj instanci, a svaki korak ima jasnu, prevedenu poruku greške
(bez stack trace-a), i postoji put oporavka ako je deploy pao na pola.

## 3. Preporučena implementacija `[MIŠLJENJE]`

Zatečena arhitektura (korak = endpoint, guardovi, token) je **zdrava osnova** i ne bih je mijenjao; dopune bi bile:

1. **Status po koracima kao ugovor.** `GET /install/status` da vrati `steps: { superAdmin: {done}, loginProvider:
   {done, mode}, smtp: {done, enabled}, seed: {done}, addons: {done} }` i `nextStep`. Frontend tada ne računa
   korak (`resolve-install-wizard-step.ts`), samo ga prikazuje — time nestaje i današnji heuristički problem iz §7.
2. **Verifikacione rute:** `POST /install/verify/smtp` (proba slanja), `POST /install/verify/ldaps` (bind), uz
   jasne kodove grešaka i bez upisa u konfiguraciju.
3. **Politika lozinke SuperAdmina kroz isti loader kao 2.1** (`account-security-policy.loader.ts`): blocklist,
   minimalna dužina iz postavke, historija. Prvi nalog je najprivilegovaniji, pa ne smije biti izuzetak.
4. **Završna provjera prije `complete`:** postojanje JWT tajne (danas se osigurava u transakciji), razrješavanje
   seed rute i upis u change log sa `reason` (danas postoji), plus zapis u audit log.
5. **Rate limit i log pristupa** na `/install/*` u periodu dok instalacija nije završena.
6. **E2E scenarij** za cijeli tok (token → koraci → complete → zaključavanje), jer ga danas nema.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

**Backend:** `backend/src/modules/install/` — 116 fajlova, 7 063 linije, 24 `*.spec.ts`.

- **Rute** (`install.controller.ts:45` `@UseGuards(InstallWizardLockGuard)`, `:64–129`): `GET/POST /install/{status,
  super-admin, login-provider, smtp, seed, addons}`, `POST /install/complete`. `GET /install/status` je jedini
  put koji ne traži token; sve ostalo prije završetka traži `X-Install-Token`.
- **Globalna kapija** (`install.module.ts:31–32` `APP_GUARD` → `install-setup.guard.ts:22` →
  `enforce-install-setup-gate.ts:8–20`): dok `private.install.completedAt` nije valjan ISO datum, **svaki** request
  osim izuzetih vraća 503 `SETUP_REQUIRED`. Izuzeti su svi `/install/*`, `GET /health`, `GET /branding`
  (`is-install-setup-exempt-request.ts:9–25`). Kapija se čita iz registryja preko `InstallSetupService.isCompleted()`
  (`install-setup.service.ts:15–25`).
- **Zaključavanje poslije završetka** (`is-install-wizard-mutation-locked.ts:7–10,35`): poslije završetka ostaju
  otvoreni samo `GET /install/status` i `GET /install/addons`; svi ostali `/install/*` putevi vraćaju `INSTALL_LOCKED`,
  uključujući `GET /install/super-admin` (ranije je otkrivao email SuperAdmina — komentar Review 2026-09-25 S4).
  `POST /install/complete` ostaje dozvoljen i poslije (idempotentno).
- **Token** (`install-token.ts:13,19,44–60`): `INSTALL_TOKEN` iz env, najmanje 16 znakova; ako nije postavljen →
  403 `INSTALL_TOKEN_NOT_CONFIGURED`; poređenje kroz `sha256` i `timingSafeEqual`. `.env.example:28` ima prazan
  `INSTALL_TOKEN=`.
- **SuperAdmin** (`install-super-admin.service.ts`, `create-install-super-admin.ts:46–70`,
  `validate-install-super-admin-credentials.ts:16–29`, `install-super-admin.constants.ts:2,5–8`): email (max 254),
  ime (max 120), lozinka **12–128** i ne smije biti jednaka emailu; bcrypt sa faktorom 12
  (`authentication.constants.ts:4`); `isLocalOnly` invarijanta (`apply-super-admin-local-only-invariant.ts`,
  `assertSuperAdminIsLocalOnly`), rola `SuperAdmin`, `passwordChangedAt` se postavlja (2.1 politika isteka kreće od
  instalacije). Duplikat → `SUPER_ADMIN_ALREADY_EXISTS`, zauzet email → `SUPER_ADMIN_EMAIL_TAKEN`. Uz nalog se
  upisuje i interni email domen (`seed-install-internal-email-domain.ts`).
- **Način prijave** (`install-login-provider.service.ts:36–60`, `read-install-login-provider-status.ts`): `local` ili
  `entra_ad` (`parse-authentication-mode.ts`); za `entra_ad` traži se tenant+client **ili** kompletan LDAPS bind;
  status vraća samo `…Configured: true/false` i URL-ove — **tajne se nikad ne vraćaju**. Ponovni upis bez lozinke
  zadržava postojeću (`readStoredInstallLoginProviderSecrets`).
- **SMTP** (`install-smtp.service.ts:36–60`, `validate-install-smtp.ts:17–40`, `install-smtp.constants.ts`): prekidač
  `enabled`; kada je isključen, polja nisu obavezna i e-mail dodatak se **forsira na off**
  (`resolve-email-addon-enabled` kroz `resolve-install-addons-state.ts`). Kada je uključen: host (regex, max 255),
  port 1–65535 (zadano 587), TLS (zadano uključen), korisnik (max 256), lozinka (max 256, secret), `from` adresa
  (regex, max 254). Prazna polja se popunjavaju iz env prefiksa `SMTP_HOST/PORT/TLS/USER/PASSWORD/FROM`
  (`read-install-smtp-env-prefill.ts:32–42`).
- **Seed** (`install-seed.service.ts:36–46`, `seed-install-minimum.ts:23–60`): zahtijeva SuperAdmina; u jednoj
  transakciji osigurava OJ, fallback grupu, kategoriju, servis, formu i routing pravilo, pa **provjerava da se ruta
  razrješava na tu grupu** (`assertSeedResolution`, greška `SEED_ROUTING_UNRESOLVED`). Zadane vrijednosti
  (`install-seed.constants.ts:3–11`): OJ „Direkcija“ (`DIRECTORATE`, `OU=Direkcija,DC=local`), grupa „Fallback“
  (`key=fallback`, `isFallback`), kategorija „Opšte“, servis „Opšti zahtjev“ sa formom od jednog polja
  („Dodatne informacije“, textarea, max 4000). **Demo tiketi se ne kreiraju.**
- **Dodaci** (`install-addons.service.ts:32–50`, `addon-catalog.ts`): katalog od 18 ključeva (`sla, email, edge,
  csat, autoAssign, approvals, confidential, kbIntercept, timeTracking, ticketSplit, bulkActions, savedViews,
  reports, serviceDowntime, cmdb, problems, changes, teams`), upis u `private.addons.<key>`; zadano uključeni su
  `sla, csat, approvals, confidential, kbIntercept, timeTracking, ticketSplit, bulkActions, savedViews, reports,
  serviceDowntime`, a `email` traži SMTP (`requiresSmtp`), dok su `edge, autoAssign, cmdb, problems, changes, teams`
  zadano isključeni.
- **Završetak** (`install-complete.service.ts:25–70`, `persist-install-completion.ts:21–85`): upis `completedAt` +
  `completedByUserId`, osiguranje JWT tajne (`ensure-install-jwt-signing-secret.ts:21–24` je idempotentno), change
  log sa `reason=install_wizard`; poziv je idempotent (`alreadyCompleted: true`). `onModuleInit` ponavlja istu
  operaciju pri podizanju procesa (repair put, bez duplog change loga).

**Frontend:** `pages/install-page.tsx` (158), `components/install/` (11 fajlova, 1 446 linija), `app/install-setup-*`.

- **Kapija i redirekcija:** `install-setup-provider.tsx` čita `GET /install/status`; `install-setup-layout.tsx` +
  `resolve-install-gate-navigation.ts` vode na `/install` dok instalacija nije završena, a sa `/install` na `/`
  kad jeste (osim `_visual-qa`).
- **Token ekran:** `install-token-gate.tsx` — polje „Instalacijski token“, dugme **Otključaj**, poruke
  „Token nije ispravan.“ / poruka o `INSTALL_TOKEN_NOT_CONFIGURED`; token se čuva u **sessionStorage**
  (`lib/install/install-token-store.ts:6`, ključ `helpdesk.installToken`) i šalje kao `X-Install-Token` samo na
  `/install/*`.
- **Koraci:** `superAdmin → loginProvider → smtp → seed → addons → complete` (`install-page.tsx:27–33`), sa
  progress trakom i stepperom; tekstovi su tačni na ekranu (npr. „SuperAdmin nalog“, „Način prijave“, „SMTP“,
  „Početni podaci“, „Dodaci“, „Završi podešavanje“; dugmad „Dalje“, „Završi“, „Zaključavanje…“;
  `frontend/src/i18n/locales/bs/common.json`, grana `install.*`).
- **Prijava koraka** (`resolve-install-wizard-step.ts:13–33` + `install-page.tsx:57–84`): korak se računa iz tri
  statusa (`super-admin`, `smtp`, `seed`); `loginProviderSaved` je **hardkodiran na `false`** (`:77`).

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| local SuperAdmin | + politika lozinke kao 2.1 | bcrypt 12, 12–128 znakova, bez blocklist/historije | **Djelimično** |
| auth mode local\|AD | + verifikacija konekcije | `local` / `entra_ad`, tajne write-only, bez testa bind-a | **Djelimično** |
| SMTP | + probno slanje | validacija formata, env prefill, lozinka secret | **Djelimično** |
| seed grupa/servisa/OU | idempotentno, u transakciji, sa dokazom rute | tačno tako (+ provjera razrješavanja) | **Implementirano** |
| addon flags | katalog + zavisnosti | 18 dodataka, `email` vezan na SMTP | **Implementirano** |
| — (izvan RAW) | zaštita prvog prozora | `INSTALL_TOKEN` (≥16), sha256+timingSafeEqual, zaključavanje poslije završetka | **Implementirano** |
| — (izvan RAW) | nastavak instalacije sa tačnog koraka | status postoji, ali korak se računa heuristikom i vraća na „Način prijave“ | **Odstupa** |
| — (izvan RAW) | verifikacija SMTP/LDAPS/Entra | nema nijedne provjere konekcije | **Nedostaje** |
| — (izvan RAW) | E2E instalacionog toka | nema E2E scenarija za `/install` | **Nedostaje** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

**Čistoća i raspodjela.** Modul je uzoran po konvenciji repoa: jedan posao po fajlu (`find-install-*`,
`ensure-install-*`, `persist-*`, `validate-*`, `map-*`, `read-*`), bez ijednog fajla preko ~200 linija; najveći su
testovi (198) i in-memory harness (171). Deljeni obrasci (`execute()` + `map*Error` u pet servisa) su ponavljanje,
ali svjesno i čitljivo — servis ostaje „tanak“, a logika u čistim funkcijama, što je dobra razlika za testiranje.

**Tipizacija i greške.** Nema sirovih `any` u čitanim fajlovima; DTO-ovi koriste `class-validator`, a kodovi grešaka
su enumerisani po koraku (`INVALID_SMTP_CONFIGURATION`, `SUPER_ADMIN_REQUIRED`, `INSTALL_TOKEN_*`, `SETUP_REQUIRED`,
`INSTALL_LOCKED`). Poruke su prevedene i ne otkrivaju detalje. Validacija je stroga (`whitelist`,
`forbidNonWhitelisted`), pa nepoznata polja padaju.

**Testabilnost.** 24 spec fajla, uključujući reuse/rollback seed scenarije i `create-in-memory-*` harness — iznad
prosjeka repoa. Nijedan test, međutim, ne pokriva cijeli tok kroz HTTP (integraciono), a nema ni E2E.

**Sigurnost (pročitano).** Redoslijed odbrana je logičan: token prije kreiranja naloga → invarijanta lokalnog
SuperAdmina → zaključavanje poslije završetka; tajne se čuvaju i vraćaju kao `*Configured` boolovi. Slabosti su
navedene u §7 (politika lozinke, otvoren `GET /install/addons`, maskiranje pada baze).

## 7. Otkriveni bug-ovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Uticaj | Fix |
|---|---|---|---|---|---|
| 1 | **SREDNJE** | `backend/src/modules/install/validate-install-super-admin-credentials.ts:16–29` vs. `authentication/security/password-change.service.ts:29` + `security/password-policy.ts` | Politika lozinke iz paketa 2.1 (blocklist preko zxcvbn rječnika, historija, dužina iz postavke) **ne primjenjuje se** na prvi, najprivilegovaniji nalog; wizard provjerava samo 12–128 znakova i da lozinka nije email. | SuperAdmin može dobiti npr. `password12345`; politika važi za sve ostale korisnike, ali ne za osnivački nalog. | Pozvati isti loader (`account-security-policy.loader.ts`) i provjeru iz `password-policy.ts` u wizardu, ili forsirati promjenu lozinke pri prvoj prijavi. |
| 2 | **NISKO** | `frontend/src/pages/install-page.tsx:77` (`loginProviderSaved: false`) + `frontend/src/lib/resolve-install-wizard-step.ts:19` | Status `GET /install/login-provider` već zna da je provajder sačuvan (`read-install-login-provider-status.ts` vraća `mode`/`…Configured`), ali ga wizard ignoriše i **uvijek se vraća na korak „Način prijave“** dok SMTP nije podešen ili seed nije urađen. | Osvježavanje taba usred instalacije traži ponovni prolaz kroz već sačuvan korak; polje `loginProviderSaved` je mrtvo. | Vratiti `saved` u status i koristiti ga u `resolveInstallWizardStep`; najbolje da server vraća `nextStep`. |
| 3 | **NISKO** | `backend/src/modules/install/install-setup.service.ts:15–25` + `install-setup.guard.ts` | `isCompleted()` hvata **svaku** grešku i vraća `false`; ako baza padne prije instalacije, svaki request dobija 503 `SETUP_REQUIRED`. | Dijagnostika vodi na pogrešan trag („instalacija nije završena“ umjesto „baza nije dostupna“); `/health/ready` ipak pokazuje pravi uzrok. | Razlikovati „ne mogu pročitati“ od „nije završeno“ (drugi kod greške ili preskakanje kapije kad baza nije dostupna). |
| 4 | **NISKO** | `backend/src/modules/install/ensure-install-organizational-unit.ts:9–17`, `ensure-install-fallback-group.ts:15–27` | Seed ne traži OJ po svom DN-u nego **prvu OJ po `ouPath`**, a fallback grupu traži **globalno** (`isFallback: true` bez obzira na OJ). | Ponovni seed u djelimično podešenom sistemu može vezati servis/routing na nepovezanu OJ i grupu iz druge OJ (ruta preskače granice OJ). | Tražiti po `distinguishedName === 'OU=Direkcija,DC=local'` i po `key === 'fallback'` unutar te OJ; ako nema, kreirati. |
| 5 | **NISKO** | `backend/src/modules/install/is-install-wizard-mutation-locked.ts:7–10` | Poslije završetka `GET /install/addons` ostaje **bez autentikacije** i vraća stanje `private.addons.*`. | Neovlašten čitalac vidi koji su moduli uključeni (npr. da li je CMDB/Teams aktivan). Informacija je niske osjetljivosti, ali nije javna. | Poslije završetka vraćati samo katalog (bez pohranjenih vrijednosti), ili prebaciti čitanje na autentifikovani settings endpoint. |

**Zapažanja bez oznake bug-a:** (a) nema nijedne provjere konekcije (SMTP proba, LDAPS bind, Entra discovery) —
greška se vidi tek pri prvoj upotrebi; (b) polja za AD u wizardu samo upisuju vezu, dok stvarno čitanje zavisi od
`private.auth.adRead.*` postavki (detaljnije u M3); (c) `INSTALL_TOKEN` u sessionStorage je dobar izbor (ne preživi
zatvaranje taba), ali se ne rotira automatski — nakon završetka ga treba ukloniti iz `.env`/Coolifyja.

## 8. Ažuriranje dokumentacije

**Provjereno i tačno u `user-guide`:** instalacija **nije bila pokrivena** nijednim fajlom; `docs/user-guide/` nije
sadržao ništa o `/install` niti o `INSTALL_TOKEN`. `TEZE-ZA-DOKUMENTACIJU.md` nije imao nijednu tezu o instalaciji
(T1–T14 pokrivaju druge module).

**Dodato:**
- `docs/user-guide/instalacija.md` — nova stranica (publika: administrator/operativa) sa svih šest koraka, tačnim
  nazivima dugmadi, poljima i validacijama, kodovima grešaka, poznatim ograničenjima i vezom na `ops/COOLIFY.md`.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T15** (SuperAdmin je uvijek lokalni/break-glass), **T16** (wizard se otvara samo uz
  `INSTALL_TOKEN`), **T17** (nakon „Završi“ instalacijski koraci su zaključani; mijenja se kroz Settings).

**Ispravljeno:** ništa (nije bilo netačnih tvrdnji o instalaciji — teme nije ni bilo).

**Ostaje otvoreno:** veza ka `.cursor/docs/04-install-wizard.md` iz RAW-a ne postoji u repou `[NEJASNO]` — da li je
to dokument koji je ostao kod izvornog šablona; ako postoji, vrijedi ga uvesti u `docs/`. Detalji unosa su u
`DOCS_CHANGELOG.md`.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **8 / 10** | Sve što RAW traži radi (i više: token zaštita, zaključavanje, provjera rute); nedostaju verifikacija konekcija i pouzdan nastavak od tačnog koraka. |
| Kvalitet koda | **9 / 10** | Jedan posao po fajlu, jaka tipizacija, 24 spec fajla, transakcioni seed; zamjerke su kozmetičke (ponovljeni `execute()` obrazac) i heuristika na frontendu. |
| Sigurnost | **7 / 10** | Token + tajming-otporno poređenje + zaključavanje + write-only tajne; umanjuju pad politike lozinke za osnivački nalog, otvoren `GET /install/addons` i maskiranje pada baze. |

---

# M2 — Prijava i potvrda u dva koraka (MFA)

## 1. Planirano u RAW projektnom zadatku

- **§1** (`RAW_PROJECT.md:29`): *„SSO autentikacija preko Active Directory / Azure AD (Entra ID), bez lokalnih
  lozinki“* — ciljno stanje je federisana prijava.
- **§12 Acceptance** (`RAW_PROJECT.md:894–902`): dev/test prijava mora raditi **bez** AD-a (`local_dev` režim s
  lokalnim korisnicima u seedu/postavkama); token i claims imaju istu strukturu kao kasniji AD korisnik
  (email, displayName, rola, OU); AD čitanje je isključeno po zadatku; „SSO login radi (Entra ID) … token
  validacija + guards“.
- **§6 Settings contract** (`RAW_PROJECT.md:461–463`): `private.auth.mode` (`local` | `entra_ad`, postavlja ga
  instalacijski wizard, a SuperAdmin ostaje lokalni break-glass), `private.auth.localDevUsersJson` (secret) i
  `private.auth.jwtSigningSecret` (secret).
- **RAW ne traži MFA, „Sigurnost naloga“ ni registar sesija** — provjereno pretragom cijelog fajla (nema pojma
  `MFA`, `TOTP`, `two-factor`, `dva koraka`). Sve iz ovog modula iznad `local`/`entra_ad` prijave i tokena
  dolazi iz **paketa 2.1** (`docs/plans/modules/2.1-sigurnost-naloga.md`), tj. nadogradnje poslije zadatka.

## 2. Stvarnost — kako bi profesionalna prijava i drugi faktor izgledali `[MIŠLJENJE]`

1. **Drugi faktor se ne „isključuje tiho“.** Ako je korisnik jednom upisao TOTP, svaka kasnija izmjena
   politike (npr. gašenje opcionalne MFA) smije uticati samo na *nove* upise, nikad na postojeće verifikacije.
2. **Otpornost na ciljani lockout.** Brojači neuspjeha vode se **odvojeno po nalogu i po IP-u**; pet tuđih
   pogrešnih lozinki ne smije zaključati žrtvu za sve mreže. Uz to: progresivno kašnjenje, a ne binarni 429.
3. **Sesija je server-side objekat.** Kratkotrajni token + registar (uređaj, IP, vrijeme), rotacija s detekcijom
   ponovne upotrebe starog tokena, „odjavi sve“, apsolutni i idle limit.
4. **Lozinka po NIST-u:** dužina + blocklist (provjera protiv procurene liste), bez kompozicionih pravila i bez
   forsirane rotacije kao primarnog mehanizma; istorija je opciona; promjena prekida sve sesije osim tekuće.
5. **Oporavak je kontrolisan:** rezervni kodovi velike entropije, čuvani sa sporim KDF-om ili HMAC-om s tajnom
   servera; reset drugog faktora je auditorski događaj koji *obavezno* završava prisilnim ponovnim upisom.
6. **Federacija se validira strogo:** potpis preko JWKS-a, `iss`, `aud`, `exp`, i vezivanje na **nepromjenjivi
   identifikator** (`oid`), a ne na email; konflikti se odbijaju, ne „spajaju po sličnosti“.
7. **Sve je u auditu, ništa u logu.** Prijava, odjava, promjena lozinke, MFA događaji, reset i opoziv sesija —
   svaki s akterom i rezultatom; nikad lozinka, kod ni tajna.

## 3. Preporučena implementacija `[MIŠLJENJE]`

Zatečeni tok (lozinka → promjena lozinke → drugi faktor → sesija) je dobar i ne treba ga mijenjati. Dopune:

1. **Ispraviti semantiku `mfa.allowOptional`**: ono što je danas `unavailable` za korisnika koji *ima* upisan
   TOTP treba biti „verifikuj postojeći, ne dozvoli novi upis“ (v. bug #1).
2. **Dva brojača umjesto jednog:** `auth:login-fail:{email}` (zaštita naloga, sa dužim prozorom) i
   `auth:login-fail-ip:{ip}` (zaštita od skeniranja); 429 poruka bez otkrivanja da li nalog postoji.
3. **Rezervni kodovi:** HMAC-SHA-256 s tajnom iz okruženja (ili `bcrypt`), umjesto neslanog SHA-256.
4. **Zajednički idiom u `PasswordChangeForm`:** minimalna dužina iz politike (`GET /auth/security` je već zove
   `PasswordSection`), a ne konstanta.
5. **E2E scenario posvećen prijavi:** postojeća `sign-in`/`mfa` pomoćna sredstva pokrivaju srećni put kroz tuđe
   specove; nedostaje spec koji dokazuje: pogrešna lozinka ×5 → 429, istekao `mfaToken`, jednokratni rezervni
   kod, opoziv sesije iz drugog taba i prisilni upis kod ADMIN-a bez MFA.
6. **WebAuthn/passkeys kao sljedeći korak** (phishing-otporni faktor) — sada nije u kodu ni u planovima.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

**Backend** (`backend/src/modules/authentication/`, 88 fajlova / 4 138 linija; kontroleri `authentication.controller.ts` 183, `account-security.controller.ts` 183):

- **Rute prijave** (`authentication.controller.ts:64–182`): `GET /auth/providers` (javno), `POST /auth/login`,
  `POST /auth/entra`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`, `POST /auth/mfa/verify`,
  `POST /auth/mfa/enroll/start`, `POST /auth/mfa/enroll/confirm`. Validacija: `ValidationPipe` s `whitelist` i
  `forbidNonWhitelisted` na nivou kontrolera (`:49–55`).
- **Provider** se bira postavkom `private.auth.mode` (`authentication-provider.resolver.ts:15–21` preko
  `authentication-mode.loader.ts:93–105`). `GET /auth/providers` vraća `{ mode, entra: { tenantId, clientId,
  authority, singleLogout } }` ili `null` i **nikad tajnu**; ako je režim `entra_ad` bez tenant/client ID-a,
  vraća `entra: null` i prijavna strana nudi break-glass formu (`authentication-providers.service.ts:30–59`).
- **Entra prijava** (`authentication.service.ts:75–84, 204–234`): ID token se verifikuje preko JWKS-a uz `issuer`
  i `audience = clientId` (`microsoft-entra-id-token.verifier.ts:30–53`), claims se normalizuju
  (`normalize-entra-id-token-claims.ts`), identitet se razrješava na korisnika preko `oid`-a, pa emaila, pa JIT
  upisa (`entra-identity-binder.ts:32–66`); konflikti i neaktivni nalozi daju 403 s kodovima
  `ENTRA_ACCOUNT_NOT_REGISTERED` / `ENTRA_ACCOUNT_CONFLICT` / `ACCOUNT_DISABLED` (`authentication.service.ts:324–332`).
  Za Entra naloge se **naš MFA ne primjenjuje** — komentar u kodu: drugi faktor je Microsoftov (Conditional
  Access) (`authentication.service.ts:215–218`), a `resolveMfaRequirement` vraća `unavailable` za naloge bez
  lokalne lozinke (`account-security-rules.ts:18`).
- **Lozinka → (promjena) → (MFA) → sesija** (`authentication.service.ts:204–271`):
  - `MUST_CHANGE_PASSWORD` s kratkotrajnim tokenom (15 min, `authentication.constants.ts:7`) kad je
    `mustChangePassword` postavljen ili je lozinka istekla (`:219–229`; istek se računa iz
    `passwordExpiresAt`/`isPasswordExpired`, `account-security-rules.ts:24–42`);
  - `MFA_REQUIRED` kad je MFA upisan, `MFA_ENROLLMENT_REQUIRED` kad je obavezan a nije upisan (`:248–271`);
  - tokeni međukoraka traju 5 min, svrha `mfa`, jednokratni (`authentication.constants.ts:9–11`,
    `session-token.service.ts:57–100`).
- **MFA servis** (`security/mfa.service.ts`): TOTP RFC 6238, SHA-1, 6 cifara, korak 30 s, tolerancija ±1 korak
  (`security/totp.ts:8–13,44–66`); tajna se čuva šifrovana AES-256-GCM ključem `MFA_ENCRYPTION_KEY`
  (`security/mfa-secret-cipher.ts:14–38`), s rotacijom preko `MFA_ENCRYPTION_KEY_PREVIOUS` i CLI komandom
  `secrets.js reencrypt-mfa --apply` (`security/reencrypt-mfa-secrets.ts`, `cli/secrets.ts:195`). Ponovna
  upotreba istog koda je blokirana pamćenjem zadnjeg koraka i compare-and-set upisom
  (`mfa.service.ts:162–179`), a `mfa/enroll/start` je idempotentan dok je tajna svježa (`:82–107`).
  Upis prolazi kroz `userMfa`, a potvrda vraća 10 rezervnih kodova formata `xxxxx-xxxxx` koji se čuvaju kao
  SHA-256 (`security/recovery-codes.ts:3–26`).
- **Politika naloga** (`settings/definitions/account-security-settings.ts`): `private.auth.mfa.requiredForAdmins`
  (default `true`), `private.auth.mfa.allowOptional` (default `true`), `private.auth.mfa.issuerName` (≤40 znakova,
  bez `:`), `private.auth.password.minLength` (12–64), `private.auth.password.blocklist.enabled`,
  `private.auth.password.organisationWordsCsv`, `private.auth.password.historyCount` (0–24, default 5),
  `private.auth.password.maxAgeDays` (0–3650, default 0 = nikad), `private.auth.password.superAdminMaxAgeDays`
  (default 365), `private.auth.sessions.maxPerUser` (0–100, default 0), `private.auth.sessions.newDeviceAlert`.
  Zahtjev za MFA: SUPER_ADMIN **uvijek**, ADMIN uz postavku, ostali lokalni nalozi opciono
  (`account-security-rules.ts:16–22`).
- **Lozinke:** bcrypt faktor 12 (`authentication.constants.ts:4`), politika 12–128 + blocklist od ~49 000
  najčešćih lozinki, naziv organizacije, dijelovi vlastite e-adrese, te provjera istorije
  (`security/password-policy.ts:66–84`, `security/password-change.service.ts:24–54`); prazan/nejasan lokalni
  hash se ne koristi — `dummyLocalPasswordHash` sprječava razlikovanje nepostojećeg naloga po vremenu
  (`authentication.constants.ts:13–14`).
- **Sesije** (`security/session-registry.service.ts`, `session-revocation.store.ts`): JWT 1 h s `jti` i `sid`
  (`session-token.service.ts:30–41`), `POST /auth/refresh` rotira token i produžava sesiju
  (`authentication.service.ts:159–189`), opoziv ide preko Redisa na tri ključa (`auth:revoked-jti`,
  `auth:revoked-sid`, `auth:sessions-valid-after`) uz **fail-open** ako Redis padne
  (`session-revocation.store.ts:5–18`; komentar obrazlaže zašto). Registar čuva provider, MFA metodu, skraćenu
  IP adresu (/24, /48 — `security/network-prefix.ts:59–71`), User-Agent (max 512), `lastSeenAt` i `expiresAt`;
  `private.auth.sessions.maxPerUser` odjavljuje najstariju sesiju (`session-registry.service.ts:190–199`), a
  sumnjiva prijava s novog uređaja obavještava ADMIN/SUPER_ADMIN (`:63–86`).
- **Ograničavanje pokušaja** (`login-attempt-limiter.ts`): 5 neuspjeha / 15 min; ključ je
  `auth:login-fail:{email}:{ip}` (`:17–30`), poseban ključ za `/auth/change-password` (`:37–39`) i za MFA
  (`authentication.service.ts:39–41`, 5 pokušaja po korisniku), Redis s in-memory rezervom i **fail-open**
  (`:104–131`). Broje se samo 401-ish greške (`:134–141`).
- **Administracija tudjih naloga** (`modules/users/user-security.controller.ts`): `GET /users/:id/security`,
  `POST /users/:id/sessions/revoke-all`, `POST /users/:id/mfa/reset` (razlog obavezan, `allowSelf: false` —
  vlastiti nalog se rješava kroz profil).

**Frontend** (`frontend/src/`):

- **Prijava je mala mašina stanja**: `credentials → change → mfa | enroll → codes → sesija`
  (`pages/login-page.tsx:30–48`). Entra režim prikazuje dugme **„Prijava preko Microsoft naloga“**, uz link
  „Prijavi se lokalnim nalogom“ i poruku kada Microsoft prijava nije konfigurisana (`:302–334`).
- **Tekstovi koje korisnik vidi** (i18n `session.*`, `auth.*`, bs): „Prijava“, „Prijava…“, „Email“, „Lozinka“,
  „Prijava nije uspjela. Provjerite email i lozinku.“, „Previše neuspjelih pokušaja prijave. Pokušajte ponovo
  za 15 minuta.“; MFA: „Potvrda u dva koraka“, „Kod iz aplikacije“, „Nemam pristup aplikaciji — koristi rezervni
  kod“, „Potvrdi“; upis: „Postavite potvrdu u dva koraka“, „Ključ za ručni unos“, „Uključi“; rezervni kodovi:
  „Rezervni kodovi“, „Kopiraj“, „Preuzmi .txt“, „Sačuvao/la sam rezervne kodove“, „Nastavi“.
- **QR kod** se generiše lokalno, biblioteka `qrcode` se učitava dinamički samo na ekranu upisa
  (`components/auth/mfa-enrollment.tsx:29–47`), uz uvijek prikazan ručni ključ (`:76–83`).
- **Jačina lozinke** je samo savjet: zxcvbn-ts se učitava lijeno pri prvom unosu i ne odlučuje ništa
  (`components/auth/password-strength-meter.tsx:6–24`).
- **Sesija u pregledniku:** token i principal u `session-store`, 401 bilo gdje preko `setUnauthorizedHandler`
  završava sesiju i vodi na `/login` (`components/layout/require-auth.tsx:23–34`, `services/api.ts:16–35`);
  „keep-alive“ produžava token dok ima aktivnosti, a miran tab se sam ugasi
  (`lib/session/session-keep-alive.ts:10–43`).
- **Stranica „Sigurnost naloga“** (`pages/account-security-page.tsx`, ruta `/account/security` u
  `app/router.tsx:164`, stavka u korisničkom meniju `components/layout/session-controls.tsx:71`): tri kartice —
  potvrda u dva koraka (status, upis, novi rezervni kodovi, isključivanje), lozinka (promjena, pravila iz
  politike, istek) i aktivne prijave (odjava pojedinačne ili svih ostalih). Traka „Vaša lozinka ističe za N
  dana.“ stoji u `layouts/application-shell.tsx:97` i vodi na istu stranicu.
- **Administracija iz detalja korisnika:** `components/users/user-security-section.tsx` (status MFA, reset MFA
  uz razlog, odjava svih sesija) preko `services/account-security-api.ts:74–81`.

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| `local_dev` prijava bez AD-a | lokalni nalozi + isti claims | lokalni provider + rola/OJ iz baze (`local-authentication.provider.ts`, `principal-context.loader.ts`) | **Implementirano** |
| SSO (Entra ID) + validacija tokena | JWKS, `iss`, `aud`, vezivanje na `oid` | tačno tako, uz JIT/konflikt pravila i 403 s kodom | **Implementirano** |
| `private.auth.mode` (local\|entra_ad) | postavka, break-glass SuperAdmin | postavka + break-glass forma uvijek dostupna | **Implementirano** |
| `private.auth.jwtSigningSecret` (secret) | tajna iz registryja, ne env | `JwtSigningSecretLoader` čita postavku; instalacija je upisuje (`install/ensure-install-jwt-signing-secret.ts`) | **Implementirano** |
| — (izvan RAW, paket 2.1) | MFA bez tihe degradacije | upis i verifikacija rade, ali gašenje `allowOptional` tiho preskače verifikaciju | **Odstupa** |
| — (izvan RAW) | odvojeni brojači po nalogu i IP-u | jedan brojač `email+IP`; iza proxyja praktično po nalogu | **Djelimično** |
| — (izvan RAW) | rezervni kodovi sa sporim KDF-om/HMAC-om | neslani SHA-256 | **Djelimično** |
| — (izvan RAW) | E2E scenario za prijavu i MFA | helperi postoje i koriste ih drugi specovi; namjenskog spec-a nema | **Djelimično** |
| — (izvan RAW) | phishing-otporni faktor (passkey) | ne postoji | **Nedostaje** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

**Snaga modula je razdvajanje odluke od I/O.** `account-security-rules.ts` (42 linije) je čist, bez baze —
matrica „ko mora imati MFA“ i istek lozinke se testiraju bez mockova; isto važi za `totp.ts` (82),
`recovery-codes.ts` (27) i `password-policy.ts` (85). Kriptografija je na `node:crypto` bez dodatnih
zavisnosti, s `timingSafeEqual` u poređenju i bez tajni u logovima (`mfa.service.ts:250–256` svjesno loguje
samo razlog). Poruke grešaka su neutralne prema nepostojećem nalogu (dummy hash), a `toHttpException`
(`authentication.service.ts:317–343`) ne propušta internu grešku kao 500.

**Šta bih popravio u strukturi.** `authentication.service.ts` (344 linije, 10 zavisnosti) radi previše: spaja
provajdera, politiku, MFA, registar sesija i notifikacije. Vrijedi ga razdvojiti na „login flow“ i „session
issuance“, jer se svaka nova grana (npr. WebAuthn) sada dodaje u istu klasu. `mapAccountSecurityError`
(`account-security.error.ts:58–87`) *baca* iz funkcije čije ime zvuči kao mapiranje — pozivi tipa
`catch(mapAccountSecurityError)` (`authentication.service.ts:148`) rade, ali su teški za čitanje. U
`authentication.service.ts:79–84` postoji nemoguća grana (`'status' in response` nakon Entra prijave — Entra
nikad ne vraća međukorak); nije bug, ali je mrtav kod.

**Testovi.** 24 spec fajla u modulu (npr. `totp.spec.ts`, `mfa.service.spec.ts`, `login-attempt-limiter.spec.ts`,
`password-policy.spec.ts`, `session-registry.service.spec.ts`) — iznad prosjeka repoa; preko E2E helpera
(`e2e/helpers/sign-in.ts`, `helpers/mfa.ts`, `helpers/reset-super-admin-mfa.ts`) MFA se vježba i na stagingu.
Nedostaje integracioni test koji prolazi *cijeli* HTTP tok od `login` do `sid`-a, s aplikacijom i Redisom.

## 7. Otkriveni bug-ovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Uticaj | Fix |
|---|---|---|---|---|---|
| 1 | **SREDNJE** | `backend/src/modules/authentication/authentication.service.ts:255–270` + `security/account-security-rules.ts:21` | Isključivanje postavke `private.auth.mfa.allowOptional` mijenja zahtjev na `unavailable`, a `continueAfterPassword` tada **preskače verifikaciju** i za korisnike koji **već imaju upisan TOTP** (uslov je `requirement !== 'unavailable' && isEnabled`). Opis postavke u kodu i UI-ju kaže da se radi o *dozvoli samostalnog uključivanja*, ne o isključivanju verifikacije (`settings/definitions/account-security-settings.ts:36–43`). | ADMIN/SUPER_ADMIN nisu pogođeni, ali svaki AGENT/USER koji se oslanja na drugi faktor ostaje zaštićen samo lozinkom — tiho, bez ikakve poruke. | Razdvojiti „može upisati“ od „mora/treba verificirati“: ako je `isEnabled`, tražiti `MFA_REQUIRED` bez obzira na `allowOptional`; `allowOptional=false` da zabrani samo *novi* upis. |
| 2 | **SREDNJE** | `frontend/src/components/auth/change-password-form.tsx:12,37,88,111` + `i18n` `auth.changePassword.intro` | Ekran prisilne promjene lozinke tvrdi i validira „najmanje 12 znakova“ (konstanta), dok administrator može podići `private.auth.password.minLength` do 64. | Korisnik prvo dobije zelenilo na klijentu, pa 400 s listom prekršenih pravila; tekst protivrječi politici koju vidi na „Sigurnost naloga“. | Proslijediti `minLength` iz politike (kao `password-section.tsx:56,73`) ili ukloniti tvrdnju iz teksta i pustiti server da odluči. |
| 3 | **NISKO** | `backend/src/modules/authentication/login-attempt-limiter.ts:17–30` (i komentar `:13–15`) | Ključ brojača je `email + IP`. Bez `TRUST_PROXY` (ili s proxyjem ispred) svi zahtjevi dijele isti IP, pa 5 tuđih pogrešnih pokušaja zaključava **tuđi** nalog na 15 min (i tačna lozinka dobija 429). | Ciljani DoS: dovoljno je znati email adresu zaposlenika. | Uvesti odvojen brojač po nalogu (duži prozor, veći prag) i po IP-u (kraći, niži prag), uz progresivno kašnjenje umjesto tvrdog 429. |
| 4 | **NISKO** | `backend/src/modules/authentication/security/recovery-codes.ts:21–23` | Rezervni kodovi se hashiraju **neslanim SHA-256**, bez tajne servera. Entropija je ~2^49 (10 znakova iz 31-znakovnog alfabeta), pa neslani SHA-256 omogućava offline napad preko cijele baze jednom predračunatom tabelom. | Ako baza procuri, rezervni kodovi su kandidat za offline probijanje jačom grafikom. | HMAC-SHA-256 s ključem iz okruženja (npr. vezan uz `MFA_ENCRYPTION_KEY`) ili `bcrypt` s umjerenim faktorom; migracija = poništiti postojeće kodove. |
| 5 | **NISKO** | `frontend/src/components/auth/mfa-enrollment.tsx:39–41` vs `components/auth/mfa-code-form.tsx:41–48` | Kada međukorak prijave (5 min) istekne, forma za verifikaciju to kaže („Korak prijave je istekao…“), a ekran upisa prikazuje generičko „Radnja nije uspjela. Pokušajte ponovo.“ jer mapira samo kod `MFA_UNAVAILABLE`. | Korisnik u prisilnom upisu vrti istu grešku bez informacije da treba ponovo na prijavu. | Mapirati `INVALID_CREDENTIALS` na `auth.mfa.signInExpired` i u upisu (isti `readMfaError` helper za oba ekrana). |
| 6 | **NISKO** | `backend/src/modules/authentication/session-revocation.store.ts:77` | Opoziv po korisniku koristi `issuedAt < cutoff` u **sekundama**; token izdat u istoj sekundi kad i promjena lozinke/opoziv ostaje važeći do isteka (do 1 h). | Teorijski prozor od ~1 s u kojem ukradeni token preživi „odjavi sve“ / promjenu lozinke. | Za dati opoziv koristiti poređenje u milisekundama (npr. `iat` dopunjen `jti`-jem na listi) ili pri opozivu upisati i trenutni `jti` tekuće sesije. |

**Zapažanja bez oznake bug-a:** (a) `POST /auth/mfa/enroll/start` nije pod brojačem pokušaja (za razliku od
`verify` i `confirm`) — može ga zvati samo onaj ko ima važeći `mfaToken`, pa je rizik nizak; (b) `logout`
je namjerno idempotentan i guta greške (`authentication.controller.ts:105–112`), što je ispravno za
odjavu bez veze; (c) `GET /auth/providers` je javan i vraća `tenantId`/`clientId` — to su javni OIDC podaci,
ali ih vrijedi navesti kao svjesno izlaganje.

## 8. Ažuriranje dokumentacije

**Provjereno:** `docs/user-guide/` **nije imao nijednu stranicu o prijavi**, a `TEZE-ZA-DOKUMENTACIJU.md` nije
imao tezu o prijavi, MFA ni sesijama (T1–T14 pokrivaju druge module). Postojeći modulski fajlovi ne spominju
`/login` ni „Sigurnost naloga“ — dakle ništa nije bilo netačno, ali je najvažniji korisnički tok bio
nedokumentovan.

**Dodato:**
- `docs/user-guide/prijava-i-mfa.md` — prijava (lokalna i Microsoft), prisilna promjena lozinke, potvrda u dva
  koraka (upis, verifikacija, rezervni kodovi), „Sigurnost naloga“ (lozinka, aktivne prijave), administratorski
  reset MFA-a i odjava sesija, s tačnim nazivima dugmadi, poljima, porukama i postavkama.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T18** (SuperAdmin uvijek ima drugi faktor), **T19** (prvi korak poslije
  lozinke je promjena lozinke, pa MFA; međukorak traje 5 minuta), **T20** (rezervni kodovi se prikazuju samo
  jednom i vrijede jednokratno), **T21** (Entra nalozi: drugi faktor je Microsoftov, naš MFA se ne
  primjenjuje), **T22** (neuspjele prijave: 5 pokušaja / 15 min, poruka ne otkriva postoji li nalog).

**Ispravljeno:** ništa (nije bilo netačnih tvrdnji o prijavi).

**Ostaje otvoreno:** `[NEJASNO]` — da li postoje klijenti koji žele isključivo SSO bez break-glass forme; kod
danas **uvijek** nudi lokalnu formu u Entra režimu (link „Prijavi se lokalnim nalogom“). To je sigurnosno
svjesna odluka (RAW traži break-glass SuperAdmin), ali vrijedi potvrditi da nije u sukobu s politikom klijenta.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **9 / 10** | Sve što RAW traži i cijeli paket 2.1 rade: dva provajdera, prisilna promjena, TOTP s QR-om, rezervni kodovi, registar sesija, „odjavi sve“, reset MFA-a. Zamjerka je tiha degradacija kod `allowOptional=false`. |
| Kvalitet koda | **8 / 10** | Čiste odluke odvojene od I/O, dobra imena i neutralne greške; `authentication.service.ts` je prerastao u „god service“, a mapiranje grešaka baca iz `catch` poziva. |
| Sigurnost | **8 / 10** | AES-GCM za tajne, ponovna upotreba koda blokirana, opoziv preko Redisa, skraćena IP adresa, rate limit s fail-open; umanjuju: bug #1, neslani SHA-256 za rezervne kodove i zajednički brojač `email+IP`. |

---

# M3 — Korisnici, organizacione jedinice i grupe

## 1. Planirano u RAW projektnom zadatku

- **Izolacija i hijerarhija** (`RAW_PROJECT.md:10–12`): tenant = jedna organizacija s hijerarhijskim OU-ovima;
  Admin/Agent po defaultu vide i rade samo unutar OU-a za koji su ovlašteni, SuperAdmin ima globalni pristup;
  cross-OU je dozvoljen samo kroz eksplicitne permissione i mora biti auditovan.
- **AD mapiranje** (`RAW_PROJECT.md:13–21`): „Source-of-truth za OU membership je **AD `DistinguishedName` / OU
  path** (ne samo `Company/Department`)“; korijen je `OU=Korisnici`, ispod njega „službe“ (`OU=Direkcija`) i
  „poslovnice“ (`OU=ED <grad>` → `OU=Breza`, `OU=Visoko`). Dublji podfolderi ispod službe/poslovnice **ne
  mijenjaju** OU scope u MVP-u.
- **Role** (`RAW_PROJECT.md:26–30`): User, Agent, Admin (lokalni admin OU / podružnice), SuperAdmin; sync
  korisnika iz AD-a (ime, email, Company, Department, **opcionalno Manager**) + mapiranje na OU.
- **Grupe i routing** (`RAW_PROJECT.md:55`, `:63`, `:111`): „Group inbox (obavezno)“; automatski routing na
  osnovu `origin_unit + service_type` preko DB-driven pravila; tiket nosi `HANDLER_GROUP`.
- **Audit** (`RAW_PROJECT.md:173`): „RBAC + OU isolation + audit log svih akcija“; `:92` eskalacije po
  role/group/user uz audit.
- **Izvor rola iz direktorija** (`RAW_PROJECT.md:479`): `private.auth.roleSource` : `local_db` | `entra_groups`;
  grupe se čitaju ispod `private.auth.adRead.groupsBaseDn` (`RAW_PROJECT.md:467`).
- **Brisanje i zaštita podataka**: RAW ne opisuje brisanje korisnika; traži „owner (user ili grupa)“ za KB
  (`RAW_PROJECT.md:134`) i OU/group guardove koji se „i dalje primjenjuju“ (`RAW_PROJECT.md:158`, `:222`).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Identitet ima jedan izvor istine.** Ako je nalog vezan za direktorij, ime/e-mail dolaze iz direktorija i
   aplikacija to nigdje ne pregazi; lokalna izmjena je moguća samo za lokalne naloge i to je vidljivo u UI-u.
2. **Pridruživanje OU-a je deterministično.** OU se izvodi iz DN-a po fiksnom pravilu (npr. prva dva nivoa pod
   baznim DN-om), a svaka promjena DN-a koja bi pomjerila korisnika prolazi kroz isti plan/apply kao i puni sync.
3. **Referencijalni integritet prije brisanja.** Brisanje OU-a pita „šta visi o ovom čvoru“ (podređene OJ,
   korisnici, grupe, tiketi, KB, imovina, SLA/routing pravila, dodjele rola) i nudi ili prekid s tačnim razlogom
   ili kontrolisanu migraciju; nikad FK greška s 500.
4. **Promjena vidljivosti je trenutna.** Svaka promjena koja dira tuđe dozvole (brisanje OU-a, dodjela role,
   prelazak u grupu) invalidira keš autorizacije pogođenih korisnika, a ne čeka TTL.
5. **Svaka administrativna izmjena je u auditu** — s akterom, metapodacima prije/poslije i request ID-om.
6. **Grupe imaju invarijante.** Najmanje jedna fallback grupa po OU-u, brisanje blokirano dok ima aktivnih
   tiketa, a „problem-grupa“/„CAB grupa“ su eksplicitne oznake, ne slučajni nazivi.
7. **Liste skaliraju.** Pretraga + paginacija s ukupnim brojem i jasnom oznakom kad je lista odsječena.

## 3. Preporučena implementacija `[MIŠLJENJE]`

- Zadržati postojeću arhitekturu (jedna funkcija po operaciji + `*Error` domen + mapiranje na HTTP); ona je
  čitljiva i testabilna. Dodati, po prioritetu:
  1. `assertOrganizationalUnitDeletable` koji pokriva **sve** restriktivne relacije iz `prisma/schema/*` i
     mapira ih na `409` s kodom (`OU_HAS_GROUPS`, `OU_HAS_ASSETS`, …), plus generičko mapiranje Prisma `P2003`
     na konflikat u zajedničkom filteru grešaka.
  2. Audit za sve mutacije korisnika/OJ/grupa (isti `appendAuditLog` u istoj transakciji), s `metadata`
     prije/poslije.
  3. Eksplicitan `invalidateUsers` poziv pri brisanju OU-a (dodjele rola se kaskadno brišu) i pri kaskadnim
     promjenama.
  4. Zaštita „posljednji SuperAdmin“: onemogućiti uklanjanje zadnje `SUPER_ADMIN` dodjele i deaktivaciju/brisanje
     zadnjeg SuperAdmin naloga, s jasnom porukom.
  5. Serverska validacija rezervisana za lokalne naloge: `POST /users/:id/reset-password` i promjena e-maila
     trebaju odbiti non-local nalog eksplicitno (danas to radi samo UI).

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Korisnici (`backend/src/modules/users/`, 44 `.ts`, 1.886 linija)

- `users.controller.ts:37–49`: `@Controller('users')`, `@UseGuards(SessionAuthenticationGuard, RoleGuard)`,
  `@RequireRoles(ADMIN, SUPER_ADMIN)`, `ValidationPipe` s `whitelist`/`forbidNonWhitelisted`.
  Rute: `GET /users` (`:57–72`, `q`/`take`/`skip`), `POST /users` (`:74–89`), `POST /users/:id/reset-password`
  (`:91–105`), `PATCH /users/:id` (`:107–130`), `DELETE /users/:id` (`:132–147`), role rute
  (`:149–188`). Deaktivacija/brisanje vlastitog naloga se odbija (`:114–122`, `:139–144`).
- `assert-can-manage-target-user.ts:14–18`: samo SuperAdmin smije mijenjati drugog SuperAdmin-a
  (`SUPER_ADMIN_MANAGE_FORBIDDEN`), pozvano iz `users.controller.ts:190–201`.
- `create-user.ts:19–41`: trim + obavezna imena, provjera postojanja OU-a, `EMAIL_CONFLICT` (e-mail se
  normalizuje na lowercase, `:20`); `:42` `ensureSystemRole`; `:43–52` kreira nalog s `isLocalOnly: true`,
  `mustChangePassword: true`; `:53–69` izdaje privremenu lozinku i dodjeljuje rolu.
- `issue-temporary-password-for-user.ts:22–43`: generiše lozinku, hashira je (`hashLocalPassword`), postavlja
  `mustChangePassword: true` i **`isLocalOnly: true`** (`:29`); ako e-mail prođe vraća `temporaryPassword: null`
  i `delivery: 'email'`, inače `delivery: 'ui'` (`:39–42`).
- `reset-user-temporary-password.ts:21–37`: traži aktivan nalog (`:28–30`, inače `INVALID_INPUT`), ne provjerava
  `isLocalOnly`; `users.controller.ts:99–104` uz reset odjavljuje sve sesije (`SessionRegistryService.revokeAll`,
  `reason: 'admin'`).
- `update-user.ts:47–91`: `displayName` ne smije biti prazan; e-mail se mijenja **samo** ako je nalog
  `isLocalOnly` (`:54–57`); provjera OU-a (`:73–88`); `isActive` (`:89–91`); keš se invalidira samo ako je bilo
  izmjena (`:23–32`).
- `delete-user.ts:12–40`: blokira brisanje ako nalog ima otvorene `assignedTickets`/`requestedTickets`
  (`HAS_OPEN_TICKETS`; `RESOLVED`/`CLOSED`/`ARCHIVED` se ne broje), FK prekršaj prevodi u `DELETE_RESTRICTED`,
  na kraju `invalidatePrincipal` (`:45`).
- `assign-user-role.ts:26–29,78–110`: `assertCanAssignRole` (SuperAdmin rola samo SuperAdmin-u,
  `assert-can-assign-role.ts:8–13`), dedupe po (`userId`,`roleId`,`organizationalUnitId`,`serviceId`) (`:62–77`),
  transakcija + audit `userRoleAssign` (`:92–104`), invalidacija keša (`:109`). `remove-user-role.ts:33–50` isto
  s auditom `userRoleRemove`. **Ostale mutacije korisnika ne pišu audit** (grep `appendAuditLog` u modulu daje
  samo ova dva fajla).
- `list-users-summary.ts:20,37–59`: `userListMaxTake = 500`, pretraga po imenu/e-mailu, `orderBy displayName`;
  bez `take` vraća sve korisnike (komentar `:31–36` objašnjava da admin ekran to očekuje).
- `user-directory-identity.controller.ts:22–51`: `POST`/`DELETE /users/:id/link-directory-identity`, oba
  **SUPER_ADMIN**; `link-user-directory-identity.ts:32–60` odbija ne-lokalne i već vezane naloge, zabranjuje
  SuperAdmin-u (`:38–41`), traži eksplicitno izabran `directoryExternalId`, razlikuje AD `objectGUID`
  (`ldaps:` prefiks) od Entra `oid`-a (`:50–54`) i traži konflikt (`:55–60`). `unlink-user-directory-identity.ts:35–52`
  briše `entraObjectId` i izdaje novu privremenu lozinku.
- `users.error.ts:1–16`: 15 kodova (`USER_NOT_FOUND`, `EMAIL_CONFLICT`, `SUPER_ADMIN_GRANT_FORBIDDEN`, …).

### 4.2 Organizacione jedinice (`backend/src/modules/organizational-units/`, 47 `.ts`, 1.459 linija)

- `organizational-units.controller.ts:30–39`: `@RequireRoles(ADMIN)`; `GET /organizational-units/tree`
  (`:52–56`) je proširen na `USER, AGENT, ADMIN, SUPER_ADMIN` (`organizational-unit-tree-read-roles.ts:3–8`).
- `create-organizational-unit.ts:21–57`: normalizacija naziva/DN-a, provjera da je DN dijete parent DN-a
  (`assert-distinguished-name-matches-parent`), `ouPath` se gradi iz parenta (`buildOrganizationalUnitPath`),
  provjera jedinstvenosti (`assert-organizational-unit-identity-is-available`), invalidacija scope keša (`:48`).
- `update-organizational-unit.ts:28–124`: promjena parenta kroz `assert-parent-change-is-valid.ts` (`SELF_PARENT`,
  `CIRCULAR_HIERARCHY`), a svaka promjena naziva/DN-a **prepisuje `ouPath` i `distinguishedName` svih potomaka**
  (`:59–88`, `:109–117`) u jednoj transakciji uz prethodnu provjeru dostupnosti prepisanih vrijednosti.
- `delete-organizational-unit.ts:9–29`: provjerava samo `_count.children` i `_count.users` → `HAS_CHILDREN` /
  `HAS_MAPPED_USERS`; zatim `delete` + `invalidateOrganizationalUnitScopeCache()`.
- `map-organizational-unit-error.ts:10–45`: `NOT_FOUND`/`USER_NOT_FOUND` → 404, `DUPLICATE_*`/`HAS_*` → 409,
  ostalo → 400; **nepoznate greške se ponovo bacaju** (`:34–36`).
- `group` — vidi 4.3; povezane restrikcije su u Prisma šemi (vidi bug B1).

### 4.3 Grupe (`backend/src/modules/groups/`, 31 `.ts`, 965 linija)

- `groups.controller.ts:30–40`: `@AdminConfigDomains('groups')` + `@RequireRoles(ADMIN)`; mutacije
  (`create`/`update`/`delete`/`addMember`/`removeMember`, `:51–94`) traže `permissionKeys.groupManage`, dok
  `list` i `getById` (`:44–49`, `:57–60`) traže samo rolu.
- `groups-mine.controller.ts:19–38`: odvojen `@Controller('groups/mine')` s fiksnom putanjom, registrovan prije
  `GroupsController` da `GET /groups/mine` ne padne u `:groupId` (komentar `:16–18`); koristi `listMyGroups`
  (`groups.service.ts:47–56`).
- `groups.types.ts:11–26`: `GroupResponse` nosi `isFallback`, `isProblemGroup`, `isCabGroup`, `memberCount`;
  `MyGroupResponse:28–40` nosi `effectiveAutoAssign` (odluka D2: grupa > servis > globalno).
- `create-group.ts:14–37`: `generateGroupKey` (jedinstveni `key`), provjera OU-a, u transakciji
  `clearFallbackForOrganizationalUnit` kad se nova grupa označi fallback; `update-group.ts:18–30` ponavlja istu
  logiku. `Group.autoAssignStrategy` postoji u šemi (`backend/prisma/schema/identity.prisma:178–181`).
- `assert-group-deletable.ts:10–29`: fallback grupa se ne može obrisati ako je jedina za OU
  (`SOLE_FALLBACK_GROUP`), ni ako ima tiketa koji nisu `CLOSED`/`ARCHIVED` (`groups.constants.ts:6`,
  `HAS_ACTIVE_TICKETS`).
- `add-group-member.ts:15–36` / `remove-group-member.ts:15–26`: provjere `USER_NOT_FOUND`,
  `MEMBER_ALREADY_EXISTS`/`MEMBER_NOT_FOUND`, pa `invalidateActorGroupsCache()` i invalidacija keša člana.
- `groups.error.ts:1–11`: 10 kodova.

### 4.4 Sinhronizacija s direktorijem (`backend/src/modules/directory-sync/`, 93 `.ts`, 5.017 linija)

- `directory-sync.controller.ts:34–102`: cijeli kontroler je `@RequireRoles(SUPER_ADMIN)` (`:36`); rute
  `GET status`, `GET directory-users`, `POST read`, `POST test-connection`, `POST dry-run`, `POST apply`,
  `GET runs`, `GET runs/:runId/plan`. `apply` traži `dryRunId` iz tijela (`:86–89`).
- `directory-full-sync.service.ts:149–187` (`apply`): plan mora biti `DRY_RUN` + `SUCCEEDED`, ne smije biti već
  primijenjen (`:154–156`), istječe nakon `directoryFullSyncLimits.planApplyWindowMilliseconds` (`:157–159`),
  plan koji je aktivirao osigurač se odbija i auditira (`:161–164`); plan se „otima“ atomski
  (`updateMany … appliedByRunId: null`, `:168–175`) da dva klika ne primijene isti plan.
- `build-directory-sync-plan.ts:218–246`: deaktiviraju se „managed“ aktivni ne-lokalni korisnici kojih nema u
  čitanju (`reason: 'missing'`); osigurač računa `percent = deactivate / activeManagedUsers` i `tripped` kad
  prelazi `maxDeactivationPercent` (`:224–241`).
- `apply-directory-sync-plan.ts:31–182`: kreira/ažurira OJ po `ouPath`, kreira korisnike s `USER` rolom,
  deaktivira (`isActive: false` + `directoryDeactivatedAt`), dodjeljuje/oduzima `ADMIN`/`AGENT` role iz AD grupa
  (`:161–177`) i na kraju zove `hooks.revokeSessions(deactivated)` i `hooks.invalidateUsers(touched)`
  (`:181–182`).
- `directory-full-sync.service.ts:193–197` (`runScheduledIfDue`): sync po rasporedu se izvršava samo ako je
  `enabled && source === 'ldaps' && strategy === 'scheduled'`; worker/scheduler su u `ldaps/`.
- LDAPS klijent postoji (`ldaps/ldap-directory-client.ts`, `ldaps/ldaps-directory-reader.ts`), što je u suprotnosti
  s tvrdnjama u `docs/plans/modules/1.8-verifikacija-kod-klijenta.md` (zabilježeno u `DOCS_CHANGELOG.md`).
- **Manager se ne sinhronizuje**: `grep -rn "manager" directory-sync` (bez spec fajlova) je prazan, iako RAW
  `:30` traži „opcionalno Manager“; polje `User.managerUserId` postoji (`identity.prisma:57`).
- `roleSource` u kodu dozvoljava `local_db` | **`ad_groups`** (`ldaps-directory.types.ts:51`,
  `settings/definitions/directory-ldaps-settings.ts:16`), dok RAW `:479` navodi `entra_groups` — terminološka
  neusklađenost (funkcionalno: role se čitaju iz AD grupa preko `groupsBaseDn`, `ldaps-directory-reader.ts:114–125`).

### 4.5 Frontend

- `pages/admin-page.tsx:77–137`: jedan ekran `/admin` s tabovima **org**, **groups**, **users**, **permissions**,
  **settings**, **ops**; `LegacyAdminRedirect` preusmjerava `/users`, `/organizational-units`, `/settings`,
  `/admin/queue` na odgovarajući tab (`router.tsx:167–222`).
- `pages/organizational-units-page.tsx:39,152,166`: LDAPS/DirectorySync panel se renderuje samo kad je sesija
  SuperAdmin (`session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin)`); stranica je 188 linija.
- `pages/users-page.tsx:128`: dugme **„Dodaj korisnika“**; administratorske akcije su u
  `components/users/user-admin-actions.tsx` — **„Resetuj lozinku“** se prikazuje samo za `user.isLocalOnly`
  (`:115–123`), **„Poveži sa AD nalogom“** samo za lokalne (`:126–135`), **„Raskini AD vezu“** za vezane (`:137`).
- `components/users/user-detail-form.tsx:49,80–83`: e-mail i OU polja su zaključana za `!user.isLocalOnly`
  (poruka `users.emailDirectoryLocked`).
- `pages/groups-page.tsx:121–155`: naslov **„Grupe za rutiranje“**, filter **„Filtriraj po OJ“**, dugme
  **„Nova grupa“** (`:147`); detalji grupe imaju članove, fallback badge i oznake problem/CAB grupe
  (`i18n bs` ključevi `groups.*`).
- i18n (`frontend/src/i18n/locales/bs/common.json`): moduli `users`, `groups`, `directory`, `permissions` — svi
  nazivi dugmadi i poruke na bosanskom; e-mail poruka za reset lozinke (`send-temporary-password-email.ts`).

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| OU hijerarhija + DN kao source-of-truth (`:13–21`) | DN i `ouPath` se grade i prepisuju konzistentno kroz sync i CRUD | `create/update-organizational-unit.ts` grade i prepisuju `ouPath`/DN potomaka u transakciji; LDAPS sync mapira OU iz DN-a | **Implementirano** |
| OU izolacija Admin/Agent (`:11`) | Svaka ruta s OU scope-om prolazi kroz guard | `OuAccessGuard` + `@RequireOrganizationalUnitScope` koriste audit, KB, policy packs, reports, routing; users/groups rute su admin-only bez OU scope-a | **Djelimično** |
| Group inbox obavezan (`:55`) | Grupe po OU-u, fallback invarijanta, group inbox | `create/update/delete-group` + `assert-group-deletable` čuvaju fallback; grupa je obavezna veza za inbox tabove | **Implementirano** |
| Routing `origin_unit + service_type` (`:63`) | DB-driven pravila; grupa kao `HANDLER_GROUP` | Routing modul postoji (`modules/routing`), veza grupa ↔ routing pravila postoji u UI kopiji | **Implementirano** (detalj u M7) |
| Sync korisnika iz AD-a (`:30`) | Ime, e-mail, Company, Department, Manager | Ime/e-mail/OU/Company/Department rade; **Manager se ne sinhronizuje** | **Djelimično** |
| `roleSource` (`:479`) | `local_db` ili `entra_groups` | Radi, ali vrijednost je `ad_groups` i grupe se čitaju iz LDAPS-a | **Odstupa** (terminologija) |
| Audit svih akcija (`:173`) | Svaka izmjena korisnika/OJ/grupe u audit logu | Audit imaju **samo** dodjela/uklanjanje role; create/update/delete korisnika, OJ i grupa ne pišu audit | **Djelimično** |
| Referencijalni integritet OU-a | Jasna greška za svaku zavisnost pri brisanju | Provjeravaju se samo djeca i korisnici; ostalo je FK `Restrict` → 500 | **Odstupa** |
| Zaštita SuperAdmin naloga | Ne može ostati bez ijednog SuperAdmin-a | Zaštita postoji za tuđe SuperAdmin naloge (`assert-can-manage-target-user.ts`), **nema** za posljednjeg SuperAdmin-a pri uklanjanju role/deaktivaciji | **Djelimično** |
| Liste korisnika | Pretraga + paginacija s limitima | `q`/`take`/`skip` postoje, `take` cap 500, nema ukupnog broja ni oznake odsječene liste | **Djelimično** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Dobra strana.** Moduli su podijeljeni po operaciji (`create-user.ts`, `delete-organizational-unit.ts`, …), s
  domen-specifičnim `*Error` klasama i jednim mjestom za mapiranje na HTTP (`map-users-error.ts`,
  `map-organizational-unit-error.ts`, `map-groups-error.ts`). To je konzistentno s ostatkom repoa i lako se
  testira (498 spec fajlova u backendu). Prepisivanje `ouPath`/DN-a potomaka u jednoj transakciji
  (`update-organizational-unit.ts`) je iznad prosječnog nivoa pažnje za ovakav modul.
- **Glavna zamjerka.** „Sigurnosne“ invarijante su raspoređene: jedan dio u servisima (fallback grupa), jedan u
  kontroleru (self-deaktivacija), a dio ih uopšte nema (posljednji SuperAdmin, referencijalni integritet OU-a).
  Idealno bi sve invarijante bile u servisnom sloju, jer kontroler nije jedini mogući pozivalac.
- **Konzistentnost s Prisma šemom.** Servisne provjere ne prate sve `onDelete` restrikcije iz šeme — vidi B1; to
  je tip greške gdje kod „izgleda potpuno zaštićeno“, a prva realna kombinacija podataka vrati 500.
- **Audit.** Djelimičan audit je gori od nikakvog za forenziku: vraća osjećaj pokrivenosti. RAW izričito traži
  „audit log svih akcija“; korisničke i OU izmjene su upravo one koje se najčešće istražuju.
- **Frontend je pažljiv** oko onoga što prikazuje (reset lozinke samo za lokalne naloge, e-mail zaključan za
  AD-praćene), ali backend to ne provjerava — asimetrija koja se lako pretvori u bug pri prvom drugom klijentu.

## 7. Otkriveni bug-ovi i neusklađenosti

**B1 — `SREDNJE` — brisanje OU-a koja ima grupu (ili imovinu, promjenu, KB, routing/SLA pravilo) vraća 500.**
`delete-organizational-unit.ts:20–25` provjerava samo podređene OJ-e i mapirane korisnike, pa `prisma.organizationalUnit.delete`
(`:26`) padne na FK restrikciji: `Group.organizationalUnit` je `onDelete: Restrict`
(`backend/prisma/schema/identity.prisma:182`), `Asset`/`AssetContract`/`AssetSignatory` (`assets.prisma:176,237,270`),
`ChangeRequest` (`changes.prisma:88`), `KnowledgeArticle` (`knowledge.prisma:39`), `RoutingRule`
(`catalog.prisma:121`). `map-organizational-unit-error.ts:34–36` propušta nepoznatu grešku dalje, a zajednički
filter je pretvara u `500 INTERNAL_ERROR` (`common/request-context/format-error-response.ts:21–31,50–55`).
**Uticaj:** admin dobije „Brisanje nije uspjelo“ bez razloga; ne zna da prvo mora obrisati grupu. **Fix:** dodati
provjere svih restriktivnih relacija (409 s kodom) i/ili generičko mapiranje Prisma `P2003`.

**B2 — `SREDNJE` — brisanje OU-a tiho briše dodjele rola, bez audita i bez invalidacije keša.**
`UserRole.organizationalUnit` je `onDelete: Cascade` (`identity.prisma:155`), pa se dodjele `ADMIN`/`AGENT` vezane
za tu OJ brišu zajedno s njom; `delete-organizational-unit.ts` poziva samo `invalidateOrganizationalUnitScopeCache()`
i **ne** obavještava pogođene korisnike (kontrast: `groups/add-group-member.ts:35` i `users/assign-user-role.ts:109`
to rade kroz `PrincipalContextInvalidator`). **Uticaj:** korisnik ostaje bez dozvole bez ijednog zapisa zašto, a
keširani principal kontekst živi do 60 s (`common/principal-context/principal-context.cache.ts:9`). **Fix:**
prikupiti pogođene `userId` prije brisanja i pozvati `invalidateUsers`; upisati audit.

**B3 — `SREDNJE` — izmjene korisnika, OU-a i grupa nisu u audit logu.**
`grep -rn appendAuditLog backend/src/modules/{users,organizational-units,groups}` daje samo
`users/assign-user-role.ts:92` i `users/remove-user-role.ts:35`; `create-user.ts`, `update-user.ts`,
`delete-user.ts`, `reset-user-temporary-password.ts`, `unlink-user-directory-identity.ts`,
`organizational-units/*` i `groups/*` ga ne zovu. **Uticaj:** nema traga ko je kreirao/obrisao nalog, resetovao
lozinku, prepisao OU granu ili dodao člana grupe — suprotno RAW `:173`. **Fix:** `appendAuditLog` u istim
transakcijama, s `metadata` prije/poslije.

**B4 — `SREDNJE` — `POST /users/:id/reset-password` ne provjerava `isLocalOnly`, a reset pretvara nalog u lokalni.**
`reset-user-temporary-password.ts:21–37` provjerava samo `isActive`; `issue-temporary-password-for-user.ts:29`
postavlja `isLocalOnly: true`. Time AD/Entra-praćen nalog dobija lokalnu lozinku, a Microsoft prijava prestaje
raditi jer `decide-entra-binding.ts:39–41` odbija lokalne naloge (`LOCAL_ACCOUNT`). UI dugme je sakriveno za
`!user.isLocalOnly` (`components/users/user-admin-actions.tsx:115–123`), pa je ovo dostižno samo direktnim
pozivom API-ja. **Uticaj:** promjena načina autentikacije bez potvrde i bez povratka kroz isti ekran. **Fix:**
odbijati reset za ne-lokalne naloge (ili zahtijevati eksplicitnu „raskini AD vezu“ akciju, koja postoji).

**B5 — `NISKO` — nema zaštite posljednjeg SuperAdmin naloga.**
`remove-user-role.ts:14–51` dozvoljava uklanjanje zadnje `SUPER_ADMIN` dodjele (nema brojanja), a
`update-user.ts:89–91` dozvoljava deaktivaciju. Kontroler štiti samo *vlastiti* nalog od deaktivacije/brisanja
(`users.controller.ts:114–122,139–144`) i *tuđe* SuperAdmin naloge od ne-SuperAdmin aktera
(`assert-can-manage-target-user.ts`). **Uticaj:** SuperAdmin može sebi ukloniti rolu i time zaključati RBAC
administraciju (oporavak samo kroz bazu/konzolu). **Fix:** broj aktivnih SUPER_ADMIN dodjela i odbijanje
posljednje, s jasnom porukom.

**B6 — `NISKO` — neaktivan korisnik na reset lozinke daje `INVALID_INPUT` (400 „Invalid input“).**
`reset-user-temporary-password.ts:28–30` baca isti kod kao za prazan ID (`:18–20`); UI tu poruku prikazuje kao
generičku (`users.resetPasswordFailed`). **Uticaj:** korisnik ne zna da je nalog deaktiviran, a admin ne dobija
uputu da ga prvo aktivira. **Fix:** poseban kod (`USER_INACTIVE`).

**B7 — `NISKO` — lista korisnika se tiho odsijeca na 500 bez metapodataka.**
`list-users-summary.ts:20,54–59` ograničava `take` na 500 i ne vraća ukupan broj; auto-refresh admin ekrana
zove `GET /users` bez `take` (komentar `:31–36`). **Uticaj:** na instanci s >500 korisnika dio njih se ne
prikazuje, bez ikakve oznake u UI-u. **Fix:** vratiti `{ items, total }` ili barem `X-Total-Count` i oznaku u UI-u.

**Napomena (nije bug):** `roleSource` vrijednost `ad_groups` umjesto RAW-ovog `entra_groups`
(`ldaps-directory.types.ts:51`, `directory-ldaps-settings.ts:16`) je terminološka razlika, funkcionalnost postoji;
zapisano u `DOCS_CHANGELOG.md`, ne predlaže se preimenovanje bez odluke.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/` — korisnici/OJ/grupe nisu imali nijednu stranicu; postojeći fajlovi
(`prosljedjivanje-tiketa.md` 80, `imovina.md` 79, `promjene.md` 68, `precice-i-pristupacnost.md` 65,
`najave.md` 57, `problemi.md` 49, `status-incidenti-i-planirani-prekidi.md` 47, `dezurstva.md` 21) nisu
spominjali administraciju korisnika; `TEZE-ZA-DOKUMENTACIJU.md` nije imao teze za ovaj modul.

**Dodato:**
- `docs/user-guide/korisnici-oj-i-grupe.md` — administracija korisnika (dodavanje, uređivanje, reset lozinke,
  privremena lozinka, reset MFA-a, odjava sesija, AD veza), organizacione jedinice (Dodaj/izmjena/brisanje OU-a,
  DN i ouPath objekti) i grupe (grupe za rutiranje, fallback, problem/CAB grupa, članovi), s tačnim nazivima
  dugmadi, tabovima i porukama iz `bs` i18n-a.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T23** (korisnik je jedan zapis; AD/Entra veza je eksplicitna SuperAdmin akcija),
  **T24** (brisanje OU-a je blokirano djecom i korisnicima — i mora se blokirati svim zavisnostima),
  **T25** (svaka fallback grupa je pojedinačna; modul problema/CAB-a se „pali“ postojanjem takve grupe),
  **T26** (audit: šta ulazi u audit log — trenutno samo role; dokumentacija ne smije tvrditi više od koda).

**Ispravljeno:** ništa nije bilo netačno (tema nije bila dokumentovana).

**Ostaje otvoreno:** `[NEJASNO]` — RAW traži „opcionalno Manager“ u sync-u, ali ne definiše kako se manager
koristi u aplikaciji (hijerarhija odobravanja?); polje `User.managerUserId` postoji, mapiranje iz AD-a ne.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **8 / 10** | Sve ključne operacije postoje (CRUD korisnika/OJ/grupa, AD sync s probnim prolazom i osiguračem, group inbox help). Gube bodovi zbog B1 (500 pri brisanju OJ), B4 i manjkavog Manager sync-a. |
| Kvalitet koda | **8 / 10** | Dosljedna podjela po operaciji, domen-greške i solidna transakciona logika (prepisivanje DN-a potomaka, atomsko preuzimanje plana). Gube bodovi zbog raspoređenih invarijanti i duplirane fallback logike u `create-group`/`update-group`. |
| Sigurnost | **7 / 10** | Dobro: SuperAdmin-only veza s direktorijem, zabrana upravljanja tuđim SuperAdmin-om, invalidacija keša na promjenu role/članstva. Slabo: B4 (tiha promjena načina prijave), B2 (kaskadno brisanje dozvola bez invalidacije), B5 (posljednji SuperAdmin). |

---

# M4 — RBAC (role, permisije i OU scope)

## 1. Planirano u RAW projektnom zadatku

- **Granularni RBAC je obavezan** (`RAW_PROJECT.md:174–176`): pored rola (USER/AGENT/ADMIN/SUPER_ADMIN)
  sistem ima permissione po akcijama; „permissioni se evaluiraju uz OU scoping (permission ≠ cross-OU)“.
- **Minimalni „enterprise set“** (`RAW_PROJECT.md:177–194`): 17 navedenih permisija od `ticket.forward.cross_ou`
  do `confidential.break_glass` (uključujući `ticket.bulk.*`, `service.*.write`, `sla.write`, `routing.write`,
  `settings.write`, `audit.export`, `supportBundle.export`).
- **Default mapping rola → permisije** (`RAW_PROJECT.md:195–220`): USER bez admin permisija; AGENT dobija
  attachments, `ticket.merge`, `ticket.bulk.assign`, `ticket.bulk.status_update`, `ticket.forward.cross_ou`;
  ADMIN sve iz AGENT + bulk priority/broadcast, routing/service/sla write, `settings.write`, `audit.export`,
  `supportBundle.export`; SUPER_ADMIN sve + implicitno cross-OU (uz audit) + `confidential.break_glass`.
- **Guardovi ostaju obavezni** (`RAW_PROJECT.md:222`): „OU/group guardovi su i dalje obavezni; permissions ne
  smiju 'otključati' podatke van scope-a osim za SUPER_ADMIN“; (`:229`) scope nikad ne smije zaobići
  confidential per-ticket ACL.
- **Mapping je izmjenjiv kroz admin UI i ide u change log (reason + diff)** (`RAW_PROJECT.md:223`).
- **Permission scopes** (`RAW_PROJECT.md:224–228`): OU scope (npr. `routing.write` samo za jednu OJ), service
  scope (npr. `service.forms.write` samo za HR servise), SUPER_ADMIN globalno.
- **Shadow permission check je obavezan** (`RAW_PROJECT.md:230–232`): prije aktivacije promjene prikazuje se
  diff „ko dobija/gubi“ pristup; „promjena se ne može aktivirati bez pregleda (settings-driven)“.
- **Izvor rola** (`RAW_PROJECT.md:479`): `private.auth.roleSource` : `local_db` | `entra_groups`.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Jedan servis odlučuje.** Sve rute (HTTP, jobovi, workeri) pitaju isti evaluator; nijedan kontroler ne
   provjerava dozvole sam.
2. **Fail-closed, ali predvidiv.** Nepoznata permisija, nedostatak scope-a ili konteksta = odbijanje, s jasnim
   kodom zbog kojeg SRE može reći *zašto* je pristup odbijen.
3. **Defaulti postoje čim sistem proradi.** Standardni mapping iz zadatka je dio instalacije, ne wiki
   preporuka; novoinstaliran ADMIN odmah radi svoj posao.
4. **Promjena dozvola je kontrolisan proces.** Preview (ko dobija/gubi), obavezan razlog, diff u audit logu i
   verzija konfiguracije — sve serverski provjereno, ne samo u UI-u.
5. **Scope je zatvoren.** Scoped dodjela nikad ne prolazi globalnu provjeru; ako ruta nema OU scope, to je
   svjesna odluka zapisana uz rutu.
6. **Sesija nosi tačno ono što korisnik smije.** Klijent prikazuje akcije koje server stvarno dozvoljava, a
   keš dozvola ima TTL i invalidaciju.
7. **Read-only režim je break-glass** koji jasno piše šta je zaključano i kome (ko smije zaobići).

## 3. Preporučena implementacija `[MIŠLJENJE]`

- Zadržati decision-core (`evaluate-authorization-access.ts`) — razdvojen je od I/O-a i dobro testiran. Dodati,
  po prioritetu:
  1. **Idempotentno upisivanje default mappinga** (`defaultRolePermissionKeys`) pri instalaciji i pri kreiranju
     sistemskih rola, plus migracija koja to radi na postojećim instalacijama (danas tabela `RolePermission`
     ostaje prazna — vidi B1).
  2. **Serverska kapija za preview**: `PUT /roles/:roleKey/permissions` prihvata `previewToken` (ili traži
     potvrđen preview iz iste sesije) i obavezan `reason`; diff i razlog idu u audit i u „change log“.
  3. **Eksplicitna semantika više permisija**: `@RequireAllPermissions` (AND) uz postojeći ANY-of, ili barem
     dokumentovanje ponašanja na svakom mjestu gdje se koristi više ključeva.
  4. **Scope pravilo po ruti**: za rute koje traže permisiju bez OU scope-a (npr. `group.manage`) odlučiti da li
     je permisija scope-agnostička ili ruta dobija `@RequireOrganizationalUnitScope`.
  5. **Test matrice** koja za svaku permisiju provjerava ko je ima po defaultu (da RAW mapping i kod ne
     divergiraju tiho).

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Model rola i permisija

- `authorization.constants.ts:3–14`: `authorizationRoleKeys` = `USER`, `AGENT`, `ADMIN`, `SUPER_ADMIN`
  (`authenticationConstants.superAdminRoleKey`) + paketske role `ASSET_MANAGER`, `PROBLEM_MANAGER`,
  `CHANGE_MANAGER`.
- `authorization.constants.ts:16–99`: **63 permisije** (`permissionKeys`), uključujući sve iz RAW liste i
  kasnije dodatke (`privacy.*`, `ops.*`, `oncall.*`, `announcement.*`, `config.version.import`, `asset.*`,
  `problem.*`, `change.*`, `integrations.teams.manage`).
- `authorization.constants.ts:101`: `scopeAgnosticPermissionKeys = [onCallRead]` — jedina permisija koja smije
  zadovoljiti provjeru bez OU scope-a; komentar objašnjava da je sve ostalo „fail-closed“.
- `authorization.constants.ts:105–204`: grupe defaulta po roli (edge/agent/admin/asset/problem/change manager);
  `:205–217` `defaultRolePermissionKeys` (SUPER_ADMIN = `allPermissionKeys`).
- `permission-catalog.ts:21–348`: katalog od **63 stavke** s opisom i kategorijom; `permission-categories.ts:1–33`
  definiše 15 kategorija (ticket, service, routing, group, sla, settings, integrations, audit, reports,
  observability, confidential, knowledge, edge, privacy, assets).

### 4.2 Evaluacija i guardovi

- `evaluate-authorization-access.ts:29–86`: `doesAssignmentGrant` — traži poklapanje role (ako je tražena),
  **bilo koju** od traženih permisija (`.some`, `:42–48`), pa scope: OU (`doesOrganizationalUnitScopeCover`) ili
  pravilo „scoped dodjela ne zadovoljava globalnu provjeru“ (`:62–68`), isto za servis (`:69–84`).
- `evaluate-authorization-access.ts:88–132`: `decideAuthorizationAccess` — odbija prazan kontekst, nevalidne
  tokene, rutu bez ijednog zahtjeva; zahtijeva OU/service scope ako je tražen; **SUPER_ADMIN bypass**
  (`:120–125`) uz uslov `isLocalOnly` (inače `SUPER_ADMIN_NOT_LOCAL_ONLY`); na kraju
  `context.assignments.some(...)`.
- `evaluate-authorization-request.ts:77–136`: učitava kontekst (`AuthorizationContextLoader`), za OU scope
  prevodi `organizationalUnitId` u `ouPath` (nepoznat/prazan → odbijenica s razlogom), provjerava da servis
  postoji, pa poziva decision-core.
- `authorization-decision-reason.ts:1–14`: 12 razloga odluke (npr. `MISSING_ORGANIZATIONAL_UNIT_SCOPE`,
  `SUPER_ADMIN_NOT_LOCAL_ONLY`, `NO_MATCHING_ASSIGNMENT`) — korisni za dijagnostiku.
- `role.guard.ts:13–20` (`requireOrganizationalUnitScope: false`) i `ou-access.guard.ts:13–20`
  (`requireOrganizationalUnitScope: true`) oba idu kroz `authorize-http-execution.ts:15–51`, koji baca
  `UnauthorizedException`/`ForbiddenException` s kodovima `INVALID_CREDENTIALS`/`FORBIDDEN`.
- Dekoratori: `require-roles.decorator.ts`, `require-permissions.decorator.ts`,
  `require-organizational-unit-scope.decorator.ts` (`{ field: 'organizationalUnitId' | 'originUnitId' }`),
  `require-service-scope.decorator.ts`, `admin-read-operation.decorator.ts`.
- `read-authorization-requirements.ts:48–82`: spaja metadata s rute i klase; OU scope je obavezan i kad ga sam
  guard traži (default polje `organizationalUnitId`).

### 4.3 Sesija i klijentske dozvole

- `current-session.controller.ts:29–53`: `GET /auth/session` vraća kontekst + kućnu OJ + stanje addona
  (CMDB/problemi/promjene).
- `to-current-session-response.ts:15–39`: `isSuperAdmin`, `roleKeys`, `permissionKeys`; za SuperAdmin se
  **direktno vraćaju sve permisije** uz komentar „instead of depending on seeded role-permission rows“ (`:27–28`),
  plus `organizationalUnitId/Name` i `modules`.
- Frontend `lib/session/permission-keys.ts:1–30`: zrcalo ključeva s komentarom da je backend mjerodavan;
  `lib/session/use-session-capabilities.ts:16–60` učitava `/auth/session` i nudi
  `hasPermission`/`hasRole`; `lib/session/route-access.ts:27–70` (npr. `canOpenAdminArea`, `isTicketStaff`,
  `canOpenReports`) odlučuje koji se meni/ekran prikazuje.
- `RequireAccess` (`pages/permissions-page.tsx:23–33`) traži `isSuperAdmin` za ekran Permisije i prikazuje
  `permissions.forbiddenTitle`/`forbiddenBody`.

### 4.4 Administracija permisija (RBAC modul)

- `backend/src/modules/rbac/roles.controller.ts:31–82`: cijeli kontroler je **SUPER_ADMIN-only**; rute
  `GET /roles` (broj permisija po roli), `GET /roles/permissions/catalog` (63 stavke), `GET /roles/:roleKey/permissions`,
  `POST /roles/:roleKey/permissions/preview`, `PUT /roles/:roleKey/permissions`.
- `roles.service.ts:30–64`: uz `replace` prosljeđuje `PrincipalContextInvalidator.invalidateRoleHolders` — svi
  nosioci role odmah dobijaju novi keš.
- `replace-role-permissions.ts:23–61`: transakciono briše i upisuje `RolePermission`, upisuje audit
  `rolePermissionReplace` s `previousPermissionKeys` i `nextPermissionKeys` (diff), pa invalidira nosioce.
- `preview-role-permission-impact.ts:25–70+`: računa `added`/`removed`, broj pogođenih korisnika, uzorak do
  **3** korisnika i za svaku promijenjenu permisiju upoređuje odluku prije/poslije koristeći stvarne lookupe i
  `ShadowAuthorizationService`.
- `assert-known-permission-keys.ts` odbija nepoznate ključeve; `ensure-permission-rows.ts:3–23` pri upisu
  kreira red u `Permission` ako ne postoji.
- Frontend: `components/rbac/permissions-panel.tsx:91–124` — **Pregled uticaja** poziva preview; čuvanje je
  dugme **Potvrdi i sačuvaj** koje postoji **samo u preview panelu**
  (`permissions-preview-panel.tsx:54–60`), pa se kroz UI ne može sačuvati bez prikazanog pregleda. Katalog je
  grupisan po kategorijama (`group-permissions-by-category`), role se biraju u padajućoj listi s brojem
  permisija.

### 4.5 Read-only režim i realtime

- `authorization.module.ts:25–28`: `AdminReadOnlyInterceptor` je registriran kao `APP_INTERCEPTOR`, pa vrijedi
  za sve rute.
- `classify-admin-read-only-request.ts:15–35` + `read-only-mode.constants.ts:21–70`: mutirajuće metode
  (POST/PUT/PATCH/DELETE) na prefiksima `/organizational-units`, `/policy-packs`, `/settings`,
  `/config-versions`, `/integration-jobs`, `/directory-sync`, `/services`, `/service-categories`, `/routing`,
  `/sla`, uz izuzetke `/directory-sync/read` i `/policy-packs/validate`; module keys: admin, settings, routing,
  service_catalog, service_forms, sla.
- `evaluate-admin-read-only-access.ts:11–58`: zaključana je mutacija ako je modul (ili `admin`) aktivan; bypass
  imaju role iz `private.readOnlyMode.bypassRoles` (default SUPER_ADMIN, `read-only-mode.constants.ts:87–89`);
  prekršaj = `403 READ_ONLY_MODE` (`read-only-mode.constants.ts:82–85`).
- `read-only-mode.configuration-loader.ts:14–35`: konfiguracija iz postavki; neispravna konfiguracija se
  pretvara u zabranu (fail-closed).

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Granularne permisije (`:174–176`) | 60+ permisija, provjera na svakoj ruti | 63 permisije, `@RequirePermissions` + `RoleGuard`/`OuAccessGuard` | **Implementirano** |
| Minimalni set iz RAW-a (`:177–194`) | Sve navedene permisije postoje i koriste se | Postoje (i više od liste); `reports.controller.ts:48` koristi dvije zajedno (ANY-of) | **Implementirano** |
| Default mapping (`:195–216`) | Standardni mapping aktivan odmah | **Nije upisan u bazu** — vidi B1 | **Odstupa** |
| Premošćivanje scope-a zabranjeno (`:222,229`) | Scoped dodjela ne prolazi globalnu provjeru | Fail-closed pravilo u `evaluate-authorization-access.ts:62–68`; jedina scope-agnostička permisija `onCallRead` | **Implementirano** |
| SUPER_ADMIN globalno uz audit (`:217–220`) | Bypass + trag o cross-OU akcijama | Bypass postoji (`:120–125`, uz `isLocalOnly`); sam bypass se ne auditira | **Djelimično** |
| Mapping izmjenjiv kroz UI + change log s reason + diff (`:223`) | UI + obavezan razlog + diff u audit logu | UI i diff u auditu postoje; **nema razloga** u `ReplaceRolePermissionsDto` (`dto/replace-role-permissions.dto.ts:3–7`) | **Djelimično** |
| Permission scopes OU/servis (`:224–228`) | Scope po dodjeli, evaluiran s guardovima | `organizationalUnitId`/`serviceId` na `UserRole` + `RequireOrganizationalUnitScope`/`RequireServiceScope` na rutama | **Implementirano** |
| Shadow permission check prije aktivacije (`:230–232`) | Server traži pregled prije aktivacije | Preview endpoint + UI tok; **server ne zahtijeva** da je preview izvršen | **Djelimično** |
| `roleSource` (`:479`) | `local_db` ili `entra_groups` | Radi kao `local_db`/`ad_groups` (vidi §M3, terminologija) | **Odstupa** (naziv) |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Snaga.** Decision-core je funkcijsko jezgro bez I/O-a, s vlastitim razlozima odluke i ozbiljnom test
  pokrivenošću (`evaluate-authorization-access.*.spec.ts`, `shadow-authorization.*.spec.ts`,
  `authorization-provider-independence.spec.ts`). Preview uticaja je iznad uobičajenog nivoa: računa stvarni
  prije/poslije kroz isti evaluator, ne pogađa.
- **Slabost 1 — defaulti.** Postojanje `defaultRolePermissionKeys` u kodu ostavlja utisak da je mapping
  primijenjen; u stvari ga niko ne upisuje u bazu. To je klasična „tiho pokvarena pretpostavka“ — sve izgleda
  ispravno dok se prvi ADMIN ne prijavi i ne dobije 403 na grupama i postavkama.
- **Slabost 2 — proces.** RAW traži „ne može se aktivirati bez pregleda“ i „reason + diff“; implementirano je
  „UI ne nudi dugme bez pregleda“ i „diff bez razloga“. Kad neko pozove API direktno, obje garancije padaju.
- **Slabost 3 — tišina pravila.** ANY-of za više permisija i „scoped dodjela ne zadovoljava globalnu provjeru“
  nigdje nisu zapisani kao ugovor na mjestu upotrebe (`reports.controller.ts:48`,
  `groups.controller.ts:51–94`), pa ih čitalac mora rekonstruisati iz decision-core-a.
- **Pozitivno:** read-only režim je fail-closed i pokriva tačno one module koje RAW navodi (settings, routing,
  katalog, SLA), a bypass je eksplicitan u postavci.

## 7. Otkriveni bug-ovi i neusklađenosti

**B1 — `VISOKO` — default mapping rola → permisije se nikad ne upisuje u bazu; svježa instalacija daje
ADMIN/AGENT naloge bez ijedne permisije.**
`defaultRolePermissionKeys` (`authorization.constants.ts:205–217`) koriste samo
`policy-packs/policy-pack.registry.ts:11–12`, `assert-policy-pack-definition.ts:61` i test harness
(`knowledge-base/seed-knowledge-base-harness-actors.ts:103`). Nijedna migracija ne upisuje bazne redove: init
migracija samo kreira tabele (`backend/prisma/migrations/20260909180000_init_enterprise_schema/migration.sql:194–199,931–934`),
a kasnije migracije koje upisuju `RolePermission` samo dijele permisije onima koji ih već imaju, npr.
`20260916100000_group_manage_permission/migration.sql` daje `group.manage` roll koja već ima `routing.write` —
na praznoj tabeli to ne uradi ništa. Instalacija kreira samo SuperAdmin rolu bez permisija
(`install/ensure-install-super-admin-role.ts:15–23`), a `users/ensure-system-role.ts:31–38` isto za ostale role.
SuperAdmin i dalje radi jer ima bypass (`evaluate-authorization-access.ts:120–125`) i jer mu sesija vraća sve
permisije (`to-current-session-response.ts:29–35` — komentar u kodu to i priznaje). **Uticaj:** nakon instalacije
ADMIN/AGENT ne mogu ništa što traži permisiju — grupe (`group.manage`), postavke (`settings.write`), routing,
SLA, izvještaji/izvoz (`reports.export`, `audit.export`), bulk akcije; dobijaju 403 dok SuperAdmin ručno ne
sačuva permisije u UI-u ili ne primijeni policy paket. To je direktno protivno RAW default mapiranju
(`RAW_PROJECT.md:195–216`). **Fix:** idempotentno upisati `defaultRolePermissionKeys` u okviru instalacije
(`ensureInstallSuperAdminRole`/seed) i dodati migraciju za postojeće instalacije.

**B2 — `SREDNJE` — preview uticaja nije serverska kapija, a razlog promjene se ne pamti.**
`roles.controller.ts:69–82` prima `PUT` i odmah mijenja permisije; `dto/replace-role-permissions.dto.ts:3–7` nema
polje `reason`. RAW `:231–232` traži da se promjena „ne može aktivirati bez pregleda (settings-driven)“, a `:223`
traži change log s razlogom. UI tok (`permissions-panel.tsx` + `permissions-preview-panel.tsx:54–60`) to
poštuje, ali svaki drugi klijent može preskočiti pregled. **Fix:** `previewToken`/potvrda u okviru sesije +
obavezan `reason`, oba u audit metadata.

**B3 — `NISKO` — `@RequirePermissions(a, b)` znači „bilo koja od njih“, ne „obje“.**
`evaluate-authorization-access.ts:42–48` koristi `.some(...)`, a vanjski izbor je takođe `.some(...)`
(`:126–128`); ne postoji AND varijanta dekoratora. Jedina upotreba s više ključeva je
`reports.controller.ts:48` (`reportsExport, auditExport`) i tamo je OR vjerovatno namjera, ali je nedokumentovano.
**Uticaj:** buduća ruta koja napiše dva ključa misleći „obje“ tiho dobija slabiju provjeru. **Fix:** uvesti
`@RequireAllPermissions` ili objasniti semantiku u dekoratoru i na mjestu upotrebe.

**B4 — `NISKO` — `group.manage` se provjerava bez OU scope-a, pa OU-scoped ADMIN ne može upravljati grupama.**
`groups.controller.ts:51–94` traži `permissionKeys.groupManage` kroz `RoleGuard` (bez OU scope-a), a
`scopeAgnosticPermissionKeys` sadrži samo `onCallRead` (`authorization.constants.ts:101`); po pravilu iz
`evaluate-authorization-access.ts:62–68`, dodjela koja ima `organizationalUnitId` **ne može** zadovoljiti
provjeru bez scope-a. **Uticaj:** dvije krajnosti — OU-scoped ADMIN je odbijen, a globalno (nescoped) dodijeljen
`group.manage` daje upravljanje grupama u svim OJ. **Fix:** odlučiti da li ruta dobija
`@RequireOrganizationalUnitScope` ili je `group.manage` scope-agnostic.

**B5 — `NISKO` — SUPER_ADMIN bypass nije auditovan.**
`evaluate-authorization-access.ts:120–125` propušta SuperAdmin-a bez provjere permisija i bez zapisa; RAW `:219`
traži da implicitne cross-OU mogućnosti idu „uz audit“. Moduli pojedinačno bilježe svoje akcije (npr. forwarding),
ali sam bypass nema trag. **Uticaj:** nemoguće je dokazati da je SuperAdmin koristio pravo van svog OU-a za
radnje koje modul ne auditira. **Fix:** audit zapis (ili barem metrika) kad odluka padne na `superAdminAllowed`.

**Napomena (nije bug):** preview uzima samo 3 uzorka korisnika
(`preview-role-permission-impact.ts:11,39–46`), što je i prikazano u UI tekstu („{{count}} korisnika · …“) i u
redu je s RAW-om koji traži diff, ne iscrpnu simulaciju.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/` nije imao stranicu o ulogama i permisijama; `TEZE-ZA-DOKUMENTACIJU.md` nije
imao teze za RBAC; postojeći modulski fajlovi spominju permisije samo usput (npr. `dezurstva.md`, `promjene.md`).

**Dodato:**
- `docs/user-guide/uloge-i-permisije.md` — čemu služi RBAC, kome je namijenjen, kako se dolazi do ekrana
  **Permisije**, korak-po-korak (odabir role, katalog po kategorijama, **Pregled uticaja**, **Potvrdi i
  sačuvaj**), read-only režim i njegove posljedice, greške (403/„Potreban SuperAdmin pristup“), poznata
  ograničenja (B1–B5) i veze na druge module.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T27** (SuperAdmin ima sve permisije i zaobilazi provjere, ali mora biti
  lokalni nalog), **T28** (scoped dodjela ne zadovoljava provjeru bez scope-a; samo `oncall.read` je izuzetak),
  **T29** (preview uticaja i „diff“ u audit logu; razlog još nije obavezan), **T30** (read-only režim zaključava
  module, SuperAdmin ga zaobilazi po postavci), **T31** (default mapping postoji u kodu, ali nije upisan u bazu
  — dokumentacija to mora reći).

**Ispravljeno:** ništa (tema nije bila dokumentovana).

**Ostaje otvoreno:** `[NEJASNO]` — RAW vrijednost `entra_groups` za `private.auth.roleSource` ne postoji u kodu
(`ad_groups`); pitanje je da li je to samo naziv ili se očekuje vezivanje rola iz Entra grupa, ne iz AD grupa.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **7 / 10** | Sve komponente postoje (63 permisije, scope po OU/servisu, preview, read-only režim, sesija s dozvolama), ali B1 čini RBAC praktično neupotrebljivim za ADMIN/AGENT na svježoj instalaciji dok se mapping ručno ne uspostavi. |
| Kvalitet koda | **9 / 10** | Decision-core odvojen od I/O-a, razlozi odluka, izuzetna test pokrivenost, čist preview kroz stvarni evaluator. Zamjerke su male: nedokumentovana ANY-of semantika i dvostruko čitanje pravila u komentarima umjesto u kodu. |
| Sigurnost | **8 / 10** | Fail-closed scope pravilo, `isLocalOnly` uslov za SuperAdmin bypass, read-only režim fail-closed, revizija promjena kroz audit. Umanjuju: serverski neobavezan preview (B2), neauditovan bypass (B5) i implikacije B4. |

---

# M5 — Policy paketi (bundles konfiguracije)

## 1. Planirano u RAW projektnom zadatku

- **Definicija** (`RAW_PROJECT.md:294–295`): „paket konfiguracije koji kombinuje: **permissions/scopes + SLA
  profile + required fields + classification policy + approvals defaults**“.
- **Ciljna dodjela** (`RAW_PROJECT.md:296`): „policy pack se može dodijeliti **servisu ili cijeloj OU** (admin
  bira), i služi za standardizaciju između službi“.
- **Default paketi** (`RAW_PROJECT.md:297–299`): `PACK_IT_STANDARD`, `PACK_HR_RESTRICTED`,
  `PACK_FINANCE_RESTRICTED`.
- **Postavke** (`RAW_PROJECT.md:670–672`): `private.policyPacks.enabled` (boolean, default true),
  `private.policyPacks.defaultPacksJson` (secret — definicija default paketa) i
  `private.policyPacks.assignmentJson` (secret — mapiranje OU/service → pack, default prazno).
- **Efekat** (`RAW_PROJECT.md:985`): pack se dodjeljuje servisu/OU i **utiče na default konfiguraciju**
  (SLA / required fields / classification / approvals / permission scopes).
- **Veza s wizardom** (`RAW_PROJECT.md:356`): onboarding servisa predlaže default routing target i fallback
  „prema OU i/ili **policy pack-u**“, uz potvrdu admina.
- **Shadow permission check** (`RAW_PROJECT.md:230–232`) traži preview uticaja prije aktivacije promjena
  permissions/scopes — za pakete to znači da se i njihov efekat vidi prije primjene.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Pack je verzionisan dokument.** Definicija (SLA profil, required fields, classification, approvals,
   permisije) dolazi iz konfiguracije, ima verziju i vidi se diff između primijenjenog i predloženog stanja.
2. **Dodjela je eksplicitna i reverzibilna.** Pack se veže na OU *ili* servis, jasno se vidi šta je vezano i
   čime, a uklanjanje paketa vraća prethodno stanje (ili ga bar prikazuje i traži potvrdu).
3. **Primjena je predvidiva.** Prije primjene korisnik vidi šta dobija/gubi (permisije, role, SLA, obavezna
   polja, klasifikaciju), a primjena je idempotentna.
4. **Sve što pack nosi je stvarno primijenjeno** na tiket/servis tokom rada, a ne samo zapisano u bazu.
5. **Ne može se zaobići RBAC**: pack ne smije dodijeliti SUPER_ADMIN ni permisiju koju rola po pravilima ne
   smije imati.

## 3. Preporučena implementacija `[MIŠLJENJE]`

- Zadržati postojeći obrazac (registry definicija → resolve target → plan → transakcija → audit → invalidacija);
  on je čitljiv i idempotentno napisan. Dodati, po prioritetu:
  1. **Proširiti definiciju pack-a** na ono što RAW traži: `slaProfileKey`, `requiredFieldKeys`,
     `classificationPolicy` (danas samo `defaultClassification`), `approvals` (danas samo `requiresApproval`) —
     i potrošače u ticket/service tokovima, inače polja ostaju mrtva.
  2. **Omogućiti dodjelu samo na servis** (DTO i UI), jer to RAW izričito dopušta.
  3. **Uvesti `unapply`/rebind** s diff-om i auditom; ako potpuni rollback nije moguć, prikazati šta ostaje i
     tražiti potvrdu.
  4. **Preview prije primjene** (isti obrazac kao `roles/:roleKey/permissions/preview`), povezan s validate
     rezultatom.
  5. **Postavke `private.policyPacks.*`** (enabled, defaultPacksJson, assignmentJson) ili svjesna odluka da
     definicije ostaju u kodu — ali onda to i zapisati u dokumentaciju.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Definicije i registar

- `policy-pack.constants.ts:1–15`: tri ključa (`PACK_IT_STANDARD`, `PACK_HR_RESTRICTED`,
  `PACK_FINANCE_RESTRICTED`), grant scopeovi `none`|`target`, lista default paketa.
- `policy-pack.registry.ts:14–92`: **IT Standard** — ADMIN i AGENT s punim default permisijama
  (`defaultRolePermissionKeys`), OU scope = target, servis = none, klasifikacija `INTERNAL`,
  `requiresApproval: false`; **HR Restricted** — AGENT s `ticket.attachments.upload/download`, OU i servis =
  target, `RESTRICTED`, `requiresApproval: true`; **Finance Restricted** — ADMIN (`audit.export`,
  `routing.write`, `sla.write`) i AGENT (attachments + `ticket.merge`), OU i servis = target, `CONFIDENTIAL`,
  `requiresApproval: true`.
- `policy-pack.types.ts:14–21`: `PolicyPackDefinition` nosi **samo** `key`, `name`, `description`,
  `defaultClassification`, `requiresApproval` i `grants` (roleKey, permissionKeys, OU scope, service scope).
  SLA profil, required fields i approvals pravila **nisu** dio definicije.
- `assert-policy-pack-definition.ts:29–71`: zabranjuje grant SUPER_ADMIN-a (`SUPER_ADMIN_GRANT_FORBIDDEN`),
  dozvoljava samo role USER/AGENT/ADMIN, provjerava da su scopeovi `none`/`target`, da nema duplih grantova i da
  je svaka permisija iz kataloga i **dozvoljena za tu rolu po `defaultRolePermissionKeys`**
  (`PERMISSION_NOT_ALLOWED_FOR_ROLE`).
- `PolicyPack` model (`backend/prisma/schema/identity.prisma:212–225`) ima i `slaProfileId` te relacije
  `organizationalUnits`/`services`; `ensure-policy-pack-catalog.ts:52–68` upisuje samo `defaultClassification` i
  `requiresApproval` — `slaProfileId` se **nikad ne postavlja**, a `defaultClassification`/`requiresApproval`
  **niko ne čita** van `list-policy-packs.ts:8–9`.

### 4.2 API i servis

- `policy-packs.controller.ts:28–69`: `@Controller('policy-packs')` sa `SessionAuthenticationGuard` na klasi;
  `GET /policy-packs` traži ADMIN + `settings.write`; `POST /policy-packs/validate` (označen
  `@AdminReadOperation`, dozvoljen i u read-only režimu) i `POST /policy-packs/apply` traže **ADMIN** +
  `settings.write` + `OuAccessGuard` + `@RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })`;
  `apply` prosljeđuje aktera i request ID u audit.
- `dto/apply-policy-pack.dto.ts:10–30`: `packKey` (obavezno), **`organizationalUnitId` obavezno**,
  `serviceId` opcionalno, `userIds` opcionalno (unikatni).
- `policy-packs.service.ts:24–49`: `list` (iz registra), `validate`, `apply` (uz invalidaciju pogođenih
  korisnika kroz `PrincipalContextInvalidator`).
- `resolve-policy-pack-apply-target.ts:13–59`: provjerava da pack postoji, da OU postoji i ima `ouPath`, da
  servis postoji i da **svi** `userIds` postoje (`UNKNOWN_USER`).
- `plan-policy-pack-apply.ts:20–88`: `packRequiresOrganizationalUnit`/`packRequiresService` izvode obaveznost iz
  grant scopeova (`MISSING_ORGANIZATIONAL_UNIT`, `MISSING_SERVICE`), a `planPolicyPackAssignments` za svakog
  korisnika gradi po jednu dodjelu za svaki grant (OU/servis scope prema `target`).
- `apply-policy-pack.ts:19–79`: u jednoj transakciji `ensurePolicyPackCatalog` (upsert packa, rola, permisija i
  `RolePermission`), `bindPolicyPackTargets`, `applyPolicyPackUserGrants`, pa audit `policyPackApply` s ključem
  paketa, servisom, OU-om i brojevima; **poslije** transakcije invalidira keš svakog pogođenog korisnika
  (`:73–77`).
- `apply-policy-pack-user-grants.ts:24–52`: idempotentno — postojeća dodjela (`userId`+`roleId`+OU+servis) se
  broji, nova se kreira; vraća `affectedUserIds`.
- `bind-policy-pack-targets.ts:10–22`: upisuje `policyPackId` na OU (uz `invalidateOrganizationalUnitScopeCache`)
  i na servis.
- `map-policy-pack-error.ts:9–39`: 11 kodova; `UNKNOWN_*` → 404, ostalo → 400 (`MISSING_SERVICE`, `UNKNOWN_USER`,
  `PERMISSION_NOT_ALLOWED_FOR_ROLE`, …).
- **Primjena je jednosmjerna**: ne postoji `DELETE`/`unapply`, niti kod koji bi uklonio `policyPackId` ili
  povukao dodijeljene role/permisije.

### 4.3 Frontend

- `pages/users-page.tsx:8,112` i `pages/admin-page.tsx:134`: panel **PolicyPacksPanel** se renderuje na vrhu taba
  **Korisnici i uloge** unutar ekrana **Administracija** (`<UsersPage embedded />`).
- `components/policy-packs/policy-packs-panel.tsx:20–28`: panel se prikazuje **samo** ako je sesija
  SuperAdmin (`isSuperAdmin === true || hasRole(SUPER_ADMIN)`), inače vraća `null`.
- `components/policy-packs/policy-pack-apply-form.tsx:29–48,118`: forma **Primijeni paket na OJ / servis** —
  `packKey` i `unitId` su obavezni (`:37`), `serviceId` je opcionalan; dugme **Primijeni paket** /
  **Primjena…**.
- `components/policy-packs/policy-pack-cards.tsx` + i18n `policyPacks.*`: kartice paketa s brojem dozvola i
  redom `{{role}} → {{count}} dozvola`; tekstovi tvrde **„Samo SuperAdmin“** (`forbiddenTitle/forbiddenBody`).

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Bundle: permisije/scopes + SLA + required fields + classification + approvals (`:294–295`) | Definicija i potrošači za sve dijelove | Radi **samo** permisije/scopes + dodjela rola; `defaultClassification`/`requiresApproval` se samo zapisuju, `slaProfileId` se ne postavlja, required fields ne postoje | **Djelimično** |
| Dodjela servisu **ili** OU (`:296`) | Oba načina, admin bira | OU je obavezan u DTO-u i UI-u; servis samo dodatno | **Odstupa** |
| Default paketi IT/HR/Finance (`:297–299`) | Tri default paketa | Postoje, s traženim ključevima i sadržajem permisija | **Implementirano** |
| Postavke `private.policyPacks.*` (`:670–672`) | enabled + defaultPacksJson + assignmentJson | Nijedan ključ ne postoji (`grep policyPacks` u `settings/setting-keys.ts` = 0); definicije su hardkodirane | **Nedostaje** |
| Uticaj na default konfiguraciju (`:985`) | SLA/required fields/classification/approvals reaguju na pack | Nema potrošača; pack danas mijenja samo role/permisije i `policyPackId` na OU/servisu | **Djelimično** |
| Preview prije aktivacije (`:230–232`) | Preview/diff prije primjene | Postoji `POST /policy-packs/validate` s `plannedAssignments`, ali `apply` ga ne zahtijeva i nema potvrde | **Djelimično** |
| Standardizacija i idempotencija | Ponovljena primjena ne pravi duplikate | Idempotentno (`apply-policy-pack-user-grants.ts:29–41`, `ensure-policy-pack-catalog.ts:83–97`), pokriveno `policy-packs.idempotency.spec.ts` | **Implementirano** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Dobra strana.** Lanac „definicija → provjera → plan → transakcija → audit → invalidacija“ je uzoran:
  definicije su provjerene prije primjene (`assert-policy-pack-definition.ts`), planiranje je čista funkcija
  (`plan-policy-pack-apply.ts:66–88`), primjena je idempotentna, a keš dozvola se invalidira **poslije** commit-a
  (`apply-policy-pack.ts:73–77`) — što je tačno mjesto gdje većina implementacija pogriješi.
- **Glavna zamjerka.** Paket je zamišljen kao *bundle konfiguracije*, a implementiran je kao *bundle permisija*.
  Polja koja obećavaju ostalo (`defaultClassification`, `requiresApproval`, `slaProfileId` u šemi) postoje, ali
  ih niko ne čita — što je gore od njihovog odsustva, jer izgledaju kao da rade.
- **Druga zamjerka.** Prezentacija („Samo SuperAdmin“) i backend (ADMIN + `settings.write`) ne govore isto; u
  kombinaciji s nalazom B1 iz §M4 trenutno se to ne vidi u praksi, ali će se vidjeti čim se permisije upišu.
- **Treća zamjerka.** Primjena je jednosmjerna. Za „standardizaciju između službi“ to je prihvatljivo na kratak
  rok, ali svaka greška (pogrešan pack, pogrešna OJ) ostaje trajno i zahtijeva ručno čišćenje dodjela.

## 7. Otkriveni bug-ovi i neusklađenosti

**B1 — `SREDNJE` — pack ne nosi SLA/required fields/classification/approvals koje RAW obećava.**
`PolicyPackDefinition` (`policy-pack.types.ts:14–21`) ima samo grants + dvije oznake; `PolicyPack` model ima
`slaProfileId` (`identity.prisma:219`) i relacije, ali `ensure-policy-pack-catalog.ts:52–68` ga ne postavlja, a
`defaultClassification`/`requiresApproval` se samo vraćaju na `GET /policy-packs`
(`list-policy-packs.ts:4–16`) — nigdje ih ne čita nijedan servis tiketa/SLA. **Uticaj:** administrator očekuje da
pack „podesi“ klasifikaciju i odobravanja (RAW `:295`, `:985`), a dobija samo role i permisije.
**Fix:** proširiti definiciju i uvesti potrošače (SLA profil pri kreiranju servisa/tiketa, required fields u
formama, approvals u toku odobrenja) ili skinuti polja iz modela i dokumentovati stvarni obim.

**B2 — `SREDNJE` — postavke `private.policyPacks.*` ne postoje; paketi su hardkodirani.**
RAW `:670–672` traži `enabled` (default true), `defaultPacksJson` i `assignmentJson`. `settings/setting-keys.ts`
ne sadrži nijedan `policyPacks` ključ (provjereno), a registar je fiksan
(`policy-pack.registry.ts:88–111`). **Uticaj:** ne može se isključiti modul, ni dodati paket bez izmjene koda i
deploya; mapiranje OU/service → pack postoji samo kao `policyPackId` u bazi (nije `assignmentJson` iz zadatka).
**Fix:** odluka (implementirati postavke ili dokumentovati da definicije ostaju u kodu) + vidljiv `enabled`
prekidač.

**B3 — `SREDNJE` — dodjela samo servisu nije moguća iako je RAW izričito dopušta.**
`dto/apply-policy-pack.dto.ts:15–17` čini `organizationalUnitId` obaveznim; UI zahtijeva `unitId`
(`policy-pack-apply-form.tsx:37`), dok domenski sloj dozvoljava `null`
(`policy-pack.types.ts:23–28`) i obaveznost izvodi iz grant scopeova (`plan-policy-pack-apply.ts:53–58`).
**Uticaj:** „policy pack se može dodijeliti servisu ili cijeloj OU (admin bira)“ (RAW `:296`) nije moguće
izvesti za servis bez OU-a. **Fix:** `organizationalUnitId` učiniti opcionalnim u DTO-u/UI-u i pustiti
`packRequires*` da odluči.

**B4 — `NISKO` — UI tvrdi da je primjena „Samo SuperAdmin“, API dozvoljava ADMIN-a.**
Panel se renderuje samo SuperAdminu (`policy-packs-panel.tsx:22–26`), a i18n tekst to ponavlja, dok
`policy-packs.controller.ts:51–52,60–62` traži rolu ADMIN + `settings.write`. **Uticaj:** nejasna politika; kad
se (po §M4 B1) upišu permisije, ADMIN će moći zvati `POST /policy-packs/apply` iako UI tvrdi suprotno.
**Fix:** uskladiti jedno s drugim (najvjerovatnije podići API na SUPER_ADMIN, jer paketi mijenjaju dozvole).

**B5 — `SREDNJE` — primjena paketa je nepovratna.**
Ne postoji `unapply`: `bind-policy-pack-targets.ts:10–22` samo upisuje `policyPackId`, a
`apply-policy-pack-user-grants.ts:42–49` kreira obične `UserRole` redove koji se ne razlikuju od ručnih; nema
audit akcije za povlačenje. **Uticaj:** pogrešno primijenjen paket (npr. na pogrešnu OJ) ostavlja dodijeljene
role i permisije zauvijek; jedini oporavak je ručno uklanjanje dodjela i permisiја po roli.
**Fix:** `POST /policy-packs/unapply` s istim plan/audit obrascima i jasnim ishodom.

**B6 — `NISKO` — `apply` ne zahtijeva prethodnu validaciju.**
`POST /policy-packs/validate` vraća `plannedAssignments` (`validate-policy-pack-apply.ts:9–24`), ali
`apply` prima isti DTO nezavisno od toga da li je validacija izvršena; nema preview potvrde ni diff-a u
odgovoru. **Uticaj:** klijent može primijeniti paket „naslijepo“; RAW-ov shadow-check duh (`:230–232`) nije
ispunjen za pakete. **Fix:** zahtijevati validaciju u istoj sesiji (token) ili barem vratiti plan u odgovoru
`validate` koji UI mora prikazati prije potvrde.

**Napomena (nije bug):** `PERMISSION_NOT_ALLOWED_FOR_ROLE` (`assert-policy-pack-definition.ts:60–70`) sprečava
da paket dodijeli roli permisiju koju ona nema po `defaultRolePermissionKeys`; to je dobra brana, ali znači i da
paket **ne može** biti jedini izvor novih dozvola — svaka nova permisija mora prvo ući u default mapping u kodu.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/` nije imao stranicu o policy paketima; `TEZE-ZA-DOKUMENTACIJU.md` nije imao
teze za njih. Postojeći tekstovi spominju „policy pack“ samo u kontekstu wizarda i SLA/klasifikacije
(`RAW_PROJECT.md:356`, `:985` — nije dio `user-guide`).

**Dodato:**
- `docs/user-guide/policy-paketi.md` — čemu služi, kome je namijenjen (SuperAdmin u UI-u), kako se dolazi
  (Administracija → **Korisnici** → panel **Paketi politika**), korak-po-korak (odabir paketa, OU, opcionalni
  servis, **Primijeni paket**), šta paket stvarno mijenja (role, permisije, `policyPackId`), tri default paketa,
  validacije i greške, poznata ograničenja (B1–B6) i veze na RBAC i korisnike.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T32** (paket dodjeljuje role i permisije scoped na ciljnu OJ/servis, uz
  idempotenciju i audit), **T33** (default paketi i šta oni stvarno nose — samo permisije), **T34** (primjena je
  jednosmjerna i ne postoji povlačenje), **T35** (paket ne može dodijeliti SUPER_ADMIN ni permisiju van
  default mappinga role).

**Ispravljeno:** ništa (tema nije bila dokumentovana).

**Ostaje otvoreno:** `[NEJASNO]` — da li je predviđeno da paket nosi SLA profil/required fields/approvals
(RAW `:295`) u ovoj fazi; polje `slaProfileId` u šemi postoji, ali nijedan tok ga ne koristi, pa nije jasno da li
je u pitanju nedovršen rad ili rezervisano mjesto.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **6 / 10** | Primjena tri default paketa radi ispravno i idempotentno, ali paket nosi samo permisije/role; SLA, required fields, klasifikacija i approvals iz zadatka nisu implementirani, a dodjela samo servisu nije moguća. |
| Kvalitet koda | **8 / 10** | Čista i dobro testirana podjela (plan/apply/validate/registry), korektna invalidacija keša poslije commit-a, konzistentno mapiranje grešaka. Gube bodovi zbog mrtvih polja u modelu i nedostatka reverzne operacije. |
| Sigurnost | **8 / 10** | Zabrana SUPER_ADMIN granta, allowlist permisija po roli, OU-scope guard na primjeni, audit s akterom i transparentnost. Umanjuju: B4 (UI/API politika) i B5 (nepovratnost bez traga o povlačenju). |

---

# M6 — Katalog usluga i dinamičke forme

## 1. Planirano u RAW projektnom zadatku

- **Service catalog + forme** (`RAW_PROJECT.md:32–46`): servis se bira iz kataloga (kategorije → servisi); svaki
  servis može imati svoju „smart“ formu definisanu kroz **schema** sa obaveznim poljima i validacijom; podržati
  **1:1 servis → form schema** i u MVP-u krenuti postepeno, ali model mora to podržavati od starta.
- **Form versioning** (`RAW_PROJECT.md:38–44`): svaka forma ima verziju; novi tiketi koriste najnoviju aktivnu
  verziju; stari tiketi zadržavaju referencu na verziju kojom su kreirani; admin aktivira novu verziju **bez
  migracije starih tiketa**. Schema evolucija: uklanjanje/rename polja ostavlja staru verziju dostupnom za
  prikaz/validaciju istorijskih tiketa; nova required polja važe samo za nove tikete; promjena tipa ide kroz novo
  polje; **UI rendering: detalji tiketa renderuju formu prema `formVersionRef` vezanom za tiket**.
- **Form data** (`RAW_PROJECT.md:45`): čuva se strukturalno (JSON) uz tiket radi analitike i automatizacija.
- **Katalog nije samo za IT** (`RAW_PROJECT.md:46`): isti mehanizam za finansije, kadrovsku, pravnu, nabavke.
- **Lifecycle** (`RAW_PROJECT.md:301–305`): `DRAFT` (vidljiv samo adminima) | `ACTIVE` (vidljiv korisnicima i
  može se birati pri kreiranju tiketa) | `DEPRECATED` (ne nudi se korisnicima, historijski tiketi ostaju).
- **Dostupnost i prekidi** (`RAW_PROJECT.md:47–49`: status `OPERATIONAL|DEGRADED|DOWN|MAINTENANCE` je
  informativan i **ne blokira** kreiranje tiketa; `RAW_PROJECT.md:1027–1029`: admin UI prikazuje status u listi,
  lifecycle u adminu, a deprecated se ne prikazuje korisnicima).
- **Postavke** (`RAW_PROJECT.md:567–572`): `private.ticket.forms.enabled` (default true),
  `private.ticket.forms.schemaRegistryJson` (secret, registry po serviceId), `requireStructuredFields`
  (default true), `versioning.enabled` (default true), `versioning.allowMultipleActiveVersions` (default false),
  `versioning.requireVersionOnTicket` (default true).
- **Smart required fields** (`RAW_PROJECT.md:284–287`, `1008–1009`): backend ne dozvoljava `RESOLVED/CLOSED` bez
  required polja (global + per-service), uz jasne greške.
- **Acceptance** (`RAW_PROJECT.md:912–916`): kategorije i servisi u DB i UI; forma schema-driven; **required
  polja se validiraju backendom**; structured form data uz tiket i može se filtrirati/izvještavati; validacija
  prema verziji forme vezanoj za tiket.
- **Onboarding** (`RAW_PROJECT.md:46`, `1039`): servis se konfiguriše kroz wizard (u M6 kontekstu: koraci koji
  postavljaju formu, routing, SLA i odobrenja prije aktivacije).
- **Config versioning** (`RAW_PROJECT.md:265–271`): promjene kataloga i formi ulaze u config verzije uz
  validaciju šeme forme (required polja, konzistentnost verzionisanja).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Forma je ugovor, ne samo UI.** Ono što piše u šemi važi i na serveru: tipovi, obaveznost, opsezi i pattern
   se provjeravaju pri kreiranju i izmjeni tiketa, pa su strukturirani podaci pouzdani za analitiku.
2. **Vidljivost prati lifecycle na serveru.** Filter „samo aktivne“ je pravilo po roli na API-ju, a ne opcija
   koju klijent može izostaviti.
3. **Aktivacija je provjerena.** Servis ne može postati `ACTIVE` bez aktivne forme (i bez routing pokrivenosti),
   pa „spremno za tikete“ znači stvarno spremno.
4. **Postavke imaju efekat.** Kad su forme isključene ili `requireVersionOnTicket` ugašen, kreiranje tiketa to
   poštuje umjesto da i dalje traži verziju forme.
5. **Historija se vidi u kontekstu.** Detalj tiketa renderuje polja po šemi vezanoj za tiket (labela, tip,
   opcije), a ne sirove JSON ključeve.
6. **Između kataloga i SLA/odobrenja nema rupe.** Ono što wizard može postaviti može i katalog (SLA profil,
   klasifikacija, odobrenje), uz isti change log s razlogom.

## 3. Preporučena implementacija `[MIŠLJENJE]`

- Zadržati postojeću strukturu (jedinične funkcije + service fasadе + konfiguracioni loader + change log). Dodati
  po prioritetu:
  1. **Serverski validator `formData`** iz iste šeme (funkcija tipa `validateFormValues(schema, values)`) i pozvati
     ga u `create-ticket`/`update-ticket`; koristiti je i pri resolve provjeri umjesto samo prisustva polja.
  2. **Server-side vidljivost po roli**: `listServices`/`getService` ne-admin rolama vraćaju samo `ACTIVE`
     (agentima i `DEPRECATED`), a `form`/`form/versions` rute provjeravaju lifecycle.
  3. **Tranzicija u ACTIVE** da zahtijeva aktivnu verziju forme (paralelno s routing coverage provjerom) ili da
     vraća upozorenje koje admin mora potvrditi.
  4. **Poštovati `private.ticket.forms.*`** u toku kreiranja tiketa (`enabled`, `requireVersionOnTicket`) i
     dokumentovati da `schemaRegistryJson` nije implementiran.
  5. **Detalj tiketa po verziji forme**: endpoint koji vraća šemu za `formVersionId` tiketa + render po tipu
     polja; iskoristiti postojeći `resolveTicketFormVersion`, ili ga ukloniti ako se ne koristi.
  6. **Proširiti formu kataloga** na `classification`, `isConfidentialDefault`, `autoAssignStrategy`,
     `policyPackId` i `slaProfileId`, uz `reason` u DTO-u i diff u change logu.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Model i kontrakti

- `backend/prisma/schema/catalog.prisma`: `ServiceCategory` (`:1–14`, samoreferentno drvo, `onDelete: Restrict`),
  `Service` (`:16–60`; `lifecycle` default `DRAFT`, `availability` default `OPERATIONAL`, `classification`,
  `requiresApproval`, `isConfidentialDefault`, `autoAssignStrategy`, `slaProfileId`, `policyPackId`,
  `categoryId onDelete: Restrict`), `ServiceDowntimeWindow` (`:62–77`, `onDelete: Cascade` s servisom),
  `FormVersion` (`:79–94`; `schema Json`, `status FormVersionStatus @default(DRAFT)`, `@@unique([serviceId, version])`),
  `ServiceOnboarding` (`:96+`).
- `service-catalog.constants.ts:4–34`: stanja `DRAFT|ACTIVE|DEPRECATED`, dozvoljeni prelazi
  `DRAFT→ACTIVE`, `ACTIVE→DEPRECATED`, `DEPRECATED→ACTIVE` (`:10–16`), default konfiguracija
  (`enabled: true`, `defaultStateOnCreate: 'DRAFT'`), maks. dužina naziva 128 i slug-a 64.
- `form-schema.constants.ts:1–23` i `form-schema.types.ts`: `schemaVersion = 1`; **9 tipova polja** (`text`,
  `textarea`, `number`, `boolean`, `select`, `multiselect`, `date`, `datetime`, `email`); identifikator polja
  `^[a-z][a-z0-9_]{0,63}$`; ograničenja: label 128, helpText 512, pattern 256, najviše 64 opcije i 64 polja.
- `service-forms.constants.ts:4–26`: statusi `DRAFT|ACTIVE|RETIRED`; default konfiguracija (`enabled`,
  `requireStructuredFields`, `versioningEnabled`, `allowMultipleActiveVersions: false`,
  `requireVersionOnTicket: true`); change-log entitet `service_form_version` i razlozi `form_create`,
  `form_version_create`, `form_version_update`, `form_version_activate`, `ticket_form_version_bind`.
- `service-catalog.error.ts` (29 kodova) i `service-forms.error.ts` (16 kodova) + mapiranja
  (`map-service-catalog-error.ts:11–77`: 404/409/503/400; `map-service-forms-error.ts:88–116`: 404/409/400).

### 4.2 API

- `services.controller.ts`: `@AdminConfigDomains('catalog')`, `SessionAuthenticationGuard` + `RoleGuard`,
  klasno `@RequireRoles(admin)`; `POST /services`, `PATCH /services/:id`, `POST /services/:id/lifecycle`,
  `DELETE /services/:id` traže `service.catalog.write` + `@RequireServiceScope({ field: 'serviceId' })`;
  `GET /services` i `GET /services/:id` imaju **metodno** `@RequireRoles(user, agent, admin, superAdmin)`
  (`catalog-ticket-create-read-roles.ts:3–8`), što nadjačava klasno pravilo
  (`read-authorization-requirements.ts:19–22`, `getAllAndOverride([handler, class])`).
- `service-forms.controller.ts`: `POST|GET /services/:id/form`, `POST /services/:id/form/versions`,
  `GET|PATCH /services/:id/form/versions/:ref`, `POST .../activate`; pisanje traži `service.forms.write` +
  service scope; čitanje traži `catalogTicketCreateReadRoles`.
- `service-availability.controller.ts`: `PATCH /services/:id/availability`, `GET|POST|PATCH|DELETE
  /services/:id/downtime-windows[...]` uz `service.availability.write`, i
  `GET /services/:id/ticket-creation-eligibility` za sve role.
- `service-categories.controller.ts`: klasno ADMIN; `GET` rute bez dodatne permisije, pisanje traži
  `service.catalog.write`.
- `service-onboarding.controller.ts`: `POST /services/onboarding`, `POST|GET /services/:id/onboarding`,
  `POST /services/:id/onboarding/finalize` i step rute (dva kontrolera za domenske i form korake).

### 4.3 Servisni sloj

- `service-catalog.service.ts:100–173`: `create` (lifecycle konfiguracija), `list`/`getById` (evaluacija
  dostupnosti + approvals konfiguracija), `update`, `transitionLifecycle` (uz `evaluateActivationCoverage` kad je
  cilj `ACTIVE` i routing servis je dostupan), `delete`; `execute()` prevodi `RoutingError` i
  `ServiceCatalogError` u HTTP.
- `create-service.ts:24–79`: normalizacija naziva/slug-a, provjera kategorije, policy paketa i jedinstvenosti
  slug-a, upis s `defaultStateOnCreate`, change log `create`; `update-service.ts:96–139`: mijenja naziv,
  kategoriju, klasifikaciju, `requiresApproval`, `isConfidentialDefault`, `autoAssignStrategy`, `policyPackId`
  (slug je nepromjenjiv jer ga DTO ne prima), change log `update` s `before/after` koji sadrže **samo**
  `name`, `categoryId`, `slug` (`:126–136`).
- `transition-service-lifecycle.ts:114–158`: provjera prelaza + upis + change log `lifecycle_transition`; vraća
  `warnings` s routing coverage napomenom. **Ne provjerava postojanje aktivne forme.**
- `delete-service.ts:56–98`: samo `DRAFT`; blokira brisanje ako postoje tiketi, verzije forme, routing pravila
  ili dodjele rola (`HAS_DEPENDENCIES`).
- `list-services.ts:13–46`: `findMany` po lifecycle/kategoriji, pa `loadServiceDowntimeWindowsForServices`,
  `countOpenTicketsByService` (statusi `RESOLVED|CLOSED|ARCHIVED` nisu „otvoreni“), `loadOpenIncidentImpacts`;
  `offeredOnly` je **opt-in** filter (`:42–45`) koji koristi klijent.
- `to-service-response.ts:196–241`: `runtimeAvailability` (stored + downtime + incident impact),
  `offeredToRequesters` = `lifecycle === 'ACTIVE'`, `approvalSteps` 0|1 iz approvals konfiguracije, broj
  otvorenih tiketa.
- `evaluate-service-runtime-availability.ts:48–80`: računa stanje i efektivnu dostupnost iz prozora prekida
  (`autoSetMaintenanceStatus`), `ticketCreationAllowed` je uvijek `true` (RAW odluka: non-blocking).
- `service-availability.service.ts:26–60`: `updateAvailability` (uz `normalizeChangeReason`, koji baca
  `REASON_REQUIRED` kad konfiguracija traži razlog), `listDowntimeWindows`, `create/update/deleteDowntimeWindow`
  i `evaluateTicketCreationEligibility`.

### 4.4 Forme i verzionisanje

- `parse-form-schema.ts:11–32`: plain objekat, poznati ključevi, `schemaVersion === 1`, max 64 polja,
  `parseFormField` po polju, jedinstveni `id` i jedinstveni `order`, sortiranje po `order`.
- `parse-form-field.ts` + `parse-form-field-validation.ts:14–105`: labela obavezna i ≤128, `required` boolean,
  `order` cijeli ≥0; validacija se provjerava po tipu (tekstualni: `minLength|maxLength|pattern`; broj:
  `min|max|integer`; `select`: samo `options`; `multiselect`: `options|minItems|maxItems`; ostali bez validacije),
  rasponi `min ≤ max`, opcije obavezne za `select`/`multiselect` (jedinstvene vrijednosti, ≤64).
- `create-service-form.ts:24–57`: `assertServiceFormsEnabled`, servis mora postojati, druga forma se odbija
  (`FORM_ALREADY_EXISTS`), kreira verziju 1 u statusu `DRAFT`, change log `form_create`.
- `create-service-form-version.ts:120–140`: `assertFormVersioningEnabled`, zahtijeva postojeću formu
  (`FORM_NOT_FOUND` ako nema verzija), kreira `DRAFT` s `version + 1`, change log `form_version_create`.
- `update-service-form-version.ts:26–56`: dozvoljeno samo dok je verzija `DRAFT` i bez tiketa
  (`is-form-version-immutable.ts:32–37`: `status !== 'DRAFT' || ticketCount > 0`), change log
  `form_version_update`.
- `activate-service-form-version.ts:57–97`: samo `DRAFT` (`FORM_VERSION_NOT_DRAFT`), u transakciji penzioniše
  prethodne `ACTIVE` u `RETIRED` osim ako je `allowMultipleActiveVersions`, change log `form_version_activate`.
- `select-active-form-version-ref.ts:4–17`: `findFirst({ where: { serviceId, status: 'ACTIVE' }, orderBy: { version: 'desc' } })`,
  inače `NO_ACTIVE_FORM_VERSION`.
- `load-form-version.ts:18–28`: provjerava pripadnost servisu (`FORM_VERSION_SERVICE_MISMATCH`).
- `get-service-form.ts`/`to-service-form-response.ts` i `get-service-form-version.ts`: čitanje forme s listom
  verzija i `isImmutable`.

### 4.5 Tiketi: kreiranje, validacija, prikaz

- `create-ticket.ts:110–114`: `loadOfferedService` (usluga mora biti dostupna korisnicima) pa
  `resolveCreateFormVersionRef`; `:196,199`: upis `formData` i `formVersionId`.
- `resolve-create-form-version-ref.ts:7–32`: bez `formVersionRef` bira aktivnu verziju (`selectActiveFormVersionRef`),
  s proslijeđenim ref-om učitava verziju i traži `status === 'ACTIVE'` (`FORM_VERSION_NOT_ACTIVE`); mapira
  greške u `FORM_VERSION_REQUIRED`, `FORM_VERSION_NOT_FOUND`, `FORM_VERSION_SERVICE_MISMATCH`.
- `to-ticket-form-data-input.ts:3–8`: **cast** proizvoljne vrijednosti u `Prisma.InputJsonValue`; `formData?: Record<string, unknown>`
  u `create-ticket.dto.ts:49` i `update-ticket.dto.ts:43` bez dodatnih ograničenja; `update-ticket.ts:115–116,166`
  dozvoljava zamjenu `formData` bez validacije.
- Required polja: `apply-ticket-resolution.ts:34–52` poziva `collect-missing-required-fields.ts`, koje na
  prelasku u `RESOLVED/CLOSED` provjerava close code, resolution note, `globalRequiredOnResolve` +
  `byService[serviceId]` i — ako je `enforceSchemaRequiredFields` — `required` polja iz šeme vezane za tiket
  (`read-form-schema-fields.ts:4–10`, greška `REQUIRED_FIELDS_MISSING` s listom polja).
- `ServiceFormsService.bindTicketFormVersionRef` (`service-forms.service.ts:119–132`) i
  `resolveTicketFormVersion` (`:134–136`): jedini pozivi su u `service-forms.*.spec.ts`; nijedan kontroler ni
  tickets modul ih ne koristi (grep kroz `backend/src` bez spec fajlova: samo definicije i fasadne metode).
- Prikaz: `ticket-detail-page.tsx:424` prosljeđuje `<TicketFormDataView formData={ticket.formData} />`, a
  `ticket-form-data-view.tsx:8–31` ispisuje `Object.entries(formData)` kao parove **sirovih ključeva** i
  `String(value)` (bez šeme, labela i tipova); broj verzije forme se prikazuje u zaglavlju/sidebaru tiketa
  (`ticket-detail-header.tsx:138–144`, `ticket-detail-sidebar.tsx:63–71`).

### 4.6 Onboarding wizard

- `service-onboarding.constants.ts:7–28`: koraci `SERVICE → FORM → ROUTING → SLA → APPROVALS`; statusi
  `IN_PROGRESS|READY_FOR_FINALIZATION|COMPLETED|ABANDONED`; konfiguracija (`enabled`, `requireValidationBeforeActivate`,
  `autoFillRoutingEnabled`, `autoFillRoutingRequireConfirm`).
- `finalize-service-onboarding.ts:37–94`: zahtijeva `DRAFT`, skuplja validacijske probleme svih koraka
  (`FINAL_VALIDATION_FAILED` + upis problema), traži routing coverage, validira SLA referencu i approvals, pa u
  transakciji postavlja `lifecycle: 'ACTIVE'`, **`slaProfileId`** i `requiresApproval` (`:106–113`), piše change
  logove i prelazi u `COMPLETED`.
- `validate-onboarding-steps.ts:85–108`: FORM korak zahtijeva `formVersionRef` koji postoji i ima status `ACTIVE`
  (`INVALID_FORM_VERSION_REF`).

### 4.7 Frontend

- `pages/services-page.tsx:77–208`: naslov **Katalog usluga**, tabovi **Katalog**/**Grupe usluga**, dugmad
  **Onboarding čarobnjak** i **Nova usluga**, grid kartica, read-only banner, sheets za formu, izmjenu, prekide,
  grupe i kategorije; `resolveCatalogWriteFlags` + `useAdminModuleReadOnly` određuju šta je omogućeno.
- `service-catalog-mutation-form.tsx:14–135`: polja **Naziv**, **Slug** (samo pri kreiranju), **Kategorija**,
  prekidač **Zahtijeva odobrenje**, obavezno polje **Razlog izmjene**; `submit` šalje samo naziv, slug, kategoriju
  i `requiresApproval` (`:57–62`), a sheet ih prosleđuje API-ju bez razloga
  (`service-catalog-mutation-sheet.tsx:82–95`).
- `service-catalog-api.ts:53–64`: `CreateServiceInput`/`UpdateServiceInput` sadrže samo `name`, `slug`,
  `categoryId`, `requiresApproval`; `listOfferedServices()` koristi `?offeredOnly=true`.
- `use-service-catalog.ts:30–44`: `listServices()` + `getServiceForm(id)` za svaku uslugu (uz `staleTime` 5 min).
- `components/services/form-builder/*`: **Kreiraj formu** (šalje `defaultServiceFormSchema` s poljem
  `dodatne_informacije`, `default-service-form-schema.ts:6–18`), editor polja (`form-field-editor.tsx`),
  lista polja, **Verzije forme**, akcije **Sačuvaj nacrt**, **Aktiviraj verziju**, **Nova verzija iz odabrane**.
- `components/tickets/create-ticket-form.tsx:85–136`: dohvat forme za servis, `validateServiceFormData` iz
  `lib/tickets/validate-service-form.ts` (klijentska validacija: required, min/max, `integer`, `email` sadrži
  `@`, `pattern` preko `new RegExp`, min/max stavki za multiselect), pa KB presretanje i pregled.
- `components/tickets/service-form-fields.tsx:32–162`: render po tipu (checkbox za boolean, textarea, select,
  input s `number|email|date|datetime-local`), a11y atributi i sažetak grešaka.
- i18n: `services.*` (80 ključeva na bs), `tickets.form.required|invalid` (**„Ovo polje je obavezno.“**,
  **„Vrijednost nije ispravna.“**), `tickets.errorFormVersionMissing` (poruka da usluga nema aktivnu formu),
  `tickets.detail.formData|formVersion|formVersionFixed`.

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Servis se bira iz kataloga (kategorije → servisi) | drvo kategorija + lista servisa | `ServiceCategory` drvo s parent provjerama; `GET /services` s filterima lifecycle/kategorija/`offeredOnly` | **Implementirano** |
| Svaki servis ima „smart“ formu (schema, obavezna polja, validacija) | validacija šeme i **vrijednosti** na serveru | šema se validira pri pisanju; vrijednosti se **ne** validiraju na serveru (B1) | **Djelimično** |
| 1:1 servis → form schema | jedna forma po servisu | `createServiceForm` odbija drugu formu (`FORM_ALREADY_EXISTS`); verzije su 1:N | **Implementirano** |
| Form versioning (najnovija aktivna za nove tikete, referenca na tiketu) | kako piše u RAW-u | `selectActiveFormVersionRef` + `Ticket.formVersionId`; tiket čuva referencu; aktivacija penzioniše staru verziju | **Implementirano** |
| Schema evolucija + prikaz istorijskih tiketa prema `formVersionRef` | detalj tiketa renderuje po šemi te verzije | stara verzija se čuva, ali detalj prikazuje sirove ključeve JSON-a (B5) | **Djelimično** |
| Structured form data za analitiku | upis uz validaciju | zapis postoji, ali sadržaj je neprovjeren JSON proizvoljnog oblika (B1) | **Djelimično** |
| Lifecycle `DRAFT` vidljiv samo adminima | serverska provjera po roli | tranzicije ispravne, ali `GET /services` bez `offeredOnly` vraća i nacrte svakom korisniku (B2) | **Odstupa** |
| Status servisa i downtime ne blokiraju tikete | informativno, non-blocking | `runtimeAvailability` + prozori; `ticketCreationAllowed: true`; `REASON_REQUIRED` za izmjene po postavci | **Implementirano** |
| Postavke `private.ticket.forms.*` | `enabled` i `requireVersionOnTicket` upravljaju tokom tiketa | ključevi postoje, ali te dvije postavke ne utiču na kreiranje tiketa; `schemaRegistryJson` ne postoji | **Odstupa** |
| Smart required fields (global + per-service) | blokada resolve/close | `collect-missing-required-fields` + `REQUIRED_FIELDS_MISSING` s listom polja | **Implementirano** |
| Onboarding wizard do aktivacije servisa | provjere svih koraka prije `ACTIVE` | 5 koraka; finalize provjerava formu/routing/SLA/approvals i postavlja `ACTIVE` + `slaProfileId` | **Implementirano** |
| Katalog i forme u config verzijama | snapshot/rollback | `collect-config-snapshot.ts` uključuje servise i `formVersion` zapise | **Implementirano** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Dobra strana.** Modul je najbolje strukturiran dio aplikacije do sada: parseri šeme su čiste funkcije s
  preciznim kodovima grešaka, verzionisanje je stvarno implementirano (a ne samo nagoviješteno), lifecycle i
  dostupnost su razdvojeni, a onboarding wizard ima pravu serversku validaciju koraka i transakcioni finalize.
  Test pokrivenost je ozbiljna (20 spec fajlova u `service-catalog/`, 7 u `service-onboarding/`, e2e
  `01-ticket-create` prolazi katalog → formu → KB → pregled).
- **Glavna zamjerka.** Validacija forme postoji na dva mjesta i nijedno nije server: šema se provjerava pri
  pisanju (dobro), a vrijednosti samo u browseru (`validate-service-form.ts`). Time obećanje iz RAW-a („required
  polja se validiraju backendom“, `:914`) i svrha strukturiranih podataka padaju na klijenta.
- **Druga zamjerka.** Vidljivost `DRAFT` usluga je stvar discipline klijenta, ne serverskog pravila; to je isti
  obrazac kao B2 iz §M4 (dozvola postoji, ali je presudno ko je zove).
- **Treća zamjerka.** Dvije postavke iz RAW-a (`enabled`, `requireVersionOnTicket`) su deklarativno prisutne, a
  funkcionalno mrtve u toku tiketa, dok se `schemaRegistryJson` uopšte ne pominje u kodu — dokumentacija zato
  mora jasno reći šta od postavki stvarno radi.
- **Četvrta zamjerka.** Mrtvi kod (`bindTicketFormVersionRef`, `resolveTicketFormVersion`) i nedovršen prikaz
  forme u detalju tiketa su dvije strane istog nedostatka: veza „tiket ↔ verzija forme“ postoji u modelu, ali se
  ne koristi dalje od upisa `formVersionId`.

## 7. Otkriveni bug-ovi i neusklađenosti

**B1 — `SREDNJE` — server ne validira `formData` prema šemi forme.** `create-ticket.ts:196` i
`update-ticket.ts:166` upisuju vrijednost kroz `toTicketFormDataInput` (`to-ticket-form-data-input.ts:3–8`), koji
je samo cast u `Prisma.InputJsonValue`; DTO prima `Record<string, unknown>` bez ograničenja
(`create-ticket.dto.ts:49`, `update-ticket.dto.ts:43`). Serverska provjera postoji **samo** za prisustvo required
polja i to na prelasku u `RESOLVED/CLOSED` (`collect-missing-required-fields.ts:56–63` preko
`apply-ticket-resolution.ts:38–52`). **Uticaj:** klijent može poslati nepoznata polja, pogrešne tipove ili
vrijednosti izvan opsega; strukturirani podaci u izvještajima nisu pouzdani, a zahtjev iz RAW-a `:914` nije
ispunjen. **Fix:** serverski validator iz šeme (tip, `required`, `min/max`, `pattern`, opcije, stavke) u
create/update toku, uz iste kodove grešaka kao na klijentu.

**B2 — `SREDNJE` — `DRAFT` usluge i njihove forme vidljive su svakom prijavljenom korisniku preko API-ja.**
`services.controller.ts:59–70` i `service-forms.controller.ts:64–94` metodno dozvoljavaju role
`USER|AGENT|ADMIN|SUPER_ADMIN`, a `read-authorization-requirements.ts:19–22` koristi
`getAllAndOverride([handler, class])`, pa metodno pravilo nadjačava klasno `@RequireRoles(admin)`.
`list-services.ts:19–25` filtrira samo po eksplicitnim parametrima — `offeredOnly` je opt-in
(`:42–45`), a `GET /services/:id` i `GET /services/:id/form` ne provjeravaju lifecycle. **Uticaj:** svaki
korisnik može enumerisati nacrte (naziv, slug, broj otvorenih tiketa) i preuzeti kompletne šeme formi usluga
koje još nisu objavljene, suprotno RAW-u `:304` („DRAFT: vidljiv samo adminima“); UI to ne prikazuje, ali API
dozvoljava. **Fix:** serverski filter po roli (ne-admin vidi `ACTIVE`, agent i `DEPRECATED`), uz provjeru
lifecycle-a na `form` rutama.

**B3 — `SREDNJE` — servis se može aktivirati bez aktivne verzije forme.** `transition-service-lifecycle.ts:114–158`
provjerava samo dozvoljeni prelaz i (opciono) routing pokrivenost; nema provjere forme. **Uticaj:** poslije
`POST /services/:id/lifecycle` s `ACTIVE` usluga je vidljiva korisnicima („Dostupna korisnicima: Da“, badge
„Spremna za tikete“), a kreiranje tiketa za nju pada s `FORM_VERSION_REQUIRED`
(`resolve-create-form-version-ref.ts:42–44`) i porukom „Odabrana usluga nema aktivnu verziju forme…“.
Onboarding to sprečava (`validate-onboarding-steps.ts:85–108`), ručna aktivacija ne. **Fix:** pri prelazu u
`ACTIVE` zahtijevati aktivnu verziju forme (ili vratiti upozorenje kao za routing).

**B4 — `SREDNJE` — postavke formi ne utiču na kreiranje tiketa.** `private.ticket.forms.enabled` čita se samo u
`assertServiceFormsEnabled` (`assert-service-forms-enabled.ts:4–10`), koga zovu isključivo operacije pisanja forme
(`create-service-form.ts:31`, `create-service-form-version.ts:30`, `update-service-form-version.ts:34`,
`activate-service-form-version.ts:27`); `resolve-create-form-version-ref.ts` ne učitava konfiguraciju, pa tiket i
dalje traži aktivnu verziju i kad su forme ugašene. `versioning.requireVersionOnTicket` čita se **samo** u
`bind-ticket-form-version-ref.ts:28`, a taj put nema pozivaoca van spec-ova. **Uticaj:** administrator ne može
isključiti obaveznost forme kroz postavku; dokumentovano ponašanje i kod se razilaze. **Fix:** učitati
konfiguraciju u create toku i poštovati `enabled`/`requireVersionOnTicket`.

**B5 — `SREDNJE` — detalj tiketa ne renderuje formu prema vezanoj verziji; pripadajuće metode su mrtve.**
RAW `:43–44` traži prikaz prema `formVersionRef`. Stvarno: `ticket-detail-page.tsx:424` prosljeđuje samo
`ticket.formData`, a `ticket-form-data-view.tsx:8–31` prikazuje sirove ključeve i `String(value)` bez labela,
tipova i opcija. `ServiceFormsService.bindTicketFormVersionRef`/`resolveTicketFormVersion`
(`service-forms.service.ts:119–136`) nemaju nijednog pozivaoca izvan `service-forms.*.spec.ts`. **Uticaj:**
korisnik vidi `dodatne_informacije: …` umjesto „Dodatne informacije“, multiselect kao spojen tekst, a istorijski
tiketi se ne mogu prikazati po svojoj verziji forme; mrtvi kod održava iluziju da taj tok postoji. **Fix:** ruta
`GET /tickets/:ticketId/form` koja vraća šemu verzije s tiketa i render po tipu polja, ili uklanjanje mrtvih
metoda i eksplicitno ograničenje u dokumentaciji.

**B6 — `NISKO` — change log izmjene usluge ne bilježi razlog ni sva promijenjena polja.**
`service-catalog-mutation-form.tsx:48–63` traži „Razlog izmjene“ (dugme je blokirano bez njega), ali vrijednost
se ne šalje (`service-catalog-mutation-sheet.tsx:82–95`, `service-catalog-api.ts:53–64`), a DTO je ne prima
(`create-service.dto.ts`, `update-service.dto.ts`); `update-service.ts:113–136` uz to bilježi `diff` sa samo
`name`, `categoryId`, `slug` iako mijenja i klasifikaciju, `requiresApproval`, `isConfidentialDefault`,
`autoAssignStrategy` i `policyPackId`. **Uticaj:** za razliku od dostupnosti i prekida (gdje `reason` postoji),
promjene kataloga u change logu nemaju razlog, a promjena osjetljivih polja (npr. `isConfidentialDefault`) nije
dokaziva iz diff-a. **Fix:** primiti `reason` (uz `forbidNonWhitelisted` ga dodati u DTO) i bilježiti puni diff.
i18n to i priznaje („Backend change log trenutno bilježi sistemski razlog“).

**B7 — `NISKO` — UI kataloga ne može postaviti klasifikaciju, confidential default, strategiju dodjele, policy
paket ni SLA profil.** Backend DTO prima `classification`, `isConfidentialDefault`, `autoAssignStrategy` i
`policyPackId` (`create-service.dto.ts:31–51`, `update-service.dto.ts:28–48`), ali forma i API klijent šalju
samo četiri polja (`service-catalog-mutation-form.tsx:14–19`, `service-catalog-api.ts:53–64`); `slaProfileId`
nema ni u jednom DTO-u — postavlja ga isključivo onboarding finalize (`finalize-service-onboarding.ts:106–113`)
i config-versioning snapshot. **Uticaj:** usluge nastale van wizarda ostaju `INTERNAL`, bez SLA profila i bez
strategije dodjele, iako backend to podržava. **Fix:** proširiti formu i tipove; dodati SLA u katalog ili jasno
dokumentovati da SLA ide samo kroz wizard.

**B8 — `NISKO` — `SLUG_IMMUTABLE` je mrtav kod.** Kod postoji u `service-catalog.error.ts:17` i mapira se u
poruku (`map-service-catalog-error.ts:43`), ali ga nijedna funkcija ne baca (grep kroz `service-catalog/` bez
spec-ova: samo definicija i poruka); slug se mijenja onemogućavanjem polja u UI-u i izostavljanjem iz
`UpdateServiceDto`. **Uticaj:** mala, ali stvara utisak da postoji serverska zaštita koju treba testirati.
**Fix:** ukloniti kod ili ga baciti u `updateService` ako se `slug` ipak pojavi u tijelu zahtjeva.

**B9 — `NISKO` — N+1 učitavanje kataloga.** `use-service-catalog.ts:31–44` poziva `listServices()` i zatim
`getServiceForm(id)` za svaku uslugu (uz `staleTime` 5 min), a svaki od tih poziva radi vlastite upite nad
verzijama forme (`to-service-form-response.ts`). **Uticaj:** vrijeme učitavanja i broj zahtjeva rastu linearno s
katalogom, što je u suprotnosti s NFR-om (<300 ms, RAW `:172`). **Fix:** vratiti `activeFormVersionRef`/broj
verzija u `ServiceResponse` ili dodati batch rutu.

**Napomena (nije bug):** ekran kataloga u uvodu piše „Nacrt → Aktivan → **Zastarjelo**“, dok značka lifecycle-a
koristi „**Ukinuta**“ (`services.intro` vs `services.lifecycle.DEPRECATED` u `bs/common.json`). Terminološka
neusklađenost u prevodu, ne u ponašanju.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/` nije imao stranicu o katalogu usluga ni formama; `TEZE-ZA-DOKUMENTACIJU.md`
nije imao teze za ovaj modul. Postojeće stranice dodiruju temu samo posredno (`promjene.md` spominje prekide
kroz promjene, `precice-i-pristupacnost.md` prečice).

**Dodato:**
- `docs/user-guide/katalog-usluga-i-forme.md` — čemu služi, kome je namijenjen (ADMIN/SUPER_ADMIN za uređivanje,
  svi za prijavu tiketa), kako se dolazi (**Usluge i znanje → Usluge** ili putanja ekrana), korak-po-korak
  (grupe usluga, nova usluga, forma i verzije, aktivacija, onboarding čarobnjak, zakazivanje prekida), tabele
  polja/validacija i statusa s tačnim nazivima iz UI-a, česta pitanja i greške, poznata ograničenja (B1–B7) i
  povezani moduli.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T36** (lifecycle i vidljivost), **T37** (jedna forma po servisu + verzionisanje
  i nepromjenjivost), **T38** (šema forme: tipovi i ograničenja; validacija šeme na serveru, validacija
  vrijednosti samo na klijentu), **T39** (required polja pri resolve/close), **T40** (onboarding čarobnjak i šta
  finalize postavlja), **T41** (status i prekidi ne blokiraju prijavu tiketa).

**Ispravljeno:** ništa (modul nije bio dokumentovan).

**Ostaje otvoreno:** `[NEJASNO]` — `private.ticket.forms.schemaRegistryJson` (RAW `:567`) ne postoji u kodu ni u
`setting-keys.ts`; nije jasno da li je registry zamišljen kao alternativa koloni `FormVersion.schema` ili kao
keš. Do odgovora dokumentacija ne spominje tu postavku.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **7 / 10** | Katalog, forme, verzionisanje, lifecycle, dostupnost/prekidi i onboarding wizard rade i pokriveni su testovima; padaju serverska validacija vrijednosti forme, vidljivost nacrta po roli, aktivacija bez forme i dvije postavke bez efekta. |
| Kvalitet koda | **8 / 10** | Parser i validacija šeme su uzorni, transakcije i change log konzistentni, greške precizne. Umanjuju: mrtav kod (`bindTicketFormVersionRef`/`resolveTicketFormVersion`, `SLUG_IMMUTABLE`), nepotpun diff u change logu i N+1 na ekranu kataloga. |
| Sigurnost | **7 / 10** | Role + permisije + service scope + read-only režim + audit pokrivaju sve rute, a confidential/approval polja se ne mogu slučajno promijeniti. Umanjuju: B2 (nacrti i šeme vidljivi svakom korisniku) i B1 (proizvoljan JSON u podacima tiketa). |
