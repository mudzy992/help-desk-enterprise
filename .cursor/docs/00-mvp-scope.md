# MVP Scope — EP-HelpDesk (enterprise, prva isporuka)

Source of truth za **šta ulazi u prvu isporuku**: `RAW_PROJECT_EPHELPDESK.md` (sekcija *MVP constraints*).
Ovaj fajl je operativni sažetak. Ako je u konfliktu s RAW IN/OUT listom, **pobjeđuje RAW**.

UI/UX: `Master UI-UX Design Constitution.md` + `.cursor/docs/theme.md`.
Raspored rada: `TASKS.md` (ne sužava scope).

First-run: **install wizard** (`.cursor/docs/04-install-wizard.md`) — obavezan prije rada. SuperAdmin je uvijek lokalni nalog (break-glass), čak i kad je prijava AD.
Auth: wizard bira `local` | `entra_ad`; isti permission tok, bez `if (test)` grana u domenu.

Frontend: React (Vite) + Tailwind + shadcn/Radix — ne Next.js, osim ako se eksplicitno prebaci.
Infra: PostgreSQL + Coolify + Redis/BullMQ worker (`.cursor/docs/05-infra-coolify.md`). Env katalog: `.env.example`.

---

## PRVA ISPORUKA (RAW IN)

Sve dolje je dio prvog release-a. Edge, WebSocket chat i auto-assign **nisu** “nakon MVP-a”.

### Install wizard (first-run)
- Jednokratni setup: SuperAdmin (lokalni), način prijave, SMTP, seed grupa/servisa/OU, uključivanje dodataka
- Gate dok nije završen; nije isto što service onboarding wizard

### Identitet i pristup
- Prijava `local` ili `entra_ad` (wizard + settings); AD sync `manual_only` u dev-u
- OU tree (DN / OU path kao source-of-truth)
- Granular RBAC + permission scopes (OU/service) + shadow permission check
- Policy packs (default IT / HR / Finance)
- Read-only mode za admin module (ticket create ostaje dozvoljen)

### Katalog i routing
- Service catalog + lifecycle (`DRAFT` / `ACTIVE` / `DEPRECATED`)
- Schema-driven forme + form versioning
- Service availability + downtime scheduling (non-blocking za create)
- Service onboarding wizard
- DB routing `(origin OU + service) → handler grupa` + fallback / unrouted queue + coverage
- Change log (reason + diff) za settings i routing
- Auto-assign (Least Busy / Round Robin) uz ručno preuzimanje

### Ticketing
- Group inbox (grupa vlasnik, agent preuzima)
- Statusi: Pending, Assigned, In Progress, Waiting for User, Resolved, Closed
- Priority iz impact/urgency matrice (`Low`…`Critical`)
- Participants + chat message types + audit
- Attachments (allow-list MIME/ext, max size, disk path) + classification inheritance
- KB intercept + feedback ranking + ownership/review cycle
- Approvals (1–3 osjetljiva servisa)
- Waiting-for-user automatika + reopen policy
- Ticket split, bulk akcije (OU/group scoped, **bez bulk close**), saved views
- Confidential tickets + break-glass + safe logging
- State machine guards, close codes, smart required fields, PII/secret redaction
- CSAT, time tracking, data lifecycle (auto-archive closed)

### SLA, notifikacije, ops
- SLA engine (BH kalendari, profili, pause, overdue, in-app eskalacije)
- In-app notifikacije + email (O365, internal-only) kroz settings
- Socket.IO: ticket/chat, notifications, settings, remote request
- Durable integration queue: BullMQ/Redis + Postgres job red za admin UI; Teams **samo stub**
- Config versioning + dry-run/validate + shadow mode + rollback
- Audit export (tamper-evident hash chain) + support bundle
- Report packs, bottleneck dashboard, pretraga (KB + tickets)
- Observability minimum + disaster recovery (backup/restore)
- i18n: BS default + EN fallback
- E2E kritični tokovi + RBAC test suite (CI)
- Edge ekstenzija: WS + throttled polling, redacted toasts, quick reply, Quick Assist remote

---

## VAN PRVE ISPORUKE (RAW OUT)

Ne implementirati dok se eksplicitno ne zatraži:

- AI (semantička pretraga, klasifikacija, chatbot), SLA predikcija
- Advanced routing engine (rule-engine iznad tabele + fallback)
- Teams: puni konektor / production rollout (stub ostaje IN)
- Mobilna aplikacija (nije dio ovog projekta)
- Workforce optimization, puni ITIL problem management, custom report builder, ERP/HR integracije

> Agent: ako zadatak implicira OUT stavku, stani i pitaj. Ne sužavaj IN listu “da bi bilo brže”.
