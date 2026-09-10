export function wouldCreateCircularHierarchy(input: {
  readonly organizationalUnitId: string;
  readonly nextParentId: string | null;
  readonly parentIdById: ReadonlyMap<string, string | null>;
}): boolean {
  if (input.nextParentId === null) {
    return false;
  }
  let cursor: string | null = input.nextParentId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (cursor === input.organizationalUnitId || visited.has(cursor)) {
      return true;
    }
    visited.add(cursor);
    cursor = input.parentIdById.get(cursor) ?? null;
  }
  return false;
}
