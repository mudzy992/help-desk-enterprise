import { addonSettingKey } from './addon-catalog';

export const settingKeys = {
  publicBrandingAppName: 'public.branding.appName',
  privateInstallCompletedAt: 'private.install.completedAt',
  privateInstallCompletedByUserId: 'private.install.completedByUserId',
  privateAuthMode: 'private.auth.mode',
  privateAuthJwtSigningSecret: 'private.auth.jwtSigningSecret',
  privateAuthAzureTenantId: 'private.auth.azureTenantId',
  privateAuthAzureClientId: 'private.auth.azureClientId',
  privateAuthAdLdapsUrlsCsv: 'private.auth.adLdapsUrlsCsv',
  privateAuthAdBindDn: 'private.auth.adBindDn',
  privateAuthAdBindPassword: 'private.auth.adBindPassword',
  privateAuthAdReadEnabled: 'private.auth.adRead.enabled',
  privateAuthAdReadStrategy: 'private.auth.adRead.strategy',
  privateAuthAdReadUsersBaseDn: 'private.auth.adRead.usersBaseDn',
  privateAuthAdReadGroupsBaseDn: 'private.auth.adRead.groupsBaseDn',
  privateAuthAdReadMaxQueriesPerSecond: 'private.auth.adRead.maxQueriesPerSecond',
  privateAuthAdReadCacheTtlMinutes: 'private.auth.adRead.cacheTtlMinutes',
  privateAuthAdReadOuTreeCacheTtlHours: 'private.auth.adRead.ouTreeCacheTtlHours',
  privateReadOnlyModeEnabled: 'private.readOnlyMode.enabled',
  privateReadOnlyModeModulesCsv: 'private.readOnlyMode.modulesCsv',
  privateReadOnlyModeActiveModulesCsv: 'private.readOnlyMode.activeModulesCsv',
  privateReadOnlyModeBypassRolesCsv: 'private.readOnlyMode.bypassRolesCsv',
  privateServicesLifecycleEnabled: 'private.services.lifecycle.enabled',
  privateServicesLifecycleAllowedStatesCsv:
    'private.services.lifecycle.allowedStatesCsv',
  privateServicesLifecycleDefaultStateOnCreate:
    'private.services.lifecycle.defaultStateOnCreate',
  privateServicesAvailabilityEnabled: 'private.services.availability.enabled',
  privateServicesAvailabilityAllowedStatusesCsv:
    'private.services.availability.allowedStatusesCsv',
  privateServicesAvailabilityShowStatusInCatalog:
    'private.services.availability.showStatusInCatalog',
  privateServicesAvailabilityShowStatusInTicketCreate:
    'private.services.availability.showStatusInTicketCreate',
  privateServicesAvailabilityChangeRequiresReason:
    'private.services.availability.changeRequiresReason',
  privateServicesDowntimeSchedulingEnabled:
    'private.services.downtimeScheduling.enabled',
  privateServicesDowntimeSchedulingAutoSetMaintenanceStatus:
    'private.services.downtimeScheduling.autoSetMaintenanceStatus',
  privateServicesDowntimeSchedulingAutoRestoreOperational:
    'private.services.downtimeScheduling.autoRestoreOperational',
  privateServicesDowntimeSchedulingRequireReason:
    'private.services.downtimeScheduling.requireReason',
  privateTicketFormsEnabled: 'private.ticket.forms.enabled',
  privateTicketFormsRequireStructuredFields:
    'private.ticket.forms.requireStructuredFields',
  privateTicketFormsVersioningEnabled: 'private.ticket.forms.versioning.enabled',
  privateTicketFormsVersioningAllowMultipleActiveVersions:
    'private.ticket.forms.versioning.allowMultipleActiveVersions',
  privateTicketFormsVersioningRequireVersionOnTicket:
    'private.ticket.forms.versioning.requireVersionOnTicket',
  privateServicesOnboardingWizardEnabled:
    'private.services.onboardingWizard.enabled',
  privateServicesOnboardingWizardRequireValidationBeforeActivate:
    'private.services.onboardingWizard.requireValidationBeforeActivate',
  privateServicesOnboardingWizardAutoFillRoutingEnabled:
    'private.services.onboardingWizard.autoFillRouting.enabled',
  privateServicesOnboardingWizardAutoFillRoutingRequireConfirm:
    'private.services.onboardingWizard.autoFillRouting.requireConfirm',
  privateTicketUnroutedQueueEnabled: 'private.ticket.unroutedQueue.enabled',
  privateTicketUnroutedQueueOwnerRole: 'private.ticket.unroutedQueue.ownerRole',
  privateTicketAutoAssignEnabled: 'private.ticket.autoAssign.enabled',
  privateTicketAutoAssignStrategy: 'private.ticket.autoAssign.strategy',
  privateTicketGroupInboxEnabled: 'private.ticket.groupInbox.enabled',
  privateTicketParticipantsEnabled: 'private.ticket.participants.enabled',
  privateTicketParticipantsDefaultOnCreateCsv:
    'private.ticket.participants.defaultOnCreateCsv',
  privateTicketChatMessageTypesEnabled:
    'private.ticket.chat.messageTypes.enabled',
  privateTicketChatMessageTypesAllowedCsv:
    'private.ticket.chat.messageTypes.allowedCsv',
  privateTicketAttachmentsEnabled: 'private.ticket.attachments.enabled',
  privateTicketAttachmentsMaxFileSizeMb:
    'private.ticket.attachments.maxFileSizeMb',
  privateTicketAttachmentsAllowedMimeTypesCsv:
    'private.ticket.attachments.allowedMimeTypesCsv',
  privateTicketAttachmentsAllowedExtensionsCsv:
    'private.ticket.attachments.allowedExtensionsCsv',
  privateTicketAttachmentsMaxFilesPerTicket:
    'private.ticket.attachments.maxFilesPerTicket',
  privateTicketAttachmentsMaxFilesPerMessage:
    'private.ticket.attachments.maxFilesPerMessage',
  privateTicketAttachmentsDangerousExtensionsBlocklistCsv:
    'private.ticket.attachments.dangerousExtensionsBlocklistCsv',
  privateTicketAttachmentsRetentionDays:
    'private.ticket.attachments.retentionDays',
  privateTicketApprovalsEnabled: 'private.ticket.approvals.enabled',
  privateTicketApprovalsRequiredByServiceJson:
    'private.ticket.approvals.requiredByServiceJson',
  privateTicketApprovalsDefaultApproverRole:
    'private.ticket.approvals.defaultApproverRole',
  privateTicketApprovalsAllowRequesterManager:
    'private.ticket.approvals.allowRequesterManager',
  privateTicketWaitingForUserEnabled: 'private.ticket.waitingForUser.enabled',
  privateTicketWaitingForUserReminderAfterDays:
    'private.ticket.waitingForUser.reminderAfterDays',
  privateTicketWaitingForUserAutoCloseAfterDays:
    'private.ticket.waitingForUser.autoCloseAfterDays',
  privateTicketReopenEnabled: 'private.ticket.reopen.enabled',
  privateTicketReopenWindowDays: 'private.ticket.reopen.windowDays',
  privateTicketSplitEnabled: 'private.ticket.split.enabled',
  privateTicketSplitAllowAttachmentMove:
    'private.ticket.split.allowAttachmentMove',
  privateTicketSplitAllowMessageCopy: 'private.ticket.split.allowMessageCopy',
  privateTicketSplitRequireReason: 'private.ticket.split.requireReason',
  privateTicketSavedViewsEnabled: 'private.ticket.savedViews.enabled',
  privateTicketSavedViewsMaxPerUser: 'private.ticket.savedViews.maxPerUser',
  privateTicketSavedViewsAllowDefaultView:
    'private.ticket.savedViews.allowDefaultView',
  privateTicketSavedViewsAllowSharing: 'private.ticket.savedViews.allowSharing',
  privateTicketBulkActionsEnabled: 'private.ticket.bulkActions.enabled',
  privateTicketBulkActionsAllowCrossOuForSuperAdmin:
    'private.ticket.bulkActions.allowCrossOuForSuperAdmin',
  privateTicketBulkActionsRequireSameOuAndGroup:
    'private.ticket.bulkActions.requireSameOuAndGroup',
  privateTicketBulkActionsDisallowBulkClose:
    'private.ticket.bulkActions.disallowBulkClose',
  privateTicketBulkActionsAllowedActionTypesCsv:
    'private.ticket.bulkActions.allowedActionTypesCsv',
  privateTicketBulkActionsBroadcastEnableInApp:
    'private.ticket.bulkActions.broadcast.enableInApp',
  privateTicketBulkActionsBroadcastEnableEmail:
    'private.ticket.bulkActions.broadcast.enableEmail',
  privateTicketBulkActionsBroadcastRequirePreview:
    'private.ticket.bulkActions.broadcast.requirePreview',
  privateTicketBulkActionsBroadcastRateLimitPerMinute:
    'private.ticket.bulkActions.broadcast.rateLimitPerMinute',
  privateTicketBulkActionsBroadcastStructuredEnabled:
    'private.ticket.bulkActions.broadcast.structuredEnabled',
  privateTicketBulkActionsBroadcastRequiredFieldsCsv:
    'private.ticket.bulkActions.broadcast.requiredFieldsCsv',
  privateTicketBulkActionsBroadcastAllowWorkaround:
    'private.ticket.bulkActions.broadcast.allowWorkaround',
  privateTicketBulkActionsBroadcastAllowLinks:
    'private.ticket.bulkActions.broadcast.allowLinks',
  privateTicketBulkActionsAuditBatchIdEnabled:
    'private.ticket.bulkActions.auditBatchIdEnabled',
  privateChangeLogSettingsEnabled: 'private.changeLog.settings.enabled',
  privateChangeLogRoutingEnabled: 'private.changeLog.routing.enabled',
  privateChangeLogIncludeDiff: 'private.changeLog.includeDiff',
  privateChangeLogRequireReason: 'private.changeLog.requireReason',
  privateSmtpEnabled: 'private.smtp.enabled',
  privateSmtpHost: 'private.smtp.host',
  privateSmtpPort: 'private.smtp.port',
  privateSmtpTls: 'private.smtp.tls',
  privateSmtpUsername: 'private.smtp.username',
  privateSmtpPassword: 'private.smtp.password',
  privateSmtpFromAddress: 'private.smtp.fromAddress',
  privateAddonsSla: addonSettingKey('sla'),
  privateAddonsEmail: addonSettingKey('email'),
  privateAddonsEdge: addonSettingKey('edge'),
  privateAddonsTeamsStub: addonSettingKey('teamsStub'),
  privateAddonsCsat: addonSettingKey('csat'),
  privateAddonsAutoAssign: addonSettingKey('autoAssign'),
  privateAddonsApprovals: addonSettingKey('approvals'),
  privateAddonsConfidential: addonSettingKey('confidential'),
  privateAddonsKbIntercept: addonSettingKey('kbIntercept'),
  privateAddonsTimeTracking: addonSettingKey('timeTracking'),
  privateAddonsTicketSplit: addonSettingKey('ticketSplit'),
  privateAddonsBulkActions: addonSettingKey('bulkActions'),
  privateAddonsSavedViews: addonSettingKey('savedViews'),
  privateAddonsReports: addonSettingKey('reports'),
  privateAddonsServiceDowntime: addonSettingKey('serviceDowntime'),
  privateKnowledgeBaseReviewCycleEnabled:
    'private.knowledgeBase.reviewCycle.enabled',
  privateKnowledgeBaseReviewCycleDefaultReviewDays:
    'private.knowledgeBase.reviewCycle.defaultReviewDays',
  privateKnowledgeBaseReviewCycleStaleAfterDays:
    'private.knowledgeBase.reviewCycle.staleAfterDays',
  privateKnowledgeBaseFeedbackEnabled: 'private.knowledgeBase.feedback.enabled',
  privateKnowledgeBaseFeedbackOneVotePerUserPerArticle:
    'private.knowledgeBase.feedback.oneVotePerUserPerArticle',
  privateKnowledgeBaseRankingUseFeedbackWeight:
    'private.knowledgeBase.ranking.useFeedbackWeight',
  privateTicketCloseCodesEnabled: 'private.ticket.closeCodes.enabled',
  privateTicketCloseCodesAllowedCodesCsv:
    'private.ticket.closeCodes.allowedCodesCsv',
  privateTicketCloseCodesRequireOnResolve:
    'private.ticket.closeCodes.requireOnResolve',
  privateWorkflowRequiredFieldsEnabled:
    'private.workflow.requiredFields.enabled',
  privateWorkflowRequiredFieldsGlobalRequiredOnResolveCsv:
    'private.workflow.requiredFields.globalRequiredOnResolveCsv',
  privateWorkflowRequiredFieldsByServiceJson:
    'private.workflow.requiredFields.byServiceJson',
  privateSecurityRedactionEnabled: 'private.security.redaction.enabled',
  privateSecurityRedactionMode: 'private.security.redaction.mode',
  privateSecurityRedactionPatternsJson:
    'private.security.redaction.patternsJson',
  privateSecurityRedactionApplyToFieldsCsv:
    'private.security.redaction.applyToFieldsCsv',
  privateTicketConfidentialEnabled: 'private.ticket.confidential.enabled',
  privateTicketConfidentialDefaultForServicesCsv:
    'private.ticket.confidential.defaultForServicesCsv',
  privateTicketConfidentialAllowedViewerRolesCsv:
    'private.ticket.confidential.allowedViewerRolesCsv',
  privateTicketConfidentialAllowedViewerGroupIdsCsv:
    'private.ticket.confidential.allowedViewerGroupIdsCsv',
  privateTicketConfidentialBreakGlassEnabled:
    'private.ticket.confidential.breakGlassEnabled',
  privateTicketConfidentialBreakGlassAllowedRolesCsv:
    'private.ticket.confidential.breakGlassAllowedRolesCsv',
  privateTicketConfidentialBreakGlassRequiresReason:
    'private.ticket.confidential.breakGlassRequiresReason',
  privateTicketConfidentialAuditViews: 'private.ticket.confidential.auditViews',
  privateSecuritySafeLoggingEnabled: 'private.security.safeLogging.enabled',
  privateSecuritySafeLoggingLevelsCsv:
    'private.security.safeLogging.levelsCsv',
  privateSecuritySafeLoggingRedactFieldsCsv:
    'private.security.safeLogging.redactFieldsCsv',
} as const;

export type SettingKey = (typeof settingKeys)[keyof typeof settingKeys];
