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

  it('fails closed for oversized or excessively deep metadata', () => {
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: { value: 'x'.repeat(17_000) } } })).toThrow('AUDIT_METADATA_SIZE_EXCEEDED');
    let deep: unknown = 'leaf';
    for (let index = 0; index < 10; index += 1) deep = { child: deep };
    expect(() => prepareAuditEntry({ ...valid, metadata: { after: deep } as never })).toThrow('AUDIT_METADATA_DEPTH_EXCEEDED');
  });
});
