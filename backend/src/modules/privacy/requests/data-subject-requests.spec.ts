jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../notifications/fan-out/persist-in-app-notification', () => ({
  persistInAppNotification: jest.fn().mockResolvedValue(undefined),
}));

import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { PrivacyError } from '../privacy.error';
import { DataSubjectRequestsService } from './data-subject-requests.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory Prisma double
type Row = Record<string, any>;
const day = 86_400_000;
const now = new Date('2026-10-10T10:00:00.000Z');
const actor = {
  principal: { subjectId: 'dpo', email: 'dpo@x.ba', displayName: 'DPO', isLocalOnly: true },
  requestId: 'req-1',
  sessionId: 's1',
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((part) => matches(row, part));
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value);
      if ('notIn' in condition) return !condition.notIn.includes(value);
      if ('lte' in condition) return value !== null && value.getTime() <= condition.lte.getTime();
      if ('equals' in condition) return JSON.stringify(value) === JSON.stringify(condition.equals);
      return true;
    }
    return value === condition;
  });
}

function createPrisma(users: Row[] = [{ id: 'u1', displayName: 'Ana' }, { id: 'dpo', displayName: 'DPO' }]) {
  const rows: Row[] = [];
  let sequence = 0;
  const table = {
    findMany: jest.fn(async ({ where }: Row) => rows.filter((row) => matches(row, where)).map((row) => ({ ...row }))),
    findUnique: jest.fn(async ({ where }: Row) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      return row === undefined ? null : { ...row };
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: Row) => ({ ...rows.find((candidate) => candidate.id === where.id)! })),
    create: jest.fn(async ({ data }: Row) => {
      const row = {
        id: `r${++sequence}`,
        extendedDueAt: null,
        extensionReason: null,
        rejectionReason: null,
        resultRef: null,
        remindersSent: [],
        closedAt: null,
        createdAt: now,
        ...data,
      };
      rows.push(row);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    }),
  };
  const prisma: Row = {
    dataSubjectRequest: table,
    user: {
      count: jest.fn(async ({ where }: Row) =>
        where.id?.in ? users.filter((user) => where.id.in.includes(user.id)).length : users.some((u) => u.id === where.id && u.manager) ? 1 : 0,
      ),
      findMany: jest.fn(async ({ where }: Row) =>
        where.id?.in ? users.filter((user) => where.id.in.includes(user.id)) : users.filter((user) => user.manager),
      ),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, rows };
}

function createService(prisma: Row, reminderDays: number[] = [7, 1]) {
  const loader = { load: jest.fn().mockResolvedValue({ enabled: true, reminderDays }) };
  return new DataSubjectRequestsService(prisma as never, loader as never);
}

const base = { type: 'ACCESS', channel: 'EMAIL', subjectLabel: 'Ana A.' } as const;

