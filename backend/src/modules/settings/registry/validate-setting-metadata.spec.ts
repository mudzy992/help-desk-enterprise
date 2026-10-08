import { settingCategoryIds } from '../setting-categories';
import type { SettingCondition, SettingDefinition } from '../settings.types';
import { definePrivateSetting, defineSecretSetting } from './define-setting';
import { assertSettingMetadata } from './validate-setting-metadata';

/**
 * Paket 5.3.3 (D6): `requires` is a graph, so a typo in a key or a cycle has to
 * fail while the registry is built, not when an administrator saves months
 * later. These are the checks the boot-time builder runs.
 */
function flag(
  key: string,
  extra: Partial<SettingDefinition> = {},
): SettingDefinition {
  return definePrivateSetting({
    key,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Test double',
    isRequired: true,
    defaultValue: false,
    ...extra,
  });
}

function text(
  key: string,
  extra: Partial<SettingDefinition> = {},
): SettingDefinition {
  return definePrivateSetting({
    key,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Test double',
    isRequired: false,
    defaultValue: '',
    ...extra,
  });
}

function number(
  key: string,
  extra: Partial<SettingDefinition> = {},
): SettingDefinition {
  return definePrivateSetting({
    key,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Test double',
    isRequired: true,
    defaultValue: 1,
    ...extra,
  });
}

describe('assertSettingMetadata', () => {
  it('accepts a valid chain and an empty requires-free registry', () => {
    const definitions = [
      flag('test.parent'),
      flag('test.child', {
        requires: [{ key: 'test.parent', equals: true }],
      }),
      flag('test.grandchild', {
        requires: [{ key: 'test.child', equals: true }],
      }),
      text('test.plain'),
    ];
    expect(() => assertSettingMetadata(definitions)).not.toThrow();
  });

  it('rejects a condition on an unknown key', () => {
    const definitions = [
      flag('test.child', {
        requires: [{ key: 'test.typo', equals: true }],
      }),
    ];
    expect(() => assertSettingMetadata(definitions)).toThrow(
      /requires an unknown key: test\.typo/,
    );
  });

  it('rejects a cycle, however long', () => {
    const definitions = [
      flag('test.a', { requires: [{ key: 'test.b', equals: true }] }),
      flag('test.b', { requires: [{ key: 'test.c', equals: true }] }),
      flag('test.c', { requires: [{ key: 'test.a', equals: true }] }),
    ];
    expect(() => assertSettingMetadata(definitions)).toThrow(/cycle/);
  });

  it('rejects a setting that requires itself', () => {
    const definitions = [
      flag('test.self', { requires: [{ key: 'test.self', equals: true }] }),
    ];
    expect(() => assertSettingMetadata(definitions)).toThrow(
      /cannot require itself/,
    );
  });

  it('rejects an empty requires list and a duplicate condition', () => {
    expect(() =>
      assertSettingMetadata([
        flag('test.parent'),
        flag('test.child', { requires: [] }),
      ]),
    ).toThrow(/empty requires list/);
    expect(() =>
      assertSettingMetadata([
        flag('test.parent'),
        flag('test.child', {
          requires: [
            { key: 'test.parent', equals: true },
            { key: 'test.parent', equals: false },
          ],
        }),
      ]),
    ).toThrow(/requires the same key twice/);
  });

  it('rejects an empty oneOf list', () => {
    const definitions = [
      text('test.mode'),
      flag('test.child', {
        requires: [{ key: 'test.mode', oneOf: [] }],
      }),
    ];
    expect(() => assertSettingMetadata(definitions)).toThrow(
      /empty oneOf list/,
    );
  });

  it('rejects comparing a value of the wrong type', () => {
    const definitions = [
      text('test.mode'),
      number('test.limit'),
      flag('test.badEquals', {
        requires: [{ key: 'test.mode', equals: true }],
      }),
      flag('test.badOneOf', {
        requires: [{ key: 'test.limit', oneOf: ['a', 'b'] }],
      }),
    ];
    expect(() => assertSettingMetadata([definitions[0], definitions[2]!])).toThrow(
      /compares test\.mode against a boolean value, but that setting is a string/,
    );
    expect(() => assertSettingMetadata([definitions[1], definitions[3]!])).toThrow(
      /compares test\.limit against a string value, but that setting is a number/,
    );
  });

  it('allows isSet and notEmpty on any type, including a secret', () => {
    const secret = defineSecretSetting({
      key: 'test.secret',
      categoryId: settingCategoryIds.privateSmtp,
      valueType: 'string',
      description: 'Test double',
      isRequired: false,
    });
    const definitions = [
      secret,
      text('test.url'),
      flag('test.usesSecret', {
        requires: [
          { key: 'test.secret', isSet: true },
          { key: 'test.url', notEmpty: true },
        ],
      }),
    ];
    expect(() => assertSettingMetadata(definitions)).not.toThrow();
    expect(
      (definitions[2]!.requires as readonly SettingCondition[]).map(
        (condition) => condition.key,
      ),
    ).toEqual(['test.secret', 'test.url']);
  });

  it('rejects blank title/help/group metadata', () => {
    expect(() =>
      assertSettingMetadata([flag('test.blankTitle', { titleKey: '  ' })]),
    ).toThrow(/blank titleKey/);
    expect(() =>
      assertSettingMetadata([flag('test.blankHelp', { helpKey: '' })]),
    ).toThrow(/blank helpKey/);
    expect(() =>
      assertSettingMetadata([flag('test.blankGroup', { group: '' })]),
    ).toThrow(/blank group/);
  });
});
