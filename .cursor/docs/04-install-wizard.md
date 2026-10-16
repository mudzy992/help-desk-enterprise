# Install wizard (first-run)

Nije isto što i **service onboarding wizard** (admin, jedan servis).
Ovo je **jednokratni** setup aplikacije prije bilo kojeg logina osim samog wizarda.

Source of truth za korake: `backend/src/modules/install/steps/install-step.registry.ts` (F1). Ovaj fajl opisuje ugovor i pravila; UI: Constitution — jedan korak = jedan posao (+ izuzetak „Izuzetak: install wizard“, vidi Constitution).
SMTP polja mogu prefillovati iz env (`SMTP_*`); wizard ostaje istina nakon complete.

## Gate

Dok `private.install.completedAt` nije postavljen:

- UI: sve rute → `/install`
- API: sve osim `GET /health` i `/install/*` → `503 SETUP_REQUIRED`

Nakon završetka wizard se **zaključava** (`POST /install/*` osim `complete` → `409 INSTALL_LOCKED`), a izmjene idu kroz Settings (SuperAdmin). Ponovno otvaranje je ops-only i sada **implementirano** (odluka vlasnika 6): `INSTALL_ALLOW_RERUN=true` + install token uz `POST /install/restart` ili `npm run cli:install-rerun`; upis ide u change log kao `install_wizard_rerun`. Recept: `ops/runbook/ponovno-pokretanje-instalacije.md`.

Prvi ekran je **token gate** (`install-token-gate.tsx`): otključava se isključivo na uspješan `GET /install/super-admin`. Token se u `sessionStorage` upisuje **tek nakon** uspješne provjere; mrežna greška, 5xx i timeout ostavljaju gate zatvoren uz poruku `install.tokenUnavailable` i dugme „Pokušaj ponovo“. Sačuvani token se pri mountu provjerava tiho (stanje `checking`), a odbačeni token se briše.

## Ponovno pokretanje (ops-only, odluka 6)

- `POST /install/restart` (`install-rerun.controller.ts`) traži `INSTALL_ALLOW_RERUN=true` (inače `403 INSTALL_RERUN_NOT_ALLOWED`) i
  `x-install-token`. To je jedina instalacijska ruta koja token traži **i nakon** završetka (`isInstallTokenAlwaysRequired`) —
  otvaranje je istovremeno i rušenje sistema u setup mod, pa nikad nije anonimno.
- `is-install-wizard-mutation-locked` propušta tačno dvije mutacije poslije završetka: ponovni `complete` (idempotentan) i `restart`.
- Podrazumijevano briše samo `private.install.completedAt` i `private.install.completedByUserId`; `includeStepMarkers` dodaje markere
  čarobnjaka (`private.install.profile`, `blueprint`, `policyPack`, `slaReview`, sve `steps.<korak>.saved|skipped`). Plan dijele ruta i CLI
  (`plan-install-rerun.ts`), a upis ide kroz `SettingsService` sa `reason = install_wizard_rerun` (validacija + change log + invalidacija keša).
- Idempotentno: `alreadyOpen: true` ne mijenja ništa. Odgovor nosi `nextStep`, pa operater zna na kojem koraku wizard staje.
- CLI: `npm run cli:install-rerun -- --reason "<zašto>" [--include-step-markers] [--dry-run]`.
- U UI-u nema ničega: nema dugmeta, nema i18n ključa i nema promjene ponašanja za redovne administratore.

## Readiness (F0.7, F1, F2)

„Spremno za prijem tiketa“ je definicija, ne osjećaj. `evaluate-install-readiness.ts` (čista funkcija) + `read-install-readiness-source.ts` (Prisma/settings čitači) vraćaju listu provjera; `install-readiness.service.ts` dodaje `profileSteps` iz registryja.

| Ključ | Zadovoljeno kad |
|---|---|
| `superAdmin` | Postoji korisnik sa sistemskom ulogom SuperAdmin |
| `authMode` | `private.auth.mode` je sačuvan i parsira se (`local` \| `entra_ad`) |
| `organizationalUnit` | Postoji bar jedna organizacijska jedinica |
| `handlerGroup` | Fallback grupa ima bar jednog **aktivnog** člana |
| `service` | Postoji ACTIVE servis sa ACTIVE formom |
| `routing` | Dry-run `resolveTicketRouting` vraća `EXACT` |
| `slaProfile` | Servis iz seeda je vezan na **aktivan** SLA profil (F2: ranije je bilo dovoljno da profil postoji u sistemu) |
| `roles` | Sve sistemske uloge postoje i imaju bar jednu dodijeljenu dozvolu |
| `profileSteps` | Svaki korak izabranog paketa je završen ili eksplicitno odgođen |

