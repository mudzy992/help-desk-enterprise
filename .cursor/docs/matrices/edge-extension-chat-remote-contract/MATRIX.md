# MATRIX — edge-extension-chat-remote-contract

## Cilj
Companion popup: mini inbox + tekstualni quick reply (bez attachmenta) + Request Remote / Quick Assist. Isti ticket thread kao web. Delivery remote eventa ide kroz F7-A `EDGE_EVENT` / `notification.created`.

## Ko inicira remote
Agent/staff (`resolveTicketActorAccess.visibility === 'staff'`). Requester `POST` → `FORBIDDEN`. RAW: agent klik → record → `remote.requested` → extension toast + “Open Quick Assist”.

## Record
`TicketMessage` `SYSTEM_EVENT` body `ticket_remote_requested` (`insert-system-ticket-event`). Nema nove tabele. Fan-out: notification type `remote.requested` samo requesteru. WS event ostaje `notification.created` (nema novog Socket.IO imena).

## API
| Method | Path | Ko | Guards |
|---|---|---|---|
| POST | `/tickets/:ticketId/remote-requests` | staff | Session + Role USER+; access u servisu |
| GET | `/edge-extension/remote-requests/pending` | requester | Session + Role USER+ |
| POST | `/edge-extension/remote-requests/:ticketId/acknowledge` | requester / participant | Session + Role USER+ |
| POST | `/tickets/:ticketId/messages` | postojeći chat | postojeći |

`OuAccessGuard` i `RequirePermissions` se ne stavljaju (isti razlog kao F9-1 receipts). Katalog: `ticket.message.send`, `ticket.remote.open_quick_assist` na USER+.

## Rate limit
Na **Request Remote** POST, po `ticketId`, `private.edgeExtension.remote.rateLimitMinutesPerTicket` (default 10). Drugi request u prozoru → `429 REMOTE_RATE_LIMITED`. Ack nije u tom prozoru.

## Quick Assist
`ms-quick-assist:` samo na klik korisnika. Nikad iz notification listenera. `requireUserClickToOpenQuickAssist` default true; MVP ne auto-otvara ni kad je flag false.

## Chat
Popup šalje `USER_REPLY` na postojeći message API. Extension nikad ne prikazuje `INTERNAL_NOTE` / `SYSTEM_EVENT` / `APPROVAL_DECISION`. `attachments.enabled` default false — nema upload UI. Cap `chat.maxMessagesPerTicket` (default 50). Inbox: `GET /tickets`, samo requester + status ∉ `{CLOSED, ARCHIVED}`.

## Audit
Ack → `recordAuditEntry` action `ticket.remote.acknowledged` ako je `auditAcknowledge` true. Idempotentno po (actor, ticket).

## Confidential
Liste i GET messages koriste postojeći ACL. 403 → greška u popupu. OS toast ostaje redacted (F9-1).

## Namjerno NIJE
Attachment upload, auto-open protokola, nova Prisma tabela, novi WS event, MSAL, content scripts.
