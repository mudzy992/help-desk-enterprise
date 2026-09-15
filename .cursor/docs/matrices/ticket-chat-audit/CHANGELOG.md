# CHANGELOG — ticket-chat-audit

## 2026-09-15
- `ticket.updated` fan-out na `user:` / `group:` roomove (isti slim payload). Ticket room join na detailu ostaje.

## 2026-09-14
- F9-2: `ticket_remote_requested` SYSTEM_EVENT (staff-only u threadu; requester dobija `remote.requested` notifikaciju).

## 2026-09-13
- `ticket.updated` slim payload uz postojeći `ticket.message.created` (status/assignment/SLA/approval). Internal notes i confidential akcije ostaju staff-only.
- `ticket_resolved` / `ticket_closed` SYSTEM_EVENT na status transition (inbox konzumer: `in-app-notifications`).

## 2026-09-11
- SYSTEM_EVENT poruke za create/claim/assign/participant/time-tracking uz postojeći ChangeLog. Socket join/broadcast na istom auth/scope modelu. Nema TicketActivity niti AuditLog hash-chain.
- Dodat SYSTEM_EVENT za ticket attachment upload/delete; ChangeLog ostaje isti engine (`ticket_attachment`).
- Confidential view/deny/break-glass SYSTEM_EVENT i ChangeLog reason ključevi (`ticket_confidential_*`) bez povjerljivog sadržaja. Detalji: `ticket-confidential-visibility`.
