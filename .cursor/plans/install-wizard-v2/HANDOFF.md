# Install Wizard v2 — handoff

## Stanje (2026-10-15)

- **F0 (stabilizacija), F1 (backend osnova), F2 (Minimum sadržaj), F3 (nova ljuska) i F4 (Standard sadržaj) su završeni u kodu.** `CHECKLIST.md` vodi F0–F4 kao `[x]`; **F4 još nije commitovan** (radi se u jednom radnom stablu).
- Testovi: backend `cd backend && npx jest -c /tmp/jest.local.cjs modules/install` → **43 suite / 219 testova** (`modules/install modules/settings` → 71 / 341); puni backend prolaz → `550 passed / 74 failed / 4 skipped` od 628 suita, **2892** testa prolazi + 26 skipped, `0` padajućih testova, a skup padajućih suita je **identičan** pristine HEAD-u (`comm -3` prazan); frontend `cd frontend && npx vitest run` → **242 fajla / 1024 testa**, 0 padajućih (`--reporter=json`); `npx tsc -b`, `npx eslint` (0 grešaka; 14 postojećih upozorenja van install/settings), `npx prettier --check src`, `scripts/check-theme-contrast.mjs` i `npx vite build` čisti.
- **Commitovano i pushovano** na `arena/72aa620f-help-desk-enterprise` (4 commita, jedan po fazi; poruke na kraju fajla):
  - `1e8ac2d` fix(install): fail-closed wizard gate, single status source and readiness guard (F0)
  - `c4ddba1` feat(install): step registry, installation packages, step deferral and readiness (F1)
  - `dafeb3d` feat(install): identity step, parametrized structure seed and team step (F2)
  - `40898db` feat(install-ui): split-screen wizard shell, package picker and review findings (F3 + IN11/IN18/IN19 + dijeljeni sloj)
  - Faze su rađene u jednom radnom stablu, pa commit po fazi nije po hunkovima: dijeljeni fajlovi (tipovi, i18n, docs, e2e helper) su u F3 commitu — stablo na `40898db` je provjereno stanje, međukomitovi nisu zasebno buildani.
- **Sljedeća faza je F5** (`06_phase-f5-full-sadrzaj.md`): Inbound/LDAPS kao tvrdnja operatera, sigurnosne preporuke (MFA obavezno za admine, HIBP, idle sesija; captcha off), znanje/status/dežurstva/najave/ITSM/integracije/privatnost po odluci vlasnika 7–8. F4 je ostavio otvoreno samo ono što plan i traži od F5.
- **F4 u radnom stablu** (51+ izmijenjena/novа putanja): vidi „Šta je urađeno (F4)“ niže i `CHANGELOG.md` za taj dan.

## Odluke vlasnika (obavezujuće, `00_overview.md` §9)

1. Bez auto-prijave nakon `complete` → `/login`.
2. Tim bez SMTP-a: privremena lozinka se prikazuje **jednom**, kroz postojeći `temporaryPassword` / `temporaryPasswordDelivery` (F2).
3. Blueprinti: IT + HR + Finance uz postojeće `itStandard`, `hrRestricted`, `financeRestricted` (F4).
4. Full uključuje CMDB/problemi/promjene po defaultu (`defaultEnabledAddons` u katalogu paketa; primjena je F4/F5).
5. Promjena paketa dozvoljena na koraku paketa; reset stanja po registry planu, bez brisanja kredencijala/identiteta/seed podataka; nakon seeda samo nadogradnja.
6. `INSTALL_ALLOW_RERUN` ostaje ops-only.
7. Sigurnosne preporuke za F5: MFA obavezno za admine (`private.auth.mfa.requiredForAdmins=true`), MFA opcion za ostale (`allowOptional=true`), HIBP on (`private.security.hibp.enabled=true`), idle sesija 1800 s ako validator podržava, captcha off u wizardu dok nema Turnstile ključeva.
8. Inbound i LDAPS: tvrdnja operatera, bez automatskog testa; test na zahtjev je F5 (nema `/install/inbound` ni `/install/ldaps` ruta u F1).

## Šta je urađeno (F0)

