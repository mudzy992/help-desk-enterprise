# Install Wizard v2 — checklista

Legenda: `[ ]` čeka · `[~]` u toku · `[x]` gotovo. Svaka stavka se zatvara tek kad su testovi zeleni i MATRIX ažuriran (gdje je relevantno).

## Prije početka
- [x] Vlasnik potvrdio plan (`00_overview.md`)
- [x] Odgovori na otvorena pitanja 1–8 upisani u `00_overview.md` §9 (odluke vlasnika, 2026-10-15)
- [ ] Nije primijenjeno: unos u `docs/analysis/TASKS.md` — F0/F1 su vođeni direktno iz ovog foldera (uputa sesije), a `TASKS.md` po svom pravilu drži samo jednu `[~] IN PROGRESS` stavku (trenutno Faza 9, E2E)

## F0 — Stabilizacija (`01_phase-f0-stabilizacija.md`)
- [x] F0.1 Token gate fail-closed (IN2) — `install-token-gate.tsx` + spec (5 slučajeva); token se upisuje tek nakon provjere
- [x] F0.2 Hook `use-install-step-resource` i stanje greške bez forme (IN3) — hook + `InstallStepLoadError` + primjena na 5 koraka + spec
- [x] F0.3 Jedan izvor statusa u `InstallSetupProvider` (IN4, IN5) — provider nosi `nextStep`/`steps`/`profile`/`readiness`; ljuska nema drugi zahtjev ni `superAdmin` fallback
- [x] F0.4 `role="alert"` na greškama koraka — seed, SMTP, prijava, završetak (+ opšta greška super admina)
- [x] F0.5 Korak „Dodaci“ se ne preskače nakon osvježavanja — `has-saved-install-addons.ts`, `install-setup.addons.spec.ts`, `install.addons.notSavedHint`
- [x] F0.6 Super admin je član fallback grupe — `ensure-install-fallback-group-member.ts` kroz `addGroupMember`, idempotentno
- [x] F0.7 Readiness guard u `complete` (`INSTALL_NOT_READY`) — `evaluate-install-readiness.ts` + `read-install-readiness-source.ts` + frontend mapiranje i lista
- [x] F0.8 Docs sync (04, MATRIX, audit 11) i izuzetak u Constitution-u — `04-install-wizard.md` (katalog dodataka, paketi, readiness), MATRIX + CHANGELOG matrice, audit 11 (IN2–IN5 + novi nalazi IN15–IN18), Constitution §39 + linija u `.cursor/rules/frontend-ui-ux.mdc`

## F1 — Backend osnova (`02_phase-f1-backend-osnova.md`)
- [x] Registry koraka i `resolve-install-next-step` — `steps/install-step.registry.ts`, `steps/resolve-install-next-step.ts`, `read-install-step-states.ts` (+ `steps/resolve-install-next-step.spec.ts`)
- [x] `private.install.profile` + `GET/POST /install/profile` — `install-profile.service.ts` + `plan-install-profile-reset.ts` (+ specovi), katalog u `install-profile.catalog.ts`
- [x] `private.install.steps.<key>.skipped` + skip/unskip rute — `install-step-skip.service.ts`, `POST/DELETE /install/steps/:stepKey/skip` (+ spec)
- [x] `GET /install/readiness` (+ `profileSteps`) — `install-readiness.service.ts`, `steps/evaluate-install-profile-steps.ts` (+ spec)
- [x] Kompatibilnost `GET /install/status` i `e2e/helpers/ensure-install.ts` — bez paketa ponašanje je kao `minimum`; `addons` se računa iz upisanih ključeva; `handlerGroup` zelen nakon seeda

## F2 — Minimum sadržaj (`03_phase-f2-minimum-sadrzaj.md`)
- [x] Korak Identitet (branding, jezik, vremenska zona) — `install-identity.service.ts` + `validate-install-identity.ts` + `read-install-identity-status.ts` + `dto/save-install-identity.dto.ts`, `GET/POST /install/identity`, korak u registryju između `superAdmin` i `loginProvider` (i18n `install.identity.*`, RTL spec, vidljiv na login stranici)
- [x] Parametrizovan seed (OU, grupa, servis, kategorija) + SLA profil servisa — `POST /install/seed` sa opcionim body-jem (`dto/create-install-seed.dto.ts`, kompatibilno bez body-ja), `build-install-seed-slug.ts` + `install-seed.names.ts`, `NAMES_ALREADY_SEEDED` upozorenje bez preimenovanja, `install-seed-sla-profile.ts`, stvarna readiness provjera `slaProfile`, UI `install-structure-step/-preview`
- [x] Korak Tim (kreiranje korisnika + članstvo) — `install-team.service.ts` + `validate-install-team.ts` + `read-install-team-status.ts` + `dto/save-install-team.dto.ts`, `GET/POST /install/team` kroz `createUser` + `addGroupMember`, privremena lozinka jednom, `skippable` u Minimumu (UI `install-team-step/-member-row/-credentials-dialog`), `install-team.service.spec.ts` (duplikat emaila, članstvo)

