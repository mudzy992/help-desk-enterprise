import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { resolveUserListScope } from './resolve-user-list-scope';

const assign = (
  overrides: Partial<AuthorizationContext['assignments'][number]>,
): AuthorizationContext['assignments'][number] => ({
  roleKey: 'ADMIN',
  permissionKeys: [permissionKeys.userManage],
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
  ...overrides,
});

const context = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => ({
  subjectId: 'admin-1',
  isLocalOnly: true,
  isSuperAdmin: false,
  assignments: [],
  ...overrides,
});

describe('resolveUserListScope (W2.10)', () => {
  it('narrows a scoped admin to its own subtree', () => {
    const scope = resolveUserListScope(
      context({
        assignments: [
          assign({ organizationalUnitId: 'ou-a', organizationalUnitPath: 'OU=A' }),
          assign({ organizationalUnitId: 'ou-a-it', organizationalUnitPath: 'OU=A/IT' }),
        ],
      }),
    );
    expect(scope).toEqual({
      unrestricted: false,
      organizationalUnitPaths: ['OU=A', 'OU=A/IT'],
    });
  });

  it('keeps an unscoped grant unrestricted', () => {
    expect(resolveUserListScope(context({ assignments: [assign({})] }))).toEqual({
      unrestricted: true,
      organizationalUnitPaths: [],
    });
  });

  it('grants the local super admin the whole directory and denies a provider-bound one', () => {
    expect(
      resolveUserListScope(context({ isSuperAdmin: true, isLocalOnly: true })),
    ).toEqual({ unrestricted: true, organizationalUnitPaths: [] });
    expect(
      resolveUserListScope(
        context({
          isSuperAdmin: true,
          isLocalOnly: false,
          assignments: [assign({})],
        }),
      ),
    ).toEqual({ unrestricted: false, organizationalUnitPaths: [] });
  });

  it('does not widen the list through a service-scoped grant', () => {
    const scope = resolveUserListScope(
      context({
        assignments: [
          assign({ organizationalUnitId: null, organizationalUnitPath: null, serviceId: 'svc-1' }),
        ],
      }),
    );
    expect(scope).toEqual({ unrestricted: false, organizationalUnitPaths: [] });
  });

  it('ignores assignments that do not carry the permission', () => {
    const scope = resolveUserListScope(
      context({
        assignments: [
          assign({
            permissionKeys: [permissionKeys.userDirectoryRead],
            organizationalUnitId: 'ou-b',
            organizationalUnitPath: 'OU=B',
          }),
        ],
      }),
    );
    expect(scope).toEqual({ unrestricted: false, organizationalUnitPaths: [] });
  });

  it('fails closed when the context cannot be loaded', () => {
    expect(resolveUserListScope(null)).toEqual({
      unrestricted: false,
      organizationalUnitPaths: [],
    });
    expect(resolveUserListScope(undefined)).toEqual({
      unrestricted: false,
      organizationalUnitPaths: [],
    });
  });
});
