import { cn } from "@/lib/utils";

/*
  Pulse brand mark: a "volt" spark on the brand gradient. Used by the sidebar,
  the sign-in page and the install wizard so the product reads the same
  everywhere. The gradient lives in `index.css` (`.pulse-gradient`) because it
  is decorative — never a semantic surface.
*/

interface BrandMarkProperties {
  readonly size?: number;
  readonly className?: string;
}

export function BrandMark({ size = 32, className }: BrandMarkProperties) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[11px] pulse-gradient shadow-glow",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size * 0.62}
        height={size * 0.62}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M18.6 3.2 8.4 18.1h5.9L13.1 28.8 23.6 13.6h-6.1l1.1-10.4Z"
          fill="white"
          fillOpacity="0.98"
        />
      </svg>
    </span>
  );
}

interface BrandLockupProperties {
  readonly compact?: boolean;
  readonly titleClassName?: string;
  readonly subtitle?: string;
}

export function BrandLockup({
  compact = false,
  titleClassName,
  subtitle,
}: BrandLockupProperties) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      {compact ? null : (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              "truncate text-[14px] font-semibold tracking-[-0.02em] text-foreground",
              titleClassName,
            )}
          >
            EP<span className="text-primary">·</span>HelpDesk
          </p>
          {subtitle ? (
            <p className="truncate text-[10.5px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
