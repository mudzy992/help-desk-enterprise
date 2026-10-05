import { countDueTicketSlaStates } from './count-due-ticket-sla-states';
import type { SlaConfiguration } from './sla.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const enabledConfiguration = { enabled: true } as SlaConfiguration;

/**
 * M10 B5 (val 5): the backlog in the scan log must be the real number of states
 * that stayed behind, not `processed - batchSize` (which is always 0).
 */
describe('countDueTicketSlaStates', () => {
  it('counts due states with the same where clause the scan uses', async () => {
    const count = jest.fn().mockResolvedValue(23);
    const prisma = { ticketSlaState: { count } } as never;
    const now = new Date('2026-10-05T10:00:00.000Z');

    await expect(
      countDueTicketSlaStates(prisma, { configuration: enabledConfiguration, now }),
    ).resolves.toBe(23);
    expect(count).toHaveBeenCalledWith({
      where: { resolutionCompletedAt: null, nextDueAt: { lte: now } },
    });
  });

  it('does not query and reports no backlog when SLA is off', async () => {
    const count = jest.fn();
    const prisma = { ticketSlaState: { count } } as never;

    await expect(
      countDueTicketSlaStates(prisma, {
        configuration: { enabled: false } as SlaConfiguration,
      }),
    ).resolves.toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it('uses the current time when the caller does not pass one', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { ticketSlaState: { count } } as never;

    await countDueTicketSlaStates(prisma, { configuration: enabledConfiguration });

    const [args] = count.mock.calls[0] as [{ where: { nextDueAt: { lte: Date } } }];
    expect(args.where.nextDueAt.lte).toBeInstanceOf(Date);
  });
});
