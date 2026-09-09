# Realtime (Socket.IO)

**Analysis Date:** 2026-04-27

## Server (backend)

**Socket.IO dependencies:** Present (declared).
- `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io`: `backend/package.json`

**Gateway implementation:** Not detected.
- No `backend/src/` directory exists; therefore no `@WebSocketGateway()` usage can exist in this repo snapshot.

## Clients

**Web client dependency:** Present (declared).
- `socket.io-client`: `frontend/package.json`

**Web client integration code:** Not detected.
- No `frontend/src/` directory exists; therefore no socket initialization/usage is present.

## Realtime policy docs (repo guidance; not implementation)

- Settings/notifications realtime guidance is documented in `.cursor/rules/design-settings-realtime-notifications.mdc`.
- Notifications baseline doc exists: `.cursor/docs/notifications.md`.

## Current status

**Not implemented yet in code.** Only dependencies and policies are present.

---

*Realtime inventory: 2026-04-27*
