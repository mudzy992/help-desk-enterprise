# MATRIX — ticket-approvals

## Cilj
ITIL-lite approval hold za 1–3 osjetljiva servisa. Tiket ide u `PENDING_APPROVAL` prije obrade. Approve nastavlja assignment. Reject zatvara tiket. Koristi postojeći `TicketApproval`, `TicketStatus`, RoleGuard/OU/service scope i ChangeLog.

## Kad je hold aktivan
Svi uslovi:

- `private.addons.approvals` i `private.ticket.approvals.enabled` su `true`
- servis zahtijeva odobrenje: `Service.requiresApproval` ili overlay `private.ticket.approvals.requiredByServiceJson`
- routing nije `UNROUTED`

JSON overlay (`serviceId → boolean | { required }`) ima prednost nad catalog flagom. Prazan/odsutan secret = `{}`.

`UNROUTED` ostaje `UNROUTED` (nema hold-a dok nema grupe). Auto-assign i claim ne rade dok je `PENDING_APPROVAL`.

## Decision
`POST /tickets/:ticketId/approvals/:approvalId/approve|reject` sa obaveznim `comment`.

| Decision | Ticket status | Assignment |
|---|---|---|
| approve | `PENDING` | zatim postojeći auto-assign ako je uključen |
| reject | `CLOSED` | nema assign |

Ko smije: SuperAdmin ili korisnik čija assignment role pokriva `private.ticket.approvals.defaultApproverRole` (`ADMIN` default; `AGENT` uključuje ADMIN; `SUPER_ADMIN` samo SuperAdmin) u OU+service scope-u tiketa. Requester ⇒ `APPROVAL_SELF_FORBIDDEN`. `allowRequesterManager` se čuva, AD manager se ne koristi.

PATCH status iz `PENDING_APPROVAL` ⇒ `APPROVAL_DECISION_REQUIRED`. PATCH u `PENDING_APPROVAL` ⇒ `APPROVAL_TRANSITION_FORBIDDEN`.

## Audit
`TicketApproval` red + `APPROVER` participant na odluci + `SYSTEM_EVENT` + `APPROVAL_DECISION` poruka + ChangeLog (`ticket_approval_approved` / `ticket_approval_rejected`).

## API
| Method | Path |
|---|---|
| GET | `/tickets/:ticketId/approvals` |
| POST | `/tickets/:ticketId/approvals/:approvalId/approve` |
| POST | `/tickets/:ticketId/approvals/:approvalId/reject` |

## Namjerno NIJE
Waiting-for-user automatika i reopen policy su zasebne matrice. Close codes, SLA pause, confidential ACL, AD manager approver, multi-step lanci, notifications.
