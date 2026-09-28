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
      updateMany: jest.fn().mockResolvedValue({ count: options.moved ?? 1 }),
    },
    serviceIncidentUpdate: { create: jest.fn().mockResolvedValue({}) },
    ticketIncidentLink: {
      findMany: jest.fn().mockImplementation((args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          'ticket' in args.select
            ? [{ ticket: { requesterId: 'req1' } }, { ticket: { requesterId: 'sub1' } }]
            : [{ ticketId: 't1' }, { ticketId: 't2' }],
        ),
      ),
      count: jest.fn().mockResolvedValue(2),
    },
    serviceIncidentSubscription: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'sub1' }, { userId: 'op' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  prisma.$transaction = (callback: (tx: unknown) => unknown) => callback(prisma);
  const service = new StatusIncidentsService(prisma as never, {} as never, {} as never, {} as never);
  return { service, prisma };
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
};

describe('StatusIncidentsService.addUpdate', () => {
  beforeEach(() => jest.clearAllMocks());

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

  it('resolving notifies subscribers and linked requesters once, never the actor', async () => {
    const { service, prisma } = build(open);
    const result = await service.addUpdate('i1', { status: 'RESOLVED', message: 'Popravljeno' }, actor, new Date('2026-01-01T12:00:00Z'));
    const recipients = (persistInAppNotification as jest.Mock).mock.calls.map((call) => call[1].userId).sort();
    expect(recipients).toEqual(['req1', 'sub1']);
    expect(result.notified).toBe(2);
    expect(insertSystemTicketEvent).toHaveBeenCalledTimes(2);
    expect(lastAudit()).toMatchObject({ action: 'status.incident.resolved', metadata: { durationMinutes: 120 } });
    expect((prisma.serviceIncidentSubscription as { updateMany: jest.Mock }).updateMany).toHaveBeenCalled();
  });

  it('STAFF_ONLY resolution notifies subscribers only', async () => {
    const { service } = build({ ...open, visibility: 'STAFF_ONLY' });
    await service.addUpdate('i1', { status: 'RESOLVED', message: 'Popravljeno' }, actor);
    const recipients = (persistInAppNotification as jest.Mock).mock.calls.map((call) => call[1].userId);
    expect(recipients).toEqual(['sub1']);
  });

  it('notifyOnResolve=false resolves silently', async () => {
    const { service } = build(open);
    const result = await service.addUpdate('i1', { status: 'RESOLVED', message: 'ok', notifyOnResolve: false }, actor);
    expect(result.notified).toBe(0);
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