describe('DataSubjectRequestsService (paket 2.6 §4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers a request with a 30-day deadline and audits without personal data', async () => {
    const { prisma } = createPrisma();
    const view = await createService(prisma).create(
      { ...base, receivedAt: '2026-10-05T08:00:00.000Z', subjectUserId: 'u1' },
      actor,
      now,
    );
    expect(view.status).toBe('RECEIVED');
    expect(view.dueAt).toBe('2026-11-04T08:00:00.000Z');
    expect(view.daysLeft).toBe(25);
    expect(view.canExtend).toBe(true);
    expect(view.subjectUser).toEqual({ id: 'u1', displayName: 'Ana' });
    const audit = (recordAuditEntry as jest.Mock).mock.calls[0][1];
    expect(audit.action).toBe('privacy.request.created');
    expect(JSON.stringify(audit.metadata)).not.toContain('Ana');
  });

  it('refuses a future or more than a year old receipt date and unknown users', async () => {
    const { prisma } = createPrisma();
    const service = createService(prisma);
    await expect(service.create({ ...base, receivedAt: '2026-10-11T10:00:00.000Z' }, actor, now)).rejects.toBeInstanceOf(PrivacyError);
    await expect(service.create({ ...base, receivedAt: '2025-10-01T10:00:00.000Z' }, actor, now)).rejects.toBeInstanceOf(PrivacyError);
    await expect(
      service.create({ ...base, receivedAt: '2026-10-09T10:00:00.000Z', subjectUserId: 'ghost' }, actor, now),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('extends once, restarts reminders and refuses a second extension', async () => {
    const { prisma, rows } = createPrisma();
    const service = createService(prisma);
    const created = await service.create({ ...base, receivedAt: '2026-10-05T08:00:00.000Z' }, actor, now);
    rows[0].remindersSent = [7];
    const extended = await service.extend(created.id, 'Složen zahtjev, više sistema', actor, now);
    expect(extended.status).toBe('EXTENDED');
    expect(extended.effectiveDueAt).toBe('2027-01-03T08:00:00.000Z');
    expect(extended.canExtend).toBe(false);
    expect(rows[0].remindersSent).toEqual([]);
    await expect(service.extend(created.id, 'Ponovo produženje', actor, now)).rejects.toMatchObject({
      code: 'EXTENSION_NOT_ALLOWED',
    });
  });

  it('refuses an extension after the original deadline', async () => {
    const { prisma } = createPrisma();
    const service = createService(prisma);
    const created = await service.create({ ...base, receivedAt: '2026-10-05T08:00:00.000Z' }, actor, now);
    await expect(
      service.extend(created.id, 'Prekasno produženje', actor, new Date('2026-11-05T00:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'EXTENSION_NOT_ALLOWED' });
  });

  it('requires a reason to reject, then keeps the closed request immutable', async () => {
    const { prisma } = createPrisma();
    const service = createService(prisma);
    const created = await service.create({ ...base, receivedAt: '2026-10-05T08:00:00.000Z' }, actor, now);
    await expect(service.close(created.id, { outcome: 'REJECTED' }, actor, now)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const closed = await service.close(
      created.id,
      { outcome: 'REJECTED', rejectionReason: 'Očito neosnovan zahtjev (čl. 14 st. 6)' },
      actor,
      now,
    );
    expect(closed.status).toBe('REJECTED');
    expect(closed.daysLeft).toBeNull();
    expect(closed.canExtend).toBe(false);
    await expect(service.update(created.id, { notes: 'x' }, actor, now)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const audit = (recordAuditEntry as jest.Mock).mock.calls.at(-1)[1];
    expect(audit.metadata).toEqual({ outcome: 'REJECTED', onTime: true });
  });

  it('moves RECEIVED to IN_PROGRESS and records only changed fields', async () => {
    const { prisma } = createPrisma();
    const service = createService(prisma);
    const created = await service.create({ ...base, receivedAt: '2026-10-05T08:00:00.000Z' }, actor, now);
    const updated = await service.update(created.id, { status: 'IN_PROGRESS', handlerUserId: 'dpo' }, actor, now);
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.handlerUser).toEqual({ id: 'dpo', displayName: 'DPO' });
    expect((recordAuditEntry as jest.Mock).mock.calls.at(-1)[1].metadata).toEqual({
      changed: ['status', 'handlerUserId'],
    });
  });

  it('lists open requests by nearest effective deadline', async () => {
    const { prisma } = createPrisma();
    const service = createService(prisma);
    const first = await service.create({ ...base, receivedAt: '2026-10-01T08:00:00.000Z' }, actor, now);
    const second = await service.create({ ...base, receivedAt: '2026-10-03T08:00:00.000Z' }, actor, now);
    await service.extend(first.id, 'Složen zahtjev, više sistema', actor, now);
    expect((await service.list('open', now)).map((view) => view.id)).toEqual([second.id, first.id]);
  });

  it('sends the closest reminder once, to managers when no handler is set', async () => {
    const { prisma, rows } = createPrisma([
      { id: 'm1', displayName: 'M1', manager: true },
      { id: 'm2', displayName: 'M2', manager: true },
    ]);
    const service = createService(prisma);
    await service.create({ ...base, receivedAt: '2026-10-05T08:00:00.000Z' }, actor, now);
    // Worker was down: both rungs are due, only the 1-day one is sent.
    const late = new Date(new Date('2026-11-04T08:00:00.000Z').getTime() - 0.5 * day);
    expect(await service.sendDueReminders(late)).toBe(1);
    expect(rows[0].remindersSent).toEqual([7, 1]);
    const calls = (persistInAppNotification as jest.Mock).mock.calls;
    expect(calls.map((call) => call[1].userId)).toEqual(['m1', 'm2']);
    expect(calls[0][1].body).toBe('ACCESS:1');
    expect(await service.sendDueReminders(late)).toBe(0);
  });

  it('sends nothing when the module is disabled', async () => {
    const { prisma } = createPrisma();
    const loader = { load: jest.fn().mockResolvedValue({ enabled: false, reminderDays: [7, 1] }) };
    const service = new DataSubjectRequestsService(prisma as never, loader as never);
    expect(await service.sendDueReminders(now)).toBe(0);
    expect(prisma.dataSubjectRequest.findMany).not.toHaveBeenCalled();
  });
});