Statusi: `ok` · `missing` (blokira) · `skipped` (D4: „Podesi kasnije“ — **ne** blokira).
F6.1: `profileSteps` **preskače** korak `provisioning` (`readinessGateStepKeys`) — korak `provisioning` je sam ekran koji ove provjere prikazuje i nikad nije `completed` (`read-install-step-states.ts`), pa bi njegovo brojanje učinilo spremnost nedostižnom. `installReadinessStepKeys` uz svaku provjeru nosi i **korak koji je rješava** (`roles` → `null`: sistemske uloge nijedan korak ne pita), pa ekran nudi „Idi na korak“.
`POST /install/complete` poziva istu provjeru prije upisa; ako nije zeleno → `409 INSTALL_NOT_READY` sa `details.missing` (lista ključeva). Frontend mapira u `install.complete.notReady` i prikazuje listu kroz `install.readiness.<key>`.

## Paketi (F1)

`GET/POST /install/profile`. Korak paketa je **prvi korak čarobnjaka i blokira** dok paket nije izabran (F3, §4: „Izbor paketa — obavezno“ u sva tri paketa); dok paket nije izabran, za sve ostale odluke važi kao da je izabran **Minimum** (`profile ?? 'minimum'`). `e2e/helpers/ensure-install.ts` zato prvo šalje `POST /install/profile { profile: 'minimum' }`, a `POST /install/complete` bez izabranog paketa vraća `409 INSTALL_NOT_READY`.

| Paket | Sadržaj (šire) |
|---|---|
| `minimum` | token gate, izbor paketa, SuperAdmin, **identitet**, način prijave, SMTP, OU + grupa + prvi servis (parametrizovan seed), tim (opciono, „Podesi kasnije“), dodaci, provisioning + readiness, završni ekran |
| `standard` | Minimum + tim, SMTP, email dodatak, blueprint katalog, L1/L2 grupe, policy pack, SLA pregled, pregled dodataka, sigurnosne preporuke |
| `full` | Standard + inbound, LDAPS, baza znanja, status stranica, dežurstva, najave, CMDB/problemi/promjene, Teams/Edge, privatnost/retention/audit webhook |

Promjena paketa (odluka vlasnika 5) dozvoljena je dok je operater na koraku paketa: stanje koraka koje novi paket ne sadrži se resetuje, a koraci koji ostaju zadržavaju stanje. Resettiraju se samo ključevi koje registry eksplicitno dozvoljava (`resettableSettingKeys` — npr. `private.addons.*`); kredencijali, identitet i seed podaci se **nikad** ne brišu. Nakon prvog seeda dozvoljen je samo **nadogradnja** paketa (`INSTALL_PROFILE_LOCKED_AFTER_SEED`).

## Ljuska (F3) i vizualni identitet „Aurora“ (2026-10-16)

`install-wizard-shell.tsx` je jedan kanvas, jedan HUD i dvije kolone (od `lg`): **plan leta** lijevo, korak na **staklenoj pozornici** desno. Redizajn je zahtjev vlasnika („posebna priča“, `HANDOFF.md`): čarobnjak ima **svoj** vizualni jezik i ne prati `data-theme`/`data-accent`.

- **Sopstvena paleta kroz `data-install-theme="aurora"`** na `<html>` (`lib/install/use-install-theme.ts`, skida se na unmount). Tokeni su u `styles/install-theme.css` (space-separated RGB kanali kao u Pulseu, pa `/alpha` radi); `styles/install-shim.css` preusmjerava semantičke utilities koraka (`text-muted-foreground`, `bg-surface`, `border-border`, pilula-dugmad, polja, radio-kartice, `role="switch"`) na tu paletu, a `styles/install-scenes.css` nosi scene (airlock, liftoff, orbit, sweep). Nijedan drugi ekran ne vidi nijedno od tih pravila — Pulse tokeni i `/login` ostaju nedirnuti.
- **Naslovno slovo** je Space Grotesk (`@fontsource-variable/space-grotesk`, lokalno, bez CDN-a) za naslove, eyebrow i brojeve; tijelo teksta ostaje Inter.
- **HUD** (`install-top-bar.tsx`) zamjenjuje i brend pano i mobilno zaglavlje: mark, živi naziv organizacije (`useBranding()`), `LocaleSelect`, jedan segment po koraku i `role="progressbar"` + `install.shell.stepOf`.
- **Plan leta** (`install-flight-plan.tsx`, `lg` i više) je **rail** (`install-step-rail.tsx`, pet stanja iz `GET /install/status`: `done`, `current`, `deferred`, `locked`, `upcoming`), plus panel **„Šta dobijaš“**. Rail ništa ne odlučuje — stanja dolaze s servera.
  - **Rail je prozor, ne zid** (zahtjev vlasnika, 2026-10-16): registar može dati 25 koraka, pa je kolona ograničena na ekran (`max-height: calc(100dvh - 7.5rem)`), mapa se skroluje unutar sebe, a **fade** na oba kraja postoji samo dok stvarno ima viška (`data-scrollable` se mjeri). Padding prozora i bend fade-a su isti, pa na krajevima nijedna vidljiva stavka nije zagasita. Prozor **prati aktivan korak** — na svaku promjenu koraka sam se centrira (`scrollTop`, nikad `scrollIntoView`, koji bi povukao i stranicu), tiho bez animacije uz `prefers-reduced-motion`. Kad je prozor stvarno prelivan i ne drži ništa fokusabilno, dobija `role="region"`, ime i `tabIndex=0` po istom pravilu kao `components/ui/scroll-region.tsx`. Na niskom ekranu (< 780 px) panel „Šta dobijaš“ se sklanja da mapa zadrži prostor.
  - **Linija ide po segmentima.** Jedna linija iza svih čvorova prolazi *ispod* ikonica, a čvorovi su staklo — providni — pa je izgledalo kao da ih je precrtala. Sada svaka stavka crta svoj segment (`::before` track, `::after` pređeni dio) od ispod svog čvora do pred sljedeći, a „dokle smo stigli“ je boja segmenta koji izlazi iz pređenog koraka. Zbog toga nema više `--iw-rail-progress`.
  - Ispod `lg` se plan leta sklapa: HUD nosi progres, a korak je jedino što vrijedi ekrana.
