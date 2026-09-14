# MATRIX — edge-extension-client

## Cilj
Manifest V3 companion klijent na **istim** Socket.IO kanalima kao web. Nema posebnog gatewaya ni auth ugovora.

## Kill switch (polaritet A)
`private.edgeExtension.killSwitchEnabled === true` → kill **aktiviran** → extension se **ne** konektuje i ne poll-a. Default `true`. SuperAdmin mora staviti `false` da bi klijent radio.

Konekcija (modul smije raditi) traži:
`private.addons.edge` ∧ `private.edgeExtension.enabled` ∧ `private.notifications.edge.enabled` ∧ kill switch **false** ∧ email domen ∧ `minClientVersion` (prazno = nema floor).

`ws.enabled` je odvojeno: `false` → nema Socket.IO, polling ako je fallback uključen.

## Handshake
Isti ugovor: `handshake.auth.token`. `extensionVersion` ide na `GET /edge-extension/bootstrap?extensionVersion=`, ne u handshake.

## Token
Samo service-worker memorija + `chrome.storage.session`. Nikad `localStorage` / `chrome.storage.local` za tajne. API base URL smije u `chrome.storage.local`.

## Eventi
Sluša `user:{userId}` event `notification.created` (isti payload kao web) plus `eventId` + `createdAt`. Toast samo za taj event. Dedup po `eventId` (za created = `notification.id`).

Outgoing `EDGE_EVENT` job (F7-A) enqueue-a se kad je addon+modul+edge kanal + queue `edge` token uključen. Payload je isti client envelope; web `applyNotificationCreated` već dedup-uje po `notification.id`.

## Polling
Ako WS padne, `connect_error`, ili `ws.enabled` false: `GET /notifications?unreadOnly=true` na `pollingFallback.intervalSeconds` (clamp 60–120, default 90). Samo unread notifikacije. MV3 service worker koristi Socket.IO `transports: ['websocket']` (nema XHR polling).

## Toasts
Ako `redactedPreviews` (default true): OS toast = tip + ticketId. Nikad title/body.

## Receipts
`POST /edge-extension/receipts` `{ notificationId, kind: delivered|opened, eventId? }` → AuditLog `notification.receipt`. Idempotentno po (user, notification, kind). Guards: Session + Role USER+ (bez `OuAccessGuard` i bez `RequirePermissions` — OU-scoped assignment ne zadovoljava unscoped permission check). Katalog ipak ima `edge.connect` / `edge.notify.receive` na default USER+.

## CORS
`CORS_ORIGIN` CSV: desk origin + `chrome-extension://<id>`. Nikad `*`.

## Namjerno NIJE
Content scripts, MSAL, novi gateway, nova Prisma tabela. Chat + Request Remote: `.cursor/docs/matrices/edge-extension-chat-remote-contract/`.
