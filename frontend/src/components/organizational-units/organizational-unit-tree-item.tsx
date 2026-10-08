import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorTextClassName } from "@/components/ui/control";
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
  /**
   * Paket 5.3.2 (§4.3): messages raised by the rows' own actions, keyed by unit
   * id. A row renders `role="alert"` directly under itself, so the error appears
   * next to the control that caused it instead of at the card's bottom.
   */
  readonly errorsByUnitId?: ReadonlyMap<string, string>;
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
  errorsByUnitId,
}: OrganizationalUnitTreeItemProperties) {
  const { t } = useTranslation();
  const errorMessage = errorsByUnitId?.get(node.id) ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const errorId = useId();
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
        aria-describedby={errorMessage === null ? undefined : errorId}
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
            depth === 0 ? "text-link" : "text-muted-foreground",
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
        <span className="tnum hidden max-w-[46ch] flex-1 truncate text-right font-mono text-[10.5px] text-muted-foreground group-hover:text-muted-foreground lg:block">
          {node.ouPath}
        </span>
        {canManage ? (
          /* Paket 5.3.2 (D13): the row menu is a Radix dropdown, so an outside
             press, Escape and focus return are handled by the primitive
             instead of a hand-rolled popover. */
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-foreground focus-visible:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                aria-label={t("directory.ouActions")}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem
                onSelect={() => onEdit?.(node)}
                data-testid={`ou-edit-${node.id}`}
              >
                {t("directory.ouEdit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger"
                onSelect={() => onDelete?.(node)}
                data-testid={`ou-delete-${node.id}`}
              >
                {t("directory.ouDelete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {errorMessage === null ? null : (
        <p
          id={errorId}
          role="alert"
          className={cn("px-2 pb-1 pt-0.5 text-[11.5px]", errorTextClassName)}
          style={{ marginLeft: `${8 + depth * 22}px` }}
          data-testid={`ou-error-${node.id}`}
        >
          {errorMessage}
        </p>
      )}
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
              errorsByUnitId={errorsByUnitId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
