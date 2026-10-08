import { getSettingDefaultValue, validateSettingValue } from './settings-value';
import type {
  SettingDefinition,
  SettingsRegistry,
  SettingValue,
} from './settings.types';

/**
 * Paket 5.3.3 (D6): the dependency gate has to answer "what would be the state
 * of the whole registry after this change?" — not only "what is stored right
 * now". Two writes in one batch (set the URL, then switch the integration on)
 * must be judged on the state they *produce*, so the gate works over a snapshot
 * with pending overrides on top.
 */
export type IncomingSettingValue = {
  /** The value a request writes. Absent when the row is erased. */
  readonly value?: SettingValue;
  /**
   * A reset that erases the row (secrets and keys without a default). What is
   * left is the default — `undefined` for those — and the key counts as not
   * stored, because that is what the row says afterwards.
   */
  readonly isRemoved?: boolean;
  /** Set when the value comes from the request rather than from the database. */
  readonly isPending: boolean;
};

export type SettingStateEntry = {
  readonly definition: SettingDefinition;
  /** A stored row exists (the only fact that can be known about a secret). */
  readonly isSet: boolean;
  /** Effective value, defaults applied; `undefined` when nothing decides it. */
  readonly value: SettingValue | undefined;
  /** Whether the setting counts as "on" at this value. */
  readonly isActive: boolean;
  /**
   * Whether there is something at all: a value that is not blank. A secret's
   * value is readable on the server only, and the screens mirror `notEmpty`
   * with `isSet`, so secrets answer with `isSet`.
   */
  readonly isFilled: boolean;
};

export type SettingState = {
  readonly read: (key: string) => SettingStateEntry;
  readonly has: (key: string) => boolean;
  /** Every key the registry knows, in registry order. */
  readonly keys: readonly string[];
  /** Direct dependents: settings that name `key` in their `requires`. */
  readonly dependentsOf: (key: string) => readonly string[];
  /** Dependents of the given keys, transitively, excluding the keys themselves. */
  readonly transitiveDependentsOf: (
    keys: readonly string[],
  ) => readonly string[];
  /** The same state with pending values applied — no database involved. */
  readonly withOverrides: (
    overrides: ReadonlyMap<string, IncomingSettingValue>,
  ) => SettingState;
};

export function createSettingState(input: {
  readonly registry: SettingsRegistry;
  /** Raw `AppSetting.value` rows by key. */
  readonly storedByKey: ReadonlyMap<string, unknown>;
  readonly overrides?: ReadonlyMap<string, IncomingSettingValue>;
}): SettingState {
  const overrides = input.overrides ?? new Map<string, IncomingSettingValue>();
  const dependents = buildDependentsIndex(input.registry);

  const readEntry = (key: string): SettingStateEntry => {
    const definition = input.registry.requireDefinition(key);
    const pending = overrides.get(key);
    if (pending !== undefined) {
      if (pending.isRemoved === true) {
        return toEntry(definition, {
          value: getSettingDefaultValue(definition),
          isSet: false,
        });
      }
      return toEntry(definition, {
        value: pending.value,
        isSet: true,
      });
    }
    if (!input.storedByKey.has(key)) {
      return toEntry(definition, {
        value: getSettingDefaultValue(definition),
        isSet: false,
      });
    }
    return toEntry(definition, {
      value: readStoredValue(definition, input.storedByKey.get(key)),
      isSet: true,
    });
  };

  const state: SettingState = {
    read: readEntry,
    has: (key) => input.registry.getDefinition(key) !== undefined,
    keys: input.registry.definitions.map((definition) => definition.key),
    dependentsOf: (key) => dependents.get(key) ?? [],
    transitiveDependentsOf: (keys) =>
      collectTransitiveDependents(dependents, keys),
    withOverrides: (next) =>
      createSettingState({
        registry: input.registry,
        storedByKey: input.storedByKey,
        overrides: new Map([...overrides, ...next]),
      }),
  };
  return state;
}

/**
 * An unreadable stored value is treated as "nothing stored": the gate must
 * never turn a single inconsistent row elsewhere in the table into a failed
 * save of an unrelated setting.
 */
function readStoredValue(
  definition: SettingDefinition,
  stored: unknown,
): SettingValue | undefined {
  try {
    return validateSettingValue(definition, stored);
  } catch {
    return undefined;
  }
}

function toEntry(
  definition: SettingDefinition,
  input: { readonly value: SettingValue | undefined; readonly isSet: boolean },
): SettingStateEntry {
  return {
    definition,
    isSet: input.isSet,
    value: input.value,
    isActive: isSettingActive(definition, input.value),
    isFilled:
      definition.visibility === 'secret'
        ? input.isSet
        : isSettingFilled(input.value),
  };
}

/**
 * "Active" is what the user sees as switched on: a boolean that is true, a
 * text field that is filled in, a number above zero. Clearing a field, setting
 * it to zero or switching a toggle off is always allowed — the dependency gate
 * only guards *switching something on*.
 */
export function isSettingActive(
  definition: SettingDefinition,
  value: SettingValue | undefined,
): boolean {
  if (value === undefined) {
    return false;
  }
  if (definition.valueType === 'boolean') {
    return value === true;
  }
  if (definition.valueType === 'number') {
    return typeof value === 'number' && value > 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The value that means "switched off" for a definition: `false`, `0` or an
 * empty string. Used when a dependent cannot simply be returned to its default
 * (the default is "on", or there is no default at all).
 */
export function toInactiveSettingValue(definition: SettingDefinition): SettingValue {
  if (definition.valueType === 'boolean') {
    return false;
  }
  if (definition.valueType === 'number') {
    return 0;
  }
  return '';
}

/**
 * "Filled in": a text field with something in it, a number or a switch that is
 * set at all. Used by the `notEmpty` condition, which asks "has this been
 * configured?" rather than "is this switched on?".
 */
export function isSettingFilled(value: SettingValue | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

function buildDependentsIndex(
  registry: SettingsRegistry,
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const definition of registry.definitions) {
    for (const condition of definition.requires ?? []) {
      const bucket = index.get(condition.key);
      if (bucket === undefined) {
        index.set(condition.key, [definition.key]);
        continue;
      }
      bucket.push(definition.key);
    }
  }
  return index;
}

function collectTransitiveDependents(
  index: ReadonlyMap<string, readonly string[]>,
  keys: readonly string[],
): readonly string[] {
  const roots = new Set(keys);
  const collected = new Set<string>();
  const queue = [...keys];
  while (queue.length > 0) {
    const key = queue.shift();
    if (key === undefined) {
      break;
    }
    for (const dependent of index.get(key) ?? []) {
      if (roots.has(dependent) || collected.has(dependent)) {
        continue;
      }
      collected.add(dependent);
      queue.push(dependent);
    }
  }
  return [...collected];
}
