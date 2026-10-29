jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../tickets/insert-system-ticket-event', () => ({ insertSystemTicketEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn().mockResolvedValue({ access: { visibility: 'staff' } }) }));
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
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { StatusIncidentsService } from './status-incidents.service';

const actor = { principal: { subjectId: 'op' }, requestId: 'r1', sessionId: null } as unknown as PrivacyActor;

function build(incident: Record<string, unknown>, options: { moved?: number } = {}) {
  const prisma: Record<string, unknown> = {
    serviceIncident: {
      findUnique: jest.fn().mockResolvedValue(incident),
      update: jest.fn().mockResolvedValue(incident),
      updateMany: jest.fn().mockResolvedValue({ count: options.moved ?? 1 }),
      create: jest.fn().mockResolvedValue({ ...incident, id: 'new-incident-id' }),
    },
    serviceIncidentUpdate: { create: jest.fn().mockResolvedValue({}) },
    service: { findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve((where.id.in ?? []).map((id) => ({ id })))) },
    serviceIncidentService: { findMany: jest.fn().mockResolvedValue([{ serviceId: 'service-a' }]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
  const accessPolicies = { bind: jest.fn().mockResolvedValue({ actorUserId: 'op' }) };
  const publicCache = { getVersion: jest.fn().mockResolvedValue(0), bumpVersion: jest.fn().mockResolvedValue(undefined) };
  const service = new StatusIncidentsService(prisma as never, {} as never, accessPolicies as never, authorization as never, publicCache as never);
  return { service, prisma, authorization, accessPolicies, publicCache };
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

  it('locks and evaluates a ticket batch with one policy snapshot', async () => {
    const { service, prisma, accessPolicies } = build(open);
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ id: 'ticket-a' }, { id: 'ticket-b' }]);
    const assertStaffTickets = (service as unknown as {
      assertStaffTickets: (transaction: unknown, ticketIds: readonly string[], value: PrivacyActor) => Promise<void>;
    }).assertStaffTickets.bind(service);

    await assertStaffTickets(prisma, ['ticket-b', 'ticket-a', 'ticket-a'], actor);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(accessPolicies.bind).toHaveBeenCalledTimes(1);
    expect(loadAccessibleTicket).toHaveBeenCalledTimes(2);
    expect((loadAccessibleTicket as jest.Mock).mock.calls.map((call) => call[2])).toEqual(['ticket-a', 'ticket-b']);
  });

  it.each(['link', 'unlink'] as const)('conceals a foreign incident before %s ticket authorization or writes', async (operation) => {
    const { service, prisma, authorization } = build(open);
    authorization.authorizeResource.mockResolvedValue({ allowed: false, reason: 'NO_MATCHING_PERMISSION_SCOPE' });
    const assertStaffTickets = jest.fn();
    (service as unknown as { assertStaffTickets: typeof assertStaffTickets }).assertStaffTickets = assertStaffTickets;

    const command = operation === 'link'
      ? service.linkTicket('i1', 'ticket-1', actor)
      : service.unlinkTicket('i1', 'ticket-1', actor);
    await expect(command).rejects.toMatchObject({ response: { code: 'INCIDENT_NOT_FOUND' } });
    expect(assertStaffTickets).not.toHaveBeenCalled();
    expect((prisma.ticketIncidentLink as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.ticketIncidentLink as { deleteMany: jest.Mock }).deleteMany).not.toHaveBeenCalled();
    expect(insertSystemTicketEvent).not.toHaveBeenCalled();
  });

  it('requires both incident manage authority and staff ticket access before linking', async () => {
    const { service, prisma } = build(open);
    const ticketDenied = new Error('ticket denied');
    const assertStaffTickets = jest.fn().mockRejectedValue(ticketDenied);
    (service as unknown as { assertStaffTickets: typeof assertStaffTickets }).assertStaffTickets = assertStaffTickets;

    await expect(service.linkTicket('i1', 'ticket-1', actor)).rejects.toBe(ticketDenied);
    expect(assertStaffTickets).toHaveBeenCalledWith(prisma, ['ticket-1'], actor);
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

describe('StatusIncidentsService.edit audit reconstruction (BA-status-page-17)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records title and titleEn from/to in audit metadata', async () => {
    const { service, prisma } = build(open);
    await service.edit('i1', { title: 'VPN outage', titleEn: 'VPN outage' }, actor);
    expect(lastAudit()).toMatchObject({
      metadata: {
        title: { from: 'VPN', to: 'VPN outage' },
        titleEn: { from: null, to: 'VPN outage' },
      },
    });
  });

  it('records service added/removed in audit metadata', async () => {
    const { service, prisma } = build(open);
    (prisma.serviceIncidentService as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { serviceId: 'service-a' },
      { serviceId: 'service-b' },
    ]);
    await service.edit('i1', { serviceIds: ['service-a', 'service-c'] }, actor);
    expect(lastAudit()).toMatchObject({
      metadata: {
        services: { added: ['service-c'], removed: ['service-b'] },
      },
    });
  });

  it('records both title and service changes together', async () => {
    const { service } = build(open);
    await service.edit('i1', { title: 'New title', serviceIds: ['service-a'] }, actor);
    expect(lastAudit()).toMatchObject({
      metadata: {
        title: { from: 'VPN', to: 'New title' },
        services: { added: [], removed: [] },
      },
    });
  });
});

describe('StatusIncidentsService.create backdating guard (BA-status-page-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows creating an incident with startedAt now', async () => {
    const { service, prisma } = build(open);
    await service.create(
      { title: 'Test incident', impact: 'DOWN', serviceIds: ['service-a'], message: 'Test message' },
      actor,
    );
    expect((prisma.serviceIncident as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect(lastAudit().metadata.backdated).toBeUndefined();
  });

  it('allows backdating within 30 days without a reason', async () => {
    const { service, prisma } = build(open);
    const thirtyDaysAgo = new Date(Date.now() - 29 * 86_400_000);
    await service.create(
      { title: 'Test incident', impact: 'DOWN', serviceIds: ['service-a'], message: 'Test message', startedAt: thirtyDaysAgo.toISOString() },
      actor,
    );
    expect((prisma.serviceIncident as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
  });

  it('rejects backdating beyond 30 days without a reason', async () => {
    const { service } = build(open);
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    await expect(
      service.create(
        { title: 'Test incident', impact: 'DOWN', serviceIds: ['service-a'], message: 'Test message', startedAt: fortyDaysAgo.toISOString() },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INCIDENT_BACKDATE_REQUIRES_REASON' } });
  });

  it('allows backdating beyond 30 days with a reason', async () => {
    const { service, prisma } = build(open);
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    await service.create(
      { title: 'Test incident', impact: 'DOWN', serviceIds: ['service-a'], message: 'Test message', startedAt: fortyDaysAgo.toISOString(), startedAtReason: 'Outage started before monitoring detected it' },
      actor,
    );
    expect((prisma.serviceIncident as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect(lastAudit().metadata).toMatchObject({ backdated: true, backdatedDays: 40 });
  });

  it('rejects future start dates', async () => {
    const { service } = build(open);
    const tomorrow = new Date(Date.now() + 2 * 3_600_000);
    await expect(
      service.create(
        { title: 'Test incident', impact: 'DOWN', serviceIds: ['service-a'], message: 'Test message', startedAt: tomorrow.toISOString() },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INCIDENT_START_IN_FUTURE' } });
  });
});

function lastAudit() {
  const calls = (recordAuditEntry as jest.Mock).mock.calls;
  return calls[calls.length - 1][1];
}
