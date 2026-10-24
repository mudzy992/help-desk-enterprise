import { runWithRequestId } from '../../common/request-context/request-context.storage';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { auditRedactedValue, classifyAuditActor, getAuditRegistryInventory, prepareAuditEntry } from './audit-event-policy';

describe('canonical audit event policy', () => {
  const valid = {
    action: auditLogActions.userUpdated,
    entityType: auditLogEntityTypes.user,
    entityId: 'user-1',
    actorUserId: 'actor-1',
    metadata: { changed: true },
  } as const;

  it('locks action, entity and actor registries', () => {
    expect(() => prepareAuditEntry({ ...valid, action: 'invented.action' })).toThrow('AUDIT_ACTION_NOT_REGISTERED');
    expect(() => prepareAuditEntry({ ...valid, entityType: 'invented_entity' })).toThrow('AUDIT_ENTITY_TYPE_NOT_REGISTERED');
    expect(classifyAuditActor('actor')).toBe('human');
    expect(classifyAuditActor(null)).toBe('system');
    expect(getAuditRegistryInventory().actions).toContain(auditLogActions.userUpdated);
  });

  it('inherits correlation context and centrally redacts secrets', () => {
    const result = runWithRequestId('request-123', () => prepareAuditEntry({
      ...valid,
      metadata: { nested: { accessToken: 'must-not-persist', harmless: 'ok' } },
    }));
    expect(result.requestId).toBe('request-123');
    expect(result.metadata).toEqual({ nested: { accessToken: auditRedactedValue, harmless: 'ok' } });
  });

  it('fails closed for oversized or excessively deep metadata', () => {
    expect(() => prepareAuditEntry({ ...valid, metadata: { value: 'x'.repeat(17_000) } })).toThrow('AUDIT_METADATA_SIZE_EXCEEDED');
    let deep: unknown = 'leaf';
    for (let index = 0; index < 10; index += 1) deep = { child: deep };
    expect(() => prepareAuditEntry({ ...valid, metadata: deep as never })).toThrow('AUDIT_METADATA_DEPTH_EXCEEDED');
  });
});
