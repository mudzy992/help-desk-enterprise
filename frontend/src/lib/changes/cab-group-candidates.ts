import type { ChangeCabGroupOption } from "@/services/changes-api";

/**
 * BA-changes-16: the form mirrors the server's CAB routing rule so the picker
 * only offers groups the server would accept.
 *
 * The rule is the same on both sides: the nearest level of the unit chain that
 * owns exactly one CAB group decides the routing; a level with several groups
 * (or none anywhere but several in the installation) means the requester has to
 * choose. Nothing is ordered by name - a change must never land in an approval
 * body "because it came first alphabetically".
 */
export interface CabGroupChoice {
  /** Groups offered for this unit; the nearest deciding level, or all groups. */
  readonly candidates: readonly ChangeCabGroupOption[];
  /** Preselected id when the routing is unambiguous, otherwise `null`. */
  readonly autoSelectId: string | null;
  /** True when the requester has to pick a group themselves. */
  readonly selectionRequired: boolean;
}

/** `/a/b/c` -> [`/a/b/c`, `/a/b`, `/a`]: the unit and its ancestors, nearest first. */
export function ancestorPaths(path: string): readonly string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments.map((_, index) => `/${segments.slice(0, segments.length - index).join("/")}`);
}

export function cabGroupChoiceForUnit(
  groups: readonly ChangeCabGroupOption[],
  unitPath: string,
): CabGroupChoice {
  for (const path of ancestorPaths(unitPath)) {
    const level = groups.filter((group) => group.organizationalUnitPath === path);
    if (level.length === 1) {
      return { candidates: level, autoSelectId: level[0].id, selectionRequired: false };
    }
    if (level.length > 1) {
      return { candidates: level, autoSelectId: null, selectionRequired: true };
    }
  }
  if (groups.length === 1) {
    return { candidates: groups, autoSelectId: groups[0].id, selectionRequired: false };
  }
  return { candidates: groups, autoSelectId: null, selectionRequired: groups.length > 0 };
}
