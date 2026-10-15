# CHANGELOG — install-wizard

## 2026-10-15 (F4 Standard sadržaj)

- **SMTP test (F4.1):** `POST /install/smtp/test` šalje probnu poruku kroz postojeći `MAIL_TRANSPORT` i vraća `SMTP_TEST_*` kod po uzroku (auth/TLS/timeout/unreachable/send); rate limit je vlastita instanca `TestEmailRateLimiter`-a (bez Redis-a). UI `install-smtp-test-panel.tsx` je ugašen dok forma ima nesačuvane izmjene.
- **Blueprints (F4.2):** `GET /install/blueprints` + `POST /install/blueprints/apply` — `itServiceDesk` (5 kategorija, 10 servisa, opcione tier grupe); idempotentno po slugu, jedna transakcija, `resolveTicketRouting === EXACT` dokazan za svaki servis prije commita; marker `private.install.blueprint`.
- **Policy pack (F4.3):** `GET/POST /install/policy-pack` — ponuda iz `policyPackKeys` predloška, `PACK_DISABLED` iz `private.policyPacks.disabledKeysCsv`, primjena kroz funkciju `applyPolicyPack` (bez `PolicyPacksService` zbog ciklusa preko Authentication modula); marker `private.install.policyPack`; korak nije `skippable`.
- **SLA pregled (F4.4):** `GET/POST /install/sla-review` — `confirmed` upisuje samo marker `private.install.slaReview`, `adjusted` mijenja kalendar/ćelije matrice kroz domenske funkcije uz `reason: 'install_wizard'`; matrica se prikazuje (read-only), praznici se prikazuju ali ne uređuju.
- **Dodaci (F4.5):** `lib/install/install-addon-presentation.ts` (14 ikona/naslova/rečenica, 5 kategorija) + `install-addons-step.tsx` na `install-feature-card.tsx`; `resolve-install-addon-defaults.ts` čini paketne defaulte stvarnima (Full: `cmdb`/`problems`/`changes`), a `GET /install/addons` ih vraća i kao `enabled`/`defaultEnabled`.
- **API dodatak:** `POST /install/smtp/test`, `GET /install/blueprints`, `POST /install/blueprints/apply`, `GET|POST /install/policy-pack`, `GET|POST /install/sla-review`; skip DTO prima `blueprint|policyPack|slaReview`; settings-registry coverage guard 482 → 488.
- Testovi: backend `modules/install` **43 suite / 219 testova** (novi: blueprint 7, SMTP test 6, policy pack 5, SLA pregled 6, defaulti dodataka 3); `modules/install modules/settings` 71 / 341; frontend **242 fajla / 1024 testa** uz `tsc -b`, eslint, prettier i `check-theme-contrast.mjs` čiste.

## 2026-10-15 (nalazi IN11/IN18/IN19 zatvoreni)
- **IN19 — odgoda ne preživi promjenu paketa:** `planInstallProfileReset({ nextProfile, previousProfile })` vraća `reopenedStepKeys` (koraci koje novi paket traži, a stari ih je samo nudio). Servis briše zastavicu samo ako je bila postavljena, u istoj transakciji i istom change-log zapisu, a `POST /install/profile` vraća `reopenedSteps: InstallStepKey[]` (na `GET` prazan). Ljuska iznad vraćenog koraka prikaže `install.shell.reopened`.
- **Nađeno uz IN19:** `createInMemorySettingsPrisma().appSetting.deleteMany` nije podržavao Prisma oblik `{ key: { in: [...] } }`, pa je F1 reset paketa u testovima brisao ništa; dvojnik je popravljen i `install-profile.service.spec.ts` sada dokazuje brisanje zastavice.
- **IN18 — read-only metadata:** `readOnly` na `SettingDefinitionCommon`/`SettingRegistryEntry`; `private.install.profile` + osam `steps.*.skipped` su označeni; lista prikazuje oznaku `settings.registry.readOnly`, detalj `settings.detail.readOnlyHint` uz onemogućen editor i bez snimanja. API namjerno ne odbija ručni `POST /settings/*`.
- **IN11 — `aria-describedby`:** napomene uz polja (founder lozinka + pravila politike, SMTP lozinka, Entra tenant/client, LDAPS bind Dn/lozinka, time zone, logo) su vezane na svoja polja; kod Entra/LDAPS izmještene iz `<label>` da ne ulaze u pristupačno ime.
- Testovi: backend 65 suita / 309 testa za `modules/install` + `modules/settings`; frontend 236 fajlova / 1002 testa (`npx vitest run`); `tsc -b`, eslint, prettier i `vite build` čisti.

