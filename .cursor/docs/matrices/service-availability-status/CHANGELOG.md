# CHANGELOG — service-availability-status

## 2026-09-10
- Inicijalna matrica: stored `Service.availability` odvojen od lifecycle-a, downtime overlay `[startsAt, endsAt)`, runtime stanja AVAILABLE / UNAVAILABLE / SCHEDULED_DOWNTIME, ticket create uvijek dozvoljen, `service.availability.write` na postojećem RoleGuard/service scope.
