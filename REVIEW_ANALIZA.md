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
| 2 | M6 Katalog usluga i forme · M7 Routing i prioritet · M8 Tiketi · M9 Odobrenja/CSAT · M10 SLA | M6 ✅ · M7 ✅ · M8 ✅ · M9 ✅ · M10 u toku |

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

# M7 — Usmjeravanje i prioritet

## 1. Planirano u RAW projektnom zadatku

- **Routing po (origin_unit + service_type) preko DB pravila:** „Kritično: automatski routing tiketa na osnovu
  (origin_unit + service_type) preko DB-driven routing pravila“ (`RAW_PROJECT.md:63`); u istom bloku: tiket se
  inicijalno dodjeljuje **handler grupi**, ne pojedincu (`:56–58`).
- **Priority (impact/urgency) matrica:** korisnik bira impact i urgency, sistem predlaže
  `LOW|MEDIUM|HIGH|CRITICAL`, Admin/SuperAdmin podešava pravila, agent/admin može override **uz audit**
  (`RAW_PROJECT.md:59–62`).
- **SLA baseline po prioritetu** kao rezerva kad servis nema svoj override (`RAW_PROJECT.md:99–102`).
- **Bulk priority update** (Admin/SuperAdmin, obavezno obrazloženje, audit) (`RAW_PROJECT.md:151`).
- **Permisije i OU scope:** `routing.write` (`:190`, `:207`, `:209`), OU scope npr. „`routing.write` samo za
  OU=Podružnica Zenica“ (`:226`), cross-OU uz audit (`:219`).
- **Config verzije:** scopes uključuju `routing` (`:265`, `:650`), dry-run validacija uključuje „routing coverage
  check + fallback pravila“ (`:269–270`), shadow mode za nova routing pravila (`:274–276`).
- **Bottleneck dashboard:** `UNROUTED` među stanjima gdje tiketi „stoje“, breakdown po OU / service / priority
  (`RAW_PROJECT.md:281–282`).
- **Onboarding wizard:** koraci „servis → forma → routing → SLA profil → approvals → availability“ (`:353`),
  wizard predlaže default routing target grupu i fallback **uz obaveznu potvrdu admina** i upozorava ako servis
  nema routing coverage (`:356–357`).
- **Postavke:** `private.ticket.routing.fallbackGroupId` (`:494`), `private.ticket.routing.requireCoverage`
  (`:495`), `private.ticket.priorityMatrix.enabled|impactOptionsCsv|urgencyOptionsCsv|rulesJson` (`:496–499`),
  `private.ticket.unroutedQueue.enabled|ownerRole|targetGroupId|cleanupSlaHours` (`:554–557`),
  `private.services.onboardingWizard.autoFillRouting.enabled|requireConfirm` (`:620–621`),
  `private.routing.strictOuIsolation` (`:724`), `private.changeLog.routing.enabled` (`:726`).
- **Read-only moduli:** routing je među modulima koje admin može privremeno zaključati (`:678`, `:307`).
- **Realtime:** `ticket.updated` (status/priority/assignment) i `routing.rules.updated` za admine
  (`RAW_PROJECT.md:743`, `:749`).
- **Baza znanja (stubovi):** članci `ticket-priority-impact-urgency-matrix`, `routing-rules`,
  `routing-fallback-and-coverage` (`RAW_PROJECT.md:777–779`).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Jedan deterministički izvor odluke.** Rutanje mora biti čista funkcija ulaza (origin OU + servis) — bez
   slučajnosti i bez stanja; svaki potrošač (kreiranje, preview, tester, coverage, konfiguraciona validacija)
   mora zvati isti motor. U kodu je to zaista tako (`resolveTicketRouting` je jedina tačka odluke).
2. **Tiket se nikad ne izgubi.** Kad nema pravila, ishod je eksplicitan (`UNROUTED` red ili konfigurisana ciljna
   grupa), a ne „tiho“ dodijeljena grupa. Kod to ispunjava kroz dvije grane.
3. **Odluka je objašnjiva.** Uz rezoluciju idu `fallbackDepth`, `fallbackPath`, `matchedRuleId`, pa admin u
   testeru vidi **zašto** je tiket otišao baš toj grupi — kod to ispunjava.
4. **Prioritet je izveden, ne prepisan.** Matrica je podatak (admin je mijenja), override je izuzetak s
   obaveznim razlogom i auditom, a povratak na matricu je eksplicitna akcija — kod to ispunjava, ali bez
   mogućnosti da se matrica isključi.
5. **Promjena je provjerena prije primjene.** Pokrivenost se mjeri prije aktivacije, a konfiguraciona verzija se
   validira bez side-effecta — kod to ispunjava na nivou servisa i snapshot validacije.
6. **„Neusmjereno“ ima jedno značenje.** U zrelom sistemu isti pojam („unrouted“) ne smije značiti dva različita
   skupa tiketa na dva ekrana; kod trenutno ima dvije definicije (status `UNROUTED` vs. preusmjereno u ciljnu
   grupu).

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Prvo uskladiti pojam „neusmjereno“** (nalaz B4): tab „Neusmjereni red“ i brojači treba da koriste isti
   `buildUnroutedOverdueWhere`-porodični filter ili jasno razdvoje „bez pravila“ i „preusmjereno u ciljnu grupu“.
2. **Uvesti filtere u matricu pokrivanja** (B1): `lifecycle` usluge, opseg OU-a i paginacija; matrica je jedini
   ekran koji raste kao `OU × usluga`.
3. **Uključiti preview rutanja u ekran za prijavu** (B3) — ruta postoji i poštuje iste kapije; korisnik treba da
   vidi upozorenje prije slanja, kao što RAW traži.
4. **Odlučiti sudbinu dvije mrtve/postavke bez potrošača** (B2, B5): ili ih čitati, ili ih ukloniti iz registra i
   dokumentovati odluku (`private.ticket.routing.fallbackGroupId`, `private.routing.strictOuIsolation` su već
   namjerno izostavljene i pokrivene spec-om `routing-dead-settings.spec.ts`).
5. **Ujediniti izračun prioriteta na jednom mjestu** (B8): server vraća prioritet u preview-u, klijent ne
   duplira pragove.
6. **Dodati filtere na serveru za pravila i change log** (B6): čitanje pravila je danas admin-only bez OU scope
   oznake i bez filtera po OU/servisu.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Model i kontrakti

- `RoutingRule`: `id`, `originUnitId`, `serviceId`, `groupId`, relacije s `onDelete: Restrict`, jedinstven par
  `@@unique([originUnitId, serviceId])`, indeksi po `serviceId` i `groupId`
  (`backend/prisma/schema/catalog.prisma:116–130`).
- `PriorityMatrixRule`: `impact`, `urgency`, `priority`, `@@unique([impact, urgency])`
  (`backend/prisma/schema/catalog.prisma:132–141`).
- Tiket nosi `status TicketStatus @default(PENDING)` (`backend/prisma/schema/ticketing.prisma:8`), `priority`,
  `impact`, `urgency` (`:9–11`), `routedByUnroutedFallback` (`:38`), `unroutedWarnedAt` (`:40`),
  `priorityOverridden|priorityOverriddenAt|priorityOverriddenById` (`:43–46`).
- Statusi uključuju `UNROUTED` (`backend/prisma/schema/enums.prisma:9–19`); ose prioriteta su
  `LOW|MEDIUM|HIGH|CRITICAL` (`enums.prisma:28–40`); strategije auto-dodjele `NONE|LEAST_BUSY|ROUND_ROBIN`
  (`enums.prisma:135–139`).
- Tipovi: `RoutingConfiguration { unroutedQueueEnabled, unroutedQueueOwnerRole, requireCoverage }`
  (`routing.types.ts:7–11`), `RoutingResolution { outcome, groupId, matchedRuleId, matchedOriginUnitId,
  fallbackDepth, fallbackPath, unroutedQueue }` (`:64–74`), `RoutingCoverageItem` (`:93–100`).
- Ishod: `EXACT | PARENT_FALLBACK | UNROUTED` (`routing.constants.ts:1–5`); kod za blokadu pokrivenosti
  `ROUTING_COVERAGE_MISSING` (`:15`); defaulti `unroutedQueueEnabled: true`, `ownerRole: 'SUPER_ADMIN'`,
  `requireCoverage: true` (`:9–13`).

### 4.2 API

- `RoutingController` (`@Controller('routing')`, `SessionAuthenticationGuard` + `RoleGuard`, rola ADMIN na
  nivou kontrolera, `ValidationPipe` s `whitelist`/`forbidNonWhitelisted`): `routing.controller.ts:46–56`.
  - `POST /routing/rules` (`:60–71`), `PATCH /routing/rules/:ruleId` (`:73–85`),
    `DELETE /routing/rules/:ruleId` (`:87–99`) — svi traže `permissionKeys.routingWrite`,
    `@RequireOrganizationalUnitScope({ field: 'originUnitId' })` i `@RequireServiceScope({ field: 'serviceId' })`.
  - `GET /routing/rules/:ruleId/delete-impact` (`:101–106`), `GET …/changes` (`:108–113`), `GET /routing/changes`
    (`:115–118`), `GET /routing/groups` (`:120–123`), `GET /routing/rules` (`:125–130`),
    `GET /routing/resolve` (`:132–137`, s OU i service scope lokatorom), `GET /routing/coverage` (`:139–144`) —
    **bez** `@RequirePermissions` i **bez** OU scope oznake (osim `resolve`).
- DTO (`dto/routing.dto.ts`): `CreateRoutingRuleDto` (`:4–21`), `UpdateRoutingRuleDto` (`:23–40`),
  `DeleteRoutingRuleDto` (`:42–55`) — svi nose obavezan `reason` uz `@MinLength(1)` i
  `@MaxLength(maximumChangeReasonLength)`; `ListRoutingRulesQueryDto` (`:57–67`) prima samo
  `originUnitId`/`serviceId`; `ResolveRoutingQueryDto` (`:69–77`) traži oba polja; `ListRoutingCoverageQueryDto`
  (`:79+`) prima iste opcione filtere.
- Prioritetna matrica je izložena iz SLA modula: `PriorityMatrixController` (`@Controller('priority-matrix')`) —
  `GET /priority-matrix` dopušten svim rolama (`user|agent|admin|superAdmin`,
  `sla/priority-matrix.controller.ts:40–49`), `GET /priority-matrix/changes` traži rolu ADMIN (`:51–55`),
  a `PATCH /priority-matrix` traži rolu ADMIN **i** `permissionKeys.slaWrite` (`:57–68`).
- Tiketi: `POST /tickets/routing-preview` vraća `TicketRoutingPreview { outcome, groupName, fallbackDepth,
  autoAssign, approvalSteps, slaProfileName }` bez internih id-eva
  (`tickets/routing-preview/routing-preview.types.ts:4–13`, `tickets.controller.ts:62–72`).

### 4.3 Servisni sloj (rutanje)

- `RoutingService` objedinjuje sve operacije i prevodi greške (`mapRoutingError`) — `routing.service.ts:44–236`.
- **Rezolucija:** `resolveTicketRouting` prvo provjerava da servis postoji (`SERVICE_NOT_FOUND`), učitava
  pretke OU-a (`loadOrganizationalUnitAncestors`), čita pravila tog servisa čiji je `originUnitId` u lancu
  predaka i gradi mapu `ruleByOrigin` (`resolve-ticket-routing.ts:11–47`).
  `resolveFromAncestorChain` hoda lanac od OU-a do korijena: prvi pogodak je `EXACT` na dubini 0, inače
  `PARENT_FALLBACK` s `fallbackDepth` i `fallbackPath`; bez pogotka vraća `UNROUTED` s opisom reda
  (`:49–89`).
- **Pokrivenost:** `computeRoutingCoverage` učitava **sve** OU-e, **sve** servise i **sva** pravila, pa gradi
  `OU × servis` stavke s `hasExactRule` i punom rezolucijom (`compute-routing-coverage.ts:12–54`); nema filtera
  po lifecycleu servisa ni paginacije.
- **Aktivacija:** `evaluateServiceRoutingCoverage` + `assertOrWarnActivationRoutingCoverage` bacaju
  `ROUTING_COVERAGE_MISSING` kad `requireCoverage` i nema pravila, inače vraćaju kod kao meko upozorenje
  (`evaluate-service-routing-coverage.ts:12–34`); poziv je vezan na prelaz u `ACTIVE`
  (`service-catalog/service-catalog.service.ts:154–155`).
- **Izmjene su transakcione i logovane:** create/update/delete rade u `$transaction`, uz
  `buildRoutingChangeSnapshot` prije/poslije i `recordChangeLog` s `reason` i `actorUserId`
  (`persist-routing-rule-change.ts:20–59`, `update-routing-rule.ts:21–79`, `delete-routing-rule.ts:59–94`);
  `buildChangeLogDiff` nosi `action`, `resourceType`, `resourceId` (`:49–55`).
