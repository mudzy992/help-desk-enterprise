import { auditActionCompatibilityRegistry, getAuditActionCompatibility } from './audit-action-compatibility-registry';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { prepareAuditEntry } from './audit-event-policy';

describe('closed audit action/entity/schema compatibility registry', () => {
  it('covers every core action with its explicit schema version and registered entity types', () => {
    expect(Object.keys(auditActionCompatibilityRegistry).sort()).toEqual(Object.values(auditLogActions).sort());
    const knownEntities = new Set<string>(Object.values(auditLogEntityTypes));
    for (const [action, contract] of Object.entries(auditActionCompatibilityRegistry)) {
      expect(contract.schemaVersion).toBe(action === auditLogActions.assetLocationSaved ? 2 : 1);
      expect(contract.extension).toBe(false);
      expect(contract.entityTypes.size).toBeGreaterThan(0);
      for (const entityType of contract.entityTypes) expect(knownEntities.has(entityType)).toBe(true);
    }
  });

  it('rejects a known action paired with an unregistered entity type', () => {
    expect(() => prepareAuditEntry({
      action: auditLogActions.auditExport,
      entityType: auditLogEntityTypes.user,
      entityId: 'user-1', metadata: {}, actorUserId: null,
    })).toThrow('AUDIT_ACTION_ENTITY_SCHEMA_NOT_REGISTERED:audit.export:user:1');
  });

  it('does not admit a syntactically valid extension unless statically declared', () => {
    expect(getAuditActionCompatibility('ext.acme.case_opened')).toBeUndefined();
    expect(() => prepareAuditEntry({
      action: 'ext.acme.case_opened', entityType: auditLogEntityTypes.ticket,
      entityId: 'ticket-1', metadata: {}, actorUserId: null,
    })).toThrow('AUDIT_ACTION_NOT_REGISTERED');
  });
});
