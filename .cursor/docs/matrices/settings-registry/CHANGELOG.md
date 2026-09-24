# CHANGELOG — settings-registry

## 2026-09-24
- Dodan `private.reports.timeZone` (private, IANA zona, default `Europe/Sarajevo`): granica reporting dana za dashboard `openedToday` (`loadDashboardSummaryCounts` → `startOfCivilDay`). Dosadašnja granica je dolazila iz zone procesa (`new Date(y, m, d)`), pa je isti upit davao različit broj na `TZ=UTC` i `TZ=Europe/Sarajevo`. Keš ključ dashboarda sada nosi zonu.

## 2026-09-14
- Dodani `private.reports.*` i `private.dashboard.bottlenecks.*` za report packove i bottleneck window. Addon flag ostaje `private.addons.reports`. `packsJson` je secret.

## 2026-09-13
- Dodani `private.notifications.email.*` i `private.notifications.templates.*` za O365 email kanal (internal-only, template registry JSON). SMTP password ostaje secret. Nema paralelnog notification/settings sistema.

## 2026-09-11
- Dodani `private.csat.*` i `private.dataLifecycle.archive.*`. Addon flag ostaje `private.addons.csat`. Nema paralelnog feature-flag sistema.
- Dodani `private.guardrails.antiLoop.*` i `private.guardrails.bulkBroadcast.confirmAboveRecipients` za anti-loop/anti-spam. Nema paralelnog settings sistema.
- Dodani `private.ticket.confidential.*` i `private.security.safeLogging.*` za confidential ACL, break-glass i safe logging. Addon flag ostaje `private.addons.confidential`.
- Dodani `private.ticket.approvals.*` ključevi (`enabled`, secret `requiredByServiceJson`, `defaultApproverRole`, `allowRequesterManager`) za Pending Approval hold. Addon flag ostaje `private.addons.approvals`. Nema AD manager lookup-a.
- `private.auth.jwtSigningSecret` ostaje secret bez defaulta; install complete ga provisionira kad nedostaje. Nema env JWT ključa.
- Dodani `private.knowledgeBase.reviewCycle.*`, `private.knowledgeBase.feedback.*` i `private.knowledgeBase.ranking.useFeedbackWeight` za KB review/stale, feedback i ranking. Nema paralelnog settings sistema.
- Dodani `private.ticket.participants.*` i `private.ticket.chat.messageTypes.*` za participants model i typed chat. Time tracking ostaje na postojećem `private.addons.timeTracking`.
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
