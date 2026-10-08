import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildSettingChangeLogDiff } from './build-setting-change-log-diff';
import { findDependencyViolations } from './evaluate-setting-conditions';
import {
  planDependentResets,
  type SettingDependentReset,
} from './plan-dependent-resets';
import { createSettingState } from './setting-state';
import { mapVisibilityToPersistence } from './settings.persistence-map';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from './settings-value';
import {
  createDependencyUnmetError,
  mapChangeLogErrorToSettingsError,
} from './settings.error';
import type {
  SettingDefinition,
  SettingsMutationInput,
  SettingsRegistry,
  SettingValue,
} from './settings.types';

export type PersistSettingValuesOptions = {
  /**
   * Paket 5.3.3 (D7): the caller confirmed the reset of everything that depends
   * on a setting it is switching off. Without it such a write is refused with
   * `SETTING_DEPENDENCY_UNMET`, so a dependent can never be left switched on
   * without its parent.
   */
  readonly resetDependents?: boolean;
};

export type PersistSettingValuesResult = {
  readonly updatedKeys: readonly string[];
  readonly resets: readonly SettingDependentReset[];
};

export async function persistSettingValue(
  prisma: PrismaService,
  registry: SettingsRegistry,
  definition: SettingDefinition,
  value: SettingValue,
  mutation: SettingsMutationInput,
  options: PersistSettingValuesOptions = {},
): Promise<PersistSettingValuesResult> {
  return persistSettingValues(
    prisma,
    registry,
    [{ definition, value }],
    mutation,
    options,
  );
}

/**
 * Paket 4.1: several keys under one reason, all-or-nothing. Every value is
 * validated before anything is written, then all rows and change-log entries
 * go into a single transaction (one change-log entry per key, as before).
 *
 * Paket 5.3.3: the same transaction now also enforces setting dependencies.
 * The state is projected first (so "set the URL and switch the integration on"
 * in one batch is legal), dependents of everything being switched off are
 * planned, and after the writes the resulting state is verified inside the
 * transaction — a violation rolls the whole change back.
 */
export async function persistSettingValues(
  prisma: PrismaService,
  registry: SettingsRegistry,
  items: readonly { readonly definition: SettingDefinition; readonly value: SettingValue }[],
  mutation: SettingsMutationInput,
  options: PersistSettingValuesOptions = {},
): Promise<PersistSettingValuesResult> {
  const reason = readRequiredReason(mutation.reason);
  const validated = items.map((item) =>
    validateSettingValue(item.definition, item.value),
  );
  const explicitKeys = new Set(items.map((item) => item.definition.key));
  const dirtyKeys = new Set(explicitKeys);

  const resets = await prisma.$transaction(async (transaction) => {
    const currentState = await readState(transaction, registry);
    const projectedState = currentState.withOverrides(
      new Map(
        items.map((item, index) => [
          item.definition.key,
          { value: validated[index], isPending: true },
        ]),
      ),
    );
    // Only a setting that is switched *off* by this request can strand its
    // dependents; one that is switched on is the case the gate rejects.
    const switchedOff = items
      .map((item) =>
        projectedState.read(item.definition.key).isActive
          ? null
          : item.definition.key,
      )
      .filter((key): key is string => key !== null);
    const plans = options.resetDependents
      ? planDependentResets({
          state: projectedState,
          parents: switchedOff,
          explicitKeys,
        })
      : [];
    const resetsByParent = new Map(plans.map((plan) => [plan.causedBy, plan]));

    for (const [index, { definition }] of items.entries()) {
      await writeSetting(transaction, definition, validated[index], reason, mutation.actorUserId, {
        resetDependents: resetsByParent.get(definition.key)?.resets,
      });
    }

    const applied: SettingDependentReset[] = [];
    for (const plan of plans) {
      for (const reset of plan.resets) {
        const definition = registry.requireDefinition(reset.key);
        if (reset.action === 'delete') {
          await transaction.appSetting.deleteMany({ where: { key: reset.key } });
          dirtyKeys.add(reset.key);
          applied.push({ ...reset, causedBy: plan.causedBy });
          continue;
        }
        await writeSetting(transaction, definition, reset.value as SettingValue, reason, mutation.actorUserId, {
          // The reset is already listed in the entry of the setting that caused
          // it (D7: one logical change with the list of keys).
          skipChangeLog: true,
        });
        dirtyKeys.add(reset.key);
        applied.push({ ...reset, causedBy: plan.causedBy });
      }
    }

    const resultingState = await readState(transaction, registry);
    const violations = findDependencyViolations(resultingState, [
      ...dirtyKeys,
      ...resultingState.transitiveDependentsOf([...dirtyKeys]),
    ]);
    if (violations.length > 0) {
      throw createDependencyUnmetError(violations);
    }
    return applied;
  });

  return { updatedKeys: [...explicitKeys], resets };
}

async function readState(
  transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  registry: SettingsRegistry,
) {
  const rows = await transaction.appSetting.findMany({
    select: { key: true, value: true },
  });
  return createSettingState({
    registry,
    storedByKey: new Map(rows.map((row) => [row.key, row.value] as const)),
  });
}

async function writeSetting(
  transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  definition: SettingDefinition,
  validated: SettingValue,
  reason: string,
  actorUserId: string | null,
  options: {
    readonly resetDependents?: readonly Omit<SettingDependentReset, 'causedBy'>[];
    readonly skipChangeLog?: boolean;
  } = {},
): Promise<void> {
  const persistence = mapVisibilityToPersistence(definition.visibility);
  const stored = await transaction.appSetting.findUnique({
    where: { key: definition.key },
    select: { value: true },
  });
  const beforeValue =
    stored === null
      ? getSettingDefaultValue(definition)
      : validateSettingValue(definition, stored.value);
  await transaction.appSetting.upsert({
    where: { key: definition.key },
    create: {
      key: definition.key,
      value: validated,
      scope: persistence.scope,
      isSecret: persistence.isSecret,
      description: definition.description,
    },
    update: {
      value: validated,
      scope: persistence.scope,
      isSecret: persistence.isSecret,
      description: definition.description,
    },
  });
  if (options.skipChangeLog === true) {
    return;
  }
  await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.setting,
    entityId: definition.key,
    reason,
    actorUserId,
    diff: buildSettingChangeLogDiff({
      definition,
      action: stored === null ? 'create' : 'update',
      beforeValue,
      afterValue: validated,
      resetDependents: options.resetDependents,
    }),
  });
}

function readRequiredReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    mapChangeLogErrorToSettingsError(error);
  }
}
