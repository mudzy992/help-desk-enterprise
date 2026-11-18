import { mapPrincipalUser } from '../../common/principal-context/load-principal-context';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  eligibleProblemOwnerWhere,
  evaluateProblemOwnerEligibility,
  problemUnitAncestors,
  type ProblemOwnerEligibilityInput,
} from './problem-owner-eligibility';

type Assignment = {
  readonly roleKey: string;
  readonly permissions?: readonly string[];
  readonly ou?: { readonly id: string; readonly path: string } | null;
  readonly serviceId?: string | null;
};

/** Builds the same principal the request path builds (one loader, no double rules). */
function principalOf(input: {
  readonly userId?: string;
  readonly groupIds?: readonly string[];
  readonly homeUnitId?: string | null;
  readonly assignments: readonly Assignment[];
}): PrincipalContext {
  const user = {
    id: input.userId ?? 'owner-1',
    email: 'owner@example.test',
    displayName: 'Owner',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    directoryObjectGuid: null,
    authzVersion: 1,
    organizationalUnitId: input.homeUnitId ?? null,
    userRoles: input.assignments.map((assignment, index) => ({
      id: `assignment-${index}`,
      role: {
        key: assignment.roleKey,
        rolePermissions: [...(assignment.permissions ?? [permissionKeys.problemManage])].map((key) => ({
          permission: { key },
        })),
      },
      organizationalUnit:
        assignment.ou == null ? null : { id: assignment.ou.id, ouPath: assignment.ou.path },
      service: assignment.serviceId == null ? null : { id: assignment.serviceId },
    })),
    groupMembers: (input.groupIds ?? ['group-1']).map((groupId) => ({ groupId })),
  };
  return mapPrincipalUser(user as never);
}

function inputOf(input: {
  readonly groupId?: string;
  readonly unitPath?: string | null;
  readonly homeUnitPath?: string | null;
  readonly isActive?: boolean;
  readonly anonymizedAt?: Date | null;
  readonly principal: PrincipalContext;
}): ProblemOwnerEligibilityInput {
  return {
    userId: 'owner-1',
    groupId: input.groupId ?? 'group-1',
    unitPath: input.unitPath === undefined ? 'sales/emea/sarajevo' : input.unitPath,
    isActive: input.isActive ?? true,
    anonymizedAt: input.anonymizedAt ?? null,
    principal: input.principal,
    homeUnitPath: input.homeUnitPath ?? null,
  };
}

describe('problemUnitAncestors (BA-problems-15)', () => {
  it('lists the unit and every parent, which is exactly what a grant can cover', () => {
    expect(problemUnitAncestors('sales/emea/sarajevo')).toEqual(['sales', 'sales/emea', 'sales/emea/sarajevo']);
    expect(problemUnitAncestors(' sales / emea ')).toEqual(['sales', 'sales/emea']);
    // `ouPath` is stored with its leading slash; the ancestors must keep it.
    expect(problemUnitAncestors('/Korisnici')).toEqual(['/Korisnici']);
    expect(problemUnitAncestors('/root/ou1/child')).toEqual(['/root', '/root/ou1', '/root/ou1/child']);
    expect(problemUnitAncestors('/')).toEqual([]);
    expect(problemUnitAncestors(null)).toEqual([]);
    expect(problemUnitAncestors('')).toEqual([]);
  });
});

