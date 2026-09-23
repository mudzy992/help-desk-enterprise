import { Command, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Kbd } from "@/components/ui/kbd";

/*
  The topbar no longer hosts a second search box — it hosts the door to the
  command palette. Same data sources, one search surface (⌘K / Ctrl+K or `/`).
*/

interface HeaderSearchTriggerProperties {
  readonly onOpen: () => void;
}

export function HeaderSearchTrigger({ onOpen }: HeaderSearchTriggerProperties) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("palette.open")}
      className="group flex h-9 w-full max-w-md min-w-0 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary/70"
    >
      <Search
        size={14.5}
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
        {t("shell.searchTrigger")}
        <span className="hidden sm:inline"> {t("palette.scope")}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 sm:flex">
        <Kbd>
          <Command size={10} aria-hidden="true" />
        </Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
