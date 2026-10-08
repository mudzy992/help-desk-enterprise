import 'reflect-metadata';

import { addonSettingKey } from './addon-catalog';
import { createInMemorySettingsPrisma } from './create-in-memory-settings-prisma';
import { applicationSettings } from './definitions/application-settings';
import { readSettingsAddons } from './read-settings-addons';
import { SettingsController } from './settings.controller';
import type { InstallAddonsStatus } from '../install/install-addons.types';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SettingsService } from './settings.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const mutation = { reason: 'read_settings_addons_spec', actorUserId: 'seed' };

function createHarness() {
  const memory = createInMemorySettingsPrisma();
  const service = new SettingsService(
    createSettingsRegistry(applicationSettings),
    memory.prisma as unknown as PrismaService,
  );
  return { memory, service };
}

function itemOf(
  record: InstallAddonsStatus,
  key: string,
): InstallAddonsStatus['addons']['items'][number] {
  const item = record.addons.items.find((entry) => entry.key === key);
  if (item === undefined) {
    throw new Error(`Addon ${key} missing from the record`);
  }
  return item;
}

describe('readSettingsAddons', () => {
  /**
   * The reported bug (2026-10-08): the switch said "off" after a successful
   * `PUT /settings`, because the settings tab rendered the *public* install
   * catalogue, which answers with defaults once the wizard is completed. This
   * read is the authenticated one, so a stored `true` must come back as `true`
   * even though the catalogue default is `false`.
   */
  it('reports the stored value, not the catalogue default', async () => {
    const { memory, service } = createHarness();
    await service.setSettingValue(addonSettingKey('cmdb'), true, mutation);

    const record = await readSettingsAddons(service);

    expect(memory.getStored(addonSettingKey('cmdb'))).toMatchObject({
      value: true,
    });
    expect(itemOf(record, 'cmdb')).toEqual({
      key: 'cmdb',
      enabled: true,
      defaultEnabled: false,
      canEnable: true,
    });
    // An addon that was never written keeps its documented default.
    expect(itemOf(record, 'csat')).toMatchObject({
      enabled: true,
      defaultEnabled: true,
    });
    expect(itemOf(record, 'teams')).toMatchObject({
      enabled: false,
      defaultEnabled: false,
    });
  });

  it('reports a switched-off addon as off even when it is on by default', async () => {
    const { service } = createHarness();
    await service.setSettingValue(addonSettingKey('approvals'), false, mutation);

    const record = await readSettingsAddons(service);

    expect(itemOf(record, 'approvals')).toMatchObject({ enabled: false });
  });

  /**
   * `private.addons.email` is the one addon with a cross-setting rule: SMTP off
   * always wins. The switch must show the effective state and be disabled while
   * the addon could not work anyway.
   */
  it('keeps the SMTP rule for the email addon', async () => {
    const { service } = createHarness();
    await service.setSettingValue(addonSettingKey('email'), true, mutation);

    const withoutSmtp = await readSettingsAddons(service);
    expect(withoutSmtp.addons.smtpEnabled).toBe(false);
    expect(itemOf(withoutSmtp, 'email')).toMatchObject({
      enabled: false,
      canEnable: false,
    });

    // Paket 5.3.3: SMTP may only be switched on with a host configured.
    await service.setSettingValue(settingKeys.privateSmtpHost, 'smtp.example.com', mutation);
    await service.setSettingValue(settingKeys.privateSmtpEnabled, true, mutation);

    const withSmtp = await readSettingsAddons(service);
    expect(withSmtp.addons.smtpEnabled).toBe(true);
    expect(itemOf(withSmtp, 'email')).toMatchObject({
      enabled: true,
      canEnable: true,
    });

    await service.setSettingValue(settingKeys.privateSmtpEnabled, false, mutation);
    const switchedBack = await readSettingsAddons(service);
    expect(itemOf(switchedBack, 'email')).toMatchObject({
      enabled: false,
      canEnable: false,
    });
  });

  it('lists the whole catalogue in the documented order', async () => {
    const { service } = createHarness();
    const record = await readSettingsAddons(service);
    expect(record.addons.items.map((item) => item.key)).toEqual([
      'email',
      'edge',
      'csat',
      'approvals',
      'confidential',
      'kbIntercept',
      'ticketSplit',
      'bulkActions',
      'savedViews',
      'reports',
      'cmdb',
      'problems',
      'changes',
      'teams',
    ]);
  });

  /**
   * Regression (2026-10-08, same evening): the first version returned the record
   * unwrapped, and the settings card silently disappeared — the frontend parser
   * requires `{ addons: { smtpEnabled, items } }`, the same envelope
   * `GET /install/addons` uses. The HTTP answer must therefore carry exactly the
   * keys the parser (and `isAddonCatalogItem`) checks.
   */
  it('answers with the envelope the addon parser expects', async () => {
    const { service } = createHarness();
    const payload = await readSettingsAddons(service);

    expect(Object.keys(payload)).toEqual(['addons']);
    expect(Object.keys(payload.addons).sort()).toEqual([
      'items',
      'smtpEnabled',
    ]);
    expect(typeof payload.addons.smtpEnabled).toBe('boolean');
    expect(payload.addons.items).toHaveLength(14);
    for (const item of payload.addons.items) {
      expect(Object.keys(item).sort()).toEqual([
        'canEnable',
        'defaultEnabled',
        'enabled',
        'key',
      ]);
      expect(typeof item.key).toBe('string');
      expect(typeof item.enabled).toBe('boolean');
      expect(typeof item.defaultEnabled).toBe('boolean');
      expect(typeof item.canEnable).toBe('boolean');
    }
  });

  it('serves the same envelope through the controller route handler', async () => {
    const { service } = createHarness();
    const controller = new SettingsController(service);

    const payload = await controller.listAddonCatalog();

    expect(payload.addons.items.find((item) => item.key === 'cmdb')).toEqual({
      key: 'cmdb',
      enabled: false,
      defaultEnabled: false,
      canEnable: true,
    });
  });
});
