# MATRIX — integrations-durable-queue

## Cilj
Outgoing integracije (email, Edge eventi, Teams stub) idu kroz BullMQ + Redis worker. Postgres `IntegrationJob` je admin/audit sloj (PENDING / PROCESSING / COMPLETED / FAILED / DLQ) s ručnim retry.

## Procesi
| Proces | Enqueue | Processor | Prisma `IntegrationJob` | SMTP | WS emit |
|---|---|---|---|---|---|
| backend (HTTP) | da | ne | insert PENDING, admin list/retry | samo ako je queue OFF | subscriber Redis → `TicketRealtimeHub` |
| worker | delayed retry add | da (`EMAIL`, `EDGE_EVENT`, `TEAMS_STUB`) | PROCESSING / COMPLETED / FAILED / DLQ | da (samo EMAIL) | Redis publish, bez `WebsocketGateway` |

Queue name: `integration` (BullMQ prefix iz `QUEUE_PREFIX`, ACL `~bull:ephelpdesk:*`). Job data: `{ integrationJobId }`. `jobId` prvog enqueue-a = `IntegrationJob.id`.

## Settings
| Key | Default |
|---|---|
| `private.integrations.queue.enabled` | `true` |
| `private.integrations.queue.typesCsv` | `email,edge,teams` |
| `private.integrations.queue.maxAttempts` | `10` |
| `private.integrations.queue.initialBackoffSeconds` | `60` |
| `private.integrations.queue.maxBackoffSeconds` | `3600` |
| `private.integrations.queue.deadLetterAfterAttempts` | `10` |
| `private.integrations.queue.deadLetterRetentionDays` | `30` |
| `private.integrations.queue.workerPollSeconds` | `5` |
| `private.integrations.queue.adminUiEnabled` | `true` |

Tokeni u `typesCsv`: `email` → `EMAIL`, `edge` → `EDGE_EVENT`, `teams` → `TEAMS_STUB`.

## Tok
1. Producent zove `EnqueueIntegrationJobService`: insert `PENDING`, zatim `queue.add`.
2. Worker: `PROCESSING` + `attempts++`. Uspjeh → `COMPLETED`. Greška → `FAILED` + delayed re-add s backoff `min(initial * 2^(attempts-1), max)` sekundi.
3. Kad `attempts >= min(maxAttempts, deadLetterAfterAttempts)` → `DLQ` (nema novog BullMQ joba).
4. Admin `POST :id/retry`: samo `FAILED`/`DLQ` → `PENDING`, `attempts = 0`, odmah re-enqueue.
5. Queue OFF ili tip nije u `typesCsv`: email ide postojećim direktnim SMTP putem na API-ju (funkcionalnost se ne gubi).
6. HTTP ne čeka SMTP: fan-out enqueue-uje i vraća kontrolu.

## EMAIL
Payload: `{ userId, toAddress, subject, text, templateKey, dedupeKey }` — bez SMTP secreta. Worker učitava transport iz Settings i koristi `deliver-notification-email` (claim / send / mark sent / release).

## EDGE_EVENT
Payload: `{ userId, ticketId?, eventName, data }`. Worker `PUBLISH` / API `SUBSCRIBE` na kanal `integration-queue:edge-event` (ioredis pub/sub **ne** dodaje `keyPrefix`; ACL `&integration-queue:*`). Ako klijent ipak prefiksira: `&ephelpdesk:*`. API subscriber (postojeći Redis klijent `.duplicate()`) → `TicketRealtimeHub.publishEdgeEvent` → gateway emit na `user:{userId}` i opcionalno `ticket:{ticketId}`. Nije Socket.IO Redis adapter. Nema proizvođača u ovom sloju (Phase 9 Edge).

## TEAMS_STUB
Procesor postoji: log `would send to Teams` + payload metadata, zatim `COMPLETED`. Nema HTTP poziva ka webhook-u. Producent i settings su u `integrations-teams-stub`.

## Admin API
- Permission: `integrations.queue.manage` (ADMIN katalog + SuperAdmin).
- Guardovi: `SessionAuthenticationGuard` + `RoleGuard` + role ADMIN. Nema `OuAccessGuard` (`IntegrationJob` nema OU).
- `GET /integration-jobs?status=PENDING|FAILED|DLQ`
- `GET /integration-jobs/worker-status` → `{ status: active|stale|unknown, lastHeartbeatAt }`
- `POST /integration-jobs/:jobId/retry`
- `adminUiEnabled=false` → 403. Read-only mode: prefix `/integration-jobs` kao `settings`.

## Worker
Prisma + Settings + processor. Bez HTTP i bez `WebsocketGateway`. Shutdown: keep-alive timer + `application.close()` (BullMQ Worker `onModuleDestroy`, Redis, Prisma). `workerPollSeconds` = refresh settings + DLQ retention sweep, ne Redis poll.

### Worker heartbeat (health)
- Worker proces (`IntegrationQueueWorkerHeartbeatService`) piše ISO timestamp u Redis key `integration-queue:worker-heartbeat` svakih **10s** (TTL 30s; ioredis `keyPrefix` se primjenjuje).
- API čita isti key; **stale** ako je heartbeat stariji od **20s** (2× interval); **unknown** ako key nedostaje ili Redis read padne.
- Frontend Ops tab i `/admin/queue` dijele `IntegrationQueueCard` s badge-om `worker: aktivan|neaktivan|nepoznato` (poll ~15s). `/admin/queue` ostaje prečica na istu komponentu.

## Namjerno NIJE
Puni Teams konektor/HTTP delivery, Socket.IO Redis adapter, novi Redis klijent, Prisma šema izmjene.
