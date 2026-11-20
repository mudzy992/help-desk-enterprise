import type { ChangeDetail, ChangeLevel, ChangeOptions } from "@/services/changes-api";

/**
 * The request body of the change form. Kept next to the CAB routing rules (and
 * out of the sheet) so the payload is one small, testable description instead of
 * inline object construction - BA-changes-16 always sends the CAB group the
 * requester or the unit routing picked, never a silent default.
 */
export interface ChangeFormBodyInput {
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly organizationalUnitId: string;
  readonly serviceIds: readonly string[];
  readonly assetIds?: readonly string[];
  readonly problemId?: string | null;
  readonly causesDowntime: boolean;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly ownerUserId?: string | null;
  readonly standard: boolean;
  readonly impact: ChangeLevel;
  readonly likelihood: ChangeLevel;
  readonly cabGroupId: string;
  readonly implementationPlan: string;
  readonly backoutPlan: string;
  readonly testPlan: string;
  readonly communicationPlan: string;
}

/**
 * The concrete shape matters: the sheet spreads it into the create/update
 * request, so a `Record<string, unknown>` would erase the required fields.
 */
export interface ChangeFormBody {
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly organizationalUnitId: string;
  readonly serviceIds: readonly string[];
  readonly assetIds?: readonly string[];
  readonly problemId?: string | null;
  readonly causesDowntime: boolean;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly ownerUserId?: string | null;
  readonly impact?: ChangeLevel;
  readonly likelihood?: ChangeLevel;
  readonly cabGroupId?: string;
  readonly implementationPlan?: string | null;
  readonly backoutPlan?: string | null;
  readonly testPlan?: string | null;
  readonly communicationPlan: string | null;
}

export function changeFormBody(input: ChangeFormBodyInput): ChangeFormBody {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    reason: input.reason.trim(),
    organizationalUnitId: input.organizationalUnitId,
    serviceIds: input.serviceIds,
    ...(input.assetIds !== undefined ? { assetIds: input.assetIds } : {}),
    ...(input.problemId !== undefined ? { problemId: input.problemId } : {}),
    causesDowntime: input.causesDowntime,
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
    ...(input.standard
      ? {}
      : {
          impact: input.impact,
          likelihood: input.likelihood,
          cabGroupId: input.cabGroupId,
          implementationPlan: input.implementationPlan.trim() || null,
          backoutPlan: input.backoutPlan.trim() || null,
          testPlan: input.testPlan.trim() || null,
        }),
    communicationPlan: input.communicationPlan.trim() || null,
  };
}

/**
 * The unit picker always contains the change's own unit, even when the viewer's
 * scope no longer lists it (otherwise an edit would silently move the change).
 */
export function changeFormUnits(
  options: ChangeOptions,
  change?: ChangeDetail,
): readonly { readonly id: string; readonly name: string; readonly path: string }[] {
  if (change === undefined) return options.units;
  if (options.units.some((unit) => unit.id === change.organizationalUnit.id)) return options.units;
  return [
    {
      id: change.organizationalUnit.id,
      name: change.organizationalUnit.name,
      path: change.organizationalUnit.ouPath,
    },
    ...options.units,
  ];
}

/**
 * A half-filled, unparsable or reversed window blocks the save before the server
 * sees it. The raw values still matter: an empty input is not a missing date.
 */
export function changeWindowState(
  start: string,
  end: string,
  startIso: string | null,
  endIso: string | null,
): { readonly invalid: boolean; readonly half: boolean } {
  return {
    invalid:
      (start !== "" && startIso === null) ||
      (end !== "" && endIso === null) ||
      (startIso !== null && endIso !== null && startIso >= endIso),
    half: (startIso === null) !== (endIso === null),
  };
}

/**
 * Whether the form may be submitted. Lifted out of the sheet (which sits on the
 * 500-line ceiling) and kept pure, so the rule can be read on its own: a window
 * only edit needs a valid window, everything else needs a title, a unit and -
 * for a standard change - a template, or a description and a CAB group.
 */
export interface ChangeFormSubmitInput {
  readonly saving: boolean;
  readonly windowInvalid: boolean;
  readonly windowHalf: boolean;
  readonly windowOnly: boolean;
  readonly title: string;
  readonly unitId: string;
  readonly standard: boolean;
  readonly editing: boolean;
  readonly templateId: string;
  readonly description: string;
  readonly cabGroupId: string;
}

export function canSubmitChangeForm(input: ChangeFormSubmitInput): boolean {
  if (input.saving || input.windowInvalid || input.windowHalf) return false;
  if (input.windowOnly) return true;
  if (input.title.trim().length < 3 || input.unitId === "") return false;
  if (input.standard) return input.editing || input.templateId !== "";
  return input.description.trim().length > 0 && input.cabGroupId !== "";
}
