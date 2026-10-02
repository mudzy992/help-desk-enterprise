/**
 * Paket 3.1 (§16): the simulator renders the subset of Adaptive Card text the
 * connector produces — `**bold**` and backslash escapes. Everything else is
 * shown literally (React escapes it), so no HTML from a card is ever injected.
 */
export type CardTextSegment = { readonly text: string; readonly bold: boolean };

export function parseCardText(value: string): readonly CardTextSegment[] {
  const segments: CardTextSegment[] = [];
  let bold = false;
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "\\" && index + 1 < value.length) {
      current += value[index + 1];
      index += 1;
      continue;
    }
    if (character === "*" && value[index + 1] === "*") {
      if (current) segments.push({ text: current, bold });
      current = "";
      bold = !bold;
      index += 1;
      continue;
    }
    current += character;
  }
  if (current) segments.push({ text: current, bold });
  return segments;
}

/** Values of the inputs a card action submits (Action.Execute/Submit: data + inputs). */
export function mergeActionData(
  data: unknown,
  inputs: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const base = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { ...inputs, ...base };
}