- **Validacije meta:** `assertRoutingTargetsExist` provjerava OU/servis/grupu
  (`assert-routing-targets-exist.ts:4–35`), a `isDuplicateRoutingRuleConstraint` prepoznaje P2002 na paru
  (`:37–48`); `assertRoutingRuleScope` sprječava izmjenu tuđeg pravila (`assert-routing-rule-scope.ts:4–20`);
  `readRequiredRoutingReason` prevodi `ChangeLogError` u `REASON_REQUIRED` (`read-required-routing-reason.ts:8–20`).
- **UNROUTED ciljna grupa:** `resolveUnroutedTargetGroupId` čita postavku i provjerava da grupa još postoji
  (`routing.service.ts:157–178`, `routing-configuration.loader.ts:33–45`).
- **Onboarding:** `suggestOnboardingReference`/`acceptsOnboardingReference` daju i provjeravaju referencu
  (`routing-onboarding-support.ts:7–33`), a provider je vezuje na onboarding korak
  (`service-onboarding/persisted-onboarding-routing.provider.ts:16–39`).

### 4.4 Prioritet

- Matrica: `resolveTicketPriority` čita `PriorityMatrixRule` za par (impact, urgency); ako ćelija ne postoji,
  koristi formulu `calculateTicketPriority` (score = rang(impact) + rang(urgency), granice ≤2 LOW, ≤4 MEDIUM,
  ≤6 HIGH, inače CRITICAL) — `resolve-ticket-priority.ts:22–34`, `calculate-ticket-priority.ts:8–23`,
  `tickets.constants.ts:42–47`.
- Sadržaj matrice: `GET /priority-matrix` lijeno dopunjava nedostajuće ćelije (`upsert` po ćeliji) i vraća sve
  ćelije (`sla/list-priority-matrix.ts:24–50`, `sla/default-priority-matrix.ts:18–26`); `PATCH` prvo odbija
  duple ćelije (`DUPLICATE_PRIORITY_MATRIX_CELL`), pa u transakciji mijenja ćelije i bilježi SLA change log sa
  razlogom i before/after stanjem (`sla/patch-priority-matrix.ts:30–60`), a snapshot to prenosi u konfiguracionu
  verziju (`config-versioning/collect-config-snapshot.ts:36`, `apply-sla-snapshot.ts:103`).
- Pri kreiranju tiketa prioritet se izvodi iz matrice (`tickets/create-ticket.ts:181–185`).
- Pri izmjeni: matrica se primjenjuje **samo** ako su impact ili urgency promijenjeni i prioritet nije ručno
  postavljen (`update-ticket.ts:139–146`, zatim `:162–164`).
- Override: `POST /tickets/:id/priority` zahtijeva `ticket.priority.override` i staff pristup
  (`priority/override-ticket-priority.ts:60–66`), obavezan razlog (`:68–75`), upisuje `priorityOverridden` /
  `priorityOverriddenAt` / `priorityOverriddenById` ili resetuje na matricu (`:80–95`), piše change log
  (`:96–104`), audit s `from`/`to`/`resetToMatrix`/`reason` (`:105–117`), system event (`:118–125`) i ponovo
  računa SLA tajmere ako se prioritet promijenio (`:128–134`).

### 4.5 UNROUTED tok

- Pri kreiranju: rezolucija ide kroz `applyCreateTicketRouting`; `UNROUTED` ili `groupId === null` vodi u
  ciljnu grupu (status `PENDING`, `routedByUnroutedFallback: true`) ili ostaje `UNROUTED` ako ciljne grupe
  nema (`apply-create-ticket-routing.ts:7–37`); eksplicitno zadana grupa pobjeđuje fallback
  (`create-ticket.ts:116–130`).
- Rok i obuhvat: `buildUnroutedOverdueWhere` pokriva `status = UNROUTED` **i**, kad je ciljna grupa
  konfigurisana, `PENDING` tikete te grupe bez dodijeljenog agenta; `unroutedCutoff` računa rok iz
  `cleanupSlaHours` (`unrouted/build-unrouted-overdue-where.ts:8–26`).
- Sweep: svakih 15 minuta u slotu `:02` (`0 2,17,32,47 * * * *`), serija do 200 tiketa, 2 pokušaja, timeout 5
  min (`unrouted/unrouted-sweep.job.constants.ts:6–18`); šalje jedno upozorenje po tiketu i ponedjeljak-08:00
  digest u zoni `Europe/Sarajevo`, s dedupe ključevima
  (`unrouted/unrouted-sweep.service.ts:40–95`, `sendDigest` na `:97`, `isDigestSlot` na `:190`).
- Brojači i filteri: `TicketCounts.unrouted` (`counts/counts.types.ts:22`), `unroutedOverdue` +
  `unroutedCleanupHours` (`:29–32`); lista podržava `unroutedOverdue` (`list/list-tickets.types.ts:39–44`,
  `list/build-ticket-list-filters.ts:81–88`); bottleneck dashboard broji `status::text = 'UNROUTED'`
  (`reports/bottleneck/sql-bottleneck-dashboard-store.ts:50`).

### 4.6 Konfiguracija, verzionisanje i realtime

- Registrovane postavke rutanja: `unroutedQueue.enabled|ownerRole|targetGroupId|cleanupSlaHours|weeklyDigest` i
  `routing.requireCoverage` (`settings/setting-keys.ts:103–108`,
  `settings/definitions/ticket-routing-settings.ts:7–60`), uz validaciju 0–168 za `cleanupSlaHours` (`:41–45`).
- Namjerno **neregistrovane** postavke iz RAW-a: `private.ticket.routing.fallbackGroupId` i
  `private.routing.strictOuIsolation` — spec ih eksplicitno zabranjuje i navodi samo „žive“ ključeve
  (`settings/routing-dead-settings.spec.ts:7–33`).
- Loader rutanja je strog (bilo koja neispravna vrijednost ⇒ `RoutingError('UNAVAILABLE')`,
  `routing-configuration.loader.ts:12–31`, `parse-routing-configuration.ts:5–...`), dok je loader UNROUTED reda
  tolerantan i pada na defaulte (`unrouted/unrouted-queue-configuration.loader.ts:9–53`).
- Konfiguracione verzije: routing ulazi u snapshot i validaciju; `validate-routing-snapshot.ts:57–58` blokira
  snapshot koji bi ostavio neusmjerene tikete bez uključenog reda.
- Realtime: kontroleri rutanja i matricem su označeni `@AdminConfigDomains('routing')` odnosno `('sla')`, pa
  svaki uspješan mutirajući zahtjev šalje adminima `admin.config.updated { domain }`
  (`common/admin-realtime/admin-config-domain.decorator.ts:7–16`, `admin-config-realtime.types.ts:2`).
- Read-only režim: routing je među modulima koje je moguće zaključati (`setting-keys.ts`, `private.readOnlyMode.modulesCsv`).

### 4.7 Frontend

- Stranica `routing-page.tsx` ima četiri taba — **Matrica pokrivanja**, **Test rezolucije**, **Pravila**,
  **Change log** (`pages/routing-page.tsx:37–72`); dolazak s linka `?originUnitId=…&serviceId=…` otvara tab
  Pravila s popunjenim poljima (`:15–23`).
- Matrica: `RoutingCoveragePanel` + `RoutingCoverageTable`/`Cell`/`Tooltip`, statistika „exact · naslijeđeno ·
  neusmjereno“ i legenda (`i18n bs common.json → routing.coverageStats|legend*`); prazno stanje nudi unos
  pravila (`routing.coverageEmpty*`).
- Tester: `RoutingResolutionTester` poziva `GET /routing/resolve` i prikazuje ishod, grupu, dubinu i putanju
  fallbacka (`components/routing/routing-resolution-tester.tsx:16–24`; `routing-api.ts:69–76`), uz napomenu da
  rutanje nikad ne dodjeljuje agenta (`routing.testerNote`).
- Pravila: tabela + forme za create/edit i dijalog za brisanje s prikazom „prije → poslije“ rezolucije
  (`components/routing/routing-rules-*.tsx`, `create-routing-rule-form.tsx`, `edit-routing-rule-form.tsx`,
  `delete-routing-rule-dialog.tsx`); razlog je obavezan (`routing.reasonHint`), duplikat se najavljuje
  (`routing.duplicateWarning`).
- Change log: `routing-change-log-tab.tsx`/`routing-change-log-panel.tsx` prikazuju polje/prije/poslije i
  nepoznatog aktera (`routing.changeUnknownActor`).
- Prioritet: matrica se uređuje na SLA ekranu (`components/sla/priority-matrix-panel.tsx:28–60, 148`), a u
  detalju tiketa postoji panel za ručni override s obaveznim razlogom i dugmetom za povratak na matricu
  (`components/tickets/ticket-priority-panel.tsx:25–127`); klijentska formula je preslikana
  (`lib/tickets/calculate-ticket-priority.ts:3–25`, `lib/tickets/lookup-ticket-priority.ts:5–17`).
- UNROUTED u UI-u: tab „Neusmjereni red“ u grupnim tiketima (`lib/tickets/inbox-view-tabs.ts:39–56`), učitava
  se upitom `status: "UNROUTED"` (`lib/tickets/use-ticket-list.ts:135–140`), baner i brojač na listi
  (`components/tickets/ticket-inbox-unrouted-banner.tsx`), bedž u detalju i prečica „Kreiraj pravilo za ovu
  kombinaciju“ koja vodi na `/routing?…` (`components/tickets/ticket-detail-sidebar.tsx:45–51, 77–84, 152–160`),
  te baner na nadzornoj ploči (`components/dashboard/dashboard-inbox-snapshot.tsx:34–96`).
- E2E pokriva: rutanje u grupu i `UNROUTED` ishod (`e2e/tests/02-routing-fallback.spec.ts:12–42`), override
  prioriteta (`13-priority-merge.spec.ts:22–57`), ciljnu grupu, prečicu do pravila i realtime do admin sobe
  (`15-workflow-unrouted-realtime.spec.ts:60–100`).

## 5. Gap analiza

| # | Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|---|
| 1 | DB-driven pravilo po (origin OU + servis) (`:63`) | jedno pravilo po paru, jedinstveno | `RoutingRule @@unique([originUnitId, serviceId])`, `DUPLICATE_RULE` na P2002 | Implementirano |
| 2 | Fallback kad nema matcha (`:494`) | konfigurisana fallback grupa ili eksplicitan red | `unroutedQueue.targetGroupId`; `fallbackGroupId` namjerno nije registrovan | Implementirano (drugi naziv) |
| 3 | Parent fallback i objašnjivost odluke (`:63`, idealno) | exact → parent → rupa, s putanjom | `EXACT`/`PARENT_FALLBACK`/`UNROUTED`, `fallbackDepth`, `fallbackPath`, `matchedRuleId` | Implementirano |
| 4 | `requireCoverage` blokira aktivaciju (`:495`) | blokada bez pokrića | `ROUTING_COVERAGE_MISSING` na prelazu u ACTIVE, inače meko upozorenje | Implementirano |
| 5 | Coverage provjera u config verziji (`:269–270`) | validacija bez side-effecta | `validate-routing-snapshot.ts:57–58` | Implementirano |
| 6 | Matrica pokrivanja za admine (`:269`, UI) | prikaz rupa po OU × usluga | matrica s 4 taba i statistikom; bez filtera/paginacije, uključuje neaktivne usluge | Djelimično (B1) |
| 7 | Priority matrica koju admin podešava (`:59–61`, `:496–499`) | podesiva matrica + `enabled` prekidač + definisane ose | tabela `PriorityMatrixRule` + PATCH, lijeni seed; nema `private.ticket.priorityMatrix.*`; ose su LOW…CRITICAL umjesto `self/team/unit/company` | Djelimično (B5) |
| 8 | Override prioriteta uz audit (`:62`) | razlog + audit + SLA preračun | `POST /tickets/:id/priority` s razlogom, auditom, system eventom i SLA tajmerima | Implementirano |
| 9 | UNROUTED red, vlasnik, rok, digest (`:281`, `:554–557`) | first-class red + upozorenja | status `UNROUTED`, `targetGroupId`, `ownerRole`, `cleanupSlaHours`, `weeklyDigest`, sweep svakih 15 min | Implementirano |
| 10 | Upozorenje korisniku prije slanja (`:356–357`) | preview ishoda rutanja | `POST /tickets/routing-preview` postoji, frontend ga ne poziva | Djelimično (B3) |
| 11 | Wizard predlaže routing referencu uz potvrdu (`:620–621`) | predlog + obavezna potvrda | `suggestOnboardingReference`/`acceptsOnboardingReference` + provider | Implementirano |
| 12 | Postavka change loga za routing (`:726`) | prekidač zapisa | ključ registrovan, nema potrošača; zapis je uvijek uključen | Odstupa (B2) |
| 13 | OU scope za `routing.write` (`:226`) | scope na svim rutama | create/update/delete/resolve imaju lokator; GET rute nemaju | Djelimično (B6) |
| 14 | `strictOuIsolation` (`:724`) | enforce OU izolacije | namjerno neregistrovan; spec ga zabranjuje | Odstupa (dokumentovano) |
| 15 | Realtime `routing.rules.updated` (`:749`) | obavijest adminima | `admin.config.updated { domain: 'routing' }` preko interceptorа | Implementirano (drugi naziv) |
| 16 | Bulk priority update (`:151`) | bulk izmjena uz obrazloženje | nije predmet ovog modula (M8 — tiketi) | Van opsega M7 |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

