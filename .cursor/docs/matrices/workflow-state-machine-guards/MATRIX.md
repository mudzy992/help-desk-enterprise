# MATRIX — workflow-state-machine-guards

## Cilj
Eksplicitne dozvoljene tranzicije `TicketStatus`. Zabranjeni skokovi se odbijaju na serveru (`INVALID_STATUS_TRANSITION`). Frontend restrikcije nisu izvor istine. Matrica je kompatibilna sa kasnijim approvals / waiting-for-user / reopen tokovima, ali ih ne implementira.

## Početni status
Vidi ticketing-core: routed create ⇒ `PENDING`; unrouted ⇒ `UNROUTED`.

## Dozvoljeni prijelazi
| From | To |
|---|---|
| `PENDING` | `ASSIGNED`, `IN_PROGRESS`, `PENDING_APPROVAL` |
| `UNROUTED` | `PENDING` |
| `PENDING_APPROVAL` | `PENDING`, `CLOSED` |
| `ASSIGNED` | `IN_PROGRESS`, `PENDING`, `WAITING_FOR_USER` |
| `IN_PROGRESS` | `WAITING_FOR_USER`, `RESOLVED`, `ASSIGNED` |
| `WAITING_FOR_USER` | `IN_PROGRESS`, `RESOLVED` |
| `RESOLVED` | `CLOSED`, `IN_PROGRESS` |
| `CLOSED` | `ARCHIVED`, `IN_PROGRESS` |
| `ARCHIVED` | _(none)_ |

Isti status je no-op (dozvoljen). Sve ostalo je `INVALID_STATUS_TRANSITION`.

## Ko smije
Status mijenjaju AGENT, ADMIN i SuperAdmin (`canChangeTicketStatus` preko postojećih role assignmenta). USER/requester ⇒ `STATUS_CHANGE_FORBIDDEN`. Nema novog `ticket.status.*` permission keya.

Kod: `assertTicketStatusTransition` + `allowedTicketStatusTransitions`.

## Namjerno NIJE
Waiting-for-user automatika, reopen policy, approvals engine, close codes, smart required fields, group inbox claiming koje postavlja `ASSIGNED`.
