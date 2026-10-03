# DOCS_CHANGELOG — šta se mijenja u dokumentaciji i zašto

> Vodi se **modul po modulu**, uporedo sa `REVIEW_ANALIZA.md` (dokaz u kodu) i izmjenama samih dokumenata.
> Jedan unos = jedan modul: **dodato / izmijenjeno / uklonjeno / ostaje otvoreno**, sa razlogom.
>
> Pravilo: dokumentacija opisuje samo ono što stvarno postoji i radi. Ono što nije provjereno nosi `[NEJASNO]`.
> Nalazi u `docs/plans/**` se **ne ispravljaju** u ovoj fazi; ovdje se samo evidentiraju (odluka vlasnika,
> 2026-10-03).

## Pregled

| # | Datum | Modul | Dokumenti | Sažetak |
|---|---|---|---|---|
| M1 | 2026-10-03 | Instalacija (prvi start) | `user-guide/instalacija.md` (nov), `TEZE` (+T15–T17) | Instalacija prvi put dokumentovana |
| M2 | 2026-10-03 | Prijava i MFA | `user-guide/prijava-i-mfa.md` (nov), `TEZE` (+T18–T22) | Prijava, drugi faktor i sesije prvi put dokumentovani |
| — | 2026-10-03 | Opšti nalazi | ovaj dokument | Zastarjeli navodi u `docs/plans/**` evidentirani, ne dirani |

---

## M1 — Instalacija (prvi start) · 2026-10-03

