import { describeException, formatExceptionStackForLog, serializeThrown } from './describe-exception';
import { logMaxStackLength, logRedactedPlaceholder } from './log-redaction';

/*
  W1.7 (`BA-xcut-20`): the call sites no longer ask `instanceof Error` before
  logging, so these functions must accept anything that can be thrown and still
  return one bounded line.
*/
describe('exception sanitizer (W1.7, BA-xcut-20)', () => {
  it('describes an error as name, message and dependency code', () => {
    const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    expect(describeException(error)).toBe('Error: Unique constraint failed code=P2002');
  });

  it('redacts secrets that a dependency echoed back', () => {
    const error = new Error('connect failed postgresql://svc:s3cret@db:5432/helpdesk');
    const described = describeException(error);
    expect(described).not.toContain('s3cret');
    expect(described).toContain(logRedactedPlaceholder);
    expect(described).toContain('db:5432/helpdesk');
  });

  it('bounds a huge dependency message', () => {
    const error = new Error('x'.repeat(50_000));
    expect(describeException(error).length).toBeLessThan(2_100);
  });

  it('names whatever was thrown, without throwing itself', () => {
    expect(describeException('boom')).toBe('NonErrorThrown(string): boom');
    expect(describeException(null)).toBe('NonErrorThrown(null): null');
    expect(describeException(undefined)).toBe('NonErrorThrown(undefined): undefined');
    expect(describeException({ code: 'X' })).toBe('NonErrorThrown(Object): {"code":"X"}');
    expect(describeException([1, 2])).toBe('NonErrorThrown(array): [1,2]');
    expect(describeException(42)).toBe('NonErrorThrown(number): 42');
  });

  it('survives a circular thrown object', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(describeException(circular)).toBe('NonErrorThrown(Object): [unserializable Object]');
  });

  it('keeps the stack because it is the diagnostic value, but redacted and bounded', () => {
    const error = new Error('write failed with secret=hunter2');
    const formatted = formatExceptionStackForLog(error);
    expect(formatted.startsWith('Error: write failed with secret=')).toBe(true);
    expect(formatted).not.toContain('hunter2');
    expect(formatted).toContain('at ');
    expect(formatted.length).toBeLessThanOrEqual(logMaxStackLength + 80);

    const huge = new Error('boom');
    huge.stack = `Error: boom\n${'    at frame (file.ts:1:1)\n'.repeat(1_000)}`;
    expect(formatExceptionStackForLog(huge).length).toBeLessThanOrEqual(logMaxStackLength + 80);
  });

  it('falls back to the summary when there is no stack', () => {
    const error = new Error('no stack here');
    delete error.stack;
    expect(formatExceptionStackForLog(error)).toBe('Error: no stack here');
    expect(formatExceptionStackForLog('plain string')).toBe('NonErrorThrown(string): plain string');
  });

  it('serializes primitives without the JSON wrapper', () => {
    expect(serializeThrown(10n)).toBe('10n');
    expect(serializeThrown(Symbol('tag'))).toBe('Symbol(tag)');
    expect(serializeThrown(undefined)).toBe('undefined');
    expect(serializeThrown({ password: 'hunter2' })).toBe(`{"password":"${logRedactedPlaceholder}"}`);
  });
});
