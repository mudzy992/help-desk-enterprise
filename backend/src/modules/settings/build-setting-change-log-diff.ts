import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogDiffPayload, JsonValue } from '../change-log/change-log.types';
import { redactIfSecret } from './settings.redaction';
import type { SettingDefinition, SettingValue } from './settings.types';

export function buildSettingChangeLogDiff(input: {
  readonly definition: SettingDefinition;
  readonly action: 'create' | 'update';
  readonly beforeValue: SettingValue | undefined;
  readonly afterValue: SettingValue;
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
  return {
    ...diff,
    before: toLoggedSettingState(input.definition, input.beforeValue),
    after: toLoggedSettingState(input.definition, input.afterValue),
    changes: diff.changes.map((entry) =>
      entry.path === 'value'
        ? {
            ...entry,
            before: loggedValue(input.definition, entry.before),
            after: loggedValue(input.definition, entry.after),
          }
        : entry,
    ),
  };
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
