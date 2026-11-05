import { composeDigestEmail } from '../email/compose-digest-email';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { loadEmailChannelConfiguration } from '../email/load-email-channel-configuration';
import { loadNotificationPreferencePolicy } from './notification-preference-policy';
import { NotificationDigestService } from './notification-digest.service';
import { setMailProviderLimitBreaker } from '../email/mail-provider-limit-breaker';
import { loadActorGroupIds } from '../../../common/cache/scope-catalog-cache';
import { runWithRequestId } from '../../../common/request-context/request-context.storage';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrincipalContextLoader } from '../../../common/principal-context/principal-context.loader';

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
  composeDigestEmail: jest.fn(
    (input: { tickets: ReadonlyMap<string, unknown> }) => ({
      subject: 'Vaši tiketi',
      text: 'tickets',
      html: '<p>tickets</p>',
      messageId: 'message-1',
      headers: {},
      ticketCount: input.tickets.size,
    }),
  ),
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
  function createService(
    options: {
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
      readonly confidentialEnabled?: boolean;
      readonly groupMemberships?: readonly {
        id: string;
        userId: string;
        groupId: string;
        createdAt: Date;
      }[];
      readonly authorizationContextLoader?: AuthorizationContextLoader;
      readonly makeAuthorizationContextLoader?: (
        prisma: object,
      ) => AuthorizationContextLoader;
      readonly ticketFindMany?: (
        where: unknown,
      ) =>
        | readonly Record<string, unknown>[]
        | Promise<readonly Record<string, unknown>[]>;
    } = {},
  ) {
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
    const groupMemberships = [...(options.groupMemberships ?? [])];
    const scheduleUpserts: unknown[] = [];
    const deletedItemIds: string[] = [];
    const ticketQueries: unknown[] = [];
    const ticket = {
      id: 'ticket-1',
      ticketNumber: 101,
      title: 'VPN ne radi',
      status: 'OPEN',
      priority: 'HIGH',
      isConfidential: options.confidentialEnabled ?? false,
      classification: 'INTERNAL',
    };
    const confidentialConfiguration = {
      enabled: options.confidentialEnabled ?? false,
      defaultForServiceIds: [],
      allowedViewerRoles: [],
      allowedViewerGroupIds: [],
      breakGlassEnabled: false,
      breakGlassAllowedRoles: [],
      breakGlassRequiresReason: false,
      auditViews: false,
    };
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
            if (
              existing === undefined ||
              item.createdAt < (existing._min.createdAt as Date)
            ) {
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
          const dropped =
            where.userId !== undefined
              ? items.filter((item) => item.userId === where.userId)
              : items.filter((item) => where.id?.in?.includes(item.id));
          deletedItemIds.push(...dropped.map((item) => item.id));
          return { count: dropped.length };
        },
      },
      user: {
        findMany: async () => users,
        findUnique: async ({ where }: { where: { id: string } }) => {
          const user = users.find((candidate) => candidate.id === where.id);
          if (user === undefined) return null;
          return {
            ...user,
            isLocalOnly: false,
            mustChangePassword: false,
            entraObjectId: null,
            directoryObjectGuid: null,
            authzVersion: 1,
            organizationalUnitId: null,
            userRoles: [
              {
                id: 'user-role-1',
                role: { key: 'AGENT', rolePermissions: [] },
                organizationalUnit: null,
                service: null,
              },
            ],
            groupMembers: groupMemberships
              .filter((membership) => membership.userId === where.id)
              .map((membership) => ({ groupId: membership.groupId })),
          };
        },
      },
      groupMember: {
        findMany: async ({ where }: { where: { userId: string } }) =>
          groupMemberships.filter(
            (membership) => membership.userId === where.userId,
          ),
      },
      organizationalUnit: {
        findMany: async () => [],
      },
      userNotificationSchedule: {
        findMany: async () => schedules,
        upsert: async (input: unknown) => {
          scheduleUpserts.push(input);
        },
      },
      ticket: {
        findMany: async ({ where }: { where: unknown }) => {
          ticketQueries.push(where);
          return options.ticketFindMany === undefined
            ? [ticket]
            : await options.ticketFindMany(where);
        },
      },
      $transaction: async (input: unknown) =>
        Promise.all(input as readonly Promise<unknown>[]),
    };
    const transport = { send: jest.fn(async () => undefined) };
    const authorizationContextLoader =
      options.makeAuthorizationContextLoader?.(prisma) ??
      options.authorizationContextLoader ??
      ({
        loadAuthoritativeSnapshotBySubjectId: async (subjectId: string) => ({
          context: {
            subjectId,
            isLocalOnly: true,
            isSuperAdmin: true,
            assignments: [],
          },
          groupIds: groupMemberships
            .filter((membership) => membership.userId === subjectId)
            .map((membership) => membership.groupId),
        }),
      } as never);
    const ticketConfidentialConfigurationLoader = {
      load: jest.fn(async () => confidentialConfiguration),
    };
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue({
      ...configuration,
      deliveryEnabled: options.deliveryEnabled ?? true,
    });
    return {
      service: new NotificationDigestService(
        prisma as never,
        {} as never,
        transport,
        authorizationContextLoader,
        ticketConfidentialConfigurationLoader as never,
      ),
      transport,
      scheduleUpserts,
      deletedItemIds,
      ticketQueries,
      groupMemberships,
      prisma,
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
      itemsDroppedForAccess: 0,
      visibilityCheckFailures: 0,
      failures: 0,
    });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    expect(composeDigestEmail).not.toHaveBeenCalled();
  });

  /*
    Incident 2026-10-16: dok provajder odbija slanje (Gmail dnevni limit), svaki
    prolaz od 5 minuta pokušavao je isto slanje — stotine uzaludnih pokušaja
    dnevno po korisniku, a svaki je produžavao blokadu naloga. Stavke moraju
    ostati na čekanju i čekati kraj blokade.
  */
  it('preskače prolaz dok je izlazni e-mail zaustavljen, a stavke ostaju', async () => {
    setMailProviderLimitBreaker({
      active: async () => ({
        reason: 'dailyLimit',
        openedAtMs: Date.parse('2026-10-05T07:00:00.000Z'),
        blockedUntilMs: Date.parse('2026-10-05T09:00:00.000Z'),
        suppressedTotal: 3,
        consecutiveBlocks: 1,
      }),
    } as never);
    try {
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
      ).resolves.toEqual({
        usersWithItems: 0,
        emailsSent: 0,
        itemsDelivered: 0,
        itemsDropped: 0,
        itemsDroppedForAccess: 0,
        visibilityCheckFailures: 0,
        failures: 0,
      });
      expect(deliverNotificationEmail).not.toHaveBeenCalled();
      expect(composeDigestEmail).not.toHaveBeenCalled();
    } finally {
      setMailProviderLimitBreaker(null);
    }
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

  it('drops held items after authoritative membership revocation despite a warmed group cache', async () => {
    const stalePrincipal = {
      subjectId: 'user-1',
      email: 'user@example.com',
      displayName: 'User One',
      isActive: true,
      isLocalOnly: false,
      mustChangePassword: false,
      entraObjectId: null,
      directoryObjectGuid: null,
      roleKeys: ['AGENT'],
      groupIds: ['group-1'],
      homeOrganizationalUnitId: null,
      assignments: [],
      authzVersion: 1,
    };
    const cachedPrincipalLoads: jest.SpyInstance[] = [];
    const { service, prisma, groupMemberships, deletedItemIds, ticketQueries } =
      createService({
        confidentialEnabled: true,
        groupMemberships: [
          {
            id: 'membership-1',
            userId: 'user-1',
            groupId: 'group-1',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ],
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
        makeAuthorizationContextLoader: (prisma) => {
          const loader = new PrincipalContextLoader(
            prisma as never,
            {} as never,
          );
          cachedPrincipalLoads.push(
            jest
              .spyOn(loader, 'load')
              .mockResolvedValue(stalePrincipal as never),
          );
          return new AuthorizationContextLoader(prisma as never, loader);
        },
        ticketFindMany: (where) =>
          (JSON.stringify(where) ?? '').includes('group-1')
            ? [
                {
                  id: 'ticket-1',
                  ticketNumber: 101,
                  title: 'VPN ne radi',
                  status: 'OPEN',
                  priority: 'HIGH',
                  isConfidential: true,
                  classification: 'INTERNAL',
                },
              ]
            : [],
      });

    const result = await runWithRequestId(
      'digest-revocation-test',
      async () => {
        await expect(
          loadActorGroupIds(prisma as never, 'user-1'),
        ).resolves.toEqual(['group-1']);
        groupMemberships.splice(0);
        return service.runDue(new Date('2026-10-05T08:00:00.000Z'));
      },
    );

    expect(result).toMatchObject({
      emailsSent: 0,
      itemsDelivered: 0,
      itemsDropped: 1,
      itemsDroppedForAccess: 1,
      visibilityCheckFailures: 0,
      failures: 0,
    });
    expect(cachedPrincipalLoads[0]).not.toHaveBeenCalled();
    expect(JSON.stringify(ticketQueries[0])).not.toContain('group-1');
    expect(deletedItemIds).toEqual(['item-1']);
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    expect(composeDigestEmail).not.toHaveBeenCalled();
  });

  it('rechecks held items in the test-digest path and never composes revoked ticket facts', async () => {
    const stalePrincipal = {
      subjectId: 'user-1',
      email: 'user@example.com',
      displayName: 'User One',
      isActive: true,
      isLocalOnly: false,
      mustChangePassword: false,
      entraObjectId: null,
      directoryObjectGuid: null,
      roleKeys: ['AGENT'],
      groupIds: ['group-1'],
      homeOrganizationalUnitId: null,
      assignments: [],
      authzVersion: 1,
    };
    const cachedPrincipalLoads: jest.SpyInstance[] = [];
    const { service, prisma, groupMemberships, deletedItemIds, ticketQueries } =
      createService({
        confidentialEnabled: true,
        groupMemberships: [
          {
            id: 'membership-1',
            userId: 'user-1',
            groupId: 'group-1',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ],
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
        makeAuthorizationContextLoader: (prisma) => {
          const loader = new PrincipalContextLoader(
            prisma as never,
            {} as never,
          );
          cachedPrincipalLoads.push(
            jest
              .spyOn(loader, 'load')
              .mockResolvedValue(stalePrincipal as never),
          );
          return new AuthorizationContextLoader(prisma as never, loader);
        },
        ticketFindMany: (where) =>
          (JSON.stringify(where) ?? '').includes('group-1')
            ? [
                {
                  id: 'ticket-1',
                  ticketNumber: 101,
                  title: 'VPN ne radi',
                  status: 'OPEN',
                  priority: 'HIGH',
                  isConfidential: true,
                  classification: 'INTERNAL',
                },
              ]
            : [],
      });

    const result = await runWithRequestId(
      'digest-test-revocation',
      async () => {
        await expect(
          loadActorGroupIds(prisma as never, 'user-1'),
        ).resolves.toEqual(['group-1']);
        groupMemberships.splice(0);
        return service.sendTest('user-1');
      },
    );

    expect(result).toEqual({ sent: true });
    expect(cachedPrincipalLoads[0]).not.toHaveBeenCalled();
    expect(JSON.stringify(ticketQueries[0])).not.toContain('group-1');
    expect(deletedItemIds).toEqual(['item-1']);
    const composedInput = (composeDigestEmail as jest.Mock).mock
      .calls[0]?.[0] as {
      items: readonly unknown[];
      tickets: ReadonlyMap<string, unknown>;
    };
    expect(composedInput.items).toEqual([]);
    expect(composedInput.tickets.size).toBe(0);
  });

  it('fails closed when authorization cannot be checked, including test digests', async () => {
    const items: DigestItem[] = [
      {
        id: 'item-1',
        userId: 'user-1',
        reason: 'DIGEST',
        ticketId: 'ticket-1',
        category: 'ticket.created',
        createdAt: new Date('2026-10-05T05:00:00.000Z'),
      },
    ];
    const failingLoader = {
      loadAuthoritativeSnapshotBySubjectId: jest.fn(async () => {
        throw new Error('authorization database unavailable');
      }),
    } as never;
    const digest = createService({
      items,
      authorizationContextLoader: failingLoader,
    });

    await expect(
      digest.service.runDue(new Date('2026-10-05T08:00:00.000Z')),
    ).resolves.toMatchObject({
      failures: 1,
      visibilityCheckFailures: 1,
      itemsDropped: 0,
      itemsDroppedForAccess: 0,
    });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    expect(digest.deletedItemIds).toEqual([]);

    const testDigest = createService({
      items,
      authorizationContextLoader: failingLoader,
    });
    await expect(testDigest.service.sendTest('user-1')).resolves.toEqual({
      sent: false,
      reason: 'TICKET_VISIBILITY_UNAVAILABLE',
    });
    expect(testDigest.transport.send).not.toHaveBeenCalled();
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
