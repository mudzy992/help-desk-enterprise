/**
 * Paket 3.2 (§7): location tree helpers. Locations form a tree up to
 * `assetLimits.locationDepthMax` levels (e.g. Direkcija › ED Zenica › Visoko).
 * The table is small (hundreds of rows), so callers load it whole.
 */
export type LocationNode = { readonly id: string; readonly name: string; readonly parentId: string | null };

export const locationPathSeparator = ' › ';

/** id -> "Root › Child › Leaf"; broken or cyclic chains stop safely. */
export function buildLocationPaths(nodes: readonly LocationNode[]): Map<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths = new Map<string, string>();
  for (const node of nodes) {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: LocationNode | undefined = node;
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    paths.set(node.id, names.join(locationPathSeparator));
  }
  return paths;
}

/** The location itself and every location below it. */
export function locationSubtreeIds(nodes: readonly LocationNode[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

/** 1 for a top-level location; ancestors are followed until the root. */
export function locationDepth(nodes: readonly LocationNode[], id: string): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 0;
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return depth;
}

/** Levels below the node (0 for a leaf). */
export function locationHeight(nodes: readonly LocationNode[], id: string): number {
  let height = 0;
  let level = [id];
  const seen = new Set<string>([id]);
  while (level.length > 0) {
    const next = nodes.filter((node) => node.parentId !== null && level.includes(node.parentId) && !seen.has(node.id)).map((node) => node.id);
    next.forEach((value) => seen.add(value));
    if (next.length === 0) break;
    height += 1;
    level = next;
  }
  return height;
}

export type LocationMoveProblem = 'self' | 'cycle' | 'depth' | null;

/** Checks that putting `selfId` (null = new) under `parentId` keeps a valid tree. */
export function checkLocationParent(
  nodes: readonly LocationNode[],
  selfId: string | null,
  parentId: string,
  maxDepth: number,
): LocationMoveProblem {
  if (selfId !== null && parentId === selfId) return 'self';
  if (selfId !== null && locationSubtreeIds(nodes, selfId).includes(parentId)) return 'cycle';
  const height = selfId === null ? 0 : locationHeight(nodes, selfId);
  return locationDepth(nodes, parentId) + 1 + height > maxDepth ? 'depth' : null;
}
