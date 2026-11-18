import { ProblemNotifier } from './problem-notifier';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({ persistInAppNotification: jest.fn(async () => ({})) }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({ loadNotificationPreferencePolicy: jest.fn(async () => ({})) }));
jest.mock('../notifications/preferences/resolve-delivery-decisions', () => ({ resolveDeliveryDecisions: jest.fn(async () => new Map()) }));
jest.mock('../settings/read-installation-time-zone', () => ({ readInstallationTimeZone: jest.fn(async () => 'UTC') }));

/** A principal with exactly the permissions the case needs, scoped to one unit. */
function principal(id: string, permissions: readonly string[]) {
  return {
    subjectId: id,
    isActive: true,
    homeOrganizationalUnitId: null,
    groupIds: ['g1'],
    assignments: [
      {
        roleKey: 'PROBLEM_MANAGER',
        organizationalUnitId: '/inside',
        organizationalUnitPath: '/inside',
        serviceId: null,
        permissionKeys: permissions,
      },
    ],
  };
}

const targetAt = new Date('2026-11-20T10:00:00Z');

function setup(input: { readonly ownerGrantsManage: boolean; readonly managers: readonly string[] }) {
  const prisma = {
    problem: {
      findUnique: jest.fn(async () => ({
        id: 'p1',
        sequence: 1,
        title: 'Problem',
        status: 'INVESTIGATING',
        priority: 'LOW',
        ownerUserId: 'owner',
        groupId: 'g1',
        targetAt,
        owner: { displayName: 'Vlasnik' },
        organizationalUnit: { ouPath: '/inside' },
      })),
    },
    group: { findUnique: jest.fn(async () => ({ organizationalUnit: { ouPath: '/inside' } })) },
    user: {
      // W7.33: the recorded owner is re-checked, the group managers are looked up.
      findUnique: jest.fn(async () => ({
        isActive: true,
        anonymizedAt: null,
        organizationalUnit: { ouPath: '/inside' },
      })),
      findMany: jest.fn(
        async (args: { select: Record<string, unknown>; where?: { id?: { in?: readonly string[] } } }) => {
          const recipientIds = args.where?.id?.in;
          if (recipientIds !== undefined) {
            return input.managers
              .concat('owner')
              .filter((id) => recipientIds.includes(id))
              .map((id) => ({ id, email: `${id}@example.test`, displayName: id, preferredLocale: 'bs' }));
          }
          return input.managers.map((id) => ({ id }));
        },
      ),
    },
  };
  (loadPrincipalContext as jest.Mock).mockImplementation(async (_prisma, id: string) =>
    principal(id, input.ownerGrantsManage || id !== 'owner' ? ['problem.manage', 'problem.read'] : ['problem.read']),
  );
  const access = {
    configuration: async () => ({ numberPrefix: 'P-' }),
    hasPermission: (viewer: { grants: { permission: string }[] }) =>
      viewer.grants.some((grant) => grant.permission === 'problem.read'),
    scopeOf: async () => ({ all: false, paths: ['/inside'] }),
  };
  const notifier = new ProblemNotifier(prisma as never, {} as never, access as never, {} as never);
  return { notifier, prisma };
}

/**
 * W7.33 (BA-problems-15), revoke drift: the recorded owner stays in the record,
 * but an owner who lost the grant stops receiving owner-directed reminders and
 * the group managers take over. Without managers the reminder is a policy
 * outcome (`NO_RECIPIENT`), not a lost message.
 */
describe('ProblemNotifier owner revoke drift', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reminds the owner while the grant is still there', async () => {
    const { notifier } = setup({ ownerGrantsManage: true, managers: ['manager'] });
    const outcome = await notifier.targetDueDetailed('p1', 'due');

    expect(outcome.delivered).toBe(1);
    const args = (persistInAppNotification as jest.Mock).mock.calls[0][1] as { userId: string };
    expect(args.userId).toBe('owner');
  });

  it('skips a revoked owner and reminds the group managers instead', async () => {
    const { notifier } = setup({ ownerGrantsManage: false, managers: ['manager'] });
    const outcome = await notifier.targetDueDetailed('p1', 'due');

    const notified = (persistInAppNotification as jest.Mock).mock.calls.map(
      (call) => (call[1] as { userId: string }).userId,
    );
    expect(notified).toEqual(['manager']);
    expect(outcome.delivered).toBe(1);
    expect(resolveDeliveryDecisions).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ userIds: ['manager'] }),
    );
  });

  it('reports NO_RECIPIENT when the owner lost the grant and no manager is left', async () => {
    const { notifier } = setup({ ownerGrantsManage: false, managers: [] });
    const outcome = await notifier.targetDueDetailed('p1', 'due');

    expect(persistInAppNotification).not.toHaveBeenCalled();
    expect(outcome).toEqual({ delivered: 0, recipients: 0, failures: 0, errorCode: null });
  });

  it('matches the group managers to the group unit, not to any unit', async () => {
    const { notifier, prisma } = setup({ ownerGrantsManage: false, managers: ['manager'] });
    await notifier.targetDueDetailed('p1', 'due');

    const managerQuery = (prisma.user.findMany as jest.Mock).mock.calls.find(
      (call: [{ where?: { id?: unknown } }]) => call[0].where?.id === undefined,
    );
    const where = (managerQuery?.[0] as { where: Record<string, unknown> }).where as {
      groupMembers: unknown;
      userRoles: { some: { OR: Array<{ AND: Array<Record<string, unknown>> }> } };
    };
    expect(where.groupMembers).toEqual({ some: { groupId: 'g1' } });
    const unitBranch = where.userRoles.some.OR[1]?.AND[1] as {
      organizationalUnit: { ouPath: { in: string[] } };
    };
    // The stored format, slash included (W7.35: the filter used to strip it).
    expect(unitBranch.organizationalUnit.ouPath.in).toEqual(['/inside']);
  });
});
