import { runWithRequestId } from '../../common/request-context/request-context.storage';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { auditPseudonymizedValue, auditRedactedValue, classifyAuditActor, getAuditRegistryInventory, prepareAuditEntry } from './audit-event-policy';

describe('canonical audit event policy', () => {
  const valid = {
    action: auditLogActions.userUpdated,
    entityType: auditLogEntityTypes.user,
    entityId: 'user-1',
    actorUserId: 'actor-1',
    metadata: { after: { active: true } },
  } as const;

  it('locks action, entity and actor registries', () => {
    expect(() => prepareAuditEntry({ ...valid, action: 'invented.action' as never })).toThrow('AUDIT_ACTION_NOT_REGISTERED');
    expect(() => prepareAuditEntry({ ...valid, entityType: 'invented_entity' as never })).toThrow('AUDIT_ENTITY_TYPE_NOT_REGISTERED');
    expect(classifyAuditActor('actor')).toBe('human');
    expect(classifyAuditActor(null)).toBe('system');
    expect(getAuditRegistryInventory().actions).toContain(auditLogActions.userUpdated);
  });

  it('enforces the action allowlist and centrally sanitizes secrets and direct identifiers', () => {
    expect(() => prepareAuditEntry({ ...valid, metadata: { invented: true } })).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED');
    const result = runWithRequestId('request-123', () => prepareAuditEntry({
      ...valid,
      metadata: { after: { accessToken: 'must-not-persist', email: 'person@example.test', harmless: 'ok' } },
    }));
    expect(result.requestId).toBe('request-123');
    expect(result.actionSchemaVersion).toBe(1);
    expect(result.metadata).toEqual({ after: { accessToken: auditRedactedValue, email: auditPseudonymizedValue, harmless: 'ok' } });
  });

  it('accepts the complete bounded ticket-export manifest metadata', () => {
    expect(() => prepareAuditEntry({
      action: auditLogActions.ticketsExport,
      entityType: auditLogEntityTypes.ticketExport,
      entityId: 'tickets',
      actorUserId: 'actor-1',
      metadata: {
        format: 'csv',
        recordCount: 100,
        eligibleCountLowerBound: 101,
        eligibleCountIsLowerBound: true,
        truncated: true,
        maxRows: 5000,
        filters: { status: 'OPEN' },
      },
    })).not.toThrow();
  });

  it.each([
    [auditLogActions.configVersionActivated, auditLogEntityTypes.configVersion, { reason: 'release', version: 3, rollbackOfVersion: null }, undefined],
    [auditLogActions.reportScheduleCreated, auditLogEntityTypes.reportSchedule, { name: 'Weekly', frequency: 'WEEKLY', sendTime: '08:00', sections: ['summary'], packKeys: [], recipientCount: 1, enabled: true }, undefined],
    [auditLogActions.privacyRequestExtended, auditLogEntityTypes.dataSubjectRequest, { extendedDueAt: '2026-12-01T00:00:00.000Z' }, undefined],
    [auditLogActions.assetTransferIssued, auditLogEntityTypes.assetTransfer, { number: 'AT-1', scenario: 'ASSIGN', assetCount: 1, fromUserId: null, toUserId: 'user-1' }, undefined],
    [auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, { key: 'laptop', attribute: 'serial', created: true }, undefined],
    [auditLogActions.statusIncidentEdited, auditLogEntityTypes.statusIncident, { changed: ['services'], services: { added: ['service-1'], removed: [] } }, undefined],
    [auditLogActions.assetRetired, auditLogEntityTypes.asset, { assetTag: 'A-1', reason: 'obsolete', releasedLicenses: 1 }, 'ou-1'],
    [auditLogActions.changeCreated, auditLogEntityTypes.change, { sequence: 1, type: 'NORMAL', risk: 'LOW', organizationalUnitId: 'ou-1' }, 'ou-1'],
  ] as const)('accepts production metadata for %s', (action, entityType, metadata, organizationalUnitId) => {
    expect(() => prepareAuditEntry({
      action,
      entityType,
      entityId: 'entity-1',
      actorUserId: 'actor-1',
      metadata,
      organizationalUnitId,
    })).not.toThrow();
  });

  it('fails closed for oversized or excessively deep metadata', () => {
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: { value: 'x'.repeat(17_000) } } })).toThrow('AUDIT_METADATA_SIZE_EXCEEDED');
    let deep: unknown = 'leaf';
    for (let index = 0; index < 10; index += 1) deep = { child: deep };
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: deep } as never })).toThrow('AUDIT_METADATA_DEPTH_EXCEEDED');
  });
});
