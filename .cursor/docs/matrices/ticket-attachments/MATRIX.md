# MATRIX — ticket-attachments

## Cilj
Ticket attachment metadata u PostgreSQL, sadržaj na disku pod postojećim `UPLOAD_ROOT`. Jedna serverska policy (MIME, ekstenzija, veličina, sanitizacija). Classification inheritance sa tiketa. Nije KB, SLA, confidential ACL, niti puni ticket workspace.

## Storage
Metadata: `TicketAttachment` (`ticketId`, `originalName`, `storagePath`, `mimeType`, `extension`, `sizeBytes`, `classification`, `uploadedByUserId`, timestamps).
Fajl: `{UPLOAD_ROOT}/tickets/{ticketId}/{opaqueId}.{ext}`. Originalni filename nije dio putanje. Nema public/static expose.

## Policy
Autoritet: `validateTicketAttachment` + settings `private.ticket.attachments.*`.
Client MIME se ignoriše. Sniffing magičnih bajtova mora poklopiti allow-list MIME i ekstenziju. Block-list opasnih ekstenzija. Path traversal u imenu (`..`, `/`, `\`) → `ATTACHMENT_FILENAME_INVALID`. Size > configured max → `ATTACHMENT_TOO_LARGE`.

## Classification
Na create: nasljeđuje ticket classification. Traženi nivo niži od tiketa → `CLASSIFICATION_DOWNGRADE`. Viši nivo je dozvoljen. Na access: effective = max(stored, ticket); slabiji stored se podiže u metadata.

## Authorization
Auth + postojeći ticket access (`loadAccessibleTicket`) + permission `ticket.attachments.upload` / `ticket.attachments.download` sa OU i service scope tiketa. Requester bez permissiona i van-scope agent → `FORBIDDEN`.

## Audit
Postojeći `ChangeLog` (`ticket_attachment`, reason `ticket_attachment_upload` / `ticket_attachment_delete`) + `SYSTEM_EVENT`. Nije drugi audit sistem.

## API
| Method | Path |
|---|---|
| GET | `/tickets/:ticketId/attachments` |
| POST | `/tickets/:ticketId/attachments` (multipart `file`) |
| GET | `/tickets/:ticketId/attachments/:attachmentId/content` |
| DELETE | `/tickets/:ticketId/attachments/:attachmentId` |

## Namjerno NIJE
KB, full ticket UI, SLA, notifications, approvals, confidential ACL/break-glass, retention job, AV scan.
