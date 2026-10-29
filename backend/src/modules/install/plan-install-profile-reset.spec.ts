import { addonSettingKey, installAddonCatalog } from '../settings/addon-catalog';
import { installSectionStepKeys } from './sections/install-settings-section.keys';
import { installStepDefinitions } from './steps/install-step.registry';
import { planInstallProfileReset } from './plan-install-profile-reset';

describe('planInstallProfileReset', () => {
  it('drops the content steps when the package falls back to Minimum', () => {
    // F5: a step is only lost when the previous package had it — a fallback from
    // Full is what "the package no longer contains the step" means.
    const plan = planInstallProfileReset({
      nextProfile: 'minimum',
      previousProfile: 'full',
    });
    // Overview §4: the catalog, the policy pack, the SLA review and every section
    // of the Full package are content above Minimum — Minimum keeps only the
    // seeded service.
    expect(plan.droppedStepKeys).toEqual([
      'blueprint',
      'policyPack',
      'slaReview',
      ...installSectionStepKeys,
      'securityRecommendations',
    ]);
    expect(plan.clearSkippedKeys).toEqual([
      'private.install.steps.blueprint.skipped',
      'private.install.steps.policyPack.skipped',
      'private.install.steps.slaReview.skipped',
      'private.install.steps.section.inboundEmail.skipped',
      'private.install.steps.section.directory.skipped',
      'private.install.steps.section.knowledgeBase.skipped',
      'private.install.steps.section.statusPage.skipped',
      'private.install.steps.section.onCall.skipped',
      'private.install.steps.section.announcements.skipped',
      'private.install.steps.section.security.skipped',
      'private.install.steps.section.privacy.skipped',
      'private.install.steps.section.auditWebhook.skipped',
      'private.install.steps.section.itsm.skipped',
      'private.install.steps.section.integrations.skipped',
      'private.install.steps.securityRecommendations.skipped',
    ]);
    // The markers are bookkeeping; the catalog, the grants and every settings
    // section the operator answered stay in place until their step is gone — and
    // then only the step's own marker goes, never the settings it wrote.
    expect(plan.resetSettingKeys).toEqual([
      'private.install.blueprint',
      'private.install.policyPack',
      'private.install.slaReview',
      'private.install.steps.section.inboundEmail.saved',
      'private.install.steps.section.directory.saved',
      'private.install.steps.section.knowledgeBase.saved',
      'private.install.steps.section.statusPage.saved',
      'private.install.steps.section.onCall.saved',
      'private.install.steps.section.announcements.saved',
      'private.install.steps.section.security.saved',
      'private.install.steps.section.privacy.saved',
      'private.install.steps.section.auditWebhook.saved',
      'private.install.steps.section.itsm.saved',
      'private.install.steps.section.integrations.saved',
      'private.install.steps.securityRecommendations.saved',
    ]);
  });

  it('leaves the steps of the Full package alone when a smaller package is chosen', () => {
    // F5: they were never in the flow, so there is no state to drop — the wizard
    // simply does not offer them (and nothing is written on the way).
    const plan = planInstallProfileReset({
      nextProfile: 'standard',
      previousProfile: 'minimum',
    });
    expect(plan.droppedStepKeys).toEqual([]);
    expect(plan.clearSkippedKeys).toEqual([]);
    expect(plan.resetSettingKeys).toEqual([]);
  });

  it('clears the flags and step-owned settings of steps the package lost', () => {
    const plan = planInstallProfileReset({
      nextProfile: 'minimum',
      // „The package lost the step“ has to start from a package that had it.
      previousProfile: 'standard',
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
