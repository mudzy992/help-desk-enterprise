# Edge Manifest V3 (F9-1) — overview

Novi client `edge-extension/` (Manifest V3) + mali backend dodaci. Isti Socket.IO handshake (`handshake.auth.token`) i `user:{userId}` kanal. Nema novog gatewaya.

## Stanje koda (provjereno)

| Stavka | Stanje |
|---|---|
| `edge-extension/` | ne postoji |
| WS gateway + `user:{userId}` join | postoji (`websocket.gateway.ts`) |
| Handshake `{ token }` → `{ subjectId }` | postoji (MATRIX websocket-gateway) |
| F7-A EDGE_EVENT queue (processor, Redis, subscriber, `broadcastEdgeEventRealtime`) | postoji |
| Producer koji **enqueue-a** `EDGE_EVENT` | **nema** (fan-out radi samo EMAIL) |
| `eventId` na WS payloadima | **nema** |
| Receipt endpoint | **nema** |
| `private.edgeExtension.*` settings | **nema** (samo `private.addons.edge`) |
| `edge.connect` / `edge.notify.receive` | **nema** |

## Odluke (predloženo)

1. **Handshake:** ne dirati ugovor. `extensionVersion` ide na HTTP bootstrap, ne u `handshake.auth`.
2. **Token:** samo SW memorija + `chrome.storage.session` (MV3 SW umire). Nikad `localStorage` / `chrome.storage.local`.
3. **Auth u ovom tasku:** popup `POST /auth/login` (local_dev). Entra/MSAL = kasnije (RAW).
4. **Guards:** `SessionAuthenticationGuard` + `RoleGuard` (USER+) kao `NotificationsController`. `OuAccessGuard` **ne** — nema `organizationalUnitId` (isti razlog kao config-versioning plan).
5. **Permissions:** dodati `edge.connect`, `edge.notify.receive`; grant svim default rolama uključujući USER (inače end-user ne može koristiti extension).
6. **Receipts:** `POST` + AuditLog (bez nove Prisma tabele). Idempotentno po `(userId, notificationId, kind)`.
7. **Polling:** postojeći `GET /notifications?unreadOnly=true`. Nema ticket-message API (F9-2).
8. **CORS:** `CORS_ORIGIN` CSV (desk + `chrome-extension://<id>`). Danas je namjerno single origin (`http-cors` MATRIX).
9. **Queue producer:** tanak enqueue `EDGE_EVENT` iz notification fan-out (gated settings), isti `eventId` kao WS `notification.created` da klijent dedup-uje.
10. **Chat/remote settings i popup inbox:** F9-2, ne registrirati/implementirati ovdje.

## Blocking pitanje

Vidi `01_phase-settings-and-matrix.md` — polaritet `killSwitchEnabled`.

## Van scope

Quick reply, Request Remote, `ms-quick-assist:`, content scripts, MSAL silent login, novi WS gateway, novi auth, frontend Desk UI, Faza 8 admin.
