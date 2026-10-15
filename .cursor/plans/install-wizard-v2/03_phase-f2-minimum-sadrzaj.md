# F2 — Sadržaj paketa Minimum (identitet, struktura, prvi servis, tim)

> Zavisi od: F1 · Procjena: velika (4–5 dana) · Može ići paralelno sa F3 (UI koraci se prvo rade u postojećoj ljusci).

## Cilj

Minimum paket mora završiti sistemom koji prima tikete pod imenom klijenta, a ne pod fiksnim „Direkcija / Fallback / Opšti zahtjev“. Uvesti korake **Identitet**, **Struktura i prvi servis** (parametrizovan seed) i **Tim**.

## Postojeće stanje (provjereno)
- `install-seed.constants.ts`: fiksno `organizationalUnitName 'Direkcija'`, `distinguishedName 'OU=Direkcija,DC=local'`, `fallbackGroupName 'Fallback'` (`key 'fallback'`), kategorija `'Opšte'` (`'opste'`), servis `'Opšti zahtjev'` (`'opsti-zahtjev'`), forma s jednim poljem `dodatne_informacije`.
- `POST /install/seed` nema body (`install.controller.ts`, linija 115).
- `persist-install-seed-service.ts`: `autoAssignStrategy: 'NONE'`, `policyPackId: null`; servis nema SLA profil (`catalog.prisma` `slaProfileId String?`).
- SLA profili (`INCIDENT`, `ACCESS`, `STANDARD_REQUEST`, `FINANCE`, `HR`) i kalendar `BH_STANDARD` se seedaju pri startu (`sla/starting-sla-seed.service.ts`, `starting-sla.constants.ts`).
- Branding ključevi postoje: `public.branding.appName`, `tagline`, `organizationName`, `logoDataUrl`, `supportEmail`, `supportUrl` (`setting-keys.ts`).
- Lokalizacija: `private.i18n.defaultLocale` (default `bs`, dozvoljeno `bs`/`en`) u `definitions/i18n-settings.ts`.
- Vremenska zona: `private.reports.timeZone` (`read-installation-time-zone.ts`).
- Kreiranje korisnika: `users/create-user.ts` vraća `temporaryPassword` (ili `null`) i `temporaryPasswordDelivery` (`issue-temporary-password-for-user.ts`).

## F2.1 Korak „Identitet“ (**novo**, Minimum obavezan)
- Polja: naziv organizacije (obavezno), naziv aplikacije (default iz postojećeg settings defaulta), jezik sistema (`bs`/`en`), vremenska zona (lista IANA, default `defaultReportsTimeZone` = `Europe/Sarajevo` iz `definitions/reports-settings.ts`), logo / support email / support URL („Podesi kasnije“).
- Backend **novo:** `install-identity.service.ts`, `dto/save-install-identity.dto.ts`, `validate-install-identity.ts`, `read-install-identity-status.ts`.
- Pisanje kroz postojeći settings servis (isti validatori kao Settings UI; logo kroz isti limit kao `logoDataUrl`).
- Registry: korak `identity` između `superAdmin` i `loginProvider`; `completed` = `organizationName` sačuvan.
- Live preview: u UI-ju brend pano odmah prikazuje naziv i logo (koristi F3 ljusku kad je dostupna).

## F2.2 Korak „Struktura i prvi servis“ (parametrizovan seed)
- `POST /install/seed` prima **opcioni** body (`dto/create-install-seed.dto.ts`, **novo**): `organizationalUnitName`, `handlerGroupName`, `serviceName`, `categoryName`. Bez body-ja ponašanje ostaje kao danas (kompatibilnost s `ensure-install.ts`).
- `install-seed.constants.ts` ostaje izvor **defaulta**; nove vrijednosti dolaze iz DTO-a. Ključevi/slugovi se generišu iz naziva (postojeći slug helper ako postoji; inače **novo** `build-install-seed-slug.ts`).
- Idempotentnost: lookup po ključu/slugu kao danas (`findInstallOrganizationalUnit`, `findInstallFallbackGroup`); ponovljeni seed s drugim nazivom **ne** preimenuje postojeće zapise (vraća postojeće + upozorenje u odgovoru).
- SLA: servis dobija profil `STANDARD_REQUEST` (iz `startingSlaProfileKeys`) ako postoji; readiness `slaProfile` postaje stvarna provjera.
- Super admin je član grupe (iz F0.6).
- UI: forma s prefill defaultima i živim pregledom „Tiket za *Servis* ide grupi *Grupa* u OU *OU*“.

