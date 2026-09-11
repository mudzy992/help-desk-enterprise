# MATRIX — ticket-split

## Cilj
Agent/Admin/SuperAdmin razdvaja tiket na 2–10 child tiketa. Parent ostaje. Child ima `parentTicketId`. Kopira se naslov/opis/form snapshot/confidential. Handler grupa ide routing-om ili ručno.

## Settings
`private.addons.ticketSplit` AND `private.ticket.split.enabled` (default true).
`allowAttachmentMove` default false (copy/link). `allowMessageCopy` default true. `requireReason` default true.

## Pravila
Staff u scope-u (`canChangeTicketStatus`). USER requester ⇒ `FORBIDDEN`. `ARCHIVED` ili već mergiran ⇒ `SPLIT_NOT_ALLOWED`. Default: poruke/prilozi se ne prenose. Audit: `SYSTEM_EVENT` `ticket_split:reason:childNumbers` + ChangeLog `ticket_split`.

## API
`POST /tickets/:ticketId/split` — body `{ reason, children[2..10] }`.
