jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({ loadNotificationPreferencePolicy: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({ persistInAppNotification: jest.fn().mockResolvedValue({ id: 'notification' }) }));

import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { statusIncidentStartDeliveryPageSize, statusIncidentStartDeliveryTopic } from './status-incident-start-delivery.constants';
import { StatusIncidentStartDeliveryService } from './status-incident-start-delivery.service';

const delivery = (payload: object) => ({ id: 'outbox-1', topic: statusIncidentStartDeliveryTopic, dedupeKey: 'incident-1', payload, attempts: 1, maxAttempts: 25, ownerToken: 'owner' });

describe('StatusIncidentStartDeliveryService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keyset-paginates every eligible requester without the former terminal cap', async () => {
    const first = Array.from({ length: statusIncidentStartDeliveryPageSize }, (_, index) => ({ id: `u-${String(index).padStart(4, '0')}` }));
    const second = [{ id: 'u-0250' }, { id: 'u-0251' }];
    const prisma = {
      serviceIncident: { findUnique: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Incident', impact: 'DOWN', visibility: 'ALL_USERS' }) },
      user: { findMany: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) },
    };
    const service = new StatusIncidentStartDeliveryService(prisma as never, {} as never, {} as never);
    await service.deliver(delivery({ incidentId: 'incident-1', actorUserId: 'operator', serviceIds: ['service-a'] }) as never);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.user.findMany.mock.calls[1][0]).toMatchObject({ where: { id: { gt: first[first.length - 1].id } } });
    expect(persistInAppNotification).toHaveBeenCalledTimes(statusIncidentStartDeliveryPageSize + second.length);
    expect((persistInAppNotification as jest.Mock).mock.calls.at(-1)?.[1].dedupeKey).toBe('status-incident-start:incident-1:u-0251');
  });

  it('cancels pending public delivery after visibility is restricted', async () => {
    const prisma = {
      serviceIncident: { findUnique: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Internal', impact: 'DOWN', visibility: 'STAFF_ONLY' }) },
      user: { findMany: jest.fn() },
    };
    const service = new StatusIncidentStartDeliveryService(prisma as never, {} as never, {} as never);
    await service.deliver(delivery({ incidentId: 'incident-1', actorUserId: 'operator', serviceIds: ['service-a'] }) as never);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(persistInAppNotification).not.toHaveBeenCalled();
  });
});
