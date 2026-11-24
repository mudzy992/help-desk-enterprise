import {
  isWellFormedRequestId,
  requestIdMaxLength,
  sanitizeRequestId,
} from './request-id.policy';

/*
  W1.6 (`BA-xcut-18`): the header used to be copied verbatim into the response,
  the error envelope, the log buffer and the hash-bound audit column. These are
  the values that must not survive that trip.
*/
describe('request id policy (W1.6, BA-xcut-18)', () => {
  it('accepts the shapes real tracers send', () => {
    for (const value of [
      'req-1',
      'client-id',
      'a1b2c3d4-1111-4222-8333-444455556666',
      'trace:span',
      'svc_42.v2',
      'A'.repeat(requestIdMaxLength),
    ]) {
      expect(sanitizeRequestId(value)).toBe(value);
      expect(isWellFormedRequestId(value)).toBe(true);
    }
  });

  it('trims surrounding whitespace but keeps the id', () => {
    expect(sanitizeRequestId('  req-1\n')).toBe('req-1');
  });

  it('refuses anything longer than the bound instead of truncating it', () => {
    const tooLong = `${'a'.repeat(requestIdMaxLength)}b`;
    expect(sanitizeRequestId(tooLong)).toBeNull();
    // Truncation would alias the oversized value with its 128-char prefix.
    expect(sanitizeRequestId(tooLong.slice(0, requestIdMaxLength))).not.toBeNull();
  });

  it('refuses control characters, header separators and non-ASCII', () => {
    for (const value of [
      'req\r\nX-Injected: 1',
      'req\n1',
      'req 1',
      'req,1',
      'req"1',
      'req;1',
      'req@1',
      'заxтeв-1',
      'req\u00001',
      '<script>',
      '',
      '   ',
    ]) {
      expect(sanitizeRequestId(value)).toBeNull();
    }
  });

  it('refuses non-string values a header could arrive as', () => {
    for (const value of [undefined, null, 42, true, {}, ['req-1'], { toString: () => 'req-1' }]) {
      expect(sanitizeRequestId(value)).toBeNull();
    }
  });
});
