import { settingKeys } from '../../settings/setting-keys';
import { createInstallWizardHarness } from '../create-install-wizard-harness';
import { InstallSettingsSectionService } from './install-settings-section.service';

/**
 * F5: one generic mechanism for the Full package's content. The suite is about
 * the boundary the wizard adds — the allowlist, the marker and the dependency
 * rules — because everything else (validation, `requires`, dependent resets,
 * secrets, change log) is `SettingsService` behaviour and is covered there.
 */
async function createSectionHarness() {
  const harness = await createInstallWizardHarness();
  return {
    ...harness,
    sectionService: new InstallSettingsSectionService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    ),
  };
}

describe('InstallSettingsSectionService', () => {
  it('lists every Full section with whether it was answered', async () => {
    const harness = await createSectionHarness();
    const list = await harness.sectionService.list();

    expect(list.sections.map((section) => section.sectionKey)).toEqual([
      'inboundEmail',
      'directory',
      'knowledgeBase',
      'statusPage',
      'onCall',
      'announcements',
      'security',
      'privacy',
      'auditWebhook',
      'itsm',
      'integrations',
    ]);
    expect(list.sections.every((section) => section.answered === false)).toBe(true);
    expect(list.sections[0]?.titleKey).toBe('install.section.inboundEmail.title');
    expect(list.sections[0]?.stepKey).toBe('section.inboundEmail');
    // Dependencies travel with the list, so a screen can warn before the operator
    // opens a section that cannot work yet.
    expect(list.sections[0]?.requires).toEqual(['service']);
  });

  it('reads the section through the registry metadata', async () => {
    const harness = await createSectionHarness();
    const status = await harness.sectionService.getSection('inboundEmail');

    expect(status.fields.map((field) => field.key)).toEqual([
      settingKeys.privateInboundEnabled,
      settingKeys.privateInboundProvider,
      settingKeys.privateInboundAddress,
      settingKeys.privateInboundCreateTickets,
      settingKeys.privateInboundDefaultServiceId,
    ]);
    const enabled = status.fields[0];
    expect({ valueType: enabled?.valueType, value: enabled?.value }).toEqual({
      valueType: 'boolean',
      value: false,
    });
    // The wizard reuses the registry's own i18n slots instead of inventing copy.
    expect(enabled?.titleKey).toBe(
      'settings.registry.keys.private.inbound.enabled',
    );
    expect(enabled?.helpKey).toBe('settings.registry.help.private.inbound.enabled');
    expect(status.dependencies).toEqual([
      { dependency: 'service', satisfied: false },
    ]);
  });

  it('offers the service of the seeded structure as the one option', async () => {
    const harness = await createSectionHarness();
    await harness.seedMinimum();
    const status = await harness.sectionService.getSection('inboundEmail');

    const defaultService = status.fields.find(
      (field) => field.key === settingKeys.privateInboundDefaultServiceId,
    );
    expect(defaultService?.options?.map((option) => option.label)).toEqual([
      'Opšti zahtjev',
    ]);
    expect(status.dependencies).toEqual([
      { dependency: 'service', satisfied: true },
    ]);
  });

  it('refuses a key outside the section allowlist', async () => {
    const harness = await createSectionHarness();
    await expect(
      harness.sectionService.saveSection('inboundEmail', {
        values: [{ key: settingKeys.privateInstallCompletedAt, value: 'now' }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'INSTALL_SETTINGS_SECTION_KEY_NOT_ALLOWED' },
    });
    // Nothing was written, not even the marker.
    expect(await harness.readStored(settingKeys.privateInstallCompletedAt)).toBeUndefined();
    expect(
      (await harness.sectionService.getSection('inboundEmail')).answered,
    ).toBe(false);
  });

  it('refuses an unknown section', async () => {
    const harness = await createSectionHarness();
    await expect(harness.sectionService.getSection('nope')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INSTALL_SETTINGS_SECTION_UNKNOWN' },
    });
  });
});
