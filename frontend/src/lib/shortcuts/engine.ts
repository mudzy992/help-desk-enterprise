import { isSingleKeyShortcut, type ShortcutDefinition, type ShortcutId } from "./catalog";

/**
 * Paket 2.8 §4.2: pure key handling, unit-tested without a DOM.
 *
 * - `normaliseKey` turns a keyboard event into the catalogue notation.
 * - `createSequenceMatcher` tracks multi-key sequences ("g" then "t") with a
 *   timeout and reports the matched id.
 * - `shouldIgnoreTarget` keeps single keys away from typing and from open dialogs.
 */
export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export const SEQUENCE_TIMEOUT_MS = 1_500;

export function normaliseKey(event: KeyLike): string | null {
  if (event.altKey) {
    return null;
  }
  const key = event.key;
  if (key === "Shift" || key === "Control" || key === "Meta" || key === "Alt" || key === "Dead") {
    return null;
  }
  const named = key === "Enter" ? "enter" : key === "Escape" ? "escape" : null;
  const base = named ?? (key.length === 1 ? key.toLowerCase() : null);
  if (base === null) {
    return null;
  }
  if (event.ctrlKey || event.metaKey) {
    return `mod+${base}`;
  }
  // Shift+letter is not a single-letter shortcut (Shift+N must not open a ticket).
  if (event.shiftKey && /^[a-z]$/.test(base)) {
    return `shift+${base}`;
  }
  return base;
}

export interface SequenceMatcher {
  /**
   * Feeds one normalised key. Returns the matched id, "pending" while a
   * sequence prefix is open, or null.
   */
  feed(key: string, now: number, active: ReadonlySet<ShortcutId>): ShortcutId | "pending" | null;
  reset(): void;
}

export function createSequenceMatcher(
  catalog: readonly ShortcutDefinition[],
  timeoutMs = SEQUENCE_TIMEOUT_MS,
): SequenceMatcher {
  let buffer: string[] = [];
  let lastAt = 0;

  const match = (candidate: readonly string[], active: ReadonlySet<ShortcutId>) => {
    let prefix = false;
    for (const definition of catalog) {
      if (!active.has(definition.id)) continue;
      const sequence = definition.sequence;
      if (sequence.length < candidate.length) continue;
      const same = candidate.every((step, index) => sequence[index] === step);
      if (!same) continue;
      if (sequence.length === candidate.length) return definition.id;
      prefix = true;
    }
    return prefix ? ("pending" as const) : null;
  };

  return {
    feed(key, now, active) {
      if (buffer.length > 0 && now - lastAt > timeoutMs) {
        buffer = [];
      }
      lastAt = now;
      const extended = match([...buffer, key], active);
      if (extended === "pending") {
        buffer = [...buffer, key];
        return "pending";
      }
      if (extended !== null) {
        buffer = [];
        return extended;
      }
      // The open prefix did not continue: try the key on its own.
      buffer = [];
      const single = match([key], active);
      if (single === "pending") {
        buffer = [key];
      }
      return single;
    },
    reset() {
      buffer = [];
    },
  };
}

export interface TargetLike {
  closest(selector: string): unknown;
}

const TYPING_SELECTOR = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
/**
 * A dialog/menu animating out (Radix `data-state="closed"`) still holds focus
 * until it unmounts; it must not swallow the next key (Esc, then G T).
 */
const DIALOG_SELECTOR = ["dialog", "alertdialog", "menu", "listbox"]
  .map((role) => `[role='${role}']:not([data-state='closed'])`)
  .join(", ");

/** Single-key shortcuts never fire while typing or inside a dialog/menu. */
export function shouldIgnoreTarget(target: TargetLike | null, dialogOpen: boolean): boolean {
  if (dialogOpen) {
    return true;
  }
  if (target === null) {
    return false;
  }
  return target.closest(TYPING_SELECTOR) !== null || target.closest(DIALOG_SELECTOR) !== null;
}

/** Which catalogue entries the engine may dispatch right now. */
export function dispatchableIds(
  catalog: readonly ShortcutDefinition[],
  registered: ReadonlySet<ShortcutId>,
  options: { readonly singleKeysEnabled: boolean; readonly ignoreSingleKeys: boolean },
): Set<ShortcutId> {
  const ids = new Set<ShortcutId>();
  for (const definition of catalog) {
    if (definition.handledByComponent || !registered.has(definition.id)) continue;
    if (isSingleKeyShortcut(definition) && (!options.singleKeysEnabled || options.ignoreSingleKeys)) continue;
    ids.add(definition.id);
  }
  return ids;
}
