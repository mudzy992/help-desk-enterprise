import { Plus, Timer, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SlaAdminSelectorCardProperties {
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly metaIcon: LucideIcon;
  readonly metaLabel: string;
  readonly badgeLabel: string;
  readonly badgeTone: BadgeTone;
}

export function SlaAdminSelectorCard({
  isSelected,
  onSelect,
  code,
  title,
  description,
  metaIcon: MetaIcon,
  metaLabel,
  badgeLabel,
  badgeTone,
}: SlaAdminSelectorCardProperties) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
        isSelected
          ? "border-primary/50 bg-primary/8"
          : "border-border bg-surface hover:border-line-strong hover:bg-surface-hover",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-[12.5px] font-bold tracking-wide text-link">{code}</span>
        <Badge tone={badgeTone} dot={false}>
          {badgeLabel}
        </Badge>
      </div>
      <p className="mt-0.5 text-[13px] font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-[18px] text-muted-foreground">{description}</p>
      ) : null}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <MetaIcon size={11.5} />
        {metaLabel}
      </p>
    </button>
  );
}

interface SlaAdminNewItemButtonProperties {
  readonly label: string;
  readonly onClick: () => void;
}

export function SlaAdminNewItemButton({ label, onClick }: SlaAdminNewItemButtonProperties) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-3 text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
    >
      <Plus size={13} />
      {label}
    </button>
  );
}

interface SlaAdminListColumnProperties {
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly loadingLabel: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly newLabel: string;
  readonly onNew: () => void;
  readonly showNew?: boolean;
  readonly children: ReactNode;
}

export function SlaAdminListColumn({
  isLoading,
  isEmpty,
  loadingLabel,
  emptyTitle,
  emptyBody,
  newLabel,
  onNew,
  showNew = true,
  children,
}: SlaAdminListColumnProperties) {
  return (
    <div className="fade-in space-y-2.5">
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={loadingLabel} />
      ) : isEmpty ? (
        <EmptyState icon={<Timer size={18} />} title={emptyTitle} body={emptyBody} />
      ) : (
        children
      )}
      {showNew ? <SlaAdminNewItemButton label={newLabel} onClick={onNew} /> : null}
    </div>
  );
}