**Zašto:** modul uopšte nije bio dokumentovan, a jedini je korak bez kojeg se aplikacija ne može pokrenuti. RAW ga
izričito traži (`RAW_PROJECT.md:1063`). Analiza: `REVIEW_ANALIZA.md` §M1.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/instalacija.md` (novo) | Cijela stranica: kome je namijenjena, preduslovi (`INSTALL_TOKEN`), šest koraka sa tačnim nazivima dugmadi, polja i validacije, kodovi grešaka, poznata ograničenja, veze na `ops/COOLIFY.md` | `install.controller.ts:45,64–129`; `install-token.ts:13,19,44–60`; `validate-install-super-admin-credentials.ts:16–29`; `validate-install-smtp.ts`; `install-seed.constants.ts:3–11`; `addon-catalog.ts`; `install-page.tsx:27–33`; i18n `install.*` (bs) |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T15** — prvi SuperAdmin je uvijek lokalni (break-glass), i kad je izabran Entra; **T16** — wizard se otvara samo uz `INSTALL_TOKEN`; **T17** — nakon „Završi“ koraci instalacije su zaključani i mijenjaju se kroz Settings | `create-install-super-admin.ts:46–70`; `install-token.ts`; `is-install-wizard-mutation-locked.ts:7–10,35` |

### Izmijenjeno

- Ništa. Nijedan postojeći dokument nije tvrdio nešto netačno o instalaciji (teme nije bilo), pa nije bilo
  ispravki. Postojeći fajlovi `docs/user-guide/*` nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW upućuje na `.cursor/docs/04-install-wizard.md`; taj fajl ne postoji u repou (`.cursor/docs/` sadrži
   `theme.md`). Ako postoji kod izvornog šablona, vrijedi ga uvesti u `docs/` — odluka vlasnika.
2. Polja za AD u wizardu upisuju vezu, ali stvarno čitanje iz AD-a zavisi od `private.auth.adRead.*` postavki;
   tačan tok se potvrđuje u M3 (Korisnici/OJ/grupe) i tada se dopunjuje stranica.

---

## Opšti nalazi — zastarjeli navodi u `docs/plans/**` (evidentirano, ne dirano)

Odluka vlasnika (2026-10-03): ove tvrdnje ostaju kakve jesu; ne mijenjaju se u Fazi 2. Zapisujem ih ovdje da se ne
izgube i da se riješe kad bude vrijeme za `docs/plans/**`.

| Fajl : linija | Tvrdnja | Stvarno stanje (dokaz) |
|---|---|---|
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:99` | 1.8: „LDAPS provider i Entra login tok ne postoje“ | Postoje `backend/src/modules/directory-sync/ldaps/` (24 fajla, uključujući `directory-full-sync.service.ts`) i `authentication/entra-*.ts`; dizajn 1.8 ih i opisuje kao implementirane |
| `docs/plans/modules/3.3-analiza-stanja-2026-10-01.md:59` | „korisnički vodič `docs/user-guide/problemi.md` ❌ ne postoji“ | `docs/user-guide/problemi.md` postoji (49 linija) |
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:222` | 4.1 „čeka odobrenje“ | 4.1 implementiran i deployan; A9 prelazak u toku (handoff `docs/plans/HANDOFF-4.1-A9.md`) |

---

## M2 — Prijava i potvrda u dva koraka (MFA) · 2026-10-03

**Zašto:** najvažniji korisnički tok (ulaz u aplikaciju) nije bio dokumentovan nijednim fajlom, iako je RAW
izričito traži (`RAW_PROJECT.md:894–902`) i iako paket 2.1 dodaje TOTP, rezervne kodove i registar sesija.
Analiza: `REVIEW_ANALIZA.md` §M2.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/prijava-i-mfa.md` (novo) | Prijava (lokalna i Microsoft), prisilna promjena lozinke, upis i verifikacija potvrde u dva koraka, rezervni kodovi, stranica **Sigurnost naloga**, administratorski **Reset MFA** i **Odjavi sve sesije**, tabela politike iz Admin → Postavke, poruke grešaka i poznata ograničenja | `authentication.controller.ts:64–182`; `authentication.service.ts:204–271`; `security/mfa.service.ts`; `security/totp.ts:8–13`; `settings/definitions/account-security-settings.ts`; `pages/login-page.tsx:30–48`; `pages/account-security-page.tsx`; `i18n` `session.*`, `auth.*`, `account.security.*` |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T18** obavezan drugi faktor (SUPER_ADMIN uvijek, ADMIN po postavci); **T19** redoslijed lozinka → promjena → MFA i rokovi međukoraka; **T20** rezervni kodovi se prikazuju jednom i jednokratni su; **T21** Entra nalozi koriste Microsoftov drugi faktor; **T22** brojač neuspjelih prijava | `security/account-security-rules.ts:16–22`; `authentication.service.ts:204–271`; `authentication.constants.ts:7,11`; `security/recovery-codes.ts`; `login-attempt-limiter.ts:17–30` |
| `REVIEW_ANALIZA.md` §M2 | Nalazi (detalji i dokazi u fajlu) | isto |

### Izmijenjeno

- Ništa. Postojeći fajlovi `docs/user-guide/*` nisu tvrdili ništa o prijavi, pa nije bilo ispravki; `user-guide`
   fajlovi drugih modula nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. Entra režim **uvijek** nudi i lokalnu formu (link „Prijavi se lokalnim nalogom“) — to je break-glass odluka
   iz RAW-a, ali treba potvrditi da nijedan klijent ne traži isključivo SSO.
2. Nalaz #1 iz §M2 (gašenje `mfa.allowOptional` tiho preskače verifikaciju postojećim korisnicima) mijenja
   ponašanje; dokumentacija ga zasad opisuje kao **poznato ograničenje**, a ne kao pravilo. Kad se kod popravi,
   i ovaj tekst treba uskladiti.

---

## M3 — Korisnici, organizacione jedinice i grupe · 2026-10-03

**Zašto:** administracija naloga, OU stabla i grupa za rutiranje nije imala nijednu stranicu u `user-guide`, a
to je prvi ekran na koji administrator dolazi poslije instalacije. Analiza: `REVIEW_ANALIZA.md` §M3.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/korisnici-oj-i-grupe.md` (novo) | Dodavanje/uređivanje korisnika, privremena lozinka, reset lozinke i MFA-a, odjava sesija, AD veza i raskid veze, OU stablo (Dodaj OU, izmjena, brisanje, DN/ouPath), AD sinhronizacija (Test veze, Probni prolaz, Primijeni plan, osigurač), grupe (fallback, članovi, problem/CAB), validacije, poruke grešaka, FAQ i poznata ograničenja | `users/users.controller.ts:37–188`; `users/create-user.ts:19–69`; `users/issue-temporary-password-for-user.ts:22–43`; `users/delete-user.ts:12–40`; `users/link-user-directory-identity.ts:32–60`; `organizational-units/*`; `groups/*`; `directory-sync/directory-full-sync.service.ts:149–197`; `LdapsDirectorySyncPanel` i i18n `users.*`, `groups.*`, `directory.*` (bs) |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T23** jedan identitet po nalogu i eksplicitna AD veza (SuperAdmin); **T24** OU se ne briše s djecom/korisnicima (i šta se ne provjerava); **T25** fallback grupa je jedna po OU-u i aktivira problem/CAB module; **T26** audit pokriva samo role — dokumentacija to mora reći | `users/user-directory-identity.controller.ts:24`; `organizational-units/delete-organizational-unit.ts:20–25`; `groups/create-group.ts:18–35`; `users/assign-user-role.ts:92`, `remove-user-role.ts:35` |
| `REVIEW_ANALIZA.md` §M3 | 9 cjelina + gap tabela + 7 nalaza (B1–B7) | isto |

### Izmijenjeno

- Ništa. Nijedan postojeći `docs/user-guide/*` fajl nije tvrdio ništa o administraciji korisnika/OJ/grupa, pa
  nije bilo ispravki; ostali modulski fajlovi nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW traži „opcionalno Manager“ pri sync-u iz AD-a (`RAW_PROJECT.md:30`), ali ne definiše upotrebu manager
   hijerarhije u aplikaciji; polje `User.managerUserId` postoji, mapiranje iz direktorija ne (`grep manager` u
   `directory-sync` je prazan).
2. Nalazi B1–B4 iz §M3 mijenjaju ponašanje kad se poprave (brisanje OU-a, audit, reset lozinke AD nalogu);
   stranica ih zasad opisuje u **Poznata ograničenja** i treba je uskladiti s popravkama.

---

## M4 — RBAC (role, permisije i OU scope) · 2026-10-03

**Zašto:** sistem ima 63 permisije, OU/servis scope, preview uticaja i read-only režim, a korisnički vodič nije
objašnjavao ni šta je permisija ni kako se mijenja. Analiza: `REVIEW_ANALIZA.md` §M4.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/uloge-i-permisije.md` (novo) | Dva sloja dozvola (rola + permisija), katalog od 63 permisije po kategorijama, **Pregled uticaja** i **Potvrdi i sačuvaj**, dodjela role s OU/service scope-om, read-only režim, validacije/greške (403, `READ_ONLY_MODE`, `INVALID_PERMISSION_KEY`), FAQ i poznata ograničenja | `authorization/authorization.constants.ts:3–217`; `evaluate-authorization-access.ts:88–132`; `evaluate-admin-read-only-access.ts:11–58`; `rbac/roles.controller.ts:31–82`; `rbac/preview-role-permission-impact.ts`; `frontend/src/components/rbac/permissions-panel.tsx:91–124` |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T27** SuperAdmin ima sve i zaobilazi provjere, ali mora biti lokalan; **T28** scoped dodjela ne zadovoljava provjeru bez scope-a (izuzetak `oncall.read`); **T29** preview uticaja i diff u auditu (razlog još nije obavezan); **T30** read-only režim i bypass; **T31** default mapping nije upisan u bazu | `authorization.constants.ts:101,205–217`; `to-current-session-response.ts:29–35`; `replace-role-permissions.ts:46–57`; `read-only-mode.constants.ts:3–89` |
| `REVIEW_ANALIZA.md` §M4 | 9 cjelina + gap tabela + nalazi B1–B5 | isto |

### Izmijenjeno

- Ništa. Postojeći fajlovi `docs/user-guide/*` nisu tvrdili ništa o RBAC-u.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW traži change log s **reason + diff** (`RAW_PROJECT.md:223`); implementiran je samo diff, pa treba
   odluka da li se dodaje obavezno polje razloga pri promjeni permisija.
2. RAW `:479` navodi `entra_groups` kao vrijednost `private.auth.roleSource`, a kod poznaje `local_db` i
   `ad_groups` — potrebno je potvrditi da li je riječ samo o nazivu.

---

## M5 — Policy paketi (2026-10-03)

**Dodato**

- `docs/user-guide/policy-paketi.md` — novi vodič: čemu modul služi, kome je namijenjen (SuperAdmin u UI-u),
  kako se dolazi (Administracija → **Korisnici** → panel **Paketi politika**), korak-po-korak primjena, tabela tri
  default paketa sa sadržajem grantova, tabela polja/validacija/poruka, česta pitanja i greške, poznata
  ograničenja i povezani moduli.
- `REVIEW_ANALIZA.md` §M5 — gap tabela (7 redova), recenzija koda, nalazi B1–B6, ocjene **F6 / K8 / S8** i red
  iteracije 1 prebačen u „M5 ✅ (iteracija 1 završena)“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T32** (transakciona, idempotentna primjena uz audit i invalidaciju keša),
  **T33** (default paketi nose samo permisije; SLA/required fields/approvals nisu implementirani), **T34**
  (primjena je jednosmjerna, povlačenja nema), **T35** (paket ne može dodijeliti SUPER_ADMIN ni permisiju van
  default mappinga role).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — policy paketi do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je bio nedokumentovan i lako ga je pogrešno razumjeti: naziv „paket politika“ i polja u zapisu paketa
  (`defaultClassification`, `requiresApproval`, `slaProfileId`) sugerišu da paket mijenja SLA, obavezna polja i
  odobrenja, dok stvarna primjena mijenja **samo role i permisije** te vezu paketa na OJ/servis. Dokumentacija i
  teze sada eksplicitno razdvajaju ta dva pojma i navode nalaze B1–B6.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/policy-packs/*` (`policy-pack.registry.ts`,
  `policy-pack.types.ts`, `assert-policy-pack-definition.ts`, `apply-policy-pack.ts`,
  `apply-policy-pack-user-grants.ts`, `bind-policy-pack-targets.ts`, `ensure-policy-pack-catalog.ts`,
  `list-policy-packs.ts`, `policy-packs.controller.ts`, `dto/apply-policy-pack.dto.ts`),
  `frontend/src/components/policy-packs/*`, `frontend/src/pages/users-page.tsx` i
  `backend/prisma/schema/identity.prisma`.

---

## M6 — Katalog usluga i forme (2026-10-03)

**Dodato**

- `docs/user-guide/katalog-usluga-i-forme.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola i
  permisija), kako se dolazi (**Usluge i znanje → Katalog usluga**), korak-po-korak (grupe usluga, nova usluga,
  forma i verzije, aktivacija, onboarding čarobnjak, status i prekidi), tabele polja/validacija/statusa s tačnim
  nazivima iz UI-a, česta pitanja i greške s porukama, poznata ograničenja (B1–B7) i povezani moduli.
- `REVIEW_ANALIZA.md` §M6 — planirano/idealno/preporuka, stanje u kodu (model, API, servisni sloj, forme i
  verzionisanje, tiket tok, onboarding, frontend), gap tabela s 12 redova, recenzija, nalazi **B1–B9**, ocjene
  **F7 / K8 / S7** i novi red tabele iteracija „2 … M6 ✅ · M7 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T36** (životni ciklus i vidljivost usluge), **T37** (jedna forma po usluzi,
  verzije, nepromjenjivost), **T38** (šema forme: tipovi i ograničenja; šta se validira na serveru, a šta ne),
  **T39** (obavezna polja pri rješavanju/zatvaranju), **T40** (onboarding čarobnjak i šta finalizacija
  postavlja), **T41** (status dostupnosti i prekidi ne blokiraju prijavu tiketa).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — katalog usluga i forme do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je bio potpuno nedokumentovan, a dvije stvari se lako pogrešno razumiju: (1) obavezna polja iz forme
  **ne** blokiraju kreiranje tiketa (provjeravaju se pri rješavanju/zatvaranju), i (2) forma se validira na
  serveru **samo kao šema** — vrijednosti koje korisnik pošalje provjerava isključivo ekran za prijavu. Vodič i
  teze zato eksplicitno razdvajaju ta dva nivoa i navode nalaze B1–B7.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/service-catalog/*` (`service-catalog.constants.ts`,
  `service-catalog.types.ts`, `service-catalog.error.ts`, `form-schema.*`, `service-forms.*`,
  `parse-form-*`, `create-service-form*`, `update/activate-service-form-version.ts`,
  `is-form-version-immutable.ts`, `load-form-version.ts`, `select-active-form-version-ref.ts`,
  `bind-ticket-form-version-ref.ts`, `resolve-ticket-form-version.ts`, `services|service-forms|service-availability|service-categories.controller.ts`,
  `map-service-catalog-error.ts`, `map-service-forms-error.ts`, `evaluate-service-runtime-availability.ts`),
  `backend/src/modules/service-onboarding/*` (`service-onboarding.constants.ts`, `validate-onboarding-steps.ts`,
  `finalize-service-onboarding.ts`), `backend/src/modules/tickets/*` (`create-ticket.ts`,
  `resolve-create-form-version-ref.ts`, `to-ticket-form-data-input.ts`, `required-fields/*`,
  `close-codes/apply-ticket-resolution.ts`, `update-ticket.ts`), `backend/prisma/schema/catalog.prisma`,
  `backend/src/modules/authorization/read-authorization-requirements.ts`, te frontend
  (`pages/services-page.tsx`, `components/services/*`, `components/tickets/service-form-fields.tsx`,
  `components/tickets/ticket-form-data-view.tsx`, `lib/tickets/validate-service-form.ts`,
  `services/service-catalog-api.ts`, `lib/services/use-service-catalog.ts`, i18n `services.*`).

---

## M7 — Usmjeravanje i prioritet (2026-10-03)

**Dodato**

- `docs/user-guide/usmjeravanje-i-prioritet.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola i
  permisija), kako se dolazi (**Administracija → Usmjeravanje**, **SLA → Matrica prioriteta**, detalj tiketa,
  grupni inbox), korak-po-korak (novo pravilo, izmjena/brisanje s prikazom „prije → poslije“, matrica pokrivanja,
  test rezolucije, matrica prioriteta, ručna promjena prioriteta), tabele polja/ishoda/prioriteta/statusa s
  tačnim nazivima iz UI-a, česta pitanja i poruke grešaka, poznata ograničenja (B1–B6, B9) i povezani moduli.
- `REVIEW_ANALIZA.md` §M7 — planirano/idealno/preporuka, stanje u kodu (model, API, servisni sloj, prioritet,
  UNROUTED tok, konfiguracija i realtime, frontend), gap tabela sa 16 redova, recenzija, nalazi **B1–B9**, ocjene
  **F8 / K8 / S8** i novi red tabele iteracija „2 … M7 ✅ · M8 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T42** (rutanje kao deterministička odluka iz para OU + usluga), **T43** (pravilo:
  jedinstven par, obavezan razlog, before/after zapis), **T44** (matrica pokrivanja i `requireCoverage`),
  **T45** (neusmjereni red: ciljna grupa, vlasnik, rok, digest), **T46** (prioritet: matrica i override s
  auditom), **T47** (konfiguracija rutanja: žive postavke, validacija snapshot-a, realtime, read-only).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — usmjeravanje i prioritet do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nosi odluke koje se lako pogrešno razumiju: rutanje određuje **grupu, nikad agenta**; tiket bez pravila
  **nije izgubljen** (neusmjereni red ili podešena ciljna grupa); prioritet je izveden iz matrice, a ručna
  promjena je izuzetak koji se auditira i pomjera SLA rokove. Vodič i teze zato eksplicitno razdvajaju ta stanja i
  navode nalaze B1–B6 i B9.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/routing/*` (`resolve-ticket-routing.ts`,
  `compute-routing-coverage.ts`, `evaluate-service-routing-coverage.ts`, `persist-routing-rule-change.ts`,
  `update/delete-routing-rule.ts`, `assert-routing-*.ts`, `read-required-routing-reason.ts`,
  `routing.controller.ts`, `dto/routing.dto.ts`, `routing-configuration.loader.ts`,
  `parse-routing-configuration.ts`, `routing-onboarding-support.ts`),
  `backend/src/modules/tickets/*` (`apply-create-ticket-routing.ts`, `create-ticket.ts`, `update-ticket.ts`,
  `resolve-ticket-priority.ts`, `calculate-ticket-priority.ts`, `priority/override-ticket-priority.ts`,
  `routing-preview/*`, `unrouted/*`, `counts/*`, `list/build-ticket-list-filters.ts`),
  `backend/src/modules/sla/*` (`priority-matrix.controller.ts`, `list/patch-priority-matrix.ts`,
  `default-priority-matrix.ts`), `backend/src/modules/settings/*` (`setting-keys.ts`,
  `definitions/ticket-routing-settings.ts`, `routing-dead-settings.spec.ts`),
  `backend/src/modules/config-versioning/validate-routing-snapshot.ts`,
  `backend/src/common/admin-realtime/*`, `backend/prisma/schema/{catalog,ticketing,enums}.prisma`, te frontend
  (`pages/routing-page.tsx`, `components/routing/*`, `components/sla/priority-matrix-panel.tsx`,
  `components/tickets/{ticket-priority-panel,ticket-detail-sidebar,ticket-inbox-*}.tsx`,
  `lib/tickets/{inbox-view-tabs,use-ticket-list,calculate-ticket-priority,lookup-ticket-priority}.ts`,
  `services/routing-api.ts`) i e2e (`02-routing-fallback`, `13-priority-merge`, `15-workflow-unrouted-realtime`).

---

## M8 — Tiketi (2026-10-03)

**Dodato**

- `docs/user-guide/tiketi.md` — novi vodič kroz cijeli tok: prijava tiketa, rad iz grupnog inboxa, detalj tiketa
  (poruke, učesnici, prilozi, vrijeme, prioritet), spajanje i razdvajanje, dijeljenje (split), skupne akcije,
  sačuvani pogledi, tabele statusa i dozvoljenih prelazaka, automatika i rokovi, česta pitanja i poruke grešaka,
  poznata ograničenja (B1–B5, B7) i povezani moduli.
- `REVIEW_ANALIZA.md` §M8 — planirano/idealno/preporuka, stanje u kodu (model i kontrakti, API, kreiranje i
  vidljivost, lista i filteri, tok statusa/arhiva/reopen, saradnja, bulk/saved views/prilozi/vrijeme/izvoz,
  frontend), gap tabela sa 16 redova, recenzija, nalazi **B1–B7**, ocjene **F9 / K8 / S8** i red tabele iteracija
  „2 … M8 ✅ · M9 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T48–T56**: tok statusa kao podatak; vidljivost iz aktera; pravila zatvaranja;
  merge/unmerge; split; skupne akcije; sačuvani pogledi; mjerenje vremena; prilozi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — `prosljedjivanje-tiketa.md` ostaje zasebna stranica za forwarding i
  nije mijenjan.

**Uklonjeno**

- Ništa.

**Zašto**

- Osnovni tok tiketa nije bio dokumentovan, a tri stvari se lako pogrešno razumiju: (1) grupni inbox je radni red
  grupe i ne prikazuje naručiocu njegove tikete, (2) zatvaranje ima najstrože provjere i traži close code,
  napomenu i obavezna polja, i (3) skupno zatvaranje **nije** dozvoljeno. Vodič i teze zato te dijelove navode
  eksplicitno, uz nalaze B1–B5 i B7.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/tickets/*` (`workflow/ticket-workflow-definition.ts`,
  `tickets.controller.ts`, `assert-patch-ticket-status.ts`, `authorize-ticket-actor.ts`,
  `resolve-ticket-actor-access.ts`, `list/build-ticket-visibility-where.ts`, `list-tickets.ts`,
  `list/list-tickets.types.ts`, `apply-ticket-lifecycle-timestamps.ts`, `merge/*`, `split/*`, `bulk/*`,
  `saved-views/*`, `attachments/*`, `time-tracking/*`, `archive/*`, `reopen/*`, `waiting-for-user/*`, `export/*`,
  `context/*`, `map-ticket-realtime-change.ts`), `backend/src/modules/settings/definitions/ticket-*.ts`,
  `backend/src/modules/privacy/retention/retention-executors.ts`, `backend/prisma/schema/{ticketing,enums}.prisma`,
  te frontend (`pages/ticket-*.tsx`, `components/tickets/*`, `lib/tickets/*`) i e2e
  (`01-ticket-create`, `05-bulk-broadcast`, `06-confidential`, `10-forward-cross-ou`, `14-time-tracking`,
  `15-workflow-unrouted-realtime`).

---

## M9 — Odobrenja i CSAT (2026-10-03)

**Dodato**

- `docs/user-guide/odobrenja-i-csat.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola),
  kako se dolazi (nadzorna ploča → **Čeka odobrenje**, panel **Odobrenja**, traka **CSAT ocjena**),
  korak-po-korak (kako tiket dođe u odobrenje, odluka **Odobri**/**Odbij** s razlogom i posljedice, ocjenjivanje
  tiketa), tabele polja/statusa/validacija, česta pitanja i poruke grešaka, poznata ograničenja (B1–B5) i
  povezani moduli.
