import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { countOrganizationalUnitMembers } from "@/lib/directory/count-organizational-unit-members";
import { resolveOrganizationalUnitTypeIcon } from "@/lib/directory/organizational-unit-types";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { cn } from "@/lib/utils";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export interface OrganizationalUnitTreeItemProperties {
  readonly node: OrganizationalUnitTreeNode;
  readonly users: readonly DirectoryUser[];
  readonly depth: number;
  readonly selectedId: string | null;
  readonly onSelect: (node: OrganizationalUnitTreeNode) => void;
  readonly canManage?: boolean;
  readonly onEdit?: (node: OrganizationalUnitTreeNode) => void;
  readonly onDelete?: (node: OrganizationalUnitTreeNode) => void;
}

export function OrganizationalUnitTreeItem({
  node,
  users,
  depth,
  selectedId,
  onSelect,
  canManage = false,
  onEdit,
  onDelete,
}: OrganizationalUnitTreeItemProperties) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const selected = selectedId === node.id;
  const memberCount = countOrganizationalUnitMembers(users, node.id);
  const TypeIcon = resolveOrganizationalUnitTypeIcon(node.type);

  const selectNode = () => onSelect(node);
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode();
    }
  };

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-selected={selected}
    >
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 focus-visible:outline-offset-[-2px]",
          selected && "bg-elevated/50",
        )}
        style={{ paddingLeft: `${8 + depth * 22}px` }}
        tabIndex={0}
        onClick={selectNode}
        onKeyDown={onRowKeyDown}
      >
        {hasChildren ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
            aria-label={
              collapsed
                ? t("directory.expandUnit")
                : t("directory.collapseUnit")
            }
            onClick={(event) => {
              event.stopPropagation();
              setCollapsed((value) => !value);
            }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="w-[17px]" />
        )}
        <TypeIcon
          size={14}
          className={cn(
            "shrink-0",
            depth === 0 ? "text-link" : "text-muted-foreground/70",
          )}
          aria-label={
            node.type
              ? t(`directory.ouType.${node.type}`, { defaultValue: node.type })
              : t("directory.ouTypePlaceholder")
          }
        />
        <span
          className={cn(
            "text-[12.5px]",
            depth === 0
              ? "font-semibold text-foreground"
              : "text-foreground/90",
          )}
        >
          {node.name}
        </span>
        {node.type ? (
          <span className="rounded border border-border/70 bg-elevated/50 px-1.5 py-0 text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground">
            {t(`directory.ouType.${node.type}`, { defaultValue: node.type })}
          </span>
        ) : null}
        <span className="tnum rounded border border-border bg-elevated/60 px-1.5 py-0 text-[10px] text-muted-foreground">
          {t("directory.memberCountShort", { count: memberCount })}
        </span>
        <span className="tnum hidden max-w-[46ch] flex-1 truncate text-right font-mono text-[10.5px] text-muted-foreground/50 group-hover:text-muted-foreground/80 lg:block">
          {node.ouPath}
        </span>
        {canManage ? (
          <div className="relative">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
              aria-label={t("directory.ouActions")}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((value) => !value);
              }}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-10 mt-1 min-w-[120px] rounded-lg border border-border bg-surface py-1 shadow-pop">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    onEdit?.(node);
                  }}
                >
                  {t("directory.ouEdit")}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-danger transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    onDelete?.(node);
                  }}
                >
                  {t("directory.ouDelete")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {!collapsed && hasChildren ? (
        <ul role="group">
          {node.children.map((child) => (
            <OrganizationalUnitTreeItem
              key={child.id}
              node={child}
              users={users}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              canManage={canManage}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
