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
  authSessionRevoked: 'auth.session_revoked',
  authSessionsRevokedAll: 'auth.sessions_revoked_all',
  // Paket 2.2: an administrator reset a user's notification preferences.
  notificationPreferencesReset: 'notification.preferences.reset',
  authPasswordChanged: 'auth.password_changed',
  authPasswordExpired: 'auth.password_expired',
  directoryTestConnection: 'directory.test_connection',
  directoryDryRun: 'directory.dry_run',
  directorySyncApplied: 'directory.sync_applied',
  directorySyncAborted: 'directory.sync_aborted',
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
  directorySyncRun: 'directory_sync_run',
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
