import { cn } from "@/lib/utils";

interface PanelSkeletonProperties {
  readonly label: string;
  readonly className?: string;
}

export function PanelSkeleton({ label, className }: PanelSkeletonProperties) {
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border border-border bg-surface p-4",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="h-3 w-32 rounded-md bg-elevated" />
      <div className="mt-3 h-10 rounded-md bg-elevated/80" />
      <div className="mt-2 h-10 rounded-md bg-elevated/60" />
      <div className="mt-2 h-10 rounded-md bg-elevated/40" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