- **F0.1** `install-token-gate.tsx` je fail-closed: otključava samo na uspješan `GET /install/super-admin`; kandidat-token se šalje bez upisa, u `sessionStorage` ide tek nakon uspjeha; mreža/5xx/timeout → `install.tokenUnavailable` + „Pokušaj ponovo“; sačuvani token se pri mountu tiho provjerava, a odbačeni se briše.
- **F0.2** `lib/install/use-install-step-resource.ts` (`loading | error | ready`, `retry`, `setData`, cancel na unmount) + `components/install/install-step-load-error.tsx` (poruka, request id, retry); primijenjeno na super admin, prijavu, SMTP, seed i dodatke. **Nijedna forma se ne renderuje u `error` stanju.**
- **F0.3** `InstallSetupProvider` je jedini čitač `GET /install/status` i nosi `nextStep`, `steps`, `profile`, `readiness`; ljuska računa korak kroz `lib/install/resolve-rendered-step.ts`, a fallback je prvi **blokirajući** korak iz paketa (nikad slijepo `superAdmin`).
- **F0.4** `role="alert"` u seed, SMTP, prijava, završetak i na opštoj grešci super admina.
- **F0.5** `has-saved-install-addons.ts`: dodatak je „završen“ samo ako postoji bar jedan upisan `private.addons.*` ključ; frontend prikazuje `install.addons.notSavedHint` dok korak nije potvrđen.
- **F0.6** `ensure-install-fallback-group-member.ts` (kroz `addGroupMember`, kao `POST /groups/:groupId/members/:userId`) — seed je idempotentan, bez duplog članstva; readiness `handlerGroup` je time zelen.
- **F0.7** `evaluate-install-readiness.ts` + `read-install-readiness-source.ts`; `POST /install/complete` → `409 INSTALL_NOT_READY` sa `details.missing`; frontend mapira u `install.complete.notReady` + listu `install.readiness.<key>`.
- **F0.8** Docs sync: `.cursor/docs/04-install-wizard.md` (katalog dodataka po `addon-catalog.ts`, paketi, readiness, settings ključevi), MATRIX + CHANGELOG matrice, audit 11 (statusi + novi nalazi IN15–IN18), Constitution §39 „Izuzetak: install wizard“ + linija u `.cursor/rules/frontend-ui-ux.mdc`.

## Šta je urađeno (F1)

- **Registry koraka** `steps/install-step.registry.ts` (order, `requiredIn`, `offeredIn`, `skippable`, `resettableSettingKeys`) + `steps/install-step.types.ts` (`isInstallStepBlocking` — jedino mjesto gdje se odlučuje da li korak stoji na putu) + `steps/resolve-install-next-step.ts`.
- **Status** `read-install-step-states.ts` (`readInstallStepProgress`, `readInstallProfile`, `toInstallStepStates`); `GET /install/status` vraća `profile` i `steps.<key>.{completed,skipped,required,offered,blocking}`. Bez izabranog paketa ponašanje je kao `minimum`, a korak paketa nije blokirajuć → `e2e/helpers/ensure-install.ts` prolazi nepromijenjen.
- **Paket** `install-profile.catalog.ts` (tri paketa, `estimatedMinutes`, `recommended`, `defaultEnabledAddons`), `install-profile.service.ts` (upis + nadogradnja nakon seeda), `plan-install-profile-reset.ts` (registry-driven reset), `GET/POST /install/profile`.
- **Odgađanje** `install-step-skip.service.ts`, `POST/DELETE /install/steps/:stepKey/skip` → `400 INSTALL_STEP_NOT_SKIPPABLE` / `INSTALL_STEP_UNKNOWN`, `409 SUPER_ADMIN_REQUIRED`.
- **Readiness endpoint** `install-readiness.service.ts` + `steps/evaluate-install-profile-steps.ts`: `GET /install/readiness` → `{ isReady, checks: [{ key, status, messageKey, stepKeys? }] }`.
- **Settings** `private.install.profile` (default `''`) i `private.install.steps.<stepKey>.skipped` (6 ključeva, boolean false) u `setting-keys.ts` + `definitions/install-wizard-settings.ts`; i18n guard za registry podignut na 480 ključeva (+ bs/en `keys` i `help` zapisi).
- **Frontend (minimalno za F1)** `services/install-profile-api.ts` (`loadInstallProfile`, `saveInstallProfile`, `skipInstallStep`, `unskipInstallStep`, `loadInstallReadiness`), prošireni tipovi `InstallStepKey`/`InstallWizardStep`/`InstallStepState` u `services/install-api.ts`, i `profile`/`readiness` u provideru.
- **i18n** bs + en: `install.tokenUnavailable`, `tokenChecking`, `retry`, `stepLoadError`, `requestId`, `profile.*` (naslovi i opisi tri paketa), `step.{skip,skipped,undoSkip}`, `readiness.*` (10 ključeva), `complete.notReady`, `addons.notSavedHint`, `steps.profile`.

