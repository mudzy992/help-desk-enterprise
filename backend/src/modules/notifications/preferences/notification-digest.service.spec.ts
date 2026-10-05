import { composeDigestEmail } from '../email/compose-digest-email';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { loadEmailChannelConfiguration } from '../email/load-email-channel-configuration';
import { loadNotificationPreferencePolicy } from './notification-preference-policy';
import { NotificationDigestService } from './notification-digest.service';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(),
}));
jest.mock('../email/deliver-notification-email', () => ({
  deliverNotificationEmail: jest.fn(async () => true),
}));
jest.mock('../email/compose-digest-email', () => ({
  composeDigestEmail: jest.fn(() => ({
    subject: 'Vaši tiketi',
    text: 'tickets',
    html: '<p>tickets</p>',
    messageId: 'message-1',
    headers: {},
    ticketCount: 1,
  })),
}));
jest.mock('./notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn(async () => ({
    preferencesEnabled: true,
    digestEnabled: true,
    digestDefaultMinute: 450,
    digestMaxItems: 10,
    quietHoursEnabled: true,
    quietBypass: new Set<string>(),
    timeZone: 'Europe/Sarajevo',
  })),
}));

const configuration = {
  deliveryEnabled: true,
  smtpEnabled: true,
  emailAddonEnabled: true,
  notificationsEmailEnabled: true,
  slaEscalationEmailEnabled: true,
  templatesEnabled: true,
  internalOnly: false,
  internalDomains: [],
  allowedExternalDomains: [],
  allowedExternalEmails: [],
  templates: {},
  smtp: { fromAddress: 'helpdesk@example.com', host: 'smtp.example.com' },
  presentation: {
    supportedLocales: ['bs', 'en'],
    defaultLocale: 'bs',
    fallbackLocale: 'en',
  },
};

type DigestItem = {
  id: string;
  userId: string;
  reason: 'DIGEST' | 'QUIET';
  ticketId: string | null;
  category: string;
  createdAt: Date;
};

/**
 * M13 (val 4/5): the digest worker decides per user whether the held items go
 * out now, wait for quiet hours to end, or are dropped for a deactivated
 * account. Every branch writes rows, so each one is asserted here.
 */
