# CHANGELOG — in-app-notifications

## 2026-09-13
- Socket.IO `notification.created` / `read` / `unread-count` nakon persist/mark-as-read. Inbox ostaje source of truth; WS ne kreira dupli zapis.
- Persistent in-app inbox: `Notification.dedupeKey` + `readAt`, list/unread/mark-as-read API, fan-out iz `TicketRealtimeHub` / SLA `SYSTEM_EVENT`. Header bell UI.
