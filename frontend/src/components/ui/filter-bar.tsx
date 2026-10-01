import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

type FilterBarProperties = {
  /** Accessible name of the search landmark. */
  readonly label: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchMaxLength?: number;
  /** Advanced filters that differ from their default (shown on the toggle). */
  readonly activeCount: number;
  /** Shown while any filter (search included) is applied. */
  readonly onReset?: () => void;
  readonly resetLabel?: string;
  /** Right-aligned actions on the search row (export, "New ..."). */
  readonly actions?: ReactNode;
  /** The advanced filters, usually `FilterField`s. */
  readonly children: ReactNode;
};

/**
 * Search row with an "Advanced search" toggle (UX rule 2026-10-01): when a list
 * has a search and more than one filter, the filters live in a collapsible
 * panel instead of taking half of the screen. The panel opens by itself when
 * filters are already applied (deep link, back navigation), so nothing that
 * narrows the list is ever hidden without a visible count.
 */
export function FilterBar({
  label,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  searchMaxLength = 120,
  activeCount,
  onReset,
  resetLabel,
  actions,
  children,
}: FilterBarProperties) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(activeCount > 0);
  const hasAny = activeCount > 0 || searchValue.trim() !== "";

  return (
    <div className="grid gap-2" role="search" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            className={`${controlCompactClassName} w-full pl-8`}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            value={searchValue}
            maxLength={searchMaxLength}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Button variant={open || activeCount > 0 ? "secondary" : "outline"} size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
          <SlidersHorizontal aria-hidden="true" />
          {t("ui.filters.advanced")}
          {activeCount > 0 ? (
            <span className="tnum ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground">
              <span aria-hidden="true">{activeCount}</span>
              <span className="sr-only">{t("ui.filters.activeCount", { count: activeCount })}</span>
            </span>
          ) : null}
        </Button>
        {hasAny && onReset ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            {resetLabel ?? t("ui.filters.reset")}
          </Button>
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
      </div>
      <div
        id={panelId}
        role="group"
        aria-label={t("ui.filters.advanced")}
        hidden={!open}
        className={cn("rounded-lg border border-border bg-surface p-3", open ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : undefined)}
      >
        {children}
      </div>
    </div>
  );
}

/** A labelled control inside the advanced panel; the label is visible. */
export function FilterField({ label, children, className }: { readonly label: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <label className={cn("grid min-w-0 gap-1 text-[12px] font-medium text-muted-foreground", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Checkbox-style filters grouped in one cell, aligned with the labelled selects. */
export function FilterToggles({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-1">
      <legend className="mb-1 text-[12px] font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
    </fieldset>
  );
}
