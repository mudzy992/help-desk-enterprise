import type { ManualDirectoryOrganizationalUnit } from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

/**
 * Paket 5.3.2 (§4.3): a tree node and a manual-catalog entry describe the same
 * unit from two sides. Before any edit/delete request the screen has to prove
 * that the two still line up — matching only by distinguished name would let a
 * renamed or moved unit be edited under a stale path, and a unit that is not in
 * the catalog at all must not produce a request in the first place.
 */
export type CatalogEntryMatch =
  | { readonly kind: "matched"; readonly entry: ManualDirectoryOrganizationalUnit }
  | { readonly kind: "missing" }
  | {
      readonly kind: "path-mismatch";
      readonly entry: ManualDirectoryOrganizationalUnit;
      readonly treePath: string;
    };

/** Directory paths differ in case and trailing separators between sources. */
export function normalizeDirectoryPath(value: string): string {
  return value
    .trim()
    .replace(/[/\\]+$/, "")
    .toLowerCase();
}

export function matchCatalogEntry(
  entries: readonly ManualDirectoryOrganizationalUnit[],
  node: Pick<OrganizationalUnitTreeNode, "ouPath" | "distinguishedName">,
): CatalogEntryMatch {
  const treePath = normalizeDirectoryPath(node.ouPath);
  const nodeDn =
    node.distinguishedName === undefined
      ? null
      : normalizeDirectoryPath(node.distinguishedName);
  const byPath = entries.find(
    (entry) => normalizeDirectoryPath(entry.organizationalUnitPath) === treePath,
  );
  if (byPath !== undefined) {
    return { kind: "matched", entry: byPath };
  }
  const byDn =
    nodeDn === null
      ? undefined
      : entries.find(
          (entry) => normalizeDirectoryPath(entry.distinguishedName) === nodeDn,
        );
  if (byDn !== undefined) {
    return { kind: "path-mismatch", entry: byDn, treePath: node.ouPath };
  }
  return { kind: "missing" };
}
