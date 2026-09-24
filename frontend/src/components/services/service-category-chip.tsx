import { cn } from "@/lib/utils";

interface ServiceCategoryChipProperties {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
}

export function ServiceCategoryChip({
  label,
  count,
  active,
  onClick,
}: ServiceCategoryChipProperties) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
        active
          ? "border-primary/50 bg-primary/15 text-link"
          : "border-border bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {label}
      <span className="tnum text-[10.5px] opacity-70">{count}</span>
    </button>
  );
}
