# F5 — Sadržaj paketa Full (inbound, direktorij, KB, status, on-call, sigurnost, ITSM)

> Zavisi od: F4 · Procjena: velika (5–7 dana) · Gotovo sve stavke su „Podesi kasnije“.

## Cilj

Full pokazuje punu širinu sistema i omogućava da se ključne enterprise funkcije uključe već pri instalaciji, bez dupliranja Settings UI-ja. Svaka stavka je kartica funkcije (F3) s kratkom formom samo za najvažnija polja; sve ostalo ostaje u Settings.

## Princip: generički „settings section“ korak
Umjesto posebnog backend servisa po funkciji, F5 uvodi **jedan** install-scoped mehanizam nad postojećim settings registryjem:

- **Novo:** `backend/src/modules/install/sections/install-settings-section.registry.ts` — deklarativna lista sekcija; svaka sekcija ima `sectionKey`, listu dozvoljenih `settingKeys.*` (allowlist), ikonu i `requires` (npr. SMTP, direktorij).
- **Novo:** `install-settings-section.service.ts` — čita/piše **samo** allowlistovane ključeve kroz postojeći settings servis (iste validacije, `requires` pravila, tajne se ne vraćaju u čitljivom obliku).
- **Novo:** `GET /install/sections`, `GET /install/sections/:sectionKey`, `POST /install/sections/:sectionKey`.
- Frontend renderuje polja iz metapodataka definicija (pravilo Settings contracta: boolean = switch, number = number input, string = text input, svaki ključ ima opis).
- Registry koraka (F1) dobija po jedan korak po sekciji, `offeredIn: ['full']`, `skippable: true`.

## Sekcije (allowlist iz postojećih definicija, provjereno)
| Sekcija | Definicije | Ključevi u wizardu (podskup) | Zavisnost |
|---|---|---|---|
| Inbound email | `inbound-email-settings.ts` | `privateInboundEnabled`, `privateInboundProvider`, `privateInboundAddress`, `privateInboundCreateTickets`, `privateInboundDefaultServiceId` | servis iz F2/F4 |
| Direktorij (AD/LDAPS) | `directory-sync-settings.ts`, `directory-ldaps-settings.ts` | `privateAuthAdReadEnabled`, `privateAuthAdReadStrategy`, `privateAuthAdReadUsersBaseDn`, `privateAuthAdReadGroupsBaseDn`, `privateAuthRoleSource`, `privateAuthAdRoleGroupDnAdmin`, `privateAuthAdRoleGroupDnAgent` | login mode Entra/AD |
| Baza znanja | `knowledge-base-settings.ts` | `privateKnowledgeBaseFeedbackEnabled`, `privateKnowledgeBaseReviewCycleEnabled`, `privateKnowledgeBasePortalFaqMaxItems` | — |
| Status stranica | `ops-settings.ts` | `privateStatusPageEnabled`, `privateStatusPagePublic`, `privateStatusPageShowUptimePercent` | — |
| On-call | `on-call-settings.ts` | `privateOnCallEnabled`, `privateOnCallReminderTime` | tim (F2) |
| Obavještenja | `announcement-settings.ts` | `privateAnnouncementsEnabled`, `privateAnnouncementsAgentsMayPublish` | — |
| Sigurnost | `account-security-settings.ts`, `security-captcha-settings.ts`, `security-session-settings.ts`, `security-hibp-settings.ts` | `privateAuthMfaRequiredForAdmins`, `privateAuthMfaAllowOptional`, `privateSecurityCaptchaProvider`, `privateSecurityCaptchaSiteKey`, `privateSecurityCaptchaSecretKey`, `privateSecuritySessionIdleTimeoutSeconds`, `privateSecurityHibpEnabled` | — |
| Privatnost i podaci | `privacy-settings.ts`, `data-lifecycle-settings.ts` | `privatePrivacyEnabled`, `privateDataLifecycleArchiveEnabled`, `privateDataLifecycleArchiveAfterClosedDays` | — |
| Audit webhook | `security-audit-webhook-settings.ts` | `privateSecurityAuditWebhookEnabled`, `privateSecurityAuditWebhookUrl`, `privateSecurityAuditWebhookSecret` | — |
| ITSM moduli | `addon-catalog.ts` (`cmdb`, `problems`, `changes`) + `asset-settings.ts`, `problem-settings.ts`, `change-settings.ts` | prekidači dodataka (osnovna podešavanja ostaju u Settings) | — |
| Integracije | `addon-catalog.ts` (`teams`, `edge`) + `teams-integration-settings.ts`, `edge-extension-settings.ts` | prekidači + webhook/URL gdje je obavezno | — |

Tačan podskup ključeva po sekciji se potvrđuje u implementaciji čitanjem definicije (tipovi, `requires`, tajne). Ključevi koji su environment-bound (`config-package.constants.ts`) ostaju takvi.

## Sigurnosne preporuke (Standard i Full)
- Panel „Preporučeno za produkciju“ sa statusom (MFA za admine, captcha, HIBP, idle timeout) i dugmetom „Primijeni preporuke“ koje upisuje dogovorene vrijednosti. Vrijednosti preporuka su otvoreno pitanje za vlasnika (vidi ispod).

## Provjere konekcije (kasnije u fazi, opcionalno)
- Inbound: „Testiraj konekciju“ ako postoji domenska funkcija za test mailboxa; ako ne postoji, **ne** pravi se nova u ovoj fazi (stavka u Otvorena pitanja).
- Direktorij: „Testiraj LDAPS“ samo nad postojećom funkcijom (`directory` modul), uz isti princip.

## Frontend (**novo**, ≤200 linija svaki)
- `components/install/install-section-step.tsx` (generički korak sekcije)
- `components/install/install-section-field.tsx` (polje po tipu definicije)
- `components/install/install-security-recommendations.tsx`
- `lib/install/install-section-presentation.ts` (ikona, i18n naslov, rečenica vrijednosti, „Šta dobijaš“ stavke po sekciji)

## i18n (bs, en) — novo
`install.section.<sectionKey>.title|value|whatYouGet.<n>`, `install.section.requires.<dependency>`, `install.security.recommendations.*`. Opisi polja dolaze iz postojećih opisa definicija (bez novih prevoda po ključu, osim ako opis ne postoji na bosanskom).

## Testovi
- Backend: `install-settings-section.service.spec.ts` — ključ van allowlist-e odbijen; `requires` pravila poštovana; tajne se ne vraćaju; lock nakon završetka.
- Registry: Full profil nudi sve sekcije; Minimum/Standard ih ne nude.
- Frontend RTL: generički korak za boolean/number/string/secret polje; zavisnost (on-call bez tima prikazuje upozorenje).

## Kriteriji prihvatanja
- Full tok se može proći „Podesi kasnije“ za svaku sekciju, a readiness ostaje zeleno.
- Wizard ne može upisati ključ koji nije u allowlist-i.
- Nijedan novi backend servis po funkciji; jedan generički mehanizam.

## Otvorena pitanja (F5)
1. Vrijednosti „Preporučeno za produkciju“ za sigurnost (npr. idle timeout, captcha provider).
2. Da li postoji domenska funkcija za test inbound mailboxa i LDAPS bind; ako ne, test se planira kao zaseban tiket u `TASKS.md`.
3. ITSM moduli u Full: uključeni po defaultu ili ponuđeni isključeni (overview, pitanje 4).

## Commit prijedlozi
- `feat(install): allowlisted settings sections for full profile`
- `feat(install-ui): generic section step and security recommendations`
