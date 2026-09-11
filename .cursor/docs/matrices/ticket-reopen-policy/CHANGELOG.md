# CHANGELOG — ticket-reopen-policy

## 2026-09-11
- `POST /tickets/:id/reopen`: unutar `windowDays` (default 7) isti tiket → `IN_PROGRESS`; nakon prozora novi tiket sa `reopenedFromTicketId`. PATCH shortcut iz `RESOLVED`/`CLOSED` u `IN_PROGRESS` je `REOPEN_REQUIRED`.
