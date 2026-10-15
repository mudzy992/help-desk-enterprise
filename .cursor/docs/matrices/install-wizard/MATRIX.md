# MATRIX — install-wizard

## Cilj
Jednokratni first-run setup. Aplikacija nije upotrebljiva dok wizard nije completed.

## Stanja
- `NOT_STARTED` — nema `private.install.completedAt`
- `IN_PROGRESS` — draft koraka (server-side, da refresh ne gubi SuperAdmin kreiranje)
- `COMPLETED` — gate ugašen; `/install` zabranjen
- `RERUN_ALLOWED` — implementirano (odluka 6): `INSTALL_ALLOW_RERUN=true` + install token, pa `POST /install/restart` ili `npm run cli:install-rerun`; redovni administratori nemaju ni rutu ni dugme

## Gate
Izvor: postojeći Settings Registry ključ `private.install.completedAt` (private string, default `""`). Nema paralelnog config sistema. Gate ne čita `private.auth.mode` (`local` i `entra_ad` su isti).

Completed vrijednost: non-empty ISO-8601 datetime. Prazno, whitespace, missing, ili neispravan string ⇒ gate aktivan. Greška čitanja settingsa ⇒ fail closed (gate aktivan).

Dok je gate aktivan:

- UI: sve aplikacijske rute → `/install`. `/install` ostaje dostupan (gate ne blokira sam sebe).
- API: HTTP `503` `{ code: "SETUP_REQUIRED" }` za sve osim `GET /health` i `/install` + `/install/*`.
- `GET /install/status` vraća `{ isCompleted }` (boolean). Ne izlaže `completedAt`.

Nakon validnog `completedAt`: HTTP gate je neaktivan; auth/API/aplikacija rade kao prije. Zaključavanje javnog `/install` (COMPLETED) je poseban korak wizarda, nije dio ovog gate-a.

## Paketi, odgađanje i readiness (F1–F4)

