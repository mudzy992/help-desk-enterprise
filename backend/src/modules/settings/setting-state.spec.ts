import { settingCategoryIds } from './setting-categories';
import type { SettingDefinition } from './settings.types';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { definePrivateSetting, defineSecretSetting } from './registry/define-setting';
import { createSettingState } from './setting-state';

/**
 * Paket 5.3.3 (D6): the state answers \"what would the registry look like after
 * this write?\". Every rule the dependency gate relies on is asserted here:
 * defaults fill the gaps, a pending value wins over the stored one, and
 * \"active\" means what an administrator sees as switched on.
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
    key: 'test.module.ws.reconnect',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Reconnect backoff',
    isRequired: true,
    defaultValue: 60,
    requires: [{ key: 'test.module.ws', equals: true }],
  }),
  definePrivateSetting({
    key: 'test.url',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Integration URL',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: 'test.mode',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Connector mode',
    isRequired: true,
    defaultValue: 'simulator',
  }),
  defineSecretSetting({
    key: 'test.url.secret',
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Integration secret',
    isRequired: false,
  }),
];

const registry = createSettingsRegistry(definitions);

function stateWith(stored: Record<string, unknown>) {
  return createSettingState({
    registry,
    storedByKey: new Map(Object.entries(stored)),
  });
}

describe('createSettingState', () => {
  it('falls back to defaults and reports them as not stored', () => {
    const state = stateWith({});
    const entry = state.read('test.module');
    expect(entry).toMatchObject({ isSet: false, value: true, isActive: true, isFilled: true });
    expect(state.read('test.url')).toMatchObject({
      isSet: false,
      value: '',
      isActive: false,
      isFilled: false,
    });
    expect(state.read('test.url.secret')).toMatchObject({
      isSet: false,
      value: undefined,
      isActive: false,
      isFilled: false,
    });
  });

  it('prefers the stored value over the default', () => {
    const state = stateWith({ 'test.module': false, 'test.url': 'https://sd.example.com' });
    expect(state.read('test.module')).toMatchObject({ isSet: true, value: false, isActive: false });
    expect(state.read('test.url')).toMatchObject({
      isSet: true,
      value: 'https://sd.example.com',
      isActive: true,
      isFilled: true,
    });
  });

  it('treats a blank string, a zero and an unreadable row as inactive', () => {
    const state = stateWith({
      'test.url': '   ',
      'test.module.ws.reconnect': 0,
      'test.mode': 42,
    });
    expect(state.read('test.url').isActive).toBe(false);
    expect(state.read('test.module.ws.reconnect').isActive).toBe(false);
    // A row that does not match its declared type must not turn every later
    // save into a failure: it counts as \"nothing stored\".
    expect(state.read('test.mode')).toMatchObject({ isSet: true, value: undefined });
  });

  it('answers a secret with isSet, because its value is not readable off the server', () => {
    const state = stateWith({ 'test.url.secret': 'super-secret' });
    expect(state.read('test.url.secret')).toMatchObject({
      isSet: true,
      isActive: true,
      isFilled: true,
    });
    expect(stateWith({}).read('test.url.secret').isFilled).toBe(false);
  });

  it('applies pending overrides on top of the stored state without touching the database', () => {
    const base = stateWith({ 'test.module': true });
    const projected = base.withOverrides(
      new Map([['test.module', { value: false, isPending: true }]]),
    );
    expect(base.read('test.module').value).toBe(true);
    expect(projected.read('test.module')).toMatchObject({ value: false, isActive: false });
  });

  it('lists direct and transitive dependents', () => {
    const state = stateWith({});
    expect(state.dependentsOf('test.module')).toEqual(['test.module.ws']);
    expect(state.dependentsOf('test.module.ws')).toEqual(['test.module.ws.reconnect']);
    expect(state.transitiveDependentsOf(['test.module'])).toEqual([
      'test.module.ws',
      'test.module.ws.reconnect',
    ]);
    expect(state.transitiveDependentsOf(['test.mode'])).toEqual([]);
    expect(state.has('test.unknown')).toBe(false);
    expect(state.keys).toHaveLength(definitions.length);
  });
});
