import { SettingsError } from '../settings.error';
import type {
  SettingCondition,
  SettingDefinition,
  SettingValue,
  SettingValueTypeName,
} from '../settings.types';

/**
 * Paket 5.3.3 (D6): `requires` is a graph, and a broken graph is worse than no
 * graph — a typo would silently drop the guard, and a cycle would make a group
 * of settings impossible to switch on. Both are declarations, so they are
 * rejected while the registry is built (boot time), not when an admin hits
 * "save" months later.
 */
export function assertSettingMetadata(
  definitions: readonly SettingDefinition[],
): void {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  for (const definition of definitions) {
    assertLocalMetadata(definition);
    for (const condition of definition.requires ?? []) {
      assertCondition(definition, condition, byKey);
    }
  }
  assertNoConditionCycles(definitions, byKey);
}

function assertLocalMetadata(definition: SettingDefinition): void {
  for (const [field, value] of [
    ['titleKey', definition.titleKey],
    ['helpKey', definition.helpKey],
    ['group', definition.group],
  ] as const) {
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new SettingsError(
        `Setting ${definition.key} has a blank ${field}`,
      );
    }
  }
  if (definition.requires === undefined) {
    return;
  }
  if (definition.requires.length === 0) {
    throw new SettingsError(
      `Setting ${definition.key} declares an empty requires list`,
    );
  }
  const seen = new Set<string>();
  for (const condition of definition.requires) {
    if (seen.has(condition.key)) {
      throw new SettingsError(
        `Setting ${definition.key} requires the same key twice: ${condition.key}`,
      );
    }
    seen.add(condition.key);
  }
}

function assertCondition(
  definition: SettingDefinition,
  condition: SettingCondition,
  byKey: ReadonlyMap<string, SettingDefinition>,
): void {
  if (condition.key.trim().length === 0) {
    throw new SettingsError(
      `Setting ${definition.key} requires a blank key`,
    );
  }
  if (condition.key === definition.key) {
    throw new SettingsError(
      `Setting ${definition.key} cannot require itself`,
    );
  }
  const target = byKey.get(condition.key);
  if (target === undefined) {
    throw new SettingsError(
      `Setting ${definition.key} requires an unknown key: ${condition.key}`,
    );
  }
  const comparedValues = readComparedValues(condition);
  if (comparedValues === null) {
    return;
  }
  for (const value of comparedValues) {
    assertComparableValue(definition, condition, value, target.valueType);
  }
}

function readComparedValues(
  condition: SettingCondition,
): readonly SettingValue[] | null {
  if ('equals' in condition) {
    return [condition.equals];
  }
  if ('oneOf' in condition) {
    if (condition.oneOf.length === 0) {
      throw new SettingsError(
        `Condition on ${condition.key} has an empty oneOf list`,
      );
    }
    return [...condition.oneOf];
  }
  return null;
}

function assertComparableValue(
  definition: SettingDefinition,
  condition: SettingCondition,
  value: SettingValue,
  targetType: SettingValueTypeName,
): void {
  if (typeof value !== targetType) {
    throw new SettingsError(
      `Setting ${definition.key} compares ${condition.key} against a ${typeof value} value, but that setting is a ${targetType}`,
    );
  }
}

/**
 * A cycle means "A may only be on while B is on, and B only while A is on",
 * which can never be satisfied: the pair could never be switched on again. The
 * key that closes the cycle is reported so the message points at the edit.
 */
function assertNoConditionCycles(
  definitions: readonly SettingDefinition[],
  byKey: ReadonlyMap<string, SettingDefinition>,
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    if (visiting.has(key)) {
      throw new SettingsError(
        `Setting dependencies form a cycle at ${key}; a setting cannot require itself directly or indirectly`,
      );
    }
    visiting.add(key);
    for (const condition of byKey.get(key)?.requires ?? []) {
      visit(condition.key);
    }
    visiting.delete(key);
    visited.add(key);
  };

  for (const definition of definitions) {
    visit(definition.key);
  }
}
