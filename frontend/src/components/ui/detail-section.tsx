import { ChevronRight } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";
import {
  detailSectionDefaults,
  isDetailSectionCollapsible,
  type DetailSectionKey,
  type DetailSectionOverrides,
} from "@/lib/tickets/detail-sections";
import { cn } from "@/lib/utils";

/*
  Paket 4.2 (dio B) — the collapsible section primitive used inside the ticket
  detail rail cards.

  The rail owns the state (one store for all sections, persisted per user); the
  panels only render their body through `DetailSection`, so the previous
  Card/CardHeader in each panel is gone — the section header is the toggle and
  the body is the content. `DetailSectionsProvider` is required; without it the
  fallback store keeps every section open so a panel rendered stand-alone still
  shows its full content.
*/

export interface DetailSectionsStore {
  readonly overrides: DetailSectionOverrides;
  readonly isOpen: (key: DetailSectionKey) => boolean;
  readonly toggle: (key: DetailSectionKey) => void;
  readonly setAll: (open: boolean) => void;
  readonly allOpen: boolean;
}

const FALLBACK_STORE: DetailSectionsStore = {
  overrides: {},
  isOpen: (key) => detailSectionDefaults[key],
  toggle: () => {},
  setAll: () => {},
  allOpen: false,
};

const DetailSectionsContext = createContext<DetailSectionsStore | null>(null);

export function DetailSectionsProvider({
  store,
  children,
}: {
  readonly store: DetailSectionsStore;
  readonly children: ReactNode;
}) {
  return <DetailSectionsContext.Provider value={store}>{children}</DetailSectionsContext.Provider>;
}

export function useDetailSections(): DetailSectionsStore {
  return useContext(DetailSectionsContext) ?? FALLBACK_STORE;
}

export function useDetailSection(key: DetailSectionKey) {
  const store = useDetailSections();
  return {
    open: store.isOpen(key),
    collapsible: isDetailSectionCollapsible(key),
    toggle: () => store.toggle(key),
  };
}

interface DetailSectionProperties {
  readonly id: DetailSectionKey;
  readonly title: ReactNode;
  /** Shown next to the title — the content is visible even while collapsed. */
  readonly count?: number;
  readonly subtitle?: ReactNode;
  /** Rendered outside the toggle button, so it can hold its own controls. */
  readonly actions?: ReactNode;
  readonly testId?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function DetailSection({
  id,
  title,
  count,
  subtitle,
  actions,
  testId,
  className,
  children,
}: DetailSectionProperties) {
  const { open, collapsible, toggle } = useDetailSection(id);
  const bodyId = useId();
  const label = (
    <>
      <span className="truncate text-[12.5px] font-semibold text-foreground">{title}</span>
      {count === undefined ? null : (
        <span className="tnum shrink-0 text-[11px] text-muted-foreground">{count}</span>
      )}
      {subtitle === undefined || subtitle === null ? null : (
        <span className="truncate text-[11.5px] font-normal text-muted-foreground">{subtitle}</span>
      )}
    </>
  );

  return (
    <section
      className={cn("border-t border-border/60 first:border-t-0", className)}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-3">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-90",
              )}
            />
            {label}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-baseline gap-2">{label}</div>
        )}
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </div>
      <div id={bodyId} hidden={collapsible && !open} className="px-4 pb-4 pt-1.5">
        {children}
      </div>
    </section>
  );
}
