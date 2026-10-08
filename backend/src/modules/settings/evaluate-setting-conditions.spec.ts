import { settingCategoryIds } from './setting-categories';
import type { SettingDefinition } from './settings.types';
import { createSettingsRegistry } from './registry/create-settings-registry';
import {
  definePrivateSetting,
  defineSecretSetting,
} from './registry/define-setting';
import {
  describeUnmetConditions,
  findDependencyViolations,
  isConditionMet,
} from './evaluate-setting-conditions';
import { createSettingState } from './setting-state';

/**
 * Paket 5.3.3 (D6): one place decides whether a condition holds, so the refusal
 * on save and the hint in the UI describe the same rule.
 */
const definitions: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: 'test.integration',
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'boolean',
    description: 'Integration switch',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: 'test.integration.url',
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'string',
    description: 'Integration URL',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: 'test.integration.mode',
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'string',
    description: 'Mode',
    isRequired: true,
    defaultValue: 'simulator',
    allowedValues: ['simulator', 'live'],
  }),
  defineSecretSetting({
    key: 'test.integration.secret',
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'string',
    description: 'Client secret',
    isRequired: false,
  }),
  definePrivateSetting({
    key: 'test.integration.live',
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'boolean',
    description: 'Live connector',
    isRequired: true,
    defaultValue: false,
    requires: [
      { key: 'test.integration', equals: true },
      { key: 'test.integration.mode', oneOf: ['live'] },
      { key: 'test.integration.url', notEmpty: true },
      { key: 'test.integration.secret', isSet: true },
    ],
  }),
];

const registry = createSettingsRegistry(definitions);

function stateWith(stored: Record<string, unknown>) {
  return createSettingState({
    registry,
    storedByKey: new Map(Object.entries(stored)),
  });
}

describe('isConditionMet', () => {
  it('compares the effective value, defaults included', () => {
    const state = stateWith({});
    expect(isConditionMet({ key: 'test.integration', equals: false }, state)).toBe(true);
    expect(isConditionMet({ key: 'test.integration', equals: true }, state)).toBe(false);
    expect(
      isConditionMet({ key: 'test.integration.mode', oneOf: ['simulator', 'live'] }, state),
    ).toBe(true);
    expect(
      isConditionMet({ key: 'test.integration.mode', oneOf: ['live'] }, state),
    ).toBe(false);
  });

  it('treats a blank string as not filled in and an unknown key as unmet', () => {
    expect(
      isConditionMet({ key: 'test.integration.url', notEmpty: true }, stateWith({ 'test.integration.url': '  ' })),
    ).toBe(false);
    expect(
      isConditionMet({ key: 'test.integration.url', notEmpty: true }, stateWith({ 'test.integration.url': 'https://x.example.com' })),
    ).toBe(true);
    expect(
      isConditionMet({ key: 'test.missing', equals: true }, stateWith({})),
    ).toBe(false);
  });

  it('asks a secret only whether it exists', () => {
    expect(
      isConditionMet({ key: 'test.integration.secret', isSet: true }, stateWith({})),
    ).toBe(false);
    expect(
      isConditionMet({ key: 'test.integration.secret', isSet: true }, stateWith({ 'test.integration.secret': 's3cret' })),
    ).toBe(true);
  });
});

describe('describeUnmetConditions', () => {
  const live = registry.requireDefinition('test.integration.live');
  const definition = live;

  it('lists every blocking parent in declaration order, deduplicated', () => {
    expect(describeUnmetConditions(definition, stateWith({}))).toEqual([
      'test.integration',
      'test.integration.mode',
      'test.integration.url',
      'test.integration.secret',
    ]);
    expect(
      describeUnmetConditions(
        definition,
        stateWith({
          'test.integration': true,
          'test.integration.mode': 'live',
          'test.integration.url': 'https://x.example.com',
          'test.integration.secret': 's3cret',
        }),
      ),
    ).toEqual([]);
  });

  it('returns an empty list for a definition without conditions', () => {
    expect(
      describeUnmetConditions(registry.requireDefinition('test.integration.url'), stateWith({})),
    ).toEqual([]);
  });
});

describe('findDependencyViolations', () => {
  it('reports only active keys, with the parents that are missing', () => {
    const state = stateWith({ 'test.integration.live': true });
    expect(findDependencyViolations(state, ['test.integration.live'])).toEqual([
      {
        key: 'test.integration.live',
        missingKeys: [
          'test.integration',
          'test.integration.mode',
          'test.integration.url',
          'test.integration.secret',
        ],
      },
    ]);
    // The same key, switched off: nothing to report, switching off is always allowed.
    expect(
      findDependencyViolations(stateWith({ 'test.integration.live': false }), [
        'test.integration.live',
      ]),
    ).toEqual([]);
    expect(findDependencyViolations(state, ['test.does.not.exist'])).toEqual([]);
  });

  it('passes once every condition holds', () => {
    const state = stateWith({
      'test.integration': true,
      'test.integration.mode': 'live',
      'test.integration.url': 'https://x.example.com',
      'test.integration.secret': 's3cret',
      'test.integration.live': true,
    });
    expect(findDependencyViolations(state, ['test.integration.live'])).toEqual([]);
  });
});
