import { auditActionSchemaRegistry } from './audit-action-schema-registry';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { prepareAuditEntry } from './audit-event-policy';

/**
 * Actions whose metadata allowlist changed after the closed registry was
 * introduced. Every bump is listed here on purpose, so a silent edit to a
 * versioned contract fails this spec.
 */
const bumpedSchemaVersions = new Map<string, number>([
  [auditLogActions.assetLocationSaved, 2],
  [auditLogActions.integrationJobRetried, 2],
  // W7.71 (BA-changes-15): the template save now carries revisions and a diff.
  [auditLogActions.changeTemplateSaved, 2],
  // BA-changes-16: change creation records the CAB routing and its origin.
  [auditLogActions.changeCreated, 2],
  // W7.83 (BA-knowledge-base-09): a category update may carry its before/after snapshot.
  [auditLogActions.knowledgeCategoryUpdated, 2],
]);

describe('audit action schema registry', () => {
  it('has exactly one explicit versioned schema for every registered action', () => {
    const actions = Object.values(auditLogActions).sort();
    expect(Object.keys(auditActionSchemaRegistry).sort()).toEqual(actions);
    for (const action of actions) {
      const schema = auditActionSchemaRegistry[action];
      expect(schema?.version).toBe(bumpedSchemaVersions.get(action) ?? 1);
      expect(schema?.allowedKeys).toBeInstanceOf(Set);
      expect(['operational', 'pseudonymous', 'restricted']).toContain(schema?.sensitivity);
    }
  });

  it('accepts the snapshot a category update sends (BA-knowledge-base-09)', () => {
    // W7.83: the allowlist was empty while `KnowledgePortalService.updateCategory` sent `before`/`after`, so every
    // rename wrote the row and then failed with AUDIT_METADATA_FIELD_NOT_ALLOWED. This pins both fields.
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.knowledgeCategoryUpdated,
        entityType: auditLogEntityTypes.knowledgeCategory,
        entityId: 'category-1',
        actorUserId: 'user-1',
        metadata: { before: { nameBs: 'Mreža' }, after: { nameBs: 'Mreža i VPN' } },
      }),
    ).not.toThrow();
  });

  it('accepts the metadata the template editor actually sends (BA-changes-15)', () => {
    // W7.71: if this allowlist drifts, every template save rolls back with
    // AUDIT_METADATA_FIELD_NOT_ALLOWED - the same failure mode the on-call
    // override hit before its regression test existed.
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeTemplateSaved,
        entityType: auditLogEntityTypes.changeTemplate,
        entityId: 'template-1',
        actorUserId: 'user-1',
        metadata: {
          operation: 'updated',
          changedFields: ['name', 'impact', 'implementationPlan', 'services'],
          textChanged: ['implementationPlan'],
          name: 'Restart uz najavu',
          previousName: 'Restart',
          impact: 'MEDIUM',
          previousImpact: 'LOW',
          servicesAdded: 2,
          servicesRemoved: 1,
          previousRevision: '2027-01-01T10:00:00.000Z',
          revision: '2027-01-01T10:05:00.000Z',
        },
      }),
    ).not.toThrow();
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