## F3 — Nova ljuska (`04_phase-f3-nova-ljuska.md`)
- [x] Split-screen ljuska, rail koraka, mobilno zaglavlje + sheet — `components/install/shell/{install-wizard-shell,install-brand-panel,install-step-rail,install-what-you-get-panel,install-mobile-header,install-step-footer}.tsx`, `lib/install/install-step-presentation.ts` (ikone, naslovi, „Šta dobijaš“), `lib/install/build-install-rail-items.ts`; rail ima pet stanja iz statusa (`done/current/deferred/locked/upcoming`), „Šta dobijaš“ je sheet na mobilnom
- [x] Korak izbora paketa + prilagodba — `install-profile-step/-form/-card/-customize.tsx` (kartice s procjenom i „Preporučeno“, „Prikaži sve“ sheet, IN16 prijevodi `install.profile.item.*`, „Prilagodi paket“ preko registry `skippable`); engine flip: paket je prvi korak i blokira, `steps.<key>.skippable` u statusu, `e2e/helpers/ensure-install.ts` bira `minimum`
- [x] „Nazad“ / „Podesi kasnije“ / „Nastavi“ (IN11, IN17) — `use-install-step-navigation.ts` (pregled samo odgovorenih koraka), `use-install-step-deferral.ts` + `map-install-step-skip-error.ts`, footer dostupan u svakom koraku
- [x] Feature kartica — `components/install/install-feature-card.tsx` (switch / zaključano / „u paketu“, zavisnost gasi switch) + spec
- [x] Motion + reduced motion — `use-install-step-transition.ts` (fokus na naslov koraka pri promjeni, `page-in`), `use-prefers-reduced-motion.ts`, `pop-in` na „Preporučeno“; spec dokazuje da klase nema uz `prefers-reduced-motion: reduce`
- [x] Visual QA za sve teme/akcente — `components/visual-qa/visual-qa-install-board.tsx` + sekcija u `pages/visual-qa-primitives-page.tsx` (rail u oba tona, feature kartica u sva tri stanja, prikaz aktivne teme/akcenta)
- [x] `install-page.tsx` je kompozicija (94 linije < 120) i `loading`/`error` stanje statusa ima skeleton odnosno retry ekran
- [x] IN6 zatvoren: obrisan mrtvi `lib/resolve-install-wizard-step.ts` (+ spec); naslovi/opisi koraka žive u `install-step-presentation.ts`

## F4 — Standard sadržaj (`05_phase-f4-standard-sadrzaj.md`)
- [x] SMTP test-slanje — `POST /install/smtp/test` (`install-smtp-test.service.ts` + `install-smtp-test.controller.ts` + `map-install-smtp-test-error.ts` + `dto/send-install-smtp-test.dto.ts`), klasifikacija grešaka (auth/TLS/timeout/unreachable/send) u `SMTP_TEST_*`, vlastita instanca `TestEmailRateLimiter`-a bez Redis-a, UI `install-smtp-test-panel.tsx` (ugašen dok ima nesačuvanih izmjena) + `lib/install/map-install-smtp-test-error.ts`; spec 6 testova
- [x] Install blueprints (`itServiceDesk`) + routing provjera po servisu — `blueprints/*` (types, registry 5 kategorija/10 servisa/2 tier grupe, error+map, `apply-install-blueprint.ts`, `assert-install-blueprint-routing.ts`, servis, kontroler, DTO) + `GET /install/blueprints`, `POST /install/blueprints/apply`; idempotentno po slugu, jedna transakcija, `EXACT` ruting dokazan prije commita; UI `install-blueprint-step.tsx` + `install-blueprint-tree.tsx`; UI `install-content-api.ts`; spec 7 testova
- [x] Policy pack korak — `GET|POST /install/policy-pack` (`install-policy-pack.*`, `map-install-policy-pack-error.ts`, DTO), paketi iz `policyPackKeys` blueprinta, `PACK_DISABLED` iz `private.policyPacks.disabledKeysCsv`, primjena kroz funkciju `applyPolicyPack` (bez `PolicyPacksService` zbog ciklusa), marker `private.install.policyPack`; UI `install-policy-pack-step.tsx`; spec 5 testova
- [x] SLA pregled (kalendar, matrica) — `GET|POST /install/sla-review` (`install-sla-review.*`, `read-install-sla-review-status.ts`, `map-install-sla-review-error.ts`, DTO), `confirmed` = samo marker, `adjusted` kroz `updateBusinessHoursCalendar`/`patchPriorityMatrix` uz `reason: 'install_wizard'`; UI `install-sla-review-step.tsx` + `install-business-hours-editor.tsx` + `install-priority-matrix-preview.tsx` + `lib/install/install-weekly-hours.ts`; spec 6 + 3 testa
- [x] Dodaci sa prezentacijom — `lib/install/install-addon-presentation.ts` (14 ikona/naslova/rečenica + 5 kategorija), `install-addons-step.tsx` prešao na `install-feature-card.tsx`, `resolve-install-addon-defaults.ts` (Full uključuje CMDB/probleme/promjene — odluka 4) i `GET /install/addons` vraća te defaulte; `install-feature-card.tsx` dobio `isDisabled`; spec 4 + 3 testa

