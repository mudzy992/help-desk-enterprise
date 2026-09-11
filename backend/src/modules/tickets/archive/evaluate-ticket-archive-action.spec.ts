import { isClosedTicketDueForArchive } from './evaluate-ticket-archive-action';
import { defaultTicketArchiveConfiguration } from './archive.constants';

describe('isClosedTicketDueForArchive', () => {
  const now = new Date('2026-10-11T12:00:00.000Z');
  const closedAt = new Date('2026-09-11T12:00:00.000Z');

  it('archives after the configured closed window', () => {
    expect(
      isClosedTicketDueForArchive({
        status: 'CLOSED',
        closedAt,
        configuration: defaultTicketArchiveConfiguration,
        now,
      }),
    ).toBe(true);
    expect(
      isClosedTicketDueForArchive({
        status: 'CLOSED',
        closedAt,
        configuration: defaultTicketArchiveConfiguration,
        now: new Date('2026-10-10T12:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('skips when disabled, not closed, or missing closedAt', () => {
    expect(
      isClosedTicketDueForArchive({
        status: 'CLOSED',
        closedAt,
        configuration: { ...defaultTicketArchiveConfiguration, enabled: false },
        now,
      }),
    ).toBe(false);
    expect(
      isClosedTicketDueForArchive({
        status: 'RESOLVED',
        closedAt,
        configuration: defaultTicketArchiveConfiguration,
        now,
      }),
    ).toBe(false);
  });
});
