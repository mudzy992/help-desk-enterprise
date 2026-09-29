import { createContext, useContext, useEffect, useRef } from "react";
import type { ShortcutId } from "./catalog";

export type ShortcutHandler = () => void;

export interface ShortcutsRegistry {
  /** Registers a handler (null = listed in help, handled by the component). Returns the unregister function. */
  register(id: ShortcutId, handler: { current: ShortcutHandler | null }): () => void;
  readonly singleKeysEnabled: boolean;
  openHelp(): void;
}

export const ShortcutsContext = createContext<ShortcutsRegistry | null>(null);

/**
 * Binds a catalogue shortcut to a handler while the component is mounted.
 * Pass the same handler the visible button uses, so the shortcut can never
 * do more than the button (permissions, disabled state, confirmations).
 * `active: false` removes it (e.g. the action is not available for this user).
 */
export function useShortcut(id: ShortcutId, handler: ShortcutHandler | null, active = true): void {
  const registry = useContext(ShortcutsContext);
  const handlerRef = useRef<ShortcutHandler | null>(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (registry === null || !active) {
      return;
    }
    return registry.register(id, handlerRef);
  }, [registry, id, active]);
}

export function useShortcutsRegistry(): ShortcutsRegistry | null {
  return useContext(ShortcutsContext);
}
