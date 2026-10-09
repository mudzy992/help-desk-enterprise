export const auditLogGenesisHash = '0'.repeat(64);

export const auditLogChainLockKey = 871_001;

export const defaultAuditHashAlgorithm = 'sha256';

export const allowedAuditHashAlgorithms = [
  'sha256',
  'sha384',
  'sha512',
] as const;

export const allowedAuditExportFormats = ['csv', 'json'] as const;

export const auditLogListDefaultTake = 50;

export const auditLogListMaxTake = 200;

export const auditLogActions = {
  policyPackApply: 'policy_pack.apply',
  policyPackUnapply: 'policy_pack.unapply',
  ticketConfidentialViewed: 'ticket_confidential_viewed',
  ticketConfidentialDenied: 'ticket_confidential_denied',
  ticketConfidentialBreakGlass: 'ticket_confidential_break_glass',
  ticketBulkExecute: 'ticket_bulk.execute',
  ticketForwarded: 'ticket.forwarded',
  ticketPriorityOverridden: 'ticket.priority_overridden',
  ticketMerged: 'ticket.merged',
  ticketUnmerged: 'ticket.unmerged',
  ticketsExport: 'tickets.export',
  auditExport: 'audit.export',
  reportsExport: 'reports.export',
  supportBundleExport: 'support_bundle.export',
  notificationReceipt: 'notification.receipt',
  ticketRemoteAcknowledged: 'ticket.remote.acknowledged',
  rolePermissionReplace: 'role_permission.replace',
  userRoleAssign: 'user_role.assign',
  userRoleRemove: 'user_role.remove',
  userCreated: 'user.created',
  userUpdated: 'user.updated',
  userDeleted: 'user.deleted',
  userPasswordReset: 'user.password_reset',
  userPasswordResetRejected: 'user.password_reset_rejected',
  userDirectoryUnlinked: 'user.directory_unlinked',
  organizationalUnitCreated: 'organizational_unit.created',
  organizationalUnitUpdated: 'organizational_unit.updated',
  organizationalUnitDeleted: 'organizational_unit.deleted',
  groupCreated: 'group.created',
  groupUpdated: 'group.updated',
  groupDeleted: 'group.deleted',
  groupMemberAdded: 'group.member_added',
  groupMemberRemoved: 'group.member_removed',
  emailTemplateTestSent: 'email_template.test_sent',
  userEntraBound: 'user.entra_bound',
  userEntraJitProvisioned: 'user.entra_jit_provisioned',
  userEntraBindingRejected: 'user.entra_binding_rejected',
  // Paket 2.1: account security
  authMfaEnrolled: 'auth.mfa_enrolled',
  authMfaDisabled: 'auth.mfa_disabled',
  authMfaReset: 'auth.mfa_reset',
  authMfaRecoveryUsed: 'auth.mfa_recovery_used',
  authMfaRecoveryRegenerated: 'auth.mfa_recovery_regenerated',
  authMfaFailed: 'auth.mfa_failed',
  // Paket 5.4.0-a (M1): passkey as a second factor next to TOTP.
  authMfaPasskeyEnrolled: 'auth.mfa_passkey_enrolled',
  authMfaPasskeyRemoved: 'auth.mfa_passkey_removed',
  // Paket 5.4.0-b (M2): the admin retuned the login rate limits.
  authRateLimitsChanged: 'auth.rate_limits_changed',
  authSessionRevoked: 'auth.session_revoked',
  authSessionsRevokedAll: 'auth.sessions_revoked_all',
  authorizationSuperAdminBypass: 'authorization.super_admin_bypass',
  // Paket 2.2: an administrator reset a user's notification preferences.
  notificationPreferencesReset: 'notification.preferences.reset',
  authPasswordChanged: 'auth.password_changed',
  authPasswordExpired: 'auth.password_expired',
  directoryTestConnection: 'directory.test_connection',
  directoryDryRun: 'directory.dry_run',
  directorySyncApplied: 'directory.sync_applied',
  directorySyncAborted: 'directory.sync_aborted',
  // Paket 2.5: trends, PDF and scheduled reports.
  reportTrendsExported: 'report.trends.exported',
  reportPdfExported: 'report.pdf.exported',
  reportScheduleCreated: 'report.schedule.created',
  reportScheduleUpdated: 'report.schedule.updated',
  reportScheduleDeleted: 'report.schedule.deleted',
  reportScheduleSent: 'report.schedule.sent',
  reportScheduleTestSent: 'report.schedule.test_sent',
  // Paket 2.6: zaštita ličnih podataka.
  privacyRequestCreated: 'privacy.request.created',
  privacyRequestUpdated: 'privacy.request.updated',
  privacyRequestExtended: 'privacy.request.extended',
  privacyRequestClosed: 'privacy.request.closed',
  privacyExportRequested: 'privacy.export.requested',
  privacyExportDownloaded: 'privacy.export.downloaded',
  privacyErasureRequested: 'privacy.erasure.requested',
  privacyErasureApproved: 'privacy.erasure.approved',
  privacyErasureCancelled: 'privacy.erasure.cancelled',
  privacySubjectAnonymized: 'privacy.subject.anonymized',
  privacyRetentionRun: 'privacy.retention.run',
  privacyLegalHoldSet: 'privacy.legal_hold.set',
  privacyLegalHoldCleared: 'privacy.legal_hold.cleared',
  auditRedacted: 'audit.redacted',
  // Rotacija tajni: MFA tajne ponovo šifrovane novim MFA_ENCRYPTION_KEY (CLI secrets.js).
  securityMfaSecretsReencrypted: 'security.mfa_secrets.reencrypted',
  auditRetentionPurged: 'audit.retention.purged',
  // Paket 2.7: alarms (acknowledge, silence, test, DLQ baseline).
  opsAlertAcknowledged: 'ops.alert.acknowledged',
  opsAlertsSilenced: 'ops.alerts.silenced',
  opsAlertsUnsilenced: 'ops.alerts.unsilenced',
  opsAlertTestSent: 'ops.alert.test_sent',
  opsDlqBaselineAcknowledged: 'ops.dlq.baseline_acknowledged',
  // Paket 2.7: status page incidents (§8.3).
  statusIncidentCreated: 'status.incident.created',
  statusIncidentEdited: 'status.incident.edited',
  statusIncidentUpdatePosted: 'status.incident.update_posted',
  statusIncidentResolved: 'status.incident.resolved',
  statusIncidentTicketLinked: 'status.incident.ticket_linked',
  statusIncidentTicketUnlinked: 'status.incident.ticket_unlinked',
  // Paket 2.9 (K3): on-call.
  onCallScheduleSaved: 'oncall.schedule.saved',
  onCallScheduleDeleted: 'oncall.schedule.deleted',
  onCallOverrideCreated: 'oncall.override.created',
  onCallOverrideDeleted: 'oncall.override.deleted',
  onCallSwapRequested: 'oncall.swap.requested',
  onCallSwapAccepted: 'oncall.swap.accepted',
  onCallSwapDeclined: 'oncall.swap.declined',
  onCallSwapCancelled: 'oncall.swap.cancelled',
  onCallCalendarTokenRotated: 'oncall.calendar_token.rotated',
  onCallCalendarTokenRevoked: 'oncall.calendar_token.revoked',
  onCallEscalationNotified: 'oncall.escalation.notified',
  // Paket 2.9 (K2): announcements.
  announcementCreated: 'announcement.created',
  announcementUpdated: 'announcement.updated',
  announcementPublished: 'announcement.published',
  announcementWithdrawn: 'announcement.withdrawn',
  announcementDeleted: 'announcement.deleted',
  announcementReminded: 'announcement.reminded',
  announcementReportExported: 'announcement.report.exported',
  // Paket 3.2: CMDB (sensitive actions; the full history is AssetEvent).
  assetTypeSaved: 'asset.type.saved',
  assetLocationSaved: 'asset.location.saved',
  assetRetired: 'asset.retired',
  assetDisposed: 'asset.disposed',
  assetDeleted: 'asset.deleted',
  assetImportApplied: 'asset.import.applied',
  assetExported: 'asset.exported',
  assetLicenseKeyRevealed: 'asset.license.key_revealed',
  assetLicenseSaved: 'asset.license.saved',
  assetContractSaved: 'asset.contract.saved',
  assetDirectorySyncDryRun: 'asset.directory_sync.dry_run',
  assetDirectorySyncApplied: 'asset.directory_sync.applied',
  assetTransferIssued: 'asset.transfer.issued',
  assetTransferCancelled: 'asset.transfer.cancelled',
  assetTransferSigned: 'asset.transfer.signed',
  assetTransferTemplateUploaded: 'asset.transfer.template_uploaded',
  assetSignatorySaved: 'asset.signatory.saved',
  // Paket 3.3: problem management.
  problemCreated: 'problem.created',
  problemStatusChanged: 'problem.status_changed',
  problemClosed: 'problem.closed',
  problemCancelled: 'problem.cancelled',
  problemReopened: 'problem.reopened',
  problemKnowledgeArticleCreated: 'problem.knowledge_article_created',
  problemTicketsResolved: 'problem.tickets_resolved',
  // Paket 3.4: change management.
  changeCreated: 'change.created',
  changeStatusChanged: 'change.status_changed',
  changeApprovalRecorded: 'change.approval_recorded',
  changeTemplateSaved: 'change.template_saved',
  // Paket 2.9 (K1): knowledge portal.
  knowledgeCategoryCreated: 'knowledge.category.created',
  knowledgeCategoryUpdated: 'knowledge.category.updated',
  knowledgeCategoryArchived: 'knowledge.category.archived',
  knowledgeCategoryRestored: 'knowledge.category.restored',
  knowledgeArticleDraftedFromReply: 'knowledge.article.drafted_from_reply',
  /** Val 2 (M14/B1): pri upisu članka iz odgovora server je morao zamijeniti lične podatke. */
  knowledgeArticleReplyRedacted: 'knowledge.article.reply_redacted',
} as const;

