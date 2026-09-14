# CHANGELOG — edge-extension-client

## 2026-09-14
- F9-2: chat/remote izdvojeni u `edge-extension-chat-remote-contract`. Ova matrica ostaje WS/poll/receipts.
- Socket.IO u service workeru: samo `websocket` transport (XHR polling ne postoji u MV3 SW). `connect_error` pali isti unread poll kao disconnect.
- F9-1: MV3 background (WS + throttled unread poll), redacted OS toasts, eventId dedup, delivered/opened receipts, bootstrap flags. Kill switch polaritet A (`true` = ne konektuj). Queue producer `EDGE_EVENT` za `notification.created`. CORS CSV. Nema chat/remote.
