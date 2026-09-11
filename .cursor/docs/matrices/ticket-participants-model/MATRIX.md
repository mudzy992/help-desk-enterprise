# MATRIX — ticket-participants-model

## Cilj
Eksplicitni `TicketParticipant` redovi na postojećem `User` / `Group` / `Ticket` modelu. Nije paralelni identity sloj. Nije confidential ACL, forwarding workflow ili approvals.

## Role
Koristi postojeći `ParticipantRole`: `REQUESTER`, `ASSIGNEE`, `HANDLER_GROUP`, `APPROVER`, `FORWARDED_FROM_GROUP`, `FORWARDED_TO_GROUP`, `WATCHER`, `SYSTEM`.

Na create (isti transaction kao tiket): `REQUESTER` (`userId=requesterId`) i `HANDLER_GROUP` ako routing dodijeli grupu. `UNROUTED` ima samo `REQUESTER`. Claim/auto-assign dodaje `ASSIGNEE` za `assignedUserId`.

Ručni add: samo `WATCHER`, `APPROVER`, `FORWARDED_*`. `REQUESTER` / `ASSIGNEE` / `HANDLER_GROUP` / `SYSTEM` su system-managed (`PARTICIPANT_LOCKED` / `INVALID_PARTICIPANT_ROLE`).

## Authorization
List: isti ticket access kao get (requester, scoped AGENT/ADMIN, SuperAdmin, ili eksplicitni user participant).
Add/remove: `canManageTicketsInScope` ili SuperAdmin. USER/requester i van-scope agent → `FORBIDDEN`.
Identity: user role zahtijeva postojeći `User`; group role postojeći `Group`. Duplikat `(ticketId, role, userId, groupId)` → `PARTICIPANT_DUPLICATE`.

## Change log / audit
Uspješan add/remove piše postojeći `ChangeLog` (`entityType=ticket_participant`, reason `ticket_participant_add` / `ticket_participant_remove`) i `TicketMessage` `SYSTEM_EVENT`. Nije `AuditLog` hash-chain niti `TicketActivity`.

## API
| Method | Path |
|---|---|
| GET | `/tickets/:ticketId/participants` |
| POST | `/tickets/:ticketId/participants` |
| DELETE | `/tickets/:ticketId/participants/:participantId` |

## Namjerno NIJE
Forwarding policy, approvals workflow, confidential grants, watcher list u `GET /tickets`.
