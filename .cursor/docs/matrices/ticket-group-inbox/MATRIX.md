# MATRIX — ticket-group-inbox

## Cilj
Group inbox za nedoručene grupne tikete, ručno preuzimanje/take-over, i server-side auto-assign (`LEAST_BUSY` / `ROUND_ROBIN`). Koristi postojeći `Ticket.assignedGroupId` / `assignedUserId`, `GroupMember`, RoleGuard/OU/service scope i ChangeLog. Nije novi RBAC niti routing engine.

## Group inbox
`GET /tickets/inbox` vraća tikete gdje je `assignedGroupId` postavljen, `assignedUserId` null i `status=PENDING`.

Vidljivost:
- član handler grupe + postojeći `canManageTicketsInScope` (OU path nasljeđivanje + service scope)
- SuperAdmin vidi sve group-inbox tikete
- requester/USER ne vidi inbox tuđih tiketa
- `UNROUTED` (nema grupe) nije inbox

Ako je `private.ticket.groupInbox.enabled=false` → `GROUP_INBOX_DISABLED`.

## Claim / take-over
`POST /tickets/:ticketId/claim`

- Actor mora biti AGENT/ADMIN u scope-u tiketa, ili SuperAdmin.
- Non-SuperAdmin mora biti `GroupMember` handler grupe.
- Dozvoljeni statusi: `PENDING`, `ASSIGNED`, `IN_PROGRESS`.
- `PENDING` + unassigned → `ASSIGNED` + `assignedUserId=actor`.
- Već dodijeljen istom actoru → no-op.
- Dodijeljen drugom agentu → take-over (isti status osim `PENDING` → `ASSIGNED`).
- Unrouted / terminalni status → `TICKET_NOT_CLAIMABLE`.
- Van grupe ili scope-a / USER → `FORBIDDEN`.

## Auto-assign
Radi samo poslije postojećeg routinga (`EXACT` / `PARENT_FALLBACK`). `UNROUTED` se ne dodjeljuje.

Settings:
- `private.ticket.autoAssign.enabled` (default `false`)
- `private.ticket.autoAssign.strategy` (`least_busy` | `round_robin`, default `least_busy`) — koristi se kad je `Service.autoAssignStrategy=NONE`
- `Service.autoAssignStrategy` override (`LEAST_BUSY` / `ROUND_ROBIN`)

Eligible agent: aktivan `GroupMember` čiji postojeći AGENT/ADMIN assignment pokriva `originUnit` + `service`. Nema dodjele van grupe ili van scope-a.

`LEAST_BUSY`: najmanji broj tiketa u `ASSIGNED` / `IN_PROGRESS` / `WAITING_FOR_USER` / `PENDING_APPROVAL`; tie-break sortiran `userId` ASC.

`ROUND_ROBIN`: eligible sortiran po `userId` ASC; sljedeći strogo veći od zadnjeg `assignedUserId` u istoj grupi (`updatedAt` DESC, `id` DESC); wrap na prvog.

Nema eligible agenta: tiket ostaje u group inbox (`PENDING`, grupa ostaje, `assignedUserId` null). Create ne puca.

Uspješan assign/claim piše postojeći ChangeLog (`ticket_assign` / `ticket_claim`).

## API
| Method | Path |
|---|---|
| GET | `/tickets/inbox` |
| POST | `/tickets/:ticketId/claim` |

## Namjerno NIJE
Participants, messages/chat, time tracking, attachments, KB, SLA, approvals, notifications, full ticket workspace UI, silent assign van scope-a, izmjena `RoutingService`.