## 2026-10-15 (F3 nova ljuska)
- **Paket je prvi korak**: uklonjen F1 izuzetak „dok paket nije izabran korak paketa ne blokira“ (`isInstallStepBlocking`); `e2e/helpers/ensure-install.ts` sada prvo šalje `POST /install/profile { profile: 'minimum' }`; `GET /install/status` nosi i `steps.<key>.skippable`. Katalog paketa sada tačno navodi `identity` u `requiredSteps`.
- **Split-screen ljuska**: `components/install/shell/install-wizard-shell.tsx` + `install-brand-panel`, `install-step-rail` (pet stanja, `tone="brand"|"surface"`), `install-what-you-get-panel`, `install-mobile-header` (sheet, progressbar, `aria-live`), `install-step-footer` (Nazad / Podesi kasnije / Nastavi); živi identitet iz `useBranding()`.
- **„Nazad“ kao pregled**: `use-install-step-navigation.ts` otvara samo korak koji paket nudi i koji je **odgovoren** (završen ili odgođen); `continueForward` vraća tok na `nextStep`, a pregled se resetuje kad server pomjeri korak.
- **Ekran paketa**: `install-profile-step/form/card/customize.tsx` (kartice s procjenom, „Preporučeno“, „Prikaži sve“ sheet, „Prilagodi paket“ preko `skippable` + `skippable`-zaključani koraci s objašnjenjem) i `install-feature-card.tsx` (zajednička kartica funkcije za F4–F6: switch / zaključano / „u paketu“, zavisnost gasi switch).
- **Motion + reduced motion**: `use-install-step-transition.ts` (fokus na naslov koraka, `page-in`) i `use-prefers-reduced-motion.ts`; `pop-in` na oznaci „Preporučeno“.
- **`/install` stanje statusa**: skeleton pri učitavanju i `GateStatusError` sa „Pokušaj ponovo“ kad status padne (do sada vječni skeleton).
- **IN6 zatvoren**: obrisan mrtvi `lib/resolve-install-wizard-step.ts` (i njegov spec); IN16/IN17 zatvoreni (`install.profile.item.*` prijevodi + „Podesi kasnije“ u footeru za sve `skippable` korake, „Vrati u tok“ iz pregleda).
- Novi nalaz **IN19** (otvoren): skip flag preživi nadogradnju paketa, pa Standard može završiti bez SMTP-a/tima ako su odgođeni dok je bio izabran Minimum.
- **Zatvaranje F2 nalaza u istoj fazi**: korak **Tim** je izgubio vlastito dugme „Podesi kasnije“ (dozvola je sada samo iz `steps.<key>.skippable` u footeru ljuske); obrisan je mrtvi `resolve-install-wizard-step.ts` (+ spec, IN6); `install.profile.item.*` prijevodi upisani (IN16).
- Testovi: backend 37 suite / 183 testa (`npx jest -c /tmp/jest.local.cjs modules/install`); frontend 233 fajla / 993 testa (`npx vitest run`) — broj je pao za 5 testova obrisanog mrtvog `resolve-install-wizard-step.spec.ts`, a `pages/install-page.spec.tsx` dodaje 4 integraciona; puni backend `544 passed / 74 failed / 4 skipped` od 622 suita, istih 74 compile-only kao na pristine HEAD-u.

