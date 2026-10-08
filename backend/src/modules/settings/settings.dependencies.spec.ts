import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemorySettingsPrisma } from './create-in-memory-settings-prisma';
import { applicationSettings } from './definitions/application-settings';
import { findDependencyViolations } from './evaluate-setting-conditions';
import { createSettingState } from './setting-state';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { definePrivateSetting, defineSecretSetting } from './registry/define-setting';
import { settingCategoryIds } from './setting-categories';
import { settingKeys } from './setting-keys';
import { settingsErrorCodes } from './settings.error';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';
import type { SettingDefinition } from './settings.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const mutation = { reason: 'E2E-like settings change', actorUserId: 'admin-1' };

/**
 * Paket 5.3.3 (D6/D7): the dependency gate on the real registry, and the reset
 * that follows a switch-off. The registry the application boots with decides
 * everything here — templates are only used where a secret has to be watched.
 */
describe('SettingsService setting dependencies', () => {
  const createHarness = async (
    definitions: readonly SettingDefinition[] = applicationSettings,
  ) => {
    const memory = createInMemorySettingsPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(definitions),
        },
        { provide: PrismaService, useValue: memory.prisma },
      ],
    }).compile();
    return { service: moduleRef.get(SettingsService), memory };
  };

  it('refuses to switch a setting on while its parent is off', async () => {
    const { service, memory } = await createHarness();
    await service.setSettingValue(settingKeys.privateEdgeExtensionEnabled, false, {
      ...mutation,
      reason: 'Switch the extension module off',
    }, { resetDependents: true });

    await expect(
      service.setSettingValue(settingKeys.privateEdgeExtensionWsEnabled, true, mutation),
    ).rejects.toMatchObject({
      code: settingsErrorCodes.dependencyUnmet,
      details: {
        violations: [
          {
            key: settingKeys.privateEdgeExtensionWsEnabled,
            missingKeys: [settingKeys.privateEdgeExtensionEnabled],
          },
        ],
        keys: [settingKeys.privateEdgeExtensionEnabled],
      },
    });

    // Nothing was written and nothing was logged for the refused key.
    expect(memory.getStored(settingKeys.privateEdgeExtensionWsEnabled)).toMatchObject({
      value: false,
    });
    expect(memory.changeLogs.map((entry) => entry.entityId)).not.toContain(
      settingKeys.privateEdgeExtensionWsEnabled,
    );
  });

  it('accepts the parent value and the switch-on in one batch, in either order', async () => {
    const { service, memory } = await createHarness();
    const result = await service.setSettingValues(
      [
        { key: settingKeys.privateSmtpEnabled, value: true },
        { key: settingKeys.privateSmtpHost, value: 'smtp.example.com' },
      ],
      { ...mutation, reason: 'Configure SMTP' },
    );
    expect(result.updatedKeys).toEqual([
      settingKeys.privateSmtpEnabled,
      settingKeys.privateSmtpHost,
    ]);
    expect(result.resets).toEqual([]);
    expect(memory.getStored(settingKeys.privateSmtpEnabled)).toMatchObject({
      value: true,
    });
  });

  it('refuses SMTP on without a host, and accepts it once the host is there', async () => {
    const { service, memory } = await createHarness();
    await expect(
      service.setSettingValue(settingKeys.privateSmtpEnabled, true, mutation),
    ).rejects.toMatchObject({
      code: settingsErrorCodes.dependencyUnmet,
      details: { keys: [settingKeys.privateSmtpHost] },
    });
    expect(memory.getStored(settingKeys.privateSmtpEnabled)).toBeUndefined();

    await service.setSettingValue(settingKeys.privateSmtpHost, 'smtp.example.com', mutation);
    await service.setSettingValue(settingKeys.privateSmtpEnabled, true, mutation);
    expect(memory.getStored(settingKeys.privateSmtpEnabled)).toMatchObject({
      value: true,
    });
  });

  it('always allows switching off and clearing', async () => {
    const { service, memory } = await createHarness();
    await service.setSettingValues(
      [
        { key: settingKeys.privateSmtpHost, value: 'smtp.example.com' },
        { key: settingKeys.privateSmtpEnabled, value: true },
      ],
      mutation,
    );
    await expect(
      service.setSettingValues(
        [
          { key: settingKeys.privateSmtpEnabled, value: false },
          { key: settingKeys.privateSmtpHost, value: '' },
        ],
        mutation,
      ),
    ).resolves.toMatchObject({ resets: [] });
    expect(memory.getStored(settingKeys.privateSmtpEnabled)).toMatchObject({
      value: false,
    });
  });

  it('refuses to strand active dependents without an explicit confirmation', async () => {
    const { service, memory } = await createHarness();
    const preview = await service.previewDependentResets(
      settingKeys.privateEdgeExtensionEnabled,
    );
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((reset) => reset.causedBy === settingKeys.privateEdgeExtensionEnabled)).toBe(
      true,
    );

    const before = memory.changeLogs.length;
    const refused = await service
      .setSettingValue(settingKeys.privateEdgeExtensionEnabled, false, mutation)
      .then(
        () => null,
        (error: unknown) => error as { code?: string; details?: Record<string, unknown> },
      );
    expect(refused?.code).toBe(settingsErrorCodes.dependencyUnmet);
    // The refused write names the dependents that would be stranded and the one
    // parent that is missing.
    const violations = refused?.details?.violations as readonly {
      readonly key: string;
      readonly missingKeys: readonly string[];
    }[];
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.every(
        (violation) =>
          violation.missingKeys.length === 1 &&
          violation.missingKeys[0] === settingKeys.privateEdgeExtensionEnabled,
      ),
    ).toBe(true);
    expect(refused?.details?.keys).toEqual([settingKeys.privateEdgeExtensionEnabled]);
    // All-or-nothing: the parent is still on, nothing was logged, and the keys
    // the modal listed are untouched.
    expect(memory.getStored(settingKeys.privateEdgeExtensionEnabled)).toBeUndefined();
    expect(memory.changeLogs).toHaveLength(before);
    for (const reset of preview) {
      expect(memory.getStored(reset.key)).toBeUndefined();
    }
  });

  it('resets exactly what the modal listed, in one transaction and one log entry', async () => {
    const { service, memory } = await createHarness();
    const preview = await service.previewDependentResets(
      settingKeys.privateEdgeExtensionEnabled,
    );
    const result = await service.setSettingValue(
      settingKeys.privateEdgeExtensionEnabled,
      false,
      { ...mutation, reason: 'Turn the Edge extension module off' },
      { resetDependents: true },
    );

    expect(result.resets.map((reset) => `${reset.key}:${reset.action}`)).toEqual(
      preview.map((reset) => `${reset.key}:${reset.action}`),
    );

    // A boolean whose default is on ends up switched off, everything with a
    // usable default goes back to it.
    for (const reset of result.resets) {
      if (reset.action === 'reset_to_default') {
        expect(memory.getStored(reset.key)).toMatchObject({ value: reset.value });
        continue;
      }
      if (reset.action === 'disable') {
        expect(memory.getStored(reset.key)).toMatchObject({ value: reset.value });
        expect(reset.value).toBe(false);
        continue;
      }
      expect(memory.getStored(reset.key)).toBeUndefined();
    }

    // One change-log entry per explicit key; the resets travel inside the entry
    // of the setting that caused them, as keys and actions only.
    expect(memory.changeLogs).toHaveLength(1);
    const entry = memory.changeLogs[0]!;
    expect(entry.entityId).toBe(settingKeys.privateEdgeExtensionEnabled);
    expect(entry.reason).toBe('Turn the Edge extension module off');
    expect(entry.diff.after).toMatchObject({
      resetDependents: result.resets.map((reset) => ({
        key: reset.key,
        action: reset.action,
      })),
    });
    expect(entry.diff.changes.map((change) => change.path)).toContain(
      'resetDependents',
    );
  });

  it('judges the state the batch produces across a whole chain', async () => {
    const { service, memory } = await createHarness();
    // The extension transport and everything behind it are on by default; the
    // module is switched off with the confirmation, so nothing may stay on.
    const result = await service.setSettingValue(
      settingKeys.privateEdgeExtensionEnabled,
      false,
      { ...mutation, reason: 'Turn the module off' },
      { resetDependents: true },
    );
    const resetKeys = result.resets.map((reset) => reset.key);
    expect(resetKeys).toContain(settingKeys.privateEdgeExtensionWsEnabled);
    expect(resetKeys).toContain(settingKeys.privateEdgeExtensionRemoteEnabled);
    // The backoff behind the transport is reached through the chain.
    expect(resetKeys).toContain(
      settingKeys.privateEdgeExtensionRemoteRequireUserClickToOpenQuickAssist,
    );
    for (const key of resetKeys) {
      expect(memory.getStored(key)).toMatchObject({ value: false });
    }
  });

  it('erases a secret dependent and never logs its value', async () => {
    const definitions: readonly SettingDefinition[] = [
      definePrivateSetting({
        key: 'test.integration',
        categoryId: settingCategoryIds.privateIntegrations,
        valueType: 'boolean',
        description: 'Integration switch',
        isRequired: true,
        defaultValue: false,
      }),
      defineSecretSetting({
        key: 'test.integration.secret',
        categoryId: settingCategoryIds.privateIntegrations,
        valueType: 'string',
        description: 'Client secret',
        isRequired: false,
        requires: [{ key: 'test.integration', equals: true }],
      }),
    ];
    const { service, memory } = await createHarness(definitions);
    await service.setSettingValues(
      [
        { key: 'test.integration', value: true },
        { key: 'test.integration.secret', value: 's3cret-value' },
      ],
      mutation,
    );

    const preview = await service.previewDependentResets('test.integration');
    expect(preview).toEqual([
      { key: 'test.integration.secret', action: 'delete', causedBy: 'test.integration' },
    ]);
    expect(JSON.stringify(preview)).not.toContain('s3cret-value');

    const result = await service.setSettingValue(
      'test.integration',
      false,
      { ...mutation, reason: 'Turn the integration off' },
      { resetDependents: true },
    );
    expect(result.resets).toEqual([
      { key: 'test.integration.secret', action: 'delete', causedBy: 'test.integration' },
    ]);
    expect(memory.getStored('test.integration.secret')).toBeUndefined();
    // Two entries from the setup (one per key), then the switch-off.
    expect(memory.changeLogs).toHaveLength(3);
    expect(memory.changeLogs[2]!.diff.after).toMatchObject({
      resetDependents: [{ key: 'test.integration.secret', action: 'delete' }],
    });
    expect(JSON.stringify(memory.changeLogs)).not.toContain('s3cret-value');
    // Read-after-write inside the same request sees the erased secret.
    await expect(
      service.getSecretForInternalUse('test.integration.secret'),
    ).resolves.toBeUndefined();
  });

  it('is consistent out of the box: a fresh install violates no dependency', () => {
    // A declared dependency whose dependant is "on" by default while its parent
    // is "off" by default would make every fresh install start inconsistent —
    // and the first save of an unrelated key would fail. The registry may not
    // contain such a pair.
    const registry = createSettingsRegistry(applicationSettings);
    const state = createSettingState({ registry, storedByKey: new Map() });
    expect(findDependencyViolations(state, state.keys)).toEqual([]);
  });

  it('reports the unknown key like every other settings error', async () => {
    const { service } = await createHarness();
    await expect(
      service.previewDependentResets('private.does.notExist'),
    ).rejects.toThrow(/Unknown setting key/);
  });
});