## F5 — Full sadržaj (`06_phase-f5-full-sadrzaj.md`)
- [x] Registry sekcija + allowlist servis + rute — `sections/install-settings-section.{registry,keys,service,types,error,constants}.ts`, `install-sections.controller.ts`, `dto/save-install-settings-section.dto.ts`; `GET /install/sections`, `GET|POST /install/sections/:sectionKey`; jedan generički servis nad `SettingsService` (allowlist, `requires`, tajne `[REDACTED]`); spec 6 + 11 + 6 testova
- [x] Generički korak sekcije (frontend) — `install-section-step.tsx`, `install-section-field.tsx`, `lib/install/install-section-presentation.ts`, `services/install-sections-api.ts`, grana u `install-active-step.tsx`; polje po metapodacima (boolean/number/string/select/secret); spec 6 + 5 testova
- [x] Sigurnosne preporuke — `GET|POST /install/security-recommendations` (odluka 7: MFA za admine obavezan, MFA opcion, HIBP on, idle 1800 s; captcha se **ne** upisuje), panel `install-security-recommendations.tsx`; spec 4 testa
- [x] Kriterij prihvatanja provjeren testom — `sections/install-full-package.acceptance.spec.ts`: Full pređen sa „Podesi kasnije“ → `isReady`, nijedna sekcija `required`/`blocking`, odgođene na post-install checklisti
- [x] Sve sekcije iz tabele povezane — 11 sekcija kao koraci `section.*` (order 61–71, `offeredIn: ['full']`, `skippable`, `requiredIn: []`) + `securityRecommendations` (order 72, Standard i Full), markeri `private.install.steps.<step>.{saved,skipped}` (24 nova ključa), i18n bs + en (`install.section.*`, `install.security.recommendations.*`), registry guard 488 → 512
- [x] Inbound/LDAPS test: **nije** rađen (odluka vlasnika 8) — domenske funkcije postoje, ali su iza sesijske prijave; zapisano kao **IN20** u `docs/analysis/TASKS.md`

## Van faza — ops-only ponovno pokretanje (odluka 6)
- [x] Dvostruka kapija — `read-install-rerun-allowed.ts` (samo `INSTALL_ALLOW_RERUN=true`; inače `403 INSTALL_RERUN_NOT_ALLOWED`), `isInstallTokenAlwaysRequired` u `install-token.ts` (token i **poslije** završetka), `is-install-wizard-mutation-locked.ts` propušta tačno `complete` i `restart`; spec 4 + 3 (prošireni lock/guard)
- [x] `POST /install/restart` — `private.install.completedAt` + `completedByUserId` (i markeri uz `includeStepMarkers`) kroz `SettingsService` sa `reason = install_wizard_rerun`; odgovor nosi `clearedKeys`, `previousCompletedAt`, `nextStep`; idempotentno (`alreadyOpen`); servis 5 + kontroler 4 + plan 6 testova
- [x] `npm run cli:install-rerun -- --reason "…" [--include-step-markers] [--dry-run]` (`src/cli/install-rerun.ts`); `.env.example` dobio `INSTALL_ALLOW_RERUN`, `check-env-example.mjs` u sinhronizaciji (64 varijable)
- [x] Recept `ops/runbook/ponovno-pokretanje-instalacije.md` + `.cursor/docs/04-install-wizard.md`, MATRIX i CHANGELOG matrice
- [x] UI netaknut — nema rute u klijentu, dugmeta ni i18n ključa (odluka 6: ništa se ne mijenja za redovne administratore)

