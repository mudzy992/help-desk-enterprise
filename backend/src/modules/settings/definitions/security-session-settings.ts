import { SessionIdleTimeoutLoader } from '../../authentication/security/session-idle-timeout.loader';
import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';

/** Paket 5.4.0-c (M4): server-side idle policy for registered sessions. */
export const securitySessionSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecuritySessionIdleTimeoutSeconds,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'number',
    description:
      'Session idle timeout in seconds; 0 disables it, otherwise 300-2592000',
    isRequired: true,
    defaultValue: 0,
    assertValue: (value: SettingValue): void => {
      if (!SessionIdleTimeoutLoader.validate(value)) {
        throw new SettingsError(
          'idleTimeoutSeconds must be 0 (disabled) or an integer between 300 and 2592000',
        );
      }
    },
  }),
];
