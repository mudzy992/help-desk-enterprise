jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UnroutedSweepService, isDigestSlot } from './unrouted-sweep.service';
import { defaultUnroutedQueueConfiguration } from './unrouted-queue.types';
import { buildUnroutedOverdueWhere } from './build-unrouted-overdue-where';

function createPrisma(tickets: { id: string; warned: boolean }[]) {
  const notifications = new Map<string, { userId: string; type: string }>();
  const updates: string[] = [];
  const prisma = {
    group: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === 'g1' ? { id: 'g1' } : null)) },
    userRole: { findMany: jest.fn(async () => [{ userId: 'owner' }]) },
    groupMember: { findMany: jest.fn(async () => [{ userId: 'member' }, { userId: 'owner' }]) },
    ticket: {
      findMany: jest.fn(async () =>
        tickets.filter((t) => !t.warned).map((t) => ({ id: t.id, ticketNumber: t.id, title: 'T', isConfidential: false })),
      ),
      count: jest.fn(async () => tickets.length),
      update: jest.fn(async ({ where }: { where: { id: string } }) => {
        updates.push(where.id);
        const ticket = tickets.find((t) => t.id === where.id);
        if (ticket) ticket.warned = true;
      }),
    },
    notification: {
      create: jest.fn(async ({ data }: { data: { dedupeKey: string; userId: string; type: string } }) => {
        if (notifications.has(data.dedupeKey)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        notifications.set(data.dedupeKey, data);
        return data;
      }),
    },
  };
  return { prisma, notifications, updates };
}

const loader = (overrides: Partial<typeof defaultUnroutedQueueConfiguration>) => ({
  load: async () => ({ ...defaultUnroutedQueueConfiguration, ...overrides }),
});

describe('UnroutedSweepService (package 1.7 U2)', () => {
  const tuesday = new Date('2026-09-29T10:00:00Z');

  it('warns each overdue ticket once, owner role plus target group members, deduplicated', async () => {
    const { prisma, notifications, updates } = createPrisma([{ id: 't1', warned: false }]);
    const service = new UnroutedSweepService(prisma as never, loader({ targetGroupId: 'g1' }) as never);
    const first = await service.processDue(tuesday);
    expect(first.warnedTickets).toBe(1);
    expect([...notifications.values()].map((n) => n.userId).sort()).toEqual(['member', 'owner']);
    expect(updates).toEqual(['t1']);
    const second = await service.processDue(tuesday);
    expect(second.notifications).toBe(0);
  });

  it('does nothing when cleanupSlaHours is 0', async () => {
    const { prisma, notifications } = createPrisma([{ id: 't1', warned: false }]);
    const service = new UnroutedSweepService(prisma as never, loader({ cleanupSlaHours: 0 }) as never);
    await service.processDue(new Date('2026-09-28T06:02:00Z'));
    expect(notifications.size).toBe(0);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('a missing target group degrades to owner-only recipients and the UNROUTED branch', async () => {
    const { prisma, notifications } = createPrisma([{ id: 't1', warned: false }]);
    const service = new UnroutedSweepService(prisma as never, loader({ targetGroupId: 'gone' }) as never);
    await service.processDue(tuesday);
    expect([...notifications.values()].map((n) => n.userId)).toEqual(['owner']);
  });

  it('sends the Monday 08:00 Sarajevo digest once, including already warned tickets', async () => {
    const { prisma, notifications } = createPrisma([{ id: 't1', warned: true }]);
    const service = new UnroutedSweepService(prisma as never, loader({}) as never);
    const monday = new Date('2026-09-28T06:02:00Z'); // 08:02 CEST
    expect((await service.processDue(monday)).digestNotifications).toBe(1);
    expect((await service.processDue(monday)).digestNotifications).toBe(0);
    expect([...notifications.values()][0].type).toBe('ticket.unroutedDigest');
    const off = new UnroutedSweepService(prisma as never, loader({ weeklyDigest: false }) as never);
    expect((await off.processDue(new Date('2026-10-05T06:02:00Z'))).digestNotifications).toBe(0);
  });

  it('digest slot follows Europe/Sarajevo, including winter time', () => {
    expect(isDigestSlot(new Date('2026-09-28T06:02:00Z'))).toBe(true);
    expect(isDigestSlot(new Date('2026-09-28T07:02:00Z'))).toBe(false);
    expect(isDigestSlot(new Date('2026-12-07T07:02:00Z'))).toBe(true);
    expect(isDigestSlot(new Date('2026-09-29T06:02:00Z'))).toBe(false);
  });

  it('overdue predicate covers the target group branch only when configured', () => {
    const cutoff = new Date(0);
    expect(buildUnroutedOverdueWhere({ cutoff, targetGroupId: null }).OR).toHaveLength(1);
    expect(buildUnroutedOverdueWhere({ cutoff, targetGroupId: 'g1' }).OR).toHaveLength(2);
  });
});
