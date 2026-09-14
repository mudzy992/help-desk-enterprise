# EP-HelpDesk — Implementacioni promptovi: Faza 7 (ostatak) → Faza 9

Generisano na osnovu `TASKS.md` (stavke od "Durable integration queue" u Fazi 7, do kraja Faze 9) i unakrsno provjereno naspram stvarnog stanja repozitorija (Prisma šema, backend `src/modules/**`, `.cursor/docs/`, `.cursor/rules/`, `RAW_PROJECT_EPHELPDESK.md`).

Ovo je NASTAVAK `fe-alignment-prompts.md` dokumenta, ali potpuno ODVOJEN opseg: taj dokument pokriva vizuelno poravnanje frontend-a (FE-0…FE-9 task ID-jevi); ovaj dokument pokriva preostale FUNKCIONALNE backend/infra/ops/edge/testing stavke iz `TASKS.md`. Ne miješaj ih — različiti su task ID prefiksi (`F7-`/`F8-`/`F9-` ovdje, `FE-` u drugom dokumentu) namjerno, da se ne pobrkaju u istoj sesiji.

## Bitna otkrića iz repo audita (koja svaki prompt ispod već uzima u obzir)

- Prisma modeli `IntegrationJob` i `ConfigVersion` (i hash-chain polja na `AuditLog`) **VEĆ POSTOJE** u `backend/prisma/schema/ops.prisma` — šema je unaprijed pripremljena, ali **nijedan servis/modul ih još ne koristi** (nula referenci u `backend/src`). Taskovi ispod grade servisni sloj na postojećoj šemi, ne prave novu.
- `AuditLog` model ima `previousHash`/`hash`/`requestId` polja, ali je trenutno **potpuno neiskorišten** — nema nijednog writer-a u kodu. F8-2/F8-3 to prvi put aktiviraju.
- Backend **nema** globalni `ExceptionFilter` implementiran (iako ga `backend.mdc` propisuje) — F8-3 ga mora kreirati ili potvrditi drugačiji pristup.
- Repo **nema** `.github/workflows/` niti bilo kakav CI config — F9-4 prvi put uspostavlja CI pipeline.
- Repo **nema** E2E test framework (ni Playwright ni Cypress) — F9-3 prvi put uvodi jedan (za razliku od frontend vizuelnog QA plana gdje je uvođenje takvog frameworka bilo eksplicitno zabranjeno — različit kontekst, različito pravilo).
- `edge-extension/` folder (ili slično) **ne postoji** — F9-1/F9-2 su potpuno nov client projekat.
- `.cursor/docs/matrices/` **nema** `example_feature` template fajl koji `code-hygiene-and-matrices.mdc` spominje — svi promptovi ispod umjesto toga upućuju na `redis-bullmq` matricu kao strukturni uzor.

## Kako koristiti ovaj dokument

1. Za **svaki task otvori NOVU agent sesiju**.
2. U `TASKS.md` označi odgovarajuću stavku sa `[~] IN PROGRESS` (repo konvencija — "uvijek radi SAMO stavku označenu `[~] IN PROGRESS`").
3. Kopiraj cijeli sadržaj code bloka ispod tog taska kao prvu poruku.
4. Pregledaj predloženi plan, potvrdi, tek onda "Go" / "Kreni".
5. Kad agent završi: provjeriš rezultat (build + testovi + manualna provjera po Verification sekciji), označiš `[x]` u `TASKS.md`, commituješ.
6. Pređi na sljedeći task — **ne preskači redoslijed**, dependency-ji su navedeni u svakom promptu.

## Redoslijed izvođenja

```
Faza 7 (ostatak):
  F7-A Durable integration queue (BullMQ + Redis worker + Postgres job red + DLQ + admin retry)
  → F7-B Teams stub (feature flag, bez delivery-a)

Faza 8:
  → F8-1 Config versioning + dry-run/validate + shadow mode + rollback
  → F8-2 Audit export (CSV/JSON) + tamper-evident hash chain
  → F8-3 Support bundle + requestId logging
  → F8-4 Report packs + bottleneck dashboard + pretraga (KB + tickets)
  → F8-5 DR: backup/restore dokument + restore drill checklist
  → F8-6 Frontend admin: routing, SLA, catalog, permissions, queue, config versions

Faza 9:
  → F9-1 Edge Manifest V3: WS + throttled polling, redacted toasts, receipts/dedup
  → F9-2 Quick reply chat (bez attachments) + Request Remote (Quick Assist) + audit
  → F9-3 E2E kritični tokovi
  → F9-4 RBAC test suite u CI
```

Napomena o redoslijedu: F8-5 (DR dokument) i F8-6 (frontend admin) mogu teoretski ići paralelno u odvojenim sesijama nakon F8-1..F8-4, ali F8-6 striktno zavisi od F7-A i F8-1 (backend API mora postojati). F9-3 (E2E) i F9-4 (RBAC CI) oboje diraju CI konfiguraciju — preporuka je raditi F9-3 prije F9-4 da se izbjegne konflikt u istom workflow fajlu (napomenuto i u F9-4 promptu).

## Model / trošak (isti princip kao za FE promptove)

- **Auto mode** → F7-B (Teams stub, mali), F8-5 (DR dokument, uglavnom tekst).
- **Ručno biran frontier model** → F7-A (queue + retry logika), F8-1 (config versioning/validate/shadow — kompleksna poslovna logika), F8-2 (hash chain — greška je bezbjednosno osjetljiva), F9-1/F9-2 (nov client projekat, auth-osjetljivo), F9-3 (veliki E2E task), F9-4 (RBAC — bezbjednosno kritično).

---

## F7-A — Durable integration queue (BullMQ + Redis worker; Postgres job red + DLQ + admin retry)

_TASKS.md faza: Faza 7_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Durable integration queue (BullMQ + Redis worker; Postgres job red + DLQ + admin retry)" (Faza 7).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije ~163-169, ~545-554, ~952-953, ~1041; `.cursor/docs/05-infra-coolify.md`; `.cursor/docs/matrices/redis-bullmq/MATRIX.md` (postojeći infra sloj — REUSE `RedisModule`/BullMQ `forRoot`, ne pravi paralelni Redis klijent).
3. Dependency (mora već biti gotovo prije ovog taska): Faza 0 stavka "Redis/BullMQ klijent + worker entry" (VEĆ [x]); Faza 7 stavke "Email kanal" i "Socket.IO" (VEĆ [x], jer edge eventi idu preko postojećih WS kanala nakon što ih queue isporuči).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Implementirati stvarnu obradu poslova (email + edge eventi) preko VEĆ POSTOJEĆE Redis/BullMQ infrastrukture, sa Postgres job redom kao admin/audit slojem.

