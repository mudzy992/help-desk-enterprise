/**
 * Paket 1.4 (T4): puts a rendered template where the caret is (or over the
 * selection). Adds a line break before/after when the snippet would otherwise
 * glue onto surrounding text, so the agent never has to fix spacing by hand.
 */
export function insertAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
): { readonly value: string; readonly caret: number } {
  const start = clamp(Math.min(selectionStart, selectionEnd), value.length);
  const end = clamp(Math.max(selectionStart, selectionEnd), value.length);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const trail = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${lead}${snippet}${trail}`;
  return { value: `${before}${inserted}${after}`, caret: before.length + lead.length + snippet.length };
}

/** `/` opens the picker only on an empty line start and without a selection. */
export function isSlashTrigger(value: string, selectionStart: number, selectionEnd: number): boolean {
  if (selectionStart !== selectionEnd) return false;
  if (selectionStart === 0) return true;
  return value[selectionStart - 1] === "\n";
}

function clamp(position: number, length: number): number {
  if (!Number.isFinite(position) || position < 0) return 0;
  return Math.min(position, length);
}
