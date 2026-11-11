jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn(async () => ({})),
  requireNotificationPreferencePolicyForType: jest.fn(),
}));
jest.mock('../notifications/preferences/resolve-delivery-decisions', () => ({
  resolveDeliveryDecisions: jest.fn(async (_prisma: unknown, _policy: unknown, input: { readonly userIds: readonly string[] }) =>
    new Map(input.userIds.map((userId) => [userId, { inApp: true }])),
  ),
}));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { AnnouncementsService } from './announcements.service';
import type { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';

const row = {
  id: 'ann-1',
  title: 'Scheduled maintenance',
  severity: 'WARNING',
} as never;

type FanOutMethod = (
  userIds: readonly string[],
  type: string,
  announcement: unknown,
  dedupePrefix: string,
) => Promise<number>;

function setup(options: { readonly duplicate?: boolean } = {}) {
  const prisma = {
    notification: {
      create: jest.fn(async (input: { readonly data: { readonly userId: string } }) => {
        if (options.duplicate === true) {
          const error = new Error('unique constraint') as Error & { readonly code: string };
          Object.assign(error, { code: 'P2002' });
          throw error;
        }
        return { id: `n-${input.data.userId}`, userId: input.data.userId };
      }),
    },
  };
  const published: Array<{ readonly userId: string; readonly announcementId: string }> = [];
  const hub = {
    publishAnnouncementChanged: (payload: { readonly userId: string; readonly announcementId: string }) => {
      published.push(payload);
    },
  } as unknown as TicketRealtimeHub;
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    { getSetting: jest.fn(async () => true) } as never,
    {} as AuthorizationService,
    hub,
  );
  const fanOut = (service as unknown as { fanOut: FanOutMethod }).fanOut.bind(service);
  return { fanOut, published, prisma };
}

describe('BA-announcements-20 realtime announcement signal', () => {
  it('publishes announcement-changed once per recipient that received the inbox row', async () => {
    const { fanOut, published } = setup();
    const sent = await fanOut(['user-1', 'user-2'], 'ANNOUNCEMENT_STARTED', row, 'announcement:ann-1:start');
    expect(sent).toBe(2);
    expect(published).toEqual([
      { userId: 'user-1', announcementId: 'ann-1', occurredAt: expect.any(String) },
      { userId: 'user-2', announcementId: 'ann-1', occurredAt: expect.any(String) },
    ]);
  });

  it('does not publish when the inbox write is deduplicated', async () => {
    const { fanOut, published } = setup({ duplicate: true });
    const sent = await fanOut(['user-1'], 'ANNOUNCEMENT_STARTED', row, 'announcement:ann-1:start');
    expect(sent).toBe(0);
    expect(published).toEqual([]);
  });
});
