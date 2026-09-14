# Faza 1 — Settings, permissions, matrice

## Target

- `backend/src/modules/settings/setting-keys.ts` (kraj objekta, ~L164 i ~L312)
- `backend/src/modules/settings/definitions/edge-extension-settings.ts` (novi)
- `backend/src/modules/settings/definitions/application-settings.ts` (~L72)
- `backend/src/modules/settings/to-settings-realtime-payload.ts` (~L24) — broadcast `private.edgeExtension.*`
- `backend/src/modules/authorization/authorization.constants.ts` (~L10, ~L67)
- `.cursor/docs/matrices/edge-extension-client/MATRIX.md` + `CHANGELOG.md` (novo)
- `.cursor/docs/03-edge-extension.md` (stale “van MVP-a”)

## Settings (F9-1 only)

Registrirati RAW 693–704 + `private.notifications.edge.enabled` (default true). Chat/remote (705–711) ostaju F9-2.

Clamp: `pollingFallback.intervalSeconds` 60–120 (default 90). `reconnectMaxBackoffSeconds` default 60.

## Blocking: kill switch polaritet

Ključ `private.edgeExtension.killSwitchEnabled` default **true**. Dva čitanja:

- **A (preporuka, ops):** `true` = kill **aktiviran** → **ne** konektuj. Default = ugašeno dok SuperAdmin ne stavi `false`.
- **B (doslovno “ako je isključen”):** `true` = radi, `false` = ne konektuj. Default = konektuj.

Konekcija (nakon potvrde polariteta) traži i:

`private.addons.edge` ∧ `private.edgeExtension.enabled` ∧ `private.notifications.edge.enabled` ∧ `ws.enabled` ∧ domain match ∧ verzija ≥ `minClientVersion` (prazno = nema floor).