- **Naslov koraka** (`install-step-header.tsx`) je eyebrow („Korak X od Y“), display `h1` i jedna rečenica; fokus pri promjeni koraka i dalje ide na `h1` (`tabIndex={-1}`, `preventScroll`).
- **Footer** je jedan za sve korake: „Nazad“ (pregled **već odgovorenog** koraka; `useInstallStepNavigation` nikad ne otvara zaključan ili neodgovoren korak i ne pomjera čarobnjak), „Podesi kasnije“ i „Nastavi“ (izlaz iz pregleda). Primarna akcija ostaje u koraku („Sačuvaj“); sva dugmad footera su `type="button"` da prvi `form button[type="submit"]` ostane submit same forme (E2E ugovor).
- **Scene:** token gate je **airlock** (rotirajući conic gradijent oko kartice, `#install-token` i vlastita `<form>` nepromijenjeni), završni ekran je **liftoff** (tri orbite, `install-liftoff.tsx`, novi ključ `install.complete.eyebrow`).
- **Motion:** drift pozadine (68 s), halo aktivnog čvora, beam trenutnog segmenta, orbit, sweep i rise prelaz koraka; pod `prefers-reduced-motion` **sve** je isključeno (`install-scenes.css`), a `useInstallStepTransition` i dalje ne dodaje `page-in`.
- **Kontrast:** parovi su izmjereni i zapisani u `install-theme.css` (ink 12,6:1, soft 6,9:1, dim 4,7:1, akcenti ≥ 5,2:1, `ink-on-accent` ≥ 10,6:1). Brojke su izračunate alfa-kompozicijom preko najsvjetlijeg piksela koji aurora može dati — tri radijalna sloja `.iw-backdrop` u paint redu preko osnove canvasa daju (55, 86, 116) — pa su pod, a ne prosjek. Prva verzija je imala samo sjaj bez osnovne boje i muted tekst je pao na 2,9:1; zato `.iw-panel` ima neprozirnu osnovu (`--iw-panel` na 0,88) i zato nijedan sekundarni tekst ne stoji na goli canvas (vidi pravilo u `install-theme.css`). Aurora paleta ima **vlastiti čuvar**, `scripts/check-install-aurora.mjs` (CI, frontend posao): sam izvodi najsvjetliji piksel iz `.iw-backdrop` slojeva, preračunava **svaki** broj iz tablice u komentaru (13 redova), odbija `.iw-panel` bez neprozirne osnove, pada na svakoj utility klasi koju `install-shim.css` ne preusmjerava (26 klasa u install toku) i pada kad golo `.iw-*` pravilo dobije beskonačnu **geometrijsku** animaciju bez `pointer-events: none` — Playwright klikne samo element čije se bounding box nije mijenjao dva frame-a, pa bi rotirajući kontejner oko token forme oborio specove 51/52/53 na prvoj interakciji. `scripts/check-theme-contrast.mjs` i dalje čuva Pulse palete.
- **E2E ugovor** je nepromijenjen i sada ima svoj čuvar: `components/install/install-wizard-e2e-markup.spec.tsx` + dva testa u `shell/install-wizard-shell.spec.tsx` pinuju jedini `h1`, redoslijed tijelo→footer, `type="button"` footer, `div.rounded-lg.border` karticu paketa, `ul[aria-live="polite"] li` redove spremnosti, `#install-token` i `/login` link.
- **Pregled bez backenda:** dev-only ruta **`/install-preview`** (`pages/install-preview-page.tsx`, registrovana pod `import.meta.env.DEV` u `app/router.tsx`) prikazuje tri scene — korak, airlock, liftoff — s fixture-ima, jer `/install` bez API-ja ne može ni otključati gate. Vizualni QA board (`components/visual-qa/visual-qa-install-board.tsx`, ruta `/_visual-qa`) prikazuje HUD, plan leta, pozornicu i spremnost; atribut drži **na svom kontejneru**, ne na `<html>`, da QA stranica ne prefarba aplikacijsku ljusku.
- **Stanje čitanja statusa** je i dalje na `/install`: `loading` → `InstallGateSkeleton`, `error` → `GateStatusError` sa „Pokušaj ponovo“.

