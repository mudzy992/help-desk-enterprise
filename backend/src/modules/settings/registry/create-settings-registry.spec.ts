import { settingCategoryIds } from '../setting-categories';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';
import { createSettingsRegistry } from './create-settings-registry';
import { definePublicSetting, defineSecretSetting } from './define-setting';

const publicAppName = definePublicSetting({
  key: 'public.branding.appName',
  categoryId: settingCategoryIds.publicBranding,
  valueType: 'string',
  description: 'Application name',
  isRequired: true,
  defaultValue: 'EP-HelpDesk',
});

describe('createSettingsRegistry', () => {
  it('accepts the foundational-shaped public definition', () => {
    const registry = createSettingsRegistry([publicAppName]);
    expect(registry.requireDefinition(publicAppName.key).visibility).toBe(
      'public',
    );
  });

  it('rejects duplicate keys', () => {
    expect(() =>
      createSettingsRegistry([publicAppName, publicAppName]),
    ).toThrow(SettingsError);
    expect(() =>
      createSettingsRegistry([publicAppName, publicAppName]),
    ).toThrow(/Duplicate setting key/);
  });

  it('rejects a missing key', () => {
    const invalid = definePublicSetting({
      key: '   ',
      categoryId: settingCategoryIds.publicBranding,
      valueType: 'string',
      description: 'Invalid',
      isRequired: false,
    });
    expect(() => createSettingsRegistry([invalid])).toThrow(/missing a key/);
  });

  it('rejects an unknown category id', () => {
    const invalid = {
      ...publicAppName,
      categoryId: 'private.unknown',
    } as unknown as SettingDefinition;
    expect(() => createSettingsRegistry([invalid])).toThrow(
      /Unknown setting category/,
    );
  });

  it('rejects invalid visibility at runtime', () => {
    const invalid = {
      ...publicAppName,
      visibility: 'internal',
    } as unknown as SettingDefinition;
    expect(() => createSettingsRegistry([invalid])).toThrow(
      /Invalid setting visibility/,
    );
  });

  it('rejects a secret default value', () => {
    const invalid = {
      ...defineSecretSetting({
        key: 'private.auth.jwtSigningSecret',
        categoryId: settingCategoryIds.privateAuth,
        valueType: 'string',
        description: 'JWT signing secret',
        isRequired: false,
      }),
      defaultValue: 'password123',
    } as unknown as SettingDefinition;
    expect(() => createSettingsRegistry([invalid])).toThrow(
      /must not declare a default value/,
    );
  });
});
