import { Logger } from '@nestjs/common';
import { loadBlockedSlaScanTicketIds, recordSlaScanFailure } from './sla-scan-failure-quarantine';

describe('SLA scan failure quarantine', () => {
  it('backs off transient failures and quarantines the third failure', async () => {
    const rows = new Map<string, any>();
    const delegate = {
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.ticketId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = rows.has(where.ticketId) ? { ...rows.get(where.ticketId), ...update } : { ...create };
        rows.set(where.ticketId, row);
        return row;
      }),
      findMany: jest.fn(async () => [...rows.entries()].map(([ticketId, row]) => ({ ticketId, ...row }))),
      deleteMany: jest.fn(),
    };
    const prisma = { slaScanFailure: delegate } as never;
    const now = new Date('2026-10-27T12:00:00.000Z');
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expect(await recordSlaScanFailure(prisma, { ticketId: 'poison', phase: 'scan', error: new Error('bad'), now })).toEqual({ attempts: 1, quarantined: false });
      expect((await loadBlockedSlaScanTicketIds(prisma, ['poison'], now)).has('poison')).toBe(true);
      await recordSlaScanFailure(prisma, { ticketId: 'poison', phase: 'scan', error: new Error('bad'), now });
      expect(await recordSlaScanFailure(prisma, { ticketId: 'poison', phase: 'scan', error: new Error('bad'), now })).toEqual({ attempts: 3, quarantined: true });
      expect(rows.get('poison').quarantinedAt).toEqual(now);
    } finally {
      log.mockRestore();
    }
  });
});
