import { auditActionSchemaRegistry } from './audit-action-schema-registry';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { prepareAuditEntry } from './audit-event-policy';

describe('audit action schema registry', () => {
  it('has exactly one explicit versioned schema for every registered action', () => {
    const actions = Object.values(auditLogActions).sort();
    expect(Object.keys(auditActionSchemaRegistry).sort()).toEqual(actions);
    for (const action of actions) {
      const schema = auditActionSchemaRegistry[action];
      expect(schema?.version).toBe(
        action === auditLogActions.assetLocationSaved ||
          action === auditLogActions.integrationJobRetried
          ? 2
          : 1,
      );
      expect(schema?.allowedKeys).toBeInstanceOf(Set);
      expect(['operational', 'pseudonymous', 'restricted']).toContain(schema?.sensitivity);
    }
  });

  it('accepts the metadata the on-call override writer actually sends', () => {
    // Regression: insertOverride audits overrideId/swapRequestId, but the
    // allowlist omitted both, so every override creation (manual or swap
    // accept) rolled back with AUDIT_METADATA_FIELD_NOT_ALLOWED.
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.onCallOverrideCreated,
        entityType: auditLogEntityTypes.onCallSchedule,
        entityId: 'schedule-1',
        actorUserId: 'user-1',
        metadata: {
          overrideId: 'override-1',
          userId: 'user-2',
          startsAt: '2027-01-01T08:00:00.000Z',
          endsAt: '2027-01-01T16:00:00.000Z',
          reason: 'coverage',
          swapRequestId: 'swap-1',
        },
      }),
    ).not.toThrow();
  });
});