Scope (radi SAMO ovo, ništa više):
- Prisma model `IntegrationJob` VEĆ POSTOJI u `backend/prisma/schema/ops.prisma` (polja: `type: IntegrationJobType`, `status: IntegrationJobStatus`, `payload Json`, `lastError`, `attempts`, `nextRetryAt`). Enumi `IntegrationJobType` (`EMAIL` / `EDGE_EVENT` / `TEAMS_STUB`) i `IntegrationJobStatus` (`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` / `DLQ`) VEĆ POSTOJE u `enums.prisma`. NE mijenjaj šemu osim ako implementacija otkrije da stvarno nedostaje polje — u tom slučaju prvo objasni zašto pa predloži migraciju.
- Novi backend modul (npr. `src/modules/integration-queue/`): `enqueue` servis (upisuje `IntegrationJob` PENDING + BullMQ add), BullMQ `Processor`/`Worker` handler za `EMAIL` i `EDGE_EVENT` tipove (TEAMS_STUB je NAMJERNO izvan scope-a ovog taska — zaseban task "Teams stub"). Retry/backoff politika iz settings ključeva ispod. Nakon `deadLetterAfterAttempts` pokušaja, status ide na `DLQ`.
- Worker proces (`src/worker.ts`, `src/worker.module.ts`) trenutno je minimalan (samo `RedisModule` + keep-alive timer, bez procesora) — proširi ga da registruje novi queue processor. Ne diraj shutdown (`SIGINT`/`SIGTERM`) ponašanje opisano u `.cursor/docs/matrices/redis-bullmq/MATRIX.md`, samo ga proširi da ugasi i novi worker/processor.
- Settings registry: novi definicijski fajl (npr. `src/modules/settings/definitions/integration-queue-settings.ts`, prati postojeći pattern iz npr. `notification-email-settings.ts`) za ključeve: `private.integrations.queue.enabled` (bool, default true), `private.integrations.queue.typesCsv` (string, default `email,edge,teams`), `private.integrations.queue.maxAttempts` (number, default 10), `private.integrations.queue.initialBackoffSeconds` (default 60), `private.integrations.queue.maxBackoffSeconds` (default 3600), `private.integrations.queue.deadLetterAfterAttempts` (default 10), `private.integrations.queue.deadLetterRetentionDays` (default 30), `private.integrations.queue.workerPollSeconds` (default 5), `private.integrations.queue.adminUiEnabled` (bool, default true).
- Konvertovati postojeće SLANJE emaila (`src/modules/notifications/email/fan-out-email-notifications.ts` i povezani fan-out) da umjesto direktnog SMTP poziva EMITUJE `IntegrationJob` (enqueue), a worker procesor stvarno šalje mail koristeći postojeći `mail-transport.ts`/`smtp-mail-transport.ts`. API request NE smije čekati slanje (enqueue pa nastavi — RAW zahtjev).
- Backend admin API (bez frontend-a u ovom tasku): `GET` lista jobova filtrirana po statusu (PENDING/FAILED/DLQ), `POST :id/retry` koji failed/DLQ job vraća na PENDING i re-enqueue-uje u BullMQ. Permission-gated (novi permission ključ, npr. `integrations.queue.manage` — dodaj u postojeći RBAC permission katalog istim obrascem kao ostali permission ključevi).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Postojeće slanje emaila mora nastaviti raditi (samo mijenja put — sada ide kroz queue, ne smije se ukloniti funkcionalnost). Worker shutdown handling iz `redis-bullmq` matrice mora ostati ispravan. Ne diraj `RedisModule`/`create-redis-client.ts`/`create-bullmq-root-configuration.ts` osim ako je stvarno potrebno dodati queue-specifičnu konfiguraciju.

Acceptance criteria:
Enqueue kreira `IntegrationJob` PENDING zapis; worker ga obradi → `COMPLETED`. Simulirana greška → retry sa backoff-om do `maxAttempts`/`deadLetterAfterAttempts`, zatim `DLQ`. Admin retry-now na DLQ jobu ga vraća u obradu. API poziv koji triggeruje email (npr. novi tiket) vraća response bez čekanja na stvarno slanje maila.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/integrations-durable-queue/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: VAŽNO: Frontend admin ekran za pregled queue-a (PENDING/FAILED/DLQ + retry dugme) NIJE dio ovog taska — to je zaseban task u Fazi 8 ("Frontend admin: routing, SLA, catalog, permissions, queue, config versions"). Ovaj task pravi SAMO backend + API. TEAMS_STUB procesor je NAMJERNO izostavljen — pokriven je sljedećim taskom "Teams stub".

Verifikacija (prije nego kažeš da je task gotov):
Backend unit testovi za enqueue/retry/backoff logiku (Jest, `backend/`) + `npm run test` + `npm run build` u `backend/`. Manualna provjera: worker log pokazuje job COMPLETED/DLQ tranzicije.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F7-B — Teams stub (feature flag, bez delivery-a)

_TASKS.md faza: Faza 7_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Teams stub (feature flag, bez delivery-a)" (Faza 7).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 163-164, 363, 542-544, 833-834, 966-967.
3. Dependency (mora već biti gotovo prije ovog taska): F7-A (durable queue mora postojati — Teams stub jobovi prolaze kroz isti queue/worker mehanizam).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Interni event/webhook interfejs za Teams, iza feature flag-a, BEZ stvarne isporuke (nema pravog HTTP poziva ka Teams webhook-u).

Scope (radi SAMO ovo, ništa više):
- Settings definicijski fajl (npr. `teams-integration-settings.ts`): `private.integrations.teams.stubEnabled` (bool, default false), `private.integrations.teams.webhookUrl` (secret string, prazno), `private.integrations.teams.eventTypesCsv` (string, default prazno).
- `TeamsIntegrationService` (ili slično): kad je `stubEnabled=true` i event tip je u `eventTypesCsv`, kreira `IntegrationJob` sa `type: TEAMS_STUB` (enum VEĆ postoji) preko istog enqueue servisa iz F7-A. Worker procesor za `TEAMS_STUB` samo LOGUJE "would send to Teams" (uz job payload metadata) i označava job kao `COMPLETED` — **NIKAKAV** stvarni HTTP poziv ka `webhookUrl` se ne implementira u ovom tasku.
- Definiraj listu internih event tipova koji bi teoretski išli ka Teams (npr. isti skup kao email template-i: "new ticket", "assigned", "new message", "resolved/closed") — samo kao interfejs/tip, ne kao stvarnu integraciju.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne implementirati stvarni Teams webhook poziv — to je eksplicitno RAW OUT ("Teams integracija: puni konektor/production rollout") do daljnjeg.