describe('evaluateProblemOwnerEligibility (BA-problems-15)', () => {
  const unitPath = 'sales/emea/sarajevo';

  it('accepts a manager whose grant covers the problem unit or one of its parents', () => {
    const exact = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER', ou: { id: 'ou-3', path: unitPath } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: exact }))).toEqual({ eligible: true, reason: null });

    const parent = principalOf({ assignments: [{ roleKey: 'AGENT', ou: { id: 'ou-1', path: 'sales' } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: parent }))).toEqual({ eligible: true, reason: null });
  });

  it('refuses a grant that covers a different unit tree', () => {
    const sibling = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER', ou: { id: 'ou-9', path: 'sales/emea/mostar' } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: sibling }))).toEqual({
      eligible: false,
      reason: 'out_of_scope',
    });

    const descendant = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER', ou: { id: 'ou-10', path: `${unitPath}/support` } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: descendant }))).toEqual({
      eligible: false,
      reason: 'out_of_scope',
    });
  });

  it('accepts a cross-unit role only when the assignment itself is global', () => {
    const global = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER' }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: global }))).toEqual({ eligible: true, reason: null });

    const globalAdmin = principalOf({ assignments: [{ roleKey: 'ADMIN' }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: globalAdmin }))).toEqual({ eligible: true, reason: null });

    // The same role pinned to another unit keeps its unit scope.
    const scopedManager = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER', ou: { id: 'ou-9', path: 'ops' } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: scopedManager }))).toEqual({
      eligible: false,
      reason: 'out_of_scope',
    });
  });

  it('falls back to the home unit for an assignment that carries no unit', () => {
    const homeCovers = principalOf({
      homeUnitId: 'ou-1',
      assignments: [{ roleKey: 'AGENT' }],
    });
    expect(
      evaluateProblemOwnerEligibility(inputOf({ principal: homeCovers, homeUnitPath: 'sales' })),
    ).toEqual({ eligible: true, reason: null });

    const homeElsewhere = principalOf({
      homeUnitId: 'ou-7',
      assignments: [{ roleKey: 'AGENT' }],
    });
    expect(
      evaluateProblemOwnerEligibility(inputOf({ principal: homeElsewhere, homeUnitPath: 'ops/helpdesk' })),
    ).toEqual({ eligible: false, reason: 'out_of_scope' });

    // A service-scoped assignment also has no unit of its own.
    const serviceScoped = principalOf({ assignments: [{ roleKey: 'AGENT', serviceId: 'svc-1' }] });
    expect(
      evaluateProblemOwnerEligibility(inputOf({ principal: serviceScoped, homeUnitPath: 'sales/emea' })),
    ).toEqual({ eligible: true, reason: null });
  });

  it('reports why a recorded owner stopped being eligible (revoke drift)', () => {
    const manager = principalOf({ assignments: [{ roleKey: 'PROBLEM_MANAGER', ou: { id: 'ou-3', path: unitPath } }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: manager, isActive: false }))).toEqual({
      eligible: false,
      reason: 'inactive',
    });
    expect(
      evaluateProblemOwnerEligibility(inputOf({ principal: manager, anonymizedAt: new Date('2026-01-01T00:00:00Z') })),
    ).toEqual({ eligible: false, reason: 'inactive' });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: null as never, isActive: true }))).toEqual({
      eligible: false,
      reason: 'inactive',
    });

    const withoutManage = principalOf({ assignments: [{ roleKey: 'AGENT', permissions: [permissionKeys.problemRead] }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: withoutManage }))).toEqual({
      eligible: false,
      reason: 'not_manager',
    });

    expect(evaluateProblemOwnerEligibility(inputOf({ principal: manager, groupId: 'group-2' }))).toEqual({
      eligible: false,
      reason: 'not_member',
    });
  });

  it('never widens the rule when the problem has no unit', () => {
    const scoped = principalOf({ assignments: [{ roleKey: 'ADMIN', ou: { id: 'ou-1', path: 'sales' } }] });
    expect(
      evaluateProblemOwnerEligibility(inputOf({ principal: scoped, unitPath: null, homeUnitPath: 'sales' })),
    ).toEqual({ eligible: false, reason: 'out_of_scope' });
    const global = principalOf({ assignments: [{ roleKey: 'ADMIN' }] });
    expect(evaluateProblemOwnerEligibility(inputOf({ principal: global, unitPath: null }))).toEqual({
      eligible: true,
      reason: null,
    });
  });
});