Kod rutanja je najdisciplinovaniji dio koji sam do sada pregledao: odluka je jedna čista funkcija, ishod je
uvijek eksplicitan, a svaka izmjena pravila je transakciona i ostavlja before/after snapshot u change logu.
Dvije stvari posebno valja istaći: (1) `resolveFromAncestorChain` je odvojen od pristupa bazi, pa je testiranje
trivijalno i ponašanje determinističko; (2) `computeRoutingRuleDeleteImpact` unaprijed pokazuje šta bi se
dogodilo s rezolucijom — to je rijedak i koristan detalj.

Slabosti su na ivicama: matrica pokrivanja nema filtere i raste kao `OU × usluga`, a ne uključuje status
usluge; „neusmjereno“ znači dva različita skupa na dva ekrana; preview rutanja je implementiran ali nije
povezan s ekranom za prijavu; dvije postavke postoje bez potrošača (jedna od njih namjerno). Formula prioriteta
je duplirana na klijentu, što je klasičan izvor tihog razilaženja.

„Miris“ koda je mali i lokalizovan: `resolveUnroutedTargetGroupId` provjerava da li metoda postoji na sopstvenom
loaderu (odbrambeni `typeof`) — vjerovatno zbog test-double-a, ali u produkcijskom kodu zbunjuje.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Matrica pokrivanja bez filtera i bez statusa usluge

- **Fajl/linija:** `backend/src/modules/routing/compute-routing-coverage.ts:17–27` (`prisma.service.findMany({
  select: { id, name } })` bez `where`), `:33–52` (dvostruka petlja servis × OU); `frontend/src/services/routing-api.ts:61–63`
  (`listRoutingCoverage()` bez parametara).
- **Opis:** matrica učitava **sve** usluge (uključujući `DRAFT` i `DEPRECATED`) i **sve** OU-e i vraća
  `servis × OU` stavke u jednom odgovoru, bez paginacije; klijent ne šalje ni `originUnitId` ni `serviceId`
  iako ih API podržava.
- **Uticaj:** „rupe“ u pokriću uključuju usluge koje korisnici ne mogu izabrati, pa se prave rupe gube u šumu;
  na 300 OU × 150 usluga to je 45.000 redova u jednom JSON odgovoru.
- **Fix:** filtrirati aktivne usluge (ili vratiti kolonu statusa), dodati server-side filtere i paginaciju.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — `private.changeLog.routing.enabled` je registrovana, ali je niko ne čita

- **Fajl/linija:** `backend/src/modules/settings/setting-keys.ts:209`,
  `backend/src/modules/settings/definitions/change-log-settings.ts:16`; zapis se izvodi bez provjere u
  `backend/src/modules/routing/persist-routing-rule-change.ts:44–56`, `update-routing-rule.ts:64–76`,
  `delete-routing-rule.ts:79–91`.
- **Opis:** RAW (`:726`) traži prekidač „change log za routing pravila (default true)“, ali nijedan potrošač ne
  čita ključ; svaka izmjena pravila se uvijek bilježi.
- **Uticaj:** admin koji isključi zapis ne dobija nikakvu promjenu ponašanja — tiha neusklađenost postavke i
  stvarnog rada.
- **Fix:** čitati postavku u tri mutacije prije `recordChangeLog` ili ukloniti ključ i dokumentovati odluku.
- **Ozbiljnost:** SREDNJE.

### B3 — SREDNJE — Preview rutanja postoji, ali ga ekran za prijavu ne koristi

- **Fajl/linija:** `backend/src/modules/tickets/routing-preview/preview-ticket-routing.ts:15–59`,
  `backend/src/modules/tickets/tickets.controller.ts:62–72`; u `frontend/src` nema nijednog poziva
  (`routingPreview`/`routing-preview` — nula pogodaka).
- **Opis:** ruta `POST /tickets/routing-preview` vraća ishod, ime grupe, dubinu fallbacka, auto-dodjelu, broj
  koraka odobrenja i SLA profil bez internih id-eva i uz iste kapije kao kreiranje, ali je UI ne poziva.
- **Uticaj:** korisnik prije slanja ne vidi da će tiket pasti u `UNROUTED`/ciljnu grupu, iako su i RAW
  (`:356–357`) i postojeći API to predviđali.
- **Fix:** pozvati preview na koraku pregleda u `create-ticket-form`/`create-ticket-review-view`.
- **Ozbiljnost:** SREDNJE.

### B4 — SREDNJE — „Neusmjereno“ znači dva različita skupa tiketa

- **Fajl/linija:** `backend/src/modules/tickets/counts/counts.types.ts:22` (broj `unrouted`),
  `backend/src/modules/reports/bottleneck/sql-bottleneck-dashboard-store.ts:50` (`status::text = 'UNROUTED'`),
  nasuprot `backend/src/modules/tickets/unrouted/build-unrouted-overdue-where.ts:12–21` (uključuje i
  `PENDING` + `routedByUnroutedFallback`) i `frontend/src/lib/tickets/use-ticket-list.ts:135–140` (tab učitava
  samo `status: "UNROUTED"`).
- **Opis:** tiket preusmjeren u `unroutedQueue.targetGroupId` ima status `PENDING` i oznaku
  „Bez pravila rutiranja“ (`frontend/src/components/tickets/ticket-detail-sidebar.tsx:47, 82`), ali se **ne**
  pojavljuje u tabu „Neusmjereni red“ niti u brojaču `unrouted`; pojavljuje se samo u `unroutedOverdue`
  filtrima i upozorenjima.
- **Uticaj:** admin može zaključiti da je UNROUTED red prazan dok tiketi bez pravila stoje u ciljnoj grupi;
  dva ekrana daju različite brojeve za isti pojam.
- **Fix:** uskladiti definicije (tab prikazuje oba skupa uz jasne oznake) ili preimenovati brojače.
- **Ozbiljnost:** SREDNJE.

### B5 — NISKO — Postavke `private.ticket.priorityMatrix.*` ne postoje, a ose se razlikuju od RAW-a

- **Fajl/linija:** `backend/src/modules/settings/setting-keys.ts` (nema nijednog `priorityMatrix` ključa);
  `backend/src/modules/tickets/resolve-ticket-priority.ts:26–34` (uvijek čita tabelu, fallback na formulu);
  `backend/prisma/schema/enums.prisma:28–40` (`TicketImpact`/`TicketUrgency` = `LOW|MEDIUM|HIGH|CRITICAL`).
- **Opis:** RAW (`:496–499`) traži `enabled`, CSV liste osa i `rulesJson`; u kodu je matrica tabela bez
  prekidača, a ose su numeričke umjesto `self,team,unit,company` / `low,medium,high`.
- **Uticaj:** matrica se ne može isključiti; očekivanja iz RAW-a o osama nisu ispunjena (kod je sam sa sobom
  konzistentan, uključujući validaciju i snapshot).
- **Fix:** dodati `enabled` postavku ili dokumentovati odluku o osama i odsustvu prekidača.
- **Ozbiljnost:** NISKO.

### B6 — NISKO — Čitanje rutanja nije vezano na permisiju ni OU scope

- **Fajl/linija:** `backend/src/modules/routing/routing.controller.ts:46–49` (rola ADMIN na nivou kontrolera),
  `:60–99` (mutacije imaju `routingWrite` + OU + service scope), `:101–144` (GET rute bez permisije i bez
  OU scope lokatora, osim `resolve` na `:132–137`).
- **Opis:** `delete-impact`, `changes`, `groups`, `rules` i `coverage` traže samo rolu ADMIN; admin bez
  `routing.write` (ili s OU ograničenjem) vidi sva pravila, interne id-jeve i punu matricu pokrivanja.
- **Uticaj:** ograničen — pristup je i dalje admin-only i read-only — ali ruši model „permisija + OU scope“ koji
  je ostatak modula usvojio.
- **Fix:** dodati permisiju za čitanje i primijeniti OU scope na listama (ili dokumentovati izuzetak).
- **Ozbiljnost:** NISKO.

### B7 — NISKO — `resolveUnroutedTargetGroupId` radi „duck-typing“ na sopstvenom loaderu

- **Fajl/linija:** `backend/src/modules/routing/routing.service.ts:162–169` (`as Partial<RoutingConfigurationLoader>`
  i `typeof loader.loadUnroutedTargetGroupId !== 'function'`), dok metoda postoji na loaderu
  (`routing-configuration.loader.ts:33–45`).
- **Opis:** umjesto direktnog poziva, servis provjerava da li metoda postoji i poziva je preko `call`.
- **Uticaj:** skriva greške u DI-ju i čita se kao mrtva grana; nema funkcionalne posljedice.
- **Fix:** pozvati `this.configurationLoader.loadUnroutedTargetGroupId()` direktno.
- **Ozbiljnost:** NISKO.

### B8 — NISKO — Duplirana formula prioriteta (backend i frontend)

- **Fajl/linija:** `frontend/src/lib/tickets/calculate-ticket-priority.ts:3–25` (komentar „Same score bands“)
  nasuprot `backend/src/modules/tickets/calculate-ticket-priority.ts:8–23` i
  `backend/src/modules/tickets/tickets.constants.ts:42–47`.
- **Opis:** pragovi i rangovi postoje na dva mjesta; klijent ih koristi kad matrica nije dostupna
  (`frontend/src/lib/tickets/lookup-ticket-priority.ts:5–17`).
- **Uticaj:** promjena pragova na jednom mjestu tiho razilazi prikaz i server.
- **Fix:** vratiti prioritet u preview-u/kreiranju i koristiti ga na klijentu, ili generisati dijeljeni modul.
- **Ozbiljnost:** NISKO.

### B9 — NISKO — `GET /priority-matrix` upisuje u bazu

- **Fajl/linija:** `backend/src/modules/sla/list-priority-matrix.ts:34–50` (`upsert` nedostajućih ćelija unutar
  GET operacije).
- **Opis:** čitanje matrice lijeno „seeduje“ tabelu; prvi GET je write.
- **Uticaj:** GET nije bez side-effecta (zaključavanje redova, iznenađenje u read-only kontekstu i pri
  snapshotima); skup je 16 redova pa je stvarni rizik mali.
- **Fix:** seedovati matricu instalacijom/migracijom, a GET ostaviti čistim.
- **Ozbiljnost:** NISKO.

