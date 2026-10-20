import type { ChangeConflictPreviewInput, ChangeType } from "@/services/changes-api";

export function buildChangeConflictPreview(input: {
  readonly open: boolean;
  readonly type: ChangeType;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly serviceIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly changeId?: string;
}): ChangeConflictPreviewInput | null {
  if (
    !input.open ||
    input.plannedStart === null ||
    input.plannedEnd === null ||
    input.plannedStart >= input.plannedEnd
  )
    return null;
  return {
    type: input.type,
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    serviceIds: [...input.serviceIds],
    assetIds: [...input.assetIds],
    ...(input.changeId ? { changeId: input.changeId } : {}),
  };
}
