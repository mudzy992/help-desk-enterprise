# Install Wizard v2 — changelog plana

## 2026-10-15
- Kreiran plan folder: `00_overview.md`, faze F0–F6 (`01`–`07`), `CHECKLIST.md`, `HANDOFF.md`.
- Odluke vlasnika upisane u overview (D1–D5): tri fiksna paketa s ručnim dotjerivanjem, ograničen izuzetak od Constitution-a samo za install wizard, Minimum garantuje prijem tiketa, „Podesi kasnije“ + dashboard checklista, odvojeno od service onboarding wizarda.
- Funkcionalni nalazi iz review-a uvršteni u F0: `complete` bez readiness provjere, korak „Dodaci“ fiksno `completed: true` (`install-setup.service.ts`, linija 49), fallback grupa bez članova, token gate otključava na mrežnu grešku, nedostajući `role="alert"`, zastarjeli `04-install-wizard.md` i MATRIX.
- Tokom pisanja provjereno u kodu: `InstallStepState.skipped` već postoji u tipu; `private.install.` je environment-bound prefiks; status stranica je u `ops-settings.ts`; zasebna `settings.read` permisija ne postoji (checklista koristi `settingsWrite`); kreiranje korisnika već vraća `temporaryPassword` i `temporaryPasswordDelivery`; motion keyframes i reduced-motion blok već postoje u `frontend/src/index.css`.
