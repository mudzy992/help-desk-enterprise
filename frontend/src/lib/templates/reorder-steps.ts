/** Paket 1.4 (A1): moves one item; used by drag & drop and the ↑/↓ buttons. */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(to, items.length - 1));
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}
