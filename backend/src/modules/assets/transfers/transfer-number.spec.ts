import { defaultTransferNumberFormat, formatTransferNumber, localDateParts, validateTransferNumberFormat } from './transfer-number';

describe('transfer numbers (3.2 §7a.3)', () => {
  it('formats the default MM-NNNN-YYYY', () => {
    expect(formatTransferNumber(defaultTransferNumberFormat, { year: 2026, month: 9, day: 30, sequence: 7 })).toBe('09-0007-2026');
    expect(formatTransferNumber(defaultTransferNumberFormat, { year: 2026, month: 12, day: 1, sequence: 12345 })).toBe('12-12345-2026');
  });

  it('supports custom formats with a day and literals', () => {
    expect(formatTransferNumber('PR/{YYYY}/{MM}/{DD}-{NNN}', { year: 2027, month: 1, day: 5, sequence: 3 })).toBe('PR/2027/01/05-003');
  });

  it('falls back to the default for an invalid format', () => {
    expect(formatTransferNumber('{NNNN}', { year: 2026, month: 3, day: 1, sequence: 1 })).toBe('03-0001-2026');
  });

  it.each([
    ['{NNNN}-{YYYY}', 'missing_month'],
    ['{MM}-{NNNN}', 'missing_year'],
    ['{MM}-{YYYY}', 'missing_counter'],
    ['{MM}-{MM}-{NNNN}-{YYYY}', 'duplicate_token'],
    ['{MM}-{NN}-{YYYY}', 'invalid_characters'],
    ['{MM}<{NNNN}>{YYYY}', 'invalid_characters'],
    ['', 'too_long'],
    [42, 'too_long'],
  ])('rejects %p (%s)', (format, problem) => {
    expect(validateTransferNumberFormat(format)).toBe(problem);
  });

  it('accepts the default and letters', () => {
    expect(validateTransferNumberFormat(defaultTransferNumberFormat)).toBeNull();
    expect(validateTransferNumberFormat('Prenosnica {NNNNNN}.{MM}.{YYYY}')).toBeNull();
  });

  it('uses the installation time zone for the month boundary', () => {
    const lastEveningUtc = new Date('2026-09-30T22:30:00Z');
    expect(localDateParts(lastEveningUtc, 'Europe/Sarajevo')).toEqual({ year: 2026, month: 10, day: 1 });
    expect(localDateParts(lastEveningUtc, 'UTC')).toEqual({ year: 2026, month: 9, day: 30 });
  });
});
