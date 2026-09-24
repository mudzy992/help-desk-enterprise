import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BookOpen,
  CornerDownLeft,
  Plus,
  Search,
  Ticket,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  flattenHeaderSearchHits,
  searchHeaderSources,
  type HeaderSearchGroups,
  type HeaderSearchHit,
  emptyHeaderSearchGroups,
} from "@/components/layout/header-search-match";
import { Kbd } from "@/components/ui/kbd";
import {
  buildNavigationCommands,
  filterNavigationCommands,
  type NavigationCommand,
} from "@/lib/command-palette/build-navigation-commands";
import { navigationIconFor } from "@/lib/navigation-icons";
import { navigationSections } from "@/lib/navigation";
import { filterNavigationSections } from "@/lib/session/route-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { cn } from "@/lib/utils";

/*
  Pulse command palette — one overlay for "jump to a page" and "find a record".
  It replaces the inline topbar dropdown: the same data sources
  (`searchHeaderSources`) and the same navigation tree feed it, only the
  interaction is the modern one (⌘K / Ctrl+K, or `/`).

  Radix Dialog provides the focus trap, scroll lock and Escape handling; the
  arrow-key navigation over the result rows is ours.
*/

const searchDebounceMilliseconds = 250;
const minimumRemoteQueryLength = 2;

interface CommandPaletteProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

type Row =
  | { readonly kind: "action"; readonly id: string; readonly label: string; readonly hint: string; readonly shortcut: string; readonly path: string; readonly icon: LucideIcon }
  | { readonly kind: "navigation"; readonly id: string; readonly command: NavigationCommand; readonly label: string }
  | { readonly kind: "hit"; readonly id: string; readonly hit: HeaderSearchHit };

