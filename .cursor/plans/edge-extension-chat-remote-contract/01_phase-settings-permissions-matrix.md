# Faza 1 — Settings, permissions, bootstrap, matrica

## Fajlovi

- `backend/src/modules/settings/setting-keys.ts` (~L313)
- `backend/src/modules/settings/definitions/edge-extension-settings.ts` (~L12–95)
- `backend/src/modules/edge-extension/edge-extension.types.ts`, `load-edge-extension-configuration.ts`, `edge-extension.service.ts` (`buildBootstrap` ~L60)
- `backend/src/modules/authorization/authorization.constants.ts` (`permissionKeys`, `edgeClientPermissionKeys`)
- `backend/src/modules/authorization/default-role-permissions.spec.ts`
- `frontend/src/lib/session/permission-keys.ts` (samo ako Desk dugme čita permission; inače staff via ticket access)
- `edge-extension/src/lib/bootstrap-client.ts`
- `.cursor/docs/matrices/edge-extension-chat-remote-contract/MATRIX.md` + `CHANGELOG.md`
- Dopuna `edge-extension-client` MATRIX “Namjerno NIJE” → F9-2
- `.cursor/docs/03-edge-extension.md`

## Settings (registry, RAW defaulti)

| Key | Type | Default |
|---|---|---|
| `private.edgeExtension.chat.enabled` | boolean | true |
| `private.edgeExtension.chat.maxMessagesPerTicket` | number | 50 (assert ≥ 1) |
| `private.edgeExtension.attachments.enabled` | boolean | **false** |
| `private.edgeExtension.remote.enabled` | boolean | true |
| `private.edgeExtension.remote.rateLimitMinutesPerTicket` | number | 10 (assert ≥ 1) |
| `private.edgeExtension.remote.requireUserClickToOpenQuickAssist` | boolean | true |
| `private.edgeExtension.remote.auditAcknowledge` | boolean | true |

Bootstrap response proširiti ovim flagovima + `subjectId` (popup inbox filter; izbjegava extra round-trip ako želimo — alternative: `GET /auth/session`). Predlog: `subjectId` na bootstrap da popup ostane tanak.

## Permissions (katalog)

- `ticket.message.send` — USER+ (quick reply)
- `ticket.remote.open_quick_assist` — USER+ (ack/open)

Nisu HTTP `RequirePermissions`. Policy pack IT nasljeđuje agent/admin defaulte.

Split `edge-extension.service.ts` ako pređe ~150 linija (već ~140).
