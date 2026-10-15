# F4 — Sadržaj paketa Standard (SMTP test, katalog iz predloška, SLA, policy pack, dodaci)

> Zavisi od: F2 (struktura, tim), F3 (ljuska, feature kartica) · Procjena: velika (5–6 dana).

## Cilj

Standard je preporučeni paket: email radi i provjeren je, katalog izgleda kao pravi service desk od prvog dana, SLA i policy pack su svjesno potvrđeni, a dodaci su predstavljeni kao vrijednost za korisnika, ne kao tehnički prekidači.

## Postojeće stanje (provjereno)
- SMTP: `install-smtp.service.ts`; `read-install-smtp-status.ts` računa `isConfigured = hasStoredValue(privateSmtpEnabled)`; vrijednosti se mogu prefill-ovati iz env-a.
- Test email: `notifications/email-templates/email-templates.controller.ts` `POST test` (traži sesiju i `settingsWrite`), rate limit u `test-email-rate-limiter.ts`.
- Policy packovi: `policy-packs/policy-pack.registry.ts` (`itStandard` sa `slaProfileKey 'STANDARD_REQUEST'`, `hrRestricted`, `financeRestricted`), primjena kroz `apply-policy-pack.ts`, `apply-policy-pack-service-policy.ts`, `apply-policy-pack-user-grants.ts`.
- SLA: kalendar `ensure-starting-business-hours-calendar.ts` (`BH_STANDARD`), matrica `seed-priority-matrix.ts` / `default-priority-matrix.ts`, servisi `sla-calendars.service.ts`, `priority-matrix.service.ts`.
- Dodaci: `settings/addon-catalog.ts` (opisi su tehnički engleski stringovi; `email` ima `requiresSmtp`).

## F4.1 SMTP s test-slanjem
- **Novo:** `POST /install/smtp/test` (`install-smtp-test.service.ts`) — šalje test na adresu super admina ili unesenu adresu; koristi isti mail transport i **isti** rate limiter kao `email-templates` test (bez novog limitera).
- Rezultat: `ok` ili mapirana greška (auth, TLS, host nedostupan, timeout) s porukom za korisnika.
- UI: dugme „Pošalji test“; status kartica (zeleno/crveno) i savjet po vrsti greške; prefill iz env-a označen oznakom „Iz okruženja“.
- Standard: korak je obavezan, ali se može završiti s `enabled=false` uz eksplicitnu potvrdu (onda `email` dodatak ostaje isključen i stavka ide u checklistu).

## F4.2 Install blueprints (katalog iz predloška)
- **Novo:** `backend/src/modules/install/blueprints/`
  - `install-blueprint.types.ts` — `InstallBlueprint` (`key`, `nameKey`, `categories[]`, `services[]` s formom i opcionalnim `slaProfileKey`, `groups[]`, `policyPackKey`).
  - `install-blueprint.registry.ts` — prva verzija: `itServiceDesk` (kategorije: Hardver, Softver, Pristup i nalozi, Mreža, Opšte; grupe L1 i L2 opcionalno).
  - `apply-install-blueprint.ts` — idempotentno nad postojećim `ensure-install-*` funkcijama (`ensure-install-seed-service.ts`, `ensure-install-seed-form-version.ts`, `ensure-install-seed-routing.ts`) i `apply-policy-pack.ts`.
  - `assert-install-blueprint-routing.ts` — za svaki servis `resolveTicketRouting` mora dati `EXACT` (isti princip kao `assertSeedResolution`).
- Po uzoru na `policy-pack.registry.ts`: deklarativno, bez hardkodovane OU hijerarhije (OU dolazi iz F2 koraka).
- API: `GET /install/blueprints` (katalog s pregledom), `POST /install/blueprints/apply` (`{ blueprintKey, includeServices[], createTierGroups }`).
- UI: kartice predloška s pregledom stabla „Kategorija → Servisi“ i prekidačima po servisu.

