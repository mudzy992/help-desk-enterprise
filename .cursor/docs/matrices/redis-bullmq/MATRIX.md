# MATRIX — redis-bullmq

## Cilj
Infrastrukturni Redis klijent i BullMQ connection bootstrap za API i zaseban worker proces. Domain queueovi, procesori i jobovi nisu dio ovog sloja.

## Procesi
| Proces | Entry | HTTP | Redis/BullMQ |
|---|---|---|---|
| backend | `dist/src/main.js` | da (`PORT`) | `RedisModule` (klijent + BullMQ `forRoot`) |
| worker | `dist/src/worker.js` | ne (`createApplicationContext`) | isti `RedisModule`, bez Prisma/Settings/Websocket |

Worker command: `node dist/src/worker.js`. Compose servis `worker` dijeli backend image, `uploads` volume i `redis-net`. Worker ne radi migracije.

## Konfiguracija (env, ne Settings registry)
Isti Coolify ključevi iz `.env.example`:

| Key | Uloga |
|---|---|
| `REDIS_HOST` | obavezan |
| `REDIS_PORT` | default `6379` |
| `REDIS_USERNAME` | opciono; prazno se ignorira |
| `REDIS_PASSWORD` | opciono secret; prazno se ignorira; nikad se ne loguje |
| `REDIS_KEY_PREFIX` | default `ephelpdesk`; ioredis prefix dobija završni `:` zbog ACL `~ephelpdesk:*` |
| `QUEUE_PREFIX` | default `bull:ephelpdesk`; BullMQ `prefix` (ACL `~bull:ephelpdesk:*`) |

Nema `REDIS_URL` duplikata. Nema settings registry ključeva za Redis.

## Klijenti
- Opšti ioredis klijent: `lazyConnect: true`, `keyPrefix` iz `REDIS_KEY_PREFIX`. Nije dijeljena instanca s BullMQ.
- BullMQ: samo connection options (`maxRetriesPerRequest: null`, `lazyConnect: true`) + `prefix`. Nema `Queue` / `Worker` / job imena.

## Shutdown
Dok nema domain procesora, worker drži event loop keep-alive timerom (nije queue). `SIGINT` / `SIGTERM`: ugasi timer, `application.close()` (Redis `onModuleDestroy`), exit 0. API koristi `enableShutdownHooks()`. `quit()` ako je klijent aktivan, inače `disconnect()`.

## Namjerno NIJE implementirano
Durable queue, DLQ, retry UI, notification/email/SLA/ticket procesori, Redis adapter za Socket.IO, lažni jobovi.
