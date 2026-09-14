# CHANGELOG — redis-bullmq

## 2026-09-14
- Redis auth ugovor: ACL placeholder `change-me` (ne `CHANGE_ME`); isti `REDIS_*` na backend i worker preko compose `x-redis-environment`. `WRONGPASS` = par nije ACL user `ephelpdesk`.
- Worker sada učitava Prisma/Settings zbog domain procesora; connection bootstrap nepromijenjen. Durable queue dokumentovan u `integrations-durable-queue`. Shutdown i dalje: keep-alive timer + `application.close()`.

## 2026-09-10
- Inicijalna matrica: typed Redis/BullMQ connection bootstrap, worker entry `dist/src/worker.js`, graceful shutdown, worker keep-alive bez domain queueova.
