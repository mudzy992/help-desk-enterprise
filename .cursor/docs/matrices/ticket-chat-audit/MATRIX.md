# MATRIX — ticket-chat-audit

## Cilj
In-ticket audit kao `TicketMessage` `SYSTEM_EVENT` plus postojeći `ChangeLog`. Nije drugi generic audit engine (`AuditLog` hash-chain / `TicketActivity`).

## SYSTEM_EVENT akcije
`ticket_created`, `ticket_claimed`, `ticket_assigned`, `ticket_participant_added`, `ticket_participant_removed`, `ticket_time_started`, `ticket_time_stopped`, `ticket_attachment_uploaded`, `ticket_attachment_deleted`.

Tijelo poruke je action key. `authorUserId` je actor kad postoji. Vidljivost: staff-only.

## ChangeLog
Mutacije participanta i time-loga pišu postojeći `ChangeLog` (`ticket_participant` / `ticket_time_log`) sa reason + diff. Ticket create/update/claim i dalje koriste postojeći ticket ChangeLog.

## Realtime
Isti `ticket.message.created` event; staff rooms dobiju SYSTEM_EVENT, public rooms ne.

## Socket
`ticket:join` / `ticket:leave` na postojećem Socket.IO gatewayu. Join koristi `TicketsCollaborationService.authorizeSocketJoin` (isti OU/service/requester model). Kanali: `ticket:{id}:public`, `ticket:{id}:staff`, `user:{userId}`, `group:{groupId}`.
