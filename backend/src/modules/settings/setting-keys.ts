import { addonSettingKey } from './addon-catalog';

export const settingKeys = {
  publicBrandingAppName: 'public.branding.appName',
  publicBrandingTagline: 'public.branding.tagline',
  publicBrandingOrganizationName: 'public.branding.organizationName',
  publicBrandingLogoDataUrl: 'public.branding.logoDataUrl',
  publicBrandingSupportEmail: 'public.branding.supportEmail',
  publicBrandingSupportUrl: 'public.branding.supportUrl',
  publicMaintenanceEnabled: 'public.maintenance.enabled',
  publicMaintenanceMessage: 'public.maintenance.message',
  publicMaintenanceFromAt: 'public.maintenance.fromAt',
  publicMaintenanceToAt: 'public.maintenance.toAt',
  publicMaintenanceScope: 'public.maintenance.scope',
  publicMaintenanceAffectedServicesCsv:
    'public.maintenance.affectedServicesCsv',
  publicMaintenanceIsBlocking: 'public.maintenance.isBlocking',
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
  privateAuthAdReadSource: 'private.auth.adRead.source',
  privateAuthAdReadPageSize: 'private.auth.adRead.pageSize',
  privateAuthAdReadUserFilter: 'private.auth.adRead.userFilter',
  privateAuthAdReadRetryBackoffMinutes: 'private.auth.adRead.retryBackoffMinutes',
  privateAuthAdReadSyncCooldownMinutes: 'private.auth.adRead.syncCooldownMinutes',
  privateAuthAdReadMaxDeactivationPercent:
    'private.auth.adRead.maxDeactivationPercent',
  privateAuthAdReadScheduleCron: 'private.auth.adRead.scheduleCron',
  privateAuthOuMappingStrategy: 'private.auth.ouMappingStrategy',
  privateAuthOuMappingOverridesJson: 'private.auth.ouMappingOverridesJson',
  privateAuthRoleSource: 'private.auth.roleSource',
  privateAuthAdRoleGroupDnAdmin: 'private.auth.adRoleGroupDnAdmin',
  privateAuthAdRoleGroupDnAgent: 'private.auth.adRoleGroupDnAgent',
  privateAuthEntraJitProvisioning: 'private.auth.entra.jitProvisioning',
  privateAuthEntraSingleLogout: 'private.auth.entra.singleLogout',
  // Paket 2.1: account security
  privateAuthMfaRequiredForAdmins: 'private.auth.mfa.requiredForAdmins',
  privateAuthMfaAllowOptional: 'private.auth.mfa.allowOptional',
  privateAuthMfaIssuerName: 'private.auth.mfa.issuerName',
  privateAuthPasswordMinLength: 'private.auth.password.minLength',
  privateAuthPasswordBlocklistEnabled: 'private.auth.password.blocklist.enabled',
  privateAuthPasswordOrganisationWordsCsv: 'private.auth.password.organisationWordsCsv',
  privateAuthPasswordHistoryCount: 'private.auth.password.historyCount',
  privateAuthPasswordMaxAgeDays: 'private.auth.password.maxAgeDays',
  privateAuthPasswordSuperAdminMaxAgeDays: 'private.auth.password.superAdminMaxAgeDays',
  privateAuthSessionsMaxPerUser: 'private.auth.sessions.maxPerUser',
  privateAuthSessionsNewDeviceAlert: 'private.auth.sessions.newDeviceAlert',
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
  privatePolicyPacksDisabledKeysCsv:
    'private.policyPacks.disabledKeysCsv',
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
  privateTicketUnroutedQueueTargetGroupId: 'private.ticket.unroutedQueue.targetGroupId',
  privateTicketUnroutedQueueCleanupSlaHours: 'private.ticket.unroutedQueue.cleanupSlaHours',
  privateTicketUnroutedQueueWeeklyDigest: 'private.ticket.unroutedQueue.weeklyDigest',
  privateTicketRoutingRequireCoverage: 'private.ticket.routing.requireCoverage',
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
  privateTicketWaitingForUserEnabled: 'private.ticket.waitingForUser.enabled',
  privateTicketWaitingForUserReminderAfterDays:
    'private.ticket.waitingForUser.reminderAfterDays',
  privateTicketWaitingForUserAutoCloseAfterDays:
    'private.ticket.waitingForUser.autoCloseAfterDays',
  privateTicketReopenEnabled: 'private.ticket.reopen.enabled',
  privateTicketReopenWindowDays: 'private.ticket.reopen.windowDays',
  privateTicketTemplatesEnabled: 'private.ticket.templates.enabled',
  privateTicketPlaybooksEnabled: 'private.ticket.playbooks.enabled',
  privateTicketPlaybooksAutoAttach: 'private.ticket.playbooks.autoAttach',
  privateTicketPlaybooksRequiredStepsOnResolve:
    'private.ticket.playbooks.requiredStepsOnResolve',
  privateTicketSplitEnabled: 'private.ticket.split.enabled',
  privateTicketSplitAllowAttachmentMove:
    'private.ticket.split.allowAttachmentMove',
  privateTicketSplitAllowMessageCopy: 'private.ticket.split.allowMessageCopy',
  privateTicketSplitRequireReason: 'private.ticket.split.requireReason',
  privateTicketSavedViewsEnabled: 'private.ticket.savedViews.enabled',
  privateTicketSavedViewsMaxPerUser: 'private.ticket.savedViews.maxPerUser',
  privateTicketSavedViewsAllowDefaultView:
    'private.ticket.savedViews.allowDefaultView',
  // Package 1.3 — time tracking guard.
  privateTimeTrackingIdleAutoPauseMinutes: 'private.timeTracking.idleAutoPauseMinutes',
  privateTimeTrackingAutoResume: 'private.timeTracking.autoResume',
  privateTimeTrackingMaxSessionHours: 'private.timeTracking.maxSessionHours',
  privateTimeTrackingSingleActivePerUser: 'private.timeTracking.singleActivePerUser',
  privateTimeTrackingManualEntryEnabled: 'private.timeTracking.manualEntry.enabled',
  privateTimeTrackingManualEntryMaxBackdateDays:
    'private.timeTracking.manualEntry.maxBackdateDays',
  privateTimeTrackingManualEntryMaxMinutes: 'private.timeTracking.manualEntry.maxMinutes',
  privateTicketForwardingAllowCrossOu: 'private.ticket.forwarding.allowCrossOu',
  privateTicketForwardingRequireReason:
    'private.ticket.forwarding.requireReason',
  privateTicketForwardingKeepPreviousHandlersAsWatchers:
    'private.ticket.forwarding.keepPreviousHandlersAsWatchers',
  privateTicketForwardingNotifyRequester:
    'private.ticket.forwarding.notifyRequester',
  privateTicketForwardingMinReasonLength:
    'private.ticket.forwarding.minReasonLength',
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
  privateTicketSlaEnabled: 'private.ticket.sla.enabled',
  privateTicketPriorityMatrixEnabled:
    'private.ticket.priorityMatrix.enabled',
  privateTicketSlaAllowServiceOverrides:
    'private.ticket.sla.allowServiceOverrides',
  privateTicketSlaAllowOuOverrides: 'private.ticket.sla.allowOuOverrides',
  privateTicketSlaPauseOnWaitingForUser:
    'private.ticket.sla.pauseOnWaitingForUser',
  privateTicketSlaPauseOnPendingApproval:
    'private.ticket.sla.pauseOnPendingApproval',
  privateTicketSlaNotifyBeforeOverdueMinutes:
    'private.ticket.sla.notifyBeforeOverdueMinutes',
  privateTicketSlaEscalationsEnabled: 'private.ticket.sla.escalationsEnabled',
  privateTicketSlaEscalationsEmailEnabled:
    'private.ticket.sla.escalations.emailEnabled',
  privateTicketSlaMaxEscalationLevels:
    'private.ticket.sla.maxEscalationLevels',
  privateSmtpEnabled: 'private.smtp.enabled',
  privateSmtpHost: 'private.smtp.host',
  privateSmtpPort: 'private.smtp.port',
  privateSmtpTls: 'private.smtp.tls',
  privateSmtpUsername: 'private.smtp.username',
  privateSmtpPassword: 'private.smtp.password',
  privateSmtpFromAddress: 'private.smtp.fromAddress',
  privateSmtpProvider: 'private.smtp.provider',
  privateNotificationsEmailIncludeMessageExcerpt:
    'private.notifications.email.includeMessageExcerpt',
  privateNotificationsEmailReplyMode: 'private.notifications.email.replyMode',
  privateNotificationsEmailReplyToAddress:
    'private.notifications.email.replyToAddress',
  privateNotificationsEmailAccentColor:
    'private.notifications.email.accentColor',
  privateI18nDefaultLocale: 'private.i18n.defaultLocale',
  privateI18nFallbackLocale: 'private.i18n.fallbackLocale',
  privateI18nSupportedLocalesCsv: 'private.i18n.supportedLocalesCsv',
  privateNotificationsEdgeEnabled: 'private.notifications.edge.enabled',
  privateNotificationsEmailEnabled: 'private.notifications.email.enabled',
  privateNotificationsTemplatesEnabled:
    'private.notifications.templates.enabled',
  privateNotificationsEmailInternalOnly:
    'private.notifications.email.internalOnly',
  privateNotificationsEmailInternalDomainsCsv:
    'private.notifications.email.internalDomainsCsv',
  privateNotificationsEmailAllowedExternalDomainsCsv:
    'private.notifications.email.allowedExternalDomainsCsv',
  privateNotificationsEmailAllowedExternalEmailsCsv:
    'private.notifications.email.allowedExternalEmailsCsv',
  privateNotificationsTemplatesRegistryJson:
    'private.notifications.templates.registryJson',
  // Paket 2.2: personal preferences, quiet hours, digest.
  privateNotificationsPreferencesEnabled: 'private.notifications.preferences.enabled',
  privateNotificationsLockedInAppTypesCsv: 'private.notifications.lockedInAppTypesCsv',
  privateNotificationsLockedEmailTypesCsv: 'private.notifications.lockedEmailTypesCsv',
  privateNotificationsDefaultsDigestTypesCsv:
    'private.notifications.defaults.digestTypesCsv',
  privateNotificationsDigestEnabled: 'private.notifications.digest.enabled',
  privateNotificationsDigestDefaultTime: 'private.notifications.digest.defaultTime',
  privateNotificationsDigestMaxItems: 'private.notifications.digest.maxItems',
  privateNotificationsQuietHoursEnabled: 'private.notifications.quietHours.enabled',
  privateNotificationsQuietHoursBypassTypesCsv:
    'private.notifications.quietHours.bypassTypesCsv',
  // Paket 2.4: agent collaboration.
  privateCollaborationPresenceEnabled: 'private.collaboration.presence.enabled',
  privateCollaborationPresenceShowToRequester: 'private.collaboration.presence.showToRequester',
  privateCollaborationCollisionWarningEnabled: 'private.collaboration.collisionWarning.enabled',
  privateCollaborationMentionsEnabled: 'private.collaboration.mentions.enabled',
  privateCollaborationFollowersEnabled: 'private.collaboration.followers.enabled',
  privateCollaborationFollowOnReply: 'private.collaboration.followOnReply',
  privateCollaborationLinksEnabled: 'private.collaboration.links.enabled',
  privateCollaborationLinksMaxPerTicket: 'private.collaboration.links.maxPerTicket',
  // Paket 2.3: reply by e-mail (inbound mailbox).
  privateInboundEnabled: 'private.inbound.enabled',
  privateInboundProvider: 'private.inbound.provider',
  privateInboundAddress: 'private.inbound.address',
  privateInboundPollSeconds: 'private.inbound.pollSeconds',
  privateInboundGraphTenantId: 'private.inbound.graph.tenantId',
  privateInboundGraphClientId: 'private.inbound.graph.clientId',
  privateInboundGraphClientSecret: 'private.inbound.graph.clientSecret',
  privateInboundImapHost: 'private.inbound.imap.host',
  privateInboundImapPort: 'private.inbound.imap.port',
  privateInboundImapTls: 'private.inbound.imap.tls',
  privateInboundImapUsername: 'private.inbound.imap.username',
  privateInboundImapPassword: 'private.inbound.imap.password',
  privateInboundImapAuthMethod: 'private.inbound.imap.authMethod',
  privateInboundProcessedFolder: 'private.inbound.processedFolder',
  privateInboundRejectedFolder: 'private.inbound.rejectedFolder',
  privateInboundRequireAuthPass: 'private.inbound.requireAuthPass',
  privateInboundCreateTickets: 'private.inbound.createTickets',
  privateInboundDefaultServiceId: 'private.inbound.defaultServiceId',
  privateInboundRawRetentionDays: 'private.inbound.rawRetentionDays',
  privateInboundMetadataRetentionDays: 'private.inbound.metadataRetentionDays',
  privateInboundMaxPerSenderPerHour: 'private.inbound.maxPerSenderPerHour',
  privateInboundMaxMessagesPerRun: 'private.inbound.maxMessagesPerRun',
  privateNotificationsWeeklyReportEnabled: 'private.notifications.weeklyTicketReport.enabled',
  privateNotificationsWeeklyReportDayOfWeek: 'private.notifications.weeklyTicketReport.dayOfWeek',
  privateNotificationsWeeklyReportTime: 'private.notifications.weeklyTicketReport.time',
  privateNotificationsWeeklyReportMaxRows: 'private.notifications.weeklyTicketReport.maxRows',
  privateNotificationsWeeklyReportSendWhenEmpty:
    'private.notifications.weeklyTicketReport.sendWhenEmpty',
  privateAddonsEmail: addonSettingKey('email'),
  privateAddonsEdge: addonSettingKey('edge'),
  privateAddonsCsat: addonSettingKey('csat'),
  privateAddonsApprovals: addonSettingKey('approvals'),
  privateAddonsConfidential: addonSettingKey('confidential'),
  privateAddonsKbIntercept: addonSettingKey('kbIntercept'),
  privateAddonsTicketSplit: addonSettingKey('ticketSplit'),
  privateAddonsBulkActions: addonSettingKey('bulkActions'),
  privateAddonsSavedViews: addonSettingKey('savedViews'),
  privateAddonsReports: addonSettingKey('reports'),
  privateAddonsCmdb: addonSettingKey('cmdb'),
  privateAddonsProblems: addonSettingKey('problems'),
  privateAddonsChanges: addonSettingKey('changes'),
  privateAddonsTeams: addonSettingKey('teams'),
  privateKnowledgeBaseReviewCycleEnabled:
    'private.knowledgeBase.reviewCycle.enabled',
  privateKnowledgeBaseReviewCycleDefaultReviewDays:
    'private.knowledgeBase.reviewCycle.defaultReviewDays',
  privateKnowledgeBaseReviewCycleStaleAfterDays:
    'private.knowledgeBase.reviewCycle.staleAfterDays',
  privateKnowledgeBaseReviewCycleRemindDaysBefore:
    'private.knowledgeBase.reviewCycle.remindDaysBefore',
  privateKnowledgeBaseFeedbackEnabled: 'private.knowledgeBase.feedback.enabled',
  privateKnowledgeBaseFeedbackOneVotePerUserPerArticle:
    'private.knowledgeBase.feedback.oneVotePerUserPerArticle',
  privateKnowledgeBaseRankingUseFeedbackWeight:
    'private.knowledgeBase.ranking.useFeedbackWeight',
  // Paket 2.9 (K1): portal FAQ size.
  privateKnowledgeBasePortalFaqMaxItems: 'private.knowledgeBase.portal.faqMaxItems',
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
  privateGuardrailsAntiLoopEnabled: 'private.guardrails.antiLoop.enabled',
  privateGuardrailsAntiLoopDuplicateWindowMinutes:
    'private.guardrails.antiLoop.duplicateWindowMinutes',
  privateGuardrailsAntiLoopSimilarityThreshold:
    'private.guardrails.antiLoop.similarityThreshold',
  privateGuardrailsAntiLoopMode: 'private.guardrails.antiLoop.mode',
  privateGuardrailsBulkBroadcastConfirmAboveRecipients:
    'private.guardrails.bulkBroadcast.confirmAboveRecipients',
  privateCsatEnabled: 'private.csat.enabled',
  privateCsatScaleMax: 'private.csat.scaleMax',
  privateCsatAskOnResolved: 'private.csat.askOnResolved',
  privateCsatAskOnClosed: 'private.csat.askOnClosed',
  privateCsatSamplingRate: 'private.csat.samplingRate',
  privateDataLifecycleArchiveEnabled: 'private.dataLifecycle.archive.enabled',
  privateDataLifecycleArchiveAfterClosedDays:
    'private.dataLifecycle.archive.afterClosedDays',
  privateDataLifecycleArchiveArchivedReadOnly:
    'private.dataLifecycle.archive.archivedReadOnly',
  privateDataLifecycleArchiveSearchable:
    'private.dataLifecycle.archive.searchable',
  privateIntegrationsQueueEnabled: 'private.integrations.queue.enabled',
  privateIntegrationsQueueTypesCsv: 'private.integrations.queue.typesCsv',
  privateIntegrationsQueueMaxAttempts: 'private.integrations.queue.maxAttempts',
  privateIntegrationsQueueInitialBackoffSeconds:
    'private.integrations.queue.initialBackoffSeconds',
  privateIntegrationsQueueMaxBackoffSeconds:
    'private.integrations.queue.maxBackoffSeconds',
  privateIntegrationsQueueDeadLetterAfterAttempts:
    'private.integrations.queue.deadLetterAfterAttempts',
  privateIntegrationsQueueDeadLetterRetentionDays:
    'private.integrations.queue.deadLetterRetentionDays',
  privateIntegrationsQueueWorkerPollSeconds:
    'private.integrations.queue.workerPollSeconds',
  privateIntegrationsQueueAdminUiEnabled:
    'private.integrations.queue.adminUiEnabled',
  // Paket 3.1: Teams connector (bot); the addon switches it on.
  privateIntegrationsTeamsMode: 'private.integrations.teams.mode',
  privateIntegrationsTeamsTenantId: 'private.integrations.teams.tenantId',
  privateIntegrationsTeamsBotAppId: 'private.integrations.teams.botAppId',
  privateIntegrationsTeamsBotAppSecret: 'private.integrations.teams.botAppSecret',
  privateIntegrationsTeamsBotCertificatePem: 'private.integrations.teams.botCertificatePem',
  privateIntegrationsTeamsPersonalEnabled: 'private.integrations.teams.personalEnabled',
  privateIntegrationsTeamsChannelEnabled: 'private.integrations.teams.channelEnabled',
  privateIntegrationsTeamsChannelIncludeTitle: 'private.integrations.teams.channelIncludeTitle',
  privateIntegrationsTeamsTicketCreateEnabled: 'private.integrations.teams.ticketCreateEnabled',
  privateIntegrationsTeamsActionsEnabled: 'private.integrations.teams.actionsEnabled',
  privateConfigVersioningEnabled: 'private.configVersioning.enabled',
  privateConfigVersioningAllowRollback:
    'private.configVersioning.allowRollback',
  privateConfigVersioningValidationEnabled:
    'private.configVersioning.validation.enabled',
  privateConfigVersioningValidationBlockActivationOnError:
    'private.configVersioning.validation.blockActivationOnError',
  privateConfigVersioningShadowModeEnabled:
    'private.configVersioning.shadowMode.enabled',
  privateConfigVersioningScopesCsv: 'private.configVersioning.scopesCsv',
  // Paket 2.9 (K4): name of this installation in exported config packages.
  privateConfigVersioningEnvironmentName: 'private.configVersioning.environmentName',
  privateReportsEnabled: 'private.reports.enabled',
  privateReportsPacksJson: 'private.reports.packsJson',
  privateReportsExportFormatsCsv: 'private.reports.exportFormatsCsv',
  privateReportsDefaultWindowDays: 'private.reports.defaultWindowDays',
  privateReportsTimeZone: 'private.reports.timeZone',
  privateReportsPingPongThreshold: 'private.reports.pingPongThreshold',
  privateReportsTrendsEnabled: 'private.reports.trends.enabled',
  privateReportsTrendsMaxMonths: 'private.reports.trends.maxMonths',
  privateReportsTrendsCacheSeconds: 'private.reports.trends.cacheSeconds',
  privateReportsTrendsSlaTargetPercent: 'private.reports.trends.slaTargetPercent',
  privateReportsTrendsCsatMinSample: 'private.reports.trends.csatMinSample',
  privateReportsScheduledEnabled: 'private.reports.scheduled.enabled',
  privateReportsScheduledMaxSchedules: 'private.reports.scheduled.maxSchedules',
  privateReportsScheduledMaxRecipients: 'private.reports.scheduled.maxRecipients',
  privateReportsScheduledAttachmentMaxRows: 'private.reports.scheduled.attachmentMaxRows',
  privateReportsScheduledDefaultSendTime: 'private.reports.scheduled.defaultSendTime',
  privateDashboardBottlenecksEnabled: 'private.dashboard.bottlenecks.enabled',
  privateDashboardBottlenecksDefaultWindowDays:
    'private.dashboard.bottlenecks.defaultWindowDays',
  privateAuditExportEnabled: 'private.audit.export.enabled',
  privateAuditExportAllowedFormatsCsv:
    'private.audit.export.allowedFormatsCsv',
  privateAuditTamperEvidentEnabled: 'private.audit.tamperEvident.enabled',
  privateAuditTamperEvidentHashAlgorithm:
    'private.audit.tamperEvident.hashAlgorithm',
  privateObservabilityAuditRetentionDays:
    'private.observability.auditRetentionDays',
  privateObservabilityRequestLogRetentionDays:
    'private.observability.requestLogRetentionDays',
  privateObservabilitySupportBundleEnabled:
    'private.observability.supportBundle.enabled',
  privateObservabilitySupportBundleIncludeConfigSnapshot:
    'private.observability.supportBundle.includeConfigSnapshot',
  privateObservabilitySupportBundleIncludeRecentLogs:
    'private.observability.supportBundle.includeRecentLogs',
  privateObservabilitySupportBundleIncludeAuditExport:
    'private.observability.supportBundle.includeAuditExport',
  privateObservabilitySupportBundleRecentLogsMinutes:
    'private.observability.supportBundle.recentLogsMinutes',
  privateEdgeExtensionEnabled: 'private.edgeExtension.enabled',
  privateEdgeExtensionAllowedEmailDomain:
    'private.edgeExtension.allowedEmailDomain',
  privateEdgeExtensionWsEnabled: 'private.edgeExtension.ws.enabled',
  privateEdgeExtensionWsReconnectMaxBackoffSeconds:
    'private.edgeExtension.ws.reconnectMaxBackoffSeconds',
  privateEdgeExtensionWsMinClientVersion:
    'private.edgeExtension.ws.minClientVersion',
  privateEdgeExtensionNotificationsRedactedPreviews:
    'private.edgeExtension.notifications.redactedPreviews',
  privateEdgeExtensionReceiptsEnabled: 'private.edgeExtension.receipts.enabled',
  privateEdgeExtensionEventsDedupEnabled:
    'private.edgeExtension.events.dedupEnabled',
  privateEdgeExtensionKillSwitchEnabled:
    'private.edgeExtension.killSwitchEnabled',
  privateEdgeExtensionPollingFallbackEnabled:
    'private.edgeExtension.pollingFallback.enabled',
  privateEdgeExtensionPollingFallbackIntervalSeconds:
    'private.edgeExtension.pollingFallback.intervalSeconds',
  privateEdgeExtensionChatEnabled: 'private.edgeExtension.chat.enabled',
  privateEdgeExtensionChatMaxMessagesPerTicket:
    'private.edgeExtension.chat.maxMessagesPerTicket',
  privateEdgeExtensionAttachmentsEnabled:
    'private.edgeExtension.attachments.enabled',
  privateEdgeExtensionRemoteEnabled: 'private.edgeExtension.remote.enabled',
  privateEdgeExtensionRemoteRateLimitMinutesPerTicket:
    'private.edgeExtension.remote.rateLimitMinutesPerTicket',
  privateEdgeExtensionRemoteRequireUserClickToOpenQuickAssist:
    'private.edgeExtension.remote.requireUserClickToOpenQuickAssist',
  privateEdgeExtensionRemoteAuditAcknowledge:
    'private.edgeExtension.remote.auditAcknowledge',
  // Paket 2.6: zaštita ličnih podataka (ZZLP BiH).
  privatePrivacyEnabled: 'private.privacy.enabled',
  privatePrivacyRetentionAttachmentsDays: 'private.privacy.retention.attachmentsDays',
  privatePrivacyRetentionTicketContentDays: 'private.privacy.retention.ticketContentDays',
  privatePrivacyRetentionAuditDays: 'private.privacy.retention.auditDays',
  privatePrivacyRetentionSessionDays: 'private.privacy.retention.sessionDays',
  privatePrivacyRetentionEmailDeliveryDays: 'private.privacy.retention.emailDeliveryDays',
  privatePrivacyRetentionRequestRegisterDays: 'private.privacy.retention.requestRegisterDays',
  privatePrivacyRetentionRunAtLocalTime: 'private.privacy.retention.runAtLocalTime',
  privatePrivacyRetentionMaxMinutesPerNight: 'private.privacy.retention.maxMinutesPerNight',
  privatePrivacyAnonymizationCandidateAfterDays:
    'private.privacy.anonymization.candidateAfterDays',
  privatePrivacyAnonymizationRequireSecondApprover:
    'private.privacy.anonymization.requireSecondApprover',
  privatePrivacyAnonymizationDeleteOwnAttachmentsDefault:
    'private.privacy.anonymization.deleteOwnAttachmentsDefault',
  privatePrivacyExportIncludeAttachmentsDefault:
    'private.privacy.export.includeAttachmentsDefault',
  privatePrivacyExportMaxAttachmentMb: 'private.privacy.export.maxAttachmentMb',
  privatePrivacyExportLinkValidDays: 'private.privacy.export.linkValidDays',
  privatePrivacyRequestsReminderDaysCsv: 'private.privacy.requests.reminderDaysCsv',
  privatePrivacyRequestsRejectionNoticeBs: 'private.privacy.requests.rejectionNotice.bs',
  privatePrivacyRequestsRejectionNoticeEn: 'private.privacy.requests.rejectionNotice.en',
  privatePrivacyControllerName: 'private.privacy.controller.name',
  privatePrivacyControllerAddress: 'private.privacy.controller.address',
  privatePrivacyControllerDpoName: 'private.privacy.controller.dpoName',
  privatePrivacyControllerDpoEmail: 'private.privacy.controller.dpoEmail',
  privatePrivacyControllerPurpose: 'private.privacy.controller.purpose',
  privatePrivacyControllerLegalBasis: 'private.privacy.controller.legalBasis',
  privatePrivacyNoticeBs: 'private.privacy.notice.bs',
  privatePrivacyNoticeEn: 'private.privacy.notice.en',
  // Paket 2.7: pouzdanost i monitoring.
  privateOpsAlertsEnabled: 'private.ops.alerts.enabled',
  privateOpsAlertsReminderHours: 'private.ops.alerts.reminderHours',
  privateOpsAlertsExtraRecipientsCsv: 'private.ops.alerts.extraRecipientsCsv',
  privateOpsAlertsTeamsWebhookUrl: 'private.ops.alerts.teamsWebhookUrl',
  privateOpsAlertsHistoryDays: 'private.ops.alerts.historyDays',
  privateOpsThresholdsDiskWarnPercent: 'private.ops.thresholds.diskWarnPercent',
  privateOpsThresholdsDiskCriticalPercent: 'private.ops.thresholds.diskCriticalPercent',
  privateOpsThresholdsHttp5xxMinCount: 'private.ops.thresholds.http5xxMinCount',
  privateOpsThresholdsHttp5xxMinPercent: 'private.ops.thresholds.http5xxMinPercent',
  privateOpsThresholdsSlaScanLateMinutes: 'private.ops.thresholds.slaScanLateMinutes',
  privateOpsThresholdsWorkerHeartbeatStaleSeconds: 'private.ops.thresholds.workerHeartbeatStaleSeconds',
  privateOpsThresholdsClamavFailuresBeforeAlert: 'private.ops.thresholds.clamavFailuresBeforeAlert',
  // Paket 2.9 (K3): on-call.
  privateProblemsNumberPrefix: 'private.problems.numberPrefix',
  privateProblemsRootCauseCategories: 'private.problems.rootCauseCategories',
  privateProblemsRequireWorkaroundForKnownError: 'private.problems.requireWorkaroundForKnownError',
  privateProblemsBulkResolveMax: 'private.problems.bulkResolveMax',
  privateProblemsTargetCalendarId: 'private.problems.target.calendarId',
  privateProblemsAutoCloseDays: 'private.problems.autoCloseDays',
  privateProblemsTargetEnabled: 'private.problems.target.enabled',
  privateProblemsTargetCriticalWorkingDays: 'private.problems.target.criticalWorkingDays',
  privateProblemsTargetHighWorkingDays: 'private.problems.target.highWorkingDays',
  privateProblemsTargetMediumWorkingDays: 'private.problems.target.mediumWorkingDays',
  privateProblemsTargetLowWorkingDays: 'private.problems.target.lowWorkingDays',
  // Paket 3.4: change management.
  privateChangesNumberPrefix: 'private.changes.numberPrefix',
  privateChangesNormalQuorum: 'private.changes.normalQuorum',
  privateChangesEmergencyQuorum: 'private.changes.emergencyQuorum',
  privateChangesMinLeadTimeHours: 'private.changes.minLeadTimeHours',
  privateChangesRequireTestPlan: 'private.changes.requireTestPlan',
  privateChangesFreezePeriods: 'private.changes.freezePeriods',
  privateChangesReminderHoursBeforeStart: 'private.changes.reminderHoursBeforeStart',
  privateAssetsTicketPickerEnabled: 'private.assets.ticketPicker.enabled',
  privateAssetsLocationsEnabled: 'private.assets.locations.enabled',
  privateAssetsTagAutoGenerate: 'private.assets.tag.autoGenerate',
  privateAssetsTagPrefix: 'private.assets.tag.prefix',
  privateAssetsCurrency: 'private.assets.currency',
  privateAssetsFrequentFailureCount: 'private.assets.frequentFailure.count',
  privateAssetsFrequentFailureDays: 'private.assets.frequentFailure.days',
  privateAssetsRemindersEnabled: 'private.assets.reminders.enabled',
  privateAssetsRemindersDaysBefore: 'private.assets.reminders.daysBefore',
  privateAssetsRemindersRecipients: 'private.assets.reminders.recipients',
  privateAssetsImportMaxRows: 'private.assets.import.maxRows',
  privateAssetsImportMaxFileMb: 'private.assets.import.maxFileMb',
  privateAssetsTransferEnabled: 'private.assets.transfer.enabled',
  privateAssetsTransferRequired: 'private.assets.transfer.required',
  privateAssetsTransferNumberFormat: 'private.assets.transfer.numberFormat',
  privateAssetsTransferWarehouseLabel: 'private.assets.transfer.warehouseLabel',
  privateAssetsTransferPlace: 'private.assets.transfer.place',
  privateAssetsTransferDefaultSignatoryUserId: 'private.assets.transfer.defaultSignatoryUserId',
  privateAssetsDirectorySyncEnabled: 'private.assets.directorySync.enabled',
  privateAssetsDirectorySyncIntervalHours: 'private.assets.directorySync.intervalHours',
  privateAssetsDirectorySyncBaseDn: 'private.assets.directorySync.baseDn',
  privateAssetsDirectorySyncIncludeDisabled: 'private.assets.directorySync.includeDisabled',
  privateAssetsDirectorySyncTypeKey: 'private.assets.directorySync.typeKey',
  privateAssetsDirectorySyncServerTypeKey: 'private.assets.directorySync.serverTypeKey',
  privateAssetsDirectorySyncUserMatch: 'private.assets.directorySync.userMatch',
  privateAssetsDirectorySyncNamePattern: 'private.assets.directorySync.namePattern',
  privateAssetsDirectorySyncDefaultOrganizationalUnitId: 'private.assets.directorySync.defaultOrganizationalUnitId',
  privateOnCallEnabled: 'private.onCall.enabled',
  privateOnCallReminderTime: 'private.onCall.reminderTime',
  privateOnCallHistoryRetentionDays: 'private.onCall.historyRetentionDays',
  // Paket 2.9 (K2): announcements.
  privateAnnouncementsEnabled: 'private.announcements.enabled',
  privateAnnouncementsMaxDurationDays: 'private.announcements.maxDurationDays',
  privateAnnouncementsAgentsMayPublish: 'private.announcements.agentsMayPublish',
  privateAnnouncementsReceiptRetentionDays: 'private.announcements.receiptRetentionDays',
  // Paket 2.9 (K2b): Teams channel for announcements (prepared, off by default).
  privateAnnouncementsTeamsEnabled: 'private.announcements.teamsEnabled',
  privateAnnouncementsTeamsWebhookUrl: 'private.announcements.teamsWebhookUrl',
  privateStatusPageEnabled: 'private.statusPage.enabled',
  privateStatusPagePublic: 'private.statusPage.public',
  privateStatusPageHistoryDays: 'private.statusPage.historyDays',
  privateStatusPageShowUptimePercent: 'private.statusPage.showUptimePercent',
} as const;

export type SettingKey = (typeof settingKeys)[keyof typeof settingKeys];
