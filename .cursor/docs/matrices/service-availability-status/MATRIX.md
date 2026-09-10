# MATRIX — service-availability-status + service-downtime-scheduling

## Cilj
Runtime availability overlay na postojećem Service Catalog-u. Lifecycle (`DRAFT` / `ACTIVE` / `DEPRECATED`) ostaje odvojen. Unavailable i scheduled downtime **ne blokiraju** kreiranje tiketa/requesta.

## Identitet
| Polje | Uloga |
|---|---|
| `Service.availability` | Admin-set stored status: `OPERATIONAL` \| `DEGRADED` \| `DOWN` \| `MAINTENANCE`. Nije lifecycle. |
| `ServiceDowntimeWindow` | Planirani prozor (`startsAt`, `endsAt`, `message`) za servis. |

## Runtime stanja
Evaluacija je computed overlay (ne mutira stored availability).

| State | Kada |
|---|---|
| `CURRENTLY_AVAILABLE` | Nema aktivnog prozora i stored nije `DOWN`/`MAINTENANCE` (`DEGRADED` ostaje available). |
| `CURRENTLY_UNAVAILABLE` | Stored `DOWN` ili `MAINTENANCE`, bez aktivnog prozora. |
| `SCHEDULED_DOWNTIME` | `now` pada u aktivni downtime prozor. |

Ticket create: `ticketCreationAllowed` je **uvijek** `true`. Stanje se izlaže da UI može upozoriti.

## Granice vremena
Half-open interval u UTC: `[startsAt, endsAt)`.
- `now === startsAt` → ACTIVE
- `now === endsAt` → EXPIRED
- `endsAt <= startsAt` → `INVALID_DOWNTIME_RANGE`
- Overlap half-open prozora → `OVERLAPPING_DOWNTIME_WINDOW`
- Adjacent (`endsAt === next.startsAt`) je dozvoljen

`autoSetMaintenanceStatus`: tokom ACTIVE prozora `effectiveAvailability = MAINTENANCE`.
`autoRestoreOperational`: nakon `endsAt` overlay nestaje; effective se vraća na stored (nema persistiranog auto-statusa).

## Settings
| Key | Default |
|---|---|
| `private.services.availability.enabled` | `true` |
| `private.services.availability.allowedStatusesCsv` | `OPERATIONAL,DEGRADED,DOWN,MAINTENANCE` |
| `private.services.availability.showStatusInCatalog` | `true` |
| `private.services.availability.showStatusInTicketCreate` | `true` |
| `private.services.availability.changeRequiresReason` | `true` |
| `private.services.downtimeScheduling.enabled` | `true` |
| `private.services.downtimeScheduling.autoSetMaintenanceStatus` | `true` |
| `private.services.downtimeScheduling.autoRestoreOperational` | `true` |
| `private.services.downtimeScheduling.requireReason` | `true` |

## Authorization
Postojeći `SessionAuthenticationGuard` + `RoleGuard` + `ADMIN`. Write: `service.availability.write` + `RequireServiceScope({ field: 'serviceId' })`. Nije `service.catalog.write`. Nema drugog RBAC engine-a.

Read-only: putanje ostaju `/services` → `service_catalog`.

## API
| Method | Path |
|---|---|
| PATCH | `/services/:serviceId/availability` |
| GET | `/services/:serviceId/downtime-windows` |
| POST | `/services/:serviceId/downtime-windows` |
| PATCH | `/services/:serviceId/downtime-windows/:downtimeWindowId` |
| DELETE | `/services/:serviceId/downtime-windows/:downtimeWindowId` |
| GET | `/services/:serviceId/ticket-creation-eligibility` |

`GET/PATCH /services/:serviceId` i list vraćaju `runtimeAvailability`.

## Namjerno NIJE
Schema-driven forme, form versioning, onboarding wizard, routing, SLA, approvals, frontend, ticket CRUD, drugi catalog/RBAC engine, persistirani auto-MAINTENANCE worker.
