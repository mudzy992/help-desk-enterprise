import { isRemoteRequestRateLimited } from './is-remote-request-rate-limited';

describe('isRemoteRequestRateLimited', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('allows the first request and blocks inside the window', () => {
    expect(isRemoteRequestRateLimited(null, 10, now)).toBe(false);
    expect(
      isRemoteRequestRateLimited(
        new Date('2026-09-14T11:55:00.000Z'),
        10,
        now,
      ),
    ).toBe(true);
    expect(
      isRemoteRequestRateLimited(
        new Date('2026-09-14T11:49:00.000Z'),
        10,
        now,
      ),
    ).toBe(false);
  });
});
