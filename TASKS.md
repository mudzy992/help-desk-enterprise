# TASKS — EP-HelpDesk (enterprise MVP)

Pravilo: uvijek radi SAMO stavku označenu `[~] IN PROGRESS`. Kad je gotova, označi `[x]`, commituj, i tek onda otvori **novi chat** za sljedeću stavku.

Scope: `RAW_PROJECT_EPHELPDESK.md` (IN lista) + `.cursor/docs/00-mvp-scope.md`. `TASKS.md` je raspored, ne smije izbaciti RAW IN stavke.
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
- [ ] Korak prijava: `local` | `entra_ad` (+ AD/Entra polja ako AD)
- [ ] Korak SMTP: switch + secret postavke; OFF forsirano gasi email addon
- [ ] Korak seed: min 1 OU, 1 fallback grupa, 1 servis + routing na tu grupu
- [ ] Korak dodaci: switch katalog (SLA, email, Edge, Teams stub, CSAT, auto-assign, …)
- [ ] Zaključavanje wizarda nakon complete; dalje samo Settings. Change log `install_wizard`

## Faza 4 — Ticketing workspace
- [ ] Ticket CRUD + state machine guards + impact/urgency → priority
- [ ] Group inbox + preuzimanje; auto-assign Least Busy / Round Robin
- [ ] Participants + message types + chat/audit + time tracking
- [ ] Attachments (MIME/ext allow-list, size, disk) + classification inheritance
- [ ] KB CRUD + intercept + feedback ranking + ownership/review cycle
- [ ] Frontend: create / list / detail / inbox po Constitution (KB intercept obavezan)

## Faza 5 — Tokovi i governance
- [ ] Approvals (1–3 servisa): Pending Approval → approve/reject
- [ ] Waiting-for-user automatika + reopen policy
- [ ] Ticket split (parent/child) + bulk akcije (bez bulk close) + saved views
- [ ] Close codes + smart required fields + PII/secret redaction
- [ ] Confidential ACL + break-glass + safe logging
- [ ] Anti-loop / anti-spam guardrails
- [ ] CSAT + auto-archive closed tickets

## Faza 6 — SLA
- [ ] BH kalendari + SLA profili/rules (CRUD + change log)
- [ ] Response/resolution timeri, pause (waiting-for-user, pending-approval)
- [ ] Overdue + in-app eskalacije; UI badge/filter
- [ ] Seed startnih profila iz RAW (INCIDENT, ACCESS, STANDARD_REQUEST, FINANCE, HR)

## Faza 7 — Notifikacije, realtime, queue
- [ ] In-app notifications (list, unread, mark-as-read)
- [ ] Email kanal (O365, internal-only) kroz settings + templates
- [ ] Socket.IO: ticket/chat, notifications, settings
- [ ] Durable integration queue (BullMQ + Redis worker; Postgres job red + DLQ + admin retry)
- [ ] Teams stub (feature flag, bez delivery-a)

## Faza 8 — Admin ops i izvještaji
- [ ] Config versioning + dry-run/validate + shadow mode + rollback
- [ ] Audit export (CSV/JSON) + tamper-evident hash chain
- [ ] Support bundle + requestId logging
- [ ] Report packs + bottleneck dashboard + pretraga (KB + tickets)
- [ ] DR: backup/restore dokument + restore drill checklist
- [ ] Frontend admin: routing, SLA, catalog, permissions, queue, config versions

## Faza 9 — Edge + quality (i dalje prva isporuka)
- [ ] Edge Manifest V3: WS + throttled polling, redacted toasts, receipts/dedup
- [ ] Quick reply chat (bez attachments) + Request Remote (Quick Assist) + audit
- [ ] E2E kritični tokovi (RAW acceptance: create, routing/fallback, approvals, confidential, SLA, config)
- [ ] RBAC test suite u CI

---

**Trenutni status:** Faza 2 — `.cursor/docs/02-routing-logic.md` ažuriran (auto-assign i unrouted su IN). Sljedeće: Change log (reason + diff) za settings i routing.
