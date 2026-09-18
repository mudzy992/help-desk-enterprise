# CHANGELOG — ticket-priority-impact-urgency-matrix

## 2026-09-18
- Izvor istine: `PriorityMatrixRule` + admin `GET/PATCH /priority-matrix` (`sla.write`). Ticket create/update/bulk koriste `resolveTicketPriority` (lookup + score fallback). Config-version apply ostaje drugi write put.

## 2026-09-11
- Inicijalna matrica: `score = rank(impact) + rank(urgency)` mapiran na LOW/MEDIUM/HIGH/CRITICAL. Jedna funkcija `calculateTicketPriority`.
