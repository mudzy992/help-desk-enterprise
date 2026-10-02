# MATRIX — redis-bullmq

## Cilj
Infrastrukturni Redis klijent i BullMQ connection bootstrap za API i zaseban worker proces. Domain queueovi, procesori i jobovi nisu dio ovog sloja — vidi `integrations-durable-queue`.

## Procesi
| Proces | Entry | HTTP | Redis/BullMQ | Prisma/Settings |
|---|---|---|---|---|
| backend | `dist/src/main.js` | da (`PORT`) | `RedisModule` (klijent + BullMQ `forRoot`) | da |
| worker | `dist/src/worker.js` | ne (`createApplicationContext`) | isti `RedisModule` + domain `Processor` | da (job status + settings); bez Websocket |

Worker command: `node dist/src/worker.js`. Compose servis `worker` dijeli backend image, `uploads` volume i `redis_net`. Isti Redis env (`x-redis-environment`) na backend i worker. Worker ne radi migracije.

## Konfiguracija (env, ne Settings registry)
Isti Coolify ključevi iz `.env.example`:

| Key | Uloga |
|---|---|
| `REDIS_HOST` | obavezan |
| `REDIS_PORT` | default `6379` |
| `REDIS_USERNAME` | ACL user `servicedesk`; prazno se ignorira |
| `REDIS_PASSWORD` | ista lozinka kao `ops/redis-acl.line` (`>change-me` placeholder); prazno se ignorira; nikad se ne loguje |
| `REDIS_KEY_PREFIX` | default `servicedesk`; ioredis prefix dobija završni `:` zbog ACL `~servicedesk:*` |
| `QUEUE_PREFIX` | default `bull:servicedesk`; BullMQ `prefix` (ACL `~bull:servicedesk:*`) |

ACL user `servicedesk` (Redis 7): `+info` i `+client|setname` **poslije** `-@dangerous` (inače ioredis ready-check padne). Pub/sub kanali do Faze 7: `&integration-queue:*` (edge-event, bez keyPrefix), `&servicedesk:*` (ako ioredis prefiksira), `&bull:servicedesk:*` (BullMQ). Nije Socket.IO Redis adapter.

Nema `REDIS_URL` duplikata. Nema settings registry ključeva za Redis.

## Klijenti
- Opšti ioredis klijent: `lazyConnect: true`, `keyPrefix` iz `REDIS_KEY_PREFIX`. Nije dijeljena instanca s BullMQ.
- BullMQ: connection options (`maxRetriesPerRequest: null`, `lazyConnect: true`) + `prefix`. Domain `Queue` / `Worker` imena su u `integrations-durable-queue`.

## Shutdown
Keep-alive timer drži event loop pored BullMQ workera. `SIGINT` / `SIGTERM`: ugasi timer, `application.close()` (BullMQ processor `onModuleDestroy`, Redis `onModuleDestroy`, Prisma `$disconnect`), exit 0. API koristi `enableShutdownHooks()`. `quit()` ako je klijent aktivan, inače `disconnect()`.

## Namjerno NIJE implementirano
Socket.IO Redis adapter, lažni jobovi, SLA/ticket procesori na ovom sloju. Durable queue je domain sloj `integrations-durable-queue`.
