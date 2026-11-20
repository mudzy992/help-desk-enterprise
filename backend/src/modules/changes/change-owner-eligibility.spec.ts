import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  changeManageScope,
  changeOwnerCandidates,
  changeOwnerEligibility,
  eligibleChangeOwnerIds,
  ownerEligibilityFrom,
} from './change-owner-eligibility';

function context(overrides: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    subjectId: 'user-1',
    email: 'user@example.test',
    displayName: 'User',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    roleKeys: [],
    groupIds: [],
    homeOrganizationalUnitId: 'ou-home',
    assignments: [],
    authzVersion: 1,
    ...overrides,
  };
}

function assignment(input: {
  readonly roleKey: string;
  readonly permission: string;
  readonly ou?: { readonly id: string; readonly path: string };
  readonly serviceId?: string | null;
}) {
  const global = input.ou === undefined && input.serviceId === undefined;
  return {
    assignmentId: `${input.roleKey}-${input.ou?.path ?? 'global'}`,
    roleKey: input.roleKey,
    permissionKeys: [input.permission],
    scope: global
      ? ({ kind: 'global' } as const)
      : input.ou !== undefined
        ? ({
            kind: 'organizational-unit',
            organizationalUnitId: input.ou.id,
            organizationalUnitPath: input.ou.path,
          } as const)
        : ({ kind: 'service', serviceId: input.serviceId ?? 'svc-1' } as const),
    organizationalUnitId: input.ou?.id ?? null,
    organizationalUnitPath: input.ou?.path ?? null,
    serviceId: input.serviceId ?? null,
  };
}

describe('change owner eligibility (BA-changes-10)', () => {
  it('accepts an active user whose change.manage covers the unit', () => {
    expect(
      ownerEligibilityFrom({
        isActive: true,
        anonymized: false,
        scope: { all: false, paths: ['/helpdesk'] },
        unitPath: '/helpdesk/network',
      }),
    ).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('rejects a manager scoped to another unit', () => {
    expect(
      ownerEligibilityFrom({
        isActive: true,
        anonymized: false,
        scope: { all: false, paths: ['/datacenter'] },
        unitPath: '/helpdesk/network',
      }),
    ).toEqual({ eligible: false, reason: 'out_of_scope' });
  });

  it('rejects an inactive or anonymized user even with a global assignment', () => {
    const base = {
      anonymized: false,
      scope: { all: true } as const,
      unitPath: '/helpdesk',
    };
    expect(ownerEligibilityFrom({ ...base, isActive: false }).reason).toBe('inactive');
    expect(
      ownerEligibilityFrom({ ...base, isActive: true, anonymized: true }).reason,
    ).toBe('anonymized');
  });

  it('fails closed when the unit path is unknown or the scope is empty', () => {
    expect(
      ownerEligibilityFrom({
        isActive: true,
        anonymized: false,
        scope: { all: true },
        unitPath: null,
      }).reason,
    ).toBe('out_of_scope');
    expect(
      ownerEligibilityFrom({
        isActive: true,
        anonymized: false,
        scope: { all: false, paths: [] },
        unitPath: '/helpdesk',
      }).reason,
    ).toBe('out_of_scope');
  });

  it('reads the same scope the access layer uses (scoped, global, service)', () => {
    expect(
      changeManageScope(
        context({
          assignments: [
            assignment({
              roleKey: 'CHANGE_MANAGER',
              permission: permissionKeys.changeManage,
              ou: { id: 'ou-1', path: '/helpdesk' },
            }),
          ],
        }),
        'user-1',
        '/home',
      ),
    ).toEqual({ all: false, paths: ['/helpdesk'] });

    expect(
      changeManageScope(
        context({
          assignments: [
            assignment({
              roleKey: 'ADMIN',
              permission: permissionKeys.changeManage,
            }),
          ],
        }),
        'user-1',
        '/home',
      ).all,
    ).toBe(true);

    // A service-scoped grant covers the home unit, exactly like `canManage`.
    expect(
      changeManageScope(
        context({
          assignments: [
            assignment({
              roleKey: 'CHANGE_MANAGER',
              permission: permissionKeys.changeManage,
              serviceId: 'svc-1',
            }),
          ],
        }),
        'user-1',
        '/home',
      ),
    ).toEqual({ all: false, paths: ['/home'] });
  });

  it('loads a page of candidates in one query and filters by unit', async () => {
    const rows = [
          {
            id: 'owner-in',
            displayName: 'Owner In',
            email: 'in@example.test',
            isActive: true,
            anonymizedAt: null,
            organizationalUnit: { ouPath: '/helpdesk' },
            userRoles: [
              {
                role: {
                  key: 'CHANGE_MANAGER',
                  rolePermissions: [
                    { permission: { key: permissionKeys.changeManage } },
                  ],
                },
                organizationalUnit: { id: 'ou-1', ouPath: '/helpdesk' },
                service: null,
              },
            ],
            groupMembers: [],
          },
          {
            id: 'owner-out',
            displayName: 'Owner Out',
            email: 'out@example.test',
            isActive: true,
            anonymizedAt: null,
            organizationalUnit: { ouPath: '/datacenter' },
            userRoles: [
              {
                role: {
                  key: 'CHANGE_MANAGER',
                  rolePermissions: [
                    { permission: { key: permissionKeys.changeManage } },
                  ],
                },
                organizationalUnit: { id: 'ou-2', ouPath: '/datacenter' },
                service: null,
              },
            ],
            groupMembers: [],
          },
    ];
    const prisma = {
      user: {
        findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
          rows.filter((row) => args.where.id.in.includes(row.id)),
        ),
      },
    };

    const eligible = await eligibleChangeOwnerIds(
      prisma as never,
      ['owner-in', 'owner-out'],
      '/helpdesk/network',
    );

    expect([...eligible]).toEqual(['owner-in']);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    await expect(
      changeOwnerEligibility(prisma as never, 'owner-out', '/helpdesk/network'),
    ).resolves.toEqual({ eligible: false, reason: 'out_of_scope' });
    const missing = await changeOwnerCandidates(
      prisma as never,
      ['does-not-exist'],
      '/helpdesk',
    );
    expect(missing.size).toBe(0);
  });
});
