import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import {
  addonSettingKey,
  installAddonCatalog,
  type InstallAddonKey,
} from '../settings/addon-catalog';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { InstallAddonsService } from './install-addons.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const mutation = { reason: 'install_wizard', actorUserId: 'seed' };

function catalogPayload(
  overrides: Partial<Record<InstallAddonKey, boolean>> = {},
): Record<string, boolean> {
  return Object.fromEntries(
    installAddonCatalog.map((item) => [
      item.key,
      overrides[item.key] ?? item.defaultEnabled,
    ]),
  );
}

async function createHarness(withSuperAdmin = true) {
  const users = createInMemoryInstallSuperAdminPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const settingsService = new SettingsService(
    createSettingsRegistry(applicationSettings),
    settingsMemory.prisma as unknown as PrismaService,
  );
  const service = new InstallAddonsService(
    users.prisma as unknown as PrismaService,
    settingsService,
  );
  if (withSuperAdmin) {
    await createInstallSuperAdmin(
      users.prisma as unknown as PrismaService,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password: 'correct-horse-battery',
      },
      (value) => hashLocalPassword(value, 4),
    );
  }
  return { service, settingsMemory, settingsService };
}

describe('InstallAddonsService', () => {
  it('returns catalog defaults without writing settings', async () => {
    const { service, settingsMemory } = await createHarness();
    const status = await service.getStatus();
    expect(status.addons.smtpEnabled).toBe(false);
    expect(
      status.addons.items.map((item) => [item.key, item.enabled, item.canEnable]),
    ).toEqual(
      installAddonCatalog.map((item) => [
        item.key,
        item.defaultEnabled,
        item.key !== 'email',
      ]),
    );
    expect(
      settingsMemory.getStored(settingKeys.privateAddonsSla),
    ).toBeUndefined();
    expect(
      settingsMemory.getStored(settingKeys.privateAddonsEmail),
    ).toBeUndefined();
  });

  it('persists enable and disable through the settings registry', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save({
      addons: catalogPayload({ sla: false, autoAssign: true, csat: false }),
    });
    expect(itemEnabled(saved.items, 'sla')).toBe(false);
    expect(itemEnabled(saved.items, 'autoAssign')).toBe(true);
    expect(itemEnabled(saved.items, 'csat')).toBe(false);
    expect(settingsMemory.getStored(addonSettingKey('sla'))).toMatchObject({
      value: false,
      isSecret: false,
    });
    expect(
      settingsMemory.getStored(addonSettingKey('autoAssign')),
    ).toMatchObject({ value: true });
    expect(
      settingsMemory.changeLogs.some(
        (entry) =>
          entry.entityType === 'setting' &&
          entry.entityId === addonSettingKey('sla') &&
          entry.reason === 'install_wizard',
      ),
    ).toBe(true);
  });

  it('forces email off while SMTP is off and keeps it off on retry', async () => {
    const { service, settingsMemory, settingsService } = await createHarness();
    await expect(
      service.save({ addons: catalogPayload({ email: true }) }),
    ).resolves.toMatchObject({
      smtpEnabled: false,
      items: expect.arrayContaining([
        expect.objectContaining({
          key: 'email',
          enabled: false,
          canEnable: false,
        }),
      ]),
    });
    expect(settingsMemory.getStored(settingKeys.privateAddonsEmail)).toMatchObject(
      { value: false },
    );
    await settingsService.setSettingValue(
      settingKeys.privateSmtpEnabled,
      true,
      mutation,
    );
    const enabled = await service.save({
      addons: catalogPayload({ email: true }),
    });
    expect(itemEnabled(enabled.items, 'email')).toBe(true);
    await settingsService.setSettingValue(
      settingKeys.privateSmtpEnabled,
      false,
      mutation,
    );
    const retried = await service.save({
      addons: catalogPayload({ email: true }),
    });
    expect(itemEnabled(retried.items, 'email')).toBe(false);
    expect(settingsMemory.getStored(settingKeys.privateAddonsEmail)).toMatchObject(
      { value: false },
    );
  });

  it('retries the same payload without changing stored addon values', async () => {
    const { service, settingsMemory } = await createHarness();
    const payload = { addons: catalogPayload({ edge: true, reports: false }) };
    await service.save(payload);
    const first = snapshotAddons(settingsMemory);
    const second = await service.save(payload);
    expect(itemEnabled(second.items, 'edge')).toBe(true);
    expect(itemEnabled(second.items, 'reports')).toBe(false);
    expect(snapshotAddons(settingsMemory)).toEqual(first);
  });

  it('rejects unsupported addon keys without writing catalog settings', async () => {
    const { service, settingsMemory } = await createHarness();
    await expect(
      service.save({ addons: { sla: true, unknownAddon: true } }),
    ).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_ADDON_KEY' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateAddonsSla),
    ).toBeUndefined();
  });

  it('rejects addon setup before the SuperAdmin exists', async () => {
    const { service, settingsMemory } = await createHarness(false);
    await expect(
      service.save({ addons: catalogPayload() }),
    ).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateAddonsCsat),
    ).toBeUndefined();
  });
});

function itemEnabled(
  items: readonly { key: string; enabled: boolean }[],
  key: string,
): boolean | undefined {
  return items.find((item) => item.key === key)?.enabled;
}

function snapshotAddons(settingsMemory: {
  getStored: (key: string) => { value: unknown } | undefined;
}): Record<string, unknown> {
  return Object.fromEntries(
    installAddonCatalog.map((item) => {
      const key = addonSettingKey(item.key);
      return [key, settingsMemory.getStored(key)?.value];
    }),
  );
}