- `REVIEW_ANALIZA.md` §M9 — planirano/idealno/preporuka, stanje u kodu (model i kontrakti, API, tok odobrenja,
  SLA i obavještenja, tok CSAT-a, agregacija i izvještaji, frontend), gap tabela sa 16 redova, recenzija,
  nalazi **B1–B5**, ocjene **F7 / K8 / S8** i red tabele iteracija „2 … M9 ✅ · M10 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T57–T61**: odobrenje kao blokirajuće stanje s obaveznim razlogom; ko smije
  odlučiti; SLA pauza u `PENDING_APPROVAL`; CSAT pravila (ko, kada, jednom, komentar); CSAT agregacija po
  jedinici/servisu/grupi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — odobrenja i CSAT do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Tri stvari se lako pogrešno razumiju i zato su u vodiču posebno istaknute: (1) **odbijanje odobrenja zatvara
  tiket** (status **Zatvoreno**, ishod **Odbijeno** je vidljiv u panelu), (2) odobrenje **ne dodjeljuje agenta**
  — samo vraća tiket u red grupe, i (3) CSAT može poslati **samo naručilac i samo jednom**, uz uzorkovanje.
  Uz to su navedena stvarna ograničenja (B1–B5), uključujući to da obavještenje *„Čeka odobrenje“* u praksi ne
  stiže nikome.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/tickets/approvals/*` (`create-pending-ticket-approval.ts`,
  `decide-ticket-approval.ts`, `assert-can-decide-ticket-approval.ts`, `resolve-ticket-approval-requirement.ts`,
  `list-ticket-approvals.ts`, `parse-ticket-approvals-configuration.ts`, `tickets-approvals.controller.ts`),
  `backend/src/modules/tickets/csat/*` (`submit-ticket-csat.ts`, `can-submit-ticket-csat.ts`,
  `is-ticket-csat-sampled.ts`, `summarize-visible-ticket-csat.ts`, `aggregate-ticket-csat.ts`,
  `describe-ticket-csat.ts`, `tickets-csat*.controller.ts`), `backend/src/modules/tickets/write-created-ticket-follow-up.ts`,
  `workflow/ticket-workflow-definition.ts`, `to-ticket-client-responses.ts`,
  `backend/src/modules/sla/is-sla-pause-status.ts`, `backend/src/modules/settings/definitions/{ticket-approvals,ticket-csat,ticket-sla}-settings.ts`,
  `backend/src/modules/notifications/fan-out/*`, `backend/src/modules/reports/dashboard/aggregate-report-dashboard-kpis.ts`,
  `backend/prisma/schema/{ticketing-support,enums}.prisma`, te frontend
  (`components/tickets/ticket-approvals-panel.tsx`, `components/tickets/ticket-csat-panel.tsx`,
  `lib/tickets/use-ticket-approvals.ts`, `services/tickets-csat-api.ts`, `services/tickets-approvals-api.ts`) i
  e2e (`03-approvals.spec.ts`, `08-close-codes-csat.spec.ts`).

---

## M10 — SLA (2026-10-03)

**Dodato**

- `docs/user-guide/sla.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola + permisija
  `sla.write`), kako se dolazi (**SLA pravila**, **Upravljaj kalendarima**, **Matrica prioriteta**, panel
  **SLA tajmeri** na tiketu), korak-po-korak (kalendar sa praznicima → profil → pravila po prioritetu →
  override pravila → eskalacije → matrica → ponašanje na tiketu → usklađenost), tabele polja i validacija za
  kalendar/profil/pravilo/eskalaciju/matricu, značenje stanja sata (**U okviru**, **Pod rizikom**,
  **Prekoračen**, **pauza**) i razloga „SLA nije primijenjen“ (`NO_PROFILE`, `PROFILE_INACTIVE`, `NO_RULE`,
  `NO_CALENDAR`, `NOT_APPLIED`), česta pitanja i poruke grešaka, poznata ograničenja (**B1–B5**) i povezani
  moduli.
- `REVIEW_ANALIZA.md` §M10 — planirano/idealno/preporuka, stanje u kodu (model i granice, izračun u radnom
  vremenu, životni ciklus sata, skener i `nextDueAt`, eskalacije i obavještenja, administracija i change log,
  usklađenost i izvještaji, frontend, testovi), gap tabela sa 23 reda, recenzija, nalazi **B1–B5**, ocjene
  **F8 / K9 / S8** i red tabele iteracija „2 … M10 ✅ · iteracija 2 završena“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T62–T67**: rok u radnom vremenu od kreiranja; pauze i pomjeranje rokova;
  izbor pravila i matrica prioriteta; eskalacije (offseti, mete, dežurni, dedupe); usklađenost i nadzor
  skenera; administracija, change log i verzije konfiguracije.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — SLA do sada nije bio dokumentovan kao samostalan modul (spominjan
  je u vodičima o tiketima i usmjeravanju).

**Uklonjeno**

- Ništa.

**Zašto**

- Praktično je najvažnije objasniti da su rokovi u **radnom vremenu** i da sat **počinje od kreiranja tiketa**, da
  statusi **Čeka korisnika**/**Čeka odobrenje** pauziraju satove, da se prekoračenje **ne briše** promjenom
  prioriteta, te da eskalacija bez meta u praksi ne stiže nikome. Uz to su navedena stvarna ograničenja (B1–B5) i
  odstupanja od RAW postavki (konfiguracija je u bazi, `escalations.inAppEnabled` ne postoji).

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/sla/*` (140 `.ts`, 24 spec fajla) — posebno
  `add-business-minutes.ts`, `count-business-minutes.ts`, `parse-weekly-hours.ts`, `business-hours-civil-time.ts`,
  `resolve-matching-sla-rule.ts`, `start-ticket-sla-timers.ts`, `sync-ticket-sla-timers.ts`,
  `apply-ticket-sla-pause.ts`/`apply-ticket-sla-resume.ts`, `recompute-ticket-sla-targets.ts`,
  `compute-sla-next-due-at.ts`, `scan-due-ticket-sla-states.ts`, `sla-scan.processor.ts`,
  `sla-scan.scheduler.service.ts`, `select-due-sla-escalations.ts`, `apply-due-sla-escalations.ts`,
  `emit-ticket-sla-runtime-events.ts`, `record-ticket-sla-runtime-event.ts`, `sla-compliance.*`,
  `assert-sla-*-constraints.ts`, `starting-sla.constants.ts`, `seed-starting-sla-profiles.ts`,
  `priority-matrix.controller.ts`, `sla-*-settings` definicije; `backend/prisma/schema/sla.prisma`;
  `backend/src/modules/config-versioning/{validate-sla-snapshot,apply-sla-snapshot,compute-shadow-diff}.ts`;
  `backend/src/modules/tickets/context/load-ticket-sla-context.ts`;
  `backend/src/modules/notifications/fan-out/resolve-sla-notification-recipients.ts` i
  `resolve-notification-recipients.ts`; `backend/src/modules/notifications/email/fan-out-email-notifications.ts`;
  `backend/src/modules/ops-health/evaluate-ops-signals.ts`; te frontend (`pages/sla-page.tsx`,
  `components/sla/*`, `components/tickets/ticket-sla-panel.tsx`, `lib/sla/*`, `services/sla-api.ts`,
  `lib/session/route-access.ts`) i e2e `tests/07-sla.spec.ts`.

---

## M11 — Realtime i obavještenja (2026-10-03)

**Dodato**

- `docs/user-guide/realtime-i-obavjestenja.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela
  rola), kako se dolazi (zvono → panel, filteri **Sve**/**Nepročitane**, **Označi sve**), korak-po-korak
  (pregled, označavanje pročitanog, šta se osvježava samo, kada obavještenje izostane), tabele tipova
  obavještenja i sadržaja/privatnosti (povjerljiv tiket nosi samo broj, interna bilješka ide samo spomenutima),
  ponašanje pri padu veze (fallback 30 s), česta pitanja i poznata ograničenja (**B1–B5** + ograničenje broja
  na 1000) i povezani moduli.
