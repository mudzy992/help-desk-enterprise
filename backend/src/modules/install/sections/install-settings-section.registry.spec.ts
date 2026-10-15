import { SessionIdleTimeoutLoader } from '../../authentication/security/session-idle-timeout.loader';
import { applicationSettings } from '../../settings/definitions/application-settings';
import { createSettingsRegistry } from '../../settings/registry/create-settings-registry';
import { settingKeys } from '../../settings/setting-keys';
import { validateSettingValue } from '../../settings/settings-value';
import {
  installStepDefinitionByKey,
  installStepDefinitions,
  resolveInstallStepSavedKey,
  resolveInstallStepSkippedKey,
} from '../steps/install-step.registry';
import {
  installSectionStepKeys,
  installSettingsSectionKeys,
  resolveInstallSectionStepKey,
} from './install-settings-section.keys';
import { installSettingsSections } from './install-settings-section.registry';
import {
  installSecurityRecommendationWrites,
  installSecurityRecommendations,
} from './install-security-recommendations';

/**
 * F5 consistency guard: the wizard's sections are **declarations**, so every
 * promise they make has to hold against the other declarations — the settings
 * registry, the step registry and the marker families. The suite deliberately
 * reads the real registries instead of a fixture: a key that is renamed in a
 * definition file, or a step that forgets its markers, fails here instead of in
 * production.
 */
const registry = createSettingsRegistry(applicationSettings);

const f5StepKeys = [...installSectionStepKeys, 'securityRecommendations'] as const;

describe('install settings sections', () => {
  it('declares every allowlisted key as a registered setting', () => {
    for (const section of installSettingsSections) {
      expect(section.settingKeys.length).toBeGreaterThan(0);
      for (const key of section.settingKeys) {
        expect({ section: section.sectionKey, key }).toEqual({
          section: section.sectionKey,
          key: registry.getDefinition(key)?.key ?? null,
        });
      }
    }
  });

  it('keeps the main switch and the package defaults inside the allowlist', () => {
    for (const section of installSettingsSections) {
      if (section.mainSwitchKey !== undefined) {
        expect(section.settingKeys).toContain(section.mainSwitchKey);
      }
      for (const key of section.packageDefaultKeys ?? []) {
        expect(section.settingKeys).toContain(key);
      }
      // Only a section whose dependencies can be unmet needs a main switch.
      expect(section.requires.length === 0 || section.mainSwitchKey !== undefined).toBe(
        true,
      );
    }
  });

  it('gives every section exactly one step of the Full package', () => {
    expect(installSettingsSections.map((section) => section.sectionKey)).toEqual([
      ...installSettingsSectionKeys,
    ]);
    for (const section of installSettingsSections) {
      const stepKey = resolveInstallSectionStepKey(section.sectionKey);
      const definition = installStepDefinitionByKey[stepKey];
      expect(definition).toBeDefined();
      expect({ stepKey, offeredIn: definition.offeredIn, requiredIn: definition.requiredIn })
        .toEqual({ stepKey, offeredIn: ['full'], requiredIn: [] });
      expect(definition.skippable).toBe(true);
      // Answering a section may only drop the marker the section writes; the
      // settings the operator answered stay through a package change.
      expect(definition.resettableSettingKeys).toEqual([
        resolveInstallStepSavedKey(stepKey),
      ]);
    }
  });

  it('has unique step keys and wizard positions', () => {
    const keys = installStepDefinitions.map((definition) => definition.key);
    const orders = installStepDefinitions.map((definition) => definition.order);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(orders).size).toBe(orders.length);
    // The add-ons step stays the last one, exactly like the F3 shell's rail.
    expect(installStepDefinitionByKey.addons.order).toBeGreaterThan(
      installStepDefinitionByKey['section.integrations'].order,
    );
  });

  it('declares the markers of every step it reports as skippable', () => {
    for (const definition of installStepDefinitions) {
      const skippedKey = resolveInstallStepSkippedKey(definition.key);
      expect({ step: definition.key, key: skippedKey }).toEqual({
        step: definition.key,
        key: registry.getDefinition(skippedKey)?.key ?? null,
      });
    }
    for (const stepKey of f5StepKeys) {
      const savedKey = resolveInstallStepSavedKey(stepKey);
      const definition = registry.getDefinition(savedKey);
      expect({
        step: stepKey,
        type: definition?.valueType,
        defaultValue:
          definition === undefined || !('defaultValue' in definition)
            ? undefined
            : definition.defaultValue,
      }).toEqual({ step: stepKey, type: 'boolean', defaultValue: false });
    }
  });

  it('recommends only values the registry accepts', () => {
    for (const entry of installSecurityRecommendations) {
      const definition = registry.requireDefinition(entry.key);
      if (entry.recommendedValue !== null) {
        // Throws when the value breaks the type, the range or `allowedValues`.
        validateSettingValue(definition, entry.recommendedValue);
      }
      expect(entry.titleKey.startsWith('install.security.recommendations.')).toBe(true);
    }
    // Owner decision 7: the idle window only ships while the session loader
    // accepts it — otherwise the „apply“ button would write a rejected value.
    const idleTimeout = installSecurityRecommendationWrites.find(
      (entry) => entry.key === settingKeys.privateSecuritySessionIdleTimeoutSeconds,
    );
    expect(idleTimeout?.value).toBe(1800);
    expect(SessionIdleTimeoutLoader.validate(1800)).toBe(true);
    // …and the captcha stays untouched until Turnstile keys exist.
    expect(installSecurityRecommendationWrites.map((entry) => entry.key)).not.toContain(
      settingKeys.privateSecurityCaptchaProvider,
    );
    expect(
      installSecurityRecommendations.find(
        (entry) => entry.key === settingKeys.privateSecurityCaptchaProvider,
      )?.recommendedValue,
    ).toBeNull();
  });
});
