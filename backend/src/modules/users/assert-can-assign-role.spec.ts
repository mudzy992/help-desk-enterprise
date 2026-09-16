import { authenticationConstants } from '../authentication/authentication.constants';
import { assertCanAssignRole } from './assert-can-assign-role';
import { UsersError } from './users.error';

describe('assertCanAssignRole', () => {
  it('allows admin to assign non-super-admin roles', () => {
    expect(() =>
      assertCanAssignRole({
        roleKey: 'AGENT',
        actorIsSuperAdmin: false,
      }),
    ).not.toThrow();
  });

  it('blocks admin from assigning super-admin role', () => {
    expect(() =>
      assertCanAssignRole({
        roleKey: authenticationConstants.superAdminRoleKey,
        actorIsSuperAdmin: false,
      }),
    ).toThrow(UsersError);
  });

  it('allows super-admin to assign super-admin role', () => {
    expect(() =>
      assertCanAssignRole({
        roleKey: authenticationConstants.superAdminRoleKey,
        actorIsSuperAdmin: true,
      }),
    ).not.toThrow();
  });
});
