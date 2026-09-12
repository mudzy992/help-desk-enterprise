export const controlClassName =
  "h-9 w-full rounded-md border border-border bg-background/60 px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-colors duration-150 hover:border-[#31405C] focus:border-primary focus:outline-none disabled:opacity-45";

export const controlCompactClassName =
  "h-8 w-full rounded-md border border-border bg-background/60 px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 transition-colors duration-150 hover:border-[#31405C] focus:border-primary focus:outline-none disabled:opacity-45";

export const selectClassName = `${controlClassName} cursor-pointer appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8`;

export const selectCompactClassName = `${controlCompactClassName} cursor-pointer appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7`;

export const textareaClassName =
  "min-h-[90px] w-full rounded-md border border-border bg-background/60 px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 transition-colors duration-150 hover:border-[#31405C] focus:border-primary focus:outline-none disabled:opacity-45";

export const labelClassName =
  "grid gap-1.5 text-[12.5px] font-medium text-foreground";

export const hintClassName = "text-[11.5px] text-muted-foreground";

export const errorTextClassName = "text-[12.5px] text-danger";

export const sectionTitleClassName =
  "text-[13.5px] font-semibold leading-5 text-foreground";

export const tableWrapClassName =
  "overflow-x-auto rounded-lg border border-border bg-surface";

export const tableHeadClassName =
  "text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70";

export const tableRowClassName =
  "group border-b border-border/50 last:border-0 transition-colors duration-150 hover:bg-elevated/40 [&>td]:min-h-9 [&>td]:py-2.5";

export const ticketIdClassName =
  "tnum text-[12px] font-medium text-[#7FA8F5] underline-offset-2 hover:underline group-hover:underline";

export const filterChipClassName =
  "rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors duration-150";

export const filterChipActiveClassName =
  "border-primary/50 bg-primary/15 text-[#7FA8F5]";

export const filterChipIdleClassName =
  "border-border bg-surface text-muted-foreground hover:bg-elevated hover:text-foreground";

export const filterChipDangerActiveClassName =
  "border-danger/50 bg-danger/10 text-danger";

export const floatingPanelClassName =
  "pop-in overflow-hidden rounded-lg border border-border bg-elevated shadow-xl shadow-black/40";
