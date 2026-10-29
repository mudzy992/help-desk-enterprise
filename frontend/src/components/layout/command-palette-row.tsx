import { BookOpen, Ticket, User as UserIcon, type LucideIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { navigationIconFor } from "@/lib/navigation-icons";
import { cn } from "@/lib/utils";
import type { HeaderSearchHit } from "@/components/layout/header-search-match";
import type { NavigationCommand } from "@/lib/command-palette/build-navigation-commands";

export type CommandPaletteRow =
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: string;
      readonly hint: string;
      readonly shortcut: string;
      readonly path: string;
      readonly icon: LucideIcon;
    }
  | {
      readonly kind: "navigation";
      readonly id: string;
      readonly command: NavigationCommand;
      readonly label: string;
    }
  | { readonly kind: "hit"; readonly id: string; readonly hit: HeaderSearchHit };

const hitIcons: Record<HeaderSearchHit["kind"], LucideIcon> = {
  ticket: Ticket,
  article: BookOpen,
  user: UserIcon,
};

export function PaletteRow({
  row,
  index,
  isActive,
  onHover,
  onSelect,
}: {
  readonly row: CommandPaletteRow;
  readonly index: number;
  readonly isActive: boolean;
  readonly onHover: (index: number) => void;
  readonly onSelect: (row: CommandPaletteRow) => void;
}) {
  const Icon =
    row.kind === "action"
      ? row.icon
      : row.kind === "hit"
        ? hitIcons[row.hit.kind]
        : navigationIconFor(row.command.path);
  const label =
    row.kind === "navigation" ? row.label : row.kind === "hit" ? row.hit.title : row.label;
  const hint = row.kind === "action" ? row.hint : row.kind === "hit" ? row.hit.subtitle : undefined;

  return (
    <button
      type="button"
      id={`palette-row-${index}`}
      role="option"
      tabIndex={-1}
      aria-selected={isActive}
      onMouseMove={() => onHover(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(row)}
      className={cn(
        "flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-colors duration-150",
        isActive ? "bg-primary/10" : "hover:bg-surface-hover",
      )}
    >
      <Icon
        size={15}
        strokeWidth={1.9}
        className={cn("shrink-0", isActive ? "text-link" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            row.kind === "hit" && row.hit.kind === "ticket" ? "tnum text-link" : "text-foreground",
          )}
        >
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-[11.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      {row.kind === "action" ? <Kbd>{row.shortcut}</Kbd> : null}
    </button>
  );
}
