# CHANGELOG — settings-registry

## 2026-09-11
- Dodani `private.ticket.autoAssign.enabled`, `private.ticket.autoAssign.strategy` i `private.ticket.groupInbox.enabled` za group inbox i server-side auto-assign. Nisu routing ključevi i ne mijenjaju UNROUTED ponašanje.
- Dodan `private.install.completedByUserId` (private string, default `""`) uz postojeći `private.install.completedAt` za first-run wizard lock. Nema paralelnog install-state sistema.
- Dodani preostali `private.addons.*` ključevi iz install-wizard kataloga (`sla`, `edge`, `teamsStub`, `csat`, `autoAssign`, `approvals`, `confidential`, `kbIntercept`, `timeTracking`, `ticketSplit`, `bulkActions`, `savedViews`, `reports`, `serviceDowntime`). Email i dalje default `false`; SMTP off forsira email off. Nema paralelnog feature-flag sistema.
- Dodani `private.smtp.*` i `private.addons.email` ključevi za install SMTP korak. Password je secret; SMTP off forsira email addon na `false` kroz postojeći addon ključ.
- Settings mutacija (`setSettingValue` + `PUT /settings`) zahtijeva `reason` i piše `ChangeLog` sa redacted secretima. Dodani `private.changeLog.*` ključevi. Nema versioning/rollback/UI liste.

## 2026-09-10
- Dodani `private.services.onboardingWizard.*` ključevi za service onboarding wizard (enabled, requireValidationBeforeActivate, autoFillRouting). Nema frontend wizard settings UI.
- Dodani `private.ticket.forms.*` ključevi za schema-driven forme i form versioning. Nema settings JSON schema registry.
- Dodani `private.services.availability.*` i `private.services.downtimeScheduling.*` ključevi za runtime availability overlay i downtime prozore. Ticket create ostaje non-blocking.
- Dodani `private.services.lifecycle.*` ključevi (`enabled`, `allowedStatesCsv`, `defaultStateOnCreate`) za service catalog. Nema availability/downtime settings u ovom koraku.
- Dodani `private.readOnlyMode.*` ključevi za admin-module maintenance lock. Nema HTTP settings CRUD ni UI.
- Inicijalna matrica: public/private/secret visibility, retrieval granice, AppSetting overlay, secret isolation za Faza 0 skeleton.
- Dodani `private.auth.adRead.*` ključevi za directory-sync stub (`manual_only`, throttle, cache, base DN scope). Nema AD/LDAP/Graph kredencijala.
- Dodani `private.auth.azureTenantId` i `private.auth.azureClientId` (secret) za Entra/MSAL token validaciju. Nema client secret-a ni Graph kredencijala.