- Paket: `private.install.profile` (`minimum` | `standard` | `full` | prazno). Prazno = za ostale odluke važi `minimum`, a korak paketa **blokira** (F3: paket je prvi korak, `POST /install/complete` bez njega vraća `INSTALL_NOT_READY`).
- `GET/POST /install/profile` vraća katalog (`install-profile.catalog.ts`) i upisuje izbor. Promjena paketa je dozvoljena dok operator stoji na koraku paketa; stanje koraka koje novi paket ne sadrži se resetuje po registry planu (`plan-install-profile-reset.ts`, `resettableSettingKeys`), a kredencijali/identitet/seed se ne brišu. Nakon prvog seeda dozvoljena je samo nadogradnja → `409 INSTALL_PROFILE_LOCKED_AFTER_SEED`.
- IN19: promjena paketa poništava odgodu koraka koje novi paket **traži** (`reopenedStepKeys` iz `previousProfile`); `POST /install/profile` vraća `reopenedSteps`, ljuska to objasni (`install.shell.reopened`). Odgoda se time ne zabranjuje — traži se nova odluka.
- **Sekcije Full paketa (F5):** `GET /install/sections` (lista sa `requires`), `GET /install/sections/:sectionKey` (polja iz metapodataka definicija), `POST /install/sections/:sectionKey` (allowlist + `mainSwitchKey`/`requires` provjera → `setSettingValues(reason: 'install_wizard')` → marker `steps.<step>.saved` → ponovno čitanje). Ključ van allowlist-e → `400 INSTALL_SETTINGS_SECTION_KEY_NOT_ALLOWED`, nepoznata sekcija → `400 INSTALL_SETTINGS_SECTION_UNKNOWN`, nezadovoljena zavisnost → `409 INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET`, vrijednost koju registry odbije → `422 INSTALL_SETTINGS_SECTION_INVALID_VALUES` (ili `SETTING_DEPENDENCY_UNMET` iz registra), bez foundera → `409 SUPER_ADMIN_REQUIRED`. Sve rute su pod `InstallWizardLockGuard`, parametar je `@IsIn(installSettingsSectionKeys)`.
- **Sigurnosne preporuke (F5, odluka 7):** `GET|POST /install/security-recommendations` — `mfa.requiredForAdmins = true`, `mfa.allowOptional = true`, `security.hibp.enabled = true`, `session.idleTimeoutSeconds = 1800`; `security.captcha.provider` ima `recommendedValue: null` i **nikad se ne upisuje** (bez Turnstile ključeva captcha bi zaključala prijavu). Primjena traži postojećeg SuperAdmina i piše marker `steps.securityRecommendations.saved`.
- Odgađanje: `POST/DELETE /install/steps/:stepKey/skip` piše `private.install.steps.<stepKey>.skipped`. Samo koraci sa `skippable: true` (SMTP, tim, `blueprint`, `slaReview`, dodaci) primaju flag; `policyPack` je obavezan (`409 INSTALL_STEP_NOT_SKIPPABLE`), a `profile`, `superAdmin`, `identity`, `loginProvider`, `seed` takođe. Nepoznat ključ → `400 INSTALL_STEP_UNKNOWN`; bez SuperAdmina → `409 SUPER_ADMIN_REQUIRED`.
- IN18: ključevi `private.install.*` su `readOnly` — Settings registry ih prikazuje bez editora („Čarobnjak“), ali API i dalje dozvoljava ručni `POST /settings/*` (metadata za UI, ne novo pravilo).
- `GET /install/readiness` vraća `{ isReady, checks: [{ key, status, messageKey }] }`. Ključevi: `superAdmin`, `authMode`, `organizationalUnit`, `handlerGroup`, `service`, `routing`, `slaProfile`, `roles` + `profileSteps` (F1). Statusi: `ok`, `missing` (blokira), `skipped` (odgođeno, ne blokira).
- F2: `slaProfile` je stvarna provjera — servis iz seeda mora biti vezan na **aktivan** SLA profil (`is-seeded-service-under-active-sla.ts`), a ne samo da profil postoji u sistemu. Tim korak je `completed` tek kad je u grupi bar jedan član koji nije founder (`isTeamInvited`).
- `GET /install/status` je proširen: `nextStep`, `steps.<key>.{completed,skipped,required,offered,skippable,blocking}`, `profile`. `skippable` (F3) je registry flag iz kojeg ljuska crta „Podesi kasnije“. Korak je `blocking` kad ga paket sadrži i nije ni završen ni odgođen; korak paketa nije `blocking` dok paket nije izabran.
- `POST /install/complete` prvo provjerava readiness; ako nije zeleno → `409 INSTALL_NOT_READY` sa `details.missing`. Ponovni complete na već završenoj instalaciji ostaje idempotentan.
- Dodaci korak je `completed` samo ako je bar jedan `private.addons.*` ključ upisan (F0.5) — osvježavanje ne preskače korak.
- F4.2: `GET /install/blueprints` + `POST /install/blueprints/apply` — `itServiceDesk` (5 kategorija / 10 servisa / `nivo-1`+`nivo-2`), jedna transakcija, idempotentno po slugu, `resolveTicketRouting === EXACT` za svaki servis prije commita (`assert-install-blueprint-routing.ts`); nepoznat servis → `400 BLUEPRINT_SERVICE_UNKNOWN`, bez OU/grupe iz seeda → `409 BLUEPRINT_STRUCTURE_REQUIRED`. Marker `private.install.blueprint`.
- F4.3: `GET/POST /install/policy-pack` — paketi iz `policyPackKeys` predloška; `PACK_DISABLED` (409) kad je paket isključen u `private.policyPacks.disabledKeysCsv`, `POLICY_PACK_NOT_OFFERED` (400) kad ga predložak ne nudi; primjena kroz funkciju `applyPolicyPack` (bez `PolicyPacksService` zbog ciklusa), marker `private.install.policyPack`.
- F4.4: `GET/POST /install/sla-review` — `confirmed` = samo marker, `adjusted` = `updateBusinessHoursCalendar` / `patchPriorityMatrix` uz `reason: 'install_wizard'`; prazna izmjena → `400 SLA_REVIEW_EMPTY_ADJUSTMENT`, bez kalendara → `409 SLA_REVIEW_CALENDAR_MISSING`, SLA greške prolaze kroz `mapSlaError`.
- F4.5: defaulti dodataka po paketu — `resolve-install-addon-defaults.ts` (unija `defaultEnabledAddons` do izabranog paketa) ulazi u `GET /install/addons` kao `enabled`/`defaultEnabled`; Full time uključuje `cmdb`, `problems`, `changes` (odluka vlasnika 4). `email` ostaje vezan na SMTP (`requiresSmtp`).
- F4.1: `POST /install/smtp/test` testira **upisano** stanje SMTP-a: bez konfiguracije → `409 SMTP_TEST_NOT_CONFIGURED`, neispravna adresa → `400 SMTP_TEST_INVALID_RECIPIENT`, greška servera → `400 SMTP_TEST_{AUTH_FAILED,TLS_FAILED,UNREACHABLE,TIMEOUT,SEND_FAILED}`, previše pokušaja → `429 SMTP_TEST_RATE_LIMITED` (vlastita instanca `TestEmailRateLimiter`-a, bez Redis-a).
- F0.6: SuperAdmin iz wizarda je član fallback grupe (idempotentno, kroz `addGroupMember`).
- F0.1/F0.2/F0.3: token gate otključava samo na uspješnu provjeru (`install.tokenUnavailable` + retry za mrežu/5xx); korak sa neuspješnim učitavanjem prikazuje `InstallStepLoadError` i ne renderuje formu; status instalacije čita samo `InstallSetupProvider`.

