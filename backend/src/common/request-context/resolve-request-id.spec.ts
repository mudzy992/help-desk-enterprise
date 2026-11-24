import { resolveRequestId } from './resolve-request-id';

describe('resolveRequestId', () => {
  it('reuses a non-empty x-request-id header', () => {
    expect(resolveRequestId({ 'x-request-id': 'abc-1' })).toBe('abc-1');
  });

  it('replaces an id the policy rejects instead of forwarding it', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const header of [
      'x'.repeat(129),
      'req\r\nX-Injected: 1',
      'идентификатор',
      'req 1',
      '   ',
    ]) {
      const resolved = resolveRequestId({ 'x-request-id': header });
      expect(resolved).toMatch(uuidPattern);
      expect(resolved).not.toContain(header);
    }
  });

  it('takes the first segment of a joined duplicate header', () => {
    expect(resolveRequestId({ 'x-request-id': 'edge-1, edge-2' })).toBe('edge-1');
    expect(resolveRequestId({ 'x-request-id': ['array-1', 'array-2'] })).toBe('array-1');
    expect(resolveRequestId({ 'x-requestid': 'legacy-1' })).toBe('legacy-1');
  });

  it('generates a uuid when no header is present', () => {
    const first = resolveRequestId({});
    const second = resolveRequestId({});
    expect(first).not.toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
