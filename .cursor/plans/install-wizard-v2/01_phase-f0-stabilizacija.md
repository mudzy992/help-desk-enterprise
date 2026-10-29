# F0 — Stabilizacija

> Zavisi od: — · Procjena: srednja (2–3 dana) · Može se raditi prije potvrde ostatka plana.

## Cilj

Ukloniti funkcionalne greške današnjeg wizarda i uskladiti dokumentaciju, prije bilo kakvog novog sadržaja. Nakon F0 postojećih 6 koraka radi pouzdano, a `complete` ne može završiti instalaciju u kojoj sistem ne prima tikete.

## Stavke

### F0.1 Token gate fail-closed (IN2)
- Fajl: `frontend/src/components/install/install-token-gate.tsx`.
- Danas: `toGateError` vraća `null` za sve osim 403 i `INSTALL_TOKEN_NOT_CONFIGURED`, pa `submit` otključava (linije 41–44). Token se upisuje prije provjere (`writeInstallToken(value)`, linija 36).
- Cilj: otključati **samo** na uspješan `loadInstallSuperAdmin()`. Mreža, 5xx i timeout: ostaje zaključano, poruka `install.tokenUnavailable` (**novo**) i dugme „Pokušaj ponovo“. Token se trajno upisuje tek nakon uspjeha (privremeno se šalje samo za provjeru).
- Inicijalizacija `useState(() => readInstallToken() !== null)` ne smije otvoriti wizard bez provjere: pri mountu sa sačuvanim tokenom pokrenuti tihu provjeru (stanje `checking`).

### F0.2 Zajednički hook za korake (IN3)
- **Novo:** `frontend/src/lib/install/use-install-step-resource.ts` — `loading | error | ready`, retry, cancel na unmount.
- Primijeniti u: `install-super-admin-step.tsx`, `install-login-provider-step.tsx`, `install-smtp-step.tsx`, `install-seed-step.tsx`, `install-addons-step.tsx`.
- Pravilo: u stanju `error` forma se **ne** renderuje (nema defaulta `local` ni `enabled=false` koji bi prepisali postojeću konfiguraciju).
- **Novo:** `frontend/src/components/install/install-step-load-error.tsx` (poruka + request ID + retry).

### F0.3 Jedan izvor statusa (IN4, IN5)
- `frontend/src/app/install-setup-provider.tsx`: stanje `ready` proširiti sa `nextStep` i `steps` iz `loadInstallSetupStatus()`.
- `frontend/src/pages/install-page.tsx`: ukloniti drugi `loadInstallSetupStatus()` (linije 53–70) i fallback `setStep("superAdmin")` u `.catch`. Korak se čita iz konteksta; nakon snimanja koraka poziva se `reload()` konteksta, a ne lokalni `setStep`.
- Ispraviti netačan komentar u `install-page.tsx` (linije 17–20).

### F0.4 Greške najavljene čitaču ekrana
- `role="alert"` na porukama greške u `install-seed-step.tsx`, `install-smtp-step.tsx`, `install-login-provider-step.tsx`, `install-complete-step.tsx` (danas `<p className={errorTextClassName}>` bez role).

### F0.5 Korak „Dodaci“ se ne smije preskočiti nakon osvježavanja
- Fajl: `backend/src/modules/install/install-setup.service.ts` — `addons: { completed: true }` (linija 49) je fiksno.
- Cilj: `addons.completed` = da li je `POST /install/addons` bar jednom sačuvan. **Novo:** `private.install.steps.addons.savedAt` ili provjera `hasStoredValue` nad bar jednim `private.addons.*` ključem (odluka u implementaciji; preferirati postojeći `hasStoredValue`, bez novog ključa ako je dovoljno).
- Uskladiti `install-complete.service.ts` i `completedStatus()`.
- Test: `install-setup.service.spec.ts` — nakon seeda bez addons save `nextStep === "addons"`.

