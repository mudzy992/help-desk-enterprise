import { IntegrationJobType } from '../../../generated/prisma/enums';
import { integrationQueueTypeTokens } from '../../integration-queue/integration-queue.constants';
import { dispatchBroadcastEmail } from '../../tickets/bulk/broadcast-email-channel';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { fanOutEmailNotifications } from '../email/fan-out-email-notifications';
import { sendBroadcastEmails } from '../email/send-broadcast-emails';
import { loadNotificationPreferencePolicy } from '../preferences/notification-preference-policy';
import { loadIntegrationQueueSettings } from '../../integration-queue/load-integration-queue-settings';
import { enqueueEdgeNotificationEvents } from './enqueue-edge-notification-events';
import { fanOutInAppNotifications } from './fan-out-in-app-notifications';
import { dispatchSlaRuntimeNotification } from './dispatch-sla-runtime-notification';
import { publishCreatedNotifications } from './publish-created-notifications';
import { NotificationsFanOutService } from './notifications-fan-out.service';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(async () => ({
    deliveryEnabled: true,
    smtp: { fromAddress: 'helpdesk@example.com' },
  })),
}));
jest.mock('../email/fan-out-email-notifications', () => ({
  fanOutEmailNotifications: jest.fn(async () => undefined),
}));
jest.mock('../email/deliver-notification-email', () => ({
  deliverNotificationEmail: jest.fn(async () => true),
}));
jest.mock('../email/send-broadcast-emails', () => ({
  sendBroadcastEmails: jest.fn(async () => undefined),
}));
jest.mock('../preferences/notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn(async () => ({
    preferencesEnabled: true,
  })),
}));
jest.mock('../../integration-queue/load-integration-queue-settings', () => ({
  loadIntegrationQueueSettings: jest.fn(async () => ({
    enabled: false,
    typeTokens: new Set<string>(),
  })),
}));
jest.mock('./fan-out-in-app-notifications', () => ({
  fanOutInAppNotifications: jest.fn(async () => [
    { id: 'n-1', userId: 'user-1', groupId: null },
    { id: 'n-2', userId: 'user-2', groupId: 'group-1' },
  ]),
}));
jest.mock('./publish-created-notifications', () => ({
  // The real function walks the created rows and calls both cache hooks; the
  // mock does the same so the wiring of those callbacks stays under test.
  publishCreatedNotifications: jest.fn(
    async (
      _prisma: unknown,
      _hub: unknown,
      created: readonly { userId: string; groupId: string | null }[],
      invalidate: (userId: string) => Promise<void>,
      bumpGroup: (groupId: string) => Promise<void>,
    ) => {
      for (const row of created) {
        await invalidate(row.userId);
        if (row.groupId !== null) {
          await bumpGroup(row.groupId);
        }
      }
    },
  ),
}));
jest.mock('./enqueue-edge-notification-events', () => ({
  enqueueEdgeNotificationEvents: jest.fn(async () => undefined),
}));

const payload = {
  ticketId: 'ticket-1',
  event: 'ticket.comment',
} as unknown as TicketRealtimeMessagePayload;

/**
 * M13 (val 4/5): the fan-out worker is the only place where a realtime event
 * becomes an in-app row, an unread-count change, an edge event and an e-mail.
 * It is also the only place that must never let one broken channel take the
 * other down — both halves catch their own errors.
 */
