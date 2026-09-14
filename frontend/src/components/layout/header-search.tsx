import { Command, Search } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  emptyHeaderSearchGroups,
  flattenHeaderSearchHits,
  HeaderSearchResultsPanel,
  searchHeaderSources,
  type HeaderSearchGroups,
  type HeaderSearchHit,
} from "@/components/layout/header-search-match";
import { floatingPanelClassName } from "@/components/ui/control";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const searchDebounceMs = 250;

export function HeaderSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputReference = useRef<HTMLInputElement>(null);
  const rootReference = useRef<HTMLFormElement>(null);
  const requestGeneration = useRef(0);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<HeaderSearchGroups>(emptyHeaderSearchGroups);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputReference.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootReference.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      requestGeneration.current += 1;
      setGroups(emptyHeaderSearchGroups);
      setIsOpen(false);
      setIsLoading(false);
      setActiveIndex(0);
      return;
    }
    const handle = window.setTimeout(() => {
      void applySearch(trimmed);
    }, searchDebounceMs);
    return () => window.clearTimeout(handle);
  }, [query]);

  const applySearch = async (trimmed: string): Promise<HeaderSearchGroups> => {
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    setIsOpen(true);
    const next = await searchHeaderSources(trimmed);
    if (generation !== requestGeneration.current) {
      return emptyHeaderSearchGroups;
    }
    setGroups(next);
    setIsLoading(false);
    setActiveIndex(0);
    return next;
  };

  const selectHit = (hit: HeaderSearchHit) => {
    setIsOpen(false);
    navigate(hit.href);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }
    const currentHits = flattenHeaderSearchHits(groups);
    if (isOpen && currentHits.length > 0) {
      selectHit(currentHits[activeIndex] ?? currentHits[0]);
      return;
    }
    const nextHits = flattenHeaderSearchHits(await applySearch(trimmed));
    if (nextHits.length > 0) {
      selectHit(nextHits[0]);
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    const hits = flattenHeaderSearchHits(groups);
    if (hits.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
    }
  };

  const hits = flattenHeaderSearchHits(groups);

  return (
    <form
      ref={rootReference}
      className="relative min-w-0 w-full max-w-md"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Search
        size={14.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
        aria-hidden="true"
      />
      <label className="sr-only" htmlFor="global-search">
        {t("shell.searchPlaceholder")}
      </label>
      <input
        id="global-search"
        ref={inputReference}
        value={query}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="global-search-results"
        aria-activedescendant={
          isOpen && hits.length > 0 ? `global-search-hit-${activeIndex}` : undefined
        }
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder={t("shell.searchPlaceholder")}
        className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-4 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 transition-colors duration-150 hover:border-[#31405C] focus:border-primary focus:outline-none sm:pr-16"
      />
      <span className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
        <Kbd>
          <Command size={10} aria-hidden="true" />
        </Kbd>
        <Kbd>K</Kbd>
      </span>
      {isOpen ? (
        <div
          id="global-search-results"
          role="listbox"
          className={cn(floatingPanelClassName, "absolute left-0 right-0 top-[calc(100%+6px)] z-50")}
        >
          <HeaderSearchResultsPanel
            groups={groups}
            activeIndex={activeIndex}
            isLoading={isLoading}
            labels={{
              tickets: t("shell.searchGroupTickets"),
              articles: t("shell.searchGroupKnowledge"),
              users: t("shell.searchGroupUsers"),
              empty: t("shell.searchNoResults"),
            }}
            onSelect={selectHit}
          />
        </div>
      ) : null}
    </form>
  );
}
