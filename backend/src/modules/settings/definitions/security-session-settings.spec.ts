import { settingKeys } from '../setting-keys';
import { securitySessionSettings } from './security-session-settings';

const definition = securitySessionSettings.find(
  (entry) => entry.key === settingKeys.privateSecuritySessionIdleTimeoutSeconds,
)!;

describe('security session settings (5.4.0-c)', () => {
  it('registers a required numeric setting that is disabled by default', () => {
    expect(definition).toMatchObject({
      key: 'private.security.session.idleTimeoutSeconds',
      categoryId: 'private.security',
      valueType: 'number',
      isRequired: true,
      defaultValue: 0,
    });
  });

  it('accepts zero and bounded integer values', () => {
    for (const value of [0, 300, 3_600, 2_592_000]) {
      expect(() => definition.assertValue?.(value)).not.toThrow();
    }
  });

  it('rejects values outside the supported shape and range', () => {
    for (const value of [1, 299, 2_592_001, 300.5, '300']) {
      expect(() => definition.assertValue?.(value as never)).toThrow(
        'must be 0 (disabled) or an integer between 300 and 2592000',
      );
    }
  });
});
