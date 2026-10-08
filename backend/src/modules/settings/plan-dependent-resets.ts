import { describeUnmetConditions } from './evaluate-setting-conditions';
import {
  isSettingActive,
  toInactiveSettingValue,
  type SettingState,
} from './setting-state';
import { getSettingDefaultValue } from './settings-value';
import type { SettingValue } from './settings.types';

/**
 * Paket 5.3.3 (D7): switching off a setting that others depend on either
 * returns them to their default, switches them off, or erases them. The caller
 * shows this list in the confirmation modal and the server applies it in the
 * same transaction.
 *
 * `disable` exists because "the default" is not always a value that can be used
 * while the parent is off: `private.edgeExtension.ws.enabled` defaults to *on*,
 * so returning it to its default would leave it stranded on a switched-off
 * module — exactly what the dependency gate rejects. Those dependents are
 * switched off instead, and the modal says so.
 */
export type SettingDependentResetAction =
  | 'reset_to_default'
  | 'disable'
  | 'delete';

export type SettingDependentReset = {
  readonly key: string;
  readonly action: SettingDependentResetAction;
  /** Present for `reset_to_default`: the value written back. */
  readonly value?: SettingValue;
  /** The key in the same request whose switch-off caused this reset. */
  readonly causedBy: string;
};

export type SettingResetPlan = {
  readonly causedBy: string;
  readonly resets: readonly Omit<SettingDependentReset, 'causedBy'>[];
};

/**
 * Only *active* dependents are returned: a dependent that is already off has
 * nothing to reset, and rewriting it would add noise to the change log.
 *
 * A key the caller sends explicitly in the same request is never reset — the
 * caller's own value wins, and if that value violates the new state the write
 * is rejected instead of silently overruled.
 */
export function planDependentResets(input: {
  readonly state: SettingState;
  readonly parents: readonly string[];
  readonly explicitKeys: ReadonlySet<string>;
}): readonly SettingResetPlan[] {
  const claimed = new Set<string>();
  const plans: SettingResetPlan[] = [];
  // A chain has to be walked in order: `enabled -> remote.enabled ->
  // remote.auditAcknowledge` needs the second link judged on the value this
  // plan writes for it, not on the value still stored, otherwise the last link
  // stays "on" and the write is refused by the final verification.
  let working = input.state;
  for (const parent of input.parents) {
    const resets: Omit<SettingDependentReset, 'causedBy'>[] = [];
    for (const key of working.transitiveDependentsOf([parent])) {
      if (claimed.has(key) || input.explicitKeys.has(key)) {
        continue;
      }
      const entry = working.read(key);
      if (!entry.isActive) {
        continue;
      }
      if (describeUnmetConditions(entry.definition, working).length === 0) {
        continue;
      }
      claimed.add(key);
      const reset = toReset(key, working);
      resets.push(reset);
      working = working.withOverrides(
        new Map([
          [
            key,
            reset.action === 'delete'
              ? { isRemoved: true, isPending: true }
              : { value: reset.value, isPending: true },
          ],
        ]),
      );
    }
    if (resets.length > 0) {
      plans.push({ causedBy: parent, resets });
    }
  }
  return plans;
}

function toReset(
  key: string,
  state: SettingState,
): Omit<SettingDependentReset, 'causedBy'> {
  const { definition } = state.read(key);
  const defaultValue = getSettingDefaultValue(definition);
  if (defaultValue === undefined) {
    // A secret has no default, and "not configured" is the only state it can go
    // back to — it is erased. The same goes for an optional key without a
    // default; a *required* one must keep a value to stay readable, so it is
    // switched off instead.
    return definition.visibility === 'secret' || !definition.isRequired
      ? { key, action: 'delete' }
      : { key, action: 'disable', value: toInactiveSettingValue(definition) };
  }
  if (isSettingActive(definition, defaultValue)) {
    return { key, action: 'disable', value: toInactiveSettingValue(definition) };
  }
  return { key, action: 'reset_to_default', value: defaultValue };
}
