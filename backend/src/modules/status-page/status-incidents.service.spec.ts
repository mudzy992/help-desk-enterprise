jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../tickets/insert-system-ticket-event', () => ({ insertSystemTicketEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../notifications/preferences/notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({
  persistInAppNotification: jest.fn().mockResolvedValue({ id: 'n' }),
}));

import { ConflictException } from '@nestjs/common';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import type { PrivacyActor } from '../privacy/privacy-actor';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { StatusIncidentsService } from './status-incidents.service';

const actor = { principal: { subjectId: 'op' }, requestId: 'r1', sessionId: null } as unknown as PrivacyActor;

function build(incident: Record<string, unknown>, options: { moved?: number } = {}) {
  const prisma: Record<string, unknown> = {
    serviceIncident: {
      findUnique: jest.fn().mockResolvedValue(incident),
      update: jest.fn().mockResolvedValue(incident),
      updateMany: jest.fn().mockResolvedValue({ count: options.moved ?? 1 }),
    },
    serviceIncidentUpdate: { create: jest.fn().mockResolvedValue({}) },
    serviceIncidentService: { findMany: jest.fn().mockResolvedValue([{ serviceId: 'service-a' }]) },
    ticketIncidentLink: {
      findMany: jest.fn().mockImplementation((args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          'ticket' in args.select
            ? [{ ticket: { requesterId: 'req1' } }, { ticket: { requesterId: 'sub1' } }]
            : [{ ticketId: 't1' }, { ticketId: 't2' }],
        ),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(2),
    },
    serviceIncidentSubscription: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'sub1' }, { userId: 'op' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  prisma.$executeRaw = jest.fn().mockResolvedValue(1);
  prisma.$queryRaw = jest.fn().mockResolvedValue([{ id: 'outbox-1' }]);
  prisma.$transaction = (callback: (tx: unknown) => unknown) => callback(prisma);
  const authorization = { authorizeResource: jest.fn().mockResolvedValue({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' }) };
  const service = new StatusIncidentsService(prisma as never, {} as never, {} as never, authorization as never);
  return { service, prisma, authorization };
}

const open = {
  id: 'i1',
  title: 'VPN',
  titleEn: null,
  impact: 'DOWN',
  status: 'IDENTIFIED',
  visibility: 'ALL_USERS',
  startedAt: new Date('2026-01-01T10:00:00Z'),
  resolvedAt: null,
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

describe('StatusIncidentsService.addUpdate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('revokes subscriptions in the same transaction as an ALL_USERS to STAFF_ONLY edit', async () => {
    const { service, prisma } = build(open);
    await service.edit('i1', { visibility: 'STAFF_ONLY' }, actor);
    expect((prisma.serviceIncidentSubscription as { deleteMany: jest.Mock }).deleteMany).toHaveBeenCalledWith({ where: { incidentId: 'i1' } });
    expect(lastAudit()).toMatchObject({ metadata: { visibility: { from: 'ALL_USERS', to: 'STAFF_ONLY' }, revokedSubscriptions: 2 } });
  });

  it('requires manage permission for every incident service before mutation', async () => {
    const { service, prisma, authorization } = build(open);
    (prisma.serviceIncidentService as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { serviceId: 'service-a' },
      { serviceId: 'service-b' },
    ]);
    authorization.authorizeResource
      .mockResolvedValueOnce({ allowed: true, reason: 'SERVICE_ASSIGNMENT_ALLOWED' })
      .mockResolvedValueOnce({ allowed: false, reason: 'NO_MATCHING_PERMISSION_SCOPE' });

    await expect(service.addUpdate('i1', { status: 'MONITORING', message: 'Pratimo' }, actor)).rejects.toMatchObject({
      response: { code: 'INCIDENT_NOT_FOUND' },
    });
    expect(authorization.authorizeResource).toHaveBeenCalledTimes(2);
    expect((prisma.serviceIncident as { updateMany: jest.Mock }).updateMany).not.toHaveBeenCalled();
  });

  it.each(['link', 'unlink'] as const)('conceals a foreign incident before %s ticket authorization or writes', async (operation) => {
    const { service, prisma, authorization } = build(open);
    authorization.authorizeResource.mockResolvedValue({ allowed: false, reason: 'NO_MATCHING_PERMISSION_SCOPE' });
    const assertStaffTicket = jest.fn();
    (service as unknown as { assertStaffTicket: typeof assertStaffTicket }).assertStaffTicket = assertStaffTicket;

    const command = operation === 'link'
      ? service.linkTicket('i1', 'ticket-1', actor)
      : service.unlinkTicket('i1', 'ticket-1', actor);
    await expect(command).rejects.toMatchObject({ response: { code: 'INCIDENT_NOT_FOUND' } });
    expect(assertStaffTicket).not.toHaveBeenCalled();
    expect((prisma.ticketIncidentLink as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.ticketIncidentLink as { deleteMany: jest.Mock }).deleteMany).not.toHaveBeenCalled();
    expect(insertSystemTicketEvent).not.toHaveBeenCalled();
  });

  it('requires both incident manage authority and staff ticket access before linking', async () => {
    const { service, prisma } = build(open);
    const ticketDenied = new Error('ticket denied');
    const assertStaffTicket = jest.fn().mockRejectedValue(ticketDenied);
    (service as unknown as { assertStaffTicket: typeof assertStaffTicket }).assertStaffTicket = assertStaffTicket;

    await expect(service.linkTicket('i1', 'ticket-1', actor)).rejects.toBe(ticketDenied);
    expect(assertStaffTicket).toHaveBeenCalledWith('ticket-1', actor);
    expect((prisma.ticketIncidentLink as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect(insertSystemTicketEvent).not.toHaveBeenCalled();
  });

  it('rejects moving backwards', async () => {
    const { service } = build(open);
    await expect(service.addUpdate('i1', { status: 'INVESTIGATING', message: 'x y z' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a concurrent change (guarded write)', async () => {
    const { service } = build(open, { moved: 0 });
    await expect(service.addUpdate('i1', { status: 'RESOLVED', message: 'fixed' }, actor)).rejects.toMatchObject({
      response: { code: 'INCIDENT_CHANGED' },
    });
  });

  it('commits durable notification and ticket-event intents instead of synchronous fan-out', async () => {
    const { service, prisma } = build(open);
    const result = await service.addUpdate('i1', { status: 'RESOLVED', message: 'Popravljeno' }, actor, new Date('2026-01-01T12:00:00Z'));
    expect(result.notified).toBe(0);
    expect(persistInAppNotification).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(insertSystemTicketEvent).not.toHaveBeenCalled();
    expect((prisma.ticketIncidentLink as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
    expect(lastAudit()).toMatchObject({ action: 'status.incident.resolved', metadata: { durationMinutes: 120 } });
    expect((prisma.serviceIncidentSubscription as { updateMany: jest.Mock }).updateMany).not.toHaveBeenCalled();
  });

  it('queues STAFF_ONLY resolution for subscriber-only worker delivery', async () => {
    const { service, prisma } = build({ ...open, visibility: 'STAFF_ONLY' });
    await service.addUpdate('i1', { status: 'RESOLVED', message: 'Popravljeno' }, actor);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(persistInAppNotification).not.toHaveBeenCalled();
  });

  it('notifyOnResolve=false skips notifications but retains durable ticket-event delivery', async () => {
    const { service, prisma } = build(open);
    const result = await service.addUpdate('i1', { status: 'RESOLVED', message: 'ok', notifyOnResolve: false }, actor);
    expect(result.notified).toBe(0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(persistInAppNotification).not.toHaveBeenCalled();
  });

  it('a plain update posts to the timeline without notifications', async () => {
    const { service } = build(open);
    await service.addUpdate('i1', { status: 'MONITORING', message: 'Pratimo' }, actor);
    expect(lastAudit()).toMatchObject({ action: 'status.incident.update_posted', metadata: { from: 'IDENTIFIED', to: 'MONITORING' } });
    expect(persistInAppNotification).not.toHaveBeenCalled();
    expect(insertSystemTicketEvent).not.toHaveBeenCalled();
  });
});

function lastAudit() {
  const calls = (recordAuditEntry as jest.Mock).mock.calls;
  return calls[calls.length - 1][1];
}
