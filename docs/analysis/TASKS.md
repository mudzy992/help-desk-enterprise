# TASKS — Service Desk (enterprise MVP)

Pravilo: uvijek radi SAMO stavku označenu `[~] IN PROGRESS`. Kad je gotova, označi `[x]`, commituj, i tek onda otvori **novi chat** za sljedeću stavku.

Scope: `RAW_PROJECT.md` (IN lista) + `.cursor/docs/00-mvp-scope.md`. `TASKS.md` je raspored, ne smije izbaciti RAW IN stavke.
UI: `Master UI-UX Design Constitution.md`. Frontend stack: React Vite (ne Next.js).

Ukloni `mobile/` u Fazi 0. Infra: `.cursor/docs/05-infra-coolify.md`. `.cursor/docs/01-domain-model.md` je polazni skeč — Prisma šema se **proširuje** na RAW enterprise modele (forme, SLA, confidential, queue, config versions, …).

---



## Faza 0 — Repo + walking skeleton

- [x] Ukloni `mobile/` i sve reference (RAW: nije dio projekta)
- [x] NestJS + Prisma 7 + PostgreSQL; prva migracija (enterprise šema, Coolify `DATABASE_URL`)
- [x] React (Vite) + Tailwind + shadcn; app shell po Constitution + `.cursor/docs/theme.md`
- [x] i18n infrastruktura (BS default, EN fallback)
- [x] Settings registry skeleton (public/private + secret handling)
- [x] Socket.IO gateway skeleton (auth handshake)
- [x] Redis/BullMQ klijent + worker entry (`dist/src/worker.js`); compose servis `worker`
- [x] Root `.env.example` usklađen; bez `.env` u gitu



## Faza 1 — Identitet, OU, RBAC

- [x] Auth provider: `local` | `entra_ad` (isti claims/permission tok, bez `if (test)` u domenu); SuperAdmin uvijek `isLocalOnly`
- [x] OU tree (DN/OU path) + CRUD/tree query; mapiranje korisnika
- [x] AD sync provider stub; dev read `manual_only` (throttle + cache + scope)
- [x] Entra/MSAL kao kasniji provider (isti permission tok)
- [x] Granular permissions + scopes (OU/service) + RoleGuard / OuAccessGuard
- [x] Shadow permission check (preview impact)
- [x] Policy packs (IT / HR / Finance defaults)
- [x] Read-only mode za admin module



## Faza 2 — Katalog, forme, routing

- [x] Service catalog + lifecycle (`DRAFT` / `ACTIVE` / `DEPRECATED`)
- [x] Availability status + downtime scheduling (create ostaje non-blocking)
- [x] Schema-driven forme + form versioning (`formVersionRef` na tiketu)
- [x] Service onboarding wizard (servis → forma → routing → SLA → approvals)
- [x] Routing tabela `(originUnit + service) → group` + parent fallback + unrouted queue + coverage UI
- [x] Ažuriraj `.cursor/docs/02-routing-logic.md` (auto-assign i unrouted su IN)
- [x] Change log (reason + diff) za settings i routing



## Faza 3 — Install wizard (first-run)

Spec: `.cursor/docs/04-install-wizard.md` + matrica `install-wizard`. Nije service onboarding.

- [x] Gate: dok nije `private.install.completedAt` → `/install` i API `503 SETUP_REQUIRED`
- [x] Korak SuperAdmin: uvijek lokalni user (`isLocalOnly`), password hash u User, break-glass login ostaje i uz AD
- [x] Korak prijava: `local` | `entra_ad` (+ AD/Entra polja ako AD)
- [x] Korak SMTP: switch + secret postavke; OFF forsirano gasi email addon
- [x] Korak seed: min 1 OU, 1 fallback grupa, 1 servis + routing na tu grupu
- [x] Korak dodaci: switch katalog (SLA, email, Edge, Teams stub, CSAT, auto-assign, …)
- [x] Zaključavanje wizarda nakon complete; dalje samo Settings. Change log `install_wizard`



## Faza 4 — Ticketing workspace

- [x] Ticket CRUD + state machine guards + impact/urgency → priority
- [x] Group inbox + preuzimanje; auto-assign Least Busy / Round Robin
- [x] Participants + message types + chat/audit + time tracking
- [x] Attachments (MIME/ext allow-list, size, disk) + classification inheritance
- [x] KB CRUD + intercept + feedback ranking + ownership/review cycle
- [x] Frontend: create / list / detail / inbox po Constitution (KB intercept obavezan)



## Faza 5 — Tokovi i governance

- [x] Approvals (1–3 servisa): Pending Approval → approve/reject
- [x] Waiting-for-user automatika + reopen policy
- [x] Ticket split (parent/child) + bulk akcije (bez bulk close) + saved views
- [x] Close codes + smart required fields + PII/secret redaction
- [x] Confidential ACL + break-glass + safe logging
- [x] Anti-loop / anti-spam guardrails
- [x] CSAT + auto-archive closed tickets



## Faza 6 — SLA

- [x] BH kalendari + SLA profili/rules (CRUD + change log)
- [x] Response/resolution timeri, pause (waiting-for-user, pending-approval)
- [x] SLA breach detekcija + escalation događaj (audit/change-log; pause-aware)
- [x] Overdue UI badge/filter
- [x] Seed startnih profila iz RAW (INCIDENT, ACCESS, STANDARD_REQUEST, FINANCE, HR)



## Faza 7 — Notifikacije, realtime, queue

