# MATRIX — data-lifecycle-archive

## Cilj
Zatvoreni tiketi nakon X dana prelaze u `ARCHIVED` (read-only). Podaci se ne brišu. Archived su odvojeni od aktivnih listi; searchable uz permission.

## Settings
| Setting | Default |
|---|---|
| `private.dataLifecycle.archive.enabled` | `true` |
| `private.dataLifecycle.archive.afterClosedDays` | `30` |
| `private.dataLifecycle.archive.archivedReadOnly` | `true` |
| `private.dataLifecycle.archive.searchable` | `true` |

Prozor je 24h od `closedAt`. Nije BH/SLA kalendar.

## Sweep
`TicketArchiveAutomationService` koristi postojeći Nest `@Interval` (15 min) na API procesu, isti mehanizam kao waiting-for-user. Nije BullMQ (Faza 7) i nije drugi scheduler.

Query: `status=CLOSED` AND `closedAt <= now - afterClosedDays`. Persist: `ARCHIVED` + `archivedAt`. ChangeLog `ticket_archived` + `SYSTEM_EVENT`.

Concurrent: `GuardrailClaim` (`automation` + `ticketId` + `archive:closedAt`). Duplicate/loop ⇒ skip, bez brisanja.

Ručni PATCH `CLOSED` → `ARCHIVED` i dalje prolazi state machine i postavlja `archivedAt`.

## Liste
Default `GET /tickets` isključuje `ARCHIVED`. `status=ARCHIVED` vraća archived ako je `searchable=true`, ili samo SuperAdmin ako je `searchable=false`. Inbox ostaje PENDING.

## Read-only
Ako je `archivedReadOnly`, mutacije (PATCH, chat, claim, attachments write, split, bulk, approvals, reopen, CSAT submit, break-glass) ⇒ `TICKET_ARCHIVED_READ_ONLY`. Čitanje ostaje. `ARCHIVED` nije reopenable.

## Namjerno NIJE
Fizički delete, retention purge, BullMQ processor, SLA, CSAT prompt na archived.