## Koraci (redoslijed)

0. **Paket (F1/F3)**  \
   `minimum` | `standard` | `full`. Katalog i naslovi dolaze iz `install-profile.catalog.ts` (`install.profile.*`); paket se čuva kao `private.install.profile`.  \
   Ekran (`install-profile-step/form/card/customize.tsx`): tri kartice s ikonom, procjenom trajanja (`estimatedMinutes`), oznakom **„Preporučeno“** i prvih pet stavki kataloga; „Prikaži sve“ otvara sheet s punom listom (`install.profile.item.*`, obavezno/opciono).  \
   **„Prilagodi paket“** prikazuje korake izabranog paketa. Prekidač ima samo korak koji registry dozvoljava odgoditi (`steps.<key>.skippable`) i on piše F1 `private.install.steps.<key>.skipped` — isti mehanizam kao „Podesi kasnije“ u koraku; obavezni koraci su zaključani s objašnjenjem (`install.profile.lockedHint`), a stavke kataloga koje još ne pripadaju nijednom koraku (blueprints, policy pack, sigurnosne preporuke — F4/F5) se **ne** prikazuju kao prekidač koji ništa ne radi, nego kao sadržaj paketa u karticama i sheetu.
   **IN19 — promjena paketa i odgode:** `planInstallProfileReset` prima i `previousProfile`; koraci koje novi paket **traži**, a stari ih je samo nudio, vraćaju se u tok (`reopenedStepKeys`). `POST /install/profile` briše njihovu zastavicu samo ako je bila postavljena (u istoj transakciji i istom change-log zapisu) i vraća `reopenedSteps`; ljuska iznad takvog koraka pokaže `install.shell.reopened`. Odgoda nije zabranjena — traži se nova odluka pod novim paketom.

1. **SuperAdmin (uvijek lokalni)**  \
   email, displayName, password. Nalog ima `isLocalOnly=true`.  \
   Čak i kad je prijava `entra_ad`, ovaj nalog se **uvijek** autentifikuje lokalno (break-glass). Nije AD identitet i ne smije se obrisati zadnji local SuperAdmin.  \
   F0.6: nalog se idempotentno dodaje u fallback grupu kroz istu domensku funkciju koju koristi `POST /groups/:groupId/members/:userId` (`addGroupMember`) — ponovljeni seed ne duplira članstvo.

2. **Identitet (F2, obavezan)**  \
   naziv organizacije (obavezno), naziv aplikacije, jezik sistema (`bs` | `en`), IANA vremenska zona, logo / email podrške / link podrške („Podesi kasnije“).  \
   Piše se kroz settings registry u iste ključeve koje čita javni brending endpoint (`public.branding.*`, `private.i18n.defaultLocale`, `private.reports.timeZone`), pa je identitet vidljiv na login stranici odmah nakon koraka i kasnije uredan u Settings → Brending. Korak je `completed` kad je naziv organizacije upisan; omiljeno polje koje se ne popuni **ne** prepisuje postojeću vrijednost.  \
   API: `GET/POST /install/identity` (`install-identity.service.ts`, `validate-install-identity.ts`, `read-install-identity-status.ts`).

3. **Način prijave**  \
   `local` | `entra_ad`.  \
   Ako `entra_ad`: obavezna polja (tenant/client ili LDAPS bind) ili “sačuvaj i dopuni kasnije u Settings” samo ako je bar mode izabran. Role mapping ostaje settings-driven.

4. **SMTP**  \
   switch enabled. Ako ON: host, port, TLS, user, password (secret), from address; test-send opciono. Ako OFF: email addon je forsirano off. U paketu Minimum korak je ponuđen, ali nije obavezan (`skippable`).

5. **Struktura i prvi servis (F2)** — parametrizovan seed  \
   Operater unosi nazive koje klijent koristi: `organizationalUnitName`, `handlerGroupName`, `categoryName`, `serviceName`. Bez body-ja vrijednosti su zadane iz `install-seed.constants.ts` (`Direkcija` / `Fallback` / `Opšte` / `Opšti zahtjev`), pa je tok bez body-ja identičan kao prije F2 (`e2e/helpers/ensure-install.ts`).  \
   - org/OU root (npr. Direkcija) — DN `OU=<naziv>,DC=local`  \
   - handler grupa (min 1 = fallback / unrouted) — key je slug naziva (`fallback` ostaje za zadani naziv)  \
   - kategorije + servisi (min 1 servis vezan na fallback grupu) — slugovi se generišu iz naziva (`build-install-seed-slug.ts`)  \
   - servis dobija SLA profil `STANDARD_REQUEST` (`sla/starting-sla.constants.ts`); ako ga nema, prvi aktivni profil, inače `null` i readiness `slaProfile` ostaje crven  \
   - super admin je član grupe (F0.6)  \
   Ponovljeni seed **ne** preimenuje postojeće zapise: vraća ih i dodaje `warning.code = NAMES_ALREADY_SEEDED` sa `requested`/`stored` (preimenovanje je posao Settings ekrana, ne wizarda).  \
   Ne seedati “demo tikete”. UI: `install-structure-step.tsx` + živi pregled „Tiket za *Servis* ide grupi *Grupa* u OU *OU*“ (`install-structure-preview.tsx`).

