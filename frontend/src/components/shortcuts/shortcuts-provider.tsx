import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { shortcutCatalog, type ShortcutId } from "@/lib/shortcuts/catalog";
import { createSequenceMatcher, dispatchableIds, normaliseKey, shouldIgnoreTarget } from "@/lib/shortcuts/engine";
import { ShortcutsContext, type ShortcutHandler, type ShortcutsRegistry } from "@/lib/shortcuts/shortcuts-context";
import { queryKeys } from "@/lib/query/query-keys";
import { getUserPreferences } from "@/services/user-preferences-api";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";

interface ShortcutsProviderProperties {
  /** Role default while the preference loads (on for staff, off for USER). */
  readonly defaultEnabled: boolean;
  readonly children: ReactNode;
}

function isDialogOpen(): boolean {
  return document.querySelector("[role='dialog'], [role='alertdialog']") !== null;
}

/**
 * Paket 2.8 §4.2: one keydown listener for the whole application. Components
 * bind catalogue shortcuts with `useShortcut`; this provider decides whether a
 * key may fire (preference, typing, open dialog) and dispatches to the most
 * recently mounted handler.
 */
export function ShortcutsProvider({ defaultEnabled, children }: ShortcutsProviderProperties) {
  const preferences = useQuery({
    queryKey: queryKeys.userPreferences,
    queryFn: getUserPreferences,
    staleTime: 5 * 60_000,
  });
  const singleKeysEnabled = preferences.data?.keyboardShortcutsEffective ?? defaultEnabled;
  const handlersRef = useRef(new Map<ShortcutId, { current: ShortcutHandler | null }[]>());
  const [registeredVersion, setRegisteredVersion] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const matcherRef = useRef(createSequenceMatcher(shortcutCatalog));

  const register = useCallback((id: ShortcutId, handler: { current: ShortcutHandler | null }) => {
    const list = handlersRef.current.get(id) ?? [];
    handlersRef.current.set(id, [...list, handler]);
    setRegisteredVersion((version) => version + 1);
    return () => {
      const current = handlersRef.current.get(id) ?? [];
      const next = current.filter((item) => item !== handler);
      if (next.length === 0) handlersRef.current.delete(id);
      else handlersRef.current.set(id, next);
      setRegisteredVersion((version) => version + 1);
    };
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = normaliseKey(event);
      if (key === null) return;
      const registered = new Set(handlersRef.current.keys());
      const active = dispatchableIds(shortcutCatalog, registered, {
        singleKeysEnabled,
        ignoreSingleKeys: shouldIgnoreTarget(event.target instanceof Element ? event.target : null, isDialogOpen()),
      });
      if (active.size === 0) return;
      const result = matcherRef.current.feed(key, performance.now(), active);
      if (result === null) return;
      event.preventDefault();
      if (result === "pending") return;
      const handlers = handlersRef.current.get(result) ?? [];
      handlers[handlers.length - 1]?.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [singleKeysEnabled]);

  const registry = useMemo<ShortcutsRegistry>(
    () => ({ register, singleKeysEnabled, openHelp }),
    [register, singleKeysEnabled, openHelp],
  );

  const registeredIds = useMemo(
    () => new Set(handlersRef.current.keys()),
    [registeredVersion],
  );

  return (
    <ShortcutsContext.Provider value={registry}>
      {children}
      <ShortcutsHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        registeredIds={registeredIds}
        singleKeysEnabled={singleKeysEnabled}
      />
    </ShortcutsContext.Provider>
  );
}