describe('eligibleProblemOwnerWhere (BA-problems-15)', () => {
  type Where = Record<string, unknown>;
  type UserRoleWhere = { readonly AND?: readonly Where[]; readonly role?: Where; readonly user?: Where };

  function branches(where: Where): readonly UserRoleWhere[] {
    const userRoles = where.userRoles as { some: { OR: readonly UserRoleWhere[] } };
    return userRoles.some.OR;
  }

  it('keeps the group membership and the active/anonymised guard of the old rule', () => {
    const where = eligibleProblemOwnerWhere({ groupId: 'group-1', unitPath: 'sales/emea' }) as Where;
    expect(where.isActive).toBe(true);
    expect(where.anonymizedAt).toBeNull();
    expect(where.groupMembers).toEqual({ some: { groupId: 'group-1' } });
    const manage = (where.userRoles as { some: Where }).some.role as Where;
    expect(manage).toEqual({
      rolePermissions: { some: { permission: { key: permissionKeys.problemManage } } },
    });
  });

  it('mirrors the three scope lines of the canonical resolver', () => {
    const [global, unitScoped, homeScoped] = branches(
      eligibleProblemOwnerWhere({ groupId: 'group-1', unitPath: 'sales/emea/sarajevo' }) as Where,
    );
    // 1. a cross-unit role assignment without a unit
    expect(global?.AND).toEqual([
      { organizationalUnitId: null },
      { serviceId: null },
      { role: { key: { in: ['ADMIN', 'SUPER_ADMIN', 'PROBLEM_MANAGER'] } } },
    ]);
    // 2. a unit assignment that covers the problem unit (the unit or a parent)
    expect(unitScoped?.AND).toEqual([
      { serviceId: null },
      { organizationalUnit: { ouPath: { in: ['sales', 'sales/emea', 'sales/emea/sarajevo'] } } },
    ]);
    // 3. an assignment without a unit falls back to the home unit
    expect(homeScoped?.AND).toEqual([
      { organizationalUnitId: null },
      { user: { organizationalUnit: { ouPath: { in: ['sales', 'sales/emea', 'sales/emea/sarajevo'] } } } },
    ]);
  });

  it('drops the unit branches for a problem without a unit, so only cross-unit grants pass', () => {
    expect(branches(eligibleProblemOwnerWhere({ groupId: 'group-1', unitPath: null }) as Where)).toHaveLength(1);
  });
});

