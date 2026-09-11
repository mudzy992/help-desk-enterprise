import { TicketsError } from '../tickets.error';
import { defaultTicketArchiveConfiguration } from './archive.constants';
import type { TicketArchiveConfiguration } from './archive.types';

export function parseTicketArchiveConfiguration(input: {
  readonly enabled: unknown;
  readonly afterClosedDays: unknown;
  readonly archivedReadOnly: unknown;
  readonly searchable: unknown;
}): TicketArchiveConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketArchiveConfiguration,
      enabled: false,
    };
  }
  if (input.enabled !== true) {
    throw new TicketsError('ARCHIVE_UNAVAILABLE');
  }
  if (
    typeof input.archivedReadOnly !== 'boolean' ||
    typeof input.searchable !== 'boolean'
  ) {
    throw new TicketsError('ARCHIVE_UNAVAILABLE');
  }
  return {
    enabled: true,
    afterClosedDays: readPositiveDays(input.afterClosedDays),
    archivedReadOnly: input.archivedReadOnly,
    searchable: input.searchable,
  };
}

function readPositiveDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TicketsError('ARCHIVE_UNAVAILABLE');
  }
  return value;
}