6. **Tim (F2)**  \
   Do 25 redova (ime, email, uloga `AGENT` | `ADMIN`); svaki red postaje stvarni nalog kroz `users/create-user.ts` (isti validatori, audit i ugovor o privremenoj lozinci kao `POST /users`) i član je grupe iz koraka 5 kroz `addGroupMember` (isto kao `POST /groups/:groupId/members/:userId`).  \
   Bez SMTP-a `temporaryPasswordDelivery` je `ui` i lozinke se prikazuju **jednom** (`install-team-credentials-dialog.tsx`, kopiranje); nikad se ne vraćaju ponovnim čitanjem. Korak je u Minimumu `skippable` („Podesi kasnije“), u Standardu/Fullu obavezan. Founder sam u grupi **ne** znači da je korak odgovoren.  \
   API: `GET/POST /install/team` (`install-team.service.ts`, `validate-install-team.ts`, `read-install-team-status.ts`).

7. **Katalog iz predloška (F4.2)**  \
   `GET /install/blueprints` vraća predloške; prva verzija je `itServiceDesk` (Hardver, Softver, Pristup i nalozi, Mreža, Opšte; 10 servisa; opcione tier grupe `nivo-1`/`nivo-2`). `POST /install/blueprints/apply` prima `{ blueprintKey, includeServices[], createTierGroups, locale? }`, radi u **jednoj transakciji** (tier grupe pa servisi), upisuje kategorije/servise kroz iste `ensure-install-*` funkcije kao seed (slug + `ensureInstallSeedFormVersion` + `ensureInstallSeedRouting`), a prije commita **dokazuje** `resolveTicketRouting(...) === EXACT` za svaki servis (`assert-install-blueprint-routing.ts`) — fallback ruting se ne može provući. Ponovni apply ne duplira zapise (traži po slugu; `opsti-zahtjev` iz seeda se preuzima). Marker: `private.install.blueprint`.  \
   UI: `install-blueprint-step.tsx` + `install-blueprint-tree.tsx` (stablo „Kategorija → Servisi“ s prekidačem po servisu i prekidačem za tier grupe).

8. **Policy pack (F4.3)**  \
   `GET /install/policy-pack` nudi pakete iz `policyPackKeys` primijenjenog predloška (bez predloška: svi iz registra), `POST` primjenjuje izabrani kroz funkciju `applyPolicyPack` na OU iz koraka 5 i na servis iz seeda. `private.policyPacks.disabledKeysCsv` isključuje paket → `409 PACK_DISABLED`; paket koji predložak ne nudi → `400 POLICY_PACK_NOT_OFFERED`. Marker: `private.install.policyPack`.  \
   Korak **nije** `skippable` — paket nosi prava koja paket instalacije obećava. UI: `install-policy-pack-step.tsx`.

9. **SLA pregled (F4.4)**  \
   `GET /install/sla-review` vraća kalendar `BH_STANDARD` (inače prvi), matricu prioriteta i marker. „Potvrđujem podrazumijevano“ (`outcome: 'confirmed'`) upisuje **samo** marker `private.install.slaReview` — podaci se ne mijenjaju. `outcome: 'adjusted'` mijenja radno vrijeme (`updateBusinessHoursCalendar`) i/ili ćelije matrice (`patchPriorityMatrix`) uz `reason: 'install_wizard'`; prazna izmjena → `400 SLA_REVIEW_EMPTY_ADJUSTMENT`, kalendara bez `BH_STANDARD` → `409 SLA_REVIEW_CALENDAR_MISSING`.  \
   UI: `install-sla-review-step.tsx` (jedno dugme: bez izmjena potvrđuje, s izmjenama snima), `install-business-hours-editor.tsx` (dan po dan; dan s više intervala zadržava ostale i to napiše) i `install-priority-matrix-preview.tsx` (**read-only** prikaz 4×4 — matrica se mijenja na SLA stranici, gdje izmjena traži razlog). Praznici se prikazuju (broj), ne uređuju.

10. **Dodaci (feature flags)**  \
   Switch po dodatku (opis uz svaki). Core se ne gasi (ticketing, routing, group inbox, RBAC, audit, in-app notifikacije, attachments).  \
   F0.5: korak je `completed` **samo** ako je `POST /install/addons` bar jednom sačuvan (dokaz je bar jedan upisan `private.addons.*` ključ); osvježavanje stranice više ne preskače korak i defaulti se ne prihvataju tiho.