export const auditLogEntityTypes = {
  policyPack: 'policy_pack',
  ticket: 'ticket',
  ticketBulk: 'ticket_bulk',
  ticketExport: 'ticket_export',
  auditLog: 'audit_log',
  configVersion: 'config_version',
  supportBundle: 'support_bundle',
  reportPack: 'report_pack',
  notification: 'notification',
  role: 'role',
  userRole: 'user_role',
  emailTemplate: 'email_template',
  user: 'user',
  authorization: 'authorization',
  organizationalUnit: 'organizational_unit',
  group: 'group',
  directorySyncRun: 'directory_sync_run',
  reportTrends: 'report_trends',
  reportSchedule: 'report_schedule',
  // Paket 2.6
  dataSubjectRequest: 'data_subject_request',
  privacyExport: 'privacy_export',
  privacyErasure: 'privacy_erasure',
  retentionRun: 'retention_run',
  securityKey: 'security_key',
  // Paket 2.7
  opsAlert: 'ops_alert',
  opsMonitoring: 'ops_monitoring',
  statusIncident: 'status_incident',
  // Paket 2.9
  onCallSchedule: 'on_call_schedule',
  announcement: 'announcement',
  knowledgeCategory: 'knowledge_category',
  knowledgeArticle: 'knowledge_article',
  // Paket 3.2
  asset: 'asset',
  assetType: 'asset_type',
  assetLocation: 'asset_location',
  softwareLicense: 'software_license',
  assetContract: 'asset_contract',
  assetImport: 'asset_import',
  assetTransfer: 'asset_transfer',
  assetSignatory: 'asset_signatory',
  // Paket 3.3
  problem: 'problem',
  change: 'change',
  changeTemplate: 'change_template',
} as const;

