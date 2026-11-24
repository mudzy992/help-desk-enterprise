import { Logger } from '@nestjs/common';
import { searchSlo, type SearchTelemetryRecord } from './search-telemetry';
import { SearchTelemetry } from './search-telemetry.service';

function healthyRecord(overrides: Partial<SearchTelemetryRecord> = {}): SearchTelemetryRecord {
  return {
    status: 'ok',
    queryLength: 4,
    queryHash: '0123456789abcdef',
    requestedTypes: ['ticket'],
    limit: 15,
    durationMs: 12,
    groups: [
      { group: 'ticket', state: 'ok', hits: 3, durationMs: 9, truncated: false },
      { group: 'article', state: 'skipped', hits: 0, durationMs: 0, truncated: false },
      { group: 'user', state: 'skipped', hits: 0, durationMs: 0, truncated: false },
    ],
    ...overrides,
  };
}

describe('SearchTelemetry sink (W7.112)', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes exactly one key=value line for a request inside its SLO', () => {
    const telemetry = new SearchTelemetry();
    telemetry.record(healthyRecord());
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    const line = log.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/^search_telemetry=1 /);
    expect(line).toContain('status=ok');
    expect(line).toContain('query_len=4');
    expect(line).toContain('slo_breaches=0');
  });

  it('logs a breach at warn level, with the same line shape', () => {
    const telemetry = new SearchTelemetry();
    telemetry.record(
      healthyRecord({
        status: 'partial',
        durationMs: searchSlo.totalMs + 1,
        groups: [
          {
            group: 'ticket',
            state: 'ok',
            hits: 3,
            durationMs: searchSlo.groupMs.ticket + 1,
            truncated: false,
          },
          { group: 'article', state: 'skipped', hits: 0, durationMs: 0, truncated: false },
          { group: 'user', state: 'skipped', hits: 0, durationMs: 0, truncated: false },
        ],
      }),
    );
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/^search_telemetry=1 /);
    expect(line).toContain('status=partial');
    // One breached group plus the total budget.
    expect(line).toContain('slo_breaches=2');
  });

  it('never throws, even when the logger itself fails', () => {
    log.mockImplementation(() => {
      throw new Error('stdout is gone');
    });
    warn.mockImplementation(() => {
      throw new Error('stdout is gone');
    });
    const telemetry = new SearchTelemetry();
    expect(() => telemetry.record(healthyRecord())).not.toThrow();
    expect(() =>
      telemetry.record(healthyRecord({ durationMs: searchSlo.totalMs + 5 })),
    ).not.toThrow();
  });

  it('describes a term only through its length and a stable keyed hash', () => {
    const telemetry = new SearchTelemetry();
    const first = telemetry.describeTerm('Ana Hodžić');
    expect(first.length).toBe(10);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(telemetry.describeTerm('Ana Hodžić')).toEqual(first);
    expect(telemetry.describeTerm('Ana Hodzic').hash).not.toBe(first.hash);
    expect(JSON.stringify(first)).not.toContain('Ana');
  });
});