11. **Provjera spremnosti (F6.1)**  \
   Posljednji korak prije kraja i **jedino mjesto** s kojeg se instalacija završava. `GET /install/readiness` se prikazuje kao lista (`install-readiness-checks.tsx`): ikona po statusu + `aria-live="polite"`, sr-only riječ statusa (`install.provisioning.ok|missing|deferred`), a crvena stavka nosi poruku i — kad je korak poznat — dugme **„Idi na korak“** (`installReadinessStepKeys`). Lista je statična (nema `draw-ring` animacije): smanjeni pokret ne mijenja ništa osim što je i dalje obična lista.  \
   Dok je ijedna provjera `missing`, dugme **„Završi instalaciju“** ne postoji. Kad su sve zelene: `POST /install/complete`, pa `setup.markCompleted()` (bez `reload()` — status je već prešao na `complete`). Odbijen `complete` (`409 INSTALL_NOT_READY`) ispisuje `install.complete.notReady` + `details.missing` kroz `install.readiness.<key>` i sam ponavlja `GET /install/readiness` **i** `reload()` statusa, pa operater sleti na korak koji stvarno nedostaje.  \
   „Provjeri ponovo“ je samo ponovno čitanje readinessa; korak se ne može odgoditi (`409 INSTALL_STEP_NOT_SKIPPABLE`, ključ je u `installStepParamKeys` da odgovor bude 409, a ne 400).

12. **„Sistem je spreman“ (F6.2, završni ekran)**  \
   Ne korak nego kraj: `resolve-rendered-step.ts` vraća `complete` kad `isCompleted` stoji. `install-ready-screen.tsx` prikazuje sažetak (`install-ready-summary.tsx`: paket, naziv organizacije, broj OU/servisa/grupa/članova tima, uključeni dodaci kao read-only kartice, odgođeni koraci iz `summary.deferredSteps`) i tri prva koraka (`install-first-steps.tsx`): „Kreiraj prvi tiket“ (portal), „Pozovi tim“ (**samo** kad je `deferredSteps` sadrži `team`) i „Otvori podešavanja“. Sažetak dolazi uz `GET /install/status` samo dok instalacija **nije** završena (F6: `readInstallSummary`, `InstallSetupSummary`); završena instalacija ga ne nosi, pa ekran prikaže samo prve korake.  \
   Prijave **nema** (odluka vlasnika 1): ekran nudi link na `/login` (`install.ready.signIn`) i ništa ne šalje sâmo. Staru komponentu `install-complete-step.tsx` zamjenjuju `install-ready-screen.tsx` + `install-ready-summary.tsx` + `install-first-steps.tsx`.

**Odgađanje koraka (F1, D4).** Korak može biti `skippable` (SMTP, tim, katalog iz predloška, SLA pregled, sigurnosne preporuke, sekcije Full paketa i dodaci); `policyPack` i `provisioning` (F6.1) su obavezni i ne mogu se odgoditi. `POST /install/steps/:stepKey/skip` upisuje `private.install.steps.<stepKey>.skipped=true`, `DELETE` ga vraća na `false`; korak koji nije `skippable` (SuperAdmin, seed, paket, način prijave) vraća `400 INSTALL_STEP_NOT_SKIPPABLE`. Odgođen korak ne blokira `complete`, ali ulazi u `profileSteps` sa statusom `skipped`.

## Checklist poslije instalacije (F6.3)

Ono što je čarobnjak obećao „Podesi kasnije“ ne smije se izgubiti u tišini. Novi modul `backend/src/modules/setup-checklist/` nudi `GET /setup-checklist`:

