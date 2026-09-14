# CHANGELOG — integrations-durable-queue

## 2026-09-14
- Edge Redis kanal je `integration-queue:edge-event` (ACL `&integration-queue:*`); ioredis pub/sub ne koristi keyPrefix. `+info` mora biti poslije `-@dangerous`.
- `TEAMS_STUB` ide kroz BullMQ kao ostali tipovi; worker procesor je log-only COMPLETED (vidi `integrations-teams-stub`). Nema HTTP delivery-a.
- Inicijalna matrica: BullMQ `integration` queue, Postgres `IntegrationJob` statusi, EMAIL/EDGE_EVENT procesori, DLQ + admin retry, settings ključevi, RBAC `integrations.queue.manage`.
