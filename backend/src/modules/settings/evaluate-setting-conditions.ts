import type { SettingState } from './setting-state';
import type { SettingCondition, SettingDefinition } from './settings.types';

/**
 * Paket 5.3.3 (D6): the one place that decides whether a condition holds. The
 * server uses it to refuse a save; the same rules describe what the UI shows as
 * "requires".
 */
export function isConditionMet(
  condition: SettingCondition,
  state: SettingState,
): boolean {
  if (!state.has(condition.key)) {
    return false;
  }
  const entry = state.read(condition.key);
  if ('isSet' in condition) {
    return entry.isSet;
  }
  if ('notEmpty' in condition) {
    // "Filled in", not "switched on": setting the integration URL in the same
    // batch that switches the integration on has to satisfy this.
    return entry.isFilled;
  }
  if ('equals' in condition) {
    return entry.value === condition.equals;
  }
  return condition.oneOf.some((candidate) => entry.value === candidate);
}

/** Parent keys that are not satisfied yet, in declaration order, deduplicated. */
export function describeUnmetConditions(
  definition: SettingDefinition,
  state: SettingState,
): readonly string[] {
  const unmet: string[] = [];
  for (const condition of definition.requires ?? []) {
    if (unmet.includes(condition.key)) {
      continue;
    }
    if (!isConditionMet(condition, state)) {
      unmet.push(condition.key);
    }
  }
  return unmet;
}

export type SettingDependencyViolation = {
  /** The setting that would end up switched on without its conditions met. */
  readonly key: string;
  /** The parent keys that block it. */
  readonly missingKeys: readonly string[];
};

/**
 * Every listed key that is active and whose conditions are unmet is a
 * violation. Callers pass the keys a write can affect: the keys that changed
 * plus everything that depends on them.
 */
export function findDependencyViolations(
  state: SettingState,
  keys: readonly string[],
): readonly SettingDependencyViolation[] {
  const violations: SettingDependencyViolation[] = [];
  for (const key of keys) {
    if (!state.has(key)) {
      continue;
    }
    const entry = state.read(key);
    if (!entry.isActive) {
      continue;
    }
    const missingKeys = describeUnmetConditions(entry.definition, state);
    if (missingKeys.length > 0) {
      violations.push({ key, missingKeys });
    }
  }
  return violations;
}
