import { parseTicketArchiveConfiguration } from './parse-ticket-archive-configuration';

describe('parseTicketArchiveConfiguration', () => {
  const valid = {
    enabled: true,
    afterClosedDays: 30,
    archivedReadOnly: true,
    searchable: true,
  };

  it('returns a disabled snapshot when archive is off', () => {
    expect(parseTicketArchiveConfiguration({ ...valid, enabled: false }).enabled).toBe(
      false,
    );
  });

  it('parses a valid enabled configuration', () => {
    expect(parseTicketArchiveConfiguration(valid)).toEqual(valid);
  });

  it('rejects non-positive delay', () => {
    expect(() =>
      parseTicketArchiveConfiguration({ ...valid, afterClosedDays: 0 }),
    ).toThrow();
  });
});