## F2.3 Korak „Tim“ (**novo**, Minimum „kasnije“, Standard obavezan)
- Lista do N redova (ime, email, uloga `AGENT` ili `ADMIN`), dodavanje u grupu iz F2.2.
- Backend **novo:** `install-team.service.ts`, `dto/save-install-team.dto.ts`. Poziva domensku funkciju iz `users/create-user.ts` i postojeću funkciju članstva grupe (ista kao `POST /groups/:groupId/members/:userId`). Kontroler ne poziva Prisma-u.
- Sigurnost: samo uz install token i prije završetka (postojeći `InstallWizardLockGuard`); audit kroz postojeći audit tok `create-user.ts`.
- Bez SMTP-a: prikaz privremenih lozinki **jednom** (kopiraj), zavisno od odgovora vlasnika na otvoreno pitanje 2 u overviewu.
- Registry: korak `team`, `skippable` u Minimum.

## API promjene
| Metoda | Ruta | Status |
|---|---|---|
| GET/POST | `/install/identity` | **novo** |
| POST | `/install/seed` | opcioni body (kompatibilno) |
| GET | `/install/seed` | vraća i trenutne nazive (OU, grupa, servis) |
| GET/POST | `/install/team` | **novo** |

## Settings ključevi
Bez novih ključeva osim `private.install.steps.team.skipped` / `identity.skipped` (pokriveno F1 šablonom). Koriste se postojeći `public.branding.*`, `private.i18n.defaultLocale`, `private.reports.timeZone`.

## Frontend (**novo**, svaki ≤200 linija)
- `components/install/install-identity-step.tsx`, `install-identity-fields.tsx`
- `components/install/install-structure-step.tsx` (zamjenjuje sadržaj `install-seed-step.tsx`), `install-structure-preview.tsx`
- `components/install/install-team-step.tsx`, `install-team-member-row.tsx`, `install-team-credentials-dialog.tsx`
- `services/install-api.ts`: nove funkcije; `lib/install/validate-install-identity.ts`.

## i18n (bs, en) — novo
`install.identity.*` (title, description, organizationName, appName, locale, timeZone, logo, supportEmail, supportUrl, later), `install.structure.*` (ouName, groupName, serviceName, categoryName, preview), `install.team.*` (title, addMember, role, credentialsOnce, emailSent).

## Testovi
- Backend: `install-identity.service.spec.ts`, `install-seed.parametrized.spec.ts` (custom nazivi, ponovni seed, bez body-ja), `install-team.service.spec.ts` (duplikat emaila, članstvo, lock nakon završetka).
- Readiness: `slaProfile` i `handlerGroup` zeleno nakon Minimum toka.
- Frontend RTL: identitet (validacija, kasnije), struktura (preview), tim (kredencijali jednom).
- E2E (novo, F6): Minimum tok kroz UI završava, agent iz tima kreira tiket.

## Kriteriji prihvatanja
- Minimum bez tima završava readiness zeleno (super admin je član grupe).
- Nazivi OU, grupe i servisa su klijentovi; podrazumijevani tok bez body-ja radi kao danas.
- Servis iz seeda ima SLA profil.
- Identitet je vidljiv na login stranici odmah nakon završetka (`public-branding.controller.ts`).

## Commit prijedlozi
- `feat(install): identity step (branding, locale, time zone)`
- `feat(install): parametrized structure seed with SLA profile`
- `feat(install): team step with group membership`