## Šta je urađeno (F2)

- **F2.1 Identitet** — `install-identity.service.ts`, `validate-install-identity.ts` (obavezno ime organizacije, dužine iz `brandingLimits`, `bs`/`en`, IANA zona, format kontakata; logo prepušta `validateLogoDataUrl`), `read-install-identity-status.ts` (defaulti `Service Desk` / `bs` / `Europe/Sarajevo`, `logoConfigured` umjesto data URL-a), `dto/save-install-identity.dto.ts`, `GET/POST /install/identity` u `install.controller.ts`. Upis ide kroz `settingsService.setSettingValues(...)` u jedan `install_identity` change log sa founderom kao aktorom; nepopunjena polja se **ne** šalju. Registry: `identity` (order 25, obavezan svuda, nije `skippable`, ne resetuje ništa), `completed` = upisan `public.branding.organizationName`. Vidljivost: `BrandingService.load()` čita iste ključeve kao javni brending endpoint (dokazano u `install-identity.service.spec.ts`).
- **F2.2 Parametrizovan seed** — `resolveInstallSeedNames` (`install-seed.names.ts`) + `buildInstallSeedSlug` (č/ć/đ/š/ž → ascii) + `resolveInstallSeedSlaProfile` (`install-seed-sla-profile.ts`), `dto/create-install-seed.dto.ts` (sva polja opciona → bez body-ja tok je kao prije), `ensure-install-seed-service.ts` (novi orchestrator), `to-install-seed-structure-warning.ts` (`NAMES_ALREADY_SEEDED`), `categoryName` u javnom zapisu. Readiness `slaProfile` = `is-seeded-service-under-active-sla.ts`.
- **F2.3 Tim** — `install-team.service.ts` (kroz `createUser` + `addGroupMember`, aktor je founder; `CreateInstallTeamMember` je testna „šavna“ tačka kao hash funkcija u `createInstallSuperAdmin`), `validate-install-team.ts` (1–25 redova, jedinstveni emailovi, `AGENT`/`ADMIN`, normalizacija), `read-install-team-status.ts` (`isTeamInvited` = postoji član koji nije founder), `dto/save-install-team.dto.ts`, `map-install-team-error.ts` (400/409). Modul: `SmtpMailTransport` + `{ provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport }` lokalno (izbjegnut ciklus sa NotificationsModule).
- **Frontend** — `install-identity-step.tsx` (+`-fields`), `install-structure-step.tsx` (+`install-structure-preview.tsx`, zamjenjuje `install-seed-step.tsx`), `install-team-step.tsx` (+`-member-row`, `-credentials-dialog`), `lib/install/install-identity-form.ts`, `lib/install/install-time-zones.ts` (`Intl.supportedValuesOf` + fallback), `map-install-identity-save-error.ts`, `map-install-team-save-error.ts`, `services/install-identity-api.ts`, `services/install-team-api.ts`, prošireni `InstallStepKey` na 8 koraka, `renderableInstallSteps` + `WIZARD_STEP_ORDER` + `STEP_LABEL_KEYS` + `installWizardCopyKeys`.
- **i18n bs+en** — `install.identity.*` (22), `install.structure.*` (16), `install.team.*` (23), `steps.identity`, `steps.team`, readiness `slaProfile` poruka; `install.seed.*` sveden na `errorSuperAdmin`/`errorGeneric`; registry `keys`/`help` 482 (guard podignut).
- **Specovi** — backend: `install-identity.service.spec.ts` (10), `install-seed.parametrized.spec.ts` (6), `install-team.service.spec.ts` (8), `install-steps.controller.spec.ts` (3), + izmjene `install-readiness.service.spec.ts` (2 nova slučaja), `steps/resolve-install-next-step.spec.ts`, `install-setup.addons.spec.ts`, `install-step-skip.service.spec.ts`, `install.controller.spec.ts`. Frontend: `install-identity-step.spec.tsx` (5), `install-structure-step.spec.tsx` (5), `install-team-step.spec.tsx` (4), `install-identity-form.spec.ts` (5), `resolve-rendered-step.spec.ts` (+2).
- **Harness proširen** — `create-install-wizard-harness.ts` sada nosi `identityService`, `teamService`, `seedService` (pravi `InstallSeedService` sa stvarnim loaderima) i `saveIdentity()`; in-memory SLA delegat dobio `findUnique`.

