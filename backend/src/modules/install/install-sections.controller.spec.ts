import { GUARDS_METADATA } from '@nestjs/common/constants';
import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import {
  InstallSettingsSectionParamDto,
  SaveInstallSettingsSectionDto,
} from './dto/save-install-settings-section.dto';
import { InstallSectionsController } from './install-sections.controller';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';
import { InstallSecurityRecommendationsService } from './sections/install-security-recommendations.service';
import { InstallSettingsSectionService } from './sections/install-settings-section.service';

/**
 * F5: the sections routes run against the real services over the in-memory
 * doubles, and the two boundaries the browser cannot be trusted to respect are
 * pinned here — the route parameter may only be a registry key, and the whole
 * controller sits behind the wizard lock („the installation is done“ must close
 * the sections too, or the wizard would keep editing settings after the operator
 * finished).
 */
async function createController(withSuperAdmin = true) {
  const harness = await createInstallWizardHarness({ withSuperAdmin });
  const sections = new InstallSettingsSectionService(
    harness.prisma,
    harness.settingsService,
    harness.registry,
  );
  const recommendations = new InstallSecurityRecommendationsService(
    harness.prisma,
    harness.settingsService,
    harness.registry,
  );
  return {
    harness,
    controller: new InstallSectionsController(sections, recommendations),
  };
}

describe('InstallSectionsController (Full-package sections)', () => {
  it('is closed once the installation is complete', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InstallSectionsController) as unknown[];
    expect((guards as readonly { readonly name: string }[]).map((guard) => guard.name)).toContain(
      InstallWizardLockGuard.name,
    );
  });

  it('accepts a registry section key on the route and refuses anything else', async () => {
    const pipe = createInstallValidationPipe();
    const asParam = (payload: unknown): Promise<InstallSettingsSectionParamDto> =>
      pipe.transform(payload, { type: 'param', metatype: InstallSettingsSectionParamDto });

    await expect(asParam({ sectionKey: 'onCall' })).resolves.toMatchObject({
      sectionKey: 'onCall',
    });
    await expect(asParam({ sectionKey: 'legacy-tab' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses a body field the save does not declare', async () => {
    const pipe = createInstallValidationPipe();
    await expect(
      pipe.transform(
        { values: [{ key: settingKeys.privateStatusPageEnabled, value: true }], reason: 'manual' },
        { type: 'body', metatype: SaveInstallSettingsSectionDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lists the sections and reads one with its unmet dependency', async () => {
    const { controller } = await createController();

    const list = await controller.listSections();
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

    const onCall = await controller.getSection({ sectionKey: 'onCall' });
    expect(onCall.stepKey).toBe('section.onCall');
    expect(onCall.dependencies).toEqual([{ dependency: 'team', satisfied: false }]);
  });

  it('saves through the controller and answers with the refreshed status', async () => {
    const { controller, harness } = await createController();

    const saved = await controller.saveSection(
      { sectionKey: 'statusPage' },
      { values: [{ key: settingKeys.privateStatusPageEnabled, value: true }] },
    );

    expect(saved.answered).toBe(true);
    expect(harness.readStored(settingKeys.privateStatusPageEnabled)?.value).toBe(true);
  });

  it('applies the security recommendations after the founder exists, and not before', async () => {
    const { controller } = await createController();
    await expect(controller.applySecurityRecommendations()).resolves.toMatchObject({
      answered: true,
      canApply: false,
    });

    const withoutFounder = await createController(false);
    await expect(withoutFounder.controller.applySecurityRecommendations()).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
  });
});
