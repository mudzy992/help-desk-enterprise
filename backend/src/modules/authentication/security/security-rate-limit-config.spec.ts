import {
  assertSecurityRateLimitConfig,
  defaultSecurityRateLimitConfig as d,
  securityRateLimitBounds as b,
  SecurityRateLimitConfigError,
} from './security-rate-limit-config';

/*
  Paket 5.4.0-b (M2): the bounds keep the protection intact — an administrator
  can tune the limits, not disable them. Pinned here: defaults equal the
  pre-5.4 constants, every field enforces its bounds, and the cross-rules stop
  configurations that would silently disable one layer.
*/

const validConfig = { ...d };

describe('security rate limit config', () => {
  it('accepts the defaults (the pre-5.4 hard-coded behaviour)', () => {
    expect(assertSecurityRateLimitConfig(validConfig)).toEqual(d);
  });

  it('rejects values outside the bounds, naming the field', () => {
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, ipMaxFailures: 501 })).toThrow(
      new SecurityRateLimitConfigError('ipMaxFailures must be an integer between 10 and 500'),
    );
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, ipWindowSeconds: 9 })).toThrow(
      new SecurityRateLimitConfigError('ipWindowSeconds must be an integer between 10 and 3600'),
    );
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, accountWindowSeconds: 59 })).toThrow(
      new SecurityRateLimitConfigError('accountWindowSeconds must be an integer between 60 and 86400'),
    );
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, otherWindowSeconds: 0 })).toThrow(
      new SecurityRateLimitConfigError('otherWindowSeconds must be an integer between 10 and 86400'),
    );
  });

  it('rejects non-integers and wrong types', () => {
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, ipMaxFailures: 40.5 })).toThrow(
      SecurityRateLimitConfigError,
    );
    expect(() => assertSecurityRateLimitConfig({ ...validConfig, ipMaxFailures: '40' })).toThrow(
      SecurityRateLimitConfigError,
    );
  });

  it('enforces the cross-rules', () => {
    expect(() =>
      assertSecurityRateLimitConfig({ ...validConfig, accountDelayMaxMilliseconds: 100, accountDelayBaseMilliseconds: 250 }),
    ).toThrow(new SecurityRateLimitConfigError('accountDelayMaxMilliseconds must not be below accountDelayBaseMilliseconds'));
    expect(() =>
      assertSecurityRateLimitConfig({ ...validConfig, accountDelayStartsAfterFailures: 20, ipMaxFailures: 10 }),
    ).toThrow(
      new SecurityRateLimitConfigError(
        'accountDelayStartsAfterFailures must not exceed ipMaxFailures (the IP bucket would open first every time)',
      ),
    );
  });

  it('keeps the defaults inside the bounds', () => {
    for (const key of Object.keys(b) as Array<keyof typeof b>) {
      const bounds = b[key];
      expect(d[key]).toBeGreaterThanOrEqual(bounds.min);
      expect(d[key]).toBeLessThanOrEqual(bounds.max);
    }
  });
});
