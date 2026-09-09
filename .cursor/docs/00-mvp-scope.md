# MVP Scope — EP-HelpDesk

Svrha ovog fajla: agent (i vi) uvijek znate šta JE, a šta NIJE dio trenutne isporuke. Ako nešto nije ovdje, ne pravi se — bez obzira šta piše u punom SRS-u.

## MVP UKLJUČUJE (Faza 1)
- Auth: SSO preko Azure AD (MSAL), sync korisnika (ime, email, Company, Department)
- OrganizationalUnit: self-referencing tree, CRUD (samo SuperAdmin)
- Group (handler timovi) + članstvo
- Ticket: kreiranje, statusi (Pending → Closed), manualna dodjela
- Ticket routing: basic mapping (originUnit + service → group), BEZ rule-engine-a (samo direktna RoutingRule tabela)
- TicketActivity: komentari + audit trail statusa
- Time Tracking: start/stop + backend heartbeat validacija
- Knowledge Base: CRUD članaka + KB intercept prije kreiranja tiketa (full-text search, BEZ AI/semantic search)
- Notifikacije: email (O365) + in-app, BEZ Edge ekstenzije u prvoj iteraciji
- Osnovni dashboard: broj tiketa po OU, prosječno vrijeme rješavanja
- RBAC: USER / AGENT / ADMIN / SUPER_ADMIN + OU izolacija

## FAZA 2 (nakon MVP-a, posebna grana/task)
- Edge ekstenzija (notifikacije + Quick Assist remote pristup)
- Automatska dodjela (Least Busy / Round Robin)
- WebSocket real-time chat (MVP može raditi na polling-u)

## EKSPLICITNO VAN OPSEGA (ne dirati dok se posebno ne zatraži)
Sve iz SRS poglavlja 10 (buduće nadogradnje): AI klasifikacija tiketa, semantic/vector KB pretraga, SLA management engine, advanced rule-based routing engine, workforce optimization, ITIL incident/problem management, custom report builder, Teams integracija, ERP/HR integracije.

> Agent: ako zadatak koji dobiješ implicira nešto iz "van opsega" liste, stani i pitaj — ne implementiraj "za svaki slučaj".