export const auditLogErrorCodes = {
  exportDisabled: 'AUDIT_EXPORT_DISABLED',
  verifyDisabled: 'AUDIT_VERIFY_DISABLED',
  formatNotAllowed: 'AUDIT_EXPORT_FORMAT_NOT_ALLOWED',
  hashAlgorithmUnsupported: 'AUDIT_HASH_ALGORITHM_UNSUPPORTED',
  organizationalUnitNotFound: 'AUDIT_ORGANIZATIONAL_UNIT_NOT_FOUND',
  forbidden: 'FORBIDDEN',
} as const;

export type AuditLogErrorCode =
  (typeof auditLogErrorCodes)[keyof typeof auditLogErrorCodes];

export const auditLogErrorMessages: Record<
  (typeof auditLogErrorCodes)[keyof typeof auditLogErrorCodes],
  string
> = {
  AUDIT_EXPORT_DISABLED: 'Audit export is disabled',
  AUDIT_VERIFY_DISABLED: 'Tamper-evident audit verification is disabled',
  AUDIT_EXPORT_FORMAT_NOT_ALLOWED: 'The requested audit export format is not allowed',
  AUDIT_HASH_ALGORITHM_UNSUPPORTED: 'The configured audit hash algorithm is not supported',
  AUDIT_ORGANIZATIONAL_UNIT_NOT_FOUND: 'The requested organizational unit was not found',
  FORBIDDEN: 'Authorization failed',
};

export const auditLogExportColumns = [
  'id',
  'createdAt',
  'action',
  'entityType',
  'entityId',
  'actorUserId',
  'organizationalUnitId',
  'requestId',
  'previousHash',
  'hash',
  'metadata',
] as const;