**Napomena o terminu:** u kodu se koristi `UNROUTED` (status) i `routedByUnroutedFallback` (oznaka). U
dokumentaciji i UI-u srpski izraz treba biti dosljedan: „neusmjereno“ za `UNROUTED`, a „preusmjereno u ciljnu
grupu“ za fallback granu — vidi B4.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/*` (14 stranica) i `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` — nijedan
dokument ne pokriva rutanje ni prioritet; jedini spomen je u `docs/user-guide/prosljedjivanje-tiketa.md`.

**Dodato (M7):**

- `docs/user-guide/usmjeravanje-i-prioritet.md` — nova stranica: čemu služi, kome je namijenjen (tabela rola),
  kako se dolazi (**Usmjeravanje**), korak-po-korak (pravilo, matrica pokrivanja, test rezolucije, change log,
  prioritet i override), tabele polja/statusa/validacija s tačnim nazivima iz UI-a, česta pitanja i poruke
  grešaka, poznata ograničenja (B1–B6) i povezani moduli.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T42–T47**: rutanje kao deterministička odluka (exact → parent → rupa);
  pravila i validacije (jedinstven par, obavezan razlog, before/after); matrica pokrivanja i `requireCoverage`;
  UNROUTED red (vlasnik, rok, digest, ciljna grupa); prioritet (matrica, override, audit, SLA preračun);
  konfiguracija i verzionisanje rutanja.

**Ostaje otvoreno:** RAW-ova postavka `private.ticket.priorityMatrix.impactOptionsCsv/urgencyOptionsCsv`
(`RAW_PROJECT.md:497–498`) opisuje ose koje u kodu ne postoje; do odluke (dodati ih ili odbaciti) dokumentacija
navodi samo stvarne ose `Nizak…Kritičan`.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **8 / 10** | Rutanje, parent fallback, pokrivenost, UNROUTED red sa sweep-om i digestom, matrica prioriteta, override s auditom i SLA preračunom — sve radi i pokriveno je testovima (uklj. tri e2e scenarija). Umanjuju: matrica bez filtera (B1), preview koji UI ne koristi (B3) i dvostruko značenje „neusmjereno“ (B4). |
| Kvalitet koda | **8 / 10** | Jedna tačka odluke, čiste funkcije za rezoluciju, transakcione izmjene s before/after snapshotom, precizne greške i dosljedni loaderi. Umanjuju: mrtva postavka (B2), duplirana formula (B8), `typeof` provjera na sopstvenom loaderu (B7) i GET koji upisuje (B9). |
| Sigurnost | **8 / 10** | Mutacije su trostruko zaštićene (rola + `routing.write` + OU/servis scope), svaka izmjena je auditovana kroz change log s razlogom i akterom, tiket nikad ne završi bez grupe ili s pogrešnom grupom. Umanjuje: čitanje ruta bez permisije i OU scope-a (B6) i nedostatak `enabled` prekidača za matricu (B5). |

# M8 — Tiketi

## 1. Planirano u RAW projektnom zadatku

- **Kreiranje i statusi:** „Ticketing: kreiranje tiketa (service → request type → due date → opis), statusi
  (Pending/Assigned/In Progress/Waiting for User/Resolved/Closed)“ (`RAW_PROJECT.md:54`).
- **Grupni inbox:** svaki novi tiket ide handler **grupi**, a ne pojedincu (`:55–56`); agenti preuzimaju tiket iz
  grupe (`:57`); SLA response se računa od kreiranja do prve smislene reakcije (`:58`).
- **Prioritet i matrica:** impact i urgency pri kreiranju, sistem predlaže prioritet, override je auditovan
  (`:59–62`) — obrađeno u §M7.
- **Prilozi:** upload uz tiket/poruku sa OU-scope kontrolom (`:129`), klasifikacija utiče na politiku priloga i
  nasljeđivanje klasifikacije je obavezno (`:246–247`), limiti veličine i allow-lista MIME tipova (`:884`).
- **Dedup/merge:** admin spaja duplikate u „parent“ tiket i broadcast-uje update vezanim tiketima (`:136`).
- **Split:** agent/admin dijeli tiket na 2+ pod-tiketa; zadržava parent/child link, kopira kontekst, **agent bira**
  šta se prenosi od poruka/priloga (default: ništa osim referenci), poštuje OU/confidential/participants pravila,
  a split se auditira kao `SYSTEM_EVENT` s razlogom i listom djece (`:137–143`).
- **Bulk akcije:** samo unutar iste OU/grupe (SuperAdmin smije cross-OU), **bulk close nije dozvoljen** (`:144–146`);
  set: assign, status (bez close), priority (uz obrazloženje), structured broadcast („šta se dešava“, „koga
  pogađa“, ETA, workaround) s pregledom broja primalaca i rate limitom, te bulk merge u parent (`:147–153`).
- **Saved views:** agent/admin čuva lične filtere/prikaze (status, prioritet, servis, dodjela, datum), sort i
  kolone, opciono default view; views su **per-user** i ne mijenjaju sigurnost (`:154–158`).
- **Mjerenje vremena:** Start/Stop uz anti-abuse (auto-pauza kad tab nije aktivan, spriječiti „beskonačne“
  sesije) (`:160`).
- **Postavke:** waiting-for-user i reopen (`:500–504`), forwarding (`:521–523`), saved views (`:524–527`), bulk
  akcije i broadcast (`:528–541`), prilozi (`:558–563`), split (`:629`), OU izolacija upita (`:410`), indeksi i
  filteri liste (`:412`), arhiva i izvoz (v. §4.5).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Status nije slobodan tekst.** Prelazi su unaprijed definisani i zavise od aktera (korisnik, agent, sistem,
   odobravalac); svaki pokušaj „preskakanja“ koraka se odbija s jasnim kodom greške.
2. **Tiket ima jednog vlasnika u svakom trenutku.** Rutanje daje grupu, agent preuzima, a pravo rada prati
   trenutnu grupu — ne matičnu OU agenta.
3. **Zatvaranje je najstroža operacija.** Close code, resolution note i obavezna polja se provjeravaju prije
   prelaza u Riješeno/Zatvoreno, a ne poslije.
4. **Spajanje i dijeljenje su reverzibilni i objašnjivi.** Merge ima parent/child vezu s propagacijom statusa i
   mogućnošću razdvajanja; split ostavlja audit trag s razlogom i listom djece.
5. **Skupne akcije su „enterprise-safe“:** ograničene na istu OU/grupu, bez zatvaranja, sa structured broadcast
   porukom, pregledom primalaca, rate limitom i batch auditom.
6. **Ništa ne blokira korisnika da prijavi problem, ali ga sistem ne ostavlja bez odgovora:** waiting-for-user
   automatika podsjeća i zatvara po isteku, a tiket se može ponovo otvoriti u definisanom roku.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Jedan izvor istine za tok statusa** (kod to ima: `ticket-workflow-definition.ts`) i ekran koji ga prikazuje
   adminu bez dupliranja logike.
2. **Vidljivost izvedena iz aktera, nikad iz upita** (kod to ima: `buildTicketVisibilityWhere`).
3. **Provjere prije zatvaranja** (close code, required fields, resolution note) i jasna lista onoga što nedostaje.
4. **Merge/split s ograničenjima i auditom**, uključujući zabranu spajanja povjerljivog s nepovjerljivim.
5. **Bulk akcije s dvostrukom zaštitom:** scope + allow-lista akcija + zabrana close-a + rate limit.
6. **Dosljednost dokumentacije i stvarnosti** za postavke: svaka registrovana postavka mora imati potrošača ili
   biti uklonjena (nalazi B1–B3).

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Model i kontrakti

- Tiket nosi `status` (`PENDING`…`ARCHIVED`, `backend/prisma/schema/enums.prisma:9–19`), `priority`, `impact`,
  `urgency` (`ticketing.prisma:8–11`), `formData`, `formVersionId`, veze prema `assignedGroupId`,
  `assignedUserId`, `parentTicketId`, `reopenedFromTicketId` (`create-ticket.ts:196–206`), te
  `routedByUnroutedFallback` (`:38`), `unroutedWarnedAt` (`:40`), `priorityOverridden*` (`:43–46`).
- Dozvoljeni prelasci su **podatak**: `ticketWorkflowTransitions` s akterima (`STAFF|REQUESTER|APPROVER|SYSTEM`),
  okidačima i čuvarima (`close_code`, `required_fields`, `resolution_note`, `reopen_window`,
  `waiting_auto_close`, `archive_after`, `group_required`, `playbook_steps`) — `tickets/workflow/
  ticket-workflow-definition.ts:32–78`; iz njega se izvodi `allowedTicketStatusTransitions`
  (`tickets.constants.ts:49–52`), a faze (`intake|work|done`) su u `:40–50`.
- `assertTicketStatusTransition` odbija nedozvoljen prelaz (`INVALID_STATUS_TRANSITION`) i propušta „isti u
  isti“ (`assert-ticket-status-transition.ts:5–21`).
- Životni ciklus pamti vremena: `resolvedAt`, `closedAt`, `archivedAt`, `waitingForUserEnteredAt`,
  `waitingForUserReminderSentAt`; ponovno otvaranje briše `resolvedAt`/`closedAt`
  (`apply-ticket-lifecycle-timestamps.ts:6–60`).

### 4.2 API

- `TicketsController` (`tickets.controller.ts:36–50`, sve rute uz `SessionAuthenticationGuard` + `RoleGuard` i
  role `user|agent|admin|superAdmin`, `ValidationPipe` sa `whitelist`/`forbidNonWhitelisted`):
  `POST /tickets` (`:54–60`), `POST /tickets/routing-preview` (`:62–72`, v. §M7),
  `GET /tickets` s paginacijom (`:79–85`), `GET /tickets/counts` (`:87–96`), `GET /tickets/inbox` (`:98–107`),
  `GET /tickets/inbox/status` (`:109–116`), `GET /tickets/:ticketId` (`:118–127`),
  `POST /tickets/:ticketId/claim` (`:129–138`), `PATCH /tickets/:ticketId` (`:140–151`).
- Ostali kontroleri istog modula: kolaboracija (`participants`, `messages` — `tickets-collaboration.controller.ts:
  47–108`), kontekst detalja (`people`, `candidates`, `history`, `activity`, `actions`, `sla-context` —
  `context/tickets-context.controller.ts:32–72`), merge/unmerge i prioritet (`merge/tickets-merge.controller.ts:
  47–91`), forwarding (`forwarding/tickets-forwarding.controller.ts:45–79`), bulk (`bulk/tickets-bulk.controller.ts:
  39–47`), split (`split/tickets-split.controller.ts:39`), mjerenje vremena (`time-tracking/
  tickets-time-tracking.controller.ts:53–140`), izvoz (`export/tickets-export.controller.ts:43`), reopen
  (`reopen/tickets-reopen.controller.ts:40`), prilozi (`attachments/tickets-attachments.controller.ts:52–108`),
  break-glass za povjerljive (`confidential/tickets-confidential.controller.ts:41`) i remote zahtjev
  (`remote/tickets-remote.controller.ts:39`).
- DTO za kreiranje: naslov (do 200), opis (do 8000), `impact`, `urgency`, `serviceId`, opciono `originUnitId`,
  `formVersionRef`, `formData`, `isConfidential`, `acknowledgeDuplicate`, `assetId` (`dto/create-ticket.dto.ts:16–64`).

### 4.3 Kreiranje i vidljivost

- `createTicket` učitava aktera i naručioca, razrješava origin OU i servis, provjerava `assertCanCreateTicket`,
  pa u transakciji upisuje tiket s prioritetom iz matrice, klasifikacijom, povjerljivošću, `formData` i
  routing odlukom (`create-ticket.ts:59–230`); broj tiketa se rezerviše i dodjeljuje uz retry
  (`generate-ticket-number.ts`, `withTicketNumberRetry` u `:167–228`).
- Vidljivost: `resolveTicketActorAccess` daje `staff` ako akter može rukovati tiketom, `public` ako je
  naručilac ili aktivni učesnik koji nije `FOLLOWER`, inače `FORBIDDEN` (`resolve-ticket-actor-access.ts:24–67`);
  povjerljivi tiketi imaju dodatnu kapiju (`confidential/assert-confidential-ticket-access`).
- Pravo rukovanja: OU + servis scope **ili** članstvo u trenutnoj handler grupi, SuperAdmin uvijek
  (`authorize-ticket-actor.ts:8–91`).
- Liste rade istu logiku kao `WHERE` (bez provjere po tiketu), uključujući povjerljive i break-glass
  (`list/build-ticket-visibility-where.ts:23–50`); grupni inbox **ne** prikazuje naručiocu vlastite tikete
  (`requesterSeesOwn === false`, `:16–20`).

### 4.4 Lista, filteri i brojači

- Jedan rječnik filtera dijeli lista, izvoz i CSAT sažetak (`list/list-tickets.types.ts:13–59`): OU, servis,
  status(i), dodijeljeni agent, prioritet, naručilac, grupa, `unassigned`, `hideMerged`, `forwarded`
  (`any|toMyGroups`), `following`, `mentionedMe`, `unroutedOverdue`, `overdue`, `atRisk`, `createdFrom/To`, `q`.
- Paginacija je ograničena: podrazumijevano 25, najviše 50 redova po odgovoru, vrijednost se klampuje a ne
  odbija (`list/clamp-ticket-list-page-size.ts:10–15`, `list/list-tickets.constants.ts`).
- Ukupan broj je ograničen (`countTicketsCapped`) i keširan 30 s po korisniku i filteru (samo broj, nikad redovi)
  — `list-tickets.ts:20–50`.
- Pretraga `q` pokriva broj i naslov, a opis samo kad to pozivalac zatraži (`list/list-tickets.types.ts:53–59`).

### 4.5 Tok statusa, zatvaranje, arhiva i ponovno otvaranje

- `PATCH /tickets/:id` provjerava: promjenu statusa smije samo staff (osim delegiranih slučajeva), prelaz iz
  `PENDING_APPROVAL` traži odluku odobrenja, prelaz **u** `PENDING_APPROVAL` je zabranjen, a povratak iz
  `RESOLVED/CLOSED` u `IN_PROGRESS` ide isključivo kroz reopen (`assert-patch-ticket-status.ts:7–34`).
- Pri prelazu u Riješeno/Zatvoreno provjeravaju se close code, resolution note, globalna i po-servisu obavezna
  polja te (opciono) `required` polja iz šeme forme (`apply-ticket-resolution.ts:34–53`, `required-fields/
  collect-missing-required-fields.ts:11–66`) — detalji u §M6/T39.
- Arhiviranje je automatika: default `afterClosedDays: 30`, `archivedReadOnly: true`, `searchable: true`
  (`archive/archive.constants.ts:1–6`), sweep svakih 15 minuta (`archive/ticket-archive.job.constants.ts:18–29`),
  a zapis na arhiviranom tiketu se odbija (`archive/assert-ticket-writable.ts:5–17`).
- Ponovno otvaranje: `RESOLVED|CLOSED` u roku od 7 dana (`reopen/reopen.constants.ts:1–10`), uz dvije politike —
  isti tiket ili novi tiket povezan s originalom (`reopen-same-ticket.ts`, `create-reopened-ticket.ts`).
- Waiting-for-user: podsjetnik nakon 2 dana i automatsko zatvaranje nakon 7 dana (`settings/definitions/
  ticket-waiting-and-reopen-settings.ts:14–47`), sweep svakih 15 minuta u slotu `:05`
  (`waiting-for-user/waiting-for-user.job.constants.ts:21`), uz povratak u obradu na odgovor korisnika
  (`resume-waiting-for-user-on-reply.ts`).

### 4.6 Saradnja, spajanje i dijeljenje

- Učesnici: dodavanje/uklanjanje s ulogama, `FOLLOWER` ne dobija pristup (`add-ticket-participant.ts`,
  `resolve-ticket-actor-access.ts:54–62`); poruke se šalju kroz `POST /tickets/:id/messages` s tipovima poruka.
- **Merge:** najviše 50 djece, najviše 10 kandidata, zabranjen merge sa samim sobom, zabranjena djeca u
  `CLOSED|ARCHIVED`, zabranjeno miješanje povjerljivog i nepovjerljivog (`MERGE_CONFIDENTIAL_MISMATCH`),
  obavezan razlog (3–500 znakova) — `merge/merge.constants.ts:4–22`, `merge/assert-merge-allowed.ts:29–61`;
  roditelj propagira status na djecu (`propagate-merged-status.ts`), a `unmerge` vraća dijete
  (`unmerge-ticket.ts`).
- **Split:** 2–10 djece, obavezan razlog do 2000 znakova, konfiguracija `allowAttachmentMove: false`,
  `allowMessageCopy: true`, `requireReason: true` (`split/split.constants.ts:1–12`); dijete se kreira s
  naslovom/opisom/servisom/grupom po izboru, a **prenose se samo eksplicitno odabrane poruke i prilozi**
  (`split/dto/split-ticket-child.dto.ts:23–33`).
- **Forwarding:** samo otvoreni statusi (`UNROUTED|PENDING|ASSIGNED|IN_PROGRESS|WAITING_FOR_USER`), cross-OU
  dozvoljen, obavezan razlog (min 10 znakova po defaultu), prethodni handleri po defaultu **ne** ostaju
  watchersi (`forwarding/forwarding.constants.ts:4–25`).

### 4.7 Bulk akcije, saved views, prilozi, vrijeme i izvoz

- **Bulk:** `POST /tickets/bulk` i `POST /tickets/bulk/preview` (`bulk/tickets-bulk.controller.ts:39–47`);
  defaulti: uključeno, SuperAdmin smije cross-OU, ista OU **i** grupa za ostale, bulk close zabranjen, allow-lista
  akcija iz `ticketBulkActionTypes`, broadcast s in-app i email kanalom, obaveznim pregledom, limitom 10/min i
  strukturiranim poljima `what_happened|who_affected|eta` (+ opcioni workaround i linkovi), batch id u auditu
  (`bulk/bulk.constants.ts:4–25`); scope se provjerava prije izvršenja (`bulk/assert-bulk-ticket-scope.ts:6–29`),
  najviše 100 tiketa i razlog do 2000 znakova (`bulk/bulk.constants.ts:21–25`).
- **Saved views:** per-user, najviše 20, default view dozvoljen, dijeljenje isključeno
  (`saved-views/saved-views.constants.ts:1–18`); rute `GET/POST/PATCH/DELETE /tickets/saved-views`
  (`saved-views/tickets-saved-views.controller.ts:43–65`).
- **Prilozi:** politika (MIME allow-lista, ekstenzije, blocklista opasnih ekstenzija, max 25 MB, limiti po
  tiketu/poruci) se primjenjuje pri uploadu (`attachments/validate-ticket-attachment.ts:19–53`), klasifikacija
  se nasljeđuje od tiketa i zabranjeno je „spuštanje“ klasifikacije (`inherit-attachment-classification.ts:5–19`),
  a upload ide uz skeniranje (`scan-attachment-with-clamav.ts`).
- **Vrijeme:** start/stop/heartbeat/ručni unos/ispravka/brisanje (`time-tracking/tickets-time-tracking.controller.ts:
  53–140`), pravila: auto-pauza nakon neaktivnosti, maksimalna dužina sesije, jedan aktivan tajmer po korisniku,
  minimalni razmak heartbeatova 20 s i tolerancija 2 min (`time-tracking/time-tracking.constants.ts:6–34`),
  sweep zatvara napuštene tajmere (`sweep-time-logs.ts`).
- **Izvoz:** CSV s najviše 5000 redova (`export/export.constants.ts:1–5`) uz vlastitu kapiju
  (`export/assert-can-export-tickets.ts`).
- **Realtime mapiranje:** system eventi se prevode u promjene (`updated|assignment|priority|status|resolved|
  closed|archived|reopened|approval`) — `map-ticket-realtime-change.ts:5–30`.

### 4.8 Frontend

- Četiri ekrana: `tickets-page.tsx`, `ticket-list-page.tsx`, `ticket-create-page.tsx`, `ticket-detail-page.tsx` i
  **60 komponenti** u `frontend/src/components/tickets/`.
- Liste imaju poglede **Grupni inbox · Dodijeljeni meni · Nedodijeljeni · Moji zahtjevi · Svi tiketi**
  (`i18n tickets.views`), filtere (`ticket-list-filters.tsx`), sačuvane poglede (`ticket-saved-views-menu.tsx`),
  kolone (`tickets.columns`) i tab **Neusmjereni red** (v. §M7).
- Detalj je organizovan u sekcije-paneele (`ticket-detail-workspace.tsx`, `detail-sections`), uključujući
  vremensku liniju, učesnike, priloge, vrijeme, SLA, CSAT, odobrenja i „povezane“ zapise; indikator aktivnog
  tajmera je u zaglavlju aplikacije (`components/layout/active-timer-indicator.tsx`).
- i18n: **198 ključeva** u sekciji `tickets` s podsekcijama za status, prioritet, split, bulk, saved views,
  priloge, vrijeme, forwarding, merge, povjerljivost i dr. (`frontend/src/i18n/locales/bs/common.json`).
- E2E: **20 od 33** scenarija dira tikete, uključujući `01-ticket-create`, `05-bulk-broadcast`, `06-confidential`,
  `10-forward-cross-ou`, `14-time-tracking` i `15-workflow-unrouted-realtime`.

## 5. Gap analiza

| # | Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|---|
| 1 | Statusi i prelasci (`:54`) | tok kao podatak, akteri i čuvari | `ticketWorkflowTransitions` + izvedeni `allowedTicketStatusTransitions` | Implementirano |
| 2 | Grupni inbox: grupa, ne pojedinac (`:55–57`) | rutanje u grupu, preuzimanje iz grupe | routing daje `assignedGroupId`, `POST /tickets/:id/claim`, grupni inbox | Implementirano |
| 3 | „service → request type → due date“ (`:54`) | eksplicitno polje tipa zahtjeva i rok | nema tih polja; tip zahtjeva nose forma i polja po usluzi | Odstupa |
| 4 | Dedup/merge u parent uz broadcast (`:136`) | merge s parent/child, propagacijom i razlogom | merge/unmerge, propagacija statusa, zabrana miješanja povjerljivosti | Implementirano |
| 5 | Split uz izbor sadržaja i audit (`:137–143`) | 2+ djece, link, razlog, audit | split 2–10 djece, eksplicitni `messageIds`/`attachmentIds`, `SYSTEM_EVENT` | Implementirano |
| 6 | Bulk scope, bez close-a (`:144–146`) | ista OU/grupa, zabrana bulk close | `assertBulkTicketScope`, `disallowBulkClose: true` | Implementirano |
| 7 | Bulk set akcija (`:147–153`) | assign/status/priority/broadcast/merge uz audit | sve navedene akcije + preview + batch audit + rate limit | Implementirano (uz B2) |
| 8 | Structured broadcast (`:152`) | obavezna polja „šta/koga/ETA“, workaround | `broadcastRequiredFields: ['what_happened','who_affected','eta']`, workaround i linkovi | Implementirano |
| 9 | Saved views per-user (`:154–158`) | lični filteri/sort/kolone, default view | `TicketSavedView` s filterima/sortom/kolonama, max 20, default view | Implementirano (uz B3) |
| 10 | Mjerenje vremena i anti-abuse (`:160`) | start/stop, auto-pauza, bez „beskonačnih“ sesija | tajmeri s heartbeatom, idle pravilo, sweep, jedan aktivan po korisniku | Implementirano |
| 11 | Prilozi s OU-scope i klasifikacijom (`:129`, `:246–247`) | politika priloga + nasljeđivanje klasifikacije | MIME/ekstenzije/veličina/blocklista, nasljeđivanje bez „spuštanja“ klase | Implementirano |
| 12 | Waiting-for-user automatika (`:500–502`) | podsjetnik pa auto-close | 2 dana podsjetnik, 7 dana auto-close, sweep 15 min | Implementirano |
| 13 | Reopen u roku (`:503–504`) | reopen do 7 dana | `RESOLVED|CLOSED`, prozor 7 dana, dvije politike | Implementirano |
| 14 | Arhiviranje i izvoz | zatvoreno → arhiva, izvoz liste | arhiva nakon 30 dana i read-only, CSV do 5000 redova | Implementirano |
| 15 | OU izolacija upita (`:410`) | svi upiti scoped po OU | vidljivost kroz `buildTicketVisibilityWhere` + D1 grupa | Implementirano |
| 16 | Filteri i indeksi (`:412`) | filteri status/OU/servis/agent/prioritet | server-side filteri + `@@index` u šemi tiketa | Implementirano |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

Ovo je najveći i najzreliji modul u aplikaciji. Tok statusa je **podatak**, a ne niz `if`-ova; vidljivost se
računa jednom i to kroz `WHERE` klauzule, pa lista i detalj ne mogu odati različite skupove tiketa; povjerljivi
tiketi imaju vlastitu matricu u kojoj čak i SuperAdmin prolazi kroz grant/break-glass; bulk akcije imaju scope,
allow-listu, zabranu close-a i batch audit. Posebno je dobra odluka da grupni inbox ne prikazuje naručiocu
vlastite tikete — inbox je radni red, ne „moji tiketi“.

Slabosti su na ivicama postavki i performansi: tri postavke su registrovane a nemaju efekta (`attachments.
retentionDays`, `savedViews.allowSharing`, djelimično `changeLog.routing.enabled` iz §M7), rate limiter
broadcasta živi u memoriji procesa bez evikcije, a ukupan broj u listi može zaostajati do 30 sekundi zbog
namjernog keša. Nijedna od tih stvari ne ruši osnovni tok, ali svaka može iznenaditi administratora.

Kod je dosljedan u imenovanju i testiran je gusto: 498 backend spec fajlova ukupno, a modul tiketa ima
najveći broj scoped spec-ova (routing, priority, merge, split, bulk, time tracking, waiting-for-user, archive,
export, saved views).

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — `private.ticket.attachments.retentionDays` se čita, ali se ne primjenjuje

- **Fajl/linija:** `backend/src/modules/tickets/attachments/ticket-attachment-configuration.loader.ts:36–38`,
  `parse-ticket-attachment-configuration.ts:43–46`, default `attachments.constants.ts:46` (`retentionDays: 365`);
  stvarno brisanje priloga izvodi privacy retention (`backend/src/modules/privacy/retention/retention-executors.ts:157–180`,
  kategorija `attachments`).
- **Opis:** vrijednost ulazi u konfiguraciju priloga, ali je nijedan izvršni kod ne čita (pretraga backendа daje
  samo loader/parser/default); brisanje zavisi isključivo od `privacy.retention.*` postavki.
- **Uticaj:** administrator koji smanji ovaj rok neće dobiti brisanje starih priloga; dva roka za istu stvar
  mogu se razilaziti.
- **Fix:** mapirati vrijednost na privacy kategoriju `attachments` ili ukloniti postavku i dokumentovati da
  retentionom upravlja modul privatnosti.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — Rate limiter broadcasta je u memoriji procesa i bez evikcije

- **Fajl/linija:** `backend/src/modules/tickets/bulk/bulk-broadcast-rate-limiter.ts:1–18` (module-level `Map`,
  `consume` nikad ne uklanja ključ), limit iz postavke `bulk.constants.ts:13` (`broadcastRateLimitPerMinute: 10`).
- **Opis:** brojači su lokalni za proces i nikad se ne čiste, pa je limit „10 u minuti“ tačan samo za jednu
  instancu, a mapa raste sa svakim korisnikom koji je ikada poslao broadcast.
- **Uticaj:** u horizontalno skaliranom deploymentu stvarni limit je `N × 10`; memorija procesa raste
  (sporo, ali neograničeno).
- **Fix:** brojač u Redis-u (ili DB) s TTL-om ključa.
- **Ozbiljnost:** SREDNJE.

### B3 — NISKO — `private.ticket.savedViews.allowSharing` se validira, ali se vrijednost odbacuje

- **Fajl/linija:** `backend/src/modules/tickets/saved-views/parse-ticket-saved-views-configuration.ts:15–29`
  (validira `allowSharing` kao boolean, a vraća `allowSharing: false` bez obzira na vrijednost).
- **Opis:** postavka je registrovana i validirana, ali je izlazna konfiguracija uvijek `false`; uključivanje u
  postavkama ne mijenja ništa (dijeljenje pogleda nije implementirano).
- **Uticaj:** administrator može uključiti postavku i očekivati funkciju koja ne postoji.
- **Fix:** ukloniti postavku ili je uvažiti kad se dijeljenje implementira; do tada je označiti kao rezervisanu.
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Lista tiketa po defaultu prikazuje i spojenu djecu

- **Fajl/linija:** `backend/src/modules/tickets/list/list-tickets.types.ts:27–28` (`hideMerged` je opcion),
  `frontend/src/components/tickets/ticket-list-filters.tsx:183–186` (prekidač je isključen po defaultu).
- **Opis:** roditelj i njegova spojena djeca stoje u istoj listi dok korisnik ručno ne uključi
  **Sakrij spojene**.
- **Uticaj:** lista izgleda duplo za incidente s mnogo duplikata.
- **Fix:** uključiti filter po defaultu kad je tiket spojen, ili prikazati djecu kao podredne redove.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Ukupan broj tiketa u listi može zaostajati do 30 sekundi

- **Fajl/linija:** `backend/src/modules/tickets/list-tickets.ts:20–50` (single-flight keš `ticketListTotals`,
  TTL 30 s, ključ = korisnik + filteri + arhiva + povjerljivost).
- **Opis:** redovi su uvijek svježi, ali „N tiketa“ se ponovo koristi do 30 s.
- **Uticaj:** mali, ali vidljiv nesklad kod brzih izmjena; namjerno zbog COUNT-a na 100k tiketa.
- **Fix:** nije potreban; dokumentovati ponašanje (ili skratiti TTL kad COUNT bude jeftiniji).
- **Ozbiljnost:** NISKO.

### B6 — NISKO — Filter `hideMerged` i „Neusmjereni red“ nisu dio istog obrasca

- **Fajl/linija:** `frontend/src/lib/tickets/filter-tickets.ts:19`, `frontend/src/lib/tickets/inbox-view-tabs.ts:44–46`
  (usporedi s §M7 B4).
- **Opis:** dio stanja liste (spojena djeca, neusmjereni tiketi) uređuje se kroz različite mehanizme — jedan kroz
  filter listе, drugi kroz tab iznad liste — pa isti tiket može izgledati „skriven“ na jednom mjestu, a
  prisutan na drugom.
- **Uticaj:** kognitivno opterećenje i nejasna očekivanja; nije greška u podacima.
- **Fix:** jedinstveni „prikaži/sakrij“ obrazac i jedan izvor istine za stanje liste.
- **Ozbiljnost:** NISKO.

### B7 — NISKO — `reopen.enabled` ne ulazi u računanje dozvoljenih akcija za UI

- **Fajl/linija:** `backend/src/modules/tickets/reopen/resolve-ticket-reopen-policy.ts:16–38` (server poštuje
  `enabled` i vraća `mode: 'same_ticket' | 'new_ticket'`), dok `backend/src/modules/tickets/context/
  resolve-ticket-allowed-actions.ts` **ne sadrži nijednu referencu na reopen** (pretraga: 0 pogodaka);
  `TicketReopenConfigurationLoader` koriste samo bulk, CSAT, forwarding, merge i reopen servisi
  (`tickets-bulk.service.ts:152`, `tickets-csat.service.ts:30`, `tickets-forwarding.service.ts:35`,
  `tickets-merge.service.ts:32`).
- **Opis:** lista dozvoljenih akcija koju dobija detalj tiketa ne zavisi od postavke `private.ticket.reopen.enabled`,
  pa UI može ponuditi **Ponovo otvori** i kada je funkcija isključena; server tada odbija s `REOPEN_DISABLED`.
- **Uticaj:** mrtav klik i zbunjujuća poruka umjesto sakrivene akcije.
- **Fix:** uračunati reopen konfiguraciju u `resolve-ticket-allowed-actions` (ili vratiti akciju s razlogom
  isključenja).
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/*` — postojeća stranica `prosljedjivanje-tiketa.md` pokriva samo forwarding;
osnovni tok tiketa (kreiranje, liste, detalj, statusi, merge/split, bulk, vrijeme, prilozi) nije bio dokumentovan.

**Dodato (M8):**

- `docs/user-guide/tiketi.md` — nova stranica: čemu služi, kome je namijenjen (tabela rola), kako se dolazi,
  korak-po-korak (prijava tiketa, preuzimanje iz grupnog inboxa, rad u detalju, promjena statusa, spajanje,
  dijeljenje, skupne akcije, sačuvani pogledi, mjerenje vremena, prilozi, arhiva, ponovno otvaranje), tabele
  statusa i polja, česta pitanja i poruke grešaka, poznata ograničenja (B1–B5) i povezani moduli.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T48–T56**: tok statusa kao podatak; grupni inbox i vidljivost; pravila
  zatvaranja (close code, obavezna polja, resolution note); spajanje i razdvajanje; dijeljenje tiketa; skupne
  akcije; sačuvani pogledi; mjerenje vremena; prilozi.
- `REVIEW_ANALIZA.md` §M8 — planirano/idealno/preporuka, stanje u kodu (model, API, kreiranje i vidljivost,
  lista, tok statusa i arhiva, saradnja, bulk/saved views/prilozi/vrijeme/izvoz, frontend), gap tabela sa 16
  redova, recenzija, nalazi **B1–B7**, ocjene **F9 / K8 / S8** i red tabele iteracija „2 … M8 ✅ · M9 u toku“.

**Ostaje otvoreno:** nema novih `[NEJASNO]` stavki za ovaj modul; jedini otvoreni termin iz §M6
(`private.ticket.forms.schemaRegistryJson`) i dalje čeka odgovor i ne spominje se u dokumentaciji.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **9 / 10** | Kreiranje s routingom, grupni inbox i preuzimanje, tok statusa s čuvarima, merge/split, bulk s preview-om i structured broadcastom, saved views, mjerenje vremena s anti-abuse, arhiva, reopen i izvoz — sve radi i pokriveno je testovima. Umanjuje jedino odstupanje od RAW-a u poljima „request type/due date“ i nalazi B1–B4. |
| Kvalitet koda | **8 / 10** | Tok statusa kao podatak, vidljivost izvedena iz aktera, transakcije i audit na svim promjenama, precizni kodovi grešaka, keš samo za brojeve. Umanjuju: tri postavke bez efekta (B1–B3), memorijski rate limiter (B2) i sitni nedostaci u konzistentnosti filtera (B4–B6). |
| Sigurnost | **8 / 10** | OU/servis scope + D1 grupa, povjerljivi tiketi s vlastitom matricom (SuperAdmin bez implicitnog pristupa), break-glass uz audit, OU izolacija u upitima liste, klasifikacija priloga bez „spuštanja“, bulk scope i zabrana bulk close-a. Umanjuju: B1 (retention bez primjene) i B2 (limit po instanci). |

# M9 — Odobrenja i CSAT

## 1. Planirano u RAW projektnom zadatku

- **Approval flow (ITIL-lite, settings-driven):** za odabrane servise tiket ide u `PENDING_APPROVAL` **prije**
  dodjele/obrade (`RAW_PROJECT.md:70`, `:931`); odobravalac može **approve/reject sa razlogom** i sve se
  auditira (`:932`); nakon odobrenja rutanje/dodjela nastavlja normalno (`:933`); obim MVP-a je „minimalno za
  1–3 osjetljiva servisa“ (`:1066`).
- **Uloga i poruke:** `APPROVER` kao uloga učesnika (`:112`, `:115`), tip poruke `APPROVAL_DECISION` (`:118`).
- **SLA:** pauza tajmera dok je tiket u `PENDING_APPROVAL` (`:89`, `:511`).
- **Dashboard:** `PENDING_APPROVAL` među stanjima u kojima tiketi „stoje“ (`:281`).
- **Postavke odobrenja:** `private.ticket.approvals.enabled` (`:686`), `requiredByServiceJson` kao **secret**
  (`:687`), `defaultApproverRole` (`:688`), `allowRequesterManager` kao priprema za AD managera
  (`:689`, default `false` u MVP-u).
- **CSAT nakon resolve/close:** korisnik dobija kratku ocjenu **1–5** i opcionalni komentar (`:358–359`);
  ocjena ulazi u **KPI/dashboard po OU/servisu/grupi** (`:360`, `:1019`); forma ocjene nakon rješavanja/zatvaranja
  (`:1047`); CSAT je izričito naveden kao obavezan element MVP-a (`:1103`) i kao dio paketa „Close codes + CSAT“
  gdje resolve traži close code (`:870`); Baza znanja ima članak `csat-feedback` (`:825`).
- **Postavke CSAT-a:** `private.csat.enabled`, `scaleMax`, `askOnResolved`, `askOnClosed`, `samplingRate`
  (`:635–639`).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Odobrenje je blokirajuće stanje, pa mora biti vidljivo.** Ako tiket čeka odluku, odgovorni mora dobiti
   obavještenje — inače odobrenje postaje „tihi zastoj“ koji se otkriva tek na SLA izvještaju.
2. **Kapija se ne smije zaobići nijednim putem.** Servis koji traži odobrenje mora ga tražiti bez obzira na to
   kako je tiket nastao ili kako je ušao u obradu (kreiranje, prosljeđivanje, ponovno otvaranje).
3. **Odluka je auditovana i objašnjiva.** Uz odluku idu akter, razlog i zapis u change logu i vremenskoj liniji.
4. **Odbijanje ne smije izgledati kao rješenje.** Ako je zahtjev odbijen, to treba biti jasno i korisniku i
   izvještajima, a ne „zatvoren tiket“ bez konteksta.
5. **CSAT je jedan po tiketu, dobrovoljan i otporan na zloupotrebu.** Ocjena dolazi od naručioca, u
   definisanom prozoru, uz opcionalni komentar koji prolazi istu redakciju kao i ostali sadržaj.
6. **Agregacija i skala su jedan izvor istine.** Ako je skala podesiva, svaki prikaz (forma, izvještaj, prag
   „zadovoljan“) mora koristiti istu vrijednost.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Povezati obavještenje s pravim primaocima** (B1): poslati `ticket.approval` odgovornima za odluku
   (rola iz `defaultApproverRole` unutar OU/servis scope-a, ili `PENDING_APPROVAL` nadzorna lista), a ne samo
   učesnicima s ulogom `APPROVER`.
2. **Zatvoriti zaobilazni put** (B2): kad tiket koji traži odobrenje uđe u obradu (npr. prosljeđivanjem),
   kreirati odobrenje prije prelaza, ili eksplicitno dokumentovati da se odobrenje traži samo pri kreiranju.
3. **Jedna skala za sve** (B3): prenijeti `private.csat.scaleMax` u izvještaje (KPI, trendovi, prag
   „zadovoljan“) umjesto hardkodirane petice.
4. **Iskoristiti postojeću agregaciju** (B3): `GET /tickets/csat/summary` već računa prosjek po OU/servisu/grupi —
   prikazati ga na izvještajima ili ukloniti ako nije potreban.
5. **Ukloniti mrtvu postavku** (B4) `allowRequesterManager` dok ne postoje podaci o manageru iz imenika.
6. **Dodati testove na nivou odluke** (trenutno 3 spec fajla za cijeli modul): approve → `PENDING`,
   reject → zatvoreno, zabrana samoodobrenja, zabrana van scope-a, te ponovljena odluka.

## 4. Trenutna implementacija u kodu `[ČINJENICA]`

### 4.1 Model i kontrakti

- `TicketApproval`: `ticketId`, `stepOrder @default(1)`, `status ApprovalStatus @default(PENDING)`,
  `approverUserId?`, `comment?`, `decidedAt?`, relacije na tiket (`onDelete: Cascade`) i korisnika
  (`onDelete: SetNull`), indeksi po `ticketId` i `approverUserId`
  (`backend/prisma/schema/ticketing-support.prisma:67–82`); `ApprovalStatus = PENDING|APPROVED|REJECTED`
  (`enums.prisma:116–120`).
- `TicketCsat`: `ticketId @unique` (jedna ocjena po tiketu), `rating Int`, `comment?`, `submittedByUserId`
  (relacija `onDelete: Restrict`), `createdAt` s indeksom za trend
  (`ticketing-support.prisma:112–124`).
- Konfiguracija odobrenja: `enabled`, `requiredByService` (mapa servis → boolean), `defaultApproverRole`
  (`ADMIN|AGENT|SUPER_ADMIN`), `allowRequesterManager` (`approvals.types.ts:7–12`); defaulti
  `enabled: true`, prazna mapa, `ADMIN`, `false` (`approvals.constants.ts:10–15`).
- Dozvoljene prelasce iz `PENDING_APPROVAL` propisuje tok statusa: → `PENDING` i → `CLOSED`, oba s akterom
  `APPROVER`, okidačem `approval` i čuvarom `approval_decision`
  (`backend/src/modules/tickets/workflow/ticket-workflow-definition.ts:58–59`).
- Konfiguracija CSAT-a: `enabled`, `scaleMax` (2–10), `askOnResolved`, `askOnClosed`, `samplingRate` (0–1)
  (`csat/csat.constants.ts:1–13`, `csat/csat.types.ts:1–7`).

### 4.2 API

- `GET /tickets/:ticketId/approvals` — lista koraka s `canDecide` po svakom zapisu
  (`approvals/tickets-approvals.controller.ts:41–47`).
- `POST /tickets/:ticketId/approvals/:approvalId/approve` i `…/reject` — tijelo `{ comment }`
  (`:49–77`).
- `POST /tickets/:ticketId/csat` — tijelo `{ rating, comment? }`, vraća osvježen tiket
  (`csat/tickets-csat.controller.ts:40–47`).
- `GET /tickets/csat/summary` — agregacija po OU, servisu i grupi; dopuštena rolama
  `agent|admin|superAdmin` (`csat/tickets-csat-summary.controller.ts:20–42`).
- Kontroleri dijele `SessionAuthenticationGuard` + `RoleGuard` i `ValidationPipe` s `whitelist`/
  `forbidNonWhitelisted`; kontekst aktera se čita iz sesije, nikad iz tijela
  (`tickets-approvals.controller.ts:23–37`, `tickets-csat.controller.ts:22–36`).

### 4.3 Tok odobrenja

- **Zahtjev nastaje pri kreiranju:** ako je status `PENDING_APPROVAL`, `writeCreatedTicketFollowUp` kreira jedan
  `TicketApproval` (`stepOrder = 1`) i sistemski događaj `approvalRequested`
  (`tickets/write-created-ticket-follow-up.ts:59–69`, `approvals/create-pending-ticket-approval.ts:6–17`).
- **Da li servis traži odobrenje:** `resolveTicketApprovalRequirement` prvo gleda `requiredByService[serviceId]`
  (overlay), pa polje `Service.requiresApproval`; ako je modul isključen, uvijek `false`
  (`approvals/resolve-ticket-approval-requirement.ts:4–17`). Status pri kreiranju: `PENDING_APPROVAL` osim ako
  odobrenje nije potrebno **ili je tiket `UNROUTED`** (`:19–27`).
- **Odluka:** `decideTicketApproval` provjerava pristup i zapis, pa u transakciji mijenja status odobrenja
  (`APPROVED`/`REJECTED`), upisuje `approverUserId`, `comment`, `decidedAt`, mijenja status tiketa
  (**`APPROVED` → `PENDING`**, **`REJECTED` → `CLOSED`**), bilježi change log s razlogom
  `ticket_approval_approved`/`rejected`, dodaje odobravaoca kao učesnika s ulogom `APPROVER`, upisuje sistemski
  događaj i poruku tipa `APPROVAL_DECISION` (`approvals/decide-ticket-approval.ts:57–137`, konstante
  `approvals.constants.ts:17–21`).
- **Nakon odluke SLA se ponovo računa** (`applyTicketSlaTimers` s događajem `status_changed`,
  `decide-ticket-approval.ts:130–135`).
- **Ko smije odlučiti:** modul uključen, tiket u `PENDING_APPROVAL`, akter **nije** naručilac, SuperAdmin uvijek,
  a ostali moraju imati rolu iz `approverRoleKeys(defaultApproverRole)` **unutar** OU i servis scope-a tiketa
  (`approvals/assert-can-decide-ticket-approval.ts:9–43`, `approvals.constants.ts:28–38`); prekršaji daju
  `APPROVALS_DISABLED`, `APPROVAL_NOT_PENDING`, `APPROVAL_SELF_FORBIDDEN` ili `FORBIDDEN` (`:52–73`).
- **Prekršaj van JS-a:** `resolveCreateTicketApprovalStatus` je jedina kapija — nema je u toku prosljeđivanja
  (`forwarding/forward-ticket.ts` ne spominje odobrenja).

### 4.4 SLA i obavještenja

- Pauza SLA tajmera: `isSlaPauseStatus` vraća `pauseOnWaitingForUser` za `WAITING_FOR_USER` i
  `pauseOnPendingApproval` za `PENDING_APPROVAL` (`backend/src/modules/sla/is-sla-pause-status.ts:4–15`);
  postavka `private.ticket.sla.pauseOnPendingApproval` je uključena po defaultu
  (`settings/definitions/ticket-sla-settings.ts:39–46`), a primjenjuju je `start-ticket-sla-timers.ts:48`
  i `sync-ticket-sla-timers.ts:116,136`.
- Obavještenja: događaji `approvalRequested|approvalApproved|approvalRejected` mapiraju se u tip
  `ticket.approval` (`notifications/fan-out/map-ticket-event-to-notification.ts:17–19`), s tekstom
  **„Čeka odobrenje: {{ticketNumber}}“** (`i18n bs → notifications.items.ticketApproval`) i kategorijom u
  preferencijama (`notification-preference-catalog.ts:51`) — ali primaoci su **samo učesnici s ulogom
  `APPROVER`** (`resolve-notification-recipients.ts:211–212, 266–278`), a akter se uvijek izuzima
  (`:29–35`). Ulogu `APPROVER` dodaje tek odluka (`decide-ticket-approval.ts:139–154`), a pri kreiranju se
  dodaju samo `REQUESTER` i `HANDLER_GROUP` (`seed-default-ticket-participants.ts:7–35`,
  `collaboration.constants.ts:50–53`).
- U UI-u se do `PENDING_APPROVAL` dolazi preko nadzorne ploče (pločica vodi na
  `/tickets?view=all&status=PENDING_APPROVAL`, `components/dashboard/dashboard-metric-grid.tsx:180`); detalj
  prikazuje traku **„Odobrenje je u toku. SLA tajmer je pauziran dok lanac odobrenja traje.“**
  (`i18n tickets.detail.pendingApprovalHint`).

### 4.5 Tok CSAT-a

- **Ko smije i kada:** `canActorSubmitTicketCsat` traži: modul uključen, ocjena još nije data, akter je
  **naručilac**, status je `RESOLVED` (ako `askOnResolved`) ili `CLOSED` (ako `askOnClosed`) i tiket je prošao
  **deterministički sampling** (`csat/can-submit-ticket-csat.ts:5–32`).
- **Sampling:** FNV-1a hash `ticketId`-a u interval [0,1) ⇔ `< samplingRate`; `≥1` uvijek prolazi, `≤0` nikad
  (`csat/is-ticket-csat-sampled.ts:1–21`) — isti tiket uvijek daje isti ishod.
- **Upis:** validacija ocjene (`1…scaleMax`, cijeli broj) i komentara (do 2000 znakova), skeniranje komentara
  redakcijom (`assertRedactionAllowed`), zatim **guardrail** `csat_submit` koji sprječava dvostruko slanje,
  upis `TicketCsat`, change log s razlogom `ticket_csat_submit`, sistemski događaj `ticket_csat_submitted:<rating>`
  i tretman jedinstvenog ograničenja kao `CSAT_ALREADY_SUBMITTED`
  (`csat/submit-ticket-csat.ts:32–148`, `csat.constants.ts:15`).
- **Prikaz u tiketu:** deskriptor `csat` se dodaje odgovoru samo kad su proslijeđeni konfiguracija i akter
  (`tickets/to-ticket-client-responses.ts:74–85`), a panel se prikazuje kad je ocjena data **ili** je dozvoljeno
  slanje (`components/tickets/ticket-csat-panel.tsx:24–55`); ocjena je niz zvjezdica do `scaleMax`
  (`i18n tickets.csat.*`: naslov **„CSAT ocjena“**, dugme **„Pošalji ocjenu“**).
- **Nema izmjene ni brisanja ocjene** — nema `PATCH`/`DELETE` ruta; ocjena je konačna
  (`csat/tickets-csat.controller.ts:40–47`).

### 4.6 Agregacija i izvještaji

- `GET /tickets/csat/summary` računa ukupan broj, prosjek i korpe po OU, servisu i grupi
  (`csat/summarize-visible-ticket-csat.ts:11–38`, `csat/aggregate-ticket-csat.ts:4–43`), uz gornju granicu od
  **20.000** tiketa s ocjenom (`csat/csat.constants.ts:17–23`) i vidljivost koja dolazi iz liste tiketa
  (`listTicketsWithin` s `hasCsatSubmission: true`).
- **Izvještaji rade vlastitu agregaciju:** dashboard KPI čita ocjene iz `loadTicketCsatSubmissions` i vraća
  `csatAverage`, `csatCount` i **`csatScaleMax: 5` (hardkodirano)**
  (`reports/dashboard/aggregate-report-dashboard-kpis.ts:13–15, 80–82`); trendovi imaju konstante
  `reportCsatScaleMax = 5` i `reportCsatSatisfiedMinRating = 4` s pragom „zadovoljan“ ≥ 4
  (`reports/trends/report-trends.constants.ts:35–37`).

### 4.7 Frontend

- **Odobrenja:** panel `TicketApprovalsPanel` u desnoj koloni detalja prikazuje korake kao vertikalnu
  vremensku liniju s ikonom i bojom po statusu (**Odobreno**, **čeka odluku**, **Odbijeno**), tekstom
  **„Korak {{step}}“**, imenom odobravaoca, komentarom pod navodnicima i — samo kad `canDecide` — poljem
  **„Razlog odluke“** s dugmadima **„Odobri“** i **„Odbij“**; oba dugmeta traže neprazan komentar
  (`components/tickets/ticket-approvals-panel.tsx:22–140`).
- **Učitavanje:** `useTicketApprovals` poziva `GET /tickets/:id/approvals`, a panel se osvježava na realtime
  događaj s `change === "approval"` (`lib/tickets/use-ticket-approvals.ts:23–59`); ako poziv padne, panel se
  skriva bez poruke (`:30–33`).
- **CSAT:** traka iznad detalja (`pages/ticket-detail-page.tsx:357–362`), s ocjenom zvjezdicama, komentarom i
  porukom o grešci preko zajedničkog mapiranja (`lib/tickets/ticket-text.ts`, `tickets.csat.*`).
- **i18n:** `tickets.csat.*` (naslov, napomena, komentar, dugmad), `tickets.approvalStatus.*`
  („Na čekanju“, „Odobreno“, „Odbijeno“) i `tickets.detail.*` (odobrenja, korak, odobri, odbij, razlog odluke).
- E2E: `03-approvals.spec.ts` (naručilac kreira tiket jer samoodobrenje nije dozvoljeno → `PENDING_APPROVAL` →
  approve pomjera status, reject zatvara tiket) i `08-close-codes-csat.spec.ts` (resolve traži close code).

## 5. Gap analiza

| # | Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|---|
| 1 | `PENDING_APPROVAL` prije dodjele/obrade (`:70`, `:931`) | status postavljen pri kreiranju, grupa već dodijeljena | `resolveCreateTicketApprovalStatus` + `createPendingTicketApproval`; grupa se dodjeljuje istovremeno | Implementirano |
| 2 | Approve/reject **sa razlogom** (`:932`) | obavezan razlog, audit | `comment` ide u zapis, poruku tipa `APPROVAL_DECISION`, change log i sistemski događaj; UI zahtijeva neprazan komentar | Implementirano |
| 3 | Nakon odobrenja rutanje/dodjela nastavlja (`:933`) | tiket prelazi u radni red grupe | `APPROVED` → `PENDING` (grupa je već postavljena) | Implementirano |
| 4 | Uloga `APPROVER` i tip poruke `APPROVAL_DECISION` (`:112`, `:118`) | učesnik i poruka u toku | dodaje se pri odluci; poruka tipa `APPROVAL_DECISION` u transakciji | Implementirano |
| 5 | Pauza SLA u `PENDING_APPROVAL` (`:89`, `:511`) | pauza po postavci | `isSlaPauseStatus` + postavka default `true` | Implementirano |
| 6 | Dashboard prikazuje `PENDING_APPROVAL` (`:281`) | vidljiv zastoj | pločica na nadzornoj ploči vodi na filtriranu listu | Implementirano |
| 7 | Postavke odobrenja (`:686–689`) | žive postavke | `enabled`, `requiredByServiceJson` (secret), `defaultApproverRole` žive; `allowRequesterManager` **bez potrošača** | Djelimično (B4) |
| 8 | Odobrenja za „1–3 osjetljiva servisa“ (`:1066`) | kapija na nivou servisa | `Service.requiresApproval` + overlay po servisu | Implementirano |
| 9 | Obavijest odgovornima o odluci (idealno) | primalac je odobravalac koji treba djelovati | primaoci su samo učesnici s ulogom `APPROVER`, a ta uloga nastaje tek pri odluci | Odstupa (B1) |
| 10 | Odobrenje se ne smije zaobići (idealno) | kapija na svim ulazima u obradu | tiket kreiran kao `UNROUTED` nikad ne dobija odobrenje, ni poslije prosljeđivanja | Odstupa (B2) |
| 11 | CSAT ocjena 1–5 + komentar (`:358–359`) | kratka forma nakon rješavanja | zvjezdice do `scaleMax` + opcionalni komentar, deterministički sampling | Implementirano |
| 12 | Prikaz nakon resolve/close (`:1047`) | prompt u trenutku rješavanja | traka u detalju kad je `canSubmit`; `askOnResolved` default `true`, `askOnClosed` `false` | Implementirano |
| 13 | CSAT po OU/servisu/grupi (`:360`, `:1019`) | agregacija u izvještajima | `GET /tickets/csat/summary` postoji, ali ga **nijedan ekran ne poziva**; izvještaji računaju samo ukupan prosjek | Djelimično (B3) |
| 14 | Jedna ocjena po tiketu, bez zloupotrebe | jedinstvenost + zaštita | `ticketId @unique`, guardrail `csat_submit`, `CSAT_ALREADY_SUBMITTED` | Implementirano |
| 15 | Komentar prolazi redakciju (idealno) | isti tretman kao poruke | `scanTicketContent` + `assertRedactionAllowed` nad komentarom | Implementirano |
| 16 | Skala CSAT-a podesiva (`:636`) | ista skala svuda | `private.csat.scaleMax` (2–10) živi za formu; izvještaji hardkodiraju 5 i prag ≥ 4 | Odstupa (B3) |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

Oba toka su korektno zatvorena u transakciji i dobro zaštićena: odluku ne može donijeti naručilac, van-scope
akter ne prolazi, ponovna odluka pada na `APPROVAL_NOT_PENDING`, a sve što se dogodi ostavlja tri traga (change
log, sistemski događaj, poruka). CSAT je uzoran u jednoj stvari koja se često pogrešno radi: **sampling je
deterministički** (hash `ticketId`-a), pa isti tiket nikad ne „iskače“ iz uzorka između dva otvaranja ekrana.

Slabosti su na ivicama sistema, ne u srcu. Prva: obavještenje o odobrenju ima tip, tekst i kategoriju, ali
primaoci se računaju iz uloge učesnika koja u tom trenutku još ne postoji — kanal je time praktično mrtav.
Druga: kapija odobrenja postoji samo na kreiranju, pa tiket nastao kao `UNROUTED` (npr. usluga bez routing
pravila) poslije prosljeđivanja ulazi u obradu bez odobrenja. Treća: CSAT je podesiv (2–10), a izvještaji su
zakucani na 5; to ne ruši funkcionalnost, ali daje pogrešnu sliku kad se skala promijeni.

Testni pokrivač je tanak za značaj modula — tri spec fajla, oba za parser/e agregaciju, dok odluka
(approve/reject, samoodobrenje, scope) nema jedinični test, a e2e pokriva sretan put i odbijanje.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Obavještenje o odobrenju ne može stići nikome

- **Fajl/linija:** `backend/src/modules/notifications/fan-out/resolve-notification-recipients.ts:211–212`
  (za `ticketApproval` primaoci su `participantUserIds(prisma, ticket.id, 'APPROVER')`), `:266–278` (nema
  fallbacka), `:29–35` (akter se uvijek izuzima); `approvals/create-pending-ticket-approval.ts:6–17` (zapis se
  kreira bez `approverUserId`); `tickets/seed-default-ticket-participants.ts:7–35` i
  `collaboration.constants.ts:50–53` (pri kreiranju se dodaju samo `REQUESTER` i `HANDLER_GROUP`);
  `approvals/decide-ticket-approval.ts:139–154` (uloga `APPROVER` dodaje se **poslije** odluke).
- **Opis:** pri kreiranju tiketa s odobrenjem ne postoji nijedan učesnik s ulogom `APPROVER`, pa lista primalaca
  za `ticket.approval` ostaje prazna. Kod odluke se odobravalac prvo dodaje kao `APPROVER`, ali se kao akter
  izuzima, pa i ta obavijest ima nula primalaca; naručilac odluku ne dobija.
- **Uticaj:** tip obavještenja koji postoji u katalogu, ima tekst **„Čeka odobrenje: {{ticketNumber}}“** i
  kategoriju u preferencijama praktično nikad ne stigne nikome; odobrenje se otkriva samo ručno (nadzorna
  ploča → filtrirana lista), pa tiket može čekati neograničeno.
- **Fix:** primaoce računati iz `defaultApproverRole` **unutar** OU/servis scope-a tiketa (ili poslati na
  grupu/handler red za `PENDING_APPROVAL`), a odluku vratiti naručiocu.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — Tiket koji počne kao `UNROUTED` nikad ne prolazi odobrenje

- **Fajl/linija:** `backend/src/modules/tickets/approvals/resolve-ticket-approval-requirement.ts:19–27`
  (`…|| input.routingStatus === 'UNROUTED'` vraća routing status bez odobrenja);
  `tickets/write-created-ticket-follow-up.ts:59–69` (zapis odobrenja samo ako je status `PENDING_APPROVAL`);
  `tickets/forwarding/forward-ticket.ts` (nijedna referenca na odobrenja).
- **Opis:** ako usluga traži odobrenje, a za par (origin OU + usluga) ne postoji routing pravilo, tiket se
  kreira kao `UNROUTED` **bez** zapisa odobrenja. Kasnije, kad administrator doda pravilo i agent proslijedi
  tiket u grupu (`UNROUTED → PENDING`), odobrenje se ne kreira.
- **Uticaj:** osjetljivi servis (npr. nabavka ili pristup) može biti obrađen bez ikakvog odobrenja — kapija se
  zaobilazi posredno, bez poruke i bez traga u odobrenjima.
- **Fix:** kreirati odobrenje pri ulasku u obradu ako servis traži odobrenje i za tiket još ne postoji
  odobrenje (npr. u `forward-ticket` ili u čuvarskom sloju statusa), ili u dokumentaciji izričito navesti da
  odobrenje postoji samo za rutirane tikete.
- **Ozbiljnost:** SREDNJE.

### B3 — SREDNJE — CSAT agregacija po OU/servisu/grupi postoji, ali je UI ne koristi; skala je hardkodirana

- **Fajl/linija:** `backend/src/modules/tickets/csat/summarize-visible-ticket-csat.ts:11–38` i
  `csat/aggregate-ticket-csat.ts:11–13` (korpe po OU/servisu/grupi) nasuprot nula poziva u frontend-u;
  `backend/src/modules/reports/dashboard/aggregate-report-dashboard-kpis.ts:82` (`csatScaleMax: 5`),
  `reports/trends/report-trends.constants.ts:36–37` (`reportCsatScaleMax = 5`,
  `reportCsatSatisfiedMinRating = 4`) nasuprot `csat/csat.constants.ts:10–11` (`scaleMax` 2–10, postavka
  `private.csat.scaleMax`).
- **Opis:** RAW traži da CSAT uđe u KPI/dashboard **po OU/servisu/grupi**; endpoint to računa, ali nijedan ekran
  ga ne poziva, a izvještaji prikazuju samo ukupan prosjek uz nazivnik zakucan na 5 i prag „zadovoljan“ ≥ 4.
- **Uticaj:** administrator ne vidi CSAT po jedinici/servisu/grupi iz aplikacije, a ako promijeni skalu na 10,
  izvještaj i dalje piše „x / 5“ i pogrešno tumači ocjene.
- **Fix:** prikazati agregaciju u izvještajima, a `scaleMax` i prag „zadovoljan“ izvesti iz konfiguracije CSAT-a.
- **Ozbiljnost:** SREDNJE.

### B4 — NISKO — `private.ticket.approvals.allowRequesterManager` je bez potrošača

- **Fajl/linija:** `backend/src/modules/settings/setting-keys.ts:139–140`,
  `settings/definitions/ticket-approvals-settings.ts:36–44`,
  `approvals/parse-ticket-approvals-configuration.ts:26,34`, `approvals/approvals.types.ts:11` — i nigdje dalje
  (pretraga kroz `backend/src` daje samo definiciju, parser, loader i test-harness).
- **Opis:** postavka se čita i validira te prenosi u konfiguraciju, ali je nijedna logika odlučivanja ne koristi.
- **Uticaj:** uključivanje ne mijenja ponašanje; vjerovatno je priprema za AD managera (RAW `:689`), ali to iz
  koda nije vidljivo.
- **Fix:** ukloniti do implementacije ili je označiti kao rezervisanu i dokumentovati.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — CSAT zapis u change logu ima identičan „prije“ i „poslije“

- **Fajl/linija:** `backend/src/modules/tickets/csat/submit-ticket-csat.ts:98–104`
  (`before: ticket, after: ticket`).
- **Opis:** promjena se bilježi s istim stanjem prije i poslije, pa diff ne pokazuje da je ocjena dodana;
  informacija o ocjeni postoji samo u sistemskom događaju `ticket_csat_submitted:<rating>`.
- **Uticaj:** change log tiketa je za CSAT praktično prazan zapis; revizor mora gledati vremensku liniju.
- **Fix:** u `after` uključiti stanje ocjene (npr. `rating`) ili u zapis staviti `metadata`.
- **Ozbiljnost:** NISKO.

**Napomena o terminu:** odbijanje odobrenja vodi tiket u status **`CLOSED`**
(`decide-ticket-approval.ts:70`), a ne u posebno stanje „odbijeno“; status odobrenja (`REJECTED`) je vidljiv u
panelu i u i18n ključu `tickets.approvalStatus.REJECTED`. Dokumentacija mora razlikovati **status tiketa** i
**ishod odobrenja**.

## 8. Ažuriranje dokumentacije

**Pregledano:** `docs/user-guide/*` — odobrenja i CSAT nisu bili dokumentovani ni na jednoj stranici; detalji
tiketa ih spominju samo posredno kroz `tickets.detail.*` u UI-u.

**Dodato (M9):**

- `docs/user-guide/odobrenja-i-csat.md` — nova stranica: čemu služi, kome je namijenjen (tabela rola), kako se
  dolazi, korak-po-korak (tiket koji čeka odobrenje, odluka **Odobri**/**Odbij** s razlogom, šta se dešava
  poslije odluke, ocjenjivanje tiketa i pravila uzorka), tabele polja/statusa/validacija, česta pitanja i poruke
  grešaka, poznata ograničenja (B1–B5) i povezani moduli.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T57–T61**: odobrenje kao blokirajuće stanje (nastanak, odluka, posljedice);
  ko smije odlučiti; SLA pauza u `PENDING_APPROVAL`; CSAT pravila (ko, kada, jednom, komentar); CSAT agregacija,
  skala i prag „zadovoljan“.
