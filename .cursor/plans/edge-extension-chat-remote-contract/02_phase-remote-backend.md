# Faza 2 — Request Remote + rate limit + ack audit

## Ko inicira

Staff (`isTicketStaffActor` / SuperAdmin). Requester `POST` → `403 FORBIDDEN`.

## API

| Method | Path | Ko | Side-effect |
|---|---|---|---|
| POST | `/tickets/:ticketId/remote-requests` | staff | SYSTEM_EVENT + hub publish (notifikacija/EDGE_EVENT) |
| POST | `/edge-extension/remote-requests/:ticketId/acknowledge` | requester / public participant | AuditLog ack; opcionalno SYSTEM_EVENT `ticket_remote_acknowledged` (staff-only, ne ide u user chat) |

Novi kontroler `tickets-remote.controller.ts` (isti guard pattern kao `tickets-collaboration.controller.ts`). Ack ostaje na `edge-extension` modulu (isti klijent kao receipts). Prisma samo iz service/repository.

Side-effects isključivo: persist → `publishForTicketId` / `TicketRealtimeHub` → postojeći notification fan-out. Nema direktnog socket poziva.

## Rate limit

Posljednji `TicketMessage` `type=SYSTEM_EVENT` `body=ticket_remote_requested` za tiket. Ako `now - createdAt < rateLimitMinutes` → `REMOTE_RATE_LIMITED`. Ako `remote.enabled=false` → `REMOTE_DISABLED`.

Test: `tickets.remote-request.spec.ts` — prvi POST ok, drugi unutar prozora odbijen, treći nakon pomjerenog sata ok. Ack ne broji u prozor.

## Fan-out

- `ticketSystemEventActions.remoteRequested = 'ticket_remote_requested'`
- `notificationTypes.remoteRequested = 'remote.requested'`
- `map-ticket-event-to-notification.ts` + `resolve-notification-recipients.ts` → **samo requester** (ne actor)
- `in-app-notifications` MATRIX: dodati red (dopuna, nije novi modul)
- `auditLogActions.ticketRemoteAcknowledged = 'ticket.remote.acknowledged'`
- `auditAcknowledge=false` → ack HTTP 200 bez AuditLog; protokol klik i dalje lokalni

## Guards napomena

`backend.mdc` traži OuAccessGuard. F9-1 i tickets HTTP ga nemaju; access je u servisu. Isti izuzetak, dokumentovan u matrici.
