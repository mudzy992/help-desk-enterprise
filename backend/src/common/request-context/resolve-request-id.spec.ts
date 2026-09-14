import { resolveRequestId } from './resolve-request-id';

describe('resolveRequestId', () => {
  it('reuses a non-empty x-request-id header', () => {
    expect(resolveRequestId({ 'x-request-id': 'abc-1' })).toBe('abc-1');
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
