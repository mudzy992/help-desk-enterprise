# Install Wizard v2 — checklista

Legenda: `[ ]` čeka · `[~]` u toku · `[x]` gotovo. Svaka stavka se zatvara tek kad su testovi zeleni i MATRIX ažuriran (gdje je relevantno).

## Prije početka
- [ ] Vlasnik potvrdio plan (`00_overview.md`)
- [ ] Odgovori na otvorena pitanja 1–6 (`00_overview.md` §9) i F5 pitanja 1–3
- [ ] Faza upisana u `TASKS.md` kao `[~] IN PROGRESS`

## F0 — Stabilizacija (`01_phase-f0-stabilizacija.md`)
- [ ] F0.1 Token gate fail-closed (IN2)
- [ ] F0.2 Hook `use-install-step-resource` i stanje greške bez forme (IN3)
- [ ] F0.3 Jedan izvor statusa u `InstallSetupProvider` (IN4, IN5)
- [ ] F0.4 `role="alert"` na greškama koraka
- [ ] F0.5 Korak „Dodaci“ se ne preskače nakon osvježavanja
- [ ] F0.6 Super admin je član fallback grupe
- [ ] F0.7 Readiness guard u `complete` (`INSTALL_NOT_READY`)
- [ ] F0.8 Docs sync (04, MATRIX, audit 11) i izuzetak u Constitution-u

## F1 — Backend osnova (`02_phase-f1-backend-osnova.md`)
- [ ] Registry koraka i `resolve-install-next-step`
- [ ] `private.install.profile` + `GET/POST /install/profile`
- [ ] `private.install.steps.<key>.skipped` + skip/unskip rute
- [ ] `GET /install/readiness` (+ `profileSteps`)
- [ ] Kompatibilnost `GET /install/status` i `e2e/helpers/ensure-install.ts`

## F2 — Minimum sadržaj (`03_phase-f2-minimum-sadrzaj.md`)
- [ ] Korak Identitet (branding, jezik, vremenska zona)
- [ ] Parametrizovan seed (OU, grupa, servis, kategorija) + SLA profil servisa
- [ ] Korak Tim (kreiranje korisnika + članstvo)

## F3 — Nova ljuska (`04_phase-f3-nova-ljuska.md`)
- [ ] Split-screen ljuska, rail koraka, mobilno zaglavlje + sheet
- [ ] Korak izbora paketa + prilagodba
- [ ] Feature kartica
- [ ] Motion + reduced motion
- [ ] Visual QA za sve teme/akcente

## F4 — Standard sadržaj (`05_phase-f4-standard-sadrzaj.md`)
- [ ] SMTP test-slanje
- [ ] Install blueprints (`itServiceDesk`) + routing provjera po servisu
- [ ] Policy pack korak
- [ ] SLA pregled (kalendar, matrica)
- [ ] Dodaci sa prezentacijom

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
