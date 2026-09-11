# CHANGELOG — ticket-chat-audit

## 2026-09-11
- SYSTEM_EVENT poruke za create/claim/assign/participant/time-tracking uz postojeći ChangeLog. Socket join/broadcast na istom auth/scope modelu. Nema TicketActivity niti AuditLog hash-chain.
- Dodat SYSTEM_EVENT za ticket attachment upload/delete; ChangeLog ostaje isti engine (`ticket_attachment`).
- Confidential view/deny/break-glass SYSTEM_EVENT i ChangeLog reason ključevi (`ticket_confidential_*`) bez povjerljivog sadržaja. Detalji: `ticket-confidential-visibility`.