### F0.6 Super admin je član fallback grupe
- Fajlovi: `backend/src/modules/install/seed-install-minimum.ts`, `ensure-install-fallback-group.ts`.
- Cilj: nakon `ensureInstallFallbackGroup` idempotentno dodati super admina (`context.actorUserId`) kao člana grupe. Koristiti istu domensku funkciju koju koristi `POST /groups/:groupId/members/:userId` (`groups.controller.ts` linija 99), bez dupliranja pravila.
- Test: `install-seed.reuse.spec.ts` / novi spec — ponovljeni seed ne duplira članstvo.

### F0.7 Readiness guard u `complete`
- **Novo:** `backend/src/modules/install/evaluate-install-readiness.ts` (čista funkcija nad Prisma klijentom + settings) koja vraća listu provjera iz `00_overview.md` §3 (bez `profileSteps`, koji dolazi u F1).
- `install-complete.service.ts`: prije `persistInstallCompletion` pozvati readiness; ako nije zeleno, baciti `InstallCompleteError` sa **novim** kodom `INSTALL_NOT_READY` i listom neispunjenih ključeva.
- Frontend: `lib/map-install-complete-error.ts` mapira `INSTALL_NOT_READY` na poruku sa listom stavki.
- `ensure-install.ts` (E2E) mora i dalje prolaziti (prolazi sve korake prije `complete`).

### F0.8 Docs sync i izuzetak od Constitution-a
- `.cursor/docs/04-install-wizard.md`: tabela dodataka prema `backend/src/modules/settings/addon-catalog.ts` (ukloniti `sla`, `autoAssign`, `timeTracking`, `serviceDowntime`; dodati `ticketSplit`, `savedViews`, `reports`, `cmdb`, `problems`, `changes`, `teams` sa stvarnim defaultima).
- `.cursor/docs/matrices/install-wizard/MATRIX.md`: isto za defaulte; sekciju „UI“ zamijeniti referencom na izuzetak; dodati readiness pravilo; zapis u `CHANGELOG.md` matrice.
- `docs/design/Master UI-UX Design Constitution.md`: nova sekcija „Izuzetak: install wizard“ (dozvoljeno: brend pano, motion s funkcijom do ~250 ms, ikone funkcija, završni ekran; zabranjeno i dalje: floating blobs, bounce, dekorativna pozadinska animacija, glassmorphism; obavezno `prefers-reduced-motion`).
- `.cursor/rules/frontend-ui-ux.mdc`: jedna linija koja upućuje na izuzetak.
- `audit/frontend/11-install.md`: statusi IN2–IN5 i novi nalazi (complete bez readiness, addons skip, prazna fallback grupa, nedostajući `role="alert"`).

## i18n (bs, en) — novo
`install.tokenUnavailable`, `install.retry`, `install.stepLoadError`, `install.complete.notReady`, `install.readiness.<ključ>` (po ključu iz §3 overviewa).

## Testovi
- Frontend RTL: `install-token-gate.spec.tsx` (403, mreža, uspjeh, sačuvan token), `use-install-step-resource.spec.ts`, jedan korak sa greškom učitavanja (forma se ne prikazuje).
- Backend: `evaluate-install-readiness.spec.ts`, `install-complete.service.spec.ts` (`INSTALL_NOT_READY`), `install-setup.service.spec.ts` (addons), seed spec (članstvo).

## Kriteriji prihvatanja
- Mrežna greška na gate-u ne otključava wizard.
- Greška učitavanja koraka ne prikazuje formu.
- Status se na `/install` učitava jednom.
- Osvježavanje nakon seeda vodi na „Dodaci“.
- `POST /install/complete` bez seeda vraća `INSTALL_NOT_READY`.
- Nakon seeda fallback grupa ima super admina kao člana.
- Docs i MATRIX odgovaraju `addon-catalog.ts`; Constitution sadrži izuzetak.
- `tsc`, `lint`, `vitest`, backend jest za install modul i `ensure-install.ts` prolaze.

## Commit prijedlozi
- `fix(install): fail-closed token gate and step load states`
- `fix(install): single status source and addons step persistence`
- `feat(install): readiness guard on complete; super admin joins fallback group`
- `docs(install): sync wizard docs with addon catalog; constitution exception`
