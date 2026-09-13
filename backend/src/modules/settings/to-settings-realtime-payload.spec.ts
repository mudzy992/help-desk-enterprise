import { settingKeys } from './setting-keys';
import {
  shouldBroadcastSetting,
  toSettingsRealtimePayload,
} from './to-settings-realtime-payload';

describe('settings realtime broadcast filter', () => {
  it('broadcasts session and notification settings without values', () => {
    expect(shouldBroadcastSetting(settingKeys.privateNotificationsEmailEnabled)).toBe(
      true,
    );
    expect(shouldBroadcastSetting(settingKeys.privateAuthJwtSigningSecret)).toBe(
      true,
    );
    expect(shouldBroadcastSetting(settingKeys.privateSmtpPassword)).toBe(false);
    const payload = toSettingsRealtimePayload({
      key: settingKeys.privateAuthJwtSigningSecret,
      visibility: 'secret',
      description: 'JWT signing secret',
      isRequired: true,
      valueType: 'string',
    });
    expect(payload).toEqual({
      key: settingKeys.privateAuthJwtSigningSecret,
      visibility: 'secret',
      occurredAt: expect.any(String),
      invalidatesSession: true,
    });
    expect(JSON.stringify(payload)).not.toContain('value');
  });
});
