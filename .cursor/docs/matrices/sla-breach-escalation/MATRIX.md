# MATRIX — sla-breach-escalation

## Cilj
Automatska detekcija Response/Resolution SLA breach-a i escalation događaj kad timer istekne. Reuses Task 2 `TicketSlaState` + pause/resume + BH due, plus postojeći `SlaEscalationRule` na profilu. Nije UI badge/filter niti seed profila.

## Detekcija
Interval scan (`scanned`) i postojeći ticket eventi zovu isti `syncTicketSlaTimers`. Effective clock je `pausedAt ?? now`. `WAITING_FOR_USER` / `PENDING_APPROVAL` pauza sprečava novi breach dok sat stoji. `isResponseBreached` / `isResolutionBreached` su sticky.

## Eskalacija
Ako je `private.ticket.sla.escalationsEnabled` (default true): za svaki istekli sat se pali jednom, key `response|resolution:<ruleId>` u `firedEscalationKeys`. Postojeća `SlaEscalationRule.triggerOffsetMinutes` je BH offset od due (0 = u trenutku isteka). Nema rule-a → implicitni `default` offset 0. In-app zapis je `SYSTEM_EVENT` na tiketu; email/Notification inbox nisu ovaj task.

## Audit
`ChangeLog` entity `ticket_sla_state`: `sla_response_breached` / `sla_resolution_breached` / `sla_response_escalated` / `sla_resolution_escalated`. Actor je sistem (`null`). Diff snima breach flagove i targetGroupId.

## Namjerno NIJE
UI badge/filter, T-minus upozorenja, email eskalacije, seed INCIDENT/ACCESS/… profila.
