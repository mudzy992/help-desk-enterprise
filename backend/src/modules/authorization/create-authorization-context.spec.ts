import { authenticationConstants } from '../authentication/authentication.constants';
import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
import { createAuthorizationContext } from './create-authorization-context';
import { createTestAssignment } from './create-test-authorization-context';

describe('createAuthorizationContext', () => {
  it('returns null for missing, inactive, or incomplete users', () => {
    expect(createAuthorizationContext(null)).toBeNull();
    expect(
      createAuthorizationContext({
        id: 'user-1',
        isActive: false,
        isLocalOnly: false,
        entraObjectId: null,
        assignments: [createTestAssignment()],
      }),
    ).toBeNull();
    expect(
      createAuthorizationContext({
        id: '  ',
        isActive: true,
        isLocalOnly: false,
        entraObjectId: null,
        assignments: [createTestAssignment()],
      }),
    ).toBeNull();
  });

  it('fails closed when SuperAdmin is not local-only or has an external identity', () => {
    const broken = {
      id: 'super-admin-1',
      isActive: true,
      isLocalOnly: false,
      entraObjectId: 'entra-object-1',
      assignments: [
        createTestAssignment({
          roleKey: authenticationConstants.superAdminRoleKey,
          permissionKeys: [permissionKeys.settingsWrite],
        }),
      ],
    };
    expect(createAuthorizationContext(broken)).toBeNull();
    expect(
      createAuthorizationContext({
        ...broken,
        isLocalOnly: true,
        entraObjectId: 'entra-object-1',
      }),
    ).toBeNull();
  });

  it('marks a local-only SuperAdmin and drops incomplete assignments', () => {
    const context = createAuthorizationContext({
      id: 'super-admin-1',
      isActive: true,
      isLocalOnly: true,
      entraObjectId: null,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: ['', permissionKeys.settingsWrite],
        }),
        createTestAssignment({
          roleKey: '  ',
          permissionKeys: [permissionKeys.routingWrite],
        }),
        createTestAssignment({
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: null,
        }),
      ],
    });
    expect(context).toEqual({
      subjectId: 'super-admin-1',
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        {
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: [permissionKeys.settingsWrite],
          organizationalUnitId: null,
          organizationalUnitPath: null,
          serviceId: null,
        },
      ],
    });
    expect(context).not.toHaveProperty('entraObjectId');
    expect(context).not.toHaveProperty('provider');
  });
});
