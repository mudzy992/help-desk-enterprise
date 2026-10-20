export const slaViews = ["profiles", "calendars", "matrix"] as const;
export type SlaView = (typeof slaViews)[number];
export type SlaProfilesPanel = "profiles" | "compliance";

export type SlaPageSearch = {
  readonly view: SlaView;
  readonly panel: SlaProfilesPanel;
  readonly organizationalUnitId: string | null;
  readonly profileId: string | null;
};

export function parseSlaPageSearch(params: URLSearchParams): SlaPageSearch {
  const rawView = params.get("view");
  const view = slaViews.includes(rawView as SlaView) ? (rawView as SlaView) : "profiles";
  return {
    view,
    panel: params.get("panel") === "compliance" ? "compliance" : "profiles",
    organizationalUnitId: params.get("organizationalUnitId"),
    profileId: params.get("profileId"),
  };
}

export function updateSlaPageSearch(
  current: URLSearchParams,
  patch: Partial<SlaPageSearch>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null | undefined, defaultValue?: string) => {
    if (value === null || value === undefined || value === "" || value === defaultValue)
      next.delete(key);
    else next.set(key, value);
  };
  if (patch.view !== undefined) set("view", patch.view, "profiles");
  if (patch.panel !== undefined) set("panel", patch.panel, "profiles");
  if (patch.organizationalUnitId !== undefined)
    set("organizationalUnitId", patch.organizationalUnitId);
  if (patch.profileId !== undefined) set("profileId", patch.profileId);
  return next;
}
