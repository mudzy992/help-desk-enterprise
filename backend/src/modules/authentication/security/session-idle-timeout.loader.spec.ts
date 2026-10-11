import { SessionIdleTimeoutLoader } from './session-idle-timeout.loader';

function loaderWith(value: unknown) {
  return new SessionIdleTimeoutLoader({
    getSetting: jest.fn().mockResolvedValue(value),
  } as never);
}

describe('SessionIdleTimeoutLoader (5.4.0-c)', () => {
  it('fails open to disabled when settings cannot be read', async () => {
    const loader = new SessionIdleTimeoutLoader({
      getSetting: jest.fn().mockRejectedValue(new Error('settings unavailable')),
    } as never);
    await expect(loader.load()).resolves.toBe(0);
  });

  it('keeps zero as the explicit disabled value', async () => {
    await expect(loaderWith(0).load()).resolves.toBe(0);
  });

  it('accepts legal idle timeouts', async () => {
    for (const value of [300, 3_600, 2_592_000]) {
      await expect(loaderWith(value).load()).resolves.toBe(value);
    }
  });

  it('turns 60 seconds and values over the maximum into disabled', async () => {
    await expect(loaderWith(60).load()).resolves.toBe(0);
    await expect(loaderWith(2_592_001).load()).resolves.toBe(0);
  });

  it('turns non-integers into disabled', async () => {
    for (const value of [300.5, '300', null]) {
      await expect(loaderWith(value).load()).resolves.toBe(0);
    }
  });

  it('validates the disabled sentinel and bounded integer range', () => {
    expect([
      0,
      299,
      300,
      2_592_000,
      2_592_001,
      300.5,
      '300',
    ].map(SessionIdleTimeoutLoader.validate)).toEqual([
      true,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
