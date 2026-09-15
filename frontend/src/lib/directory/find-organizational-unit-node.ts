import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export function findOrganizationalUnitNode(
  nodes: readonly OrganizationalUnitTreeNode[],
  id: string | null,
): OrganizationalUnitTreeNode | null {
  if (id === null) {
    return null;
  }
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const nested = findOrganizationalUnitNode(node.children, id);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}
