import { applicationSettings } from '../settings/definitions/application-settings';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import {
  installStepSavedKeys,
  installStepSkippedKeys,
  settingKeys,
} from '../settings/setting-keys';
import { planInstallRerunClears, resolveInstallRerunKeys } from './plan-install-rerun';

const registry = createSettingsRegistry(applicationSettings);

describe('resolveInstallRerunKeys', () => {
  it('clears only the completion lock by default', () => {
    expect(resolveInstallRerunKeys()).toEqual([
      settingKeys.privateInstallCompletedAt,
      settingKeys.privateInstallCompletedByUserId,
    ]);
  });

  it('adds the wizard markers on request, without duplicates', () => {
    const keys = resolveInstallRerunKeys({ includeStepMarkers: true });

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(settingKeys.privateInstallProfile);
    expect(keys).toContain(settingKeys.privateInstallBlueprint);
    expect(keys).toContain(settingKeys.privateInstallPolicyPack);
    expect(keys).toContain(settingKeys.privateInstallSlaReview);
    expect(keys).toContain(installStepSavedKeys['section.security']);
    expect(keys).toContain(installStepSkippedKeys.addons);
  });

  it('names only keys the registry knows, all of them with a default', () => {
    // The „clear“ write is a normal registry write: a key without a default
    // would fail the first time an operator reruns the wizard.
    for (const key of resolveInstallRerunKeys({ includeStepMarkers: true })) {
      expect(registry.requireDefinition(key)).toBeDefined();
    }
  });
});

describe('planInstallRerunClears', () => {
  it('keeps only keys that carry something other than their default', () => {
    const clears = planInstallRerunClears({
      registry,
      currentByKey: new Map<string, unknown>([
        [settingKeys.privateInstallCompletedAt, '2026-10-15T09:00:00.000Z'],
        [settingKeys.privateInstallCompletedByUserId, ''],
      ]),
    });

    expect(clears.map((clear) => clear.definition.key)).toEqual([
      settingKeys.privateInstallCompletedAt,
    ]);
    expect(clears[0]?.value).toBe('');
  });

  it('counts a key that is missing as „at its default“', () => {
    expect(planInstallRerunClears({ registry, currentByKey: new Map() })).toEqual([]);
  });

  it('returns the default of a boolean marker (false), not an empty string', () => {
    const clears = planInstallRerunClears({
      registry,
      currentByKey: new Map<string, unknown>([[installStepSkippedKeys.addons, true]]),
      includeStepMarkers: true,
    });

    expect(clears).toHaveLength(1);
    expect(clears[0]?.definition.key).toBe(installStepSkippedKeys.addons);
    expect(clears[0]?.value).toBe(false);
  });
});
