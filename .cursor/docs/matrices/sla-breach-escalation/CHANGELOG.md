# CHANGELOG — sla-breach-escalation

## 2026-09-13
- SLA `SYSTEM_EVENT` sada hrani in-app inbox (`in-app-notifications`); email i dalje nije ovaj task.

## 2026-09-12
- Automatski scan Response/Resolution breach-a na postojećem `TicketSlaState`, sticky flagovi, pause-aware clock, escalation kroz `SlaEscalationRule` + change log / SYSTEM_EVENT. Reuses Task 2 timer/pause sloj.
