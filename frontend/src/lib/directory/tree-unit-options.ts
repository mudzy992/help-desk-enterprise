import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

/**
 * W2.36c: the create dialog used to offer the **catalogue** as the parent list,
 * which contained rows the tree had never received — the operator could pick a
 * parent that does not exist and then wonder why the child never appeared. The
 * parent list is now the real tree.
 */
export type TreeUnitOption = {
  readonly id: string;
  readonly label: string;
  readonly ouPath: string | null;
  readonly distinguishedName: string | null;
  readonly depth: number;
};

export function flattenTreeUnitOptions(
  nodes: readonly OrganizationalUnitTreeNode[],
  depth = 0,
): readonly TreeUnitOption[] {
  // Written as a loop on purpose: TypeScript crashes ("No error for last overload
  // signature") on `flatMap` whose callback mixes an object with a readonly array.
  const options: TreeUnitOption[] = [];
  for (const node of nodes) {
    options.push({
      id: node.id,
      label: node.ouPath !== undefined && node.ouPath.length > 0 ? node.ouPath : node.name,
      ouPath: node.ouPath ?? null,
      distinguishedName: node.distinguishedName ?? null,
      depth,
    });
    options.push(...flattenTreeUnitOptions(node.children, depth + 1));
  }
  return options;
}

/** Every path already present in the tree, used for the duplicate check. */
export function collectTreePaths(nodes: readonly OrganizationalUnitTreeNode[]): readonly string[] {
  return flattenTreeUnitOptions(nodes)
    .map((option) => option.ouPath)
    .filter((path): path is string => path !== null);
}

/**
 * The `DC=` part new root units are created in. The server is authoritative; this
 * only lets the dialog show the exact DN before the operator saves.
 */
export function resolveTreeNamespaceSuffix(
  nodes: readonly OrganizationalUnitTreeNode[],
): string | null {
  const withName = flattenTreeUnitOptions(nodes).find(
    (option) => typeof option.distinguishedName === "string" && option.distinguishedName.length > 0,
  );
  const distinguishedName = withName?.distinguishedName ?? null;
  if (distinguishedName === null) {
    return null;
  }
  const commaIndex = distinguishedName.indexOf(",");
  return commaIndex === -1 ? null : distinguishedName.slice(commaIndex + 1);
}
