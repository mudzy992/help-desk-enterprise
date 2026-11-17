import { problemCrossDomainVisibility } from './problem-cross-domain-visibility';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

function loaderFor(context: AuthorizationContext | null) {
  return { loadBySubjectId: jest.fn(async () => context) } as never;
}

const assignment = (overrides: Partial<AuthorizationContext['assignments'][number]>) => ({
  roleKey: authorizationRoleKeys.agent,
  permissionKeys: ['problem.read', 'problem.manage'],
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
  ...overrides,
});

const context = (overrides: Partial<AuthorizationContext>): AuthorizationContext => ({
  subjectId: 'u1',
  isLocalOnly: true,
  isSuperAdmin: false,
  assignments: [],
  ...overrides,
});

/**
 * W7.29 (BA-problems-11): problem authority is not authority over the service
 * catalog or over incidents. The problem module borrows both domains' own read
 * policies instead of widening them.
 */
describe('problemCrossDomainVisibility', () => {
  it('offers an agent only the published lifecycles, never drafts', async () => {
    const result = await problemCrossDomainVisibility(loaderFor(context({ assignments: [assignment({})] })), 'u1');
    expect(result.serviceWhere).toEqual({ lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } });
  });

  it('lets a global admin read drafts, and a scoped admin only its own', async () => {
    const global = await problemCrossDomainVisibility(
      loaderFor(context({ assignments: [assignment({ roleKey: authorizationRoleKeys.admin })] })),
      'u1',
    );
    expect(global.serviceWhere).toEqual({ lifecycle: { in: ['DRAFT', 'ACTIVE', 'DEPRECATED'] } });

    const scoped = await problemCrossDomainVisibility(
      loaderFor(
        context({
          assignments: [
            assignment({ roleKey: authorizationRoleKeys.admin, serviceId: 'svc-a' }),
            assignment({}),
          ],
        }),
      ),
      'u1',
    );
    expect(scoped.serviceWhere).toEqual({
      AND: [
        {
          OR: [
            { lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } },
            { lifecycle: { in: ['DRAFT'] }, id: { in: ['svc-a'] } },
          ],
        },
      ],
    });
  });

  it('fails closed when the user has no authorization context at all', async () => {
    const result = await problemCrossDomainVisibility(loaderFor(null), 'u1');
    expect(result.serviceWhere).toEqual({ lifecycle: { in: ['ACTIVE'] } });
    expect(result.incidents).toEqual({ userId: 'u1', isStaff: false, canManage: false, staffScope: null });
  });

  it('gives a service-scoped staff member only the incidents of its own services', async () => {
    const result = await problemCrossDomainVisibility(
      loaderFor(
        context({
          assignments: [
            assignment({
              roleKey: authorizationRoleKeys.agent,
              serviceId: 'svc-a',
              permissionKeys: ['status.incidents.read'],
            }),
          ],
        }),
      ),
      'u1',
    );
    expect(result.incidents.isStaff).toBe(true);
    expect(result.incidents.staffScope).toMatchObject({ global: false, serviceIds: ['svc-a'] });
  });

  it('does not promote a global problem manager into global status-page staff', async () => {
    const result = await problemCrossDomainVisibility(
      loaderFor(
        context({
          assignments: [
            assignment({
              roleKey: authorizationRoleKeys.problemManager,
              permissionKeys: ['problem.read', 'problem.manage', 'problem.close'],
            }),
          ],
        }),
      ),
      'u1',
    );
    // No agent/admin assignment: the status page treats this user as a requester.
    expect(result.incidents.isStaff).toBe(false);
    expect(result.incidents.staffScope).toBeNull();
  });
});
