# Install Wizard v2 — changelog plana

## 2026-10-15 (F3 implementirano)
- **F3 završeno** (ljuska, ekran paketa, feature kartica, motion, visual QA); `CHECKLIST.md` označen, `HANDOFF.md` prebačen na F4, `.cursor/docs/04-install-wizard.md` + MATRIX + CHANGELOG matrice + `audit/frontend/11-install.md` ažurirani.
- **Odluka vlasnika (F3, pitanje 1):** uklonjen F1 izuzetak — korak paketa je prvi i **blokira**; `POST /install/complete` bez paketa → `409 INSTALL_NOT_READY`; `e2e/helpers/ensure-install.ts` sada prvo bira `minimum`. `isInstallStepBlocking` više ne izuzima `profile`, a `resolve-install-next-step.spec.ts` vozi novi tok.
- **Odluka vlasnika (F3, pitanje 2):** „Prilagodi“ ne uvodi nove settings ključeve — prekidači pišu F1 `private.install.steps.<key>.skipped` za korake koje registry dozvoljava (`skippable`), obavezni koraci su zaključani s objašnjenjem, a stavke bez koraka (F4/F5) ostaju sadržaj paketa bez prekidača koji ništa ne radi.
- **Zatvaranje nalaza iz F2:** korak **Tim** je izgubio vlastito dugme „Podesi kasnije“ — odgađanje je sada samo u footeru ljuske, vođeno `steps.<key>.skippable` (IN17 zatvoren na jednom mjestu); obrisan je i mrtvi `lib/resolve-install-wizard-step.ts` (IN6), a `install.profile.item.*` prijevodi su upisani (IN16).
- **Novo u statusu:** `steps.<key>.skippable` (`install-step.types.ts`, `read-install-step-states.ts`, `InstallStepState` na frontendu) — ljuska iz njega crta „Podesi kasnije“ umjesto svoje liste.
- **Novi nalaz IN19** (otvoren): skip flag preživi promjenu paketa, pa npr. Standard može završiti bez SMTP-a/tima ako su odgođeni pod Minimumom — F1 pravilo „koraci koji ostaju zadržavaju stanje“ nije mijenjano, nalaz je zapisan u `audit/frontend/11-install.md` i `docs/analysis/TASKS.md`.
- **Otkriveno i popravljeno u F3:** `/install` nije bio unutar `InstallSetupLayout`, pa je neuspješno čitanje statusa ostavljalo vječni skeleton; sada je `error` → `GateStatusError` sa retry-em.
- Odstupanja: vizualne provjere (Lighthouse a11y ≥ 95) i `vite build` prolaze lokalno, ali E2E prolaz kroz UI i dalje je F6; `wizard-stepper.tsx` ostaje za ostale ekrane (assets, onboarding, create-ticket) — instalater koristi novi rail.

## 2026-10-15 (F2 implementirano)
- **F2.1–F2.3 završeno**; `CHECKLIST.md` označen, `HANDOFF.md` prebačen na F3, `.cursor/docs/04-install-wizard.md` + MATRIX + CHANGELOG matrice ažurirani.
- Novi koraci: `identity` (order 25, obavezan u sva tri paketa, ne može se odgoditi) i `team` (order 55, `{standard, full}` obavezan, `skippable`). Registry ostaje jedini izvor toka.
- API: `GET/POST /install/identity`, `GET/POST /install/team`, `POST /install/seed` sa opcionim body-jem, `GET /install/seed` vraća i `categoryName` + `service.slaProfileKey`.
- Readiness: `slaProfile` više nije „postoji profil“ nego „servis iz seeda je vezan na aktivan profil“ (`is-seeded-service-under-active-sla.ts`).
- Kontroler je razdvojen (`install.controller.ts` + `install-steps.controller.ts`) da ostane ispod granice od 200 linija; oba dijele guard i `ValidationPipe` (`install-validation.pipe.ts`).
- Bez novih settings ključeva osim F1 šablona `private.install.steps.{identity,team}.skipped` (i18n guard 480 → 482).
- Odstupanja: `install.seed.*` i18n je sveden na dvije error poruke (korak je preimenovan u `install.structure.*`); `logoDataUrl` se ne može obrisati iz wizarda (registry odbija prazan logo) — brisanje ostaje u Settings → Brending; `install-steps.controller.spec.ts` je nov fajl zbog podjele kontrolera.

## 2026-10-15 (F0 + F1 implementirano)
- **F0.1–F0.8 završeno** i **F1 završeno**; `CHECKLIST.md` označen, `HANDOFF.md` prebačen na F2.
- Odluke vlasnika (8 tačaka) upisane u `00_overview.md` §9 umjesto ranijih otvorenih pitanja: bez auto-prijave (→ `/login`), tim bez SMTP-a prikazuje privremenu lozinku jednom (postojeći `temporaryPassword` ugovor), blueprinti IT + HR + Finance uz postojeće policy packove, CMDB/problemi/promjene uključeni po defaultu u Full, promjena paketa dozvoljena uz registry-driven reset, `INSTALL_ALLOW_RERUN` ostaje ops-only, sigurnosne preporuke (MFA obavezno za admine, HIBP on, idle 1800 s, captcha off dok nema ključeva), inbound/LDAPS bez automatskog testa do F5.
- F1 API: `GET/POST /install/profile`, `POST/DELETE /install/steps/:stepKey/skip`, `GET /install/readiness`; `GET /install/status` proširen sa `profile` i `steps.<key>.{skipped,required,offered,blocking}` (backwards compatible).
- Registry koraka je sada izvor toka (`steps/install-step.registry.ts`): `blocking` se računa na jednom mjestu (`isInstallStepBlocking`), pa `nextStep`, readiness i status ne mogu se razići.
- Novi settings: `private.install.profile` + `private.install.steps.<stepKey>.skipped` (7 ključeva; i18n coverage guard 473 → 480).
- Odstupanja od plana zapisana u `HANDOFF.md` (npr. `labelKey` stavki paketa čekaju F3 prevode; skip dugme i ekran paketa su F3).

## 2026-10-15
- Kreiran plan folder: `00_overview.md`, faze F0–F6 (`01`–`07`), `CHECKLIST.md`, `HANDOFF.md`.
- Odluke vlasnika upisane u overview (D1–D5): tri fiksna paketa s ručnim dotjerivanjem, ograničen izuzetak od Constitution-a samo za install wizard, Minimum garantuje prijem tiketa, „Podesi kasnije“ + dashboard checklista, odvojeno od service onboarding wizarda.
- Funkcionalni nalazi iz review-a uvršteni u F0: `complete` bez readiness provjere, korak „Dodaci“ fiksno `completed: true` (`install-setup.service.ts`, linija 49), fallback grupa bez članova, token gate otključava na mrežnu grešku, nedostajući `role="alert"`, zastarjeli `04-install-wizard.md` i MATRIX.
- Tokom pisanja provjereno u kodu: `InstallStepState.skipped` već postoji u tipu; `private.install.` je environment-bound prefiks; status stranica je u `ops-settings.ts`; zasebna `settings.read` permisija ne postoji (checklista koristi `settingsWrite`); kreiranje korisnika već vraća `temporaryPassword` i `temporaryPasswordDelivery`; motion keyframes i reduced-motion blok već postoje u `frontend/src/index.css`.
