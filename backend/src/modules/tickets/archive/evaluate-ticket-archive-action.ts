import { daysToMilliseconds } from '../apply-ticket-lifecycle-timestamps';
import type { TicketArchiveConfiguration } from './archive.types';

export function isClosedTicketDueForArchive(input: {
  readonly status: string;
  readonly closedAt: Date | null;
  readonly configuration: TicketArchiveConfiguration;
  readonly now: Date;
}): boolean {
  if (!input.configuration.enabled || input.status !== 'CLOSED' || input.closedAt === null) {
    return false;
  }
  return (
    input.now.getTime() >=
    input.closedAt.getTime() + daysToMilliseconds(input.configuration.afterClosedDays)
  );
}
