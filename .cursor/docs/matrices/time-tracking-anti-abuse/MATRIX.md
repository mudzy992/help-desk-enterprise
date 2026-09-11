# MATRIX — time-tracking-anti-abuse

## Cilj
Eksplicitni start/stop time entry na postojećem `TicketTimeLog`. Trajanje računa server. Nije SLA timer, heartbeat tab-pause, niti workforce optimization.

## Lifecycle
`POST /tickets/:ticketId/time-logs/start` → `startedAt=now()`, `endedAt=null`, `durationSeconds=null`, `userId=actor`.
`POST /tickets/:ticketId/time-logs/:timeLogId/stop` → `endedAt=now()`, `durationSeconds=floor((endedAt-startedAt)/1000)` (min 0). Klijentski timestamp se ignoriše.

## Overlap
Jedan aktivan timer po `(userId, ticketId)`. Drugo start dok `endedAt IS NULL` → `OVERLAPPING_TIMER` (HTTP 409). Postgres partial unique index `TicketTimeLog_active_user_ticket_uidx`.

## Immutability
Completed entry (`endedAt != null`) se ne smije stop/update (`TIME_LOG_IMMUTABLE`). Nema delete/PATCH. Historija ostaje.

## Authorization
Start/stop/list: staff u ticket scope-u ili SuperAdmin. Requester i van-scope agent → `FORBIDDEN`. Stop tuđeg aktivnog timera: samo SuperAdmin.

## Audit
ChangeLog `ticket_time_log` (`ticket_time_start` / `ticket_time_stop`) + SYSTEM_EVENT.

## Namjerno NIJE u ovom slice-u
Tab inactivity auto-pause, max session hours heartbeat, SLA pause.
