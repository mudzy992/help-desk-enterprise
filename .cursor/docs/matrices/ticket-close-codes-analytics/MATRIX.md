# MATRIX — ticket-close-codes-analytics

## Cilj
Pri `RESOLVED` (i ručnom `CLOSED` ako polje fali) agent bira close code iz settings allow-list. Code se persistira na `Ticket.closeCodeId` + opciona `resolutionNote`. Koristi se za analitiku; report packovi su zaseban task.

## Settings
| Setting | Default |
|---|---|
| `private.ticket.closeCodes.enabled` | `true` |
| `private.ticket.closeCodes.allowedCodesCsv` | `solved_by_user,howto,access_granted,config_change,bug_fixed,hardware_replaced,other` |
| `private.ticket.closeCodes.requireOnResolve` | `true` |

`requireOnResolve` važi za PATCH u `RESOLVED`. `CLOSED` nasljeđuje već upisan code ili ga traži kroz smart required fields (`close_code` u global CSV).

## Ko smije
Isti status actor kao state machine (`canChangeTicketStatus`). Requester ne mijenja status.

Nevažeći key ⇒ `CLOSE_CODE_INVALID`. System auto-close i approval reject **ne** idu kroz ovaj guard.

## Persistencija
Allow-list key se upsert-uje u `CloseCode` (global, `serviceId=null`). Aktivni per-service `CloseCode` redovi su dodatni dozvoljeni keyevi. TicketResponse.closePolicy nosi enabled/requireOnResolve/allowedCodes/current code/note.

## API
PATCH `/tickets/:ticketId` body: `closeCode`, `resolutionNote` uz `status`.

## Namjerno NIJE
CSAT, report pack “Top close codes”, bulk close, archive.