## F6 — Završetak i testovi (`07_phase-f6-zavrsetak-testovi.md`)

Sve stavke su implementirane i **commitovane/pushovane** (`bbfa684..b19d937`); mjerenja koja traže stvarnu instalaciju ostaju otvorena uz IN14. Poslije recenzije CI-ja popravljene su još dvije stvari (§22.1 kontrast na neutralnim površinama i uvozi `SetupChecklistModule`-a) — vidi `HANDOFF.md`, „Ispravke poslije recenzije“.

- [x] Provisioning ekran — korak `provisioning` u registryju (poslednji, `skippable: false`, nikad `completed`; `readinessGateStepKeys` ga izbacuje iz `profileSteps`), `installReadinessStepKeys` veže provjere na korake, `install-readiness-checks.tsx` (lista, `aria-live`, sr-only status, „Idi na korak“), `install-provisioning-step.tsx` (recheck + „Završi instalaciju“ samo dok je `isReady`; odbijen `complete` ispiše `details.missing`), `isOpenable` u navigaciji; spec 6/6 frontend + 5/5 backend
- [x] Završni ekran „Sistem je spreman“ — `install-ready-screen.tsx` + `install-ready-summary.tsx` + `install-first-steps.tsx` (sažetak iz `GET /install/status` dok instalacija nije završena, tri prva koraka, link na `/login` bez auto-prijave), `install-complete-step.tsx` obrisan; spec 4/4
- [x] Post-instalacijska checklista (`setup-checklist` modul + dashboard kartica) — `backend/src/modules/setup-checklist/` (`GET /setup-checklist`, `POST /setup-checklist/dismiss`, sesija + `settingsWrite`, bez `InstallWizardLockGuard`-a), novi ključ `private.install.checklistDismissedAt`, `setup-checklist-card/-item.tsx` + `lib/setup-checklist/setup-checklist-target.ts`; spec 3/3 servis + **6/6 kontroler** (`setup-checklist.controller.spec.ts` — gardovi i metapodaci, `@AdminReadOperation()` samo na GET-u, uvezeni moduli, 403 bez aktera, odjava bez brisanja stavki) + 5/5 frontend
- [x] E2E projekat `install-wizard` (51 Minimum, 52 Standard) — specovi su u `e2e/tests/51-…`, `e2e/tests/52-…`, a `e2e/install-wizard/{playwright.install.config.ts,playwright.install-global-setup.ts,install-wizard-precondition.ts,install-wizard-step-reader.ts,install-wizard-actions.ts}` drže config, helperi i preduslov (`nextStep === 'profile'`, inače spec stane s receptom za reset/ponovno otvaranje) + `helpers/ensure-install.ts` dopunjen identitetom i odgodom koraka tima; `tsc --noEmit` čist. **Nije izvršeno na živoj instalaciji** (IN14): sandbox nema Docker/bazu/browser
- [~] CI za F6 — posao `e2e-install-wizard` + dispatch input `install_spec=51|52` postoje i inertni su; Preflight traži i svjež čarobnjak (`nextStep === 'profile'`, inače `::error` s receptom), a korak za spec 51 ispisuje `::notice` da 51 završava instalaciju (prije 52 reset ili ponovno otvaranje); **čeka potvrdu vlasnika** (plan: zaseban posao sa svježim stackom nasuprot dispatch inputu)
- [x] Korisnička dokumentacija i zatvaranje audita 11 — `.cursor/docs/04-install-wizard.md` (korak, checklist, E2E, API, ključevi), `docs/user-guide/instalacija.md` (vodič po paketu) + regenerisan `backend/content/docs/`, matrica `MATRIX.md`/`CHANGELOG.md`, `audit/frontend/11-install.md` (F6 blok, 9,0 → 9,5), `docs/analysis/TASKS.md`
- [ ] Lighthouse a11y za `/install` ≥ 95 — mjeri se u okruženju vlasnika/CI-ju (IN14)

## Redizajn „Aurora“ (`redizajn` — vizualni identitet, 2026-10-16, **u radnom stablu**)

Zahtjev vlasnika: „želim da uradiš redizajn install wizarda VIZUELNO da ostanem bukvalno iznenađen… Taj dizajn može da bude totalno odvojen od dizajna kompletne aplikacije - posebna priča!“ Uslov koji je išao s tim: **E2E ugovor 51/52/53 ostaje nepromijenjen**.

