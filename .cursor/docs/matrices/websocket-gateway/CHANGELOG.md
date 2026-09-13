# CHANGELOG — websocket-gateway

## 2026-09-13
- Ticket/chat + notification + settings realtime: `ticket.updated`, `notification.created`/`read`/`unread-count`, `settings.updated`, `session.invalidated`. Auth handshake i ticket join ostaju isti. Nema Redis adaptera ni typing indikatora.
- HTTP CORS sada dijeli `CORS_ORIGIN` s Socket.IO; origin resolver je u `common/cors`.

## 2026-09-10
- Default verifier je session JWT iz authentication modula; handshake ugovor ostaje `{ token }` → `{ subjectId }`.
- Inicijalna matrica: Socket.IO handshake skeleton, provider-neutral verifier granica, minimalni `SocketPrincipal`, odbijanje neautentifikovanih konekcija.
