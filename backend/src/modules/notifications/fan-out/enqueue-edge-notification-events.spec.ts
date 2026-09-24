import { IntegrationJobType } from '../../../generated/prisma/enums';
import { settingKeys } from '../../settings/setting-keys';
import { enqueueEdgeNotificationEvents } from './enqueue-edge-notification-events';
import { notificationTypes } from '../notifications.constants';

describe('enqueueEdgeNotificationEvents', () => {
  const getSetting = jest.fn();
  const enqueue = jest.fn();
  // Phase 2.3: the badge of every recipient comes from one `GROUP BY`.
  const groupBy = jest.fn();

  beforeEach(() => {
    getSetting.mockReset();
    enqueue.mockReset();
    groupBy.mockReset();
    groupBy.mockResolvedValue([{ userId: 'user-1', _count: { _all: 1 } }]);
    getSetting.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        [settingKeys.privateAddonsEdge]: true,
        [settingKeys.privateEdgeExtensionEnabled]: true,
        [settingKeys.privateNotificationsEdgeEnabled]: true,
        [settingKeys.privateIntegrationsQueueEnabled]: true,
        [settingKeys.privateIntegrationsQueueTypesCsv]: 'email,edge,teams',
        [settingKeys.privateIntegrationsQueueMaxAttempts]: 10,
        [settingKeys.privateIntegrationsQueueInitialBackoffSeconds]: 60,
        [settingKeys.privateIntegrationsQueueMaxBackoffSeconds]: 3600,
        [settingKeys.privateIntegrationsQueueDeadLetterAfterAttempts]: 10,
        [settingKeys.privateIntegrationsQueueDeadLetterRetentionDays]: 30,
        [settingKeys.privateIntegrationsQueueWorkerPollSeconds]: 5,
        [settingKeys.privateIntegrationsQueueAdminUiEnabled]: true,
      };
      return Promise.resolve(values[key]);
    });
  });

  it('does not enqueue when the Edge addon is off', async () => {
    getSetting.mockImplementation((key: string) => {
      if (key === settingKeys.privateAddonsEdge) {
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    });
    await enqueueEdgeNotificationEvents({
      prisma: { notification: { groupBy } } as never,
      settingsService: { getSetting } as never,
      enqueueIntegrationJobService: { enqueue } as never,
      records: [
        {
          id: 'notif-1',
          userId: 'user-1',
          type: notificationTypes.ticketAssigned,
          title: 'Assigned',
          body: 'secret body',
          isRead: false,
          readAt: null,
          ticketId: 'ticket-1',
          payload: null,
          dedupeKey: 'k',
          createdAt: new Date('2026-09-14T10:00:00.000Z'),
        },
      ],
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueues EDGE_EVENT with eventId equal to the notification id', async () => {
    await enqueueEdgeNotificationEvents({
      prisma: { notification: { groupBy } } as never,
      settingsService: { getSetting } as never,
      enqueueIntegrationJobService: { enqueue } as never,
      records: [
        {
          id: 'notif-1',
          userId: 'user-1',
          type: notificationTypes.ticketAssigned,
          title: 'Assigned',
          body: 'secret body',
          isRead: false,
          readAt: null,
          ticketId: 'ticket-1',
          payload: null,
          dedupeKey: 'k',
          createdAt: new Date('2026-09-14T10:00:00.000Z'),
        },
      ],
    });
    expect(enqueue).toHaveBeenCalledWith({
      type: IntegrationJobType.EDGE_EVENT,
      payload: expect.objectContaining({
        userId: 'user-1',
        ticketId: 'ticket-1',
        eventName: 'notification.created',
        data: expect.objectContaining({
          eventId: 'notif-1',
          createdAt: '2026-09-14T10:00:00.000Z',
        }),
      }),
    });
  });
});
