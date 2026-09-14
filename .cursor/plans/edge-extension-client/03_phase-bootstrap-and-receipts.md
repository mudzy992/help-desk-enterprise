# Faza 3 — Bootstrap + receipts + CORS

## Target

- Novi modul `backend/src/modules/edge-extension/` (~100–150 linija po fajlu):
  - `edge-extension.controller.ts`
  - `edge-extension.service.ts`
  - `edge-extension.module.ts`
  - `load-edge-extension-configuration.ts`
  - `dto/record-edge-notification-receipt.dto.ts`
  - `edge-extension.service.spec.ts` (receipt + bootstrap deny)
- `backend/src/modules/audit-log/audit-log.constants.ts` — action + entityType
- `backend/src/common/cors/resolve-cors-origin.ts` + `http-cors` MATRIX (CSV origin)
- `backend/src/app.module.ts` import

## HTTP

`GET /edge-extension/bootstrap` — auth + `edge.connect`. Vraća flags, clamped poll interval, `deskPublicUrl` iz `APP_PUBLIC_URL`, `allowed` bool + reason (`KILL_SWITCH` | `DISABLED` | `DOMAIN` | `VERSION` | `ADDON_OFF` | `OK`). Extension **ne** čita puni settings registry.

`POST /edge-extension/receipts` — `{ notificationId, kind: 'delivered' | 'opened', eventId }`. Auth + `edge.notify.receive`. Service: notifikacija mora pripadati calleru; `recordAuditEntry`; 200 i na duplikat.

## CORS

`resolveCorsOrigin`: trim, split `,`, prazno → `false`. Socket.IO i HTTP dijele isti resolver. Dokumentovati desk + `chrome-extension://<id>` u Coolify `CORS_ORIGIN`. Nikad `*`.