## 2026-10-15 (F2 Minimum sadržaj)
- F2.1: novi korak **Identitet** (`GET/POST /install/identity`; `install-identity.service.ts`, `validate-install-identity.ts`, `read-install-identity-status.ts`, `is-supported-install-time-zone.ts`). Piše kroz Settings Registry u `public.branding.*`, `private.i18n.defaultLocale`, `private.reports.timeZone`; nepopunjena polja se ne šalju i ne prepisuju postojeće vrijednosti; logo se ne vraća kroz wizard (`logoConfigured`). Korak je `completed` kad je naziv organizacije upisan i vidljiv je na login stranici odmah (`public-branding.controller.ts`).
- F2.2: **parametrizovan seed** — `POST /install/seed` prima opcioni body (nazivi OU, grupe, kategorije, servisa), bez body-ja ponašanje ostaje kao prije. Slugovi/keys i DN se generišu iz naziva (`build-install-seed-slug.ts`, `install-seed.names.ts`); ponovni seed s drugim nazivima ne preimenuje zapise nego vraća `warning.code = NAMES_ALREADY_SEEDED`. Servis dobija `STANDARD_REQUEST` SLA profil, a readiness `slaProfile` postaje stvarna provjera (`is-seeded-service-under-active-sla.ts`). `GET /install/seed` vraća i trenutne nazive + `service.slaProfileKey`.
- F2.3: novi korak **Tim** (`GET/POST /install/team`; `install-team.service.ts`, `validate-install-team.ts`, `read-install-team-status.ts`). Nalozi se kreiraju kroz `users/create-user.ts`, članstvo kroz `addGroupMember`; bez SMTP-a privremena lozinka se prikazuje jednom. Korak je `skippable` u Minimumu (Standard/Full obavezan), founder sam u grupi ne znači da je korak odgovoren.
- Kontroleri: `install.controller.ts` (koraci) i novi `install-steps.controller.ts` (paket, odgađanje, readiness) — isti guard i isti `ValidationPipe` (`install-validation.pipe.ts`); fajl je time ispod granice od 200 linija.
- i18n: bs+en `install.identity.*`, `install.structure.*`, `install.team.*`, `steps.identity`, `steps.team`; `install.seed.*` sveden na dvije error poruke (korak je preimenovan u `install.structure.*`); readiness `slaProfile` poruka opisuje stvarnu provjeru; registry coverage guard 480 → 482 ključa.
- Frontend: `install-identity-step/-fields`, `install-structure-step/-preview` (zamjenjuje `install-seed-step`), `install-team-step/-member-row/-credentials-dialog`, `lib/install/install-identity-form.ts`, `install-time-zones.ts`, `map-install-identity-save-error.ts`, `map-install-team-save-error.ts`, `services/install-identity-api.ts`, `services/install-team-api.ts`.
- Testovi: backend 37 suite / 184 testa (`npx jest -c /tmp/jest.local.cjs modules/install`), frontend 228 fajlova / 975 testova.

## 2026-10-15 (F0 stabilizacija + F1 backend osnova)
- F0.1: token gate je fail-closed — otključava samo na uspješan `GET /install/super-admin`; token se upisuje u `sessionStorage` tek nakon provjere, mrežna greška/5xx prikazuje `install.tokenUnavailable` + „Pokušaj ponovo“, sačuvani token se provjerava tiho pri mountu.
- F0.2: novi `use-install-step-resource` hook i `InstallStepLoadError`; pet koraka (super admin, prijava, SMTP, seed, dodaci) ne renderuje formu dok stanje nije pročitano, nego poruku sa request id-em i retry-em.
- F0.3: `InstallSetupProvider` je jedini čitač `GET /install/status` (`nextStep`, `steps`, `profile`, `readiness`); ljuska čarobnjaka više ne učitava status drugi put i ne pada na `superAdmin` kad zahtjev padne.
- F0.4: `role="alert"` na porukama greške u koracima seed, SMTP, prijava i završetak.
- F0.5: korak dodataka je `completed` samo nakon bar jednog upisanog `private.addons.*` ključa; `install-setup.addons.spec.ts` dokazuje da poslije seeda bez snimanja `nextStep === "addons"`.
- F0.6: `seed-install-minimum` dodaje SuperAdmina u fallback grupu kroz `addGroupMember` (idempotentno, bez dupliranja članstva); readiness `handlerGroup` time postaje zelen.
- F0.7: `evaluate-install-readiness.ts` + `read-install-readiness-source.ts`; `POST /install/complete` odbija nedovršenu instalaciju sa `INSTALL_NOT_READY` i listom `details.missing`; frontend mapira u `install.complete.notReady` + listu `install.readiness.<key>`.
- F1: registry koraka (`steps/install-step.registry.ts`), `resolveInstallNextStep`, `readInstallStepProgress`/`toInstallStepStates`.
- F1: novi settings ključevi `private.install.profile` i `private.install.steps.<stepKey>.skipped` (+ 480 ključeva u i18n coverage guardu).
- F1: `GET/POST /install/profile` (katalog paketa, nadogradnja nakon seeda, registry-driven reset pri promjeni paketa), `POST/DELETE /install/steps/:stepKey/skip`, `GET /install/readiness` (+ `profileSteps`).
- F1: `GET /install/status` proširen sa `profile` i `steps.<key>.{skipped,required,offered,blocking}`; bez izabranog paketa ponašanje je kao `minimum`, pa `e2e/helpers/ensure-install.ts` prolazi nepromijenjen.
- Testovi: backend 33 suite / 153 testa (`npx jest -c /tmp/jest.local.cjs modules/install`), frontend 224 fajla / 956 testova (`npx vitest run`).