## Pravila
- SuperAdmin iz wizarda je uvijek lokalni (`isLocalOnly`).
- Kreira se kroz `POST /install/super-admin` (`email`, `displayName`, `password`); `GET /install/super-admin` vraća postojeći nalog bez lozinke/hasha da refresh ne izgubi korak.
- Password ide u `User.localPasswordHash` (bcrypt), nikad u settings JSON ili API odgovor.
- Zadnji local SuperAdmin se ne smije deaktivirati.
- Način prijave: `POST /install/login-provider` (`mode`: `local` | `entra_ad`). `GET /install/login-provider` vraća mode i konfiguracijske flagove, nikad secret vrijednosti.
- `local` postavlja `private.auth.mode=local` bez AD/Entra polja.
- `entra_ad` zahtijeva validan Entra tenant+client **ili** LDAPS bind (URLs + bind DN + bind password) prije complete; secret polja idu kroz Settings Registry (`getSecretForInternalUse` / `isSecret`).
- `entra_ad` ne uklanja local break-glass login.
- SMTP korak: `GET/POST /install/smtp`. Switch `private.smtp.enabled`. Ako ON: host, port, TLS, username, password (secret), from address kroz Settings Registry. Ako OFF: konfiguracija nije obavezna; `private.addons.email=false` forsirano.
- Seed korak: `GET/POST /install/seed`. Idempotentno osigurava min 1 OU, 1 `Group.isFallback` handler grupu, 1 ACTIVE servis, `RoutingRule` `(originUnit + service) → fallback grupa` i **SuperAdmina kao člana fallback grupe** (F0.6). Rezolucija mora biti `EXACT`. Ponovni poziv ne duplira zapise ni članstvo.
- F2 (parametrizovan seed): `POST /install/seed` prima **opcioni** body (`organizationalUnitName`, `handlerGroupName`, `categoryName`, `serviceName`). Bez body-ja vrijednosti su zadane iz `install-seed.constants.ts` (tok nepromijenjen). Slugovi/keys i DN se generišu iz naziva (`build-install-seed-slug.ts`, `install-seed.names.ts`); naziv duži od 120 znakova ili sa `,`/`=` → `400 INSTALL_SEED_STRUCTURE_INVALID`. Ponovni seed s drugim nazivima **ne** preimenuje zapise, nego vraća postojeće + `warning.code = NAMES_ALREADY_SEEDED` (`requested`/`stored`). Servis dobija `STANDARD_REQUEST` (prvi aktivan profil kao fallback, inače `null`). `GET /install/seed` vraća i `categoryName` te `service.slaProfileKey`.
- F2 (identitet): `GET/POST /install/identity` piše isključivo kroz Settings Registry — `public.branding.organizationName` (obavezno), `appName`, `tagline`, `logoDataUrl`, `supportEmail`, `supportUrl`, `private.i18n.defaultLocale`, `private.reports.timeZone`. Nepopunjeno polje se **ne** šalje („Podesi kasnije“) i ne prepisuje postojeću vrijednost; logo se nikad ne vraća kroz wizard (`logoConfigured`). Korak je `completed` kad je `organizationName` upisan.
- F2 (tim): `GET/POST /install/team`. Svaki red = stvarni nalog kroz `users/create-user.ts` + članstvo kroz `addGroupMember` (isto kao `POST /groups/:groupId/members/:userId`). Dozvoljene uloge `AGENT`/`ADMIN`, najviše 25 redova; duplikat emaila u zahtjevu → `400 INSTALL_TEAM_INVALID`, zauzet email → `409 INSTALL_TEAM_EMAIL_CONFLICT`, bez strukture → `409 INSTALL_TEAM_STRUCTURE_REQUIRED`. Bez SMTP-a privremena lozinka se prikazuje **jednom** (`temporaryPasswordDelivery = ui`). Kontroler ne dira Prisma-u.
- SMTP OFF ima prednost nad sačuvanim `private.addons.email=true` (`resolveEmailAddonEnabled` / addons korak). Nema paralelnog email flag-a.
- Addons korak: `GET/POST /install/addons`. Katalog je `backend/src/modules/settings/addon-catalog.ts` i čuva se kao `private.addons.<key>` kroz Settings Registry. Defaulti (14 ključeva): `csat`, `approvals`, `confidential`, `kbIntercept`, `ticketSplit`, `bulkActions`, `savedViews`, `reports` **on**; `email`, `edge`, `cmdb`, `problems`, `changes`, `teams` **off**. `email` zahtijeva SMTP (`requiresSmtp`) — SMTP OFF forsira email off. Nepoznat key → `UNSUPPORTED_ADDON_KEY`. Operacija je idempotentna. Ne implementira addon business logiku ni `403 ADDON_DISABLED`.
- API ne izlaže SMTP password; change log redaktuje secret.
- Core moduli nisu addoni (vidi `04-install-wizard.md`).
- Seed: min 1 OU, 1 fallback grupa, 1 servis + routing na tu grupu.
- Completed wizard piše change log (reason=`install_wizard`).
- `POST /install/complete` atomično postavlja `private.install.completedAt` (i `private.install.completedByUserId`) i provisionira `private.auth.jwtSigningSecret` ako nedostaje ili je kraći od 32 znaka. Ponovni complete je idempotentan, ne prepisuje timestamp i ne rotira postojeći signing secret.
- Nakon COMPLETED, wizard mutacije (`POST /install/*` osim `POST /install/complete` i `POST /install/restart`) vraćaju `409 INSTALL_LOCKED`. Dalje izmjene idu kroz Settings.
- **Ponovno pokretanje (odluka 6, implementirano):** `POST /install/restart` traži `INSTALL_ALLOW_RERUN=true` (tačno ta vrijednost; inače `403 INSTALL_RERUN_NOT_ALLOWED`) i `x-install-token` — to je jedina instalacijska ruta iza tokena **i poslije** završetka (`isInstallTokenAlwaysRequired`), jer otvaranje ruši sistem u setup mod. `is-install-wizard-mutation-locked` propušta tačno `complete` i `restart`. Podrazumijevano briše `private.install.completedAt` i `private.install.completedByUserId`; `includeStepMarkers`/`--include-step-markers` dodaje markere čarobnjaka (`private.install.profile`, `blueprint`, `policyPack`, `slaReview`, `steps.<korak>.{saved,skipped}`). Upis kroz `SettingsService`, `reason = install_wizard_rerun`; plan dijele ruta i `npm run cli:install-rerun` (`plan-install-rerun.ts`). Idempotentno (`alreadyOpen: true` bez upisa); odgovor nosi `nextStep`. Recept: `ops/runbook/ponovno-pokretanje-instalacije.md`.

