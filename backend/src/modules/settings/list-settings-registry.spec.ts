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

  it('Paket 5.3.3: resolves title/help keys and exposes group and requires', async () => {
    const registry = createSettingsRegistry(applicationSettings);
    const prisma = {
      appSetting: { findMany: jest.fn().mockResolvedValue([]) },
    } as never;
    const entries = await listSettingsRegistry(prisma, registry);
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));

    // The title slot is the dictionary the screens already use; the modal body
    // has its own prefix, and a definition without either falls back to the
    // convention instead of showing a raw key to an administrator.
    const smtpEnabled = byKey.get(settingKeys.privateSmtpEnabled);
    expect(smtpEnabled).toMatchObject({
      titleKey: `settings.registry.keys.${settingKeys.privateSmtpEnabled}`,
      helpKey: `settings.registry.help.${settingKeys.privateSmtpEnabled}`,
      group: 'connection',
      requires: [{ key: settingKeys.privateSmtpHost, notEmpty: true }],
    });
    const untitled = byKey.get(settingKeys.publicBrandingAppName);
    expect(untitled).toMatchObject({
      titleKey: `settings.registry.keys.${settingKeys.publicBrandingAppName}`,
      helpKey: `settings.registry.help.${settingKeys.publicBrandingAppName}`,
      group: null,
      requires: [],
    });
    expect(JSON.stringify(entries)).toBe(
      JSON.stringify(JSON.parse(JSON.stringify(entries))),
    );
  });

  it('Paket 5.3.3: every declared dependency points at a declared key', () => {
    const registry = createSettingsRegistry(applicationSettings);
    const keys = new Set(registry.definitions.map((definition) => definition.key));
    const dependencies = registry.definitions.flatMap((definition) =>
      (definition.requires ?? []).map((condition) => ({
        from: definition.key,
        to: condition.key,
      })),
    );
    expect(dependencies.length).toBeGreaterThan(0);
    for (const dependency of dependencies) {
      expect(keys.has(dependency.to)).toBe(true);
      expect(dependency.to).not.toBe(dependency.from);
    }
  });
});