describe('NotificationDigestService (M13)', () => {
  function createService(options: {
    readonly items?: DigestItem[];
    readonly users?: readonly {
      id: string;
      email: string;
      displayName: string;
      preferredLocale: string | null;
      isActive: boolean;
    }[];
    readonly schedules?: readonly Record<string, unknown>[];
    readonly deliveryEnabled?: boolean;
  } = {}) {
    const items: DigestItem[] = options.items ?? [];
    const users = options.users ?? [
      {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User One',
        preferredLocale: 'bs',
        isActive: true,
      },
    ];
    const schedules: Record<string, unknown>[] = [...(options.schedules ?? [])];
    const scheduleUpserts: unknown[] = [];
    const deletedItemIds: string[] = [];
    const prisma = {
      notificationDigestItem: {
        groupBy: async () => {
          const byUserAndReason = new Map<
            string,
            { userId: string; reason: string; _min: { createdAt: Date | null } }
          >();
          for (const item of items) {
            const key = `${item.userId}:${item.reason}`;
            const existing = byUserAndReason.get(key);
            if (existing === undefined || item.createdAt < (existing._min.createdAt as Date)) {
              byUserAndReason.set(key, {
                userId: item.userId,
                reason: item.reason,
                _min: { createdAt: item.createdAt },
              });
            }
          }
          return [...byUserAndReason.values()];
        },
        findMany: async ({ where }: { where: { userId: string } }) =>
          items.filter((item) => item.userId === where.userId),
        deleteMany: async ({
          where,
        }: {
          where: { id?: { in: readonly string[] }; userId?: string };
        }) => {
          if (where.userId !== undefined) {
            const dropped = items.filter((item) => item.userId === where.userId);
            deletedItemIds.push(...dropped.map((item) => item.id));
            return { count: dropped.length };
          }
          const ids = where.id?.in ?? [];
          deletedItemIds.push(...ids);
          return { count: ids.length };
        },
      },
      user: {
        findMany: async () => users,
        findUnique: async ({ where }: { where: { id: string } }) =>
          users.find((user) => user.id === where.id) ?? null,
      },
      userNotificationSchedule: {
        findMany: async () => schedules,
        upsert: async (input: unknown) => {
          scheduleUpserts.push(input);
        },
      },
      ticket: {
        findMany: async () => [
          {
            id: 'ticket-1',
            ticketNumber: 101,
            title: 'VPN ne radi',
            status: 'OPEN',
            priority: 'HIGH',
            isConfidential: false,
            classification: 'INTERNAL',
          },
        ],
      },
      $transaction: async (input: unknown) =>
        Promise.all(input as readonly Promise<unknown>[]),
    };
    const transport = { send: jest.fn(async () => undefined) };
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue({
      ...configuration,
      deliveryEnabled: options.deliveryEnabled ?? true,
    });
    return {
      service: new NotificationDigestService(
        prisma as never,
        {} as never,
        transport,
      ),
      transport,
      scheduleUpserts,
      deletedItemIds,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing while the e-mail channel is off, so items stay held', async () => {
    const { service } = createService({
      deliveryEnabled: false,
      items: [
        {
          id: 'item-1',
          userId: 'user-1',
          reason: 'DIGEST',
          ticketId: 'ticket-1',
          category: 'ticket.created',
          createdAt: new Date('2026-10-05T05:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.runDue(new Date('2026-10-05T08:00:00.000Z')),
    ).resolves.toEqual({
      usersWithItems: 0,
      emailsSent: 0,
      itemsDelivered: 0,
      itemsDropped: 0,
      failures: 0,
    });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    expect(composeDigestEmail).not.toHaveBeenCalled();
  });

  it('sends a due digest and consumes the items', async () => {
    const { service, scheduleUpserts, deletedItemIds } = createService({
      items: [
        {
          id: 'item-1',
          userId: 'user-1',
          reason: 'DIGEST',
          ticketId: 'ticket-1',
          category: 'ticket.created',
          createdAt: new Date('2026-10-05T05:00:00.000Z'),
        },
      ],
    });

    const result = await service.runDue(new Date('2026-10-05T08:00:00.000Z'));

    expect(result).toMatchObject({
      usersWithItems: 1,
      emailsSent: 1,
      itemsDelivered: 1,
    });
    expect(deliverNotificationEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        toAddress: 'user@example.com',
        templateKey: 'notification.digest',
        headers: expect.anything(),
      }),
    );
    expect(deletedItemIds).toEqual(['item-1']);
    expect(scheduleUpserts).toEqual([
      expect.objectContaining({
        update: { lastDigestSentAt: new Date('2026-10-05T08:00:00.000Z') },
      }),
    ]);
  });

  it('flushes held items when quiet hours are over', async () => {
    const { service, scheduleUpserts } = createService({
      items: [
        {
          id: 'item-quiet',
          userId: 'user-1',
          reason: 'QUIET',
          ticketId: 'ticket-1',
          category: 'ticket.message',
          createdAt: new Date('2026-10-05T06:00:00.000Z'),
        },
      ],
    });

    const result = await service.runDue(new Date('2026-10-05T08:00:00.000Z'));

    expect(result.itemsDelivered).toBe(1);
    expect(scheduleUpserts).toEqual([
      expect.objectContaining({
        update: { lastQuietFlushAt: new Date('2026-10-05T08:00:00.000Z') },
      }),
    ]);
  });

  it('drops the items of a deactivated account without e-mailing it', async () => {
    const { service, scheduleUpserts } = createService({
      items: [
        {
          id: 'item-1',
          userId: 'user-1',
          reason: 'DIGEST',
          ticketId: 'ticket-1',
          category: 'ticket.created',
          createdAt: new Date('2026-10-05T05:00:00.000Z'),
        },
      ],
      users: [
        {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User One',
          preferredLocale: null,
          isActive: false,
        },
      ],
    });

    const result = await service.runDue(new Date('2026-10-05T08:00:00.000Z'));

    expect(result.itemsDropped).toBe(1);
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    expect(scheduleUpserts).toEqual([]);
  });

  it('reports a failure per user instead of stopping the pass', async () => {
    (deliverNotificationEmail as jest.Mock).mockRejectedValueOnce(
      new Error('smtp is down'),
    );
    const { service } = createService({
      items: [
        {
          id: 'item-1',
          userId: 'user-1',
          reason: 'DIGEST',
          ticketId: 'ticket-1',
          category: 'ticket.created',
          createdAt: new Date('2026-10-05T05:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.runDue(new Date('2026-10-05T08:00:00.000Z')),
    ).resolves.toMatchObject({ failures: 1, itemsDelivered: 0 });
  });

  it('explains why a test digest was not sent', async () => {
    (loadNotificationPreferencePolicy as jest.Mock).mockResolvedValue({
      preferencesEnabled: true,
      digestEnabled: true,
      digestDefaultMinute: 450,
      digestMaxItems: 10,
      quietHoursEnabled: true,
      quietBypass: new Set<string>(),
      timeZone: 'Europe/Sarajevo',
    });
    const disabled = createService({ deliveryEnabled: false });
    await expect(disabled.service.sendTest('user-1')).resolves.toEqual({
      sent: false,
      reason: 'EMAIL_CHANNEL_DISABLED',
    });

    const { service, transport } = createService();
    await expect(service.sendTest('missing-user')).resolves.toEqual({
      sent: false,
      reason: 'USER_NOT_FOUND',
    });
    await expect(service.sendTest('user-1')).resolves.toEqual({ sent: true });
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: '[TEST] Vaši tiketi',
      }),
      expect.anything(),
    );
  });
});
