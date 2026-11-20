import { useCallback, useMemo, useState } from "react";
import { cabGroupChoiceForUnit } from "@/lib/changes/cab-group-candidates";
import type { ChangeCabGroupOption, ChangeDetail, ChangeOptions } from "@/services/changes-api";

/**
 * BA-changes-16: owns the CAB choice of the change form.
 *
 * It lives outside the sheet because the routing must not be a side effect of
 * rendering an option list: the picker is prefilled only when the unit chain
 * already decides the body, and it is emptied whenever the routing becomes
 * ambiguous.
 */
export interface ChangeCabGroupState {
  readonly value: string;
  readonly setValue: (value: string) => void;
  /** Groups the picker offers - only the ones the server would accept. */
  readonly candidates: readonly ChangeCabGroupOption[];
  /** True when several groups are possible, so the requester has to pick. */
  readonly required: boolean;
  /** Restores the value when the sheet opens (for the unit it is opening on). */
  readonly prefill: (unitID?: string) => void;
  /** Re-evaluates the routing after the change moved to another unit. */
  readonly applyUnitMove: (nextUnitId: string) => void;
}

function unitPathOf(unitId: string, options: ChangeOptions, change?: ChangeDetail): string {
  if (change !== undefined && change.organizationalUnit.id === unitId) {
    return change.organizationalUnit.ouPath;
  }
  return options.units.find((unit) => unit.id === unitId)?.path ?? "";
}

export function useChangeCabGroup(input: {
  readonly options: ChangeOptions;
  readonly change?: ChangeDetail;
  readonly unitId: string;
}): ChangeCabGroupState {
  const { options, change, unitId } = input;
  const [value, setValue] = useState("");
  const choice = useMemo(
    () => cabGroupChoiceForUnit(options.cabGroups, unitPathOf(unitId, options, change)),
    [options, change, unitId],
  );
  const prefill = useCallback(
    (unitID?: string) => {
      // The sheet sets its unit in the same pass it opens, so the routing is
      // evaluated for the opening unit instead of the previous render's one.
      const opening =
        unitID === undefined
          ? choice
          : cabGroupChoiceForUnit(options.cabGroups, unitPathOf(unitID, options, change));
      setValue(change?.cabGroup?.id ?? opening.autoSelectId ?? "");
    },
    [change, choice, options],
  );
  const applyUnitMove = useCallback(
    (nextUnitId: string) => {
      const next = cabGroupChoiceForUnit(
        options.cabGroups,
        unitPathOf(nextUnitId, options, change),
      );
      setValue((current) =>
        current !== "" && next.candidates.some((group) => group.id === current)
          ? current
          : (next.autoSelectId ?? ""),
      );
    },
    [options, change],
  );
  return {
    value,
    setValue,
    candidates: choice.candidates,
    required: choice.selectionRequired,
    prefill,
    applyUnitMove,
  };
}
