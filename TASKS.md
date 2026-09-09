# TASKS — EP-HelpDesk

Pravilo: uvijek radi SAMO stavku označenu `[~] IN PROGRESS`. Kad je gotova, označi `[x]`, commituj, i tek onda otvori NOVI chat/agent session za sljedeću stavku (novi chat = prazan kontekst = jeftinije i preciznije nego guranje sve u jedan dugi razgovor).

## Faza 0 — Setup (radi se ručno / jednim kratkim promptom, ne agent-heavy)
- [ ] Inicijalizuj NestJS + Prisma + MySQL projekat
- [ ] Prekopiraj kompletnu Prisma šemu iz `docs/01-domain-model.md` referenci (schema je već gotova — samo primijeni, ne generiši ponovo)
- [ ] Pokreni prvu migraciju
- [ ] Inicijalizuj Next.js frontend sa ShadCN
- [ ] Postavi .env, git repo, .gitignore

## Faza 1 — Auth & Users
- [ ] AuthModule: MSAL integracija, JWT validacija, AuthGuard
- [ ] UserModule: sync korisnika iz AD (mock AD response dok se ne dobiju pravi Tenant ID/Client ID/Secret)
- [ ] OrganizationalUnitModule: CRUD + tree query helpers
- [ ] RoleGuard + OUAccessGuard

## Faza 2 — Core Ticketing
- [ ] ServiceModule + ServiceCategory (osnovni CRUD)
- [ ] GroupModule (handler timovi + članstvo)
- [ ] TicketModule: create/read/update, statusi (bez routing/assignment automatike)
- [ ] TicketRoutingService — basic mapping (vidi `docs/02-routing-logic.md`)
- [ ] Manuelna dodjela (assignment) preko admin akcije

## Faza 3 — Activity, Time Tracking, KB
- [ ] TicketActivityModule (komentari + audit)
- [ ] TimeTrackingModule (start/stop + backend heartbeat validacija)
- [ ] KnowledgeBaseModule (CRUD + full-text search)
- [ ] KB intercept flow prije kreiranja tiketa (frontend + backend)

## Faza 4 — Notifikacije & Dashboard
- [ ] NotificationModule (email preko O365 + in-app)
- [ ] AuditModule (centralizovan log)
- [ ] Osnovni dashboard (KPI iz `docs/00-mvp-scope.md`)

## Faza 5 — Frontend integracija cijelog MVP-a
- [ ] Login flow (MSAL na frontend-u)
- [ ] Ticket create/list/detail ekrani
- [ ] Admin ekrani (routing rules, grupe, OU)
- [ ] Dashboard ekran

## Faza 6 (Faza 2 iz SRS-a — tek nakon MVP-a, poseban ugovor/sprint)
- [ ] WebSocket real-time chat
- [ ] Edge ekstenzija (vidi `docs/03-edge-extension.md`)
- [ ] Automatska dodjela (Least Busy/Round Robin)

---
**Trenutni status:** još nije početo — postavi prvu stavku Faze 0 na `[~] IN PROGRESS` prije prvog prompta.
