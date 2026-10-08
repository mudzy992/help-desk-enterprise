import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogDiffPayload, JsonValue } from '../change-log/change-log.types';
import { redactIfSecret } from './settings.redaction';
import type { SettingDependentReset } from './plan-dependent-resets';
import type { SettingDefinition, SettingValue } from './settings.types';

export function buildSettingChangeLogDiff(input: {
  readonly definition: SettingDefinition;
  readonly action: 'create' | 'update';
  readonly beforeValue: SettingValue | undefined;
  readonly afterValue: SettingValue;
  /**
   * Paket 5.3.3 (D7): switching a setting off resets everything that depends on
   * it, and that is one logical change — so the list of keys belongs in the
   * entry of the setting that caused it, not in one entry per reset key.
   */
  readonly resetDependents?: readonly Omit<SettingDependentReset, 'causedBy'>[];
}): ChangeLogDiffPayload {
  const diff = buildChangeLogDiff({
    action:
      input.action === 'create'
        ? changeLogActions.create
        : changeLogActions.update,
    resourceType: changeLogEntityTypes.setting,
    resourceId: input.definition.key,
    before: toRawSettingState(input.definition, input.beforeValue),
    after: toRawSettingState(input.definition, input.afterValue),
  });
  const after = toLoggedSettingState(input.definition, input.afterValue);
  const resetEntries = toLoggedResetEntries(input.resetDependents ?? []);
  return {
    ...diff,
    before: toLoggedSettingState(input.definition, input.beforeValue),
    after:
      resetEntries.length === 0
        ? after
        : {
            ...(after as Record<string, JsonValue>),
            resetDependents: resetEntries as JsonValue,
          },
    changes: [
      ...diff.changes.map((entry) =>
        entry.path === 'value'
          ? {
              ...entry,
              before: loggedValue(input.definition, entry.before),
              after: loggedValue(input.definition, entry.after),
            }
          : entry,
      ),
      ...(resetEntries.length === 0
        ? []
        : [
            {
              path: 'resetDependents',
              before: [] as JsonValue,
              after: resetEntries as JsonValue,
            },
          ]),
    ],
  };
}

/**
 * The entry lists **keys and actions only**: the action says what happened
 * (default written back, or row erased for secrets and for keys that have no
 * default), and no setting value — secret or not — needs to travel into the log
 * to describe a dependency reset.
 */
function toLoggedResetEntries(
  resets: readonly Omit<SettingDependentReset, 'causedBy'>[],
): readonly JsonValue[] {
  return resets.map((reset) => ({
    key: reset.key,
    action: reset.action,
  }));
}

export function toLoggedSettingState(
  definition: SettingDefinition,
  value: SettingValue | undefined,
): JsonValue {
  return {
    key: definition.key,
    visibility: definition.visibility,
    value: toLoggedSettingValue(definition, value),
  };
}

function toRawSettingState(
  definition: SettingDefinition,
  value: SettingValue | undefined,
): JsonValue {
  return {
    key: definition.key,
    visibility: definition.visibility,
    value: value ?? null,
  };
}

function toLoggedSettingValue(
  definition: SettingDefinition,
  value: SettingValue | undefined,
): JsonValue {
  if (value === undefined) {
    return null;
  }
  return redactIfSecret(definition.visibility, value) as JsonValue;
}

function loggedValue(
  definition: SettingDefinition,
  value: JsonValue,
): JsonValue {
  if (value === null) {
    return null;
  }
  return redactIfSecret(definition.visibility, value) as JsonValue;
}
