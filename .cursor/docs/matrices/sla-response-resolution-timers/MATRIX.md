# MATRIX — sla-response-resolution-timers

## Cilj
Response i resolution timeri na `TicketSlaState`, vezani na postojeće SLA profile/rules i BH kalendar. Pause/resume je settings-driven. Overdue scan i eskalacije: `sla-breach-escalation`. Nije UI badge/filter niti seed profila.

## Start
Na create, ako je `private.ticket.sla.enabled` i servis ima aktivan profil + matching rule: snapshot minuta, `startedAt`, `responseDueAt` / `resolutionDueAt` u BH vremenu. Nema matcha → nema state-a, tiket se i dalje kreira. Rule/profile izmjene ne diraju in-flight snapshot.

## Pause / resume
| Status | Setting (default true) |
|---|---|
| `WAITING_FOR_USER` | `private.ticket.sla.pauseOnWaitingForUser` |
| `PENDING_APPROVAL` | `private.ticket.sla.pauseOnPendingApproval` |

Ulazak: `pausedAt = now`. Izlazak u ne-terminalni status: remaining BH minute od `pausedAt` do due, novi due od `now`, `pausedBusinessMinutes +=` BH minute pauze. Više ciklusa se sabiraju. Terminal (`RESOLVED` / `CLOSED` / `ARCHIVED`) dok je pauza: sat se ne resume-a, completion koristi `pausedAt`.

## Response / resolution
Response: prva `AGENT_REPLY` ili status `IN_PROGRESS`. Resolution: `RESOLVED` / `CLOSED` / `ARCHIVED`. Elapsed = BH minute od `startedAt` do `pausedAt ?? stoppedAt ?? now`, minus završeni pause ciklusi. Breach: effective clock > due; jednom true ostaje true. Reopen ne restartuje completion.

## Namjerno NIJE
Overdue UI badge/filter, seed INCIDENT/ACCESS/… profila.
