import { settingCategoryIds } from './setting-categories';
import type { SettingDefinition } from './settings.types';
import { createSettingsRegistry } from './registry/create-settings-registry';
import {
  definePrivateSetting,
  defineSecretSetting,
} from './registry/define-setting';
import { planDependentResets } from './plan-dependent-resets';
import { createSettingState } from './setting-state';

/**
 * Paket 5.3.3 (D7): what happens to everything that depends on a setting that is
 * being switched off. Only dependents that are on today are listed — a
 * dependent that is already off has nothing to reset.
 */
const definitions: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: 'test.module',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Module switch',
    isRequired: true,
    defaultValue: true,
  }),
  // Defaults to on, like the Edge extension transport: it cannot go back to its
  // default while the module is off, so it is switched off instead.
  definePrivateSetting({
    key: 'test.module.ws',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Transport inside the module',
    isRequired: true,
    defaultValue: true,
    requires: [{ key: 'test.module', equals: true }],
  }),
  definePrivateSetting({
    key: 'test.module.limit',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Limit, defaults to 0 (off)',
    isRequired: true,
    defaultValue: 0,
    requires: [{ key: 'test.module', equals: true }],
  }),
  definePrivateSetting({
    key: 'test.module.url',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Optional URL without a default',
    isRequired: false,
    requires: [{ key: 'test.module', equals: true }],
  }),
  defineSecretSetting({
    key: 'test.module.secret',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Secret without a default',
    isRequired: false,
    requires: [{ key: 'test.module', equals: true }],
  }),
  definePrivateSetting({
    key: 'test.module.ws.backoff',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Backoff behind the transport',
    isRequired: true,
    defaultValue: 60,
    requires: [{ key: 'test.module.ws', equals: true }],
  }),
];

const registry = createSettingsRegistry(definitions);

function plan(input: {
  readonly stored: Record<string, unknown>;
  readonly parents: readonly string[];
  readonly explicitKeys?: readonly string[];
}) {
  const base = createSettingState({
    registry,
    storedByKey: new Map(Object.entries(input.stored)),
  });
  // The caller is switching the parents off, so the plan is computed on the
  // state those writes produce.
  const projected = base.withOverrides(
    new Map(
      input.parents.map((parent) => [
        parent,
        { value: false, isPending: true } as const,
      ]),
    ),
  );
  return planDependentResets({
    state: projected,
    parents: input.parents,
    explicitKeys: new Set(input.explicitKeys ?? input.parents),
  });
}

describe('planDependentResets', () => {
  it('returns the default when the default is a usable value', () => {
    const plans = plan({
      stored: { 'test.module': true, 'test.module.limit': 5 },
      parents: ['test.module'],
    });
    // Everything that is on today: the transport (default on, switched off),
    // the limit (5 -> default 0) and the backoff behind the transport.
    expect(plans).toEqual([
      {
        causedBy: 'test.module',
        resets: [
          { key: 'test.module.ws', action: 'disable', value: false },
          { key: 'test.module.limit', action: 'reset_to_default', value: 0 },
          { key: 'test.module.ws.backoff', action: 'disable', value: 0 },
        ],
      },
    ]);
  });

  it('switches a dependent off when its default is on', () => {
    const plans = plan({
      stored: { 'test.module': true, 'test.module.ws': true },
      parents: ['test.module'],
    });
    expect(plans[0]?.resets).toEqual([
      { key: 'test.module.ws', action: 'disable', value: false },
      { key: 'test.module.ws.backoff', action: 'disable', value: 0 },
    ]);
  });

  it('erases secrets and optional keys without a default', () => {
    const plans = plan({
      stored: {
        'test.module': true,
        'test.module.url': 'https://sd.example.com',
        'test.module.secret': 's3cret',
      },
      parents: ['test.module'],
    });
    expect(plans[0]?.resets).toEqual([
      { key: 'test.module.ws', action: 'disable', value: false },
      { key: 'test.module.url', action: 'delete' },
      { key: 'test.module.secret', action: 'delete' },
      { key: 'test.module.ws.backoff', action: 'disable', value: 0 },
    ]);
  });

  it('skips dependents that are already off', () => {
    const plans = plan({
      stored: { 'test.module': true, 'test.module.limit': 0, 'test.module.url': '' },
      parents: ['test.module'],
    });
    // Only the optional string and the number are quiet; the transport and its
    // backoff are on by default, so they still have something to reset.
    expect(plans[0]?.resets.map((reset) => reset.key)).toEqual([
      'test.module.ws',
      'test.module.ws.backoff',
    ]);
  });

  it('skips a key the caller sends explicitly in the same request', () => {
    const plans = plan({
      stored: { 'test.module': true, 'test.module.limit': 5, 'test.module.ws': true },
      parents: ['test.module'],
      explicitKeys: ['test.module', 'test.module.limit'],
    });
    expect(plans[0]?.resets.map((reset) => reset.key)).toEqual([
      'test.module.ws',
      'test.module.ws.backoff',
    ]);
  });

  it('walks the whole chain and claims each key once', () => {
    const plans = plan({
      stored: { 'test.module': true, 'test.module.ws': true },
      parents: ['test.module', 'test.module.ws'],
    });
    // Both parents are sent by the caller, so neither is reset; only the
    // backoff behind them is claimed, and it is written down once.
    expect(plans).toEqual([
      {
        causedBy: 'test.module',
        resets: [{ key: 'test.module.ws.backoff', action: 'disable', value: 0 }],
      },
    ]);
  });

  it('judges a dependent of a dependent on the value this plan writes', () => {
    // test.module.ws.backoff defaults to 60 (active) and depends on .ws. With
    // the transport switched off, the backoff has to end up off as well — the
    // stored value of .ws (still true at planning time) must not hide that.
    const plans = plan({
      stored: { 'test.module': true, 'test.module.ws': true },
      parents: ['test.module.ws'],
    });
    expect(plans).toEqual([
      {
        causedBy: 'test.module.ws',
        resets: [{ key: 'test.module.ws.backoff', action: 'disable', value: 0 }],
      },
    ]);
  });

  it('returns nothing for a key nothing depends on', () => {
    expect(plan({ stored: {}, parents: ['test.module.secret'] })).toEqual([]);
  });
});