- [x] In-app notifications (list, unread, mark-as-read)
- [x] Email kanal (O365, internal-only) kroz settings + templates
- [x] Socket.IO: ticket/chat, notifications, settings
- [x] Durable integration queue (BullMQ + Redis worker; Postgres job red + DLQ + admin retry)
- [x] Teams stub (feature flag, bez delivery-a)



## Faza 8 — Admin ops i izvještaji

- [x] Config versioning + dry-run/validate + shadow mode + rollback
- [x] Audit export (CSV/JSON) + tamper-evident hash chain
- [x] Support bundle + requestId logging
- [x] Report packs + bottleneck dashboard + pretraga (KB + tickets)
- [x] DR: backup/restore dokument + restore drill checklist
- [x] Frontend admin: routing, SLA, catalog, permissions, queue, config versions



## Install Wizard v2 (iz `.cursor/plans/install-wizard-v2`)

F0–F5 su završeni, commitovani i pushovani (`c5c62da` backend + `28559fc` frontend + `6efc6d4` CI format; vlasnik ih je spojio u `master`), van faza je urađen ops-only rerun (IN21), a **F6 je implementiran** (provisioning ekran, gotov ekran, checklist poslije instalacije, E2E projekat `e2e/install-wizard`) — još **nije commitovan**; detalji i dokazi: `.cursor/plans/install-wizard-v2/HANDOFF.md`. Otvoreno iz nalaza u `audit/frontend/11-install.md`, iz F5 odluke vlasnika 8 i iz F6:

- [x] IN19 (zatvoren): promjena paketa poništava odgodu koraka koje novi paket **traži** (plan prima `previousProfile` → `reopenedStepKeys`); `POST /install/profile` vraća `reopenedSteps`, a ljuska iznad tog koraka pokaže `install.shell.reopened`. Odgoda ostaje moguća — ali kao nova, svjesna odluka.
- [x] IN18 (zatvoren): install ključevi nose `readOnly` metadata, registry lista ih označi „Čarobnjak“, a detalj prikazuje objašnjenje bez editora.
- [x] IN11 (zatvoren): `aria-describedby` na polja s napomenom (lozinka foundera, SMTP, Entra, LDAPS, time zone, logo); povratak na prethodni korak završen u F3.
- [x] IN21 (zatvoren): **Ponovno pokretanje instalacije (ops-only, odluka vlasnika 6)** — dvostruka kapija `INSTALL_ALLOW_RERUN=true` + install token (obavezan i poslije završetka) uz `POST /install/restart` (opciono `includeStepMarkers`) i `npm run cli:install-rerun -- --reason … [--dry-run]`; briše samo zaključavanje (`private.install.completedAt`/`completedByUserId`), a na zahtjev i markere čarobnjaka; upis ide kroz `SettingsService` kao `install_wizard_rerun`, odgovor nosi `clearedKeys` i `nextStep`. Recept: `ops/runbook/ponovno-pokretanje-instalacije.md`. UI nema ni rutu ni dugme — za redovne administratore se ne mijenja ništa.
- [x] IN14 (zatvoren u kodu, mjerenje ostaje): E2E prolaz kroz UI čarobnjaka **je napisan** — `e2e/install-wizard/` (51 Minimum, 52 Standard, vlastiti `globalSetup`, `reachStep` za ponovno otvorenu instalaciju) + CI posao `e2e-install-wizard` (inertan do dispatcha `install_spec=51|52`, normalni `e2e` se tada povlači) —, ali **Lighthouse a11y za `/install` ≥ 95 i sam prolaz 51/52 nisu izmjereni**: sandbox nema Docker, bazu, browser ni živu instalaciju. Mjeri se u okruženju vlasnika/CI (runbook u `e2e/README.md`).
- [ ] **CI za F6 čeka potvrdu vlasnika:** posao je izveden kao `workflow_dispatch` input (`install_spec`), a plan faze traži odluku između toga i zasebnog posla koji diže svjež stack (reset baze). Dok se ne potvrdi, posao ostaje neobavezan i ne dira `CI gate` kao izvor istine o pokrivenosti.
- [ ] IN20 (niska, **potvrđeno otvoreno u F6**): **Test konekcije na zahtjev u čarobnjaku** (inbound „Testiraj konekciju“, direktorij „Testiraj LDAPS“). Domenske funkcije već postoje — `InboundEmailAdminService.testConnection()` (bez aktera) i `DirectoryFullSyncService.testConnection(actorUserId)` — ali su iza sesijske prijave i rola (`POST /inbound-email/test-connection`, `POST /directory-sync/test-connection`), pa ih korak čarobnjaka prije instalacije ne može pozvati bez nove instalacijski-scoped rute ili guarda svjesnog install tokena. F5 zato **nije** dodao ni ruta ni dugme (odluka vlasnika 8); tiket pokriva rutu + dugme u sekcijama `inboundEmail` i `directory` uz isti rate limit kao SMTP test.

---

## Faza 9 — Edge + quality (i dalje prva isporuka)

- [x] Edge Manifest V3: WS + throttled polling, redacted toasts, receipts/dedup
- [x] Quick reply chat (bez attachments) + Request Remote (Quick Assist) + audit
- [~] IN PROGRESS E2E kritični tokovi (RAW acceptance: create, routing/fallback, approvals, confidential, SLA, config)
- [ ] RBAC test suite u CI

---

**Trenutni status:** Faza 9 — E2E kritični tokovi (RAW acceptance: create, routing/fallback, approvals, confidential, SLA, config)