## 2026-09-11
- `POST /install/complete` provisionira `private.auth.jwtSigningSecret` (Settings secret, ≥32 znaka) ako nedostaje; postojeći secret se ne rotira. Već completed instalacije dobiju secret na boot (`onModuleInit`) ili ponovnom complete-u.
- Implementirano zaključavanje wizarda: `POST /install/complete` atomično piše `private.install.completedAt` kroz Settings Registry i jedan `install_wizard` change log (setting diff). Ponovni complete ne prepisuje timestamp.
- Nakon complete, wizard mutacije su `409 INSTALL_LOCKED`; HTTP setup gate se gasi; `/install` više nije setup tok. Dalje izmjene idu kroz Settings.
- Implementiran addons korak: deterministički switch katalog (SLA, email, Edge, Teams stub, CSAT, auto-assign + ostali ključevi iz `04-install-wizard.md`) kroz `GET/POST /install/addons`.
- Stanje se čuva isključivo kao `private.addons.<key>` u Settings Registry; SMTP OFF i dalje forsira email off. Retry je idempotentan; nepoznat key se odbija. Nema wizard complete/lock i nema addon business logike.
- Implementiran seed korak: min 1 OU, 1 fallback grupa (`Group.isFallback`), 1 ACTIVE servis i routing na tu grupu kroz postojeće OU/catalog/routing modele.
- Seed je idempotentan (reuse postojećih kompatibilnih zapisa) i transakcionan; rezolucija mora biti `EXACT` na fallback grupu. Nema demo tiketa.
- Implementiran SMTP korak: switch `private.smtp.enabled`; ON validira i čuva host/port/TLS/username/from kroz registry, password kao secret. OFF ne zahtijeva polja i forsira `private.addons.email=false`.
- Email addon se čita kroz `resolveEmailAddonEnabled` (SMTP OFF uvijek pobjedi). Nema paralelnog SMTP/email sistema.
- Implementiran korak načina prijave: `local` | `entra_ad` kroz `GET/POST /install/login-provider`.
- `local` čuva `private.auth.mode` bez AD/Entra polja; `entra_ad` zahtijeva tenant+client ili LDAPS bind, secret kroz Settings Registry.
- API ne izlaže tenant/client/bind secret vrijednosti; change log redaktuje secreta.
- SuperAdmin local break-glass ostaje na postojećem `entra_ad` provideru.
- Implementiran SuperAdmin korak: lokalni user, `isLocalOnly`, password hash u `User`, bez plaintext-a u settings/API.
- `POST /install/super-admin` odbija neispravne kredencijale i drugi početni SuperAdmin.
- `GET /install/super-admin` vraća kreirani nalog (email/displayName/isLocalOnly) da refresh ne gubi korak.
- Break-glass local login ostaje na postojećem `entra_ad` provideru.
- Implementiran first-run gate na `private.install.completedAt`.
- Neispravna/prazna vrijednost i settings read failure drže gate aktivnim (fail closed).
- Allowlist: `GET /health`, `/install` i `/install/*`; ostali HTTP zahtjevi `503 SETUP_REQUIRED`.
- UI redirect na `/install` dok setup nije completed; `/install` nije blokiran sopstvenim gate-om.
- Status endpoint `GET /install/status` izlaže samo `isCompleted` (provider-neutral).

## 2026-09-09
- Inicijalna matrica: first-run gate, local SuperAdmin, auth mode, SMTP, seed, addon flags.
- Razdvojeno od service onboarding wizard-a.
