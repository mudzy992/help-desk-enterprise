# Install Wizard v2 — handoff

## Stanje (2026-10-15)
- Plan je napisan; **nijedna linija koda nije promijenjena**.
- Sljedeći korak: vlasnik potvrđuje plan i odgovara na otvorena pitanja, zatim F0 ulazi u `TASKS.md` kao `[~] IN PROGRESS`.

## Gdje početi
1. `00_overview.md` — odluke, readiness, tabela paketa, arhitektura, rizici, pitanja.
2. `01_phase-f0-stabilizacija.md` — prvi zadatak; ne zavisi od odgovora na otvorena pitanja.
3. `CHECKLIST.md` — napredak po stavkama.

## Ključni fajlovi u kodu
- Backend: `backend/src/modules/install/` (`install.controller.ts`, `install-setup.service.ts`, `install-complete.service.ts`, `persist-install-completion.ts`, `seed-install-minimum.ts`, `install-seed.constants.ts`, `install-wizard-lock.guard.ts`).
- Settings: `backend/src/modules/settings/addon-catalog.ts`, `setting-keys.ts`, `definitions/`.
- Frontend: `frontend/src/pages/install-page.tsx`, `frontend/src/app/install-setup-provider.tsx`, `frontend/src/components/install/`, `frontend/src/services/install-api.ts`.
- E2E: `e2e/global-setup.ts`, `e2e/helpers/ensure-install.ts`.
- Docs: `.cursor/docs/04-install-wizard.md`, `.cursor/docs/matrices/install-wizard/MATRIX.md`, `docs/design/Master UI-UX Design Constitution.md`, `audit/frontend/11-install.md`.

## Otvorena pitanja (čekaju vlasnika)
- Auto-prijava nakon završetka.
- Poziv tima bez SMTP-a (prikaz privremene lozinke jednom).
- Blueprinti po industriji u prvoj verziji.
- ITSM moduli u Full: uključeni ili ponuđeni isključeni.
- Promjena paketa tokom wizarda.
- `INSTALL_ALLOW_RERUN` i „dodaj paket kasnije“.
- Vrijednosti sigurnosnih preporuka; postojanje test funkcija za inbound i LDAPS.
- CI za E2E nad svježim stackom.

## Pravila koja važe za implementaciju
- Fajlovi ≤200 linija; kontroleri bez direktnog Prisma pristupa; bez TODO-a bez tiketa u `TASKS.md`.
- Svaka faza: ažurirati MATRIX + CHANGELOG matrice i ovaj `CHANGELOG.md`; predložiti commit poruku nakon svakog koraka.
- i18n: bs default + en za svaki novi ključ.
