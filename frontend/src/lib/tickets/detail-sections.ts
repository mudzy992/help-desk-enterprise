/*
  Paket 4.2 (dio B): detail sections.

  The ticket detail rail used to stack up to 13 cards of equal weight, so the
  rarely used ones cost the same height as the ones read constantly. The rail is
  now three cards (Summary / Actions / Related and flow) whose sections can be
  collapsed, and the collapsed state survives a reload per user. (The CSAT form
  left the rail entirely: it is a bar across the ticket.)

  This module is the pure part: which sections exist, what their default state is
  and how the stored overrides are parsed. Only *overrides* are stored, so a
  later change to a default applies to everyone who never toggled that section.
*/

export const detailSectionKeys = [
  // Summary (always open in the UI, listed for a stable order).
  "sla",
  "properties",
  "formData",
  // Actions. (CSAT is not a section: it is the bar across the ticket.)
  "playbook",
  "approvals",
  // Related and flow.
  "merged",
  "assets",
  "problems",
  "links",
  "incidents",
  "forward",
  "participants",
] as const;

export type DetailSectionKey = (typeof detailSectionKeys)[number];
export type DetailSectionOverrides = Partial<Record<DetailSectionKey, boolean>>;

/** `localStorage` key (neutral `service-desk.*` prefix, Paket 4.1). */
export const detailSectionsStorageKey = "service-desk.ticketDetail.sections";

/*
  Open by default: the sections an agent reads on almost every ticket, plus the
  ones that only exist when they carry content (merged, assets, forward). The
  three purely supplementary ones start collapsed: form data (read when the
  ticket is created), problem links and related tickets.
*/
export const detailSectionDefaults: Readonly<Record<DetailSectionKey, boolean>> = {
  sla: true,
  properties: true,
  formData: false,
  playbook: true,
  approvals: true,
  merged: true,
  assets: true,
  problems: false,
  links: false,
  incidents: true,
  forward: true,
  participants: true,
};

/** Summary sections are the page itself; they are never hidden behind a toggle. */
export const staticDetailSectionKeys: ReadonlySet<DetailSectionKey> = new Set([
  "sla",
  "properties",
]);

export function isDetailSectionCollapsible(key: DetailSectionKey): boolean {
  return !staticDetailSectionKeys.has(key);
}

export function sectionOpen(
  key: DetailSectionKey,
  overrides: DetailSectionOverrides,
  defaultOpen: boolean = detailSectionDefaults[key],
): boolean {
  return overrides[key] ?? defaultOpen;
}

export function allSectionsOpen(
  keys: readonly DetailSectionKey[],
  overrides: DetailSectionOverrides,
): boolean {
  return keys.every((key) => sectionOpen(key, overrides));
}

/** One override per *collapsible* section — the static ones cannot be toggled. */
export function overridesForAll(
  keys: readonly DetailSectionKey[],
  open: boolean,
): DetailSectionOverrides {
  return Object.fromEntries(
    keys.filter((key) => isDetailSectionCollapsible(key)).map((key) => [key, open]),
  ) as DetailSectionOverrides;
}

/** Tolerant parse: unknown keys and non-boolean values are dropped, never thrown. */
export function parseDetailSectionOverrides(raw: string | null): DetailSectionOverrides {
  if (raw === null || raw.trim() === "") {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const overrides: DetailSectionOverrides = {};
  for (const key of detailSectionKeys) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "boolean") {
      overrides[key] = value;
    }
  }
  return overrides;
}

export function serializeDetailSectionOverrides(overrides: DetailSectionOverrides): string {
  return JSON.stringify(overrides);
}
