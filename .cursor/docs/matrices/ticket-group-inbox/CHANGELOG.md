# CHANGELOG — ticket-group-inbox

## 2026-09-11
- Group inbox (`GET /tickets/inbox`), claim/take-over (`POST /tickets/:ticketId/claim`) i server-side auto-assign Least Busy / Round Robin. Eligible agenti su samo scoped članovi handler grupe. Nema eligible agenta → tiket ostaje u inboxu. Routing engine nije diran.
