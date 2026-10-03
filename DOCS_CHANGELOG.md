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
