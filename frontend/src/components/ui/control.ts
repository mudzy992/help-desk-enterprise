/*
  Pulse — shared control styling.

  This module is the single source of truth for ~100 components (imported by
  103 files). Every class here resolves through the theme tokens declared in
  `src/index.css`, which means restyling this one file restyles the entire
  application — in all three theme blocks — without touching a call site.

  Text that sits on a primary tint uses `text-link`, never `text-primary`:
  `--link` is the "readable brand text" token and is tuned per theme for
  contrast on tinted surfaces.
*/

export const controlClassName =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 transition-colors duration-150 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-45";

export const controlCompactClassName =
  "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 transition-colors duration-150 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-45";

export const selectClassName = `${controlClassName} cursor-pointer appearance-none pr-8`;

export const selectCompactClassName = `${controlCompactClassName} cursor-pointer appearance-none pr-7`;

export const textareaClassName =
  "min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 transition-colors duration-150 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-45";

export const labelClassName =
  "grid gap-1.5 text-[12.5px] font-medium text-foreground";

export const hintClassName = "text-[11.5px] text-muted-foreground";

export const errorTextClassName = "text-[12.5px] text-danger";

export const sectionTitleClassName =
  "text-[13.5px] font-semibold leading-5 text-foreground";

export const tableWrapClassName =
  "overflow-x-auto rounded-lg border border-border bg-surface shadow-card";

export const tableHeadClassName =
  "text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

export const tableRowClassName =
  "group border-b border-border/60 last:border-0 transition-colors duration-150 hover:bg-surface-hover [&>td]:min-h-9 [&>td]:py-2.5";

export const ticketIdClassName =
  "tnum text-[12px] font-medium text-link underline-offset-2 hover:underline group-hover:underline";

export const filterChipClassName =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150";

export const filterChipActiveClassName =
  "border-primary/45 bg-primary/15 text-link";

export const filterChipIdleClassName =
  "border-border bg-surface text-muted-foreground hover:border-line-strong hover:bg-surface-hover hover:text-foreground";

export const filterChipDangerActiveClassName =
  "border-danger/45 bg-danger/10 text-danger";

export const floatingShadowClassName = "shadow-pop";

export const floatingPanelClassName =
  `pop-in overflow-hidden rounded-lg border border-border bg-popover ${floatingShadowClassName}`;