Acceptance criteria:
Kad je flag isključen (default), nijedan Teams job se ne kreira. Kad je uključen, event kreira `IntegrationJob type=TEAMS_STUB` koji završava `COMPLETED` bez ijednog izlaznog HTTP poziva u kodu.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/integrations-teams-stub/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Verifikacija (prije nego kažeš da je task gotov):
Unit test da worker procesor za `TEAMS_STUB` ne poziva nikakav HTTP klijent + `npm run test`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-1 — Config versioning + dry-run/validate + shadow mode + rollback

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Config versioning + dry-run/validate + shadow mode + rollback" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 263-280, 649-654, 871, 1001-1003, 1093-1094.
3. Dependency (mora već biti gotovo prije ovog taska): Settings registry (Faza 0, [x]); routing (Faza 2, [x]); SLA (Faza 6, [x]); service forms/catalog (Faza 2, [x]); change log modul za settings/routing (Faza 2, [x], REUSE, ne duplirati diff logiku).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Grupisati promjene settings/routing/SLA/service forms/catalog u "config version" zapise sa diff-om, release notes, dry-run validacijom prije aktivacije, opcionalnim shadow mode poređenjem i auditovanim rollback-om.

Scope (radi SAMO ovo, ništa više):
- Prisma model `ConfigVersion` VEĆ POSTOJI (`backend/prisma/schema/ops.prisma`): `version`, `status: ConfigVersionStatus` (`DRAFT` / `VALIDATED` / `SHADOW` / `ACTIVE` / `ROLLED_BACK` — enum VEĆ postoji), `snapshot Json`, `releaseNotes`, `createdByUserId`, `activatedAt`. NE mijenjaj šemu bez razloga.
- Novi backend modul (npr. `src/modules/config-versioning/`):
  - `create` — snimi trenutni snapshot (settings + routing rules + SLA profili/pravila + service forms + catalog stanje) kao novi `ConfigVersion` DRAFT + `releaseNotes`.
  - `diff` — poredi dva snapshot-a (reuse `change-log` modul: `build-deterministic-diff.ts` / `build-change-log-diff.ts` VEĆ postoje i rade generičke JSON diffove — NE piši novi diff algoritam od nule).
  - `validate` (dry-run, BEZ side-effect-a) — provjerava: routing coverage + fallback pravila (reuse postojeći `routing` modul coverage servis), SLA rules completeness (reuse `sla` modul), service forms schema validacija (reuse `service-catalog`/forms versioning), permissions/settings sanity. Vraća listu grešaka; ako ima grešaka, aktivacija se ne smije dozvoliti.
  - `activate` — samo ako `validate` prođe; mijenja status na `ACTIVE`, prethodna `ACTIVE` verzija arhivirana; upisuje u `AuditLog`/change-log (reason obavezan).
  - `rollback` — vraća prethodnu `ACTIVE` verziju; permission-gated; audit + change log.
  - `shadow` (opciono po `private.configVersioning.shadowMode.enabled`) — izračunaj nova routing/SLA pravila "u pozadini" za NOVE tikete bez primjene, vrati diff (koliko tiketa bi otišlo drugoj grupi, koliko SLA promjena) — ovo je READ-ONLY izračun, ne smije mijenjati stvarno stanje.
- Settings definicijski fajl: `private.configVersioning.enabled` (default true), `private.configVersioning.allowRollback` (default true), `private.configVersioning.validation.enabled` (default true), `private.configVersioning.shadowMode.enabled` (default true).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne diraj postojeću routing/SLA/catalog/forms poslovnu logiku — ovaj task samo ČITA njihovo stanje za snapshot/validate/shadow, ne mijenja je direktno (osim kroz postojeće servise pri rollback-u).

Acceptance criteria:
Aktivacija je blokirana i vraća listu grešaka kad validacija padne. Rollback kreira novu auditovanu verziju koja referencira prethodni snapshot. Shadow mode vraća diff brojke bez ikakve promjene aktivnog stanja.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/config-versioning-rollback/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Frontend UI za config versions (lista/diff/rollback) NIJE dio ovog taska — to je dio kasnijeg taska "Frontend admin: routing, SLA, catalog, permissions, queue, config versions". Ovaj task je backend-only. Napomena: validacija i shadow mode su odvojene RAW stavke (`config-validation-dry-run` slug) — ako ti se čini prirodnije, možeš voditi dvije matrice (`config-versioning-rollback` + `config-validation-dry-run`); u tom slučaju kreiraj oba foldera.

Verifikacija (prije nego kažeš da je task gotov):
Backend unit testovi za validate/diff/rollback logiku + `npm run test` + `npm run build`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-2 — Audit export (CSV/JSON) + tamper-evident hash chain

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Audit export (CSV/JSON) + tamper-evident hash chain" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 241-243, 601-604, 988-989; `security.mdc` ("Svaka akcija koja mijenja stanje... mora ostaviti trag u AuditLog").
3. Dependency (mora već biti gotovo prije ovog taska): Postojeći `change-log` modul (`build-deterministic-diff.ts`, `canonicalize-json.ts`) za reuse hash/diff pomoćnih funkcija ako je primjenjivo.. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Export audit zapisa (CSV/JSON) sa OU scoping-om; svaki audit zapis nosi hash prethodnog zapisa radi tamper-evident provjere.

