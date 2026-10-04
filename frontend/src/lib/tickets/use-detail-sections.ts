import { useCallback, useEffect, useMemo, useState } from "react";
import {
  detailSectionKeys,
  detailSectionsStorageKey,
  overridesForAll,
  parseDetailSectionOverrides,
  serializeDetailSectionOverrides,
  sectionOpen,
  type DetailSectionKey,
  type DetailSectionOverrides,
} from "@/lib/tickets/detail-sections";

function readStored(): DetailSectionOverrides {
  try {
    return parseDetailSectionOverrides(window.localStorage.getItem(detailSectionsStorageKey));
  } catch {
    return {};
  }
}

function writeStored(overrides: DetailSectionOverrides): void {
  try {
    window.localStorage.setItem(
      detailSectionsStorageKey,
      serializeDetailSectionOverrides(overrides),
    );
  } catch {
    /* private mode / storage disabled — the choice simply does not persist */
  }
}

/**
 * Collapsed/expanded state of the ticket detail sections, shared by one ticket
 * page and kept per user in `localStorage` (like the theme). Only sections the
 * user actually toggled (or the "expand/collapse all" control) are stored, so a
 * later change of the defaults applies to everyone who never touched a section.
 *
 * `computedDefaults` carries the data-aware defaults of this ticket — today the
 * approvals section opens itself while an approval still waits for a decision.
 * Anything the user toggled (an override) always wins over it.
 */
export function useTicketDetailSections(computedDefaults?: DetailSectionOverrides) {
  const [overrides, setOverrides] = useState<DetailSectionOverrides>(() => readStored());

  useEffect(() => {
    writeStored(overrides);
  }, [overrides]);

  const isOpen = useCallback(
    (key: DetailSectionKey) =>
      sectionOpen(key, overrides, computedDefaults?.[key] ?? undefined),
    [overrides, computedDefaults],
  );

  const toggle = useCallback(
    (key: DetailSectionKey) => {
      setOverrides((current) => ({
        ...current,
        [key]: !sectionOpen(key, current, computedDefaults?.[key] ?? undefined),
      }));
    },
    [computedDefaults],
  );

  const setAll = useCallback((open: boolean) => {
    setOverrides((current) => ({ ...current, ...overridesForAll(detailSectionKeys, open) }));
  }, []);

  return useMemo(
    () => ({
      overrides,
      isOpen,
      toggle,
      setAll,
      allOpen: detailSectionKeys.every((key) => isOpen(key)),
    }),
    [overrides, isOpen, toggle, setAll],
  );
}
