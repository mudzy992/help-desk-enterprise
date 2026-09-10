import { permissionKeys } from './authorization.constants';
import {
  createTestAuthorizationContext,
  createTestDecisionInput,
} from './create-test-authorization-context';
import { evaluateAuthorizationAccess } from './evaluate-authorization-access';

describe('evaluateAuthorizationAccess fail-closed', () => {
  it('denies a missing or incomplete identity', () => {
    expect(
      evaluateAuthorizationAccess(createTestDecisionInput({ context: null })),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({ subjectId: '   ' }),
        }),
      ),
    ).toBe(false);
  });

  it('denies empty role or permission requirement tokens', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredPermissions: ['   '],
          context: createTestAuthorizationContext({
            isLocalOnly: true,
            isSuperAdmin: true,
            assignments: [],
          }),
        }),
      ),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredRoles: [''],
          requiredPermissions: [],
        }),
      ),
    ).toBe(false);
  });

  it('denies when no role, permission, or OU requirement is declared', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredPermissions: [],
          requireOrganizationalUnitScope: false,
        }),
      ),
    ).toBe(false);
  });

  it('denies missing or blank OU scope when OU access is required', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requireOrganizationalUnitScope: true,
          organizationalUnitId: null,
          organizationalUnitPath: '/Korisnici',
        }),
      ),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requireOrganizationalUnitScope: true,
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: '',
        }),
      ),
    ).toBe(false);
  });

  it('denies missing service scope when a service scope is required', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          requireServiceScope: true,
          serviceId: null,
        }),
      ),
    ).toBe(false);
  });

  it('denies SuperAdmin when isLocalOnly is false', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            isLocalOnly: false,
            isSuperAdmin: true,
            assignments: [],
          }),
          requiredPermissions: [permissionKeys.settingsWrite],
        }),
      ),
    ).toBe(false);
  });
});
