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
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-[#7FA8F5]"
          : "border-border bg-surface text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
    >
      {label}
      <span className="tnum text-[10.5px] opacity-70">{count}</span>
    </button>
  );
}
