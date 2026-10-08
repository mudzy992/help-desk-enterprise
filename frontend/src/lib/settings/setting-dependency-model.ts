import type {
  SettingCondition,
  SettingRegistryEntry,
} from "@/services/settings-api";

/**
 * Paket 5.3.4 (D6): the client half of the dependency rule. The server is the
 * authority — it refuses a write whose result would strand a dependent — but the
 * screen has to *show* the same rule before the administrator presses save:
 * which parents are missing, and which keys would be switched off with it.
 *
 * The rule is deliberately small and identical to `setting-state.ts` on the
 * server: "active" means a boolean that is true, a number above zero or a text
 * that is filled in.
 */
export function readEffectiveValue(
  entry: SettingRegistryEntry,
): string | number | boolean | null {
  if (entry.visibility === "secret") {
    return entry.isSet ? null : null;
  }
  return entry.value ?? entry.defaultValue;
}

export function isSettingActive(entry: SettingRegistryEntry): boolean {
  if (entry.visibility === "secret") {
    // A secret has no readable value; "configured" is the closest thing to on.
    return entry.isSet;
  }
  const value = readEffectiveValue(entry);
  if (value === null) {
    return false;
  }
  if (entry.valueType === "boolean") {
    return value === true;
  }
  if (entry.valueType === "number") {
    return typeof value === "number" && value > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

function isFilled(entry: SettingRegistryEntry): boolean {
  if (entry.visibility === "secret") {
    return entry.isSet;
  }
  const value = readEffectiveValue(entry);
  if (value === null) {
    return false;
  }
  return typeof value !== "string" || value.trim().length > 0;
}

export function isConditionMet(
  condition: SettingCondition,
  entry: SettingRegistryEntry | null,
): boolean {
  if (entry === null) {
    return false;
  }
  if ("isSet" in condition) {
    return entry.isSet;
  }
  if ("notEmpty" in condition) {
    return isFilled(entry);
  }
  const value = readEffectiveValue(entry);
  if ("equals" in condition) {
    return value === condition.equals;
  }
  return condition.oneOf.some((candidate) => candidate === value);
}

export function findEntry(
  entries: readonly SettingRegistryEntry[],
  key: string,
): SettingRegistryEntry | null {
  return entries.find((entry) => entry.key === key) ?? null;
}

/** Parent keys that are not satisfied yet, in declaration order, deduplicated. */
export function describeUnmetRequirements(
  entry: SettingRegistryEntry,
  entries: readonly SettingRegistryEntry[],
): readonly string[] {
  const unmet: string[] = [];
  for (const condition of entry.requires) {
    if (unmet.includes(condition.key)) {
      continue;
    }
    if (!isConditionMet(condition, findEntry(entries, condition.key))) {
      unmet.push(condition.key);
    }
  }
  return unmet;
}

/**
 * Direct dependents of a key, in registry order. Used to explain, before a save,
 * what switching this setting off would take with it — the exact list still
 * comes from the server (`GET /settings/dependents`), because only it knows
 * which dependents are active right now.
 */
export function listDirectDependents(
  entries: readonly SettingRegistryEntry[],
  key: string,
): readonly SettingRegistryEntry[] {
  return entries.filter((entry) =>
    entry.requires.some((condition) => condition.key === key),
  );
}

/**
 * Whether the screen should refuse to switch a value on: the entry itself is
 * being made active, and at least one parent is missing. Switching *off*,
 * clearing or lowering a value is always allowed.
 */
export function findBlockingParents(input: {
  readonly entry: SettingRegistryEntry;
  readonly entries: readonly SettingRegistryEntry[];
  readonly nextValue: string | number | boolean;
}): readonly string[] {
  const projected: SettingRegistryEntry = { ...input.entry, value: input.nextValue };
  if (!isSettingActive(projected)) {
    return [];
  }
  return describeUnmetRequirements(input.entry, input.entries);
}
