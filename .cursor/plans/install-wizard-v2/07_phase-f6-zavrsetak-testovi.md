# F6 — Provisioning, završni ekran, post-instalacijska checklista, testovi

> Zavisi od: F2–F5 · Procjena: srednja do velika (4–5 dana).

## Cilj

Završetak instalacije mora biti vidljiv i provjerljiv: korisnik gleda kako sistem „ustaje“ (provisioning uživo), dobija potvrdu „Sistem je spreman“ sa sažetkom i jasnim prvim koracima, a sve preskočeno ga čeka na dashboardu kao checklista. Sve je pokriveno RTL, backend i E2E testovima.

## Postojeće stanje (provjereno)
- `install-complete-step.tsx`: samo dugme koje zove `completeInstallSetup()` i `markCompleted()`.
- `persist-install-completion.ts`: transakcija upisuje `private.install.completedAt` / `completedByUserId`, `ensureInstallJwtSigningSecret`, change log (`install_wizard`).
- `frontend/src/pages/dashboard-page.tsx` + komponente (`inbox-snapshot`, `sla-watchlist`, `metric-grid`, `activity-feed`, `attention-table`, `recent-tickets`); checklist widget ne postoji.
- E2E: `e2e/global-setup.ts` poziva `ensureInstall(api)` (instalacija kroz API) prije svih testova; UI test wizarda ne postoji. Najviši broj speca je `50-sla-escalations.spec.ts`.

## F6.1 Provisioning ekran (**novo**)
- Korak `provisioning` u registryju (posljednji prije `complete`, nije skippable).
- UI: lista stavki readiness-a (`GET /install/readiness`) koje se redom označavaju (`draw-ring`, reduced motion = statična lista), uz `aria-live="polite"`.
- Ako je stavka crvena: poruka i dugme „Idi na korak“ (navigacija na odgovarajući korak iz registryja); `complete` se ne nudi.
- Kad je sve zeleno: „Završi instalaciju“ zove `POST /install/complete`.

## F6.2 Završni ekran „Sistem je spreman“ (**novo**)
- Sažetak: paket, organizacija, broj servisa/grupa/članova tima, uključeni dodaci (feature kartice u read-only modu), stavke „kasnije“.
- Prvi koraci (3 kartice): „Kreiraj prvi tiket“ (portal), „Pozovi tim“ (ako je preskočeno), „Otvori podešavanja“.
- Prijava: prema odluci na otvoreno pitanje 1 u overviewu (auto-prijava ili `/login`).
- `install-complete-step.tsx` se zamjenjuje sa `install-ready-screen.tsx` + `install-ready-summary.tsx` + `install-first-steps.tsx` (**novo**).

## F6.3 Post-instalacijska checklista na dashboardu (**novo**)
- Backend: `GET /setup-checklist` u **novom** modulu `backend/src/modules/setup-checklist/` (sesija + `permissionKeys.settingsWrite` iz `authorization.constants.ts`, jer zasebna read permisija ne postoji; **nije** pod `InstallWizardLockGuard`, jer je instalacija završena). Stavke = koraci sa `private.install.steps.<key>.skipped = true` + preporuke koje nisu ispunjene (npr. SMTP isključen). Stavka je „gotova“ kad njen `readState` iz registryja (F1) vrati `completed`, bez ručnog označavanja.
- `POST /setup-checklist/dismiss` upisuje **novi** ključ `private.install.checklistDismissedAt` (sakriva widget; stavke ostaju dostupne iz Settings).
- Frontend: `components/dashboard/setup-checklist-card.tsx` (+ `setup-checklist-item.tsx`), vidljivo samo adminima, link na tačnu Settings stranicu po stavci. Realtime nije potreban (osvježavanje pri ulasku na dashboard).

## Settings ključevi (**novo**)
| Ključ | Tip | Default | Opis |
|---|---|---|---|
| `private.install.checklistDismissedAt` | string (ISO) | prazno | Kada je admin sakrio post-instalacijsku checklistu na dashboardu. |

## i18n (bs, en) — novo
`install.provisioning.*` (title, checking, ok, missing, goToStep, finish), `install.ready.*` (title, summary, profile, services, groups, team, addons, later, firstTicket, inviteTeam, openSettings), `dashboard.setupChecklist.*` (title, progress, dismiss, item.<stepKey>).

## Testovi

### Backend (jest)
- `setup-checklist.service.spec.ts`: skip → stavka; završen korak → gotovo; dismiss.
- Kontroler: bez sesije 401, bez `settingsWrite` 403.
- Regresija: svi install specovi iz F0–F5.

### Frontend (vitest + RTL)
- Provisioning: crvena stavka blokira završetak; sve zeleno nudi završetak; reduced motion.
- Završni ekran: sažetak za Minimum i Full.
- Checklist kartica: prikaz, link, dismiss, sakrivena za ne-admine.

### E2E (Playwright)
- Problem: `global-setup.ts` instalira sistem prije testova, pa UI wizard treba **svjež** stack.
- **Novo:** zaseban Playwright projekat `install-wizard` (`e2e/install-wizard/playwright.install.config.ts`) bez `global-setup` instalacije, nad praznom bazom.
  - `e2e/install-wizard/51-install-wizard-minimum.spec.ts`: token gate → paket Minimum → super admin → identitet → login local → struktura → provisioning → spremno; zatim prijava i kreiranje tiketa na servis iz wizarda.
  - `e2e/install-wizard/52-install-wizard-standard.spec.ts`: Standard sa SMTP testom (mail catcher iz postojećeg E2E okruženja ako postoji; inače skip SMTP-a uz potvrdu) i blueprintom.
- CI: zaseban job ili `workflow_dispatch` ulaz koji podiže čist stack (reset baze) — detalj u implementaciji, uz potvrdu vlasnika.
- Postojeći `ensure-install.ts` ostaje za ostatak suite-a (kompatibilnost API-ja iz F1).

## Dokumentacija
- `.cursor/docs/04-install-wizard.md`: paketi, readiness, registry, checklista.
- `.cursor/docs/matrices/install-wizard/MATRIX.md` + `CHANGELOG.md` matrice.
- `docs/user-guide/instalacija.md` i `backend/content/docs/instalacija.md`: korisnički vodič po paketima, sa snimcima ekrana.
- `audit/frontend/11-install.md`: zatvaranje nalaza.

## Kriteriji prihvatanja
- `complete` je dostupan samo kroz provisioning sa zelenim readiness-om.
- Nakon Minimum toka E2E kreira tiket bez ručnih koraka van wizarda.
- Checklista prikazuje tačno preskočene stavke i nestaje kad su završene ili sakrivene.
- Sve nove datoteke ≤200 linija; svi testovi zeleni.

## Commit prijedlozi
- `feat(install-ui): provisioning checklist and ready screen`
- `feat(setup-checklist): post-install checklist on dashboard`
- `test(e2e): install wizard minimum and standard flows`
- `docs(install): v2 user guide and matrix`