Scope (radi SAMO ovo, ništa više):
- Prisma model `AuditLog` VEĆ POSTOJI (`backend/prisma/schema/ops.prisma`) i VEĆ IMA `previousHash`/`hash`/`requestId` polja — ali je TRENUTNO POTPUNO NEISKORIŠTEN u kodu (nula referenci u `backend/src`). Prije bilo čega, PROVJERI da li postoji neki alternativni mehanizam audit trail-a (npr. da li `change-log` modul pokriva dio ovoga za settings/routing) — ako pokriva DIO, ovaj task se fokusira na generalni security audit trail (permission promjene, confidential pristup/break-glass, bulk akcije, exports) koji change-log NE pokriva.
- Novi backend modul (npr. `src/modules/audit-log/`):
  - `recordAuditEntry(action, entityType, entityId, metadata, actorUserId, requestId)` — servis koji računa `hash = sha256(previousHash + canonical(entry))` (algoritam iz settings ključa) i upisuje zapis. Prati postojeći `canonicalize-json.ts` iz `change-log` modula ako je primjenjivo (REUSE, ne duplirati).
  - Kablovi/pozivi ovog servisa na MINIMALAN skup akcija eksplicitno traženih u RAW-u za RBAC test suite (role→permissions promjene, confidential pristup/break-glass, bulk akcije, exports) — NE pokušavaj retrofit-ovati svaki postojeći endpoint u repo-u u ovom tasku, to je prevelik scope. Navedi eksplicitno u sažetku šta JE pokriveno a šta NIJE.
  - Export endpoint: CSV + JSON, sa OU scoping-om (isti pattern access-control kao ostali OU-scoped exporti), permission `audit.export`.
  - Opcioni verify endpoint/util koji prati hash lanac i javlja prvi mismatch (za "tamper-evident provjeru" iz RAW-a).
- Settings definicijski fajl: `private.audit.export.enabled` (default true), `private.audit.tamperEvident.enabled` (default true), `private.audit.tamperEvident.hashAlgorithm` (default `sha256`).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne diraj change-log modul logiku za settings/routing (ta funkcionalnost ostaje kako jeste) — ovo je DODATNI, generalni sigurnosni trail, ne zamjena.

Acceptance criteria:
Export vraća stabilno poredanu CSV/JSON listu sa ispravnim OU scoping-om; hash lanac je verifikabilan (namjerno pokvaren zapis se detektuje).

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/audit-tamper-evident-export/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: OTVORENO PITANJE za plan prije koda: pošto `AuditLog` trenutno NEMA nijednog writer-a u cijelom repou, obim "koje sve akcije pišu u AuditLog" je odluka koju treba eksplicitno predložiti u planu (bullet listi) i sačekati moju potvrdu prije implementacije — ne nagađaj sam koji je "pravi" opseg.

Verifikacija (prije nego kažeš da je task gotov):
Backend unit testovi za hash chain računanje + export OU scoping + `npm run test`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-3 — Support bundle + requestId logging

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Support bundle + requestId logging" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 718-721, 948-950, 1076; `backend.mdc` (error format).
3. Dependency (mora već biti gotovo prije ovog taska): F8-2 (audit export) treba postojati prije nego support bundle može uključiti audit export dio; F8-1 (config versioning) korisno je za snapshot reuse (nije striktan blocker — ako F8-1 nije gotov, koristi direktan settings read za snapshot).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Korelacioni requestId kroz sve logove i error response-e; "support bundle" export (config snapshot + audit export + recent logs) dostupan SuperAdmin-u.

Scope (radi SAMO ovo, ništa više):
- RequestId middleware/interceptor (NestJS) koji generiše/prosljeđuje `requestId` po HTTP requestu (i po Socket.IO konekciji ako je razumno) i ubacuje ga u: (a) svaki log red, (b) svaki error response. `backend.mdc` propisuje standardni error format `{ code, message, details }` kroz globalni `ExceptionFilter` — PROVJERI da li taj filter uopšte postoji (trenutno NEMA `ExceptionFilter` implementacije u repou, nula pogodaka); ako ne postoji, ovaj task ga mora kreirati (dodaj `requestId` u `details` ili poseban header, po tvom nahođenju — predloži u planu prije koda).
- Support bundle servis: generiše arhivu (zip) koja sadrži, prema settings flagovima: config snapshot (trenutni settings/registry stanje — reuse iz F8-1 snapshot logike ako već postoji), audit export (reuse F8-2), recent logs (zadnjih N minuta, gdje N = `recentLogsMinutes`). Endpoint dostupan SAMO SuperAdmin permisiji.
- Settings definicijski fajl: `private.observability.auditRetentionDays`, `private.observability.requestLogRetentionDays`, `private.observability.supportBundle.enabled` (default true), `private.observability.supportBundle.includeConfigSnapshot` (default true), `private.observability.supportBundle.includeRecentLogs` (default true), `private.observability.supportBundle.includeAuditExport` (default true), `private.observability.supportBundle.recentLogsMinutes` (default 60).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne mijenjaj postojeći format grešaka koji frontend već konzumira (`ApiErrorText` komponenta iz FE alignment plana čita `requestId` iz grešaka) — DODAJ requestId, ne mijenjaj postojeća polja.

Acceptance criteria:
Svaki log red i error response nosi isti `requestId` unutar jednog requesta. Support bundle produkuje preuzimljiv zip sa tačno onim dijelovima koje settings flagovi dozvoljavaju.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/observability-support-bundle/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera: jedan HTTP poziv → isti requestId u logu i u error response-u ako padne. Support bundle download test.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-4 — Report packs + bottleneck dashboard + pretraga (KB + tickets)

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Report packs + bottleneck dashboard + pretraga (KB + tickets)" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 264-283 (report packs, bottleneck dashboard), 1006-1007, 1024-1026 (search UX); `.cursor/docs/frontend-reference-alignment-plan.md` FE-4.2 (postojeća client-side aggregacija koju je moguće zamijeniti server-side agregacijom).
3. Dependency (mora već biti gotovo prije ovog taska): Ticket domain (Faza 4/5/6, [x]), close codes (Faza 5, [x]), KB (Faza 4, [x]).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Predefinisani izvještaji sa OU scoping-om (Monthly KPI, Overdue by service, Top close codes, KB helpfulness); bottleneck dashboard agregacije; osnovna pretraga kroz KB + tikete.

