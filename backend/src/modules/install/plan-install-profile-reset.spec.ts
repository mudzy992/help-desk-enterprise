import { addonSettingKey, installAddonCatalog } from '../settings/addon-catalog';
import { installStepDefinitions } from './steps/install-step.registry';
import { planInstallProfileReset } from './plan-install-profile-reset';

describe('planInstallProfileReset', () => {
  it('drops the F4 content steps when the package falls back to Minimum', () => {
    const plan = planInstallProfileReset({ nextProfile: 'minimum' });
    // Overview §4: the catalog, the policy pack and the SLA review are Standard
    // (and Full) content — Minimum keeps only the seeded service.
    expect(plan.droppedStepKeys).toEqual(['blueprint', 'policyPack', 'slaReview']);
    expect(plan.clearSkippedKeys).toEqual([
      'private.install.steps.blueprint.skipped',
      'private.install.steps.policyPack.skipped',
      'private.install.steps.slaReview.skipped',
    ]);
    // The markers are bookkeeping; the catalog and the grants stay in place.
    expect(plan.resetSettingKeys).toEqual([
      'private.install.blueprint',
      'private.install.policyPack',
      'private.install.slaReview',
    ]);
  });

  it('clears the flags and step-owned settings of steps the package lost', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'minimum',
      definitions: [
        {
          key: 'smtp',
          order: 40,
          requiredIn: ['standard', 'full'],
          offeredIn: ['standard', 'full'],
          skippable: true,
          resettableSettingKeys: ['private.smtp.enabled'],
        },
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

    // SMTP and the team step were merely offered in Minimum; the F4 content steps
    // did not exist there at all. The SLA review is offered, never required, so it
    // is in the way again without being „reopened“.
    expect(plan.reopenedStepKeys).toEqual([
      'smtp',
      'team',
      'blueprint',
      'policyPack',
    ]);
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

    expect(plan.reopenedStepKeys).toEqual([
      'smtp',
      'team',
      'blueprint',
      'policyPack',
    ]);
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
