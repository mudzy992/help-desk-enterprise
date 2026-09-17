# MATRIX — sla-calendars-profiles-rules

## Cilj
Admin CRUD za BH kalendare, SLA profile i SLA rules, plus business-time računanje targeta. Reuses `ChangeLog`, `sla.write`, Admin read-only module `sla`. Nije ticket timer/pause/overdue engine.

## Kalendar
| Polje | Uloga |
|---|---|
| `key` | Stabilni identifikator (`BH_STANDARD`) |
| `weeklyHours` | ISO weekday `1–7` → intervali `HH:mm` |
| `timezone` | IANA zona |
| `holidays` | Neradni dani (`YYYY-MM-DD`) |
| `isActive` | Aktivan kalendar |

Overlap / invertovan interval → `OVERLAPPING_INTERVALS`. Nula radnih intervala → `CALENDAR_HAS_NO_BUSINESS_HOURS`. Brisanje/deaktivacija dok ga aktivni profil koristi → `CALENDAR_IN_USE`.

## Profil
`calendarId` je obavezan. Aktivan profil ne smije visjeti na neaktivnom kalendaru (`CALENDAR_INACTIVE`). Brisanje dok ga servis ili policy pack koristi → `PROFILE_IN_USE`.

## Pravilo
Match key: `priority` + opcionalni `serviceId` + opcionalni `organizationalUnitId`. Duplikat istog ključa na profilu → `DUPLICATE_RULE`. `evaluationOrder` (manji prvi), zatim specifičnost (service+OU > service > OU > default). `resolutionMinutes >= responseMinutes >= 1`.

## API
| Method | Path | Permission |
|---|---|---|
| CRUD | `/sla/calendars` | `ADMIN`; write: `sla.write` + `reason` (uvijek obavezno) |
| CRUD | `/sla/profiles` | `ADMIN`; write: `sla.write` + `reason` (uvijek obavezno) |
| CRUD | `/sla/rules` | `ADMIN`; write: `sla.write` + `reason` (uvijek obavezno) |
| GET | `/sla/rules/resolve` | `ADMIN` |
| GET | `.../:id/changes` | `ADMIN` |

`GET /sla/rules/resolve` vraća `responseDueAt` / `resolutionDueAt` u BH vremenu iz povezanog kalendara. Ticket `TicketSlaState` se ovdje ne piše.

## Namjerno NIJE
Timer pause, overdue UI badge/filter, config versioning.
