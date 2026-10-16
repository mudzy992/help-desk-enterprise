import { createInstallWizardHarness } from '../install/create-install-wizard-harness';
import { installSecurityRecommendationWrites } from '../install/sections/install-security-recommendations';
import { settingKeys } from '../settings/setting-keys';
import { SetupChecklistService } from './setup-checklist.service';
import type { SetupChecklistStatus } from './setup-checklist.types';

/**
 * Install wizard v2 (F6.3): the checklist is a view over state the product
 * already keeps, so these specs drive the real wizard services (defer a step,
 * answer it later) instead of hand-written fixtures.
 */
describe('SetupChecklistService', () => {
  async function createHarness() {
    const wizard = await createInstallWizardHarness();
    return {
      wizard,
      service: new SetupChecklistService(wizard.prisma, wizard.settingsService),
    };
  }

  const itemKeys = (status: SetupChecklistStatus): readonly string[] =>
    status.items.map((item) => item.key);

  it('keeps a deferred step on the list until the step itself is answered', async () => {
    const { wizard, service } = await createHarness();
    await wizard.skipService.skip('smtp');

    const deferred = await service.getStatus();
    expect(itemKeys(deferred)).toContain('step.smtp');
    expect(deferred.items.find((item) => item.key === 'step.smtp')).toMatchObject({
      kind: 'step',
      targetKey: 'smtp',
      // The line is the dashboard's own wording; the wizard's step label stays
      // the fallback the card uses when a dictionary is older than the server.
      titleKey: 'dashboard.setupChecklist.item.smtp',
    });

    // The operator configures SMTP on the Settings screen later: the step reads
    // as completed from then on, and the item disappears without being marked.
    await wizard.saveSmtp();
    expect(itemKeys(await service.getStatus())).not.toContain('step.smtp');
  });

  it('lists an unapplied production recommendation and drops it when applied', async () => {
    const { wizard, service } = await createHarness();
    const idleTimeout = settingKeys.privateSecuritySessionIdleTimeoutSeconds;
    const before = await service.getStatus();
    expect(itemKeys(before)).toContain(`recommendation.${idleTimeout}`);

    const write = installSecurityRecommendationWrites.find((entry) => entry.key === idleTimeout);
    expect(write).toBeDefined();
    await wizard.settingsService.setSettingValue(write!.key, write!.value, {
      reason: 'spec',
      actorUserId: null,
    });

    expect(itemKeys(await service.getStatus())).not.toContain(`recommendation.${idleTimeout}`);
  });

  it('hides the widget on dismiss without losing the items', async () => {
    const { wizard, service } = await createHarness();
    await wizard.skipService.skip('team');
    const before = await service.getStatus();
    expect(before.dismissedAt).toBeNull();

    const after = await service.dismiss('admin-1');
    expect(after.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(itemKeys(after)).toEqual(itemKeys(before));
    expect(await service.getStatus()).toMatchObject({ dismissedAt: after.dismissedAt });
  });
});
