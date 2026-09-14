# Faza 2 — eventId + EDGE_EVENT producer

## Target

- `backend/src/modules/websocket/broadcast-user-realtime.ts` (~L11–16)
- `backend/src/modules/notifications/notification-realtime.types.ts` (~L17–22)
- `backend/src/modules/tickets/ticket-realtime.types.ts` (`EdgeEventRealtimePublish`)
- `backend/src/modules/integration-queue/parse-edge-event-integration-job-payload.ts`
- `backend/src/modules/notifications/fan-out/notifications-fan-out.service.ts` (~L41–44)
- unit testovi uz postojeće `broadcast-user-realtime.spec.ts` / hub spec

## eventId

WS `notification.created|read|unread-count` payload dobija:

- `eventId` — za created: `notification.id`; inače stabilan derivat (`${eventName}:${notificationId|readAll}:${occurredAt}` nije OK za dedup replay). Created = `notification.id`. Read/unread-count: `eventId` = `${eventName}:${userId}:${occurredAt}` nije potreban za toast; toast sluša **samo** `notification.created` + polling items.
- `createdAt` — već `occurredAt`; mapirati/aliasirati `createdAt` po RAW-u.

Edge queue payload: `{ eventId, createdAt, eventName, ticketId?, serviceName?, type }` — **bez** title/body.

## Producer

Kad in-app notifikacija nastane i Edge delivery gate prođe: `enqueue({ type: EDGE_EVENT, payload })`. Worker već publisha Redis → `EdgeEventRealtimeSubscriber` → isti user room.

Web klijent i extension mogu dobiti isti event dvaput (direct hub + queue). Dedup po `eventId` na extensionu.
