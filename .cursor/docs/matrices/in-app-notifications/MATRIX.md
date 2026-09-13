# MATRIX — in-app-notifications

## Cilj
Persistent per-user inbox (`Notification`): list, unread count, mark-as-read. Fan-out iz postojećih ticket eventa (`TicketRealtimeHub` + `SYSTEM_EVENT`), ne iz novog event bus-a. Socket.IO prenosi već persistovane inbox zapise. Email i BullMQ nisu ovaj sloj.

## Model
`userId` + `type` + `title`/`body` + `payload` + optional `ticketId`. `dedupeKey` unique sa `userId` (idempotent skip na `P2002`). `isRead` / `readAt`. Confidential tiket: body je `ticketNumber`, payload bez naslova tiketa.

## Tipovi (allow-list)
| Izvor | `type` | Primaoci (bez actora) |
|---|---|---|
| `ticket_created` | `ticket.created` | članovi assigned grupe, bez assignee-a |
| `ticket_assigned` / `ticket_claimed` | `ticket.assigned` | `assignedUserId` |
| `USER_REPLY` / `AGENT_REPLY` | `ticket.message` | requester, assignee, grupa, watcher-i |
| `ticket_resolved` / `ticket_closed` | `ticket.resolved` / `ticket.closed` | requester |
| approval SYSTEM_EVENT | `ticket.approval` | `APPROVER` participanti |
| SLA SYSTEM_EVENT | `ticket.sla` | assignee + grupa |

INTERNAL_NOTE, time-tracking, attachments, confidential view i ostali SYSTEM_EVENT-i se ne šalju u inbox.

## API
Sve rute filterišu isključivo `userId` iz sesije. Tuđi id → `404 NOT_FOUND`.

| Method | Path |
|---|---|
| GET | `/notifications?unreadOnly&limit` |
| GET | `/notifications/unread-count` |
| POST | `/notifications/:notificationId/read` |
| POST | `/notifications/read-all` |

Auth: `SessionAuthenticationGuard` + `RoleGuard` (USER+). Nema posebnog permission key-a.

## UI
Bell u app headeru: list, unread badge, mark one/all. Desktop panel, mobile sheet. Socket.IO `notification.created` / `notification.read` / `notification.unread-count` na `user:{userId}`; badge poll 30s ostaje fallback za izgubljene evente.

## Namjerno NIJE
BullMQ queue, Teams stub, Edge receipts. Email kanal je odvojeni task.