describe('NotificationsFanOutService (M13)', () => {
  function createService() {
    const listened: ((payload: TicketRealtimeMessagePayload) => void)[] = [];
    const unsubscribed: number[] = [];
    const enqueued: unknown[] = [];
    const invalidatedUsers: string[] = [];
    const bumpedGroups: string[] = [];
    const service = new NotificationsFanOutService(
      {} as never,
      {
        subscribe: (listener: (payload: TicketRealtimeMessagePayload) => void) => {
          listened.push(listener);
          return () => unsubscribed.push(listened.length);
        },
      } as never,
      {} as never,
      {
        enqueue: async (job: unknown) => void enqueued.push(job),
      } as never,
      { send: async () => undefined } as never,
      {
        invalidate: async (userId: string) => void invalidatedUsers.push(userId),
        bumpGroup: async (groupId: string) => void bumpedGroups.push(groupId),
      } as never,
      { load: async () => ({}) } as never,
    );
    return {
      service,
      listened,
      unsubscribed,
      enqueued,
      invalidatedUsers,
      bumpedGroups,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes on init and drops the subscription on destroy', () => {
    const { service, listened, unsubscribed } = createService();

    service.onModuleInit();
    expect(listened).toHaveLength(1);

    service.onModuleDestroy();
    expect(unsubscribed).toHaveLength(1);
  });

  it('turns one event into rows, cache changes, edge events and e-mail', async () => {
    const { service, listened, invalidatedUsers, bumpedGroups } = createService();
    service.onModuleInit();

    listened[0]?.(payload);
    await new Promise((resolve) => setImmediate(resolve));

    // One settings read per event, shared by both channels.
    expect(loadNotificationPreferencePolicy).toHaveBeenCalledTimes(1);
    expect(fanOutInAppNotifications).toHaveBeenCalledTimes(1);
    expect(publishCreatedNotifications).toHaveBeenCalledTimes(1);
    expect(enqueueEdgeNotificationEvents).toHaveBeenCalledTimes(1);
    expect(fanOutEmailNotifications).toHaveBeenCalledTimes(1);
    expect(invalidatedUsers).toEqual(['user-1', 'user-2']);
    expect(bumpedGroups).toEqual(['group-1']);
  });

  it('still sends e-mail when the in-app half throws', async () => {
    const { service, listened } = createService();
    (fanOutInAppNotifications as jest.Mock).mockRejectedValueOnce(
      new Error('database is down'),
    );
    service.onModuleInit();

    listened[0]?.(payload);
    await new Promise((resolve) => setImmediate(resolve));

    expect(fanOutEmailNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not lose the in-app row when the e-mail half throws', async () => {
    const { service, listened } = createService();
    (fanOutEmailNotifications as jest.Mock).mockRejectedValueOnce(
      new Error('smtp is down'),
    );
    service.onModuleInit();

    listened[0]?.(payload);
    await new Promise((resolve) => setImmediate(resolve));

    expect(fanOutInAppNotifications).toHaveBeenCalledTimes(1);
    expect(publishCreatedNotifications).toHaveBeenCalledTimes(1);
  });

  it('hands the SLA worker the same channel the hub gets', async () => {
    const { service } = createService();
    service.onModuleInit();

    await dispatchSlaRuntimeNotification({} as never, payload);

    expect(fanOutInAppNotifications).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  /**
   * `sendBroadcastEmails` is the sender of the batch; here it stands in for the
   * real one and hands its first unit of work to the handler the service built.
   * That is exactly the branch under test: queue or inline delivery.
   */
  function runBroadcastHandlerWithOneUnitOfWork() {
    const work = { userId: 'user-1', dedupeKey: 'broadcast:1' };
    (sendBroadcastEmails as jest.Mock).mockImplementationOnce(
      async (
        _prisma: unknown,
        _configuration: unknown,
        _request: unknown,
        handler: { handle: (work: unknown) => Promise<void> },
      ) => {
        await handler.handle(work);
      },
    );
    return work;
  }

  it('enqueues broadcast e-mail when the integration queue handles it', async () => {
    (loadIntegrationQueueSettings as jest.Mock).mockResolvedValueOnce({
      enabled: true,
      typeTokens: new Set([integrationQueueTypeTokens.email]),
    });
    const work = runBroadcastHandlerWithOneUnitOfWork();
    const { service, enqueued } = createService();
    service.onModuleInit();

    await dispatchBroadcastEmail({
      ticketId: 'ticket-1',
      parts: { what_happened: 'Mail is down' } as never,
      actorUserId: 'admin-1',
      batchId: 'batch-1',
    });

    expect(enqueued).toEqual([{ type: IntegrationJobType.EMAIL, payload: work }]);
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
  });

  it('sends broadcast e-mail inline when the queue is off', async () => {
    const work = runBroadcastHandlerWithOneUnitOfWork();
    const { service, enqueued } = createService();
    service.onModuleInit();

    await dispatchBroadcastEmail({
      ticketId: 'ticket-1',
      parts: { what_happened: 'Mail is down' } as never,
      actorUserId: 'admin-1',
      batchId: 'batch-1',
    });

    expect(deliverNotificationEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      work,
    );
    expect(enqueued).toEqual([]);
  });

  it('ignores a broadcast request once the module is destroyed', async () => {
    const { service } = createService();
    service.onModuleInit();
    service.onModuleDestroy();

    await expect(
      dispatchBroadcastEmail({
        ticketId: 'ticket-1',
        parts: { what_happened: 'Mail is down' } as never,
        actorUserId: null,
        batchId: null,
      }),
    ).resolves.toBeUndefined();
    expect(sendBroadcastEmails).not.toHaveBeenCalled();
  });
});
