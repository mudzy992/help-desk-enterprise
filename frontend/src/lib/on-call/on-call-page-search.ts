const minimumWeekOffset = -52;
const maximumWeekOffset = 52;
const weekStep = 4;

export type OnCallPageSearch = {
  readonly groupId: string | null;
  readonly weekOffset: number;
};

export function parseOnCallPageSearch(search: URLSearchParams): OnCallPageSearch {
  const group = search.get("group");
  const rawWeek = Number(search.get("week") ?? 0);
  const weekOffset =
    Number.isInteger(rawWeek) &&
    rawWeek >= minimumWeekOffset &&
    rawWeek <= maximumWeekOffset &&
    rawWeek % weekStep === 0
      ? rawWeek
      : 0;
  return {
    groupId: group === null || group.trim().length === 0 ? null : group,
    weekOffset,
  };
}

export function updateOnCallPageSearch(
  current: URLSearchParams,
  update: { readonly groupId?: string | null; readonly weekOffset?: number },
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (update.groupId !== undefined) {
    if (update.groupId === null) next.delete("group");
    else next.set("group", update.groupId);
  }
  if (update.weekOffset !== undefined) {
    if (update.weekOffset === 0) next.delete("week");
    else next.set("week", String(update.weekOffset));
  }
  return next;
}
