import { RecentRequestLogBuffer } from './recent-request-log.buffer';
import type { RecentRequestLogEntry } from './recent-request-log.types';

function entry(timestamp: string, message: string): RecentRequestLogEntry {
  return {
    timestamp,
    level: 'log',
    context: 'Test',
    message,
    requestId: 'req-1',
  };
}

describe('RecentRequestLogBuffer', () => {
  it('returns only entries within the requested window', () => {
    const buffer = new RecentRequestLogBuffer();
    buffer.append(entry('2026-09-14T10:00:00.000Z', 'old'));
    buffer.append(entry('2026-09-14T11:30:00.000Z', 'recent'));
    expect(
      buffer.listSince(new Date('2026-09-14T11:00:00.000Z')).map((item) => item.message),
    ).toEqual(['recent']);
  });

  it('drops entries older than the retention window', () => {
    const buffer = new RecentRequestLogBuffer();
    buffer.append(
      entry(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), 'stale'),
    );
    buffer.setRetentionDays(14);
    expect(buffer.listSince(new Date(0))).toEqual([]);
    buffer.append(entry(new Date().toISOString(), 'fresh'));
    expect(buffer.listSince(new Date(0)).map((item) => item.message)).toEqual([
      'fresh',
    ]);
  });
});
