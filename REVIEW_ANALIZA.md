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
| 1 | M1 Instalacija · M2 Prijava/MFA · M3 Korisnici/OJ/grupe · M4 RBAC · M5 Policy paketi | M1 ✅ · M2 ✅ · ostali u toku |

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