Scope (radi SAMO ovo, ništa više):
- Backend report pack servis/endpointi: minimalno "Monthly KPI", "Overdue by service", "Top close codes", "KB helpfulness" — svaki vraća CSV/JSON, OU scoped, permission `reports.export`/`audit.export`.
- Bottleneck dashboard agregacioni endpoint: broj tiketa po `PENDING_APPROVAL` / `WAITING_FOR_USER` / `UNROUTED` / `OVERDUE`, breakdown po OU / service / priority, trend kroz vrijeme (reuse postojeća ticket query polja — `status`, `assignedGroupId`, `serviceId`, `createdAt`, `isOverdue`, isti izvor podataka koji frontend alignment plan (FE-4.2) već koristi client-side; sada ide server-side agregacija umjesto client-side).
- Search endpoint: kombinovana pretraga KB + tiketi sa filterima (OU/service/status/assignee/priority) — provjeri prvo da li `listTickets`/`listKnowledgeArticles` već imaju dovoljno filter parametara da frontend sastavi ovo client-side (FE alignment plan FE-1.3 pretpostavlja upravo to); ako filteri postoje, ovaj task može biti samo osiguravanje da su svi potrebni filter parametri dostupni na postojećim listing endpointima, umjesto potpuno novog "unified search" endpointa. Odluku predloži u planu prije koda.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne diraj postojeće `listTickets`/`listKnowledgeArticles` ugovore na način koji bi pokvario frontend koji ih već koristi (FE-2/FE-3/FE-5 iz alignment plana) — samo DODAJ nove agregacione endpointe ili proširi filter parametre, ne mijenjaj postojeće response oblike.

Acceptance criteria:
Report pack endpointi vraćaju tačne, OU-scoped CSV/JSON podatke. Bottleneck dashboard endpoint vraća agregacije po statusu/OU/service/priority sa trendom. Search endpoint/filteri rade preko oba entiteta (KB + tiketi).

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/report-packs-bottleneck-search/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Ovaj task konačno gradi PRAVI backend za izvještaje koje je `frontend-reference-alignment-plan.md` (FE-4) privremeno radio client-side (jer backend nije postojao) i za koji je export dugme bilo namjerno disabled (FE-4.3). Frontend povezivanje na ove nove endpointe NIJE dio ovog taska — to ide kroz zaseban frontend task (izvan trenutnog scope-a), ne diraj postojeći `/reports` frontend u ovom tasku.

Verifikacija (prije nego kažeš da je task gotov):
Backend unit testovi za agregacione upite + OU scoping + `npm run test`.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-5 — DR: backup/restore dokument + restore drill checklist

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "DR: backup/restore dokument + restore drill checklist" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 849-860; `ops/COOLIFY.md`; `.cursor/docs/05-infra-coolify.md`.
3. Dependency (mora već biti gotovo prije ovog taska): F8-1 (config versioning) — opciono, za reuse snapshot mehanizma; nije striktan blocker za sam dokument.. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Operativna dokumentacija za disaster recovery: backup politika, retention, i mjesečni restore drill checklist. RPO ≤ 24h, RTO ≤ 4h.

Scope (radi SAMO ovo, ništa više):
- Ovo je PRVENSTVENO dokumentacioni task (ne aplikacijski kod), po uzoru na postojeći `ops/COOLIFY.md`. Kreiraj (ili proširi) `ops/DR.md`:
  - RPO ≤ 24h, RTO ≤ 4h ciljevi
  - Backup politika: PostgreSQL daily backup + retention (Coolify Database resurs — reference `.cursor/docs/05-infra-coolify.md`), uploads dir daily backup + retention, config exports (settings/routing/SLA/forms) kao dio backup-a
  - Restore drill checklist (min. 1x mjesečno): koraci restore-a na dev/prod-like okruženju + verifikacija: login, create ticket, download attachmenta, audit export
- Ako `config exports` dio zahtijeva backend podršku (export settings/routing/SLA/forms u jedan snapshot fajl radi backup-a), provjeri prvo da li F8-1 (config versioning) već ima `snapshot` mehanizam koji se može ponovo iskoristiti (isti `ConfigVersion.snapshot` Json) — ako da, samo dokumentuj kako ga operator koristi za backup, NE piši duplirani export mehanizam. Ako F8-1 nije gotov, minimalni CLI skript ili admin endpoint koji izvuče trenutni settings/routing/SLA/forms snapshot je prihvatljiv, ali drži ga malim.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne mijenjaj `ops/COOLIFY.md` operativne odluke (Traefik zabranjen, itd.) — samo dodaj DR sekciju/fajl koji je konzistentan s njima.

Acceptance criteria:
`ops/DR.md` postoji i sadrži sve četiri tražene stavke (RPO/RTO, backup politika za sve tri kategorije podataka, restore drill checklist sa 4 verifikaciona koraka).

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Ovaj task nema svoju matricu (vidi napomenu ispod) — ne kreiraj prazan matrix folder bez razloga.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Ovaj task NEMA matricu (`.cursor/docs/matrices/...`) jer nije aplikaciona logika nego operativni runbook — ne kreiraj matrix folder za njega osim ako dodaš stvarni config-export kod, u kom slučaju matrica prati taj kod (npr. `config-export-snapshot`).

Verifikacija (prije nego kažeš da je task gotov):
Manualni pregled dokumenta naspram RAW zahtjeva (linije 849-860).

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F8-6 — Frontend admin: routing, SLA, catalog, permissions, queue, config versions

_TASKS.md faza: Faza 8_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Frontend admin: routing, SLA, catalog, permissions, queue, config versions" (Faza 8).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 1038, 1041, 975; `.cursor/docs/frontend-reference-alignment-plan.md` (za postojeći frontend routing/SLA/catalog admin — NE duplirati).
3. Dependency (mora već biti gotovo prije ovog taska): F7-A (queue backend + admin retry API) i F8-1 (config versioning backend) MORAJU biti gotovi prije ovog taska — bez njih nema šta zvati.. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Nove admin frontend površine za funkcionalnost koja tek sada dobija backend: durable queue pregled/retry, config versions (diff/rollback), i permission editor (role→permissions) sa shadow preview.

Scope (radi SAMO ovo, ništa više):
- Queue admin ekran: lista `IntegrationJob` po statusu (PENDING/FAILED/DLQ), dugme "Retry now" na DLQ/FAILED redovima. Koristi backend API iz F7-A.
- Config versions admin ekran: lista verzija (DRAFT/VALIDATED/SHADOW/ACTIVE/ROLLED_BACK), diff prikaz između verzija, dugme "Rollback" (sa obaveznim reason poljem), status validacije (lista grešaka ako dry-run padne). Koristi backend API iz F8-1.
- Permission editor: role→permissions mapping UI sa shadow permission preview (backend `Shadow permission check` je VEĆ implementiran u Fazi 1 — provjeri da li već postoji bilo kakav frontend hook/klijent za njega prije nego praviš novi; ako ne postoji, ovaj task ga dodaje).
- Routing/SLA/Catalog admin: OVE povr šine VEĆ POSTOJE funkcionalno (Faza 2/6, [x]) i njihov VIZUELNI polish je pokriven zasebnim planom (`.cursor/docs/frontend-reference-alignment-plan.md`, taskovi FE-5.x/FE-6.x) — NE PONAVLJAJ taj rad ovdje. Ovaj task dodaje SAMO ono što ni backend Faze 2/6 ni FE-5/FE-6 plan ne pokrivaju (npr. ako se pri F8-1 implementaciji otkrije da routing/SLA admin treba dodatnu akciju specifičnu za config versioning tok — npr. "uključi u config version" — to ide ovdje).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne diraj vizuelni sistem uspostavljen kroz `frontend-reference-alignment-plan.md` (Badge/Button/Card/Progress primitive-i, tokeni) — novi ekrani koriste ISTE shared primitive-e, ne izmišljaju novi stil.

