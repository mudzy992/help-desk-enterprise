# MATRIX — ticket-reopen-policy

## Cilj
Nakon `RESOLVED`/`CLOSED` korisnik (i staff u scope-u) može reopen. Unutar N dana isti tiket ide u `IN_PROGRESS`. Nakon isteka prozora kreira se novi tiket sa `reopenedFromTicketId`. Audit u ChangeLog + `SYSTEM_EVENT`.

## Settings
| Setting | Default |
|---|---|
| `private.ticket.reopen.enabled` | `true` |
| `private.ticket.reopen.windowDays` | `7` |

Prozor počinje od `resolvedAt ?? closedAt`. 24h periodi, ne BH.

## Ko smije
Ko vidi tiket (`loadAccessibleTicket`): requester ili staff u OU/service scope-u. `enabled=false` ⇒ `REOPEN_DISABLED`. Status nije `RESOLVED`/`CLOSED` ili nema timestamp ⇒ `REOPEN_NOT_ELIGIBLE`. `ARCHIVED` nije reopenable.

## Ishod
| Uslov | Ticket | Status |
|---|---|---|
| unutar prozora | isti `id` | `IN_PROGRESS`; `resolvedAt`/`closedAt` se čiste |
| van prozora | novi tiket | create tok (routing + approvals); `reopenedFromTicketId` = stari; stari ostaje `RESOLVED`/`CLOSED` |

Novi tiket zadržava originalnog `requesterId`, title/description/service/origin/formData/formVersionRef.

## PATCH guard
`PATCH` `RESOLVED`/`CLOSED` → `IN_PROGRESS` ⇒ `REOPEN_REQUIRED`. Mora `POST /tickets/:ticketId/reopen`. `RESOLVED` → `CLOSED` i `CLOSED` → `ARCHIVED` ostaju PATCH.

State machine i dalje dozvoljava `RESOLVED`/`CLOSED` → `IN_PROGRESS` za reopen engine.

## API
| Method | Path |
|---|---|
| POST | `/tickets/:ticketId/reopen` |

Body: opcioni `comment` (max 2000). TicketResponse.reopen: `{ enabled, eligible, createsNewTicket, windowEndsAt }`.

## Namjerno NIJE
Close codes, split/merge, CSAT, archive, SLA.
