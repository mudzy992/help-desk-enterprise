import { SecurityRateLimitConfigLoader } from './security-rate-limit-config.loader';
import { defaultSecurityRateLimitConfig as d } from './security-rate-limit-config';

/*
  Paket 5.4.0-b (M2): the loader is the limiter's view of the settings. Pinned
  here: valid values pass through, out-of-bounds or unreadable values fall
  back to the pre-5.4 defaults — never to a weaker limit.
*/

function loaderWith(values: Record<string, unknown>) {
  const settingsService = {
    getSetting: jest.fn((key: string) => {
      if (key in values) return Promise.resolve(values[key]);
      throw new Error('not registered');
    }),
  };
  return new SecurityRateLimitConfigLoader(settingsService as never);
}

describe('SecurityRateLimitConfigLoader', () => {
  it('returns the defaults when nothing is configured', async () => {
    await expect(loaderWith({}).load()).resolves.toEqual(d);
  });

  it('passes configured values through (no restart needed)', async () => {
    const config = await loaderWith({
      'private.security.rateLimits.passwordLogin.accountDelayStartsAfterFailures': 1,
      'private.security.rateLimits.passwordLogin.ipMaxFailures': 100,
      'private.security.rateLimits.other.maxFailures': 7,
    }).load();
    expect(config.accountDelayStartsAfterFailures).toBe(1);
    expect(config.ipMaxFailures).toBe(100);
    expect(config.otherMaxFailures).toBe(7);
    expect(config.accountWindowSeconds).toBe(d.accountWindowSeconds);
  });

  it('falls back to the default on an out-of-bounds stored value', async () => {
    const config = await loaderWith({
      'private.security.rateLimits.passwordLogin.ipMaxFailures': 10_000,
      'private.security.rateLimits.passwordLogin.ipWindowSeconds': 1,
    }).load();
    expect(config.ipMaxFailures).toBe(d.ipMaxFailures);
    expect(config.ipWindowSeconds).toBe(d.ipWindowSeconds);
  });

  it('falls back to the default when the settings service fails', async () => {
    const settingsService = {
      getSetting: jest.fn(async () => {
        throw new Error('database down');
      }),
    };
    const loader = new SecurityRateLimitConfigLoader(settingsService as never);
    await expect(loader.load()).resolves.toEqual(d);
  });
});