- **Predmeti** su koraci sa `private.install.steps.<key>.skipped = true` **i** nezadovoljene preporuke (npr. SMTP isključen). `provisioning` i `complete` su izuzeti.
- Predmet je **završen** kad njegov `readState` iz registryja vrati `completed` — nema ručnog označavanja niti „preskoči“ stavke. Stavka nestaje jer stvar iza nje postoji.
- Svaki predmet nosi `{ key, kind: 'step' | 'recommendation', targetKey, titleKey, helpKey? }`: naslov je `dashboard.setupChecklist.item.<stepKey>` (sekcije: `item.section.<sectionKey>`), a „Otvori“ vodi na ekran koji to rješava (`setup-checklist-target.ts`: preporuke → `/admin?tab=security`, tim → `/admin?tab=users`, seed/blueprint → `/services`, `slaReview` → `/sla`, `policyPack` → `/admin?tab=permissions`, ostalo → `/admin?tab=settings`).
- `POST /setup-checklist/dismiss` upisuje `private.install.checklistDismissedAt` (ISO) i sakrije **samo karticu**; stavke ostaju dostupne iz Settingsa i vraćaju se brisanjem ključa.
- Pristup: sesija + `permissionKeys.settingsWrite` (`403` bez aktera), `@AdminReadOperation()` na GET-u. Modul **nije** pod `InstallWizardLockGuard`-om — instalacija je završena, ovo je poslije nje. Uvozi `AuthenticationModule` + `AuthorizationModule`: gardovi iz `@UseGuards(...)` razrješavaju se u injektoru modula koji deklariše kontroler, pa sa samo `SettingsModule` pada `app.module.spec.ts` („Nest can't resolve dependencies of the SessionAuthenticationGuard“), a jedinični test koji kontroler gradi rukom to ne vidi — čuva `setup-checklist.controller.spec.ts`.
- UI: `components/dashboard/setup-checklist-card.tsx` (+ `setup-checklist-item.tsx`), samo za admine, iznad skeletona na dashboardu, osvježava se pri ulasku na stranicu (bez realtime-a). Neuspješno čitanje **sakrije** karticu; checklist je ponuda, ne kapija.

## E2E (F6)

`e2e/tests/51-install-wizard-minimum.spec.ts` i `e2e/tests/52-install-wizard-standard.spec.ts` nastavljaju zajedničku numeraciju (…, 50, 51, 52), a helperi, config (`e2e/install-wizard/playwright.install.config.ts`) i globalSetup žive u `e2e/install-wizard/`. Config je **odvojen** projekat: njegov `globalSetup` samo čeka `/health`, jer `ensureInstall` iz zajedničkog setupa završava instalaciju kroz API — upravo ono što ova dva speca dokazuju kroz UI. Zajednički config ih drži van svog skupa (`testIgnore`), a zajednički `e2e` posao odbija `E2E_SPECS=51|52` uz uputu na `install_spec`.

- **51 (Minimum):** token gate → paket → SuperAdmin → identitet → lokalna prijava → struktura → odgođeni SMTP i tim → dodaci → provisioning → „Sistem je spreman“, pa prijava na `/login`, checklist sa tačno odgođenim stavkama i **stvarni rutirani tiket** na seedovanom servisu.
- **52 (Standard):** isto + pravi SMTP test, pozvan član tima, blueprint „IT service desk“ i IT policy pack; bez mail catchera SMTP test pada, korak se **odgodi** i to se zabilježi kao anotacija (preskočena provjera nikad nije zelena). Sigurnosne preporuke se svjesno odgađaju: primjena čini MFA obaveznim za admine, a spec se onda prijavljuje tim istim adminom.
- Preduslov je **svježa** baza (ili ponovno otvoren čarobnjak: `INSTALL_ALLOW_RERUN=true` + `npm run cli:install-rerun -- --reason ... --include-step-markers`). Specovi se sami preskaču kad `GET /install/status` kaže `isCompleted: true`; između 51 i 52 čarobnjak se mora ponovno otvoriti, jer 51 instalaciju završava.
- **Otvoren nije isto što i svjež.** Ako čarobnjak ne stoji na prvom koraku (`nextStep !== 'profile'`, npr. `provisioning` nakon ponovnog otvaranja bez brisanja markera), `install-wizard-precondition.ts` prekida spec s receptom (reset baze, pa `--include-step-markers`) umjesto da padne na pogrešnom naslovu 20 s kasnije. Reset je i jedina potpuno čista opcija: ponovno otvaranje čuva postojeće korisnike, a spec 51 tvrdi da checklist imenuje **tačno** dva odgođena koraka.
- Dugmad se traže po imenu, ali ime je **kopija**: `install-wizard-submit.ts` prvo pokuša po patternu, a ako ime ne razriješi, klikne vlastito submit dugme forme koraka (`form button[type="submit"]`, budžet 15 s). Prvi živi prolaz je pao baš na tome („Dalje“ nije bilo u patternu), pa `install-wizard-e2e-copy.spec.ts` u frontend paketu pinuje da i bs i en vrijednost svakog naslova i dugmeta odgovara patternima specova.
- `reachStep` u `install-wizard-step-reader.ts` preskače korake koji su već odgovoreni (njihovo stanje živi u stvarnim redovima), pa isti tok radi i na svježoj bazi i na ponovno otvorenoj instalaciji.
- **CI:** posao `e2e-install-wizard` postoji, ali je **inertan** dok ga neko ne pokrene dispatchom sa `install_spec=51|52`; tada se normalni `e2e` posao povlači (njegov `globalSetup` bi završio instalaciju koju wizard upravo hoda), a Preflight pada glasno ako je instalacija već završena ili čarobnjak nije na prvom koraku (`nextStep !== 'profile'`). Ovaj dio plan (`.cursor/plans/install-wizard-v2/07_phase-f6-zavrsetak-testovi.md`) traži kao **odluku vlasnika** — zato je izveden kao dispatch input i čeka potvrdu.

## Dodaci (katalog)

Katalog je `backend/src/modules/settings/addon-catalog.ts` (14 ključeva; samo flagovi koje kod zaista čita).

| Key | Default | Zavisnost |
|---|---|---|
| `email` | off | SMTP enabled |
| `edge` | off | — |
| `csat` | on | — |
| `approvals` | on | — |
| `confidential` | on | — |
| `kbIntercept` | on | — |
| `ticketSplit` | on | — |
| `bulkActions` | on | — |
| `savedViews` | on | — |
| `reports` | on | — |
| `cmdb` | off | — |
| `problems` | off | — |
| `changes` | off | — |
| `teams` | off | — |

Isključen dodatak: API + UI skrivaju/odbijaju feature (`403 ADDON_DISABLED`). Ne brisati podatke.
Od val 5 kataloga nema `sla`, `autoAssign`, `timeTracking` ni `serviceDowntime` — ti su se prekidači prikazivali, a nijedan kod ih nije čitao (SLA se uključuje profilom, auto-assign po servisu, a vrijeme i zastoji imaju svoje settings grupe).

## API

| Ruta | Namjena |
|---|---|
| `GET /install/status` | `isCompleted`, `nextStep`, `steps.<key>.{completed,skipped,required,offered,skippable,blocking}`, `profile` |
| `GET/POST /install/profile` | katalog paketa i izbor paketa (F1) |
| `POST/DELETE /install/steps/:stepKey/skip` | „Podesi kasnije“ i vraćanje u tok (F1) |
| `GET /install/readiness` | `{ isReady, checks: [{ key, status, messageKey }] }` (F1; `profileSteps` nosi i `stepKeys`) |
| `GET/POST /install/identity` | korak identiteta (F2) |
| `GET/POST /install/team` | korak tima — kreiranje naloga i članstvo u grupi (F2) |
| `GET/POST /install/super-admin`, `/install/login-provider`, `/install/smtp`, `/install/addons` | koraci |
| `GET/POST /install/seed` | struktura i prvi servis; `POST` prima **opcioni** body sa nazivima (F2), `GET` vraća i trenutne nazive (`categoryName`, `service.slaProfileKey`) |
| `POST /install/smtp/test` | probna poruka na adresu super admina ili unesenu (F4.1) — `{ isSent, toAddress }` ili `SMTP_TEST_*` |
| `GET /install/blueprints` | katalog predložaka + primijenjeni (F4.2) |
| `POST /install/blueprints/apply` | primjena predloška uz `EXACT` ruting (F4.2) |
| `GET/POST /install/policy-pack` | ponuda i primjena paketa prava (F4.3) |
| `GET/POST /install/sla-review` | pregled i odluka o radnom vremenu/matrici (F4.4) |
| `POST /install/complete` | zaključavanje wizarda uz readiness provjeru (F0.7); poziva ga **samo** ekran `provisioning` (F6.1) |
| `GET /setup-checklist` | šta je ostalo odgođeno + nezadovoljene preporuke (F6.3; sesija + `settingsWrite`) |
| `POST /setup-checklist/dismiss` | sakrij karticu (`private.install.checklistDismissedAt`; stavke ostaju) |

Kontroleri su razdvojeni po namjeni: `install.controller.ts` (koraci prvog pokretanja), `install-steps.controller.ts` (paket, „Podesi kasnije“, readiness), `install-blueprint.controller.ts` (F4.2) i `install-content.controller.ts` (policy pack + SLA pregled, F4.3/F4.4) — svi dijele `InstallWizardLockGuard` i isti `ValidationPipe` (`install-validation.pipe.ts`). SMTP test ima svoj `install-smtp-test.controller.ts` (`POST /install/smtp/test`).

Frontend ima **jedan** izvor statusa: `InstallSetupProvider` (`nextStep`, `steps`, `profile`, `readiness`). Korak koji snimi poziva `reload()` konteksta; ljuska ne pogodi korak i ne učitava status drugi put (F0.3). Greška učitavanja koraka prikazuje `InstallStepLoadError` (poruka + request id + retry) i **ne** prikazuje formu (F0.2) — prazna forma bi snimila zadanu vrijednost preko postojeće konfiguracije.

## Settings ključevi (wizard)

- `private.install.completedAt` (string ISO | empty)
- `private.install.completedByUserId` (string)
- `private.install.profile` (`minimum` | `standard` | `full` | empty; F1)
- `private.install.blueprint` (string; F4.2 — primijenjeni predložak, npr. `itServiceDesk`)
- `private.install.policyPack` (string; F4.3 — primijenjeni paket, npr. `PACK_IT_STANDARD`)
- `private.install.slaReview` (`confirmed` | `adjusted` | empty; F4.4)
- `private.install.checklistDismissedAt` (string ISO | empty; F6.3 — kad je upisan, dashboard ne prikazuje karticu checkliste)
- `private.install.steps.<stepKey>.skipped` (boolean, default false; F1 — `<stepKey>` je konačan skup iz registryja)
  Svi `private.install.*` ključevi čarobnjaka su `readOnly` u registry metadata-i (IN18): Settings ekran ih prikazuje bez editora, uz oznaku „Čarobnjak“ i objašnjenje; API ih i dalje ne zaključava (metadata za UI, ne novo pravilo).
- `private.auth.mode` (`local` | `entra_ad`)
- `private.auth.jwtSigningSecret` (secret; wizard ga generiše na complete ako nedostaje)
- `private.auth.localBreakGlass.enabled` (boolean, default true, nije isključivo iz wizarda)
- `private.smtp.enabled` + SMTP secret polja
- `private.addons.<key>` (boolean) za svaki red u tabeli
- identitet i tim ne uvode nove ključeve: koriste `public.branding.*`, `private.i18n.defaultLocale`, `private.reports.timeZone` (F2.1) i postojeći tok kreiranja korisnika + `GroupMember` (F2.3)

SuperAdmin password **nije** settings secret; ide u `User.passwordHash`.
