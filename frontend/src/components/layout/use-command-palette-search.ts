import { useEffect, useState } from "react";
import {
  emptyHeaderSearchGroups,
  searchHeaderSources,
  type HeaderSearchGroups,
} from "@/components/layout/header-search-match";

export const commandPaletteSearchDelayMs = 250;
export const commandPaletteMinimumRemoteQueryLength = 2;

export function useCommandPaletteSearch(
  open: boolean,
  query: string,
): {
  readonly groups: HeaderSearchGroups;
  readonly isSearching: boolean;
} {
  const [groups, setGroups] = useState<HeaderSearchGroups>(emptyHeaderSearchGroups);
  const [isSearching, setIsSearching] = useState(false);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length < commandPaletteMinimumRemoteQueryLength) {
      setGroups(emptyHeaderSearchGroups);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const handle = window.setTimeout(() => {
      void searchHeaderSources(trimmedQuery, controller.signal).then(
        (nextGroups) => {
          if (controller.signal.aborted) return;
          setGroups(nextGroups);
          setIsSearching(false);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setGroups(emptyHeaderSearchGroups);
          setIsSearching(false);
        },
      );
    }, commandPaletteSearchDelayMs);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [open, trimmedQuery]);

  return { groups, isSearching };
}