## F4.3 Policy pack
- Standard primjenjuje `itStandard` na OU iz F2 (kroz `apply-policy-pack.ts`); prikaz šta pack radi (SLA profil, ciljne uloge).
- `hrRestricted` / `financeRestricted` se nude samo ako blueprint ima HR/Finance servise (otvoreno pitanje 3 u overviewu).

## F4.4 SLA pregled (Standard „kasnije“)
- Read-only pregled sa opcijom izmjene osnovnog: radno vrijeme kalendara `BH_STANDARD` (dani, sati), praznici (opcionalno), priority matrica (prikaz `default-priority-matrix.ts`).
- Izmjene kroz postojeće servise (`sla-calendars.service.ts`, `priority-matrix.service.ts`) preko **novog** install-scoped omotača `install-sla-review.service.ts` (zbog install tokena umjesto sesije).
- „Potvrđujem podrazumijevano“ = korak završen bez izmjena.

## F4.5 Dodaci sa prezentacijom
- Postojeći korak `install-addons-step.tsx` prelazi na `install-feature-card.tsx` (F3).
- **Novo:** frontend mapa `lib/install/install-addon-presentation.ts` (ikona, i18n naslov, rečenica vrijednosti, kategorija: Kvalitet usluge, Kontrola, Produktivnost, ITSM, Integracije). Tehnički opisi u `addon-catalog.ts` ostaju za Settings.
- Defaulti po paketu (Standard uključuje: `csat`, `approvals`, `confidential`, `kbIntercept`, `savedViews`, `bulkActions`, `reports`; `email` ako je SMTP ispravan) dolaze iz F1 profila, ne iz UI-ja.
- Zavisnosti: `email` onemogućen bez ispravnog SMTP-a (postojeći `requiresSmtp`).

## API promjene (sve **novo**)
| Metoda | Ruta |
|---|---|
| POST | `/install/smtp/test` |
| GET | `/install/blueprints` |
| POST | `/install/blueprints/apply` |
| GET/POST | `/install/sla-review` |
| POST | `/install/policy-pack` (`{ policyPackKey }`) |

## Settings ključevi
- `private.install.blueprint` (**novo**, string) — primijenjeni predložak; informativno za Settings i ponovni ulaz.
- Skip ključevi za `smtp`, `slaReview`, `blueprint` po F1 šablonu.

## Frontend (**novo**, ≤200 linija svaki)
`install-smtp-test-panel.tsx`, `install-blueprint-step.tsx`, `install-blueprint-tree.tsx`, `install-policy-pack-step.tsx`, `install-sla-review-step.tsx`, `install-business-hours-editor.tsx`, `install-priority-matrix-preview.tsx`, `lib/install/install-addon-presentation.ts`.

## i18n (bs, en) — novo
`install.smtp.test.*` (send, ok, authFailed, tlsFailed, unreachable, timeout, fromEnvironment), `install.blueprint.*` (itServiceDesk, categories, services, tierGroups), `install.policyPack.*`, `install.slaReview.*`, `install.addons.<addonKey>.title|value`, `install.addons.category.*`.

## Testovi
- Backend: `install-smtp-test.service.spec.ts` (rate limit, mapiranje grešaka), `apply-install-blueprint.spec.ts` (idempotentnost, routing `EXACT` za sve servise), `install-sla-review.service.spec.ts`, policy pack primjena.
- Frontend RTL: SMTP test stanja, blueprint stablo (isključen servis se ne kreira), dodaci (zavisnost od SMTP-a).
- Readiness: Standard profil zeleno tek kad su obavezni koraci završeni.

## Kriteriji prihvatanja
- Standard tok završava s katalogom od 5 kategorija i provjerenim routingom za svaki servis.
- SMTP test daje razumljivu poruku za svaku vrstu greške.
- Dodaci su predstavljeni na bosanskom/engleskom s ikonama; nema tehničkih stringova u wizardu.
- Ponovno primjenjivanje blueprinta ne duplira zapise.

## Commit prijedlozi
- `feat(install): SMTP test send in wizard`
- `feat(install): install blueprints with IT service desk catalog`
- `feat(install): policy pack and SLA review steps`
- `feat(install-ui): presented addons with feature cards`
