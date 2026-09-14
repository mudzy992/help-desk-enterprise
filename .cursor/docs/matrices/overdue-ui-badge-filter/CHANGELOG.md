# CHANGELOG — overdue-ui-badge-filter

## 2026-09-14
- Ticket GET/list/inbox response izlaže postojeći `TicketSlaState` snapshot (`responseDueAt`, `resolutionDueAt`, pause, breach, completion) uz `isOverdue`.

## 2026-09-12
- Ticket list/get/inbox izlaže `isOverdue` iz postojećih `TicketSlaState` breach flagova.
- Ticket lista: `Overdue` badge (danger token) i filter koji radi s postojećim search/filterima i saved views.
