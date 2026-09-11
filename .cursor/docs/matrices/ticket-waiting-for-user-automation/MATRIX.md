# MATRIX — ticket-waiting-for-user-automation

## Cilj
Kad agent zatraži informacije, tiket ide u `WAITING_FOR_USER`. Settings-driven reminder i auto-close. Javni `USER_REPLY` vraća tiket u `IN_PROGRESS`. Interna napomena ne resetuje čekanje.

## Ulaz
Agent/admin/SuperAdmin PATCH status u `WAITING_FOR_USER` iz `ASSIGNED` ili `IN_PROGRESS` (postojeći state machine). Persistira `waitingForUserEnteredAt`, čisti reminder, `SYSTEM_EVENT` + ChangeLog.

## Automatika (`private.ticket.waitingForUser.*`)
| Setting | Default |
|---|---|
| `enabled` | `true` |
| `reminderAfterDays` | `2` |
| `autoCloseAfterDays` | `7` |

Prozori su 24h periodi od `waitingForUserEnteredAt`. Nisu BH/SLA kalendari.

| Akcija | Uslov | Efekat |
|---|---|---|
| none | disabled, ili unutar X dana | bez promjene |
| remind | ≥ X dana, reminder nije poslan, još nije Y | `waitingForUserReminderSentAt`, `SYSTEM_EVENT`, ChangeLog `ticket_waiting_for_user_reminder` |
| auto-close | ≥ Y dana | `CLOSED` + `closedAt`/`resolvedAt`, `SYSTEM_EVENT`, ChangeLog `ticket_waiting_for_user_auto_close` |

Ako su oba prozora dospjela, auto-close pobjeđuje. Sweep: `WaitingForUserAutomationService` interval 15 min na API procesu. Nije BullMQ job (Faza 7).

## Reply resume
`USER_REPLY` dok je `WAITING_FOR_USER` i `enabled=true` ⇒ `IN_PROGRESS`, čisti waiting timestampove. `INTERNAL_NOTE` / `AGENT_REPLY` ne diraju status. Ako je `enabled=false`, status ostaje `WAITING_FOR_USER` (nema reminder/auto-close/resume).

## State machine
`WAITING_FOR_USER` → `IN_PROGRESS` \| `RESOLVED` \| `CLOSED` (CLOSED za auto-close i ručno zatvaranje).

## Namjerno NIJE
SLA pause, in-app/email notifikacije, BH kalendar, BullMQ processor, close codes.