const HIT_ICONS: Record<HeaderSearchHit["kind"], LucideIcon> = {
  ticket: Ticket,
  article: BookOpen,
  user: UserIcon,
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProperties) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputReference = useRef<HTMLInputElement>(null);
  const capabilities = useSessionCapabilities();

  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<HeaderSearchGroups>(emptyHeaderSearchGroups);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleSections = useMemo(
    () => filterNavigationSections(navigationSections, capabilities),
    [capabilities],
  );

  const navigationCommands = useMemo(
    () => buildNavigationCommands(visibleSections),
    [visibleSections],
  );

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setGroups(emptyHeaderSearchGroups);
    setActiveIndex(0);
    setIsSearching(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (trimmedQuery.length < minimumRemoteQueryLength) {
      setGroups(emptyHeaderSearchGroups);
      setIsSearching(false);
      return;
    }
    let isCancelled = false;
    setIsSearching(true);
    const handle = window.setTimeout(() => {
      void searchHeaderSources(trimmedQuery).then((nextGroups) => {
        if (!isCancelled) {
          setGroups(nextGroups);
          setIsSearching(false);
        }
      });
    }, searchDebounceMilliseconds);
    return () => {
      isCancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, trimmedQuery]);

  const rows = useMemo<readonly Row[]>(() => {
    const needle = trimmedQuery.toLowerCase();

    const newTicketRow: Extract<Row, { kind: "action" }> = {
      kind: "action",
      id: "action:new-ticket",
      label: t("palette.createTicket"),
      hint: t("palette.createTicketHint"),
      shortcut: "N",
      path: "/tickets/new",
      icon: Plus,
    };

    const actions: readonly Row[] = [newTicketRow].filter(
      (row) => needle === "" || row.label.toLowerCase().includes(needle),
    );

    const navigation: readonly Row[] = filterNavigationCommands(
      navigationCommands,
      trimmedQuery,
      t,
      t,
    ).map((command) => ({
      kind: "navigation",
      id: command.id,
      command,
      label: t(command.labelKey),
    }));

    const hits: readonly Row[] = flattenHeaderSearchHits(groups).map((hit) => ({
      kind: "hit",
      id: `hit:${hit.kind}:${hit.id}`,
      hit,
    }));

    return [...actions, ...navigation, ...hits];
  }, [trimmedQuery, t, navigationCommands, groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmedQuery]);

  const goTo = (row: Row) => {
    onOpenChange(false);
    if (row.kind === "hit") {
      navigate(row.hit.href);
      return;
    }
    if (row.kind === "action") {
      navigate(row.path);
      return;
    }
    navigate(row.command.path);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (rows.length === 0 ? 0 : (index + 1) % rows.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        rows.length === 0 ? 0 : (index - 1 + rows.length) % rows.length,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, rows.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row !== undefined) {
        goTo(row);
      }
    }
  };

  const isAction = (row: Row): row is Extract<Row, { kind: "action" }> =>
    row.kind === "action";
  const isNavigation = (row: Row): row is Extract<Row, { kind: "navigation" }> =>
    row.kind === "navigation";
  const isHit = (row: Row): row is Extract<Row, { kind: "hit" }> => row.kind === "hit";

  const sections = useMemo(() => {
    const actionRows = rows.filter(isAction);
    const navigationRows = rows.filter(isNavigation);
    const hitRows = rows.filter(isHit);
    const hitsOf = (kind: HeaderSearchHit["kind"]) =>
      hitRows.filter((row) => row.hit.kind === kind);
    return [
      { key: "actions", label: t("palette.groupActions"), items: actionRows },
      { key: "navigation", label: t("palette.groupNavigation"), items: navigationRows },
      { key: "tickets", label: t("shell.searchGroupTickets"), items: hitsOf("ticket") },
      { key: "articles", label: t("shell.searchGroupKnowledge"), items: hitsOf("article") },
      { key: "users", label: t("shell.searchGroupUsers"), items: hitsOf("user") },
    ].filter((section) => section.items.length > 0);
  }, [rows, t]);

  const rowIndexOf = (row: Row) => rows.findIndex((candidate) => candidate.id === row.id);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-scrim/50 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-label={t("palette.title")}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputReference.current?.focus();
          }}
          className="fixed left-1/2 top-[12vh] z-[70] w-[calc(100vw-2rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover shadow-pop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">{t("palette.title")}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("palette.scope")}
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputReference}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("palette.placeholder")}
              role="combobox"
              aria-expanded
              aria-controls="command-palette-results"
              aria-activedescendant={rows.length > 0 ? `palette-row-${activeIndex}` : undefined}
              className="h-[52px] min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <Kbd>ESC</Kbd>
          </div>

          <div
            id="command-palette-results"
            role="listbox"
            aria-label={t("palette.title")}
            className="max-h-[52vh] overflow-y-auto p-2"
          >
            {sections.map((section) => (
              <div key={section.key} className="mb-1.5">
                <p className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {section.label}
                </p>
                <ul>
                  {section.items.map((entry) => {
                    const index = rowIndexOf(entry);
                    const isActive = index === activeIndex;
                    return (
                      <li key={entry.id}>
                        <PaletteRow
                          row={entry}
                          index={index}
                          isActive={isActive}
                          onHover={setActiveIndex}
                          onSelect={goTo}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                {isSearching
                  ? t("palette.searching")
                  : t("palette.noResults", { query: trimmedQuery })}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("palette.navigateHint")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>
                <CornerDownLeft size={9} aria-hidden="true" />
              </Kbd>
              {t("palette.selectHint")}
            </span>
            <span className="ml-auto hidden items-center gap-1.5 sm:flex">
              <Kbd>ESC</Kbd>
              {t("palette.closeHint")}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteRow({
  row,
  index,
  isActive,
  onHover,
  onSelect,
}: {
  readonly row: Row;
  readonly index: number;
  readonly isActive: boolean;
  readonly onHover: (index: number) => void;
  readonly onSelect: (row: Row) => void;
}) {
  const Icon =
    row.kind === "action"
      ? row.icon
      : row.kind === "hit"
        ? HIT_ICONS[row.hit.kind]
        : navigationIconFor(row.command.path);

  const label = row.kind === "navigation" ? row.label : row.kind === "hit" ? row.hit.title : row.label;
  const hint =
    row.kind === "action"
      ? row.hint
      : row.kind === "hit"
        ? row.hit.subtitle
        : undefined;

  return (
    <button
      type="button"
      id={`palette-row-${index}`}
      role="option"
      /* Deliberately not a tab stop: the combobox owns focus and moves the
         active option with ArrowUp/ArrowDown (`aria-activedescendant`); that
         highlighted row is what makes keyboard focus visible here. */
      tabIndex={-1}
      aria-selected={isActive}
      onMouseMove={() => onHover(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(row)}
      className={cn(
        "flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-colors duration-150",
        isActive ? "bg-primary/10" : "hover:bg-surface-hover",
      )}
    >
      <Icon
        size={15}
        strokeWidth={1.9}
        className={cn("shrink-0", isActive ? "text-link" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            row.kind === "hit" && row.hit.kind === "ticket" ? "tnum text-link" : "text-foreground",
          )}
        >
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-[11.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      {row.kind === "action" ? (
        <Kbd>{row.shortcut}</Kbd>
      ) : null}
    </button>
  );
}
