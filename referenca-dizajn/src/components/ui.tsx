import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";
import { hashCode, initials, type Tone } from "../lib/core";
import { Inbox } from "lucide-react";

/* ---------------------------------------------------------------- */
/* Badge — tonske mape s cijelim klasama (Tailwind vidi literale)    */
/* ---------------------------------------------------------------- */

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-elevated/70 text-muted border-border",
  primary: "bg-primary/15 text-[#7FA8F5] border-primary/35",
  accent: "bg-accent/10 text-accent border-accent/30",
  success: "bg-success/10 text-[#4ADE80] border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/35",
  info: "bg-info/10 text-info border-info/30",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        BADGE_TONES[tone],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function MetaBadge({ meta, className, dot = true }: { meta: { label: string; tone: Tone }; className?: string; dot?: boolean }) {
  return (
    <Badge tone={meta.tone} className={className} dot={dot}>
      {meta.label}
    </Badge>
  );
}

/* ---------------------------------------------------------------- */
/* Dugmad                                                            */
/* ---------------------------------------------------------------- */

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "subtle";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-[#1D4FD8] active:bg-[#1B44BE] border border-primary shadow-none",
  outline:
    "border border-border bg-surface text-text hover:bg-elevated hover:border-[#31405C] active:bg-elevated",
  ghost: "text-muted hover:text-text hover:bg-elevated border border-transparent",
  subtle:
    "border border-border/70 bg-elevated/60 text-text hover:bg-elevated hover:border-border",
  danger:
    "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20 active:bg-danger/25",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "xs" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 select-none",
        "focus-visible:outline-2 focus-visible:outline-primary/70 disabled:opacity-45 disabled:pointer-events-none",
        size === "xs" && "h-6.5 px-2 text-[11.5px]",
        size === "sm" && "h-8 px-2.5 text-[12.5px]",
        size === "md" && "h-9 px-3.5 text-[13px]",
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Kartice i okviri                                                  */
/* ---------------------------------------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-border/70", className)}>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-text leading-5">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted leading-4">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Avatar — diskretne nijanse, inicijali                             */
/* ---------------------------------------------------------------- */

const AVATAR_HUES = [
  "bg-[#22355C] text-[#9DBCF5]",
  "bg-[#1D3A34] text-[#8AD8C2]",
  "bg-[#3A2D1D] text-[#E4BE8A]",
  "bg-[#2D2A4A] text-[#B6ADF0]",
  "bg-[#3A2430] text-[#E8A7BC]",
  "bg-[#26383E] text-[#93D3E4]",
];

export function Avatar({ name, size = "md", className }: { name: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none",
        AVATAR_HUES[hashCode(name) % AVATAR_HUES.length],
        size === "xs" && "size-5 text-[9px]",
        size === "sm" && "size-6.5 text-[10.5px]",
        size === "md" && "size-8 text-[12px]",
        size === "lg" && "size-10 text-[14px]",
        className
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Forme                                                             */
/* ---------------------------------------------------------------- */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background/60 px-3 text-[13px] text-text placeholder:text-muted/60",
        "transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-[13px] text-text placeholder:text-muted/60",
        "transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full appearance-none rounded-md border border-border bg-background/60 px-3 pr-8 text-[13px] text-text",
        "transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-text">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-muted/80">{hint}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- */
/* Tabs (podvlaka)                                                   */
/* ---------------------------------------------------------------- */

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: { key: string; label: ReactNode; count?: number }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-border/70 overflow-x-auto", className)}>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            "relative flex items-center gap-1.5 whitespace-nowrap px-3 h-9.5 text-[12.5px] font-medium transition-colors rounded-t-md",
            active === it.key ? "text-text" : "text-muted hover:text-text"
          )}
        >
          {it.label}
          {typeof it.count === "number" && (
            <span
              className={cn(
                "rounded-md border px-1 py-0 text-[10.5px] tnum leading-3.5",
                active === it.key ? "border-primary/40 bg-primary/15 text-[#7FA8F5]" : "border-border bg-elevated/70 text-muted"
              )}
            >
              {it.count}
            </span>
          )}
          {active === it.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Progress (SLA tajmeri)                                            */
/* ---------------------------------------------------------------- */

const PROGRESS_TONES: Record<Tone, string> = {
  neutral: "bg-muted",
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Progress({ value, tone = "primary", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border/60", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", PROGRESS_TONES[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Toggle                                                            */
/* ---------------------------------------------------------------- */

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
        checked ? "bg-primary border-primary" : "bg-elevated border-border",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 size-3.5 rounded-full bg-white transition-all duration-200",
          checked ? "left-[18px]" : "left-[3px]"
        )}
      />
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Page header                                                       */
/* ---------------------------------------------------------------- */

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: {
  crumbs: string[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <nav className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-muted/80">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">/</span>}
            <span className={i === crumbs.length - 1 ? "text-muted" : ""}>{c}</span>
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-text leading-6">{title}</h1>
          {subtitle && <p className="mt-1 text-[12.5px] text-muted max-w-2xl leading-5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* KPI stat kartica                                                  */
/* ---------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: Tone;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="px-4 py-3.5 hover:border-[#31405C] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted">{label}</span>
        {icon && <span className="text-muted/60">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[24px] font-semibold tracking-tight text-text tnum leading-7">{value}</span>
        {delta && (
          <span
            className={cn(
              "text-[11.5px] font-medium tnum",
              deltaTone === "success" && "text-[#4ADE80]",
              deltaTone === "danger" && "text-danger",
              deltaTone === "warning" && "text-warning",
              deltaTone === "neutral" && "text-muted",
              deltaTone === "info" && "text-info",
              deltaTone === "primary" && "text-[#7FA8F5]",
              deltaTone === "accent" && "text-accent"
            )}
          >
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-[11.5px] text-muted/80 leading-4">{hint}</p>}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Empty state + Kbd                                                 */
/* ---------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-elevated/60 text-muted">
        {icon ?? <Inbox size={18} strokeWidth={1.8} />}
      </div>
      <p className="text-[13px] font-medium text-text">{title}</p>
      {body && <p className="max-w-sm text-[12px] text-muted leading-5">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-elevated px-1 text-[10.5px] font-medium text-muted tnum">
      {children}
    </kbd>
  );
}
