export type AnnouncementPageTab = "mine" | "manage";

export function parseAnnouncementPageTab(value: string | null): AnnouncementPageTab {
  return value === "manage" ? "manage" : "mine";
}

export function updateAnnouncementPageSearch(
  current: URLSearchParams,
  update: { readonly tab?: AnnouncementPageTab; readonly open?: string | null },
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (update.tab !== undefined) {
    if (update.tab === "mine") next.delete("tab");
    else next.set("tab", update.tab);
  }
  if (update.open !== undefined) {
    if (update.open === null || update.open.trim().length === 0) next.delete("open");
    else next.set("open", update.open);
  }
  return next;
}
