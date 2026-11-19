import { useEffect, useState } from "react";
import {
  emptyHeaderSearchGroups,
  searchHeaderSources,
  type HeaderSearchGroups,
} from "@/components/layout/header-search-match";

export const commandPaletteSearchDelayMs = 250;
export const commandPaletteMinimumRemoteQueryLength = 2;

/**
 * W7.56 (BA-search-02): the server normalizes `q` before it validates it and
 * counts characters, not UTF-16 units. The palette applies the same rule
 * locally (kept in sync with `backend/src/modules/search/normalize-search-query.ts`),
 * so a query the API would refuse — padding, zero-width padding, a single
 * emoji — never costs a request.
 */
const commandPaletteFormatCharacters = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const commandPaletteControlCharacters = /\p{Cc}/gu;

export function normalizeCommandPaletteQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(commandPaletteFormatCharacters, "")
    .replace(commandPaletteControlCharacters, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function countCommandPaletteQueryCharacters(query: string): number {
  return [...query].length;
}

export function useCommandPaletteSearch(
  open: boolean,
  query: string,
): {
  readonly groups: HeaderSearchGroups;
  readonly isSearching: boolean;
} {
  const [groups, setGroups] = useState<HeaderSearchGroups>(emptyHeaderSearchGroups);
  const [isSearching, setIsSearching] = useState(false);
  const normalizedQuery = normalizeCommandPaletteQuery(query);

  useEffect(() => {
    if (
      !open ||
      countCommandPaletteQueryCharacters(normalizedQuery) < commandPaletteMinimumRemoteQueryLength
    ) {
      setGroups(emptyHeaderSearchGroups);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const handle = window.setTimeout(() => {
      void searchHeaderSources(normalizedQuery, controller.signal).then(
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
  }, [open, normalizedQuery]);

  return { groups, isSearching };
}
