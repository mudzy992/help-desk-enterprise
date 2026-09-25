import type { SettingDefinition } from '../settings.types';
import { addonSettings } from './addon-settings';
import { directorySyncSettings } from './directory-sync-settings';
import { foundationalSettings } from './foundational-settings';
import { maintenanceSettings } from './maintenance-settings';
import { readOnlyModeSettings } from './read-only-mode-settings';
import { serviceAvailabilitySettings } from './service-availability-settings';
import { serviceFormsSettings } from './service-forms-settings';
import { serviceLifecycleSettings } from './service-lifecycle-settings';
import { serviceOnboardingSettings } from './service-onboarding-settings';
import { changeLogSettings } from './change-log-settings';
import { configVersioningSettings } from './config-versioning-settings';
import { auditLogSettings } from './audit-log-settings';
import { reportsSettings } from './reports-settings';
import { observabilitySettings } from './observability-settings';
import { ticketSlaSettings } from './ticket-sla-settings';
import { smtpSettings } from './smtp-settings';
import { notificationEmailSettings } from './notification-email-settings';
import { i18nSettings } from './i18n-settings';
import { edgeExtensionSettings } from './edge-extension-settings';
import { integrationQueueSettings } from './integration-queue-settings';
import { teamsIntegrationSettings } from './teams-integration-settings';
import { ticketApprovalsSettings } from './ticket-approvals-settings';
import { ticketWaitingAndReopenSettings } from './ticket-waiting-and-reopen-settings';
import { ticketSplitSettings } from './ticket-split-settings';
import { ticketTemplatesSettings } from './ticket-templates-settings';
import { ticketForwardingSettings } from './ticket-forwarding-settings';
import { timeTrackingSettings } from './time-tracking-settings';
import { ticketBulkActionsSettings } from './ticket-bulk-actions-settings';
import { ticketSavedViewsSettings } from './ticket-saved-views-settings';
import { ticketAssignmentSettings } from './ticket-assignment-settings';
import { ticketAttachmentSettings } from './ticket-attachment-settings';
import { ticketCollaborationSettings } from './ticket-collaboration-settings';
import { ticketRoutingSettings } from './ticket-routing-settings';
import { knowledgeBaseSettings } from './knowledge-base-settings';
import { ticketCloseCodesSettings } from './ticket-close-codes-settings';
import { ticketRequiredFieldsSettings } from './ticket-required-fields-settings';
import { securityRedactionSettings } from './security-redaction-settings';
import { securitySafeLoggingSettings } from './security-safe-logging-settings';
import { ticketConfidentialSettings } from './ticket-confidential-settings';
import { guardrailsSettings } from './guardrails-settings';
import { ticketCsatSettings } from './ticket-csat-settings';
import { dataLifecycleSettings } from './data-lifecycle-settings';

export const applicationSettings: readonly SettingDefinition[] = [
  ...foundationalSettings,
  ...maintenanceSettings,
  ...directorySyncSettings,
  ...readOnlyModeSettings,
  ...serviceLifecycleSettings,
  ...serviceAvailabilitySettings,
  ...serviceFormsSettings,
  ...serviceOnboardingSettings,
  ...ticketRoutingSettings,
  ...ticketTemplatesSettings,
  ...ticketSlaSettings,
  ...ticketAssignmentSettings,
  ...ticketCollaborationSettings,
  ...ticketAttachmentSettings,
  ...ticketApprovalsSettings,
  ...ticketWaitingAndReopenSettings,
  ...ticketSplitSettings,
  ...ticketForwardingSettings,
  ...timeTrackingSettings,
  ...ticketBulkActionsSettings,
  ...ticketSavedViewsSettings,
  ...ticketCloseCodesSettings,
  ...ticketRequiredFieldsSettings,
  ...securityRedactionSettings,
  ...securitySafeLoggingSettings,
  ...ticketConfidentialSettings,
  ...guardrailsSettings,
  ...ticketCsatSettings,
  ...dataLifecycleSettings,
  ...changeLogSettings,
  ...configVersioningSettings,
  ...auditLogSettings,
  ...reportsSettings,
  ...observabilitySettings,
  ...knowledgeBaseSettings,
  ...smtpSettings,
  ...notificationEmailSettings,
  ...i18nSettings,
  ...edgeExtensionSettings,
  ...integrationQueueSettings,
  ...teamsIntegrationSettings,
  ...addonSettings,
];
