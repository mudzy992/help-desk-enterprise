import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { pulseToneStyles } from "@/components/ui/tone-styles";
import type { BadgeTone } from "@/lib/ui/presentation-types";
import { cn } from "@/lib/utils";

export type { BadgeTone } from "@/lib/ui/presentation-types";

// Extends the standard span props so callers can attach `data-testid` and
// other DOM attributes; Badge previously swallowed them silently, which broke
// every test hook passed to it (e.g. the catalog onboarding progress chip).
type BadgeProperties = ComponentPropsWithoutRef<"span"> & {
  readonly tone?: BadgeTone;
  readonly dot?: boolean;
  readonly children: ReactNode;
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProperties) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        pulseToneStyles[tone].badge,
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span data-status-dot="" aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

export type MetaBadgeMeta = {
  readonly label: string;
  readonly tone: BadgeTone;
};

interface MetaBadgeProperties {
  readonly meta: MetaBadgeMeta;
  readonly className?: string;
  readonly dot?: boolean;
}

export function MetaBadge({ meta, className, dot = true }: MetaBadgeProperties) {
  return (
    <Badge tone={meta.tone} className={className} dot={dot}>
      {meta.label}
    </Badge>
  );
}
