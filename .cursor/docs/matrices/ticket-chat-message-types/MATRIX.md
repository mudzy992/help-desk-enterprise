# MATRIX — ticket-chat-message-types

## Cilj
Tipizirane `TicketMessage` poruke na postojećem enumu. Vidljivost se enforce-a na serveru. Nije puni ticket workspace, attachments ili notifications.

## Tipovi
| Type | Ko kreira | Vidljivost |
|---|---|---|
| `USER_REPLY` | public participant (requester/watcher) | public |
| `AGENT_REPLY` | staff u scope-u / SuperAdmin | public |
| `INTERNAL_NOTE` | staff u scope-u / SuperAdmin | staff only |
| `SYSTEM_EVENT` | backend (ticket activity) | staff only; nije obična requester poruka |
| `APPROVAL_DECISION` | nije klijentski u ovoj fazi | staff only |

Klijent ne smije kreirati `SYSTEM_EVENT` / `APPROVAL_DECISION` (`INVALID_MESSAGE_TYPE`). Requester ne smije `INTERNAL_NOTE` / `AGENT_REPLY` (`MESSAGE_TYPE_NOT_ALLOWED`). Staff ne smije `USER_REPLY`.

## List
`GET /tickets/:ticketId/messages` filtrira po `resolveTicketActorAccess`: public vidi samo `USER_REPLY` + `AGENT_REPLY`. Staff vidi sve.

## Persist + realtime
Poruka se prvo upisuje u `TicketMessage`, zatim `TicketRealtimeHub.publish`. Socket nije source of truth.

## API
| Method | Path |
|---|---|
| GET | `/tickets/:ticketId/messages` |
| POST | `/tickets/:ticketId/messages` |
