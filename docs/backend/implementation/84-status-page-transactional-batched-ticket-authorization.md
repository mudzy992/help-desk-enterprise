# W6.11 — Transaction-safe batched ticket authorization za status incident create/link

**Paket:** Val 6 / W6.11  
**Nalaz:** `BA-status-page-12` (P2) — Ticket authorization je N+1 pre-check izvan transakcije i može zastarjeti prije link writea  
**SHA:** `c0865e01cc08c034470f2a457264a924756a45e2`  
**Finalni CI:** `40838417016` (kompletan backend, frontend, integracija, container gate, CI gate — zelen)  
**DB migracije:** nema nove migracije; koristi postojeći `Ticket`, `ServiceIncident`, `TicketIncidentLink` i outbox infrastrukturu.

## Problem

Prije W6.11 autorizacija ticketova za incident create/link/unlink bila je N+1 pre-check izvan transakcije:

- `create` poziva `assertStaffTicket` za svaki ticketId pre `$transaction`, pa write dolazi kasnije — između checka i writa ticket access može biti revokean.
- `linkTicket`/`unlinkTicket` pozivaju `assertStaffTicket` pre zaključavanja incidenta, tako da se authorization odluka može zastarjeti pre locka i writa.
- Svaki ticket poseban query (`loadAccessibleTicket` → `loadTicketRecord` + OU path + confidential facts + staff check), što dodaje latency i race prozor.

## Rešenje

U `backend/src/modules/status-page/status-incidents.service.ts`:

1. **`assertStaffTickets(transaction, ticketIds, actor)`** — novi batch metod koji se izvršava **unutra iste transakcije** koja linkuje ili kreira incident:
   - Jedinstveni deterministic `FOR SHARE` upit nad `Ticket` redovima određenim po ID-ima, sortiran po `id ASC` (jedan upit, bez N+1 petlje).
   - Verifikuje da svi traženi ticketovi postoje; ako nedostaje bilo koji, baca `NotFoundException` (`TICKET_NOT_FOUND`) i cijela transakcija se poništava — ništa se ne commituje.
   - Jedna `accessPolicies.bind(...)` policy snapshot za ceo batch.
   - Paralelna `loadAccessibleTicket` po ticketu unutar transakcije; svaki mora vratiti `visibility === 'staff'`, inače `ForbiddenException` (`INCIDENT_TICKET_FORBIDDEN`).
   - Ticket IDs se dedupliciraju i sortiraju, tako je poretak deterministički i mrtve zaključavanja se izbija.

2. **`linkTicket` / `unlinkTicket`** — `assertStaffTicket` pre-check uklonjen izvan transakcije; unutar transakcije, nakon per-incident advisory locka (`pg_advisory_xact_lock`), poziva `assertStaffTickets(transaction, [ticketId], actor)` pre bilo kojeg link writea/system eventa/audita.

3. **`create`** — cap 100 ticketova ostaje; ticket autorizacija se sada računa unutar transakcije nakon incident locka, preko istog batch puta.

Staro `assertStaffTicket(ticketId, actor)` više se ne poziva iz servicea (zadrženo je za backward kompatibilnost testova koji ga mockuju, ali production putovi ga ne koriste).

## Idempotnost i bezbednost

- Batch je atomic: ili svi ticketovi prolaze autorizaciju i link/write se commituje, ili ništa.
- `FOR SHARE` sprečava paralelno brisanje/izmenu ticketa između autorizacije i commita.
- Deterministički sortirani ID-ji sprečavaju deadlock-e između paralelnih incident create/link za isti skup ticketova.
- Postojeći `ticket_incident_link` unique constraint i `insertSystemTicketEvent` `(ticketId, idempotencyKey)` upsert štite od duplikata pri retryu.

## Testni dokazi

### Unit — `status-incidents.service.spec.ts`

- `locks and evaluates a ticket batch with one policy snapshot`: `prisma.\$queryRaw` pozvan jednom; `accessPolicies.bind` jednom; `loadAccessibleTicket` dvapretima za `['ticket-a', 'ticket-b']` bez obzira na ulazni poretak `['ticket-b', 'ticket-a', 'ticket-a']`.
- `link`/`unlink` conceal foreign incident before ticket authorization: `assertStaffTickets` očekuje transakciju i niz ticket IDs, a ne samog ticket ID-a.
- `create`/`resolve` ne pozivaju `assertStaffTickets` za prazan niz.

### Integracija — `status-page.integration.spec.ts` (stvarno PostgreSQL)

- `locks and authorizes a ticket batch inside the incident-create transaction`: create sa nepostojećim ticketom baca 404 i broj incidenta se ne menja; create sa validnim jednim ticketom kreira incident i `TicketIncidentLink`.

## Traceability

- `docs/backend/audits/29-status-page.md`: `BA-status-page-12` označeno `zatvoreno`; sekcija 9 ažurirana na batch transactional autorizaciju; closeout u „Implementacijski closeout — W6.11”.
- `docs/backend/BACKEND-FINDINGS-REGISTER.md`: red 29/BA-status-page-12 `zatvoreno`; kontrolni zbir **598 otvorenih / 94 zatvorena / 692 ukupno**.
- `docs/backend/backend-findings-plan.json`: `BA-status-page-12` status `zatvoreno`.
- `docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md`: W6.11 završen na SHA `c0865e0`, CI `40838417016`; sljedeći paket (W6.12) bira se iz `BA-status-page-13`/`-14`/`-15` nakon analize.

## Sljedeći paket (planirano, W6.12)

Jedan od preostalih status-page P2 nalaza: `BA-status-page-13` (public rate limit zavisi od trust-proxy/IP i Redis fail-open), `BA-status-page-14` (process-local public cache bez invalidation i multi-instance koherencije) ili `BA-status-page-15` (retention/anonymization nisu formalizovani). Konačan izbor se potvrđuje nakon W6.11 closeouta.
