import { applySuperAdminLocalOnlyInvariant } from './apply-super-admin-local-only-invariant';
import { assertSuperAdminIsLocalOnly } from './assert-super-admin-is-local-only';
import { authenticationConstants } from './authentication.constants';
import { canBindExternalIdentity } from './can-bind-external-identity';

describe('SuperAdmin isLocalOnly invariant', () => {
  it('always materializes SuperAdmin as local-only without an external identity', () => {
    expect(applySuperAdminLocalOnlyInvariant()).toEqual({
      isLocalOnly: true,
      entraObjectId: null,
    });
  });

  it('accepts SuperAdmin only when isLocalOnly is true and no external id is bound', () => {
    expect(() =>
      assertSuperAdminIsLocalOnly({
        isLocalOnly: true,
        entraObjectId: null,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    ).not.toThrow();
  });

  it('rejects a SuperAdmin that is not local-only', () => {
    expect(() =>
      assertSuperAdminIsLocalOnly({
        isLocalOnly: false,
        entraObjectId: null,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    ).toThrow(/SUPER_ADMIN_MUST_BE_LOCAL_ONLY/);
  });

  it('rejects a SuperAdmin bound to an external identity', () => {
    expect(() =>
      assertSuperAdminIsLocalOnly({
        isLocalOnly: true,
        entraObjectId: 'entra-object-1',
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    ).toThrow(/SUPER_ADMIN_CANNOT_HAVE_EXTERNAL_IDENTITY/);
  });

  it('does not convert an external identity into local SuperAdmin', () => {
    expect(
      canBindExternalIdentity({
        isLocalOnly: true,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    ).toBe(false);
    expect(
      canBindExternalIdentity({
        isLocalOnly: false,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    ).toBe(false);
  });

  it('allows directory binding for non-local, non-SuperAdmin users', () => {
    expect(
      canBindExternalIdentity({
        isLocalOnly: false,
        roleKeys: ['AGENT'],
      }),
    ).toBe(true);
  });
});