- [x] Sopstvena tema, scoped na čarobnjak — `lib/install/use-install-theme.ts` stavlja `data-install-theme="aurora"` na `<html>` i skida ga na unmount (`/login` ostaje Pulse); `index.css` nije diran; Visual QA drži atribut na svom kontejneru
- [x] Tri nova CSS sloja — `styles/install-theme.css` (tokeni, staklo, rail, HUD, segmenti), `styles/install-shim.css` (semantičke utilities unutar atributa, 0,2,0 nad 0,1,0 i 0,3,0 nad `hover:`/`disabled:`, bez `!important`), `styles/install-scenes.css` (airlock, liftoff, orbit + `prefers-reduced-motion`)
- [x] Nova ljuska — HUD (`install-top-bar.tsx`), plan leta (`install-flight-plan.tsx`), pozornica koraka (`install-step-header.tsx`, `install-wizard-shell.tsx`), airlock (`install-token-gate.tsx`), liftoff (`install-liftoff.tsx`); obrisani `install-brand-panel.tsx` i `install-mobile-header.tsx`; naslovni font Space Grotesk (lokalno, `@fontsource-variable`)
- [x] E2E ugovor pinovan novim čuvarem — `components/install/install-wizard-e2e-markup.spec.tsx` (4 testa) + 2 testa u `shell/install-wizard-shell.spec.tsx`; copy čuvar netaknut (92)
- [x] Pregled bez backenda — dev-only `/install-preview` (airlock, korak, liftoff) + prerađen `visual-qa-install-board.tsx`; **nije u produkcijskom bundle-u** (provjereno grep-om nad `dist/static/*.js`)
- [x] Kontrast **izmjeren, ne procijenjen** — alfa-kompozicija preko najsvjetlijeg piksela aure (50, 92, 112): `.iw-panel` daje ink 12,6 · soft 6,9 · dim 4,7 · akcenti 5,2–10,0 · `ink-on-accent` 10,6–12,6; prva verzija je imala sjaj bez osnovne boje (muted 2,9:1) i zato `.iw-panel` ima `--iw-panel` osnovu na 0,88 + pravilo „sekundarni tekst nikad na goli canvas“
- [x] **Rail je prozor, ne zid** (recenzija vlasnika): kolona ograničena na `calc(100dvh - 7.5rem)`, mapa se skroluje sa `fade`-om koji postoji samo dok ima viška, aktivni korak se sam centrira, a prozor postaje imenovani region samo dok preliva; linija je **segment po stavci** pa ne presijeca ikonice (`--iw-rail-progress` uklonjen). Tri testa u `shell/install-step-rail.spec.tsx`; panel „Šta dobijaš“ se sklanja na < 780 px visine
- [x] **Čuvar `scripts/check-install-aurora.mjs`** — sam izvodi najsvjetliji piksel iz `.iw-backdrop` slojeva, preračunava sve brojke iz komentara (13 redova), odbija `.iw-panel` bez neprozirne osnove (ispod 0,8) i pada na utility klasi bez shima; uvezan u CI (`frontend` posao) poslije kontrastnog čuvara. Dokazano i pokvarenim primjerima: lažna brojka u komentaru, staklo bez osnove i klasa bez pravila sva tri padaju s jasnom porukom
- [x] **Pokrivenost shima zatvorena** — skenerom nad `components/install/**`, odabranim `components/ui/*` i ljuskom: 33 token-klase, 0 neprekrivenih. Posljednja trojka (`checked:bg-primary`, `bg-warning/10`, `bg-warning/5` + `border-warning/30`) ima svoja pravila; `.peer:checked` je vlastiti token (`checked:` varijanta se **ne** poklapa s golog `.bg-primary` pravilom) — provjereno i u kompajliranom CSS-u
- [x] Dodatno: package kartica ima svoj `iw-card` (lift + odabrano stanje), naslovi scena u QA tabli su `iw-panel` čipovi, a `iw-badge` više nije mrtva klasa (odgođeni korak u railu)
- [x] **Prolaz 51/52/53 kroz UI je izmjeren kod vlasnika i zelen je (2026-10-16)** — to je bio dio IN14 koji je čekao stvarno okruženje; `reducedMotion` nije uključen u Playwright config-u, pa su te specove prošle **sa aktivnim aurora animacijama**
- [~] Verifikacija u sandboxu je zelena (302 fajla / 1271 test, `tsc`, `eslint`, `prettier`, `vite build`, 12 guard skripti, 7/7 `scripts/*.test.mjs`); **Lighthouse a11y za `/install` ≥ 95 još nije izmjeren** (nema browsera u sandboxu)
- [ ] **Commit — čeka izričit zahtjev vlasnika** (`.cursor/rules/00-core.mdc:33`: predložiti poruku, ne komitovati sam)
