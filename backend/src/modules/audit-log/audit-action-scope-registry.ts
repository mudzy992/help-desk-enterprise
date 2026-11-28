import { auditLogActions } from './audit-log.constants';

export type AuditScopePolicy = 'global' | 'producer' | 'entity';

/** Explicit scope provenance policy for every canonical audit action. */
export const auditActionScopeRegistry: Readonly<Record<string, AuditScopePolicy>> = Object.freeze({
  ...Object.fromEntries(Object.values(auditLogActions).map((action) => [action, 'producer' as const])),
  [auditLogActions.authLoginFailed]: 'global',
  // W1.5: a CLI run belongs to the installation, not to one organisational unit.
  [auditLogActions.cliCommandExecuted]: 'global',
  [auditLogActions.securityMfaSecretsReencrypted]: 'global',
  [auditLogActions.opsDlqBaselineAcknowledged]: 'global',
  [auditLogActions.opsAlertTestSent]: 'global',
  // W2.35b: the manual directory catalog is installation-level metadata owned by
  // the SuperAdmin control plane; there is no unit to attribute a catalog row to
  // (the unit appears only when a read materializes the row into an OU, and that
  // OU write has its own entity-scoped audit).
  [auditLogActions.directoryCatalogUnitCreated]: 'global',
  [auditLogActions.directoryCatalogUnitUpdated]: 'global',
  [auditLogActions.directoryCatalogUnitDeleted]: 'global',
  [auditLogActions.ticketConfidentialViewed]: 'entity',
  [auditLogActions.ticketConfidentialDenied]: 'entity',
  [auditLogActions.ticketConfidentialBreakGlass]: 'entity',
  [auditLogActions.ticketForwarded]: 'entity',
  [auditLogActions.ticketMessageCreated]: 'entity',
  [auditLogActions.ticketPriorityOverridden]: 'entity',
  [auditLogActions.ticketMerged]: 'entity',
  [auditLogActions.ticketUnmerged]: 'entity',
  [auditLogActions.ticketRemoteAcknowledged]: 'entity',
  [auditLogActions.groupUpdated]: 'entity',
  [auditLogActions.groupMemberAdded]: 'entity',
  [auditLogActions.groupMemberRemoved]: 'entity',
  [auditLogActions.organizationalUnitCreated]: 'entity',
  [auditLogActions.organizationalUnitUpdated]: 'entity',
  [auditLogActions.problemCreated]: 'entity',
  [auditLogActions.problemUpdated]: 'entity',
  [auditLogActions.problemClaimed]: 'entity',
  [auditLogActions.problemStatusChanged]: 'entity',
  [auditLogActions.problemClosed]: 'entity',
  [auditLogActions.problemCancelled]: 'entity',
  [auditLogActions.problemReopened]: 'entity',
  [auditLogActions.problemKnowledgeArticleCreated]: 'entity',
  [auditLogActions.problemTicketsResolved]: 'entity',
  [auditLogActions.changeCreated]: 'entity',
  [auditLogActions.changeStatusChanged]: 'entity',
  [auditLogActions.changeApprovalRecorded]: 'entity',
  [auditLogActions.changeUpdated]: 'entity',
  [auditLogActions.changeClaimed]: 'entity',
  [auditLogActions.assetRetired]: 'entity',
  [auditLogActions.assetDisposed]: 'entity',
});

export function getAuditScopePolicy(action: string): AuditScopePolicy | undefined {
  return auditActionScopeRegistry[action];
}
