import { ProblemNotifier } from './problem-notifier';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';
import { problemRecurrenceOccurrence } from './problem-notice-occurrence';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({ persistInAppNotification: jest.fn(async () => ({})) }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({ loadNotificationPreferencePolicy: jest.fn(async () => ({})) }));
jest.mock('../notifications/preferences/resolve-delivery-decisions', () => ({ resolveDeliveryDecisions: jest.fn(async () => new Map()) }));
jest.mock('../settings/read-installation-time-zone', () => ({ readInstallationTimeZone: jest.fn(async () => 'UTC') }));

const principal = (id: string, path: string) => ({ subjectId: id, isActive: true, homeOrganizationalUnitId: null, assignments: [{
  roleKey: 'AGENT', organizationalUnitId: path, organizationalUnitPath: path, serviceId: null, permissionKeys: ['problem.read'],
}] });

describe('problem notification visibility', () => {
  beforeEach(() => jest.clearAllMocks());
  it('does not deliver problem details to out-of-scope recipients or leak ticket identifiers in recurrence', async () => {
    const prisma = {
      problem: { findUnique: jest.fn(async () => ({ id: 'p1', sequence: 1, title: 'Problem', status: 'RESOLVED', priority: 'LOW', ownerUserId: 'inside', groupId: 'g1', targetAt: null, owner: null, organizationalUnit: { ouPath: '/inside' } })) },
      // W7.33: the recorded owner is checked against a fresh principal (revoke drift)
      // and the group managers are matched to the group's own unit.
      group: { findUnique: jest.fn(async () => ({ organizationalUnit: { ouPath: '/inside' } })) },
      user: {
        findUnique: jest.fn(async () => ({ isActive: true, anonymizedAt: null, organizationalUnit: { ouPath: '/inside' } })),
        findMany: jest.fn(async (args: { select: { email?: boolean } }) => args.select.email ? [
        { id: 'inside', email: 'in@example.test', displayName: 'In', preferredLocale: 'bs' },
        { id: 'outside', email: 'out@example.test', displayName: 'Out', preferredLocale: 'bs' },
      ] : [{ id: 'inside' }, { id: 'outside' }]),
      },
    };
    (loadPrincipalContext as jest.Mock).mockImplementation(async (_prisma, id: string) => principal(id, id === 'inside' ? '/inside' : '/outside'));
    const access = { configuration: async () => ({ numberPrefix: 'P-' }), hasPermission: () => true, scopeOf: async (viewer: { grants: { unitPath: string }[] }) => ({ all: false, paths: [viewer.grants[0].unitPath] }) };
    const notifier = new ProblemNotifier(prisma as never, {} as never, access as never, {} as never);
    // W7.42: the caller derives the occurrence from the references, so the
    // payload still carries no ticket identifier.
    expect(await notifier.recurrence('p1', problemRecurrenceOccurrence(['SECRET-TICKET']), 'actor')).toBe(1);
    expect(resolveDeliveryDecisions).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ userIds: ['inside'] }));
    expect(persistInAppNotification).toHaveBeenCalledTimes(1);
    const args = (persistInAppNotification as jest.Mock).mock.calls[0][1];
    expect(args.userId).toBe('inside');
    expect(JSON.stringify(args)).not.toContain('SECRET-TICKET');
  });
});
