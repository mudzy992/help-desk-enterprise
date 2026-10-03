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

---

## M12 — Pošta (e-mail kanal, šabloni i dolazna pošta) (2026-10-03)

**Dodato**

- `docs/user-guide/posta.md` — novi vodič: čemu modul služi (obavještenja e-mailom, odgovor e-mailom, tekstovi
  e-mailova, sažetak i tihi sati), kome je namijenjen (tabela rola), kako se dolazi (Postavke → E-mail;
  **Uredi tekstove**; **Dolazna pošta**; **Moj profil** → Obavještenja), korak-po-korak (uključivanje kanala i
  domene, uređivanje šablona uz pregled i testno slanje, odgovor iz mail klijenta, pregled dolazne pošte),
  tabele (postavke kanala, polja šablona, statusi i razlozi odbijanja dolazne poruke, kada e-mail stiže odmah
  a kada u sažetku), česta pitanja i poznata ograničenja (**B1–B5**, Gmail API nije isporučen, obrada kasni do
  jednog ciklusa) i povezani moduli.
- `REVIEW_ANALIZA.md` §M12 — planirano/idealno/preporuka, stanje u kodu (odluka o slanju, sastavljanje i
  render, isporuka i queue, fan-out i lične postavke, bulk broadcast, šabloni i admin ekran, dolazna pošta,
  testovi), gap tabela sa 27 redova, recenzija, nalazi **B1–B5**, ocjene **F8 / K9 / S8** i ažuriran red
  tabele iteracija 3 („M11 ✅ · M12 ✅ · M13 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T74–T80**: izlazni kanal i dozvoljene adrese; sastavljanje poruke (šabloni,
  escape, povjerljivi režim, redakcija); isporuka (queue, idempotencija, DLQ, ručni retry); lične postavke,
  tihi sati i sažetak; dolazna pošta: konektori i potpisani token; pravila prihvatanja, anti-loop i prilozi;
  nadzor, retencija i operativni zahtjevi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Najvažnije je objasniti **tri prekidača** koja moraju biti uključena da e-mail uopšte ode, pravilo
  **dozvoljenih adresa** (zadano samo interno), da **povjerljiv tiket nosi samo broj**, i da se **odgovor
  e-mailom** vezuje za tiket potpisanim `Message-ID`-om, a ne naslovom. Uz to su navedena stvarna ograničenja
  (B1–B5): zapis o isporuci bez roka, bulk obavijest bez redakcije, nova SMTP veza po poruci, limiter testnog
  slanja u memoriji i engleske oznake polja u bulk tekstu.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/notifications/email/*` (33 `.ts`, 10 spec —
  `load-email-channel-configuration.ts`, `compose-ticket-email.ts`, `render-email-message.ts`,
  `deliver-notification-email.ts`, `persist-notification-email-delivery.ts`, `fan-out-email-notifications.ts`,
  `send-broadcast-emails.ts`, `compose-digest-email.ts`, `reply-token.ts`, `default-email-templates.ts`,
  `smtp-mail-transport.ts`), `notifications/email-templates/*`, `notifications/preferences/*` (digest, tihi
  sati, preferencije), `backend/src/modules/inbound-email/*` (25 `.ts`, 2 spec — servis, procesor, scheduler,
  port i dva konektora, `process-inbound-message.ts`, `reply-token` verifikacija, raw store, admin servis),
  `backend/src/modules/integration-queue/process-email-integration-job.service.ts`,
  `backend/src/modules/tickets/bulk/*`, `backend/src/modules/settings/definitions/{smtp,notification-email,inbound-email}-settings.ts`,
  `backend/src/modules/privacy/retention/*`, te frontend (`components/settings/{smtp-email-settings-card,
  email-templates-card,email-templates-editor,inbound-email-card}.tsx`, `pages/email-templates-page.tsx`,
  `app/router.tsx`) i e2e `tests/11-email-templates.spec.ts`; planovi `docs/plans/modules/{1.5,2.2,2.3}*.md`
  i `docs/ops/inbound-email.md`.

---

## M13 — Šabloni (gotovi odgovori i playbooks) (2026-10-03)

**Dodato**

- `docs/user-guide/sabloni-i-playbooks.md` — novi vodič: čemu modul služi (gotovi odgovori i checklista
  koraka kao pomoć, bez mijenjanja modela tiketa), kome je namijenjen (tabela rola: agent, ADMIN,
  SUPER_ADMIN, korisnik), kako se dolazi (`Šabloni` u okviru za poruku, `Sačuvaj kao šablon`, meni
  **Administracija** → **Šabloni**, kartica **Playbook** na tiketu), korak-po-korak (ubacivanje šablona,
  čuvanje ličnog šablona, uređivanje zajedničkog uz razlog, pravljenje playbooka, checklista na tiketu,
  rješavanje sa obaveznim koracima), tabele (polja šablona i playbooka, 16 dozvoljenih varijabli, tri režima
  obaveznih koraka, poruke grešaka), česta pitanja i poznata ograničenja (**B1–B5**) i povezani moduli.
- `REVIEW_ANALIZA.md` §M13 — planirano/idealno/preporuka, stanje u kodu (model i postavke, odabir i
  popunjavanje, upotreba i statistika, playbook na tiketu, administracija i ekrani, testovi), gap tabela sa 21
  redom, recenzija, nalazi **B1–B5**, ocjene **F8 / K7 / S7** i ažuriran red tabele iteracija 3
  („M11 ✅ · M12 ✅ · M13 ✅ · M14 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T81–T87**: model šablona, opseg i tip; varijable i pad na bosanski; prava
  (lični, zajednički, ograničenje po servisima); playbook (snimka, verzija, nadogradnja); obavezni koraci pri
  rješavanju i automatsko vezivanje; administracija, revizija i verzije konfiguracije; ponuda šablona,
  statistika upotrebe i ekrani.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nije bio dokumentovan, a jedini je primjer gdje pravilo postoji **samo u interfejsu**: pregled nudi
  aktivne šablone koji odgovaraju načinu pisanja, ali slanje to ne provjerava ponovo. Zato vodič izričito
  kaže „provjerite tekst prije slanja“ i navodi B1 kao ograničenje, a ne kao preporuku.
- Najvažnije je objasniti **razliku između ličnog i zajedničkog šablona**, zašto administrator vezan na
  servise ne može praviti globalni šablon, da **tiket čuva kopiju koraka** (izmjena playbooka ne mijenja
  tiket u toku) i da **checklista nije vidljiva podnosiocu**. Uz to su navedena stvarna ograničenja (B1–B5):
  tip i aktivnost šablona se ne provjeravaju pri slanju, ponuda čita fiksni broj zapisa bez redoslijeda,
  jedinstvenost naziva nije zaštićena u bazi, playbook se ne uvodi na tikete koji su već u toku i statistika
  upotrebe raste i kad poruka nije upisana.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/templates/*` (23 `.ts`, 1 spec —
  `response-templates.service.ts`, `templates.constants.ts` (`templateLimits`, 16 varijabli),
  `template-placeholders.ts`, `template-scope.ts` (`scoreTemplateScope`, `canManageSharedScope`),
  `build-template-variables.ts`, `templates-environment.ts`, `normalize-template-input.ts`,
  `record-templates-change.ts`, `templates.error.ts`, `dto/templates.dto.ts`, `response-templates.controller.ts`,
  `playbooks/*` (`playbooks.service.ts`, `normalize-playbook-input.ts`, `playbooks.controller.ts`),
  `ticket-playbooks/*` (`attach-playbook-to-ticket.ts`, `ticket-playbook-snapshot.ts`,
  `ticket-playbooks.service.ts`), `templates-configuration.loader.ts`),
  `backend/src/modules/tickets/{playbooks/assert-playbook-steps-complete.ts,create-ticket-message.ts:63–108,
  update-ticket.ts:102,bulk/apply-bulk-status.ts:49,collaboration.constants.ts:32–36,tickets.service.ts:154–178}`,
  `backend/src/modules/settings/definitions/ticket-templates-settings.ts`, `settings/setting-keys.ts:148`,
  `backend/src/modules/authorization/authorization.constants.ts:22–24`,
  `backend/src/modules/config-versioning/{collect-config-snapshot.ts:47–62,137,apply-templates-snapshot.ts}`,
  `backend/prisma/schema/templates.prisma:4–157`, te frontend (`components/templates/*`,
  `pages/{templates,response-template-editor,playbook-editor}-page.tsx`,
  `components/tickets/ticket-message-composer.tsx`, `services/templates-api.ts`, `app/router.tsx:274–335`,
  `lib/templates/*`) i e2e `tests/16-templates-playbooks.spec.ts`; plan `docs/plans/modules/1.4-sabloni-playbooks.md`
  i RAW `RAW_PROJECT.md:104–105,681–682,784,929–930`.

---

## M14 — Baza znanja (članci, portal, ocjene i review cycle) (2026-10-03)

**Dodato**

- `docs/user-guide/baza-znanja.md` — novi vodič: čemu modul služi (self-service članci, presretanje pri
  kreiranju, ocjene, vlasništvo i ciklus pregleda, članak iz odgovora), kome je namijenjen (tabela rola:
  korisnik, agent, reviewer, ADMIN/SUPER_ADMIN), kako se dolazi (meni **Baza znanja**; korak **Baza znanja**
  u wizardu; meni **⋯** → **Napravi članak**; tab **Uvidi**; grupa **Baza znanja** u postavkama),
  korak-po-korak (pretraga i čitanje, ocjena i komentar, presretanje, pisanje i objava kroz pregled,
  kategorije i FAQ, uvidi, članak iz odgovora), tabele (polja članka, klase i statuse sa dozvoljenim
  prelazima, osam postavki sa zadanim vrijednostima, poruke grešaka), česta pitanja i poznata ograničenja
  (**B1–B7**) i povezane module.
- `REVIEW_ANALIZA.md` §M14 — planirano/idealno/preporuka, stanje u kodu (model i postavke, vidljivost,
  presretanje, ocjene i pregledi, ciklus pregleda, portal i „članak iz odgovora“, autorizacija i ekrani,
  testovi), gap tabela sa 23 reda, recenzija, nalazi **B1–B7**, ocjene **F8 / K7 / S7** i ažuriran red tabele
  iteracija 3 („M11 ✅ · M12 ✅ · M13 ✅ · M14 ✅ · M15 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T88–T94**: model članka, statusi i klasifikacije; vidljivost i opseg;
  presretanje i rezolucija; ocjene, komentari i rangiranje; pregledi kao dnevni agregat; vlasništvo i ciklus
  pregleda; portal znanja i „članak iz odgovora“.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je nosio tri RAW zahtjeva (self-service baza znanja, presretanje sa ishodom „pomoglo“ i povratna
  sprega ocjena sa review cycle-om), a u međuvremenu je kroz paket 2.9 (K1) dobio i portal sa kategorijama,
  FAQ-om, ocjenama 1–5, pregledima i uvide — sve to treba opisati tačnim nazivima dugmadi i stvarnim
  ograničenjima.
- Najvažnije je objasniti **tri različite klase vidljivosti**, da se **ocjena može promijeniti** i da
  **komentar „šta nedostaje“ vide samo urednici**, te da **objava traži prethodni pregled**. Uz to su
  navedena stvarna ograničenja (B1–B7): zamjena ličnih podataka samo u pregledu, obavještenje o roku bez
  naslova i odredišta, „pomoglo“ koje ne sprječava tiket i veže se na prvi predlog, brojanje pregleda bez
  pravila od pet sekundi, neograničene liste sa provjerom vidljivosti po članku, kolona `isStale` koja se
  nikad ne postavlja, i arhiviranje kategorije sa člancima koje uputa zabranjuje a server dozvoljava.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/knowledge-base/*` (73 `.ts`, 11 spec —
  `knowledge-base.controller.ts`, `knowledge-base-workflow.{controller,service}.ts`,
  `create-knowledge-article.ts`, `update-knowledge-article.ts`, `publish-knowledge-article.ts`,
  `review-knowledge-article.ts`, `submit-knowledge-feedback.ts`, `intercept-knowledge-articles.ts`,
  `rank-knowledge-articles.ts`, `resolve-knowledge-intercept.ts`, `can-read-knowledge-article.ts`,
  `load-knowledge-article-scope.ts`, `list-knowledge-articles.ts`, `fetch-knowledge-articles-for-list.ts`,
  `evaluate-knowledge-article-freshness.ts`, `with-knowledge-article-freshness.ts`,
  `knowledge-base-review-reminder.{service,processor,scheduler.service}.ts`, `knowledge-base.constants.ts`,
  `parse-knowledge-base-configuration.ts`, `dto/*` i `portal/*` (`knowledge-portal.controller.ts` sa 13 ruta,
  `knowledge-portal.service.ts` 682 linije, `knowledge-categories.ts` 253, `knowledge-article-views.ts` 126,
  `scrub-reply-personal-data.ts` 71, `update-article-counters.ts` 68)),
  `backend/prisma/schema/knowledge.prisma` (`KnowledgeArticle`, `KnowledgeFeedback`,
  `KnowledgeInterceptResolution`, `KnowledgeCategory`, `KnowledgeArticleView`),
  `backend/src/modules/authorization/authorization.constants.ts:61–65,112–136,160–161,187–189`,
  `backend/src/modules/settings/{setting-keys.ts:328–342,definitions/knowledge-base-settings.ts}`,
  `backend/src/modules/reports/{dashboard/build-reports-dashboard.ts:137–151,packs/build-kb-helpfulness-report.ts}`,
  te frontend (`pages/knowledge-base-page.tsx`, `pages/knowledge-article-detail-page.tsx`,
  `components/knowledge-base/**` (10 komponenti + 6 portal komponenti),
  `components/tickets/{knowledge-intercept-panel,create-ticket-intercept-view,create-ticket-form,ticket-detail-conversation}.tsx`,
  `lib/knowledge-base/*`, `lib/notifications/notification-kind.ts`, `lib/navigation.ts:89–94`,
  `app/router.tsx:159–162`, `services/knowledge-base-api.ts`) i e2e (`tests/01-ticket-create.spec.ts:23–28`,
  `tests/22-accessibility.spec.ts:69,115–116`); plan `docs/plans/modules/2.9-dodatne-nadogradnje.md` §2 i §10
  i RAW `RAW_PROJECT.md:8,71,130–135,632–634,683–685,780–781,824`.
- **Nalaz o planu (samo evidentirano, `docs/plans/**` se ne dira):** plan 2.9 nema odjeljak „Implementacija i
  odstupanja (K1)“ — postoje samo za K2 (§3.4) i K4 (§5.4) — a u §2.4 opisuje prelazak na klasifikaciju
  `PUBLIC`, koja u modelu ne postoji (`DataClassification` = INTERNAL, CONFIDENTIAL, RESTRICTED,
  `backend/prisma/schema/enums.prisma:122–126`).

## M15 — Nadzorna ploča i izvještaji (2026-10-03)

**Dodato**

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — novi vodič: čemu modul služi (brzi pregled rada na
  **Nadzornoj ploči** i nadzor kroz **Izvještaje**), kome je namijenjen (tabela rola: korisnik, agent,
  ADMIN/SUPER_ADMIN sa `reports.export`/`audit.export` i `reports.schedule.manage`), kako se dolazi (meni
  **Nadzorna ploča**, meni **Izvještaji**, tabovi **Pregled**, **Trendovi**, **Paketi izvještaja**,
  **Zakazani**, dugme **Zakaži ovaj izvještaj** iz Trendova), korak-po-korak (čitanje brojača i
  grafikona, SLA nadzor i grupni inbox, KPI pregled i PDF, trendovi sa filterima i izvozom, paketi sa
  pregledom i preuzimanjem, zakazani izvještaji sa testnim slanjem i historijom), tabele (značenje
  brojača, KPI formule i uzorci, sadržaj paketa, poruke i greške), česta pitanja (keš brojača, razlika
  između brojača i lista, pristup izvještajima, prigušeni CSAT, razlozi preskakanja primalaca), poznata
  ograničenja (**B1–B6** i gapovi prema RAW-u) i povezane module.
- `REVIEW_ANALIZA.md` §M15 — planirano (RAW `:171`, `:258–262`, `:278–284`, `:360`, `:660–661`, `:805`,
  `:814`, `:1000`, `:1031`, `:1039`, `:1047`), idealno i preporuka, stanje u kodu (nadzorna ploča i
  izvor brojača, SLA nadzor, četiri taba izvještaja, KPI, trendovi, paketi, usko grlo API, zakazani,
  postavke, testovi), gap tabela, recenzija, nalazi **B1–B6**, ocjene **F8 / K8 / S8** i ažuriran red
  tabele iteracija 3 („M11 ✅ · M12 ✅ · M13 ✅ · M14 ✅ · M15 ✅ (iteracija 3 završena)“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T95–T101**: nadzorna ploča i izvor brojača; SLA nadzor i grupni inbox;
  KPI formule, uzorci i KB stopa; trendovi, granularnost i izvoz; paketi izvještaja, limiti i audit;
  uska grla (API bez ekrana); zakazani izvještaji, primaoci i historija.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama; u `REVIEW_ANALIZA.md` i `TEZE-ZA-DOKUMENTACIJU.md` samo
  dodate sekcije (bez izmjena ranijih modula).

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nosi RAW zahtjeve za KPI nadzor (tiketi po OU, prosječno rješenje, KB stopa, CSAT), uska grla i
  predefinisane izvještaje sa izvozom i OU opsegom, a do sada nije imao nijednu stranicu za krajnjeg
  korisnika; uz to su kroz pakete 1.6 i 2.5 dodati trendovi, zakazani izvještaji i PDF, što treba opisati
  tačnim nazivima dugmadi.
- Najvažnije je razdvojiti **brojače sa servera** (tačni, keširani 60 s) od **pogleda koji se računaju u
  pregledaču iz prve strane od 50 tiketa** (B6), objasniti formule (KB stopa = pomoglo / (pomoglo +
  kreirani), zadovoljan CSAT = ocjena ≥ 4) i navesti stvarna ograničenja: uska grla postoje kao API ali ne
  i kao ekran (B2), postavka uskih grla ne djeluje na prikaz (B1), jedna postavka perioda dijeli se s
  paketima (B3), `scope` sažetka se ne koristi (B4) i dugme **Izvještaji** na ploči je trajno onemogućeno
  (B5).

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/reports/*` (109 `.ts`, 24 spec / 2 810 linija —
  `report-summary.{controller,service}.ts`, `summary/report-summary-cache.ts:2–22`,
  `summary/report-summary.types.ts`, `summary/load-dashboard-summary-counts.ts`,
  `summary/load-sla-summary-counts.ts`, `dashboard/build-reports-dashboard.ts:31–40`,
  `dashboard/aggregate-report-dashboard-kpis.ts:4–18,63–87`, `dashboard/report-dashboard.cache.ts`,
  `bottleneck/aggregate-bottleneck-dashboard.ts:23–41,71–116`,
  `bottleneck/sql-bottleneck-dashboard-store.ts:30–40`, `trends/report-trends.constants.ts:1–43`,
  `schedules/report-schedule.constants.ts:1–65`, `packs/build-{top-close-codes,kb-helpfulness,forward-ping-pong}-report.ts`,
  `reports.controller.ts:45–56,78–130,151–189`, `reports.service.ts:130–199`,
  `record-report-export-audit.ts:9–41`), `backend/src/modules/settings/definitions/reports-settings.ts`,
  `setting-keys.ts:439–453`, `audit-log/audit-log.constants.ts:31,59–66`, te frontend
  (`pages/dashboard-page.tsx:39–124`, `pages/reports-page.tsx:52–64,252–257`,
  `lib/dashboard/use-dashboard-summary.ts:71–90`, `lib/dashboard/build-volume-14d.ts:11–25`,
  `lib/dashboard/dashboard-ticket-sets.ts:13–35`, `lib/session/route-access.ts:58–71`,
  `components/reports/*`) i e2e (`tests/12-reports-packs.spec.ts`, `17-reports-trends`, `18-reports-schedules`,
  `19-reports-print`, `22-accessibility.spec.ts:64,79`); planovi `docs/plans/modules/1.6-izvjestaji-ui.md`
  i `2.5-izvjestavanje-i-analitika.md` §7.1, §11, §13 i RAW `RAW_PROJECT.md:171,258–262,278–284,360,660–661,805,814,1000,1031,1039,1047`.
- **Nalaz o dokumentima (samo evidentirano, `docs/plans/**` se ne dira):** nijedan plan ne predviđa
  **ekran** za uska grla (`/reports/bottlenecks` je zatečeni endpoint koji plan 2.5 §13.1 samo sanira,
  a tabovi u §7.1 su Pregled/Trendovi/Paketi/Zakazani); dva RAW reda o predefinisanim izvještajima
  (`RAW_PROJECT.md:278–279`) zapisana su unutar odjeljka „Config versioning + rollback“, a ne u odjeljku
  o analitici. Obje stvari su nalazi u `REVIEW_ANALIZA.md` §M15, bez izmjena planova.