Acceptance criteria:
SuperAdmin može vidjeti queue jobove po statusu i triggerovati retry. Može vidjeti config versions, diff, i rollback-ovati uz reason. Permission editor prikazuje shadow preview prije primjene promjene.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Ovaj task nema svoju matricu (vidi napomenu ispod) — ne kreiraj prazan matrix folder bez razloga.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Ovaj task NIJE nastavak `frontend-reference-alignment-plan.md` FE-* niza — to je poseban plan za drugačiji sloj funkcionalnosti (queue/config versions/permissions) koji uopšte nije bio predmet tog dokumenta. Ne miješaj FE-* task ID-jeve sa ovim taskom.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera svakog ekrana + relevantni Vitest testovi.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F9-1 — Edge Manifest V3: WS + throttled polling, redacted toasts, receipts/dedup

_TASKS.md faza: Faza 9_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Edge Manifest V3: WS + throttled polling, redacted toasts, receipts/dedup" (Faza 9).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 161-162, 309-345 (Manifest V3 komponente, delivery/pouzdanost, event kanali, enterprise hardening), 693-711 (settings ključevi), 829 (`edge-extension-client` slug); `.cursor/docs/03-edge-extension.md`; `.cursor/docs/matrices/websocket-gateway/MATRIX.md`.
3. Dependency (mora već biti gotovo prije ovog taska): F7-A (durable queue — edge eventi se isporučuju kroz queue prema RAW-u); websocket-gateway (Faza 0/7, [x], REUSE, ne pravi novi gateway).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Novi browser extension klijent (Manifest V3) — background service worker koji drži WS konekciju (sa throttled polling fallback-om), prikazuje redigovane (bez sadržaja) OS notifikacije, i šalje delivered/opened receipts nazad backend-u. BEZ quick reply/remote UI-a u ovom tasku (to je F9-2).

Scope (radi SAMO ovo, ništa više):
- PROVJERI PRVO: extension kod TRENUTNO NE POSTOJI nigdje u repou (nema `edge-extension/` foldera ni sličnog). Ovo je potpuno nov, zaseban client projekat — predloži strukturu (npr. root `edge-extension/` sa `manifest.json`, `background.ts`, `popup/`) u planu prije koda.
- Background service worker: WS connect/reconnect na isti `user:{userId}` kanal koji VEĆ POSTOJI (`.cursor/docs/matrices/websocket-gateway/MATRIX.md` — REUSE postojeći handshake ugovor, `handshake.auth.token`, ne izmišljaj novi auth mehanizam). Token u memoriji, NIKAD u `localStorage`.
- Throttled polling fallback ako WS padne: `private.edgeExtension.pollingFallback.intervalSeconds` (default 90), interval 60-120s po RAW-u, SAMO za unread notifs/messages.
- OS toast notifikacije: `private.edgeExtension.notifications.redactedPreviews` (default true) — prikazuje SAMO tip eventa + ticketId (+ opciono service name), NIKAD sadržaj poruke/tiketa.
- Event dedup po `eventId` (svaki WS event ima `eventId` + `createdAt` — provjeri da li backend eventi VEĆ nose `eventId`; ako ne, to je mali backend dodatak potreban za ovaj task, ne veliki refactor).
- Delivered/opened receipts: extension šalje backend-u potvrdu prijema/otvaranja notifikacije (audit/troubleshooting) — potreban je mali novi backend endpoint ako ne postoji.
- Minimalan popup UI shell (samo da postoji mjesto za toast "Open in Desk" link) — PUNI popup (mini inbox + quick reply) je F9-2, ne ovaj task.
- Kill switch: `private.edgeExtension.killSwitchEnabled` (default true) — provjeri backend flag prije uspostave konekcije; ako je isključen, extension se ne konektuje.
- Feature flag i dozvoljeni domen: `private.edgeExtension.enabled` (default true), `private.edgeExtension.allowedEmailDomain` (default `epbih.ba`).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne pravi novi WS gateway ili novi auth mehanizam — extension je "još jedan klijent na istim kanalima" po `websocket.mdc` ("Edge ekstenzija se tretira kao još jedan klijent na istim kanalima — nema posebne logike za nju na backendu").

Acceptance criteria:
Extension se konektuje na WS, prima evente, prikazuje redigovanu notifikaciju (bez sadržaja), šalje delivered/opened receipt. Ako WS padne, prelazi na throttled polling. Duplikat eventa (isti `eventId`) se ne prikazuje dvaput.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/edge-extension-client/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Ovo je VELIK, novi client projekat — predloži plan-first pristup (`.cursor/rules/plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/` folder) prije pisanja koda i sačekaj potvrdu strukture.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera u browseru (učitaj unpacked extension) + backend unit testovi za receipt endpoint ako je dodan.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F9-2 — Quick reply chat (bez attachments) + Request Remote (Quick Assist) + audit

_TASKS.md faza: Faza 9_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "Quick reply chat (bez attachments) + Request Remote (Quick Assist) + audit" (Faza 9).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 161-162, 311-345, 693-711, 830 (`edge-extension-chat-remote-contract`), 961-965.
3. Dependency (mora već biti gotovo prije ovog taska): F9-1 (extension background/WS konekcija mora već postojati); F7-A (remote eventi idu kroz durable queue).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Puni popup UI extension-a: mini inbox + quick reply (tekst, bez attachmenta) + "Request Remote" flow koji otvara `ms-quick-assist:` protokol uz audit acknowledge i rate limit.

