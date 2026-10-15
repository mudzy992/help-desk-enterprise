import { addonSettingKey, installAddonCatalog } from '../settings/addon-catalog';
import { installStepDefinitions } from './steps/install-step.registry';
import { planInstallProfileReset } from './plan-install-profile-reset';

describe('planInstallProfileReset', () => {
  it('drops nothing for the F1 step set, which every package contains', () => {
    const plan = planInstallProfileReset({ nextProfile: 'minimum' });
    expect(plan.droppedStepKeys).toEqual([]);
    expect(plan.clearSkippedKeys).toEqual([]);
    expect(plan.resetSettingKeys).toEqual([]);
  });

  it('clears the flags and step-owned settings of steps the package lost', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'minimum',
      definitions: [
        ...installStepDefinitions,
        {
          key: 'smtp',
          order: 41,
          requiredIn: ['standard', 'full'],
          offeredIn: ['standard', 'full'],
          skippable: true,
          resettableSettingKeys: ['private.smtp.enabled'],
        },
      ],
    });

    // `smtp` is declared twice here, so the plan reports it once and keeps the
    // answer deterministic — a package may not silently drop a step twice.
    expect(plan.droppedStepKeys).toEqual(['smtp']);
    expect(plan.clearSkippedKeys).toEqual(['private.install.steps.smtp.skipped']);
    expect(plan.resetSettingKeys).toEqual(['private.smtp.enabled']);
  });

  it('reopens the steps the new package requires after the old one only offered them', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'standard',
      previousProfile: 'minimum',
      definitions: installStepDefinitions,
    });

    expect(plan.reopenedStepKeys).toEqual(['smtp', 'team']);
    // Reopening is not a reset of the step's content — only the deferral flag goes.
    expect(plan.droppedStepKeys).toEqual([]);
  });

  it('reopens nothing when the previous package already required the step', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'full',
      previousProfile: 'standard',
      definitions: installStepDefinitions,
    });

    expect(plan.reopenedStepKeys).toEqual([]);
  });

  it('treats "no package chosen yet" as the Minimum default', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'standard',
      previousProfile: null,
      definitions: installStepDefinitions,
    });

    expect(plan.reopenedStepKeys).toEqual(['smtp', 'team']);
  });

  it('keeps the credentials and identity of steps that stay in the package', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'standard',
      definitions: installStepDefinitions,
    });
    for (const definition of installStepDefinitions) {
      expect(plan.resetSettingKeys).not.toContain('private.smtp.host');
      expect(plan.resetSettingKeys).not.toContain('private.auth.mode');
      expect(plan.droppedStepKeys).not.toContain(definition.key);
    }
    // The registry is the source of the reset plan, not a hard-coded list.
    expect(plan.resetSettingKeys).not.toEqual(
      installAddonCatalog.map((item) => addonSettingKey(item.key)),
    );
  });
});
