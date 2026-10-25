import { auditActionScopeRegistry } from './audit-action-scope-registry';
import { auditLogActions } from './audit-log.constants';

describe('audit action scope registry', () => {
  it('classifies every action and locks critical entity/global policies', () => {
    expect(Object.keys(auditActionScopeRegistry).sort()).toEqual(Object.values(auditLogActions).sort());
    expect(auditActionScopeRegistry[auditLogActions.ticketConfidentialViewed]).toBe('entity');
    expect(auditActionScopeRegistry[auditLogActions.organizationalUnitUpdated]).toBe('entity');
    expect(auditActionScopeRegistry[auditLogActions.authLoginFailed]).toBe('global');
    expect(new Set(Object.values(auditActionScopeRegistry))).toEqual(new Set(['global', 'producer', 'entity']));
  });
});