Scope (radi SAMO ovo, ništa više):
- Popup UI: mini inbox (lista otvorenih tiketa korisnika iz WS/poll podataka) + quick reply textarea koji šalje poruku preko postojećeg ticket message send API-ja (permission `ticket.message.send`) + "Open in Desk" link na `desk.epbih.ba`. Extension end-user NIKAD ne smije prikazati `INTERNAL_NOTE` tip poruke (isto pravilo kao web frontend).
- Remote request flow: backend endpoint/event koji inicira "Request Remote" (RAW ne precizira da li agent ili user inicira — provjeri/potvrdi u planu prije implementacije); extension prikazuje toast + dugme "Open Quick Assist"; klik okida `ms-quick-assist:` protokol handler i šalje audit event "acknowledged/opened" nazad backend-u (permission `ticket.remote.open_quick_assist`).
- Rate limit: `private.edgeExtension.remote.rateLimitMinutesPerTicket` (default 10) — anti-spam po tiketu, backend-enforced.
- `private.edgeExtension.remote.requireUserClickToOpenQuickAssist` (default true) — `ms-quick-assist:` se NIKAD ne okida automatski, samo na eksplicitan klik korisnika.
- `private.edgeExtension.remote.auditAcknowledge` (default true) — svaki klik/ack ide u audit trail (reuse F8-2 audit modul ako je gotov, inače minimalni audit zapis).
- `private.edgeExtension.chat.enabled` (default true), `private.edgeExtension.chat.maxMessagesPerTicket` (default 50), `private.edgeExtension.attachments.enabled` (default **false** u MVP-u — NE implementirati attachment upload u extension chatu).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Attachments u extension chatu OSTAJU isključeni (feature flag default false) — ne implementiraj upload UI čak i ako bi bilo lako dodati.

Acceptance criteria:
Quick reply šalje pravu poruku vidljivu i u web app-u (isti ticket thread). Remote dugme se pojavljuje SAMO nakon stvarnog servera-side eventa, klik otvara `ms-quick-assist:` i upisuje audit ack. Drugi klik unutar rate-limit prozora je odbijen.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Ovaj task nema svoju matricu (vidi napomenu ispod) — ne kreiraj prazan matrix folder bez razloga.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Matrica za ovaj task je ISTA kao F9-1 (`edge-extension-client`) PLUS `edge-extension-chat-remote-contract` slug iz RAW-a — kreiraj/dopuni `.cursor/docs/matrices/edge-extension-chat-remote-contract/` zasebno jer RAW eksplicitno navodi to kao poseban slug.

Verifikacija (prije nego kažeš da je task gotov):
Manualna provjera end-to-end (extension → backend → web app thread) + backend testovi za rate limit.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F9-3 — E2E kritični tokovi (RAW acceptance: create, routing/fallback, approvals, confidential, SLA, config)

