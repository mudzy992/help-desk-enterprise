import { cn } from "@/lib/utils";

/*
  Loading is a skeleton of the layout, not a spinner. Bars use the `border`
  token so they stay visible on the light canvas as well as dark surfaces.
*/
interface PanelSkeletonProperties {
  readonly label: string;
  readonly className?: string;
}

export function PanelSkeleton({ label, className }: PanelSkeletonProperties) {
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border border-border bg-surface p-4 shadow-card",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="h-3 w-32 rounded-md bg-border/70" />
      <div className="mt-3 h-10 rounded-md bg-border/60" />
      <div className="mt-2 h-10 rounded-md bg-border/50" />
      <div className="mt-2 h-10 rounded-md bg-border/40" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
