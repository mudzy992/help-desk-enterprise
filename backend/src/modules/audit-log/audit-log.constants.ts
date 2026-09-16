export const auditLogGenesisHash = '0'.repeat(64);

export const auditLogChainLockKey = 871_001;

export const defaultAuditHashAlgorithm = 'sha256';

export const allowedAuditHashAlgorithms = [
  'sha256',
  'sha384',
  'sha512',
] as const;

export const allowedAuditExportFormats = ['csv', 'json'] as const;

export const auditLogActions = {
  policyPackApply: 'policy_pack.apply',
  ticketConfidentialViewed: 'ticket_confidential_viewed',
  ticketConfidentialDenied: 'ticket_confidential_denied',
  ticketConfidentialBreakGlass: 'ticket_confidential_break_glass',
  ticketBulkExecute: 'ticket_bulk.execute',
  auditExport: 'audit.export',
  reportsExport: 'reports.export',
  supportBundleExport: 'support_bundle.export',
  notificationReceipt: 'notification.receipt',
  ticketRemoteAcknowledged: 'ticket.remote.acknowledged',
  rolePermissionReplace: 'role_permission.replace',
  userRoleAssign: 'user_role.assign',
  userRoleRemove: 'user_role.remove',
} as const;

export const auditLogEntityTypes = {
  policyPack: 'policy_pack',
  ticket: 'ticket',
  ticketBulk: 'ticket_bulk',
  auditLog: 'audit_log',
  configVersion: 'config_version',
  supportBundle: 'support_bundle',
  reportPack: 'report_pack',
  notification: 'notification',
  role: 'role',
  userRole: 'user_role',
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