- `REVIEW_ANALIZA.md` §M11 — planirano/idealno/preporuka, stanje u kodu (transport i autentikacija, sobe i
  emit, skaliranje i bridge, in-app model i keš, frontend, testovi), gap tabela sa 17 redova, recenzija,
  nalazi **B1–B5**, ocjene **F8 / K9 / S8** i **novi red tabele iteracija 3** („M11 ✅ · M12 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T68–T73**: arhitektura kanala i soba; autentikacija i pravila pristupa;
  model vidljivosti obavještenja i „pročitano“; fan-out i sadržaj; fallback pri padu veze; operativni zahtjevi
  (više instanci, metrike, rollout, retencija).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Najvažnije je objasniti **razliku između ličnog i grupnog obavještenja** (i zašto se grupno vidi jednom), da
  se **sopstvene radnje ne obavještavaju**, da **interna bilješka** obavještava samo spomenute i da
  **povjerljiv tiket** u obavještenju nosi samo broj. Uz to su navedena stvarna ograničenja (B1–B5): prava se u
  aktivnoj vezi ne provjeravaju ponovo, ulazak u sobu tiketa nije ograničen, metrika veze nema alarm, prelazni
  režim je uključen po defaultu i postoji mrtvi izvoz u klijentu.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/websocket/*` (38 `.ts`, 13 spec — gateway-i,
  `socket-authentication.*`, `jwt-socket-authentication.verifier.ts`, `ticket-socket-rooms.ts`,
  `broadcast-*-realtime.ts`, `group-feed-change.ts`, `websocket-emit-counter.ts`, `ws-redis-adapter.ts`),
  `backend/src/modules/notifications/*` (26 spec — `notifications.controller.ts`, `notifications.service.ts`,
  `notification-audience.ts`, `count-unread-notifications.ts`, `mark-notification-read.ts`,
  `unread-count-cache.ts`, `fan-out/*`, `notification-retention.constants.ts`),
  `backend/src/modules/tickets/ticket-realtime.{hub,types,bridge.*,redis-forwarder}.ts`,
  `backend/src/modules/integration-queue/edge-event-realtime.subscriber.ts`,
  `backend/src/common/{cors/resolve-cors-origin,admin-realtime/*}.ts`,
  `backend/src/modules/settings/to-settings-realtime-payload.ts`, `backend/src/worker.module.ts`,
  te frontend (`services/helpdesk-socket.ts`, `services/ticket-socket.ts`, `lib/realtime/*`,
  `lib/notifications/use-inbox-notifications.ts`, `components/layout/notifications-*.tsx`) i e2e
  (`tests/04-realtime-notifications.spec.ts`, `tests/15-workflow-unrouted-realtime.spec.ts`).
