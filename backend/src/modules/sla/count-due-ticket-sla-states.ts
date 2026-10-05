import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaConfiguration } from './sla.types';

/**
 * M10 B5 (val 5): the scan log used to report `remaining` as
 * `processed - slaScanBatchSize`. A cycle never processes more states than the
 * batch it read, so that expression was practically always 0 and the line made
 * it look as if no state was waiting for the next cycle.
 *
 * This counts what is really left: states whose next transition is still due
 * (`resolutionCompletedAt = null`, `nextDueAt <= now`). A cycle that just
 * processed a state moves its `nextDueAt` forward (or completes the resolution),
 * so calling this **after** the cycle gives the real backlog. The query walks the
 * same `@@index([resolutionCompletedAt, nextDueAt])` the scan itself uses, so it
 * stays an index-only count.
 */
export async function countDueTicketSlaStates(
  prisma: PrismaService,
  input: {
    readonly configuration: SlaConfiguration;
    readonly now?: Date;
  },
): Promise<number> {
  if (!input.configuration.enabled) {
    return 0;
  }
  return prisma.ticketSlaState.count({
    where: {
      resolutionCompletedAt: null,
      nextDueAt: { lte: input.now ?? new Date() },
    },
  });
}
