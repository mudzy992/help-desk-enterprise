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
- [ ] Registry sekcija + allowlist servis + rute
- [ ] Generički korak sekcije (frontend)
- [ ] Sigurnosne preporuke
- [ ] Sve sekcije iz tabele povezane

## F6 — Završetak i testovi (`07_phase-f6-zavrsetak-testovi.md`)
- [ ] Provisioning ekran
- [ ] Završni ekran „Sistem je spreman“
- [ ] Post-instalacijska checklista (`setup-checklist` modul + dashboard kartica)
- [ ] E2E projekat `install-wizard` (51 Minimum, 52 Standard)
- [ ] Korisnička dokumentacija i zatvaranje audita 11
