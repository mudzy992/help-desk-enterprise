jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({ loadNotificationPreferencePolicy: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({ persistInAppNotification: jest.fn().mockResolvedValue({ id: 'notification' }) }));
jest.mock('../tickets/insert-system-ticket-event', () => ({ insertSystemTicketEvent: jest.fn().mockResolvedValue({ id: 'event' }) }));

import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import {
  statusIncidentResolutionDeliveryTopic,
  statusIncidentResolutionTicketEventTopic,
  statusIncidentStartDeliveryPageSize,
  statusIncidentStartDeliveryTopic,
} from './status-incident-start-delivery.constants';
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

  it('marks only successfully persisted resolution subscriptions as notified', async () => {
    const prisma = {
      serviceIncident: { findUnique: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Incident', impact: 'DOWN', visibility: 'ALL_USERS', status: 'RESOLVED' }) },
      serviceIncidentSubscription: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'subscriber-a' }, { userId: 'subscriber-b' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findMany: jest.fn() },
    };
    (persistInAppNotification as jest.Mock)
      .mockResolvedValueOnce({ id: 'notification-a' })
      .mockRejectedValueOnce(new Error('temporary write failure'));
    const service = new StatusIncidentStartDeliveryService(prisma as never, {} as never, {} as never);
    await expect(service.deliverResolution({
      id: 'outbox-resolution', topic: statusIncidentResolutionDeliveryTopic, dedupeKey: 'incident-1',
      payload: { incidentId: 'incident-1', actorUserId: 'operator', message: 'Fixed', resolvedAt: '2026-01-01T12:00:00.000Z' },
      attempts: 1, maxAttempts: 25, ownerToken: 'owner',
    } as never)).rejects.toThrow('temporary write failure');
    expect(prisma.serviceIncidentSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.serviceIncidentSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'subscriber-a' }) }));
  });

  it('keyset-paginates resolution ticket events with deterministic per-ticket idempotency', async () => {
    const first = Array.from({ length: statusIncidentStartDeliveryPageSize }, (_, index) => ({ ticketId: `t-${String(index).padStart(4, '0')}` }));
    const second = [{ ticketId: 't-0250' }, { ticketId: 't-0251' }];
    const prisma = {
      serviceIncident: { findUnique: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Incident', status: 'RESOLVED' }) },
      ticketIncidentLink: { findMany: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) },
    };
    const service = new StatusIncidentStartDeliveryService(prisma as never, {} as never, {} as never);
    await service.deliverResolutionTicketEvents({
      id: 'outbox-events', topic: statusIncidentResolutionTicketEventTopic, dedupeKey: 'resolution-events:incident-1',
      payload: { incidentId: 'incident-1', actorUserId: 'operator' }, attempts: 1, maxAttempts: 25, ownerToken: 'owner',
    } as never);

    expect(prisma.ticketIncidentLink.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.ticketIncidentLink.findMany.mock.calls[1][0]).toMatchObject({ where: { ticketId: { gt: first.at(-1)?.ticketId } } });
    expect(insertSystemTicketEvent).toHaveBeenCalledTimes(statusIncidentStartDeliveryPageSize + second.length);
    expect(insertSystemTicketEvent).toHaveBeenLastCalledWith(prisma, expect.objectContaining({
      ticketId: 't-0251', idempotencyKey: 'status-incident-resolved:incident-1',
    }));
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
