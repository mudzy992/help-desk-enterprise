import {
  defaultSearchRateLimitConfiguration,
  loadSearchRateLimitConfiguration,
} from './search-rate-limit.configuration';

/**
 * W7.59 (BA-search-05): the budget is a deployment setting. The spec pins the
 * three properties that make it safe to expose: the default is **on**, a broken
 * value never weakens the limit, and only an explicit `false`/`0`/`off`/`no`
 * turns it off.
 */

const ENABLED = 'SEARCH_RATE_LIMIT_ENABLED';
const WINDOW = 'SEARCH_RATE_LIMIT_WINDOW_SECONDS';
const ACTOR = 'SEARCH_RATE_LIMIT_ACTOR_PER_WINDOW';
const IP = 'SEARCH_RATE_LIMIT_IP_PER_WINDOW';

describe('search rate-limit configuration', () => {
  it('defaults to an enabled budget', () => {
    expect(loadSearchRateLimitConfiguration({})).toEqual(
      defaultSearchRateLimitConfiguration,
    );
    expect(defaultSearchRateLimitConfiguration.enabled).toBe(true);
    expect(defaultSearchRateLimitConfiguration.actorRequestsPerWindow).toBeLessThanOrEqual(
      defaultSearchRateLimitConfiguration.ipRequestsPerWindow,
    );
  });

  it('reads explicit deployment values', () => {
    const configuration = loadSearchRateLimitConfiguration({
      [WINDOW]: '120',
      [ACTOR]: '12',
      [IP]: '40',
    });
    expect(configuration).toEqual({
      enabled: true,
      windowSeconds: 120,
      actorRequestsPerWindow: 12,
      ipRequestsPerWindow: 40,
    });
  });

  it('falls back to the default instead of a weaker limit', () => {
    for (const raw of ['0', '-5', 'abc', '12.5', '', '   ']) {
      const configuration = loadSearchRateLimitConfiguration({
        [ACTOR]: raw,
      });
      expect(configuration.actorRequestsPerWindow).toBe(
        defaultSearchRateLimitConfiguration.actorRequestsPerWindow,
      );
    }
    // Nothing can be widened into "no limit" either.
    const huge = loadSearchRateLimitConfiguration({
      [IP]: '999999999',
    });
    expect(huge.ipRequestsPerWindow).toBe(
      defaultSearchRateLimitConfiguration.ipRequestsPerWindow,
    );
  });

  it('accepts only an explicit off switch', () => {
    for (const raw of ['false', 'FALSE', '0', 'off', 'no']) {
      expect(
        loadSearchRateLimitConfiguration({
          [ENABLED]: raw,
        }).enabled,
      ).toBe(false);
    }
    for (const raw of ['true', '1', 'on', 'yes', 'anything', '']) {
      expect(
        loadSearchRateLimitConfiguration({
          [ENABLED]: raw,
        }).enabled,
      ).toBe(true);
    }
  });
});
