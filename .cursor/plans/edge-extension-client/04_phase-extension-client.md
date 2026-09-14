# Faza 4 — `edge-extension/` klijent

Root sibling uz `backend/` i `frontend/` (nije Dio frontend Vite appa).

```
edge-extension/
  package.json
  tsconfig.json
  vite.config.ts          # MV3 SW + popup bundle
  manifest.json
  src/
    background.ts         # entry, <150 linija, delegira
    popup/index.html
    popup/popup.ts
    popup/popup.css
    lib/memory-token.ts
    lib/bootstrap-client.ts
    lib/socket-session.ts
    lib/polling-fallback.ts
    lib/redacted-toast.ts
    lib/event-dedup.ts
    lib/receipts-client.ts
    lib/open-in-desk.ts
```

## Ponašanje

1. Popup: email/password → `POST /auth/login` → token u memoriji/`session`. Link “Open in Desk” (`APP_PUBLIC_URL` / bootstrap `deskPublicUrl`). Nema inbox/quick reply.
2. SW: bootstrap; ako `allowed` false → disconnect, nema poll.
3. WS: `socket.io-client`, `auth: { token }`, `reconnection` + max backoff iz settings. Join je automatski `user:{userId}` na serveru.
4. WS drop → throttled poll (`intervalSeconds`, samo unread notifs). WS recover → stop poll.
5. Toast: `chrome.notifications` — tip + ticketId (+ serviceName ako backend pošalje). Nikad title/body. Klik → Open in Desk ticket URL + `opened` receipt.
6. Dedup: in-memory Set `eventId` (cap, FIFO). Isti id iz WS i poll = jedan toast.
7. `delivered` receipt odmah nakon prihvaćenog (neduplog) eventa, ako `receipts.enabled`.

Manifest: `permissions: ['notifications', 'storage']`, `host_permissions` API + desk, `background.service_worker`, nema content_scripts.
