# CHANGELOG — websocket-gateway

## 2026-09-11
- HTTP CORS sada dijeli `CORS_ORIGIN` s Socket.IO; origin resolver je u `common/cors`.

## 2026-09-10
- Default verifier je session JWT iz authentication modula; handshake ugovor ostaje `{ token }` → `{ subjectId }`.
- Inicijalna matrica: Socket.IO handshake skeleton, provider-neutral verifier granica, minimalni `SocketPrincipal`, odbijanje neautentifikovanih konekcija.
