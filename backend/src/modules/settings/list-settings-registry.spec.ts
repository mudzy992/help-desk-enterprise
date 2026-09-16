import { applicationSettings } from './definitions/application-settings';
import { listSettingsRegistry } from './list-settings-registry';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { redactedSecretPlaceholder } from './settings.redaction';

describe('listSettingsRegistry', () => {
  it('returns every registered key with scope and masked secrets', async () => {
    const registry = createSettingsRegistry(applicationSettings);
    const findMany = jest.fn().mockResolvedValue([
      {
        key: settingKeys.privateAuthJwtSigningSecret,
        value: 'plaintext-secret',
      },
      {
        key: settingKeys.publicMaintenanceEnabled,
        value: true,
      },
    ]);
    const prisma = { appSetting: { findMany } } as never;
    const entries = await listSettingsRegistry(prisma, registry);
    expect(entries).toHaveLength(applicationSettings.length);
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    const secret = byKey.get(settingKeys.privateAuthJwtSigningSecret);
    expect(secret).toMatchObject({
      visibility: 'secret',
      value: redactedSecretPlaceholder,
      isSet: true,
      defaultValue: null,
    });
    expect(JSON.stringify(secret)).not.toContain('plaintext-secret');
    const maintenance = byKey.get(settingKeys.publicMaintenanceEnabled);
    expect(maintenance).toMatchObject({
      visibility: 'public',
      valueType: 'boolean',
      value: true,
      isSet: true,
      categoryId: 'public.maintenance',
      categoryIcon: 'wrench',
      categoryPriority: 20,
    });
    const privateKey = byKey.get(settingKeys.privateReadOnlyModeEnabled);
    expect(privateKey?.visibility).toBe('private');
    expect(privateKey?.description.length).toBeGreaterThan(0);
    expect(privateKey?.categoryId).toBe('private.readOnlyMode');
    expect(privateKey?.categoryIcon).toBe('lock');
    expect(privateKey?.categoryPriority).toBe(240);
  });
});
