import { evaluateResourcePolicy } from './evaluate-resource-policy';
import type { AuthorizationAssignment, AuthorizationContext } from './authorization.types';

const assignment = (input: Partial<AuthorizationAssignment> = {}): AuthorizationAssignment => ({
  roleKey: 'IRRELEVANT_ROLE',
  permissionKeys: ['resource.read'],
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
  ...input,
});
const context = (assignments: readonly AuthorizationAssignment[], subjectId = 'user-a'): AuthorizationContext => ({
  subjectId, isLocalOnly: false, isSuperAdmin: false, assignments,
});
const target = { ownerUserId: null, organizationalUnitId: null, organizationalUnitPath: null, serviceId: null };

describe('central resource policy', () => {
  it('uses permission rather than role key shortcuts', () => {
    expect(evaluateResourcePolicy({ context: context([assignment({ roleKey: 'UNKNOWN' })]), permissionKey: 'resource.read', target, allowOwner: false }).allowed).toBe(true);
    expect(evaluateResourcePolicy({ context: context([assignment({ roleKey: 'SUPER_ADMIN', permissionKeys: [] })]), permissionKey: 'resource.read', target, allowOwner: false }).allowed).toBe(false);
  });

  it('allows descendant OU and denies sibling OU', () => {
    const ctx = context([assignment({ organizationalUnitId: 'ou-a', organizationalUnitPath: '/root/a' })]);
    expect(evaluateResourcePolicy({ context: ctx, permissionKey: 'resource.read', target: { ...target, organizationalUnitId: 'ou-child', organizationalUnitPath: '/root/a/child' }, allowOwner: false }).allowed).toBe(true);
    expect(evaluateResourcePolicy({ context: ctx, permissionKey: 'resource.read', target: { ...target, organizationalUnitId: 'ou-b', organizationalUnitPath: '/root/b' }, allowOwner: false }).allowed).toBe(false);
  });

  it('allows only the exact service and fails closed for dual-scope targets', () => {
    const ctx = context([assignment({ serviceId: 'service-a' })]);
    expect(evaluateResourcePolicy({ context: ctx, permissionKey: 'resource.read', target: { ...target, serviceId: 'service-a' }, allowOwner: false }).allowed).toBe(true);
    expect(evaluateResourcePolicy({ context: ctx, permissionKey: 'resource.read', target: { ...target, serviceId: 'service-b' }, allowOwner: false }).allowed).toBe(false);
    expect(evaluateResourcePolicy({ context: ctx, permissionKey: 'resource.read', target: { ...target, serviceId: 'service-a', organizationalUnitId: 'ou-a', organizationalUnitPath: '/root/a' }, allowOwner: false }).reason).toBe('INVALID_INPUT');
  });

  it('requires explicit ownership opt-in and a matching permission', () => {
    const owned = { ...target, ownerUserId: 'user-a', organizationalUnitId: 'ou-foreign', organizationalUnitPath: '/foreign' };
    const scopedGrant = assignment({ organizationalUnitId: 'ou-home', organizationalUnitPath: '/home' });
    expect(evaluateResourcePolicy({ context: context([scopedGrant]), permissionKey: 'resource.read', target: owned, allowOwner: false }).allowed).toBe(false);
    expect(evaluateResourcePolicy({ context: context([scopedGrant]), permissionKey: 'resource.read', target: owned, allowOwner: true }).reason).toBe('OWNER_ALLOWED');
    expect(evaluateResourcePolicy({ context: context([assignment({ permissionKeys: [] })]), permissionKey: 'resource.read', target: owned, allowOwner: true }).allowed).toBe(false);
  });
});
