import { ProblemNotifier } from './problem-notifier';
import { problemResolutionRunOccurrence, problemVersionOccurrence } from './problem-notice-occurrence';

/*
  W7.31 (BA-problems-13): a repeated notice of the same business event must find
  the existing in-app row and e-mail ledger entry instead of creating a second
  message. The occurrence is now stable, so the two channels dedupe by
  `problem:<type>:<problemId>:<occurrence>:<userId>`.

  Collaborators are mocked so the test observes exactly what the notifier hands
  to the persistence layers; the fakes keep one "unique index" per channel, the
  way the DB and the ledger do.
*/
const inAppKeys: string[] = [];
const emailKeys: string[] = [];

jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({
  persistInAppNotification: jest.fn(async (_prisma: unknown, input: { readonly dedupeKey: string }) => {
    if (inAppKeys.includes(input.dedupeKey)) return null;
    inAppKeys.push(input.dedupeKey);
    return { id: `notification-${inAppKeys.length}` };
  }),
}));

jest.mock('../notifications/email/deliver-notification-email', () => ({
  deliverNotificationEmail: jest.fn(async (_prisma: unknown, _transport: unknown, _channel: unknown, input: { readonly dedupeKey: string }) => {
    if (!emailKeys.includes(input.dedupeKey)) emailKeys.push(input.dedupeKey);
    return { id: `email-${emailKeys.length}` };
  }),
}));

jest.mock('../notifications/email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(async () => ({
    deliveryEnabled: true,
    internalOnly: false,
    internalDomains: [],
    allowedExternalDomains: [],
    allowedExternalEmails: [],
    defaultLocale: 'bs',
    smtp: { host: 'smtp.test', port: 25, secure: false, fromAddress: 'help@test', fromName: 'Help' },
  })),
}));

jest.mock('../notifications/email/is-allowed-notification-email-address', () => ({
  isAllowedNotificationEmailAddress: () => true,
}));

jest.mock('../notifications/email/compose-ticket-email', () => ({
  resolveEmailLocale: () => 'bs',
}));

jest.mock('./compose-problem-email', () => ({
  composeProblemEmail: () => ({ subject: 'Problem', text: 'text', html: '<p>text</p>', messageId: 'message-1', headers: {} }),
  problemStatusLabel: () => 'Status',
}));

jest.mock('../notifications/preferences/notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn(async () => ({})),
  requireNotificationPreferencePolicyForType: () => undefined,
}));

jest.mock('../notifications/preferences/resolve-delivery-decisions', () => ({
  resolveDeliveryDecisions: jest.fn(async (_prisma: unknown, _policy: unknown, input: { readonly userIds: readonly string[] }) =>
    new Map(input.userIds.map((userId) => [userId, { inApp: true, email: 'ALL' as const }])),
  ),
}));

jest.mock('../settings/read-installation-time-zone', () => ({
  readInstallationTimeZone: jest.fn(async () => 'UTC'),
}));

jest.mock('../../common/principal-context/load-principal-context', () => ({
  loadPrincipalContext: jest.fn(async (prisma: { readonly userId: string }) => ({
    userId: prisma.userId,
    isActive: true,
    assignments: [],
  })),
}));

const users = [
  { id: 'owner-1', email: 'owner@test', displayName: 'Vlasnik', preferredLocale: 'bs' },
  { id: 'agent-2', email: 'agent@test', displayName: 'Agent', preferredLocale: 'bs' },
];

const prisma = {
  problem: {
    findUnique: jest.fn(async () => ({
      id: 'problem-1',
      sequence: 7,
      title: 'Printer',
      status: 'INVESTIGATING',
      priority: 'HIGH',
      ownerUserId: 'owner-1',
      groupId: 'group-1',
      targetAt: new Date('2026-11-20T08:00:00.000Z'),
      organizationalUnit: { ouPath: '/root' },
      owner: { displayName: 'Vlasnik' },
    })),
  },
  // The status notice goes to agents of the tickets that are still open.
  problemTicket: {
    findMany: jest.fn(async () => [{ ticket: { assignedUserId: 'owner-1' } }]),
  },
  user: {
    findMany: jest.fn(async (query: { readonly where: { readonly id: { readonly in: readonly string[] } } }) =>
      users.filter((user) => query.where.id.in.includes(user.id)),
    ),
  },
};

const access = {
  configuration: jest.fn(async () => ({ numberPrefix: 'P-' })),
  hasPermission: jest.fn(() => true),
  scopeOf: jest.fn(async () => ({ all: true, paths: [] as readonly string[] })),
};

const settings = {} as never;

function notifier(): ProblemNotifier {
  return new ProblemNotifier(prisma as never, settings, access as never, {} as never);
}

beforeEach(() => {
  inAppKeys.length = 0;
  emailKeys.length = 0;
  jest.clearAllMocks();
});

describe('problem notifier dedupe', () => {
  it('delivers an owner announcement once when the same event is retried later', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-17T09:00:00.000Z'));
    const occurrence = problemVersionOccurrence(4);
    const first = await notifier().ownerAssigned('problem-1', 'actor-1', occurrence);
    jest.setSystemTime(new Date('2026-11-17T09:05:00.000Z'));
    const second = await notifier().ownerAssigned('problem-1', 'actor-1', occurrence);
    jest.useRealTimers();

    // One in-app row and one ledger entry for the user, despite two attempts.
    expect(inAppKeys).toHaveLength(1);
    expect(emailKeys).toHaveLength(1);
    expect(inAppKeys[0]).toBe('problem:problem.assigned:problem-1:v4:owner-1');
    expect(emailKeys[0]).toBe(inAppKeys[0]);
    // The second attempt is an acknowledged replay, not a second message.
    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('treats a different problem version as a new announcement', async () => {
    await notifier().ownerAssigned('problem-1', 'actor-1', problemVersionOccurrence(4));
    await notifier().ownerAssigned('problem-1', 'actor-1', problemVersionOccurrence(5));

    expect(inAppKeys).toHaveLength(2);
    expect(emailKeys).toEqual([
      'problem:problem.assigned:problem-1:v4:owner-1',
      'problem:problem.assigned:problem-1:v5:owner-1',
    ]);
  });

  it('keeps a resolution run replay idempotent while reaching new recipients', async () => {
    const occurrence = problemResolutionRunOccurrence('run-1', 'RESOLVED');
    await notifier().statusChanged('problem-1', 'RESOLVED', 'actor-1', occurrence);
    // The resumed run resolved one more ticket: its agent was never notified.
    prisma.problemTicket.findMany.mockResolvedValueOnce([
      { ticket: { assignedUserId: 'owner-1' } },
      { ticket: { assignedUserId: 'agent-2' } },
    ] as never);
    await notifier().statusChanged('problem-1', 'RESOLVED', 'actor-1', occurrence);

    // The already notified user gets nothing new; the newly resolved agent does.
    expect(inAppKeys).toEqual([
      'problem:problem.resolved:problem-1:run:run-1:RESOLVED:owner-1',
      'problem:problem.resolved:problem-1:run:run-1:RESOLVED:agent-2',
    ]);
  });

  it('refuses a notice without a stable occurrence', async () => {
    await expect(notifier().ownerAssigned('problem-1', 'actor-1', { key: '' })).rejects.toThrow('PROBLEM_NOTICE_OCCURRENCE_MISSING');
    expect(inAppKeys).toHaveLength(0);
  });
});