- `REVIEW_ANALIZA.md` §M9 — planirano/idealno/preporuka, stanje u kodu (model, API, tok odobrenja, SLA i
  obavještenja, tok CSAT-a, agregacija i izvještaji, frontend), gap tabela sa 16 redova, recenzija, nalazi
  **B1–B5**, ocjene **F7 / K8 / S8** i red tabele iteracija „2 … M9 ✅ · M10 u toku“.

**Ostaje otvoreno:** `[NEJASNO]` — da li je predviđeno da odobrenje bude **višekoračno** (model ima `stepOrder`,
ali kod uvijek kreira korak 1, a `firstStepOrder` je konstanta); do odgovora dokumentacija opisuje samo
jednokoračno odobrenje.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **7 / 10** | Odluka (approve → u obradu, reject → zatvoreno) radi i ostavlja tri traga; samoodobrenje i van-scope su blokirani; CSAT radi s determinističkim uzorkom, jednom ocjenom po tiketu i opcionalnim komentarom. Umanjuju: obavještenje koje ne stiže nikome (B1), zaobilazni put kroz `UNROUTED` (B2), agregacija koja se ne prikazuje (B3) i podesiva skala koja se u izvještajima ignoriše (B3). |
| Kvalitet koda | **8 / 10** | Transakcije, precizni kodovi grešaka, deterministički sampling, redakcija komentara i jedinstvenost ocjene po tiketu su uzorni; konfiguracija ima tolerantne parsere s jasnim granicama (2–10, 0–1). Umanjuju: mrtva postavka (B4), prazan CSAT diff (B5) i to što odluka nema jedinične testove. |
| Sigurnost | **8 / 10** | Odluka traži rolu u OU/servis scope-u, naručilac je isključen, akter se nikad ne obavještava o vlastitoj akciji, CSAT može poslati samo naručilac i samo jednom, a komentar prolazi redakciju. Umanjuje: B1 (niko ne dobija obavještenje, pa nadzor nad čekanjem zavisi od ručnog pregleda) i B2 (kapija se može zaobići). |
