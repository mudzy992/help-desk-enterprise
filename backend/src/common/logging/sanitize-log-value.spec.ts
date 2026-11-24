import { ConsoleLogger } from '@nestjs/common';
import { RecentRequestLogBuffer } from '../request-context/recent-request-log.buffer';
import { RequestContextLogger } from '../request-context/request-context.logger';
import { sanitizeLogArguments, sanitizeLogMessage } from './sanitize-log-value';

/*
  W1.7 (`BA-xcut-20`): `ConsoleLogger` prints a non-string argument with
  `util.inspect`, which dumps a whole Prisma error (meta, parameters) into the
  container log. These are the arguments that must not survive that trip.
*/
describe('log value sanitizer (W1.7, BA-xcut-20)', () => {
  it('redacts and bounds strings', () => {
    expect(sanitizeLogMessage('token=abc123 failed')).toBe('token=[redacted] failed');
    expect(sanitizeLogMessage('y'.repeat(9_000))).toContain('…[truncated]');
  });

  it('turns an Error into its redacted stack instead of an inspected object', () => {
    const output = sanitizeLogMessage(Object.assign(new Error('boom secret=hunter2'), { code: 'E1' }));
    expect(output).toContain('Error: boom secret=[redacted] code=E1');
    expect(output).toContain('at ');
    expect(output).not.toContain('hunter2');
  });

  it('turns an object into redacted JSON', () => {
    expect(sanitizeLogMessage({ password: 'hunter2', userId: 'u-1' })).toBe(
      '{"password":"[redacted]","userId":"u-1"}',
    );
  });

  it('keeps primitives readable', () => {
    expect(sanitizeLogMessage(42)).toBe('42');
    expect(sanitizeLogMessage(true)).toBe('true');
    expect(sanitizeLogMessage(undefined)).toBe('undefined');
    expect(sanitizeLogMessage(10n)).toBe('10');
  });

  it('keeps context labels and sanitizes the other optional parameters', () => {
    const argumentsOut = sanitizeLogArguments([
      'TicketsService',
      new Error('boom password=hunter2'),
      { secret: 'abc123' },
      7,
    ]);
    expect(argumentsOut[0]).toBe('TicketsService');
    expect(String(argumentsOut[1])).toContain('[redacted]');
    expect(String(argumentsOut[2])).toBe('{"secret":"[redacted]"}');
    expect(argumentsOut[3]).toBe(7);
  });
});

describe('RequestContextLogger redaction (W1.7, BA-xcut-20)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts the line before it reaches the sink and the buffer', () => {
    const errorSpy = jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation();
    const buffer = new RecentRequestLogBuffer();
    const logger = new RequestContextLogger(buffer);

    logger.error(
      'db connect failed postgresql://svc:s3cret@db:5432/helpdesk token=abc123',
      new Error('inner failure cookie=sid=xyz'),
    );

    const printed = errorSpy.mock.calls[0]?.map((value) => String(value)).join(' ') ?? '';
    expect(printed).not.toContain('s3cret');
    expect(printed).not.toContain('abc123');
    expect(printed).not.toContain('sid=xyz');
    expect(printed).toContain('[redacted]');

    const captured = buffer.listSince(new Date(0));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.message).not.toContain('s3cret');
    expect(captured[0]?.message).not.toContain('abc123');
  });

  it('bounds a 1 MB dependency message', () => {
    const logSpy = jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation();
    const logger = new RequestContextLogger(new RecentRequestLogBuffer());
    logger.log(`payload ${'z'.repeat(1_000_000)}`);
    const printed = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(printed.length).toBeLessThan(2_100);
    expect(printed).toContain('…[truncated]');
  });

  it('keeps the context label usable after sanitizing', () => {
    const buffer = new RecentRequestLogBuffer();
    const logger = new RequestContextLogger(buffer);
    jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation();
    logger.log('ticket_created', 'TicketsService');
    expect(buffer.listSince(new Date(0))[0]?.context).toBe('TicketsService');
  });
});
