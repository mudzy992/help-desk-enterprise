# MATRIX — settings-registry

## Cilj
Centralni, tipizirani katalog aplikacijskih postavki. Registry je source of truth za ponašanje; `AppSetting` čuva samo trenutnu vrijednost.

## Klasifikacija
- `public` — smije se vratiti kroz `getPublicSettings()`; nikad credentials.
- `private` — serverside konfiguracija; nije u public retrieval; nije secret materijal.
- `secret` — credentials/tokeni; samo `getSecretForInternalUse()`; nikad plaintext u public/private snapshotima, logovima ili običnim error porukama.

Visibility se **ne** izvodi iz imena ključa. DB `AppSetting.scope` / `isSecret` se ne koriste za exposure.

## Retrieval
- `getPublicSettings()` — samo registry `public` ključevi.
- `getPrivateSettings()` — samo registry `private` ključevi.
- `getSetting(key)` — public/private; secret baca grešku.
- `getSecretForInternalUse(key)` — samo secret; ostalo baca grešku.
- Nema `getAllSettings()`.
- Nepoznat ključ → `SettingsError`.
- Nema DB reda: default ako postoji; inače `undefined` ako nije required, ili `SettingsError` ako jeste.

## Persistence
- Model: postojeći `AppSetting` (bez schema izmjene).
- Upis kopira registry classification u `scope` + `isSecret` (secret → `PRIVATE` + `isSecret=true`).
- Čitanje overlay: stored value > default.

## Zabranjeno
- Secret default vrijednosti.
- Logovanje/dump setting vrijednosti na startupu.
- HTTP CRUD / Settings UI / RBAC u ovom skeletonu.
- Tumačenje ad-hoc stringova (`smtp.host`) van registryja.

## Seed ključevi (skeleton)
- `public.branding.appName` (public, string, default `EP-HelpDesk`)
- `private.install.completedAt` (private, string, default `""`)
- `private.auth.mode` (private, `local` | `entra_ad`, default `local`)
- `private.auth.jwtSigningSecret` (secret, string, bez defaulta, nije required)
- `private.auth.azureTenantId` (secret, string, bez defaulta, nije required)
- `private.auth.azureClientId` (secret, string, bez defaulta, nije required)
- `private.auth.adRead.enabled` (private, boolean, default `false`)
- `private.auth.adRead.strategy` (private, `manual_only` | `scheduled`, default `manual_only`)
- `private.auth.adRead.usersBaseDn` (private, string, default `""`)
- `private.auth.adRead.groupsBaseDn` (private, string, default `""`)
- `private.auth.adRead.maxQueriesPerSecond` (private, number, default `0.5`)
- `private.auth.adRead.cacheTtlMinutes` (private, number, default `30`)
- `private.auth.adRead.ouTreeCacheTtlHours` (private, number, default `12`)
- `private.readOnlyMode.enabled` (private, boolean, default `true`)
- `private.readOnlyMode.modulesCsv` (private, string, default `admin,settings,routing,service_catalog,service_forms,sla`)
- `private.readOnlyMode.activeModulesCsv` (private, string, default `""`)
- `private.readOnlyMode.bypassRolesCsv` (private, string, default `SUPER_ADMIN`)
- `private.services.lifecycle.enabled` (private, boolean, default `true`)
- `private.services.lifecycle.allowedStatesCsv` (private, string, default `DRAFT,ACTIVE,DEPRECATED`)
- `private.services.lifecycle.defaultStateOnCreate` (private, string, default `DRAFT`)
- `private.services.availability.enabled` (private, boolean, default `true`)
- `private.services.availability.allowedStatusesCsv` (private, string, default `OPERATIONAL,DEGRADED,DOWN,MAINTENANCE`)
- `private.services.availability.showStatusInCatalog` (private, boolean, default `true`)
- `private.services.availability.showStatusInTicketCreate` (private, boolean, default `true`)
- `private.services.availability.changeRequiresReason` (private, boolean, default `true`)
- `private.services.downtimeScheduling.enabled` (private, boolean, default `true`)
- `private.services.downtimeScheduling.autoSetMaintenanceStatus` (private, boolean, default `true`)
- `private.services.downtimeScheduling.autoRestoreOperational` (private, boolean, default `true`)
- `private.services.downtimeScheduling.requireReason` (private, boolean, default `true`)
- `private.ticket.forms.enabled` (private, boolean, default `true`)
- `private.ticket.forms.requireStructuredFields` (private, boolean, default `true`)
- `private.ticket.forms.versioning.enabled` (private, boolean, default `true`)
- `private.ticket.forms.versioning.allowMultipleActiveVersions` (private, boolean, default `false`)
- `private.ticket.forms.versioning.requireVersionOnTicket` (private, boolean, default `true`)