## Šta je urađeno (F3)

- **Ljuska** — `components/install/shell/`: `install-wizard-shell.tsx` (grid 5/7), `install-brand-panel.tsx` (živi identitet iz `useBranding()`, `.pulse-gradient`, `primary-foreground` prozirnosti), `install-step-rail.tsx` (pet stanja + `tone="brand"|"surface"`), `install-what-you-get-panel.tsx`, `install-mobile-header.tsx` (sticky zaglavlje, `role="progressbar"`, `aria-live`, sheet sa „Šta dobijaš“), `install-step-footer.tsx` (Nazad / Podesi kasnije / Nastavi). `lib/install/install-step-presentation.ts` je jedini izvor redoslijeda koraka, ikona, naslova i „Šta dobijaš“ stavki (`install.whatYouGet.<step>.<n>`).
- **Navigacija i odgađanje** — `lib/install/use-install-step-navigation.ts` (pregled samo koraka koje paket nudi i koji su odgovoreni; `continueForward` vraća na `nextStep`; pregled se resetuje kad server pomjeri korak), `use-install-step-deferral.ts` + `map-install-step-skip-error.ts` („Podesi kasnije“/„Vrati u tok“ sa mapiranim greškama u `install.step.skipError*`).
- **Ekran paketa** — `install-profile-step.tsx` (loader) / `install-profile-form.tsx` (izbor) / `install-profile-card.tsx` (procjena, „Preporučeno“ s `pop-in`, „Prikaži sve“ sheet) / `install-profile-customize.tsx` (prekidači za `skippable` korake, zaključani obavezni s `install.profile.lockedHint`), `lib/install/install-profile-items.ts` (ikone + koji korak posjeduje stavku + `listInstallProfileItems`), `lib/map-install-profile-save-error.ts`.
- **Feature kartica** — `install-feature-card.tsx`: `switch` / `locked` / `included`, zavisnost (`disabledReason`) gasi switch; spremna za F4–F6.
- **Motion** — `use-install-step-transition.ts` (fokus na naslov koraka uz `preventScroll`, `page-in`), `use-prefers-reduced-motion.ts`; sve ≤250 ms i bez animacije uz `prefers-reduced-motion: reduce`.
- **Engine flip (odluka vlasnika F3/1)** — `isInstallStepBlocking` više ne izuzima `profile` dok paket nije izabran; `profile ?? 'minimum'` ostaje profil za sve ostale odluke. `install-profile.catalog.ts` sada tačno navodi `identity` u `requiredSteps` (bio je previd iz F2). `e2e/helpers/ensure-install.ts` prvo bira `minimum`.
- **Status** — `steps.<key>.skippable` (`install-step.types.ts`, `read-install-step-states.ts`, `InstallStepState.skippable?` na frontendu).
- **Popravke iz CI-ja (PR #10):** (1) šest install servisa je Prisma-u uvozilo kroz `import type`, pa je `app.module.spec.ts` padao na DI-ju (`argument Function at index [1]`) — sada vrijednosni uvoz + novi `install-di-metadata.spec.ts` kao guard; (2) `install-step-rail.tsx` je koristio `text-muted-foreground/60` i `/80`, što ruši `scripts/check-theme-contrast.mjs` (provjera C) — stanja se sada razlikuju bez alfe na tekstu; (3) `install-wizard-shell.tsx` je nosio `outline-none` bez zamjene za fokus, pa naslov koraka sada ima marker `a11y-focus:` (fokus je programatski, `tabIndex={-1}`).
- **Popravke otkrivene u F3** — `/install` je sada i na `loading`/`error` statusa prikazivao skeleton odnosno `GateStatusError` sa retry-em (prije F3 je neuspješno čitanje statusa ostavljalo vječni skeleton, jer `/install` ne ide kroz `InstallSetupLayout`); obrisan mrtvi `lib/resolve-install-wizard-step.ts` + spec (IN6), pa naslovi/opisi koraka žive samo u `install-step-presentation.ts`.
- **Specovi** — `shell/install-step-rail.spec.tsx` (3), `shell/install-wizard-shell.spec.tsx` (4: sadržaj/živi identitet, fokus na naslov, `page-in`, reduced motion), `install-feature-card.spec.tsx` (4), `install-profile-step.spec.tsx` (4: kartice, snimanje, odgađanje vs zaključano, `errorLocked`), `lib/install/use-install-step-navigation.spec.tsx` (4) i `pages/install-page.spec.tsx` (4, integracija: korak iz statusa, odgađanje samo za `skippable`, „Nazad“ bez pomjeranja toka), izmijenjen `resolve-rendered-step.spec.ts` (paket je renderabilan, fallback je `profile`) i `install-team-step.spec.tsx` (dugme odgađanja preseljeno u footer).
- **Visual QA** — `components/visual-qa/visual-qa-install-board.tsx` + red u `pages/visual-qa-primitives-page.tsx` (rail u oba tona, feature kartica u sva tri stanja, aktivna tema/mode/akcent na ekranu).

## Šta je urađeno (F4)

- **F4.1 SMTP test** — `POST /install/smtp/test` (`install-smtp-test.service.ts`, `install-smtp-test.controller.ts`, `install-smtp-test.{types,constants,error}.ts`, `map-install-smtp-test-error.ts`, `dto/send-install-smtp-test.dto.ts`). Prima `{ toAddress? }` (prazno = adresa super admina), šalje kroz postojeći `MAIL_TRANSPORT` sa `Auto-Submitted` + `X-Auto-Response-Suppress`, vraća `{ isSent, toAddress }`. Bira **razumljiv** kod: `SMTP_TEST_{AUTH_FAILED,TLS_FAILED,UNREACHABLE,TIMEOUT,SEND_FAILED}` (klaifikacija iz `EAUTH`/`ETLS`/`ETIMEDOUT`/`ECONNECTION`/`ENOTFOUND`); bez SMTP-a `SMTP_TEST_NOT_CONFIGURED`, bez super admina `SUPER_ADMIN_REQUIRED`, rate limit preko `TestEmailRateLimiter`-a (vlastita instanca — instalacijski modul ne uvozi Redis). UI: `install-smtp-test-panel.tsx` u SMTP koraku + `lib/install/map-install-smtp-test-error.ts`; panel je ugašen dok forma ima nesačuvane izmjene i tako ne obećava test za host koji još nije sačuvan.
- **F4.2 Blueprints** — `blueprints/` (`install-blueprint.types.ts`, `install-blueprint.registry.ts` sa `itServiceDesk`: 5 kategorija, 10 servisa, `nivo-1`/`nivo-2`, `install-blueprint.constants.ts`, `install-blueprint.error.ts`, `map-install-blueprint-error.ts`, `apply-install-blueprint.ts` (jedna transakcija; tier grupe pa servisi), `assert-install-blueprint-routing.ts` (`resolveTicketRouting === EXACT` za svaki servis), `install-blueprint.service.ts`, `install-blueprint.controller.ts`, `dto/apply-install-blueprint.dto.ts`) + `GET /install/blueprints` i `POST /install/blueprints/apply`. Idempotentno po slugu; imena `{bs,en}` u registryju; postojeći `opsti-zahtjev` iz F2 seeda se preuzima. Rezultat nosi `createdCategoryCount`, `createdServiceCount`, `existingServiceCount`, `createdTierGroupCount`, `tierGroupKeys` i po servisu `{key, categoryKey, serviceId, name, slug, created, routed}`. UI: `install-blueprint-step.tsx` + `install-blueprint-tree.tsx`.
- **F4.3 Policy pack** — `GET|POST /install/policy-pack` (`install-policy-pack.*`, `map-install-policy-pack-error.ts`, `dto/apply-install-policy-pack.dto.ts`): nudi pakete iz `policyPackKeys` primijenjenog blueprinta, provjerava `private.policyPacks.disabledKeysCsv` (`PACK_DISABLED`), primjenjuje kroz funkciju `applyPolicyPack` (svjesno bez `PolicyPacksService` — ciklus preko Authentication modula) i upisuje marker `private.install.policyPack`. UI: `install-policy-pack-step.tsx`.
- **F4.4 SLA pregled** — `GET|POST /install/sla-review` (`install-sla-review.*`, `read-install-sla-review-status.ts`, `map-install-sla-review-error.ts`, `dto/save-install-sla-review.dto.ts`): čita `BH_STANDARD` kalendar + matricu; `confirmed` upisuje samo `private.install.slaReview`, `adjusted` mijenja kalendar (`updateBusinessHoursCalendar`) i/ili ćelije matrice (`patchPriorityMatrix`) uz `reason: 'install_wizard'`. UI: `install-sla-review-step.tsx`, `install-business-hours-editor.tsx`, `install-priority-matrix-preview.tsx`, `lib/install/install-weekly-hours.ts`.
- **F4.5 Dodaci** — `lib/install/install-addon-presentation.ts` (14 × ikona/naslov/rečenica vrijednosti; kategorije Kvalitet usluge, Kontrola, Produktivnost, ITSM moduli, Integracije), `install-addons-step.tsx` prešao na `install-feature-card.tsx`, `resolve-install-addon-defaults.ts` (unija `defaultEnabledAddons` do izabranog paketa → Full uključuje CMDB/probleme/promjene, odluka vlasnika 4) i `GET /install/addons` koji te defaulte vraća i kao `enabled` i kao `defaultEnabled`. `install-feature-card.tsx` dobio `isDisabled`.
- **Zajednički dijelovi F4** — `install-content.controller.ts` (policy-pack + sla-review rute, `install.controller.ts` ostaje ispod 200 linija), `install-content-api.ts` (jedan tipiziran klijent za sve F4 rute), `lib/install/resolve-install-locale.ts` (bs/en iz `i18n.language`), `lib/install/map-install-content-save-error.ts`, novi koraci u `lib/install/install-step-presentation.ts` (+ `install.steps.*`, `install.whatYouGet.*`), skip DTO prima tri nova ključa.
- **Specovi F4** — backend: `apply-install-blueprint.spec.ts` (7: kreiranje, idempotencija, `EXACT` ruting za svaki servis, tier grupe, podskup, nepoznat servis, lokalizovana imena), `install-smtp-test.service.spec.ts` (6: primaoc, neispravna adresa, nekonfigurisan SMTP, mapiranje grešaka, rate limit), `install-policy-pack.service.spec.ts` (5: ponuda iz blueprinta, marker, `POLICY_PACK_NOT_OFFERED`, `PACK_DISABLED`), `install-sla-review.service.spec.ts` (6: status, `confirmed` bez izmjena, `adjusted` kroz domenske funkcije, prazna izmjena, super admin, kalendar koji ne postoji), `resolve-install-addon-defaults.spec.ts` (3). Frontend: `install-blueprint-step.spec.tsx` (4), `install-policy-pack-step.spec.tsx` (3), `install-sla-review-step.spec.tsx` (3), `install-smtp-test-panel.spec.tsx` (4), `install-addons-step.spec.tsx` (4), `lib/install/install-weekly-hours.spec.ts` (4).
- **Popravke otkrivene u F4** — (1) tri nova koraka su isti `useEffect` vezivala na `resource` objekat koji mijenja identitet svakog rendera, pa je efekat poništavao upravo snimljeno stanje (uhvatio `install-policy-pack-step.spec.tsx`); sada se draft puni jednom (`isSeeded`). (2) `install-di-metadata.spec.ts` dobio redove za tri nova kontrolera i nove provajdere. (3) `ci.yml` i `docs/plans/modules/5.2-…md` su referencirali nepostojeći `docs/plans/ci-e2e-kapija.md` — sada pokazuju na `docs/plans/CI-KVALITETNA-KAPIJA.md`. (4) i18n guard `settings-registry-coverage.spec.ts` 482 → 488 uz naslove/pomoć za tri markera i tri skip ključa.

## Odstupanja od plana i otvorene stvari

- **„Prilagodi“ (odluka vlasnika F3/2):** prekidači odgađaju **korake** kroz F1 `private.install.steps.<key>.skipped`; stavke kataloga koje još ne pripadaju nijednom koraku (blueprints, policy pack, sigurnosne preporuke, inbound, LDAPS, KB, status, dežurstva, najave, ITSM, integracije, privatnost) prikazane su kao sadržaj paketa u karticama i „Prikaži sve“ sheetu — bez prekidača koji ništa ne radi. F4/F5 im daju stvarno značenje.
- **IN19, IN18, IN11 (zatvoreni):** odgoda više ne preživi promjenu paketa (`reopenedSteps`), install ključevi nose `readOnly` metadata, a polja s napomenom imaju `aria-describedby` — sve troje je u commitima `40898db` / `9b63f1d` / `450198f`.
- **Lighthouse a11y ≥ 95 (kriterij prihvatanja F3)** nije mjeren u ovoj sesiji — nema browsera; provjereno je `npx vite build`, `tsc`, eslint, prettier i RTL testovi (uključujući fokus i `role="progressbar"`/`aria-live`). Mjerenje treba ponoviti u F6 uz E2E prolaz kroz UI.
- `logoDataUrl` se **ne može obrisati** iz wizarda: settings registry odbija prazan logo, a wizard ne nudi „ukloni“ — brisanje ostaje u Settings → Brending. (Plan je predviđao samo upload.)
- `LOGO`: iz istog razloga `SaveInstallIdentityInput.logoDataUrl` prima samo `string` (nema `null`).
- `GET /install/seed` vraća `categoryName` kao string ili `null` (postojeća kategorija zadržava svoje ime) — kategorija iz seeda se **ne** preimenuje, kao ni OU/grupa/servis.
- `POST /install/seed` je zadržao strogu validaciju tela (`forbidNonWhitelisted`) — klijent koji pošalje nepoznato polje dobija 400, kao i prije.
- „Podesi kasnije“ živi **isključivo u footeru ljuske** (`install-step-footer.tsx`) i crta se iz `steps.<key>.skippable` — korak **Tim** je u F3 izgubio vlastito dugme da dozvola ostane na jednom mjestu (IN17 zatvoren; odgađanje i vraćanje u tok pokriva `pages/install-page.spec.tsx`).
- `install.profile.item.*` prijevodi su upisani uz ekran paketa (IN16 zatvoren); katalog i dalje vraća `labelKey`, prijevod se traži preko `t(key as never)`.
- `GET /install/status` je otvoren i nakon complete-a (kao i prije) — `install/addons` je i dalje jedina dodatna otvorena GET ruta.
- `fallbackPasswordPolicy` u super admin koraku je namjerno zadržan sa komentarom (IN10).
- `docs/analysis/TASKS.md` nosi sekciju **Install Wizard v2**; od nalaza je otvoren samo **IN14** (komponentski testovi za svaki korak + E2E prolaz kroz UI), koji se zatvara u F6 — pravilo „nema TODO-a bez tiketa“ važi i za plan foldere.
- **Uski Prisma tipovi traže cast (naučeno na F4 CI-ju):** funkcije koje primaju „ručno skrojenu“ Prisma tipu (`InstallCompletionPrisma`) ne primaju `this.prisma` bez `as unknown as` — pravi klijent ima preopterećen `$transaction` koji se ne poklapa s jednim callback potpisom, a lokalni stub to ne vidi (`nest build` u CI-ju jeste). `InstallCompletionPrisma` sada nosi marker `__narrowPrismaShape`, pa se ta greška reprodukuje i lokalno; novi kod može birati: ili primi `PrismaService` (kao `persistInstallMarker`), ili cast na mestu poziva (kao `install-complete.service.ts`).
- `backend/src/generated/prisma/` (git-ignored, `.gitignore:12`) je **lokalni stub** umjesto `prisma generate`: sandbox ne može da dohvati Prisma engine (`binaries.prisma.sh`). Stub se generiše skriptom `/tmp/gen-prisma-stub.mjs` (56 enuma iz `prisma/schema/*.prisma` + 137 model delegata; `PrismaClient` sa `$transaction`/`$queryRaw` overload-ima i `Prisma` namespace-om). U pravoj okolini ga zamjenjuje `npx prisma generate` na istom putu. **Stub nije dio isporuke** i ne pojavljuje se u `git status`-u; ako `/tmp` ispari, skripta se piše ponovo prije pokretanja testova.
- **Puni backend prolaz (bez filtera) nakon F4:** `550 passed / 74 failed / 4 skipped` od 628 suita, `2892` testa prolazi / `26` preskočeno (`2918`), `0` padajućih testova. Svih 74 padajućih su **compile-only** (ts-jest prijavljuje TS greške prije izvršavanja) i **identični su na čistom HEAD-u**: kontrolni rad u `/tmp/pristine` (`git archive HEAD` + isti stub + `node_modules` preko symlinka) daje istih 74 suita i `2784` prolaznih testova (razlika je tačno F0–F4: +108 testova). Nijedan pad nije u `modules/install` ni `modules/settings`.
  - Uzrok je interakcija relaksiranog ts-jest config-a (bez `noImplicitAny`, bez `prisma generate`) sa lokalnim stubom: npr. `const children = []` unutar generičkog `executeTicketOperation(async () => …)` se prijavljuje kao `never[]` (`tickets/split/tickets-split.service.ts:74`), plus nekoliko `never`/`unknown` mjesta u tickets/reports/sla/privacy/assets. Pošto je set identičan na pristine HEAD-u, to nije regresija F0/F1 i ne treba ih popravljati u ovoj fazi; ne diraju instalaciju.
  - Kada se pojavi stvarni `prisma generate` u CI-ju, ovih 74 suita treba ponovo provjeriti.

## Predložene commit poruke

**F0:**
```
fix(install): fail-closed wizard gate, single status source and readiness guard

- token gate unlocks only on a verified token and keeps network/5xx failures
  closed with a retry (install.tokenUnavailable)
- shared use-install-step-resource + InstallStepLoadError: a step never renders
  its form before its state is known
- InstallSetupProvider is the only reader of GET /install/status; the shell
  follows nextStep instead of falling back to superAdmin
- add-ons step counts as done only after a saved catalog; disabled add-ons hint
- seed adds the SuperAdmin to the fallback group through addGroupMember
- POST /install/complete refuses an unfinished install with INSTALL_NOT_READY
  and the unmet keys; role="alert" on step errors
- docs: 04-install-wizard, MATRIX + changelog, audit 11, Constitution §39
```

**F4:**
```
feat(install): standard content — SMTP test, blueprints, policy pack, SLA review

- POST /install/smtp/test sends through the existing mail transport and answers
  with a code per cause (auth, TLS, timeout, unreachable, send); the panel stays
  disabled while the SMTP form has unsaved edits, because the endpoint only
  knows what is stored
- GET /install/blueprints + POST /install/blueprints/apply: the IT service desk
  catalog (5 categories, 10 request types, optional tiers) applied in one
  transaction, idempotent by slug, with EXACT routing proven for every service
  before anything is committed
- GET/POST /install/policy-pack applies the blueprint's pack through the domain
  function (no PolicyPacksService — it would close a cycle), honouring
  private.policyPacks.disabledKeysCsv
- GET/POST /install/sla-review records "I confirm the defaults" or writes the
  edited week through updateBusinessHoursCalendar with reason install_wizard;
  the priority matrix is shown, not edited
- the add-ons step speaks the operator's language (14 cards, five categories) and
  the package defaults are real: Full switches CMDB, problems and changes on
- i18n bs+en for every new key; settings registry guard 482 -> 488
```

**F3:**
```
feat(install-ui): split-screen wizard shell

- 5/7 shell: brand panel with the live organisation, a rail with five step states
  taken from the status endpoint, "What you get" (a sheet on phones) and one
  footer for every step (Back / Configure later / Continue)
- Back is a review of an answered step, never a second way to fill the wizard
- the package step is the wizard's first question and blocks: an installation
  without a package can no longer complete, and ensure-install picks `minimum`
- status carries steps.<key>.skippable so the shell defers only what the registry
  allows; step transitions and the "Recommended" marker respect reduced motion
```

**F2:**
```
feat(install): identity step, parametrized structure seed and team step

- GET/POST /install/identity writes branding, locale and time zone through the
  settings registry (same validators as the Settings screen); the step counts as
  done once the organisation name is stored and the login page shows it
- POST /install/seed accepts an optional body with the client's names; slugs,
  keys and the distinguished name are derived from them, a repeated seed never
  renames existing records and answers NAMES_ALREADY_SEEDED
- the seeded service gets the STANDARD_REQUEST SLA profile and readiness
  slaProfile now checks the service instead of any profile in the deployment
- GET/POST /install/team creates accounts through the users domain and adds
  them to the handler group; without SMTP the temporary password is shown once
- identity and team as first-class wizard steps (registry, status, shell)
- install.controller split into install.controller + install-steps.controller
```

**F1:**
```
feat(install): step registry, installation packages, step deferral and readiness

- install step registry (order, requiredIn, offeredIn, skippable, resettable
  keys) drives the wizard flow through resolveInstallNextStep
- GET/POST /install/profile with registry-driven reset on package change and
  upgrade-only after the seed
- POST/DELETE /install/steps/:stepKey/skip through the settings registry
- GET /install/readiness incl. profileSteps; GET /install/status gains profile
  and steps.<key>.{skipped,required,offered,blocking} (backwards compatible)
- settings: private.install.profile and private.install.steps.<key>.skipped
  with bs/en registry copy; frontend API for packages, skips and readiness
```
