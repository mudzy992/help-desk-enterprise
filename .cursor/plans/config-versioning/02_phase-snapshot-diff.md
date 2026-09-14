# Faza 2 — Modul skeleton: create / list / get / diff

`backend/src/modules/config-versioning/` (~100–150 linija po fajlu).

## HTTP

`ConfigVersioningController` `@Controller('config-versions')`

| Method | Path | Permission |
|---|---|---|
| POST | `/` | settings.write |
| GET | `/` | ADMIN |
| GET | `/:id` | ADMIN |
| GET | `/:id/diff?against=` | ADMIN |
| POST | `/:id/validate` | settings.write, AdminReadOperation |
| POST | `/:id/activate` | settings.write + reason |
| POST | `/:id/rollback` | settings.write + reason |
| POST | `/:id/shadow` | settings.write, AdminReadOperation |

Prisma samo u repository/service. Feature flag `enabled` → 404/disabled error ako je off.

## Snapshot collector (read-only reuse)

- settings: registry public+private resolved values; secrets omitted
- routing: `listRoutingRules` records
- SLA: calendars + profiles + rules + escalations + `PriorityMatrixRule`
- catalog: services (lifecycle/availability/slaProfileId/…)
- forms: form versions (id, serviceId, version, schema, status)

## Diff

`buildDeterministicDiff` / `buildChangeLogDiff` iz `change-log/`. Nema novog algoritma.

## Create

Next `version` = max+1, status `DRAFT`, `releaseNotes`, `createdByUserId`.
