/** Mirrors backend `assetLimits.locationDepthMax` (§7). */
export const assetLocationDepthMax = 6;

export type LocationTreeRow<
  T extends { readonly id: string; readonly parentId: string | null; readonly name: string },
> = {
  readonly location: T;
  readonly depth: number;
  readonly path: string;
};

/** Depth-first rows (parents before children, siblings in input order) with full paths. */
export function flattenLocationTree<
  T extends { readonly id: string; readonly parentId: string | null; readonly name: string },
>(locations: readonly T[]): LocationTreeRow<T>[] {
  const ids = new Set(locations.map((location) => location.id));
  const children = new Map<string | null, T[]>();
  for (const location of locations) {
    const key = location.parentId !== null && ids.has(location.parentId) ? location.parentId : null;
    children.set(key, [...(children.get(key) ?? []), location]);
  }
  const rows: LocationTreeRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const location of children.get(parentId) ?? []) {
      if (seen.has(location.id)) continue;
      seen.add(location.id);
      const path = prefix ? `${prefix} › ${location.name}` : location.name;
      rows.push({ location, depth, path });
      visit(location.id, depth + 1, path);
    }
  };
  visit(null, 1, "");
  return rows;
}

/** Ids of the location and everything below it. */
export function locationSubtree(
  locations: readonly { readonly id: string; readonly parentId: string | null }[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const location of locations) {
      if (location.parentId !== null && result.has(location.parentId) && !result.has(location.id)) {
        result.add(location.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Levels below the location (0 for a leaf). */
export function locationHeight<
  T extends { readonly id: string; readonly parentId: string | null; readonly name: string },
>(locations: readonly T[], id: string): number {
  const rows = flattenLocationTree(locations);
  const own = rows.find((row) => row.location.id === id);
  if (own === undefined) return 0;
  const subtree = locationSubtree(locations, id);
  return Math.max(
    0,
    ...rows.filter((row) => subtree.has(row.location.id)).map((row) => row.depth - own.depth),
  );
}
