# CHANGELOG — workflow-state-machine-guards

## 2026-09-11
- `WAITING_FOR_USER` → `CLOSED` za auto-close. PATCH `RESOLVED`/`CLOSED` → `IN_PROGRESS` ide kroz reopen policy (`REOPEN_REQUIRED`).
- Inicijalna matrica dozvoljenih `TicketStatus` tranzicija sa server-side guardovima. Role-based status change (AGENT/ADMIN/SuperAdmin); requester ne smije mijenjati status.
