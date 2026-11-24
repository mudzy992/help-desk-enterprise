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

  it('bounds the hash-bound request id instead of writing an unreadable one', () => {
    // The request context already replaced the malformed id with a generated one,
    // so the chain gets a usable correlation id rather than 400 characters of input.
    const hostile = `req-${'z'.repeat(400)}`;
    const fromContext = runWithRequestId(hostile, () => prepareAuditEntry(valid));
    expect(fromContext.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fromContext.requestId).not.toBe(hostile);

    const explicit = prepareAuditEntry({ ...valid, requestId: 'req\r\nInjected: 1' });
    expect(explicit.requestId).toBeNull();

    const clean = prepareAuditEntry({ ...valid, requestId: 'edge-1' });
    expect(clean.requestId).toBe('edge-1');
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
    [auditLogActions.assetLocationSaved, auditLogEntityTypes.assetLocation, { created: true }, undefined],
    [auditLogActions.assetLocationSaved, auditLogEntityTypes.assetLocation, { archived: false }, undefined],
    [auditLogActions.statusIncidentEdited, auditLogEntityTypes.statusIncident, { changed: ['services'], services: { added: ['service-1'], removed: [] } }, undefined],
    [auditLogActions.assetRetired, auditLogEntityTypes.asset, { assetTag: 'A-1', reason: 'obsolete', releasedLicenses: 1 }, 'ou-1'],
    [auditLogActions.changeCreated, auditLogEntityTypes.change, { sequence: 1, type: 'NORMAL', risk: 'LOW', organizationalUnitId: 'ou-1' }, 'ou-1'],
    [auditLogActions.problemUpdated, auditLogEntityTypes.problem, { changedFields: ['description', 'ownerUserId'], textChanged: ['description'], ownerUserId: 'user-1', previousOwnerUserId: 'user-2' }, 'ou-1'],
    [auditLogActions.problemUpdated, auditLogEntityTypes.problem, { changedFields: ['organizationalUnitId'], organizationalUnitId: 'ou-2', previousOrganizationalUnitId: 'ou-1' }, 'ou-2'],
    [auditLogActions.problemClaimed, auditLogEntityTypes.problem, { ownerUserId: 'user-1', previousOwnerUserId: null }, 'ou-1'],
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

  it('keeps problem free text names out of the canonical metadata', () => {
    const base = {
      action: auditLogActions.problemUpdated,
      entityType: auditLogEntityTypes.problem,
      entityId: 'problem-1',
      actorUserId: 'actor-1',
      organizationalUnitId: 'ou-1',
    } as const;
    expect(() => prepareAuditEntry({ ...base, metadata: { changedFields: ['description'], textChanged: ['description'] } })).not.toThrow();
    for (const field of ['description', 'rootCause', 'resolution', 'workaround', 'rcaWhys', 'title'] as const) {
      expect(() => prepareAuditEntry({ ...base, metadata: { [field]: 'sensitive content' } })).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED');
    }
  });

  it('records asset-location metadata under schema version 2', () => {
    const prepared = prepareAuditEntry({
      action: auditLogActions.assetLocationSaved,
      entityType: auditLogEntityTypes.assetLocation,
      entityId: 'location-1',
      actorUserId: 'actor-1',
      metadata: { archived: true },
    });
    expect(prepared.actionSchemaVersion).toBe(2);
  });

  it('fails closed for oversized or excessively deep metadata', () => {
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: { value: 'x'.repeat(17_000) } } })).toThrow('AUDIT_METADATA_SIZE_EXCEEDED');
    let deep: unknown = 'leaf';
    for (let index = 0; index < 10; index += 1) deep = { child: deep };
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: deep } as never })).toThrow('AUDIT_METADATA_DEPTH_EXCEEDED');
  });
});
