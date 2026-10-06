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
| 2 | M6 Katalog usluga i forme · M7 Routing i prioritet · M8 Tiketi · M9 Odobrenja/CSAT · M10 SLA | M6 ✅ · M7 ✅ · M8 ✅ · M9 ✅ · M10 ✅ · iteracija 2 završena |
| 3 | M11 Realtime i obavještenja · M12 Pošta · M13 Šabloni · M14 Baza znanja · M15 Nadzorna ploča | M11 ✅ · M12 ✅ · M13 ✅ · M14 ✅ · M15 ✅ (iteracija 3 završena) |
| 4 | **Val 0** — popravka M4/B1 (default mapping rola → permisije) | M4 🔧 B1 riješen 2026-10-03 · otvoreni ostaju B2 (`SREDNJE`) i B3–B5 (`NISKO`) — vidi `# Val 0 — popravka M4/B1` |
| 5 | **Faza 3** — Docs modul u aplikaciji (korak (a): dizajn i poravnanje vodiča) | ✅ Korak (a) zatvoren 2026-10-03 · koraci (b)–(d) slijede — vidi `# Faza 3 — korak (a)` |
| 6 | **Faza 3** — Docs modul u aplikaciji (korak (b): sadržaj, backend i ogledalo) | ✅ Korak (b) isporučen 2026-10-03 · koraci (c)–(d) slijede — vidi `# Faza 3 — korak (b)` |
| 7 | **Faza 3** — Docs modul u aplikaciji (korak (c): `/docs` UI) | ✅ Korak (c) isporučen 2026-10-03 · korak (d) slijedi — vidi `# Faza 3 — korak (c)` |
| 8 | **Faza 3** — Docs modul u aplikaciji (korak (d): Faza 2 modula, pravilo, evidencija) | ✅ Korak (d) isporučen 2026-10-03 · Faza 3 zatvorena — vidi `# Faza 3 — korak (d)` |
| 9 | **Faza 3 — zatvorena** (4 koraka) | ✅ Zatvorena 2026-10-03 · preostaju popravke po valovima 1–5 — vidi `# Faza 3 — korak (d)` i `# Zaključak Faze 2` |
| 10 | **Val 1** — nadzor i tačnost brojeva (M15 B1, B2, B3, B5, B6; M9 B3) | ✅ Isporučen 2026-10-03 · dopuna iste večeri (nazivi razreza umjesto ID-eva, §2b.1) · ostaju otvoreni M15 B4 i dio M9 B3 (skala na trendovima) — vidi `# Val 1 — nadzor i tačnost brojeva` |
| 11 | **Val 2** — sigurnost i vidljivost (M6 B2; M8 B1; M9 B1, B2; M10 B1, B2, B4; M12 B2; M13 B1; M14 B1) | ✅ Isporučen 2026-10-04 · deset nalaza · dokumentacija i ogledalo ažurirani — vidi `# Val 2 — sigurnost i vidljivost` |
| 12 | **Val 3** — pouzdanost i performanse (M8 B2; M11 B1, B2; M12 B1, B3, B4, B5; M13 B2; M14 B5 + guard za Redis auth) | ✅ Isporučen 2026-10-05 · devet nalaza i jedan preventivni guard — vidi `# Val 3 — pouzdanost i performanse` |
| 13 | **Val 4** — e2e pokrivenost portala baze znanja i „Operativnog zdravlja“ (uz prateće ispravke datuma) | ✅ Isporučen 2026-10-05 · specovi 34–35; E-1 (e2e kapija) zatvoren u valu 5 — vidi `# Val 4 — e2e pokrivenost portala baze znanja i „Operativnog zdravlja“` |
| 14 | **Val 5** — RAW zaostaci (M5 B1–B6; M8 3; M7 B2, B3, B5; M12 B1 dio) + M13 specovi, mrtve postavke i površine, EN stranice | ✅ Isporučen 2026-10-05 · svi nalazi opsega zatvoreni; u sandboksu nije moguć živ e2e prolaz — vidi `# Val 5 — izvještaj vala` |

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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
| local SuperAdmin | + politika lozinke kao 2.1 | bcrypt 12, 12–128 znakova + blocklist, riječi organizacije i dijelovi emaila iz politike (paket 5.1, 2026-10-06) | **Implementirano** |
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
| 1 | **SREDNJE** → ✅ **zatvoreno u paketu 5.1 (2026-10-06)**: `validate-install-super-admin-credentials.ts` sada prima politiku i zove `checkPassword`, politiku daje `install-super-admin-password-policy.ts`, a wizard je čita s `GET /install/password-policy` | `backend/src/modules/install/validate-install-super-admin-credentials.ts:16–29` vs. `authentication/security/password-change.service.ts:29` + `security/password-policy.ts` | Politika lozinke iz paketa 2.1 (blocklist preko zxcvbn rječnika, historija, dužina iz postavke) **ne primjenjuje se** na prvi, najprivilegovaniji nalog; wizard provjerava samo 12–128 znakova i da lozinka nije email. | SuperAdmin može dobiti npr. `password12345`; politika važi za sve ostale korisnike, ali ne za osnivački nalog. | Pozvati isti loader (`account-security-policy.loader.ts`) i provjeru iz `password-policy.ts` u wizardu, ili forsirati promjenu lozinke pri prvoj prijavi. |
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
| Sigurnost | **7 / 10** | Token + tajming-otporno poređenje + zaključavanje + write-only tajne; osnivački nalog sada prolazi istu politiku lozinke kao svaki lokalni nalog (nalaz #1 zatvoren u paketu 5.1), a umanjuju otvoren `GET /install/addons` (nalaz #5) i maskiranje pada baze (nalaz #3). |

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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
| 1 | **SREDNJE** → ✅ **zatvoreno u paketu 5.1 (2026-10-06)**: `resolveMfaFlow` (`security/account-security-rules.ts`) razdvaja „smije upisati“ od „upisan faktor se uvijek verificira“, a `MfaService.flowFor` to prosljeđuje u `continueAfterPassword` | `backend/src/modules/authentication/authentication.service.ts:255–270` + `security/account-security-rules.ts:21` | Isključivanje postavke `private.auth.mfa.allowOptional` mijenja zahtjev na `unavailable`, a `continueAfterPassword` tada **preskače verifikaciju** i za korisnike koji **već imaju upisan TOTP** (uslov je `requirement !== 'unavailable' && isEnabled`). Opis postavke u kodu i UI-ju kaže da se radi o *dozvoli samostalnog uključivanja*, ne o isključivanju verifikacije (`settings/definitions/account-security-settings.ts:36–43`). | ADMIN/SUPER_ADMIN nisu pogođeni, ali svaki AGENT/USER koji se oslanja na drugi faktor ostaje zaštićen samo lozinkom — tiho, bez ikakve poruke. | Razdvojiti „može upisati“ od „mora/treba verificirati“: ako je `isEnabled`, tražiti `MFA_REQUIRED` bez obzira na `allowOptional`; `allowOptional=false` da zabrani samo *novi* upis. |
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
| Funkcionalnost | **9 / 10** | Sve što RAW traži i cijeli paket 2.1 rade: dva provajdera, prisilna promjena, TOTP s QR-om, rezervni kodovi, registar sesija, „odjavi sve“, reset MFA-a. Tiha degradacija kod `allowOptional=false` je zatvorena u paketu 5.1 (nalaz #1); zamjerka ostaje na dijeljenom brojaču neuspjeha (`email+IP`) i neslanom SHA-256 za rezervne kodove. |
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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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

**B1 — `SREDNJE` — brisanje OU-a koja ima grupu (ili imovinu, promjenu, KB, routing/SLA pravilo) vraća 500. `[ZATVORENO 2026-10-06 · 5.1.2]`**
`delete-organizational-unit.ts:20–25` provjerava samo podređene OJ-e i mapirane korisnike, pa `prisma.organizationalUnit.delete`
(`:26`) padne na FK restrikciji: `Group.organizationalUnit` je `onDelete: Restrict`
(`backend/prisma/schema/identity.prisma:182`), `Asset`/`AssetContract`/`AssetSignatory` (`assets.prisma:176,237,270`),
`ChangeRequest` (`changes.prisma:88`), `KnowledgeArticle` (`knowledge.prisma:39`), `RoutingRule`
(`catalog.prisma:121`). `map-organizational-unit-error.ts:34–36` propušta nepoznatu grešku dalje, a zajednički
filter je pretvara u `500 INTERNAL_ERROR` (`common/request-context/format-error-response.ts:21–31,50–55`).
**Uticaj:** admin dobije „Brisanje nije uspjelo“ bez razloga; ne zna da prvo mora obrisati grupu. **Fix:** dodati
provjere svih restriktivnih relacija (409 s kodom) i/ili generičko mapiranje Prisma `P2003`.

**B2 — `SREDNJE` — brisanje OU-a tiho briše dodjele rola, bez audita i bez invalidacije keša. `[ZATVORENO 2026-10-06 · 5.1.2]`**
`UserRole.organizationalUnit` je `onDelete: Cascade` (`identity.prisma:155`), pa se dodjele `ADMIN`/`AGENT` vezane
za tu OJ brišu zajedno s njom; `delete-organizational-unit.ts` poziva samo `invalidateOrganizationalUnitScopeCache()`
i **ne** obavještava pogođene korisnike (kontrast: `groups/add-group-member.ts:35` i `users/assign-user-role.ts:109`
to rade kroz `PrincipalContextInvalidator`). **Uticaj:** korisnik ostaje bez dozvole bez ijednog zapisa zašto, a
keširani principal kontekst živi do 60 s (`common/principal-context/principal-context.cache.ts:9`). **Fix:**
prikupiti pogođene `userId` prije brisanja i pozvati `invalidateUsers`; upisati audit.

**B3 — `SREDNJE` — izmjene korisnika, OU-a i grupa nisu u audit logu. `[ZATVORENO 2026-10-06 · 5.1.2]`**
`grep -rn appendAuditLog backend/src/modules/{users,organizational-units,groups}` daje samo
`users/assign-user-role.ts:92` i `users/remove-user-role.ts:35`; `create-user.ts`, `update-user.ts`,
`delete-user.ts`, `reset-user-temporary-password.ts`, `unlink-user-directory-identity.ts`,
`organizational-units/*` i `groups/*` ga ne zovu. **Uticaj:** nema traga ko je kreirao/obrisao nalog, resetovao
lozinku, prepisao OU granu ili dodao člana grupe — suprotno RAW `:173`. **Fix:** `appendAuditLog` u istim
transakcijama, s `metadata` prije/poslije.

**B4 — `SREDNJE` — `POST /users/:id/reset-password` ne provjerava `isLocalOnly`, a reset pretvara nalog u lokalni. `[ZATVORENO 2026-10-06 · 5.1.2]`**
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
| Funkcionalnost | **8 / 10** | Početna ocjena; B1–B4 su zatvoreni korakom 5.1.2, a ocjena se ponovo vrednuje na kraju paketa 5.1. Manjkav Manager sync ostaje otvoren. |
| Kvalitet koda | **8 / 10** | Dosljedna podjela po operaciji, domen-greške i solidna transakciona logika (prepisivanje DN-a potomaka, atomsko preuzimanje plana). Gube bodovi zbog raspoređenih invarijanti i duplirane fallback logike u `create-group`/`update-group`. |
| Sigurnost | **7 / 10** | Početna ocjena; B2–B4 su zatvoreni korakom 5.1.2 (audit, 409 za nelokalni reset i invalidacija pogođenih principal cacheva). B5 — zaštita posljednjeg SuperAdmin-a — ostaje otvoren; ocjena se ponovo vrednuje na kraju paketa. |

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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
| Default mapping (`:195–216`) | Standardni mapping aktivan odmah | Upisuje se pri instalaciji (`install/seed-install-minimum.ts:31`, val 0) + CLI za postojeće instalacije | **Implementirano** |
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

**B1 — `RIJEŠENO` *(val 0, 2026-10-03; prijavljen kao `VISOKO`)* — default mapping rola → permisije se nikad
nije upisivao u bazu; svježa instalacija davala je ADMIN/AGENT naloge bez ijedne permisije.**
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
**Riješeno (val 0):** `install/seed-install-minimum.ts:31` poziva `seedDefaultRolePermissions`
(`rbac/seed-default-role-permissions.ts:52–133`) odmah poslije minimalnog seed-a, pa i svježa instalacija i
ponovljen korak čarobnjaka upisuju role s default permisijama; za postojeće instalacije postoji
`npm run cli:seed-role-permissions [--dry-run]` (`cli/seed-default-role-permissions.ts:26–75`). Postupak je
aditivan i idempotentan (nikad ne briše), o upisu ostavlja audit `role_permission.replace` s
`via: 'seed-default-role-permissions'`, a `authorizationRoleNames` (`authorization.constants.ts:21–30`) postao
je jedini izvor naziva sistemskih rola. Detalji i dokazi: `# Val 0 — popravka M4/B1` na kraju dokumenta.

**B2 — `SREDNJE` — preview uticaja nije serverska kapija, a razlog promjene se ne pamti.** → ✅ **zatvoreno u
paketu 5.1 (2026-10-06, korak 5.1.1/B1)**: pregled izdaje potpisanu potvrdu (`role-permission-preview-token.ts`,
HMAC nad `private.auth.jwtSigningSecret`, 15 minuta, vezana za rolu + tačan skup permisija + pregledača), `PUT`
je bez nje odbija (`409 PREVIEW_REQUIRED`), a zastario ili tuđi pregled daje `409 PREVIEW_STALE`; `reason` je
obavezan (≤ 500) i uz `previewedAt` ulazi u audit `metadata` (`replace-role-permissions.ts`).
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
| Funkcionalnost | **9 / 10** | *Re-ocjena u valu 0 (2026-10-03; prije 7).* Sve komponente postoje (63 permisije, scope po OU/servisu, preview, read-only režim, sesija s dozvolama), a B1 je riješen — default mapping se upisuje pri instalaciji, pa ADMIN/AGENT rade odmah. Preostaje serverski neobavezan preview (B2). |
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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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
- `resolve-create-form-version-ref.ts`: čita `ServiceFormsConfiguration`; `enabled=false` vraća `null`, inače bira
  aktivnu verziju, a kad `requireVersionOnTicket=false` dopušta `null` ako aktivne nema; proslijeđeni ref i dalje
  mora pripadati servisu i biti `ACTIVE`.
- `create-ticket.ts` učitava šemu verzije i poziva `validateServiceFormData` prije upisa; `update-ticket.ts` radi
  isto za samo poslana polja (`partial: true`), odbija čišćenje required polja i spoji validirani patch s
  postojećim JSON-om. Unknown keys i nevažeći tip/opseg daju `TicketsError('FORM_DATA_INVALID')` s listom
  `{ fieldId, code: 'REQUIRED'|'INVALID' }`. Validator je `service-catalog/validate-service-form-data.ts`;
  DTO i dalje ograničava samo top-level oblik, pa je šema vezanog tiketa izvor pravila.
- Required polja: `apply-ticket-resolution.ts:34–52` poziva `collect-missing-required-fields.ts`, koje na
  prelasku u `RESOLVED/CLOSED` provjerava close code, resolution note, `globalRequiredOnResolve` +
  `byService[serviceId]` i — ako je `enforceSchemaRequiredFields` — `required` polja iz šeme vezane za tiket
  (`read-form-schema-fields.ts:4–10`, greška `REQUIRED_FIELDS_MISSING` s listom polja).
- `bindTicketFormVersionRef` (stari helper koji je upisivao probni tiket) i `service-forms.ticket-binding.spec.ts`
  uklonjeni su; `resolveTicketFormVersion` je sada korišten kroz `GET /tickets/:ticketId/form`.
- `tickets.controller.ts` izlaže taj read-only endpoint, a `tickets.service.ts#getFormById` prvo prolazi kroz isti
  `getTicket` visibility gate kao detalj tiketa; `resolve-ticket-form-version.ts` vraća vezanu šemu i podatke,
  odnosno `formVersionRef: null` i `schema: null` bez veze. Ciljani testovi provjeravaju autorizaciju, no-form
  odgovor i da čitanje ne mijenja logove.
- Frontend `ticket-detail-page.tsx` pribavlja šemu kroz `useTicketForm`; `TicketFormDataView`/`formatTicketFormData`
  prikazuju oznake i nazive opcija iz te šeme, tipizirane booleane/brojeve te nepoznate ključeve pod izvornim
  nazivom kao odbrambeni fallback. Zaglavlje/sidebar i dalje prikazuju broj vezane verzije forme.

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
- `components/tickets/create-ticket-form.tsx`: dohvat forme i `formsEnabled` + `requireVersionOnTicket` iz
  `GET /services/:serviceId/form`; forme isključene sakrivaju sekciju, a uključene/optional bez aktivne verzije
  ne blokiraju prijavu. `validateServiceFormData` daje klijentski feedback; server ponavlja provjeru.
- `components/tickets/service-form-fields.tsx:32–162`: render po tipu (checkbox za boolean, textarea, select,
  input s `number|email|date|datetime-local`), a11y atributi i sažetak grešaka.
- `ticket-detail-page.tsx` + `use-ticket-form.ts` koriste `GET /tickets/:ticketId/form`; `ticket-form-data-view.tsx`
  prikazuje vrijednosti s labelama/opcijama iz vezane šeme, a `format-ticket-form-data.ts` zadržava unknown keys.
- i18n: `tickets.form.required|invalid` mapiraju serverske `REQUIRED`/`INVALID` greške na postojeće poljske
  poruke; `tickets.errorFormVersionMissing` ostaje za obaveznu verziju bez aktivne forme; `tickets.detail.formData`,
  `formBooleanTrue|formBooleanFalse` i `formVersion*` pokrivaju schema-backed detalj.

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Servis se bira iz kataloga (kategorije → servisi) | drvo kategorija + lista servisa | `ServiceCategory` drvo s parent provjerama; `GET /services` s filterima lifecycle/kategorija/`offeredOnly` | **Implementirano** |
| Svaki servis ima „smart“ formu (schema, obavezna polja, validacija) | validacija šeme i **vrijednosti** na serveru | šema se validira pri pisanju; `validateServiceFormData` provjerava create/update vrijednosti prema vezanoj šemi i odbija nepoznata polja | **Implementirano (M6 B1 zatvoren 2026-10-06)** |
| 1:1 servis → form schema | jedna forma po servisu | `createServiceForm` odbija drugu formu (`FORM_ALREADY_EXISTS`); verzije su 1:N | **Implementirano** |
| Form versioning (aktivna verzija za nove tikete, referenca na tiketu) | kako piše u RAW-u | `selectActiveFormVersionRef` + nullable `Ticket.formVersionId`; aktivna verzija se veže kad je forms feature uključen; config može dopustiti tiket bez reference | **Implementirano (M6 B4)** |
| Schema evolucija + prikaz istorijskih tiketa prema `formVersionRef` | detalj tiketa renderuje po šemi te verzije | `GET /tickets/:ticketId/form` vraća vezanu šemu; UI koristi oznake/opcije i zadržava fallback za nepoznate ključeve | **Implementirano (M6 B5 zatvoren 2026-10-06)** |
| Structured form data za analitiku | upis uz validaciju | create/update validiraju podatke uz `REQUIRED`/`INVALID`; nepoznati ključevi se odbijaju | **Implementirano (M6 B1 zatvoren 2026-10-06)** |
| Lifecycle `DRAFT` vidljiv samo adminima | serverska provjera po roli | `get-service.ts`, `list-services.ts` i service-form GET filtriraju lifecycle na serveru | **Implementirano (M6 B2 zatvoren u valu 2, 2026-10-04)** |
| Status servisa i downtime ne blokiraju tikete | informativno, non-blocking | `runtimeAvailability` + prozori; `ticketCreationAllowed: true`; `REASON_REQUIRED` za izmjene po postavci | **Implementirano** |
| Postavke `private.ticket.forms.*` | `enabled` i `requireVersionOnTicket` upravljaju tokom tiketa | `ServiceFormsConfigurationLoader` se koristi u kreiranju; forms response izlaže obje postavke UI-ju; `schemaRegistryJson` nije registrovan | **Implementirano za postojeće postavke (M6 B4 zatvoren 2026-10-06); registry ostaje van koda** |
| Smart required fields (global + per-service) | blokada resolve/close | `collect-missing-required-fields` + `REQUIRED_FIELDS_MISSING` s listom polja | **Implementirano** |
| Onboarding wizard do aktivacije servisa | provjere svih koraka prije `ACTIVE` | 5 koraka; finalize provjerava formu/routing/SLA/approvals i postavlja `ACTIVE` + `slaProfileId` | **Implementirano** |
| Katalog i forme u config verzijama | snapshot/rollback | `collect-config-snapshot.ts` uključuje servise i `formVersion` zapise | **Implementirano** |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Dobra strana.** Modul je najbolje strukturiran dio aplikacije do sada: parseri šeme su čiste funkcije s
  preciznim kodovima grešaka, verzionisanje je stvarno implementirano (a ne samo nagoviješteno), lifecycle i
  dostupnost su razdvojeni, a onboarding wizard ima pravu serversku validaciju koraka i transakcioni finalize.
  Test pokrivenost je ozbiljna (20 spec fajlova u `service-catalog/`, 7 u `service-onboarding/`, e2e
  `01-ticket-create` prolazi katalog → formu → KB → pregled).
- **Glavna ranija zamjerka — zatvorena u koraku 5.1.3.** `validateServiceFormData` sada provjerava vrijednosti
  na serveru pri kreiranju i izmjeni, uz unknown-key rejection i poljske kodove `REQUIRED`/`INVALID`; klijentska
  provjera ostaje za raniji feedback, ne kao sigurnosna granica.
- **Vidljivost `DRAFT` — zatvorena u valu 2 (2026-10-04).** Liste, detalj usluge i čitanje forme provjeravaju
  lifecycle po roli na serveru (M6 B2).
- **Tok konfiguracije — zatvoren u koraku 5.1.3 za postojeće postavke.** `enabled` i `requireVersionOnTicket`
  utiču na vezivanje forme pri kreiranju; forme GET response izlaže oba flag-a UI-ju. RAW `schemaRegistryJson`
  i dalje nije registrovan ni implementiran i nije opisan kao živa postavka.
- **Veza tiketa i forme — zatvorena u koraku 5.1.3.** Mrtvi mutator `bindTicketFormVersionRef` i test su
  uklonjeni; read-only `GET /tickets/:ticketId/form` koristi `resolveTicketFormVersion` i istu vidljivost kao
  detalj, a UI prikazuje po šemi vezanoj za tiketu.

## 7. Otkriveni bug-ovi i neusklađenosti

**B1 — `SREDNJE` — server ne validira `formData` prema šemi forme.** → ✅ **zatvoreno u paketu 5.1.3
(2026-10-06)**

**Nalaz prije popravke:** `create-ticket.ts`/`update-ticket.ts` su vrijednosti castali u `Prisma.InputJsonValue`;
provjera required polja postojala je samo pri `RESOLVED/CLOSED`. Klijent je mogao poslati nepoznata polja,
pogrešne tipove ili vrijednosti izvan opsega.

**Popravka:** `service-catalog/validate-service-form-data.ts` provjerava top-level oblik, nepoznate ključeve,
required, tipove, dužine, pattern, numeric/integer/min/max i min/max stavki. Create validira cijeli objekat;
update validira poslani patch, odbija brisanje required polja i nakon uspjeha spoji ga s postojećim JSON-om.
Greška je `FORM_DATA_INVALID`, s `details.fields[]` kodiranim `REQUIRED`/`INVALID`; UI koristi postojeće
`tickets.form.required|invalid` poruke. Testovi: `validate-service-form-data.spec.ts` i
`tickets.form-validation.spec.ts`.

**B2 — `SREDNJE` — `DRAFT` usluge i njihove forme bile su vidljive svakom prijavljenom korisniku preko API-ja.**
→ ✅ **zatvoreno u valu 2 (2026-10-04)**

**Nalaz prije popravke:** method roles su dozvoljavale `USER|AGENT|ADMIN|SUPER_ADMIN`, dok liste, detalj usluge
i `GET /services/:id/form` nisu dosljedno filtrirali lifecycle; direktan API poziv mogao je otkriti nacrt i njegovu
šemu.

**Popravka:** `requestedServiceLifecycles` i `isServiceLifecycleVisible` filtriraju katalog/listu, detalj i čitanje
forme prema roli; skriveno stanje odgovara kao `NOT_FOUND` ili prazna lista. `service-catalog.lifecycle.spec.ts`
provjerava da se nacrt ne može enumerisati niti dohvatiti preko form rute.

**B3 — `SREDNJE` — servis se može aktivirati bez aktivne verzije forme.** → ✅ **zatvoreno u paketu 5.1.3
(2026-10-06)**

**Nalaz prije popravke:** ručna lifecycle aktivacija provjeravala je samo dozvoljeni prelaz i routing pokrivenost;
onboarding je bio jedini put koji tražio aktivnu formu.

**Popravka:** `transitionServiceLifecycle` sada zove `selectActiveFormVersionRef` prije upisa lifecycle-a i
mapira odsustvo verzije na `409 NO_ACTIVE_FORM_VERSION`; usluga ostaje neaktivna. Regresija u
`service-catalog.lifecycle.spec.ts` provjerava odbijanje i nepromijenjeni lifecycle.

**B4 — `SREDNJE` — postavke formi ne utiču na kreiranje tiketa.** → ✅ **zatvoreno u paketu 5.1.3
(2026-10-06)**

**Nalaz prije popravke:** `enabled` i `requireVersionOnTicket` nisu se koristili u create toku, a kolona
`Ticket.formVersionId` nije mogla predstavljati tiket bez forme.

**Popravka:** `TicketsService` učitava `ServiceFormsConfiguration`; `resolveCreateFormVersionRef` implementira
tri ishoda: isključeno → `null`; uključeno + verzija opcionalna → aktivna verzija ako postoji, inače `null`;
verzija obavezna → postojeći `FORM_VERSION_REQUIRED` ako je nema. `GET /services/:serviceId/form` izlaže
`formsEnabled` i `requireVersionOnTicket`; UI skriva formu kad je feature isključen i dopušta nastavak bez
verzije kad je opcionalna. `Ticket.formVersionId` je nullable kroz migraciju
`20270313090000_ticket_form_version_optional`. Dokazi: `resolve-create-form-version-ref.spec.ts`,
`tickets.form-configuration.spec.ts`, `service-forms.service.spec.ts`, frontend readiness test.

**B5 — `SREDNJE` — detalj tiketa ne renderuje formu prema vezanoj verziji; pripadajuće metode su mrtve.**
→ ✅ **zatvoreno u paketu 5.1.3 (2026-10-06)**

**Nalaz prije popravke:** detail prikazivao je sirove JSON ključeve, a helperi za vezivanje verzije nisu imali
production pozivaoca.

**Popravka:** `GET /tickets/:ticketId/form` je read-only i prolazi isti `getTicket` authorization/visibility gate
kao detalj; vraća `formVersionRef`, šemu i `formData` (uz `ticketId`/`serviceId`), ili `null` vezu/šemu bez
forme. UI formatira labele, opcije, boolean/numeric vrijednosti i zadržava fallback za ključeve koji više nisu
u šemi. Stari `bindTicketFormVersionRef` i pripadajući spec uklonjeni; `resolveTicketFormVersion` je korišten
za read path. Dokazi: `tickets.form-read.spec.ts`, `format-ticket-form-data.spec.ts`.

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

**Dodato u početnom M6 vodiču:**
- `docs/user-guide/katalog-usluga-i-forme.md` — čemu služi, kome je namijenjen (ADMIN/SUPER_ADMIN za uređivanje,
  svi za prijavu tiketa), kako se dolazi (**Usluge i znanje → Usluge** ili putanja ekrana), korak-po-korak
  (grupe usluga, nova usluga, forma i verzije, aktivacija, onboarding čarobnjak, zakazivanje prekida), tabele
  polja/validacija i statusa s tačnim nazivima iz UI-a, česta pitanja i greške, poznata ograničenja (B1–B7) i
  povezani moduli.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T36** (lifecycle i vidljivost), **T37** (jedna forma po servisu + verzionisanje
  i nepromjenjivost), **T38** (šema forme i serverska validacija vrijednosti), **T39** (upis forme + zasebna
  required polja pri resolve/close), **T40** (onboarding čarobnjak i šta
  finalize postavlja), **T41** (status i prekidi ne blokiraju prijavu tiketa).

**Ažurirano u paketu 5.1.3 (2026-10-06):** `katalog-usluga-i-forme.md` više ne tvrdi da se vrijednosti
forme ne validiraju na serveru, da se aktivacija može obaviti bez forme, da postavke nemaju efekta ili da detalj
prikazuje samo sirove ključeve. Dodata su pravila `FORM_DATA_INVALID`/`REQUIRED`/`INVALID`, ponašanje
`enabled`/`requireVersionOnTicket`, greška `409 NO_ACTIVE_FORM_VERSION` i ograničenja stvarno postojeće validacije.
`tiketi.md` opisuje ista pravila, `GET /tickets/:ticketId/form` i schema-backed prikaz; T36–T39/T104 u tezama su
usklađeni, a „Šta je novo“ dobio je korisnički sažetak.

**Ostaje otvoreno:** `[NEJASNO]` — `private.ticket.forms.schemaRegistryJson` (RAW `:567`) ne postoji u kodu ni u
`setting-keys.ts`; nije jasno da li je registry zamišljen kao alternativa koloni `FormVersion.schema` ili kao
keš. Do odgovora dokumentacija ne spominje tu postavku.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **8 / 10** | Katalog, lifecycle, verzionisanje, serverska create/update validacija, konfigurabilna veza tiketa i šeme, schema-backed detalj, dostupnost i onboarding rade i imaju ciljane testove. Otvoreni su manji zaostaci kataloga (M6 B6–B9) i RAW `schemaRegistryJson` nije implementiran. |
| Kvalitet koda | **8 / 10** | Parser/validator šeme i vrijednosti imaju odvojene testove, tok konfiguracije je tipiziran, a read path forme je odvojen od mutacija. Preostalo: nepotpun diff/change log za izmjenu usluge (B6), mrtav `SLUG_IMMUTABLE` (B8) i N+1 na katalogu (B9). |
| Sigurnost | **8 / 10** | Vidljivost usluga/formi je serverski filtrirana (B2), `formData` se validira na serveru (B1), a route čitanja forme koristi isti tiket visibility gate (B5). Role + permisije + service scope + read-only režim i audit ostaju kapije. |

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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

### B2 — SREDNJE — `private.changeLog.routing.enabled` je registrovana, ali je niko ne čita → ✅ **zatvoreno u valu 5 (2026-10-05) uklanjanjem svih pet mrtvih `private.changeLog.*` postavki**

- **Fajl/linija (stanje prije popravke):** `backend/src/modules/settings/setting-keys.ts:209`,
  `backend/src/modules/settings/definitions/change-log-settings.ts:16`; zapis se izvodi bez provjere u
  `backend/src/modules/routing/persist-routing-rule-change.ts:44–56`, `update-routing-rule.ts:64–76`,
  `delete-routing-rule.ts:79–91`. Danas: nijedan `private.changeLog.*` ključ ne postoji u registru
  (`grep -rn "changeLog" backend/src/modules/settings/setting-keys.ts` → nula pogodaka).
- **Opis:** RAW (`:726`) traži prekidač „change log za routing pravila (default true)“, ali nijedan potrošač ne
  čita ključ; svaka izmjena pravila se uvijek bilježi.
- **Uticaj:** admin koji isključi zapis ne dobija nikakvu promjenu ponašanja — tiha neusklađenost postavke i
  stvarnog rada.
- **Odluka (2026-10-05):** zapis izmjena je **namjerno bezuslovan** (dnevnik je auditni trag modula), pa prekidač
  nije dobio potrošača; uklonjeno je pet postavki bez efekta (`settings.enabled`, `routing.enabled`, `sla.enabled`,
  `includeDiff`, `requireReason`) zajedno s kategorijom „Dnevnik izmjena“ i prijevodima — vidi
  `# Popravke poslije vala 4` §4.
- **Ozbiljnost:** SREDNJE.

### B3 — SREDNJE — Preview rutanja postoji, ali ga ekran za prijavu ne koristi → ✅ **popravljeno u valu 5 (2026-10-05)**

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

### B5 — NISKO — Postavke `private.ticket.priorityMatrix.*` ne postoje, a ose se razlikuju od RAW-a → ✅ **prekidač dodat u valu 5 (2026-10-05); ose ostaju dokumentovano odstupanje**

- **Fajl/linija:** `backend/src/modules/settings/setting-keys.ts` (nema nijednog `priorityMatrix` ključa);
  `backend/src/modules/tickets/resolve-ticket-priority.ts:28–44` (uvijek čita tabelu, fallback na formulu);
  `backend/prisma/schema/enums.prisma:28–40` (`TicketImpact`/`TicketUrgency` = `LOW|MEDIUM|HIGH|CRITICAL`).
- **Opis:** RAW (`:496–499`) traži `enabled`, CSV liste osa i `rulesJson`; u kodu je matrica tabela bez
  prekidača, a ose su numeričke umjesto `self,team,unit,company` / `low,medium,high`.
- **Uticaj:** matrica se ne može isključiti; očekivanja iz RAW-a o osama nisu ispunjena (kod je sam sa sobom
  konzistentan, uključujući validaciju i snapshot).
- **Fix (isporučeno):** dodata je postavka `private.ticket.priorityMatrix.enabled`
  (`backend/src/modules/settings/definitions/ticket-priority-matrix-settings.ts`), loader
  `backend/src/modules/tickets/priority/ticket-priority-matrix-configuration.loader.ts` i opcija
  `matrixEnabled` u `resolveTicketPriority`; kad je isključena, prioritet se računa ugrađenom formulom i tabela se
  **ne čita**, a ćelije ostaju u bazi. Ose (`TicketImpact`/`TicketUrgency` = Nizak–Kritičan) ostaju odstupanje od
  RAW-a i stoje u vodiču kao poznato ograničenje.
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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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

### B1 — SREDNJE — `private.ticket.attachments.retentionDays` se čita, ali se ne primjenjuje → ✅ **popravljeno u valu 2 (2026-10-04)**

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

### B2 — SREDNJE — Rate limiter broadcasta je u memoriji procesa i bez evikcije → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl/linija:** `backend/src/modules/tickets/bulk/bulk-broadcast-rate-limiter.ts:1–18` (module-level `Map`,
  `consume` nikad ne uklanja ključ), limit iz postavke `bulk.constants.ts:13` (`broadcastRateLimitPerMinute: 10`).
- **Opis:** brojači su lokalni za proces i nikad se ne čiste, pa je limit „10 u minuti“ tačan samo za jednu
  instancu, a mapa raste sa svakim korisnikom koji je ikada poslao broadcast.
- **Uticaj:** u horizontalno skaliranom deploymentu stvarni limit je `N × 10`; memorija procesa raste
  (sporo, ali neograničeno).
- **Fix:** brojač u Redis-u (ili DB) s TTL-om ključa.
- **Ozbiljnost:** SREDNJE.

### B3 — NISKO — `private.ticket.savedViews.allowSharing` se validira, ali se vrijednost odbacuje → ✅ **zatvoreno u valu 5 (2026-10-05) uklanjanjem postavke**

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

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

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

### B1 — SREDNJE — Obavještenje o odobrenju ne može stići nikome → ✅ **popravljeno u valu 2 (2026-10-04)**

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

### B2 — SREDNJE — Tiket koji počne kao `UNROUTED` nikad ne prolazi odobrenje → ✅ **popravljeno u valu 2 (2026-10-04)**

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

### B3 — SREDNJE — CSAT agregacija po OU/servisu/grupi postoji, ali je UI ne koristi; skala je hardkodirana  → ✅ **popravljeno u valu 1 (2026-10-03)** za prikaz, skalu i prag na ekranu; serije na tabu Trendovi ostaju na konstanti (vidi `# Val 1 — nadzor i tačnost brojeva` §3)

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

### B4 — NISKO — `private.ticket.approvals.allowRequesterManager` je bez potrošača → ✅ **zatvoreno u valu 5 (2026-10-05) uklanjanjem postavke**

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

# M10 — SLA (rokovi, kalendari, eskalacije)

## 1. Planirano u RAW projektnom zadatku

- **SLA engine (professional)** je nosivi dio tiketa: pravila po **servis + OU + prioritet** uz **fallback
  default profil** (`RAW_PROJECT.md:80`).
- **Metrike:** *response time* = vrijeme do **prve smislene reakcije**, izričito **ne zavisi od individualnog
  assignee-a** (`:58`, `:83`); *resolution time* = vrijeme do `RESOLVED` (`:84`).
- **Business Hours kalendari:** SLA se računa **unutar BH kalendara** (npr. Pon–Pet 08:00–16:00), podržano je
  **više kalendara**, a praznici/neradni dani su dio kalendara i admin njima upravlja (`:85–88`).
- **Pause pravila (settings-driven):** pauza dok je tiket `WAITING_FOR_USER` (`:90`) i dok je
  `PENDING_APPROVAL` (`:91`).
- **Overdue + eskalacije:** upozorenja prije isteka (T-minus) (`:92`) i eskalacije po pravilima prema
  **roli/grupi/korisniku**, uz audit (`:93`).
- **Administracija (obavezno, CRUD):** admin može kreirati/mijenjati/brisati **BH kalendare, SLA profile i SLA
  rule setove**, a **svaka promjena ide kroz change log (reason + diff)** (`:95–97`).
- **Startni „must-use“ set:** kalendar `BH_STANDARD` (Pon–Pet 08:00–16:00, lokalna zona), profili
  `INCIDENT`, `ACCESS`, `STANDARD_REQUEST`, `FINANCE`, `HR` (`:98`) i **default priority baseline** za servise
  bez vlastitog override-a: P1 15m/4h, P2 1h/8h, P3 4h/3 BD, P4 1 BD/10 BD, sve u BH (`:99–106`).
- **Permisija:** `sla.write` je dio administratorskog seta (`:189`, `:213`).
- **Config verzije:** SLA je jedan od scope-ova koji se validira bez side-effecta („SLA rules completeness +
  sanity check (BH kalendari, profili, priority map)“, `:270`) i podržava **shadow mode** koji za nove tikete
  računa razliku pravila bez primjene (`:275–276`).
- **Postavke (RAW `:505–518`):** `private.ticket.sla.enabled`, `rulesJson`, `defaultCalendarKey`,
  `calendarsJson`, `profilesJson`, `pauseOnWaitingForUser`, `pauseOnPendingApproval`,
  `notifyBeforeOverdueMinutes`, `escalationsEnabled`, `escalationTargetsJson`, `escalations.inAppEnabled`,
  `escalations.emailEnabled`, `requireAdminReasonForRuleChanges`, `allowServiceOverrides`, `allowOuOverrides`,
  `maxEscalationLevels`.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Jedan sat za sve.** SLA sat mora biti jedna funkcija vremena i kalendara; svaki prikaz (panel tiketa,
   lista, izvještaj, skener) mora dati isti broj za isti tiket u istom trenutku.
2. **Pauza je stanje, ne prekidač.** Ako sat stane, mora se znati **kada** je stao i koliko je BH minuta
   potrošeno dok je stajao; nastavak mora pomjeriti oba roka za preostalo vrijeme, ne za „proteklo“.
3. **Skener ne smije rasti s brojem tiketa.** Zrelo rješenje ima indeksirani upit „šta je sljedeće na redu“,
   ograničenu veličinu ciklusa i vidljiv nadzor da skener uopšte radi.
4. **Eskalacija koja nikoga ne obavijesti je lažna sigurnost.** Ako pravilo nema metu, mora postojati
   definisan fallback (grupa, voditelj) ili eskalacija ne smije biti proglašena izvršenom.
5. **Kalendar je podatak, ne kod.** Praznici, vremenska zona i radno vrijeme se mijenjaju bez deploya.
6. **Izvještaj prati ono što menadžment pita:** usklađenost po **profilu, OU, servisu i prioritetu** i to za
   **sve tikete u prozoru**, ne samo za one koji su već terminalni.
7. **Izvor istine za „prvi odgovor“ je tiket, ne SLA modul.** Ako je SLA isključen, metrika prvog odgovora i
   dalje mora postojati.
8. **Promjena SLA pravila nikoga ne smije iznenaditi:** startni set, numeričke granice i posljedice (npr.
   „BD“ znači radni dan kalendara, ne 24 h) moraju biti dokumentovani u UI-u.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Fallback za eskalacije bez mete** (B1): ako je pravilo implicitno (`default`) ili mu meta ne postoji,
   poslati eskalaciju članovima handler grupe tiketa (ili je uopšte ne evidentirati kao „poslanu“).
2. **Popuniti praznine u satovima** (B2): periodični „backfill“ (npr. u skeneru, ograničen batch) koji za
   otvorene tikete bez `TicketSlaState` pokušava izračunati rok — sada tiket koji dobije profil poslije
   kreiranja ostaje bez SLA do sljedećeg događaja na tiketu.
3. **Proširiti izvještaj usklađenosti** (B3): dodati dimenzije OU/servis/grupa i uključiti tikete koji su u
   prozoru **prekršili** rok i prije nego što su zatvoreni.
4. **Odvojiti `firstResponseAt` od SLA modula** (B4): prvi agentski odgovor treba zapisivati u toku tiketa
   (kao i statusne promjene), a SLA modul neka ga samo čita.
5. **Ispraviti uzorak dnevnika skenera** (B5) tako da „preostalo“ bude stvarni broj (ili ukloniti polje) da
   nadzor ne daje lažnu sliku.
6. **Zatvoriti gap prema RAW-u u postavkama:** dodati `escalations.inAppEnabled` kao prekidač in-app kanala i
   odlučiti da li `escalationTargetsJson` ostaje samo u pravilima po profilu (dokumentovati odstupanje).

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Model, konstante i granice

- Modeli su u `backend/prisma/schema/sla.prisma`: `BusinessHoursCalendar` (`:1–12`, `key` unikatan, `weeklyHours` Json,
  `timezone`, `isActive`), `CalendarHoliday` (`:14–22`, unikatan `[calendarId, date]`), `SlaProfile` (`:24–41`,
  `calendarId` sa `Restrict`), `SlaRule` (`:43–62`, `priority`, `responseMinutes`, `resolutionMinutes`,
  `evaluationOrder`, opcioni OU/servis), `TicketSlaState` (`:64–95`, jedan po tiketu: rokovi, `respondedAt`,
  `resolutionCompletedAt`, `pausedAt`, `pausedBusinessMinutes`, četiri „mark“ polja, `firedEscalationKeys`,
  `nextDueAt`, indeksi `[resolutionCompletedAt, nextDueAt]`, `[respondedAt]`), `SlaEscalationRule` (`:97–116`,
  `triggerOffsetMinutes`, meta grupa/rola/korisnik + `targetOnCall`).
- Konstante `backend/src/modules/sla/sla.constants.ts`: veličina batch-a skenera **2000** (`:36`), granice
  (ključ 64, naziv 120, opis 2000, naziv praznika 120, **max 4 intervala dnevno**, `defaultEvaluationOrder: 100`,
  zona `Europe/Sarajevo`) (`:38–46`), `standardWeeklyHours` = **Pon–Pet 08:00–16:00** (`:52–58`), razlozi/akcije
  change loga i sistemskih događaja (`:10–26`), id implicitnog pravila eskalacije `default` (`:28`).
- Tipovi `sla.types.ts` i `sla.error.ts` (30 kodova grešaka, `:1–33`) su jedinstveni kontrakti za servis, DTO i
  mapiranje u HTTP (`map-sla-error.ts`).

### 4.2 Izračun rokova u radnom vremenu

- **Sabiranje BH minuta.** `add-business-minutes.ts:14–55` ide dan po dan: preskače praznike, nalazi prvi
  interval koji još traje ili sljedeći, troši minute i prelazi u sljedeći civilni dan preko
  `business-hours-civil-time.ts`; prekid petlje je 20.000 koraka, a nemoguć slučaj baca
  `CALENDAR_HAS_NO_BUSINESS_HOURS` (`:51–53`); `minutes <= 0` baca `INVALID_SLA_TARGETS` (`:19–21`).
- **Odbrojavanje minuta** između dva trenutka: `count-business-minutes.ts:13–59` (isti kalendar, `end <= start`
  vraća 0).
- **Validacija kalendara:** `parse-weekly-hours.ts:8–27` (samo dani `1..7`, najviše 4 intervala, bar jedan
  interval), `normalizeClock` dozvoljava `24:00` samo kao kraj (`:69–78`), a `toMinutes` (`:80–86`) je dijeli
  sa ostatkom modula; preklapanja i obrnuti intervali bacaju `OVERLAPPING_INTERVALS` (`:42–51`).
  Vremenska zona se provjerava `assert-valid-iana-timezone.ts` (koristi ga i config validacija).
- **Odabir pravila:** `resolve-matching-sla-rule.ts:11–60` — pravilo mora imati isti prioritet, a polja
  servis/OU moraju biti `null` ili jednaka; sortira se po `evaluationOrder`, pa po **specifičnosti**
  (servis = 2, OU = 1, `:4–9`), pa po `id`; fallback je pravilo bez OU i servisa.
- **Ciljevi:** `compute-sla-targets.ts:9–40` (profil → pravilo → kalendar → `addBusinessMinutes` od
  `startedAt`), izloženo i kao `GET /sla/rules/resolve`.
- **Procjena stanja:** `evaluate-ticket-sla-breach.ts:15–29` (`clock > dueAt`, flagovi se samo uključuju) i
  `evaluate-ticket-sla-at-risk.ts:46–64` (preostalo > 0 i ≤ `notifyBeforeOverdueMinutes`), a „efektivni sat“ je
  `pausedAt ?? now` (`compute-elapsed-sla-minutes.ts:8–13`), uz `elapsed = BH(startedAt → kraj) − pausedBusinessMinutes`
  (`:15–41`).

### 4.3 Životni ciklus tiketa: start, pauza, nastavak, prvi odgovor

- **Start:** `start-ticket-sla-timers.ts:13–92` uzima `service.slaProfileId` (`:19–25`), aktivan profil
  (`:26–31`), pravilo za prioritet/servis/OU (`:32–42`) i aktivan kalendar (`:43–46`); ako bilo šta od toga
  fali, **vraća `null`** i tiket ostaje bez SLA stanja. Rokovi se računaju od `ticket.createdAt` (`:47`), a ako
  je tiket već u pauza-statusu, `pausedAt` se postavlja na `startedAt` (`:66`).
- **Pauza/nastavak:** `apply-ticket-sla-pause.ts:3–11` pamti samo trenutak; `apply-ticket-sla-resume.ts:6–42`
  broji BH minute pauze, dodaje ih u `pausedBusinessMinutes` i **pomjera rokove** za preostalo BH vrijeme od
  `now` (ako je rok već prošao, ostaje nepromijenjen, `:37–40`).
- **Prelazi stanja:** `sync-ticket-sla-timers.ts:33–90` + `applyLifecycle` (`:109–152`): merge djeteta pauzira
  sat, unmerge ga nastavlja (`:121–128`); statusi iz `isSlaPauseStatus` (`is-sla-pause-status.ts:4–15`) daju
  pauzu, izlaz iz pauza-statusa daje nastavak (`:129–139`); prvi odgovor se evidentira na `agent_replied` ili
  prelaz u `IN_PROGRESS` (osim `user_resumed`/`scanned`, `:140–147`); terminalni statusi
  `RESOLVED|CLOSED|ARCHIVED` (`is-sla-pause-status.ts:17–19`) zaustavljaju sat (`:148–150`).
- **Prvi odgovor na tiketu:** nakon evidentiranog odgovora, `syncTicketSlaTimers` upisuje
  `ticket.firstResponseAt` (`:83–88` → `persist-ticket-sla-state.ts:51–60`). **To je jedini pisac** te kolone
  (osim testnih delegate-a), pa kad je SLA modul isključen ili servis nema profil, `firstResponseAt` ostaje
  `null` (nalaz B4).
- **Promjena prioriteta:** `recompute-ticket-sla-targets.ts:19–40` + `applyRecomputedSlaRule` (`:42–60`) —
  rok se mjeri iznova od `startedAt` uz vraćene pauze; ako je odgovor već zabilježen, njegov rok ostaje, a
  zabilježen prekršaj se **ne briše**; već opaljene eskalacije se čuvaju.

### 4.4 Skener rokova (worker) i `nextDueAt`

- Ciklus je **isključivo u worker procesu**: `sla-scan-worker.module.ts:10–27` registruje samo ono što skeneru
  treba, a `SlaScanProcessor` (`sla-scan.processor.ts:16–37`) zove `TicketSlaTimersService.scanDue()` i loguje
  uzorak (`format-sla-scan-sample.ts`).
- Raspored je BullMQ job svakih **60 s** sa 2 pokušaja i eksponencijalnim backoff-om 5 s
  (`sla-scan.constants.ts:9–16`), a `SlaScanSchedulerService` ga registruje idempotentno
  (`upsertJobScheduler`, `sla-scan.scheduler.service.ts:30–56`); ako Redis nije dostupan, boot ne pada, samo se
  zapiše `sla_scan_schedule_failed`.
- **Bounded upit:** `scan-due-ticket-sla-states.ts:33–43` čita `resolutionCompletedAt: null AND nextDueAt <= now`
  sortirano po `nextDueAt`, uz `take: batchSize` (2000), pa tikete jednim `id IN (...)` upitom (`:41–44`);
  stanja bez tiketa se preskaču (`:47–50`), a svako stanje se obrađuje kroz isti `syncTicketSlaTimers` sa
  događajem `scanned` (`:51–56`).
- **Kada se stanje vraća u red** računa `computeSlaNextDueAt` (`compute-sla-next-due-at.ts:54–75`):
  kandidati su `dueAt − notifyBeforeOverdueMinutes` (at-risk), `dueAt + 1 ms` (prekršaj) i `dueAt + offset`
  u BH minutama za neopaljene eskalacije (offset ≤ 0 ⇒ sam trenutak prekršaja), a `null` znači „ništa
  vremenski ne može promijeniti stanje“ (završeno ili pauzirano, `:64–66`).
- **Nadzor rada skenera:** ops-health alarm ako skener „kasni“ više od `private.ops.thresholds.slaScanLateMinutes`
  (default 5, opseg 2–60; `ops-settings.ts:16,60`, `evaluate-ops-signals.ts:143–155`).

### 4.5 Eskalacije i obavještenja

- **Odabir:** `listDueSlaEscalations` (`select-due-sla-escalations.ts:34–67`) gleda samo **prekršene** satove i
  pravila čiji je offset istekao (`isOffsetElapsed`, `:96–114`); ako profil nema nijedno pravilo, koristi se
  implicitno pravilo `default` sa offsetom 0 (`:44` i `:83–94`), pa se eskalacija evidentira odmah u trenutku
  prekršaja.
- **Evidencija bez ponavljanja:** `apply-due-sla-escalations.ts:9–24` dodaje ključeve `kind:ruleId` u
  `firedEscalationKeys`, pa se isto pravilo ne opali dvaput (`slaEscalationKey`, `:13–18`).
- **Događaji:** `emit-ticket-sla-runtime-events.ts:24–85` upisuje at-risk događaje (osim ako sat prekrši u
  istoj evaluaciji, `:95–101`), prekršaje i eskalacije; `record-ticket-sla-runtime-event.ts:23–49` piše change
  log (`entityType: ticket_sla_state`, akter `null`, snimka stanja kroz `to-ticket-sla-state-snapshot.ts`),
  sistemsku poruku (`insertSystemTicketEvent`, `action:detail`) i šalje realtime/in-app obavještenje.
- **Primaoci:** `resolve-sla-notification-recipients.ts:14–35` — za at-risk/prekršaj to su **assignee + članovi
  grupe**, a za eskalaciju meta iz pravila: korisnik → rola → *on-call* (ako je uključen i neko je na
  dežurstvu, uz audit `on_call_escalation_notified`) → članovi grupe (`:48–91`). Za at-risk/prekršaj in-app
  audience je optimizovana na „assignee lično + jedna red grupe“ (`resolve-notification-recipients.ts:110–130`).
  **Ako je pravilo implicitno `default`, `findUnique` ne nalazi red i vraća praznu listu — eskalacija tada ne
  obavještava nikoga** (nalaz B1).
- **E-mail:** samo za eskalacije i samo ako je uključena postavka `private.ticket.sla.escalations.emailEnabled`
  (`fan-out-email-notifications.ts:171–183`; `load-email-channel-configuration.ts:81–106`); tip obavještenja je
  `ticket.sla` (`notifications.constants.ts:8`), a preferencije ga drže „zaključanim“ za e-mail i
  izuzetim od tihih sati (`notification-preference-settings.ts:11,15`).

### 4.6 Administracija i change log

- **Kontroleri** (`@Controller('sla/…')`) su iza `SessionAuthenticationGuard` + `RoleGuard` sa
  `@RequireRoles(admin)` (`sla-profiles.controller.ts:31–34`, `sla-rules.controller.ts:41–44`,
  `sla-calendars.controller.ts:37–40`, `sla-escalation-rules.controller.ts:39–42`), a svaka izmjena traži i
  `@RequirePermissions(permissionKeys.slaWrite)` (npr. `sla-profiles.controller.ts:45–52`); čitanja ne traže
  permisiju. Prioritetna matrica je izuzetak: `GET /priority-matrix` je dostupan svim rolama, a izmjena je
  admin + `sla.write` (`priority-matrix.controller.ts:40–68`).
- **Razlog je uvijek obavezan:** svaki write input nosi `reason`, a to je pokriveno testom
  `sla-admin-reason-always-required.spec.ts` i kontekstom `read-sla-mutation-context.ts`; promjene idu kroz
  `record-sla-change.ts`/`list-sla-change-logs.ts` (change log sa `before`/`after` snimkom).
- **Konstrainti:** jedinstvenost i opseg ključa/naziva/zone, zatvoreni set intervala i praznika
  (`assert-sla-rule-constraints.ts`, `assert-sla-escalation-constraints.ts:13–35,76–138`), provjera postojanja
  OU/servisa (`:6–31`) i meta eskalacije (grupa/rola/korisnik, `:37–74`); `maxEscalationLevels` ograničava broj
  pravila po profilu (`:76–95`), a offseti moraju biti strogo rastući i jedinstveni (`:97–138`).
- **Override prekidači se poštuju pri upisu:** `normalize-sla-rule-values.ts:56–60` baca
  `SERVICE_OVERRIDE_DISABLED` / `OU_OVERRIDE_DISABLED` ako je odgovarajuća postavka isključena.
- **Prioritetna matrica:** `list-priority-matrix.ts:24–60` na čitanju **dopunjava** nedostajuće ćelije
  zadanim vrijednostima (`buildDefaultPriorityMatrix` = sve kombinacije impact × urgency iz
  `tickets.constants.ts`), a `patch-priority-matrix.ts:25–72` upisuje ćelije u transakciji i uz `reason` bilježi
  change log (`entityId: 'global'`).
- **Startni set:** `starting-sla.constants.ts:5–13` (`BH_STANDARD` + pet profila), raspored profila
  `:74–126` (npr. `STANDARD_REQUEST` P1 15m/4h, P2 1h/8h, P3 4h/3 BD, P4 1 BD/10 BD — identično RAW baseline-u,
  dok su `INCIDENT`/`ACCESS`/`FINANCE`/`HR` stroži), a „BD“ se pretvara u minute preko **prvog radnog dana u
  kalendaru** (`to-starting-sla-minutes.ts:9–34`). Startna eskalaciona ljestvica je 0/30/120 min prema roli
  `ADMIN` (`starting-sla.constants.ts:38–45`).
- **Config verzije:** `validate-sla-snapshot.ts` bez side-effecta provjerava zone i `weeklyHours`, sanity
  `normalizeSlaTargets` po pravilu, postojanje kalendara profila i **pokrivenost sva četiri prioriteta**
  pravilom bez OU/servisa (`SLA_PRIORITY_INCOMPLETE`), te pokrivenost ćelija prioritetne matrice;
  `apply-sla-snapshot.ts` primjenjuje snimku (upsert kalendara/profila/pravila + brisanje i ponovni upis
  praznika), a `compute-shadow-diff.ts:4–34,67–90` broji koliko bi tiketa promijenilo pravilo.

### 4.7 Usklađenost i izvještaji

- **Endpoint `GET /sla/compliance`** je admin-only (`sla-compliance.controller.ts:18–37`), prozor je
  `days` 1–365 (default 30, `dto/sla-compliance-query.dto.ts:5–12`; `aggregate-sla-compliance.ts:9–20`).
- **Uzorak:** `load-sla-compliance-rows.ts:20–57` čita `TicketSlaState` sa profilom **samo za terminalne
  tikete** (`RESOLVED|CLOSED|ARCHIVED`) i uzima `closedAt ?? resolvedAt` kao trenutak završetka; sve ostalo se
  odbacuje.
- **Agregacija:** `aggregate-sla-compliance.ts:30–85` daje po profilu `sampleCount` i
  `responseCompliancePercent`/`resolutionCompliancePercent` (procenat satova **bez** prekršaja, `null` kad
  nema uzorka); dimenzije OU/servis/grupa ne postoje u odgovoru.
- **Ekspozicija (dashboard/tickets):** `GET /reports/sla/summary` (`report-summary.controller.ts:56–62`) nije
  pod admin rolom — po komentaru u kodu (`:25–31`) brojevi prate **vidljivost tiketa** pozivaoca; frontend ih
  koristi u `buildSlaExposureIndex` (`frontend/src/lib/sla/sla-exposure-index.ts:28–49`) za prikaz po profilu i
  prioritetu, a nadzorna ploča ima listu prekršenih tiketa (`components/dashboard/dashboard-sla-watchlist.tsx`).
- **Trendovi:** prag `private.reports.trends.slaTargetPercent` (default 90, opseg 50–100;
  `report-trends.constants.ts:23,31`) ulazi u izračun trendova, a `private.reports.slaTargetPercent` je u
  postavkama (M5).

### 4.8 Frontend

- Ruta `/sla` je zaštićena `canOpenSla` → `canOpenAdminArea` (ADMIN/SUPER_ADMIN ili rola admin;
  `frontend/src/lib/session/route-access.ts:27–36,130–132`), a stranica ima tri prikaza — profili (lista +
  detalj), kalendari i prioritetna matrica (`pages/sla-page.tsx:44–122`).
- Modul ima 24 komponente u `frontend/src/components/sla/` (forme, tabele, detalj profila sa karticom
  usklađenosti `sla-profile-detail.tsx:130`, panel change loga, grid radnog vremena, ciljna polja eskalacija),
  plus `lib/sla/` (hookovi `use-sla-page-data`/`use-sla-page-mutations`, „exposure“ indeks, formatiranje
  radnog vremena, mapiranje grešaka) i `services/sla-api.ts` + `services/sla-types.ts`.
- **Panel na tiketu:** `components/tickets/ticket-sla-panel.tsx:49–140` crta dva sata (prvi odgovor,
  rješavanje), stanja OK/RISK/BREACHED (`:20–24`), a prag rizika u klijentu je `SLA_RISK_PERCENT = 75`
  (`lib/tickets/map-ticket-sla-panel.ts:4`); kontekst panela dolazi iz `load-ticket-sla-context.ts:46–100` sa
  razlozima `NO_PROFILE`, `PROFILE_INACTIVE`, `NO_RULE`, `NO_CALENDAR`, `NOT_APPLIED`.
- **i18n:** 149 ključeva `sla.*` u `bs` i `en`, plus 18 ključeva `tickets.detail.sla.*`.

### 4.9 Testovi

- U modulu je **24 spec fajla** (140 `.ts` ukupno), uključujući čistu matematiku
  (`add-business-minutes`, `count-business-minutes`, `parse-weekly-hours`, `compute-sla-next-due-at`,
  `resolve-matching-sla-rule`, `seed-starting-sla-profiles`), tokove (`sla.timers.spec.ts`, `sla.breach.spec.ts`,
  `sla.change-log.spec.ts`, `sla.calendars.spec.ts`, `sla.rules.spec.ts`, `sla-escalation-rules.spec.ts`,
  `sla-admin-reason-always-required.spec.ts`, `priority-matrix.spec.ts`) i regresiju „poplave“ obavještenja
  (`sla-notification-flood.spec.ts:19–46`) — plus `config-versioning.validate.spec.ts` za SLA snimku.
- **E2E** ima samo jedan scenario (`e2e/tests/07-sla.spec.ts:8–34`): provjeri da tiket nakon kreiranja ima
  `responseDueAt`/`resolutionDueAt` (ili `isOverdue`) i da se vidi u listi — nema scenarija za pauzu, prekršaj,
  eskalaciju, kalendar ni usklađenost.

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Pravila po servis + OU + prioritet, fallback | Deterministički izbor, dokumentovan redoslijed | `resolve-matching-sla-rule.ts:11–60` (priority → servis/OU → `evaluationOrder` → specifičnost → `id`) | ✅ |
| Response = prva smisljena reakcija, ne assignee | Sat vezan za tiket, ne za osobu | `respondedAt` na `agent_replied`/`IN_PROGRESS` (`sync-ticket-sla-timers.ts:140–147`) | ✅ |
| Resolution do `RESOLVED` | Terminalna stanja zaustavljaju sat | `isSlaTerminalStatus` = RESOLVED/CLOSED/ARCHIVED (`is-sla-pause-status.ts:17–19`) | ✅ |
| BH kalendari, više njih + praznici | Zona, praznici i intervali kao podatak | Modeli + CRUD + `Europe/Sarajevo` default, praznici po danu (`sla.prisma:1–22`) | ✅ |
| Pauza `WAITING_FOR_USER` / `PENDING_APPROVAL` | Simetrična pauza/nastavak bez gubitka vremena | `is-sla-pause-status.ts:4–15`; nastavak pomjera rokove (`apply-ticket-sla-resume.ts:6–42`) | ✅ |
| T-minus upozorenje | Jedno upozorenje po satu, bez šuma | `notifyBeforeOverdueMinutes` (30) + pravilo da se at-risk preskoči ako isti ciklus prekrši (`emit-ticket-sla-runtime-events.ts:95–101`) | ✅ |
| Eskalacije po roli/grupi/korisniku + audit | Meta je obavezna; eskalacija uvijek ima primaoca | Meta se validira (`assert-sla-escalation-constraints.ts:37–74`), ali **implicitno `default` pravilo nema primaoca** | ⚠️ B1 |
| Admin CRUD + change log (reason + diff) | Svaka izmjena auditovana | Kontroleri + `sla.write` + uvijek obavezan razlog + `recordSlaChange` | ✅ |
| Startni set (BH_STANDARD + 5 profila + baseline) | Defaulti tačno kao u RAW-u | `starting-sla.constants.ts:5–13,74–126`; `STANDARD_REQUEST` = RAW baseline, ostali stroži | ✅ (odstupanje dokumentovati) |
| `sla.write` za ADMIN | Permisija na svim izmjenama | `@RequirePermissions(sla.write)` na POST/PATCH/DELETE | ✅ |
| Config verzije: SLA validacija bez side-effecta | Zone, intervali, pokrivenost prioriteta, matrica | `validate-sla-snapshot.ts:15–70` (`SLA_PRIORITY_INCOMPLETE`, provjera matrice) | ✅ |
| Shadow mode (opciono) | Broj tiketa koji bi promijenili pravilo | `compute-shadow-diff.ts:4–34,67–90` | ✅ |
| Postavke `rulesJson/calendarsJson/profilesJson/defaultCalendarKey` | Konfiguracija kao podatak | Ne postoje; konfiguracija je u **DB tabelama** (kalendari/profili/pravila) | ➖ svjesno odstupanje |
| `escalationTargetsJson` / `escalations.inAppEnabled` | Prekidač in-app kanala | Ne postoje; meta je na pravilu, in-app je uvijek uključen | ⚠️ gap |
| `escalations.emailEnabled` | E-mail kao dodatni kanal | `private.ticket.sla.escalations.emailEnabled` (default false) | ✅ |
| `requireAdminReasonForRuleChanges` | Razlog obavezan kad je uključeno | Postavka ne postoji; razlog je **uvijek** obavezan | ✅ (strože) |
| `allowServiceOverrides` / `allowOuOverrides` | Isključivanje override-a se poštuje | `normalize-sla-rule-values.ts:56–60` | ✅ |
| `maxEscalationLevels` | Ograničen broj nivoa | `assert-escalation-level-allowed` (`assert-sla-escalation-constraints.ts:76–95`) | ✅ |
| Usklađenost po OU/servisu/grupi | Dimenzije za menadžment | Samo **po profilu**, samo terminalni tiketi (`aggregate-sla-compliance.ts:30–85`) | ⚠️ B3 |
| Vidljivost SLA panela | Razlog kad satova nema | `load-ticket-sla-context.ts:46–100` sa pet razloga | ✅ |
| Skener koji ne raste s brojem tiketa | Indeksiran „next due“ upit + batch | `nextDueAt` + `take: 2000` (`scan-due-ticket-sla-states.ts:33–43`) | ✅ |
| Nadzor da skener radi | Alarm kad zakašnjava | `slaScanLateMinutes` (5) u ops-health | ✅ |
| `firstResponseAt` kao metrika tiketa | Ne zavisi od SLA modula | Upisuje ga **samo** SLA (`sync-ticket-sla-timers.ts:83–88`) | ⚠️ B4 |
| E2E pokrivenost | Pauza, prekršaj, eskalacija, kalendar | Samo jedan scenario (`07-sla.spec.ts`) | ⚠️ NISKO |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Najzreliji modul do sada.** Matematika radnog vremena je čista i odvojena od Prisme
  (`add-business-minutes`/`count-business-minutes` + `business-hours-civil-time`), sa civilnim vremenom umjesto
  oslanjanja na `Date` aritmetiku — to je jedini ispravan način da DST i `24:00` ne pokvare rokove.
- **Skener je dobro projektovan:** `nextDueAt` kao jedina kolona koja govori „kada me opet pogledaj“, uz
  batch i indeks `[resolutionCompletedAt, nextDueAt]`, je pravo rješenje za rast tabele; uz to postoji
  idempotentan raspored u workeru i ops alarm ako ciklusi izostanu.
- **Audit je dosljedan:** svaka promjena konfiguracije nosi razlog, a runtime događaji (at-risk, prekršaj,
  eskalacija) se upisuju i u change log i u vremensku liniju tiketa, sa dedupe ključevima u
  `firedEscalationKeys`.
- **Dizajnerski rizik:** SLA modul „posjeduje“ `ticket.firstResponseAt`; to je logički podatak tiketa i ne
  smije zavisiti od toga da li je SLA uključen (B4).
- **Eskalacije imaju slijepu tačku:** implicitno pravilo postoji da eskalacija ne bi bila „izgubljena“, ali
  upravo ono nema primaoca (B1) — dakle sistem tvrdi da je eskalirao, a nikoga nije obavijestio.
- **Izvještajna ambicija je veća od isporuke:** u kodu postoji disciplinovan agregat, ali menadžment od njega
  traži OU/servis/grupu (RAW `:1019`) i stanje u toku prozora, ne samo zatvorene tikete (B3).
- **Testovi:** 24 spec fajla za 140 fajlova je solidno, ali **e2e je gotovo prazan** — jedini scenario ne
  provjerava ni pauzu ni eskalaciju, a to su tačke gdje greške imaju najveću cijenu.
- **Higijena:** kod je tipizovan bez `any`, greške imaju kodove i mapiraju se u HTTP, a komentari u kodu
  objašnjavaju odluke (npr. zašto se at-risk preskače uz prekršaj) — to je nivo koji bih očekivao u
  profesionalnom paketu.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Eskalacija iz implicitnog pravila ne obavještava nikoga → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/sla/select-due-sla-escalations.ts:44,83–94`,
  `backend/src/modules/notifications/fan-out/resolve-sla-notification-recipients.ts:22–27,48–64`
- **Opis:** kad profil nema nijedno pravilo eskalacije, `listDueSlaEscalations` koristi **implicitno** pravilo
  sa `id: 'default'` i offsetom 0, pa se ono opali u trenutku prekršaja i zapiše u `firedEscalationKeys`. Pri
  slanju obavještenja, primalac se traži kroz `prisma.slaEscalationRule.findUnique({ where: { id: 'default' } })`
  — tog reda u bazi nema, pa funkcija vraća `[]`.
- **Uticaj:** eskalacija se pojavi u change logu i vremenskoj liniji, ali **nijedan korisnik ne dobija in-app
  ni e-mail obavještenje** (nema assignee-a, nema grupe, nema role). Na profilu bez eksplicitnih pravila
  „eskalacija“ je knjigovodstvena, ne operativna.
- **Fix:** kad pravilo nije nađeno (ili je `default`), vratiti članove `assignedGroupId` tiketa (i assignee-a),
  ili zabraniti eskalaciju bez meta; uz to spec test sa profilom bez pravila.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — Satovi se ne uspostavljaju retroaktivno za tikete koji su propustili kreiranje → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/sla/start-ticket-sla-timers.ts:19–46`,
  `backend/src/modules/sla/scan-due-ticket-sla-states.ts:33–37`, `backend/src/modules/sla/sync-ticket-sla-timers.ts:37–48`
- **Opis:** `TicketSlaState` nastaje samo iz `syncTicketSlaTimers` (događaj na tiketu); skener čita isključivo
  **postojeća** stanja (`resolutionCompletedAt: null AND nextDueAt <= now`). Ako je tiket kreiran dok servis
  još nije imao aktivan profil/pravilo/kalendar, ili je pravilo dodato kasnije, tiket ostaje bez SLA stanja
  sve dok se na njemu ne desi novi događaj (odgovor, promjena statusa, prioriteta).
- **Uticaj:** takvi tiketi su nevidljivi za SLA nadzor, usklađenost i „watchlist“; kad sat ipak nastane, računa
  se od `createdAt`, pa se prekršaj pojavi „u prošlosti“ i može izazvati naknadnu poplavu događaja.
- **Fix:** ograničen backfill u skeneru (npr. svakih N ciklusa, batch otvorenih tiketa bez stanja) ili
  eksplicitna akcija „primijeni SLA“ u administraciji profila.
- **Ozbiljnost:** SREDNJE.

### B3 — SREDNJE — Izvještaj usklađenosti gubi dimenzije i „u toku“ tikete

- **Fajl:** `backend/src/modules/sla/load-sla-compliance-rows.ts:24–28`,
  `backend/src/modules/sla/aggregate-sla-compliance.ts:44–48`,
  `backend/src/modules/sla/sla-compliance.types.ts:28–31`
- **Opis:** upit uzima stanja samo za tikete u terminalnim statusima, a agregacija vraća isključivo red po
  **SLA profilu** (`responseCompliancePercent`, `resolutionCompliancePercent`). RAW traži vidljivost po
  OU/servisu/grupi (`RAW_PROJECT.md:1019`), a dashboard prikazuje ekspoziciju posebno.
- **Uticaj:** menadžer ne može vidjeti koji servis ili jedinica „puca“ rokove, niti tikete koji su rok
  prekoračili a još su otvoreni — najkorisniji signal za intervenciju nedostaje.
- **Fix:** proširiti red agregata na OU/servis/grupu (i/ili uključiti otvorena stanja sa `isResponseBreached`/
  `isResolutionBreached`) uz `group by` u upitu.
- **Ozbiljnost:** SREDNJE.

### B4 — SREDNJE — `ticket.firstResponseAt` postoji samo ako SLA modul radi → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/sla/sync-ticket-sla-timers.ts:37–39,83–88`,
  `backend/src/modules/sla/persist-ticket-sla-state.ts:51–60`
- **Opis:** `firstResponseAt` na tiketu upisuje jedino SLA modul, i to nakon što je stanje sata evidentiralo
  `respondedAt`. Ako je `private.ticket.sla.enabled=false`, ako servis nema profil/pravilo/kalendar, ili ako
  sat nije nastao, kolona ostaje `null` i pored agentskih odgovora.
- **Uticaj:** metrika „prvi odgovor“ (kolone u listi, izvještaji, SLA panel drugih tiketa) je prazna u
  okruženjima koja su isključila SLA, a podatak se ne može rekonstruisati iz tiketa jer se ne zapisuje drugdje.
- **Fix:** upisivati `firstResponseAt` u toku obrade agentskog odgovora (u tickets modulu), nezavisno od SLA-a.
- **Ozbiljnost:** SREDNJE.

### B5 — NISKO — Uzorak dnevnika skenera prijavljuje netačno „preostalo“

- **Fajl:** `backend/src/modules/sla/sla-scan.processor.ts:27–36`
- **Opis:** u log ide `remaining: Math.max(0, processed - slaScanBatchSize)`. `processed` je broj **obrađenih**
  stanja u ovom ciklusu (najviše 2000), pa je izraz praktično uvijek 0 i ne predstavlja stvarni broj stanja koja
  čekaju sljedeći ciklus.
- **Uticaj:** dijagnostika (i tumačenje uz ops alarm `slaScanLateMinutes`) može dati pogrešnu sliku da nema
  zaostatka; pravi zaostatak se vidi tek posredno.
- **Fix:** prebrojati stanja sa `nextDueAt <= now` nakon ciklusa (jedan `count`) ili polje preimenovati/ukloniti.
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/sla.md`** po obaveznoj strukturi (šta je modul, kome je namijenjen, kako se
  dolazi, korak po korak, polja/validacije/statusi, česta pitanja i greške, poznata ograničenja, povezani
  moduli), sa tabelama: BH kalendar (zona, intervali, praznici, max 4 intervala), SLA profil, SLA pravilo
  (prioritet, servis, OU, `evaluationOrder`, response/resolution u minutama), eskalaciono pravilo
  (offset, meta, on-call), prioritetna matrica (impact × urgency → prioritet), te značenje statusa sata
  (OK / rizik ≥ `notifyBeforeOverdueMinutes` / prekršen) i razloga „nema satova“ (`NO_PROFILE`,
  `PROFILE_INACTIVE`, `NO_RULE`, `NO_CALENDAR`, `NOT_APPLIED`). U ograničenja idu **B1–B5** i činjenica da su
  rokove moguće mijenjati nakon promjene prioriteta (breach ostaje zabilježen).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T62–T67** — (T62) SLA sat se računa u BH kalendaru i od kreiranja tiketa;
  (T63) pauza `WAITING_FOR_USER`/`PENDING_APPROVAL` i pomjeranje rokova; (T64) izbor pravila i prioritetna
  matrica; (T65) eskalacije (offseti, mete, on-call, dedupe) uz ograničenje B1; (T66) usklađenost i nadzor
  skenera (`slaScanLateMinutes`); (T67) administracija i change log (obavezan razlog, `sla.write`,
  config-verzije/shadow diff).
- **`REVIEW_ANALIZA.md`:** §M10 (ovaj tekst) i red tabele iteracija 2 → **„M10 ✅ · iteracija 2 završena“**.
- **`DOCS_CHANGELOG.md`:** sekcija M10 sa izvorima i B1–B5.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Sve ključne RAW stavke rade (BH kalendari, pravila, pauze, eskalacije, CRUD, audit, config-verzije, skener sa `nextDueAt`); minus za B1 (eskalacija bez primaoca), B2 (nema retroaktivnog starta), B3 (izvještaj samo po profilu i samo terminalni) i B4. |
| **Kvalitet koda** | **9/10** | Čista podjela čistih funkcija i Prisma sloja, tipizovano, kodovi grešaka + mapiranje, komentari koji objašnjavaju odluke, 24 spec fajla, transakcioni upisi i optimizovan skener; jedina zamjerka je log uzorka (B5) i vezivanje `firstResponseAt` za ovaj modul. |
| **Sigurnost** | **8/10** | Sve izmjene iza `SessionAuthenticationGuard` + `RoleGuard(admin)` + `sla.write`, čitanja zatvorena za admin rolе osim svjesno otvorene prioritetne matrice i agregata vidljivosti (`/reports/sla/summary`); nema sirovih SQL upita ni izlaganja tajni; minus za to što nema revizorskog traga „ko je vidio“ i za oslanjanje na rolu `admin` bez eksplicitnog pokrivanja `SUPER_ADMIN` (`[NEJASNO]`, isto kao u ranijim modulima). |

# M11 — Realtime i obavještenja (WebSocket)

## 1. Planirano u RAW projektnom zadatku

- **Realtime je „opt-in, ali obavezno kad treba“** (`RAW_PROJECT.md:732`) i potreban je za: **obavještenja**,
  **postavke**, te **tiket događaje + chat + edge listener** (`:736–739`).
- **Očekivani događaji** (`:742–750`): `ticket.created` (grupa + naručilac), `ticket.updated`
  (status/prioritet/dodjela), `ticket.message.created` (tiket + naručilac + grupa), `ticket.attachment.created`
  (samo metadata), `notification.created`, `settings.updated` (admini/superadmini + edge),
  `remote.requested`, `routing.rules.updated`.
- **In-app notifikacije su obavezne od starta**: lista, stanje nepročitanosti, označavanje kao pročitano
  (`:752–757`). E-mail je kanal po postavkama (Office 365, internal-only uz allow-listu), a „push“ za mobilnu
  aplikaciju se **ne primjenjuje** (`:759–767`).
- **Kanal po tipu:** obavještenja idu in-app + (po postavkama) e-mail + **WS događaji** (`:951`), a
  `private.notifications.edge.enabled` i `private.notifications.email.enabled` uključuju kanale (`:692–693`).
- **Postavke i realtime:** promjena postavki se propagira realtime-om prema webu i edge ekstenziji (`:1050`),
  a `settings.updated` ide prema adminima (`:749`).
- **Edge ekstenzija** (interni dodatak, samo `@example.com`): background WS + **throttled polling fallback**
  60–120 s samo za nepročitane notifikacije/poruke (`:309–345`), kanali `user:{userId}` i `ticket:{ticketId}`
  (`:955`), dedup po `eventId` i `createdAt` (`:340`), redaktovani preview-i i kill switch (`:335`, `:344`).
  Kontrolne postavke: `private.edgeExtension.ws.enabled` (`:696`), `private.edgeExtension.pollingFallback.enabled`
  (`:703`).
- **Kapacitet/dijagnostika:** uz realtime idu metrike (`ws_clients_count`, emit-i po sobi) i zahtjev da
  skaliranje na više instanci radi bez gubitka događaja (`:1050–1053`).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

1. **Realtime je optimizacija, ne izvor istine.** Svaki ekran mora raditi i bez soketa (uz fallback), a
   soket smije samo skratiti vrijeme do svježeg podatka.
2. **Soba je sigurnosna granica, ne udobnost.** Ko je u sobi `ticket:{id}:staff` mora imati pristup tom tiketu
   u tom trenutku; ko je u `group:{id}` ne smije vidjeti sadržaj koji mu ne pripada. Kad se pravo promijeni,
   konekcija se mora ponovo provjeriti, a ne čekati reconnect.
3. **Emit mora biti ograničen.** Grupa od 200 ljudi ne smije značiti 200 punih kopija istog događaja; grupa
   dobija jedan lagani signal, a puni sadržaj samo oni kojima pripada.
4. **Šum je kvar.** Bez dedup-a, bez limitera i bez „jednom po događaju“ pravila realtime postaje izvor
   obavještenja koja ljudi nauče ignorisati.
5. **Više instanci je normalno stanje.** Adapter, brojanje klijenata i skener moraju raditi i kad API nije
   jedan proces; bridge za process koji nema Socket.IO server je obavezan, inače update tiho nestaje.
6. **Vidljivost podataka ne smije zavisiti od kanala.** Ako je red obavještenja vidljiv grupi u listi, isti
   red smije stići samo toj istoj grupi; ako je sadržaj osjetljiv, kanal nosi samo broj tiketa.
7. **Metrika bez alarma je ukras.** Brojač emit-a i broj klijenata moraju imati prag koji nekoga probudi.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Revalidacija soba** (B1): na invalidaciju principala (`PrincipalContextInvalidator`) i na promjenu
   članstva/rola preispitati sobe — najjednostavnije `server.in(groupRoomName(id)).socketsLeave(...)` za
   pogođene korisnike ili periodična re-autentikacija socket-a (npr. svakih N minuta), uz test.
2. **Limiter za join/leave** (B2): primijeniti isti obrazac kao za presence (`allowPresenceMessage`) na
   `ticket:join`/`ticket:leave` (npr. 30/min po soketu), jer svaki join plaća čitanje tiketa i politike pristupa.
3. **Prag za emit-e** (B3): dodati `private.ops.thresholds.wsEmitsPerMinute` i signal u ops-health koji čita
   `consumeWebsocketEmitCounts()` (danas se brojači samo loguju).
4. **Ugasiti prelazni režim** (B4): nakon roll-outa prebaciti `WS_GROUP_FEED_LEGACY_FULL_EMIT=off` i, umjesto
   vječnog env prekidača, vezati ga na rok/datum (npr. „uključeno do prve sljedeće verzije“) da se ne zaboravi.
5. **Ukloniti mrtvi izvoz** (B5) `connectTicketSocket` ili ga koristiti u e2e klijentu za provjeru WS dostave.
6. **E2E koji stvarno sluša soket:** dodati scenarij u kojem drugi klijent šalje poruku, a Playwright stranica
   dobija `ticket.message.created` bez reload-a — danas nijedan test ne provjerava WS dostavu.

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Transport, autentikacija i sobe

- **Dva gateway-a, isti CORS:** `WebsocketGateway` (`backend/src/modules/websocket/websocket.gateway.ts:39–43`)
  i `TicketChatGateway` (`ticket-chat.gateway.ts:42–46`) koriste `resolveSocketCorsOrigin()`, koji je izvoz
  zajedničkog `resolveCorsOrigin()` — čita `CORS_ORIGIN` (lista razdvojena zarezom, `*` se odbacuje, prazno =
  zabrana) (`backend/src/common/cors/resolve-cors-origin.ts:1–17`).
- **Handshake autentikacija:** middleware u `afterInit` (`websocket.gateway.ts:91–94`) zove
  `authenticateHandshake` (`:193–222`), koji preko `SocketAuthenticationService.authenticate` parsira
  `handshake.auth` i verificira token (`socket-authentication.service.ts:15–31`); verifikator je
  `JwtSocketAuthenticationVerifier` → `SessionTokenService.verify` (JWT), a principal nosi samo `subjectId`
  (`backend/src/modules/authentication/jwt-socket-authentication.verifier.ts:15–27`). Neuspjeh se loguje kao
  `socket_authentication_rejected` i vraća generičku grešku (`create-socket-authentication-failure-error.ts`).
- **Sobe pri konekciji:** socket ulazi u `user:{userId}` i u **sve** `group:{groupId}` svoje trenutne
  članstva, a ako ima rolu ADMIN/SUPER_ADMIN i u `role:admins` (`websocket.gateway.ts:145–191`;
  `socket-group-membership.service.ts:8–25` sa komentarom da se članstvo **namjerno ne kešira** i čita jednom
  po konekciji). Svaki socket dobija `requestId` (`attach-socket-request-id.ts`).
- **Imena soba** su na jednom mjestu: `ticket:{id}`, `ticket:{id}:public`, `ticket:{id}:staff`, `user:{id}`,
  `group:{id}` (`ticket-socket-rooms.ts:1–19`).
- **Ulaz u tiket:** `ticket:join` prvo autorizuje (`authorizeSocketJoin` → `loadAccessibleTicket` + politike
  pristupa, `tickets/tickets-collaboration.service.ts:189–202`), pa tek onda pridružuje socket sobi tiketa i
  **odgovarajućoj** sobi vidljivosti (`ticket:public` ili `ticket:staff`, `ticket-chat.gateway.ts:99–113`);
  `ticket:leave` izlazi iz sve tri (`:115–126`), a `presence` je dozvoljen samo socketu koji je već u sobi
  tiketa i uz limiter 30 poruka/min (`:129–160`, `presence-rate-limiter.ts:4–18`).

### 4.2 Ko prima koji događaj

- **Poruka u tiketu:** `ticket.message.created` ide u `:staff` sobu, a **samo ako je poruka javna** i u `:public`
  sobu i u `user:{naručilac}`; interne bilješke i sistemski događaji ne idu dalje od staff sobe
  (`broadcast-ticket-realtime.ts:29–45`).
- **Promjena tiketa:** `ticket.updated` ide u staff sobu, u public sobu kad je promjena javna, te u user sobe
  naručioca, dodijeljenog agenta i aktera (`ticket-updated-broadcast-rooms.ts:15–26`).
- **Lagani signal grupi:** soba `group:{id}` **ne dobija** pune payload-e nego `group.feed-changed` (< 200 B:
  `groupId`, `ticketId`, `kind` i vrijeme) — i to samo za javne promjene/poruke
  (`group-feed-change.ts:5–76`, `broadcast-ticket-realtime.ts:76–96`). Uz to, dok je uključen prelazni
  prekidač, grupa dobija i stari puni payload (`group-feed-change.ts:78–93`, vidi B4).
- **Obavještenja:** lično obavještenje ide u `user:{userId}` (`broadcast-user-realtime.ts:18–26`), a grupno
  **jednom** u `group:{groupId}` sa `excludedUserIds` u payload-u (`:29–47`,
  `notifications/notification-realtime.types.ts:17–37`).
- **Edge i admin kanali:** edge događaj ide u `user:{id}` i, ako ima tiket, u `ticket:{id}`
  (`broadcast-edge-realtime.ts:5–13`); promjena konfiguracije ide u `role:admins`
  (`common/admin-realtime/admin-config-realtime.types.ts:11`), a za domen `routing` i pod imenom
  `routing.rules.updated` iz RAW-a (`broadcast-user-realtime.ts:49–63`).
- **Postavke:** `settings.updated` se emituje **globalno** (svi povezani klijenti), a `session.invalidated`
  dodatno kad promjena obara sesije (`broadcast-user-realtime.ts:65–75`); emit se filtrira na `public.*` i na
  nekoliko familija privatnih ključeva (`notifications.`, `edgeExtension.`, `addons.`, `readOnlyMode.`, auth
  mode i JWT tajna) tako da vrijednosti i ostali privatni ključevi ne izlaze na kanal
  (`to-settings-realtime-payload.ts:5–34`).

### 4.3 Skaliranje na više instanci (Faza 3.1–3.3)

- **Redis adapter:** prije prvog klijenta gateway ispituje ACL (`checkRealtimeAdapterSubscriptions`); ako je
  kanal **odbijen**, ostaje in-memory adapter uz jedno upozorenje, a „nepoznato“ (Redis nedostupan) instalira
  adapter i oslanja se na ioredis retry (`ws-redis-adapter.ts:20–50,117+`, `websocket.gateway.ts:81–143`).
  Adapter koristi **dva posvećena klijenta** i omotava `subscribe`/`publish` da odbijena dozvola ne obori proces
  (`ws-redis-adapter.ts:73–101`). Runbook sa sticky sesijama i drain procedurom je
  `ops/ws-rolling-deploy.md`, a dokaz cross-instance emit-a je skripta `ops/ws-cross-instance-check.mjs`.
- **Metrike:** broj povezanih klijenata (`ws_clients_count`) loguje se svakih 30 s
  (`observability/metrics/websocket-client-count.reporter.ts:39–60`), a emit-i se broje po vrsti sobe
  (`staff`/`public`/`user`/`group`/`broadcast`) i ispisuju jednom u 30 s
  (`websocket-emit-counter.ts:8–64`).

### 4.4 Bridge za procese bez Socket.IO servera

- **Worker → API:** worker (arhiviranje, waiting-for-user) objavljuje na kanal `tickets:realtime-bridge`
  (`tickets/ticket-realtime-bridge.constants.ts:12`, `publish-ticket-realtime-to-redis.service.ts:12–20`), API
  ga sluša i vraća u in-process hub (`ticket-realtime-bridge.subscriber.ts:30–69`); u workeru je registrovani
  pretplatnik hub-a koji **forwarduje** sve što automatika objavi (`ticket-realtime.redis-forwarder.ts:5–52`),
  a API ga ne registruje da se događaj ne bi poslao dvaput.
- **Integracije → API:** edge događaji iz queue-a stižu preko `edgeEventRedisChannel` u isti hub
  (`integration-queue/edge-event-realtime.subscriber.ts:30–61`).
- **Hub:** `TicketRealtimeHub` je in-process pub/sub (pet tipova događaja), na koji su pretplaćeni gateway i
  fan-out obavještenja (`tickets/ticket-realtime.hub.ts:20–80`, `notifications/fan-out/notifications-fan-out.service.ts:49–59`).

### 4.5 In-app obavještenja (model, API, keš)

- **Endpointi:** `GET /notifications` (lista + broj nepročitanih), `GET /notifications/unread-count`,
  `POST /notifications/read-all`, `POST /notifications/:id/read` — sve iza sesijske autentikacije i za sve
  četiri role (`notifications.controller.ts:22–65`).
- **Vidljivost:** obavještenje je **lično** (`userId = ja`) ili **grupno** (moja grupa, kreirano **nakon** što
  sam se pridružio, i nisam u `excludedUserIds`); stanje pročitanosti grupnog reda je `NotificationReceipt`,
  pa jedan član ne „pročita“ tuđe (`notification-audience.ts:8–66`, `mark-notification-read.ts:15–46`).
- **Brojač:** jedan `COUNT` (lični + grupni bez mog receipt-a), **ograničen na 1000** da skener SLA-a ne može
  proizvesti beskonačan broj (`count-unread-notifications.ts:7–27`); rezultat se kešira u Redis-u 15 s sa
  **epohama grupa** (bump pri svakom grupnom obavještenju) i briše se pri čitanju
  (`unread-count-cache.constants.ts:9`, `unread-count-cache.ts:135–200`, `notifications.service.ts:42–105`).
- **Fan-out:** na svaki realtime događaj tiketa mapira se tip (`map-ticket-event-to-notification.ts:33–59` —
  `INTERNAL_NOTE` ide **samo** spomenutima preko `TicketMessageMention`), određuje publika (lična + jedna
  grupna), gradi sadržaj (naslov iz `notificationTitleKeys`, tijelo = **naslov tiketa**, a za **povjerljiv**
  tiket samo **broj tiketa**, `build-notification-content.ts:21–33`), upisuje lične redove jednim batch-om i
  jedan grupni red (`fan-out-in-app-notifications.ts`, `fan-out/insert-group-notification.ts:13–55`).
- **Objava:** prvo grupni red (jedan emit u sobu + `INCR` epohe), pa lični (po korisniku se broji badge)
  (`fan-out/publish-created-notifications.ts:8–43`).
- **Preferencije (paket 2.2):** tipovi imaju `lockedEmail` (`ticket.approval,ticket.sla,report.weeklyTickets`) i
  `quietBypass` (`ticket.sla`), a članovi grupe koji su isključili in-app ulaze u `excludedUserIds`
  (`notifications.constants.ts:70`, `notification-preference-settings.ts:11,15`,
  `fan-out/fan-out-in-app-notifications.ts:60–81`).
- **Retencija:** dnevni worker posao u 03:30 UTC briše obavještenja starija od **90 dana** (env
  `NOTIFICATION_RETENTION_DAYS`) u batch-evima od 5000 (`notification-retention.constants.ts:9–28`), a modul je
  registrovan u `worker.module.ts:38`.

### 4.6 Frontend

- **Jedan soket po tabu:** `acquireHelpdeskSocket`/`releaseHelpdeskSocket` broje reference i drže konekciju
  0 ms nakon zadnjeg otpuštanja, a reconnect je „jittered“ (500 ms → 10 s, faktor 0,5) da rolling deploy ne
  proizvede sinhroni talas (`services/helpdesk-socket.ts:15–67`).
- **Host konekcije:** `HelpdeskSocketHost` pretplaćuje globalne događaje — `session.invalidated` → odjava,
  `settings.updated` → nova generacija postavki, `admin.config.updated` → invalidacija keševa po domenu
  (`lib/realtime/helpdesk-socket-host.tsx:20–74`).
- **Mapiranje na keš:** `queryKeysForTicketEvent` povezuje `ticket.updated` (liste + detalj + dashboard + SLA
  sažetak), `ticket.message.created` (lista + detalj), `group.feed-changed` (**samo liste**) i obavještenja sa
  odgovarajućim upitima; pretplata **ne invalidira** dok ekran nije vidljiv
  (`lib/realtime/invalidate-on-event.ts:22–53`, `:56–70`).
- **Zvono i inbox:** `useInboxNotifications` drži listu i broj nepročitanih; broj je **push-driven**, a
  fallback anketa od 30 s se uključuje **samo dok je soket pao** i odmah se osvježi pri povratku
  (`lib/realtime/socket-health.ts:7–53`, `lib/notifications/use-inbox-notifications.ts:72–119`); lista se
  puni pri otvaranju panela (`components/layout/notifications-bell.tsx:42`). Panel ima filter **Sve** /
  **Nepročitane**, **Označi sve** i prazna stanja („Nema obavještenja.“, „Nema nepročitanih obavještenja.“)
  (`components/layout/notifications-panel.tsx`).
- **Primjena događaja:** `applyNotificationCreated` dedup-uje po `id`, `applyNotificationRead` pokriva i
  „sve pročitano“, a `nextUnreadCount` uzima serverski broj ili lokalni `unreadDelta`; događaj iz grupne sobe se
  **ignoriše** ako je korisnik u `excludedUserIds` (`lib/realtime/apply-notification-realtime.ts:15–64`).
- **Detalj tiketa:** `use-ticket-realtime` ulazi u sobu tiketa, ponovo je prijavljuje na `connect` (nakon
  reconnect-a) i primjenjuje `ticket.updated` i poruke uz dedup (`lib/tickets/use-ticket-realtime.ts:31–92`).

### 4.7 Testovi i dokumentacija

- **Backend:** 13 spec fajlova u `websocket/` (auth, handshake, CORS, adapter, sobe, emit brojači, gateway) i
  26 u `notifications/` (fan-out, inbox, keš epohe, retencija, SLA poplava). **Frontend:** 9 spec fajlova u
  `lib/realtime`/`lib/notifications` + `services/helpdesk-socket.spec.ts`.
- **E2E:** `04-realtime-notifications.spec.ts` provjerava **queue** (EMAIL/EDGE_EVENT posao) i da se tiket vidi
  na stranici, `15-workflow-unrouted-realtime.spec.ts` provjerava workflow neusmjerenog tiketa — **nijedan test
  ne otvara Socket.IO klijent**, pa dostava putem WS-a nije pokrivena e2e-om.
- **Operativna dokumentacija:** `ops/ws-rolling-deploy.md` (sticky sesije, drain procedura, cilj „pauza < 5 s za
  < 1% klijenata“) i `ops/ws-cross-instance-check.mjs` (dokaz da emit s instance A stiže klijentu na instanci B,
  sa različitim izlaznim kodovima za „nije dokazano“ i „nije mjereno“).

## 5. Gap analiza

| Zadatak (RAW) | Idealno | Trenutno | Status |
|---|---|---|---|
| Realtime za obavještenja, postavke, tikete, chat, edge | Jedan autentikovan kanal sa jasnim sobama | Dva gateway-a, `user/ticket/group/role` sobe (`websocket.gateway.ts`, `ticket-socket-rooms.ts`) | ✅ |
| `ticket.created` (grupa + naručilac) | Grupa dobija signal, naručilac potvrdu | Grupna obavještenja + `notification.created`; nema posebnog `ticket.created` imena | ➖ (ekvivalent) |
| `ticket.updated` (status/prioritet/dodjela) | Promjena ide u tiket i zainteresovanima | `ticket.updated` u staff/public/user sobe (`ticket-updated-broadcast-rooms.ts:15–26`) | ✅ |
| `ticket.message.created` | Tiket + naručilac + grupa | staff/public/user + lagani grupni signal, interne samo staff (`broadcast-ticket-realtime.ts:29–45`) | ✅ |
| `ticket.attachment.created` (metadata) | Obavijest o prilogu bez sadržaja | Nema posebnog događaja za priloge | ⚠️ gap (NISKO) |
| `notification.created` | Lično + grupno bez dupliranja | `user:{id}` i jedan red za grupu uz `excludedUserIds` | ✅ |
| `settings.updated` (admini + svi) | Samo ono što korisnik smije vidjeti | Globalni emit **samo** za `public.*` i nekoliko familija (`to-settings-realtime-payload.ts:24–34`) | ✅ |
| `remote.requested` / `routing.rules.updated` | Isti kanal, bez tajni | Edge događaj u `user`/`ticket` sobu; `routing.rules.updated` u `role:admins` | ✅ |
| In-app: lista, nepročitano, pročitano | Model sa receipt-ima za grupne redove | `notification-audience.ts`, `mark-notification-read.ts`, `POST /read-all` | ✅ |
| E-mail kanal kao dio istog engine-a | Jedan fan-out, kanali po postavkama | `NotificationsFanOutService` zove in-app i e-mail (`notifications-fan-out.service.ts:67–72`) | ✅ |
| Edge: WS + throttled polling fallback | Fallback samo za nepročitano, strogo ograničen | Frontend: fallback 30 s **samo kad je soket pao** (`socket-health.ts:7–53`); edge ekstenzija je zaseban modul | ✅ (web) |
| Dedup događaja po `eventId` | Klijent ne primjenjuje isti događaj dvaput | `eventId` u payload-u (`to-notification-realtime-client-payload.ts:12–31`), dedup po `id` u listi i porukama | ✅ |
| Više instanci bez gubitka događaja | Redis adapter + bridge za workere | `ws-redis-adapter.ts`, `ticket-realtime-bridge.*` | ✅ |
| Metrike: klijenti + emit-i po sobi | Metrika **i alarm** | Brojači se loguju (`websocket-emit-counter.ts:51–64`), alarma nema | ⚠️ B3 |
| Sobe = sigurnosna granica u svakom trenutku | Promjena prava utiče odmah | Članstvo/rola se čitaju **jednom** po konekciji | ⚠️ B1 |
| Prijava u tiket bez zloupotrebe | Limiter kao za presence | `ticket:join` bez limitera | ⚠️ B2 |
| Rollout bez punog payload-a u grupi | Po defaultu lagani signal | Prelazni prekidač je **uključen** po defaultu | ⚠️ B4 |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Najbolji dio modula je ekonomija emit-a.** Umjesto „jedan emit po članu“ grupa dobija jedan lagani
  `group.feed-changed`, lična obavještenja idu u user sobu, a grupa dobija jedan red — to je promjena koja se
  vidi i u brojevima (emit-i se mjere po vrsti sobe) i u ponašanju klijenta (limitiranje na vidljiv ekran).
- **Bridge obrada je zrela:** worker nema Socket.IO, pa se događaji prenose kanalom, a forwarder je namjerno
  registrovan **samo** u workeru da se isti događaj ne pošalje dvaput — to je razlika između „radi“ i „radi
  tačno jednom“.
- **Degradirani režim je osmišljen:** ACL koji odbija adapter ne obara proces, Redis koji ne radi ne blokira
  boot, a klijent ima 30-sekundni fallback tačno dok soket ne radi. Vrijedi isto za keš brojača: svaka greška
  Redis-a znači „nema keša“, nikad grešku korisniku.
- **Sigurnosna granica je tačna u trenutku spajanja, a ne posle.** Grupne sobe se pune iz članstva pri
  handshake-u, pa korisnik koji izgubi članstvo ili rolu nastavlja primati događaje do reconnect-a (B1) — to je
  jedina prava sigurnosna primjedba ovog modula i vrijedi je zatvoriti prije većeg broja grupa.
- **Klijentska strana je disciplinovana:** jedan soket, referentno brojanje, jitter, invalidacija samo za
  vidljive ekrane, dedup i poštovanje `excludedUserIds`. Slabosti su rubne: mrtvi izvoz (B5) i to što nijedan
  e2e ne sluša soket, pa se regresija u dostavi otkrije tek ručno.
- **Nedostaci su u „okvirima“, ne u srcu:** nema limitera za join (B2), nema alarma na emit-e (B3) i prelazni
  režim ostaje uključen dok ga neko ne ugasi (B4). To su tri mala, jeftina popravka koja modul vode od „radi
  odlično“ do „ne može se zloupotrijebiti ni zaboraviti“.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Članstvo u sobama i „admin“ rola su snimak iz trenutka spajanja → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/websocket/socket-group-membership.service.ts:8–25`,
  `backend/src/modules/websocket/websocket.gateway.ts:145–191`,
  `backend/src/common/principal-context/principal-context-invalidator.service.ts` (potrošači: `directory-sync`,
  `authentication`)
- **Opis:** pri konekciji se čitaju grupe korisnika i njegova ADMIN/SUPER_ADMIN rola i po tome se socket
  pridružuje sobama `group:{id}` i `role:admins`. Poslije toga se stanje **ne provjerava ponovo**: nema
  periodične revalidacije, a `PrincipalContextInvalidator` (koji podiže `authzVersion` i time obara HTTP
  kešove) ne dira socket-e.
- **Uticaj:** korisnik kome je ukinuto članstvo grupe ili admin rola nastavlja primati **grupna obavještenja**
  (uključujući broj i naslov tiketa, a za povjerljive samo broj) i **admin konfiguracione događaje** dok se ne
  odjavi ili ne reconnectuje; pravo se na HTTP sloju poštuje, pa je raskorak između onoga što vidi i onoga što
  smije otvoriti.
- **Fix:** na invalidaciju principala preispitati članstvo pogođenih korisnika i ukloniti ih iz soba
  (`socketsLeave`) ili uvesti periodičnu revalidaciju socket-a (npr. 5 min) uz test koji mijenja članstvo
  tokom aktivne konekcije.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — `ticket:join` nema ograničenje frekvencije → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/websocket/ticket-chat.gateway.ts:99–126`,
  `backend/src/modules/tickets/tickets-collaboration.service.ts:189–202`
- **Opis:** za razliku od `presence` (30 poruka/min po socketu, `presence-rate-limiter.ts:4–18`), događaji
  `ticket:join` i `ticket:leave` se primaju bez limitera, a svaki join izvršava autorizaciju: učitavanje
  tiketa i vezivanje politika pristupa (`loadAccessibleTicket` + `accessPolicies.bind`), dakle najmanje jedan
  do dva upita u bazu.
- **Uticaj:** autentikovan korisnik (ili pokvaren klijent u petlji) može generisati proizvoljan broj
  autorizacionih upita i zauzeti bazu; nema ni detekcije takvog obrasca (join se ne loguje pojedinačno).
- **Fix:** primijeniti isti obrazac kao za presence (prozor po socketu, npr. 30 join/leave u minuti) i vratiti
  `{ok:false}` preko limita, uz brojač u logovima.
- **Ozbiljnost:** SREDNJE.

### B3 — NISKO — Emit-i po sobi imaju metriku, ali ne i alarm

- **Fajl:** `backend/src/modules/websocket/websocket-emit-counter.ts:8–64`,
  `backend/src/modules/ops-health/evaluate-ops-signals.ts` (nema WS signala)
- **Opis:** brojači `staff/public/user/group/broadcast` se resetuju i loguju jednom u 30 s
  (`startWebsocketEmitCountReporter`), ali nijedan ops signal ne čita te vrijednosti niti postoji prag
  (`private.ops.thresholds.*`) za „emit-ova u sekundi“.
- **Uticaj:** planirani dio „alert > prag“ nije isporučen; petlja koja proizvodi desetine hiljada emit-a u
  sekundi vidi se samo u logovima koje niko ne čita, a posljedica je opterećenje Redis adaptera i klijenata.
- **Fix:** dodati prag u ops postavke i signal koji čita `consumeWebsocketEmitCounts()` (uz `ws_clients_count`).
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Prelazni režim punog emit-a u grupne sobe je uključen po defaultu

- **Fajl:** `backend/src/modules/websocket/group-feed-change.ts:78–93`,
  `backend/src/modules/websocket/broadcast-ticket-realtime.ts:86–93`
- **Opis:** `isLegacyGroupFullEmitEnabled()` vraća `true` osim ako je `WS_GROUP_FEED_LEGACY_FULL_EMIT`
  eksplicitno `off/false/0`, pa grupa dobija **i** stari puni payload **i** novi lagani događaj.
- **Uticaj:** do trenutka ručnog prebacivanja (runbook `ops/ws-rolling-deploy.md`) najveći izvor saobraćaja
  koji je Faza 3.2 uklonila i dalje postoji, a prekidač je lako zaboraviti jer ništa ne upozorava.
- **Fix:** vezati prelazni režim na rok ili na verziju klijenta (npr. automatski `off` nakon N dana ili kad
  `/health` prijavi novu verziju), ili barem logovati upozorenje dok je uključen.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Nekorišteni izvoz `connectTicketSocket`

- **Fajl:** `frontend/src/services/ticket-socket.ts:22–28`
- **Opis:** funkcija pravi **drugi** Socket.IO klijent (bez referentnog brojanja i bez jitter-a iz
  `helpdesk-socket.ts`), ali je nijedan modul ne koristi — `use-ticket-realtime` uzima socket iz
  `acquireHelpdeskSocket`, a koriste se samo `ticketSocketEvents`, `joinTicketRoom` i `leaveTicketRoom`.
- **Uticaj:** mrtvi kod koji poziva drugi obrazac povezivanja; ako ga neko upotrijebi, dobija se dvostruka
  konekcija po tabu (bez dijeljenja i bez gašenja), što je tačno ono što je `helpdesk-socket` uveden da spriječi.
- **Fix:** ukloniti izvoz ili ga zamijeniti korištenjem `acquireHelpdeskSocket` u e2e klijentu za WS provjeru.
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/realtime-i-obavjestenja.md`** po obaveznoj strukturi: šta modul radi (push
  obavještenja), kome je namijenjen (svi prijavljeni; agenti i administratori dodatno), kako se dolazi (zvono
  u zaglavlju), korak po korak (otvaranje panela, filteri, označavanje jednog/svih, ponašanje kad veza padne),
  tabele (tipovi obavještenja sa naslovima i kad se šalju, šta znači grupno obavještenje, šta se vidi za
  povjerljiv tiket), česta pitanja („zašto nema obavještenja“, „zašto se broj ne mijenja odmah“, „šta znači
  isključena veza“), poznata ograničenja (**B1–B5** + činjenica da je broj nepročitanih ograničen na 1000) i
  povezani moduli (Tiketi, SLA, Odobrenja/CSAT, Postavke, Dežurstva).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T68–T73** — (T68) arhitektura realtime kanala i sobe; (T69) autentikacija
  socket-a i pravila pristupa sobama; (T70) in-app obavještenja: model vidljivosti i receipt-i; (T71) fan-out
  i tipovi događaja (uključujući povjerljive tikete); (T72) fallback i ponašanje pri prekidu veze;
  (T73) operativni zahtjevi (više instanci, metrike, roll-out prekidač, retencija).
- **`REVIEW_ANALIZA.md`:** §M11 (ovaj tekst) i **novi red tabele iteracija 3** →
  „M11 ✅ · M12 u toku“.
- **`DOCS_CHANGELOG.md`:** sekcija M11 sa izvorima i B1–B5.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Sve RAW-om tražene klase događaja postoje (tiketi, poruke, obavještenja, postavke, admin konfiguracija, edge), in-app model je kompletan (lista, nepročitano, pročitano, retencija), a skaliranje na više instanci je riješeno adapterom i bridge-om; minus za B1 (sobe se ne revalidiraju), B2 (join bez limitera), odsutan `ticket.attachment.created` i prelazni režim koji je još uključen. |
| **Kvalitet koda** | **9/10** | Čiste funkcije za emit i mapiranje keševa, jasna podjela hub/gateway/fan-out, tipizovani payload-i sa `eventId`, komentari koji objašnjavaju zašto (kvarljivi klijent, ACL probe, reset brojača), 13 + 26 backend i 9 frontend spec fajlova; zamjerke su mrtvi izvoz (B5) i metrika bez alarma (B3). |
| **Sigurnost** | **8/10** | Handshake autentikacija je obavezna, sobe tiketa se dobijaju **samo** poslije autorizacije, interne bilješke nikad ne izlaze iz staff sobe, povjerljiv tiket u obavještenju nosi samo broj, a postavke se emituju po dozvoljenoj listi ključeva; minus za B1 (pravo se provjerava samo pri spajanju), B2 (neograničen join) i za to što grupni emit nosi listu `excludedUserIds` (identifikatori kolega) — niska osjetljivost, ali nepotreban podatak u dijeljenoj sobi. |

# M12 — Pošta (e-mail kanal, šabloni i dolazna pošta)

## 1. Planirano u RAW projektnom zadatku

- **E-mail je kanal Notification engine-a**, uz in-app i edge: „Notifikacije: in-app + email (Office 365) +
  Edge/Windows toast“ (`RAW_PROJECT.md:162`), a engine „isporučuje in-app + (po settings) email + WS events“
  (`:951`). Postavke kanala: `private.notifications.email.enabled` (`:692`, default **false**) i
  `private.notifications.edge.enabled` (`:693`).
- **Scope slanja** (`:761–767`): e-mail **internal-only** po defaultu (`private.notifications.email.internalOnly`,
  `:713`, default **true**), a eksterni primaoci samo izuzetno — kroz allow-listu domena
  (`:714`) i pojedinačnih adresa (`:715`).
- **Pouzdanost isporuke** (`:866`, `:953`): „outgoing integracije (email/edge/teams) idu kroz **durable queue**
  sa retry/backoff + DLQ; UI omogućava pregled i **ručni retry**“, a tipovi u redu se biraju postavkom
  `private.integrations.queue.typesCsv` (default `email,edge,teams`, `:546`).
- **Šabloni i jezik** (`:351`): „EN postoji kao fallback/infrastruktura (UI copy + **email templates** + public
  settings copy)“, pa e-mail šablon mora postojati na bosanskom i na engleskom.
- **Bulk broadcast** (`:152`, `:208`, `:927`): in-app + **e-mail** uz **preview broja primaoca i rate limit**;
  uključivanje e-maila je opcija (`private.ticket.bulkActions.broadcast.enableEmail`, `:534`, default **true**).
- **Eskalacije** (`:516`, `:1126`): e-mail za eskalacije je **opcija** (`private.ticket.sla.escalations.emailEnabled`,
  default **false**), a osnovno pravilo je „Eskalacije idu samo in-app (bez email), settings-driven“.
- **Install wizard** (`:1063`) prikuplja SMTP postavke i označava auth mode; `private.smtp.*` je izvor
  transporta (`private.smtp.enabled`, host, port, TLS, korisnik, lozinka, From adresa, provider).
- **Odgovor e-mailom** nije propisan u RAW-u; dolazi iz paketa 1.5 (odluka **E8-B**: zajednički sandučić,
  `Reply-To`) i razrađen je u `docs/plans/modules/2.3-odgovor-emailom.md` (§4, odluke R1–R14): tri konektora
  (Graph, IMAP, Gmail API nije isporučen), potpisani token u `Message-ID`, anti-loop, idempotencija, nadzor i
  retencija.
- **Notifikacije po mjeri** (`docs/plans/modules/2.2-notifikacije-po-mjeri.md`): lične postavke po tipu
  (kanal i način: odmah / u sažetku / isključeno), tihi sati, dnevni sažetak i zaključani tipovi — sve uz
  zadano ponašanje koje je jednako današnjem.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

- **Jedan izlazni kompozitor i jedan „izlazak iz sistema“.** Svaki e-mail — obavještenje, broadcast, sažetak,
  izvještaj, obavijest o dolaznoj pošti — prolazi isti put: sastavljanje iz šablona, escape, redakcija
  osjetljivih podataka, pravilo za povjerljivo, potpisani `Message-ID` i isti transport. Nema puta koji
  „preskoči“ zaštitu zato što je nastao u drugoj funkciji.
- **Idempotencija sa rokom.** Zapis o isporuci nije samo „ključ postoji“ nego **zahtjev sa rokom**: ako
  isporuka ne uspije u razumnom vremenu, zahtjev se preuzima ponovo. Tako pad procesa u trenutku slanja ne
  pretvara e-mail u tiho izgubljenu poruku, a DLQ i nadzorna tabla prikazuju upravo taj slučaj.
- **Kanali kao adapteri, isporuka kao mjerljiv događaj.** Transport je singleton sa pulom veza; brojači
  (poslano / odbijeno domenom / neuspjelo / zaglavljeno) su vidljivi administratoru, a zastoj kanala je alarm,
  ne detalj u logu.
- **Primalac se ne „preskače“ tiho.** Kad e-mail ne ode, administrator može vidjeti razlog (domena nije
  dozvoljena, korisnik je isključio tip, tihi sat, kanal isključen) — bez toga „e-mail ne radi“ ostaje
  nerješiva prijava.
- **Dolazna pošta je karantena sa dokazima.** Konektor je port (`Graph`, `IMAP`), prepoznavanje tiketa je
  kriptografski potpisano, a obrada je idempotentna po ID-u kod provajdera; original se čuva do isteka roka,
  odbijene poruke imaju razlog, a sve je iza jednog auth guarda.
- **Testovi bez živog sandučeta.** Port `InboundMailboxConnector` omogućava testni „lažni“ sandučić, pa se
  cijeli tok (poruka → tiket → prilog) provjerava i u CI-ju, a ne samo na staging instalaciji.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Rok na zahtjev za isporuku.** Uz `NotificationEmailDelivery` uvesti `claimedAt` i pravilo „preuzmi
   ponovo ako je `CLAIMED` stariji od N minuta“ (ili noćno čišćenje starih `CLAIMED` redova uz brojač), i
   prikazati taj brojač u nadzornoj tabli pored „posljednji e-mail“.
2. **Jedan izlazni filter.** Redakcija (`redactSensitiveText` sa `enabled: true`) primijeniti na **svaki** tekst
   koji izlazi iz sistema e-mailom — uključujući bulk broadcast i izvještaje — i tamo gdje se tekst upisuje
   kao poruka tiketa; uz to upozorenje u change logu kad je uzorak nađen.
3. **Transport sa pulom.** `SmtpMailTransport` držati kao jedan objekat (keš po `host:port:korisnik`) i
   uključiti `pool: true`, umjesto nove veze za svaku poruku; promjena postavki treba invalidirati keš.
4. **Vidljivost odluke po primaocu.** U admin kartici e-maila (ili u detalju tiketa) prikazati zašto primalac
   nije dobio e-mail; danas se takvi primaoci samo preskaču (`continue`) bez traga.
5. **Lokalizovane oznake u bulk tekstu.** Oznake „What happened / Who is affected / ETA / Workaround“ prevesti
   ili generisati iz šablona po jeziku primaoca, kao što je urađeno za sve ostale e-mailove.
6. **Metrika i alarm kanala u `ops-health`.** Pored „posljednji poslani e-mail“ pratiti i broj neuspjelih i
   zaglavljenih isporuka u 24 h, te upozoriti kad kanal ćuti (nema `SENT` reda duže od X, a ima događaja).
7. **e2e za dolaznu poštu i sažetak.** Iskoristiti `InboundMailboxConnector` kao zamjenu u testu i dodati
   scenarije koji danas ne postoje: odgovor e-mailom na zatvoren tiket, odbijen prilog, sažetak na kraju tihih
   sati.

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Odluka da li e-mail uopšte ide

- `load-email-channel-configuration.ts:69–126` čita postavke i sastavlja `EmailChannelConfiguration`:
  `smtpEnabled`, `emailAddonEnabled`, `notificationsEmailEnabled`, `slaEscalationEmailEnabled`,
  `templatesEnabled`, `internalOnly`, tri allow-liste, šablone, SMTP i „presentation“ (naziv aplikacije,
  brend, `APP_PUBLIC_URL`, boja, isječak, način odgovora, jezici).
- Stvarni prekidač je `resolve-email-channel-enabled.ts:8–13`: e-mail radi samo ako je uključen **addon** i
  SMTP i `private.notifications.email.enabled` (`resolve-email-addon-enabled`).
- **Transport se čita samo ako je SMTP uključen** (`:123`); ako nema hosta ili From adrese, `smtp` je `null`
  (`:149–151`) i kanal je mrtav bez greške.
- **Preseti provajdera** (`:131–148`, `email-template.constants.ts:134–140`) popunjavaju host/port/TLS samo dok
  admin nije upisao host — upisane vrijednosti imaju prednost (odluka E10).
- **Način odgovora** (`:172–224`): ako je tražen `shared_mailbox`, a `Reply-To` adresa nije upisana, sistem
  **tiho pada na `no_reply`** (`:183–184`), a razlika je vidljiva u admin pregledu (`configuredReplyMode`).
- **Lozinka SMTP-a ide kroz `getSecretForInternalUse`** (`:162–166`) — nikad u običan API odgovor.
- **Linkovi zavise od okruženja** (`readPublicAppUrl`, `:227–241`): bez `APP_PUBLIC_URL` (ili sa neispravnim)
  e-mail ide bez dugmeta i bez linka za upravljanje obavještenjima.
- **Allow-lista adresa** (`is-allowed-notification-email-address.ts:14–31`): normalizacija, provjera domene i
  oblika; kad je `internalOnly` isključen, propušta svaku sintaksno ispravnu adresu; interne domene su
  postavka, ne konstanta. Na novoj instalaciji domenu superadmina upisuje instalacijski korak
  (`install/seed-install-internal-email-domain.ts:16–32`), i to samo ako postavka nije već popunjena.

### 4.2 Sastavljanje poruke i render

- `compose-ticket-email.ts:64–162` gradi jedan e-mail: jezik primaoca (`resolveEmailLocale`, `:47–62`),
  link na tiket (`:84–87`), redakcija opisa (`redactForEmail`, `:165–170`), isječak poruke (samo za javne
  odgovore, i uvijek za broadcast, `:123–125`), te `manageUrl` na `/account/notifications` osim za broadcast.
- **Povjerljivo** (`:37–44`): `isConfidential` ili klasifikacija `CONFIDENTIAL`/`RESTRICTED` uključuju režim u
  kojem render prikazuje **broj tiketa i link**, bez naslova, usluge i isječka.
- **`Message-ID`** (`:134–147`): u režimu zajedničkog sandučeta to je **potpisani token**
  (`reply-token.ts:43–54`, `<r.<tiket>.<primalac>.<nonce>.<potpis>@domena>`), inače hash `dedupeKey:primalac`
  — stabilan kroz ponovne pokušaje.
- **Zaglavlja** (`:152–160`): `In-Reply-To`/`References` na stabilni korijen `<ticket-<id>@domena>`,
  `Auto-Submitted: auto-generated`, `X-Auto-Response-Suppress: All` i `X-Service-Desk-Ticket` sa brojem.
- `render-email-message.ts` je jedan renderer za sve tipove (tabelarni HTML za Outlook + tekstualna
  alternativa): escape svih varijabli (`:464–471`), uklanjanje kontrolnih znakova (`:493–499`), naslov uvijek
  u jednom redu (`:502–504`), isječak ograničen na 600 znakova (`:506–511`), samo apsolutni `http(s)` linkovi
  (`safeUrl`, `:521–530`), te blokovi za sažetak (digest) i izvještaj (`:34–80`).
- **Blok „povjerljivo“ je u rendereru, ne u šablonu** — i naslov i tijelo dobijaju generičku varijantu, pa
  izmjena šablona ne može iscuriti podatke.

### 4.3 Isporuka, idempotencija i queue

- `deliver-notification-email.ts:24–68` prvo **preuzima zahtjev** (`claimNotificationEmailDelivery`), pa šalje,
  pa označava `SENT`; u slučaju greške **oslobađa** zahtjev (`:62–67`) da ponovni pokušaj prođe.
- `persist-notification-email-delivery.ts:12–30` je claim preko jedinstvenog `(userId, dedupeKey)`: drugi
  pokušaj sa istim ključem vraća `false` i **ne šalje ništa**; `:42–53` briše claim samo ako je još `CLAIMED`.
- **Queue put** (`notifications-fan-out.service.ts:144–165`): ako je `email` u `typesCsv` i queue je uključen,
  posao se upisuje u `IntegrationJobType.EMAIL`; inače se šalje inline. Payload se validira
  (`parse-email-integration-job-payload.ts:3–33`), a zaglavlja prolaze filter imena i zabranu prelaska u novi
  red (`:35–46`).
- Worker: `process-email-integration-job.service.ts:17–34` ponovo učitava konfiguraciju i **baca grešku** ako
  kanal nije spreman — pa posao ide u retry/backoff, a na kraju u DLQ (`compute-integration-job-backoff.ts`,
  `handle-integration-job-failure.ts`, retencija DLQ-a 30 dana).
- **Ručni retry postoji** (`integration-queue.controller.ts:63–68`, `POST /integrations/queue/:jobId/retry`),
  iza `integrationsQueueManage` permisije; frontend ima tabelu reda (`components/queue/integration-queue-*`).

### 4.4 Fan-out po događaju i lične postavke

- Događaj sa tiketa ide kroz `NotificationsFanOutService.ingest` (`:67–72`): prvo in-app, pa e-mail; greška u
  jednom kanalu se loguje i ne ruši drugi (`:93–98`, `:117–122`).
- `fan-out-email-notifications.ts:30–157`: mapiranje događaja u tip (`map-ticket-event-to-notification.ts:33–60`),
  izlaz ako tip nije e-mail šablon (`:43–45`), **SLA gate** (`:171–183`: e-mail samo za eskalacije i samo ako
  je `slaEscalationEmailEnabled`), pa primaoci (`resolveNotificationRecipients`), jedan upit za sve primaocе i
  aktera (`:67–80`), jedna provjera dozvoljene adrese i lične odluke po primaocu (`:100–128`).
- **Lične odluke** (`resolve-delivery-decisions.ts:29–70`): bez zapisa → `IMMEDIATE`; `OFF` preskače; `DIGEST`
  i `QUIET` idu u `NotificationDigestItem` (`hold-for-digest.ts:24–43`, `skipDuplicates`), pa ih šalje
  `NotificationDigestService` (`notification-digest.service.ts:62–112`) u intervalu od 5 minuta
  (`notification-digest.constants.ts:1–11`, čuvanje stavki 7 dana).
- **Sažetak** (`compose-digest-email.ts:28–119`) grupiše stavke po tiketu, prikazuje najnoviji događaj i broj
  događaja, povjerljive prikazuje **bez naslova** (`:54`), a spisak ograničava uz „i još N“.
- E-mail adresa se provjerava **prije** odluke o kanalu, pa korisnik sa nedozvoljenom domenom ne dobija ni
  stavku u sažetku.

### 4.5 Bulk broadcast

- `apply-bulk-broadcast.ts:27–61`: preview obavezan po postavci, rate limiter, formatiranje teksta; ako je
  in-app uključen, tekst ide kao `AGENT_REPLY` poruka (koja dalje pokreće normalan fan-out), a ako je in-app
  isključen, a e-mail uključen — tekst se predaje kanalu (`broadcast-email-channel.ts:8–29`,
  `dispatchBroadcastEmail`).
- `send-broadcast-emails.ts:12–98`: primaoci su **naručilac i dodijeljeni agent**, bez pošiljaoca (`:25–27`);
  šablon je `ticket.broadcast`, isječak je uvijek tekst broadcasta (`:79`), `dedupeKey` uključuje `batchId`
  (`:51`).

### 4.6 Šabloni i administratorski ekran

- **Registry v2** (`parse-email-template-registry.ts:35–52`) prima i stari v1 oblik; svako polje koje nije
  upisano dolazi iz ugrađenih tekstova; neispravna vrijednost **pada pri upisu**, ne pri slanju (`:24–34`).
- Ugrađeno je **29 ključeva × 2 jezika** (`default-email-templates.ts:32,247,462`; `email-template.constants.ts:1–41`),
  a `emailLayoutLabels` daje prijevode statusa, prioriteta i kategorija sažetka (`:38,91`).
- Admin pregled (`email-templates.service.ts:74–99`) vraća šablone, zadane vrijednosti, **samo razlike**
  (`diffEmailTemplateRegistry`) i stanje kanala (uključen, SMTP, provider, From, način odgovora, ima li
  `APP_PUBLIC_URL`). Spremanje upisuje samo razlike i traži razlog (`:103–115`, uz audit).
- **Preview i test** (`:117–190`): pregled koristi **isti renderer** kao pravo slanje, a testno pismo ide
  isključivo na adresu prijavljenog administratora, uz limit **5 slanja u 10 minuta**.
- Ekran: `settings-page.tsx:74–81` (kartice SMTP, šabloni, dolazna pošta) i zasebna ruta
  `admin/email-templates` (`app/router.tsx:261–269`, pravo `canOpenEmailTemplatesPage`); pregled se prikazuje
  u `iframe sandbox=""` (`email-templates-editor.tsx:329–333`), pa HTML iz šablona ne može doći do aplikacije.

### 4.7 Dolazna pošta (odgovor e-mailom)

- **Konfiguracija** (`inbound-email-configuration.ts:11–29,37–48`): provider `graph`|`imap`, adresa, interval
  (30–600 s, default 60), Entra aplikacija, IMAP (host/port/TLS/korisnik/lozinka/način prijave), folderi,
  `requireAuthPass`, `createTickets`, `defaultServiceId`, rokovi čuvanja, limit po pošiljaocu i po prolazu.
  `inboundConfigurationProblems` (`:37–48`) vraća konkretne nedostatke koji se prikazuju u admin kartici.
- **Zakazivanje** (`inbound-email.constants.ts:1–10`, `inbound-email.scheduler.service.ts:21–37`): tick svakih
  30 s (stvarni interval provjerava servis), retencija noću u 03:20; procesor je jedan po redu
  (`inbound-email.processor.ts:45–63`).
- **Prolaz** (`inbound-email.service.ts:107–162`): provjera da li je vrijeme (`runDue`, uz backoff poslije
  grešaka), pa `runOnce` — otvaranje konektora, čitanje do `maxMessagesPerRun` poruka, obrada jedne po jedne.
- **Idempotencija** (`:188–254`): red po `(mailboxKey, providerMessageId)`; već odlučena poruka se samo
  premješta, prekinuta se označava `FAILED` i **nikad ne ponavlja** (da se odgovor ne udvostruči), a poruka
  koja je potrošila 3 pokušaja ide u „odbijeno“. Duplikat po `Message-ID` se ignoriše (`:247–254`).
- **Pravila obrade** (`process-inbound-message.ts:85–159`, odluke R4–R11):
  `detectAutoReply` (`detect-auto-reply.ts:17–39` — out-of-office, bounce, liste, sopstvene adrese),
  limit po pošiljaocu (`:95–96`), provjera autentičnosti poruke (`check-sender-authentication.ts:12–24` —
  DMARC ili SPF+DKIM ili interni Exchange),
  domena pošiljaoca (`:98`), aktivan korisnik (`:100–102`), uklanjanje citata i potpisa
  (`extract-reply-text.ts:23–62`), prepoznavanje cilja (`resolve-inbound-target.ts:13–22`: token → thread →
  `[T-…]` u naslovu → novi e-mail), spajanje na roditelja ako je tiket merge-ovan (`:126–129`), zatvoren tiket
  (`:135–138`), ponovno otvaranje riješenog (`:142–144`), tip poruke `USER_REPLY`, uz pad na `AGENT_REPLY` za
  osoblje i **nikad internu bilješku** (`inbound-email.service.ts:312–321`), prilozi kroz iste provjere kao
  upload uz sistemsku bilješku o odbijenom prilogu (`process-inbound-message.ts:161–178`).
- **Konektori** (`mailbox/inbound-mailbox.ts:1–22`, `create-inbound-mailbox.ts:6–19`): port sa `list/move/close`;
  `GraphInboundMailbox` (`graph-mailbox.ts:17–88`) koristi Entra token i sam kreira foldere; `ImapInboundMailbox`
  (`imap-mailbox.ts:27–90`) radi sa UID-om oblika `<UIDVALIDITY>:<UID>`, podržava lozinku i OAuth2 (jer je
  Exchange Online ugasio basic auth). Token se kešira do isteka (`entra-token.ts:4–34`).
- **Čuvanje originala** (`inbound-raw-store.ts:15–45`): `.eml` se gzip-uje u `inbound-raw/<mjesec>/`, sa
  dozvolama `0600`; stariji mjeseci se brišu u cjelini. Retencija metapodataka je 180 dana
  (`inbound-email.service.ts:164–186`), a iste redove čisti i modul privatnosti (politika `emailDeliveries`,
  180 dana — `privacy/retention/retention-plan.ts:81`, `retention-executors.ts:97–125`).
- **Nadzor** (`inbound-email-admin.controller.ts:20–38`, `inbound-email-admin.service.ts:52–118`): status
  konektora, zadnja greška i broj uzastopnih padova, brojevi u 24 h, posljednjih 50 obrađenih **bez tijela
  poruke**, te „Testiraj konekciju“. Kad sandučić padne tri puta zaredom, svi aktivni administratori dobijaju
  jedno in-app obavještenje (`inbound-email.service.ts:398–431`).
- **Uputstvo za postavljanje** postoji u `docs/ops/inbound-email.md` (124 linije: Entra aplikacija, RBAC
  ograničenje na jedan sandučić, IMAP varijanta, tajna tokena).

### 4.8 Testovi

- Brojevi: `notifications/email/` **33 fajla, 10 spec** (4425 linija), `inbound-email/` **25 fajlova, 2 spec**
  (1940 linija), `notifications/preferences/` 2 spec; e2e `tests/11-email-templates.spec.ts` ima **2 testa**
  (preview + čuvanje sa vraćanjem zadanih vrijednosti) i ne dira dolaznu poštu.
- Pokriveni su ključni putevi: `compose-ticket-email.spec.ts` (povjerljivo, jezik, isječak),
  `render-email-message.spec.ts`, `fan-out-email-notifications.spec.ts` (318 linija),
  `sla-escalation-email.spec.ts` (gate za eskalacije), `parse-email-template-registry.spec.ts`,
  `inbound-email.spec.ts` (285 linija — pravila obrade kroz portove).

## 5. Gap analiza

| Zadatak (RAW / plan) | Idealno | Trenutno | Status |
|---|---|---|---|
| E-mail kao kanal istog engine-a (RAW `:951`) | Jedan fan-out, kanali po postavkama | `NotificationsFanOutService.ingest` zove in-app pa e-mail (`notifications-fan-out.service.ts:67–72`) | ✅ |
| Uključivanje kanala postavkom (RAW `:692`) | Tri prekidača (addon, SMTP, kanal) bez skrivenih stanja | `resolve-email-channel-enabled.ts:8–13` + `load-email-channel-configuration.ts:97–123` | ✅ |
| Internal-only + allow-liste (RAW `:713–715`) | Zadano interno, eksterno samo izuzetno | `is-allowed-notification-email-address.ts:14–31`; interne domene kao postavka, seed iz instalacije | ✅ |
| Durable queue + retry/backoff + DLQ (RAW `:866,:953`) | Nijedan e-mail se ne izgubi bez traga | Queue po tipu, backoff, DLQ 30 dana, ručni retry | ✅ |
| Ručni retry iz UI (RAW `:953`) | Administrator ponovo pokreće neuspjeli e-mail | `POST /integrations/queue/:jobId/retry` + tabela u UI | ✅ |
| Šabloni na BS i EN (RAW `:351`) | Pad na drugi jezik kad prijevoda nema | 29 ključeva × bs/en, `resolveEmailLocale` + fallback locale | ✅ |
| Uređivanje šablona sa pregledom (plan 1.5 E1) | Admin ne može pokvariti prikaz ni ubaciti HTML | Registry v2, validacija na upisu, escape, `iframe sandbox=""` | ✅ |
| Povjerljiv tiket (plan 1.5 E3) | Samo broj i link | `compose-ticket-email.ts:37–44`, renderer režim „confidential“ | ✅ |
| Redakcija sadržaja koji izlazi (plan 1.5 E4) | Svaki izlazni tekst prođe redakciju | Poruke i opis tiketa prolaze; **bulk broadcast ne** | ⚠️ B2 |
| Threading i zaštita od petlji (plan 1.5 E6/E7) | Jedan razgovor po tiketu, bez OOF petlji | Stabilan korijen + `Auto-Submitted` + `X-Auto-Response-Suppress` | ✅ |
| Isporuka tačno jednom (plan 1.5/2.2) | Ponovni pokušaj ne šalje dvaput | Claim `(userId, dedupeKey)`; **bez roka za zaglavljeni claim** | ⚠️ B1 |
| Eskalacije e-mailom kao opcija (RAW `:516,:1126`) | Podrazumijevano isključeno | Gate `slaEscalationEmailEnabled` (`fan-out-email-notifications.ts:171–183`) | ✅ |
| Bulk broadcast e-mail (RAW `:152,:534`) | In-app i/ili e-mail, bez dupliranja | `apply-bulk-broadcast.ts:27–61` (in-app put pokreće fan-out; e-mail put ide kanalom) | ✅ |
| Lične postavke i tihi sati (plan 2.2) | Korisnik bira kanal i način, bez gubitka događaja | `resolve-delivery-decisions.ts`, `hold-for-digest.ts`, sažetak svakih 5 min | ✅ |
| Odgovor e-mailom: konektori (plan 2.3 R1) | Graph + IMAP, bez SDK-a, tajne šifrovane | `graph-mailbox.ts`, `imap-mailbox.ts`, keširan Entra token | ✅ |
| Prepoznavanje tiketa bez oslanjanja na naslov (R4) | Potpisan token, uz rezervne puteve | `reply-token.ts` (HMAC + rotacija + naslijeđena tajna) | ✅ |
| Pošiljalac mora biti aktivan korisnik sa pravom pisanja (R5) | Ista pravila kao u aplikaciji | `process-inbound-message.ts:97–102` + `TicketsCollaborationService.createMessage` | ✅ |
| Anti-loop (R11) | Nula automatskih odgovora na automate | `detect-auto-reply.ts` + limit 20/h po pošiljaocu | ✅ |
| Idempotencija dolazne obrade (R12) | Ista poruka nikad dva puta | Red po provajder-ID-u i po `Message-ID`, „prekinuto“ se ne ponavlja | ✅ |
| Nadzor i test konekcije (R13) | Stanje, brojevi, razlozi odbijanja | `admin/inbound-email/status` i `test-connection`, bez tijela poruka | ✅ |
| Retencija (R14) | Original i metapodaci sa rokom | 30 dana `.eml.gz`, 180 dana metapodaci; dodatno privacy politika 180 dana | ✅ |
| Testno slanje (plan 1.5 §5) | Ograničeno i revidirano | 5/10 min **u memoriji instance**, uz audit | ⚠️ B4 |
| Prolaznost bez čekanja (plan 1.5) | Jedna veza ili pul za više primalaca | Nova SMTP veza po svakoj poruci | ⚠️ B3 |
| Jezik teksta broadcasta (RAW `:351`) | Tekst u jeziku primaoca | Oznake polja su hardkodirane na engleskom | ⚠️ B5 |
| Mjerenje i alarm kanala (RAW `:1050–1053`) | Kanali imaju metrike i alarm | `ops-health` prikazuje samo posljednji `SENT` | ⚠️ B1 (dio) |
| e2e pokrivenost pošte | Odgovor e-mailom i sažetak u CI-ju | 2 testa za šablone; dolazna pošta bez e2e | ⚠️ gap (NISKO) |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Najjači dio modula je disciplina na izlazu iz sistema.** Jedan renderer za sve tipove e-maila, escape svake
  varijable, naslov uvijek u jednom redu, samo apsolutni `http(s)` linkovi, povjerljivi režim u rendereru (pa
  ga izmjena šablona ne može zaobići) i redakcija opisa i isječka. To je tačno skup pravila koji se u praksi
  najčešće preskoči, a ovdje je u srcu, ne u dokumentaciji.
- **Idempotencija i queue su na mjestu.** Claim po `(korisnik, ključ događaja)`, stabilan `Message-ID` kroz
  ponovne pokušaje, posao u redu sa backoff-om, DLQ sa rokom i ručni retry iz UI-ja — to je „radi tačno
  jednom“ nivo. Jedina prava rupa je **claim bez roka** (B1), koja je posljedica toga da tabela nema polje
  vremena preuzimanja.
- **Dolazna pošta je napisana kao port, ne kao integracija.** `InboundMailboxConnector` sa Graph i IMAP
  implementacijom, čista funkcija obrade (`processInboundMessage`) sa pravilima R4–R11 koja se testiraju bez
  sandučeta i baze, i admin stranica koja nikad ne vraća tijelo poruke — to je arhitektura koja se može
  održavati i nakon promjene provajdera e-pošte.
- **Sitnice koje odaju zrelost:** `Message-ID` nosi potpisani token **i** rotaciju tajne
  (`INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS` + naslijeđeni HKDF label), prekinuta poruka se **namjerno** ne
  ponavlja, prilog odbijen u ClamAV-u ostavlja sistemsku bilješku, a `inboundEmailLimits` grupiše pragove na
  jednom mjestu.
- **Gdje bih tražio više:** (1) bulk broadcast je jedini izlazni put koji ne prolazi redakciju (B2); (2)
  `SmtpMailTransport` otvara novu vezu za svaku poruku (B3); (3) odluka „e-mail ne ide“ nije nigdje zapisana
  po primaocu, pa je „nisam dobio e-mail“ nemoguće ispitati iz aplikacije; (4) e2e ne dodiruje dolaznu poštu
  iako port za testiranje već postoji.
- **Higijena:** tipizovano bez `any`, imena funkcija kazuju odluku (`isAllowedNotificationEmailAddress`,
  `resolveEmailLocale`, `detectAutoReply`), a komentari objašnjavaju razlog (zašto broadcast uvijek nosi tekst,
  zašto se prekinuta poruka ne obrađuje ponovo, zašto preset ne pregazi upisani host). Zamjerka je sitna:
  `inbound-email.service.ts:113–116` koristi `Math.max(maxBackoffSeconds, pollSeconds)` za gornju granicu
  backoff-a, što je kroz dozvoljeni raspon (30–600 s) uvijek isto — izraz je nejasan, ne štetan.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Zaglavljen zahtjev za isporuku trajno gubi e-mail, bez alarma → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/notifications/email/persist-notification-email-delivery.ts:12–30,42–53`,
  `backend/src/modules/notifications/email/deliver-notification-email.ts:34–42`,
  `backend/src/modules/ops-health/ops-health.service.ts:98–100`
- **Opis:** isporuka se prvo „preuzima“ upisom reda sa statusom `CLAIMED` preko jedinstvenog
  `(userId, dedupeKey)`; ako je red već tu, funkcija vraća `false` i `deliverNotificationEmail` izlazi **bez
  greške**. Claim se oslobađa samo u `catch` bloku istog procesa. Ako proces umre između upisa i slanja (OOM,
  `kill -9`, redeploy), red ostaje `CLAIMED` trajno, a svaki ponovni pokušaj — uključujući retry iz durable
  queue-a — je **tihi no-op**. Nadzorna tabla gleda samo redove sa statusom `SENT`, pa je stanje „zdravo“.
- **Uticaj:** pojedinačna obavještenja (i digest/sažetak koji koriste isti claim) mogu biti trajno izgubljena
  bez ikakvog traga u UI-ju; greška je rijetka ali neponištiva.
- **Fix:** dodati `claimedAt` i pravilo „preuzmi ponovo ako je `CLAIMED` stariji od N minuta“ (ili noćno
  čišćenje starih `CLAIMED` redova), te brojač zaglavljenih prikazati u `ops-health`.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — Bulk broadcast ne prolazi redakciju osjetljivih podataka → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/tickets/bulk/apply-bulk-broadcast.ts:41–61`,
  `backend/src/modules/tickets/bulk/format-bulk-broadcast-message.ts:26–40`,
  `backend/src/modules/notifications/email/send-broadcast-emails.ts:79`
- **Opis:** tekst broadcasta se upisuje kao `AGENT_REPLY` poruka direktno kroz Prisma, a u e-mail putu ide kao
  `excerpt` u šablon. Ni u jednom putu se ne poziva `redactSensitiveText`, dok svaka druga poruka prolazi
  redakciju kroz `createTicketMessage` (`tickets-collaboration.service.ts:139,153–161`) i svaki drugi e-mail
  kroz `redactForEmail` (`compose-ticket-email.ts:165–170`).
- **Uticaj:** uzorak osjetljivog podatka (broj kartice, lozinka, lični podatak) koji administrator prepiše iz
  tiketa u broadcast odlazi **cijeloj grupi i naručiocu e-mailom**, bez upozorenja u change logu — tačno ono
  što redakcija postoji da spriječi.
- **Fix:** primijeniti `redactForEmail` (ili `redactSensitiveText` sa `enabled: true`) na formatirani tekst
  prije upisa i prije slanja, i upisati upozorenje (`recordRedactionWarning`) kad je uzorak nađen.
- **Ozbiljnost:** SREDNJE.

### B3 — NISKO — Nova SMTP veza za svaki e-mail → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/notifications/email/smtp-mail-transport.ts:7–17,38–40`
- **Opis:** `createTransport` se poziva **unutar** `send`, a `transporter.close()` u `finally` — nema
  keširanja transportera ni `pool: true`. Svaka poruka plaća novi TCP i TLS handshake prema SMTP serveru.
- **Uticaj:** fan-out na više desetina primalaca (broadcast, dnevni sažetak, zakazani izvještaj) stvara isti
  broj veza prema Office 365/Gmail-u; to povećava latenciju i rizik od throttle-a provajdera, a queue radi
  sporije nego što bi morao.
- **Fix:** držati transporter po konfiguraciji (`host:port:korisnik`) i koristiti `pool: true`; promjena
  postavki treba invalidirati keš.
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Ograničenje testnog slanja postoji samo u memoriji instance → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/notifications/email-templates/email-templates.service.ts:61–66,159`,
  `backend/src/modules/notifications/email-templates/email-templates.controller.ts:75–83`
- **Opis:** limit „5 testnih e-mailova u 10 minuta“ čuva se u `Map` polju servisa. Restart procesa ga resetuje,
  a kod više API instanci svaka ima svoj brojač, pa stvarni limit iznosi 5 × broj instanci.
- **Uticaj:** zaštita od zloupotrebe SMTP-a od strane administratora je slabija nego što ekran sugeriše; nema
  trajnog traga o tome koliko je testova poslano.
- **Fix:** brojač u Redis-u sa TTL-om (obrazac kao kod ostalih limitera) ili red `NotificationEmailDelivery`
  sa ključem `test:<admin>:<slot>`.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Oznake polja u broadcast tekstu su hardkodirane na engleskom → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/tickets/bulk/format-bulk-broadcast-message.ts:26–33`,
  `backend/src/modules/notifications/email/send-broadcast-emails.ts:79`
- **Opis:** tekst poruke se sastavlja sa fiksnim oznakama `What happened:`, `Who is affected:`, `ETA:`,
  `Workaround:` bez prijevoda, a taj isti tekst ide i kao tijelo e-maila primaocu na bosanskom (šablon
  `ticket.broadcast` je lokalizovan, tijelo nije).
- **Uticaj:** naručilac i grupa dobijaju miješani jezik u najosjetljivijem trenutku (incident/obavijest), a
  i zapis u tiketa ostaje na engleskom bez obzira na jezik aplikacije.
- **Fix:** lokalizovati oznake (po `preferredLocale` primaoca, kao kod ostalih e-mailova) ili strukturu
  polja predati šablonu umjesto gotovog teksta.
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/posta.md`** po obaveznoj strukturi: čemu modul služi (obavještenja e-mailom,
  odgovor na e-mail, sažetak), kome je namijenjen (svi primaoci; administrator za postavke i administraciju
  šablona), kako se dolazi (Postavke → E-mail; za korisnika „Moj profil“ → obavještenja), korak po korak
  (uključi kanal, provjeri From i Reply-To, uredi šablon uz pregled, pošalji test, odgovori na e-mail, provjeri
  dnevnik dolazne pošte), tabele (postavke kanala i njihovo značenje, polja šablona i dozvoljeni placeholderi,
  razlozi odbijanja dolazne poruke, šta se nikad ne šalje za povjerljiv tiket), česta pitanja („nisam dobio
  e-mail“, „zašto nema linka“, „zašto je odgovor u Odbijeno“, „zašto ne mogu odgovoriti“), poznata ograničenja
  (**B1–B5** + činjenica da `APP_PUBLIC_URL` kontroliše linkove) i povezani moduli (Realtime i obavještenja,
  Tiketi, SLA, Odobrenja/CSAT, Postavke, Privatnost).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T74–T80** — (T74) izlazni kanal: tri prekidača i pravilo dozvoljenih adresa;
  (T75) sastavljanje poruke: šablon, escape, povjerljivi režim, isječak, redakcija; (T76) isporuka: queue,
  idempotencija, DLQ i ručni retry; (T77) lične postavke, tihi sati i dnevni sažetak; (T78) dolazna pošta:
  konektori i prepoznavanje tiketa potpisanim tokenom; (T79) dolazna pošta: pravila prihvatanja, anti-loop i
  prilozi; (T80) nadzor, retencija i operativni zahtjevi kanala.
- **`REVIEW_ANALIZA.md`:** §M12 (ovaj tekst) i **red tabele iteracija 3** → „M11 ✅ · M12 ✅ · M13 u toku“.
- **`DOCS_CHANGELOG.md`:** sekcija M12 sa izvorima i B1–B5.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Pokriveno je sve što RAW traži za izlazni kanal (uključivanje postavkom, internal-only + allow-liste, šabloni na dva jezika, povjerljivi režim, threading, queue sa retry/backoff i DLQ, ručni retry, bulk broadcast) i gotovo sve iz plana 2.3 za dolaznu poštu (Graph i IMAP konektor, potpisani token, anti-loop, idempotencija, nadzor, retencija, „novi e-mail → tiket“ uz uključivanje postavkom); minus za B1 i B2 (izgubljena isporuka i broadcast bez redakcije), za Gmail API konektor koji plan predviđa a kod nema, i za odsustvo e2e pokrivenosti dolazne pošte. |
| **Kvalitet koda** | **9/10** | Jedan renderer i jedan kompozitor za sve tipove, čiste funkcije (`isAllowedNotificationEmailAddress`, `resolveInboundTarget`, `extractReplyText`, `detectAutoReply`) koje se testiraju bez baze, port za sandučić sa dvije implementacije, konzistentni kodovi grešaka i razloga, idempotencija na oba kraja (izlaz i ulaz) i 12 spec fajlova za 58 izvornih fajlova; zamjerke su B3 (transport bez pula), B4 (limiter u memoriji) i nejasan izraz gornje granice backoff-a. |
| **Sigurnost** | **8/10** | Eksterni e-mail je zadano isključen uz allow-listu domena i adresa, povjerljivi tiket nikad ne nosi naslov ni isječak, interni sadržaj ne izlazi, tajne (SMTP lozinka, Entra klijent, IMAP lozinka) se čitaju samo interno, preview je u pješčaniku, a dolazna pošta provjerava DMARC/SPF/DKIM, aktivnog korisnika i pravo pisanja, uz zaštitu od petlji i od ponovne obrade iste poruke; minus za B2 (broadcast bez redakcije), B1 (tiha isporuka) i za to što je Gmail API iz plana izostavljen, pa instalacije na Google Workspaceu zavise od IMAP lozinke ili OAuth2 puta. |

# M13 — Šabloni (gotovi odgovori i playbooks)

## 1. Planirano u RAW projektnom zadatku

- **Šabloni su „agent-side, opcionalno, light“**: „za odabrane servise agent/admin ima **template odgovora**
  i/ili **checklistu koraka** (playbook) radi konzistentnosti (ne mijenja ticket model; samo UX pomoć)“
  (`RAW_PROJECT.md:104–105`).
- **Postavka uključivanja:** `private.ticket.templates.enabled` (default **true**), uz
  `private.ticket.templates.registryJson` („registry templates po serviceId“, default prazno, `:681–682`).
- **Kapacitet se vodi kao zaseban modul** `ticket-templates-playbooks` (`:784`).
- **Kriterij prihvatanja** (`:929–930`): „admin može definisati **template odgovor/playbook po servisu** i
  koristiti ga u rješavanju (**bez uticaja na sigurnost/OU scope**)“.
- **Odnos prema rješavanju tiketa:** playbook je pomoć pri rješavanju, pa se preporuke vežu na pravila
  statusa i „Waiting for User“ automatike (`:933–935`), ali RAW izričito ne traži da checklista **blokira**
  promjenu statusa — to je odluka paketa 1.4.
- Paket 1.4 (`docs/plans/modules/1.4-sabloni-playbooks.md`) razrađuje odluke **T1–T6** (model šablona,
  varijable, jezik, opseg, rangiranje, prava) i **P1–P5** (model playbooka, snapshot na tiketu, automatsko
  vezivanje, koraci i štikliranje, guard pri rješavanju), uz dodatak **A1–A5** za administraciju i reviziju.
  Odobreno je **bez `registryJson`** (šabloni su redovi u bazi, ne JSON postavka).

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

- **Šablon je podatak sa opsegom, ne skrivena postavka.** Naziv, tijelo po jeziku, tip (javni odgovor /
  interna bilješka / oboje), opseg (servis, kategorija, grupa) i vlasnik (zajednički ili lični) — sve u
  tabelama sa vezama, pa se brisanje servisa ili grupe automatski odrazi i na šablon.
- **Serverska pravila su ista kao i u pregledu.** Ako interfejs nudi samo aktivne šablone koji odgovaraju
  načinu pisanja, server to mora ponoviti: deaktiviran šablon se ne može poslati, a šablon namijenjen
  internoj bilješci ne može izaći kao javni odgovor. Pravilo koje postoji samo u UI-ju nije pravilo.
- **Popunjavanje varijabli je predvidivo i bezopasno.** Dozvoljena je mala, unaprijed poznata lista
  (podaci o tiketu, podnosiocu i trenutnom agentu), sve ostalo ostaje doslovno i prijavljuje se kao
  nepoznato; vrijednost koje nema postaje prazna i **eksplicitno se prijavi** prije slanja, da agent ne
  pošalje odgovor sa prazninom na mjestu imena.
- **Playbook je kopija koja se ne mijenja pod nogama.** Tiket dobija snimku koraka i verziju; izmjena
  playbooka ne mijenja tiket u toku, a „nadogradi checklistu“ je svjesna akcija koja čuva već štiklirane
  korake po stabilnom ključu.
- **Guard je predvidiv i objašnjen.** Ako je uključeno blokiranje, odbijanje nosi tačan spisak otvorenih
  obaveznih koraka (i broj tiketa), a ne generičku grešku; u režimu „upozori“ agent vidi šta ostaje prije
  nego potvrdi rješenje.
- **Administracija je revidirana.** Svaka izmjena šablona i playbooka ima razlog, prije/poslije i autora, a
  konfiguracijski snapshot ih uključuje (samo zajedničke, lični se nikad ne diraju).
- **Bez testova nema povjerenja.** Servisi sa pravima, opsezima i transakcijama moraju imati testove na
  nivou ponašanja (ko smije, koji opseg, šta se dešava pri istovremenom vezivanju), jer su to tačke gdje
  greška znači ili curenje sadržaja ili nemogućnost rada.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Provjeriti šablon i pri slanju, ne samo u pregledu.** U `render` i u prihvatanju poruke provjeriti
   `isActive` i poklapanje tipa (REPLY / INTERNAL / ANY) sa tipom poruke koja se kreira; u suprotnom
   vratiti istu grešku koju UI prikazuje.
2. **Rangiranje i filtriranje prenijeti u upit.** Umjesto „pročitaj prvih 500 pa filtriraj u memoriji“
   filtrirati po opsegu i naručiti po rangu i upotrebi u SQL-u (ili paginirati), pa `pickerLimit` primijeniti
   na već rangiranu listu.
3. **Jedinstvenost imena zaštititi u bazi.** Dodati jedinstveni indeks (vlasnik + naziv, uz uslov da nije
   obrisan) ili barem transakciju sa provjerom, da paralelni zahtjevi ne proizvedu dva šablona istog imena.
4. **Statistiku upotrebe vezati za uspješno upisivanje poruke.** Povećanje `usageCount` prebaciti u istu
   transakciju sa upisom poruke (ili poslije njega), da statistika ne raste za poruke koje nisu nastale.
5. **Omogućiti svjesno uvođenje playbooka na tikete u toku.** Akcija „primijeni na otvorene tikete servisa“
   u administraciji playbooka, umjesto da samo novi tiketi dobijaju checklistu.
6. **Dodati testove na nivou servisa.** Scenariji: agent bez `ticket.templates.manage` ne mijenja zajednički
   šablon; administrator ograničen na servis ne pravi globalni opseg; dva istovremena vezivanja playbooka
   daju jedan uspjeh i jednu grešku; `block` režim vraća spisak koraka u 409; nadogradnja čuva štiklirane
   korake i mijenja verziju.

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Model i postavke

- **Šabloni:** `ResponseTemplate` sa `name`, `bodyBs` (obavezno) i `bodyEn` (opcionalno), `kind`
  (`REPLY`/`INTERNAL`/`ANY`), oznakama, `isActive`, `ownerUserId` (prazno = zajednički), brojačima i
  `deletedAt`; opsezi su vezne tabele `ResponseTemplateService`/`…Category`/`…Group` sa `onDelete: Cascade`
  (`backend/prisma/schema/templates.prisma:4–61`).
- **Playbook:** `Playbook` sa `version`, koracima (`PlaybookStep` sa `stepKey`, `position`, `required`,
  vezom na članak baze znanja i šablon odgovora) i opsegom po servisu/kategoriji
  (`templates.prisma:63–121`); `TicketPlaybook` drži **snimku** koraka (`stepsSnapshot`), naziv i
  verziju playbooka na tiketu, a `TicketPlaybookStep` (jedinstven po `(ticketPlaybookId, stepKey)`) čuva ko je
  koji korak štiklirao i kada (`templates.prisma:124–157`).
- **Postavke** (`templates-configuration.loader.ts:16–53`, `templates.constants.ts:56–68`): šabloni uključeni,
  playbooks uključeni, automatsko vezivanje uključeno i režim obaveznih koraka `off`/`warn`/`block`
  (zadano `warn`); ključevi su `private.ticket.templates.enabled`, `private.ticket.playbooks.enabled`,
  `private.ticket.playbooks.autoAttach`, `private.ticket.playbooks.requiredStepsOnResolve`
  (`settings/definitions/ticket-templates-settings.ts:9–45`).

### 4.2 Odabir i popunjavanje šablona

- **Dozvoljene varijable** (`templates.constants.ts:8–25`): broj i naslov tiketa, link, servis, kategorija,
  grupa, status, prioritet, ime i prvo ime podnosioca, ime i prvo ime agenta, organizaciona jedinica, SLA rok
  rješenja, naziv aplikacije i današnji datum — namjerno bez podataka iz internih bilješki i bez polja formi.
- **Popunjavanje** (`template-placeholders.ts:37–52`): nepoznata imena ostaju doslovno, a vrijednost koje
  nema postaje prazna i vraća se u `missing`; editor prikazuje i `unknown`
  (`response-templates.service.ts:188–221`).
- **Vrijednosti** (`build-template-variables.ts:22–135`): prvo ime se izvodi i iz oblika „Prezime, Ime“,
  datum i SLA rok se formatiraju po jeziku i vremenskoj zoni (`formatTemplateDateTime`, `:35–47`), a sve se
  čita jednim paralelnim krugom upita.
- **Opseg i rangiranje** (`template-scope.ts:20–29`): 3 = poklapa servis, 2 = kategorija, 1 = dodijeljena
  grupa, 0 = globalni, -1 = vezan drugdje (prikazuje se samo uz „prikaži sve“).
- **Prava** (`template-scope.ts:46–58`, `response-templates.service.ts:458–471`): lični šablon traži
  `ticket.templates.personal`, zajednički `ticket.templates.manage`; administrator ograničen na servise
  **ne može** praviti globalni, kategorijski ni grupni opseg, nego samo opseg sastavljen od njegovih servisa.
  Korištenje u composeru traži `ticket.templates.use` (`:401–408`).
- **Picker** (`response-templates.service.ts:103–151`): čita aktivne, neobrisane šablone koji su zajednički
  ili moji, filtrira po tipu i pretrazi, izračuna rang i vrati do 200 najboljih sa pregledom i oznakom da
  postoji engleska verzija.

### 4.3 Upotreba šablona i statistika

- **Umetanje u composer:** `template-picker.tsx`, `variable-palette.tsx` i `save-as-template-dialog.tsx`;
  composer pamti koji je šablon ubačen i šalje `responseTemplateId` uz poruku
  (`frontend/src/components/tickets/ticket-message-composer.tsx:16–17,150,196–237,277,502`).
- **Render prije slanja:** `POST /tickets/:ticketId/response-templates/:templateId/render`
  (`response-templates.controller.ts:112–121`) vraća tekst, jezik, nedostajuće i nepoznate varijable
  (`response-templates.service.ts:153–186`).
- **Statistika upotrebe** (`tickets/create-ticket-message.ts:81–108`): pri upisu poruke sa
  `responseTemplateId` povećava `usageCount` i postavlja `lastUsedAt`, ali samo ako je šablon aktivan nije
  obrisan i pripada pozivaocu ili je zajednički; nepoznat šablon se ignoriše i **ne sprječava** slanje.
- **Revizija:** svaka izmjena šablona/playbooka ide u change log sa razlogom, prije/poslije i autorom
  (`record-templates-change.ts:1–42`), a konfiguracijski snapshot ih uključuje — lični šabloni se ne diraju
  (`config-versioning/apply-templates-snapshot.ts:6–40`, `collect-config-snapshot.ts:47–62,137`).

### 4.4 Playbook na tiketu

- **Automatsko vezivanje** (`attach-playbook-to-ticket.ts:106–132`): pri kreiranju tiketa traži se
  odgovarajući playbook; ako ih je **tačno jedan**, veže se automatski (kao sistemska radnja, bez aktera).
  Poziv je „best effort“ iz `TicketsService.create` (`tickets.service.ts:159–178`) — greška oko playbooka ne
  ruši kreiranje.
- **Ručno vezivanje** (`:43–100`): u transakciji se tiket zaključava (`FOR UPDATE`), provjerava da već ne
  postoji aktivan playbook, pa se upisuje snimka koraka, verzija i naziv, uz sistemski događaj i zapis u
  change log.
- **Rad sa checklistom** (`ticket-playbooks.service.ts:75–252`): `get` vraća stanje (i spisak dostupnih
  playbooka sa rangom), `attach`, `detach` (sa razlogom), `upgrade` (na noviju verziju, čuvajući štiklirane
  korake po `stepKey`), `setStep` (idempotentno štikliranje, sistemski događaj, i događaj „završeno“ kad su
  svi koraci gotovi). Stanje je dozvoljeno mijenjati samo osoblju sa `ticket.templates.use` i samo ako tiket
  nije zaključan za izmjene (`:264–285`).
- **Snimka i napredak** (`ticket-playbook-snapshot.ts:12–60`): koraci se sortiraju po poziciji, čitanje JSON-a
  je tolerantno (loši unosi se odbacuju), a napredak računa ukupno, gotovo, obavezne i spisak otvorenih
  obaveznih koraka.
- **Guard pri rješavanju** (`tickets/playbooks/assert-playbook-steps-complete.ts:15–56`): pokriva prelaz u
  `RESOLVED` i zatvaranje iz bilo kojeg statusa osim `RESOLVED`; u režimu `block` odbija promjenu sa kodom
  `PLAYBOOK_REQUIRED_STEPS_OPEN` i spiskom tiketa i koraka, a u režimu `warn` upozorava u dijalogu
  (`frontend/src/pages/ticket-detail-page.tsx:506–508`). Poziva se iz pojedinačne promjene statusa
  (`tickets/update-ticket.ts:102`) i iz bulk promjene (`tickets/bulk/apply-bulk-status.ts:49`).
- **Vidljivost:** sistemski događaji playbooka su u grupi `staffOnlyMessageTypes`
  (`tickets/collaboration.constants.ts:32–36`), pa ih podnosilac ne vidi — checklista je interna, kako plan i
  traži.

### 4.5 Administracija i ekrani

- **API:** `GET/POST/PUT/DELETE /response-templates` (+ `/manage`, `/preview`, `/mine` za lične),
  `GET/POST/PUT/DELETE /playbooks` i rute na tiketu (`/tickets/:id/playbook`, `/playbook/upgrade`,
  `/playbook/steps/:stepKey`); svi zahtjevi traže prijavu i **staff rolu**, a fine provjere su u servisima.
- **Ekrani:** `admin/templates` (lista sa tabovima šabloni/playbookovi), `admin/templates/new` i
  `admin/templates/:templateId`, `admin/templates/playbooks/new` i `…/:playbookId`
  (`frontend/src/app/router.tsx:274–335`); na tiketu `ticket-playbook-panel.tsx` (269 linija) sa
  napretkom, štikliranjem i ponudom dostupnih playbooka; prijevodi: **209 ključeva** u `templates.*` na oba
  jezika.

### 4.6 Testovi

- **Backend:** modul `templates` ima **1 spec** (`templates-pure.spec.ts`, 205 linija) koji pokriva čiste
  funkcije — validaciju placeholdera, normalizaciju unosa, opseg i prava, čitanje konfiguracije i pomoćne
  funkcije playbooka (`computePlaybookProgress`, `keysKeptOnUpgrade`, `rankApplicablePlaybooks`,
  `selectAutoAttachPlaybook`). Uz njega postoji `tickets/playbooks/assert-playbook-steps-complete.spec.ts`
  (60 linija) za guard. **Servisi (576 + 335 + 403 linije) nemaju nijedan jedinični test.**
- **Frontend:** `lib/templates/templates-lib.spec.ts` (98 linija).
- **e2e:** `16-templates-playbooks.spec.ts` (170 linija, **1 test**) provjerava kroz API i UI režim obaveznih
  koraka i ponašanje pri rješavanju.
- Ukupno: **23 fajla u modulu, 1 spec**.

## 5. Gap analiza

| Zadatak (RAW / plan) | Idealno | Trenutno | Status |
|---|---|---|---|
| Šabloni odgovora po servisu (RAW `:104`) | Model sa opsegom i vlasnikom | `ResponseTemplate` + vezne tabele; opseg servis/kategorija/grupa | ✅ |
| Playbook (checklista koraka) po servisu (RAW `:104`) | Koraci, napredak, ko je štiklirao | `Playbook` + `TicketPlaybook` + `TicketPlaybookStep` | ✅ |
| „Ne mijenja ticket model, samo UX pomoć“ (RAW `:105`) | Bez uticaja na tok tiketa | Snimka i sistemski događaji; guard je opcija (`off/warn/block`) | ✅ |
| Uključivanje postavkom (RAW `:681`) | Jedna postavka za šablone | `private.ticket.templates.enabled` (+ playbooks/autoAttach/mode) | ✅ |
| `registryJson` po `serviceId` (RAW `:682`) | — | **Nije implementirano**: šabloni su redovi u bazi (odobreno odstupanje u 1.4) | ➖ (odstupljeno) |
| Definiše **admin** (RAW `:929`) | Samo admin mijenja zajedničke | `ticket.templates.manage`, uz ograničenje opsega po servisima | ✅ |
| Koristi ga **agent** u rješavanju (RAW `:929`) | Brz odabir u composeru | Picker + render + upotreba kroz `responseTemplateId` | ✅ |
| Bez uticaja na OU scope (RAW `:930`) | Tiket se čita kroz prava pristupa | `loadAccessibleTicket` sa `writable` + staff provjera | ✅ |
| Jezik: bs obavezan, en opcionalan (plan T1) | Pad na bs | `bodyBs` + `bodyEn` uz `resolveTemplateLocale` (jezik podnosioca) | ✅ |
| Varijable: bijela lista (plan T2) | Bez internih podataka i polja formi | 16 dozvoljenih varijabli | ✅ |
| Opseg i rangiranje (plan T5) | Servis > kategorija > grupa > globalno | `scoreTemplateScope` 3/2/1/0/-1 | ✅ |
| Prava po opsegu (plan A2) | Ograničen admin ne dira tuđe servise | `canManageSharedScope` | ✅ |
| Jedan playbook po tiketu (plan P2) | Bez dvostrukog vezivanja | `FOR UPDATE` + provjera aktivnog u transakciji | ✅ |
| Snimka i nadogradnja (plan P2) | Koraci stabilni kroz izmjene | `stepKey` + `keysKeptOnUpgrade` + verzija | ✅ |
| Guard pri rješavanju (plan P5) | `block` sa spiskom koraka | `assertPlaybookStepsComplete` u pojedinačnoj i bulk promjeni | ✅ |
| Automatsko vezivanje pri kreiranju (plan P3) | Tačno jedan odgovarajući | `selectAutoAttachPlaybook`, best effort | ✅ |
| Retroaktivno uvođenje playbooka | Tiketi u toku mogu dobiti checklistu | Samo ručno po tiketu; nema akcije po servisu | ⚠️ B4 |
| Serverska provjera pri slanju | Deaktiviran/„interni“ šablon se ne može poslati kao javni | Provjere su samo u pickeru; `render` i upis poruke ne provjeravaju | ⚠️ B1 |
| Pickerski upit | Filtriranje u bazi, determinisan izbor | `take: 500` bez `orderBy`, filtriranje u memoriji | ⚠️ B2 |
| Jedinstvenost naziva | Zaštićeno u bazi | Samo provjera u aplikaciji (`assertNameFree`) | ⚠️ B3 |
| Tačna statistika upotrebe | Broj raste samo za poslane poruke | `usageCount` se povećava prije upisa poruke | ⚠️ B5 |
| Testovi servisa | Ponašanje prava, opsega i transakcija | 3 servisa bez testova; e2e 1 scenario | ⚠️ gap (NISKO) |
| Revizija i snapshot | Svaka izmjena sa razlogom | Change log + config snapshot (bez ličnih) | ✅ |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Najbolji dio je model opsega i prava.** Opseg nije JSON nego veza, pa servis i grupa drže referencu, a
  `canManageSharedScope` spriječava najčešću grešku u ovakvim modulima — da administrator ograničen na jedan
  servis napravi globalni šablon i tako „vidi“ tuđe tikete. Uz to, filter `score >= 0` znači da agent ne
  dobija šablone koji ne pripadaju tiketu, a `show all` je svjesna akcija.
- **Playbook kao snimka je zrela odluka.** Tiket čuva kopiju koraka i verziju, štikliranje se pamti po
  stabilnom `stepKey`, nadogradnja čuva već gotove korake, a jedan aktivan playbook po tiketu je zaštićen
  `FOR UPDATE` zaključavanjem — to je razlika između „radi“ i „radi kad dva agenta kliknu istovremeno“.
- **Vidljivost je ispravna:** sistemski događaji checkliste su staff-only, pa interna procedura ne izlazi
  podnosiocu; guard u `block` režimu vraća **spisak otvorenih koraka**, što je jedina upotrebljiva poruka za
  agenta u tom trenutku.
- **Gdje bih tražio više:** (1) serverska provjera tipa i aktivnosti šablona ne postoji (B1) — to je jedina
  tačka gdje pravilo postoji samo u interfejsu; (2) picker i liste playbooka čitaju fiksni broj redova bez
  redoslijeda (B2), pa izbor nije determinisan; (3) jedinstvenost naziva počiva na aplikacijskoj provjeri
  (B3); (4) brojanje upotrebe je prije upisa poruke (B5); (5) najveći sistemski rizik nije u kodu nego u
  **testovima**: tri servisa sa pravima i opsezima (1314 linija) nemaju ni jedan jedinični test, a e2e pokriva
  jedan scenario.
- **Higijena:** tipizovano bez `any`, kod govori „zašto“ (komentari o snimci, o idempotentnom štikliranju, o
  tome zašto automatsko zatvaranje ne prolazi guard), a poruke greške imaju kodove koji se mapiraju u UI
  (`map-templates-error.ts`, `map-ticket-error.ts:144`).

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Deaktiviran ili „interni“ šablon može se poslati kao javni odgovor → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/templates/response-templates.service.ts:153–186` (render),
  `backend/src/modules/tickets/create-ticket-message.ts:63–67` (prihvatanje poruke),
  `backend/src/modules/templates/response-templates.service.ts:111–134` (picker, za kontrast)
- **Opis:** picker nudi **samo aktivne** šablone i filtrira po tipu poruke, ali `render` učitava šablon samo po
  `id`, bez `isActive` i bez provjere `kind`-a, a upis poruke (`createTicketMessage`) prima `responseTemplateId`
  i koristi ga isključivo za statistiku — ne provjerava poklapa li se tip šablona sa tipom poruke. Ni jedno
  mjesto ne provjerava da šablon nije deaktiviran.
- **Uticaj:** poziv na API sa `templateId` šablona tipa `INTERNAL` (napisanog kao interna uputa) može ga
  ubaciti u **javni odgovor** koji podnosilac vidi i dobija e-mailom; deaktiviran šablon ostaje upotrebljiv
  nakon što ga administrator isključi.
- **Fix:** u `render` i pri upisu poruke provjeriti `isActive: true` i poklapanje tipa
  (`REPLY`/`INTERNAL`/`ANY` prema `USER_REPLY`/`AGENT_REPLY`/`INTERNAL_NOTE`), uz grešku koja se mapira u UI.
- **Ozbiljnost:** SREDNJE.

### B2 — NISKO — Picker i lista playbooka čitaju fiksni broj redova bez redoslijeda → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/templates/response-templates.service.ts:111–139`,
  `backend/src/modules/templates/ticket-playbooks/attach-playbook-to-ticket.ts:18–36`
- **Opis:** `findMany` za picker nema `orderBy`, uzima `take: 500`, a filtriranje po opsegu, rangiranje i
  rezanje na `pickerLimit` (200) rade se **u memoriji**; isto tako lista kandidata playbooka uzima `take: 1000`
  bez redoslijeda.
- **Uticaj:** na instalaciji sa više od 500 aktivnih šablona (ili 1000 playbooka) relevantni šabloni mogu
  biti odsječeni, a izbor nije determinisan (isti upit može vratiti različit podskup). Agent tada ne vidi
  šablon koji mu pripada, a administrator ne može objasniti zašto.
- **Fix:** filtriranje opsega i redoslijed (rang, `usageCount`, naziv) prenijeti u upit ili uvesti paginaciju
  prije `take`.
- **Ozbiljnost:** NISKO.

### B3 — NISKO — Jedinstvenost naziva šablona nije zaštićena u bazi

- **Fajl:** `backend/prisma/schema/templates.prisma:4–26` (nema jedinstvenog indeksa),
  `backend/src/modules/templates/response-templates.service.ts:490–503` (`assertNameFree`)
- **Opis:** jedinstvenost naziva po vlasniku provjerava se čitanjem preko Prisma klijenta prije upisa, ali u
  bazi ne postoji odgovarajući jedinstveni indeks.
- **Uticaj:** dva istovremena zahtjeva (dvostruki klik, dva taba) mogu upisati dva šablona istog naziva;
  agent u pickeru vidi duplikate, a revizija pokazuje dva zapisa o istoj izmjeni.
- **Fix:** jedinstveni indeks (vlasnik + naziv, uz uslov da zapis nije obrisan) ili serijalizacija provjere u
  transakciji.
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Playbook se ne može uvesti na tikete koji su već u toku

- **Fajl:** `backend/src/modules/templates/ticket-playbooks/attach-playbook-to-ticket.ts:106–132`,
  `backend/src/modules/tickets/tickets.service.ts:154,159–178`
- **Opis:** automatsko vezivanje se poziva **samo** pri kreiranju tiketa. Tiket otvoren prije nego je playbook
  napravljen (ili dok je bio neaktivan, ili prekoračenjem `take` granice) ostaje bez checkliste i nema akcije
  „primijeni na otvorene tikete servisa“ — pojedinačno vezivanje postoji, ali ne u masi.
- **Uticaj:** propisani postupak se ne pojavljuje na tiketima koji su već u radu, pa se upravo najstariji i
  najvažniji tiketi rješavaju bez checkliste; guard u `block` režimu ih ne dira jer nemaju playbook.
- **Fix:** akcija u administraciji playbooka („primijeni na otvorene tikete ovog servisa“) ili backfill u
  workeru, uz zapis u change log i sistemski događaj po tiketu.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Statistika upotrebe raste i kada poruka nije upisana

- **Fajl:** `backend/src/modules/tickets/create-ticket-message.ts:63–67` (prije `:68–77`)
- **Opis:** `countTemplateUse` povećava `usageCount` i `lastUsedAt` **prije** nego što se poruka upiše; ako
  upis ne uspije (npr. `DATABASE_BUSY`, prekid veze), statistika ostaje uvećana iako poruka nikad nije poslana.
- **Uticaj:** „najčešće korišteni“ rang u pickeru vremenom odstupa od stvarnosti, pa se na vrh guraju šabloni
  koji su u praksi samo pokušani; nema načina da se brojač ispravi.
- **Fix:** povećanje prebaciti u istu transakciju sa upisom poruke ili izvršiti poslije uspješnog upisa.
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/sabloni-i-playbooks.md`** po obaveznoj strukturi: čemu modul služi
  (gotovi odgovori i checkliste), kome je namijenjen (agent koristi, administrator uređuje), kako se dolazi
  (composer → **Šabloni**; meni **Administracija** → **Šabloni i playbooks**), korak po korak (ubaci šablon i
  doradi ga, sačuvaj svoj šablon iz poruke, veži playbook na tiket, štikliraj korake, nadogradi checklistu,
  rješavanje sa obaveznim koracima, uređivanje šablona i playbooka uz razlog), tabele (polja šablona i
  playbooka, dozvoljene varijable, opsezi i rangiranje, režimi `off`/`warn`/`block`, poruke grešaka),
  česta pitanja („zašto ne vidim šablon“, „zašto ne mogu sačuvati zajednički šablon“, „zašto me sistem
  zaustavlja pri rješavanju“, „gdje je moj šablon nakon izmjene playbooka“), poznata ograničenja (**B1–B5**) i
  povezani moduli (Tiketi, Baza znanja, Postavke, Verzije konfiguracije).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T81–T87** — (T81) model šablona i opsezi; (T82) varijable i popunjavanje;
  (T83) prava: lični, zajednički i opseg po servisima; (T84) playbook: snimka, verzija i nadogradnja;
  (T85) obavezni koraci pri rješavanju (`off`/`warn`/`block`); (T86) administracija, revizija i verzije
  konfiguracije; (T87) statistika upotrebe i pretraga šablona.
- **`REVIEW_ANALIZA.md`:** §M13 (ovaj tekst) i **red tabele iteracija 3** → „M11 ✅ · M12 ✅ · M13 ✅ ·
  M14 u toku“.
- **`DOCS_CHANGELOG.md`:** sekcija M13 sa izvorima i B1–B5.

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Sve što RAW traži postoji: šabloni po servisu, playbook kao checklista, upotreba u rješavanju, administracija sa revizijom i uključivanje postavkom; dodatno su riješeni jezik, opsezi, rangiranje, snimka i nadogradnja checkliste i tri režima obaveznih koraka. Minus za B1 (deaktiviran/interni šablon se ipak može poslati), B4 (nema uvođenja na tikete u toku) i za to što `registryJson` iz RAW-a nije zamijenjen ničim što bi omogućilo uvoz/izvoz šablona izvan baze. |
| **Kvalitet koda** | **7/10** | Model i prava su čisti i dobro razdvojeni (`template-scope`, `template-placeholders`, `normalize-*`, `ticket-playbook-snapshot`), transakcije sa zaključavanjem su na pravim mjestima, a greške imaju kodove; ocjenu snižavaju **testovi** (jedan spec za 23 fajla, servisi bez testova), B2 (upiti sa fiksnim `take` bez redoslijeda) i B5 (statistika prije upisa). |
| **Sigurnost** | **7/10** | Prava su provjerena na serveru, OU scope se poštuje kroz `loadAccessibleTicket`, lični šabloni su vidljivi samo vlasniku, checklista je staff-only, a opseg zajedničkih šablona je ograničen za administratore vezane na servis; minus za B1, gdje jedina zaštita tipa i aktivnosti šablona živi u interfejsu, i za B3 (nedostatak baze kao garanta jedinstvenosti). |

# M14 — Baza znanja (članci, portal, ocjene i review cycle)

## 1. Planirano u RAW projektnom zadatku

- **Self-service baza znanja je dio opisa proizvoda**: „Centralizovan, skalabilan i 'inteligentan' HelpDesk
  sistem … sa SSO preko Microsoft Entra ID, OU-hijerarhijom, automatskim routingom tiketa, **self-service
  knowledge base**, real-time komunikacijom i naprednom analitikom“ (`RAW_PROJECT.md:8`).
- **Presretanje pri kreiranju tiketa**: „Knowledge Base intercept prije kreiranja: predloži članke;
  **'pomoglo' ⇒ ne kreira se tiket**“ (`RAW_PROJECT.md:71`).
- **Povratna sprega ocjena**: „'pomoglo / nije pomoglo' se bilježi **per user i per članak**“ i „feedback
  **utiče na rangiranje** sličnih KB rezultata u intercept-u“ (`RAW_PROJECT.md:130–132`).
- **Vlasništvo i ciklus pregleda**: „svaki KB članak ima **owner-a (user ili grupa)** i **'review due date'**“,
  „sistem **podsjeti owner-a** kad članak treba review; nakon isteka članci mogu biti označeni kao **'stale'**
  (UX oznaka)“ (`RAW_PROJECT.md:133–135`).
- **Postavke** (`RAW_PROJECT.md:632–634`): `private.knowledgeBase.reviewCycle.enabled` (default true),
  `…defaultReviewDays` (180), `…staleAfterDays` (365); (`RAW_PROJECT.md:683–685`):
  `private.knowledgeBase.feedback.enabled`, `…oneVotePerUserPerArticle`, `…ranking.useFeedbackWeight`
  (sve default true).
- **Moduli u katalogu kapaciteta** (`RAW_PROJECT.md:780–781`, `:824`): `knowledge-base-intercept`,
  `knowledge-base-feedback-ranking`, `knowledge-base-ownership-review-cycle`.
- **Van RAW-a (uvedeno odlukom, nije nalaz):** kategorije neovisne o usluzi, stranica „Najčešća pitanja“,
  ocjena 1–5, broj pregleda i lista „Uvidi“, te „pretvori odgovor u članak“ — sve to dolazi iz paketa 2.9
  (K1, `docs/plans/modules/2.9-dodatne-nadogradnje.md` §2), koji je korisnik odobrio 2026-09-29.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

- **Vidljivost je jedno mjesto, ne pet filtera.** Ko smije vidjeti članak zavisi od klasifikacije, OU-a i
  usluge; ta odluka mora biti u jednoj funkciji koju zovu lista, pretraga, presretanje, brojanje pregleda i
  izvještaji — inače negdje ostane rupa.
- **Presretanje je stvarna kapija, ne savjet.** Ako je svrha da korisnik ne otvori tiket koji mu ne treba,
  krajnji ishod mora biti mjerljiv: korisnik potvrdi da je članak riješio problem i tiket se **zaista** ne
  kreira; ako ipak otvori tiket, u statistici se to vidi kao „nije pomoglo“.
- **Ocjene i pregledi su agregati, ne redovi po kliku.** Brojanje ide u dnevne agregate (ili keš), a ocjena je
  jedan glas po korisniku po članku koji se može promijeniti; ocjena utiče na rangiranje kroz izglađen
  prosjek, ne kroz sirov zbir.
- **Ciklus pregleda ima vlasnika i rok.** Objava postavlja `reviewDueAt`, podsjetnik ide vlasniku (korisniku
  ili svim članovima grupe) prije roka i ne ponavlja se za isti rok, pregled pomjera rok, a „zastario“ je
  izvedena oznaka koju vidi i urednik i korisnik.
- **Sve što nastane iz tiketa prvo se očisti.** Članak iz javnog odgovora nosi tuđe lične podatke; tekst
  mora proći kroz zamjenu **na serveru, pri upisu**, jer klijentski pregled je udobnost, a ne garancija.
- **Lični podaci i statistika ne idu zajedno.** Komentar „šta nedostaje“ je lični podatak: vidi ga vlasnik i
  recenzent, ne drugi korisnici, i ne pojavljuje se u izvozima.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Ponoviti zamjenu ličnih podataka na serveru** u `POST /knowledge-base/portal/from-reply`: proći kroz
   isti `scrubReplyPersonalData` (i vratiti brojače u odgovoru), da zaštita ne zavisi od klijenta.
2. **Vezati presretanje za članak koji je stvarno pomogao.** Umjesto `suggestions[0]`, poslati brojač i id
   članka na koji je korisnik kliknuo; na neuspjeh prikazati grešku, a ne „zabilježeno“.
3. **Presresti ponovno kreiranje uz odgovor.** Kad korisnik izabere „Članak je riješio moj problem“, ostaviti
   svjesnu opciju „ipak otvori tiket“ i u tom slučaju zabilježiti ishod „nije pomoglo“ — da statistika
   odražava odluku, ne tok ekrana.
4. **Uvesti rok za pregled u izvještaj i podsjetnik.** Izvoz „Znanje“ proširiti pregledima po članku
   (najgledanije, najlošije ocijenjene, bez pregleda 90 dana) i (ako ostaje) stopom odbijanja tiketa po
   članku iz `KnowledgeInterceptResolution` — sada se te rezolucije vide samo kao jedan broj na
   nadzornoj ploči.
5. **Ukloniti ili napuniti kolonu `isStale`.** Ili je postaviti pri review-cycle poslu, ili je izbaciti iz
   odgovora i osloniti se isključivo na izračunatu svježinu.
6. **Ograničiti liste na serveru.** U listi članaka i u presretanju uvesti `take`/stranicu i filtriranje
   vidljivosti u upitu (npr. po OU i klasifikaciji), da broj upita ne raste s brojem članaka.
7. **Dodati e2e za portal** (kategorije → FAQ → ocjena → uvidi → članak iz odgovora), kako plan 2.9 §10 i
   predviđa; danas postoje samo jedinični testovi i a11y prolaz.

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Model, statusi i postavke

- `KnowledgeArticle` ima `slug`, naslov, tijelo, `status` (**DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED**),
  `classification` (`INTERNAL` / `CONFIDENTIAL` / `RESTRICTED`, zadano `INTERNAL`), `isStale`, `reviewDueAt`,
  `publishedAt`, `lastReviewedAt`, vlasnika (korisnik **ili** grupa), recenzenta, obaveznu uslugu i OU,
  `searchVector` (tsvector + GIN), te K1 polja: `categoryId`, `isFaq`, `faqOrder`, `ratingCount`, `ratingSum`,
  `viewCount`, `lastViewedAt`, `sourceTicketId`, `sourceMessageId`
  (`backend/prisma/schema/knowledge.prisma:1–58`).
- Dozvoljeni prelasci statusa su tabela `DRAFT→IN_REVIEW`, `IN_REVIEW→{DRAFT,PUBLISHED}`,
  `PUBLISHED→{IN_REVIEW,DRAFT,ARCHIVED}`, `ARCHIVED→∅` (`knowledge-base.constants.ts:7–21`).
- Zadane vrijednosti: presretanje uključeno, review cycle uključen, `defaultReviewDays` 180,
  `staleAfterDays` 365, **`remindDaysBefore` 14** (dodatak koji RAW ne traži), feedback uključen, jedan glas
  po korisniku, težina feedbacka uključena (`knowledge-base.constants.ts:23–32`); granice su naslov 200,
  tijelo 20 000, slug 80, upit 500, presretanje 8 (`:34–40`).
- Postavke se čitaju u osam ključeva (`parse-knowledge-base-configuration.ts:51–60`) i prevode u
  konfiguraciju sa sigurnim zadanim vrijednostima (`:16–48`); uz njih postoji i
  `private.knowledgeBase.portal.faqMaxItems` (zadano 8, dozvoljeno 1–20,
  `knowledge-portal.service.ts:624–627`, `settings/definitions/knowledge-base-settings.ts:65–68`).

### 4.2 Ko smije vidjeti članak

- **Jedna funkcija odlučuje** (`can-read-knowledge-article.ts:27–56`): SUPER_ADMIN vidi sve; vlasnik i
  imenovani recenzent vide svoj članak u svim statusima; neobjavljen članak vide samo nosioci prava
  pisanja/pregleda/objave u opsegu; **`INTERNAL` objavljen članak vidi svaki prijavljeni korisnik**;
  `CONFIDENTIAL` traži ulogu i OU+uslugu; `RESTRICTED` traži **ADMIN** ulogu u OU+usluzi (`:43–56`).
- Opseg se puni OU putem i provjerom da usluga postoji (`load-knowledge-article-scope.ts:10–47`), a
  vidljivost se koristi u listi, presretanju, presretanju-rezoluciji, ocjenama i pregledima
  (`list-knowledge-articles.ts:18–27`, `intercept-knowledge-articles.ts:41–51`,
  `knowledge-portal.service.ts:336–355`).

### 4.3 Presretanje pri kreiranju tiketa

- `POST /knowledge-base/intercept` traži uslugu; ako je presretanje isključeno postavkom, vraća prazno
  (`intercept-knowledge-articles.ts:30–36`). Čita **objavljene** članke te usluge, označi svježinu, zadrži
  samo vidljive, pa rangira (`:38–69`) i vraća **do 8** prijedloga sa kratkim uvodom u tijelo, oznakom
  „zastario“ i prethodnim glasom korisnika (`:70–80`).
- Rangiranje je tekst × 100 (naslov 2, tijelo 1 po pojmu) uz `+10 × (pomoglo − nije pomoglo)` i Bayesov
  bonus ocjene (prior 3,5 uz težinu 5 glasova, skala 8) kad je uključena težina feedbacka; neriješeno se lomi
  po datumu objave pa po `id` (`rank-knowledge-articles.ts:15–27,38–61,70–103`).
- **Ocjenjene glasove** (1–5) presretanje ne broji dvaput: oni ulaze kroz Bayesov bonus, a stari „pomoglo“
  glasovi kroz `+10` po glasu (`intercept-knowledge-articles.ts:92–105`).
- Rezolucija se bilježi na `POST /knowledge-base/intercept/resolve` sa uslugom, OU-om i opcionalnim
  člankom, i to je broj „koliko je tiketa izbjegnuto“ (`resolve-knowledge-intercept.ts:19–49`), koji
  nadzorna ploča koristi kao `kbHelpedCount` (`reports/dashboard/build-reports-dashboard.ts:64–67,137–151`).
- **Ekran:** korak 2 wizarda za novi tiket prikazuje prijedloge; kartica „Članak je riješio moj problem“ šalje
  rezoluciju i poručuje „Tiket se neće kreirati“, a drugi izbor vodi na slanje tiketa
  (`knowledge-intercept-panel.tsx:156–191`, `create-ticket-form.tsx:166–173`,
  i18n `tickets.helpedResolvedHint`, `tickets.helpedSkip`).

### 4.4 Ocjene, komentari i pregledi

- Ocjena je 1–5; **komentar („Šta nedostaje?“) samo uz ocjenu ≤ 2** i najviše 500 znakova; `isHelpful` se
  izvodi kao `rating >= 4` (`submit-knowledge-feedback.ts:89–111`). Bez ocjene (samo palac gore/dolje)
  glas ne pregazi postojeću ocjenu ni komentar (`:55–71`).
- Jedan glas po korisniku po članku je zadan i čuva se u bazi jedinstvenim parom
  (`knowledge.prisma:76`), a ukupan zbir članka se ponovno izračuna poslije glasa
  (`submit-knowledge-feedback.ts:113–127`).
- **Pregledi se ne pišu po otvaranju.** U Redis se po danu vodi HyperLogLog jedinstvenih pregledača i brojač,
  a jednom dnevno (kroz posao podsjetnika, svakih 15 minuta) gotovi dani se upisuju u
  `KnowledgeArticleView` i `viewCount` u istoj transakciji; bez Redisa pregled ide direktno u bazu
  (`portal/knowledge-article-views.ts:5–31,33–62,64–97,99–122`).
- **Klijent šalje pregled odmah po otvaranju objavljenog članka** (`knowledge-article-detail-page.tsx:30–37`),
  pa pravilo iz plana 2.9 §2.3 („broji se tek kad je članak otvoren duže od 5 s ili je skrolan“) nije
  primijenjeno; server uz to ne provjerava da je prošlo 5 sekundi (`knowledge-portal.service.ts:336–355`).

### 4.5 Vlasništvo i ciklus pregleda

- Vlasnik može biti korisnik **ili** grupa; ako je grupa, podsjetnik ide **svim članovima**
  (`knowledge-base-review-reminder.service.ts:77–92`).
- Posao `knowledge-base-review-reminder-scan` ide po cronu `0 10,25,40,55 * * * *`, sa 2 pokušaja, backoffom
  30 s i `lockDuration` 120 s u workeru (`knowledge-base-review-reminder.job.constants.ts:19–31`,
  `…processor.ts:18–23`); unutar istog posla se flush-uju i pregledi (`…processor.ts:40–49`).
- Posao traži objavljene članke sa rokom u narednih `remindDaysBefore` dana i šalje **in-app** obavještenje
  vlasniku; ključ za deduplikaciju sadrži i `reviewDueAt`, pa se isti rok ne ponavlja
  (`knowledge-base-review-reminder.service.ts:23–74`).
- **Zastario** je izvedena oznaka: članak je zastario ako je review cycle uključen, status je `PUBLISHED` i
  prošao je `reviewDueAt` **ili** `staleAfterDays` od posljednjeg pregleda/objave
  (`evaluate-knowledge-article-freshness.ts:6–23`). Objava zahtijeva prethodni pregled
  (`lastReviewedAt !== null`, inače `PUBLISH_REVIEW_REQUIRED`) i ne prepisuje postojeći rok
  (`publish-knowledge-article.ts:30–39`); odobrenje pregleda postavlja `lastReviewedAt = sada`,
  novi `reviewDueAt` i `isStale = false` (`review-knowledge-article.ts:34–38`).

### 4.6 Portal znanja (K1): kategorije, FAQ, uvidi i „članak iz odgovora“

- **Rute:** `GET /knowledge-base/portal` (početna), `…/categories`, `…/categories/:id/articles`,
  `POST/PATCH` kategorija, `…/categories/:id/archive|restore`, `PATCH …/articles/:id/placement`,
  `POST …/articles/:id/view`, `GET …/insights`, `POST …/feedback/:id/resolve`,
  `POST …/from-reply/preview` i `POST …/from-reply` (`portal/knowledge-portal.controller.ts:38–116`).
  Kontroler drži samo provjeru prijave, a svaka radnja provjerava pravo u servisu (`:27–34`, `:617–622`);
  čitanje početne, kategorija i liste unutar kategorije **nema** dodatnog prava (svaki prijavljeni korisnik).
- **Početna** vraća kategorije sa brojem vidljivih objavljenih članaka (korijenska kategorija sabira i
  potkategorije), broj nekategorizovanih i FAQ listu (najviše `faqMaxItems`) sa punim tekstom
  (`knowledge-portal.service.ts:150–192`). FAQ se prikazuje kao `<details>/<summary>` harmonika bez JS-a
  (`knowledge-portal-home.tsx:134–156`).
- **Kategorije:** najviše **dva nivoa** — roditelj mora biti korijen i aktivan, a kategorija sa djecom ne
  može promijeniti roditelja niti biti arhivirana dok ima aktivne potomke
  (`portal/knowledge-categories.ts:181–207,117–145`); arhiviranje je pravilo umjesto brisanja.
- **Smještaj članka** (kategorija, FAQ, redoslijed) traži razlog i dozvoljen je vlasniku ili
  recenzentu/izdavaocu u opsegu (`knowledge-portal.service.ts:290–333`).
- **Uvidi (samo urednici):** najgledaniji u 30 dana, najlošije ocijenjeni (najmanje 5 glasova), bez pregleda
  90 dana i otvoreni komentari uz ocjenu ≤ 2; pragovi su fiksni (`minRatings 5`, `notViewedDays 90`,
  `listSize 10`) i vraćaju se u odgovoru (`knowledge-portal.service.ts:94–106,128–129,359–439`). Komentar
  može označiti riješenim samo neko ko smije pisati u taj članak (`:441–461`).
- **„Pretvori odgovor u članak“:** meni je na javnom odgovoru agenta, traži pravo pisanja i **nije dostupan
  na povjerljivom tiketu** (`ticket-detail-conversation.tsx:40–47`). Prikaz (`preview`) vraća naslov i tijelo
  sa zamijenjenim ličnim podacima (e-mail, ime i login učesnika, IPv4, telefon) i brojače po vrsti
  (`knowledge-portal.service.ts:465–487`, `portal/scrub-reply-personal-data.ts:29–71`). Izvor mora biti
  **javni odgovor agenta** (`AGENT_REPLY`) na tiketu koji nije povjerljiv (`:522–585`), a upis kreira
  `DRAFT` sa klasifikacijom `INTERNAL` (ako nije zadana druga), vezom na tiket i poruku i **internim**
  sistemskim događajem na tiketu (`:489–518`, `create-knowledge-article.ts:79–107`).

### 4.7 Autorizacija, ekrani i prijevodi

- **Prava:** `knowledge.article.write`, `knowledge.article.review`, `knowledge.article.publish`,
  `knowledge.category.manage` (`authorization.constants.ts:61–65`); **agent** dobija pravo pisanja
  (`authorization.constants.ts:112–136`, unos na `:121`), a **administrator** dodaje pregled, objavu i
  upravljanje kategorijama (`:160–161,187–189`).
- **Ekrani:** ruta `/knowledge-base` (početna i detalj članka) je u navigaciji svim prijavljenim korisnicima
  (`lib/navigation.ts:89–94`, `app/router.tsx:159–162`); stranica ima tri taba — **Portal** (zadano),
  **Svi članci** i **Uvidi** (vidljiv samo ako korisnik ima pravo pisanja ili pregleda/objave,
  `knowledge-base-page.tsx:37–49,171–182`).
- **Prijevodi:** grana `knowledgeBase` ima 152 ključa na bosanskom i 147 na engleskom; razlika su samo
  oblici množine (`_few`) koji engleski ne koristi — paritet je potpun.

### 4.8 Testovi

- **Backend: 11 spec fajlova / 1 166 linija** u modulu — `knowledge-base.authorization.spec.ts` (136),
  `knowledge-base.lifecycle.spec.ts` (131), `knowledge-base.feedback.spec.ts`,
  `knowledge-base.intercept.spec.ts` (121), `knowledge-base.list-filters.spec.ts`,
  `rank-knowledge-articles.spec.ts`, `evaluate-knowledge-article-freshness.spec.ts`,
  `knowledge-base-review-reminder.dedupe.spec.ts` (168, sa in-memory Prisma zamjenama),
  `portal/knowledge-portal.service.spec.ts` (267), `portal/knowledge-portal.from-reply.spec.ts` (108) i
  `portal/scrub-reply-personal-data.spec.ts` (33).
- **Frontend:** 7 spec fajlova uz `lib/knowledge-base/*` (`filter-knowledge-articles`, `knowledge-portal`,
  `knowledge-lifecycle-actions`, `map-knowledge-article-error`) i `can-continue-after-intercept.spec.ts`.
- **e2e:** nema posebnog scenarija za portal; presretanje je pokriveno samo prolazom kroz kreiranje tiketa
  (`tests/01-ticket-create.spec.ts:23–28`), a portal samo kroz a11y skeniranje kao korisnik
  (`tests/22-accessibility.spec.ts:69`) i navigaciju (`:115–116`). Plan 2.9 §10 predviđao je
  `23-knowledge-portal`.

## 5. Gap analiza

| Zadatak (RAW / plan) | Idealno | Trenutno | Status |
|---|---|---|---|
| Self-service baza znanja (RAW `:8`) | Korisnik sam traži i čita | Portal sa kategorijama, FAQ-om i pretragom; vidljiv svim prijavljenim | ✅ |
| Presretanje pri kreiranju (RAW `:71`) | „pomoglo“ ⇒ tiket se ne kreira | Prijedlozi + rezolucija; tiket se ne kreira **samo ako korisnik ne klikne dalje** | ⚠️ B3 |
| Glas per user i per članak (RAW `:131`) | Jedan tekući glas po korisniku | Upsert po `(articleId,userId)`, može se mijenjati | ✅ |
| Feedback utiče na rangiranje (RAW `:132`) | Ocjene mijenjaju redoslijed | `+10` po glasu i Bayesov bonus ocjene (prior 3,5 / 5 glasova) | ✅ |
| Vlasnik članka: korisnik ili grupa (RAW `:134`) | Oba oblika | `ownerUserId` ili `ownerGroupId` (+ provjera da je tačno jedan) | ✅ |
| Review due date (RAW `:134`) | Rok i njegovo pomjeranje | `reviewDueAt` uz objavu i odobrenje pregleda | ✅ |
| Podsjetnik vlasniku (RAW `:135`) | Prije roka, jednom po roku | In-app podsjetnik sa dedupom po `reviewDueAt`; grupa → svi članovi | ✅ |
| „Stale“ UX oznaka (RAW `:135`) | Vidljiva u listi i na članku | Izračunata svježina u listi, detalju i presretanju | ✅ |
| Postavke review cycle (RAW `:632–634`) | Tri ključa sa tim defaultima | Postoje svi + `remindDaysBefore` (14) kao dodatak | ✅ |
| Postavke feedbacka (RAW `:683–685`) | Tri ključa sa tim defaultima | Postoje svi | ✅ |
| Kategorije neovisne o usluzi (plan §2.1) | Najviše dva nivoa, arhiviranje | Dva nivoa, arhiviranje, key + bs/en naziv + ikona | ✅ |
| Arhiviranje kategorije sa člancima (plan §2.1 / uputa u UI) | Jasno pravilo | Server dozvoljava arhiviranje s člancima; uputa tvrdi suprotno | ⚠️ B7 |
| FAQ na portalu (plan §2.2) | Harmonika, max 8 | `<details>` sekcija, `faqMaxItems` 1–20 (zadano 8) | ✅ |
| Ocjene 1–5 + komentar ≤ 2 (plan §2.3) | Jedan glas, komentar samo uz nisku ocjenu | Ocjena, izvedeni `isHelpful`, komentar ≤ 2 / 500 znakova | ✅ |
| Pregledi bez reda po pregledu (plan §2.3) | Redis HLL + noćni flush | HLL + brojač, flush u dnevnom poslu, pad na bazu bez Redisa | ✅ |
| Pregled se broji poslije 5 s ili skrola (plan §2.3) | Bez prefetch/botova | Broji se odmah pri otvaranju | ⚠️ B4 |
| Rang bonus za ocjenu (plan §2.3) | Bez divljanja jednog glasa | Bayesov bonus, ocjene isključene iz `±10` zbira | ✅ |
| Izvještaj „Znanje“ po članku (plan §2.3) | Najgledanije, najlošije, bez pregleda, stopa odbijanja | Uvidi postoje u portalu; izvoz ima ocjene i preglede, **ali ne** stopu odbijanja po članku | ⚠️ B5 |
| „Pretvori odgovor u članak“ (plan §2.4) | Samo javni odgovor agenta, bez povjerljivih, DRAFT | Sve to, uz interni sistemski događaj i vezu na izvor | ✅ |
| Zaštita ličnih podataka pri nastanku članka (plan §2.4) | Zamjena prije upisa | Zamjena **samo u pregledu**; upis prima tekst klijenta | ⚠️ B1 |
| Samo urednici vide uvide (plan §2.3) | Provjera prava | `canCurate` (pisanje/pregled/objava) — inače `FORBIDDEN` | ✅ |
| Kolona `isStale` | Odražava stvarno stanje | Nikad se ne postavlja na `true`; odgovori mutacija je vraćaju iz baze | ⚠️ B6 |
| e2e za portal (plan §10) | Scenarij portal → ocjena → članak | Samo a11y prolaz i presretanje u toku kreiranja | ⚠️ gap (NISKO) |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Vidljivost je riješena kako treba.** Jedna funkcija (`canReadKnowledgeArticle`) pokriva listu, detalj,
  presretanje, ocjene i preglede, a klasifikacije imaju smislenu ljestvicu (INTERNAL za sve prijavljene,
  CONFIDENTIAL za osoblje u opsegu, RESTRICTED za ADMIN-a). To je mjesto gdje ovakav modul najčešće procuri,
  pa je vrijedno što je centralizovano i pokriveno testom autorizacije.
- **Šteta je što presretanje nije tvrda kapija.** RAW kaže „'pomoglo' ⇒ ne kreira se tiket“, a ekran nudi
  nastavak; posljedica je da KPI izbjegnutih tiketa mjeri klik, ne ishod. Uz to, rezolucija se veže na prvi
  prijedlog (`suggestions[0]`), a greška poziva se guta (`.finally`), pa je statistika pomjerena i kad
  korisnik zaista odustane.
- **Ciklus pregleda je uredan**: podsjetnik ne ponavlja isti rok, grupa obavještava sve članove, odobrenje
  pregleda pomjera rok, a objava bez pregleda je nemoguća (`PUBLISH_REVIEW_REQUIRED`) — to su prave
  invarijante.
- **„Članak iz odgovora“ je najbolje zamišljen, a najslabije zaštićen dio.** Ideja (javni odgovor agenta,
  bez povjerljivih tiketa, DRAFT, interni trag) je tačna, ali se zaštita ličnih podataka izvodi **samo na
  putu pregleda**; sam upis prihvata naslov i tijelo iz zahtjeva. Pregled je udobnost, ne kontrola.
- **Ono što bih popravio prije svega:** (1) zamjena ličnih podataka i na serveru pri upisu (B1); (2) vezivanje
  rezolucije za stvarno odabrani članak i prijava greške (B3); (3) brojanje pregleda po pravilu iz plana
  (B4). Zatim sitnice: kolona `isStale` koja nikad nije `true` (B6), obavještenje o pregledu koje klijent ne
  prepoznaje (B2), i liste bez `take` koje po svakom članku rade dodatne upite.
- **Sitnica koja se vidi u interfejsu:** polje `ownerUserId`/`reviewerUserId` u bs prijevodu nosi naziv
  „Reviewer“ (`knowledgeBase.reviewerUserId`), pa je jedina engleska riječ na formi članka — vrijedi je
  prevesti pri sljedećoj izmjeni te grane prijevoda.
- **Higijena je iznad prosjeka:** komentari objašnjavaju „zašto“ (zašto HLL, zašto agregat po danu, zašto
  dedup ključ sadrži rok), a testovi pokrivaju pravila (autorizacija, lifecycle, presretanje, ocjene,
  dedupe, zamjena ličnih podataka).

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Zaštita ličnih podataka postoji samo u pregledu, ne i pri upisu članka → ✅ **popravljeno u valu 2 (2026-10-04)**

- **Fajl:** `backend/src/modules/knowledge-base/portal/knowledge-portal.service.ts:465–487` (pregled),
  `:489–518` (upis), `backend/src/modules/knowledge-base/portal/knowledge-portal.dto.ts:88–97` (DTO prima
  naslov i tijelo), `backend/src/modules/knowledge-base/create-knowledge-article.ts:64–65,80–97`
- **Opis:** `draftFromReply` zamjenjuje lične podatke i vraća brojače, ali `createFromReply` uzima
  `title`/`body` iz zahtjeva i **ne prolazi ih ponovo kroz `scrubReplyPersonalData`**; servis iz izvora čita
  samo broj tiketa i OU/uslugu. Klijent šalje ono što je korisnik vidio u pregledu (i što je mogao izmijeniti,
  `article-from-reply-sheet.tsx:94,105–106`), ali server to ne provjerava.
- **Uticaj:** zahtjev koji zaobiđe pregled (izmijenjen klijent, skripta, „vrati“ lični podatak u editor)
  upisuje tuđe ime, e-mail, telefon ili IP u članak koji je po zadatku `INTERNAL`, a takav objavljen članak
  vidi **svaki prijavljeni korisnik**. Plan 2.9 §2.4 tu zamjenu naziva obaveznom.
- **Fix:** u `createFromReply` (ili u `createKnowledgeArticle` kad je prisutan `sourceTicketId`) primijeniti
  `scrubReplyPersonalData` sa istim `people` skupom i vratiti brojače u odgovoru; editor neka prikaže
  razliku ako je bilo naknadnih izmjena.
- **Ozbiljnost:** SREDNJE.

### B2 — NISKO — Obavještenje o roku pregleda članka stiže bez naslova i bez odredišta

- **Fajl:** `backend/src/modules/knowledge-base/knowledge-base-review-reminder.service.ts:50–64`,
  `frontend/src/lib/notifications/notification-kind.ts:3–16,79–85,133–219`
- **Opis:** podsjetnik se upisuje sa tipom `knowledge.reviewDue` i `ticketId: null`, a u klijentu ne postoji
  grana za taj tip: `notificationTitleKey` vraća `notifications.items.unknown` („Obavještenje“), a
  `notificationTicketPath` nema odredište pa klik ne vodi nikuda. (Za sve ostale tipove iz
  `notifications.constants.ts` mapiranje postoji; provjereno uporednim spiskom od 42 tipa.)
- **Uticaj:** vlasnik članka dobija obavještenje bez naslova — iako prijevod
  `notifications.items.knowledgeReviewDue` („Pregled KB članka dospijeva“) postoji — i ne može iz njega
  otvoriti članak; mora ga tražiti ručno, pa se podsjetnik lako previdi.
- **Fix:** dodati granu za `knowledge.reviewDue` u `notificationTitleKey` i odredište prema članku
  (npr. `/knowledge-base/<articleId>`), uz `articleId` u `payload`.
- **Ozbiljnost:** NISKO.

### B3 — NISKO — „Pomoglo“ ne zaustavlja kreiranje tiketa i ne pamti koji je članak pomogao

- **Fajl:** `frontend/src/components/tickets/create-ticket-form.tsx:166–173`,
  `frontend/src/components/tickets/knowledge-intercept-panel.tsx:156–191`,
  `backend/src/modules/knowledge-base/resolve-knowledge-intercept.ts:19–49`
- **Opis:** kartica „Članak je riješio moj problem“ samo bilježi rezoluciju sa `suggestions[0]?.id` i postavlja
  `helped = true`; korisnik i dalje može kliknuti „Nastavi sa slanjem“ i tiket nastaje. Poziv je vezan preko
  `.finally(...)` **bez** `catch`, pa se i neuspjeh prikazuje kao uspjeh („Označili ste da je članak pomogao“).
  Na serveru se uz to ne provjerava ni pravo ni opseg pri upisu rezolucije (postojanje usluge/OU-a i članka se
  samo potvrđuje), pa je moguće upisati rezoluciju za tuđu organizacionu jedinicu i time pomjeriti KPI
  `kbHelpedCount` (`reports/dashboard/build-reports-dashboard.ts:137–151`).
- **Uticaj:** RAW-ov ishod („pomoglo ⇒ ne kreira se tiket“) ne važi automatski; statistika izbjegnutih tiketa
  mjeri prvi prijedlog, a ne članak koji je pomogao, i može se uvećati pozivima van stvarnog toka. Uz to,
  korisnik sa više prijedloga nikada ne može zabilježiti da je pomogao **drugi** članak.
- **Fix:** vezati rezoluciju za kliknuti članak i uhvatiti grešku; uvesti eksplicitnu radnju „ipak otvori
  tiket“ (i tada upisati ishod „nije pomoglo“); na serveru provjeriti da su usluga i OU u opsegu korisnika i
  da članak smije čitati.
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Pregledi se broje odmah pri otvaranju, bez pravila iz plana

- **Fajl:** `frontend/src/pages/knowledge-article-detail-page.tsx:30–37`,
  `backend/src/modules/knowledge-base/portal/knowledge-portal.service.ts:336–355`,
  `backend/src/modules/knowledge-base/portal/knowledge-article-views.ts:33–62`
- **Opis:** klijent šalje `POST …/view` čim se objavljeni članak otvori (bez čekanja od 5 sekundi i bez
  provjere skrolovanja), a server prihvata svaki poziv prijavljenog korisnika koji smije čitati članak.
  Plan 2.9 §2.3 izričito traži da se pregled broji **tek** nakon 5 s ili skrolovanja, da se botovi i
  pretpregledi ne broje.
- **Uticaj:** `viewCount` i izvještaj „Znanje“ (`reports/packs/build-kb-helpfulness-report.ts:64`) broje i
  otvaranja koja traju djelić sekunde i automatizovane posjete; uvidi „najgledanije“ i „bez pregleda 90 d“
  su zbog toga manje pouzdani.
- **Fix:** na klijentu poslati pregled nakon 5 s ili prvog skrola (i pri izlasku otkazati), a na serveru
  opcionalno zahtijevati minimalno vrijeme u zahtjevu; zadržati dnevni agregat kakav jeste.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Liste i presretanje ne ograničavaju upit, a vidljivost provjeravaju po članku → ✅ **popravljeno u valu 3 (2026-10-04)**

- **Fajl:** `backend/src/modules/knowledge-base/list-knowledge-articles.ts:18–27`,
  `backend/src/modules/knowledge-base/fetch-knowledge-articles-for-list.ts:30–33`,
  `backend/src/modules/knowledge-base/intercept-knowledge-articles.ts:38–51`
- **Opis:** `fetchKnowledgeArticlesForList` prvo čita **sve** članke koji odgovaraju filterima
  (`findMany` bez `take`, pa filtriranje po tekstu u memoriji kad nema punog teksta), a zatim se za svaki
  članak pojedinačno računa vidljivost — što znači dodatne upite za OU put, uslugu i članove grupe vlasnika
  (`load-knowledge-article-scope.ts:10–47`). Isto radi i presretanje nad svim objavljenim člancima usluge.
- **Uticaj:** vrijeme odgovora liste i presretanja raste linearno s brojem članaka i brojem upita; na većem
  fondu (hiljade članaka) pretraga bez pojma i presretanje postaju najsporije rute modula, a stranica „Svi
  članci“ nema paginaciju.
- **Fix:** uvesti `take`/stranicu i redoslijed u upit, filtriranje vidljivosti prenijeti u `where`
  (klasifikacija + OU + usluga + vlasnik), a pojedinačnu provjeru zadržati samo kao posljednju bravu.
- **Ozbiljnost:** NISKO.

### B6 — NISKO — Kolona `isStale` se nikad ne postavlja na `true`, a vraća se u odgovorima mutacija

- **Fajl:** `backend/prisma/schema/knowledge.prisma:9`, `backend/src/modules/knowledge-base/to-knowledge-article-response.ts:14,51`,
  `backend/src/modules/knowledge-base/publish-knowledge-article.ts:35–39`, `review-knowledge-article.ts:34–38`,
  `backend/src/modules/knowledge-base/knowledge-base.service.ts:147–163`
- **Opis:** u kodu postoji samo `isStale: false` (objava i odobrenje pregleda); nijedan posao je ne postavlja
  na `true`. Stvarna svježina se računa u memoriji (`evaluate-knowledge-article-freshness.ts:6–23`) i
  primjenjuje u listi, detalju, portalu i presretanju, ali **odgovori mutacija** (izmjena članka, promjena
  statusa) vraćaju vrijednost iz baze, pa je uvijek `false`.
- **Uticaj:** poslije izmjene ili objave klijent nakratko prikaže članak kao „svjež“ i kad je stvarno
  zastario (do sljedećeg čitanja); svaki vanjski upit ili izvještaj koji se osloni na kolonu dobija pogrešan
  odgovor.
- **Fix:** u odgovorima mutacija primijeniti `withKnowledgeArticleFreshness` (kao što rade lista i detalj) ili
  kolonu ukloniti iz sheme i svuda koristiti izračunatu vrijednost.
- **Ozbiljnost:** NISKO.

### B7 — NISKO — Uputa tvrdi da se kategorija s člancima ne može arhivirati, a server to dozvoljava

- **Fajl:** `backend/src/modules/knowledge-base/portal/knowledge-categories.ts:118–142`,
  `frontend/src/i18n/locales/bs/common.json` (`knowledgeBase.portal.categories.hint`),
  `backend/src/modules/knowledge-base/portal/knowledge-portal.service.ts:162–167,204–205`
- **Opis:** arhiviranje se odbija **samo** ako kategorija ima aktivnih podkategorija (`:124–130`), dok uputa u
  panelu kaže: „Najviše dva nivoa. Kategorija s člancima ili podkategorijama ne može se arhivirati.“ Članci
  zadržavaju `categoryId` arhivirane kategorije, pa ih portal poslije arhiviranja broji i prikazuje kao
  **„Bez kategorije“** (`home()` ih svrstava u `uncategorizedCount`, a `categoryArticles('uncategorized')` ih
  uključuje).
- **Uticaj:** administrator vjeruje da je zaštita jača nego što jeste; članci tiho „isplivaju“ iz kategorije u
  zajedničku gomilu, pa navigacija portalom gubi smisao dok se sadržaj ručno ne premjesti.
- **Fix:** ili odbiti arhiviranje i kad kategorija ima objavljenih članaka (i to reći u grešci), ili uskladiti
  uputu i pri arhiviranju premjestiti članke (uz razlog i zapis u istoriji članka).
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/baza-znanja.md`** po obaveznoj strukturi: čemu modul služi (self-service
  članci, presretanje pri kreiranju, ocjene i ciklus pregleda), kome je namijenjen (korisnik čita i ocjenjuje,
  agent piše i pravi članke iz odgovora, administrator uređuje kategorije i uvide), kako se dolazi (meni
  **Baza znanja**; korak 2 novog tiketa; meni „⋯“ na javnom odgovoru → **Napravi članak**), korak po korak
  (pretraga i čitanje, ocjena i komentar, presretanje pri kreiranju, pisanje članka, objava kroz pregled,
  kategorije i FAQ, uvidi, članak iz odgovora), tabele (polja i klasifikacije, statusi i prelazi, postavke sa
  zadanim vrijednostima, poruke grešaka), česta pitanja („zašto ne vidim članak“, „zašto ne mogu objaviti“,
  „šta znači zastario“, „gdje ide komentar ‘šta nedostaje’“), poznata ograničenja (**B1–B7**) i povezani
  moduli (Tiketi, Šabloni i playbooks, Verzije konfiguracije, Izvještaji, Privatnost).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T88–T94** — (T88) model članka, statusi i klasifikacije; (T89) vidljivost i
  opseg; (T90) presretanje pri kreiranju i rezolucija; (T91) ocjene, komentari i rangiranje; (T92) pregledi i
  dnevni agregat; (T93) vlasništvo i ciklus pregleda; (T94) portal (kategorije, FAQ, uvidi) i „članak iz
  odgovora“.
- **`REVIEW_ANALIZA.md`:** §M14 (ovaj tekst) i **red tabele iteracija 3** → „M11 ✅ · M12 ✅ · M13 ✅ ·
  M14 ✅ · M15 u toku“.
- **`DOCS_CHANGELOG.md`:** sekcija M14 sa izvorima, nalazima B1–B7 i napomenom da plan 2.9 nema odjeljak
  „Implementacija i odstupanja (K1)“ (postoje samo za K2 i K4) i da u njemu stoji `PUBLIC` klasifikacija koja
  u modelu ne postoji (klasifikacije su INTERNAL/CONFIDENTIAL/RESTRICTED).

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Sve RAW stavke postoje i rade: intercept, jedan glas po korisniku koji utiče na rangiranje, vlasnik (korisnik ili grupa), review due date, podsjetnik i „stale“ oznaka, plus sve postavke sa traženim zadanim vrijednostima; portal iz paketa 2.9 dodaje kategorije, FAQ, ocjene 1–5, preglede, uvide i „članak iz odgovora“. Minus za tri stvari: „pomoglo“ ne zaustavlja kreiranje tiketa (B3), pregledi se broje bez pravila od 5 s (B4) i uvidi ne ulaze u izvoz „Znanje“ kako plan traži (stopa odbijanja po članku se nigdje ne prikazuje). |
| **Kvalitet koda** | **7/10** | Struktura je čista (jedna funkcija vidljivosti, mali fajlovi sa jasnom odgovornošću, transakcije tamo gdje treba), a komentari objašnjavaju odluke (HLL umjesto redova, dedup po roku, zašto ocjena isključuje `±10`). Ocjenu snižavaju B5 (neograničeni upiti i provjera vidljivosti po članku), B6 (kolona koja nikad nije `true`) i B2 (tip obavještenja koji klijent ne prepoznaje — jedina od 42). |
| **Sigurnost** | **7/10** | Vidljivost je centralizovana i poštuje klasifikaciju, OU i uslugu; povjerljivi tiketi ne mogu biti izvor članka; uvidi traže pravo; komentari su vidljivi samo vlasniku i recenzentu; grupa vlasnika se pravilno razrješava. Minus za B1 (zamjena ličnih podataka samo na putu pregleda, pa upis može primiti sirov tekst koji završi u `INTERNAL` članku vidljivom svim korisnicima) i B3 (rezolucija presretanja bez provjere opsega). |

# M15 — Nadzorna ploča (dashboard, izvještaji i uska grla)

## 1. Planirano u RAW projektnom zadatku

- **Dashboard/KPI:** „tiketi po OU, **avg resolution**, **opterećenje admina**, **KB resolution rate**
  (target ≥ 30%)“ (`RAW_PROJECT.md:171`, ponovljeno u fazi 12 kao „osnovni KPI prikazi (tickets by OU,
  avg resolution, workload, KB resolution rate)“, `:1031`).
- **CSAT u nadzoru:** „CSAT ulazi u KPI/dashboard **po OU/servisu/grupi**“ (`RAW_PROJECT.md:360`), uz
  „CSAT: forma ocjene nakon resolve/close + prikaz u dashboardu“ (`:1047`).
- **Bottleneck dashboard (enterprise ops):** prikazuje gdje tiketi „stoje“ — `PENDING_APPROVAL`,
  `WAITING_FOR_USER`, `UNROUTED`, `OVERDUE` — „breakdown po **OU / service / priority**, **trend kroz
  vrijeme**“, sa svrhom identifikacije uskih grla (`RAW_PROJECT.md:280–283`), te „Admin UI: bottleneck
  dashboard …“ (`:1039`, kapacitet `dashboard-bottlenecks` na `:814`).
- **Predefinisani izvještaji i izvoz:** „predefinisani set izvještaja/exporta (CSV/JSON) sa OU scoping-om,
  npr. 'Monthly KPI', 'Overdue by service', 'Top close codes', 'KB helpfulness'“, „dostupno Admin/SuperAdmin
  uz permission `audit.export`/`reports.export`“ (`RAW_PROJECT.md:278–279`). Napomena: ta dva reda stoje
  **unutar** odjeljka „Config versioning + rollback“, iako opisuju izvještaje — formatiranje u RAW-u
  `[MIŠLJENJE]`.
- **Close codes u analitici:** „code se upisuje na resolve i ulazi u analytics“ (`RAW_PROJECT.md:1000`,
  kapacitet `ticket-close-codes-analytics` na `:805`).
- **Postavke:** `private.dashboard.bottlenecks.enabled` (boolean, default true) i
  `private.dashboard.bottlenecks.defaultWindowDays` (number, default 30) (`RAW_PROJECT.md:660–661`).
- **NFR koji dodiruje modul:** „response time < 300ms; ≥1000 simultanih korisnika“ (`RAW_PROJECT.md:172`).
- **Planovi (paketi) koji su ovo gradili:** `docs/plans/modules/1.6-izvjestaji-ui.md` (paketi izvještaja,
  pregled prije preuzimanja, audit izvoza, prag ping-ponga; §6 izričito ostavlja „zakazane izvještaje,
  grafikone trendova i PDF izvoz“ za paket 2.5) i `docs/plans/modules/2.5-izvjestavanje-i-analitika.md`
  (trendovi, zakazani izvještaji, PDF, sanacija dashboarda; §7.1 navodi četiri taba — **Pregled, Trendovi,
  Paketi izvještaja, Zakazani** — bez ekrana za uska grla). Nijedan plan ne predviđa **ekran** uskih
  grla; `GET /reports/bottlenecks` postoji kao zatečeni endpoint koji plan 2.5 samo sanira (§13.1), a
  njegov ekran traži RAW (`:280–284`, `:1039`). Prihvatanje iz plana 2.5 (§11.1, §11.5) je ispunjeno i
  dokumentovano mjerenjima (§13.3): trend 36 mjeseci < 1 s, dashboard ≤ 8 upita (6), parity s
  `monthly_kpi` paketom.

## 2. Stvarnost — kako bi ovo izgledalo u zrelom sistemu `[MIŠLJENJE]`

- **Brojači se računaju tamo gdje se podaci i filtriraju.** Svaki KPI dolazi iz agregata nad **istim**
  pravilom vidljivosti koje važi za liste tiketa; ako se brojač računa iz prve stranice, broj je pogrešan
  čim korisnik ima više tiketa od stranice.
- **Jedan broj, jedno mjesto.** „Koliko je tiketa izbjegnuto bazom znanja“ mora imati isto značenje u
  presretanju, na nadzornoj ploči i u izvještaju; ako se formula mijenja po ekranu, brojevi se razilaze.
- **Usko grlo je akciono.** Ako ekran pokaže gdje tiketi stoje, isti ekran mora ponuditi put do tih tiketa
  (filtar ili link) i razrez po jedinici, servisu i prioritetu prema kojem se odlučuje.
- **Izvoz je nadzor, ne prečica.** Svaki izvoz ostavlja trag (ko, šta, koji period, koliko redova, koji
  fajl), a prag i period su ograničeni postavkom; tabela prije preuzimanja pokazuje isto što i fajl.
- **Pouzdanost je dio dizajna.** Brojači smiju biti do minute stari, ali ne smiju biti odsječeni; keš je
  „best effort“ (pad keša = sporije, ne prazno), a skupi upiti se spajaju (single-flight), da prva stranica
  ne pokrene deset identičnih skenova.
- **Prazno stanje je dio funkcionalnosti.** Nova instalacija mora imati jasan put: „nema podataka → evo
  kako nastaje prvi tiket“, a ne prazne grafikone.

## 3. Preporučena implementacija `[MIŠLJENJE]`

1. **Uključiti razrez po OU u ekran.** RAW traži „tiketi po OU“; dodati seriju/kolonu po jedinici u
   pregled izvještaja (postoji na bottleneck endpointu i u trendovima po servisu, ali ne za OU).
2. **Iskoristiti `bottlenecksEnabled`.** Vezati ga na sve što prikazuje uska grla (i na grafikon u
   pregledu), ili ga ukloniti iz registra postavki — sada isključuje samo API bez ekrana.
3. **Otvoriti postojeći bottleneck API u UI.** `GET /reports/bottlenecks` već vraća tačno ono što RAW
   traži (brojači, razrez OU/servis/prioritet, trend po danu); nedostaje samo tab ili sekcija.
4. **Ponuditi prelaz iz broja u listu.** Na svaki brojač (kritični, prekoračeni, neusmjereni, čeka
   korisnika, čeka odobrenje) staviti link na odgovarajući pogled tiketa, da nadzorna ploča vodi u rad.
5. **Povezati CSAT sa dimenzijama.** Prikazati CSAT po servisu i grupi (danas postoji ukupan prosjek i
   vremenska serija), jer RAW traži razrez po OU/servisu/grupi.
6. **Ukloniti mrtve elemente.** Dugme **Izvještaji** na `/` je trajno onemogućeno uz poruku „biće
   dostupni kad se doda ruta“ iako ruta postoji; ili ga ukloniti, ili uključiti kao link.
7. **Rezervisati mjesto za opterećenje.** „Opterećenje admina“ danas postoji samo kao izvoz
   (`time_tracking`, sati po agentu i servisu); na nadzornoj ploči nema ni pločice ni ekrana, pa je
   jedina veza „Bez izvršioca“ i „Dodijeljeni meni“.

## 4. Presjek implementacije u kodu na dan audita 2026-10-03 `[ČINJENICA]`

> Ovo je početni presjek prije paketa 5.1. Naknadne izmjene i njihovi testovi navedeni su u odjeljcima `# Paket 5.1`.

### 4.1 Nadzorna ploča kao početna stranica

- Ruta `/` prikazuje `DashboardPage` (128 linija): zaglavlje sa podnaslovom „Operativni pregled tiketa
  kojima imate pristup.“ (`frontend/src/pages/dashboard-page.tsx:39–64`, i18n `dashboard.intro`), a tijelo
  čine četiri sekcije — brojači (`DashboardMetricGrid`, 192 linije), grafikoni (`DashboardCharts`),
  tri panela za osoblje (SLA nadzor, grupni inbox, aktivnost) i tabele „Tiketi koji zahtijevaju vašu
  pažnju“ i „Nedavni tiketi“ (`:80–124`).
- **Brojači dolaze sa servera:** `GET /reports/dashboard/summary?scope=all`
  (`frontend/src/lib/dashboard/use-dashboard-summary.ts:74–83`), a iz prve stranice tiketa
  (`GET /tickets?pageSize=50`) samo pogledi: 14-dnevni tok, osam nedavnih, SLA lista i lista pažnje
  (`frontend/src/lib/dashboard/compose-dashboard-summary.ts:14–46`).
- **Kada korisnik nema nijedan tiket**, prikazuje se prazno stanje sa dugmetom **Kreiraj tiket**
  (`dashboard-page.tsx:69–79`).

### 4.2 Brojači: jedna istina iz liste tiketa

- `ReportSummaryService` ne prepisuje pravila vidljivosti: opseg gradi `buildTicketListWhere` sa praznim
  upitom (isti RBAC i OU/SLA filtri kao `GET /tickets`, uz skrivanje arhiviranih)
  (`backend/src/modules/reports/report-summary.service.ts:24–34,155–181`).
- Keš je **60 sekundi** po korisniku i opsegu (ključ sadrži i vremensku zonu, jer brojač „danas“ zavisi od
  nje), uz `single-flight` da istovremeni zahtjevi jednog korisnika ne pokrenu više skenova
  (`report-summary.service.ts:36–47,62–81`, `summary/report-summary-cache.ts:25,40–75`). TTL je podesiv
  preko `REPORT_SUMMARY_CACHE_TTL_SECONDS`, a komentar u kodu bilježi da je plan dozvoljavao 15–30 s i da
  je prihvatanje bilo „brojači se osvježavaju u roku od 30 s“: na 15 s promašaj je ulazio u p95 (k6,
  100 000 tiketa, 2026-09-25), pa je **vlasnik odobrio 60 s** (`summary/report-summary-cache.ts:2–18`) —
  dakle prihvatanje je svjesno promijenjeno, što je i zapisano u kodu.
- **Zona izvještavanja** se čita iz postavke (`private.reports.timeZone`, zadano `Europe/Sarajevo`), a ne
  iz procesa (`report-summary.service.ts:145–153`, `settings/definitions/reports-settings.ts:60–66`).
- Brojači su: ukupno, otvoreno, kritično, prekoračeno, danas otvoreno, čeka korisnika, čeka odobrenje,
  riješeno, zatvoreno, neusmjereno, bez izvršioca, dodijeljeno meni, moji zahtjevi, te raspodjela po
  statusu i prioritetu (`summary/report-summary.types.ts:24–55`).
- **Opseg (`scope`)** može biti `all`, `assignedToMe`, `requestedByMe` ili `unassigned`
  (`summary/report-summary.types.ts:11–22`), ali ekran uvijek traži `all`; kolone „Dodijeljeni meni“ i
  „Moji zahtjevi“ dolaze iz istog odgovora (vidi i B4).

### 4.3 SLA nadzor

- Zaseban agregat `GET /reports/sla/summary` vraća ukupnu izloženost (otvoreno, u roku, na granici,
  prekoračeno) i razrez po SLA profilu i prioritetu (`backend/src/modules/reports/summary/report-summary.types.ts:57–80`),
  sa kešom po korisniku (`report-summary.service.ts:114–143`). Klijent ga koristi preko
  `frontend/src/lib/sla/sla-exposure-index.ts:16`.

### 4.4 Izvještaji (`/reports`) — pregled, trendovi, paketi, zakazani

- **Pristup:** ruta `/reports` traži pravo izvoza izvještaja ili audita
  (`frontend/src/lib/session/route-access.ts:63–70`), a kontroler i ulogu i prava:
  `admin`/`superAdmin` + `reports.export`/`audit.export`
  (`backend/src/modules/reports/reports.controller.ts:45–56`). Bez prava se prikazuje poruka
  „Izvještaji i izvoz dostupni su administratorima s reports.export ili audit.export.“
  (i18n `reports.forbiddenBody`).
- **Četiri taba:** `Pregled`, `Trendovi`, `Paketi izvještaja` i `Zakazani` (posljednji samo uz pravo
  zakazivanja; stanje taba je u URL-u `?tab=`; `frontend/src/pages/reports-page.tsx:52–64,252–257`).
- **Pregled** (`GET /reports/dashboard`) vraća KPI kartice i četiri prikaza: prosječno rješenje po grupi
  (sa oznakom „usko grlo: …“), obim po usluzi, tok i starenje backloga, te broj tiketa
  (`backend/src/modules/reports/dashboard/build-reports-dashboard.ts:31–40`). KPI su: kreirano (sa
  procentom promjene prema prethodnom periodu), prosječan prvi odgovor (uzorak), prosječno rješenje
  (uzorak), CSAT prosjek (uzorak, skala 5) i **KB resolution rate** uz broj izbjegnutih tiketa
  (`dashboard/aggregate-report-dashboard-kpis.ts:4–18,63–87`), pri čemu je formula
  `pomoglo / (pomoglo + kreirani)`, a cilj „≥ 30%“ stoji u opisu kartice (i18n `reports.hintKbResolution`).
- **Trendovi** (`GET /reports/trends`) vraćaju sve serije odjednom: dolazni, riješeni, neto, backlog,
  SLA odziv i rješavanje, medijana i p90 rješenja, medijana prvog odziva, CSAT prosjek i udio zadovoljnih
  (ocjena ≥ 4), najčešći servisi; granularnost je automatska (do 31 dan dnevno, do 183 dana sedmično,
  inače mjesečno) uz ručni izbor i predefinisane raspone 30 d / 90 d / 6 m / 12 m / 24 m / 36 m
  (`backend/src/modules/reports/trends/report-trends.constants.ts:3–43`, `report-trends.types.ts:72–103`).
  Ograničenja su postavke: `maxMonths` 36, `cacheSeconds` 600, `slaTargetPercent` 90,
  `csatMinSample` 5 (`reports.constants.ts`-par u `settings/definitions/reports-settings.ts:81–121`).
  Izvoz je CSV ili JSON (`GET /reports/trends/export`, audit `report.trends.exported`), a „štampa“ je PDF iz
  pregledača uz zapis `report.pdf.exported` (`reports.controller.ts:151–189`,
  `audit-log/audit-log.constants.ts:60–61`).
- **Paketi izvještaja:** zadano je uključeno šest paketa — `monthly_kpi`, `overdue_by_service`,
  `top_close_codes`, `kb_helpfulness`, `forward_ping_pong`, `time_tracking`
  (`settings/definitions/reports-settings.ts:10–17`), a uz CMDB/probleme/promjene uključuju se i njihovi
  paketi (`reports.constants.ts:3–63`). Svaki paket ima **pregled** (prvih N redova) i **preuzimanje** u
  CSV ili JSON (`reports.controller.ts:78–121`), period je ograničen po paketu
  (`reportPackLimits.maxWindowDays`), a svaki izvoz se bilježi u audit (akcija `reports.export`,
  `audit-log/audit-log.constants.ts:31`) sa formatom, brojem redova, jedinicom, periodom i imenom fajla
  (`record-report-export-audit.ts:9–41`). Paket „Korisnost baze znanja“
  nosi ocjene i preglede (`backend/src/modules/reports/packs/build-kb-helpfulness-report.ts:4–16,43–73`),
  a „Najčešći kodovi zatvaranja“ broji kodove iz riješenih/zatvorenih tiketa u periodu
  (`packs/build-top-close-codes-report.ts:4–25`).
- **Zakazani izvještaji:** lista, editor, „Pošalji test meni“, „Pošalji sada“, historija izvršenja (do 50
  zapisa, čuvanje 180 dana), sedmično ponedjeljkom ili mjesečno prvog dana, sekcije e-maila (KPI, trend
  12 perioda, najčešći servisi, prekoračenja), prilozi do 10 MB
  (`backend/src/modules/reports/schedules/report-schedule.constants.ts:1–35`); posao ide na svakih
  pet minuta (`*/5 * * * *`) i obrađuje do 20 rasporeda po prolazu. Razlozi preskakanja primaoca i
  izostavljanja priloga su evidentirani i prevedeni u UI (`report-schedule.constants.ts:37–65`, i18n
  `reports.schedules.skip/omit/runError`).
- **Bottleneck API** (`GET /reports/bottlenecks`, `reports.controller.ts:123–130`) vraća tačno ono što RAW
  traži: brojače `PENDING_APPROVAL`/`WAITING_FOR_USER`/`UNROUTED`/`OVERDUE`, razrez po organizacionoj
  jedinici, servisu i prioritetu, i dnevni trend (`bottleneck/aggregate-bottleneck-dashboard.ts:23–41,71–116`,
  SQL verzija `bottleneck/sql-bottleneck-dashboard-store.ts:30–40`). **Nema ga nijedna stranica**
  (provjereno pretragom frontenda) — vidi B2.

### 4.5 Postavke i veza s modulima

- Postavke modula: 16 ključeva `private.reports.*` (uključen, paketi, formati, zona, ping-pong prag,
  trendovi, zakazani) i dvije `private.dashboard.bottlenecks.*`
  (`backend/src/modules/settings/setting-keys.ts:439–453`, `definitions/reports-settings.ts:36–185`);
  zadani formati su `csv,json`, a prag ping-ponga 3.
- **`defaultWindowDays`** (zadano 30) koristi i bottleneck i **paketi izvještaja** kao podrazumijevani
  period (`reports.service.ts:130–136,164–170`), iako opis u registru kaže „Default rolling window in days
  for bottleneck trends“ — vidi B3.
- Izvoz i pregledi poštuju OU opseg preko `resolveReportOrganizationalUnitScope`
  (`reports.service.ts:138–141,171–174`).

### 4.6 Testovi

- **Backend: 85 `.ts` fajlova (24 spec, 2 810 linija)** — među njima `build-reports-dashboard.spec.ts`,
  `aggregate-bottleneck-dashboard.spec.ts`, `report-summary.service.spec.ts`, `report-summary-cache.spec.ts`,
  `load-dashboard-summary-counts.spec.ts`, `load-sla-summary-counts.spec.ts`, `report-trends.spec.ts`,
  po jedan spec za gotovo svaki paket (`packs/*.spec.ts`), `report-schedules.spec.ts`,
  `parse-reports-configuration.spec.ts` i `serialize-report-export.spec.ts`.
- **Frontend: 5 spec fajlova / 319 linija** u `lib/reports/*` (`report-window`, `report-trends-view`,
  `report-pack-table`, `report-schedule-form`, `report-format`) + dva u `lib/dashboard/*`
  (`compose-dashboard-summary` 164, `dashboard-ticket-sets` 121).
- **e2e: četiri scenarija** — `12-reports-packs` (paket → pregled → CSV → audit), `17-reports-trends`,
  `18-reports-schedules`, `19-reports-print`; nadzorna ploča nema vlastiti scenario, pokrivena je a11y
  skeniranjem kao korisnik i kao agent (`tests/22-accessibility.spec.ts:64,79`).

## 5. Gap analiza

| Zadatak (RAW / plan) | Idealno | Trenutno | Status |
|---|---|---|---|
| Dashboard/KPI (RAW `:171`, `:1031`) | Brojači iz agregata nad istim pravima | `GET /reports/dashboard/summary` + pločice, uz `buildTicketListWhere` | ✅ |
| Tiketi po OU (RAW `:171`, `:1031`) | Razrez po jedinici, uporedivo | OU je samo **filtar**; nema serije ni kolone po jedinici | ⚠️ gap |
| Avg resolution (RAW `:171`) | Prosjek i trend | Prosječno rješenje (KPI + serija + medijana/p90) | ✅ |
| Opterećenje admina (RAW `:171`) | Po agentu, na ekranu | Postoji kao izvoz `time_tracking` (sati po agentu i servisu); nema pločice ni ekrana | ⚠️ gap |
| KB resolution rate, cilj ≥ 30% (RAW `:171`) | Formula i cilj vidljivi | `pomoglo / (pomoglo + kreirani)`, cilj u opisu kartice | ✅ |
| CSAT u KPI po OU/servisu/grupi (RAW `:360`, `:1047`) | Razrez po tri dimenzije | Ukupan prosjek (KPI) + serija kroz vrijeme; **nema** po servisu/grupi | ⚠️ gap |
| Bottleneck: gdje tiketi stoje (RAW `:280–281`) | Brojači po statusima i prekoračenjima | API vraća tačno to; ekran prikazuje samo prosječno rješenje po grupi | ⚠️ B2 |
| Breakdown po OU/servisu/prioritetu (RAW `:282`) | Tri razreza | Postoje u API-ju (`/reports/bottlenecks`), **bez ekrana** | ⚠️ B2 |
| Trend kroz vrijeme (RAW `:282`) | Dnevna serija | Postoji u API-ju (dnevni trend) i u trendovima rada; nije prikazan za uska grla | ⚠️ B2 |
| Postavke `dashboard.bottlenecks.*` (RAW `:660–661`) | Dvije postavke sa efektom | Postoje; `enabled` **ne utiče** na ploču (vidi B1), `defaultWindowDays` dijeli pakete (B3) | ⚠️ |
| Predefinisani paketi CSV/JSON + OU scoping (RAW `:278–279`) | Šest paketa, dva formata, OU opseg, audit | Sve to, uz pregled prije preuzimanja i zapis u audit | ✅ |
| „Monthly KPI“, „Overdue by service“, „Top close codes“, „KB helpfulness“ (RAW `:279`) | Sva četiri | Sva četiri postoje kao paketi (uz još `forward_ping_pong` i `time_tracking`) | ✅ |
| Pristup Admin/SuperAdmin uz `reports.export`/`audit.export` (RAW `:279`) | Uloga + pravo | `@RequireRoles(admin, superAdmin)` + oba prava u dekoratoru; ruta isto | ✅ |
| Close codes u analitici (RAW `:1000`) | Kodovi u izvještaju | Paket „Najčešći kodovi zatvaranja“ (riješeni/zatvoreni u periodu) | ✅ |
| Trendovi, zakazani izvještaji, PDF (plan 2.5) | Sve u jednom modulu | Četiri taba sa izvozom, zakazivanjem i štampom uz audit | ✅ |
| Brojači na ploči uvijek tačni | Bez brojanja u pregledaču | Server agregat + keš 60 s (svjesno produžen sa 15 s, uz odobrenje) | ✅ |
| Prihvatanje plana 2.5 (§11.1, §11.5) | Trend < 1 s, dashboard ≤ 8 upita, parity s `monthly_kpi` | Mjerenja u planu §13.3: trend 36 mj. p95 395 ms / max 938 ms, dashboard 6 upita i p95 77 ms | ✅ |
| Usko grlo vodi u akciju | Iz broja u filtriranu listu | Pločice su brojevi; samo „Neusmjereni“ vodi na listu | ⚠️ gap |
| Tok zadnjih 14 dana i liste (plan 2.4) | Izvor je agregat ili cijeli skupljeni skup | Counterski dio je server agregat; **grafik i liste** računaju se iz prve strane od 50 tiketa | ⚠️ B6 |

## 6. Mišljenje i recenzija koda `[MIŠLJENJE]`

- **Najbolja odluka u modulu je da brojači ne dupliraju pravila.** `ReportSummaryService` poziva
  `buildTicketListWhere` sa praznim upitom, pa nadzorna ploča ne može pokazati tiket koji korisnik ne smije
  otvoriti; keš je dokumentovan, po korisniku, sa zonom u ključu, a pad keša je „propuštaj“, nikad greška.
  Single-flight je tu zbog stvarnog nalaza sa staginga (hladan keš → deset identičnih skenova), što je
  primjer dobrog komentara uz kod.
- **Pregled izvještaja drži prave metrike:** KPI nosi uzorak uz svaki prosjek (da se ne vjeruje broju iz
  dva tiketa), CSAT i KB stopa imaju definisanu formulu i cilj, a period se mjeri u zoni instalacije, ne u
  zoni procesa.
- **Kvalitet izvoza je iznad očekivanog:** pregled prije preuzimanja, ograničenje perioda po paketu, dva
  formata, zapis u audit sa periodom i imenom fajla, razlozi preskakanja primaoca i izostavljenih priloga
  prevedeni u UI. To je dio koji se u ovakvim sistemima obično preskoči.
- **Gdje sam našao prazninu:** najkorisniji dio RAW-a o uskim grlima — brojači po statusima i razrez po
  OU/servisu/prioritetu — postoji kao **API bez ekrana** (B2), pa nadzorna ploča prikazuje samo „prosječno
  rješenje po grupi“. Uz to postavka `private.dashboard.bottlenecks.enabled` isključuje samo taj nevidljivi
  API, a ne grafikon koji korisnik gleda (B1), i „Izvještaji“ dugme na ploči je trajno onemogućeno uz
  poruku koja više nije tačna (B5).
- **Gdje je neslaganje unutar iste ploče:** brojači su tačni (server agregat), a grafik i liste iznad
  kojih stoje dolaze iz prve strane od 50 tiketa — pa ploča može pokazati „3 prekoračenja“ i praznu listu
  nadzora (B6).
- **Mrtve površine:** `scope` parametar sažetka (četiri pogleda) klijent ne koristi (B4), a prijevodi
  `reports.exportAction` i `reports.exportDisabledHint` („Izvoz paketa dolazi u Fazi 8.“) nemaju nijednu
  upotrebu u kodu — ostatak ranije faze koji zbunjuje pri čitanju.
- **Sve u svemu**, modul je tehnički najzreliji dio dosadašnjeg audita (agregati, keš, zona, audit izvoza,
  zakazani izvještaji), ali mu RAW-ova namjena „identifikacija uskih grla“ nije dovršena do ekrana.

## 7. Otkriveni bug-ovi i neusklađenosti

### B1 — SREDNJE — Postavka za uska grla ne isključuje ono što korisnik vidi  → ✅ **popravljeno u valu 1 (2026-10-03)**

- **Fajl:** `backend/src/modules/reports/reports.service.ts:155–163` (bottleneck) prema `:183–199`
  (dashboard), `backend/src/modules/settings/definitions/reports-settings.ts:169–176`,
  `frontend/src/components/reports/reports-charts.tsx:44–62`,
  i18n `settings.registry.keys.private.dashboard.bottlenecks.enabled`
  („Uključi agregacije uskih grla na kontrolnoj tabli“)
- **Opis:** postavka `private.dashboard.bottlenecks.enabled` provjerava se **samo** u `bottleneck()`, dok
  `dashboard()` (čiji `bottleneckByGroup` crta grafikon „Bottleneck: prosj. rješenje po grupi“) nikad ne
  čita `configuration.bottlenecksEnabled`.
- **Uticaj:** administrator isključi „agregacije uskih grla na kontrolnoj tabli“, a kontrolna tabla ih i
  dalje prikazuje; jedini endpoint koji poštuje postavku nema nijedan ekran. Postavka trenutno djeluje
  suprotno od svog opisa.
- **Fix:** u `dashboard()` preskočiti `bottleneckByGroup` kad je postavka isključena (i sakriti grafikon),
  ili ukloniti provjeru iz `bottleneck()` ako postavka treba čuvati samo taj API.
- **Ozbiljnost:** SREDNJE.

### B2 — SREDNJE — Bottleneck izvještaj (razrez po OU/servisu/prioritetu i trend) nema ekran  → ✅ **popravljeno u valu 1 (2026-10-03)**

- **Fajl:** `backend/src/modules/reports/reports.controller.ts:123–130`,
  `backend/src/modules/reports/reports.service.ts:155–181`,
  `backend/src/modules/reports/bottleneck/aggregate-bottleneck-dashboard.ts:23–41`,
  `backend/src/modules/reports/bottleneck/sql-bottleneck-dashboard-store.ts:30–40`
- **Opis:** API `GET /reports/bottlenecks` vraća brojače `PENDING_APPROVAL`, `WAITING_FOR_USER`,
  `UNROUTED`, `OVERDUE`, razrez po organizacionoj jedinici, servisu i prioritetu te dnevni trend — tačno
  ono što RAW traži (`:281–282`) — ali ga **nijedna stranica ne poziva**: u `frontend/src` ne postoji ni
  funkcija klijenta ni komponenta za tu rutu, a `reports-page.tsx` tab „Pregled“ koristi samo
  `/reports/dashboard`.
- **Uticaj:** korisnik ne može vidjeti gdje tiketi stoje ni po kojoj dimenziji, pa RAW-ova svrha
  („identifikacija uskih grla i optimizacija procesa/SLA“) ostaje neispunjena; odgovor postoji, ali se do
  njega može samo ručno, preko API-ja.
- **Fix:** dodati sekciju/tab „Uska grla“ u `/reports` (brojači + tri razreza + trend, uz OU filter), ili
  uključiti razrez u postojeći pregled.
- **Ozbiljnost:** SREDNJE.

### B3 — NISKO — Jedna postavka opisana kao „bottleneck“ određuje i period paketa izvještaja  → ✅ **popravljeno u valu 1 (2026-10-03)**

- **Fajl:** `backend/src/modules/reports/reports.service.ts:130–136` (`buildPack`, `mode: 'month'`) i
  `:164–170` (`bottleneck`, `mode: 'rolling'`),
  `backend/src/modules/reports/reports-configuration.loader.ts:28–33`,
  `backend/src/modules/settings/definitions/reports-settings.ts:177–185`
- **Opis:** `private.dashboard.bottlenecks.defaultWindowDays` (zadano 30) čita se u jedinstvenu
  `configuration.defaultWindowDays` i koristi kao podrazumijevani period i za `GET /reports/dashboard`,
  i za `GET /reports/bottlenecks`, i za **pregled/preuzimanje paketa izvještaja** (`mode: 'month'`), dok
  opis u registru i prijevod kažu da je „podrazumijevani vremenski prozor (dani) za trendove uskih grla“.
- **Uticaj:** promjena „prosjeka za uska grla“ tiho mijenja period paketa (npr. „Mjesečni KPI“), pa
  administrator koji isključi uska grla i dalje pomjera izvještaje; naziv postavke navodi na pogrešan
  zaključak.
- **Fix:** razdvojiti postavke (npr. `private.reports.defaultWindowDays` za pakete, a postojeći ključ
  ostaviti uskim grlima) ili uskladiti opis i prijevod sa stvarnim dometom.
- **Ozbiljnost:** NISKO.

### B4 — NISKO — Opseg sažetka (`scope`) postoji u API-ju, ali ga klijent ne koristi

- **Fajl:** `backend/src/modules/reports/summary/report-summary.types.ts:11–22,52–55`,
  `backend/src/modules/reports/report-summary.controller.ts:45–54`,
  `frontend/src/services/report-summary-api.ts:75–82`,
  `frontend/src/lib/dashboard/use-dashboard-summary.ts:74–83`
- **Opis:** endpoint prima `scope=all|assignedToMe|requestedByMe|unassigned` i ima keš-ključ po opsegu,
  ali nadzorna ploča uvijek traži `all`; kolone „Dodijeljeni meni“ i „Moji zahtjevi“ su brojači unutar
  odgovora, pa se četiri opsega nikad ne koriste.
- **Uticaj:** mrtva površina u API-ju i kešu (četiri puta više mogućih ključeva), a odgovor na pitanje
  „kako ploča izgleda kad je fokusiran na mene“ ostaje neisproban; pri budućem povezivanju filtera lako se
  zaboravi da keš već razlikuje opsege.
- **Fix:** povezati opseg sa izborom na ploči (npr. segment „Sve / Dodijeljeno meni / Moji zahtjevi /
  Bez izvršioca“) ili ukloniti parametar iz API-ja.
- **Ozbiljnost:** NISKO.

### B5 — NISKO — Dugme „Izvještaji“ na ploči je trajno onemogućeno uz zastarjelu poruku  → ✅ **popravljeno u valu 1 (2026-10-03)**

- **Fajl:** `frontend/src/pages/dashboard-page.tsx:45–56`,
  `frontend/src/lib/navigation.ts:61–66`, i18n `dashboard.reportsActionDisabledHint`
  („Izvještaji će biti dostupni kad se doda ruta.“)
- **Opis:** dugme je `disabled` sa `aria-disabled` i fiksnim naslovom, iako ruta `/reports` postoji i
  nalazi se u navigaciji (za korisnike s pravom izvoza). Uz to, prijevodi `reports.exportAction`
  („Izvoz paketa“) i `reports.exportDisabledHint` („Izvoz paketa dolazi u Fazi 8.“) nemaju nijednu
  upotrebu u kodu (provjereno pretragom `frontend/src`).
- **Uticaj:** administratoru koji dođe na ploču nudi se onemogućena radnja sa netačnim objašnjenjem, a
  funkcionalnost koja postoji (paketi izvještaja) izgleda nedovršeno; mrtvi prijevodi zbunjuju pri
  održavanju.
- **Fix:** zamijeniti onemogućeno dugme linkom na `/reports` uz isto pravilo pristupa (ili ga ukloniti i
  ostaviti navigaciju), i obrisati nekorištene ključeve.
- **Ozbiljnost:** NISKO.

### B6 — NISKO — Grafik zadnjih 14 dana i liste računaju se iz prve strane od 50 tiketa  → ✅ **popravljeno u valu 1 (2026-10-03)**

- **Fajl:** `frontend/src/lib/dashboard/use-dashboard-summary.ts:71–90`,
  `frontend/src/lib/dashboard/build-volume-14d.ts:11–25`,
  `frontend/src/lib/dashboard/dashboard-ticket-sets.ts:28–35,60–80`,
  `frontend/src/pages/dashboard-page.tsx:80–124`
- **Opis:** brojači dolaze iz SQL agregata, ali 14-dnevni grafik toka, „SLA nadzor“, „Nedavni tiketi“ i
  „Tiketi koji zahtijevaju vašu pažnju“ računaju se iz **prve strane liste tiketa** (`pageSize: 50`,
  sortirano po najnovijem). Podnaslov grafikona to i priznaje („iz istog niza tiketa“), ali broj kreiranih
  u danu koji ima više od 50 tiketa u međuvremenu je manji od stvarnog, a tiket izvan prvih 50 ne može
  ući u listu pažnje ni u SLA nadzor.
- **Uticaj:** na aktivnoj instalaciji grafik i liste mogu tiho potcijeniti stanje (npr. prekoračenje koje
  nije u prvih 50 tiketa neće se pojaviti u „Najugroženiji tajmeri“), dok brojači iznad njih pokazuju
  tačan broj — pa se ista ploča na dva mjesta ne slaže.
- **Fix:** prebaciti grafik i liste na serverski agregat (npr. `volumeSeries` iz `GET /reports/dashboard`
  već postoji i pokriva isti period), a liste na `scope` opsege sažetka (`assignedToMe`, `unassigned`) ili
  na ciljane list-upite sa `take`.
- **Ozbiljnost:** NISKO.

## 8. Ažuriranje dokumentacije

- **Nova stranica `docs/user-guide/nadzorna-ploca-i-izvjestaji.md`** po obaveznoj strukturi: čemu modul
  služi (brzi pregled rada na `/` i izvještaji/uska grla na `/reports`), kome je namijenjen (svaki
  prijavljeni korisnik vidi ploču sa svojim tiketima; osoblje dodatno SLA nadzor i grupni inbox;
  administratori sa `reports.export`/`audit.export` vide izvještaje), kako se dolazi (meni **Nadzorna
  ploča**, meni **Izvještaji**; tabovi **Pregled**, **Trendovi**, **Paketi izvještaja**, **Zakazani**),
  korak po korak (čitanje brojača, SLA nadzor, pregled izvještaja sa periodom i jedinicom, trendovi sa
  granularnošću i filterima, izvoz/štampa, paketi i preuzimanje, zakazani izvještaji i historija),
  tabele (značenje svakog brojača, KPI formule i uzorci, paketi i periodi, formati i audit, postavke),
  česta pitanja („zašto se broj ne mijenja odmah“, „zašto ne vidim izvještaje“, „odakle razlika između
  kartice i liste“), poznata ograničenja (**B1–B6** i gapovi: nema razreza po OU, CSAT-a po servisu/grupi,
  uskih grla na ekranu) i povezane module (Tiketi, SLA, Baza znanja, Odobrenja/CSAT, Evidentiranje
  vremena, Zakazani izvještaji).
- **`TEZE-ZA-DOKUMENTACIJU.md`: T95–T101** — (T95) nadzorna ploča i izvor brojača; (T96) SLA nadzor i
  izloženost; (T97) KPI formule (prosjeci, uzorci, KB stopa i CSAT); (T98) trendovi i granularnost;
  (T99) paketi izvještaja, formati i audit izvoza; (T100) uska grla (API i razrez); (T101) zakazani
  izvještaji i historija izvršenja.
- **`REVIEW_ANALIZA.md`:** §M15 (ovaj tekst) i **red tabele iteracija 3** → „M11 ✅ · M12 ✅ · M13 ✅ ·
  M14 ✅ · M15 ✅ (iteracija 3 završena)“.
- **`DOCS_CHANGELOG.md`:** sekcija M15 sa izvorima, nalazima B1–B5 i napomenom da su dva RAW reda o
  predefinisanim izvještajima (`:278–279`) zapisana unutar odjeljka o verzionisanju konfiguracije i da
  prihvatanje brojača bilo je 30 s, dok kod radi 60 s (odobrena odluka, dokumentovana u komentaru `summary/report-summary-cache.ts:2–18`).

## 9. Ocjena modula

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| **Funkcionalnost** | **8/10** | Brojači, SLA nadzor, KPI sa uzorcima i formulama (uključujući KB stopu sa ciljem ≥ 30%), trendovi sa svim serijama, šest paketa u dva formata uz audit, zakazani izvještaji sa testnim slanjem i historijom — sve to radi i pokriveno je testovima. Minus za tri stvari iz RAW-a koje nisu došle do ekrana: razrez po OU, CSAT po servisu/grupi i **uska grla** (API postoji, ekran ne; B2), te za neefektivnu postavku (B1). |
| **Kvalitet koda** | **8/10** | Agregati, keš sa zonom u ključu i single-flight, jasna podjela na „brojači sa servera / pogledi iz prve stranice“, mali fajlovi i komentari koji bilježe i mjerenja (k6) i odluke (TTL 60 s). Ocjenu snižavaju mrtve površine (B4, B5), jedna postavka sa dvostrukim dometom (B3), nevidljivi endpoint (B2) i to što dio ploče i dalje računa u pregledaču iz prve strane od 50 tiketa (B6). |
| **Sigurnost** | **8/10** | Brojači se ne mogu zaobići (isti `buildTicketListWhere`), izvještaji traže i ulogu i pravo (`reports.export`/`audit.export`), svaki izvoz ostavlja zapis u audit sa periodom i fajlom, OU opseg se poštuje u svim paketima i trendovima, a u paketu prosljeđivanja naslovi povjerljivih tiketa zamjenjuju se oznakom `[confidential]`, koju pregled prevodi u `[povjerljivo]` (`backend/src/modules/reports/packs/build-forward-ping-pong-report.ts:19,38`, `frontend/src/lib/reports/report-pack-table.ts:54–55`). Minus za B1 (postavka koja ne isključuje prikaz, što je više dosljednost nego rizik) i za nedostatak e2e provjere same nadzorne ploče. |

---

# Zaključak Faze 2 — audit i dokumentacija (2026-10-03)

> Zatvaranje Faze 2: 15 modula (M1–M15) u tri iteracije, 236 redova gap tabela, 92 nalaza i 15 novih
> vodiča za krajnjeg korisnika. Sve tvrdnje u ovom zaključku izvedene su iz sekcija `# M1`–`# M15`
> iznad; ocjene i nalazi se ne mijenjaju, ovdje se samo sabiraju.

## 1. Sumarna tabela ocjena

| Modul | F | K | S | Nalazi (V / S / N) | Vodič za korisnika |
|---|---|---|---|---|---|
| M1 Instalacija (prvi start) | 8 | 9 | 7 | 0 / 1 / 4 | `user-guide/instalacija.md` |
| M2 Prijava i MFA | 9 | 8 | 8 | 0 / 2 / 4 | `user-guide/prijava-i-mfa.md` |
| M3 Korisnici, OJ i grupe | 8 | 8 | 7 | 0 / 4 / 3 | `user-guide/korisnici-oj-i-grupe.md` |
| M4 RBAC | 7 → **9** | 9 | 8 | **1** / 1 / 3 → poslije vala 0: 0 / 1 / 3 | `user-guide/uloge-i-permisije.md` |
| M5 Policy paketi | 6 | 8 | 8 | 0 / 4 / 2 | `user-guide/policy-paketi.md` |
| M6 Katalog usluga i forme | 7 | 8 | 7 | 0 / 5 / 4 | `user-guide/katalog-usluga-i-forme.md` |
| M7 Usmjeravanje i prioritet | 8 | 8 | 8 | 0 / 4 / 5 | `user-guide/usmjeravanje-i-prioritet.md` |
| M8 Tiketi | 9 | 8 | 8 | 0 / 2 / 5 | `user-guide/tiketi.md` |
| M9 Odobrenja i CSAT | 7 | 8 | 8 | 0 / 3 / 2 | `user-guide/odobrenja-i-csat.md` |
| M10 SLA | 8 | 9 | 8 | 0 / 4 / 1 | `user-guide/sla.md` |
| M11 Realtime i obavještenja | 8 | 9 | 8 | 0 / 2 / 3 | `user-guide/realtime-i-obavjestenja.md` |
| M12 Pošta | 8 | 9 | 8 | 0 / 2 / 3 | `user-guide/posta.md` |
| M13 Šabloni i playbooks | 8 | 7 | 7 | 0 / 1 / 4 | `user-guide/sabloni-i-playbooks.md` |
| M14 Baza znanja | 8 | 7 | 7 | 0 / 1 / 6 | `user-guide/baza-znanja.md` |
| M15 Nadzorna ploča i izvještaji | 8 | 8 | 8 | 0 / 2 / 4 | `user-guide/nadzorna-ploca-i-izvjestaji.md` |
| **Prosjek (15 modula)** | **7,8** | **8,2** | **7,7** | **1 / 38 / 53** | **15 vodiča** |
| *M4 poslije vala 0 (2026-10-03)* | *9* | *9* | *8* | *0 / 1 / 3* | *isti vodič* |
| *M15 poslije vala 1 (2026-10-03)* | *9* | *8* | *9* | *0 / 0 / 3* | *isti vodič* |
| *M9 poslije vala 1 (2026-10-03)* | *8* | *8* | *8* | *0 / 2 / 2* | *isti vodič* |
| *M6 poslije vala 2 (2026-10-04)* | *8* | *8* | *8* | *0 / 4 / 4* | *isti vodič* |
| *M8 poslije vala 2 (2026-10-04)* | *9* | *8* | *8* | *0 / 1 / 5* | *isti vodič* |
| *M9 poslije vala 2 (2026-10-04)* | *9* | *9* | *8* | *0 / 0 / 2* | *isti vodič* |
| *M10 poslije vala 2 (2026-10-04)* | *9* | *9* | *8* | *0 / 1 / 1* | *isti vodič* |
| *M12 poslije vala 2 (2026-10-04)* | *9* | *9* | *8* | *0 / 1 / 3* | *isti vodič* |
| *M13 poslije vala 2 (2026-10-04)* | *9* | *8* | *8* | *0 / 0 / 4* | *isti vodič* |
| *M14 poslije vala 2 (2026-10-04)* | *9* | *8* | *8* | *0 / 0 / 6* | *isti vodič* |

Raspodjela ozbiljnosti: **1 VISOKO** (M4 B1 — default mapping rola → permisije se nikad ne upisuje u bazu),
**38 SREDNJE**, **53 NISKO**, **0 KRITIČNO**. Poslije vala 0 (2026-10-03) jedini `VISOKO` je zatvoren i M4
ide na **F9 / K9 / S8**; poslije vala 1 (2026-10-03) zatvoreno je još **6 nalaza** (M15 B1, B2, B3, B5, B6;
M9 B3 — prvi dio), pa je otvoreno **0 KRITIČNO / 0 VISOKO / 34 SREDNJE / 51 NISKO** (prosjek poslije
vala 0 bio je F **7,9**; poslije vala 1 ide na **F 8,0 / K 8,2 / S 7,8**), a poslije **vala 2** zatvoreno je
još **10 nalaza** (M6 B2; M8 B1; M9 B1, B2; M10 B1, B2, B4; M12 B2; M13 B1; M14 B1) — svi `SREDNJE` — pa je
otvoreno **0 KRITIČNO / 0 VISOKO / 24 SREDNJE / 51 NISKO**, uz prosjek **F 8,5 / K 8,4 / S 7,9** (dokazi u
`# Val 2 — sigurnost i vidljivost`). Poslije **vala 3** zatvoreno je još **9 nalaza** (M8 B2, M11 B1/B2,
M12 B1/B3/B4/B5, M13 B2, M14 B5 — četiri `SREDNJE` i pet `NISKO`) **i jedan preventivni guard** (Redis auth
greška u `subscribeRedisChannel`), pa je otvoreno **0 KRITIČNO / 0 VISOKO / 20 SREDNJE / 46 NISKO** (dokazi u
`# Val 3 — pouzdanost i performanse`). Poslije **paketa 5.1, korak 5.1.1** (2026-10-06) zatvorena su **tri `SREDNJE`** nalaza (M1 #1 — politika
lozinke osnivačkog naloga; M2 #1 — upisan TOTP se uvijek verificira; M4 B2 — pregled uticaja je serverska
kapija uz obavezan razlog), pa je otvoreno bilo **12 SREDNJE / 38 NISKO**. Korak **5.1.2** je zatvorio još
**četiri `SREDNJE`** nalaza (M3 B1–B4), pa je sada otvoreno **0 KRITIČNO / 0 VISOKO / 8 SREDNJE / 38 NISKO**
(dokazi u odjeljku `# Paket 5.1 — korak 5.1.2`). Ocjene u tabeli se ponovo vrednuju na kraju paketa 5.1,
poslije koraka 5.1.4. Tabela iznad zadržava prvobitne ocjene kao zapis stanja prije popravke. Od 236 redova gap tabela: **151 ispunjeno**, **65 djelimično**,
**15 svjesnih odstupanja**, **4 nedostaje**, **1 van opsega** — dakle RAW je u najvećoj mjeri isporučen, a
problemi su koncentrisani u *posljedicama* (šta se dešava kad se funkcija ne koristi kako je zamišljena),
ne u tome da funkcija ne postoji.

## 2. Šta nedostaje (prema `RAW_PROJECT.md`)

Samo stavke koje RAW izričito traži, a u kodu ih nema ili ne rade do kraja (detalji i dokazi u sekcijama
modula):

| # | RAW | Šta nedostaje | Modul |
|---|---|---|---|
| 1 | `:195–216` | ~~Default mapping rola → permisije nikad se ne upisuje, pa svježa instalacija daje prazne role~~ — **riješeno u valu 0** (2026-10-03, bio jedini `VISOKO`) | M4 |
| 2 | `:296`, `:670–672` | Policy paket se ne može dodijeliti servisu **ili** OU; postavke `private.policyPacks.*` ne postoje; paket ne nosi SLA/obavezna polja/klasifikaciju/odobrenja | M5 |
| 3 | `:54` | „service → request type → due date“ nema tip zahtjeva ni rok kao polja; forme to nose posredno | M8 |
| 4 | `:269`, `:356–357` | Preview rutanja postoji kao endpoint, ali ga ekran za prijavu tiketa ne koristi | M7 |
| 5 | `:726`, `:59–61` | Postavka change loga za routing nema potrošača; matrica prioriteta nema `enabled` prekidač ni postavke | M7 |
| 6 | `:89`, `:511`, `:636` | Eskalacije nemaju ciljeve po roli/grupi/korisniku (`escalationTargetsJson`); ~~skala CSAT-a je u izvještajima hardkodirana na 5~~ — **riješeno u valu 1** za pregled i tab CSAT (serije na trendovima ostaju na konstanti) | M10 / M9 |
| 7 | `:360`, `:1019`, `:281` | ~~CSAT se ne prikazuje po OU/servisu/grupi (agregacija postoji, nijedan ekran je ne poziva)~~ — **riješeno u valu 1** (tab **CSAT**; serije na trendovima ostaju na konstanti) | M9 / M15 |
| 8 | `:171`, `:1031` | ~~Nema razreza „tiketi po OU“ ni prikaza „opterećenje admina“ na nadzornoj ploči~~ — **riješeno u valu 1** (2026-10-03) | M15 |
| 9 | `:280–284`, `:1039` | ~~Usko grlo: API (`/reports/bottlenecks`) vraća brojače, razrez i trend, ali **nema ekran**~~ — **riješeno u valu 1** (tab **Uska grla**) | M15 |
| 10 | `:71` | „Pomoglo“ u presretanju ne sprječava kreiranje tiketa ni ne pamti koji je članak pomogao | M14 |
| 11 | `:1050–1053` | Kanal e-pošte nema mjerenje ni alarm (zaglavljen zahtjev trajno gubi e-mail) | M12 |
| 12 | `:11`, `:30`, `:479` | OU izolacija za ADMIN/AGENT je djelimična, a `roleSource` je naziv koji odstupa | M3 |
| 13 | `:683–685`, `:632–634` | Postavke baze znanja postoje i rade, ali pregledi se broje bez pravila, `isStale` se nikad ne postavlja, a izvoz „Znanje“ ne prikazuje stopu po članku | M14 |
| 14 | `:636`, `:660–661` | Postavka uskih grla ne djeluje na ono što korisnik vidi, a jedna postavka perioda dijeli se s paketima izvještaja | M15 |

## 3. Must-have unapređenja (prije široke produkcije)

1. **Upisati default mapping rola → permisije pri instalaciji i pokriti ga testom** (M4 B1). Jedini nalaz
   označen VISOKO; svježa instalacija bez njega daje role bez prava.
2. **Zatvoriti puteve na kojima zaštita živi samo u interfejsu:** šablon koji je deaktiviran ili interni
   (M13 B1), zamjena ličnih podataka pri nastanku članka (M14 B1), redakcija sadržaja bulk broadcasta
   (M12 B2), `DRAFT` usluge vidljive svima (M6 B2).
3. ~~**Popraviti nadzor:** ekran uskih grla (M15 B2), poštovanje postavke (M15 B1), grafik i liste iz
   servera umjesto prve strane od 50 tiketa (M15 B6) i CSAT po OU/servisu/grupi (M9 B3).~~ ✅ **Isporučeno
   u valu 1 (2026-10-03)** — vidi `# Val 1 — nadzor i tačnost brojeva`; otvoreni ostaju M15 B4 (mrtav
   opseg sažetka) i fiksna skala na serijama trendova (dio M9 B3).
4. **Isporuka tačno jednom i alarm kanala e-pošte** (M12 B1, uz B2/B3): zaglavljen zahtjev danas trajno
   gubi e-mail, a nema mjerenja koje bi to pokazalo.
5. ~~**Ukloniti mrtve površine i zastarjele upute**~~ ✅ **završeno 2026-10-05**: `M15 B5` (val 1), `M15 B4`,
   `M9 B4`, `M8 B3` (uklonjene postavke), `M7 B2` (preview rutanja sada radi u koraku pregleda), a `roleSource` je
   ostao kao **dokumentovano odstupanje** od RAW-a (`ad_groups` je stvarna vrijednost u kodu i bazi; RAW navodi
   `entra_groups`), bez promjene koda.
6. **Dodati e2e pokrivenost za module koji je nemaju** (M14 portal, M15 nadzorna ploča, M12 pošta) i
   serverske testove za servise bez njih (M13). Nalazi tipa B4/B5 (statistika prije upisa, mrtva kolona)
   lakše bi se uhvatili testom nego pregledom.

## 4. Prioritetizovani roadmap (procjena `[MIŠLJENJE]`, u radnim danima)

| Val | Sadržaj | Nalazi / gapovi | Procjena |
|---|---|---|---|
| **0 — odmah** | Default mapping rola → permisije u instalaciji + test | M4 B1 | ~0,5 RD |
| **1 — nadzor i tačnost brojeva** ✅ **isporučen 2026-10-03** | Ekran uskih grla u `/reports`; postavka koja stvarno isključuje prikaz; grafik i liste iz server agregata; CSAT po OU/servisu/grupi; razrez „tiketi po OU“ i „opterećenje admina“; link umjesto onemogućenog dugmeta | M15 B1, B2, B3, B5, B6; M9 B3 (prvi dio); **M15 gapovi 8 i 9 zatvoreni** — otvoreno: M15 B4, fiksna skala na trendovima (dio M9 B3) | ~4–5 RD (stvarno: ~1,5 RD) |
| **2 — sigurnost i vidljivost** | Serverska provjera šablona pri slanju; zamjena ličnih podataka i pri upisu članka; redakcija broadcasta; `DRAFT` samo adminima; kapija odobrenja za `UNROUTED` i obavještenje odobravaocima; retention priloga; eskalacije s ciljevima i retroaktivni satovi | M13 B1; M14 B1; M12 B2; M6 B2; M9 B1, B2; M8 B1; M10 B1, B2, B4 | ~5–6 RD |
| **3 — pouzdanost i skaliranje** | Isporuka e-pošte „tačno jednom“ s alarmom; SMTP pooling; članstvo u sobama iz baze i rate limit za `ticket:join`; rate limiter broadcasta u Redis; paginacija i limiti na listama (KB, šabloni, pickers) | M12 B1, B3, B4; M11 B1, B2; M8 B2; M14 B5; M13 B2 | ~4–5 RD |
| **4 — testovi i CI** | e2e za portal znanja, nadzornu ploču i poštu; spec za servise šablona i bottleneck | M14, M15, M12 gapovi; M13 gapovi | ~2–3 RD |
| **5 — RAW zaostaci (opseg)** | Policy paket kao pun bundle + dodjela servisu ili OU + postavke; tip zahtjeva i rok na tiketu; preview rutanja u wizardu; postavke prioriteta i change loga; mjerenje kanala po RAW-u | M5 B1–B6; M8 3; M7 B2, B3, B5; M12 B1 (dio) | ~8–10 RD |

Ukupno za valove 0–4 (ono što je ispod „opsega“): **oko 16–20 RD**, od čega se valovi 0 i 1 mogu
zatvoriti u jednoj iteraciji. **Val 0 je zatvoren 2026-10-03** (M4 B1 — default mapping rola → permisije),
a **val 1 je isporučen istog dana** (M15 B1, B2, B3, B5, B6; M9 B3 — prvi dio; M15 gapovi 8 i 9;
~1,5 RD stvarnog rada),
a **CI provjera dokumentacije** (frontmatter, jedinstveni slugovi, veze, slike, anchori, slugovi iz mape
ekran→stranica i sinhronizacija ogledala) uvedena je u **Fazi 3, koracima (b) i (d)**, pa je ne treba
ponovo planirati; dio vala 4 koji ostaje su isključivo e2e testovi i specovi servisa. Val 5 je širenje funkcionalnosti, ne popravka, pa ide kroz redovni
`docs/plans/modules/` postupak (dizajn prije koda, pravilo iz sesije).

## 5. Sažetak stanja dokumentacije

- **`docs/user-guide/` — 23 vodiča + `TEZE-ZA-DOKUMENTACIJU.md`.** Petnaest vodiča (po jedan za svaki
  modul M1–M15) napisano je u Fazi 2, a sa nazivima dugmadi tačno kako stoje u interfejsu. **Trinaest ih
  je po obaveznoj strukturi od osam sekcija** (čemu služi, kome je namijenjen, kako se dolazi, korak po
  korak, polja/validacije/poruke, česta pitanja, poznata ograničenja, povezani moduli) — svi od M3 do M15;
  **dva vodiča iz ranije faze (`instalacija.md`, `prijava-i-mfa.md`) imala su skraćenu strukturu od šest
  sekcija** i **poravnata su sa ostalima u Fazi 3, korak (a), 2026-10-03** — vidi
  `# Faza 3 — korak (a)` na kraju dokumenta. Preostalih osam
  vodiča pokrivaju module izvan audita (dežurstva, imovina, najave, prečice i pristupačnost, problemi,
  promjene, prosljeđivanje tiketa, statusi/incidenti/planirani prekidi).
- **`TEZE-ZA-DOKUMENTACIJU.md` — 101 teza (T1–T101)** i 15 blokova odluka korisnika (paketi, CMDB, Teams,
  problemi, promjene, filteri, dežurstva). Teze su tehnički sloj
  dokumentacije: model i tokovi, prava i vidljivost, formule, postavke i statusi, s putanjama do koda.
  Svaka teza nosi `Status` („Važi“ ili „Važi uz B…“) i odredišnu wiki stranicu — što je i osnova za
  pretragu i filter po ulozi u Fazi 3.
- **`REVIEW_ANALIZA.md`** — 15 modulskih sekcija iste strukture (planirano / idealno / preporuka /
  stanje u kodu / gap tabela / recenzija / nalazi / ažuriranje dokumentacije / ocjena) plus ovaj
  zaključak; 236 redova gap tabela i 92 nalaza sa putanjom, linijom, uticajem, fixom i ozbiljnošću.
- **`DOCS_CHANGELOG.md`** — jedan unos po modulu (dodato / izmijenjeno / uklonjeno / zašto / izvori),
  sa nalazima o zastarjelim tvrdnjama u `docs/plans/**` koji su **evidentirani, ali ne dirani** (odluka
  vlasnika: planovi se ne ispravljaju u Fazi 2).
- **Otvoreno izvan ovog dokumenta:** odgovori DPO-a (`docs/privacy/DPO-UPITNIK.md`), korak 7 (A9)
  verifikacije na stagingu i odobrenje paketa 4.1 — sve troje čeka odluke ili termine vlasnika, ne
  dokumentaciju.
- **Poravnanje dva stara vodiča** (`instalacija.md`, `prijava-i-mfa.md`) sa strukturom od osam sekcija je
  **završeno u Fazi 3, korak (a), 2026-10-03**.
- **Faza 3 je promijenila i samu dokumentaciju:** 29 stranica ima frontmatter i generisano ogledalo
  (`backend/content/docs`, generator + provjera sinhronizacije u CI-u), a vodiči su dostupni u aplikaciji na
  ruti `/docs` sa pretragom, TOC-om i filterom po publici (koraci (b)–(d)).
- **Pravilo je uvedeno, ne više predlog:** izmjena funkcionalnosti povlači izmjenu Docs stranice u istom
  commitu — zapisano u `CONTRIBUTING.md` (nov) i `README.md`, uz CI provjeru koja pada ako se ogledalo raziđe
  sa `docs/user-guide/**` ili ako slug/anchor iz koda ne postoji u sadržaju. Detalji: `docs/DOCS_MODULE.md`,
  izmjene: `DOCS_CHANGELOG.md` (F3 (a)–(d)).

## 6. Ograničenja ovog audita `[MIŠLJENJE]`

- **Statička analiza, bez izvršavanja na stagingu.** Zaključci o ponašanju dolaze iz koda i testova;
  performance su preuzete iz mjerenja zapisanih u planovima (§13.3 paketa 2.5) i iz komentara u kodu, ne
  iz vlastitog mjerenja. Ono što nije pročitano označeno je `[NEJASNO]` u sekcijama modula.
- **Nisu rađeni:** penetracijski test, provjera pristupačnosti u realnom čitaču (osim `check-a11y-static`
  i e2e skeniranja), provjera migracija na stvarnoj bazi i revizija infrastrukture (Coolify, Nginx,
  Redis ACL) — te teme su u modulima dotaknute samo tamo gdje ih kod otkriva.
- **Ocjene su recenzentske**, na skali 1–10, i odražavaju ravnotežu isporučenog i propusta; ne treba ih
  čitati kao mjerenje, već kao poređenje s idealom opisanim u §2 svakog modula.

---

# Val 0 — popravka M4/B1 (2026-10-03)

Prvi val popravki iz zaključka Faze 2 (§4, val 0 `[MIŠLJENJE]` ~0,5 RD) i **jedini nalaz sa ozbiljnošću
`VISOKO`** u cijelom auditu: default mapping rola → permisije (`defaultRolePermissionKeys`) postoji u kodu, ali
ga nijedna migracija ni instalacijski korak nije upisivao u bazu — svježa instalacija je davala ADMIN/AGENT
naloge bez ijedne permisije (§M4 B1).

## 1. Šta je promijenjeno

| # | Promjena | Fajl (putanja:linije) |
|---|---|---|
| 1 | Nova idempotentna seed funkcija `seedDefaultRolePermissions(prisma, { dryRun, roleKeys })`; po roli vraća `roleKey`, `roleName`, `roleCreated`, `existing`, `added`, `addedPermissionKeys`, uz ukupan `addedTotal` | `backend/src/modules/rbac/seed-default-role-permissions.ts:52–133` |
| 2 | Dry-run ne piše ništa i ne pravi `Permission` redove; čita samo postojeće, a ostatak prijavljuje kao „would add“ (`if (permissionId !== undefined && existingIds.has(permissionId)) continue;`) | `backend/src/modules/rbac/seed-default-role-permissions.ts:102–120,139–152` |
| 3 | Poziv iz instalacije: poslije transakcije minimalnog seed-a (pokriva i ponovljen korak čarobnjaka) | `backend/src/modules/install/seed-install-minimum.ts:27–31` |
| 4 | CLI za postojeće instalacije: `npm run cli:seed-role-permissions [--dry-run]`; ispisuje po roli `existing`/`added`, a za role s dodatkom upisuje audit `role_permission.replace` (`entityId` = ključ role, `metadata.via = 'seed-default-role-permissions'`, `actorUserId: null`) | `backend/src/cli/seed-default-role-permissions.ts:26–75`; `backend/package.json:22` |
| 5 | Nazivi sistemskih rola na jednom mjestu (`authorizationRoleNames`) — koriste ih seed i `ensureSystemRole`; lokalna kopija `systemRoleNames` uklonjena | `backend/src/modules/authorization/authorization.constants.ts:16–30`; `backend/src/modules/users/ensure-system-role.ts:2,10` |
| 6 | In-memory instalacijski harness dobio `permission`/`rolePermission` delegate i `getRoleByKey`/`listRolePermissionKeys` (isti kao users harness) da instalacijski testovi mogu tvrditi stvarne veze | `backend/src/modules/install/create-in-memory-install-super-admin-prisma.ts:224–226`; `backend/src/modules/install/create-in-memory-install-seed-prisma.ts:45,101–102`; `backend/src/modules/install/in-memory-install-super-admin.types.ts:24–31` |
| 7 | Novi testovi: 4 testa seed funkcije (prazna baza → sve role i veze; drugi prolaz ne dodaje ništa; postojeći link se ne duplira; dry-run ne piše) + 1 test instalacijskog toka (role imaju default permisije poslije seed-a) | `backend/src/modules/rbac/seed-default-role-permissions.spec.ts`; `backend/src/modules/install/install-seed.service.spec.ts` |

**Obim upisa na praznoj bazi (stvarni brojevi iz `defaultRolePermissionKeys`):** 7 rola i **161 veza** —
USER 4, AGENT 22, ADMIN 58, ASSET_MANAGER 6, PROBLEM_MANAGER 4, CHANGE_MANAGER 4, SUPER_ADMIN 63.

**Odluka (nesimulirana posljedica):** seed je **aditivan i nikad ne briše**. Permisija koju je administrator
svjesno uklonio roli može se vratiti ponovnim pokretanjem, zato CLI ima `--dry-run` i ispisuje tačan spisak
(`addedPermissionKeys`) prije upisa, a upis ostavlja audit trag. Alternativa (migracija koja upisuje veze) je
odbijena jer bi ponovno pokretanje `prisma migrate deploy` bilo jednokratno, a ne rješavalo install tok.

## 2. Dokazi (izvršeno u ovom okruženju)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Cijeli backend test suite | `NODE_OPTIONS="--max-old-space-size=3072" npx jest --ci --coverage=false --runInBand` | **494 uspješna suitea / 499** (5 preskočeno), **2 341 test / 2 372** (31 preskočen), 0 padova |
| Ciljani moduli (RBAC, instalacija, autorizacija, korisnici, audit) | isti runner, pet direktorija | **71 suite / 267 testova**, 0 padova |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Lint (izmijenjeni fajlovi) | `npx eslint <7 fajlova>` | 0 grešaka, 0 upozorenja |
| Build (uklj. novi CLI u `dist/`) | `npm run build` | exit 0; `dist/src/cli/seed-default-role-permissions.js` postoji |
| CLI bez `DATABASE_URL` | `node dist/src/cli/seed-default-role-permissions.js --dry-run` | ispis „DATABASE_URL is required“, exit 2 |
| Statičke provjere repozitorija | `check-a11y-static`, `check-client-neutral`, `check-env-example`, `check-hooks-order`, `check-pulse-design-system`, `check-theme-contrast`, `check-ticket-id-leaks` | **7/7 OK** |

Nije izvršeno (nema pristupa): seed na **stvarnoj** bazi i na stagingu — CLI je pokrenut samo protiv
nedostupne baze radi provjere izlaznog koda. Zato je za postojeće instalacije prvi korak `--dry-run`.

## 3. Dokumentacija uz popravku

| Dokument | Promjena |
|---|---|
| `docs/user-guide/uloge-i-permisije.md` | Česta pitanja: „Nakon instalacije ADMIN ne može otvoriti Grupe/Postavke“ prepisano (svježa instalacija radi; za starije instalacije CLI) i dodat par o vraćanju uklonjene permisije; poznata ograničenja: B1 zamijenjen stvarnim ograničenjem *aditivnog* seeda |
| `docs/user-guide/instalacija.md` | Korak 4 (**Početni podaci**): dodato da se uz minimum upisuju i sistemske role s default permisijama |
| `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` | **T31** prepisan iz „ograničenje/prisutno“ u pravilo koje opisuje stvarno ponašanje i CLI (izvori i status ažurirani) |
| `DOCS_CHANGELOG.md` | Nova sekcija **Val 0** + red u pregledu |

## 4. Re-ocjena M4 i šta ostaje

| Kriterij | Prije | Poslije | Obrazloženje |
|---|---|---|---|
| Funkcionalnost | 7 | **9** | RBAC radi odmah nakon instalacije; ostaje B2 (preview uticaja nije serverska kapija) |
| Kvalitet koda | 9 | **9** | Seed je izdvojen u jednu funkciju s injektiranim Prisma klijentom, bez dupliranja naziva rola |
| Sigurnost | 8 | **8** | Nalaz nije bio sigurnosni (fail-closed), pa se ocjena ne mijenja: i dalje je umanjuju B2 i neauditovan SuperAdmin bypass (B5) |

**Otvoreno u M4 (nije dio vala 0):** B2 `SREDNJE` — serverski neobavezan preview i razlog promjene koji se ne
pamti; B3, B4, B5 `NISKO`. Po kriteriju „gotov modul“ M4 **još nije zatvoren** dok se B2 ne riješi ili izričito
ne prihvati kao odluka.

**Ukupno poslije vala 0 (15 modula):** nalaza otvoreno **0 KRITIČNO / 0 VISOKO / 38 SREDNJE / 53 NISKO**;
prosjek ocjena **F 7,9 · K 8,2 · S 7,7**.

---

# Faza 3 — korak (a): dizajn Docs modula (2026-10-03)

Prvi korak treće faze zadatka: **dizajn modula Dokumentacija u aplikaciji** i, usput, poravnanje dva vodiča iz
Faze 2 sa obaveznom strukturom od osam sekcija. Kod modula još nije pisan — koraci (b) backend, (c) frontend i
(d) Faza 2 modula slijede.

## 1. Isporučeno u koraku (a)

| # | Isporuka | Fajl |
|---|---|---|
| 1 | Dizajn dokument: svrha, potvrđene odluke, izvor sadržaja i frontmatter, ogledalo i generator, navigacija, backend (endpointi, učitavanje, autorizacija), renderer, pretraga, frontend, build/CI, Faza 2 modula, koraci (b)–(d), 9 kriterija prihvatanja, rizici | `docs/DOCS_MODULE.md` (nov) |
| 2 | `instalacija.md` poravnat na osam sekcija: dodate `Čemu služi ovaj modul`, `Kome je namijenjen`, `Kako doći` (sa `Prije početka` i `Otključavanje` kao podsekcijama), nova sekcija `Polja, validacije i statusi` (polja po koracima + šta se ne provjerava), `Česta pitanja i greške` (pitanja + postojeća tabela kodova), `Povezani moduli` | `docs/user-guide/instalacija.md` |
| 3 | `prijava-i-mfa.md` poravnat na osam sekcija: `Čemu služi ovaj modul`, `Kome je namijenjen`, `Kako doći`, `Povezani moduli` | `docs/user-guide/prijava-i-mfa.md` |
| 4 | Evidencija: sekcija **Faza 3 — korak (a)** i red u tabeli *Stanje po iteracijama* | ovaj dokument |
| 5 | Evidencija dokumentacije: red **Faza 3 (a)** u pregledu i nova sekcija | `DOCS_CHANGELOG.md` |

**Provjera (stvarna):** svi `.md` fajlovi u `docs/user-guide/` (23 vodiča) sada imaju osam obaveznih sekcija u
propisanom redu, osim **osam tematskih vodiča iz ranije faze** (`dezurstva`, `imovina`, `najave`,
`precice-i-pristupacnost`, `problemi`, `promjene`, `prosljedjivanje-tiketa`, `status-incidenti-i-planirani-prekidi`),
koji imaju tematske naslove („Za korisnike“, „Za administratore“…) — to je **novi nalaz** i otvorena odluka
(vidi §2).

## 2. Nalaz i otvorena odluka

**N1 — `NISKO`** *(novi nalaz iz Faze 3, van 92 nalaza audita — ne mijenja ocjene modula)* **— osam vodiča nema obaveznu strukturu od osam sekcija.**
Provjera nad `docs/user-guide/*.md` (23 fajla, `grep '^## '`) pokazuje da 15 vodiča ima propisanih osam
sekcija, a osam vodiča iz ranije faze ima tematske sekcije: `dezurstva.md` („Šta je dežurstvo“, „Za agente“,
„Za administratore“), `imovina.md` („Za sve korisnike“, „Za upravitelje imovine i agente“, „Za administratore“),
`najave.md`, `precice-i-pristupacnost.md`, `problemi.md`, `promjene.md`, `prosljedjivanje-tiketa.md`,
`status-incidenti-i-planirani-prekidi.md`. **Uticaj:** u Docs modulu te stranice izgledaju drugačije od ostalih
(nema jedinstvenih sekcija za česta pitanja i poznata ograničenja), pa pretraga i TOC nemaju istu strukturu.
**Predlog (za potvrdu):** poravnati i njih u koraku (b), istim redoslijedom sekcija i bez novih tvrdnji —
sadržaj se samo raspoređuje u sekcije. **Alternativa:** ostaviti ih kao tematske stranice i u frontmatteru
označiti vrstu (`layout: topic`).

## 3. Zavisnosti koje korak (b) mora riješiti prvo

1. **Frontmatter na 23 + 6 stranica** (šema: `docs/DOCS_MODULE.md` §3.2) — bez njega generator ne može
   napraviti navigaciju ni filter po ulozi.
2. **Generator ogledala** `scripts/generate-docs-content.mjs` + `backend/content/docs/**` (committed).
3. **Dockerfile** — `COPY --from=builder /usr/app/content ./content` u runtime stage (`backend/Dockerfile`),
   inače modul u kontejneru vraća 503.
4. **Odluka o mjestu stavke u meniju** (predlog: dio **Pregled**) i o **osam tematskih vodiča** (N1).

---

# Faza 3 — korak (b): sadržaj, backend i ogledalo (2026-10-03)

Korak (b) iz `docs/DOCS_MODULE.md` §11 je isporučen: sav sadržaj dokumentacije ima jedan izvor, generisano ogledalo
je committed, backend modul `docs` služi `/docs` rute i sve je pokriveno testovima.

## 1. Isporučeno

| # | Isporuka | Fajlovi |
|---|---|---|
| 1 | Poravnanje 8 tematskih vodiča na propisanih 8 sekcija (nalaz N1) | `docs/user-guide/{dezurstva,imovina,najave,precice-i-pristupacnost,problemi,promjene,prosljedjivanje-tiketa,status-incidenti-i-planirani-prekidi}.md` |
| 2 | Frontmatter `title, slug, module, part, audience, roles, order, tags` na svih 23 vodiča | `docs/user-guide/*.md` |
| 3 | Šest uvodnih stranica | `pocetak-rad.md`, `pregled-modula.md` (dio `pocetak`); `uloge-i-dozvole.md`, `cesta-pitanja.md`, `rjecnik.md`, `sta-je-novo.md` (dio `referenca`) |
| 4 | Generator ogledala i manifest | `scripts/generate-docs-content.mjs`, `backend/content/docs/*.md` (29) + `backend/content/docs/manifest.json` |
| 5 | CI provjera sadržaja (7 provjera) | `scripts/check-docs-content.mjs`, korak u `.github/workflows/ci.yml` |
| 6 | Backend modul `docs` | `backend/src/modules/docs/{docs.module,docs.controller,docs.service,docs-access.service,docs-content.repository,docs.constants,docs.error,docs.types}.ts`; registracija u `backend/src/app.module.ts:39,89` |
| 7 | Testovi modula | `docs-access.service.spec.ts`, `docs-content.repository.spec.ts`, `docs.service.spec.ts`, `docs.controller.spec.ts` — 18 testova |
| 8 | Ogledalo u kontejneru | `backend/Dockerfile` (`COPY --from=builder /usr/app/content ./content`) |
| 9 | Dizajn ažuriran na konačno stanje | `docs/DOCS_MODULE.md` §3.4 (mapiranje 29 stranica, N1 zatvoren) |

## 2. Dokazi (izvršeno 2026-10-03 u ovom okruženju)

- `npx jest src/modules/docs` — **4 suitea, 18 testova, 0 padova**.
- Cijeli backend: `npx jest --ci --coverage=false --runInBand` — **498 suitea prošlo (5 preskočeno), 2 359 testova prošlo (31 preskočeno), 0 padova**; prije koraka (b) bilo je 494 suitea / 2 341 test.
- `npx tsc --noEmit` — 0 grešaka; `npx eslint src/modules/docs` — 0; `npm run build` — 0 (u `dist/` su i `dist/src/modules/docs/**`).
- `node scripts/generate-docs-content.mjs --check` — „Ogledalo je u sinhronizaciji (29 stranica + manifest)“.
- `node scripts/check-docs-content.mjs` — „OK (29 stranica, 7 provjera)“: frontmatter, sinhronizacija ogledala, 42 relativna linka, anchori, slike i obrasci tajni su čisti; `docsSlug(...)` literala u kodu još nema (dolaze u koraku (d) uz kontekstualnu „?“ pomoć).

## 3. Nalaz N1 — zatvoren

Osam tematskih vodiča prepisano je u propisanu strukturu od osam sekcija, bez novih tvrdnji; provjera skriptom nad
svih 29 stranica daje 0 problema. Uz to je dio `referenca` uveden kao stvarni dio (4 stranice), a
`usmjeravanje-i-prioritet` je, prema stvarnom meniju administracije, svrstan u dio `administrator` — obje izmjene u
odnosu na radnu verziju su zapisane u `docs/DOCS_MODULE.md` §3.4.

## 4. Šta ostaje za korake (c) i (d)

- **(c)** `/docs` UI: stavka menija **Dokumentacija** u dio *Pregled*, ruta `/docs` (+ `/docs/:slug`, `?q=`),
  lijevi nav / desni TOC / breadcrumbs / prethodna-sljedeća, pretraga sa isticanjem (`excerptParts`), filter po
  ulozi i datumu izmjene, 404 i prazno stanje, responzivnost, i18n BS/EN, proširenje `simple-markdown.ts` i
  `markdown-view.tsx` (tabele, code, slike, callouti, bez sirovog HTML-a, sigurni linkovi).
- **(d)** Faza 2 modula (kontekstualna „?“ pomoć, feedback, nedavno posjećeno, štampa/PDF, i18n okvir), pravilo
  u `README.md`/`CONTRIBUTING.md`, evidencija i nove ocjene.

**Napomena:** u koraku (b) nijedan bug iz audita nije popravljan (pravilo Faze 3); `docsSlug` mapa ekran→stranica i
sve što zavisi od UI-a dolaze u (c)/(d).

---

# Faza 3 — korak (c): `/docs` UI (2026-10-03)

Korak (c) iz `docs/DOCS_MODULE.md` §11 je isporučen: stavka menija **Dokumentacija**, ruta `/docs`, lijevi nav,
desni TOC, breadcrumbs, prethodna/sljedeća, pretraga sa isticanjem, filter po publici, 404 i prazno stanje, uz
prošireni renderer (tabele, code, callouti, slike, anchori).

## 1. Isporučeno

| # | Isporuka | Fajlovi |
|---|---|---|
| 1 | Meni i vidljivost | `frontend/src/lib/navigation.ts` (`navigation.docs`, stavka u dijelu **Pregled**), `frontend/src/lib/session/route-access.ts` (`navigationAccessKinds.docs`, `canOpenDocs`) |
| 2 | Ruta | `frontend/src/app/router.tsx` (`docs` i `docs/:slug`, lazy `DocsPage`) |
| 3 | Stranica | `frontend/src/pages/docs-page.tsx` (jedna stranica za `/docs` i `/docs/:slug`, `?q=` pretraga, dvije kolone + TOC na `xl`, responzivni sidebar) |
| 4 | Komponente | `frontend/src/components/docs/{docs-sidebar,docs-toc,docs-search,docs-breadcrumbs,docs-pager,docs-role-filter,docs-empty-state}.tsx` |
| 5 | Podaci i hookovi | `frontend/src/services/docs-api.ts`, `frontend/src/lib/docs/{use-docs,docs-audience,docs-labels,slugify-heading}.ts` |
| 6 | Renderer | `frontend/src/lib/privacy/simple-markdown.ts` (+ tabele, fenced code sa isticanjem `json/ts/bash/sql`, callouti, relativne slike, bez sirovog HTML-a), `frontend/src/components/privacy/markdown-view.tsx` (+ `id`/anchori iz `manifest.json`) |
| 7 | i18n BS/EN | `frontend/src/i18n/locales/{bs,en}/common.json` (`navigation.docs` + `docs.*`: 29 ključeva po jeziku) |
| 8 | Backend dopuna | `backend/src/modules/docs/{docs.types,docs.service,docs-content.repository}.ts` — `roles` u stavkama navigacije i rezultatima pretrage (za klijentski filter po publici) |
| 9 | Ogledalo | `backend/content/docs/manifest.json` — regenerisan poslije commita koraka (b): šest novih stranica sada ima `updatedAt` iz gita umjesto `null` |

## 2. Dokazi (izvršeno 2026-10-03 u ovom okruženju)

- `npx vitest run` (frontend) — **151 fajl, 594 testa, 0 padova**; prije koraka (c) 150 fajlova / 585 testova.
- Novi testovi: `src/lib/docs/slugify-heading.spec.ts` (3), `src/lib/docs/docs-audience.spec.ts` (3) i šest testova
  u `src/lib/privacy/simple-markdown.spec.ts` za tabele, code blokove, calloute, slike i isticanje koda.
- `npx tsc -b` — 0 grešaka; `npm run build` (tsc + vite) — 0.
- Svih **8 `check-*` skripti prolazi**: `check-client-neutral`, `check-env-example`, `check-ticket-id-leaks`,
  `check-pulse-design-system`, `check-theme-contrast`, `check-a11y-static`, `check-hooks-order`,
  `check-docs-content` (7 provjera sadržaja, 29 stranica).
- Backend: `npx jest src/modules/docs` — 4 suitea / 18 testova, 0 padova (poslije dopune sa `roles`).

## 3. Sigurnost i ponašanje

- **Server filtrira uloge** i za navigaciju i za pretragu; klijent nikad ne dobija tuđe stranice, pa filter po
  publici u UI-u samo sužava prikaz (priznato u dizajnu §7.3).
- **Nepoznat i nedozvoljen slug** daju isti 404; kad ogledalo nije učitano, stranica prikazuje poseban ekran
  („Dokumentacija trenutno nije dostupna“) sa dugmetom za ponovni pokušaj.
- Renderer i dalje **ne emituje HTML**: `<`, `>` i `&` idu kroz React tekst, linkovi su ograničeni na
  `http(s)`/`mailto`, slike samo na relativne putanje bez `..` i shema.

## 4. Šta ostaje za korak (d)

- Faza 2 modula: kontekstualna „?“ pomoć (`docs-slug.ts` mapa ekran→stranica + `docsSlug(...)` literali),
  feedback („je li stranica pomogla?“), nedavno posjećeno, štampa/PDF, i18n okvir za EN sadržaj.
- Pravilo u `README.md`/`CONTRIBUTING.md`: izmjena funkcionalnosti povlači izmjenu Docs stranice u istom commitu.
- Završna evidencija: sažetak, nove ocjene i `DOCS_CHANGELOG.md` (red **F3 (d)**).

**Napomena:** korak (c) je dokazan statičkim provjerama, testovima i buildom; živu ručnu provjeru ekrana
(pregled u browseru na stvarnoj bazi) treba uraditi na stagingu pri prvom deployu.

---

# Faza 3 — korak (d): Faza 2 modula, pravilo i evidencija (2026-10-03)

Korak (d) zatvara Docs modul: kontekstualna „?" pomoć, feedback, nedavno posjećeno, štampa/PDF i i18n okvir,
uz pravilo za repozitorij i proširenu CI provjeru.

## 1. Isporučeno

| # | Isporuka | Fajlovi |
|---|---|---|
| 1 | Kontekstualna „?" pomoć | `frontend/src/lib/docs/docs-slug.ts` (mapa **20 ruta → 17 stranica**), `frontend/src/components/docs/docs-help-button.tsx` (nov), integracija u `frontend/src/components/ui/page-header.tsx` (dugme stoji uz naslov ekrana, `print:hidden`) |
| 2 | Feedback | `frontend/src/lib/docs/docs-local.ts` (nov), `frontend/src/components/docs/docs-feedback.tsx` (nov), uključen na dno stranice u `frontend/src/pages/docs-page.tsx` |
| 3 | Nedavno posjećeno | `rememberRecentDoc`/`readRecentDocs` u `docs-local.ts`, lista u `frontend/src/components/docs/docs-sidebar.tsx` (zadnjih 5, filtrirano po publici i po vidljivim stranicama) |
| 4 | Štampa / PDF | dugme u `docs-page.tsx` (`window.print()`) + `print:hidden` na lijevom navu, TOC-u, pretrazi, pageru i feedbacku |
| 5 | i18n okvir | `frontend/src/i18n/locales/{bs,en}/common.json` — `docs.feedback.*`, `docs.recent`, `docs.print`, `docs.helpLabel`, `docs.languageNotice` (32 ključa po jeziku + `audience` 5 + `parts` 6) |
| 6 | Obavještenje za EN UI | `docs.languageNotice` se prikazuje kad je UI na engleskom, a sadržaj je BS (dokumentovano ograničenje, ne tiho ponašanje) |
| 7 | Pravilo za repozitorij | **nov** `CONTRIBUTING.md` (dokumentacija ide uz kod, komande, lista provjera), sekcija „Dokumentacija i doprinosi" u `README.md` |
| 8 | CI provjera | `scripts/check-docs-content.mjs` — provjera 6 sada pokriva i mapu ekran→stranica: slug i anchor iz `docs-slug.ts` moraju postojati u sadržaju (anchori se porede sa `slugifyHeading` nad `##`/`###` naslovima) |
| 9 | Dizajn dokument | `docs/DOCS_MODULE.md` — §9 (provjera 6), §10 (odluke (d)), §11 (statusi koraka), §12 (kriteriji 1–9 označeni), §13 (R4, R5, R7 zatvoreni), §14 |

## 2. Dokazi (izvršeno 2026-10-03 u ovom okruženju)

- `npx tsc -b` (frontend) — 0 grešaka; `npm run build` — 0.
- `npx vitest run` (frontend) — **153 fajla / 604 testa, 0 padova** (korak (c): 151/594). Novi testovi:
  `src/lib/docs/docs-slug.spec.ts` (6 — tačna ruta, podruta, duži prefiks, lažni prefiks, `docsHref` bez/sa
  anchora) i `src/lib/docs/docs-local.spec.ts` (4 — rad bez storagea, deduplikacija i limit od 5, feedback po
  stranici, pokvaren zapis).
- Backend `npx jest src/modules/docs` — 4 suitea / **18 testova** (nepromijenjeni; korak (d) ne dira backend).
- Svih **8 `scripts/check-*.mjs`** prolazi, uključujući proširenu `check-docs-content` (29 stranica, 7 provjera).

## 3. Odluke i granice

- **Feedback:** `localStorage`, bez nove tabele i bez identiteta korisnika — predlog iz §13/R5 (`AuditLog`) je
  odbačen jer feedback ne mijenja stanje sistema i ne treba mu trag u auditu; ograničenje (ne vidi se na drugom
  uređaju) je prihvaćeno. Isto važi za nedavno posjećeno.
- **„?" pomoć** je jedna integraciona tačka (`PageHeader`) i mapa podataka, bez dodirivanja 40+ stranica; mapa
  pokriva 20 ruta, a pojedini ekrani (`/status`, `/problems`, `/changes`, `/on-call`…) vode na zajedničke
  vodiče — ako se pokaže potreba, dodavanje rute je jedan red i CI odmah provjeri slug.
- **Štampa/PDF** je `window.print()` sa print CSS-om; serverski PDF nije uveden (nova zavisnost, bez potrebe).
- **EN sadržaj** nije preveden — preveden je UI okvir, a korisnik na EN UI dobija obavještenje da je sadržaj BS.
  Prevod stranica ostaje odvojen posao.
- **Ne dira se** `REVIEW_ANALIZA.md` audit (nalazi modula M1–M15 ostaju nepromijenjeni), `docs/plans/**` ni
  nepovezani kod; izmjene u koracima (b)–(d) su u modulu `docs`, tri integracione tačke i dokumentaciji.

## 4. Ocjena isporuke (novi modul, ne dira M1–M15)

| Kriterij | Ocjena | Obrazloženje |
|---|---|---|
| Funkcionalnost | **9/10** | 9/9 kriterija prihvatanja ispunjeno na dokaziv način; jedina nepotpuna stavka je živa provjera ekrana u browseru (nije izvršena u ovom okruženju) i EN sadržaj (izvan obima) |
| Kvalitet | **8/10** | Jedan izvor sadržaja + generator + sinhronizacija + 7 CI provjera; frontend 604 testa i `tsc`/build zeleni. Ocjena nije 9 jer UI nema DOM testova (repo nema `jsdom`/testing-library), pa se ponašanje ekrana dokazuje statički i na stagingu |
| Sigurnost | **9/10** | Server provjerava ulogu na svakom endpointu, 404 za nedozvoljen slug, slug validiran prije čitanja, renderer ne emituje HTML, feedback i nedavno ne sadrže lične podatke ni tajne |

**Ocjene modula M1–M15 se ne mijenjaju** — korak (d) ne dira njihov kod ni nalaze; jedina dva nova otvorena
zadatka iz ove faze su van audita (živa provjera na stagingu i eventualni EN prevod).

## 5. Faza 3 — zaključak

Docs modul je isporučen u četiri koraka: (a) dizajn i kriteriji, (b) sadržaj, generator i backend, (c) `/docs`
UI sa pretragom i filterom, (d) Faza 2 modula, pravilo i evidencija. Kriteriji prihvatanja 1–9 su označeni u
`docs/DOCS_MODULE.md` §12 uz napomenu šta je dokazano kako. Sljedeće na redu su **popravke po valovima 1–5** iz
zaključka Faze 2 (`# Zaključak Faze 2`, §4), a prije njih — po potrebi — živa provjera modula na stagingu.

---

# Val 1 — nadzor i tačnost brojeva (2026-10-03)

Prvi val popravki iz zaključka Faze 2 (`# Zaključak Faze 2`, §4): šest nalaza koji su svi govorili isto —
**nadzorni ekrani nisu prikazivali ono što server već zna, a dio brojeva se računao iz pogrešnog uzorka.**

## 1. Šta je popravljeno

| Nalaz | Popravka | Dokaz (kod) |
|---|---|---|
| **M15 B1** (`SREDNJE`) — postavka uskih grla nije isključivala prikaz | `ReportsDashboard` nosi `bottlenecksEnabled`; sa isključenom postavkom `dashboard()` ne računa razrez, a UI **ne renderuje** karticu (umjesto praznog stanja koje izgleda kao „nema podataka“) | `backend/src/modules/reports/dashboard/build-reports-dashboard.ts:41,81–88,127–137`, `reports/dashboard/report-dashboard.cache.ts:110–126`, `frontend/src/lib/reports/map-report-dashboard-charts.ts:17–30` (`showBottleneckChart`), `frontend/src/components/reports/reports-charts.tsx:49–51` (kapija), `frontend/src/pages/reports-page.tsx:392` |
| **M15 B2** (`SREDNJE`) — `GET /reports/bottlenecks` nije imao ekran | Novi tab **Uska grla**: četiri brojača, razrez po OU/servisu/prioritetu i dnevni trend, uz isti period i OU opseg; isključena postavka se prikazuje kao stanje („Prikaz uskih grla je isključen“), ne kao greška | `frontend/src/components/reports/reports-bottlenecks-panel.tsx` (nov, 207 r.), `frontend/src/lib/reports/bottleneck-view.ts` (nov, 72 r.), `frontend/src/services/reports-api.ts:75–88` (`fetchBottlenecks`), `frontend/src/pages/reports-page.tsx:56–68,271,326` |
| **M15 B3** (`NISKO`) — jedna postavka je tiho pomjerala i pakete | Razdvojeno: **`private.reports.defaultWindowDays`** (novo, period paketa) i postojeći `private.dashboard.bottlenecks.defaultWindowDays` (uska grla i pregled); starije instalacije bez novog ključa zadržavaju staro ponašanje (fallback) | `backend/src/modules/settings/setting-keys.ts:442`, `settings/definitions/reports-settings.ts:26,171–181`, `reports/parse-reports-configuration.ts:29,63–67`, `reports/reports-configuration.loader.ts:34–36`, `reports/reports.service.ts:134` |
| **M15 B5** (`NISKO`) — trajno onemogućeno dugme „Izvještaji“ i mrtvi prijevodi | Dugme je sada **link** na `/reports` i prikazuje se samo onima koji smiju otvoriti izvještaje (`canOpenReports`); obrisana tri nekorištena ključa (`dashboard.reportsActionDisabledHint`, `reports.exportAction`, `reports.exportDisabledHint`) | `frontend/src/pages/dashboard-page.tsx:19–58`, `frontend/src/i18n/locales/{bs,en}/common.json` |
| **M15 B6** (`NISKO`) — liste i grafik iz prve strane od 50 tiketa | Liste sada imaju **vlastite serverske upite sa malim `take`**: nedavni (`createdAt desc`, 8), SLA nadzor (`overdue=true`, 5), pažnja (dodijeljeni meni i bez izvršioca, otvoreni statusi, 8+8); grafik je vezan na period (`createdFrom`) i **označen kao donja granica** kad stranica nije dovoljna | `frontend/src/lib/dashboard/use-dashboard-summary.ts:106–170`, `frontend/src/lib/dashboard/compose-dashboard-summary.ts`, `frontend/src/lib/dashboard/build-volume-14d.ts:11` (`dashboardVolumePageSize = 100`), `frontend/src/components/dashboard/dashboard-charts.tsx` |
| **M15 gap 1** (RAW `:171`, `:1031`) — nije bilo razreza „tiketi po OU“ | Novi grafik **Tiketi po organizacionoj jedinici** (kreirani u periodu, naziv OU iz šifarnika); broji se u SQL-u i u referentnoj memorijskoj agregaciji | `backend/src/modules/reports/dashboard/aggregate-report-dashboard-charts.ts` (`aggregateOriginUnitVolume`), `dashboard/sql-reports-dashboard-store.ts` (grana `'u'`), `dashboard/build-reports-dashboard.ts`, `frontend/src/components/reports/reports-charts.tsx`, `frontend/src/lib/reports/map-report-dashboard-charts.ts` (`mapCountBars`) |
| **M15 gap 2** (RAW `:171`, `:1031`) — nije bilo prikaza „opterećenje admina“ | Novi grafik **Opterećenje admina**: broj **otvorenih** tiketa po izvršiocu (stanje sada; neusmjereni imaju vlastiti brojač), najopterećeniji nosi upozorenje | `aggregate-report-dashboard-charts.ts` (`aggregateAssigneeWorkload`), `dashboard/sql-reports-dashboard-store.ts` (grana `'w'`), `dashboard/build-reports-dashboard.ts` (`loadUserNames`), `frontend/src/lib/reports/map-report-dashboard-charts.ts` (`mapWorkloadBars`) |
| **M15 B2 / M9 B3 — dopuna** (`SREDNJE`, prijava sa staginga 2026-10-03) — razrez je prikazivao **ID-eve** umjesto naziva | Nazive razrješava **server**: novi `backend/src/modules/reports/load-report-lookups.ts` (4 loadera, batch + defanzivno), `BottleneckBreakdownRow` i `TicketCsatBucket` nose `{ key, label }`, SQL razrez dodaje `LEFT JOIN "OrganizationalUnit"` / `"Service"` uz `MAX(…name)`; prioritet ostaje enum i prevodi ga UI (`bottleneckRowLabel`) | `backend/src/modules/reports/load-report-lookups.ts` (nov), `reports/reports.types.ts` (`BottleneckBreakdownRow`), `reports/bottleneck/sql-bottleneck-dashboard-store.ts` (`unitName`/`serviceName`), `reports/bottleneck/aggregate-bottleneck-dashboard.ts`, `reports/reports.service.ts`, `tickets/csat/{csat.types.ts,aggregate-ticket-csat.ts,summarize-visible-ticket-csat.ts}`, `frontend/src/lib/reports/{bottleneck-view.ts,csat-view.ts}`, `frontend/src/components/reports/{reports-bottlenecks-panel.tsx,reports-csat-panel.tsx}`; detalji i dokazi u §2b.1 |
| **M9 B3** (`SREDNJE`) — CSAT razrez postoji ali ga UI ne koristi; skala hardkodirana | Novi tab **CSAT** (prosjek na važećoj skali, uzorak, prag zadovoljan, razrez po OU/servisu/grupi); `GET /tickets/csat/summary` sada vraća `scaleMax` i `satisfiedMinRating` (80 % skale); KPI „CSAT (zadovoljstvo)“ na pregledu koristi `private.csat.scaleMax` umjesto konstante 5 | `backend/src/modules/tickets/csat/aggregate-ticket-csat.ts:4–12,46–48`, `csat/csat.types.ts:44–51`, `csat/summarize-visible-ticket-csat.ts:21,44`, `csat/tickets-csat.service.ts:65–74`, `reports/parse-reports-configuration.ts:31,67,76–88`, `reports/dashboard/aggregate-report-dashboard-kpis.ts:15,51,67,85`, `frontend/src/components/reports/reports-csat-panel.tsx` (nov, 158 r.), `frontend/src/lib/reports/csat-view.ts` (nov, 45 r.), `frontend/src/services/tickets-csat-api.ts:4–37` |

**Nove i izmijenjene stranice u vodiču:** `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — novi tabovi
**Uska grla** i **CSAT**, novo ponašanje liste i grafikona na ploči, razdvojene postavke perioda i skala
CSAT-a; „Poznata ograničenja“ svedena na ono što **ostaje** otvoreno.

## 2. Dokazi (izvršeno 2026-10-03 u ovom okruženju)

- **Backend:** `NODE_OPTIONS=--max-old-space-size=4096 npx jest --runInBand` → **498 prošlo / 5 preskočeno
  suitea, 2363 testa prošla / 31 preskočen, 0 padova**; poslije nastavka vala 1 (gapovi) **498 / 2364**
  (jedan novi backend test, vidi §2a), 0 padova.
- **Regresija sa staginga (§2b):** nova provjera `check-ticket-list-page-size.mjs` prolazi na ispravnom kodu,
  a **pada** kad se vrati `pageSize: 100` (provjereno privremenom izmjenom, poruka pokazuje fajl i liniju).
- **Frontend:** `npx tsc -b` i `npm run build` bez grešaka; `npx vitest run` → **156 fajlova / 617 testova,
  0 padova** (prije vala 1: 151 / 594).
- **Novi testovi:** backend — `parse-reports-configuration.spec.ts` (razdvajanje prozora + CSAT skala),
  `dashboard/build-reports-dashboard.spec.ts` (isključena postavka prazni razrez, `bottleneck()` odbija sa
  `BOTTLENECKS_DISABLED`), `tickets/csat/aggregate-ticket-csat.spec.ts` (prag po skali); frontend —
  `lib/reports/map-report-dashboard-charts.spec.ts` (4), `lib/reports/bottleneck-view.spec.ts` (4),
  `lib/reports/csat-view.spec.ts` (4), prepisan `lib/dashboard/compose-dashboard-summary.spec.ts` (6).
- **Statičke provjere:** svih **9 `scripts/check-*.mjs`** prolazi, uključujući novu
  `check-ticket-list-page-size` i `check-docs-content`
  (29 stranica) poslije regeneracije ogledala (`node scripts/generate-docs-content.mjs`).

## 2a. Nastavak vala 1 — M15 gapovi (razrez po OU i opterećenje admina)

| Šta je dodato | Dokaz (kod) |
|---|---|
| Grafik **Tiketi po organizacionoj jedinici** (`originUnitVolume`) — kreirani u periodu, naziv OU iz šifarnika | `backend/src/modules/reports/dashboard/aggregate-report-dashboard-charts.ts` (`aggregateOriginUnitVolume`), `dashboard/sql-reports-dashboard-store.ts` (grana `'u'` u bar upitu), `dashboard/build-reports-dashboard.ts` (`loadOrganizationalUnitNames`), `dashboard/report-dashboard.cache.ts` (validator), `frontend/src/lib/reports/map-report-dashboard-charts.ts` (`mapCountBars`), `frontend/src/components/reports/reports-charts.tsx`, `frontend/src/pages/reports-page.tsx` |
| Grafik **Opterećenje admina** (`assigneeWorkload`) — otvoreni tiketi po izvršiocu (stanje sada), najopterećeniji nosi upozorenje | `aggregate-report-dashboard-charts.ts` (`aggregateAssigneeWorkload`), `dashboard/sql-reports-dashboard-store.ts` (grana `'w'`), `dashboard/build-reports-dashboard.ts` (`loadUserNames`), `frontend/src/lib/reports/map-report-dashboard-charts.ts` (`mapWorkloadBars`) |
| Test | novi test „razrezuje tikete po OU i otvorene tikete po izvršiocu (val 1, M15 gap)" u `backend/src/modules/reports/dashboard/build-reports-dashboard.spec.ts` (uključuje: OU bez naziva nosi ključ, riješeni i neusmjereni ne ulaze u opterećenje) + frontend test u `frontend/src/lib/reports/map-report-dashboard-charts.spec.ts` |

**Odluke (zapisane da se ne preispituju bez razloga):** razrez po OU broji **kreirane** tikete u periodu (kao
„obim po servisu“), a opterećenje je **stanje sada** (otvoreni tiketi), jer period tu ne opisuje „opterećenje“;
neusmjereni tiketi nisu ni na čijem spisku i imaju vlastiti brojač, pa se u opterećenje ne broje.

## 2b. Regresija otkrivena na stagingu poslije isporuke (2026-10-03)

Korisnik je na stagingu dobio `400 VALIDATION: pageSize must not be greater than 50` sa
`GET /tickets?createdFrom=…&pageSize=100` — to je bio zahtjev **novog grafika** iz vala 1 (B6).

- **Uzrok:** prva verzija je pretpostavila da `GET /tickets` prima `pageSize: 100`, a DTO ga odbija iznad
  `ticketListPaging.maxPageSize = 50`
  (`backend/src/modules/tickets/list/list-tickets.constants.ts:18`,
  `backend/src/modules/tickets/dto/list-tickets-query.dto.ts:78` — `@Max`), dok `clampTicketListPageSize`
  vrijedi samo za **serverski** put bez DTO validacije.
- **Fix:** grafik više ne traži jednu veliku stranicu nego **hoda stranice po 50** i staje na prvom
  nepotpunom listu (`frontend/src/lib/dashboard/load-dashboard-volume.ts` — `loadDashboardVolume`), najviše
  **6 stranica / 300 tiketa**; oznaka „donja granica“ važi samo kad je i zadnja dozvoljena stranica puna.
  `dashboardVolumePageSize` je sada izveden iz `ticketListMaxPageSize`
  (`frontend/src/lib/tickets/ticket-constants.ts`), pa se brojevi ne mogu razići bez izmjene na jednom mjestu.
- **Zaštita da se ne ponovi:** nova CI provjera `scripts/check-ticket-list-page-size.mjs` (frontend konstanta
  mora biti jednaka backend maksimumu; **nijedan numerički `pageSize` literal u `frontend/src`** ne smije
  preko nje — u frontend-u drugih takvih literala nema, pa nema izuzetaka), uključena u
  `.github/workflows/ci.yml` uz ostale `check-*` provjere. Test:
  `frontend/src/lib/dashboard/load-dashboard-volume.spec.ts` (6 testova, uključujući „nikad ne traži više od
  onoga što API prihvata“ i „puna zadnja dozvoljena stranica znači donju granicu“).
- **Zapis o sopstvenoj grešci u istom danu:** prvi commit popravke (`596d102`) nosio je i **test-otpadak**
  (`const _temp = { pageSize: 100 }`) — dokaz da je provjera hvatala regresiju, ali je ostao u fajlu jer
  provjera tada nije gledala numeričke literale izvan fajlova koji zovu `listTicketsPage`. Otpadak je uklonjen
  odmah, a provjera je **proširena na cijeli `frontend/src`**; pad provjere na vraćenom otpatku je provjeren
  (`load-dashboard-volume.ts:12 traži pageSize 100, a server prihvata najviše 50`). `tsc` i `vitest` ovo nisu
  mogli uhvatiti jer je neželjeni kod bio sintaksno ispravan i nekorišten.
- **Ista klasa greške u CI konfiguraciji (2026-10-03, ista sesija):** korak CI-a je dobio ime
  `name: Check the ticket-list page size (val 1 regresija: pageSize 100)`, pa je GitHub odbio **cijeli
  workflow**: *„You have an error in your yaml syntax on line 73"* (dvotočka u neukotvljenoj vrijednosti).
  Dokazi: `js-yaml` na staroj verziji vraća `YAMLException: bad indentation of a mapping entry (73:63)`,
  a na popravljenoj 0; GitHub validira workflow **tek poslije push-a**.
  **Trajna zaštita:** `scripts/check-workflows-yaml.mjs` (+ `check-workflows-yaml.test.mjs`, 3 testa) traži
  neukotvljenu dvotočku i tab u uvlačenju u `.github/workflows/**`, s izuzetkom sadržaja blok skalarа;
  provjera je u CI-u i u `CONTRIBUTING.md`. Guard na staroj liniji prijavljuje
  `.github/workflows/ci.yml:73 neukotvljena vrijednost sadrži dvotočku`.
- **Lekcija za dalje (NISKO, proces):** val 1 je imao testove logike i statičke provjere, ali nijedan test
  nije prolazio kroz **DTO validaciju** — jedini sloj koji je ovdje pao. Zato je dogovor za sljedeće valove:
  svaki novi zahtjev prema postojećem endpointu dobija bar jedan test/e2e scenario protiv stvarnog servera ili
  provjeru granica u CI-u.

### 2b.1 Treća prijava sa staginga (2026-10-03): ID umjesto naziva u tabovima „Uska grla“ i „CSAT“

Korisnik je na stagingu otvorio nove tabove iz vala 1 i vidio **sirove ID-eve** umjesto naziva organizacionih
jedinica, servisa i grupa.

- **Uzrok (dva sloja, oba u val 1):**
  1. **Server nije slao nazive.** `GET /reports/bottlenecks` je za svaki razrez vraćao samo grupni ključ
     (`originUnitId` / `serviceId` / `priority`) — `BreakdownSqlRow` nije ni čitao `OrganizationalUnit` ni
     `Service` (`backend/src/modules/reports/bottleneck/sql-bottleneck-dashboard-store.ts`), a memorijski put je
     pravio redove bez naziva (`aggregate-bottleneck-dashboard.ts`). Isto za `GET /tickets/csat/summary`:
     `TicketCsatBucket` je imao samo `key` (`backend/src/modules/tickets/csat/csat.types.ts`).
  2. **Klijent nije imao šta drugo prikazati.** Nove funkcije razreza su red gradile kao `label: row.key`
     (`frontend/src/lib/reports/csat-view.ts`, `bottleneck-view.ts`), pa je ID završio u UI-u i u grafikama.
- **Fix — nazive razrješava server, jednom po vrsti razreza:**
  - novi `backend/src/modules/reports/load-report-lookups.ts` (`loadOrganizationalUnitNames`, `loadServiceNames`,
    `loadGroupNames`, `loadUserNames`): batch `findMany` + `unique()`; defanzivno — ako delegat ne postoji
    (memorijski klijenti u testovima), vraća praznu mapu, pa poziv nikad ne puca.
  - `build-reports-dashboard.ts` je svoje privatne loadere zamijenio ovim (jedno mjesto za batch šifarnike).
  - razrez uskih grla: `BottleneckBreakdownRow` sada nosi `{ key, label }`
    (`backend/src/modules/reports/reports.types.ts`); SQL put dodaje `LEFT JOIN "OrganizationalUnit" ou` /
    `LEFT JOIN "Service" sv` i čita `MAX(ou.name) AS "unitName"` / `MAX(sv.name) AS "serviceName"` (GROUPING
    SETS ne dozvoljava goli `ou.name` u `SELECT`-u), a `labelFor` ih mapira u labelu; memorijski put učitava
    mape prije agregacije (`reports.service.ts`) i prosljeđuje ih agregaciji.
  - razrez CSAT-a: `TicketCsatBucket` nosi `{ key, label }`, a `summarize-visible-ticket-csat.ts` puni mape
    preko postojećeg `loadTicketDisplayLabels` (OU entriji se mapiraju na `name`).
  - **Prioritet nema šifarnik** — njegova labela ostaje vrijednost enuma (`HIGH`, `MEDIUM`, …), a prevodi je
    klijent preko `ticketPriorityLabelKey` / `ticketText(t, …)`
    (`frontend/src/lib/reports/bottleneck-view.ts` — `bottleneckRowLabel`). Poznato: traži se ključ prevoda;
    ako ga nema, prikazuje se vrijednost enuma (bez praznog polja).
  - Ako zapis više ne postoji (obrisana jedinica/servis/grupa), red **zadržava ID** — dokumentovano ponašanje i
    u vodičima; istorijski naziv se ne čuva.
- **Zaštita da se ne ponovi:** postojeći `scripts/check-ticket-id-leaks.mjs` je proširen na `components/reports`,
  `lib/reports` i `reports-*.tsx`: zabranjuje `label:`/`title:`/`text:` postavljeno na `.key` i `{…key}` ispisan
  kao JSX tekst (atribut `key={…}` i template literal `${…}` su dozvoljeni; izuzetak je dokumentovani fallback).
  Guard je dobio izvoz čiste funkcije `findRawKeyLabelLines` + `scripts/check-ticket-id-leaks.test.mjs` (3 testa)
  i dva CI koraka.
- **Dokazi (isti dan, svi lokalno):**
  - backend `npx tsc --noEmit` → 0; `jest src/modules/reports src/modules/tickets` → **120 suita / 661 test**;
    novi `sql-bottleneck-dashboard-store.spec.ts` (2 testa, bez baze, preko lažnog `$queryRaw`) dokazuje JOIN i
    mapiranje naziva; `aggregate-bottleneck-dashboard.spec.ts`, `aggregate-ticket-csat.spec.ts` i
    `tickets.csat.spec.ts` dokazuju naziv uz ključ i fallback na ključ.
  - frontend `npx tsc -b` → 0; `npx vitest run` → **157 fajlova / 627 testova**; `npm run build` ✓;
    `node --test scripts/check-ticket-id-leaks.test.mjs` → 3/3; svi `check-*` guardovi prolaze.
  - **Sopstvena greška u istom zadatku:** prva verzija CSAT testa je očekivala dva reda u `byService` iako su oba
    tiketa na istom servisu, a prva verzija JSX zaštite je propuštala `${pack.key}` u template literalu
    (lookbehind je bio na pogrešnoj strani `\{`) — oboje ispravljeno prije commit-a; vidi tabelu ispod.

## 3. Šta ostaje otvoreno iz vala 1

| # | Nalaz | Zašto nije zatvoren | Procjena |
|---|---|---|---|
| 1 | **M15 B4** (`NISKO`) — opseg sažetka (`scope`) postoji u API-ju i kešu, ali ga klijent ne koristi | Popravka je UX odluka (odvojena ploča po opsegu ili mrtva površina u API-ju), pa traži izbor vlasnika; zabilježeno i u vodiču kao **poznato ograničenje** | ~0,5 RD |
| 2 | **M9 B3, drugi dio** — serije na tabu **Trendovi** i dalje koriste konstantu (`reportCsatScaleMax = 5`, `reportCsatSatisfiedMinRating = 4`), uključujući SQL izvor | Prag ulazi u SQL izvor i u keš trendova, pa promjena zahtijeva i reviziju keš ključa; prikaz i prag na **Pregledu** i **CSAT-u** su već vezani na postavku | ~1 RD |


## 4. Re-ocjena modula M15 i M9

| Modul | Prije | Poslije | Obrazloženje |
|---|---|---|---|
| **M15 — Nadzorna ploča** | F 8 / K 8 / S 8 | **F 9 / K 8 / S 9** | Funkcionalnost: usko grlo je konačno na ekranu, postavke stvarno djeluju, liste su tačne (B1, B2, B5, B6), a RAW-ovi KPI-ji „tiketi po OU“ i „opterećenje admina“ imaju svoje grafike (gapovi 8 i 9). Kvalitet: ostaje B4 (mrtva površina opsega) i grafik koji se broji u pregledaču; zato ocjena ostaje 8. Sigurnost: nema više tihog zaobilaženja administratorske postavke, a prikaz uskih grla traži isto pravo kao i API. |
| **M9 — Odobrenja i CSAT** | F 6 / K 8 / S 8 | **F 8 / K 8 / S 8** | Funkcionalnost: RAW-ov zahtjev „CSAT po OU/servisu/grupi“ je ispunjen, a skala i prag dolaze iz konfiguracije; ostaje fiksna skala na serijama trendova (dokumentovano). |

Preostali otvoreni nalazi iz ovih modula: **M15 B4** (`NISKO`), **M9 B1/B2** i dio **M9 B3** — svi su
navedeni u §3 ili u redu prioriteta; nijedan nije KRITIČNO ni VISOKO, pa val 2 može početi neovisno.

## 5. Sljedeće

Val 2 — **sigurnost i vidljivost** (`# Zaključak Faze 2`, §4): serverska provjera šablona pri slanju
(M13 B1), zamjena ličnih podataka pri upisu članka (M14 B1), redakcija broadcasta (M12 B2), `DRAFT` samo
adminima (M6 B2), kapija odobrenja za `UNROUTED` (M9 B1)... redoslijed je u tabeli valova.

# Val 2 — sigurnost i vidljivost (2026-10-04)

Drugi val popravki iz zaključka Faze 2 (`# Zaključak Faze 2`, §4): deset nalaza koji su svi govorili isto —
**sistem je znao pravi podatak, ali ga nije provjeravao (šablon, lični podaci, nacrt usluge), nije ga
dostavljao (obavještenje o odobrenju, eskalacija) ili ga uopšte nije zapisivao (retention priloga, prvi
odgovor).** Sve popravke su u kodu, sa testovima i statičkim provjerama; ništa nije „pripremljeno“ bez
izvršnog puta.

## 1. Šta je popravljeno

| Nalaz | Popravka | Dokaz (kod) |
|---|---|---|
| **M13 B1** (`SREDNJE`) — deaktiviran ili „interni“ šablon može se poslati kao javni odgovor | Novi `assert-response-template-usable.ts` provjerava **postojanje, aktivnost i vrstu** šablona prije nego što se poruka upiše; `create-ticket-message.ts` mapira greške u `RESPONSE_TEMPLATE_NOT_FOUND` / `_INACTIVE` / `_KIND_MISMATCH`, a `usageCount` se povećava **samo** za upotrebljen šablon | `backend/src/modules/templates/assert-response-template-usable.ts` (nov), `tickets/create-ticket-message.ts`, `tickets/{tickets.error.ts,map-ticket-error.ts}`, `templates/{response-templates.service.ts,dto/templates.dto.ts,response-templates.controller.ts}`, `knowledge-base/portal/knowledge-portal.service.ts` |
| **M14 B1** (`SREDNJE`) — zaštita ličnih podataka postoji u pregledu, ne i pri upisu članka | `createFromReply` ponovo zamjenjuje lične podatke pri upisu članka i vraća `sanitized` / `replacements`; radnja ide u audit (`knowledge.article.reply_redacted`) | `backend/src/modules/knowledge-base/portal/knowledge-portal.service.ts` (+ `knowledge-portal.from-reply.spec.ts`), `frontend/src/components/knowledge-base/portal/article-from-reply-sheet.tsx`, `frontend/src/services/knowledge-portal-api.ts` |
| **M12 B2** (`SREDNJE`) — bulk broadcast ne prolazi redakciju | Novi `redact-bulk-broadcast.ts`: `rawBody` se skenira `scanTicketContent` poljem `chat_message`, crveni `redactSensitiveText`; pogoci se bilježe sistemskim događajem `ticket_redaction_warned:<patternId>` **po tiketu**, prije in-app i e-mail kanala | `backend/src/modules/tickets/bulk/redact-bulk-broadcast.ts` (nov), `bulk/apply-bulk-broadcast.ts`, `bulk/apply-bulk-broadcast.email.spec.ts` |
| **M6 B2** (`SREDNJE`) — `DRAFT` usluge i njihove forme vidljive svakom prijavljenom korisniku | Novi `service-visible-lifecycles.ts` (ADMIN/SUPER_ADMIN: sva stanja; AGENT: `ACTIVE|DEPRECATED`; korisnik: `ACTIVE`); `list-services` filtrira `lifecycle: { in: … }`, a `get-service` / `get-service-form(-version)` vraćaju `NOT_FOUND` za skriveno stanje; kontroleri su **fail-closed** (`roleKeys ?? []`) | `backend/src/modules/service-catalog/service-visible-lifecycles.ts` (nov, + spec), `list-services.ts`, `get-service.ts`, `get-service-form.ts`, `get-service-form-version.ts`, `service-catalog.service.ts`, `service-forms.service.ts`, `services.controller.ts`, `service-forms.controller.ts`, `create-in-memory-service-delegate.ts` |
| **M8 B1** (`SREDNJE`) — `private.ticket.attachments.retentionDays` se čita, ali se ne primjenjuje | Konfiguracija priloga **više ne nosi** rok (tip, default, parser, loader) — drugi rok ne postoji; brisanje pripada isključivo modulu privatnosti (`private.privacy.retention.attachmentsDays`, kategorija `attachments`); stara postavka ostaje registrovana, ali sa opisom „zastarjelo i bez dejstva“ (i18n bs/en) | `backend/src/modules/tickets/attachments/{attachments.types.ts,attachments.constants.ts,parse-ticket-attachment-configuration.ts,ticket-attachment-configuration.loader.ts}` (+ `attachments.constants.spec.ts`), `settings/definitions/ticket-attachment-settings.ts`, `frontend/src/i18n/locales/{bs,en}/common.json` |
| **M9 B1** (`SREDNJE`) — obavještenje o odobrenju ne može stići nikome | Novi `resolve-approval-notification-recipients.ts`: primaoci zahtjeva su nosioci `defaultApproverRole` **unutar OU/servis scope-a tiketa** (ista pravila kao `canDecideTicketApproval`), uz postojeće `APPROVER` učesnike; kad nijedan ne pokriva scope → grupa tiketa; odluka se vraća naručiocu | `backend/src/modules/notifications/fan-out/resolve-approval-notification-recipients.ts` (nov, + spec), `resolve-notification-recipients.ts`, `fan-out-in-app-notifications.ts`, `email/fan-out-email-notifications.ts`, `notifications-fan-out.service.ts` (`loadApprovals`), `tickets/tickets.module.ts` |
| **M9 B2** (`SREDNJE`) — tiket koji počne kao `UNROUTED` nikad ne prolazi odobrenje | Novi `ensure-ticket-approval-gate.ts` (idempotentno: servis traži odobrenje + nema nijednog zapisa odobrenja → `PENDING_APPROVAL` + zapis + `ticket_approval_requested`); zove se pri izlasku iz `UNROUTED` u `applyTicketForward`, i za pojedinačni i za bulk `assign_group` | `backend/src/modules/tickets/approvals/ensure-ticket-approval-gate.ts` (nov, + spec), `forwarding/forward-ticket.ts`, `forwarding/tickets-forwarding.service.ts`, `bulk/{bulk.types.ts,apply-bulk-assign.ts,tickets-bulk.service.ts}`, `create-tickets-governance-harness.ts` |
| **M10 B1** (`SREDNJE`) — eskalacija iz implicitnog pravila ne obavještava nikoga | Kad `SlaEscalationRule` ne postoji (ugrađeno pravilo `default`), primaoci su **zaduženi korisnik i članovi grupe tiketa** umjesto prazne liste | `backend/src/modules/notifications/fan-out/resolve-sla-notification-recipients.ts`, `resolve-sla-escalation-recipients.spec.ts` |
| **M10 B2** (`SREDNJE`) — satovi se ne uspostavljaju retroaktivno | Novi `backfill-missing-ticket-sla-states.ts`: svaki ciklus skenera uspostavi sat za **ograničen batch** (25) otvorenih tiketa bez stanja; sat počinje od `createdAt`, događaj je neutralni `scanned` (ne izmišlja prvi odgovor); `TicketSlaTimersService.scanDue` spaja due stanja i backfill | `backend/src/modules/sla/backfill-missing-ticket-sla-states.ts` (nov, + spec), `sla/ticket-sla-timers.service.ts`, `sla/sla.constants.ts` (`slaBackfillBatchSize = 25`) |
| **M10 B4** (`SREDNJE`) — `ticket.firstResponseAt` postoji samo ako SLA modul radi | `create-ticket-message.ts` upisuje `firstResponseAt` na **prvi `AGENT_REPLY`**, nezavisno od SLA-a (idempotentno; SLA nastavlja po svom putu) | `backend/src/modules/tickets/create-ticket-message.ts`, `tickets/tickets.messages.spec.ts` |

**Nove i izmijenjene stranice u vodiču:** `docs/user-guide/odobrenja-i-csat.md` (kome stiže obavještenje i
kada se otvara kapija), `user-guide/sla.md` (eskalacije bez pravila, retroaktivno uspostavljanje satova, prvi
odgovor bez SLA-a), `user-guide/tiketi.md` (retencija priloga), `user-guide/baza-znanja.md` (zamjena ličnih
podataka pri upisu članka), `user-guide/posta.md` (redakcija broadcasta), `user-guide/katalog-usluga-i-forme.md`
(vidljivost nacrta) i `DOCS_CHANGELOG.md`.

## 2. Dokazi (izvršeno u ovom okruženju)

- **Backend:** `npx tsc --noEmit` → **0** poslije svake popravke; `jest src/modules/notifications` → **27
  suita / 139 testova** (4 nova u `resolve-approval-notification-recipients.spec.ts`); `jest src/modules/tickets`
  → **96 suita / 541 test** (3 nova u `ensure-ticket-approval-gate.spec.ts`, 1 u `tickets.messages.spec.ts`);
  `jest src/modules/sla src/modules/tickets src/modules/notifications` → **148 suita / 750 testova**; ranije u
  istom valu: `jest src/modules/tickets/attachments` → 3 / 13 (2 nova u `attachments.constants.spec.ts`),
  `jest src/modules/tickets src/modules/privacy src/modules/settings` → 126 / 667, `jest src/modules/bulk` → 3 / 7,
  `jest src/modules/service-catalog` → 20 / 78 (s bulk 24 / 88), `jest src/modules/templates` → 20,
  `jest src/modules/knowledge-base` → 40.
- **Frontend:** `npx vitest run` → **157 fajlova / 627 testova, 0 padova**; `npx tsc -b` → 0.
- **Statičke provjere:** svi `scripts/check-*.mjs` prolaze, uključujući `check-workflows-yaml`, `check-docs-content`
  (poslije regeneracije ogledala) i `check-ticket-id-leaks`.
- **Sopstvene greške u istom valu (zapisane da se ne ponove):** prva verzija `M10 B2` testa je očekivala
  `Date` u polju gdje odgovor servisa nosi `string`; prva verzija `M9 B2` testa je koristila
  `memory.ticketApprovals` (mapa nije izložena iz `create-in-memory-tickets-prisma`) i nepostojeći
  `seedGroupMembershipForGate`; prva verzija `M10 B4` testa je čitala `reply.ticket` (response nema to polje).
  Sve tri su ispravljene prije commit-a.

## 3. Šta ostaje otvoreno iz vala 2

| # | Stavka | Zašto nije zatvorena | Procjena |
|---|---|---|---|
| 1 | **11 registriranih postavki bez ijedne reference van definicija** — `privateChangeLog*` (5), `private.addons.{sla,autoAssign,timeTracking,serviceDowntime}` (4), `privateIntegrationsTeamsAppShortName` / `…AppDescription` (2) | Nije greška u ponašanju, ali je mrtva površina u registru postavki. **Ispravka (2026-10-05):** ranije je ovdje pisalo 18 i u tom broju su bila i sedam postavki `public.maintenance.*`; njih **čita frontend** (`frontend/src/lib/maintenance/parse-public-maintenance.ts`, banner i oznaka servisa u izboru servisa), pa su žive i ostaju. Prva provjera je gledala samo backend. Ostalih 11 je uklonjeno odlukom vlasnika (`# Popravke poslije vala 4`, §4) | ~0,5 RD (izvršeno) |

---

# Val 3 — pouzdanost i performanse (2026-10-04 – 2026-10-05)

Treći val popravki iz zaključka Faze 2 (`# Zaključak Faze 2`, §4). Nalazi su dijelili isti obrazac: **stanje je
držano tamo gdje ne preživi restart i gdje ga druga instanca ne vidi (memorija procesa), a skup podataka se
čitao cijeli i provjeravao red po red.** Zato val 3 nije dodavao funkcije nego ih je premještao u dijeljeno
stanje (Redis, baza) i prebacivao filtre u upite.

## 1. Šta je popravljeno

| Nalaz | Popravka | Dokaz (kod) |
|---|---|---|
| **M11 B1** (`SREDNJE`) — članstvo u sobama i „admin“ rola su snimak iz trenutka spajanja | Nova `socket-room-revalidation.ts`: aktivna veza sama provjerava svoje **grupne i admin sobe** (default svakih 5 min), napušta one za koje više ne ispunjava uslov i ulazi u nove; sobe pojedinačnih tiketa se ne diraju jer ih `ticket:join` već provjerava pri ulasku | `backend/src/modules/websocket/socket-room-revalidation.ts` (nov, + spec), `websocket.gateway.ts` |
| **M11 B2** (`SREDNJE`) — `ticket:join` nema ograničenje frekvencije | Novi `join-leave-rate-limiter.ts`: `ticket:join`/`ticket:leave` dijele prozor sa „kucanjem“ (**30 poruka/min po vezi**); odbijanja se broje u `socket.data` i ispisuju u dnevniku | `backend/src/modules/websocket/join-leave-rate-limiter.ts` (nov, + spec), `ticket-chat.gateway.ts` |
| **Redis auth greška** (preventivno, iz incidenta 2026-10-04) — pretplata je mogla završiti neuhvaćenom greškom autentikacije i oboriti proces | `subscribeRedisChannel` hvata i loguje grešku pretplate, `duplicate()` klijent ima `error` listener; kanal se ne ruši tiho | `backend/src/common/redis/subscribe-redis-channel.ts` (+ spec), `edge-event-realtime.subscriber.ts`, `ticket-realtime-bridge.subscriber.ts` |
| **M8 B2** (`SREDNJE`) — rate limiter broadcasta je u memoriji procesa i bez evikcije | Novi `bulk-broadcast-rate-limiter.ts`: Redis bucket po korisniku i minuti (`INCR` + `PEXPIRE`), memorijski klizni prozor kao rezerva uz sweep; `BulkBroadcastRateLimiterBootstrap` veže dijeljeni klijent pri bootu | `backend/src/modules/tickets/bulk/bulk-broadcast-rate-limiter.ts` (nov, + spec + `.bootstrap.ts`), `bulk/apply-bulk-broadcast.ts`, `tickets/tickets.module.ts` |
| **M12 B1** (`SREDNJE`) — zaglavljen zahtjev za isporuku trajno gubi e-mail, bez alarma | `claimNotificationEmailDelivery` prvo **preuzima** zapis koji je u `CLAIMED` duže od 10 min (atomarno, `updateMany`), pa upisuje novi; `countStuckNotificationEmailDeliveries` hrani novi `components.email.stuckClaims`, a pločica **Operativno zdravlje** prelazi u `warning` i prikazuje broj | `backend/src/modules/notifications/email/persist-notification-email-delivery.ts` (+ spec), `email/deliver-notification-email.spec.ts`, `ops-health/ops-health.service.ts`, `frontend/src/services/ops-health-api.ts`, `frontend/src/components/admin/ops-health-card.tsx`, `frontend/src/i18n/locales/{bs,en}/common.json` |
| **M12 B3** (`NISKO`) — nova SMTP veza za svaki e-mail | `SmtpMailTransport` drži **pool po konfiguraciji** (`pool: true`); ključ je `host:port:tls:korisnik:sha256(lozinka)`, pa rotacija lozinke gradi novi transporter; keš je ograničen na 4 konfiguracije (LRU), neiskorišten pool se zatvara poslije 10 min, `onModuleDestroy` zatvara sve | `backend/src/modules/notifications/email/smtp-mail-transport.ts` (+ spec) |
| **M12 B4** (`NISKO`) — ograničenje testnog slanja postoji samo u memoriji instance | Novi `test-email-rate-limiter.ts`: Redis ključ `test-email-rate:<admin>:<bucket>` (`INCR` + `PEXPIRE`) dijeli limit „5 u 10 minuta“ na sve instance; ako Redis odbije komandu, isti limit se drži u memorijskom prozoru | `backend/src/modules/notifications/email-templates/test-email-rate-limiter.ts` (nov, + spec), `email-templates.service.ts` |
| **M12 B5** (`NISKO`) — oznake polja u broadcast tekstu su hardkodirane na engleskom | Oznake su lokalizovane (`bs`/`en`); zapis u tiketu se piše na jeziku pošiljaoca, a e-mail kanal dobija redigovane `parts` i renderuje ih **po jeziku primaoca**; polja se rediguju pojedinačno, pa su tiket i e-mail isti | `backend/src/modules/tickets/bulk/format-bulk-broadcast-message.ts`, `redact-bulk-broadcast.ts`, `broadcast-email-channel.ts`, `apply-bulk-broadcast.ts`, `backend/src/modules/notifications/email/send-broadcast-emails.ts` (+ specovi) |
| **M13 B2** (`NISKO`) — picker i lista playbooka čitaju fiksni broj redova bez redoslijeda | Novi `picker-candidate-where.ts` prevodi opseg u `where` (globalni + servis/kategorija/grupa; `pickerOffScopeWhere` za „prikaži sve“); picker upit dobija `orderBy [{usageCount desc}, {name asc}]` i `take: pickerLimit` (200); lista playbooka već je bila uređena po nazivu | `backend/src/modules/templates/picker-candidate-where.ts` (nov, + spec), `templates/response-templates.service.ts` |
| **M14 B5** (`NISKO`) — liste i presretanje ne ograničavaju upit, a vidljivost provjeravaju po članku | `loadKnowledgeArticleVisibilities` rješava vidljivost cijele stranice u grupisanim upitima (OU put iz keširanog kataloga, usluge i članovi grupa po jedan upit); tekstualni filter liste je dio upita; presretanje uzima **500 najsvježijih** objavljenih članaka usluge (`interceptCandidateLimit`) | `backend/src/modules/knowledge-base/load-knowledge-article-scope.ts`, `list-knowledge-articles.ts`, `intercept-knowledge-articles.ts`, `fetch-knowledge-articles-for-list.ts`, `knowledge-base.constants.ts` (+ `knowledge-base.visibility-batch.spec.ts`), `tickets/create-in-memory-group-member-delegate.ts` |

**Dokumentacija:** `docs/user-guide/posta.md` (B1/B3/B4/B5), `realtime-i-obavjestenja.md` (B1/B2),
`tiketi.md` (B2), `sabloni-i-playbooks.md` (B2 i uklonjena zastarjela tvrdnja iz vala 2 o B1),
`baza-znanja.md` (B5), `sta-je-novo.md` (nove izmjene + naknadno upisan **val 2**, koji je tamo nedostajao),
`DOCS_CHANGELOG.md` i ogledalo `backend/content/docs/**` (regenerisano).

## 2. Dokazi (izvršeno u ovom okruženju)

- **Backend:** `npx tsc --noEmit` → **0** poslije svake grupe popravki; `jest src/modules/websocket` → 15 suita
  / 65 testova; `jest src/common/redis src/modules/integration-queue` → 13 / 37; `jest src/modules/tickets`
  → 128 / 704 (uključuje bulk i broadcast testove); `jest src/modules/notifications` → 31 / 155;
  `jest src/modules/knowledge-base` → 12 / 42; `jest src/modules/templates` → 3 / 24; `jest src/modules/ops-health`
  → 6 prošlo + 1 skip / 51.
- **Puna backend provjera poslije zadnjeg commita:** `npx tsc --noEmit` → **0**; `jest --runInBand` →
  **514 prošla + 5 preskočenih suita (519)**, **2438 prošlo / 2469 testova** (31 preskočen).
- **Frontend:** `tsc -b` → **0**; `vitest run` → **157 fajlova / 627 testova, 0 padova**; svi
  `scripts/check-*.mjs` prolaze (10 skripti, uključujući `check-docs-content`, `check-pulse-design-system` i
  `check-ticket-id-leaks`).
- **Statička provjera dokumentacije:** `node scripts/check-docs-content.mjs` → OK (29 stranica, 7 provjera) —
  poslije zasebnog commita `docs(val 3): manifest…` (vidi sljedeću tačku).
- **Ogledalo se mora regenerisati POSLIJE commita stranica:** generator izvodi `updatedAt` iz
  `git log -1 --format=%cs` izvorne stranice, pa je prvi commit vala 3 nosio datume iz trenutka prije commita
  (isti propust ostavio je zastarjele datume još iz vala 2 — `check-docs-content` je to uhvatio na
  re-verifikaciji commitovanog stanja, 2026-10-05). Popravka: regeneracija + zaseban commit manifesta; od
  tada provjera prolazi iz čistog kloniranog stanja.
- **Sopstvene greške u istom valu (zapisane da se ne ponove):** prva verzija `M12 B3` keša nije zatvarala stari
  transporter pri promjeni postavki (pool je ostajao otvoren) — dodan TTL neiskorištenog poola; prvi
  `M11 B2` spec je koristio lažni socket bez `data` objekta; prva verzija `M13 B2` upita koristila je
  `AND` kao niz, što Prisma tip odbija (`ResponseTemplateWhereInput[]`) — razdvojen je `baseAnd` niz.
- **Frontend `tsc -b` nije bio pokrenut uz M12 B1:** pločica je prosljeđivala `count: number | null | undefined`
  u `t()` (i18next traži `number | undefined`). Ispravljeno u istom valu (`count: … ?? 0`); puna frontend
  provjera (`tsc -b` + `vitest` 157/627 + svi `check-*.mjs`) pokrenuta poslije toga — lekcija: uz svaku
  frontend izmjenu odmah `tsc -b`, ne samo vitest.

## 3. Šta ostaje otvoreno poslije vala 3

- ~~**M10 B5** (`NISKO`) — uzorak dnevnika skenera prijavljuje netačno „preostalo“~~ ✅ **zatvoreno 2026-10-05**
  (vidi `# Popravke poslije vala 4`, §2).
- ~~**M15 B4** (`NISKO`) — opseg sažetka postoji u API-ju, ali ga klijent ne koristi~~ ✅ **zatvoreno 2026-10-05**
  (vidi `# Popravke poslije vala 4`, §4).
- ~~**M9 B3 — drugi dio** (`NISKO`) — CSAT serije na tabu Trendovi i dalje koriste konstantnu skalu~~ ✅
  **zatvoreno 2026-10-05** (vidi `# Popravke poslije vala 4`, §3).
- **M12 B1 ostaje bez migracije:** preuzimanje koristi postojeći `updatedAt`; ako se u međuvremenu doda
  `claimedAt`, filter treba prebaciti na njega.
- **18 registriranih postavki bez potrošača** i **EN sadržaj vodiča** — čekaju odluku vlasnika (bez promjene).

# Popravke prije vala 4 — CI i prikaz datuma u dokumentaciji (2026-10-05)

Dvije popravke između vala 3 i vala 4. Prva je otklonila crveni CI (od vala 3 nijedna izmjena nije bila
provjerena), druga neispravan datum u zaglavlju stranice dokumentacije.

## 1. Popravljeno

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **CI-1** — GitHub odbija cijeli `.github/workflows/ci.yml` | Run je završavao **bez ijednog joba** („This run likely failed because of a workflow file issue“) | `.github/workflows/ci.yml:76` — korak „Check docs content and mirror sync“ imao je **dva `run:` ključa** (drugi je trebao biti novi korak); duplikat ključa u istom bloku je neispravan YAML | Nijedna izmjena nije prolazila CI; lokalne provjere nisu mogle zamijeniti e2e | Test je vlastiti korak „Test the docs-content guard itself“; `check-workflows-yaml.mjs` sada hvata **ponovljeni ključ u istom bloku** (+ test koji reprodukuje tačno ovaj propust) | **VISOKO** |
| **CI-2** — `[sinhronizacija] manifest.json se razlikuje — pokrenite generator` | Korak dokumentacije padao je i na `master` (`95e98d2e`, `08d07231`) iako je ogledalo bilo tačno | `scripts/generate-docs-content.mjs:118` (`gitUpdatedAt`) — `actions/checkout` po zadanom radi **plitak** klon (`fetch-depth: 1`), a `git log -1 -- <fajl>` tada vraća datum **vršnog** commita za svaki fajl, pa CI izračuna druge datume od commitovanih | Crven CI od vala 3; „dokazi“ iz vala 3 nisu bili provjereni u CI-ju | `frontend` job radi **pun checkout** (`fetch-depth: 0`); `isShallowRepository()` + `sameManifestIgnoringDates()` — u plitkom klonu se datumi ne porede, uz napomenu u izlazu; **manifest je imao i 8 zastarjelih datuma** (2026-10-02) jer je posljednji put generisan iz plitkog klona → sada stvarni 2026-10-04; **dopunjeno 2026-10-06 (CI-3):** datumi više nisu dio kapije ni u punom klonu | **VISOKO** |
| **D-1** — „Ažurirano: 2026 M10 4“ u zaglavlju stranice dokumentacije | Datum iz manifesta (`YYYY-MM-DD`) prikazan je kroz `Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" })` | `frontend/src/pages/docs-page.tsx:47–50` (prije popravke); u runtimeu bez bosanskih CLDR podataka `medium` se renderuje kao `2026 M10 4` — ista pojava koju `announcement-view.ts:117` i `asset-view.ts:209` već opisuju i zaobilaze | Korisnik u zaglavlju dokumentacije vidi neispravan datum; `new Date("2026-10-04")` je uz to UTC ponoć, pa zapadno od UTC prikaže prethodni dan | Novi `frontend/src/lib/docs/format-docs-date.ts`: datum se čita iz samog stringa, ime mjeseca iz prijevoda `changes.calendar.months.m<indeks>` (isti mehanizam kao `report-trends-view.ts:153–160`); novi ključ `docs.updatedAtValue` (**bs** `{{day}}. {{month}} {{year}}.` / **en** `{{month}} {{day}}, {{year}}`); 4 testa u `format-docs-date.spec.ts` | **SREDNJE** |

## 2. Dokazi (izvršeno u ovom okruženju)

- **CI na `master`, commit `c052cec`:** `gh run list` → **success**; sva tri joba prošla — *Backend build + test*,
  *Frontend build + test* (korak „Check docs content and mirror sync“ zelen), *E2E critical flows*.
- **Dokaz kvara CI-2:** stari skripti u plitkom klonu (`git clone --depth 1` bez izmjena) padaju sa
  `Docs provjera: 1 problem(a): [sinhronizacija] manifest.json se razlikuje — pokrenite generator`; poslije
  popravke isti klon prolazi uz napomenu `plitki klon: updatedAt u manifestu se ne provjerava`.
- **Dokaz kvara CI-1:** novi guard na starom `ci.yml` vraća
  `.github/workflows/ci.yml:76 ponovljeni ključ "run" u istom bloku — GitHub odbija cijeli workflow`; na
  popravljenom fajlu je čist. `npx js-yaml .github/workflows/ci.yml` → validan YAML.
- **Dokaz D-1:** `npx vitest run src/lib/docs/format-docs-date.spec.ts` → **4/4**
  (`2026-10-04` → `4. oktobar 2026.`, `October 4, 2026` za `en`, `2026-02-30` → `null`); `tsc -b` → **0**;
  `vitest run` → **158 fajlova / 632 testa**, 0 padova; `check-pulse-design-system.mjs` → i18n parnost
  `bs`/`en` OK (3926 statičkih ključeva), `check-workflows-yaml.mjs` OK, `check-docs-content.mjs` OK
  (29 stranica, 9 provjera).

## 3. Napomene o dostupnosti u vodičima (D-2, provjera tačnosti)

Dvije korisničke stranice nosile su napomenu s tehničkim oznakama; provjereno je **da su datumi tačni**, pa su
napomene prepisane u korisnički jezik (bez hasheva, koji čitaocu vodiča ništa ne znače).

| Stranica | Prije | Poslije | Dokaz iz istorije koda |
|---|---|---|---|
| `docs/user-guide/status-incidenti-i-planirani-prekidi.md:13` | „Paket 2.7 · važi od verzije s modulom `status-page` (commit 1cb86d6 i dalje)“ | „Paket 2.7 · dostupno u verzijama od 28.09.2026.“ | `415925fb` (API) i `2aa25f15` (UI) — oba **28.09.2026**; `1cb86d6` je popravka kojom `/status` rute za čitanje postaju dostupne prijavljenim korisnicima (`RoleGuard` ih je prije odbijao) |
| `docs/user-guide/prosljedjivanje-tiketa.md:13` | „Paket 1.1 · važi od verzije sa migracijom `20260926090000_ticket_forward_event“ | „Paket 1.1 · dostupno u verzijama od 26.09.2026.“ | `9667689d` (**25.09.2026**) uvodi funkcionalnost; migracija `20260926090000_ticket_forward_event` (**26.09.2026**) |

Ponašanje aplikacije se ne mijenja; obje stranice su dobile i red u „Šta je novo“ (korisnik osjeti izmjenu
teksta), a ogledalo je regenerisano poslije commita stranica.

## 3. Ista klasa greške ostaje otvorena (nije dirano bez odluke)

| Mjesto | Linija | Zašto je isto | Predloženi fix |
|---|---|---|---|
| SLA — prikaz radnog vremena | `frontend/src/lib/sla/format-sla-week-hours.ts:34` (`dateStyle: "medium"`) | Ime mjeseca iz `Intl` bez rezerve za `bs` → `M10` u runtimeu bez CLDR podataka | Isti obrazac kao `asset-view.ts:209`: eksplicitna polja (`day/month/year: "2-digit"/"numeric"`) ili ime mjeseca iz prijevoda |
| Kalendar dežurstava | `frontend/src/components/on-call/on-call-calendar.tsx:19,21` (`weekday: "short"/"long"`, `month: "long"`) | Isto, ali za nazive dana i mjeseca | Isto: ručna imena iz prijevoda ili numerička polja |

---

# Val 4 — e2e pokrivenost portala baze znanja i „Operativnog zdravlja“ (2026-10-05)

Četvrti val: praznine u e2e sloju (portal baze znanja, pločica „Operativno zdravlje“) i prateći nalaz D-3
(datumi kroz `Intl`). Uz same specove otkrivene su i **dvije greške u e2e harnessu** koje bi oborile globalnu
pripremu prije prvog testa, i **dokaz da e2e job u CI-ju ne izvršava nijedan spec**.

## 1. D-3 — Intl bez bosanskih CLDR podataka (zatvoren u ovom valu)

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-3a** — radno vrijeme SLA ispisuje „M10“ umjesto naziva mjeseca | Prikaz sedmice radnog vremena na detaljima SLA politike | `frontend/src/lib/sla/format-sla-week-hours.ts:34` — `Intl.DateTimeFormat(…, { dateStyle: "medium" })` bez rezerve za `bs` | U runtimeu bez bosanskih CLDR podataka korisnik vidi `2026 M10 4` | `formatSlaHolidayDate(value, t)` — dan/broj iz stringa, ime mjeseca iz prijevoda; 10 testova u `format-sla-week-hours.spec.ts` | **SREDNJE** |
| **D-3b** — kalendar dežurstava ispisuje engleske kratice dana | Kolone sedmice i naslovi dana u kalendaru | `frontend/src/components/on-call/on-call-calendar.tsx:19,21` — `weekday: "short"/"long"`, `month: "long"` | Dan i mjesec se prikazuju na engleskom („Mon“) i pored `bs` prijevoda | Novi `frontend/src/lib/on-call/on-call-view.ts`: `onCallWeekdayIndex`, `formatOnCallWeekday`, `formatOnCallDayLabel`, `formatOnCallTime`; 12 poziva u `on-call-page.tsx` sada prosljeđuje `t` (ne `i18n.language`); novi ključevi `ui.dateValue` i `onCall.timeWithWeekday` (**bs**/**en**) | **SREDNJE** |

Dokazi: `npx tsc -b` → **0**; `npx vitest run` → **158 fajlova / 645 testova**, 0 padova; svi
`scripts/check-*.mjs` (uključujući i18n parnost) → exit 0. Commit `202e5499`
(`fix(datumi): nazivi dana i mjeseci iz prijevoda, bez Intl-a (val 4, prateći nalaz)`), grana
`arena/01a0feaa-help-desk-enterprise`. Time je tabela „Ista klasa greške ostaje otvorena“ iz prethodne
sekcije zatvorena u oba reda; `frontend/src/lib/docs/format-docs-date.ts` (unesen prije vala 4) i
`frontend/src/lib/format-civil-date.ts` (nov) dijele isti mehanizam, a `fakeDateTranslator` iz
`format-civil-date.spec.ts` koriste i novi specovi.

## 2. Novi e2e specovi

| Spec | Testovi | Šta pokriva |
|---|---|---|
| `e2e/tests/34-knowledge-portal.spec.ts` (nov) | „a user sees a published article, opens it and rates it“; „a draft stays out of the portal and a plain user cannot create articles“ | Prvi e2e za portal baze znanja: admin kroz API objavljuje članak u kategoriji (kreiranje → `submit-review` → `approve-review` → `publish`), korisnik ga vidi u portalu, otvori karticu kategorije, otvori članak, pregled se prihvati (204) i ocjena od 5 zvjezdica se upiše; nacrt se ne pojavljuje u portalu, a korisnik dobija 403 na kreiranje članka |
| `e2e/tests/35-ops-health.spec.ts` (nov) | „the admin sees live component health and can refresh it“; „a plain user has no access to operations health“ | Pločica „Operativno zdravlje“: `/ops/health` vraća `api`/`database`/`redis` = `ok`, kartica prikazuje zaglavlje „Komponente“ i pločice API / Baza podataka / Redis, dugme „Osvježi“ ne obara karticu; korisnik dobija 403 na `/ops/health` i `/ops/alerts` i ne vidi karticu na `/admin?tab=ops` |

**Ispravka polazne pretpostavke:** pločica nije bila potpuno bez e2e — `e2e/tests/21-status-monitoring.spec.ts:65`
već provjerava da je kartica vidljiva i da testni alarm ima `inApp` kanal. Novi spec 35 zato pokriva **sadržaj**
kartice (pločice komponenti, osvježavanje) i **negativan pristup**, a ne samo vidljivost.

## 3. Greške u e2e harnessu (otkrivene pri pokretanju, popravljene)

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **H-1** — globalna priprema pada kad test-korisnici još ne postoje | `provisionTestActors` pukne sa `USER_NOT_FOUND` na `POST /users/:id/reset-password` | `e2e/helpers/provision-test-actors.ts:117` (prije popravke) čitao je `created.id`, a `POST /users` vraća `{ user, temporaryPassword, temporaryPasswordDelivery }` (`backend/src/modules/users/users.types.ts:65–69`) → `undefined` ide u `reset-password` | Prvi e2e run na svježem stacku pada **prije ijednog speca**; na postojećem stacku se ne primijeti jer se koristi grana za postojeće korisnike | `created.user.id` (+ napomena o obliku odgovora); `e2e/helpers/provision-test-actors.ts:117–128` | **VISOKO** |
| **H-2** — zadane lozinke test-korisnika ne prolaze politiku lozinki | `ChangeMeE2eUser1!` / `ChangeMeE2eAgent1!` | `e2e/helpers/environment.ts:24,26` (prije) — lozinka sadrži dio e-maila (`user`, `agent`), a `password-policy.ts:80–82` odbija to kao `CONTAINS_EMAIL_NAME`; provjeru primjenjuje `POST /auth/change-password` (`backend/src/modules/authentication/security/password-change.service.ts:26`) | Harness ne može postaviti lozinku test-korisnika → globalna priprema pada i lokalno (dokumentovani `.env.example` scenarij) | Nove zadane lozinke `Kamen-Opseg-2026-U1!` / `…-A1!` (`e2e/helpers/environment.ts:35,37`, `e2e/.env.example:7,9`) + komentar zašto politika to zahtijeva; lozinka superadmina ostaje nepromijenjena jer je postavlja čarobnjak za instalaciju (provjerava samo dužinu, `backend/src/modules/install/validate-install-super-admin-credentials.ts:22–27`) | **VISOKO** |
| **H-3** — e2e projekat se nije tipizirao | `npx tsc --noEmit -p e2e/tsconfig.json` → `error TS7016: Could not find a declaration file for module 'pg'` | `e2e/package.json` nije imao `@types/pg`, a `e2e/helpers/reset-super-admin-mfa.ts:19` uvozi `pg` | Tipovi u specovima nikad nisu provjeravani; greška u specu se vidjela tek u izvršavanju | Dodan `@types/pg` u `e2e/devDependencies` i korak **Typecheck E2E specs and helpers** u CI (`.github/workflows/ci.yml:109`) → `tsc` exit 0 | **NISKO** |

## 4. Dokaz da e2e job u CI-ju ne izvršava nijedan spec (E-1, otvoreno za odluku)

| Nalaz | Dokaz | Posljedica |
|---|---|---|
| **E-1** — „E2E critical flows“ je zelen iako nijedan od 33 speca (sada 35) nije pokrenut | Run `37277534681`, job „E2E critical flows“, korak „Run E2E“: početak **07:26:23Z**, kraj **07:26:23Z** = **0 sekundi**; u koraku stoji `E2E_API_URL not configured — skipping live E2E…` i `exit 0` (`.github/workflows/ci.yml:125–129`) | Zelena kvačica ne dokazuje ništa o specovima; e2e se izvršava samo ako je repozitorijska varijabla `E2E_API_URL` postavljena |

Popravljeno u ovom valu **koliko se smije bez odluke vlasnika**: skip je sada vidljiv u logu
(`::notice title=E2E did not run::…`, `.github/workflows/ci.yml:126`), a projekat se prije toga tipizira.
Postavljanje varijable `E2E_API_URL` (i secreta `E2E_*`, `E2E_DATABASE_URL`, `E2E_INSTALL_TOKEN`) ostaje
odluka vlasnika — token ovog okruženja ne vidi repozitorijske varijable ni secrete (`gh api` → 403), pa se
ne može provjeriti da li su negdje postavljeni.

## 5. Dokazi (izvršeno u ovom okruženju 2026-10-05)

- **Registracija specova:** `npx playwright test --list` → **68 testova u 35 fajlova** (prije: 64 u 33);
  `npx tsc --noEmit -p e2e/tsconfig.json` → exit **0**.
- **Lokalni stack (bez Dockera):** Postgres 18.4 (embedded, port 55432), Redis 7.2.5 (6379), backend
  `dist/src/main.js` (10001), Vite (5173); 42 migracije / 136 tabela; `/health` → `{"status":"ok"}`.
- **Globalna priprema harnessa protiv živog stacka (poslije H-1 i H-2):** kompajliran `e2e/global-setup.ts`
  pokrenut iz `node` → **`GLOBAL SETUP: OK`** (instalacija prepoznata, MFA superadmina resetovan kroz bazu,
  `e2e.user` i `e2e.agent` provizionirani novim lozinkama kroz `POST /auth/change-password`). Prije popravki
  isti poziv je vraćao `GLOBAL SETUP FAILED: USER_NOT_FOUND …`.
- **Dokaz H-2 iz same politike:** `node -e "checkPassword(…)"` nad kompajliranim
  `backend/dist/src/modules/authentication/security/password-policy.js`:
  `ChangeMeE2eUser1!` → `["CONTAINS_EMAIL_NAME"]`, `Kamen-Opseg-2026-U1!` → `[]` (isto za agenta i superadmina);
  protiv žive API-ja `POST /auth/change-password` sa starom lozinkom → **400** `INVALID_PASSWORD`,
  `violations: ["CONTAINS_EMAIL_NAME"]`.
- **Izvršavanje API-dijela novih specova bez browsera:** privremeni spec s istim tokovima
  (`ApiClient` + `readE2EEnvironment`, bez `page`) → **2 prošla**; dokazi iz izlaza: kreiranje kategorije →
  članak → `submit-review`/`approve-review`/`publish` (201), portalu korisnika članak vidljiv,
  `POST /knowledge-base/portal/articles/:id/view` → **204**, ocjena 5 → red u listi
  `{"averageRating":5,"ratingCount":1}`; nacrt se ne pojavljuje u portalu; korisnik dobija **403** na
  `/ops/health`, `/ops/alerts` i na kreiranje članka; admin `GET /ops/health` → `api/database/redis = ok`.
  Privremeni spec je poslije provjere obrisan.
- **Ograničenje mjerenja:** Playwright browseri se u ovom okruženju **ne mogu instalirati**
  (`cdn.playwright.dev` → `ECONNRESET`, `@playwright/browser-chromium` pada u `postinstall`, sistemskog
  browsera nema), pa `page`-dio novih specova nije izvršen lokalno — on ide kroz CI kad `E2E_API_URL` postoji.
- **Nalaz o brojaču pregleda (nije greška, utiče na dizajn testa):** `POST …/view` vraća 204, ali
  `viewCount` se u bazi povećava tek kad worker isprazni Redis brojače (na 15 minuta,
  `backend/src/modules/knowledge-base/portal/knowledge-article-views.ts:10–16`); u lokalnom stacku bez
  workera `viewCount` ostaje 0. Zato spec 34 provjerava prihvatanje pregleda (204), a ocjenu (koja se piše
  odmah) provjerava kroz listu portala.

## 6. Unit sloj šablona i playbooka (dio 2, 2026-10-05)

Korisnik je poslije izvještaja o e2e dijelu odabrao **unit sloj** kao sljedeći prioritet. Tri servisa koja su
radila bez ijednog testa (`response-templates.service.ts` 615 linija, `playbooks/playbooks.service.ts` 335,
`ticket-playbooks/ticket-playbooks.service.ts` 403) sada imaju specove koji drže stvarno ponašanje — ne
snimke implementacije: provjeravaju se odluke (dozvole, opsezi, verzioniranje, dnevnik izmjena, sistemske
poruke), a ne privatne funkcije.

| Spec (nov) | Testova | Šta pokriva |
|---|---|---|
| `src/modules/templates/response-templates.service.spec.ts` | 26 | Kapije (isključen modul, `ticket.templates.use`, nepoznat akter, SUPER_ADMIN bez dodjele); picker (sastav opsega upita, rangiranje 3/2/1/0/−1 i dijeljeni prije ličnih kod istog ranga, odbacivanje van opsega bez `all`, `FORBIDDEN` za ne-staff vidljivost tiketa); `render` (provjera upotrebljivosti prije učitavanja, bs/en tijelo s rezervom, `TEMPLATE_NOT_FOUND`); pregled (dozvole, nepoznate varijable se prijavljuju, poznata bez vrijednosti se prazni i prijavljuje u `missing`); upravljanje (tuđi lični šablon „ne postoji“, lična lista filtrira po vlasniku, obavezan razlog za dijeljeni i `personal_template` za lični, zauzeto ime, nepostojeći opseg, zabrana pisanja van opsega, upis opsega i zapisa u dnevnik izmjena, zamjena cijelog opsega pri izmjeni uz before/after, soft delete, `ownership`/`variables`/`canEdit` u odgovoru) |
| `src/modules/templates/playbooks/playbooks.service.spec.ts` | 19 | `PLAYBOOKS_DISABLED`/`FORBIDDEN`; lista (filteri stanja/traženja/usluge, `activeTicketCount` iz `groupBy`, `canEdit` iz opsega, bez upita kad je lista prazna); `create` (razlog, nepostojeći opseg, reference — **samo dijeljeni** šabloni i postojeći članci, zauzeto ime, zabrana globalnog opsega servisno ograničenom adminu, redoslijed koraka i zapis u dnevnik); `update` (verzija raste **samo** kad se mijenja ono što pokrenuta lista kopira, zamjena opsega i brisanje uklonjenih koraka, provjera starog i novog opsega, before/after u dnevniku); `remove` (soft delete i zapis, zabrana van opsega) |
| `src/modules/templates/ticket-playbooks/ticket-playbooks.service.spec.ts` | 22 | `get` (isključen modul bez učitavanja tiketa, staff vidljivost i dozvola, zatvoren tiket je read-only bez ponuda, rangiranje ponuda servis → kategorija → ostalo, lista s označenim koracima, imenima i napretkom); `attach`/`detach` (delegiranje pomoćnom modulu, `writable: true`, read-only odbijanje, obavezan razlog, označavanje kao otkačenog + zapis + sistemska poruka + realtime, gubitak trke); `upgrade` (`UP_TO_DATE`, `NOT_APPLICABLE`, čuvanje završenih koraka čiji ključ preživi, nova verzija u zapisu, jednolinijski naziv u događaju); `setStep` (nepoznat korak, idempotencija bez upisa, označavanje/odznačavanje s pozicijom u događaju, objava završetka samo kad su svi koraci gotovi); `sanitize` |

**Ispravka poslije prvog CI prolaza (2026-10-05):** u dva nova speca ostala su **5 komentara
`// eslint-disable-next-line import/first`** (navika iz frontend konfiguracije). Backend `eslint.config.mjs`
ne registruje `import/first`, pa ESLint prijavljuje *„Definition for rule 'import/first' was not found“* kao
**grešku** i `npm run lint` pada — CI na masteru je zbog toga bio crven (`Backend build + test`, 5 failure
anotacija), a `npm test` i e2e job nisu se uopšte izvršili. Komentari su uklonjeni (postojeći backend specovi,
npr. `announcements/announcement-delivery.spec.ts:1–3`, drže isti raspored `jest.mock` prije importa bez
ikakvih direktiva); `npm run lint` → **0 grešaka / 14 postojećih upozorenja**.

Dokazi: `npx tsc --noEmit` → **0**; `npx jest src/modules/templates` → **6 suita / 91 test**; isti poziv uz
izuzimanje tri nova speca daje **3 suita / 24 testa** (toliko ih je bilo prije). Puna backend provjera
`npx jest --maxWorkers=2` → **517 prošla + 5 preskočenih suita (522)**, **2505 prošlo / 2536 testova** (31
preskočen; izmjereno 2026-10-05). Napomena za sljedeći rad: `jest --runInBand` u ovom okruženju (~3,9 GB) pada
na `OOM`; `--maxWorkers=2` obično prođe u ~38 s, ali kad sandbox uspori (jedan mjereni prolaz trajao je 20 min)
jedan nezavisan, vremenski osjetljiv suite (`src/modules/tickets/tickets.authorization.spec.ts`, 6 testova) može
prijaviti pad pod opterećenjem — ponovno pokretanje (`jest --onlyFailures`) prošlo je za 10,7 s, pa pad nije
posljedica ovog dijela rada. Isti obrazac ponovio se 2026-10-05 i na `src/app.module.spec.ts` (2 testa): Jest je
prijavio pad samog *worker* procesa (`ChildProcessWorker._onExit`), a `--onlyFailures` prolaz je zelen za 30,8 s —
kad se u ovom okruženju jedan suite prijavi kao pao uz stack `jest-worker`, prvo provjeriti da nije u pitanju
pad radnika, pa tek onda tražiti grešku u kodu.

## 7. Ostale ispravke u e2e projektu (nađene pišući spisak za CI)

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-4** — mrtve zavisnosti `bcrypt` i `@types/bcrypt` | Harness više ne piše heševe lozinki u bazu (radi kroz API), ali su obje zavisnosti ostale | `e2e/package.json` (prije popravke) — nijedan `.ts` fajl ih ne uvozi (`grep -rn bcrypt e2e --include=*.ts` → prazno) | Zavisnost od `bcrypt` je sugerisala put pisanja u bazu koji je odavno napušten i držala native zavisnost u `npm ci` | Uklonjene (`npm uninstall bcrypt @types/bcrypt`); `e2e/package-lock.json` −49 linija; `tsc --noEmit` → 0; `playwright test --list` → 68 testova u 35 fajlova | **NISKO** |
| **D-5** — e2e README opisivao je harness koji ne postoji | Tvrdio da `global-setup` „provisions local USER/AGENT via Prisma (`DATABASE_URL`) with bcrypt password hashes. No new production User-password API“ | `e2e/README.md` (prije popravke); stvarni kod: `helpers/provision-test-actors.ts` koristi `POST /users` → `POST /users/:id/reset-password` → `POST /auth/change-password`, a `DATABASE_URL` služi samo za brisanje MFA superadmina (`helpers/reset-super-admin-mfa.ts`) | Čitalac bi zaključio da su lozinke van dometa politike lozinki i da je baza obavezna za provizioniranje | README prepisan (jasan tok kroz API, uloga `DATABASE_URL`, uslovi za lozinke iz `password-policy.ts`); zastarjeli docstring u `helpers/disposable-account.ts` ispravljen | **NISKO** |

| **D-6** — `e2e/README.md` upućivao na nepostojeći `HANDOFF.md` | Sekcija **CI** završavala je s „See `HANDOFF.md`“ | `e2e/README.md:33` (prije popravke); u rootu nema tog fajla (`find . -name "HANDOFF*"` daje samo `.cursor/plans/**` i `docs/plans/HANDOFF-4.1-A9.md`) | Čitalac nije mogao naći ugovor o živom stacku | Referenca preusmjerena na `.cursor/plans/quality-e2e-critical-flows/HANDOFF.md` | **NISKO** |

Uz to je u `e2e/README.md` dodat **tačan spisak repozitorijskih varijabli i secreta** koje e2e job traži
(`E2E_API_URL`, `E2E_BASE_URL`; `E2E_SUPERADMIN_*`, `E2E_USER_*`, `E2E_AGENT_*`, `E2E_DATABASE_URL`,
`E2E_INSTALL_TOKEN`) sa koracima za postavljanje i upozorenjem da zelen job bez `E2E_API_URL` ništa ne
dokazuje — to je deliverable iz tačke 2 korisnikovog odgovora (spisak priprema agent, postavlja vlasnik).

## 8. Šta ostaje otvoreno poslije vala 4

- **E-1:** repozitorijske varijable i secreti za e2e (odluka i radnja vlasnika) — uputstvo je sada u
  `e2e/README.md`; do tada e2e job ostaje zelen bez izvršavanja.
- Ranije otvoreno poslije vala 4: ~~M10 B5~~ ✅, ~~M9 B3-2~~ ✅, ~~M15 B4~~ ✅, ~~mrtve postavke~~ ✅,
  ~~mrtve površine (M9 B4, M8 B3, M7 B2, `roleSource`)~~ ✅ (sve zatvoreno 2026-10-05 — `# Popravke poslije vala 4`,
  §2–§5); ostaje **EN sadržaj vodiča** (odluka: prevesti ključne stranice).

# Popravke poslije vala 4 — crveni lint u CI i dnevnik skenera SLA (2026-10-05)

Dvije popravke između vala 4 i onoga što slijedi. Prva je otklonila crveni CI na masteru (uzrok su bila **naša**
dva nova speca), druga zatvara nalaz **M10 B5** iz Faze 2.

## 1. CI na masteru pao je na `npm run lint` (naša dva speca)

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-7** — `Definition for rule 'import/first' was not found` | Backend job je pao na koraku `npm run lint` (5 failure anotacija), pa se `npm test` i e2e job **nisu izvršili** | `backend/src/modules/templates/response-templates.service.spec.ts:16,18,20` i `.../ticket-playbooks/ticket-playbooks.service.spec.ts:16,18` — 5 komentara `// eslint-disable-next-line import/first` | CI crven na masteru; lažno „zeleni“ e2e job ostao neizvršen, pa se prava e2e provjera (sa podešenim varijablama) opet odgodila | Komentari uklonjeni. Backend `eslint.config.mjs` **ne registruje** `import/first` (samo `js` + `typescript-eslint` recommended), pa ESLint nepoznatu direktivu prijavljuje kao grešku; raspored `jest.mock` prije importa je u backendu uobičajen i **bez** direktiva (npr. `announcements/announcement-delivery.spec.ts:1–3`) | **SREDNJE** (blokira CI) |

Dokaz: `npm run lint` → **0 grešaka / 14 postojećih upozorenja**; `npx tsc --noEmit` → 0; `npx jest src/modules/templates`
→ 6 suita / 91 test. Pouka za sljedeće specove: direktive za pravila koja backend konfiguracija ne poznaje (npr.
`import/first`, `import/order`) **ne** koristiti — u frontend konfiguraciji postoje, u backendu ne.

## 2. M10 B5 — uzorak dnevnika skenera prijavljuje stvarni zaostatak

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljenost |
|---|---|---|---|---|---|
| **M10 B5** | Log linija ciklusa tvrdila je da nema zaostatka | `backend/src/modules/sla/sla-scan.processor.ts:27–36` (prije popravke): `remaining: Math.max(0, processed - slaScanBatchSize)`, a `processed` ≤ 2000 | Nadzor i tumačenje ops alarma `slaScanLateMinutes` mogli su dati pogrešnu sliku o zaostatku | Novi `backend/src/modules/sla/count-due-ticket-sla-states.ts`: `count()` stanja koja su još due (`resolutionCompletedAt = null`, `nextDueAt <= now`) na indeksu `@@index([resolutionCompletedAt, nextDueAt])` (`sla.prisma:92`); `ticket-sla-timers.service.ts` dobija `countDue()`, a `sla-scan.processor.ts` poziva **poslije** ciklusa (tek tada je `nextDueAt` obrađenih stanja pomjeren) | **NISKO** |

Dokazi: `npx jest src/modules/sla` → **26 suita / 71 test** (novi `count-due-ticket-sla-states.spec.ts` — 3 testa;
`sla-scan.processor.spec.ts` sada traži `sla_scan_remaining=23`); `npx tsc --noEmit` → 0; `npm run lint` → 0 grešaka.
Imena polja u logu (`sla_scan_duration_ms`, `sla_scan_processed`, `sla_scan_batch_limit`, `sla_scan_remaining`) nisu
mijenjana, pa postojeći log pipeline i `PERFORMACE_PHASE_PLAN.md` ostaju tačni. Iz `docs/user-guide/sla.md` uklonjeno
je ograničenje koje je ovim prestalo da važi; unos u `DOCS_CHANGELOG.md` je označen `[interno]` jer korisnik ne vidi
promjenu (mijenja se samo sadržaj linije u logu radnika).

## 3. M9 B3 (drugi dio) — CSAT skala i prag i na serijama Trendova

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **M9 B3-2** | Pregled i tab CSAT poštuju `private.csat.scaleMax`, tab **Trendovi** ne | `backend/src/modules/reports/trends/report-trends.constants.ts:36–37` (konstante `reportCsatSatisfiedMinRating = 4`, `reportCsatScaleMax = 5`) korištene u `assemble-report-trends.ts:113–114`, `sql-report-trend-source.ts:110` i `in-memory-report-trend-source.ts:148` (prije popravke) | Na skali 10 trendovi su i dalje brojali „zadovoljan“ kao ≥ 4 i crtali skalu do 5 — ista postavka davala je dvije različite slike | `report-trends-configuration.loader.ts` čita `private.csat.scaleMax` (parser `parseCsatScaleMax`, izvezen iz `reports/parse-reports-configuration.ts:76`); `csatScaleMax` ulazi u `ReportTrendsConfiguration`, prag se izvodi kroz `satisfiedMinRating()` iz `tickets/csat/aggregate-ticket-csat.ts:68`; **oba izvora** dobijaju prag kroz `ReportTrendLoadInput.csatSatisfiedMinRating`; keš ključ dobija `csatScale` | **NISKO** |

Dokazi: `npx jest src/modules/reports` → **26 suita / 132 testa** (nov
`report-trends-configuration.loader.spec.ts` — 3 testa; `report-trends.spec.ts` — nov test sa skalom 10 traži
`settings { csatScaleMax: 10, csatSatisfiedMinRating: 8 }` i da ocjena 5 nije „zadovoljna“); `npx tsc --noEmit` → 0.
Iz vodiča su uklonjena oba zapisa o fiksnoj skali, a `odobrenja-i-csat.md` sada navodi i **Trendovi** među
mjestima gdje se CSAT vidi; `DOCS_CHANGELOG.md` ima unos, ogledalo regenerisano (`Docs provjera: OK (29 stranica, 9 provjera)`).

## 4. Postavke bez potrošača (11) i `scope` sažetka (M15 B4) — uklanjanje

Odluka vlasnika 2026-10-05: sve što registar nudi, a nijedan kod ne čita — **ukloniti**; `scope` sažetka —
**ukloniti iz API-ja i keša**.

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-8 (ispravka D-1 iz vala 2)** | Tvrdnja „18 postavki bez reference“ bila je preširoka | Prvobitna provjera `grep`-om po **backend/src**; potrošač održavanja je u frontend-u: `frontend/src/lib/maintenance/parse-public-maintenance.ts:1–10` (ključevi), `use-public-maintenance.ts:42`, `maintenance-banner.tsx`, `create-ticket-service-picker.tsx` | Sedam živih postavki bilo je predloženo za brisanje; da su obrisane, banner održavanja i oznaka servisa u izboru servisa prestali bi raditi | Provjera ponovljena u **cijelom** repou (backend, frontend, e2e, skripte) po literalima i konstantama; `public.maintenance.*` **zadržano**, a nalaz u §Val 2 ispravljen na 11 | **SREDNJE** (nalaz, ne kod) |
| **D-9** — 4 mrtva addon prekidača | `private.addons.{sla,autoAssign,timeTracking,serviceDowntime}` prikazivani u čarobnjaku i registru s opisom „uključuje/isključuje dodatak“; nijedan kod ih ne čita | `backend/src/modules/settings/addon-catalog.ts` (katalog), `definitions/addon-settings.ts` (definicije iz kataloga); funkcije se vode drugdje: `autoAssignStrategy` po servisu, `private.timeTracking.*`, `private.services.downtimeScheduling.*` | Prekidač obećava on/off koji se ne dešava | Uklonjeni iz kataloga (čarobnjak ih ne prikazuje jer listu dobija s API-ja), iz `setting-keys.ts`, iz `install-addon-copy.ts` i iz prijevoda; `resolve-install-addons-state.spec.ts` sada provjerava **katalog** umjesto ručnog spiska | **NISKO** |
| **D-10** — 5 mrtvih postavki dnevnika izmjena | `private.changeLog.*` u registru; dnevnik se upisuje bezuslovno, razlog se traži u kodu toka | `backend/src/modules/settings/definitions/change-log-settings.ts` (obrisan), `setting-keys.ts` | Prazna površina u registru | Definicije i ključevi uklonjeni; kategorija `private.changeLog` uklonjena jer ostaje bez ijedne postavke | **NISKO** |
| **D-11** — 2 mrtve Teams postavke | `private.integrations.teams.appShortName` / `…appDescription` | `definitions/teams-integration-settings.ts` (prije popravke); paket čita brending | Isto | Uklonjene definicije i polja iz `teamsDefaults` | **NISKO** |
| **M15 B4** | `GET /reports/dashboard/summary?scope=` (4 vrijednosti) i 4 keš ključa, a ploča uvijek traži `all` | `backend/src/modules/reports/dto/report-summary-query.dto.ts` (obrisan), `report-summary.controller.ts:45–54`, `report-summary.service.ts` (`loadDashboardSummary`), `summary/report-summary-cache.ts` (`dashboardSummaryCacheKey`), `summary/report-summary.types.ts` (`scope` u odgovoru) | Mrtva površina i 4× više keš unosa za jedan te isti odgovor | Uklonjeni: parametar i DTO, `summary/ticket-summary-scope-clause.ts` (obrisan), segment `scope` iz keš ključa, polje `scope` iz odgovora i njegova provjera u `parse-report-summary-cache.ts`; frontend `fetchDashboardSummary()` bez argumenta | **NISKO** |

Dokazi: `npx jest --maxWorkers=2` → **519 prošlih + 5 preskočenih suita (524)**, **2510 prošlo / 2541 test**,
0 padova; `npx tsc --noEmit` → 0; `npm run lint` → 0 grešaka / 14 postojećih upozorenja; frontend `tsc -b` → 0,
`vitest` → **158 fajlova / 643 testa**; `Docs provjera: OK (29 stranica, 9 provjera)`.

## 5. Mrtve površine iz must-have liste (M9 B4, M8 B3, M7 B2, `roleSource`) — 2026-10-05

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **M9 B4** | `private.ticket.approvals.allowRequesterManager` se čita, validira i prenosi u konfiguraciju, ali je nijedna logika ne koristi | `backend/src/modules/settings/definitions/ticket-approvals-settings.ts` (definicija), `tickets/approvals/parse-ticket-approvals-configuration.ts:26,34`, `approvals.types.ts:11`, `ticket-approvals-configuration.loader.ts` | Uključivanje ne mijenja ponašanje; admin očekuje AD menadžera kao odobravaoca | Uklonjena postavka, ključ, polje iz tipa/parsera/loadera i prijevodi; `parseTicketApprovalsConfiguration` više ne zahtijeva `allowRequesterManager` | **NISKO** |
| **M8 B3** | `private.ticket.savedViews.allowSharing` se validira, a izlaz je uvijek `allowSharing: false` (dijeljenje nije implementirano) | `settings/definitions/ticket-saved-views-settings.ts`, `tickets/saved-views/parse-ticket-saved-views-configuration.ts:15–29` | Isto: prekidač bez efekta | Uklonjena postavka, ključ, polje i prijevodi; parser vraća samo `enabled`, `maxPerUser`, `allowDefaultView` | **NISKO** |
| **M7 B2 (ranije B3 u §M7)** | `POST /tickets/routing-preview` je radio i bio testiran, ali ga nijedan ekran nije zvao | `backend/src/modules/tickets/routing-preview/preview-ticket-routing.ts`, `tickets.controller.ts:62–72`; u `frontend/src` nula poziva | Korisnik prije slanja nije vidio da će tiket pasti u neusmjereni red | **Implementirano**: novi `frontend/src/services/tickets-routing-preview-api.ts`, hook `lib/tickets/use-ticket-routing-preview.ts`, čisto mapiranje `lib/tickets/describe-routing-preview.ts` (+ spec) i prikaz u `components/tickets/create-ticket-review-view.tsx` (grupa, fallback, SLA profil, neusmjereno); keš ključ `ticketRoutingPreview(serviceId, originUnitId)` | **SREDNJE** |
| **`roleSource`** | RAW `:479` navodi `entra_groups`, a kod dozvoljava `local_db` \| `ad_groups` | `directory-sync/ldaps/ldaps-directory.types.ts:51`, `settings/definitions/directory-ldaps-settings.ts:16,178` | Nijedna — funkcionalnost (role iz AD grupa) postoji | **Bez promjene koda**: `ad_groups` je vrijednost koja već stoji u bazama instalacija; zadržano kao dokumentovano odstupanje od RAW-a (§M8, napomena uz B7) | **NISKO (nije bug)** |

Dokazi za ovaj blok: backend `npx tsc --noEmit` → 0; `npx jest src/modules/tickets src/modules/settings src/modules/notifications --maxWorkers=2` → **148 suita / 768 testova**; frontend `npx tsc -b` → 0 i `npx vitest run` → **159 fajlova / 649 testova** (6 novih u `describe-routing-preview.spec.ts`).

## 6. E2E pokrivenost pošte (M12) — novi spec 36

| Spec | Testovi | Šta pokriva |
|---|---|---|
| `e2e/tests/36-notifications-email.spec.ts` (nov) | „the health payload and the test alarm expose the e-mail channel“; „the ops card shows the e-mail tile and reports the test alarm channels“ | **M12 e2e (must-have tačka 6):** `/ops/health` → `components.email` (`lastSentAt` je `null` ili ISO datum, `stuckClaims` cijeli broj ≥ 0 — ulaz u alarm iz M12 B1); `POST /ops/alerts/test` vraća kanal `email` sa statusom iz skupa `sent/partial/failed/skipped`, a `skipped` mora nositi poznat razlog (`email_channel_disabled` / `no_recipients` / `not_configured`) — dakle isključen SMTP ne ruši poziv; `inApp` je `sent` i red `ops.alert` se pojavi u listi obavijesti, nakon čega `POST /notifications/:id/read` vraća `isRead: true` i broj nepročitanih ne raste. UI dio: pločica **Slanje e-maila** u kartici **Operativno zdravlje** prikazuje jedno od tri stanja („Još nije poslan nijedan e-mail“ / „Posljednji poslan …“ / „Zaglavljeno u redu: n“), a dugme **Pošalji testni alarm** u toastu ispiše red po kanalu, uključujući `E-mail: …` |

Stanje e2e sloja poslije ovog speca: `npx playwright test --list` → **70 testova u 36 fajlova**
(prije: 68/35). Pokretanje i dalje traži živ stack (`E2E_API_URL`); u sandboxu se ne mogu instalirati
Playwright browseri, pa je ovdje provjeren `tsc --noEmit` (0) i `--list`.

**Zaostaje iz must-have tačke 6:** e2e pokrivenost portala (spec 34 ✅) i nadzorne ploče (spec 35 ✅) i pošte
(spec 36 ✅) je time zatvorena; serverski testovi za servise šablona dodati su u valu 4 (dio 2), a `bottleneck`
je već imao specove (`reports/bottleneck/sql-bottleneck-dashboard-store.spec.ts`,
`aggregate-bottleneck-dashboard.spec.ts`).

## 7. EN stranice vodiča — prevodi i `?locale=` (must-have tačka 7, val 5)

Odluka vlasnika (2026-10-05): prevesti **ključne** stranice, ostatak ostavlja postojeću obavijest.

| Dio | Šta je urađeno | Dokaz |
|---|---|---|
| Izvor prevoda | `docs/user-guide/en/<slug>.md` — isti slug i isti obavezni frontmatter (8 polja) kao bosanska stranica; naslov je engleski | `docs/user-guide/en/{pocetak-rad,prijava-i-mfa,tiketi,uloge-i-dozvole,cesta-pitanja}.md` |
| Generator | `scripts/generate-docs-content.mjs` čita `en/`, piše `backend/content/docs/en/<slug>.md`, u manifest dodaje `englishTitle` (naslov prevoda ili `null`); provjera `--check` i „višak“ rade rekurzivno (i za `en/`) | `buildDocsContent`, `readEnglishTranslations`, `mirrorFiles` |
| Validacija | 10. provjera: prevod bez bosanskog originala, ime fajla različito od sluga i neslaganje naslova iz frontmattera s `#` naslovom su greške | `scripts/check-docs-content.mjs` (`validateTranslation`) + test `scripts/check-docs-content.test.mjs` (8/8 ✅) |
| API | `GET /docs/pages/:slug?locale=en` vraća prevod kad postoji, inače bosanski uz `translated: false`; `GET /docs/navigation?locale=en` prevodi naslove prevedenih stranica; `locale` van `{bs,en}` je 400 | `docs.controller.ts`, `docs.service.ts`, `docs-content.repository.ts` (`readPage`, `titleFor`), `dto/docs-locale-query.dto.ts` |
| UI | Jezik sadržaja prati jezik UI-a (`i18n.language.startsWith("en")`); obavijest `docs.languageNotice` prikazuje se **samo** kad je stranica bez prevoda (`translated === false`) | `frontend/src/pages/docs-page.tsx`, `lib/docs/use-docs.ts`, `services/docs-api.ts` |
| Dokazi | backend `tsc --noEmit` 0; `jest src/modules/docs` **4 suita / 23 testa** (bilo 18); frontend `tsc -b` 0 i `vitest` **158 fajlova / 649 testova**; `Docs provjera: OK (29 stranica, 5 prevoda, 10 provjera)`; `node --test scripts/check-docs-content.test.mjs` 8/8 | — |

**Prevedeno (5):** Početak rada → *Getting started*, Prijava i MFA → *Sign-in and two-step verification (MFA)*,
Tiketi → *Tickets*, Uloge i dozvole → *Roles and permissions*, Česta pitanja → *Frequently asked questions*.
Ostale 24 stranice ostaju bosanske i to se u UI-u vidi (obavijest), a navigacija za njih zadržava bosanske naslove
— prevod je podatak, ne nova stranica.

# Val 5 — M5: policy paketi kao stvarni bundle (2026-10-05)

Prvi dio vala 5 (RAW zaostaci). Modul M5 je imao šest nalaza; ovdje su zatvoreni **B1, B2, B3, B4, B5 i B6**
iz `REVIEW_ANALIZA.md` §M5, uz pripadajuće testove i izmjene u vodiču `docs/user-guide/policy-paketi.md`.

## 1. Zatvoreni nalazi

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **M5 B3** | Dodjela paketa samo servisu nije bila moguća: DTO je tražio `organizationalUnitId`, a `OuAccessGuard` je fiksirao OU scope | `backend/src/modules/policy-packs/dto/apply-policy-pack.dto.ts` (OU obavezan), `policy-packs.controller.ts:47–58` (`@UseGuards(OuAccessGuard)` + `@RequireOrganizationalUnitScope`), `frontend/src/components/policy-packs/policy-pack-apply-form.tsx:37` (OU obavezan u formi) | Domen (`plan-policy-pack-apply.ts`) je već podržavao `null` OU, pa je zahtjev bez OU padао na 403 `missingOrganizationalUnitScope` iako paket traži samo servis | OU je opcionalan u DTO-u i formi; guard je skinut s `validate`/`apply` (odluku nosi domen: `MISSING_ORGANIZATIONAL_UNIT` / `MISSING_SERVICE`, 400); forma traži „OJ, servis ili oboje“ i šalje samo izabrane id-eve (`policy-pack-apply-target.ts`) | **SREDNJE** |
| **M5 B4** | UI je pisao „Samo SuperAdmin“, a API je dozvoljavao ADMIN-u uz `settings.write` | `frontend/src/components/policy-packs/policy-packs-panel.tsx:22–26` vs `policy-packs.controller.ts` (`@RequireRoles(authorizationRoleKeys.admin)`) | Admin je mogao primijeniti paket koji UI nije ni prikazivao — nesklad između onoga što piše i onoga što radi | `validate` i `apply` traže rolu **SUPER_ADMIN** (`@RequireRoles(authorizationRoleKeys.superAdmin)`) uz `settings.write`; u vodiču zamijenjen red o API-ju | **NISKO** |
| **M5 B5** | Primjena paketa je bila nepovratna — nije postojao `unapply` | `backend/src/modules/policy-packs/apply-policy-pack.ts` (samo upis), `policy-packs.controller.ts` (nema rute) | Poslije greške u izboru paketa ostajale su dodjele i veza `policyPackId` bez ikakvog kontrolisanog puta nazad | Nova ruta `POST /policy-packs/unapply` + `unapply-policy-pack.ts`, `remove-policy-pack-user-grants.ts`, `unbind-policy-pack-targets.ts` (veza se skida **samo** ako pokazuje na taj paket), audit `policy_pack.unapply`; UI dugme **Povuci paket** uz plan; role i permisije se ne uklanjaju (globalni zapisi — dokumentovano) | **SREDNJE** |
| **M5 B6** | `apply` nije tražio prethodni `validate` ni vraćao plan | `policy-packs.controller.ts` (`apply` bez plana), `frontend/src/components/policy-packs/policy-pack-apply-form.tsx` (jedno dugme) | Admin je mogao primijeniti paket bez da vidi šta će se tačno upisati | `validate` vraća plan (`plannedAssignments`, `servicePolicy`); u UI-u dugme **Provjeri** prikazuje plan, a **Primijeni paket**/**Povuci paket** su aktivni samo dok plan postoji; svaka promjena cilja briše plan (`policyPacks.errorValidationRequired`) | **NISKO** |
| **M5 B1** | Paket nije bio bundle: `defaultClassification` i `requiresApproval` su se samo zapisivali, `slaProfileId` nikad postavljan | `backend/src/modules/policy-packs/policy-pack.types.ts:14–21`, `ensure-policy-pack-catalog.ts:52–68`, `list-policy-packs.ts` | Ključna obećanja modula (SLA, klasifikacija, odobrenje) nisu imala efekta; primjena paketa je mijenjala samo role i permisije | `PolicyPackDefinition.slaProfileKey` (registar: `STANDARD_REQUEST`, `HR`, `FINANCE` — profili koje instalacija sije); `planPolicyPackServicePolicy()` + `applyPolicyPackServicePolicy()` upisuju na **servis** klasifikaciju, odobrenje i SLA profil (SLA samo ako profil postoji, inače `slaProfileResolved: false`); plan i rezultat vraćaju `servicePolicy`; audit pamti `servicePolicyBefore`/`servicePolicyAfter`; **obavezna polja tiketa ostaju izvan paketa** (žive u `private.workflow.requiredFields.byServiceJson`) — dokumentovano u vodiču | **SREDNJE** |
| **M5 B2** | Nije bilo nijednog `private.policyPacks.*` ključa — registar je bio potpuno hardkodiran | `backend/src/modules/settings/setting-keys.ts` (nema ključa), `policy-pack.registry.ts` (definicije u kodu) | Instalacija nije mogla isključiti paket bez izmjene koda i novog izdanja | Nova postavka `private.policyPacks.disabledKeysCsv` (kategorija `private.services`, tip `string`, default prazno) + `readDisabledPolicyPackKeys()`; `validate`/`apply` vraćaju `PACK_DISABLED` (400), `list` vraća `isDisabled`, UI označava paket; **`unapply` namjerno nije blokiran** da se isključeni paket može očistiti; dodavanje novih paketa i dalje ide kroz kod — dokumentovano | **SREDNJE** |

| **D-19** | CI je pao na `check-client-neutral` (korak 5 frontend joba) zbog **mojih** primjera izlaza: `e2e/README.md:108` i tri linije u `e2e/scripts/summarize-playwright-json.test.mjs` | Kada sam pisao uzorak sažetka (D-17), prepisao sam iz loga stvarni primjer `Received string` s klijentskom skraćenicom u broju tiketa; pravilo `ep[ _-]?hd\b` (`scripts/check-client-neutral.mjs:43`) to hvata kao klijentsku skraćenicu | Frontend job padne, pa CI **preskoči sve ostale korake i cijeli e2e job** (`needs: [backend, frontend]`) — dva nova runa (`37341585574`, `37347025852`) nisu izvršila nijedan e2e test | Primjer je neutralan: `Received string: "[HD-2026-000124] Nova poruka"` (README i test), a tvrdnja testa provjerava upravo taj broj; **`node scripts/check-client-neutral.mjs` je sada zelen** | **SREDNJE** (guard je radio tačno kako treba — uhvatio je moj propust prije merge-a sadržaja u `master`) |

| **D-20** | Spec **10** pao na `expect(forwarded.assignedUserId).toBeNull()`; stigao je CUID korisnika | Poslije prosljeđivanja backend **namjerno** primijeni strategiju auto-dodjele ciljne grupe („The target group's own auto-assign strategy applies, as for a new ticket“, `backend/src/modules/tickets/forwarding/tickets-forwarding.service.ts:75`, poziv `applyAfterCreate` na `:77`); `apply-ticket-auto-assignment.ts:37–42` tada dodijeli jedinog člana grupe. Globalna postavka je na tom stacku uključena (`private.ticket.autoAssign.enabled`, zadano `false` — `settings/definitions/ticket-assignment-settings.ts:14`), a tok koji spec pokriva (**nedodijeljen** tiket u grupi kojeg agent preuzima) postoji samo dok je auto-dodjela isključena | Spec je zavisio od konfiguracije instalacije; prvi put je došao do te tvrdnje jer ga je ranije zaustavljao `DISTINGUISHED_NAME_PARENT_MISMATCH` (D-15) | Spec sada fiksira postavke koje njegov tok zahtijeva (`withSettings`, `tests/10:56–62`, ključevi u `e2eForwardSettings:156`), a `withSettings` ih vraća u `finally`; tvrdnja na `tests/10:90` nosi poruku koja za sljedeći pad kaže i da se provjere dežurstva grupe (`resolveOutsideHoursOnCallAssignee` dodjeljuje i kad je postavka isključena) | **SREDNJE** (pretpostavka speca, ne bug u proizvodu) |
| **D-21** | Spec **14** pao jer je indikator pokazivao **stari** tiket (`T-000162`, 01:14) umjesto novog (`T-000164`) | Prethodni run je pao između `time-start` i `time-stop` i **ostavio timer pokrenut**; samo jedan timer smije raditi po agentu, pa prvi `time-start` u novom runu otvori dijalog za prebacivanje, a zaglavlje zadrži stari tiket. Playwright retry je stanje naslijedio od prvog pokušaja — zato „after 1 retry“ | Pad je izgledao kao greška u mjerenju vremena, a uzrok je bilo zagađeno stanje iz prethodnog runa | Novi `e2e/helpers/time-tracking.ts` (`stopRunningTimer`, `:28`): `GET /me/active-timer` → ako timer postoji, `POST /tickets/:id/time-logs/:logId/stop` s `reason: MANUAL` (dozvoljene vrijednosti: `StopTimeLogDto`). Zove ga `global-setup.ts:14` (`clearStaleTimers`, za sva tri naloga, greška je upozorenje) **i** sam spec prije prvog koraka (`tests/14:39`) — tako ni retry ne nasljeđuje vlastiti timer | **SREDNJE** (higijena stanja harnessa) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Backend tipovi | `cd backend && npx tsc --noEmit` | 0 grešaka |
| Policy paketi | `npx jest src/modules/policy-packs --maxWorkers=2` | **11 suite-a, 43 testa — svi prolaze** (prije vala 5: 6 suite-a, 22 testa) |
| Postavke | `npx jest src/modules/settings --maxWorkers=2` | 29 suite-a, 99 testova — svi prolaze (nova postavka ne ruši registar) |
| Autorizacija | `npx jest src/modules/authorization --maxWorkers=2` | 23 suite-a, 100 testova — svi prolaze |
| Frontend tipovi | `cd frontend && npx tsc -b` | 0 grešaka |
| Frontend testovi | `npx vitest run` | **160 fajlova, 653 testa — svi prolaze** (prije vala 5: 649) |
| e2e tipovi | `cd e2e && npx tsc --noEmit -p tsconfig.json` | 0 grešaka |
| Dokumentacija | `node scripts/generate-docs-content.mjs && node scripts/check-docs-content.mjs` | 29 stranica, 5 prevoda, 10 provjera — OK |
| Testovi skripti | `node --test scripts/check-docs-content.test.mjs` | 8/8 |

Novi test fajlovi: `plan-policy-pack-apply.spec.ts`, `policy-packs.unapply.spec.ts`, `policy-packs.service-bundle.spec.ts`,
`policy-packs.disabled.spec.ts`, `read-disabled-policy-pack-keys.spec.ts` (backend) i
`frontend/src/lib/policy-packs/policy-pack-apply-target.spec.ts` (frontend).

## 3. Šta ostaje otvoreno iz M5

- **Obavezna polja tiketa nisu dio paketa.** Paket nosi role, permisije, klasifikaciju, odobrenje i SLA profil;
  obavezna polja se i dalje uređuju postavkom `private.workflow.requiredFields.byServiceJson`. Spajanje tih
  dviju površina je samostalan posao (pisanje u tuđu postavku iz modula paketa), pa je zapisano u vodiču kao
  poznato ograničenje.
- **Nema novih paketa kroz UI/postavke.** Registar je i dalje u kodu; postavka samo isključuje postojeće.
- **Povlačenje ne vraća klasifikaciju/odobrenje/SLA servisa** na prethodne vrijednosti — one su od primjene dio
  konfiguracije servisa; stare vrijednosti ostaju u auditu (`servicePolicyBefore`).

# Val 5 — M13: serverski testovi za sedam notifications servisa (2026-10-05)

Gap iz vala 4 („M13 — servisi bez specova“) i must-have tačka 6 („serverski testovi za servise bez njih“).
Sedam servisa je imalo nula direktnih specova; logika koju su nosili — keš brojača, dva realtime događaja po
čitanju, dva kanala fan-outa koji ne smiju srušiti jedan drugog, retencija, dnevni sažetak, sedmični izvještaj
i korisničke postavke — provjeravala se samo posredno.

## 1. Dodati specovi

| Servis | Spec | Šta je pokriveno |
|---|---|---|
| `notifications.service.ts` | `notifications.service.spec.ts` | Keš brojač (pogodak/miss), brojanje u bazi, pad keša pri `markRead`, `markAllRead` s `readAll`, oba realtime događaja, prosljeđivanje liste kroz mapiranje grešaka |
| `fan-out/notifications-fan-out.service.ts` | `fan-out/notifications-fan-out.service.spec.ts` | Pretplata na hub i odjava u `onModuleDestroy`, jedan čitač postavki po događaju za oba kanala, izolacija grešaka (in-app pad ne ruši e-mail i obratno), invalidacija brojača po korisniku i epohe po grupi, SLA kanal, broadcast e-mail kroz red integracija ili inline |
| `notification-retention.scheduler.service.ts` | `notification-retention.scheduler.service.spec.ts` | Registracija dnevnog posla (id, cron, attempts, backoff, removeOn*) i preživljavanje pada Redis-a |
| `preferences/notification-digest.scheduler.service.ts` | `preferences/notification-digest.scheduler.service.spec.ts` | Registracija 5-minutnog posla i preživljavanje pada Redis-a |
| `preferences/notification-digest.service.ts` | `preferences/notification-digest.service.spec.ts` | Ništa se ne šalje kad je kanal isključen (stavke ostaju), due digest + upis `lastDigestSentAt`, quiet flush + `lastQuietFlushAt`, deaktiviran nalog (stavke se brišu), greška po korisniku ne prekida prolaz, `sendTest` razlozi (`EMAIL_CHANNEL_DISABLED`, `USER_NOT_FOUND`) i `[TEST]` prefiks |
| `preferences/notification-preferences.service.ts` | `preferences/notification-preferences.service.spec.ts` | Prikaz kategorija s defaultima i SLA/policy poljima, izvedeni default kad korisnik nema zapis, „vrijednost = default → `null`“, upis rasporeda, kapija `NOTIFICATION_PREFERENCES_DISABLED`, sve validacione greške odjednom (nepoznata kategorija, duplikat, „always on“, rola, zaključan e-mail, digest za izvještaj, loš sat), sažetak i reset |
| `preferences/weekly-ticket-report.service.ts` | `preferences/weekly-ticket-report.service.spec.ts` | Defaulti za neispravnu konfiguraciju, isključen izvještaj/kanal, preskakanje zakašnjelog slota (>24 h), slanje s `weekly:2026-W41` dedupe ključem i upisom slota, opt-out po kategoriji, prazan izvještaj (`sendWhenEmpty`), administratorski lock ne gasi opt-out, greška adrese = `failures` + slot potrošen, `sendTest` razlozi |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Tipovi | `cd backend && npx tsc --noEmit` | 0 grešaka |
| Notifications modul | `npx jest src/modules/notifications --maxWorkers=2` | **38 suite-a, 199 testova — svi prolaze** (prije: 31 suite, 155 testova) |
| Novi specovi | isti prolaz | 7 novih fajlova, **44 nova testa** |

Nijedna izmjena proizvodnog koda nije bila potrebna — specovi su potvrdili postojeće ponašanje, uključujući
namjerne odluke (slot se troši i kad je izvještaj preskočen; zaključan opt-out ne važi za `report.weeklyTickets`).

# Val 5 — M8 #3: tip zahtjeva i željeni rok na tiketu (2026-10-05)

Posljednji RAW zaostatak tiketa iz opsega vala 5: `service -> request type -> due date` (`RAW :54`). Do sada je
gap tabela §M8 red 3 stajala kao **„Odstupa“** — tip zahtjeva nosila je forma usluge, a `Ticket.dueAt` je
postojao u šemi od prve migracije i **nikada ga niko nije upisivao**.

## 1. Šta je dodato

| Dio | Fajl | Šta radi |
|---|---|---|
| Polje tipa zahtjeva | `backend/prisma/schema/ticketing.prisma` (`requestType String? @db.VarChar(80)`), migracija `20270306090000_ticket_request_type` | Eksplicitno polje na tiketu, nezavisno od forme usluge |
| Željeni rok | `Ticket.dueAt` (postojeća kolona) + `backend/src/modules/tickets/parse-ticket-due-at.ts` | Konačno se upisuje; odbija neispravan datum i datum u prošlosti (1 min tolerancije) |
| Normalizacija | `backend/src/modules/tickets/normalize-ticket-request-type.ts` | Trim + sažimanje razmaka, prazno/duže od 80 znakova → `INVALID_REQUEST_TYPE` |
| Kreiranje | `backend/src/modules/tickets/create-ticket.ts`, `dto/create-ticket.dto.ts` | Prihvata oba polja (opciona) i upisuje ih u transakciji |
| Izmjena | `backend/src/modules/tickets/update-ticket.ts`, `dto/update-ticket.dto.ts` | `undefined` čuva, `null` briše vrijednost |
| Odgovor | `backend/src/modules/tickets/to-ticket-response.ts`, `tickets.types.ts` | `requestType` i `dueAt` u API odgovoru |
| Frontend | `frontend/src/lib/tickets/build-create-ticket-input.ts`, `components/tickets/create-ticket-fields.tsx`, `components/tickets/ticket-detail-sidebar.tsx`, `services/tickets-api.ts` | Polja u koraku **Detalji** (tip zahtjeva + datum) i prikaz u sekciji **Svojstva** detalja; prazna vrijednost se ne šalje |
| i18n | `frontend/src/i18n/locales/{bs,en}/common.json` | `tickets.requestTypeField`, `requestTypePlaceholder`, `dueAtField`, `dueAtHint`, `requestType`, `dueAt`, `dueAtNone`, `detail.notSet` |
| Dokumentacija | `docs/user-guide/tiketi.md` | Korak prijave, tabela polja, FAQ i dva poznata ograničenja (tip ≠ forma, željeni rok ≠ SLA rok); uklonjeno staro ograničenje koje je tvrdilo da polja ne postoje |

**Namjerno nije rađeno:** tip zahtjeva nije postao enumeracija ni veza na katalog — RAW ga opisuje kao korak
usluga → tip → rok, a u kodu usluga već nosi klasifikaciju i formu; slobodan tekst (do 80 znakova) drži polje
upotrebljivim bez migracije podataka i bez novog ekrana za administraciju tipova.

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Tipovi | `cd backend && npx tsc --noEmit` | 0 grešaka |
| Tiketi | `npx jest src/modules/tickets --maxWorkers=2` | **98 suite-a, 555 testova — svi prolaze** (novi `tickets.request-type-and-due-date.spec.ts`, 6 testa) |
| Frontend tipovi | `cd frontend && npx tsc -b` | 0 grešaka |
| Frontend testovi | `npx vitest run` | 160 fajlova, **653 testa — svi prolaze** (novi test u `build-create-ticket-input.spec.ts`) |
| e2e tipovi | `cd e2e && npx tsc --noEmit -p tsconfig.json` | 0 grešaka |
| Dokumentacija | `node scripts/generate-docs-content.mjs && node scripts/check-docs-content.mjs` | 29 stranica, 5 prevoda, 10 provjera — OK |

## 3. Šta ostaje

- **M8 gap red 3 je zatvoren** za ono što RAW traži (eksplicitna polja); veza „tip zahtjeva → katalog“ nije
  tražena i nije rađena.
- **`dueAt` i dalje ne pokreće ništa automatski** — nije SLA cilj niti okidač eskalacije. To je i dokumentovano
  kao razlika između željenog i SLA roka.

# Val 5 — M7 B2/B5: mrtva postavka change loga i prekidač matrice prioriteta (2026-10-05)

## 1. M7 B5 — prekidač matrice prioriteta (RAW `:496–499`)

| Sloj | Promjena | Fajl/linija |
|---|---|---|
| Registar | nova privatna postavka `private.ticket.priorityMatrix.enabled` (boolean, default `true`) | `backend/src/modules/settings/setting-keys.ts:208–209`, `backend/src/modules/settings/definitions/ticket-priority-matrix-settings.ts`, registracija u `definitions/application-settings.ts:26,73` |
| Loader | `TicketPriorityMatrixConfigurationLoader.load()` → `{ enabled }`; greška ili vrijednost koja nije `false` daje „uključeno“ (instalacija bez postavke ostaje ista) | `backend/src/modules/tickets/priority/ticket-priority-matrix-configuration.loader.ts` |
| Odluka | `resolveTicketPriority(..., { matrixEnabled: false })` preskače `priorityMatrixRule.findUnique` i vraća formulu; bez opcije ponašanje je nepromijenjeno | `backend/src/modules/tickets/resolve-ticket-priority.ts:22–44` |
| Kapija | postavka se čita jednom po mutaciji, uz ostale access policy loadere; eksplicitna vrijednost na kontekstu (worker/harness) ima prednost | `backend/src/modules/tickets/with-ticket-access-policies.ts:25–42`, `ticket-access-policy-binder.ts:15–31`, `tickets.service.ts:73,393–400` |
| Potrošači | kreiranje (`create-ticket.ts:183–188`), izmjena uticaja/hitnosti (`update-ticket.ts:171–175`), „Vrati na matricu“ (`priority/override-ticket-priority.ts:76–81,143–156`) i prioritet **problema** (`problems/problems.service.ts:141–145,277–279,406–408`) | vidi lijevu kolonu |
| Vodič | `user-guide/usmjeravanje-i-prioritet.md` §5 (korak 4) i tabela u `user-guide/sla.md` §Matrica prioriteta; ograničenje B5 prepisano | ogledalo regenerisano (`backend/content/docs/**`) |

**Ose ostaju odstupanje:** kolone su `TicketImpact`/`TicketUrgency` (Nizak–Kritičan), a RAW traži
`self,team,unit,company` / `low,medium,high`; promjena osa bi bila promjena šeme i podataka, pa je zadržano
postojeće stanje uz zapis u „Poznatim ograničenjima“.

## 2. M7 B2 — mrtva postavka change loga (zatvorena uklanjanjem)

Pet postavki `private.changeLog.*` uklonjeno je u bloku `# Popravke poslije vala 4` §4 (bez potrošača, dnevnik je
bezuslovan auditni trag). Time je i ovaj nalaz zatvoren; u vodiču je obrisana rečenica da „change log za routing“
ne mijenja ponašanje (`user-guide/usmjeravanje-i-prioritet.md`, „Poznata ograničenja“).

## 3. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Sloj | Komanda | Rezultat |
|---|---|---|
| Backend tipovi | `cd backend && npx tsc --noEmit` | 0 grešaka |
| Backend testovi | `npx jest src/modules/tickets src/modules/problems src/modules/settings src/modules/sla src/modules/assets src/modules/status-page --maxWorkers=2` | **170 suita (1 preskočen), 865 testova — svi prolaze** (novi `with-ticket-access-policies.spec.ts` 4 testa, `priority/ticket-priority-matrix-configuration.loader.spec.ts` 4 testa, `resolve-ticket-priority.spec.ts` +2) |
| i18n | `npx vitest run src/i18n/settings-registry-keys.spec.ts` | ključ ima opis u BS i EN (spec traži opis za svaki ključ iz registra) |
| Dokumentacija | `node scripts/generate-docs-content.mjs && node scripts/check-docs-content.mjs` | 29 stranica, 5 prevoda, 10 provjera — OK |

## 4. Šta ostaje

- **M7 je zatvoren** (B2 uklonjen, B3 popravljen ranije u valu 5, B5 prekidač dodat; ose i B1/B4/B6/B7 stoje kao
  dokumentovana ograničenja/zapisi u vodiču).
- Iz vala 5 ostaje **M12 B1 (dio — e2e pošta)** i **izvještaj vala**.

# Val 5 — izvještaj vala (2026-10-05)

Peti val je zatvorio **RAW zaostatke** iz plana (`# Zaključak Faze 2`, §4, red „Val 5 — RAW zaostaci“):
**M5 B1–B6, M8 3, M7 B2/B3/B5 i dio M12 B1** (e2e pošta). Uz to su u istom valu isporučeni dogovoreni prateći
poslovi: serverski specovi za sedam notifications servisa (M13), uklanjanje mrtvih postavki i površina
(M9 B4, M8 B3, M15 B4), prijevodi pet ključnih stranica vodiča na engleski i **tvrda kapija** e2e joba.

Sve izmjene vala 5 su na grani `arena/01a0feaa-help-desk-enterprise`: skup od 75 stavki u commitu
`e2bbf04a` (M5, M13, M8 #3) i commit `951c745b` (M7 B2/B5 + kapija), oba pushovana na `origin`.

## 1. Šta je isporučeno

| Tačka | Šta je urađeno | Dokaz u ovom dokumentu |
|---|---|---|
| **M5 B1–B6** | Policy paket je postao stvarni bundle: dodjela servisu bez OJ, SuperAdmin kapija na API-ju, povlačenje paketa (`unapply`) s auditom, plan iz `validate` prije primjene, klasifikacija/odobrenje/SLA profil na servisu i `private.policyPacks.disabledKeysCsv` | `# Val 5 — M5` |
| **M13** | Sedam servisa obavještenja dobilo specove (44 nova testa): keš brojača i realtime događaji, fan-out i izolacija kanala, broadcast kroz red, retencija, dnevni sažetak, sedmični izvještaj, korisničke postavke | `# Val 5 — M13` |
| **M8 3** | Tiket je dobio `requestType` (nova kolona, ≤ 80 znakova) i upisivi `dueAt`; oba polja u formi (**Detalji**) i u detalju (**Svojstva**), normalizacija i validacija (`INVALID_REQUEST_TYPE`, `INVALID_DUE_AT`, `DUE_AT_IN_PAST`), željeni rok ≠ SLA rok | `# Val 5 — M8 #3` |
| **M7 B3** | Preview rutanja se stvarno koristi u koraku pregleda tiketa (hook, čisto mapiranje i prikaz grupe, fallbacka, SLA profila i neusmjerenog reda) | `# Popravke poslije vala 4` §5 |
| **M7 B5** | Nova postavka `private.ticket.priorityMatrix.enabled`: kad je isključena, prioritet se računa ugrađenom formulom i tabela se ne čita (kreiranje, izmjena, „Vrati na matricu“ i prioritet problema); ose Nizak–Kritičan ostaju dokumentovano odstupanje | `# Val 5 — M7 B2/B5` §1 |
| **M7 B2** | Zatvoren uklanjanjem: pet mrtvih `private.changeLog.*` postavki ne postoji, a vodič više ne tvrdi da prekidač nešto mijenja | `# Val 5 — M7 B2/B5` §2 |
| **M12 B1 (dio)** | e2e spec `36-notifications-email.spec.ts` pokriva kanal e-pošte (`/ops/health`, `/ops/alerts/test`, čitanje obavijesti, pločica u kartici **Operativno zdravlje**); e2e kapija više ne dopušta tiho preskakanje | `# Popravke poslije vala 4` §6; §3 ovog izvještaja |
| **Mrtve postavke i površine** | Uklonjeno 11 postavki bez potrošača (4 addon prekidača, 5 `private.changeLog.*`, Teams metapodaci) i dvije iz mrtvih površina (`allowRequesterManager`, `allowSharing`); `scope` sažetka uklonjen; **7 `public.maintenance.*` zadržano** jer stvarno rade | `# Popravke poslije vala 4` §4–§5 |
| **Ostalo iz vala** | M10 B5 (uzorak skenera), M9 B3-2 (CSAT skala na trendovima), M15 B4 (`scope`), EN prevodi pet ključnih stranica uz `?locale=` | `# Popravke poslije vala 4` §2–§4, §7 |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Sloj | Komanda | Rezultat |
|---|---|---|
| Backend tipovi | `cd backend && npx tsc --noEmit` | 0 grešaka |
| Backend testovi (šire) | `npx jest src/modules/tickets src/modules/problems src/modules/settings src/modules/sla src/modules/assets src/modules/status-page --maxWorkers=2` | **170 suita (1 preskočen), 865 testova — svi prolaze** |
| Policy paketi | `npx jest src/modules/policy-packs --maxWorkers=2` | 11 suita / 43 testa |
| Obavještenja | `npx jest src/modules/notifications --maxWorkers=2` | 38 suita / 199 testova (M13) |
| Frontend tipovi | `cd frontend && npx tsc -b` | 0 grešaka |
| Frontend testovi | `npx vitest run` | **160 fajlova / 653 testa — svi prolaze** |
| e2e tipovi i spisak | `cd e2e && npx tsc --noEmit -p tsconfig.json && npx playwright test --list` | 0 grešaka; **70 testova u 36 fajlova** |
| Dokumentacija | `node scripts/generate-docs-content.mjs && node scripts/check-docs-content.mjs` | 29 stranica, 5 prevoda, 10 provjera — OK |

**Ograničenje okruženja:** e2e specovi se u sandboksu ne mogu izvršiti (nema živog stacka; Playwright/Chromium
se ne instalira), pa su provjereni tipovi i kompletan spisak — prvi živi prolaz je korak vlasnika (§3).

## 3. Prvi pravi e2e prolaz (M12) — šta je promijenjeno

Do sada je e2e job mogao biti zelen **bez ijednog izvršenog testa**: kad `E2E_API_URL` nije postavljen, korak je
ispisivao `::notice` i izlazio s `exit 0`. Kapija je sada tvrda:

- `.github/workflows/ci.yml` (korak **Run E2E**): bez `E2E_API_URL` korak pada s
  `::error title=E2E did not run` (`exit 1`) — zelen e2e job sada znači da su specovi izvršeni.
- `e2e/README.md`: tabela varijabli i uputstvo opisuju novo ponašanje (nema više tihog preskakanja).

Vlasnik je varijable i secrete postavio (E-1 zatvoren s njegove strane); job se pokreće na `master` (ili ručno
`workflow_dispatch`), a očekivani obim je **70 testova u 36 fajlova** — uključujući spec 36 (M12).

## 4. Šta ostaje otvoreno poslije vala 5

- **Prvi živi e2e prolaz** izvršava se poslije spajanja grane na `master` (van sandboka); ako padne, dokaz su
  izvještaj i artefakt iz GitHub Actions.
- **Nalazi van opsega valova 0–5** ostaju zapisani u svojim modulima (npr. §M4 B2–B5, §M7 B1/B4/B6/B7,
  §M10 B3) — val 5 je zatvorio tačno svoj opseg iz plana. **Njihov plan sada postoji:** preostalih
  **15 `SREDNJE`** (paket 5.1) i **38 `NISKO`** (paket 5.2, registar s redovima ovog dokumenta) obrađeni su u
  `docs/plans/modules/5.1-serverska-provjera-i-audit-trag.md`, uz definiciju „audit očišćen“ (§7.2) — novi
  audit nije potreban.
- **`roleSource`** ostaje dokumentovano odstupanje od RAW-a (bez promjene koda).

# Val 5 — ispravka poslije CI-ja: worker modul bez novog loadera (2026-10-05)

Prvi push grane pokrenuo je CI **na `master`** (job `Backend build + test`) i pao je — ovdje je zapisano šta je
puklo, zašto to lokalna provjera nije uhvatila i šta je popravljeno.

## 1. Nalaz CI-ja

```
FAIL ./worker.module.spec.ts
  ● WorkerModule › boots Redis, Prisma, and every scheduled job without HTTP or websocket
    Nest can't resolve dependencies of the TicketsService (… TicketSafeLoggingConfigurationLoader,
    ?, TicketArchiveConfigurationLoader, …) … argument TicketPriorityMatrixConfigurationLoader
    at index [12] is available in the TicketsWorkerCoreModule module.
```

- **Uzrok:** `backend/src/modules/tickets/worker-core/tickets-worker-core.module.ts` **namjerno** ne uvozi
  `TicketsModule` (worker nema kontrolere ni gateway) nego sam nabraja providere. M7 B5 je loader dodao u
  `TicketsModule` (`tickets.module.ts:130`) i u `TicketsService` (`tickets.service.ts:73`), ali **ne i u tu
  listu** — pa je `WorkerModule` ostao bez njega, a DI graf se ruši pri `builder.compile()`
  (`src/worker.module.spec.ts:131`).
- **Fix:** `TicketPriorityMatrixConfigurationLoader` je dodat u `providers` worker modula
  (import `../priority/ticket-priority-matrix-configuration.loader`, unos uz `TicketSafeLoggingConfigurationLoader`).
  Worker tako čita **istu** postavku kao API — bez toga bi odgovor stigao e-poštom i prioritet bi se računao po
  drugoj logici nego u UI-ju.
- **Ozbiljnost:** SREDNJE (ruši boot worker procesa; API je bio ispravan).

## 2. Zašto lokalna provjera nije uhvatila (i pravilo za dalje)

| Provjera tokom vala 5 | Zašto nije dovoljna |
|---|---|
| `npx tsc --noEmit` | Tipovi su bili ispravni — `@Optional()` na parametru i `as never` u harnessima skrivaju DI graf |
| `npx jest src/modules/tickets src/modules/problems src/modules/settings …` | Specovi po modulima instanciraju servise **ručno** (`new TicketsService(...)`, `as never`); nijedan ne kompajlira Nest modul |
| `worker.module.spec.ts` / `app.module.spec.ts` | Ovi specovi **kompajliraju cijeli DI graf** i jedini bi uhvatili grešku — nisu bili u lokalnom krugu |

**Pravilo (dodato u praksu ovog vala):** svaka izmjena liste providera (`providers:`/`exports:`) mora u istom
prolazu pokrenuti `npx jest src/worker.module.spec.ts src/app.module.spec.ts`.

## 3. Dokazi poslije popravke (2026-10-05, ovo okruženje)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Modul-specovi (oni koji su pali u CI-ju) | `npx jest src/worker.module.spec.ts src/app.module.spec.ts --maxWorkers=2` | **2 suita / 3 testa — prolaze** |
| Tipovi i build | `npx tsc --noEmit`; `npm run build` | 0 grešaka; `nest build` prolazi |
| Lint | `npm run lint` | 0 grešaka (16 postojećih upozorenja) |
| Puna backend suita | `npx jest --ci --coverage=false --maxWorkers=2 --shard=1/2` i `--shard=2/2` | **534 suita (5 preskočenih), 2596 prošlih / 2627 testova** |
| Frontend | `npx tsc -b`; `npx vitest run`; `npm run build` | 0 grešaka; 160 fajlova / 653 testa; `vite build` prolazi |
| e2e | `npx tsc --noEmit -p tsconfig.json` | 0 grešaka |
| Guards (CI frontend job) | svih 10 `scripts/check-*.mjs` + 5 pratećih `node --test` | OK |

**Napomena o okruženju:** puna suita u jednom prolazu u sandboksu ubije jedan jest worker (`SIGKILL` — OOM), pa
je provjerena u dvije polovine (`--shard`); to nije pad testa i u CI-ju se ne pojavljuje.
# Val 5 — e2e u CI-ju: scope varijabli, nedostupna baza i dodatak `sla` (2026-10-05)

Prvi pravi e2e prolaz otkrio je tri stvari koje unit sloj ne može vidjeti. Dvije su greške u konfiguraciji i
jedna je **naš propust iz vala 5** (uklonjen dodatak koji je harness i dalje slao).

## 1. Nalazi

| # | Nalaz | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-11** | `E2E_API_URL` postoji u repou, a job ga vidi kao prazan | Varijabla je napravljena pod **Settings → Environments → Environment variables**; environment-scoped vrijednosti vidi samo job koji deklarira taj environment, a `jobs.e2e` ga ne deklarira — pa `${{ vars.E2E_API_URL }}` daje prazan string | Kapija ispravno pada (`E2E did not run`), ali korisnik ne vidi zašto kad je vrijednost očigledno postavljena | Poruka kapije sada kaže da se koristi **repository** varijabla, a ne environment; novi **Preflight** korak ispisuje `set`/`empty` za svako ime (nikad vrijednost); `e2e/README.md` dobio odjeljak „Repository, not environment“ | **NISKO** (konfiguracija, ne kod) |
| **D-12** | `E2E_DATABASE_URL` pokazuje na hostname koji postoji samo unutar Coolify mreže (`hgpchekxb6dutalsyctu42al`); `pg` pada s `getaddrinfo EAI_AGAIN <host>` | `e2e/helpers/reset-super-admin-mfa.ts:20` (`client.connect()` bez `try/catch`); host dolazi iz `readE2EEnvironment` (`helpers/environment.ts:40`) | **Prvi pravi e2e prolaz je stao prije ijednog speca**, s porukom iz koje se ne vidi šta popraviti | Novi `e2e/helpers/database-diagnostic.ts` (`databaseHost`, `isDnsFailure`, `planUnreachableDatabase`): poruka imenuje host (nikad lozinku), objašnjava da interni Docker/Coolify nazivi ne rade s runnera i nudi tri izlaza; run **nastavlja** samo ako je poznat `E2E_SUPERADMIN_TOTP_SECRET`, inače staje s istim tekstom. Uz to opcioni **SSH tunel** korak (`E2E_SSH_*`) i README odjeljak „Database reachability“ | **SREDNJE** |
| **D-13** | `e2e/helpers/ensure-install.ts` je i dalje slao `addons.sla = true` | `validateInstallAddons` odbija nepoznat ključ (`install-addons.error` → `unsupportedAddon`), a `sla` je uklonjen iz kataloga u valu 5 (D-9: četiri mrtva prekidača) | Na **svježem** stacku e2e global setup bi pao na `/install/addons`; na postojećem se ne vidi jer je instalacija završena | Ključ uklonjen iz payloada; u komentaru objašnjeno zašto ga nema | **SREDNJE** (latentno) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Čista logika dijagnostike | `node --experimental-strip-types /tmp/diag-check.mjs` (12 provjera nad `helpers/database-diagnostic.ts`) | **12/12** — host bez kredencijala, `ENOTFOUND`/`EAI_AGAIN` prepoznati kao DNS, greška autentikacije **nije** DNS, `continueAnyway` po TOTP secretu, poruka sadrži host i **ne sadrži lozinku** |
| Stvarni put harnessa | `npx tsc -p tsconfig.json --outDir /tmp/e2eout --module commonjs` pa `resetSuperAdminMfa()` s internim hostom | Ispisana je tačno nova poruka (`[e2e] MFA reset skipped: the host "…" does not resolve from a GitHub-hosted runner`), `cause` je zadržan; s `E2E_SUPERADMIN_TOTP_SECRET` **ne baca** (nastavlja), bez `DATABASE_URL` samo upozorava |
| e2e tipovi | `cd e2e && npx tsc --noEmit -p tsconfig.json` | 0 grešaka |
| Shell blokovi iz workflowa | `bash -n` nad izvučenim `run` skriptama (Preflight, tunel) | sintaksa OK |
| Workflow YAML | `node scripts/check-workflows-yaml.mjs` + `js-yaml.load` | provjera OK; parse potvrđuje red koraka, `if` tunela i `env` |
| Dokumentacija | `node scripts/check-docs-content.mjs` | 29 stranica, 5 prevoda, 10 provjera — OK |

## 3. Šta ostaje (radnja vlasnika)

1. **Izabrati kako runner dolazi do baze** (README, „Database reachability“): javni Postgres port, SSH tunel
   (`E2E_SSH_*`) ili bez baze (`E2E_SUPERADMIN_TOTP_SECRET`).
2. **`E2E_BASE_URL` može biti prazan** — harness tada koristi `http://localhost:5173`, što s runnera ne
   postoji; za pravi prolaz vrijednost treba biti javni URL frontenda.
3. Ponoviti workflow; **Preflight** sada u logu pokaže `set`/`empty` po imenu, razrješenje oba hosta i
   `GET /health`, pa se svaki sljedeći zastoj vidi prije Playwrighta.

## 4. Prvi pravi prolaz je crven — i to je očekivano (trijaža)

Prvi izvršeni e2e prolaz (run `37309632260`, grana `master` = `0fd159c`) prijavio je padove u specovima
**10, 11, 12, 17, 18, 20–23, 26, 27 i dalje**. Nijedan od njih **nije regresija iz vala 5**:

- val 5 dira tikete (tip zahtjeva, rok), postavke, policy pakete i notifikacije; ovi specovi pokrivaju
  prosljeđivanje, e-mail šablone, izvještaje, privatnost, status, pristupačnost i imovinu;
- do sada e2e job **nikad nije izvršio nijedan spec** (lažno zelen, `exit 0` bez `E2E_API_URL`), pa je ovo prvi
  prolaz ovih specova protiv živog stacka — crven blok je očekivan polaz, ne dokaz kvara.

**Šta je urađeno da trijaža bude moguća (umjesto pogađanja):**

| Alat | Fajl | Šta radi |
|---|---|---|
| Sažetak padova u logu | `e2e/scripts/summarize-playwright-json.mjs` (+ `*.test.mjs`, 5 testova) | čita Playwright JSON i ispisuje po padu `fajl:linija — test` i **prvu liniju greške** (bez ANSI kodova) |
| Izvještaj i tragovi kao artefakt | `.github/workflows/ci.yml` | `--reporter=list,json`, `PLAYWRIGHT_JSON_OUTPUT_NAME=results.json`, `upload-artifact` (`playwright-report`, `test-results`, `results.json`) uz `if: always()` — **ranije se HTML izvještaj nije uploadovao** |
| Trijaž režim | `.github/workflows/ci.yml` (`workflow_dispatch` inputi) | `max_failures=8` zaustavlja run poslije 8 padova, `retries=0` ih ne ponavlja → crven run traje minute, ne ~35 |
| Protokol klasifikacije | `e2e/README.md` („Triage: reading a red run“) | svaki pad ide u **(A) okruženje**, **(B) pretpostavka speca** ili **(C) bug u proizvodu**; prvi prolaz samo klasifikuje, popravke idu po grupi |

**Prvi sljedeći korak (vlasnik):** pokrenuti workflow s `max_failures=8`, `retries=0` i poslati sažetak iz loga
(copy/paste bloka `Playwright (results.json): …`). Iz njega se svaki pad klasifikuje i dobija popravku s dokazom.

# Val 5 — trijaža prvog crvenog e2e prolaza: popravke u e2e sloju (2026-10-05)

Prvi pravi e2e prolaz (70 testova / 36 fajlova protiv živog stacka) završio je s **58 passed / 10 failed /
2 flaky**. Ovaj odjeljak bilježi šta je iz tog prolaza **popravljeno odmah** i šta **čeka artefakt**.

Dva popisa padova se razlikuju: korisnikov popis iz prve poruke (10, 11, 12, 17, 18, 20–23, 26, 27) i sažetak
iz loga (10, 11, 14, 15×2, 18, 22×4, 23, 24). **Mjerodavan je `results.json`** (`e2e/results.json`, retention 14
dana), jer se popis iz prve poruke odnosio na raniji prolaz; zato se nijedan pad ne popravlja „po sjećanju“.

## 1. Nalazi (uzrok, fajl, linija, uticaj, fix, ozbiljnost)

| # | Nalaz | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-14** | Spec **15** padao dva puta s `INVALID_SLUG` | `e2e/helpers/create-ticket.ts` je gradio slug kao `e2e-${label.toLowerCase()}-${stamp}`; labele `'Unrouted target'` (`tests/15:78`) i `'Realtime rule'` (`tests/15:117`) ostavljaju razmak, a API traži `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (`backend/src/modules/service-catalog/normalize-service-slug.ts:5`) | Spec nije mogao ni da napravi uslugu → pad prije provjere koju test stvarno tvrdi | Nova funkcija `slugifyServiceLabel` (`helpers/create-ticket.ts:96`): `[^a-z0-9]+` → `-`, trim vodećih/pratećih crtica; slug se gradi na `helpers/create-ticket.ts:112` | **SREDNJE** (e2e fikstura, ne proizvod) |
| **D-15** | Spec **10** padao s `DISTINGUISHED_NAME_PARENT_MISMATCH` | `ensureChildUnit` je gradio DN `OU=<ime>,OU=E2E` (`tests/10:139`, prije popravke), a pravilo traži da DN **završava** DN-om roditelja (`backend/src/modules/organizational-units/assert-distinguished-name-matches-parent.ts:17`, `is-descendant-distinguished-name.ts`); instalirani korijen je `OU=Direkcija,DC=local` (`backend/src/modules/install/install-seed.constants.ts:5`) | Prosljeđivanje između organizacionih jedinica nije se moglo provjeriti | DN se izvodi iz roditelja: `OU=${relativeName},${root.distinguishedName}` (`tests/10:147`), a tip `UnitNode` dobio `distinguishedName` (`tests/10:10`) jer ga API vraća (`to-organizational-unit-response.ts:13`); relativni dio čisti `normalizeDistinguishedName` (bez zapete i kose crte) | **SREDNJE** (e2e fikstura, ne proizvod) |
| **D-16** | Dva pada su u logu bila samo `TypeError: fetch failed` (specovi 23 i 24, linije 33 i 26, oba preko `withSettings`) | `ApiClient.request` je zvao `fetch` bez `try/catch`, pa nije bilo ni metode, ni putanje, ni `cause` | Iz loga se nije moglo razlikovati „API nedostupan” od DNS/TLS kvara — trijaža je bila pogađanje | Novi privatni `send` (`helpers/api-client.ts:111`): hvata `cause`, ispisuje `NETWORK <METHOD> <path> failed: … (cause: <code> …) — the API at <url> …`; **`GET` se ponavlja jednom** (2 s), ostalo odmah pada da se upis ne udvostruči (`request` ostaje nepromijenjen kao ulaz, `helpers/api-client.ts:84`) | **SREDNJE** (vidljivost) |
| **D-17** | Sažetak u logu nije imao `Received`/axe nalaze, a `skipped` se nije vidio | `firstErrorLine` vraća samo prvu liniju (`scripts/summarize-playwright-json.mjs:15`) | Za padove tipa `expect(...).toMatch(...)` i axe prekršaje prva linija ne nosi odgovor → artefakt se morao otvarati ručno | Novi `errorDetail` (`:34`, do 15 linija + „… N more line(s)”) i `collectSkipped` (`:50`); `collectFailures` sada nosi `detail` (`:91`), a `formatSummary` ispisuje detalje i blok `SKIPPED … — a skip is not a pass` (`:125`) | **SREDNJE** (vidljivost) |
| **D-18** | Spec **18** je tvrdio da „pošalji test” mora uspjeti, a stack nema SMTP | `scheduled-report.runner.ts:137` vraća `{ sent: false, reason: 'EMAIL_CHANNEL_DISABLED' }` kad je kanal isključen (`load-email-channel-configuration.ts` → `resolveEmailChannelEnabled`), pa je cijeli spec padao — i dio koji pošti ne treba | Zelenilo speca je zavisilo od SMTP-a na stacku, a poruka o kvaru nije govorila šta je isključeno | Spec razdvojen na dva testa: „create in UI → next slot → audit → user refused” bez pošte (`tests/18:32`) i „send test to me needs a configured e-mail channel” (`:98`) koji se **vidljivo preskače** (`test.skip`, `:142`) samo kad stack vrati `EMAIL_CHANNEL_DISABLED`; audit `report.schedule.test_sent` se tada ne provjerava (to je zapisano u razlogu skipa) | **SREDNJE** (kontrakt speca) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Samotest sažetka | `cd e2e && node --test scripts/summarize-playwright-json.test.mjs` | **12/12** (novi: `errorDetail` čuva `Expected pattern`/`Received string`, granica na 40 linija, `formatSummary` ispisuje detalje i `SKIPPED`, `collectSkipped` daje punu putanju `20 privacy › needs SMTP`) |
| e2e tipovi | `cd e2e && npx tsc --noEmit -p tsconfig.json` | **0 grešaka** (poslije izmjena u `helpers/create-ticket.ts`, `helpers/api-client.ts`, `tests/10`, `tests/18`) |
| Prikaz izlaza (stvarni render) | `node --input-type=module -e "…formatSummary…"` nad uzorkom s axe nalazima i `skipped` | Ispisuje `FAIL 22-accessibility.spec.ts:60 …`, dvije linije axe nalaza, `SKIPPED 1 test(s) — a skip is not a pass` i `NEXT TRIAGE RUN: specs=15,22 …` |
| Workflow YAML s novim inputom | `node scripts/check-workflows-yaml.mjs`, `bash -n` nad svim `run` blokovima, `npx js-yaml` (parse) | OK; `inputs.specs` pročitan iz parsiranog YAML-a, `env.E2E_SPECS` vezan na `${{ inputs.specs }}`, zadnja linija `npx playwright test "${args[@]}" "${files[@]}"`; simulacija s `specs=10,18,22` daje tri fajla, `99` daje grešku |
| Logika `stopRunningTimer` | `node --experimental-strip-types /tmp/timer-check.mjs` (6 provjera nad `helpers/time-tracking.ts`, lažni klijent) | **6/6** — zaustavi zaostali timer tačno jednim POST-om na `/tickets/:id/time-logs/:logId/stop`, s `reason: MANUAL`; bez timera **ne** šalje POST; greška se propagira (global setup je hvata i upozori) |
| e2e tipovi i spisak | `cd e2e && npx tsc --noEmit -p tsconfig.json`; `npx playwright test --list` | **0 grešaka**; **71 test u 36 fajlova** (spec 18 je razdvojen na dva testa, otuda 71 umjesto 70) |
| Guard klijentske neutralnosti | `node scripts/check-client-neutral.mjs` + `node --test scripts/check-client-neutral.test.mjs` | **zeleno** („no client-specific names in tracked files“); samotest guarda 3/3 |
| Statika kontrasta | `node scripts/check-theme-contrast.mjs` | 12 paleta × 23 para unutar praga, 0 upotreba `text-primary` na neutralnoj površini (dakle runtime axe nalaz iz speca 22 dolazi iz DOM-a, ne iz palete — čeka artefakt) |

## 3. Šta je otvoreno i zašto (ne pogađa se)

| Spec | Šta se zna | Šta treba za popravku |
|---|---|---|
| ~~**10**~~ | **Zatvoreno (D-20)**: pad nije bio bug u proizvodu — prosljeđivanje namjerno primijeni auto-dodjelu ciljne grupe, a spec je zavisio od postavke instalacije. Postavke su sada fiksirane u specu | — |
| **11** | Pada `expect(normal.subject).toMatch(/^\[HD-2026-000123\] /)` (`tests/11:45`) ili `overview.keys` bez `ticket.broadcast`; serverska fikstura postoji (`email-template-preview.ts:19`, `build-template-variables.ts:114`) i unit spec je zelen | `Received`/`Expected` iz artefakta — od sada je u logu (`errorDetail`) |
| **12** | Nema detalja u proslijeđenom sažetku | artefakt |
| **17** | Nema detalja u proslijeđenom sažetku | artefakt |
| **18** | Popravljeno u dijelu koji ne zavisi od pošte (D-18); ostaje da se vidi da li je pad bio na pošti ili na kreiranju | novi prolaz |
| **20–23** | 22 ×4 su axe nalazi (`user-notifications-light/dark`, `admin-settings-light/dark`); `serious`/`critical` padaju, `moderate`/`minor` ne (`helpers/a11y.ts`) | spisak pravila i selektora iz `test-results/a11y-report.jsonl` ili attachmenta `axe-<label>` |
| **23, 24** | `TypeError: fetch failed` (D-16) | nova poruka `NETWORK …` iz sljedećeg prolaza |
| **26, 27** | Nema detalja u proslijeđenom sažetku | artefakt |

| ~~**14**~~ | **Zatvoreno (D-21)**: pad je bio zaostali timer iz prethodnog runa, ne greška mjerenja vremena; harness ga sada čisti | — |

**Ništa od ovoga se ne popravlja u backendu**: `INVALID_SLUG` (D-14), `DISTINGUISHED_NAME_PARENT_MISMATCH` (D-15),
auto-dodjela poslije prosljeđivanja (D-20) i zaostali timer (D-21) su posljedica e2e fikstura i stanja okruženja —
backend radi **tačno ono što je dizajnirano** (auto-dodjela je dokumentovana u kodu, a timer je pravilo proizvoda).

**Drugi prolaz (run `37353690845`, `f8565ff`, `specs=10,14,15,18` — 7 testova):** 4 passed / 2 failed / 1 skipped.
Podskup je naknadno potvrđen (vlasnik), pa se status po specovima **izvodi**:

| Spec | Testova u fajlu | Ishod u ovom prolazu | Zaključak |
|---|---|---|---|
| **10** | 1 | **failed** — `expect(...).toBeNull()`, stigao CUID | Nalaz **D-20**; popravljen u `f98a29e` (fiksirane postavke u specu) |
| **14** | 1 | **failed** — indikator pokazivao `T-000162` | Nalaz **D-21**; popravljen u `f98a29e` (`stopRunningTimer`) |
| **15** | 3 | **3 × passed** | ✅ **D-14 potvrđen na živom stacku** — slugifikacija radi, `INVALID_SLUG` se više ne pojavljuje |
| **18** | 2 | **1 passed + 1 skipped** | ✅ **D-18 potvrđen** — dio bez pošte prolazi, „pošalji test“ se vidljivo preskače uz `EMAIL_CHANNEL_DISABLED` (skip je u sažetku, ne krije se) |

Neprovjereni iz ovog prolaza (nisu bili u podskupu): **11, 12, 17, 20–24, 26, 27** — njihov status daje puni prolaz.

## 4. Sljedeći korak (vlasnik)

1. **Provjera popravki (~2 min):** **Actions → CI → Run workflow**, `specs = 10,14`, `max_failures=8`, `retries=0`.
   Očekivano: oba zelena (D-20 i D-21 su popravljeni i imaju dokaz u kodu/logici), a `NEXT TRIAGE RUN` se ne pojavi.
2. **Puni prolaz (kapija, ~35 min):** bez `specs`, `max_failures=0`, `retries=1` (defaulti) — 71 test u 36 fajlova.
3. Sažetak iz koraka **Summarize failures (JSON report)** nosi `Expected`/`Received`, axe nalaze, `cause` mrežne
   greške, `SKIPPED` listu i gotovu `specs=` liniju za sljedeći trijažni run. Sažetak u
logu sada nosi i detalje (Expected/Received, axe pravila, `cause` mrežne greške), pa se svaki pad klasifikuje bez
otvaranja artefakta; artefakt ostaje dokaz (`playwright-report`, `test-results`, `results.json`).

# Val 5 — treći (puni) e2e prolaz: kontrast, klik na X i mrežna robusnost (2026-10-05)

Puni prolaz (71 test u 36 fajlova, `max_failures=0`, `retries=1`) dao je **62 passed / 6 failed / 2 flaky / 1 skipped**.
Svih šest padova je razvrstano i popravljeno; **nijedan nije regresija iz vala 5**, a tri su bila u frontend kodu.

## 1. Nalazi (uzrok, fajl, linija, uticaj, fix, ozbiljnost)

| # | Nalaz | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-22** | Spec **22** pao u 4 testa: `serious color-contrast` na `/account/notifications` i `/settings` | (a) obavijesti na notifications stranici: `bg-muted/40` + `text-muted-foreground` — izmjereno **3,08:1** (svjetla) i **3,27:1** (tamna); (b) unutar prve obavijesti `Badge tone="success"` (`text-ok` na `bg-success/10` preko tog sloja) — **2,98:1**, zato je axe prijavio `.border-success/30` **samo u svjetloj temi**; (c) SMTP kartica: cijeli informacioni blok pod `pointer-events-none opacity-40` (`frontend/src/components/settings/smtp-email-settings-card.tsx:102`) → **2,30:1** za `text-foreground/90`, **1,80:1** za `text-muted-foreground`, a axe je prijavio 9 elemenata (uključujući `span[data-testid="smtp-provider"]` i info bedž) | Nedostatak AA kontrasta na dvije stranice; sadržaj koji korisnik treba pročitati (npr. konfigurisani provajder) bio je praktično nevidljiv u „isključenom" stanju | (a) obavijesti su na solidnoj površini (`bg-surface`, tri mjesta u `frontend/src/pages/account-notifications-page.tsx:183,188,193`) → **5,85:1 / 6,08:1**, a bedž unutra **5,50:1 / 8,86:1**; (b) `opacity-40` uklonjen, umjesto njega notа „kanal je isključen" (nova i18n `settings.smtp.disabledNote`, bs+en) i **`disabled`** na dugmetu „Uredi detalje" (`smtp-email-settings-card.tsx:155`) — informacija ostaje čitljiva, a onemogućenost nosi kontrola; (c) isti dokazani par (`muted` tekst na `muted/40`) zamijenjen na još dvije lokacije: `services/service-catalog-read-only-banner.tsx:18` i `tickets/ticket-detail-conversation.tsx:97` (tekst ide na `text-foreground`, tint ostaje) | **SREDNJE** (stvarni a11y nalaz, ne test-hack) |
| **D-23** | Spec **14** pao i poslije higijene timera: indikator je pokazivao `T-000184` dok je test tražio `T-000185` | `frontend/src/components/ui/modal.tsx:36` renderuje **X dugme poslije `children`** (tj. poslije footera), pa je `dialog.getByRole('button').last()` u specu kliknuo **zatvaranje** umjesto potvrde `switchConfirm` — dijalog se zatvorio, timer je ostao na prvom tiketu. Zato je ovaj spec padao u **svakom** prolazu (nije flake) | Prebacivanje timera u UI-ju nije bilo pokriveno nijednim prolazom, a pad je izgledao kao greška u mjerenju vremena | `ConfirmDialog` dugmad dobila stabilne `data-testid` (`frontend/src/components/ui/confirm-dialog.tsx:41,49`), spec klikne `dialog.getByTestId('confirm-dialog-confirm')` (`e2e/tests/14-time-tracking.spec.ts:70`) | **SREDNJE** (e2e spec + testabilnost komponente) |
| **D-24** | Spec **11** flaky: `Expected /^\[HD-2026-000123\] /`, `Received "Nova poruka na HD-2026-000123"` | `frontend`… tačnije `backend/src/modules/notifications/email/render-email-message.ts:136–141`: prefiks `[broj] ` dodaje se **samo ako popunjeni subject već ne sadrži broj tiketa**. Ugrađeni BS šablon je `Nova poruka: {{ticketTitle}}`, ali na živom stacku registar šablona može biti izmijenjen, pa je prvi pokušaj vidio subject koji već nosi broj, a retry ugrađeni default | Spec je tvrdio jače od ugovora proizvoda i zavisio od stanja registra šablona na stacku | Tvrdnja provjerava garanciju proizvoda: `expect(normal.subject).toContain('HD-2026-000123')` (`e2e/tests/11-email-templates.spec.ts:44`), uz komentar koji objašnjava pravilo prefiksa | **NISKO** (pretpostavka speca) |
| **D-25** | Specovi **23** i **24** pali s `NETWORK POST /auth/login failed: … UND_ERR_CONNECT_TIMEOUT (api.desk.ba101.top:443, timeout: 10000ms)` | API nije bio dostupan s runnera u trenutku prijave (prolaz traje 57 min; 24 je uspio na retry, 23 nije). Novi dijagnostički sloj (D-16) je tačno imenovao uzrok — ranije bi to bio goli `fetch failed` | Dva speca izgubljena zbog prolaznog mrežnog zastoja, bez ikakvog signala o stanju aplikacije | `helpers/api-client.ts`: politika ponavljanja proširena tako da se **svaki metod** ponovi jednom (2 s) kad je uzrok **connect-faza** (`UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`) — zahtjev nikad nije stigao do API-ja, pa ponavljanje ne može udvostručiti upis; `UND_ERR_SOCKET`/`ECONNRESET` se i dalje ponavljaju samo za `GET` | **SREDNJE** (robusnost harnessa) |
| **D-26** | Spec **18** se i dalje vidljivo preskače (`EMAIL_CHANNEL_DISABLED`) | Stack nema SMTP; ponašanje je namjerno (D-18), ali znači da „pošalji test" i njegov audit zapis **nisu** pokriveni na ovom stacku | Nema skrivenog gubitka pokrivenosti — skip je u sažetku i u `REVIEW_ANALIZA.md` | Nema popravke: ostaje kao otvorena stavka dok se SMTP ne uključi na stacku (tada isti test postaje prava provjera) | **NISKO** (poznato ograničenje okruženja) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Efektivni kontrast (dokaz za D-22) | `node /tmp/contrast-check.mjs` — računa WCAG kontrast nad tokenima iz `frontend/src/index.css`, uključujući alfa slojeve (`bg-muted/40`, `bg-success/10`) i `opacity` | **staro stanje tačno reprodukovano**: 3,08:1 (svjetla) / 3,27:1 (tamna) za obavijest, 2,98:1 za success bedž (samo svjetla — poklapa se s axe nalazom), 2,30:1 i 1,80:1 za `opacity-40` blok; **novo stanje**: 5,85/6,08 za obavijest, 5,50/8,86 za bedž, 5,85/6,08 i 13,75/12,44 za SMTP blok, 5,13/7,13 za info bedž |
| Mrežna politika (dokaz za D-25) | `npx tsc --outDir /tmp/e2eout …` pa `node /tmp/api-retry-check.cjs` (lažni `fetch`) | **5/5**: POST se ponavlja na `UND_ERR_CONNECT_TIMEOUT` i `ECONNREFUSED`, **ne** ponavlja na `UND_ERR_SOCKET`; GET se ponavlja i na `UND_ERR_SOCKET`; poruka imenuje metodu, putanju, uzrok i URL |
| Frontend | `cd frontend && npx tsc -b`; `npm test`; `node scripts/check-theme-contrast.mjs`; `check-a11y-static.mjs`; `check-hooks-order.mjs` | `tsc -b` **0**; vitest **160 fajlova / 653 testa ✅**; kontrast **12 paleta × 23 para unutar praga**; statička a11y pravila **OK**; hooks-order **OK** (452 `.tsx`) |
| e2e | `cd e2e && npx tsc --noEmit -p tsconfig.json`; `node --test scripts/summarize-playwright-json.test.mjs`; `npx playwright test --list` | **0 grešaka**; samotest **12/12**; **71 test u 36 fajlova** |
| Repo | `node scripts/check-client-neutral.mjs`; `node scripts/check-docs-content.mjs` | zeleno; OK (29 stranica, 5 prevoda, 10 provjera) |
| Novi guard protiv povratka D-22 | `node scripts/check-theme-contrast.mjs` (nova provjera **D**) i negativna kontrola: privremeno vraćen `text-muted-foreground` na `bg-muted/40` | guard **pada** s porukom „`text-muted-foreground` na `bg-muted/NN` daje 3,08:1 (svjetla) / 3,27:1 (tamna)"; poslije vraćanja ispravke **prolazi** (0 upotreba) |

## 3. Stanje pokrivenosti poslije ovog prolaza

- **Zeleno i potvrđeno na živom stacku:** 10 (D-20, fiksirano u `f98a29e`), 15 ×3 (D-14), 18 — dio bez pošte, ostalo vidljiv skip (D-26).
- **Popravljeno u ovom prolazu, čeka novi run:** 11 (D-24), 14 (D-23), 22 ×4 (D-22), 23 i 24 (D-25).
- **Neprovjereno ostaje:** 12, 17, 20, 21, 26, 27 — u punom prolazu su **bili zeleni** (62 passed uključuje ih), pa se ne popravljaju; ako neki padne u sljedećem prolazu, ide u trijažu.
- **`NEXT TRIAGE RUN` iz ovog prolaza:** `specs=11,14,22,23,24` — nakon popravki očekivano zeleno; 11 i 24 su bili flaky, pa ih vrijedi vidjeti s `retries=0`.

# Val 5 — četvrti e2e prolaz: ciljani run poslije popravki (2026-10-05)

Ciljani run (17 passed / 2 failed / 0 flaky / 0 skipped, 11,4 min) potvrdio je popravke iz trećeg prolaza:
**spec 11 je zelen** (D-24 — flaky tvrdnja zamijenjena garancijom proizvoda), **spec 22 ×4 zelen** (D-22 — kontrast),
**spec 24 zelen** (D-25). Ostala su dva nova pada, oba bez veze s tim popravkama.

## 1. Nalazi

| # | Nalaz | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-27** | Spec **14** pao na `expect(manual?.durationSeconds).toBe(1800)`, `Received: undefined` — prebacivanje timera je prošlo (D-23 radi), ali ručni unos nije bio u listi | Dva moguća uzroka, oba u specu: (1) **race** — `await expect(getByTestId('time-log-row').first()).toBeVisible()` u `tests/14:92` prolazi i prije spremanja, jer tiket A već ima red od prebačenog timera, a API se čita odmah; (2) **`TIME_LOG_OVERLAP`** — `findOverlappingTimeLog` (`backend/src/modules/tickets/time-tracking/time-log-guards.ts:30–38`) traži `startedAt < endedAt && (endedAt IS NULL \|\| endedAt > startedAt)`, a prozor od 2h unazad (`tests/14:83`) preklapa zaostali timer iz prethodnog runa koji `globalSetup` zatvori **na početku ovog runa** (segment dug satima) | Ručni unos nije bio pokriven nijednim zelenim prolazom; pad je izgledao kao greška mjerenja vremena | Prozor pomjeren na **3 dana** unazad (`tests/14:96`; unutar `maxBackdateDays` defaulta 7 — `settings/definitions/time-tracking-settings.ts:11`) i unos se čeka `expect.poll`-om uz poruku koja imenuje oba sumnjiva uzroka (`tests/14:99–115`); prvo se čeka red s tekstom bilješke, ne „prvi red“ | **SREDNJE** (e2e fikstura) |
| **D-28** | Spec **23** pao s `Test timeout of 90000ms exceeded` — prvi put je stigao do kraja posla | Spec radi **4 axe skena** na teškim stranicama, drugi browser kontekst i **tri prijave** (admin, korisnik u novom kontekstu, „plain“ korisnik za 403) unutar globalnog limita od 90 s (`e2e/playwright.config.ts`); isti obrazac je u suiti već riješen lokalnim budžetom (`tests/20:95,183` — 180 s i 150 s) | Najveći spec u suiti nije mogao završiti na sporom runneru; nije bilo podatka **gdje** je vrijeme otišlo | `test.slow()` (3× → 270 s) i `phase()` markeri u log (`tests/23:33–45`) — sljedeći timeout sam kaže fazu | **SREDNJE** (budžet speca) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Pravilo preklapanja (D-27) | `grep -n findOverlappingTimeLog -A 30 backend/.../time-log-guards.ts` | Uslov `startedAt: { lt: endedAt }` + `OR [{ endedAt: null }, { endedAt: { gt: startedAt } }]` — zaostali timer zatvoren na početku runa preklapa prozor od 2h; 3 dana unazad ne preklapa |
| Prozor unutar pravila | `settings/definitions/time-tracking-settings.ts:11` (`maxBackdateDays.default = 7`), `correct-ticket-time-log.ts:223` | 3 dana < 7 → i unos i kasnija korekcija prolaze validaciju |
| e2e | `cd e2e && npx tsc --noEmit -p tsconfig.json`; `npx playwright test --list` | **0 grešaka**; **71 test u 36 fajlova** |
| Dokumentacija | `node scripts/check-docs-content.mjs`; `node scripts/check-client-neutral.mjs` | OK (29 stranica, 5 prevoda, 10 provjera); zeleno |

## 3. Stanje pokrivenosti poslije četvrtog prolaza

- **Zeleno i potvrđeno na živom stacku:** 10, 11, 15 ×3, 22 (12 testova), 24 — plus 62 testa iz trećeg prolaza.
- **Popravljeno, čeka potvrdu:** 14 (D-27), 23 (D-28).
- **Poznato ograničenje:** 18 — „pošalji test” se vidljivo preskače bez SMTP-a na stacku (D-26).
- **Sljedeći korak:** merge, pa ciljani run `specs=14,23` s `retries=0`; ako je zelen, puni prolaz je formalna kapija.

# Val 5 — peti e2e prolaz: stvarni kontrast i OU opseg u specovima (2026-10-05)

Ciljani run `specs=14,23` (`retries=0`, 0 passed / 2 failed) potvrdio je dvije popravke iz četvrtog prolaza (D-27 i
D-28 rade — spec 14 je prošao prebacivanje timera **i** ručni unos, spec 23 **nije** više pao na budžet), a donio je
**dva nova nalaza**: jedan stvarni bug u proizvodu (D-29) i jednu grešku u e2e fiksturi koja je krila `403` (D-30).
Uz to je očišćeno **16 `no-unused-vars` upozorenja** koje je prijavio `npm run lint` na backendu (E-16).

## 1. Nalazi

| # | Nalaz | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **D-29** | Spec **23** pao na **stvarnom** axe nalazu: `serious color-contrast` na dva dugmeta u `asset-detail` (selektori `.bg-transparent…:nth-child(2)` i `(3)`) | `frontend/src/components/ui/button.tsx` je uz svaku varijantu nosio `disabled:opacity-45`; `variant="outline"` je `bg-transparent`, pa se `text-foreground` miješao s pozadinom **stranice** — izmjereno **2,91:1** (svjetla) i **3,96:1** (tamna). Pogođena dugmad: `frontend/src/pages/asset-detail-page.tsx:133,137` (`disabled={!formReady}`) | Svako tekstualno dugme onemogućeno kroz `disabled` bilo je ispod WCAG AA (4,5:1) — ne samo na `asset-detail`; axe je uhvatio dva primjera | `disabled:opacity-45` zamijenjen tokenima **po varijanti**: primary `disabled:border-border disabled:bg-elevated disabled:text-muted-foreground disabled:shadow-none`, destructive isto bez `shadow-none`, secondary/outline/ghost/link `disabled:text-muted-foreground` (`button.tsx`, uz komentar s izmjerenim brojevima). Isti obrazac uklonjen u `components/settings/email-templates-editor.tsx:256` i `components/templates/variable-palette.tsx:29`. Novi guard: pravilo **6** u `scripts/check-a11y-static.mjs` (`disabled:opacity-*` na dugmetu s tekstom pada, osim `disabled:hidden` i komentara `a11y-disabled:`) + `checkSharedButton()` koji kroz AST provjerava string literale u `components/ui/button.tsx` | **SREDNJE** (pristupačnost) |
| **D-30** | Spec **14** pao na `GET /reports/packs` s **`FORBIDDEN`** (requestId `7f248fae-…`); u specu **23** isti poziv je bio pod `.catch(() => null)`, pa je greška bila **tiho preskočena** | `ReportsController` nosi `@RequireOrganizationalUnitScope({field:'organizationalUnitId'})` za **cijeli kontroler** (`backend/src/modules/reports/reports.controller.ts`), a `dto/report-query.dto.ts` traži `organizationalUnitId`; specovi 14 (`e2e/tests/14-time-tracking.spec.ts:162`) i 23 (`e2e/tests/23-assets.spec.ts:83`) zvali su `/reports/packs` **bez** opsega (specovi 29/30 ga šalju ispravno) | (1) Spec 14 pada bez veze s proizvodom; (2) `.catch(() => null)` u specu 23 pretvarao je `403` u **lažno zelenilo** — asertacija o paketima `asset_inventory`/`asset_expiring` nikad nije izvršena | Oba speca sada šalju scope: `/reports/packs?organizationalUnitId=${firstView.originUnitId}` (`tests/14:162`) i `/reports/packs?organizationalUnitId=${unit.id}` (`tests/23:83`); `.catch(() => null)` uklonjen i zamijenjen pravom asertacijom (`expect(...).toEqual(expect.arrayContaining([...]))`) | **SREDNJE** (e2e fikstura + lažna pokrivenost) |
| **E-16** | `npm run lint` na backendu: **16 upozorenja** `@typescript-eslint/no-unused-vars`, 0 grešaka | 15 nekorištenih importova/varijabli i 1 nekorišten parametar: `principal-context.loader.spec.ts` (`PrincipalContextCacheClient`), `list-audit-logs-query.dto.ts` (`auditLogListDefaultTake`), `authentication.controller.ts` (`authenticationConstants`), `directory-sync.controller.ts` (`Delete`), `notifications-fan-out.service.spec.ts` (`loadEmailChannelConfiguration`), `notifications.fan-out-batch.spec.ts` (`audienceSize`), `create-in-memory-policy-pack-delegates.ts` (`InMemorySlaProfileRecord`), `roles.service.spec.ts` (`shadowTestPrincipal`), `throw-if-slug-constraint-violated.ts` (`PrismaService`), `compute-sla-next-due-at.ts:147` (parametar `state` u `resolveEscalationRules`), `assert-can-decide-ticket-approval.ts` (`authorizationRoleKeys`), `create-in-memory-ticket-attachment-delegate.ts` (`matchesNullableField`), `tickets.close-codes.spec.ts` (`requester`), `tickets.controller.ts` (`TicketMutationContext`), `users.controller.guard.spec.ts` (`AUTHENTICATED_PRINCIPAL_REQUEST_KEY`), `scheduled-jobs.wiring.spec.ts` (`knowledgeBaseReviewReminderJobName`) | Šum u lintu; svaki sljedeći stvarni nalaz se lakše previdi | Sve uklonjeno; `npx eslint .` vraća **0** problema. Prije uklanjanja je `grep -c` potvrdio da svaki simbol nema drugu upotrebu; `resolveEscalationRules` je uz parametar izgubio i argument na pozivu (`compute-sla-next-due-at.ts:117`) | **NISKO** (higijena) |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-05)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Mjerenje kontrasta prije/poslije | `node /tmp/disabled-check.mjs` | staro **2,91:1** (svjetla) / **3,96:1** (tamna) ❌; novo 5,32–5,85 (svjetla) / 5,36–6,49 (tamna) ✅ |
| Guard — negativna kontrola | privremeno vraćen `disabled:opacity-45` u cva string i tekst-dugme u `variable-palette.tsx` | `check-a11y-static` → **exit 1** s porukom (`button.tsx:21` / `variable-palette.tsx:22`); poslije vraćanja → `check-a11y-static: OK` |
| Frontend | `npm ci` (299 paketa), `npx tsc -b`, `npm test` | **0** grešaka; **160 fajlova / 653 testa ✅** |
| Backend lint | `npx eslint . --format json` | **16 → 0** problema |
| Backend tipovi | `prisma generate` + `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| e2e | `npx tsc --noEmit -p tsconfig.json`, `npx playwright test --list` | **0** grešaka; **71 test u 36 fajlova** |
| Backend testovi | `npx jest` | **Nije izvršeno u sandboksu**: ts-jest uz generisani Prisma klijent 7.10 prelazi budžet ovog okruženja (OOM pri `--maxWorkers=4`, ~4 GB RAM-a). Mjerodavan je korisnikov rezultat: **534 passed / 5 skipped**, **2596 passed / 31 skipped**, 59,1 s |

## 3. Stanje pokrivenosti poslije petog prolaza

- **Potvrđeno popravkama iz četvrtog prolaza:** spec 14 (D-27 — prebacivanje timera **i** ručni unos prolaze) i spec 23 (D-28 — nema više timeouta; `phase()` log pokazuje ~53 s).
- **Popravljeno, čeka potvrdu:** 14 (D-30 — scope na `/reports/packs`), 23 (D-29 — kontrast disabled dugmadi).
- **Poznato ograničenje:** 18 — „pošalji test“ se vidljivo preskače bez SMTP-a na stacku (D-26).
- **Sljedeći korak:** ciljani run `specs=14,23` s `retries=0`; ako je zelen, prvi **puni** prolaz je formalna kapija za merge na `master` (radi vlasnik).

# Paket 5.1 — korak 5.1.1: politika lozinke u wizardu i tačna MFA verifikacija (2026-10-06)

Prvi korak paketa 5.1 (`docs/plans/modules/5.1-serverska-provjera-i-audit-trag.md`, §2) zatvara **dva nalaza
`SREDNJE`** koji su do sada bili opisani samo kao preporuka: **M1 #1** (osnivački nalog ne prolazi politiku
lozinke iz paketa 2.1) i **M2 #1** (isključivanje `private.auth.mfa.allowOptional` tiho preskače verifikaciju i
onima koji su faktor već upisali). Uz njih je isporučena i treća, manja stavka istog koraka: **M2 #2** (ekran
prisilne promjene lozinke tvrdi „najmanje 12 znakova“ i kad je politika stroža).

## 1. Šta je promijenjeno (dokaz u kodu)

| Nalaz | Šta je urađeno | Dokaz (fajl, funkcija) |
|---|---|---|
| **M1 #1** | Wizard više ne validira lozinku „12–128 i nije email“, nego istom provjerom kao svaki lokalni nalog: `checkPassword` iz `security/password-policy.ts` (dužina iz postavke, lista najčešćih lozinki, riječi organizacije, dijelovi email adrese). Političke granice su `max(12, policy.passwordMinLength)` i `min(128, policy.passwordMaxLength)`. Nova greška **`PASSWORD_POLICY_VIOLATIONS`** (HTTP 400) nosi `violations: string[]`. | `install-super-admin-password-policy.ts` (`toInstallPasswordPolicy`, `describeInstallPasswordPolicy`, `installSuperAdminDefaultPasswordPolicy`), `validate-install-super-admin-credentials.ts` (`validateInstallSuperAdminCredentials`), `create-install-super-admin.ts`, `install-super-admin.service.ts` (`getPasswordPolicy`), `map-install-super-admin-error.ts` |
| **M1 #1 (UI)** | Korak **SuperAdmin nalog** čita politiku s `GET /install/password-policy` i iz nje postavlja `minLength`/`maxLength`; prekršena pravila prikazuje kao listu (isti mapirač kao prisilna promjena), a ako se politika ne može pročitati koristi ugrađene defaulte i pušta serveru odluku. | `frontend/src/services/install-api.ts` (`loadInstallPasswordPolicy`), `frontend/src/components/install/install-super-admin-step.tsx`, `frontend/src/components/auth/password-feedback.ts` (`readPasswordFeedbackKeys` prima i novi kod), `install.controller.ts` (`@Get('password-policy')`) |
| **M2 #1** | Odluka je razdvojena: `resolveMfaFlow` vraća `verify` čim je faktor upisan (bez obzira na `mfaAllowOptional`), `enroll` samo kad je zahtjev `required` i faktora nema, a `none` kad nalog nema lokalnu lozinku. `allowOptional=false` time zaustavlja **nove** upise, ne verifikaciju postojećih. | `backend/src/modules/authentication/security/account-security-rules.ts` (`MfaFlow`, `resolveMfaFlow`), `security/mfa.service.ts` (`flowFor`), `authentication.service.ts` (`continueAfterPassword`) |
| **M2 #2** | Odgovor prijave nosi `passwordMinLength` iz politike; `ChangePasswordForm` iz njega uzima granicu i tekst upute (prije je bio hardkodiran `12`). | `authentication.types.ts` (`MustChangePasswordLoginResponse`), `authentication.service.ts` (`mustChangePassword`), `frontend/src/services/auth-api.ts`, `lib/session/use-session.ts`, `components/auth/change-password-form.tsx`, `pages/login-page.tsx` |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-06)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Backend tipovi | `cd backend && npx tsc --noEmit -p tsconfig.json` | **0** grešaka |
| Backend testovi — instalacija | `npx jest src/modules/install` | **25 suita / 112 testova ✅** (novi: `validate-install-super-admin-credentials.spec.ts` — 10 testova; `install-super-admin.service.spec.ts` — politika iz postavki, pad čitanja postavki, `violations` u grešci) |
| Backend testovi — MFA/prijava | `npx jest src/modules/authentication/authentication.service.spec.ts src/modules/authentication/security/account-security-primitives.spec.ts` | **12/12** i **26/26 ✅** (novi: upisan faktor uz `allowOptional=false` → `verify`) |
| Backend lint | `npx eslint src/modules/install src/modules/authentication` | **0** problema |
| Frontend tipovi | `cd frontend && npx tsc -b` | **0** grešaka |
| Frontend testovi | `npx vitest run` | **161 fajl / 658 testova ✅** (novi: `src/components/auth/password-feedback.spec.ts` — 5 testova) |
| Guardovi | `node scripts/check-*.mjs` (9 skripti) | svi **OK** |
| Dokumentacija | `node scripts/generate-docs-content.mjs && node scripts/check-docs-content.mjs` | **29 stranica / 5 prevoda / 10 provjera — OK** |

**Nije izvršeno u sandboksu:** puni e2e prolaz (nema živog stacka) i puna backend jest suite (OOM) — mjerodavan je
vlasnikov rezultat, kao i do sada.

## 3. Dokumentacija

- `docs/user-guide/instalacija.md` — korak 1, tabela validacija i tabela grešaka opisuju politiku i
  `PASSWORD_POLICY_VIOLATIONS`; uklonjeno ograničenje „za SuperAdmina se provjerava samo dužina“ (više ne važi).
- `docs/user-guide/prijava-i-mfa.md` i `docs/user-guide/en/prijava-i-mfa.md` — uklonjena oba zastarjela
  ograničenja (upisani faktor uz isključenu postavku; hardkodiranih „12 znakova“), dopunjena tabela postavki i
  tabela pravila lozinke.
- `DOCS_CHANGELOG.md` — unos za ovaj korak (v. tabelu tamo).

## 4. B1 · M4 B2 — pregled uticaja je serverska kapija, uz obavezan razlog (isti korak)

| Šta je urađeno | Dokaz (fajl, funkcija) |
|---|---|
| Pregled izdaje potpisanu potvrdu: `base64url(payload).base64url(HMAC-SHA256)` nad `private.auth.jwtSigningSecret`, TTL **15 minuta**, vezana za `roleKey`, **tačan skup permisija** (sortiran, bez duplikata) i `actorUserId`; poređenje potpisa je `timingSafeEqual` | `role-permission-preview-token.ts` (`signRolePermissionPreviewToken`, `verifyRolePermissionPreviewToken`), `preview-role-permission-impact.ts` |
| `PUT /roles/:roleKey/permissions` zahtijeva `previewToken` i `reason` (oba `@IsNotEmpty`, `reason` ≤ 500); bez poklapanja → `409 PREVIEW_REQUIRED`, istekao/tuđi/drugi skup → `409 PREVIEW_STALE` | `dto/replace-role-permissions.dto.ts`, `replace-role-permissions.ts`, `rbac.error.ts`, `map-rbac-error.ts`, `roles.controller.ts`, `roles.service.ts` (`loadPreviewSigningSecret` — bez secreta upis ostaje zatvoren) |
| Audit `metadata` nosi `reason` i `previewedAt` (uz postojeći diff) | `replace-role-permissions.ts` (`appendAuditLog`) |
| UI: polje **Razlog promjene** (obavezno, ≤ 500) u pregledu; dugme **Potvrdi i sačuvaj** neaktivno bez razloga; izmjena izbora zatvara pregled; novi kodovi grešaka mapirani na poruke | `frontend/src/components/rbac/permissions-preview-panel.tsx`, `permissions-panel.tsx`, `frontend/src/services/rbac-api.ts`, `frontend/src/lib/rbac/map-rbac-error.ts`, i18n `permissions.*` |

**Dokazi B1:** `npx jest src/modules/rbac` → **5 suita / 23 testa ✅** (novi
`role-permission-preview-token.spec.ts` — 6 testova: potpis, redoslijed/duplikati, nevažeći i tuđi potpis,
izmjena tijela nakon potpisa, istek, tuđi skup/akter; `roles.service.spec.ts` — 5 novih: bez tokena, istekao,
drugi skup, tuđi pregled, bez razloga, uz postojeći test da audit nosi `reason`); `npx tsc --noEmit` → 0;
`npx eslint src/modules/rbac` → 0.

## 5. Šta ostaje otvoreno u paketu 5.1

- **Korak 5.1.2 — M3 B1–B4:** implementiran; ciljani Jest skup + lint + dokumentacija prolaze. Naknadni build s
  generisanim Prisma klijentom prijavio je tri direktne TS greške koje su ispravljene poslije `cd3597c`.
  Iako lokalni checkout i dalje nema `src/generated/prisma/{client,enums}`, post-fix backend build/lint/full test
  potvrđeni su u CI runu [#37501318879](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37501318879)
  na `b1b7158`.
- **Korak 5.1.3 — M6 B1/B3/B4/B5:** backend/frontend implementacija i puni CI na `b1b7158` prošli su, ali
  E2E je bio preskočen. CI run [#37506328325](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37506328325)
  bio je na `master`/`b1b7158` i koristio staru četverotestnu verziju. Noviji serverski run s pet testova prošao
  je **3/5**; preostala dva su pala s `ORIGIN_UNIT_REQUIRED`. D1 payload je već imao `impact`/`urgency`, ali nije
  poslao `originUnitId`; D3 create-ticket helper imao isti propust. Oba testa sada čitaju korijenski OJ i šalju
  njegov ID. TypeScript i Playwright listing prolaze; potreban je novi serverski runtime prolaz svih 5 testova.
- **Korak 5.1.4 — M7 i M10** — ostaje za naredni korak iz §3–§5 plana.
- **Prvi puni e2e prolaz** ostaje kapija za zatvaranje 5.1.3 i merge na `master`; ako `E2E_SUPERADMIN_PASSWORD`
  ne prolazi novu politiku, `POST /install/super-admin` sada vraća `PASSWORD_POLICY_VIOLATIONS` (v. `e2e/README.md`).

# CI-3 — datumi u manifestu oborili `frontend` job (2026-10-06)

Prvi push izmjena iz #11 (novi CI raspored) pokazao je crven `frontend` job, na koraku „Check docs content
and mirror sync". Ista provjera u `docs-guard` jobu je prošla — razlika je u dubini klona.

## 1. Nalaz

| Nalaz | Opis | Uzrok (fajl, linija) | Uticaj | Fix | Ozbiljnost |
|---|---|---|---|---|---|
| **CI-3** — `[sinhronizacija] manifest.json se razlikuje — pokrenite generator` u `frontend` jobu | `frontend` (pun checkout, `fetch-depth: 0`) pada, `docs-guard` (plitak checkout) prolazi na istoj provjeri; razlikuju se **samo** datumi u `manifest.json`, svi `.md` fajlovi ogledala su identični | `scripts/generate-docs-content.mjs` (`gitUpdatedAt`: `git log -1 --format=%cs -- <fajl>`) — datum zavisi od (a) dubine klona i (b) trenutka generisanja; ogledalo je posljednji put generisano iz **plitkog** klona **prije** commita stranica 5.1.1, pa je `manifest.json` zadržao stare datume (15× `2026-10-04`, 14× `2026-10-05`), a `check-docs-content.mjs` ih je u punom klonu poredao strogo (poznata CI-2 zamka: „ogledalo se mora regenerisati **poslije** commita stranica") | Kapija je crvena bez greške u kodu ili sadržaju; svaka izmjena ogledala nastala iz plitkog klona obara CI | Datumi su izašli iz kapije: `sameManifestIgnoringDates` se primjenjuje u **svim** klonovima, nova `differingUpdatedAt` imenuje stranice koje kasne i ispisuje napomenu (vidljiva u CI izlazu); ostalo u manifestu (naslovi, dio, redoslijed, role, TOC, `wordCount`, `source`, `englishTitle`) i dalje mora biti identično. Za tačne datume: `git fetch --unshallow` + generisanje poslije commita stranica | **VISOKO** |

**Zašto kapija ipak ostaje kapija:** razlika u datumima se ne guta — ispisuje se kao napomena s brojem i imenima
stranica (`scripts/check-docs-content.mjs`, `checkSync`), pa se u CI izlazu vidi šta osvježiti; padaju samo
razlike u stvarnom sadržaju manifesta (`sameManifestIgnoringDates` vrati `false`).

## 2. Dokazi (izvršeno u ovom okruženju)

| Provjera | Komanda / način | Rezultat |
|---|---|---|
| Test logike kapije | `node --test scripts/check-docs-content.test.mjs` | **9/9** (novi test „razlika u datumima se imenuje po stranicama") |
| Kako se kvar vidi u punom klonu | stara verzija skripte u privremenom repou (kopija repoa, `git init` + jedan commit → `is-shallow-repository: false`), `manifest.json` nosi `2026-10-05`, git za isti fajl `2026-10-06` | **exit 1**: `[sinhronizacija] manifest.json se razlikuje — pokrenite generator` — tačno poruka iz `frontend` joba |
| Isti repo, nova skripta | `node scripts/check-docs-content.mjs` | **exit 0**, napomena: `manifest.json: razlikuju se samo datumi (29: pocetak-rad, instalacija, prijava-i-mfa, precice-i-pristupacnost, pregled-modula i još 24) — osvježi ih u punom klonu poslije commita stranica: node scripts/generate-docs-content.mjs`; svih 29 stranica odstupaju zato što privremeni repo ima jedan commit — u stvarnom repou odstupaju samo stranice mijenjane poslije zadnjeg generisanja |
| Kapija i dalje pada na stvarnu razliku | isti repo, u manifestu promijenjen **naslov** jedne stranice | **exit 1**: `[sinhronizacija] manifest.json se razlikuje — pokrenite generator` |
| Stvarna provjera u repou | `node scripts/check-docs-content.mjs` | OK (29 stranica, 5 prevoda, 10 provjera) |

## 3. Šta ostaje

- Datumi u `backend/content/docs/manifest.json` i dalje nose zadnje poznate vrijednosti (`2026-10-04`/`2026-10-05`);
  osvježavaju se u klonu s punom istorijom, **poslije** commita stranica. Kapija to ne traži.

# Paket 5.1 — korak 5.1.2: M3 B1–B4 — korisnici, OJ i grupe (2026-10-06)

Korak zatvara četiri `SREDNJE` nalaza M3. **Implementacija, ciljani testovi, lint i dokumentacijske provjere prolaze;
post-fix backend build nije potvrđen.** Prvi build u ovom checkoutu javio je 2874 kaskadnih TS grešaka jer nedostaje
`src/generated/prisma/client` (prva je TS2307; Prisma delegate tipovi takođe nisu dostupni). Naknadni build s
generisanim Prisma klijentom prijavio je tri TS dijagnostike: jednu zbog tipa default poruke konstruktora
`OrganizationalUnitError`, a dvije zbog nepovezanog union tipa vrijednosti po poljima u updateu korisnika.
Ispravke su u `backend/src/modules/organizational-units/organizational-unit.error.ts` (tip `message: string`)
i `backend/src/modules/users/update-user.ts` (tip polja `UserUpdateData`). Generisani output i dalje nedostaje u ovom
checkoutu pa konačni Nest build nije mogao biti ponovljen; ranije preuzimanje Prisma `schema-engine` palo je na TLS.

## 1. Zatvoreni nalazi

| Nalaz | Šta je implementirano | Dokaz u kodu |
|---|---|---|
| **M3 B1** | `countOrganizationalUnitDeleteBlockers` vraća svaki ne-nulti blocker `{ kind, count }`; direktni i ručni-kataloški delete vraćaju 409 s detaljima. Korisnički nalozi i kataloški korisnici/grupe su blokatori; ne brišu se. Nepoznati Prisma `P2003` je globalno 409 `RESOURCE_IN_USE` bez otkrivanja FK detalja. | `backend/src/modules/organizational-units/count-organizational-unit-delete-blockers.ts:4` (`countOrganizationalUnitDeleteBlockers`), `delete-organizational-unit.ts:32` (`deleteOrganizationalUnitInTransaction`), `directory-sync/delete-manual-directory-organizational-unit.ts:14`, `organizational-unit.error.ts:15–51`, `map-organizational-unit-error.ts:10–52`, `common/request-context/format-error-response.ts:28–30,49–56,141–148` |
| **M3 B2** | Delete čita OJ-scoped `UserRole` prije cascade-a, audit bilježi broj i pogođene `userId`; response nosi `ROLE_ASSIGNMENTS_REMOVED`, a service best-effort invalidira njihove principal cacheve. | `delete-organizational-unit.ts:32–95`, `organizational-units.service.ts:63–102`, `directory-sync/manual-directory-catalog.service.ts:66–87`, `organizational-unit-delete.types.ts:21–37` |
| **M3 B3** | Mutacije korisnika, OJ, manual OJ kataloga i grupa pišu audit kroz per-module helper u istoj transakciji; metadata ne sadrže lozinku/hash, directory ID ili MFA tajne. Audit failure odbacuje transakciju (rollback provjeren testnim transactional fakeom za user create/update/delete, password update, OU create/update/delete/mapping, group membership i manual delete). | `users/record-user-change.ts:14`, `organizational-units/record-organizational-unit-change.ts:11`, `groups/record-group-change.ts:13`; primjeri: `users/create-user.ts:43–72`, `users/update-user.ts:47–79`, `groups/add-group-member.ts:31–42`, `organizational-units/assign-user-organizational-unit.ts:31–54` |
| **M3 B4** | Reset ne-lokalnog naloga auditira odbijeni pokušaj i baca `DIRECTORY_ACCOUNT_NOT_LOCAL` (409); uspješan lokalni reset bilježi safe metadata u transakciji s promjenom lozinke, bez same tajne. | `users/reset-user-temporary-password.ts:12–73`, `users/map-users-error.ts:23–36`, `users/issue-temporary-password-for-user.ts:18–63`; `reset-user-temporary-password.spec.ts`, `issue-temporary-password-for-user.spec.ts` |

## 2. Dokazi (izvršeno u ovom okruženju 2026-10-06)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Ciljani backend testovi | `cd backend && npx jest --config=/tmp/jest-agent.config.cjs --runInBand` nad 24 speca (OU, manual catalog, groups, users, install seed, P2003) | **24/24 suita, 101/101 test ✅**. Uključuje regresije iz prijavljenog pada: manual-delete spec, install-seed reuse/service/rollback i OU hierarchy/provider-independence. Privremeni config koristi ts-jest `diagnostics: false` jer Prisma client/enums nedostaju; ovo nije backend typecheck ni puni test suite. |
| Test rollbacka audita | `organizational-units.service.spec.ts`, `users/create-user.spec.ts`, `update-user.spec.ts`, `delete-user.spec.ts`, `issue-temporary-password-for-user.spec.ts`, `groups.service.spec.ts`, `directory-sync/delete-manual-directory-organizational-unit.spec.ts`, `install-seed.rollback.spec.ts` | Audit failure ostavlja transactional fake u prethodnom stanju i ne pokreće post-commit password delivery/cache invalidation. |
| Popravka prijavljenih Jest regresija | `delete-manual-directory-organizational-unit.spec.ts`, `install/create-in-memory-install-seed-prisma.ts`, `organizational-units/create-in-memory-organizational-unit-prisma.ts` | Testni `delete` double prihvata Prisma `{ where }` argument; install/OU in-memory transakcije sada modeliraju audit log i `$executeRaw`, uz rollback audit redova. |
| Backend lint | `cd backend && npm run lint` | **0 ESLint problema ✅** |
| Backend build/typecheck | `cd backend && npm run build` | Prvi lokalni pokušaj: 2874 kaskadnih grešaka zbog nedostajućeg Prisma outputa. Build s generisanim klijentom potom je prijavio tri direktne greške; sve tri su ispravljene (message tip konstruktora i dva polja `UserUpdateData`). **U ovom checkoutu nema generisanog klijenta pa uspješan post-fix build nije potvrđen**; raniji `db:generate` je pao na TLS preuzimanju engine-a. |
| Frontend | `cd frontend && npm run build` | **Prošlo:** `tsc -b && vite build`; Vite samo upozorava na chunk veći od 500 kB. |
| Dokumentacija | `node scripts/check-docs-content.mjs && node scripts/generate-docs-content.mjs --check` | **29 stranica / 5 prevoda / 10 provjera; ogledalo sinhronizovano ✅**. Tri korisničke `updatedAt` izmjene u manifestu sačuvane su. |
| Diff higijena | `git diff --check` | **Prošlo ✅** |

**Nije izvršeno:** puni backend Jest suite (generated Prisma output nedostaje) i e2e prolaz (nije zahtjev ovog koraka; puni e2e i dalje ostaje release gate). Target run mocks enum/client runtime u pojedinim specovima i ne zamjenjuje stvarni generated Prisma build.

## 3. Dokumentacija

- `docs/user-guide/korisnici-oj-i-grupe.md` — tipizirani blockeri, očuvanje korisničkih naloga, role warning, audit i B5–B7 kao preostala ograničenja.
- `docs/user-guide/uloge-i-permisije.md` — uklonjeni zastarjeli navodi o RBAC preview/reason i opisan warning za OJ-scoped dodjele.
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` (T23/T24/T26), `.cursor/docs/matrices/organizational-units/**`, `.cursor/docs/matrices/directory-sync/**`, `DOCS_CHANGELOG.md` i „Šta je novo“ ogledalo.

# Paket 5.1 — korak 5.1.3: M6 B1, B3, B4 i B5 — serverska validacija forme i schema-backed tiket (2026-10-06)

Ovaj korak implementira odobrene odluke iz `docs/plans/modules/5.1-serverska-provjera-i-audit-trag.md` §3.4.
M6 B2 je već zatvoren u valu 2; B6–B9 i pitanje `schemaRegistryJson` ostaju izvan ovog koraka. Pri pregledu D3
pronađena je i zatvorena nužna UI rupa: kad su forme uključene, ali aktivna verzija nije obavezna, create ekran je
ranije blokirao nastavak jer nije znao vrijednost `requireVersionOnTicket`; service-form response sada izlaže i taj
flag uz `formsEnabled`.

## 1. Šta je urađeno

| Nalaz / odluka | Implementacija | Dokaz u kodu |
|---|---|---|
| **M6 B1 — serverska validacija `formData`** | Novi čisti validator odbija neobjektni payload, nepoznate ključeve i vrijednosti pogrešnog tipa/opsega; podržava required, dužine, regex, numeric/integer/min/max, multiselect broj stavki i osnovnu email provjeru. Create validira puni objekat; update validira samo poslani patch, pa required vrijednost koja se briše ne prolazi. `FORM_DATA_INVALID` vraća `details.fields[]` bez echo-a vrijednosti i UI mapira `REQUIRED`/`INVALID` na postojeće poruke. | `backend/src/modules/service-catalog/validate-service-form-data.ts` (`validateServiceFormData`), `backend/src/modules/tickets/create-ticket.ts`, `update-ticket.ts`, `ticket-error-messages.ts`; `frontend/src/lib/tickets/map-service-form-data-error.ts`, `create-ticket-form.tsx` |
| **M6 B3 — lifecycle kapija** | `ACTIVE` se odbija prije upisa ako nema aktivne forme; HTTP kod je 409, greška `NO_ACTIVE_FORM_VERSION`. | `backend/src/modules/service-catalog/transition-service-lifecycle.ts` (`transitionServiceLifecycle`), `map-service-catalog-error.ts`; `service-catalog.lifecycle.spec.ts` |
| **M6 B4 — konfiguracija formi** | `enabled=false` vraća `formVersionRef: null`; uključeno + opcionalno uzima aktivnu verziju ako postoji, inače `null`; required bez verzije zadržava `FORM_VERSION_REQUIRED`. `GET /services/:serviceId/form` izlaže `formsEnabled` i `requireVersionOnTicket`, create UI skriva formu kad je isključena i pušta tiket bez aktivne verzije samo kad je opcionalna. `Ticket.formVersionId` je nullable uz migraciju. | `backend/src/modules/tickets/resolve-create-form-version-ref.ts`, `ServiceFormsConfigurationLoader`, `service-forms.service.ts`, `to-service-form-response.ts`, `frontend/src/components/tickets/create-ticket-form.tsx`, `create-ticket-fields.tsx`, `frontend/src/lib/tickets/build-create-ticket-input.ts`; `backend/prisma/migrations/20270313090000_ticket_form_version_optional/migration.sql` |
| **M6 B5 — čitanje i prikaz prema verziji** | Dodan read-only `GET /tickets/:ticketId/form`; isti `getTicket` visibility gate kao detalj; vraća verziju, šemu i vrijednosti ili nullable ref/schema bez forme. UI koristi labele, nazive opcija, bool/numeric tipove i odbrambeni raw-key fallback. Uklonjeni mrtvi `bindTicketFormVersionRef` i pripadajući spec koji je upisivao probni tiket. | `backend/src/modules/tickets/tickets.controller.ts`, `tickets.service.ts#getFormById`, `backend/src/modules/service-catalog/resolve-ticket-form-version.ts`; `frontend/src/pages/ticket-detail-page.tsx`, `use-ticket-form.ts`, `ticket-form-data-view.tsx`, `format-ticket-form-data.ts` |
| **E2E regresije (D1/D3)** | Spec 15 odbija `formData` izvan šeme s HTTP 400 `FORM_DATA_INVALID`; D3 scenario isključuje `private.ticket.forms.enabled` kroz `withSettings`, potvrđuje da UI skriva „Dodatne informacije“ i da tiket vraća `formVersionRef: null`/`schema: null`. I postojeći unrouted-target scenario sada vraća tačno prethodnu/zadanu postavku umjesto da je resetuje na prazan string. | `e2e/tests/15-workflow-unrouted-realtime.spec.ts`, `e2e/helpers/create-ticket.ts`, `e2e/helpers/assets.ts#withSettings` |

## 2. Provjere (izvršene u ovom okruženju)

| Provjera | Komanda | Rezultat |
|---|---|---|
| Backend ciljano — katalog i tiket forme | `cd backend && npx jest --config=/tmp/jest-agent.config.cjs --runInBand` nad 12 spec fajlova (service form resolver/lifecycle/config/validator/read; ticket create/update/config/read/service/reopen/split) | **12/12 suita, 48/48 testova ✅**. Privremeni ts-jest config koristi `diagnostics:false`, pošto generated Prisma client/enums nisu u checkoutu; nije backend typecheck ni puni Jest suite. |
| Frontend ciljani Vitest | `cd frontend && npx vitest run src/lib/tickets/{format-ticket-form-data,map-service-form-data-error,build-create-ticket-input,map-ticket-error,validate-service-form}.spec.ts src/lib/services/{ensure-service-form,map-service-catalog-error}.spec.ts` | **7/7 fajlova, 18/18 testova ✅**; uključuje schema labels/options, bool/number, unknown-key fallback, error mapping i opcionalnu verziju pri kreiranju. |
| Frontend build | `cd frontend && npm run build` | **Prošao:** `tsc -b && vite build`; Vite ostavlja samo upozorenje za chunk veći od 500 kB. |
| Backend ciljano lint | `cd backend && npx eslint` nad izmijenjenim `service-catalog`/`tickets` M6 fajlovima | **Exit 0**, bez lint grešaka. |
| Backend build/typecheck | `cd backend && npm run build`; CI workflow | Lokalni build je bio blokiran nedostajućim `backend/src/generated/prisma/client` i `enums` (2871 kaskadna TS dijagnostika). Naknadni CI run [#37501318879](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37501318879) na `b1b7158` uspješno je završio backend build/lint/full test; taj run prethodi novom E2E-only scenariju opisanom ispod. |
| E2E statička provjera | `cd e2e && npx tsc --noEmit && npx playwright test tests/15-workflow-unrouted-realtime.spec.ts --list` | TypeScript provjera prolazi; aktuelni sesijski spec učitava 5 testova, uključujući D3. |
| E2E runtime — prethodne verzije | GitHub [run #37506328325](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37506328325) na `master`/`b1b7158`; korisnikov serverski report | GitHub E2E job pao na staroj četverotestnoj verziji; kasniji server run izvršio je 5 testova (**3 prošla, 2 pala**). Oba neuspjeha su `ORIGIN_UNIT_REQUIRED`: D1 payload i D3 kreiranje tiketa nisu slali `originUnitId`. Spec je ispravljen da ga učita iz `/organizational-units/tree` i šalje u oba zahtjeva; novi runtime prolaz je još potreban. |
| Dokumentacija | `node scripts/check-docs-content.mjs`, `node --test scripts/check-docs-content.test.mjs`, `node scripts/generate-docs-content.mjs --check`, `node scripts/check-client-neutral.mjs` | **OK:** 29 stranica, 5 prevoda, 10 provjera; **9/9** skript testova; ogledalo sinhronizovano; nema klijentski specifičnih naziva. |

## 3. Dokumentacija

- `docs/user-guide/katalog-usluga-i-forme.md` — uklonjene stare tvrdnje za B1–B5; dodani serverska provjera,
  lifecycle `409`, settings matrica i samo ograničenja potvrđena u implementaciji. FAQ bs/en je također poravnat.
- `docs/user-guide/tiketi.md` — create/update validacija, `GET /tickets/:ticketId/form`, ista vidljivost kao detalj,
  null forma i schema-backed prikaz.
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` — T36–T39 ažurirane, dodat T104.
- `docs/user-guide/sta-je-novo.md` — kratki korisnički sažetak.
- `DOCS_CHANGELOG.md` — ovaj korak i izvedene dokumentacijske promjene evidentirani.
- Ogledala `backend/content/docs/` regenerisana su; guard je prošao (29 stranica, 5 prevoda, manifest sinhronizovan).

## 4. Šta ostaje otvoreno

- B6–B9 iz §M6 nisu dio 5.1.3.
- Serverski browser run je izvršio aktuelni petotestni spec: 3 prošla, 2 pala s `ORIGIN_UNIT_REQUIRED`. Uzrok su bile testne fiksture bez `originUnitId`, ne odbačen `formData`; ispravka sada šalje korijenski OJ u oba zahtjeva. Ostaje ponovni runtime prolaz svih 5 testova.
- GitHub run [#37506328325](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37506328325) bio je na starom `master`/`b1b7158` (4 testa), a CI run [#37501318879](https://github.com/mudzy992/help-desk-enterprise/actions/runs/37501318879) je preskočio E2E; nijedan ne provjerava ispravljeni petotestni spec.
- M6 unos u „Šta je novo“ već postoji i ogledalo je sinhronizovano; duplikat nije potreban. Nakon izmjena plana/evidencije ponovo se izvršavaju docs guard i `git diff --check`.
