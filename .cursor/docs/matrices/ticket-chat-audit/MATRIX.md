# MATRIX — ticket-chat-audit

## Cilj
In-ticket audit kao `TicketMessage` `SYSTEM_EVENT` plus postojeći `ChangeLog`. Nije drugi generic audit engine (`AuditLog` hash-chain / `TicketActivity`).

## SYSTEM_EVENT akcije
`ticket_created`, `ticket_claimed`, `ticket_assigned`, `ticket_resolved`, `ticket_closed`, `ticket_participant_added`, `ticket_participant_removed`, `ticket_time_started`, `ticket_time_stopped`, `ticket_attachment_uploaded`, `ticket_attachment_deleted`, `ticket_confidential_viewed`, `ticket_confidential_denied`, `ticket_confidential_break_glass`, `ticket_guardrail_duplicate_warned`, `ticket_guardrail_loop_suppressed`, `ticket_remote_requested`.

Tijelo poruke je action key. `authorUserId` je actor kad postoji. Vidljivost: staff-only.

## ChangeLog
Mutacije participanta i time-loga pišu postojeći `ChangeLog` (`ticket_participant` / `ticket_time_log`) sa reason + diff. Ticket create/update/claim i dalje koriste postojeći ticket ChangeLog.

## Realtime
`ticket.message.created` (staff vs public rooms) i `ticket.updated` (slim snapshot, bez title/description; fan-out i na user/group roomove za list invalidation). Confidential/time/participant akcije ostaju staff-only.

## Socket
`ticket:join` / `ticket:leave` na postojećem Socket.IO gatewayu. Join koristi `TicketsCollaborationService.authorizeSocketJoin` (isti OU/service/requester model). Kanali: `ticket:{id}:public`, `ticket:{id}:staff`, `user:{userId}`, `group:{groupId}`.