## Zabranjeno
- Preskakanje SuperAdmin koraka.
- Preskakanje validacije AD/Entra polja kad je `entra_ad` izabran.
- Seed demo tiketa.
- Ponovni javni wizard nakon COMPLETED (izuzetak je ops-only rerun iz `ops/runbook/ponovno-pokretanje-instalacije.md`).
- Čuvanje SuperAdmin lozinke u settings JSON.

## UI
Vidi izuzetak **„Izuzetak: install wizard“** u `docs/design/Master UI-UX Design Constitution.md` (dozvoljeni brend pano, motion s funkcijom do ~250 ms, ikone funkcija i završni ekran; i dalje zabranjeni floating blobs, bounce, dekorativna pozadinska animacija i glassmorphism; `prefers-reduced-motion` obavezan). Pravilo u `.cursor/rules/frontend-ui-ux.mdc`.

F4: koraci **Katalog iz predloška**, **Policy pack** i **SLA pregled** koriste istu ljusku i `install-feature-card.tsx`; dodaci su predstavljeni karticama po kategorijama (Kvalitet usluge, Kontrola, Produktivnost, ITSM moduli, Integracije) s ikonom, naslovom i jednom rečenicom vrijednosti (`install.addons.<key>.title|value`) — tehnički opisi iz `addon-catalog.ts` ostaju u Settings. SMTP korak ima panel za probnu poruku s mapiranom porukom po vrsti greške i dugmetom koje je ugašeno dok forma ima nesačuvane izmjene. SLA pregled prikazuje kalendar (dani i sati, uređivo) i matricu prioriteta (read-only).

F3: **split-screen ljuska** (5/7) — brend pano s živim identitetom, vertikalni rail s pet stanja (`done`/`current`/`deferred`/`locked`/`upcoming`), panel „Šta dobijaš“ i footer (Nazad / Podesi kasnije / Nastavi); na mobilnom pano je kompaktno zaglavlje, a „Šta dobijaš“ **sheet**. Ekran paketa je prvi korak: tri kartice s procjenom trajanja i „Prikaži sve“ sheetom, plus „Prilagodi paket“ koji prekidačima odgađa korake (`skippable` iz registryja), a obavezne prikazuje zaključane. Motion je `page-in`/`pop-in` do ~250 ms i isključuje se preko `prefers-reduced-motion`; fokus pri promjeni koraka ide na naslov koraka. Stanje statusa na `/install` ima skeleton i `GateStatusError` sa retry-em.