_TASKS.md faza: Faza 9_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "E2E kritični tokovi (RAW acceptance: create, routing/fallback, approvals, confidential, SLA, config)" (Faza 9).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 861-875; `.cursor/rules/plan-first.mdc`.
3. Dependency (mora već biti gotovo prije ovog taska): Praktično SVI prethodni Faza 0-8 taskovi moraju biti funkcionalno gotovi (test #9 direktno zavisi od F8-1 config versioning; test #4 zavisi od F7-A durable queue).. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): End-to-end testna pokrivenost devet kritičnih tokova iz RAW acceptance liste, u dev (i po mogućnosti CI) okruženju.

Scope (radi SAMO ovo, ništa više):
- PROVJERI PRVO: repo TRENUTNO NEMA nijedan E2E test framework (ni Playwright ni Cypress; `frontend-reference-alignment-plan.md` eksplicitno potvrđuje njihovo odsustvo za vizuelni QA, a `frontend/package.json`/`backend/package.json` scripts potvrđuju samo Jest/Vitest jedinične testove). Uvođenje E2E frameworka JE u opsegu ovog taska (za razliku od vizuelnog QA plana gdje je bilo eksplicitno zabranjeno) — predloži izbor (npr. Playwright, jer testira i frontend i backend end-to-end kroz pravi browser) u planu i sačekaj potvrdu prije instalacije bilo čega.
- Testni tokovi koje MORAŠ pokriti (RAW linije 861-874), svaki kao zaseban E2E test/suite:
  1. Ticket create: service catalog → form validation → KB intercept → create ticket → group inbox
  2. Routing/fallback: match routing rule, unrouted queue fallback
  3. Approvals: pending approval → approve/reject → nastavak routing/assignment
  4. Realtime/Notifications: in-app notifs + email (internal-only) + edge event ide kroz durable queue (F7-A)
  5. Bulk broadcast (structured): required fields enforced + preview + rate limit
  6. Confidential: ne vidi se u listama/pretrazi bez prava; break-glass audit
  7. SLA: timers + pause rules + overdue badge/filter
  8. Close codes + CSAT: resolve requires close code; CSAT prompt i KPI agregacije
  9. Config ops: activate config version → validate (dry-run) → shadow mode diff → rollback (F8-1)
- Organizuj testove u novi `e2e/` folder (root ili `backend/e2e` + `frontend/e2e`, po tvom predlogu u planu) sa jasnim README kako se pokreću lokalno.

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne pretvaraj postojeće Jest/Vitest unit testove u E2E — ovo je novi, dodatni sloj testiranja, ne zamjena.

Acceptance criteria:
Svih 9 tokova ima barem jedan prolazeći E2E test u dev okruženju; test suite je dokumentovan (kako se pokreće).

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/quality-e2e-critical-flows/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: OVAJ TASK JE VELIK (9 tokova, novi framework). Obavezno prvo Plan mode sa fazama (`.cursor/rules/plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/` sa `00_overview.md`, `01_phase-*.md`, `CHECKLIST.md`, `HANDOFF.md`) — ne pokušavaj sve u jednoj implementaciji bez plana.

Verifikacija (prije nego kažeš da je task gotov):
Pokretanje cijelog E2E suite-a lokalno; provjeri da li CI runner postoji (repo trenutno nema `.github/workflows/` ni drugi CI config) — ako ne postoji, CI integracija ide u F9-4 (RBAC test suite u CI) gdje se CI pipeline prvi put uspostavlja, ne duplirati taj rad ovdje.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---

## F9-4 — RBAC test suite u CI

_TASKS.md faza: Faza 9_

Kopiraj sve ispod (unutar code bloka) kao prvu poruku u NOVOJ agent sesiji.

```
Radimo isključivo na TASKS.md stavci "RBAC test suite u CI" (Faza 9).
U TASKS.md označi ovu stavku sa `[~] IN PROGRESS` prije nego počneš (ako već nije). NE diraj druge stavke/faze, ne implementiraj druge module, ne radi refactor van dolje navedenog scope-a, čak i ako primijetiš druge nedostatke u kodu.

Prije pisanja koda:
1. Pročitaj `.cursor/rules/00-core.mdc` (uvijek aktivan) i relevantna pravila po sloju koji diraš (`backend.mdc`, `database.mdc`, `websocket.mdc`, `security.mdc`, `design-settings-realtime-notifications.mdc`, `frontend.mdc` / `frontend-ui-ux.mdc` po potrebi).
2. Pročitaj: `RAW_PROJECT_EPHELPDESK.md` linije 225-239 (RBAC test suite obavezno — detaljna lista), 599; `security.mdc`; postojeći `authorization` modul (Faza 1, [x]).
3. Dependency (mora već biti gotovo prije ovog taska): Permission sistem (Faza 1, [x]), confidential ACL (Faza 5, [x]), bulk akcije (Faza 5, [x]). Export OU scoping testovi su jači ako F8-2/F8-4 već postoje, ali nisu striktan blocker.. Ako nešto od ovoga NIJE implementirano, stani i javi mi prije nego što nastaviš.
4. Napravi usko pretraživanje repoa (grep/симbol search) da provjeriš stvarno trenutno stanje koda prije nego pretpostaviš bilo šta — ne nagađaj (`token-efficiency.mdc`).
5. Predloži kratak plan implementacije (bullet lista, fazno ako je task velik — `plan-first.mdc`: >3 faze → `.cursor/plans/<slug>/`); sačekaj moju potvrdu prije koda.

Cilj (Goal): Automatizovani testovi za role→permissions mapping, permission scopes (OU/service), confidential ACL + break-glass, bulk akcije (OU/group scoping, bez bulk close), exports (OU scoping) — dio repozitorija i CI pipeline-a.

Scope (radi SAMO ovo, ništa više):
- PROVJERI PRVO: repo TRENUTNO NEMA `.github/workflows/` niti drugi CI config fajl — CI pipeline ne postoji uopšte. Ovaj task ga prvi put uspostavlja (npr. GitHub Actions: `.github/workflows/ci.yml` koji pokreće `backend` Jest + `frontend` Vitest + build, PLUS novi RBAC test suite).
- Backend RBAC test suite (Jest, `backend/`), organizovan npr. pod `backend/test/rbac/` ili `src/modules/authorization/**/*.rbac.spec.ts`, pokriva TAČNO pet oblasti iz RAW-a:
  1. role→permissions mapping
  2. permission scopes (OU/service)
  3. confidential per-ticket ACL + break-glass pravila
  4. bulk akcije (OU/group scoping, bez bulk close)
  5. exports (OU scoping — koristi F8-2/F8-4 export endpointe ako su gotovi; ako nisu, testiraj postojeće OU-scoped listing endpointe kao privremeni supstitut i eksplicitno napomeni šta nedostaje)
- Settings ključ: `private.quality.rbacTestSuite.enabled` (default true) — ako je relevantno za uslovno pokretanje testova, ali test suite kod postoji nezavisno od ovog flaga (flag je runtime feature flag za produkciju, ne za CI test execution).

Šta MORAŠ sačuvati (Preserve) — ne smije regresirati:
Ne mijenjaj postojeću permission/authorization poslovnu logiku da bi testovi "prošli" — ako test otkrije stvarni bug u postojećoj OU/permission logici, prijavi ga eksplicitno umjesto tihog zaobilaženja u testu.

Acceptance criteria:
Svih 5 RBAC oblasti ima test pokrivenost; CI pipeline (novi) pokreće cijeli test suite (backend + frontend + RBAC) na push/PR i vidljivo javlja pass/fail.

Opšta pravila iz repozitorija (obavezno poštovati):
- Prisma se poziva SAMO iz service/repository sloja, nikad iz controllera. Guard-ovi (Auth/Role/OUAccess) su obavezni na svakom novom endpointu. Svaki side-effect (notifikacija, audit, websocket) ide kroz event, ne direktan poziv (`backend.mdc`).
- Fajlovi ciljano ~100-150 linija; bez dead code-a; ponavljajuću logiku ekstrahuj u helpers (`code-hygiene-and-matrices.mdc`).
- Za ovu funkcionalnost održavaj matricu u `.cursor/docs/matrices/rbac-test-suite-ci/` (`MATRIX.md` + `CHANGELOG.md`). Repo nema `example_feature` template fajl (nije pronađen) — koristi strukturu postojeće `.cursor/docs/matrices/redis-bullmq/MATRIX.md` kao format-referencu. Promjena logike ⇒ update MATRIX.md + upis u CHANGELOG.md.
- Nema izmišljenih/mock/hardcoded podataka gdje god postoji stvarni API/state. Nema "brzo i prljavo" rješenja niti TODO-ova bez tiketa u TASKS.md.
- Ako zadatak implicira RAW OUT stavku (AI/semantička pretraga, advanced routing engine, puni Teams konektor, mobilna app) — stani i pitaj, ne implementiraj.

Napomena specifična za ovaj task: Ako F9-3 (E2E) i ovaj task rade na CI istovremeno u paraleli u odvojenim sesijama, može doći do konflikta u istom `.github/workflows/` fajlu — preporuka: uradi F9-3 prvo (jer taj task po planu dolazi ranije u nizu), pa ovaj task DOPUNI isti CI fajl umjesto da ga prepiše od nule.

Verifikacija (prije nego kažeš da je task gotov):
CI zeleni run na test grani/PR-u.

Na kraju:
- Daj mi kratak sažetak šta je promijenjeno (lista fajlova) i eksplicitno navedi šta NISI radio jer je van scope-a ovog taska.
- Predloži git commit poruku (obavezno po `00-core.mdc`).
- NE označavaj `[x]` u TASKS.md — to ja radim ručno nakon provjere i commita.
```

---
## Nakon svih F7/F8/F9 taskova

Kad Faza 7-9 iz `TASKS.md` bude kompletna, projekat dostiže puni RAW IN scope prve isporuke (`RAW_PROJECT_EPHELPDESK.md` MVP constraints lista). U tom trenutku vrijedi ponovo proći kroz `.cursor/docs/frontend-reference-alignment-plan.md` §12 "Definition of Done (global)" kao finalnu provjeru, i kroz F9-3 E2E suite kao regresioni test cijelog sistema prije produkcijskog deploya (`.cursor/docs/05-infra-coolify.md`).
