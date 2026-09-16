import { OrganizationalUnitTreeItem } from "@/components/organizational-units/organizational-unit-tree-item";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

interface OrganizationalUnitTreeProperties {
  readonly nodes: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly depth?: number;
  readonly selectedId: string | null;
  readonly onSelect: (node: OrganizationalUnitTreeNode) => void;
  readonly canManage?: boolean;
  readonly onEdit?: (node: OrganizationalUnitTreeNode) => void;
  readonly onDelete?: (node: OrganizationalUnitTreeNode) => void;
}

export function OrganizationalUnitTree({
  nodes,
  users,
  depth = 0,
  selectedId,
  onSelect,
  canManage = false,
  onEdit,
  onDelete,
}: OrganizationalUnitTreeProperties) {
  return (
    <ul className="p-2" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => (
        <OrganizationalUnitTreeItem
          key={node.id}
          node={node}
          users={users}
          depth={depth}
          selectedId={selectedId}
          onSelect={onSelect}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
