import {
  problemCreatedOccurrence,
  problemHandoffOccurrence,
  problemRecurrenceOccurrence,
  problemResolutionRunOccurrence,
  problemTargetDueOccurrence,
  problemVersionOccurrence,
} from './problem-notice-occurrence';

/*
  W7.31 (BA-problems-13): the occurrence is the dedupe identity of a notice.
  The old implementation put `Date.now()` (or a random UUID) in it, so a retried
  business event produced a new key and a second message. These tests lock the
  replacement: every key comes from the identity of the change, never the clock.
*/
describe('problem notice occurrence', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('derives the same key from the same business fact, whatever the clock says', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-17T10:00:00.000Z'));
    const first = [
      problemVersionOccurrence(7),
      problemHandoffOccurrence('handoff-1'),
      problemResolutionRunOccurrence('run-1', 'RESOLVED'),
      problemTargetDueOccurrence('T-24', new Date('2026-11-18T08:00:00.000Z')),
      problemRecurrenceOccurrence(['T-1', 'T-2']),
    ];
    jest.setSystemTime(new Date('2027-03-01T23:59:59.000Z'));
    const second = [
      problemVersionOccurrence(7),
      problemHandoffOccurrence('handoff-1'),
      problemResolutionRunOccurrence('run-1', 'RESOLVED'),
      problemTargetDueOccurrence('T-24', new Date('2026-11-18T08:00:00.000Z')),
      problemRecurrenceOccurrence(['T-1', 'T-2']),
    ];
    expect(second).toEqual(first);
  });

  it('keeps different business facts apart', () => {
    expect(problemVersionOccurrence(7).key).not.toBe(problemVersionOccurrence(8).key);
    expect(problemHandoffOccurrence('handoff-1').key).not.toBe(problemHandoffOccurrence('handoff-2').key);
    expect(problemResolutionRunOccurrence('run-1', 'RESOLVED').key).not.toBe(problemResolutionRunOccurrence('run-2', 'RESOLVED').key);
    expect(problemTargetDueOccurrence('T-24', new Date('2026-11-18T08:00:00.000Z')).key).not.toBe(
      problemTargetDueOccurrence('T-48', new Date('2026-11-18T08:00:00.000Z')).key,
    );
    expect(problemRecurrenceOccurrence(['T-1']).key).not.toBe(problemRecurrenceOccurrence(['T-2']).key);
  });

  it('names the created problem once', () => {
    expect(problemCreatedOccurrence.key).toBe('created');
  });

  it('hashes the recurrence references instead of carrying them', () => {
    const occurrence = problemRecurrenceOccurrence(['SECRET-TICKET-1', 'SECRET-TICKET-2']);
    expect(occurrence.key).not.toContain('SECRET-TICKET');
    expect(occurrence.key).toMatch(/^recurrence:[0-9a-f]{32}$/u);
    // The same link batch in another order is still the same event.
    expect(problemRecurrenceOccurrence(['SECRET-TICKET-2', 'SECRET-TICKET-1'])).toEqual(occurrence);
  });

  it('fails closed instead of producing a key everything would share', () => {
    expect(() => problemVersionOccurrence(-1)).toThrow('PROBLEM_NOTICE_OCCURRENCE_VERSION_INVALID');
    expect(() => problemVersionOccurrence(1.5)).toThrow('PROBLEM_NOTICE_OCCURRENCE_VERSION_INVALID');
    expect(() => problemRecurrenceOccurrence([])).toThrow('PROBLEM_NOTICE_OCCURRENCE_RECURRENCE_EMPTY');
  });

  it('freezes its keys so a caller cannot rewrite a shared occurrence', () => {
    const occurrence = problemVersionOccurrence(3);
    expect(Object.isFrozen(occurrence)).toBe(true);
    expect(occurrence.key).toBe('v3');
  });
});
