import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  defaultNotificationPreferencePolicy,
  NotificationPreferenceReadUnavailableError,
} from './notification-preference-policy';
import {
  findGroupMembersWithInAppOff,
  resolveDeliveryDecisions,
} from './resolve-delivery-decisions';

describe('notification preference reads (BA-notifications-04)', () => {
  const policy = {
    ...defaultNotificationPreferencePolicy,
    lockedInApp: new Set<string>(),
    lockedEmail: new Set<string>(),
  };

  it('fails closed when the recipient preference read rejects', async () => {
    const prisma = {
      userNotificationPreference: {
        findMany: jest.fn(async () => {
          throw new Error('sensitive preference query detail');
        }),
      },
      userNotificationSchedule: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;

    await expect(
      resolveDeliveryDecisions(prisma, policy, { type: 'ticket.created', userIds: ['user-1'] }),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);
  });

  it('fails closed when the quiet-hours schedule read rejects', async () => {
    const prisma = {
      userNotificationPreference: { findMany: jest.fn(async () => []) },
      userNotificationSchedule: {
        findMany: jest.fn(async () => {
          throw new Error('sensitive schedule query detail');
        }),
      },
    } as unknown as PrismaService;

    await expect(
      resolveDeliveryDecisions(prisma, policy, { type: 'ticket.created', userIds: ['user-1'] }),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);
  });

  it('treats missing Prisma delegates as unavailable instead of an empty result', async () => {
    await expect(
      resolveDeliveryDecisions({} as unknown as PrismaService, policy, {
        type: 'ticket.created',
        userIds: ['user-1'],
      }),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);
    await expect(
      resolveDeliveryDecisions(
        { userNotificationPreference: { findMany: jest.fn(async () => []) } } as unknown as PrismaService,
        policy,
        { type: 'ticket.created', userIds: ['user-1'] },
      ),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);

    await expect(
      findGroupMembersWithInAppOff({} as unknown as PrismaService, policy, {
        type: 'ticket.created',
        groupId: 'group-1',
      }),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);
  });

  it('fails closed when the group in-app exclusion query rejects', async () => {
    const prisma = {
      userNotificationPreference: {
        findMany: jest.fn(async () => {
          throw new Error('sensitive group preference query detail');
        }),
      },
    } as unknown as PrismaService;

    await expect(
      findGroupMembersWithInAppOff(prisma, policy, {
        type: 'ticket.created',
        groupId: 'group-1',
      }),
    ).rejects.toBeInstanceOf(NotificationPreferenceReadUnavailableError);
  });

  it('keeps administrator locks and always-on categories available without user delegates', async () => {
    const lockedPolicy = {
      ...policy,
      lockedInApp: new Set(['ticket.created']),
      lockedEmail: new Set(['ticket.created']),
    };
    await expect(
      resolveDeliveryDecisions({} as unknown as PrismaService, lockedPolicy, {
        type: 'ticket.created',
        userIds: ['user-1'],
      }),
    ).resolves.toEqual(new Map([['user-1', { inApp: true, email: 'IMMEDIATE', quiet: false }]]));

    await expect(
      resolveDeliveryDecisions({} as unknown as PrismaService, policy, {
        type: 'account.passwordChanged',
        userIds: ['user-1'],
      }),
    ).resolves.toEqual(new Map([['user-1', { inApp: true, email: 'IMMEDIATE', quiet: false }]]));
  });
});