/*
  W7.35: the two shapes of the rule must agree on **real data**. W7.33 proved
  each shape on its own but fed both slash-less paths, while `ouPath` rows keep
  their leading slash — so the picker, the handoff managers and the notices
  matched nobody while the write path kept accepting the same person. This block
  evaluates the Prisma filter in memory against the exact check with the stored
  format.
*/
describe('both shapes of the owner rule agree on stored paths (W7.35)', () => {
  type Candidate = {
    readonly isActive: boolean;
    readonly anonymizedAt: Date | null;
    readonly homeUnitPath: string | null;
    readonly groupIds: readonly string[];
    readonly assignments: readonly {
      readonly roleKey: string;
      readonly permissions: readonly string[];
      readonly unitPath: string | null;
      readonly serviceId: string | null;
    }[];
  };

  type Where = Record<string, Record<string, unknown>>;

  const permissionKeysOf = permissionKeys.problemManage;

  /** Evaluates exactly the operators `eligibleProblemOwnerWhere` emits. */
  function matchesFilter(where: unknown, candidate: Candidate, unitPath: string | null, groupId: string): boolean {
    const filter = where as {
      isActive: boolean;
      anonymizedAt: unknown;
      groupMembers: { some: { groupId: string } };
      userRoles: {
        some: {
          role: { rolePermissions: { some: { permission: { key: string } } } };
          OR: readonly { AND: readonly Record<string, unknown>[] }[];
        };
      };
    };
    if (candidate.isActive !== filter.isActive) return false;
    if (filter.anonymizedAt !== null || candidate.anonymizedAt !== null) return false;
    if (!candidate.groupIds.includes(filter.groupMembers.some.groupId)) return false;
    const roleFilter = filter.userRoles.some.role.rolePermissions.some.permission.key;
    const assignmentMatches = (assignment: Candidate['assignments'][number]): boolean =>
      assignment.permissions.includes(roleFilter) &&
      filter.userRoles.some.OR.some((branch) =>
        branch.AND.every((condition) => {
          if ('organizationalUnitId' in condition) {
            if ((condition.organizationalUnitId as string | null) !== (assignment.unitPath === null ? null : 'set')) return false;
          }
          if ('serviceId' in condition) {
            if ((condition.serviceId as string | null) !== assignment.serviceId) return false;
          }
          if ('organizationalUnit' in condition) {
            const inList = (condition.organizationalUnit as { ouPath: { in: readonly string[] } }).ouPath.in;
            if (assignment.unitPath === null || !inList.includes(assignment.unitPath)) return false;
          }
          if ('user' in condition) {
            const inList = ((condition.user as { organizationalUnit: { ouPath: { in: readonly string[] } } }).organizationalUnit).ouPath.in;
            if (candidate.homeUnitPath === null || !inList.includes(candidate.homeUnitPath)) return false;
          }
          if ('role' in condition) {
            const keys = (condition.role as { key: { in: readonly string[] } }).key.in;
            if (!keys.includes(assignment.roleKey)) return false;
          }
          return true;
        }),
      );
    return candidate.assignments.some(assignmentMatches);
  }

  const unitPath = '/Korisnici';
  const groupId = 'group-1';
  const manager = (path: string | null, roleKey = 'PROBLEM_MANAGER') => ({
    roleKey,
    permissions: [permissionKeysOf],
    unitPath: path,
    serviceId: null,
  });

  const cases: readonly { readonly name: string; readonly candidate: Candidate }[] = [
    {
      name: 'group manager scoped to the group unit',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: [groupId],
        assignments: [manager(unitPath)],
      },
    },
    {
      name: 'group manager scoped to a parent unit',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: '/root',
        groupIds: [groupId],
        assignments: [manager('/root')],
      },
    },
    {
      name: 'group manager scoped to the unit and a sub-unit',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: `${unitPath}/it`,
        groupIds: [groupId],
        assignments: [manager(`${unitPath}/it`)],
      },
    },
    {
      name: 'group manager scoped to a sibling unit',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: '/Ostalo',
        groupIds: [groupId],
        assignments: [manager('/Ostalo')],
      },
    },
    {
      name: 'global problem manager',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: null,
        groupIds: [groupId],
        assignments: [manager(null)],
      },
    },
    {
      name: 'agent whose assignment carries no unit, home unit is the group unit',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: [groupId],
        assignments: [manager(null, 'AGENT')],
      },
    },
    {
      name: 'member without problem.manage',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: [groupId],
        assignments: [{ ...manager(unitPath), permissions: [permissionKeys.problemRead] }],
      },
    },
    {
      name: 'manager of another group',
      candidate: {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: ['group-2'],
        assignments: [manager(unitPath)],
      },
    },
    {
      name: 'deactivated manager',
      candidate: {
        isActive: false,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: [groupId],
        assignments: [manager(unitPath)],
      },
    },
  ];

  it.each(cases)('agrees for: $name', ({ candidate }) => {
    const where = eligibleProblemOwnerWhere({ groupId, unitPath });
    const filter = matchesFilter(where, candidate, unitPath, groupId);
    const exact = evaluateProblemOwnerEligibility({
      userId: 'owner-1',
      groupId,
      unitPath,
      isActive: candidate.isActive,
      anonymizedAt: candidate.anonymizedAt,
      principal: principalOf({
        groupIds: [...candidate.groupIds],
        homeUnitId: candidate.homeUnitPath === null ? null : 'home',
        assignments: candidate.assignments.map((assignment) => ({
          roleKey: assignment.roleKey,
          permissions: [...assignment.permissions],
          ou: assignment.unitPath === null ? null : { id: 'ou', path: assignment.unitPath },
          serviceId: assignment.serviceId,
        })),
      }),
      homeUnitPath: candidate.homeUnitPath,
    });
    expect(filter).toBe(exact.eligible);
  });

  it('lists a /Korisnici manager, which is the reported regression', () => {
    const where = eligibleProblemOwnerWhere({ groupId, unitPath });
    const scoped = matchesFilter(
      where,
      {
        isActive: true,
        anonymizedAt: null,
        homeUnitPath: unitPath,
        groupIds: [groupId],
        assignments: [manager('/Korisnici')],
      },
      unitPath,
      groupId,
    );
    expect(scoped).toBe(true);
  });
});
