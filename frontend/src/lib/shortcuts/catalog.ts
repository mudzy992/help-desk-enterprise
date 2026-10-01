/**
 * Paket 2.8 §4.1: the single catalogue of keyboard shortcuts. The engine,
 * the help dialog and aria-keyshortcuts all read it, so a shortcut cannot be
 * documented in one place and bound differently in another.
 */
export type ShortcutContext = "global" | "list" | "detail" | "editor";

export type ShortcutId =
  | "palette"
  | "paletteSlash"
  | "newTicket"
  | "help"
  | "goTickets"
  | "goDashboard"
  | "goKnowledge"
  | "goStatus"
  | "goProblems"
  | "goChanges"
  | "listNext"
  | "listPrevious"
  | "listOpen"
  | "listOpenAlt"
  | "listToggle"
  | "reply"
  | "internalNote"
  | "claim"
  | "forward"
  | "status"
  | "nextTicket"
  | "previousTicket"
  | "backToList"
  | "send"
  | "leaveEditor";

export interface ShortcutDefinition {
  readonly id: ShortcutId;
  readonly context: ShortcutContext;
  /** Normalised key sequence, e.g. ["g", "t"], ["mod+k"], ["?"]. */
  readonly sequence: readonly string[];
  /** Human labels for the help dialog and tooltips. */
  readonly display: readonly string[];
  /** i18n key of the description (under a11y.shortcuts.actions). */
  readonly descriptionKey: string;
  /**
   * The component handles the key itself (inside the editor); the engine only
   * lists it in the help dialog.
   */
  readonly handledByComponent?: true;
}

const d = (
  id: ShortcutId,
  context: ShortcutContext,
  sequence: readonly string[],
  display: readonly string[],
  handledByComponent?: true,
): ShortcutDefinition => ({
  id,
  context,
  sequence,
  display,
  descriptionKey: `a11y.shortcuts.actions.${id}`,
  ...(handledByComponent ? { handledByComponent } : {}),
});

export const shortcutCatalog: readonly ShortcutDefinition[] = [
  d("palette", "global", ["mod+k"], ["Ctrl", "K"]),
  d("paletteSlash", "global", ["/"], ["/"]),
  d("newTicket", "global", ["n"], ["N"]),
  d("help", "global", ["?"], ["?"]),
  d("goTickets", "global", ["g", "t"], ["G", "T"]),
  d("goDashboard", "global", ["g", "d"], ["G", "D"]),
  d("goKnowledge", "global", ["g", "k"], ["G", "K"]),
  d("goStatus", "global", ["g", "s"], ["G", "S"]),
  d("goProblems", "global", ["g", "p"], ["G", "P"]),
  d("goChanges", "global", ["g", "c"], ["G", "C"]),
  d("listNext", "list", ["j"], ["J"]),
  d("listPrevious", "list", ["k"], ["K"]),
  d("listOpen", "list", ["enter"], ["Enter"], true),
  d("listOpenAlt", "list", ["o"], ["O"]),
  d("listToggle", "list", ["x"], ["X"]),
  d("reply", "detail", ["r"], ["R"]),
  d("internalNote", "detail", ["i"], ["I"]),
  d("claim", "detail", ["c"], ["C"]),
  d("forward", "detail", ["f"], ["F"]),
  d("status", "detail", ["s"], ["S"]),
  d("nextTicket", "detail", ["]"], ["]"]),
  d("previousTicket", "detail", ["["], ["["]),
  d("backToList", "detail", ["u"], ["U"]),
  d("send", "editor", ["mod+enter"], ["Ctrl", "Enter"], true),
  d("leaveEditor", "editor", ["escape"], ["Esc"], true),
];

export const shortcutById: ReadonlyMap<ShortcutId, ShortcutDefinition> = new Map(
  shortcutCatalog.map((definition) => [definition.id, definition]),
);

/** A shortcut is "single key" when no step carries a modifier (WCAG 2.1.4). */
export function isSingleKeyShortcut(definition: ShortcutDefinition): boolean {
  return definition.sequence.every((step) => !step.startsWith("mod+"));
}

/** Value for aria-keyshortcuts (space separates alternatives, + joins a chord). */
export function ariaKeyShortcuts(id: ShortcutId): string {
  const definition = shortcutById.get(id);
  if (definition === undefined || definition.sequence.length !== 1) {
    return "";
  }
  const step = definition.sequence[0] ?? "";
  const named: Record<string, string> = { enter: "Enter", escape: "Escape" };
  return step
    .split("+")
    .map((part) => (part === "mod" ? "Control" : (named[part] ?? (/^[a-z]$/.test(part) ? part.toUpperCase() : part))))
    .join("+");
}

/** Label suffix for tooltips: "Preuzmi (C)". */
export function shortcutHint(id: ShortcutId): string {
  const definition = shortcutById.get(id);
  return definition === undefined ? "" : definition.display.join(definition.sequence.length > 1 ? " " : "+");
}
