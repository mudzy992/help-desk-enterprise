# MATRIX — csat-feedback

## Cilj
Nakon `RESOLVED`/`CLOSED` requester šalje jednu CSAT ocjenu (1–`scaleMax`) + opcionalni komentar. Zapis je vezan za tiket (`TicketCsat.ticketId` unique), auditovan i spreman za agregaciju po OU/servisu/grupi.

## Settings
| Setting | Default |
|---|---|
| `private.addons.csat` | `true` (install catalog) |
| `private.csat.enabled` | `true` |
| `private.csat.scaleMax` | `5` |
| `private.csat.askOnResolved` | `true` |
| `private.csat.askOnClosed` | `false` |
| `private.csat.samplingRate` | `1.0` |

Enabled = addon AND `private.csat.enabled`. Sampling je deterministički hash `ticketId` (nije `Math.random`).

## Ko smije
Submit: samo `requesterId`. Status mora biti `RESOLVED` (ako `askOnResolved`) ili `CLOSED` (ako `askOnClosed`). `ARCHIVED` nije eligible. Pregled: ko vidi tiket.

`enabled=false` ili van sample-a ⇒ `canSubmit=false`. Submit tad ⇒ `CSAT_DISABLED` / `CSAT_NOT_ELIGIBLE`.

## Duplikat / spam
Jedan red po tiketu. Drugi submit ⇒ `409 CSAT_ALREADY_SUBMITTED`. Concurrent: `GuardrailClaim` (`event` + `ticketId` + `csat_submit`) plus unique constraint. Nije hard rate limit.

## Audit
ChangeLog `ticket_csat_submitted` + `SYSTEM_EVENT`. Komentar prolazi postojeću redaction policy.

## API
| Method | Path |
|---|---|
| POST | `/tickets/:ticketId/csat` |
| GET | `/tickets/csat/summary` (agent+) |

TicketResponse.csat: `{ enabled, canSubmit, submitted, rating, comment, scaleMax, askOnResolved, askOnClosed }`.

Summary agregira visible tikete po `originUnitId` / `serviceId` / `assignedGroupId`.

## Namjerno NIJE
Report pack/dashboard UI (Faza 8), email CSAT, BullMQ job, public anonimni link.
