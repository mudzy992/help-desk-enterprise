import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

interface OrganizationalUnitTreeProperties {
  readonly nodes: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly depth?: number;
}

export function OrganizationalUnitTree({
  nodes,
  users,
  depth = 0,
}: OrganizationalUnitTreeProperties) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-1" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const memberCount = users.filter(
          (user) => user.organizationalUnitId === node.id,
        ).length;
        return (
          <li key={node.id} role="treeitem" aria-expanded="true">
            <div
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-elevated/40"
              style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {node.name}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {node.ouPath}
                </p>
              </div>
              <Badge tone={memberCount > 0 ? "primary" : "neutral"}>
                {t("directory.memberCount", { count: memberCount })}
              </Badge>
            </div>
            {node.children.length > 0 ? (
              <OrganizationalUnitTree
                nodes={node.children}
                users={users}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
