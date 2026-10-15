# F1 — Backend osnova (registry koraka, profil, skip, readiness)

> Zavisi od: F0 · Procjena: srednja (3–4 dana) · Bez vizuelnih promjena; postojeći UI radi nad novim ugovorom.

## Cilj

Zamijeniti fiksni redoslijed koraka (`resolveNextInstallStep` u `backend/src/modules/install/install-setup.service.ts`, linija 104) deklarativnim registryjem koji zna paket, obaveznost i „preskoči“. Izložiti readiness kao endpoint.

## Postojeće stanje (provjereno)
- `install-setup.types.ts`: `InstallWizardStep` = `superAdmin | loginProvider | smtp | seed | addons | complete`; `InstallStepState` već ima opciono `skipped?: boolean` (nije korišteno).
- `install-setup.service.ts`: `steps` se računa ručno (linije 43–50 i 94–100 za completed status).
- `install-wizard-lock.guard.ts`: mutacije zaključane nakon završetka (`409 INSTALL_LOCKED`), token obavezan prije.
- Prefiks `private.install.` je environment-bound (`config-package.constants.ts`, linija 22), pa novi ključevi ne putuju kroz config pakete.

## Novi fajlovi (svi **novo**, ≤200 linija)
| Fajl | Sadržaj |
|---|---|
| `backend/src/modules/install/steps/install-step.types.ts` | `InstallStepDefinition` (`key`, `order`, `requiredIn: InstallProfile[]`, `offeredIn`, `skippable`, `readState(context)`), `InstallProfile` |
| `backend/src/modules/install/steps/install-step.registry.ts` | lista definicija; F1 sadrži samo postojećih 5 koraka + `profile` |
| `backend/src/modules/install/steps/resolve-install-next-step.ts` | čista funkcija: registry + profil + stanja → `nextStep` |
| `backend/src/modules/install/steps/read-install-step-states.ts` | čita stanja svih koraka (premješta logiku iz `install-setup.service.ts`) |
| `backend/src/modules/install/install-profile.service.ts` | čitanje/snimanje profila |
| `backend/src/modules/install/install-step-skip.service.ts` | snimanje/brisanje `skipped` za `skippable` korake |
| `backend/src/modules/install/install-readiness.service.ts` | omotač nad `evaluate-install-readiness.ts` (F0) + provjera `profileSteps` |
| `backend/src/modules/install/dto/install-profile.dto.ts`, `dto/install-step-skip.dto.ts` | class-validator DTO |
| `backend/src/modules/settings/definitions/install-wizard-settings.ts` | definicije novih ključeva |

`install-setup.service.ts` postaje tanak: poziva `read-install-step-states` i `resolve-install-next-step`.

## API promjene
| Metoda | Ruta | Opis | Status |
|---|---|---|---|
| GET | `/install/status` | dodaje `profile: InstallProfile \| null`, `steps.<key>.skipped`, `steps.<key>.required` | proširenje, kompatibilno |
| GET | `/install/profile` | trenutni profil + katalog paketa (stavke, procjena vremena) | **novo** |
| POST | `/install/profile` | `{ profile }`; dozvoljena promjena dok `seed` nije završen; nakon seeda samo nadogradnja | **novo** |
| POST | `/install/steps/:stepKey/skip` | označi preskočeno; `400 INSTALL_STEP_NOT_SKIPPABLE` ako korak nije skippable u profilu | **novo** |
| DELETE | `/install/steps/:stepKey/skip` | poništi preskakanje | **novo** |
| GET | `/install/readiness` | `{ isReady, checks: [{ key, status: 'ok'\|'missing'\|'skipped', messageKey }] }` | **novo** |
| POST | `/install/complete` | koristi `install-readiness.service.ts` (uključuje `profileSteps`) | izmjena |

Sve rute su pod postojećim `InstallWizardLockGuard` (token prije završetka, lock nakon). Kontroler ne pristupa Prisma-i direktno.

## Settings ključevi (**novo**)
| Ključ | Tip | Default | Opis (za Settings UI) |
|---|---|---|---|
| `private.install.profile` | string (`minimum`/`standard`/`full`) | prazno | Paket izabran pri instalaciji; određuje obavezne korake wizarda. |
| `private.install.steps.<stepKey>.skipped` | boolean | `false` | Korak instalacije označen „Podesi kasnije“; pojavljuje se u post-instalacijskoj checklisti. |

Ključevi se registruju u `setting-keys.ts` i `definitions/install-wizard-settings.ts`. `<stepKey>` je konačan skup iz registryja (bez dinamičkih ključeva van registryja).

## Pravila registryja
- Redoslijed: `profile` → `superAdmin` → … → `complete` (F2–F5 dodaju korake u registry, ne u servis).
- `nextStep` = prvi korak koji je `requiredIn` ili `offeredIn` aktivnog profila, a nije `completed` niti `skipped`.
- Bez profila: profil se tretira kao `minimum` radi kompatibilnosti (postojeći `e2e/helpers/ensure-install.ts` ne šalje profil). Korak `profile` se u tom slučaju nudi, ali nije blokirajući.
- Korak koji nije `skippable` ne može dobiti `skipped=true` (validacija u servisu, ne samo u UI).

## Frontend (samo ugovor, bez novog UI)
- `frontend/src/services/install-api.ts`: tipovi `profile`, `skipped`, `required`; funkcije `loadInstallProfile`, `saveInstallProfile`, `skipInstallStep`, `unskipInstallStep`, `loadInstallReadiness` (**novo**).
- `install-setup-provider.tsx`: nosi `profile`.

## i18n (bs, en) — novo
`install.profile.minimum.title|description`, `install.profile.standard.*`, `install.profile.full.*`, `install.step.skip`, `install.step.skipped`, `install.step.undoSkip`, `install.readiness.title`.

## Testovi
- `resolve-install-next-step.spec.ts`: matrica profil × stanja (uključujući skip i bez profila).
- `install-step-skip.service.spec.ts`: neskippable korak → greška.
- `install-readiness.service.spec.ts`: `profileSteps` crveno kad obavezan korak nije završen.
- `install-setup.service.spec.ts`: postojeći testovi i dalje prolaze (kompatibilnost).
- Kontroler spec za nove rute (token, lock).
- E2E: `ensure-install.ts` bez izmjena mora proći.

## Kriteriji prihvatanja
- Redoslijed koraka više nije hardkodovan u servisu.
- `GET /install/status` je kompatibilan s postojećim klijentom.
- `GET /install/readiness` vraća sve provjere iz overviewa §3.
- `complete` odbija ako obavezan korak profila nije završen.
- Novi fajlovi ≤200 linija; MATRIX i CHANGELOG matrice ažurirani.

## Commit prijedlozi
- `feat(install): step registry with profile-driven next step`
- `feat(install): profile, skip and readiness endpoints`
