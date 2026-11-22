import { isSchedulerRegistered, missingSchedulers } from './job-scheduler-presence';

/**
 * W7.86: the shape matters. BullMQ 5.81 returns `{ key: '<id>' }` for schedulers
 * registered by `upsertJobScheduler` (no `id` at all) and `{ key, id }` for legacy
 * repeatable keys, where `key` is the raw composite string. Both must be recognised,
 * and the legacy `key` must not be mistaken for an id.
 */
describe('job scheduler presence', () => {
  it('recognises a modern scheduler by its key when BullMQ leaves id unset', () => {
    const entries = [{ key: 'kb-review-reminder-quarter-hourly', id: undefined }];
    expect(isSchedulerRegistered(entries, 'kb-review-reminder-quarter-hourly')).toBe(true);
    expect(missingSchedulers(entries, ['kb-review-reminder-quarter-hourly'])).toEqual([]);
  });

  it('still recognises a legacy repeatable key by its id', () => {
    const entries = [{ key: 'sweep:change-sweep-quarter-hourly:0::0 10 * * * *', id: 'change-sweep-quarter-hourly' }];
    expect(isSchedulerRegistered(entries, 'change-sweep-quarter-hourly')).toBe(true);
  });

  it('matches a legacy entry by its id, never by a fragment of the composite key', () => {
    const entries = [{ key: 'sweep:legacy:0::0 10 * * * *', id: 'legacy' }];
    expect(isSchedulerRegistered(entries, 'legacy')).toBe(true);
    expect(isSchedulerRegistered(entries, 'sweep')).toBe(false);
    expect(missingSchedulers(entries, ['legacy', 'other'])).toEqual(['other']);
  });

  it('reports a lost schedule', () => {
    expect(isSchedulerRegistered([], 'kb-review-reminder-quarter-hourly')).toBe(false);
    expect(
      missingSchedulers([{ key: 'something-else' }], [
        'kb-review-reminder-quarter-hourly',
        'inbound-email-poll',
      ]),
    ).toEqual(['kb-review-reminder-quarter-hourly', 'inbound-email-poll']);
  });

  it('keeps only the missing ids out of a mixed page', () => {
    const entries = [{ key: 'inbound-email-poll' }, { key: 'inbound-email-retention' }];
    expect(missingSchedulers(entries, ['inbound-email-poll', 'inbound-email-retention'])).toEqual([]);
    expect(missingSchedulers(entries, ['inbound-email-poll', 'on-call-sweep'])).toEqual(['on-call-sweep']);
  });
});
