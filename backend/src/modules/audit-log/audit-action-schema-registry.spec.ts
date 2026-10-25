import { auditActionSchemaRegistry } from './audit-action-schema-registry';
import { auditLogActions } from './audit-log.constants';

describe('audit action schema registry', () => {
  it('has exactly one explicit versioned schema for every registered action', () => {
    const actions = Object.values(auditLogActions).sort();
    expect(Object.keys(auditActionSchemaRegistry).sort()).toEqual(actions);
    for (const action of actions) {
      const schema = auditActionSchemaRegistry[action];
      expect(schema?.version).toBe(1);
      expect(schema?.allowedKeys).toBeInstanceOf(Set);
      expect(['operational', 'pseudonymous', 'restricted']).toContain(schema?.sensitivity);
    }
  });
});
